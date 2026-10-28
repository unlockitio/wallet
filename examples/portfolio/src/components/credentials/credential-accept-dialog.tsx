import { useState } from 'react'
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from '@mui/material'
import { credentialConfig } from '@config/credential-interfaces'
import {
    httpFactoryDisclosureProvider,
    validateFactoryDisclosure,
    type FactoryDisclosure,
} from '@services/credential-commands'
import type { CredentialOffer } from '@services/credentials'

interface CredentialAcceptDialogProps {
    offer: CredentialOffer | null
    partyId: string | undefined
    isPending: boolean
    acceptError: Error | null
    onClose: () => void
    onAccept: (args: {
        party: string
        offerId: string
        factoryId: string
        version: 'current' | 'legacy'
        disclosure: FactoryDisclosure
    }) => void
}

export function CredentialAcceptDialog({
    offer,
    partyId,
    isPending,
    acceptError,
    onClose,
    onAccept,
}: CredentialAcceptDialogProps) {
    const [paste, setPaste] = useState('')
    const [disclosure, setDisclosure] = useState<unknown>(null)
    const [disclosureError, setDisclosureError] = useState('')
    const factoryId = typeof offer?.factory === 'string' ? offer.factory : ''
    const providerUrl = credentialConfig.disclosureBaseUrl
    const provider =
        providerUrl &&
        offer &&
        offer.registryAdmin === credentialConfig.registryAdmin
            ? httpFactoryDisclosureProvider({
                  [offer.registryAdmin]: providerUrl,
              })
            : null

    let validDisclosure: FactoryDisclosure | null = null
    try {
        if (disclosure && factoryId) {
            validDisclosure = validateFactoryDisclosure(disclosure, factoryId)
        }
    } catch {
        /* Display the source error until a valid disclosure is available. */
    }

    const reset = () => {
        setPaste('')
        setDisclosure(null)
        setDisclosureError('')
    }

    const close = () => {
        reset()
        onClose()
    }

    const loadDisclosure = async () => {
        if (!provider || !offer || !factoryId) return
        setDisclosureError('')
        try {
            const value = await provider.getFactoryDisclosure(
                offer.registryAdmin,
                factoryId
            )
            setDisclosure(validateFactoryDisclosure(value, factoryId))
        } catch (cause) {
            setDisclosure(null)
            setDisclosureError(
                cause instanceof Error ? cause.message : String(cause)
            )
        }
    }

    const pasteDisclosure = () => {
        try {
            setDisclosure(
                validateFactoryDisclosure(JSON.parse(paste), factoryId)
            )
            setDisclosureError('')
        } catch (cause) {
            setDisclosure(null)
            setDisclosureError(
                cause instanceof Error ? cause.message : String(cause)
            )
        }
    }

    return (
        <Dialog
            open={!!offer}
            onClose={() => !isPending && close()}
            fullWidth
            maxWidth="sm"
        >
            <DialogTitle>
                {offer?.request == null
                    ? 'Accept unsolicited credential offer'
                    : 'Accept request-backed credential offer'}
            </DialogTitle>
            <DialogContent sx={{ overflowWrap: 'anywhere' }}>
                <Typography variant="body2" color="text.secondary">
                    Factory contract
                </Typography>
                <Typography sx={{ mb: 1 }}>
                    {factoryId || 'Unavailable from offer'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Registry admin
                </Typography>
                <Typography sx={{ mb: 1 }}>{offer?.registryAdmin}</Typography>
                <Typography variant="body2" color="text.secondary">
                    Disclosure source
                </Typography>
                <Typography sx={{ mb: 1 }}>
                    {provider
                        ? providerUrl
                        : 'No provider configured for this registry admin. Paste issuer disclosure JSON below.'}
                </Typography>
                {provider && (
                    <Button onClick={() => void loadDisclosure()}>
                        Fetch issuer disclosure
                    </Button>
                )}
                <TextField
                    label="Paste factory disclosure JSON"
                    multiline
                    minRows={4}
                    fullWidth
                    value={paste}
                    onChange={(event) => {
                        setPaste(event.target.value)
                        setDisclosure(null)
                    }}
                    sx={{ mt: 2 }}
                />
                <Button disabled={!paste.trim()} onClick={pasteDisclosure}>
                    Use pasted disclosure
                </Button>
                {validDisclosure ? (
                    <Alert severity="success" sx={{ mt: 1 }}>
                        Factory disclosure ready. Contract ID matches the offer;
                        provenance is not verified.
                    </Alert>
                ) : (
                    <Alert severity="info" sx={{ mt: 1 }}>
                        Accept requires a factory disclosure with package-ID
                        templateId, contractId, createdEventBlob and
                        synchronizerId.
                    </Alert>
                )}
                {disclosureError && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                        {disclosureError}
                    </Alert>
                )}
                {acceptError && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                        Accept failed (check package vetting and authorization):{' '}
                        {acceptError.message}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button disabled={isPending} onClick={close}>
                    Close
                </Button>
                <Button
                    disabled={
                        !validDisclosure || !partyId || !offer || isPending
                    }
                    onClick={() => {
                        if (!partyId || !offer || !validDisclosure) return
                        onAccept({
                            party: partyId,
                            offerId: offer.contractId,
                            factoryId,
                            version: offer.version,
                            disclosure: validDisclosure,
                        })
                    }}
                >
                    Accept
                </Button>
            </DialogActions>
        </Dialog>
    )
}
