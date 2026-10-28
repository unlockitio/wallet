import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitMultiPartyViaProvider, submitViaProvider } from '../lib/submit'
import {
    acceptOffer,
    approveRequest,
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
    const invalidate = () => {
        void queryClient.invalidateQueries({
            queryKey: ['walletConnection', 'credentials'],
        })
    }
    const accept = useMutation({
        mutationFn: async (args: {
            party: string
            offerId: string
            factoryId: string
            version: 'current' | 'legacy'
            disclosure: unknown
        }) =>
            submitViaProvider(
                acceptOffer(
                    args.offerId,
                    validateFactoryDisclosure(args.disclosure, args.factoryId),
                    args.version
                ),
                args.party
            ),
        onSuccess: invalidate,
    })
    const reject = useMutation({
        mutationFn: async (args: {
            party: string
            offerId: string
            version: 'current' | 'legacy'
        }) =>
            submitViaProvider(
                rejectOffer(args.offerId, args.version),
                args.party
            ),
        onSuccess: invalidate,
    })
    const create = useMutation({
        mutationFn: async (args: {
            party: string
            requestedIssuer: string
            requestedType: string
            registryAdmin: string
            anchorers: string[]
        }) =>
            submitViaProvider(
                createRequest(
                    args.party,
                    args.requestedIssuer,
                    args.requestedType,
                    args.registryAdmin,
                    args.anchorers
                ),
                args.party
            ),
        onSuccess: invalidate,
    })
    const cancel = useMutation({
        mutationFn: async (args: {
            party: string
            requestId: string
            version: 'current' | 'legacy'
        }) =>
            submitViaProvider(
                cancelRequest(args.requestId, args.version),
                args.party
            ),
        onSuccess: invalidate,
    })
    // The offer is created by every one of its signatories at once: the request
    // anchorers, the Party issuer and the registry admin. The gateway accepts the
    // submission only for parties whose wallets the connected user controls.
    const issue = useMutation({
        mutationFn: async (
            args: { party: string; mode: 'approve' | 'offer' } & IssueOfferInput
        ) =>
            args.mode === 'approve'
                ? submitViaProvider(approveRequest(args), args.party)
                : submitMultiPartyViaProvider(
                      createOffer(args),
                      requiredOfferSignatories(args)
                  ),
        onSuccess: invalidate,
    })
    return { accept, reject, create, cancel, issue }
}
