import { type ReactNode } from 'react'
import { Alert, Box, Chip, Skeleton, Typography } from '@mui/material'
import { CopyIconButton } from '@components/ui/CopyIconButton'
import {
    OfferFieldLabel,
    OfferRowShell,
} from '@components/offers/offer-row-layout'
import { useDids } from '@hooks/useDids'
import type { DidDocument } from '@services/dids'
import { emptyVisibilityMessage } from '@services/visibility-message'
import { formatDateTimeString } from '@utils/date-format'

const RELATIONSHIPS = [
    'authentication',
    'assertionMethod',
    'capabilityInvocation',
] as const

export function DidsPanel() {
    const { data, error, isLoading, partyId, partyHint } = useDids()

    if (!partyId) {
        return (
            <Alert severity="info">
                Select a primary wallet to view stakeholder DID documents.
            </Alert>
        )
    }
    if (error) {
        return (
            <Alert severity="error">
                Unable to load DID documents: {error}
            </Alert>
        )
    }
    if (isLoading) {
        return (
            <Box sx={{ display: 'grid', gap: 2 }}>
                {Array.from({ length: 3 }, (_, index) => (
                    <DidCardSkeleton key={index} />
                ))}
            </Box>
        )
    }

    if (data.documents.length === 0) {
        return (
            <Alert severity="info">
                {emptyVisibilityMessage('DID documents', 'DID interfaces', {
                    packageMissing: data.packageMissing,
                    partyHint,
                })}
            </Alert>
        )
    }

    return (
        <Box component="section" sx={{ display: 'grid', gap: 2 }}>
            {data.documents.map((document) => (
                <DidCard key={document.contractId} document={document} />
            ))}
        </Box>
    )
}

function DidCard({ document }: { document: DidDocument }) {
    return (
        <OfferRowShell component="article" sx={{ overflowWrap: 'anywhere' }}>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 1.5,
                    minWidth: 0,
                }}
            >
                <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, minWidth: 0 }}
                >
                    {document.id}
                </Typography>
                <CopyIconButton
                    value={document.id}
                    label="Copy DID"
                    sx={{ flexShrink: 0, p: 0.25 }}
                />
                <Chip
                    label={
                        document.registration ? 'Registered' : 'Intrinsic-only'
                    }
                    size="small"
                    variant="outlined"
                    sx={{ borderRadius: 999, flexShrink: 0 }}
                />
            </Box>

            <DidField label="Controllers">
                {document.controllers.length === 0
                    ? 'None'
                    : document.controllers.join(', ')}
            </DidField>

            {document.verificationMethods.length > 0 && (
                <DidField label="Verification methods">
                    {document.verificationMethods.map((method) => (
                        <Box key={method.id} sx={{ mb: 1 }}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    minWidth: 0,
                                }}
                            >
                                <Typography
                                    variant="body2"
                                    sx={{ minWidth: 0 }}
                                >
                                    {method.id} ({method.methodType})
                                </Typography>
                                <CopyIconButton
                                    value={method.id}
                                    label="Copy verification method ID"
                                    sx={{ flexShrink: 0, p: 0.25 }}
                                />
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                Controller DID: {method.controllerDid}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Material: {method.verificationMaterial}
                            </Typography>
                        </Box>
                    ))}
                </DidField>
            )}

            {RELATIONSHIPS.map(
                (relationship) =>
                    document.verificationRelationships[relationship].length >
                        0 && (
                        <DidField key={relationship} label={relationship}>
                            {document.verificationRelationships[
                                relationship
                            ].join(', ')}
                        </DidField>
                    )
            )}

            {document.services.length > 0 && (
                <DidField label="Services">
                    {document.services.map((service) => (
                        <Box key={service.id} sx={{ mb: 1 }}>
                            <Typography variant="body2">
                                {service.id} ({service.serviceType}), version{' '}
                                {service.version}
                            </Typography>
                            {service.endpoints.map((endpoint, index) => (
                                <Box
                                    key={`${endpoint.uri}-${index}`}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                        minWidth: 0,
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ minWidth: 0 }}
                                    >
                                        {endpoint.uri}
                                        {endpoint.priority !== null
                                            ? ` (priority ${endpoint.priority})`
                                            : ''}
                                    </Typography>
                                    <CopyIconButton
                                        value={endpoint.uri}
                                        label="Copy service endpoint"
                                        sx={{ flexShrink: 0, p: 0.25 }}
                                    />
                                </Box>
                            ))}
                        </Box>
                    ))}
                </DidField>
            )}

            {document.registration ? (
                <Box
                    component="section"
                    aria-label="DID registry record"
                    sx={{
                        mt: 1,
                        pt: 1.5,
                        borderTop: (theme) =>
                            `1px solid ${theme.palette.divider}`,
                    }}
                >
                    <DidField
                        label="Registry admin"
                        copyValue={document.registration.registryAdmin}
                    >
                        {document.registration.registryAdmin}
                    </DidField>
                    <DidField label="Registered at">
                        {document.registration.registeredAt
                            ? formatDateTimeString(
                                  document.registration.registeredAt
                              )
                            : 'Not specified'}
                    </DidField>
                    <DidField label="Updated at">
                        {document.registration.updatedAt
                            ? formatDateTimeString(
                                  document.registration.updatedAt
                              )
                            : 'Not specified'}
                    </DidField>
                    <DidField label="Version">
                        {document.registration.versionId}
                    </DidField>
                    <DidField label="Deactivated">
                        {document.registration.deactivated
                            ? `Yes${
                                  document.registration.deactivatedAt
                                      ? ` at ${formatDateTimeString(
                                            document.registration.deactivatedAt
                                        )}`
                                      : ''
                              }`
                            : 'No'}
                    </DidField>
                    <DidField label="Source">
                        {document.registration.source}
                    </DidField>
                </Box>
            ) : (
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                >
                    Intrinsic DID document (no registration metadata)
                </Typography>
            )}
        </OfferRowShell>
    )
}

function DidField({
    label,
    copyValue,
    children,
}: {
    label: string
    copyValue?: string
    children: ReactNode
}) {
    return (
        <Box sx={{ mb: 1.5, minWidth: 0 }}>
            <OfferFieldLabel>{label}</OfferFieldLabel>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                    variant="body2"
                    component="div"
                    sx={{ minWidth: 0 }}
                >
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

function DidCardSkeleton() {
    return (
        <OfferRowShell>
            <Skeleton variant="text" width="40%" />
            {Array.from({ length: 3 }, (_, index) => (
                <Box key={index} sx={{ mt: 1 }}>
                    <Skeleton variant="text" width={96} />
                    <Skeleton variant="text" width="70%" />
                </Box>
            ))}
        </OfferRowShell>
    )
}
