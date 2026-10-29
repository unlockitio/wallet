import type { PreparedCommand } from '@canton-network/wallet-sdk'
import type { FactoryDisclosure } from './credential-commands'
import { interfaceKindOf, interfaceKinds } from './interface-id'

export const didFactoryInterfaceId =
    '#canton-network-did-interfaces:Canton.Network.Did.V1:DidRegistryFactory'
export const didFactoryTemplateId =
    'ae817a39ccaf478ef6feb04ca8828c40b2c546d29ba39963090e1b552890c743:Canton.Network.Did.Demo:DemoDidRegistryFactory'

export function validateDidFactoryDisclosure(
    value: unknown,
    factoryContractId: string,
    expectedRegistryAdmin: string
): FactoryDisclosure {
    if (!factoryContractId.trim())
        throw new Error('DID registry factory contract ID is required')
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('DID factory disclosure must be an object')
    const data = value as Record<string, unknown>
    if (data.contractId !== factoryContractId.trim())
        throw new Error('DID factory disclosure contract ID does not match')
    if (data.templateId !== didFactoryTemplateId)
        throw new Error(
            'DID factory disclosure must use the current demo factory package ID'
        )
    for (const key of ['createdEventBlob', 'synchronizerId']) {
        if (typeof data[key] !== 'string' || !data[key].trim())
            throw new Error(`DID factory disclosure missing ${key}`)
    }
    const view = data.factoryView
    if (view !== undefined) {
        if (
            !view ||
            typeof view !== 'object' ||
            Array.isArray(view) ||
            (view as Record<string, unknown>).registryAdmin !==
                expectedRegistryAdmin
        )
            throw new Error('DID factory view registry admin does not match')
    }
    if (
        data.registryAdmin !== undefined &&
        data.registryAdmin !== expectedRegistryAdmin
    )
        throw new Error('DID factory metadata registry admin does not match')
    return {
        templateId: data.templateId,
        contractId: data.contractId as string,
        createdEventBlob: data.createdEventBlob as string,
        synchronizerId: data.synchronizerId as string,
    }
}

export const provisionalDid = (owner: string) => `did:canton:${owner}`

export function hasVisibleDidForOwner(documents: DidDocument[], owner: string) {
    return documents.some((document) => document.id === provisionalDid(owner))
}

