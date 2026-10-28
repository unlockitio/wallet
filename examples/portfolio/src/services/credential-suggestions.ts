// Pure derivation of `(issuer, type)` suggestions for a credential request.
//
// These are observations, not a catalogue: the only evidence available in the wallet
// is the set of credentials the primary party can already see, so a suggestion means
// "this issuer has issued this type to someone visible here", never "this issuer
// offers this type". An optional registry endpoint can add entries, and its absence
// or failure is normal rather than an error.
import { BASE_CREDENTIAL_TYPE } from './credential-commands'
import type { Credential } from './credentials'
import { shortPartyId } from './credential-view'

// How much is known about the issuer string. `party` and `text` come from the
// `W3C_VC_Identifier` variant of an observed credential. `unknown` is the only
// honest answer for a registry aggregate: `CredentialTypeItem.issuer` is a plain
// string in the projection representation and the contract explicitly does not
// assert that a bare Party is a DID or a URL.
export type IssuerKind = 'party' | 'text' | 'unknown'

export type CredentialTypeSuggestion = {
    // Issuer identifier exactly as observed or as the registry reported it.
    issuer: string
    issuerKind: IssuerKind
    requestedType: string
    // Routing copied from the observed credential, so a request derived from it reaches
    // the same registry admin and anchorers. The protocol has no issuer field, and the
    // registry aggregate carries no routing at all.
    registryAdmin: string
    anchorers: string[]
    source: 'observed' | 'registry'
}

export const suggestionKey = (suggestion: CredentialTypeSuggestion): string =>
    `${suggestion.issuer}|${suggestion.requestedType}`

const bySuggestion = (
    left: CredentialTypeSuggestion,
    right: CredentialTypeSuggestion
): number =>
    left.issuer.localeCompare(right.issuer) ||
    left.requestedType.localeCompare(right.requestedType)

// A party issuer gets the short party form, and a textual issuer is truncated only
// when it would overflow. An issuer of unknown kind is rendered verbatim: shortening
// it would imply a party structure the registry never asserted.
export function suggestionIssuerLabel(
    suggestion: CredentialTypeSuggestion,
    maxLength = 48
): string {
    if (suggestion.issuerKind === 'unknown') return suggestion.issuer
    if (suggestion.issuerKind === 'party')
        return shortPartyId(suggestion.issuer)
    return suggestion.issuer.length <= maxLength
        ? suggestion.issuer
        : `${suggestion.issuer.slice(0, maxLength)}…`
}

// Dedupes on issuer plus type. The first observation of a pair wins, so routing stays
// the one that was actually seen with it rather than a later merge of several.
export function observedTypeSuggestions(
    credentials: Credential[]
): CredentialTypeSuggestion[] {
    const suggestions = new Map<string, CredentialTypeSuggestion>()
    for (const credential of credentials) {
        const registryAdmin = credential.registration?.registryAdmin
        // Without a registry admin there is no routing to copy, and the demo request
        // template requires one, so an intrinsic-only credential cannot seed a request.
        if (!registryAdmin || credential.anchorers.length === 0) continue
        for (const type of credential.credentialTypes) {
            if (!type || type === BASE_CREDENTIAL_TYPE) continue
            const suggestion: CredentialTypeSuggestion = {
                issuer: credential.issuer.value,
                issuerKind:
                    credential.issuer.tag === 'W3C_VC_Identifier_Party'
                        ? 'party'
                        : 'text',
                requestedType: type,
                registryAdmin,
                anchorers: credential.anchorers,
                source: 'observed',
            }
            const key = suggestionKey(suggestion)
            if (!suggestions.has(key)) suggestions.set(key, suggestion)
        }
    }
    return [...suggestions.values()].sort(bySuggestion)
}

// One item of `CredentialTypeCollection` in the credential registry OpenAPI contract.
// The contract carries no registry admin and no anchorers here, so a registry entry
// can never supply routing; the `registryAdmin` query parameter is a filter over the
// aggregated records, not a property of the aggregate.
export type RegistryTypeEntry = {
    issuer: string
    credentialType: string
    firstObservedAt?: string
    lastObservedAt?: string
    credentialCount?: number
}

