import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
    credentialInterfaces,
    credentialInterfacePackageId,
    legacyCredentialInterfaces,
    legacyCredentialInterfacePackageId,
} from '../src/config/credential-interfaces'
import {
    decodeCredentials,
    optional,
    renderAnyValue,
} from '../src/services/credentials'
import {
    acceptOffer,
    cancelRequest,
    createRequest,
    disclosureUrl,
    httpFactoryDisclosureProvider,
    rejectOffer,
    validateFactoryDisclosure,
} from '../src/services/credential-commands'

const credential = {
    id: null,
    credentialTypes: ['Employee'],
    issuer: { tag: 'W3C_VC_Identifier_Party', value: 'issuer' },
    validFrom: null,
    validUntil: '2030-01-01T00:00:00Z',
    credentialSubject: {
        hd: { id: null, claims: { name: { tag: 'AV_Text', value: 'Ada' } } },
        tl: [
            {
                id: { tag: 'W3C_VC_Identifier', value: 'subject-2' },
                claims: {
                    roles: {
                        tag: 'AV_List',
                        value: [
                            {
                                tag: 'AV_Map',
                                value: { level: { tag: 'AV_Int', value: '2' } },
                            },
                        ],
                    },
                },
            },
        ],
    },
    securing: {
        tag: 'EnvelopedProof',
        value: { mediaType: 'application/json', encoded: 'proof' },
    },
    holders: ['holder'],
    anchorers: { hd: 'anchor', tl: [] },
}
const event = (
    contractId: string,
    interfaceId: string,
    viewValue: unknown
) => ({
    contractId,
    interfaceViews: [{ interfaceId, viewValue }],
})

test('intrinsic credential and optional values with two subjects', () => {
    const snapshot = decodeCredentials(
        [event('c1', credentialInterfaces.credential, credential)],
        'holder'
    )
    assert.equal(snapshot.credentials.length, 1)
    const item = snapshot.credentials[0]
    assert.equal(item.registration, null)
    assert.equal(item.id, null)
    assert.equal(item.validUntil, '2030-01-01T00:00:00Z')
    assert.equal(item.subjects.length, 2)
    assert.equal(item.issuer.tag, 'W3C_VC_Identifier_Party')
    assert.deepEqual(item.securing, {
        mechanism: 'EnvelopedProof',
        mediaType: 'application/json',
        cryptosuites: [],
    })
    assert.deepEqual(item.credentialSchema, [])
    assert.equal(item.subjects[0].id, null)
    assert.equal(item.subjects[1].id?.value, 'subject-2')
    assert.equal(optional(null), null)
    assert.equal(optional(undefined), null)
    assert.equal(optional('present'), 'present')
    assert.equal(renderAnyValue(item.subjects[1].claims.roles), '[{level: 2}]')
})

test('registration joins by contract id only, and alternate issuer decodes', () => {
    const snapshot = decodeCredentials(
        [
            event('c1', credentialInterfaces.registered, {
                registryAdmin: 'admin',
                registeredAt: '2026-01-01T00:00:00Z',
                meta: {},
            }),
            event('c2', credentialInterfaces.registered, {
                registryAdmin: 'wrong',
                registeredAt: '2026-01-01T00:00:00Z',
                expiresAt: null,
            }),
            event('c1', credentialInterfaces.credential, {
                ...credential,
                validFrom: undefined,
                issuer: {
                    tag: 'W3C_VC_Identifier',
                    value: 'did:example:issuer',
                },
            }),
        ],
        'holder'
    )
    assert.equal(snapshot.credentials[0].registration?.registryAdmin, 'admin')
    assert.equal(snapshot.credentials[0].registration?.expiresAt, null)
    assert.equal(snapshot.credentials[0].validFrom, null)
    assert.equal(snapshot.credentials[0].issuer.value, 'did:example:issuer')
})

