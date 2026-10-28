import type { PreparedCommand } from '@canton-network/wallet-sdk'
import {
    credentialInterfaces,
    demoCredentialOfferId,
    demoCredentialRequestId,
} from '../config/credential-interfaces'
import type { CredentialRequest } from './credentials'

export type FactoryDisclosure = {
    templateId: string
    contractId: string
    createdEventBlob: string
    synchronizerId: string
}

export interface FactoryDisclosureProvider {
    getFactoryDisclosure(
        registryAdmin: string,
        factoryContractId: string
    ): Promise<unknown>
}

export function disclosureUrl(
    baseUrl: string,
    factoryContractId: string
): string {
    const base = new URL(baseUrl)
    if (!['http:', 'https:'].includes(base.protocol))
        throw new Error('Disclosure URL must use HTTP or HTTPS')
    return new URL(
        `factory-disclosures/${encodeURIComponent(factoryContractId)}`,
        `${base.href.replace(/\/+$/, '')}/`
    ).href
}

export function httpFactoryDisclosureProvider(
    baseUrls: Readonly<Record<string, string>>
): FactoryDisclosureProvider {
    return {
        async getFactoryDisclosure(registryAdmin, factoryContractId) {
            const baseUrl = baseUrls[registryAdmin]
            if (!baseUrl)
                throw new Error(
                    `No factory disclosure provider configured for ${registryAdmin}`
                )
            const response = await fetch(
                disclosureUrl(baseUrl, factoryContractId)
            )
            if (!response.ok)
                throw new Error(
                    `Factory disclosure fetch failed: HTTP ${response.status}`
                )
            return response.json()
        },
    }
}

export function validateFactoryDisclosure(
    value: unknown,
    factoryContractId: string
): FactoryDisclosure {
    if (!value || typeof value !== 'object')
        throw new Error('Factory disclosure must be an object')
    const data = value as Record<string, unknown>
    if (data.contractId !== factoryContractId)
        throw new Error(
            'Factory disclosure contractId does not match offer factory'
        )
    for (const key of ['templateId', 'createdEventBlob', 'synchronizerId']) {
        if (typeof data[key] !== 'string' || !data[key])
            throw new Error(`Factory disclosure missing ${key}`)
    }
    if (!/^([a-fA-F0-9]+):[^:]+:[^:]+$/.test(data.templateId as string)) {
        throw new Error('Factory disclosure templateId must use a package ID')
    }
    return data as FactoryDisclosure
}

export function acceptOffer(
    contractId: string,
    disclosure: FactoryDisclosure
): PreparedCommand {
    return [
        {
            ExerciseCommand: {
                templateId: credentialInterfaces.offer,
                contractId,
                choice: 'CredentialOffer_Accept',
                choiceArgument: {},
            },
        },
        [disclosure],
    ]
}

export function rejectOffer(contractId: string): PreparedCommand {
    return [
        {
            ExerciseCommand: {
                templateId: credentialInterfaces.offer,
                contractId,
                choice: 'CredentialOffer_Reject',
                choiceArgument: {},
            },
        },
        [],
    ]
}

export function cancelRequest(contractId: string): PreparedCommand {
    return [
        {
            ExerciseCommand: {
                templateId: credentialInterfaces.request,
                contractId,
                choice: 'CredentialRequest_Cancel',
                choiceArgument: {},
            },
        },
        [],
    ]
}

export function createRequest(
    holder: string,
    requestedType: string,
    registryAdmin: string,
    anchorers: string[]
): PreparedCommand {
    if (
        !holder ||
        !requestedType.trim() ||
        !registryAdmin.trim() ||
        !anchorers.length ||
        anchorers.some((party) => !party.trim())
    ) {
        throw new Error(
            'Holder, credential type, registry admin and at least one anchorer are required'
        )
    }
    if (new Set(anchorers).size !== anchorers.length)
        throw new Error('Anchorers must be unique')
    return [
        {
            CreateCommand: {
                templateId: demoCredentialRequestId,
                createArguments: {
                    holder,
                    requestedType: requestedType.trim(),
                    registryAdmin: registryAdmin.trim(),
                    anchorers: { hd: anchorers[0], tl: anchorers.slice(1) },
                },
            },
        },
        [],
    ]
}

// --- Issuer-side offer ---

// `VerifiableCredential` is on every W3C credential, so it is always the first type.
export const BASE_CREDENTIAL_TYPE = 'VerifiableCredential'