// A parsed `CredentialTypeCollection`. All four envelope fields are required by the
// contract, so an envelope that lacks any of them is not a collection at all.
export type RegistryTypePage = {
    items: RegistryTypeEntry[]
    page: number
    pageSize: number
    hasNext: boolean
}

// Contract limits: zero-based page, pageSize 1..100 defaulting to 50.
export const REGISTRY_DEFAULT_PAGE_SIZE = 50
export const REGISTRY_MAX_PAGE_SIZE = 100
// Local read bound, so a large or endlessly paging registry cannot stall the dialog.
export const REGISTRY_MAX_PAGES = 10
export const REGISTRY_MAX_ENTRIES = 500

const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null

const wholeNumber = (value: unknown, minimum: number): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= minimum
        ? value
        : null

const parseEntry = (raw: unknown): RegistryTypeEntry[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const item = raw as Record<string, unknown>
    const issuer = text(item.issuer)
    const credentialType = text(item.credentialType)
    // Only the pair identifies the item. The observation timestamps are required by
    // the contract but unused here, so they are carried when present and never
    // treated as a reason to drop an otherwise identifiable pair.
    if (!issuer || !credentialType) return []
    const firstObservedAt = text(item.firstObservedAt)
    const lastObservedAt = text(item.lastObservedAt)
    const credentialCount = wholeNumber(item.credentialCount, 1)
    return [
        {
            issuer,
            credentialType,
            ...(firstObservedAt ? { firstObservedAt } : {}),
            ...(lastObservedAt ? { lastObservedAt } : {}),
            ...(credentialCount === null ? {} : { credentialCount }),
        },
    ]
}

// Strict on the envelope and tolerant inside it: a response that is not a
// `CredentialTypeCollection` returns `null` so the caller can say so, while an
// individual unusable item is skipped. Deliberately no bare-array or
// `credentialTypes` wrapper form: no deployment of this contract emits one, so
// accepting them would only let a wrong-shaped response pass as a catalogue.
export function parseRegistryTypePage(value: unknown): RegistryTypePage | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const envelope = value as Record<string, unknown>
    if (!Array.isArray(envelope.items)) return null
    const page = wholeNumber(envelope.page, 0)
    const pageSize = wholeNumber(envelope.pageSize, 1)
    if (page === null || pageSize === null) return null
    if (pageSize > REGISTRY_MAX_PAGE_SIZE) return null
    if (typeof envelope.hasNext !== 'boolean') return null
    return {
        items: envelope.items.flatMap(parseEntry),
        page,
        pageSize,
        hasNext: envelope.hasNext,
    }
}

export type RegistryReadLimits = {
    pageSize: number
    maxPages: number
    maxEntries: number
}

export const registryReadLimits: RegistryReadLimits = {
    pageSize: REGISTRY_MAX_PAGE_SIZE,
    maxPages: REGISTRY_MAX_PAGES,
    maxEntries: REGISTRY_MAX_ENTRIES,
}

export type RegistryCatalogue = {
    entries: RegistryTypeEntry[]
    pagesRead: number
    // The read stopped at a local bound while the registry still reported more pages.
    truncated: boolean
    // A page was not a `CredentialTypeCollection`, so the read stopped there.
    malformed: boolean
}

// Reads a page at a time. `read` returns the decoded JSON body and may throw; the
// caller decides what a transport failure means.
export type RegistryPageReader = (
    page: number,
    pageSize: number
) => Promise<unknown>

