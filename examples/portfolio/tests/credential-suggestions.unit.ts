import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
    credentialTypesApiUrl,
    mergeRegistryTypes,
    observedTypeSuggestions,
    parseRegistryTypePage,
    readRegistryCatalogue,
    registryReadLimits,
    suggestionIssuerLabel,
    suggestionKey,
    type RegistryTypeEntry,
} from '../src/services/credential-suggestions'
import type { Credential } from '../src/services/credentials'

const ISSUER = 'DemoIssuer::ns'
const ADMIN = 'CredentialDemoRegistryAdmin::ns'

const credential = (overrides: Partial<Credential> = {}): Credential => ({
    contractId: 'c1',
    id: null,
    credentialTypes: ['VerifiableCredential', 'membership'],
    issuer: { tag: 'W3C_VC_Identifier_Party', value: ISSUER },
    validFrom: null,
    validUntil: null,
    subjects: [],
    credentialSchema: [],
    securing: null,
    holders: ['DemoHolderA::ns'],
    anchorers: [ISSUER],
    registration: {
        registryAdmin: ADMIN,
        registeredAt: '2026-01-01T00:00:00Z',
        expiresAt: null,
        meta: {},
    },
    ...overrides,
})

test('suggestions dedupe on issuer plus type and drop VerifiableCredential', () => {
    const suggestions = observedTypeSuggestions([
        credential(),
        credential({ contractId: 'c2' }),
        credential({
            contractId: 'c3',
            credentialTypes: ['VerifiableCredential', 'training'],
        }),
        credential({
            contractId: 'c4',
            credentialTypes: ['VerifiableCredential'],
        }),
    ])
    assert.deepEqual(
        suggestions.map((entry) => entry.requestedType),
        ['membership', 'training']
    )
    assert.ok(suggestions.every((entry) => entry.source === 'observed'))
})

test('a suggestion carries the anchorers and registry admin actually observed with it', () => {
    const [suggestion] = observedTypeSuggestions([
        credential({
            credentialTypes: ['VerifiableCredential', 'eligibility'],
            anchorers: [ISSUER, 'SecondAnchorer::ns'],
            registration: {
                registryAdmin: 'OtherAdmin::ns',
                registeredAt: '2026-01-01T00:00:00Z',
                expiresAt: null,
                meta: {},
            },
        }),
    ])
    assert.deepEqual(suggestion, {
        issuer: ISSUER,
        issuerKind: 'party',
        requestedType: 'eligibility',
        registryAdmin: 'OtherAdmin::ns',
        anchorers: [ISSUER, 'SecondAnchorer::ns'],
        source: 'observed',
    })
    assert.equal(suggestionKey(suggestion), `${ISSUER}|eligibility`)
})

test('the first observation of a pair keeps its routing rather than merging later ones', () => {
    const suggestions = observedTypeSuggestions([
        credential({ anchorers: [ISSUER] }),
        credential({
            contractId: 'c2',
            anchorers: [ISSUER, 'Late::ns'],
            registration: {
                registryAdmin: 'LateAdmin::ns',
                registeredAt: '2026-02-01T00:00:00Z',
                expiresAt: null,
                meta: {},
            },
        }),
    ])
    assert.equal(suggestions.length, 1)
    assert.deepEqual(suggestions[0].anchorers, [ISSUER])
    assert.equal(suggestions[0].registryAdmin, ADMIN)
})

test('an unroutable credential cannot seed a request', () => {
    // No registration means no registry admin, and the request template requires one.
    assert.deepEqual(
        observedTypeSuggestions([credential({ registration: null })]),
        []
    )
    assert.deepEqual(
        observedTypeSuggestions([credential({ anchorers: [] })]),
        []
    )
    assert.deepEqual(observedTypeSuggestions([]), [])
})

