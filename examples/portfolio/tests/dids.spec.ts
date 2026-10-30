// Copyright (c) 2025-2026 Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto'
import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { SDK, localNetStaticConfig } from '@canton-network/wallet-sdk'
import { AuthTokenProvider } from '@canton-network/core-wallet-auth'
import { LedgerProvider, type Ops } from '@canton-network/core-provider-ledger'
import pino from 'pino'
import {
    connectGateway,
    createGatewayApi,
    createWalletGateway,
    gatewayUserForWorker,
    gotoConnect,
} from './utils'

const factoryPackage = 'canton-network-did-demo'
const factoryModule = 'Canton.Network.Did.Demo:DemoDidRegistryFactory'
const factoryTemplate = `#${factoryPackage}:${factoryModule}`
const documentTemplate = 'Canton.Network.Did.Demo:DemoDidDocument'
const didInterfaces = {
    document:
        '#canton-network-did-interfaces:Canton.Network.Did.V1:DidDocument',
    registered:
        '#canton-network-did-interfaces:Canton.Network.Did.V1:RegisteredDidDocument',
}

test.setTimeout(120_000)
test.use({ trace: 'off', video: 'off' })

type Ledger = Awaited<ReturnType<typeof SDK.create>>['ledger']

const diagnostics = new WeakMap<
    Page,
    { startedAt: number; events: object[]; steps: object[] }
>()

function stage(
    page: Page,
    name: string,
    status: 'started' | 'completed',
    startedAt?: number
) {
    const steps = diagnostics.get(page)?.steps
    if (!steps) return
    steps.push({
        stage: name,
        status,
        at: new Date().toISOString(),
        ...(startedAt === undefined
            ? {}
            : { elapsedMs: Date.now() - startedAt }),
    })
    if (steps.length > 100) steps.shift()
}

async function timedStage<T>(
    page: Page,
    name: string,
    run: () => Promise<T>
): Promise<T> {
    const startedAt = Date.now()
    stage(page, name, 'started')
    try {
        const result = await run()
        stage(page, name, 'completed', startedAt)
        return result
    } catch (error) {
        stage(page, name, 'completed', startedAt)
        throw error
    }
}

function boundedProbe<T>(run: () => Promise<T>): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 400)
        try {
            run().then(
                (value) => {
                    clearTimeout(timer)
                    resolve(value)
                },
                () => {
                    clearTimeout(timer)
                    resolve(null)
                }
            )
        } catch {
            clearTimeout(timer)
            resolve(null)
        }
    })
}

test.beforeEach(async ({ page }) => {
    const record = {
        startedAt: Date.now(),
        events: [] as object[],
        steps: [] as object[],
    }
    diagnostics.set(page, record)
    const capture = (kind: string, detail: object) => {
        record.events.push({ at: new Date().toISOString(), kind, ...detail })
        if (record.events.length > 100) record.events.shift()
    }
    page.on('console', (message) => {
        if (message.type() === 'error')
            capture('console-error', { source: 'browser' })
    })
    page.on('response', (response) => {
        const request = response.request()
        const url = new URL(response.url())
        if (!['localhost', '127.0.0.1'].includes(url.hostname)) return
        capture('request', {
            method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(
                request.method()
            )
                ? request.method()
                : 'other',
            status: response.status(),
        })
    })
    page.on('requestfailed', (request) => {
        const url = new URL(request.url())
        if (['localhost', '127.0.0.1'].includes(url.hostname))
            capture('request-failed', {
                method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(
                    request.method()
                )
                    ? request.method()
                    : 'other',
            })
    })
})

test.afterEach(async ({ page }, info: TestInfo) => {
    if (info.status === info.expectedStatus) return
    const record = diagnostics.get(page)
    const snapshot = {
        at: new Date().toISOString(),
        elapsedMs: record ? Date.now() - record.startedAt : null,
        status: info.status,
        steps: record?.steps ?? [],
        events: record?.events ?? [],
        ...(info.status === 'timedOut'
            ? {}
            : {
                  createButtonCount: await boundedProbe(() =>
                      page.getByRole('button', { name: 'Create DID' }).count()
                  ),
                  dialogCount: await boundedProbe(() =>
                      page.getByRole('dialog').count()
                  ),
              }),
    }
    await info.attach('did-failure-diagnostics', {
        body: Buffer.from(JSON.stringify(snapshot, null, 2)),
        contentType: 'application/json',
    })
})

