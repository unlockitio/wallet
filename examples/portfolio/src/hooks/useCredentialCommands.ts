import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitMultiPartyViaProvider, submitViaProvider } from '../lib/submit'
import {
    acceptOffer,
    cancelRequest,
    createOffer,
    createRequest,
    rejectOffer,
    requiredOfferSignatories,
    validateFactoryDisclosure,
    type IssueOfferInput,
} from '../services/credential-commands'

export function useCredentialCommands() {
    const queryClient = useQueryClient()
    const invalidate = (_: unknown, args: { party: string }) => {
        void queryClient.invalidateQueries({
            queryKey: ['walletConnection', 'credentials', args.party],
        })
    }
    const accept = useMutation({
        mutationFn: async (args: {
            party: string
            offerId: string
            factoryId: string
            disclosure: unknown
        }) =>
            submitViaProvider(
                acceptOffer(
                    args.offerId,
                    validateFactoryDisclosure(args.disclosure, args.factoryId)
                ),
                args.party
            ),
        onSuccess: invalidate,
    })
    const reject = useMutation({
        mutationFn: async (args: { party: string; offerId: string }) =>
            submitViaProvider(rejectOffer(args.offerId), args.party),
        onSuccess: invalidate,
    })
    const create = useMutation({
        mutationFn: async (args: {
            party: string
            requestedType: string
            registryAdmin: string
            anchorers: string[]
        }) =>
            submitViaProvider(
                createRequest(
                    args.party,
                    args.requestedType,
                    args.registryAdmin,
                    args.anchorers
                ),
                args.party
            ),
        onSuccess: invalidate,
    })
    const cancel = useMutation({
        mutationFn: async (args: { party: string; requestId: string }) =>
            submitViaProvider(cancelRequest(args.requestId), args.party),
        onSuccess: invalidate,
    })
    // The offer is created by every one of its signatories at once: the request
    // anchorers, the Party issuer and the registry admin. The gateway accepts the
    // submission only for parties whose wallets the connected user controls.
    const issue = useMutation({
        mutationFn: async (args: { party: string } & IssueOfferInput) =>
            submitMultiPartyViaProvider(
                createOffer(args),
                requiredOfferSignatories(args.request, args.issuer)
            ),
        onSuccess: invalidate,
    })
    return { accept, reject, create, cancel, issue }
}