test('suggestions sort by issuer then type so the list is stable across reads', () => {
    const suggestions = observedTypeSuggestions([
        credential({ contractId: 'c1', credentialTypes: ['training'] }),
        credential({ contractId: 'c2', credentialTypes: ['attestation'] }),
        credential({
            contractId: 'c3',
            credentialTypes: ['membership'],
            issuer: { tag: 'W3C_VC_Identifier', value: 'did:example:a' },
        }),
    ])
    assert.deepEqual(
        suggestions.map((entry) => `${entry.issuer}|${entry.requestedType}`),
        [
            `${ISSUER}|attestation`,
            `${ISSUER}|training`,
            'did:example:a|membership',
        ]
    )
})

// A `CredentialTypeItem` as the credential registry OpenAPI contract defines it:
// the pair plus its required observation window, and an optional count.
const item = (
    issuer: string,
    credentialType: string,
    extra: Record<string, unknown> = {}
) => ({
    issuer,
    credentialType,
    firstObservedAt: '2026-01-01T00:00:00Z',
    lastObservedAt: '2026-02-01T00:00:00Z',
    ...extra,
})

const page = (
    items: unknown[],
    pageNumber: number,
    hasNext: boolean,
    pageSize = 100
) => ({ items, page: pageNumber, pageSize, hasNext })

test('a CredentialTypeCollection page parses into the pair plus its observation window', () => {
    assert.deepEqual(
        parseRegistryTypePage(
            page(
                [item(ISSUER, 'training', { credentialCount: 3 })],
                0,
                true,
                50
            )
        ),
        {
            items: [
                {
                    issuer: ISSUER,
                    credentialType: 'training',
                    firstObservedAt: '2026-01-01T00:00:00Z',
                    lastObservedAt: '2026-02-01T00:00:00Z',
                    credentialCount: 3,
                },
            ],
            page: 0,
            pageSize: 50,
            hasNext: true,
        }
    )
})

test('the base type is kept by the parser because the contract returns it unmodified', () => {
    // The endpoint aggregates `credentialTypes` entries including VerifiableCredential;
    // dropping it is a suggestion decision, not a parsing one.
    const parsed = parseRegistryTypePage(
        page([item(ISSUER, 'VerifiableCredential')], 0, false)
    )
    assert.equal(parsed?.items.length, 1)
    const { suggestions } = mergeRegistryTypes(
        observedTypeSuggestions([credential()]),
        parsed?.items ?? []
    )
    assert.ok(
        suggestions.every(
            (entry) => entry.requestedType !== 'VerifiableCredential'
        )
    )
})

test('a body that is not a CredentialTypeCollection is rejected whole, not partly read', () => {
    assert.equal(parseRegistryTypePage(null), null)
    assert.equal(parseRegistryTypePage('nope'), null)
    assert.equal(parseRegistryTypePage({}), null)
    // A bare array and the older `credentialTypes` wrapper are not the contract shape.
    assert.equal(parseRegistryTypePage([item(ISSUER, 'training')]), null)
    assert.equal(
        parseRegistryTypePage({ credentialTypes: [item(ISSUER, 'training')] }),
        null
    )
    // Each envelope field is required, and pageSize is bounded by the contract.
    assert.equal(
        parseRegistryTypePage({ items: [], pageSize: 50, hasNext: false }),
        null
    )
    assert.equal(
        parseRegistryTypePage({ items: [], page: 0, hasNext: false }),
        null
    )
    assert.equal(
        parseRegistryTypePage({ items: [], page: 0, pageSize: 50 }),
        null
    )
    assert.equal(parseRegistryTypePage(page([], -1, false)), null)
    assert.equal(parseRegistryTypePage(page([], 0, false, 0)), null)
    assert.equal(parseRegistryTypePage(page([], 0, false, 101)), null)
    assert.equal(
        parseRegistryTypePage({
            items: [],
            page: 0,
            pageSize: 50,
            hasNext: 'yes',
        }),
        null
    )
})

test('an unusable item is skipped while the rest of a valid page is kept', () => {
    const parsed = parseRegistryTypePage(
        page(
            [
                null,
                'string',
                [],
                { issuer: ISSUER },
                { credentialType: 'training' },
                { issuer: '  ', credentialType: 'training' },
                // Required by the contract but unused here, so their absence does not
                // discard an otherwise identifiable pair.
                { issuer: ISSUER, credentialType: 'membership' },
                item(ISSUER, 'training', { credentialCount: 0 }),
            ],
            0,
            false
        )
    )
    assert.deepEqual(parsed?.items, [
        { issuer: ISSUER, credentialType: 'membership' },
        {
            issuer: ISSUER,
            credentialType: 'training',
            firstObservedAt: '2026-01-01T00:00:00Z',
            lastObservedAt: '2026-02-01T00:00:00Z',
        },
    ])
})