async function activeContracts(
    provider: LedgerProvider,
    party: string,
    templateIds: string[],
    interfaceIds: string[] = [],
    page?: Page
) {
    const ledgerEnd = await provider.request<Ops.GetV2StateLedgerEnd>({
        method: 'ledgerApi',
        params: {
            resource: '/v2/state/ledger-end',
            requestMethod: 'get',
            query: {},
        },
    })
    if (ledgerEnd.offset === undefined)
        throw new Error('Ledger end offset unavailable')
    if (page) stage(page, 'ledger-end-read', 'completed')
    const responses = await provider.request<Ops.PostV2StateActiveContracts>({
        method: 'ledgerApi',
        params: {
            resource: '/v2/state/active-contracts',
            requestMethod: 'post',
            query: {},
            body: {
                activeAtOffset: ledgerEnd.offset,
                eventFormat: {
                    filtersByParty: {
                        [party]: {
                            cumulative: [
                                ...templateIds.map((templateId) => ({
                                    identifierFilter: {
                                        TemplateFilter: {
                                            value: {
                                                templateId,
                                                includeCreatedEventBlob: true,
                                            },
                                        },
                                    },
                                })),
                                ...interfaceIds.map((interfaceId) => ({
                                    identifierFilter: {
                                        InterfaceFilter: {
                                            value: {
                                                interfaceId,
                                                includeCreatedEventBlob: true,
                                                includeInterfaceView: true,
                                            },
                                        },
                                    },
                                })),
                            ],
                        },
                    },
                    verbose: false,
                },
            },
        },
    })
    return responses.flatMap((response) => {
        const entry = response?.contractEntry
        return entry && 'JsActiveContract' in entry
            ? [
                  {
                      ...entry.JsActiveContract.createdEvent,
                      synchronizerId: entry.JsActiveContract.synchronizerId,
                  },
              ]
            : []
    })
}

async function setup(page: Page) {
    const api = await createGatewayApi()
    const hint = randomUUID().slice(0, 12)
    const owner = await api.createWallet({
        partyHint: `did-owner-${hint}`,
        signingProvider: 'participant',
        primary: true,
    })
    const admin = await api.createWallet({
        partyHint: `did-admin-${hint}`,
        signingProvider: 'participant',
    })
    diagnostics.get(page)?.steps.push({
        at: new Date().toISOString(),
        stage: 'wallets-created',
    })
    const auth = {
        method: 'self_signed' as const,
        issuer: 'unsafe-auth',
        credentials: {
            clientId: gatewayUserForWorker(test.info().parallelIndex),
            clientSecret: 'unsafe',
            audience: 'https://canton.network.global',
            scope: '',
        },
    }
    const ledger = (
        await SDK.create({
            auth,
            ledgerClientUrl: localNetStaticConfig.LOCALNET_APP_USER_LEDGER_URL,
        })
    ).ledger
    const provider = new LedgerProvider({
        baseUrl: localNetStaticConfig.LOCALNET_APP_USER_LEDGER_URL,
        accessTokenProvider: new AuthTokenProvider(
            auth,
            pino({ level: 'silent' })
        ),
    })

    const wg = createWalletGateway(page)
    await gotoConnect(page)
    await connectGateway(page, wg)
    await page.goto('http://localhost:8081/dashboard/credentials')
    await expect(
        page.getByRole('heading', { name: 'Credentials', exact: true })
    ).toBeVisible()
    await page.getByRole('tab', { name: 'DIDs' }).click()
    await expect(page.getByRole('button', { name: 'Create DID' })).toBeEnabled()
    return { ledger, provider, owner, admin, wg }
}

async function createFactory(
    ledger: Ledger,
    provider: LedgerProvider,
    admin: string,
    page: Page
) {
    const preferred =
        await provider.request<Ops.PostV2InteractiveSubmissionPreferredPackages>(
            {
                method: 'ledgerApi',
                params: {
                    resource: '/v2/interactive-submission/preferred-packages',
                    requestMethod: 'post',
                    body: {
                        packageVettingRequirements: [
                            { parties: [admin], packageName: factoryPackage },
                        ],
                    },
                },
            }
        )
    const packageId = preferred.packageReferences.find(
        (reference) => reference.packageName === factoryPackage
    )?.packageId
    if (!packageId)
        throw new Error('No vetted DID demo package on the participant')
    const deployedFactoryTemplate = `${packageId}:${factoryModule}`
    // Resolve the package against the participant at execution time; never seed
    // LocalNet or use an old package ID from a prior deployment.
    await timedStage(page, 'factory-submit', () =>
        ledger.internal.submit({
            actAs: [admin],
            commands: [
                {
                    CreateCommand: {
                        templateId: deployedFactoryTemplate,
                        createArguments: { admin },
                    },
                },
            ],
        })
    )
    const factories = await timedStage(page, 'factory-acs', () =>
        activeContracts(provider, admin, [factoryTemplate], [], page)
    )
    const factory = factories.find(
        (event) =>
            event.createArgument &&
            typeof event.createArgument === 'object' &&
            'admin' in event.createArgument &&
            event.createArgument.admin === admin
    )
    expect(
        factory,
        'admin-signed factory must be in the admin ACS'
    ).toBeDefined()
    if (!factory?.createdEventBlob || !factory.synchronizerId)
        throw new Error('Factory ACS event lacks ledger disclosure fields')
    expect(factory.templateId === deployedFactoryTemplate).toBe(true)
    expect(
        factory.signatories.length === 1 && factory.signatories[0] === admin
    ).toBe(true)
    return {
        templateId: factory.templateId,
        contractId: factory.contractId,
        createdEventBlob: factory.createdEventBlob,
        synchronizerId: factory.synchronizerId,
        factoryView: { registryAdmin: admin },
    }
}

