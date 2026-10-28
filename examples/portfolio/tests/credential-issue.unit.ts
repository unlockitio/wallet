import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { credentialInterfaces } from '../src/config/credential-interfaces'
import {
    claimKeyError,
    claimsTextMap,
    createOffer,
    credentialTypesFor,
    missingOfferSignatories,
    requiredOfferSignatories,
} from '../src/services/credential-commands'
import {
    decodeCredentials,
    type CredentialRequest,
} from '../src/services/credentials'

const ISSUER = 'DemoIssuer::ns'
const ADMIN = 'CredentialDemoRegistryAdmin::ns'
const HOLDER = 'DemoHolderA::ns'
const FACTORY = '00e0d138cafe'

const request: CredentialRequest = {
    contractId: '00req',
    holder: HOLDER,
    requestedType: 'training',
    registryAdmin: ADMIN,
    anchorers: [ISSUER],
}

const input = {
    request,
    issuer: ISSUER,
    factory: FACTORY,
    extraTypes: [],
    subjectId: { tag: 'W3C_VC_Identifier_Party' as const, value: HOLDER },
    claims: [{ key: 'demo.example/category', value: 'training' }],
    validFrom: null,
    validUntil: null,
    credentialId: null,
    registeredAt: '2026-10-28T00:00:00.000Z',
    registrationExpiresAt: null,
}

test('offer create command matches the DemoCredentialOffer fields exactly', () => {
    const [command, disclosed] = createOffer(input)
    assert.deepEqual(disclosed, [])
    assert.ok('CreateCommand' in command)
    const create = (
        command as {
            CreateCommand: { templateId: string; createArguments: unknown }
        }
    ).CreateCommand
    assert.equal(
        create.templateId,
        '#canton-network-credentials-demo:Canton.Network.Credentials.Demo:DemoCredentialOffer'
    )
    // Every field of the template, in the exact JSON encoding the ledger accepts:
    // NonEmpty as {hd,tl}, Optional as null, variant as {tag,value}, TextMap as an
    // object of AnyValue.
    assert.deepEqual(create.createArguments, {
        request: '00req',
        holder: HOLDER,
        requestedType: 'training',
        registryAdmin: ADMIN,
        anchorers: { hd: ISSUER, tl: [] },
        factory: FACTORY,
        credential: {
            id: null,
            credentialTypes: ['VerifiableCredential', 'training'],
            issuer: { tag: 'W3C_VC_Identifier_Party', value: ISSUER },
            validFrom: null,
            validUntil: null,
            credentialSubject: {
                hd: {
                    id: { tag: 'W3C_VC_Identifier_Party', value: HOLDER },
                    claims: {
                        'demo.example/category': {
                            tag: 'AV_Text',
                            value: 'training',
                        },
                    },
                },
                tl: [],
            },
            credentialSchema: [],
            securing: null,
            holders: [HOLDER],
            anchorers: { hd: ISSUER, tl: [] },
        },
        registration: {
            registryAdmin: ADMIN,
            registeredAt: '2026-10-28T00:00:00.000Z',
            expiresAt: null,
            meta: {},
        },
    })
})

test('offer carries optional values, extra types and several anchorers', () => {
    const [command] = createOffer({
        ...input,
        request: { ...request, anchorers: [ISSUER, 'SecondAnchorer::ns'] },
        extraTypes: ['EmployeeCredential', 'training'],
        subjectId: null,
        claims: [],
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        credentialId: '  urn:demo:credential:900  ',
        registrationExpiresAt: '2028-01-01T00:00:00.000Z',
    })
    const args = (
        command as { CreateCommand: { createArguments: Record<string, never> } }
    ).CreateCommand.createArguments as unknown as {
        anchorers: unknown
        credential: Record<string, unknown>
        registration: Record<string, unknown>
    }
    assert.deepEqual(args.anchorers, { hd: ISSUER, tl: ['SecondAnchorer::ns'] })
    assert.deepEqual(args.credential.anchorers, {
        hd: ISSUER,
        tl: ['SecondAnchorer::ns'],
    })
    // The requested type is already present, so adding it again must not duplicate it.
    assert.deepEqual(args.credential.credentialTypes, [
        'VerifiableCredential',
        'training',
        'EmployeeCredential',
    ])
    assert.equal(args.credential.id, 'urn:demo:credential:900')
    assert.equal(args.credential.validFrom, '2026-01-01T00:00:00.000Z')
    assert.equal(args.credential.validUntil, '2027-01-01T00:00:00.000Z')
    assert.equal(args.registration.expiresAt, '2028-01-01T00:00:00.000Z')
    assert.deepEqual(
        (
            args.credential.credentialSubject as {
                hd: { id: unknown; claims: unknown }
            }
        ).hd,
        { id: null, claims: {} }
    )
})

test('issuer must be one of the request anchorers, because it signs as an anchorer', () => {
    assert.throws(
        () => createOffer({ ...input, issuer: 'Outsider::ns' }),
        /issuer party must be one of the request anchorers/
    )
    // An anchorer that is not first in the list is still a valid issuer.
    assert.ok(
        createOffer({
            ...input,
            request: { ...request, anchorers: ['SecondAnchorer::ns', ISSUER] },
        })
    )
})