test('the catalogue read follows hasNext with zero-based pages and dedupes repeats', async () => {
    const asked: Array<[number, number]> = []
    const result = await readRegistryCatalogue(async (pageNumber, pageSize) => {
        asked.push([pageNumber, pageSize])
        return pageNumber === 0
            ? page([item(ISSUER, 'training')], 0, true)
            : // Pages are computed without a shared snapshot, so a pair can repeat.
              page(
                  [item(ISSUER, 'training'), item(ISSUER, 'membership')],
                  1,
                  false
              )
    })
    assert.deepEqual(asked, [
        [0, registryReadLimits.pageSize],
        [1, registryReadLimits.pageSize],
    ])
    assert.deepEqual(
        result.entries.map((entry) => entry.credentialType),
        ['training', 'membership']
    )
    assert.deepEqual(
        {
            pagesRead: result.pagesRead,
            truncated: result.truncated,
            malformed: result.malformed,
        },
        { pagesRead: 2, truncated: false, malformed: false }
    )
})

test('the page bound stops the read and reports it as truncated', async () => {
    let reads = 0
    const result = await readRegistryCatalogue(
        async (pageNumber) => {
            reads += 1
            return page([item(ISSUER, `type-${pageNumber}`)], pageNumber, true)
        },
        { ...registryReadLimits, maxPages: 3 }
    )
    assert.equal(reads, 3)
    assert.equal(result.pagesRead, 3)
    assert.equal(result.entries.length, 3)
    assert.equal(result.truncated, true)
    assert.equal(result.malformed, false)
})

test('the entry cap stops the read and reports it as truncated', async () => {
    const result = await readRegistryCatalogue(
        async (pageNumber) =>
            page(
                [
                    item(ISSUER, `a-${pageNumber}`),
                    item(ISSUER, `b-${pageNumber}`),
                ],
                pageNumber,
                true
            ),
        { ...registryReadLimits, maxEntries: 3 }
    )
    assert.equal(result.entries.length, 3)
    assert.equal(result.truncated, true)
    assert.equal(result.pagesRead, 2)
})

test('a full read that exactly reaches the cap on a last page is not truncated', async () => {
    const result = await readRegistryCatalogue(
        async () => page([item(ISSUER, 'a'), item(ISSUER, 'b')], 0, false),
        { ...registryReadLimits, maxEntries: 2 }
    )
    assert.deepEqual(
        result.entries.map((entry) => entry.credentialType),
        ['a', 'b']
    )
    assert.equal(result.truncated, false)
})

test('a malformed page stops the read, keeps earlier pages and is reported', async () => {
    const result = await readRegistryCatalogue(async (pageNumber) =>
        pageNumber === 0
            ? page([item(ISSUER, 'training')], 0, true)
            : { credentialTypes: [item(ISSUER, 'membership')] }
    )
    assert.deepEqual(
        result.entries.map((entry) => entry.credentialType),
        ['training']
    )
    assert.equal(result.pagesRead, 1)
    assert.equal(result.malformed, true)
    assert.equal(result.truncated, false)
})

test('a transport failure propagates so the caller can call the catalogue unavailable', async () => {
    await assert.rejects(
        readRegistryCatalogue(async () => {
            throw new Error('HTTP 404')
        }),
        /HTTP 404/
    )
})

