const packageName =
    '#canton-network-credentials-interfaces:Canton.Network.Credentials.V1:'

export const credentialInterfaces = {
    credential: `${packageName}Credential`,
    registered: `${packageName}RegisteredCredential`,
    request: `${packageName}CredentialRequest`,
    offer: `${packageName}CredentialOffer`,
    factory: `${packageName}CredentialRegistryFactory`,
} as const

export const credentialInterfaceIds = Object.values(credentialInterfaces)

const demoPackage =
    '#canton-network-credentials-demo:Canton.Network.Credentials.Demo:'
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
