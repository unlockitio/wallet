import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { Credential } from '../src/services/credentials'
import {
    claimRows,
    credentialIssuerOptions,
    credentialPage,
    credentialTypeOptions,
    emptyCredentialFilters,
    filterCredentials,
    hasActiveFilters,
    issuerOptionKey,
    issuerShortLabel,
    pageRangeLabel,
    paginate,
    primaryCredentialType,
    registrationStatus,
    securingSummary,
    shortPartyId,
    sortCredentials,
    subjectShortLabel,
    validityStatus,
} from '../src/services/credential-view'

const NOW = Date.parse('2026-10-28T12:00:00Z')
const party = (name: string) => `${name}::1220abcdef0123456789`

const credential = (overrides: Partial<Credential> = {}): Credential => ({
    contractId: 'c1',
    id: 'urn:demo:credential:000',
    credentialTypes: ['VerifiableCredential', 'membership'],
    issuer: { tag: 'W3C_VC_Identifier_Party', value: party('DemoIssuer') },
    validFrom: '2026-10-01T00:00:00Z',
    validUntil: '2027-04-25T00:00:00Z',
    subjects: [
        {
            id: { tag: 'W3C_VC_Identifier', value: 'urn:demo:subject:7' },
            claims: {
                'demo.example/category': {
                    tag: 'AV_Text',
                    value: 'membership',
                },
            },
        },
    ],
    credentialSchema: [],
    securing: null,
    holders: [party('DemoHolderA')],
    anchorers: [party('DemoIssuer')],
    registration: {
        registryAdmin: party('CredentialDemoRegistryAdmin'),
        registeredAt: '2026-10-27T23:57:59.508235Z',
        expiresAt: null,
        meta: {},
    },
    ...overrides,
})

test('validity reflects the credential window and treats absent bounds as open', () => {
    assert.equal(validityStatus(credential(), NOW), 'Valid')
    assert.equal(
        validityStatus(credential({ validUntil: '2026-10-27T00:00:00Z' }), NOW),
        'Expired'
    )
    assert.equal(
        validityStatus(credential({ validFrom: '2026-11-01T00:00:00Z' }), NOW),
        'Not yet valid'
    )
    assert.equal(
        validityStatus(credential({ validFrom: null, validUntil: null }), NOW),
        'Valid'
    )
    // An unparseable bound is not evidence of expiry.
    assert.equal(
        validityStatus(credential({ validUntil: 'not-a-date' }), NOW),
        'Valid'
    )
})

test('registry retention expiry does not make a credential expired', () => {
    const retired = credential({
        validUntil: '2027-04-25T00:00:00Z',
        registration: {
            registryAdmin: party('CredentialDemoRegistryAdmin'),
            registeredAt: '2026-10-27T23:57:59.508235Z',
            expiresAt: '2026-10-01T00:00:00Z',
            meta: {},
        },
    })
    assert.equal(validityStatus(retired, NOW), 'Valid')
    assert.equal(registrationStatus(retired), 'Registered')
    assert.equal(
        registrationStatus(credential({ registration: null })),
        'Intrinsic-only'
    )
})

test('primary type prefers a specific type over VerifiableCredential', () => {
    assert.equal(primaryCredentialType(credential()), 'membership')
    assert.equal(
        primaryCredentialType(
            credential({ credentialTypes: ['VerifiableCredential'] })
        ),
        'VerifiableCredential'
    )
    assert.equal(
        primaryCredentialType(credential({ credentialTypes: [] })),
        'Credential'
    )
})

test('filter options come from the loaded data, deduplicated and sorted', () => {
    const credentials = [
        credential({
            contractId: 'a',
            credentialTypes: ['VerifiableCredential', 'training'],
        }),
        credential({
            contractId: 'b',
            credentialTypes: ['VerifiableCredential', 'membership'],
        }),
        credential({
            contractId: 'c',
            credentialTypes: ['PartyProfile'],
            issuer: {
                tag: 'W3C_VC_Identifier',
                value: 'https://external.example/issuer',
            },
        }),
    ]
    // Locale order, so the list reads alphabetically regardless of type casing.
    assert.deepEqual(credentialTypeOptions(credentials), [
        'membership',
        'PartyProfile',
        'training',
        'VerifiableCredential',
    ])
    assert.deepEqual(
        credentialIssuerOptions(credentials).map((issuer) => issuer.value),
        [party('DemoIssuer'), 'https://external.example/issuer']
    )
})

test('search covers id, type, issuer, subject id and claim values', () => {
    const credentials = [credential()]
    const find = (search: string) =>
        filterCredentials(
            credentials,
            { ...emptyCredentialFilters, search },
            NOW
        ).length

    assert.equal(find('credential:000'), 1)
    assert.equal(find('MEMBERSHIP'), 1)
    assert.equal(find('DemoIssuer'), 1)
    assert.equal(find('urn:demo:subject:7'), 1)
    assert.equal(find('demo.example/category'), 1)
    assert.equal(find('nothing-matches'), 0)
    // Whitespace-only search is not a filter.
    assert.equal(find('   '), 1)
    assert.equal(
        hasActiveFilters({ ...emptyCredentialFilters, search: '  ' }),
        false
    )
    assert.equal(
        hasActiveFilters({ ...emptyCredentialFilters, search: 'a' }),
        true
    )
})