test('a mocked fetch of the real contract shape yields routable suggestions only', async () => {
    const bodies: Record<string, unknown> = {
        'https://registry.example/v1/credential-types?page=0&pageSize=100':
            page(
                [
                    item(ISSUER, 'training'),
                    item('did:example:other', 'training'),
                ],
                0,
                false
            ),
    }
    const result = await readRegistryCatalogue(async (pageNumber, pageSize) => {
        const url = credentialTypesApiUrl('https://registry.example', {
            page: pageNumber,
            pageSize,
        })
        const body = bodies[url]
        if (body === undefined) throw new Error(`HTTP 404 for ${url}`)
        return body
    })
    const { suggestions, unroutable } = mergeRegistryTypes(
        observedTypeSuggestions([credential()]),
        result.entries
    )
    assert.deepEqual(
        suggestions.map(
            (entry) => `${entry.issuer}|${entry.requestedType}|${entry.source}`
        ),
        [`${ISSUER}|membership|observed`, `${ISSUER}|training|registry`]
    )
    // The aggregate names no routing, and nothing visible here shares this issuer.
    assert.deepEqual(
        unroutable.map((entry) => entry.issuer),
        ['did:example:other']
    )
})

test('registry entries reuse observed routing for the same issuer and never shadow it', () => {
    const observed = observedTypeSuggestions([credential()])
    const entries: RegistryTypeEntry[] = [
        // Already observed, so the observed entry wins and stays sourced as observed.
        { issuer: ISSUER, credentialType: 'membership' },
        { issuer: ISSUER, credentialType: 'training' },
        // The aggregate carries no routing at all, so an unobserved issuer is unroutable.
        { issuer: 'did:example:other', credentialType: 'training' },
    ]
    const { suggestions, unroutable } = mergeRegistryTypes(observed, entries)
    assert.deepEqual(
        suggestions.map((entry) => ({
            issuer: entry.issuer,
            type: entry.requestedType,
            admin: entry.registryAdmin,
            anchorers: entry.anchorers,
            kind: entry.issuerKind,
            source: entry.source,
        })),
        [
            {
                issuer: ISSUER,
                type: 'membership',
                admin: ADMIN,
                anchorers: [ISSUER],
                kind: 'party',
                source: 'observed',
            },
            {
                issuer: ISSUER,
                type: 'training',
                admin: ADMIN,
                anchorers: [ISSUER],
                // Known only because the same issuer string was also observed.
                kind: 'party',
                source: 'registry',
            },
        ]
    )
    assert.deepEqual(unroutable, [
        { issuer: 'did:example:other', credentialType: 'training' },
    ])
})

test('an issuer of unknown kind is displayed verbatim without party or DID shortening', () => {
    const long = `DemoIssuer::${'a'.repeat(60)}`
    assert.equal(
        suggestionIssuerLabel({
            issuer: long,
            issuerKind: 'unknown',
            requestedType: 'training',
            registryAdmin: ADMIN,
            anchorers: [ISSUER],
            source: 'registry',
        }),
        long
    )
    assert.equal(
        suggestionIssuerLabel({
            issuer: long,
            issuerKind: 'party',
            requestedType: 'training',
            registryAdmin: ADMIN,
            anchorers: [ISSUER],
            source: 'observed',
        }),
        'DemoIssuer::aaaaaa…'
    )
})

test('credential types API URL keeps the base path and only sets supplied parameters', () => {
    assert.equal(
        credentialTypesApiUrl('http://localhost:7575'),
        'http://localhost:7575/v1/credential-types'
    )
    assert.equal(
        credentialTypesApiUrl('https://registry.example/api/'),
        'https://registry.example/api/v1/credential-types'
    )
    assert.equal(
        credentialTypesApiUrl('https://registry.example', { issuer: ISSUER }),
        'https://registry.example/v1/credential-types?issuer=DemoIssuer%3A%3Ans'
    )
    // Zero-based page, and pageSize clamped to the contract maximum of 100.
    assert.equal(
        credentialTypesApiUrl('https://registry.example', {
            page: 0,
            pageSize: 50,
        }),
        'https://registry.example/v1/credential-types?page=0&pageSize=50'
    )
    assert.equal(
        credentialTypesApiUrl('https://registry.example', {
            page: -4,
            pageSize: 1000,
        }),
        'https://registry.example/v1/credential-types?page=0&pageSize=100'
    )
    assert.throws(
        () => credentialTypesApiUrl('file:///etc/passwd'),
        /must use HTTP or HTTPS/
    )
})
