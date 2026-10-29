import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
    createOwnerDid,
    decodeDids,
    didFactoryInterfaceId,
    didFactoryTemplateId,
    didInterfaces,
    hasVisibleDidForOwner,
    provisionalDid,
    validateDidFactoryDisclosure,
} from '../src/services/dids'

const did = (value: string) => ({ value })
const owner = 'Alice::1220abc'
const admin = 'Admin::1220def'

const factoryId = 'factory-contract-id'
const disclosure = {
    templateId: didFactoryTemplateId,
    contractId: factoryId,
    createdEventBlob: 'opaque-base64-blob',
    synchronizerId: 'synchronizer-id',
}

test('owner-only factory exercise binds owner, controller and provisional DID without direct create', () => {
    const [command, disclosed] = createOwnerDid(
        owner,
        admin,
        [],
        factoryId,
        disclosure
    )
    assert.deepEqual(disclosed, [disclosure])
    assert.deepEqual(command, {
        ExerciseCommand: {
            templateId: didFactoryInterfaceId,
            contractId: factoryId,
            choice: 'DidRegistryFactory_Create',
            choiceArgument: {
                owner,
                expectedRegistryAdmin: admin,
                document: {
                    id: { value: `did:canton:${owner}` },
                    controllers: {
                        hd: { value: `did:canton:${owner}` },
                        tl: [],
                    },
                    verificationMethods: [],
                    verificationRelationships: {
                        authentication: [],
                        assertionMethod: [],
                        capabilityInvocation: [],
                    },
                    services: [],
                },
            },
        },
    })
    assert.equal('CreateCommand' in command, false)
})

test('factory disclosure validates exact package and binding, without trusting JSON provenance', () => {
    for (const [value, id, expected, message] of [
        [null, factoryId, admin, /object/],
        [disclosure, '', admin, /contract ID is required/],
        [
            { ...disclosure, contractId: 'other' },
            factoryId,
            admin,
            /contract ID does not match/,
        ],
        [
            {
                ...disclosure,
                templateId:
                    'deadbeef:Canton.Network.Did.Demo:DemoDidRegistryFactory',
            },
            factoryId,
            admin,
            /current demo factory/,
        ],
        [
            { ...disclosure, createdEventBlob: ' ' },
            factoryId,
            admin,
            /createdEventBlob/,
        ],
        [
            { ...disclosure, synchronizerId: '' },
            factoryId,
            admin,
            /synchronizerId/,
        ],
        [
            { ...disclosure, factoryView: { registryAdmin: owner } },
            factoryId,
            admin,
            /view registry admin/,
        ],
        [
            { ...disclosure, registryAdmin: owner },
            factoryId,
            admin,
            /metadata registry admin/,
        ],
    ] as const) {
        assert.throws(
            () => validateDidFactoryDisclosure(value, id, expected),
            message
        )
    }
    assert.deepEqual(
        validateDidFactoryDisclosure(
            { ...disclosure, factoryView: { registryAdmin: admin } },
            factoryId,
            admin
        ),
        disclosure
    )
})

test('duplicate visible owner DID is rejected, without claiming ledger-wide uniqueness', () => {
    const existing = [{ id: provisionalDid(owner) }] as ReturnType<
        typeof decodeDids
    >
    assert.equal(hasVisibleDidForOwner(existing, owner), true)
    assert.equal(hasVisibleDidForOwner(existing, admin), false)
    assert.throws(
        () => createOwnerDid(owner, admin, existing, factoryId, disclosure),
        /already visible/
    )
})

test('create rejects invalid owner and unconfirmed or same-party admin', () => {
    assert.throws(
        () => createOwnerDid('alice', admin, [], factoryId, disclosure),
        /Primary party/
    )
    assert.throws(
        () => createOwnerDid(owner, '', [], factoryId, disclosure),
        /Registry admin/
    )
    assert.throws(
        () => createOwnerDid(owner, owner, [], factoryId, disclosure),
        /distinct/
    )
    assert.throws(
        () => createOwnerDid(owner, 'admin', [], factoryId, disclosure),
        /full Canton Party/
    )
    assert.throws(
        () => createOwnerDid(owner, admin, [], factoryId, null),
        /disclosure must be an object/
    )
})
const document = {
    id: did('did:example:alice'),
    controllers: { hd: did('did:example:alice'), tl: [did('did:example:bob')] },
    verificationMethods: [
        {
            id: did('#key-1'),
            controllerDid: did('did:example:alice'),
            methodType: 'Ed25519',
            verificationMaterial: 'public-key',
        },
    ],
    verificationRelationships: {
        authentication: [did('#key-1')],
        assertionMethod: [],
        capabilityInvocation: [did('#key-1')],
    },
    services: [
        {
            id: did('#service'),
            serviceType: did('Messaging'),
            serviceEndpoint: {
                version: '1',
                endpoints: {
                    hd: { uri: did('https://example.org/one'), priority: null },
                    tl: [
                        { uri: did('https://example.org/two'), priority: '2' },
                    ],
                },
            },
        },
    ],
}
const registration = {
    registryAdmin: 'admin',
    registeredAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
    versionId: 'v1',
    deactivated: false,
    deactivatedAt: null,
    source: 'registry',
    meta: {},
}
const event = (
    contractId: string,
    interfaceId: string,
    viewValue: unknown
) => ({ contractId, interfaceViews: [{ interfaceId, viewValue }] })

