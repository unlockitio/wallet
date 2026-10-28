// Pure presentation logic for the credential list: validity, filtering, sorting,
// pagination and claim rendering. Kept free of React and of ledger access so the
// same functions can be exercised against a captured ACS response.
import {
    damlList,
    renderAnyValue,
    type Credential,
    type Identifier,
} from './credentials'

// Validity is the credential's own `validFrom`/`validUntil` window. It is
// deliberately distinct from the registry record's retention `expiresAt`.
export type ValidityStatus = 'Valid' | 'Expired' | 'Not yet valid'
export type RegistrationStatus = 'Registered' | 'Intrinsic-only'
export type CredentialSort = 'registered-desc' | 'type-asc' | 'issuer-asc'

export const VALIDITY_STATUSES: readonly ValidityStatus[] = [
    'Valid',
    'Expired',
    'Not yet valid',
]
export const REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
    'Registered',
    'Intrinsic-only',
]
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50]
export const DEFAULT_PAGE_SIZE = 10

export type CredentialFilters = {
    search: string
    types: string[]
    issuer: string
    validity: ValidityStatus[]
    registration: RegistrationStatus[]
}

export const emptyCredentialFilters: CredentialFilters = {
    search: '',
    types: [],
    issuer: '',
    validity: [],
    registration: [],
}

export const hasActiveFilters = (filters: CredentialFilters): boolean =>
    filters.search.trim() !== '' ||
    filters.types.length > 0 ||
    filters.issuer !== '' ||
    filters.validity.length > 0 ||
    filters.registration.length > 0

const time = (value: string | null): number | null => {
    if (value === null) return null
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
}

// An unparseable or absent bound is an open bound: it never makes a credential
// expired or pending, because the ledger reported no such limit.
export function validityStatus(
    credential: Credential,
    now: number
): ValidityStatus {
    const from = time(credential.validFrom)
    const until = time(credential.validUntil)
    if (until !== null && until <= now) return 'Expired'
    if (from !== null && from > now) return 'Not yet valid'
    return 'Valid'
}

export const registrationStatus = (
    credential: Credential
): RegistrationStatus =>
    credential.registration ? 'Registered' : 'Intrinsic-only'

// `VerifiableCredential` is on every W3C credential, so it carries no information
// in a list row. The first more specific type is the one worth showing.
export function primaryCredentialType(credential: Credential): string {
    const specific = credential.credentialTypes.find(
        (type) => type !== 'VerifiableCredential'
    )
    return specific ?? credential.credentialTypes[0] ?? 'Credential'
}

export const issuerOptionKey = (issuer: Identifier): string =>
    `${issuer.tag}|${issuer.value}`

export function credentialTypeOptions(credentials: Credential[]): string[] {
    const types = new Set<string>()
    for (const credential of credentials)
        for (const type of credential.credentialTypes) types.add(type)
    return [...types].sort((left, right) => left.localeCompare(right))
}

export function credentialIssuerOptions(
    credentials: Credential[]
): Identifier[] {
    const issuers = new Map<string, Identifier>()
    for (const credential of credentials)
        issuers.set(issuerOptionKey(credential.issuer), credential.issuer)
    return [...issuers.values()].sort((left, right) =>
        left.value.localeCompare(right.value)
    )
}

const claimSearchText = (credential: Credential): string[] =>
    credential.subjects.flatMap((subject) =>
        Object.entries(subject.claims).flatMap(([key, value]) => [
            key,
            renderAnyValue(value),
        ])
    )

// Searchable fields: credential id, types, issuer, subject ids and claim values.
// Contract ids and party namespaces are not searched: they add noise without
// helping a holder recognise a credential.
const searchHaystack = (credential: Credential): string =>
    [
        credential.id ?? '',
        ...credential.credentialTypes,
        credential.issuer.value,
        ...credential.subjects.map((subject) => subject.id?.value ?? ''),
        ...claimSearchText(credential),
    ]
        .join('\u0000')
        .toLowerCase()

export function matchesCredentialFilters(
    credential: Credential,
    filters: CredentialFilters,
    now: number
): boolean {
    const search = filters.search.trim().toLowerCase()
    if (search !== '' && !searchHaystack(credential).includes(search))
        return false
    if (
        filters.types.length > 0 &&
        !filters.types.some((type) => credential.credentialTypes.includes(type))
    )
        return false
    if (
        filters.issuer !== '' &&
        issuerOptionKey(credential.issuer) !== filters.issuer
    )
        return false
    if (
        filters.validity.length > 0 &&
        !filters.validity.includes(validityStatus(credential, now))
    )
        return false
    if (
        filters.registration.length > 0 &&
        !filters.registration.includes(registrationStatus(credential))
    )
        return false
    return true
}

export const filterCredentials = (
    credentials: Credential[],
    filters: CredentialFilters,
    now: number
): Credential[] =>
    credentials.filter((credential) =>
        matchesCredentialFilters(credential, filters, now)
    )

// Every comparison ends in contract id so paging over a filtered list is stable:
// equal registration timestamps or equal types must not reorder between renders.
const byContractId = (left: Credential, right: Credential): number =>
    left.contractId.localeCompare(right.contractId)

const registeredAtValue = (credential: Credential): number | null =>
    time(credential.registration?.registeredAt ?? null)

const compareRegisteredDesc = (left: Credential, right: Credential): number => {
    const leftAt = registeredAtValue(left)
    const rightAt = registeredAtValue(right)
    // Intrinsic credentials have no registration timestamp, so they sort last
    // rather than being treated as the oldest.
    if (leftAt === null && rightAt === null) return byContractId(left, right)
    if (leftAt === null) return 1
    if (rightAt === null) return -1
    return rightAt - leftAt || byContractId(left, right)
}