test('embedded proof cryptosuites and credential schemas decode without a verification claim', () => {
    const snapshot = decodeCredentials(
        [
            event('c1', credentialInterfaces.credential, {
                ...credential,
                credentialSchema: [
                    {
                        id: 'https://external.example/schemas/base.json',
                        schemaType: 'JsonSchema',
                    },
                    {
                        id: 'https://external.example/schemas/full.json',
                        schemaType: 'JsonSchema',
                        digestSRI: 'sha384-abc',
                    },
                ],
                securing: {
                    tag: 'EmbeddedProof',
                    value: {
                        securedDocument: 'doc',
                        proofs: {
                            hd: {
                                proofType: 'DataIntegrityProof',
                                cryptosuite: 'eddsa-jcs-2022',
                                proofPurpose: 'assertionMethod',
                                previousProof: [],
                            },
                            tl: [
                                {
                                    proofType: 'DataIntegrityProof',
                                    cryptosuite: null,
                                    proofPurpose: 'assertionMethod',
                                    previousProof: [],
                                },
                            ],
                        },
                    },
                },
            }),
        ],
        'holder'
    )
    const item = snapshot.credentials[0]
    assert.deepEqual(item.securing, {
        mechanism: 'EmbeddedProof',
        mediaType: null,
        cryptosuites: ['eddsa-jcs-2022'],
    })
    assert.deepEqual(item.credentialSchema, [
        {
            id: 'https://external.example/schemas/base.json',
            schemaType: 'JsonSchema',
            digestSRI: null,
        },
        {
            id: 'https://external.example/schemas/full.json',
            schemaType: 'JsonSchema',
            digestSRI: 'sha384-abc',
        },
    ])
})

test('malformed schema entries are dropped rather than rendered as partial rows', () => {
    const snapshot = decodeCredentials(
        [
            event('c1', credentialInterfaces.credential, {
                ...credential,
                credentialSchema: [
                    {
                        id: 'https://ok.example/s.json',
                        schemaType: 'JsonSchema',
                    },
                    { id: 'no-type' },
                    { schemaType: 'JsonSchema' },
                    'not-an-object',
                ],
            }),
        ],
        'holder'
    )
    assert.deepEqual(
        snapshot.credentials[0].credentialSchema.map(({ id }) => id),
        ['https://ok.example/s.json']
    )
})

test('own requests only and visible offers independent of holder', () => {
    const request = {
        holder: 'other',
        requestedIssuer: 'anchor',
        requestedType: 'Employee',
        registryAdmin: 'admin',
        anchorers: { hd: 'anchor', tl: [] },
    }
    const snapshot = decodeCredentials(
        [
            event('r1', credentialInterfaces.request, request),
            event('r2', credentialInterfaces.request, {
                ...request,
                holder: 'me',
            }),
            event('o1', credentialInterfaces.offer, {
                ...request,
                request: 'r1',
                factory: 'f',
                credential: 'c',
                registration: 'r',
            }),
        ],
        'me'
    )
    assert.deepEqual(
        snapshot.requests.map(({ contractId }) => contractId),
        ['r2']
    )
    assert.deepEqual(
        snapshot.offers.map(({ contractId }) => contractId),
        ['o1']
    )
})

const disclosure = {
    templateId: 'abcdef:Canton.Network.Credentials.Demo:DemoRegistryFactory',
    contractId: 'factory-1',
    createdEventBlob: 'base64-blob',
    synchronizerId: 'sync',
}

test('accept and reject use interface choices with only accept disclosing the factory', () => {
    assert.deepEqual(acceptOffer('offer-1', disclosure), [
        {
            ExerciseCommand: {
                templateId: credentialInterfaces.offer,
                contractId: 'offer-1',
                choice: 'CredentialOffer_Accept',
                choiceArgument: {},
            },
        },
        [disclosure],
    ])
    assert.deepEqual(rejectOffer('offer-1'), [
        {
            ExerciseCommand: {
                templateId: credentialInterfaces.offer,
                contractId: 'offer-1',
                choice: 'CredentialOffer_Reject',
                choiceArgument: {},
            },
        },
        [],
    ])
})

