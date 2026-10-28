import { credentialInterfaces } from '../config/credential-interfaces'
import { interfaceKindOf, interfaceKinds } from './interface-id'

export type Identifier = { tag: string; value: string }
export type Subject = { id: Identifier | null; claims: Record<string, unknown> }
// The securing mechanism is the `CredentialSecuring` variant tag. `EnvelopedProof`
// carries a media type and `EmbeddedProof` carries data-integrity proof summaries;
// neither is a verification result, so the decoder never asserts validity.
export type Securing = {
    mechanism: string
    mediaType: string | null
    cryptosuites: string[]
}
export type CredentialSchema = {
    id: string
    schemaType: string
    digestSRI: string | null
}
export type Credential = {
    contractId: string
    id: string | null
    credentialTypes: string[]
    issuer: Identifier
    validFrom: string | null
    validUntil: string | null
    subjects: Subject[]
    credentialSchema: CredentialSchema[]
    securing: Securing | null
    holders: string[]
    anchorers: string[]
    registration: Registration | null
}
export type Registration = {
    registryAdmin: string
    registeredAt: string
    expiresAt: string | null
    meta: unknown
}
export type CredentialRequest = {
    contractId: string
    holder: string
    requestedType: string
    registryAdmin: string
    anchorers: string[]
}
export type CredentialOffer = CredentialRequest & {
    request: unknown
    factory: unknown
    credential: unknown
    registration: unknown
}
export type RegistryFactory = {
    contractId: string
    registryAdmin: string
    anchorers: string[]
}
export type CredentialsSnapshot = {
    credentials: Credential[]
    offers: CredentialOffer[]
    requests: CredentialRequest[]
    // Requests the party sees in a routing role (registry admin or anchorer) rather
    // than as the holder. These are the requests it can answer with an offer.
    incomingRequests: CredentialRequest[]
    factories: RegistryFactory[]
}

type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as RecordValue)
        : null
const text = (value: unknown): string | null =>
    typeof value === 'string' ? value : null

// A single Daml Optional is null or its bare value; arrays belong to nested Optionals.
export const optional = (value: unknown): unknown => value ?? null

const identifier = (value: unknown): Identifier | null => {
    const object = record(value)
    return object && text(object.tag) && text(object.value)
        ? { tag: object.tag as string, value: object.value as string }
        : null
}
// A Daml list arrives as a JSON array, and a `NonEmpty` as `{hd, tl}`.
export const damlList = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value
    const object = record(value)
    return object && 'hd' in object
        ? [object.hd, ...(Array.isArray(object.tl) ? object.tl : [])]
        : []
}
const nonEmpty = damlList
const partyList = (value: unknown): string[] =>
    nonEmpty(value).flatMap((v) => text(v) ?? [])

export const renderAnyValue = (value: unknown): string => {
    const object = record(value)
    if (
        object &&
        typeof object.tag === 'string' &&
        object.tag.startsWith('AV_')
    ) {
        const content = object.value
        if (object.tag === 'AV_List')
            return `[${nonEmpty(content).map(renderAnyValue).join(', ')}]`
        if (object.tag === 'AV_Map') return renderAnyValue(content)
        return renderAnyValue(content)
    }
    if (Array.isArray(value)) return `[${value.map(renderAnyValue).join(', ')}]`
    if (object)
        return `{${Object.entries(object)
            .map(([key, item]) => `${key}: ${renderAnyValue(item)}`)
            .join(', ')}}`
    return value == null ? '—' : String(value)
}

