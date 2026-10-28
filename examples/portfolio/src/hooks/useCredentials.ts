import { useQuery } from '@tanstack/react-query'
import { credentialInterfaceIds } from '../config/credential-interfaces'
import {
    decodeCredentials,
    type CredentialsSnapshot,
} from '../services/credentials'
import { usePrimaryAccount } from './useAccounts'
import { useWalletSdk } from './useWalletSdk'

type CredentialsQueryResult = CredentialsSnapshot & { packageMissing: boolean }

const empty: CredentialsQueryResult = {
    credentials: [],
    offers: [],
    requests: [],
    incomingRequests: [],
    factories: [],
    packageMissing: false,
}

export function useCredentials() {
    const account = usePrimaryAccount()
    const { sdk, isLoading: sdkLoading, error: sdkError } = useWalletSdk()
    const partyId = account?.partyId
    const query = useQuery({
        queryKey: ['walletConnection', 'credentials', partyId],
        enabled: !!sdk && !!partyId,
        retry: false,
        queryFn: async (): Promise<CredentialsQueryResult> => {
            if (!sdk || !partyId)
                throw new Error('Wallet SDK and primary party are required')
            try {
                const events =
                    await sdk.ledger.acsReader.paginated.raw.readJsContracts({
                        parties: [partyId],
                        filterByParty: true,
                        interfaceIds: credentialInterfaceIds,
                        continueUntilCompletion: true,
                    })
                return {
                    ...decodeCredentials(events, partyId),
                    packageMissing: false,
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                if (
                    /PACKAGE_NOT_FOUND|PACKAGE_NAME_NOT_FOUND|unknown package name|package.*not.*found/i.test(
                        message
                    )
                ) {
                    return { ...empty, packageMissing: true }
                }
                throw error
            }
        },
    })
    return {
        data: query.data ?? empty,
        isLoading: sdkLoading || (!!partyId && query.isLoading),
        error:
            sdkError ||
            (query.error instanceof Error ? query.error.message : null),
        partyId,
        partyHint: account?.hint ?? null,
        // Validity is evaluated against the instant the ACS was read, not against a
        // clock sampled during render: the snapshot is what the ledger reported.
        dataUpdatedAt: query.dataUpdatedAt,
    }
}
