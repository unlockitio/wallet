import { useMemo, useState } from 'react'
import {
    Alert,
    Box,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    Paper,
    Step,
    StepLabel,
    Stepper,
    TextField,
    Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import { PillButton } from '@components/ui/PillButton'
import { credentialConfig } from '@config/credential-interfaces'
import { useAccounts, usePrimaryAccount } from '@hooks/useAccounts'
import { useCredentialCommands } from '@hooks/useCredentialCommands'
import { useCredentials } from '@hooks/useCredentials'
import {
    claimKeyError,
    credentialTypesFor,
    missingOfferSignatories,
    requiredOfferSignatories,
    type ClaimInput,
} from '@services/credential-commands'
import { shortPartyId } from '@services/credential-view'
import type { CredentialRequest } from '@services/credentials'
import { emptyVisibilityMessage } from '@services/visibility-message'

const STEPS = ['Select request', 'Credential details', 'Review & authorize']

// A `datetime-local` value has no zone, so it is read in the browser's zone and sent
// as the instant the issuer actually picked.
const toInstant = (local: string): string | null => {
    if (!local) return null
    const parsed = new Date(local)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

interface CredentialIssueDialogProps {
    open: boolean
    onClose: () => void
}

export function CredentialIssueDialog({
    open,
    onClose,
}: CredentialIssueDialogProps) {
    const { data, isLoading, partyId, partyHint } = useCredentials()
    const accounts = useAccounts()
    const primary = usePrimaryAccount()
    const { issue } = useCredentialCommands()

    const [step, setStep] = useState(0)
    const [requestId, setRequestId] = useState('')
    const [factory, setFactory] = useState('')
    const [extraType, setExtraType] = useState('')
    const [extraTypes, setExtraTypes] = useState<string[]>([])
    const [subjectId, setSubjectId] = useState('')
    const [claims, setClaims] = useState<ClaimInput[]>([{ key: '', value: '' }])
    const [validFrom, setValidFrom] = useState('')
    const [validUntil, setValidUntil] = useState('')
    const [credentialId, setCredentialId] = useState('')
    const [registrationExpiresAt, setRegistrationExpiresAt] = useState('')
    const [offerId, setOfferId] = useState<string | null>(null)
    const [actionError, setActionError] = useState('')

    const request = useMemo(
        () =>
            data.incomingRequests.find(
                (candidate) => candidate.contractId === requestId
            ) ?? null,
        [data.incomingRequests, requestId]
    )

    const factories = useMemo(
        () =>
            data.factories.filter(
                (candidate) =>
                    candidate.registryAdmin === request?.registryAdmin
            ),
        [data.factories, request]
    )
    // The configured factory is only offered when its registry admin is the one the
    // request routes to; the template rejects any other.
    const configuredFactory =
        credentialConfig.factory &&
        request &&
        request.registryAdmin === credentialConfig.registryAdmin
            ? credentialConfig.factory
            : ''
    const factoryOptions = useMemo(
        () =>
            [
                ...factories.map((candidate) => candidate.contractId),
                ...(configuredFactory ? [configuredFactory] : []),
            ].filter((id, index, all) => all.indexOf(id) === index),
        [factories, configuredFactory]
    )

    const issuer = partyId ?? ''
    const issuerIsAnchorer = !!request && request.anchorers.includes(issuer)
    const required = request ? requiredOfferSignatories(request, issuer) : []
    const controlled = useMemo(
        () => accounts.map((account) => account.partyId as string),
        [accounts]
    )
    const missing = missingOfferSignatories(required, controlled)

    const claimErrors = claims
        .filter((claim) => claim.key.trim() || claim.value.trim())
        .flatMap((claim) => claimKeyError(claim.key) ?? [])
    const usedClaims = claims.filter((claim) => claim.key.trim())
    const duplicateClaimKeys =
        new Set(usedClaims.map((claim) => claim.key.trim())).size !==
        usedClaims.length
    const detailsValid =
        issuerIsAnchorer &&
        !!factory.trim() &&
        claimErrors.length === 0 &&
        !duplicateClaimKeys

    const reset = () => {
        setStep(0)
        setRequestId('')
        setFactory('')
        setExtraType('')
        setExtraTypes([])
        setSubjectId('')
        setClaims([{ key: '', value: '' }])
        setValidFrom('')
        setValidUntil('')
        setCredentialId('')
        setRegistrationExpiresAt('')
        setOfferId(null)
        setActionError('')
        issue.reset()
    }

    const close = () => {
        if (issue.isPending) return
        onClose()
        reset()
    }

    const selectRequest = (candidate: CredentialRequest) => {
        setRequestId(candidate.contractId)
        setSubjectId(candidate.holder)
        const [onlyFactory] = candidate.registryAdmin
            ? data.factories
                  .filter(
                      (entry) => entry.registryAdmin === candidate.registryAdmin
                  )
                  .map((entry) => entry.contractId)
            : []
        setFactory(
            onlyFactory ??
                (candidate.registryAdmin === credentialConfig.registryAdmin
                    ? credentialConfig.factory
                    : '')
        )
        setStep(1)
    }

    const submit = async () => {
        if (!request || !partyId) return
        setActionError('')
        try {
            const updateId = await issue.mutateAsync({
                party: partyId,
                request,
                issuer: partyId,
                factory,
                extraTypes,
                subjectId: subjectId.trim()
                    ? { tag: 'W3C_VC_Identifier_Party', value: subjectId }
                    : null,
                claims: usedClaims,
                validFrom: toInstant(validFrom),
                validUntil: toInstant(validUntil),
                credentialId: credentialId.trim() || null,
                registeredAt: new Date().toISOString(),
                registrationExpiresAt: toInstant(registrationExpiresAt),
            })
            setOfferId(updateId ?? 'submitted')
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
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                }}
            >
                <Box>
                    Issue credential
                    <Typography variant="body2" color="text.secondary">
                        Creates an offer; the holder accepts it later. No
                        credential exists until then.
                    </Typography>
                </Box>
                <IconButton
                    onClick={close}
                    disabled={issue.isPending}
                    aria-label="Close"
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ overflowWrap: 'anywhere' }}>
                {offerId ? (
                    <Alert severity="success">
                        Credential offer submitted. {request?.holder} must
                        accept this offer before the credential is created.
                        {offerId !== 'submitted' && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                                Update ID: {offerId}
                            </Typography>
                        )}
                    </Alert>
                ) : (
                    <>
                        <Stepper activeStep={step} sx={{ mb: 3 }}>
                            {STEPS.map((label) => (
                                <Step key={label}>
                                    <StepLabel>{label}</StepLabel>
                                </Step>
                            ))}
                        </Stepper>

                        {step === 0 && (
                            <>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mb: 2 }}
                                >
                                    Issuance in this model answers a holder's
                                    request. The request names the holder, the
                                    requested type and the routing parties; an
                                    unsolicited offer is not supported by the
                                    current protocol.
                                </Typography>
                                {isLoading && (
                                    <Typography>Loading requests…</Typography>
                                )}
                                {!isLoading &&
                                    data.incomingRequests.length === 0 && (
                                        <Alert severity="info">
                                            {emptyVisibilityMessage(
                                                'credential requests addressed to this party as registry admin or anchorer',
                                                'credential interfaces',
                                                {
                                                    packageMissing:
                                                        data.packageMissing,
                                                    partyHint,
                                                }
                                            )}{' '}
                                            Issuance responds to a holder's
                                            request, so there is nothing to
                                            issue until a holder requests a
                                            credential type routed to this
                                            party.
                                        </Alert>
                                    )}
                                {data.incomingRequests.map((candidate) => (
                                    <Paper
                                        key={candidate.contractId}
                                        sx={{ p: 2, my: 1 }}
                                    >
                                        <Typography>
                                            Holder: {candidate.holder}
                                        </Typography>
                                        <Typography>
                                            Requested type:{' '}
                                            {candidate.requestedType}
                                        </Typography>
                                        <Typography>
                                            Registry admin:{' '}
                                            {candidate.registryAdmin}
                                        </Typography>
                                        <Typography sx={{ mb: 1 }}>
                                            Anchorers:{' '}
                                            {candidate.anchorers.join(', ')}
                                        </Typography>
                                        <PillButton
                                            tone="neutral"
                                            onClick={() =>
                                                selectRequest(candidate)
                                            }
                                        >
                                            Select
                                        </PillButton>
                                    </Paper>
                                ))}
                            </>
                        )}

                        {step === 1 && request && (
                            <Box sx={{ display: 'grid', gap: 2 }}>
                                {!issuerIsAnchorer && (
                                    <Alert severity="error">
                                        This party ({issuer}) is not one of the
                                        request anchorers (
                                        {request.anchorers.join(', ')}). The
                                        offer is signed by the issuer as an
                                        anchorer, so only an anchorer of this
                                        request can issue against it.
                                    </Alert>
                                )}
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Issuer (this wallet's primary party)
                                </Typography>
                                <Typography>{issuer}</Typography>

                                <TextField
                                    select
                                    label="Credential registry factory"
                                    value={factory}
                                    onChange={(event) =>
                                        setFactory(event.target.value)
                                    }
                                    helperText={
                                        factoryOptions.length === 0
                                            ? 'No factory visible for this registry admin. Configure VITE_CREDENTIAL_FACTORY or have the registry admin disclose one.'
                                            : 'Must be administered by the request registry admin.'
                                    }
                                >
                                    {factoryOptions.map((option) => (
                                        <MenuItem key={option} value={option}>
                                            {option}
                                        </MenuItem>
                                    ))}
                                </TextField>

                                <Box>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 1 }}
                                    >
                                        Credential types
                                    </Typography>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 1,
                                            mb: 1,
                                        }}
                                    >
                                        {credentialTypesFor(
                                            request.requestedType,
                                            extraTypes
                                        ).map((type) => (
                                            <Chip key={type} label={type} />
                                        ))}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <TextField
                                            label="Add a type"
                                            size="small"
                                            value={extraType}
                                            onChange={(event) =>
                                                setExtraType(event.target.value)
                                            }
                                        />
                                        <PillButton
                                            tone="neutral"
                                            disabled={!extraType.trim()}
                                            onClick={() => {
                                                setExtraTypes([
                                                    ...extraTypes,
                                                    extraType.trim(),
                                                ])
                                                setExtraType('')
                                            }}
                                        >
                                            Add
                                        </PillButton>
                                    </Box>
                                </Box>

                                <TextField
                                    label="Subject identifier (party)"
                                    value={subjectId}
                                    onChange={(event) =>
                                        setSubjectId(event.target.value)
                                    }
                                    helperText="Defaults to the holder. Leave empty for a credential subject without an identifier."
                                />

                                <Box>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mb: 1 }}
                                    >
                                        Claims (text values only in this view)
                                    </Typography>
                                    {claims.map((claim, index) => (
                                        <Box
                                            key={index}
                                            sx={{
                                                display: 'flex',
                                                gap: 1,
                                                mb: 1,
                                                alignItems: 'flex-start',
                                            }}
                                        >
                                            <TextField
                                                label="Key"
                                                size="small"
                                                value={claim.key}
                                                error={
                                                    !!claim.key.trim() &&
                                                    !!claimKeyError(claim.key)
                                                }
                                                helperText={
                                                    claim.key.trim()
                                                        ? claimKeyError(
                                                              claim.key
                                                          )
                                                        : undefined
                                                }
                                                onChange={(event) =>
                                                    setClaims(
                                                        claims.map(
                                                            (
                                                                entry,
                                                                position
                                                            ) =>
                                                                position ===
                                                                index
                                                                    ? {
                                                                          ...entry,
                                                                          key: event
                                                                              .target
                                                                              .value,
                                                                      }
                                                                    : entry
                                                        )
                                                    )
                                                }
                                            />
                                            <TextField
                                                label="Value"
                                                size="small"
                                                value={claim.value}
                                                onChange={(event) =>
                                                    setClaims(
                                                        claims.map(
                                                            (
                                                                entry,
                                                                position
                                                            ) =>
                                                                position ===
                                                                index
                                                                    ? {
                                                                          ...entry,
                                                                          value: event
                                                                              .target
                                                                              .value,
                                                                      }
                                                                    : entry
                                                        )
                                                    )
                                                }
                                            />
                                            <IconButton
                                                aria-label="Remove claim"
                                                onClick={() =>
                                                    setClaims(
                                                        claims.filter(
                                                            (_, position) =>
                                                                position !==
                                                                index
                                                        )
                                                    )
                                                }
                                            >
                                                <DeleteOutlinedIcon />
                                            </IconButton>
                                        </Box>
                                    ))}
                                    {duplicateClaimKeys && (
                                        <Alert severity="error" sx={{ mb: 1 }}>
                                            Claim keys must be unique.
                                        </Alert>
                                    )}
                                    <PillButton
                                        tone="neutral"
                                        onClick={() =>
                                            setClaims([
                                                ...claims,
                                                { key: '', value: '' },
                                            ])
                                        }
                                    >
                                        Add claim
                                    </PillButton>
                                </Box>

                                <TextField
                                    label="Credential ID (optional urn)"
                                    value={credentialId}
                                    onChange={(event) =>
                                        setCredentialId(event.target.value)
                                    }
                                />
                                <TextField
                                    label="Valid from (optional)"
                                    type="datetime-local"
                                    value={validFrom}
                                    onChange={(event) =>
                                        setValidFrom(event.target.value)
                                    }
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                                <TextField
                                    label="Valid until (optional)"
                                    type="datetime-local"
                                    value={validUntil}
                                    onChange={(event) =>
                                        setValidUntil(event.target.value)
                                    }
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Registration: registry admin{' '}
                                    {request.registryAdmin}, registered at
                                    submission time.
                                </Typography>
                                <TextField
                                    label="Registry retention expires at (optional)"
                                    type="datetime-local"
                                    value={registrationExpiresAt}
                                    onChange={(event) =>
                                        setRegistrationExpiresAt(
                                            event.target.value
                                        )
                                    }
                                    helperText="Registry record retention, which is distinct from the credential's own validity."
                                    slotProps={{ inputLabel: { shrink: true } }}
                                />
                            </Box>
                        )}

                        {step === 2 && request && (
                            <Box sx={{ display: 'grid', gap: 2 }}>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Required signatories (request anchorers,
                                    issuer, registry admin)
                                </Typography>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 1,
                                    }}
                                >
                                    {required.map((party) => (
                                        <Chip
                                            key={party}
                                            label={`${shortPartyId(party)} — ${
                                                controlled.includes(party)
                                                    ? 'controlled by this wallet user'
                                                    : 'not controlled'
                                            }`}
                                            color={
                                                controlled.includes(party)
                                                    ? 'success'
                                                    : 'error'
                                            }
                                            variant="outlined"
                                        />
                                    ))}
                                </Box>
                                {missing.length > 0 && (
                                    <Alert severity="error">
                                        This wallet user does not control{' '}
                                        {missing.join(', ')}. The offer is
                                        created by all of its signatories at
                                        once, so the registry admin would have
                                        to co-sign off-wallet, which this UI
                                        does not support.
                                    </Alert>
                                )}
                                <Alert severity="info">
                                    {request.holder} must accept this offer
                                    before the credential is created.
                                </Alert>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Holder
                                </Typography>
                                <Typography>{request.holder}</Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Credential types
                                </Typography>
                                <Typography>
                                    {credentialTypesFor(
                                        request.requestedType,
                                        extraTypes
                                    ).join(', ')}
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Factory
                                </Typography>
                                <Typography>{factory}</Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Claims
                                </Typography>
                                <Typography>
                                    {usedClaims.length === 0
                                        ? 'None'
                                        : usedClaims
                                              .map(
                                                  (claim) =>
                                                      `${claim.key.trim()}: ${claim.value}`
                                              )
                                              .join(', ')}
                                </Typography>
                            </Box>
                        )}

                        {actionError && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                Issue failed (check package vetting and
                                authorization): {actionError}
                            </Alert>
                        )}
                        {!primary && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                Select a primary wallet to issue credentials.
                            </Alert>
                        )}
                    </>
                )}
            </DialogContent>
            <DialogActions>
                {!offerId && step > 0 && (
                    <PillButton
                        tone="neutral"
                        disabled={issue.isPending}
                        onClick={() => setStep(step - 1)}
                    >
                        Back
                    </PillButton>
                )}
                {!offerId && step === 1 && (
                    <PillButton
                        disabled={!detailsValid}
                        onClick={() => setStep(2)}
                    >
                        Review
                    </PillButton>
                )}
                {!offerId && step === 2 && (
                    <PillButton
                        disabled={
                            issue.isPending ||
                            missing.length > 0 ||
                            !detailsValid ||
                            !partyId
                        }
                        onClick={() => void submit()}
                    >
                        {issue.isPending ? 'Submitting…' : 'Create offer'}
                    </PillButton>
                )}
                <PillButton
                    tone="neutral"
                    disabled={issue.isPending}
                    onClick={close}
                >
                    {offerId ? 'Done' : 'Cancel'}
                </PillButton>
            </DialogActions>
        </Dialog>
    )
}
