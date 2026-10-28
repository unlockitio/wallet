// An empty interface-filtered ACS read has two distinct causes that must not be
// conflated: the interface package is absent from the participant, or the package is
// present and the primary party simply is not a stakeholder of any such contract.
export type VisibilityState = {
    packageMissing: boolean
    partyHint: string | null
}

export function emptyVisibilityMessage(
    subject: string,
    packageLabel: string,
    { packageMissing, partyHint }: VisibilityState
): string {
    if (packageMissing) {
        return `No ${subject}. The ${packageLabel} package is not available on this participant.`
    }
    return partyHint
        ? `No ${subject} visible to ${partyHint}.`
        : `No ${subject} visible to the primary party.`
}