test('type, issuer, validity and registration filters combine as a conjunction', () => {
    const credentials = [
        credential({
            contractId: 'a',
            credentialTypes: ['VerifiableCredential', 'membership'],
        }),
        credential({
            contractId: 'b',
            credentialTypes: ['VerifiableCredential', 'training'],
            validUntil: '2026-01-01T00:00:00Z',
        }),
        credential({
            contractId: 'c',
            credentialTypes: ['VerifiableCredential', 'membership'],
            registration: null,
            issuer: {
                tag: 'W3C_VC_Identifier',
                value: 'https://external.example/issuer',
            },
        }),
    ]
    const ids = (filters: Parameters<typeof filterCredentials>[1]) =>
        filterCredentials(credentials, filters, NOW).map(
            (item) => item.contractId
        )

    assert.deepEqual(
        ids({ ...emptyCredentialFilters, types: ['membership'] }),
        ['a', 'c']
    )
    assert.deepEqual(
        ids({ ...emptyCredentialFilters, validity: ['Expired'] }),
        ['b']
    )
    assert.deepEqual(
        ids({ ...emptyCredentialFilters, registration: ['Intrinsic-only'] }),
        ['c']
    )
    assert.deepEqual(
        ids({
            ...emptyCredentialFilters,
            issuer: issuerOptionKey({
                tag: 'W3C_VC_Identifier_Party',
                value: party('DemoIssuer'),
            }),
        }),
        ['a', 'b']
    )
    // Multi-select type is a union, intersected with the other filters.
    assert.deepEqual(
        ids({
            ...emptyCredentialFilters,
            types: ['membership', 'training'],
            registration: ['Registered'],
        }),
        ['a', 'b']
    )
    assert.deepEqual(
        ids({
            ...emptyCredentialFilters,
            types: ['membership'],
            validity: ['Expired'],
        }),
        []
    )
})

test('sorting is total: equal keys tie-break by contract id', () => {
    const credentials = [
        credential({
            contractId: 'c2',
            credentialTypes: ['VerifiableCredential', 'training'],
        }),
        credential({
            contractId: 'c1',
            credentialTypes: ['VerifiableCredential', 'training'],
        }),
        credential({
            contractId: 'c3',
            credentialTypes: ['VerifiableCredential', 'attestation'],
            registration: {
                registryAdmin: party('CredentialDemoRegistryAdmin'),
                registeredAt: '2026-10-28T10:00:00Z',
                expiresAt: null,
                meta: {},
            },
        }),
    ]
    assert.deepEqual(
        sortCredentials(credentials, 'registered-desc').map(
            (item) => item.contractId
        ),
        ['c3', 'c1', 'c2']
    )
    assert.deepEqual(
        sortCredentials(credentials, 'type-asc').map((item) => item.contractId),
        ['c3', 'c1', 'c2']
    )
    // Sorting does not mutate the input.
    assert.deepEqual(
        credentials.map((item) => item.contractId),
        ['c2', 'c1', 'c3']
    )
})

test('intrinsic credentials sort after registered ones instead of counting as oldest', () => {
    const credentials = [
        credential({ contractId: 'intrinsic', registration: null }),
        credential({ contractId: 'registered' }),
    ]
    assert.deepEqual(
        sortCredentials(credentials, 'registered-desc').map(
            (item) => item.contractId
        ),
        ['registered', 'intrinsic']
    )
})

test('issuer sort orders by issuer value with a contract id tie-break', () => {
    const credentials = [
        credential({
            contractId: 'b',
            issuer: { tag: 'W3C_VC_Identifier', value: 'zz' },
        }),
        credential({
            contractId: 'a',
            issuer: { tag: 'W3C_VC_Identifier', value: 'zz' },
        }),
        credential({
            contractId: 'c',
            issuer: { tag: 'W3C_VC_Identifier', value: 'aa' },
        }),
    ]
    assert.deepEqual(
        sortCredentials(credentials, 'issuer-asc').map(
            (item) => item.contractId
        ),
        ['c', 'a', 'b']
    )
})