test('offer rejects a missing issuer, factory, request or anchorer', () => {
    assert.throws(
        () => createOffer({ ...input, issuer: '  ' }),
        /issuer party is required/
    )
    assert.throws(
        () => createOffer({ ...input, factory: '' }),
        /registry factory contract is required/
    )
    assert.throws(
        () =>
            createOffer({ ...input, request: { ...request, contractId: '' } }),
        /existing credential request is required/
    )
    assert.throws(
        () => createOffer({ ...input, request: { ...request, anchorers: [] } }),
        /at least one anchorer/
    )
})

test('claim keys reject empty and the reserved subject identifier member', () => {
    assert.equal(claimKeyError('demo.example/category'), null)
    assert.match(claimKeyError('') ?? '', /must not be empty/)
    assert.match(claimKeyError('   ') ?? '', /must not be empty/)
    assert.match(claimKeyError('id') ?? '', /subject identifier, not a claim/)
    assert.match(
        claimKeyError('  id  ') ?? '',
        /subject identifier, not a claim/
    )
    // `id` only collides as the whole key.
    assert.equal(claimKeyError('identifier'), null)
})

test('claims encode as a TextMap of AV_Text and reject duplicate or invalid keys', () => {
    assert.deepEqual(
        claimsTextMap([
            { key: ' role ', value: 'Engineer' },
            { key: 'level', value: '2' },
        ]),
        {
            role: { tag: 'AV_Text', value: 'Engineer' },
            level: { tag: 'AV_Text', value: '2' },
        }
    )
    assert.throws(
        () =>
            claimsTextMap([
                { key: 'a', value: '1' },
                { key: ' a ', value: '2' },
            ]),
        /Duplicate claim key: a/
    )
    assert.throws(
        () => claimsTextMap([{ key: 'id', value: 'x' }]),
        /subject identifier/
    )
    assert.deepEqual(claimsTextMap([]), {})
})

test('credential types always start with VerifiableCredential and stay unique', () => {
    assert.deepEqual(credentialTypesFor('training', []), [
        'VerifiableCredential',
        'training',
    ])
    assert.deepEqual(
        credentialTypesFor(' training ', [' Extra ', '', 'training']),
        ['VerifiableCredential', 'training', 'Extra']
    )
    assert.deepEqual(credentialTypesFor('VerifiableCredential', []), [
        'VerifiableCredential',
    ])
})

test('required signatories are the anchorers, the issuer and the registry admin, deduped', () => {
    // The issuer is already an anchorer, so it appears once.
    assert.deepEqual(requiredOfferSignatories(request, ISSUER), [ISSUER, ADMIN])
    assert.deepEqual(
        requiredOfferSignatories(
            { ...request, anchorers: [ISSUER, 'SecondAnchorer::ns'] },
            ISSUER
        ),
        [ISSUER, 'SecondAnchorer::ns', ADMIN]
    )
    // An admin that also anchors is not listed twice.
    assert.deepEqual(
        requiredOfferSignatories(
            { ...request, anchorers: [ISSUER, ADMIN] },
            ISSUER
        ),
        [ISSUER, ADMIN]
    )
})

test('controlled-party check names exactly the signatories the wallet user lacks', () => {
    const required = requiredOfferSignatories(request, ISSUER)
    assert.deepEqual(
        missingOfferSignatories(required, [ISSUER, ADMIN, HOLDER]),
        []
    )
    assert.deepEqual(missingOfferSignatories(required, [ISSUER]), [ADMIN])
    assert.deepEqual(missingOfferSignatories(required, []), [ISSUER, ADMIN])
})

const event = (
    contractId: string,
    interfaceId: string,
    viewValue: unknown
) => ({
    contractId,
    interfaceViews: [{ interfaceId, viewValue }],
})

test('requests split by role: own requests versus requests this party can answer', () => {
    const requestView = (
        holder: string,
        anchorers: string[],
        registryAdmin = ADMIN
    ) => ({
        holder,
        requestedType: 'training',
        registryAdmin,
        anchorers: { hd: anchorers[0], tl: anchorers.slice(1) },
    })
    const snapshot = decodeCredentials(
        [
            event(
                'own',
                credentialInterfaces.request,
                requestView(ISSUER, [ISSUER])
            ),
            event(
                'asAnchorer',
                credentialInterfaces.request,
                requestView(HOLDER, [ISSUER])
            ),
            event(
                'asAdmin',
                credentialInterfaces.request,
                requestView(HOLDER, ['Other::ns'], ISSUER)
            ),
            event(
                'unrelated',
                credentialInterfaces.request,
                requestView(HOLDER, ['Other::ns'])
            ),
        ],
        ISSUER
    )
    assert.deepEqual(
        snapshot.requests.map((entry) => entry.contractId),
        ['own']
    )
    assert.deepEqual(
        snapshot.incomingRequests.map((entry) => entry.contractId),
        ['asAnchorer', 'asAdmin']
    )
})

test('registry factories decode with their admin and anchorers', () => {
    const snapshot = decodeCredentials(
        [
            event('f1', credentialInterfaces.factory, {
                registryAdmin: ADMIN,
                anchorers: { hd: ISSUER, tl: ['SecondAnchorer::ns'] },
            }),
            // An incomplete view is dropped rather than guessed at.
            event('f2', credentialInterfaces.factory, { registryAdmin: ADMIN }),
            event('f3', credentialInterfaces.factory, {
                anchorers: { hd: ISSUER, tl: [] },
            }),
        ],
        ISSUER
    )
    assert.deepEqual(snapshot.factories, [
        {
            contractId: 'f1',
            registryAdmin: ADMIN,
            anchorers: [ISSUER, 'SecondAnchorer::ns'],
        },
    ])
})
