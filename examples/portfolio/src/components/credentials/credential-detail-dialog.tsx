import { type ReactNode } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import {
    Box,
    Dialog,
    DialogContent,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material'
import { CopyIconButton } from '@components/ui/CopyIconButton'
import { OfferFieldLabel } from '@components/offers/offer-row-layout'
import { formatDateTimeString } from '@utils/date-format'
import type { Credential } from '@services/credentials'
import {
    claimRows,
    primaryCredentialType,
    registrationStatus,
    securingSummary,
    validityStatus,
} from '@services/credential-view'
import { RegistrationChip, ValidityChip } from './credential-row'

interface CredentialDetailDialogProps {
    credential: Credential | null
    now: number
    onClose: () => void
}

export function CredentialDetailDialog({
    credential,
    now,
    onClose,
}: CredentialDetailDialogProps) {
    const titleId = 'credential-detail-dialog-title'

    return (
        <Dialog
            open={!!credential}
            onClose={onClose}
            aria-labelledby={titleId}
            fullWidth
            maxWidth="md"
            scroll="paper"
        >
            {credential && (
                <>
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto',
                            alignItems: 'start',
                            gap: 2,
                            px: 3,
                            pt: 3,
                        }}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                id={titleId}
                                variant="h5"
                                component="h2"
                                sx={{ mb: 1 }}
                            >
                                {primaryCredentialType(credential)}
                            </Typography>
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 1,
                                }}
                            >
                                <ValidityChip
                                    status={validityStatus(credential, now)}
                                />
                                <RegistrationChip
                                    status={registrationStatus(credential)}
                                />
                            </Box>
                        </Box>
                        <IconButton
                            type="button"
                            aria-label="Close credential details"
                            onClick={onClose}
                            sx={{ color: 'secondary.main' }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    <DialogContent sx={{ overflowWrap: 'anywhere' }}>
                        <DetailSection title="Credential">
                            <Field label="All types">
                                {credential.credentialTypes.join(', ') ||
                                    'Not specified'}
                            </Field>
                            <Field
                                label="Credential ID"
                                copyValue={credential.id ?? undefined}
                            >
                                {credential.id ?? 'Not specified'}
                            </Field>
                            <Field
                                label={`Issuer (${credential.issuer.tag})`}
                                copyValue={credential.issuer.value}
                            >
                                {credential.issuer.value}
                            </Field>
                            <Field
                                label="Contract ID"
                                copyValue={credential.contractId}
                            >
                                {credential.contractId}
                            </Field>
                        </DetailSection>

                        <DetailSection
                            title="Credential validity"
                            note="The issuer's validity window for this credential."
                        >
                            <Field label="Valid from">
                                {credential.validFrom
                                    ? formatDateTimeString(credential.validFrom)
                                    : 'Not specified'}
                            </Field>
                            <Field label="Valid until">
                                {credential.validUntil
                                    ? formatDateTimeString(
                                          credential.validUntil
                                      )
                                    : 'Not specified'}
                            </Field>
                        </DetailSection>

                        <DetailSection title="Subjects">
                            {credential.subjects.map((subject, index) => (
                                <Box
                                    key={`${subject.id?.value ?? 'anonymous'}-${index}`}
                                    sx={{ mb: 2 }}
                                >
                                    <Field
                                        label={`Subject ${index + 1}`}
                                        copyValue={subject.id?.value}
                                    >
                                        {subject.id?.value ?? 'No identifier'}
                                    </Field>
                                    <ClaimsTable claims={subject.claims} />
                                </Box>
                            ))}
                        </DetailSection>

                        <DetailSection title="Credential schema">
                            {credential.credentialSchema.length === 0 ? (
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    No schema entries
                                </Typography>
                            ) : (
                                credential.credentialSchema.map((schema) => (
                                    <Field
                                        key={schema.id}
                                        label={schema.schemaType}
                                        copyValue={schema.id}
                                    >
                                        {schema.id}
                                        {schema.digestSRI
                                            ? ` (digest ${schema.digestSRI})`
                                            : ''}
                                    </Field>
                                ))
                            )}
                        </DetailSection>

                        <DetailSection
                            title="Securing"
                            note="Reported by the ledger. The wallet does not verify the proof."
                        >
                            <Field label="Mechanism">
                                {securingSummary(credential)}
                            </Field>
                        </DetailSection>

                        <DetailSection title="Parties">
                            <PartyList
                                label="Holders"
                                parties={credential.holders}
                            />
                            <PartyList
                                label="Anchorers"
                                parties={credential.anchorers}
                            />
                        </DetailSection>

                        <DetailSection
                            title="Registry record"
                            note="Registry retention is the registry's own record lifetime, not the credential's validity."
                        >
                            {credential.registration ? (
                                <>
                                    <Field
                                        label="Registry admin"
                                        copyValue={
                                            credential.registration
                                                .registryAdmin
                                        }
                                    >
                                        {credential.registration.registryAdmin}
                                    </Field>
                                    <Field label="Registered at">
                                        {formatDateTimeString(
                                            credential.registration.registeredAt
                                        )}
                                    </Field>
                                    <Field label="Registry retention expires">
                                        {credential.registration.expiresAt
                                            ? formatDateTimeString(
                                                  credential.registration
                                                      .expiresAt
                                              )
                                            : 'Not specified'}
                                    </Field>
                                </>
                            ) : (
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Intrinsic credential: no registry record.
                                </Typography>
                            )}
                        </DetailSection>
                    </DialogContent>
                </>
            )}
        </Dialog>
    )
}

