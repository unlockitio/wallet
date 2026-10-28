import { useState } from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import { CredentialAcceptDialog } from '@components/credentials/credential-accept-dialog'
import {
    OfferDetailBlock,
    OfferRowGrid,
    OfferRowShell,
} from '@components/offers/offer-row-layout'
import { useCredentialCommands } from '@hooks/useCredentialCommands'
import { useCredentials } from '@hooks/useCredentials'
import { renderAnyValue, type CredentialOffer } from '@services/credentials'
import { emptyVisibilityMessage } from '@services/visibility-message'

export function CredentialOffersContent() {
    const { data, error, isLoading, partyId, partyHint } = useCredentials()
    const commands = useCredentialCommands()
    const [offer, setOffer] = useState<CredentialOffer | null>(null)
    const [actionError, setActionError] = useState('')

    if (!partyId) {
        return (
            <Alert severity="info">
                Select a primary wallet to view credential offers.
            </Alert>
        )
    }
    if (error) {
        return (
            <Alert severity="error">
                Unable to load credential offers: {error}
            </Alert>
        )
    }
    if (isLoading) {
        return <Typography>Loading credential offers…</Typography>
    }

    return (
        <>
            {data.offers.length === 0 ? (
                <Alert severity="info">
                    {emptyVisibilityMessage(
                        'pending credential offers',
                        'credential interfaces',
                        { packageMissing: data.packageMissing, partyHint }
                    )}
                </Alert>
            ) : (
                <Box sx={{ display: 'grid', gap: 2 }}>
                    {data.offers.map((pending) => (
                        <OfferRowShell key={pending.contractId}>
                            <OfferRowGrid columns={4}>
                                <OfferDetailBlock
                                    label="Type"
                                    value={
                                        pending.request == null
                                            ? 'Unsolicited credential offer'
                                            : 'Request-backed credential offer'
                                    }
                                />
                                <OfferDetailBlock
                                    label="Requested Type"
                                    value={pending.requestedType}
                                />
                                <OfferDetailBlock
                                    label="Registry Admin"
                                    value={pending.registryAdmin}
                                />
                                <Box
                                    sx={{
                                        minWidth: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                    }}
                                >
                                    <Button
                                        disabled={
                                            commands.accept.isPending ||
                                            commands.reject.isPending ||
                                            pending.holder !== partyId
                                        }
                                        onClick={() => {
                                            setActionError('')
                                            commands.accept.reset()
                                            setOffer(pending)
                                        }}
                                    >
                                        {pending.request == null
                                            ? 'Accept unsolicited offer'
                                            : 'Accept request-backed offer'}
                                    </Button>
                                    <Button
                                        disabled={
                                            commands.reject.isPending ||
                                            pending.holder !== partyId
                                        }
                                        onClick={() => {
                                            setActionError('')
                                            commands.reject
                                                .mutateAsync({
                                                    party: partyId,
                                                    offerId: pending.contractId,
                                                    version: pending.version,
                                                })
                                                .catch((cause: unknown) =>
                                                    setActionError(
                                                        cause instanceof Error
                                                            ? cause.message
                                                            : String(cause)
                                                    )
                                                )
                                        }}
                                    >
                                        Reject
                                    </Button>
                                </Box>
                            </OfferRowGrid>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mt: 1, overflowWrap: 'anywhere' }}
                            >
                                Offered credential:{' '}
                                {renderAnyValue(pending.credential)}
                            </Typography>
                        </OfferRowShell>
                    ))}
                </Box>
            )}

            {actionError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    Credential transaction failed (check package vetting and
                    authorization): {actionError}
                </Alert>
            )}

            <CredentialAcceptDialog
                offer={offer}
                partyId={partyId}
                isPending={commands.accept.isPending}
                acceptError={commands.accept.error}
                onClose={() => setOffer(null)}
                onAccept={(args) => {
                    void commands.accept
                        .mutateAsync(args)
                        .then(() => setOffer(null))
                        .catch(() => {})
                }}
            />
        </>
    )
}