test('pagination slices with a 1-based inclusive range and clamps the page', () => {
    const items = Array.from({ length: 365 }, (_, index) => index)

    const first = paginate(items, 0, 10)
    assert.deepEqual(first.items, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    assert.equal(first.pageCount, 37)
    assert.equal(pageRangeLabel(first), '1–10 of 365')

    const last = paginate(items, 36, 10)
    assert.deepEqual(last.items, [360, 361, 362, 363, 364])
    assert.equal(pageRangeLabel(last), '361–365 of 365')

    // A page index beyond the end clamps to the last page rather than showing nothing.
    const clamped = paginate(items, 99, 10)
    assert.equal(clamped.page, 36)
    assert.equal(clamped.items.length, 5)

    const empty = paginate([], 3, 10)
    assert.deepEqual(empty.items, [])
    assert.equal(empty.page, 0)
    assert.equal(empty.pageCount, 1)
    assert.equal(pageRangeLabel(empty), '0 of 0')
    assert.equal(paginate(items, 0, 25).pageCount, 15)
    assert.equal(paginate(items, 0, 50).pageCount, 8)
})

test('credentialPage reports the unfiltered total next to the matched count', () => {
    const credentials = Array.from({ length: 12 }, (_, index) =>
        credential({
            contractId: `c${String(index).padStart(2, '0')}`,
            credentialTypes: [
                'VerifiableCredential',
                index % 2 === 0 ? 'membership' : 'training',
            ],
        })
    )
    const result = credentialPage(
        credentials,
        { ...emptyCredentialFilters, types: ['membership'] },
        'registered-desc',
        0,
        10,
        NOW
    )
    assert.equal(result.total, 12)
    assert.equal(result.matched, 6)
    assert.equal(result.page.items.length, 6)
    assert.equal(pageRangeLabel(result.page), '1–6 of 6')
})

test('claims flatten to key/value rows with nested AnyValue depth', () => {
    const rows = claimRows({
        'demo.example/sequence': { tag: 'AV_Int', value: '0' },
        'demo.example/active': { tag: 'AV_Bool', value: true },
        'demo.example/nested': {
            tag: 'AV_Map',
            value: { level: { tag: 'AV_Int', value: '2' } },
        },
        'demo.example/list': {
            tag: 'AV_List',
            value: [{ tag: 'AV_Text', value: 'first' }],
        },
    })
    assert.deepEqual(
        rows.map(({ label, depth, value }) => [label, depth, value]),
        [
            ['demo.example/active', 0, 'true'],
            ['demo.example/list', 0, null],
            ['[0]', 1, 'first'],
            ['demo.example/nested', 0, null],
            ['level', 1, '2'],
            ['demo.example/sequence', 0, '0'],
        ]
    )
    // Paths are unique so they can key table rows.
    assert.equal(new Set(rows.map((row) => row.path)).size, rows.length)
})

test('short forms truncate party namespaces and long textual identifiers', () => {
    assert.equal(shortPartyId(party('DemoIssuer')), 'DemoIssuer::1220ab…')
    assert.equal(shortPartyId('DemoIssuer::1220'), 'DemoIssuer::1220')
    assert.equal(shortPartyId('no-namespace'), 'no-namespace')
    assert.equal(
        issuerShortLabel({
            tag: 'W3C_VC_Identifier_Party',
            value: party('DemoIssuer'),
        }),
        'DemoIssuer::1220ab…'
    )
    assert.equal(
        issuerShortLabel({ tag: 'W3C_VC_Identifier', value: 'dns' }),
        'dns'
    )
    assert.equal(
        issuerShortLabel(
            {
                tag: 'W3C_VC_Identifier',
                value: 'https://external.example/issuer',
            },
            12
        ),
        'https://exte…'
    )
})

test('subject label names a single subject and counts the rest', () => {
    assert.equal(subjectShortLabel(credential()), 'urn:demo:subject:7')
    assert.equal(
        subjectShortLabel(credential({ subjects: [{ id: null, claims: {} }] })),
        'No subject identifier'
    )
    assert.equal(
        subjectShortLabel(
            credential({
                subjects: [
                    {
                        id: { tag: 'W3C_VC_Identifier', value: 'urn:a' },
                        claims: {},
                    },
                    {
                        id: { tag: 'W3C_VC_Identifier', value: 'urn:b' },
                        claims: {},
                    },
                ],
            })
        ),
        'urn:a +1'
    )
})

test('securing summary reports the mechanism and media type without a verification claim', () => {
    assert.equal(securingSummary(credential()), 'None')
    assert.equal(
        securingSummary(
            credential({
                securing: {
                    mechanism: 'EnvelopedProof',
                    mediaType: 'application/vc+jwt',
                    cryptosuites: [],
                },
            })
        ),
        'EnvelopedProof (application/vc+jwt)'
    )
    assert.equal(
        securingSummary(
            credential({
                securing: {
                    mechanism: 'EmbeddedProof',
                    mediaType: null,
                    cryptosuites: ['eddsa-jcs-2022'],
                },
            })
        ),
        'EmbeddedProof (eddsa-jcs-2022)'
    )
    assert.equal(
        securingSummary(
            credential({
                securing: {
                    mechanism: 'EmbeddedProof',
                    mediaType: null,
                    cryptosuites: [],
                },
            })
        ),
        'EmbeddedProof'
    )
})