function DetailSection({
    title,
    note,
    children,
}: {
    title: string
    note?: string
    children: ReactNode
}) {
    return (
        <Box component="section" sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                {title}
            </Typography>
            {note && (
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1 }}
                >
                    {note}
                </Typography>
            )}
            {children}
        </Box>
    )
}

function Field({
    label,
    copyValue,
    children,
}: {
    label: string
    copyValue?: string
    children: ReactNode
}) {
    return (
        <Box sx={{ mb: 1.5 }}>
            <OfferFieldLabel>{label}</OfferFieldLabel>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body2" sx={{ minWidth: 0 }}>
                    {children}
                </Typography>
                {copyValue && (
                    <CopyIconButton
                        value={copyValue}
                        label={`Copy ${label.toLowerCase()}`}
                        sx={{ flexShrink: 0, p: 0.25 }}
                    />
                )}
            </Box>
        </Box>
    )
}

function PartyList({ label, parties }: { label: string; parties: string[] }) {
    return (
        <Box sx={{ mb: 1.5 }}>
            <OfferFieldLabel>{label}</OfferFieldLabel>
            {parties.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    None
                </Typography>
            ) : (
                parties.map((party) => (
                    <Box
                        key={party}
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                        <Typography variant="body2" sx={{ minWidth: 0 }}>
                            {party}
                        </Typography>
                        <CopyIconButton
                            value={party}
                            label={`Copy ${label.toLowerCase()} party`}
                            sx={{ flexShrink: 0, p: 0.25 }}
                        />
                    </Box>
                ))
            )}
        </Box>
    )
}

function ClaimsTable({ claims }: { claims: Record<string, unknown> }) {
    const rows = claimRows(claims)
    if (rows.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                No claims
            </Typography>
        )
    }

    return (
        <Table size="small" aria-label="Subject claims" sx={{ mt: 1 }}>
            <TableHead>
                <TableRow>
                    <TableCell sx={{ width: '45%' }}>Claim</TableCell>
                    <TableCell>Value</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.map((row) => (
                    <TableRow key={row.path}>
                        <TableCell sx={{ pl: 2 + row.depth * 2 }}>
                            {row.label}
                        </TableCell>
                        <TableCell>
                            {row.value ?? (
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    component="span"
                                >
                                    —
                                </Typography>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}