test('type-only issuer-targeted request has exactly five permitted payload fields, and cancel uses interface choice', () => {
    const command = createRequest('holder', 'issuer::ns', 'Employee', 'admin', [
        'issuer::ns',
        'anchor-2',
    ])
    assert.deepEqual(command, [
        {
            CreateCommand: {
                templateId:
                    '#canton-network-credentials-demo-v2:Canton.Network.Credentials.Demo:DemoCredentialRequest',
                createArguments: {
                    holder: 'holder',
                    requestedIssuer: 'issuer::ns',
                    requestedType: 'Employee',
                    registryAdmin: 'admin',
                    anchorers: { hd: 'issuer::ns', tl: ['anchor-2'] },
                },
            },
        },
        [],
    ])
    assert.deepEqual(
        Object.keys(command[0].CreateCommand?.createArguments ?? {}).sort(),
        [
            'anchorers',
            'holder',
            'registryAdmin',
            'requestedIssuer',
            'requestedType',
        ]
    )
    assert.throws(
        () =>
            createRequest('holder', 'issuer', 'Employee', 'admin', ['issuer']),
        /full Canton Party ID/
    )
    assert.throws(
        () =>
            createRequest('holder', 'issuer::ns', 'Employee', 'admin', [
                'other::ns',
            ]),
        /one of the anchorers/
    )
    assert.deepEqual(cancelRequest('request-1'), [
        {
            ExerciseCommand: {
                templateId: credentialInterfaces.request,
                contractId: 'request-1',
                choice: 'CredentialRequest_Cancel',
                choiceArgument: {},
            },
        },
        [],
    ])
})

// The ledger reports interface views under the resolved package ID even when the ACS
// filter used the `#package-name` reference, as captured from a LocalNet ACS response.
const resolvedPackageId = legacyCredentialInterfacePackageId
const resolved = (entity: string) =>
    `${resolvedPackageId}:Canton.Network.Credentials.V1:${entity}`

test('package-ID interface views decode identically to package-name views', () => {
    const liveCredential = {
        id: 'urn:demo:credential:000',
        credentialTypes: ['VerifiableCredential', 'membership'],
        issuer: {
            tag: 'W3C_VC_Identifier_Party',
            value: 'DemoIssuer::1220abcd',
        },
        validFrom: '2026-10-27T23:57:59.508235Z',
        validUntil: null,
        credentialSubject: {
            hd: {
                id: null,
                claims: {
                    'demo.example/sequence': { tag: 'AV_Int', value: '0' },
                },
            },
            tl: [],
        },
        credentialSchema: [],
        securing: null,
        holders: ['DemoHolderA::1220abcd', 'DemoHolderB::1220abcd'],
        anchorers: { hd: 'DemoIssuer::1220abcd', tl: [] },
    }
    const liveRegistration = {
        registryAdmin: 'CredentialDemoRegistryAdmin::1220abcd',
        registeredAt: '2026-10-27T23:57:59.508235Z',
        expiresAt: null,
        meta: { 'demo.example/seed': { tag: 'AV_Int', value: '20260918' } },
    }
    const liveRequest = {
        holder: 'DemoHolderA::1220abcd',
        requestedType: 'membership',
        registryAdmin: 'CredentialDemoRegistryAdmin::1220abcd',
        anchorers: { hd: 'DemoIssuer::1220abcd', tl: [] },
    }
    const snapshot = decodeCredentials(
        [
            {
                contractId: 'c1',
                interfaceViews: [
                    {
                        interfaceId: resolved('Credential'),
                        viewStatus: { code: 0, message: '', details: [] },
                        viewValue: liveCredential,
                    },
                    {
                        interfaceId: resolved('RegisteredCredential'),
                        viewStatus: { code: 0, message: '', details: [] },
                        viewValue: liveRegistration,
                    },
                ],
            },
            {
                contractId: 'rq1',
                interfaceViews: [
                    {
                        interfaceId: resolved('CredentialRequest'),
                        viewValue: liveRequest,
                    },
                ],
            },
            {
                contractId: 'of1',
                interfaceViews: [
                    {
                        interfaceId: resolved('CredentialOffer'),
                        viewValue: {
                            ...liveRequest,
                            request: 'rq1',
                            factory: 'f1',
                            credential: liveCredential,
                            registration: liveRegistration,
                        },
                    },
                ],
            },
        ],
        'DemoHolderA::1220abcd'
    )

    assert.equal(snapshot.credentials.length, 1)
    assert.equal(snapshot.credentials[0].id, 'urn:demo:credential:000')
    assert.deepEqual(snapshot.credentials[0].credentialTypes, [
        'VerifiableCredential',
        'membership',
    ])
    assert.equal(snapshot.credentials[0].validUntil, null)
    assert.equal(snapshot.credentials[0].securing, null)
    assert.deepEqual(snapshot.credentials[0].holders, [
        'DemoHolderA::1220abcd',
        'DemoHolderB::1220abcd',
    ])
    assert.deepEqual(snapshot.credentials[0].anchorers, [
        'DemoIssuer::1220abcd',
    ])
    assert.equal(snapshot.credentials[0].subjects.length, 1)
    assert.equal(
        snapshot.credentials[0].registration?.registryAdmin,
        'CredentialDemoRegistryAdmin::1220abcd'
    )
    assert.equal(snapshot.credentials[0].registration?.expiresAt, null)
    assert.deepEqual(
        snapshot.requests.map(({ contractId }) => contractId),
        ['rq1']
    )
    assert.deepEqual(
        snapshot.offers.map(({ contractId }) => contractId),
        ['of1']
    )
    assert.equal(snapshot.offers[0].requestedType, 'membership')
    assert.equal(snapshot.requests[0].version, 'legacy')
    assert.equal(snapshot.requests[0].requestedIssuer, null)
})