export function createOwnerDid(
    owner: string,
    registryAdmin: string,
    existing: DidDocument[],
    factoryContractId: string,
    disclosure: unknown
): PreparedCommand {
    if (!/^[^\s:]+::[^\s:]+$/.test(owner))
        throw new Error('Primary party must be a full Canton Party ID')
    const admin = registryAdmin.trim()
    if (!/^[^\s:]+::[^\s:]+$/.test(admin) || admin === owner)
        throw new Error(
            'Registry admin must be a distinct full Canton Party ID'
        )
    if (hasVisibleDidForOwner(existing, owner))
        throw new Error(
            'A DID with this ID is already visible to the primary party'
        )
    const factory = validateDidFactoryDisclosure(
        disclosure,
        factoryContractId,
        admin
    )
    const id = { value: provisionalDid(owner) }
    return [
        {
            ExerciseCommand: {
                templateId: didFactoryInterfaceId,
                contractId: factory.contractId,
                choice: 'DidRegistryFactory_Create',
                choiceArgument: {
                    owner,
                    expectedRegistryAdmin: admin,
                    document: {
                        id,
                        controllers: { hd: id, tl: [] },
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
        },
        [factory],
    ]
}

export const didInterfaces = {
    document:
        '#canton-network-did-interfaces:Canton.Network.Did.V1:DidDocument',
    registered:
        '#canton-network-did-interfaces:Canton.Network.Did.V1:RegisteredDidDocument',
} as const

export type DidDocument = {
    contractId: string
    id: string
    controllers: string[]
    verificationMethods: {
        id: string
        controllerDid: string
        methodType: string
        verificationMaterial: string
    }[]
    verificationRelationships: {
        authentication: string[]
        assertionMethod: string[]
        capabilityInvocation: string[]
    }
    services: {
        id: string
        serviceType: string
        version: string
        endpoints: { uri: string; priority: string | null }[]
    }[]
    registration: {
        registryAdmin: string
        registeredAt: string | null
        updatedAt: string | null
        versionId: string
        deactivated: boolean
        deactivatedAt: string | null
        source: string
    } | null
}

type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as ObjectValue)
        : null
const string = (value: unknown): string | null =>
    typeof value === 'string' ? value : null
const did = (value: unknown): string | null => string(object(value)?.value)
const list = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value
    const nonEmpty = object(value)
    return nonEmpty && 'hd' in nonEmpty
        ? [nonEmpty.hd, ...(Array.isArray(nonEmpty.tl) ? nonEmpty.tl : [])]
        : []
}
const dids = (value: unknown): string[] =>
    list(value).flatMap((item) => did(item) ?? [])
const methodIds = (value: unknown): string[] =>
    list(value).flatMap((item) => string(object(item)?.value) ?? [])

function decodeDocument(
    contractId: string,
    value: unknown
): DidDocument | null {
    const view = object(value)
    const id = did(view?.id)
    if (!view || !id) return null
    const relationships = object(view.verificationRelationships)
    return {
        contractId,
        id,
        controllers: dids(view.controllers),
        verificationMethods: list(view.verificationMethods).flatMap((item) => {
            const method = object(item)
            const methodId = string(object(method?.id)?.value)
            const controllerDid = did(method?.controllerDid)
            const methodType = string(method?.methodType)
            const verificationMaterial = string(method?.verificationMaterial)
            return methodId &&
                controllerDid &&
                methodType &&
                verificationMaterial
                ? [
                      {
                          id: methodId,
                          controllerDid,
                          methodType,
                          verificationMaterial,
                      },
                  ]
                : []
        }),
        verificationRelationships: {
            authentication: methodIds(relationships?.authentication),
            assertionMethod: methodIds(relationships?.assertionMethod),
            capabilityInvocation: methodIds(
                relationships?.capabilityInvocation
            ),
        },
        services: list(view.services).flatMap((item) => {
            const service = object(item)
            const endpoint = object(service?.serviceEndpoint)
            const serviceId = string(object(service?.id)?.value)
            const serviceType = string(object(service?.serviceType)?.value)
            const version = string(endpoint?.version)
            return serviceId && serviceType && version
                ? [
                      {
                          id: serviceId,
                          serviceType,
                          version,
                          endpoints: list(endpoint?.endpoints).flatMap(
                              (entry) => {
                                  const value = object(entry)
                                  const uri = string(object(value?.uri)?.value)
                                  return uri
                                      ? [
                                            {
                                                uri,
                                                priority:
                                                    value?.priority == null
                                                        ? null
                                                        : String(
                                                              value.priority
                                                          ),
                                            },
                                        ]
                                      : []
                              }
                          ),
                      },
                  ]
                : []
        }),
        registration: null,
    }
}

function decodeRegistration(value: unknown): DidDocument['registration'] {
    const registration = object(value)
    const registryAdmin = string(registration?.registryAdmin)
    const versionId = string(registration?.versionId)
    const source = string(registration?.source)
    if (
        !registryAdmin ||
        !versionId ||
        source === null ||
        typeof registration?.deactivated !== 'boolean'
    )
        return null
    return {
        registryAdmin,
        versionId,
        source,
        deactivated: registration.deactivated,
        registeredAt: string(registration.registeredAt),
        updatedAt: string(registration.updatedAt),
        deactivatedAt: string(registration.deactivatedAt),
    }
}

const didInterfaceKinds = interfaceKinds(didInterfaces)

// Input must be the result of a party-filtered ACS read; interface views alone do not establish authorization.
export function decodeDids(events: unknown[]): DidDocument[] {
    const documents = new Map<string, DidDocument>()
    const registered = new Map<
        string,
        {
            document: DidDocument
            registration: NonNullable<DidDocument['registration']>
        }
    >()
    for (const event of events) {
        const contract = object(event)
        const contractId = string(contract?.contractId)
        if (!contractId || !Array.isArray(contract?.interfaceViews)) continue
        for (const raw of contract.interfaceViews) {
            const view = object(raw)
            const kind = interfaceKindOf(didInterfaceKinds, view?.interfaceId)
            if (kind === 'document') {
                const document = decodeDocument(contractId, view?.viewValue)
                if (document) documents.set(contractId, document)
            } else if (kind === 'registered') {
                const value = object(view?.viewValue)
                const document = decodeDocument(contractId, value?.document)
                const registration = decodeRegistration(value?.registration)
                if (document && registration)
                    registered.set(contractId, { document, registration })
            }
        }
    }
    for (const [contractId, value] of registered) {
        // The registered interface requires DidDocument and carries its document view.
        documents.set(contractId, {
            ...value.document,
            registration: value.registration,
        })
    }
    return [...documents.values()]
}