test('intrinsic DID decodes multiple controllers, methods, relationships and service endpoints', () => {
    const result = decodeDids([event('c1', didInterfaces.document, document)])
    assert.equal(result.length, 1)
    assert.equal(result[0].registration, null)
    assert.deepEqual(result[0].controllers, [
        'did:example:alice',
        'did:example:bob',
    ])
    assert.equal(
        result[0].verificationMethods[0].verificationMaterial,
        'public-key'
    )
    assert.deepEqual(result[0].verificationRelationships.capabilityInvocation, [
        '#key-1',
    ])
    assert.deepEqual(result[0].services[0].endpoints, [
        { uri: 'https://example.org/one', priority: null },
        { uri: 'https://example.org/two', priority: '2' },
    ])
})

test('registered interface joins on contract ID, including a registered-only view and optional timestamps', () => {
    const result = decodeDids([
        event('c1', didInterfaces.document, document),
        event('c2', didInterfaces.registered, {
            document: { ...document, id: did('did:example:second') },
            registration,
        }),
        event('c1', didInterfaces.registered, {
            document,
            registration: {
                ...registration,
                deactivated: true,
                deactivatedAt: '2026-02-01T00:00:00Z',
            },
        }),
    ])
    assert.equal(result.length, 2)
    assert.equal(result[0].registration?.registryAdmin, 'admin')
    assert.equal(result[0].registration?.registeredAt, null)
    assert.equal(result[0].registration?.deactivated, true)
    assert.equal(result[1].id, 'did:example:second')
    assert.equal(result[1].registration?.deactivated, false)
})

test('unreturned parties cannot be resolved from the filtered ACS result', () => {
    const result = decodeDids([
        event('visible', didInterfaces.document, document),
        event('other', '#other:Module:DidDocument', {
            ...document,
            id: did('did:example:private'),
        }),
    ])
    assert.deepEqual(
        result.map((item) => item.id),
        ['did:example:alice']
    )
    assert.deepEqual(decodeDids([]), [])
})

// The ledger reports DID interface views under the resolved package ID even when the ACS
// filter used the `#package-name` reference, as captured from a LocalNet ACS response.
const resolvedDidPackageId =
    'fd543a93e463c83ffbaea62d1d78961c3c8f6e8b134b47c008981013c444f6bf'
const resolvedDid = (entity: string) =>
    `${resolvedDidPackageId}:Canton.Network.Did.V1:${entity}`

test('package-ID DID interface views decode with their registration', () => {
    const admin = 'did:canton:CredentialDemoRegistryAdmin::1220abcd'
    const liveDocument = {
        id: did(admin),
        controllers: { hd: did(admin), tl: [] },
        verificationMethods: [],
        verificationRelationships: {
            authentication: [],
            assertionMethod: [],
            capabilityInvocation: [],
        },
        services: [
            {
                id: did(`${admin}#dids`),
                serviceType: did('CantonDidResolutionService'),
                serviceEndpoint: {
                    version: '1.0',
                    endpoints: {
                        hd: {
                            uri: did('http://localhost:42003/v1/dids'),
                            priority: '0',
                        },
                        tl: [
                            {
                                uri: did('http://localhost:42004/v1/dids'),
                                priority: '1',
                            },
                        ],
                    },
                },
            },
        ],
    }
    const liveRegistration = {
        registryAdmin: 'CredentialDemoRegistryAdmin::1220abcd',
        registeredAt: '2026-10-27T23:58:34.731647Z',
        updatedAt: '2026-10-27T23:58:34.731647Z',
        versionId: 'demo-version-1',
        deactivated: false,
        deactivatedAt: null,
        source: 'canton-ledger-pqs-demo',
        integrityEvidence: 'demo-unverified-integrity-evidence',
        finalityEvidence: 'demo-no-authoritative-finality',
        meta: { values: {} },
    }
    const result = decodeDids([
        {
            contractId: 'd1',
            interfaceViews: [
                {
                    interfaceId: resolvedDid('DidDocument'),
                    viewStatus: { code: 0, message: '', details: [] },
                    viewValue: liveDocument,
                },
                {
                    interfaceId: resolvedDid('RegisteredDidDocument'),
                    viewStatus: { code: 0, message: '', details: [] },
                    viewValue: {
                        document: liveDocument,
                        registration: liveRegistration,
                    },
                },
            ],
        },
    ])

    assert.equal(result.length, 1)
    assert.equal(result[0].id, admin)
    assert.deepEqual(result[0].controllers, [admin])
    assert.equal(result[0].services.length, 1)
    assert.equal(
        result[0].services[0].serviceType,
        'CantonDidResolutionService'
    )
    assert.deepEqual(result[0].services[0].endpoints, [
        { uri: 'http://localhost:42003/v1/dids', priority: '0' },
        { uri: 'http://localhost:42004/v1/dids', priority: '1' },
    ])
    assert.equal(result[0].registration?.versionId, 'demo-version-1')
    assert.equal(result[0].registration?.source, 'canton-ledger-pqs-demo')
    assert.equal(result[0].registration?.deactivatedAt, null)
})

test('DID views from an unrelated module are ignored', () => {
    assert.deepEqual(
        decodeDids([
            event('x1', 'deadbeef:Canton.Network.Did.V2:DidDocument', document),
            event('x2', 'malformed', document),
        ]),
        []
    )
})
