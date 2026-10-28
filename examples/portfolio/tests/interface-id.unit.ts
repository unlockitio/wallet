import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
    interfaceKindOf,
    interfaceKinds,
    interfaceQualifiedName,
    requireInterfaceQualifiedName,
} from '../src/services/interface-id'

test('qualified name drops the package reference in both package-name and package-ID form', () => {
    assert.equal(
        interfaceQualifiedName('#pkg-name:Mod.Sub:Entity'),
        'Mod.Sub:Entity'
    )
    assert.equal(
        interfaceQualifiedName('8e2be0a6512d780a:Mod.Sub:Entity'),
        'Mod.Sub:Entity'
    )
})

test('qualified name rejects malformed interface IDs instead of guessing', () => {
    assert.equal(interfaceQualifiedName('Mod:Entity:extra:part'), null)
    assert.equal(interfaceQualifiedName('Mod:Entity'), null)
    assert.equal(interfaceQualifiedName('single'), null)
    assert.equal(interfaceQualifiedName(':Mod:Entity'), null)
    assert.equal(interfaceQualifiedName('pkg::Entity'), null)
    assert.equal(interfaceQualifiedName('pkg:Mod:'), null)
    assert.equal(interfaceQualifiedName(null), null)
    assert.equal(interfaceQualifiedName(42), null)
    assert.throws(
        () => requireInterfaceQualifiedName('Mod:Entity'),
        /Malformed interface ID/
    )
})

test('kinds map matches a configured package-name interface against a package-ID view', () => {
    const kinds = interfaceKinds({
        credential:
            '#canton-network-credentials-interfaces:Canton.Network.Credentials.V1:Credential',
        offer: '#canton-network-credentials-interfaces:Canton.Network.Credentials.V1:CredentialOffer',
    })
    assert.equal(
        interfaceKindOf(
            kinds,
            '8e2be0a6:Canton.Network.Credentials.V1:Credential'
        ),
        'credential'
    )
    assert.equal(
        interfaceKindOf(
            kinds,
            '#canton-network-credentials-interfaces:Canton.Network.Credentials.V1:CredentialOffer'
        ),
        'offer'
    )
    // A different module must not match, so an unrelated package cannot impersonate the interface.
    assert.equal(
        interfaceKindOf(
            kinds,
            '8e2be0a6:Canton.Network.Credentials.V2:Credential'
        ),
        null
    )
    assert.equal(interfaceKindOf(kinds, 'malformed'), null)
    assert.equal(interfaceKindOf(kinds, undefined), null)
})
