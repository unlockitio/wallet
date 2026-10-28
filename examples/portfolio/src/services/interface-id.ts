// An interface ID has the form `<package>:<module>:<entity>`, where `<package>` is
// either a `#package-name` reference or a resolved package ID. The ledger accepts a
// package-name reference in an ACS filter but reports every returned interface view
// under the resolved package ID, so responses must be matched on `<module>:<entity>`.
export function interfaceQualifiedName(interfaceId: unknown): string | null {
    if (typeof interfaceId !== 'string') return null
    const [packageReference, module, entity, ...rest] = interfaceId.split(':')
    return packageReference && module && entity && rest.length === 0
        ? `${module}:${entity}`
        : null
}

export function requireInterfaceQualifiedName(interfaceId: string): string {
    const qualifiedName = interfaceQualifiedName(interfaceId)
    if (!qualifiedName)
        throw new Error(`Malformed interface ID: ${interfaceId}`)
    return qualifiedName
}

// Maps `<module>:<entity>` back to the configured key, so a view can be classified
// without depending on which package reference form the ledger reported.
export function interfaceKinds<Kind extends string>(
    interfaces: Readonly<Record<Kind, string>>
): ReadonlyMap<string, Kind> {
    const entries = Object.entries(interfaces) as [Kind, string][]
    return new Map(
        entries.map(([kind, interfaceId]) => [
            requireInterfaceQualifiedName(interfaceId),
            kind,
        ])
    )
}

export function interfaceKindOf<Kind extends string>(
    kinds: ReadonlyMap<string, Kind>,
    interfaceId: unknown
): Kind | null {
    const qualifiedName = interfaceQualifiedName(interfaceId)
    return qualifiedName === null ? null : (kinds.get(qualifiedName) ?? null)
}
