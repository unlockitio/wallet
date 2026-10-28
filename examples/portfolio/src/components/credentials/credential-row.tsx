import { type KeyboardEvent } from 'react'
import { Box, Chip, Skeleton, Typography } from '@mui/material'
import { CopyIconButton } from '@components/ui/CopyIconButton'
import {
    OfferFieldLabel,
    OfferRowGrid,
    OfferRowShell,
} from '@components/offers/offer-row-layout'
import { formatDateTimeString } from '@utils/date-format'
import type { Credential } from '@services/credentials'
import {
    isPartyIssuer,
    issuerShortLabel,
    primaryCredentialType,
    registrationStatus,
    subjectShortLabel,
    validityStatus,
    type RegistrationStatus,
    type ValidityStatus,
} from '@services/credential-view'

interface CredentialRowProps {
    credential: Credential
    partyHint: string | null
    now: number
    onOpen: () => void
}

export function CredentialRow({
    credential,
    partyHint,
    now,
    onOpen,
}: CredentialRowProps) {
    const validity = validityStatus(credential, now)
    const registration = registrationStatus(credential)
    const primaryType = primaryCredentialType(credential)
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
        }
    }

    return (
        <OfferRowShell
            component="article"
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-label={`Open ${primaryType} credential details`}
            onClick={onOpen}
            onKeyDown={handleKeyDown}
            sx={{
                cursor: 'pointer',
                transition: (theme) =>
                    theme.transitions.create(['background-color'], {
                        duration: theme.transitions.duration.short,
                    }),
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': {
                    outline: (theme) =>
                        `2px solid ${theme.palette.secondary.main}`,
                    outlineOffset: 2,
                },
            }}
        >
            <OfferRowGrid columns={5}>
                <Box sx={{ minWidth: 0 }}>
                    <OfferFieldLabel>Type</OfferFieldLabel>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {primaryType}
                    </Typography>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    <OfferFieldLabel>Issuer</OfferFieldLabel>
                    <IssuerValue
                        credential={credential}
                        partyHint={partyHint}
                    />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    <OfferFieldLabel>Subject</OfferFieldLabel>
                    <Typography
                        variant="body2"
                        sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {subjectShortLabel(credential)}
                    </Typography>
                </Box>

                <Box
                    sx={{
                        minWidth: 0,
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 1,
                    }}
                >
                    <ValidityChip status={validity} />
                    <RegistrationChip status={registration} />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    <OfferFieldLabel>Registered</OfferFieldLabel>
                    <Typography variant="body2" color="text.secondary">
                        {credential.registration
                            ? formatDateTimeString(
                                  credential.registration.registeredAt
                              )
                            : 'Not registered'}
                    </Typography>
                </Box>
            </OfferRowGrid>
        </OfferRowShell>
    )
}

function IssuerValue({
    credential,
    partyHint,
}: {
    credential: Credential
    partyHint: string | null
}) {
    const { issuer } = credential
    // The party hint only names the issuer when the primary party is the issuer;
    // otherwise the short party form is all the wallet knows.
    const hint =
        isPartyIssuer(issuer) &&
        partyHint &&
        credential.holders.includes(issuer.value)
            ? partyHint
            : null

    return (
        <Box
            sx={{
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
            }}
        >
            <Typography
                variant="body2"
                sx={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {hint
                    ? `${hint} (${issuerShortLabel(issuer)})`
                    : issuerShortLabel(issuer)}
            </Typography>
            <CopyIconButton
                value={issuer.value}
                label="Copy issuer identifier"
                sx={{ flexShrink: 0, p: 0.25 }}
            />
        </Box>
    )
}

export function ValidityChip({ status }: { status: ValidityStatus }) {
    return (
        <Chip
            label={status}
            size="small"
            sx={[
                { borderRadius: 999 },
                (theme) => {
                    const token =
                        status === 'Expired'
                            ? theme.portfolio.status.expired
                            : status === 'Not yet valid'
                              ? theme.portfolio.status.pending
                              : theme.portfolio.status.allocated
                    return { bgcolor: token.background, color: token.text }
                },
            ]}
        />
    )
}

export function RegistrationChip({ status }: { status: RegistrationStatus }) {
    return (
        <Chip
            label={status}
            size="small"
            variant="outlined"
            sx={{ borderRadius: 999 }}
        />
    )
}

export function CredentialRowSkeleton() {
    return (
        <OfferRowShell>
            <OfferRowGrid columns={5}>
                {Array.from({ length: 5 }, (_, index) => (
                    <Box key={index} sx={{ minWidth: 0 }}>
                        <Skeleton variant="text" width={72} />
                        <Skeleton variant="text" width="80%" />
                    </Box>
                ))}
            </OfferRowGrid>
        </OfferRowShell>
    )
}
