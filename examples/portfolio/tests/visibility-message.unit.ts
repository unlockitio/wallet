import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { emptyVisibilityMessage } from '../src/services/visibility-message'

test('package hint appears only when the query reported a missing package', () => {
    assert.equal(
        emptyVisibilityMessage('credentials', 'credential interfaces', {
            packageMissing: true,
            partyHint: 'DemoHolderA',
        }),
        'No credentials. The credential interfaces package is not available on this participant.'
    )
    assert.equal(
        emptyVisibilityMessage('credentials', 'credential interfaces', {
            packageMissing: false,
            partyHint: 'DemoHolderA',
        }),
        'No credentials visible to DemoHolderA.'
    )
})

test('an absent party hint falls back to the primary party without claiming a missing package', () => {
    assert.equal(
        emptyVisibilityMessage('DID documents', 'DID interfaces', {
            packageMissing: false,
            partyHint: null,
        }),
        'No DID documents visible to the primary party.'
    )
    // A missing package is reported even without a hint, because the cause is the participant.
    assert.equal(
        emptyVisibilityMessage('DID documents', 'DID interfaces', {
            packageMissing: true,
            partyHint: null,
        }),
        'No DID documents. The DID interfaces package is not available on this participant.'
    )
})