const subject = (value: unknown): Subject | null => {
    const object = record(value)
    if (!object) return null
    return {
        id: identifier(optional(object.id)),
        claims: record(object.claims) ?? {},
    }
}
const credentialSchema = (value: unknown): CredentialSchema | null => {
    const object = record(value)
    const id = text(object?.id)
    const schemaType = text(object?.schemaType)
    return id && schemaType
        ? { id, schemaType, digestSRI: text(optional(object?.digestSRI)) }
        : null
}
// `EnvelopedProof` has a `mediaType`; `EmbeddedProof` has `proofs`, each with an
// optional `cryptosuite`. Both are reported as-is, with no verification claim.
const securing = (value: unknown): Securing | null => {
    const object = record(value)
    const mechanism = text(object?.tag)
    if (!mechanism) return null
    const content = record(object?.value)
    return {
        mechanism,
        mediaType: text(optional(content?.mediaType)),
        cryptosuites: nonEmpty(content?.proofs).flatMap(
            (proof) => text(optional(record(proof)?.cryptosuite)) ?? []
        ),
    }
}
const decodeCredential = (
    contractId: string,
    value: unknown
): Credential | null => {
    const view = record(value)
    const issuer = identifier(view?.issuer)
    if (!view || !issuer) return null
    const subjects = nonEmpty(view.credentialSubject).flatMap(
        (item) => subject(item) ?? []
    )
    return {
        contractId,
        id: text(optional(view.id)),
        credentialTypes: partyList(view.credentialTypes),
        issuer,
        validFrom: text(optional(view.validFrom)),
        validUntil: text(optional(view.validUntil)),
        subjects,
        credentialSchema: nonEmpty(view.credentialSchema).flatMap(
            (item) => credentialSchema(item) ?? []
        ),
        securing: securing(optional(view.securing)),
        holders: partyList(view.holders),
        anchorers: partyList(view.anchorers),
        registration: null,
    }
}
const decodeRegistration = (value: unknown): Registration | null => {
    const view = record(value)
    const registryAdmin = text(view?.registryAdmin)
    const registeredAt = text(view?.registeredAt)
    return registryAdmin && registeredAt
        ? {
              registryAdmin,
              registeredAt,
              expiresAt: text(optional(view?.expiresAt)),
              meta: view?.meta,
          }
        : null
}
const decodeFactory = (
    contractId: string,
    value: unknown
): RegistryFactory | null => {
    const view = record(value)
    const registryAdmin = text(view?.registryAdmin)
    const anchorers = partyList(view?.anchorers)
    return registryAdmin && anchorers.length
        ? { contractId, registryAdmin, anchorers }
        : null
}
const decodeRequest = (
    contractId: string,
    value: unknown
): CredentialRequest | null => {
    const view = record(value)
    const holder = text(view?.holder)
    const requestedType = text(view?.requestedType)
    const registryAdmin = text(view?.registryAdmin)
    return holder && requestedType && registryAdmin
        ? {
              contractId,
              holder,
              requestedType,
              registryAdmin,
              anchorers: partyList(view?.anchorers),
          }
        : null
}

const credentialInterfaceKinds = interfaceKinds(credentialInterfaces)

export const decodeCredentials = (
    events: unknown[],
    partyId: string
): CredentialsSnapshot => {
    const credentials = new Map<string, Credential>()
    const registrations = new Map<string, Registration>()
    const offers = new Map<string, CredentialOffer>()
    const requests = new Map<string, CredentialRequest>()
    const incomingRequests = new Map<string, CredentialRequest>()
    const factories = new Map<string, RegistryFactory>()
    for (const event of events) {
        const contract = record(event)
        const contractId = text(contract?.contractId)
        if (!contractId || !Array.isArray(contract?.interfaceViews)) continue
        for (const rawView of contract.interfaceViews) {
            const interfaceView = record(rawView)
            const kind = interfaceKindOf(
                credentialInterfaceKinds,
                interfaceView?.interfaceId
            )
            const value = interfaceView?.viewValue
            if (kind === 'credential') {
                const credential = decodeCredential(contractId, value)
                if (credential) credentials.set(contractId, credential)
            } else if (kind === 'registered') {
                const registration = decodeRegistration(value)
                if (registration) registrations.set(contractId, registration)
            } else if (kind === 'request') {
                const request = decodeRequest(contractId, value)
                if (!request) continue
                if (request.holder === partyId)
                    requests.set(contractId, request)
                // The request template makes the registry admin and the anchorers
                // observers, so a routing party sees requests it did not make.
                else if (
                    request.registryAdmin === partyId ||
                    request.anchorers.includes(partyId)
                ) {
                    incomingRequests.set(contractId, request)
                }
            } else if (kind === 'factory') {
                const factory = decodeFactory(contractId, value)
                if (factory) factories.set(contractId, factory)
            } else if (kind === 'offer') {
                const view = record(value)
                const offer = decodeRequest(contractId, value)
                if (offer)
                    offers.set(contractId, {
                        ...offer,
                        request: view?.request,
                        factory: view?.factory,
                        credential: view?.credential,
                        registration: view?.registration,
                    })
            }
        }
    }
    return {
        credentials: [...credentials.values()].map((credential) => ({
            ...credential,
            registration: registrations.get(credential.contractId) ?? null,
        })),
        offers: [...offers.values()],
        requests: [...requests.values()],
        incomingRequests: [...incomingRequests.values()],
        factories: [...factories.values()],
    }
}
