import { useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Paper,
    TextField,
    Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { PillButton } from '@components/ui/PillButton'
import { credentialConfig } from '@config/credential-interfaces'
import { useCredentialCommands } from '@hooks/useCredentialCommands'
import { useCredentials } from '@hooks/useCredentials'
import {
    credentialTypesApiUrl,
    mergeRegistryTypes,
    observedTypeSuggestions,
    readRegistryCatalogue,
    registryReadLimits,
    suggestionIssuerLabel,
    suggestionKey,
    type CredentialTypeSuggestion,
} from '@services/credential-suggestions'

interface CredentialRequestDialogProps {
    open: boolean
    onClose: () => void
}

export function CredentialRequestDialog({
    open,
    onClose,
}: CredentialRequestDialogProps) {
    const { data, partyId } = useCredentials()
    const { create } = useCredentialCommands()

    const [requestedType, setRequestedType] = useState('')
    const [requestedIssuer, setRequestedIssuer] = useState('')
    const [registryAdmin, setRegistryAdmin] = useState(
        credentialConfig.registryAdmin
    )
    const [anchorers, setAnchorers] = useState(
        credentialConfig.anchorers.join(', ')
    )
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [registryEntries, setRegistryEntries] = useState<
        CredentialTypeSuggestion[] | null
    >(null)
    const [registryNote, setRegistryNote] = useState('')
    const [registryWarning, setRegistryWarning] = useState('')
    const [actionError, setActionError] = useState('')
    const [submitted, setSubmitted] = useState(false)

    const observed = useMemo(
        () => observedTypeSuggestions(data.credentials),
        [data.credentials]
    )
    const suggestions = registryEntries ?? observed

    // The registry catalogue is optional, and `GET /v1/credential-types` is itself an
    // optional capability of the credential registry contract. Absence, a bad URL, a
    // failed fetch and a deployment that does not implement the endpoint are all
    // normal here: the observed suggestions remain usable in every case.
    useEffect(() => {
        if (!open || !credentialConfig.typesApiUrl) return
        let cancelled = false
        const load = async () => {
            try {
                const result = await readRegistryCatalogue(
                    async (page, pageSize) => {
                        const response = await fetch(
                            credentialTypesApiUrl(
                                credentialConfig.typesApiUrl,
                                { page, pageSize }
                            )
                        )
                        if (!response.ok)
                            throw new Error(`HTTP ${response.status}`)
                        return (await response.json()) as unknown
                    }
                )
                if (cancelled) return
                const { suggestions: merged, unroutable } = mergeRegistryTypes(
                    observed,
                    result.entries
                )
                setRegistryEntries(merged)
                setRegistryNote('')
                // Every incomplete or partly rejected read is stated, because a
                // silently shortened catalogue reads as a complete one.
                const problems = [
                    result.malformed &&
                        `the registry answered page ${result.pagesRead} with a body that is not a CredentialTypeCollection, so the read stopped there`,
                    result.truncated &&
                        `the read stopped at this wallet's bound of ${registryReadLimits.maxPages} pages or ${registryReadLimits.maxEntries} pairs while the registry still reported more`,
                    unroutable.length > 0 &&
                        `${unroutable.length} registry pair(s) are not shown: the aggregate carries no registry admin or anchorers, and no credential visible here shares their issuer, so no routing is known for them`,
                ].filter((problem): problem is string => !!problem)
                setRegistryWarning(
                    problems.length === 0
                        ? ''
                        : `Incomplete registry catalogue: ${problems.join('; ')}.`
                )
            } catch (cause) {
                if (cancelled) return
                setRegistryEntries(null)
                setRegistryWarning('')
                setRegistryNote(
                    `Registry credential-type catalogue unavailable (${
                        cause instanceof Error ? cause.message : String(cause)
                    }); showing credentials visible to this wallet only.`
                )
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [open, observed])

    const apply = (suggestion: CredentialTypeSuggestion) => {
        setSelectedKey(suggestionKey(suggestion))
        setRequestedType(suggestion.requestedType)
        setRequestedIssuer(
            suggestion.issuerKind === 'party' ? suggestion.issuer : ''
        )
        setRegistryAdmin(suggestion.registryAdmin)
        setAnchorers(suggestion.anchorers.join(', '))
    }

    const reset = () => {
        setRequestedType('')
        setRequestedIssuer('')
        setRegistryAdmin(credentialConfig.registryAdmin)
        setAnchorers(credentialConfig.anchorers.join(', '))
        setSelectedKey(null)
        setActionError('')
        setSubmitted(false)
        create.reset()
    }

    const close = () => {
        if (create.isPending) return
        onClose()
        reset()
    }

    const parsedAnchorers = anchorers
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

    const submit = async () => {
        if (!partyId) return
        setActionError('')
        try {
            await create.mutateAsync({
                party: partyId,
                requestedIssuer,
                requestedType,
                registryAdmin,
                anchorers: parsedAnchorers,
            })
            setSubmitted(true)
        } catch (cause) {
            setActionError(
                cause instanceof Error ? cause.message : String(cause)
            )
        }
    }

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="md">
            <DialogTitle
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                Request credential type
                <IconButton
                    onClick={close}
                    disabled={create.isPending}
                    aria-label="Close"
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ overflowWrap: 'anywhere' }}>
                {submitted ? (
                    <Alert severity="success">
                        Credential request submitted for type {requestedType}.
                        It is addressed to {requestedIssuer}; the issuer can
                        approve and issue directly.
                    </Alert>
                ) : (
                    <>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Suggestions are based on credentials visible to this
                            wallet; not an issuer catalogue. The request carries
                            only the type and requested issuer plus routing
                            parties, not claims or a subject. The issuer can
                            approve directly when it is the sole anchorer; other
                            anchorers need separate authorization not supported
                            here.
                        </Alert>
                        {registryNote && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                {registryNote}
                            </Alert>
                        )}
                        {registryWarning && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                {registryWarning}
                            </Alert>
                        )}

                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mb: 1 }}
                        >
                            Observed issuer and type pairs
                        </Typography>
                        {suggestions.length === 0 ? (
                            <Alert severity="info" sx={{ mb: 2 }}>
                                No registered credentials are visible to this
                                party, so no issuer and type pair can be
                                suggested. Enter a type and its routing parties
                                manually below.
                            </Alert>
                        ) : (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gap: 1,
                                    mb: 2,
                                    maxHeight: 280,
                                    overflowY: 'auto',
                                }}
                            >
                                {suggestions.map((suggestion) => {
                                    const key = suggestionKey(suggestion)
                                    return (
                                        <Paper
                                            key={key}
                                            sx={{
                                                p: 1.5,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 2,
                                                outline: (theme) =>
                                                    selectedKey === key
                                                        ? `2px solid ${theme.palette.primary.main}`
                                                        : 'none',
                                            }}
                                        >
                                            <Box>
                                                <Typography>
                                                    {suggestion.requestedType}
                                                </Typography>
                                                <Typography
                                                    variant="body2"
                                                    color="text.secondary"
                                                >
                                                    Issuer:{' '}
                                                    {suggestionIssuerLabel(
                                                        suggestion
                                                    )}
                                                    {suggestion.source ===
                                                        'registry' &&
                                                        ' (registry aggregate of observed records)'}
                                                </Typography>
                                            </Box>
                                            <PillButton
                                                tone="neutral"
                                                onClick={() =>
                                                    apply(suggestion)
                                                }
                                            >
                                                Use
                                            </PillButton>
                                        </Paper>
                                    )
                                })}
                            </Box>
                        )}

                        <Box sx={{ display: 'grid', gap: 2 }}>
                            <TextField
                                label="Credential type"
                                value={requestedType}
                                onChange={(event) =>
                                    setRequestedType(event.target.value)
                                }
                                slotProps={{
                                    htmlInput: {
                                        list: 'credential-type-presets',
                                    },
                                }}
                            />
                            <datalist id="credential-type-presets">
                                {credentialConfig.presetTypes.map((type) => (
                                    <option key={type} value={type} />
                                ))}
                            </datalist>
                            <TextField
                                label="Requested issuer (full Party ID)"
                                value={requestedIssuer}
                                onChange={(event) =>
                                    setRequestedIssuer(event.target.value)
                                }
                                helperText="Choose a Party issuer suggestion or enter its full Canton Party ID. Must be an anchorer."
                            />
                            <TextField
                                label="Registry admin"
                                value={registryAdmin}
                                onChange={(event) =>
                                    setRegistryAdmin(event.target.value)
                                }
                                helperText="The request is routed to this party as an observer."
                            />
                            <TextField
                                label="Anchorers (comma separated)"
                                value={anchorers}
                                onChange={(event) =>
                                    setAnchorers(event.target.value)
                                }
                                helperText="The issuer must be included. Direct approval requires the issuer to be the sole anchorer."
                            />
                        </Box>

                        {actionError && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                Credential request failed (check package vetting
                                and authorization): {actionError}
                            </Alert>
                        )}
                        {!partyId && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                Select a primary wallet to request credentials.
                            </Alert>
                        )}
                    </>
                )}
            </DialogContent>
            <DialogActions>
                {!submitted && (
                    <PillButton
                        disabled={
                            create.isPending ||
                            !partyId ||
                            !requestedType.trim() ||
                            !/^.+::.+$/.test(requestedIssuer.trim()) ||
                            !registryAdmin.trim() ||
                            !parsedAnchorers.includes(requestedIssuer.trim())
                        }
                        onClick={() => void submit()}
                    >
                        {create.isPending ? 'Submitting…' : 'Submit request'}
                    </PillButton>
                )}
                <PillButton
                    tone="neutral"
                    disabled={create.isPending}
                    onClick={close}
                >
                    {submitted ? 'Done' : 'Cancel'}
                </PillButton>
            </DialogActions>
        </Dialog>
    )
}