test('current and old requests coexist with honest package versions', () => {
    const oldView = {
        holder: 'holder::ns',
        requestedType: 'Training',
        registryAdmin: 'admin::ns',
        anchorers: { hd: 'issuer::ns', tl: [] },
    }
    const snapshot = decodeCredentials(
        [
            event('old', resolved('CredentialRequest'), oldView),
            event(
                'new',
                `${credentialInterfacePackageId}:Canton.Network.Credentials.V1:CredentialRequest`,
                { ...oldView, requestedIssuer: 'issuer::ns' }
            ),
        ],
        'holder::ns'
    )
    assert.deepEqual(
        snapshot.requests.map(({ contractId, version, requestedIssuer }) => ({
            contractId,
            version,
            requestedIssuer,
        })),
        [
            { contractId: 'old', version: 'legacy', requestedIssuer: null },
            {
                contractId: 'new',
                version: 'current',
                requestedIssuer: 'issuer::ns',
            },
        ]
    )
})

test('registration joins within its package generation, never across equal contract IDs', () => {
    const snapshot = decodeCredentials(
        [
            event('same', legacyCredentialInterfaces.credential, credential),
            event('same', credentialInterfaces.credential, {
                ...credential,
                id: 'new',
            }),
            event('same', legacyCredentialInterfaces.registered, {
                registryAdmin: 'old-admin',
                registeredAt: '2026-01-01T00:00:00Z',
            }),
        ],
        'holder'
    )
    assert.equal(snapshot.credentials.length, 2)
    assert.equal(
        snapshot.credentials.find(({ id }) => id === 'new')?.registration,
        null
    )
    assert.equal(
        snapshot.credentials.find(({ id }) => id === null)?.registration
            ?.registryAdmin,
        'old-admin'
    )
})