const COMPARATORS: Record<
    CredentialSort,
    (left: Credential, right: Credential) => number
> = {
    'registered-desc': compareRegisteredDesc,
    'type-asc': (left, right) =>
        primaryCredentialType(left).localeCompare(
            primaryCredentialType(right)
        ) || byContractId(left, right),
    'issuer-asc': (left, right) =>
        left.issuer.value.localeCompare(right.issuer.value) ||
        byContractId(left, right),
}

export const sortCredentials = (
    credentials: Credential[],
    sort: CredentialSort
): Credential[] => [...credentials].sort(COMPARATORS[sort])

export type Page<Item> = {
    items: Item[]
    page: number
    pageSize: number
    total: number
    pageCount: number
    // 1-based inclusive display range; both are 0 for an empty result.
    from: number
    to: number
}

// Clamps the requested page instead of returning an empty slice, so a page index
// left over from a wider filter still shows rows.
export function paginate<Item>(
    items: Item[],
    page: number,
    pageSize: number
): Page<Item> {
    const size = Math.max(1, Math.trunc(pageSize))
    const total = items.length
    const pageCount = Math.max(1, Math.ceil(total / size))
    const current = Math.min(Math.max(0, Math.trunc(page)), pageCount - 1)
    const start = current * size
    const slice = items.slice(start, start + size)
    return {
        items: slice,
        page: current,
        pageSize: size,
        total,
        pageCount,
        from: total === 0 ? 0 : start + 1,
        to: total === 0 ? 0 : start + slice.length,
    }
}

export const pageRangeLabel = <Item>({
    from,
    to,
    total,
}: Page<Item>): string => (total === 0 ? '0 of 0' : `${from}–${to} of ${total}`)

export type CredentialPage = {
    page: Page<Credential>
    matched: number
    total: number
}

export function credentialPage(
    credentials: Credential[],
    filters: CredentialFilters,
    sort: CredentialSort,
    page: number,
    pageSize: number,
    now: number
): CredentialPage {
    const matched = sortCredentials(
        filterCredentials(credentials, filters, now),
        sort
    )
    return {
        page: paginate(matched, page, pageSize),
        matched: matched.length,
        total: credentials.length,
    }
}

// A claim value is an `AnyValue`: either a scalar or a nested map or list. Rows are
// flattened with a depth so a table can indent nested entries without recursion in
// the component tree.
export type ClaimRow = {
    path: string
    label: string
    depth: number
    value: string | null
}

const anyValueContent = (
    value: unknown
): { tag: string; content: unknown } | null => {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return null
    const object = value as Record<string, unknown>
    return typeof object.tag === 'string' && object.tag.startsWith('AV_')
        ? { tag: object.tag, content: object.value }
        : null
}

function claimRowsFor(
    label: string,
    path: string,
    value: unknown,
    depth: number
): ClaimRow[] {
    const anyValue = anyValueContent(value)
    if (anyValue?.tag === 'AV_Map') {
        const entries = Object.entries(
            (anyValue.content as Record<string, unknown> | null) ?? {}
        )
        return [
            { path, label, depth, value: null },
            ...entries.flatMap(([key, item]) =>
                claimRowsFor(key, `${path}.${key}`, item, depth + 1)
            ),
        ]
    }
    if (anyValue?.tag === 'AV_List') {
        const items = damlList(anyValue.content)
        return [
            { path, label, depth, value: null },
            ...items.flatMap((item, index) =>
                claimRowsFor(`[${index}]`, `${path}.${index}`, item, depth + 1)
            ),
        ]
    }
    return [{ path, label, depth, value: renderAnyValue(value) }]
}

export const claimRows = (claims: Record<string, unknown>): ClaimRow[] =>
    Object.entries(claims)
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([key, value]) => claimRowsFor(key, key, value, 0))

// `Party::namespace` is too long for a row. The hint names the party when the
// wallet knows it; otherwise the local part plus a truncated namespace is shown.
export function shortPartyId(partyId: string, namespaceLength = 6): string {
    const separator = partyId.indexOf('::')
    if (separator === -1) return partyId
    const local = partyId.slice(0, separator)
    const namespace = partyId.slice(separator + 2)
    return namespace.length <= namespaceLength
        ? partyId
        : `${local}::${namespace.slice(0, namespaceLength)}…`
}

export const isPartyIssuer = (issuer: Identifier): boolean =>
    issuer.tag === 'W3C_VC_Identifier_Party'

// A party issuer gets the short party form; a textual issuer (a DID or URL) is
// shown as-is, truncated only when it would overflow a row.
export function issuerShortLabel(issuer: Identifier, maxLength = 32): string {
    if (isPartyIssuer(issuer)) return shortPartyId(issuer.value)
    return issuer.value.length <= maxLength
        ? issuer.value
        : `${issuer.value.slice(0, maxLength)}…`
}

export function subjectShortLabel(
    credential: Credential,
    maxLength = 28
): string {
    const ids = credential.subjects.flatMap(
        (subject) => subject.id?.value ?? []
    )
    if (ids.length === 0) return 'No subject identifier'
    const first =
        ids[0].length <= maxLength ? ids[0] : `${ids[0].slice(0, maxLength)}…`
    return ids.length === 1 ? first : `${first} +${ids.length - 1}`
}

export function securingSummary(credential: Credential): string {
    const securing = credential.securing
    if (!securing) return 'None'
    const details = [securing.mediaType, ...securing.cryptosuites].filter(
        (detail): detail is string => !!detail
    )
    return details.length === 0
        ? securing.mechanism
        : `${securing.mechanism} (${details.join(', ')})`
}
