import { useMemo, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { createFileRoute } from '@tanstack/react-router'
import { ActionRequiredDialog } from '@components/dashboard/action-required-dialog'
import { CredentialOffersContent } from '@components/offers/credential-offers-content'
import { OffersContent } from '@components/offers/offers-content'
import { OfferTabs, type OfferTabValue } from '@components/offers/offer-tabs'
import { OfferToolbar } from '@components/offers/offer-toolbar'
import { useOffers } from '@hooks/useOffers'

export const Route = createFileRoute('/dashboard/offers')({
    component: RouteComponent,
})

function RouteComponent() {
    const offers = useOffers()
    const [selectedTab, setSelectedTab] = useState<OfferTabValue>('transfers')
    const [showExpiredOffers, setShowExpiredOffers] = useState(false)
    const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
    const visibleOffers = useMemo(() => {
        const categoryOffers =
            selectedTab === 'allocations'
                ? offers.allocations
                : offers.transfers

        return showExpiredOffers
            ? categoryOffers
            : categoryOffers.filter((offer) => offer.status !== 'Expired')
    }, [offers.allocations, offers.transfers, selectedTab, showExpiredOffers])
    const selectedOffer = useMemo(
        () =>
            selectedOfferId
                ? (offers.all.find((offer) => offer.id === selectedOfferId) ??
                  null)
                : null,
        [offers.all, selectedOfferId]
    )

    return (
        <Box sx={{ px: 4, py: 8 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="h4" component="h1" sx={{ mb: 1.5 }}>
                    Offers
                </Typography>
                <Typography variant="body1" color="text.primary">
                    These are offers sent to and from your primary wallet
                </Typography>
            </Box>

            <Box
                sx={{
                    display: 'flex',
                    alignItems: { xs: 'stretch', md: 'end' },
                    justifyContent: 'space-between',
                    gap: 2,
                    mb: 2,
                    borderBottom: (theme) =>
                        `1px solid ${theme.palette.divider}`,
                    flexDirection: { xs: 'column', md: 'row' },
                }}
            >
                <OfferTabs value={selectedTab} onChange={setSelectedTab} />
                {selectedTab !== 'credentials' && (
                    <OfferToolbar
                        showExpiredOffers={showExpiredOffers}
                        onShowExpiredOffersChange={setShowExpiredOffers}
                    />
                )}
            </Box>

            {selectedTab === 'credentials' ? (
                <Box component="section" aria-label="credential offers">
                    <CredentialOffersContent />
                </Box>
            ) : (
                <Box component="section" aria-label={`${selectedTab} offers`}>
                    <OffersContent
                        offers={visibleOffers}
                        category={selectedTab}
                        isLoading={offers.isLoading}
                        isError={offers.isError}
                        error={offers.error}
                        hasSearchQuery={false}
                        onOfferClick={(offer) => setSelectedOfferId(offer.id)}
                    />
                </Box>
            )}

            <ActionRequiredDialog
                item={selectedOffer?.source ?? null}
                onClose={() => setSelectedOfferId(null)}
            />
        </Box>
    )
}