test('old seeded contract views coexist with v2 and retain old action targets', () => {
    const oldRequest = {
        holder: 'holder::ns',
        requestedType: 'membership',
        registryAdmin: 'admin::ns',
        anchorers: { hd: 'issuer::ns', tl: [] },
    }
    const views = Array.from({ length: 370 }, (_, index) =>
        event(`old-${index}`, resolved('CredentialRequest'), oldRequest)
    )
    const snapshot = decodeCredentials(
        [
            ...views,
            event('new-request', credentialInterfaces.request, {
                ...oldRequest,
                requestedIssuer: 'issuer::ns',
            }),
            event('old-offer', legacyCredentialInterfaces.offer, {
                ...oldRequest,
                request: 'old-0',
                factory: 'old-factory',
            }),
            event('new-offer', credentialInterfaces.offer, {
                ...oldRequest,
                request: null,
                factory: 'new-factory',
            }),
            event('bad-old-offer', legacyCredentialInterfaces.offer, {
                ...oldRequest,
                request: null,
            }),
        ],
        'holder::ns'
    )
    assert.equal(snapshot.requests.length, 371)
    assert.equal(
        snapshot.requests.filter(({ version }) => version === 'legacy').length,
        370
    )
    assert.deepEqual(
        snapshot.offers.map(({ contractId, version, request }) => ({
            contractId,
            version,
            request,
        })),
        [
            { contractId: 'old-offer', version: 'legacy', request: 'old-0' },
            { contractId: 'new-offer', version: 'current', request: null },
        ]
    )
    assert.equal(
        acceptOffer('old-offer', disclosure, 'legacy')[0].ExerciseCommand
            ?.templateId,
        legacyCredentialInterfaces.offer
    )
    assert.equal(
        rejectOffer('old-offer', 'legacy')[0].ExerciseCommand?.templateId,
        legacyCredentialInterfaces.offer
    )
    assert.equal(
        cancelRequest('old-0', 'legacy')[0].ExerciseCommand?.templateId,
        legacyCredentialInterfaces.request
    )
})

test('unknown lineage and wrong request shapes cannot masquerade as v2', () => {
    const old = {
        holder: 'holder',
        requestedType: 'membership',
        registryAdmin: 'admin',
        anchorers: { hd: 'issuer', tl: [] },
    }
    const snapshot = decodeCredentials(
        [
            event(
                'unknown',
                'deadbeef:Canton.Network.Credentials.V1:CredentialRequest',
                { ...old, requestedIssuer: 'issuer' }
            ),
            event('wrong-v2', credentialInterfaces.request, old),
            event('old', legacyCredentialInterfaces.request, {
                ...old,
                requestedIssuer: 'issuer',
            }),
        ],
        'holder'
    )
    assert.deepEqual(
        snapshot.requests.map(({ contractId, version, requestedIssuer }) => ({
            contractId,
            version,
            requestedIssuer,
        })),
        [{ contractId: 'old', version: 'legacy', requestedIssuer: null }]
    )
})

test('interface views from an unrelated package with the same entity name are ignored', () => {
    const snapshot = decodeCredentials(
        [
            event('c1', '#other-package:Other.Module:Credential', credential),
            event(
                'c2',
                'deadbeef:Canton.Network.Credentials.V2:Credential',
                credential
            ),
            event('c3', 'not-a-valid-interface-id', credential),
        ],
        'holder'
    )
    assert.deepEqual(snapshot.credentials, [])
})

test('factory disclosure validates matching contract id, package id and nonempty blob', () => {
    assert.deepEqual(
        validateFactoryDisclosure(disclosure, 'factory-1'),
        disclosure
    )
    assert.throws(
        () =>
            validateFactoryDisclosure(
                { ...disclosure, contractId: 'other' },
                'factory-1'
            ),
        /does not match/
    )
    assert.throws(
        () =>
            validateFactoryDisclosure(
                { ...disclosure, createdEventBlob: '' },
                'factory-1'
            ),
        /missing createdEventBlob/
    )
    assert.throws(
        () =>
            validateFactoryDisclosure(
                { ...disclosure, templateId: '#name:Mod:Factory' },
                'factory-1'
            ),
        /package ID/
    )
})

test('provider builds encoded HTTP URL scoped to registry admin', async () => {
    assert.equal(
        disclosureUrl('https://issuer.example/api/', 'factory/1'),
        'https://issuer.example/api/factory-disclosures/factory%2F1'
    )
    assert.throws(
        () => disclosureUrl('file:///tmp', 'factory'),
        /HTTP or HTTPS/
    )
    const provider = httpFactoryDisclosureProvider({
        admin: 'https://issuer.example/api',
    })
    await assert.rejects(
        () => provider.getFactoryDisclosure('other', 'factory-1'),
        /No factory disclosure provider/
    )
})