// Walks pages while the registry says there are more, stopping at the local bounds.
// Pages are computed over the current view without a shared snapshot, so the same
// pair can appear on two pages; dedupe keeps the first occurrence. The result always
// states whether it is complete, because an incomplete catalogue presented as
// complete is worse than no catalogue.
export async function readRegistryCatalogue(
    read: RegistryPageReader,
    limits: RegistryReadLimits = registryReadLimits
): Promise<RegistryCatalogue> {
    const pageSize = Math.min(
        Math.max(1, Math.trunc(limits.pageSize)),
        REGISTRY_MAX_PAGE_SIZE
    )
    const maxPages = Math.max(1, Math.trunc(limits.maxPages))
    const maxEntries = Math.max(1, Math.trunc(limits.maxEntries))
    const entries = new Map<string, RegistryTypeEntry>()
    let pagesRead = 0
    for (let page = 0; page < maxPages; page += 1) {
        const parsed = parseRegistryTypePage(await read(page, pageSize))
        if (!parsed) {
            return {
                entries: [...entries.values()],
                pagesRead,
                truncated: false,
                malformed: true,
            }
        }
        pagesRead += 1
        for (const entry of parsed.items) {
            const key = `${entry.issuer}|${entry.credentialType}`
            if (!entries.has(key)) entries.set(key, entry)
        }
        const capped = entries.size >= maxEntries
        if (!parsed.hasNext || capped)
            return {
                entries: [...entries.values()].slice(0, maxEntries),
                pagesRead,
                truncated: parsed.hasNext && capped,
                malformed: false,
            }
    }
    // The page bound was reached and the last page still reported more.
    return {
        entries: [...entries.values()].slice(0, maxEntries),
        pagesRead,
        truncated: true,
        malformed: false,
    }
}

export type MergedSuggestions = {
    suggestions: CredentialTypeSuggestion[]
    // Registry pairs that were dropped because no routing is observable for their
    // issuer. Reported rather than hidden: the list shown is then a subset.
    unroutable: RegistryTypeEntry[]
}

// A registry response may name types the wallet has never observed. It carries no
// routing of its own, so routing is only available when the same issuer string also
// appears in an observed credential. Anything else cannot be turned into a request
// the ledger would accept, and is reported as dropped instead of being shown with
// invented routing.
export function mergeRegistryTypes(
    observed: CredentialTypeSuggestion[],
    entries: RegistryTypeEntry[]
): MergedSuggestions {
    const merged = new Map(
        observed.map((suggestion) => [suggestionKey(suggestion), suggestion])
    )
    const routingByIssuer = new Map(
        observed.map((suggestion) => [suggestion.issuer, suggestion])
    )
    const unroutable: RegistryTypeEntry[] = []
    for (const entry of entries) {
        // A request for the base type carries no information, so it is not offered.
        if (entry.credentialType === BASE_CREDENTIAL_TYPE) continue
        const routing = routingByIssuer.get(entry.issuer)
        if (!routing || !routing.anchorers.length) {
            unroutable.push(entry)
            continue
        }
        const suggestion: CredentialTypeSuggestion = {
            issuer: entry.issuer,
            // The kind is only known because this exact issuer string was also
            // observed in a credential; a registry aggregate alone never tells.
            issuerKind: routing.issuerKind,
            requestedType: entry.credentialType,
            registryAdmin: routing.registryAdmin,
            anchorers: routing.anchorers,
            source: 'registry',
        }
        const key = suggestionKey(suggestion)
        if (!merged.has(key)) merged.set(key, suggestion)
    }
    return { suggestions: [...merged.values()].sort(bySuggestion), unroutable }
}

export type CredentialTypesQuery = {
    issuer?: string
    page?: number
    pageSize?: number
}

export function credentialTypesApiUrl(
    baseUrl: string,
    query: CredentialTypesQuery = {}
): string {
    const base = new URL(baseUrl)
    if (!['http:', 'https:'].includes(base.protocol)) {
        throw new Error('Credential types API URL must use HTTP or HTTPS')
    }
    const url = new URL(
        'v1/credential-types',
        `${base.href.replace(/\/+$/, '')}/`
    )
    if (query.issuer) url.searchParams.set('issuer', query.issuer)
    // Omitted parameters keep the contract defaults: page 0 and the registry's own
    // default page size.
    if (query.page !== undefined)
        url.searchParams.set(
            'page',
            String(Math.max(0, Math.trunc(query.page)))
        )
    if (query.pageSize !== undefined)
        url.searchParams.set(
            'pageSize',
            String(
                Math.min(
                    Math.max(1, Math.trunc(query.pageSize)),
                    REGISTRY_MAX_PAGE_SIZE
                )
            )
        )
    return url.href
}