export type SubjectIdentifierTag =
    'W3C_VC_Identifier_Party' | 'W3C_VC_Identifier'
export type SubjectIdentifierInput = {
    tag: SubjectIdentifierTag
    value: string
}
export type ClaimInput = { key: string; value: string }

export type IssueOfferInput = {
    request: CredentialRequest
    // The issuer is a Canton Party, so the offer is signed, and the template requires
    // it to be one of the request's anchorers.
    issuer: string
    factory: string
    // Types beyond `VerifiableCredential` and the requested type.
    extraTypes: string[]
    subjectId: SubjectIdentifierInput | null
    claims: ClaimInput[]
    validFrom: string | null
    validUntil: string | null
    credentialId: string | null
    registeredAt: string
    // Registry retention, which is distinct from the credential's own validity.
    registrationExpiresAt: string | null
}

// The signatories the `DemoCredentialOffer` template demands, in template order and
// without duplicates: the request anchorers, the Party issuer, the registry admin.
export function requiredOfferSignatories(
    request: CredentialRequest,
    issuer: string
): string[] {
    return [...new Set([...request.anchorers, issuer, request.registryAdmin])]
}

export const missingOfferSignatories = (
    required: string[],
    controlled: string[]
): string[] => required.filter((party) => !controlled.includes(party))

// `id` is the subject identifier member of the W3C credential subject, not a claim, so
// a claim named `id` would collide with it.
export function claimKeyError(key: string): string | null {
    if (!key.trim()) return 'Claim keys must not be empty'
    if (key.trim() === 'id')
        return '`id` is the subject identifier, not a claim'
    return null
}

export function credentialTypesFor(
    requestedType: string,
    extraTypes: string[]
): string[] {
    return [
        ...new Set(
            [
                BASE_CREDENTIAL_TYPE,
                requestedType.trim(),
                ...extraTypes.map((type) => type.trim()),
            ].filter(Boolean)
        ),
    ]
}

export function claimsTextMap(
    claims: ClaimInput[]
): Record<string, { tag: 'AV_Text'; value: string }> {
    const map: Record<string, { tag: 'AV_Text'; value: string }> = {}
    for (const { key, value } of claims) {
        const error = claimKeyError(key)
        if (error) throw new Error(error)
        if (key.trim() in map)
            throw new Error(`Duplicate claim key: ${key.trim()}`)
        map[key.trim()] = { tag: 'AV_Text', value }
    }
    return map
}

export function createOffer(input: IssueOfferInput): PreparedCommand {
    const { request, issuer, factory } = input
    if (!issuer.trim()) throw new Error('An issuer party is required')
    if (!factory.trim())
        throw new Error('A credential registry factory contract is required')
    if (!request.contractId)
        throw new Error('An existing credential request is required')
    if (!request.anchorers.length)
        throw new Error('The request must name at least one anchorer')
    if (!request.anchorers.includes(issuer)) {
        throw new Error(
            'The issuer party must be one of the request anchorers, because the offer is signed by the issuer as an anchorer'
        )
    }
    const credentialTypes = credentialTypesFor(
        request.requestedType,
        input.extraTypes
    )
    const anchorers = {
        hd: request.anchorers[0],
        tl: request.anchorers.slice(1),
    }
    return [
        {
            CreateCommand: {
                templateId: demoCredentialOfferId,
                createArguments: {
                    request: request.contractId,
                    holder: request.holder,
                    requestedType: request.requestedType,
                    registryAdmin: request.registryAdmin,
                    anchorers,
                    factory: factory.trim(),
                    credential: {
                        id: input.credentialId?.trim() || null,
                        credentialTypes,
                        issuer: {
                            tag: 'W3C_VC_Identifier_Party',
                            value: issuer,
                        },
                        validFrom: input.validFrom,
                        validUntil: input.validUntil,
                        credentialSubject: {
                            hd: {
                                id:
                                    input.subjectId &&
                                    input.subjectId.value.trim()
                                        ? {
                                              tag: input.subjectId.tag,
                                              value: input.subjectId.value.trim(),
                                          }
                                        : null,
                                claims: claimsTextMap(input.claims),
                            },
                            tl: [],
                        },
                        credentialSchema: [],
                        securing: null,
                        holders: [request.holder],
                        anchorers,
                    },
                    registration: {
                        registryAdmin: request.registryAdmin,
                        registeredAt: input.registeredAt,
                        expiresAt: input.registrationExpiresAt,
                        meta: {},
                    },
                },
            },
        },
        [],
    ]
}
