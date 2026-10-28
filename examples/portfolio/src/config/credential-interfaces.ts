const packageName =
    '#canton-network-credentials-interfaces-v2:Canton.Network.Credentials.V1:'

export const credentialInterfaces = {
    credential: `${packageName}Credential`,
    registered: `${packageName}RegisteredCredential`,
    request: `${packageName}CredentialRequest`,
    offer: `${packageName}CredentialOffer`,
    factory: `${packageName}CredentialRegistryFactory`,
} as const

export const credentialInterfacePackageId =
    '68824ddd934993972c34c3d7a1e496edd03867210e4b003bbe6e75636c497f8d'
export const legacyCredentialInterfacePackageId =
    '8e2be0a6512d780aeeeffa7fe791737de737256e944466301336d28544e8e0fc'

// Query the published interface and the deployed legacy interface separately. A
// package-name reference resolves to the latest version, not both versions.
export const credentialInterfaceIds = Object.values(credentialInterfaces)
export const legacyCredentialInterfaces = Object.fromEntries(
    Object.entries(credentialInterfaces).map(([kind, id]) => [
        kind,
        id.replace(
            '#canton-network-credentials-interfaces-v2',
            legacyCredentialInterfacePackageId
        ),
    ])
) as { [K in keyof typeof credentialInterfaces]: string }
export const legacyCredentialInterfaceIds = Object.values(
    legacyCredentialInterfaces
)

const demoPackage =
    '#canton-network-credentials-demo-v2:Canton.Network.Credentials.Demo:'
export const demoCredentialRequestId = `${demoPackage}DemoCredentialRequest`
export const demoCredentialOfferId = `${demoPackage}DemoCredentialOffer`

export type CredentialConfig = {
    registryAdmin: string
    anchorers: string[]
    disclosureBaseUrl: string
    presetTypes: string[]
    factory: string
    typesApiUrl: string
}

// Defaults are deliberately empty: each deployment must supply its own routing parties and issuer endpoint.
const env = import.meta.env ?? {}
export const credentialConfig: CredentialConfig = {
    registryAdmin: env.VITE_CREDENTIAL_REGISTRY_ADMIN || '',
    anchorers: (env.VITE_CREDENTIAL_ANCHORERS || '')
        .split(',')
        .map((party: string) => party.trim())
        .filter(Boolean),
    disclosureBaseUrl: env.VITE_CREDENTIAL_DISCLOSURE_BASE_URL || '',
    presetTypes: (env.VITE_CREDENTIAL_TYPES || '')
        .split(',')
        .map((type: string) => type.trim())
        .filter(Boolean),
    // Fallback factory for the issue flow when no factory is visible in the ACS.
    factory: env.VITE_CREDENTIAL_FACTORY || '',
    // Optional registry catalogue. Absence is normal: suggestions then come from the ACS alone.
    typesApiUrl: env.VITE_CREDENTIAL_TYPES_API_URL || '',
}