async function ownerDocuments(provider: LedgerProvider, owner: string) {
    return activeContracts(
        provider,
        owner,
        [],
        [didInterfaces.document, didInterfaces.registered]
    )
}

async function fillDialog(
    page: Page,
    owner: string,
    admin: string,
    factoryContractId: string,
    disclosure: object
) {
    await page.getByRole('button', { name: 'Create DID' }).click()
    const dialog = page.getByRole('dialog')
    await expect
        .poll(async () =>
            dialog.getByText(`Provisional DID: did:canton:${owner}`).isVisible()
        )
        .toBe(true)
    await dialog
        .getByRole('textbox', { name: 'Registry admin (full Party ID)' })
        .fill(admin)
    await dialog
        .getByRole('textbox', { name: 'DID registry factory contract ID' })
        .fill(factoryContractId)
    await dialog
        .getByRole('textbox', { name: 'Paste DID factory disclosure JSON' })
        .fill(JSON.stringify(disclosure))
    await dialog.getByRole('button', { name: 'Use pasted disclosure' }).click()
    await dialog
        .getByRole('checkbox', { name: /I understand factory policy/ })
        .check()
    return dialog
}

test('owner registers a factory-mediated DID visible in Portfolio and owner ACS', async ({
    page,
}) => {
    const { ledger, provider, owner, admin, wg } = await setup(page)
    const disclosure = await createFactory(ledger, provider, admin, page)
    diagnostics.get(page)?.steps.push({
        at: new Date().toISOString(),
        stage: 'factory-created',
    })
    expect(
        (
            await timedStage(page, 'owner-acs-check', () =>
                ownerDocuments(provider, owner)
            )
        ).length
    ).toBe(0)
    const dialog = await fillDialog(
        page,
        owner,
        admin,
        disclosure.contractId,
        disclosure
    )
    const submit = dialog.getByRole('button', { name: 'Create DID' })
    await expect(submit).toBeEnabled()
    await timedStage(page, 'ui-approval-submit', () =>
        wg.approveTransaction(() => submit.click())
    )
    await expect(async () => {
        expect(
            await page
                .getByText(
                    `Factory-mediated DID registered: did:canton:${owner}`,
                    {
                        exact: false,
                    }
                )
                .isVisible()
        ).toBe(true)
    }).toPass()
    const card = page
        .getByRole('article')
        .filter({ hasText: `did:canton:${owner}` })
    await expect(card).toHaveCount(1)
    await expect
        .poll(async () =>
            (
                await card
                    .getByRole('region', { name: 'DID registry record' })
                    .innerText()
            ).includes(admin)
        )
        .toBe(true)

    // A separate app-user Ledger JSON API ACS read, filtered by the owner and
    // registered DID interface, checks the ledger result instead of UI state.
    const events = await timedStage(page, 'owner-acs-after', () =>
        ownerDocuments(provider, owner)
    )
    expect(events).toHaveLength(1)
    const [event] = events
    expect(event.templateId).toMatch(new RegExp(`:${documentTemplate}$`))
    expect(event.signatories.includes(owner)).toBe(true)
    expect(event.signatories.includes(admin)).toBe(true)
    expect(event.signatories).toHaveLength(2)
    const registered = event.interfaceViews?.find((view) =>
        view.interfaceId.endsWith(':RegisteredDidDocument')
    )
    expect(registered).toBeDefined()
    const value = registered?.viewValue as {
        document: {
            id: { value: string }
            controllers: { hd: { value: string }; tl: unknown[] }
        }
        registration: { registryAdmin: string }
    }
    expect(value.document.id.value === `did:canton:${owner}`).toBe(true)
    expect(value.document.controllers.hd.value === `did:canton:${owner}`).toBe(
        true
    )
    expect(value.document.controllers.tl).toEqual([])
    expect(value.registration.registryAdmin === admin).toBe(true)
    expect(event.contractId).toBeTruthy()
    await expect
        .poll(async () =>
            (await card.innerText()).includes(`did:canton:${owner}`)
        )
        .toBe(true)
})

test('mismatched factory disclosure cannot submit or create a DID', async ({
    page,
}) => {
    const { ledger, provider, owner, admin } = await setup(page)
    const disclosure = await createFactory(ledger, provider, admin, page)
    diagnostics.get(page)?.steps.push({
        at: new Date().toISOString(),
        stage: 'factory-created',
    })
    expect(
        (
            await timedStage(page, 'owner-acs-check', () =>
                ownerDocuments(provider, owner)
            )
        ).length
    ).toBe(0)
    const dialog = await fillDialog(page, owner, admin, disclosure.contractId, {
        ...disclosure,
        contractId: `${disclosure.contractId}-mismatch`,
    })
    await expect
        .poll(async () =>
            dialog
                .getByText('DID factory disclosure contract ID does not match')
                .isVisible()
        )
        .toBe(true)
    await expect(
        dialog.getByRole('button', { name: 'Create DID' })
    ).toBeDisabled()
    expect(
        (
            await timedStage(page, 'owner-acs-check', () =>
                ownerDocuments(provider, owner)
            )
        ).length
    ).toBe(0)
})
