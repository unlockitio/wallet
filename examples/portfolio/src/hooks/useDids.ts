import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { submitViaProvider } from '../lib/submit'
import { createOwnerDid, decodeDids, didInterfaces } from '../services/dids'
import { usePrimaryAccount } from './useAccounts'
import { useWalletSdk } from './useWalletSdk'

export function useDids() {
    const account = usePrimaryAccount()
    const { sdk, isLoading: sdkLoading, error: sdkError } = useWalletSdk()
    const partyId = account?.partyId
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: ['walletConnection', 'dids', partyId],
        enabled: !!sdk && !!partyId,
        retry: false,
        queryFn: async () => {
            if (!sdk || !partyId)
                throw new Error('Wallet SDK and primary party are required')
            try {
                const events =
                    await sdk.ledger.acsReader.paginated.raw.readJsContracts({
                        parties: [partyId],
                        filterByParty: true,
                        interfaceIds: [
                            didInterfaces.document,
                            didInterfaces.registered,
                        ],
                        continueUntilCompletion: true,
                    })
                return { documents: decodeDids(events), packageMissing: false }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                if (
                    /PACKAGE_NOT_FOUND|PACKAGE_NAME_NOT_FOUND|unknown package name|package.*not.*found/i.test(
                        message
                    )
                ) {
                    return { documents: [], packageMissing: true }
                }
                throw error
            }
        },
    })
    const create = useMutation({
        mutationFn: async (registryAdmin: string) => {
            if (!partyId || !query.data || query.data.packageMissing)
                throw new Error(
                    'Primary party and vetted DID packages are required'
                )
            await submitViaProvider(
                createOwnerDid(
                    partyId,
                    registryAdmin,
                    query.data.documents,
                    new Date()
                ),
                partyId
            )
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['walletConnection', 'dids', partyId],
            })
        },
    })
    return {
        create,
        data: query.data ?? { documents: [], packageMissing: false },
        hasLoaded: !!query.data,
        isLoading: sdkLoading || (!!partyId && query.isLoading),
        error:
            sdkError ||
            (query.error instanceof Error ? query.error.message : null),
        partyId,
        partyHint: account?.hint ?? null,
    }
}
