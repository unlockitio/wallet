// Copyright (c) 2025-2026 Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { v4 } from 'uuid'
import * as dappSdk from '@canton-network/dapp-sdk'
import type { PartyId } from '@canton-network/core-types'
import type { PreparedCommand } from '@canton-network/wallet-sdk'

const submit = async (
    [command, disclosedContracts]: PreparedCommand,
    actAs: PartyId[]
): Promise<string | null> => {
    const provider = dappSdk.getConnectedProvider()
    if (!provider) {
        throw new Error('Dapp provider is not available')
    }

    try {
        const result = await provider.request({
            method: 'prepareExecuteAndWait',
            params: {
                commands: [command],
                commandId: v4(),
                actAs,
                disclosedContracts,
            },
        })
        return result?.tx?.payload?.updateId ?? null
    } catch (cause) {
        throw cause instanceof Error
            ? cause
            : new Error('The transaction was not completed. You can try again.')
    }
}

export const submitViaProvider = async (
    command: PreparedCommand,
    actAs: PartyId
): Promise<void> => {
    await submit(command, [actAs])
}

// A command whose contract has several signatories must be submitted by all of them
// at once. The gateway rejects an acting party whose wallet the user does not control.
export const submitMultiPartyViaProvider = async (
    command: PreparedCommand,
    actAs: PartyId[]
): Promise<string | null> => submit(command, actAs)
