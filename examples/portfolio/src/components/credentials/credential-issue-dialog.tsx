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
    approvalAvailable,
    claimKeyError,
    credentialTypesFor,
    missingOfferSignatories,
    requiredOfferSignatories,
    type ClaimInput,
} from '@services/credential-commands'
import { shortPartyId } from '@services/credential-view'
import type { CredentialRequest } from '@services/credentials'
import { emptyVisibilityMessage } from '@services/visibility-message'

const STEPS = [
    'Select issuance path',
    'Credential details',
    'Review & authorize',
]

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
    const [mode, setMode] = useState<'offer' | 'approve'>('offer')
    const [holder, setHolder] = useState('')
    const [requestedType, setRequestedType] = useState('')
    const [registryAdmin, setRegistryAdmin] = useState(
        credentialConfig.registryAdmin
    )
    const [anchorers, setAnchorers] = useState(
        credentialConfig.anchorers.join(', ')
    )
    const [factory, setFactory] = useState('')
    const [extraType, setExtraType] = useState('')
    const [extraTypes, setExtraTypes] = useState<string[]>([])
    const [subjectId, setSubjectId] = useState('')
    const [claims, setClaims] = useState<ClaimInput[]>([{ key: '', value: '' }])
    const [validFrom, setValidFrom] = useState('')
    const [validUntil, setValidUntil] = useState('')
    const [credentialId, setCredentialId] = useState('')
    const [registrationExpiresAt, setRegistrationExpiresAt] = useState('')
    const [submittedId, setSubmittedId] = useState<string | null>(null)
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
                    candidate.version === 'current' &&
                    candidate.registryAdmin === registryAdmin
            ),
        [data.factories, registryAdmin]
    )
    // The configured factory is only offered when its registry admin is the one the
    // request routes to; the template rejects any other.
    const configuredFactory =
        credentialConfig.factory &&
        registryAdmin === credentialConfig.registryAdmin
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
    const parsedAnchorers = anchorers
        .split(',')
        .map((party) => party.trim())
        .filter(Boolean)
    const issuerIsAnchorer = parsedAnchorers.includes(issuer)
    const canApprove = !!request && approvalAvailable(request, issuer)
    const required = requiredOfferSignatories({
        anchorers: parsedAnchorers,
        issuer,
        registryAdmin,
    })
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
        /^.+::.+$/.test(holder.trim()) &&
        !!requestedType.trim() &&
        !!registryAdmin.trim() &&
        (mode === 'offer' || canApprove) &&
        !!factory.trim() &&
        (factories.some((entry) => entry.contractId === factory) ||
            (mode === 'offer' &&
                !!configuredFactory &&
                factory === configuredFactory)) &&
        claimErrors.length === 0 &&
        !duplicateClaimKeys

    const reset = () => {
        setStep(0)
        setRequestId('')
        setMode('offer')
        setHolder('')
        setRequestedType('')
        setRegistryAdmin(credentialConfig.registryAdmin)
        setAnchorers(credentialConfig.anchorers.join(', '))
        setFactory('')
        setExtraType('')
        setExtraTypes([])
        setSubjectId('')
        setClaims([{ key: '', value: '' }])
        setValidFrom('')
        setValidUntil('')
        setCredentialId('')
        setRegistrationExpiresAt('')
        setSubmittedId(null)
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
        setMode('approve')
        setHolder(candidate.holder)
        setRequestedType(candidate.requestedType)
        setRegistryAdmin(candidate.registryAdmin)
        setAnchorers(candidate.anchorers.join(', '))
        setSubjectId(candidate.holder)
        const [onlyFactory] = candidate.registryAdmin
            ? data.factories
                  .filter(
                      (entry) =>
                          entry.version === 'current' &&
                          entry.registryAdmin === candidate.registryAdmin
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
        if (!partyId || !detailsValid || (mode === 'approve' && !request))
            return
        setActionError('')
        try {
            const updateId = await issue.mutateAsync({
                party: partyId,
                mode,
                request: mode === 'approve' ? request : null,
                holder: holder.trim(),
                requestedType: requestedType.trim(),
                registryAdmin: registryAdmin.trim(),
                anchorers: parsedAnchorers,
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
            setSubmittedId(updateId ?? 'submitted')
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
                        Default: unsolicited offer for holder acceptance. A
                        current issuer-targeted request can instead be approved
                        and issued directly.
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
                {submittedId ? (
                    <Alert severity="success">
                        {mode === 'approve'
                            ? `Request approved and credential issued to ${holder}. No second holder acceptance is required.`
                            : `Offer submitted to ${holder}. The holder must accept with factory disclosure before issuance.`}
                        {submittedId !== 'submitted' && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                                Update ID: {submittedId}
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
                                    Start an unsolicited offer by default, or
                                    select a current request addressed to this
                                    issuer to approve and issue directly. The
                                    registry admin signs the factory; approval
                                    does not imply that admin reviewed each
                                    credential payload.
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
                                            Unsolicited offers remain available
                                            without a request.
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
                                        <Typography sx={{ mb: 1 }}>
                                            {candidate.version === 'legacy'
                                                ? 'Old package request: no requested issuer; cannot approve with the new choice.'
                                                : `Requested issuer: ${candidate.requestedIssuer}${!approvalAvailable(candidate, issuer) ? '. Direct approval requires this primary issuer as sole anchorer.' : ''}`}
                                        </Typography>
                                        <PillButton
                                            disabled={
                                                !approvalAvailable(
                                                    candidate,
                                                    issuer
                                                )
                                            }
                                            tone="neutral"
                                            onClick={() =>
                                                selectRequest(candidate)
                                            }
                                        >
                                            Approve and issue
                                        </PillButton>
                                    </Paper>
                                ))}
                                <PillButton
                                    onClick={() => {
                                        setRequestId('')
                                        setMode('offer')
                                        setRegistryAdmin(
                                            credentialConfig.registryAdmin
                                        )
                                        setFactory(credentialConfig.factory)
                                        setStep(1)
                                    }}
                                >
                                    Create unsolicited offer
                                </PillButton>
                            </>
                        )}

                        {step === 1 && (
                            <Box sx={{ display: 'grid', gap: 2 }}>
                                {!issuerIsAnchorer && (
                                    <Alert severity="error">
                                        The issuer ({issuer}) must be an
                                        anchorer ({parsedAnchorers.join(', ')}).
                                    </Alert>
                                )}
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Issuer (this wallet's primary party)
                                </Typography>
                                <Typography>{issuer}</Typography>
                                {mode === 'offer' && (
                                    <>
                                        <TextField
                                            label="Holder (full Party ID)"
                                            value={holder}
                                            onChange={(event) =>
                                                setHolder(event.target.value)
                                            }
                                        />
                                        <TextField
                                            label="Credential type"
                                            value={requestedType}
                                            onChange={(event) =>
                                                setRequestedType(
                                                    event.target.value
                                                )
                                            }
                                        />
                                        <TextField
                                            label="Registry admin (full Party ID)"
                                            value={registryAdmin}
                                            onChange={(event) => {
                                                setRegistryAdmin(
                                                    event.target.value
                                                )
                                                setFactory('')
                                            }}
                                            helperText="Factory must be signed by this admin; the admin co-signs the offer."
                                        />
                                        <TextField
                                            label="Anchorers (comma separated)"
                                            value={anchorers}
                                            onChange={(event) =>
                                                setAnchorers(event.target.value)
                                            }
                                        />
                                    </>
                                )}

                                <TextField
                                    select
                                    label="Credential registry factory"
                                    value={factory}
                                    onChange={(event) =>
                                        setFactory(event.target.value)
                                    }
                                    helperText={
                                        factoryOptions.length === 0
                                            ? 'No factory visible for this registry admin. Configure VITE_CREDENTIAL_FACTORY only with a verified admin-signed factory ID; issuer approval needs visibility or explicit disclosure.'
                                            : 'Must be administered by this registry admin. Approval requires the issuer to see the factory or receive explicit disclosure.'
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
                                            requestedType,
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
                                    Registration: registry admin {registryAdmin}
                                    , registered at submission time.
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

                        {step === 2 && (
                            <Box sx={{ display: 'grid', gap: 2 }}>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    {mode === 'approve'
                                        ? 'Approval controller: requested issuer only'
                                        : 'Offer signatories: anchorers, issuer and registry admin'}
                                </Typography>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 1,
                                    }}
                                >
                                    {(mode === 'approve'
                                        ? [issuer]
                                        : required
                                    ).map((party) => (
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
                                {mode === 'offer' && missing.length > 0 && (
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
                                    {mode === 'approve'
                                        ? 'Issuer approval issues directly. The holder does not accept a second offer. The issuer must see the admin-signed factory.'
                                        : 'Unsolicited offer: the holder must accept with explicit factory disclosure. The admin co-signs this offer, not a separate payload review.'}
                                </Alert>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Holder
                                </Typography>
                                <Typography>{holder}</Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Credential types
                                </Typography>
                                <Typography>
                                    {credentialTypesFor(
                                        requestedType,
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
                {!submittedId && step > 0 && (
                    <PillButton
                        tone="neutral"
                        disabled={issue.isPending}
                        onClick={() => setStep(step - 1)}
                    >
                        Back
                    </PillButton>
                )}
                {!submittedId && step === 1 && (
                    <PillButton
                        disabled={!detailsValid}
                        onClick={() => setStep(2)}
                    >
                        Review
                    </PillButton>
                )}
                {!submittedId && step === 2 && (
                    <PillButton
                        disabled={
                            issue.isPending ||
                            (mode === 'offer' && missing.length > 0) ||
                            !detailsValid ||
                            !partyId
                        }
                        onClick={() => void submit()}
                    >
                        {issue.isPending
                            ? 'Submitting…'
                            : mode === 'approve'
                              ? 'Approve and issue'
                              : 'Create offer'}
                    </PillButton>
                )}
                <PillButton
                    tone="neutral"
                    disabled={issue.isPending}
                    onClick={close}
                >
                    {submittedId ? 'Done' : 'Cancel'}
                </PillButton>
            </DialogActions>
        </Dialog>
    )
}
