import { useState } from 'react'
import { Alert, Box, Button, Paper, Typography } from '@mui/material'
import { useCredentialCommands } from '@hooks/useCredentialCommands'
import { useCredentials } from '@hooks/useCredentials'
import { emptyVisibilityMessage } from '@services/visibility-message'
import { CredentialList } from './credential-list'
import { CredentialRowSkeleton } from './credential-row'

export function CredentialsPanel() {
    const { data, error, isLoading, partyId, partyHint, dataUpdatedAt } =
        useCredentials()
    const commands = useCredentialCommands()
    const [actionError, setActionError] = useState('')

    const run = async (action: () => Promise<unknown>) => {
        setActionError('')
        try {
            await action()
        } catch (cause) {
            setActionError(
                cause instanceof Error ? cause.message : String(cause)
            )
        }
    }

    if (!partyId) {
        return (
            <Alert severity="info">
                Select a primary wallet to view credentials.
            </Alert>
        )
    }
    if (error) {
        return (
            <Alert severity="error">Unable to load credentials: {error}</Alert>
        )
    }

    const visibility = { packageMissing: data.packageMissing, partyHint }

    return (
        <>
            <Box component="section" sx={{ mb: 4 }}>
                <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
                    Visible credentials
                </Typography>
                <CredentialList
                    credentials={data.credentials}
                    partyHint={partyHint}
                    isLoading={isLoading}
                    asOf={dataUpdatedAt}
                    emptyMessage={emptyVisibilityMessage(
                        'credentials',
                        'credential interfaces',
                        visibility
                    )}
                />
            </Box>

            <Box component="section" sx={{ mb: 4 }}>
                <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
                    Own requests
                </Typography>
                {isLoading && <CredentialRowSkeleton />}
                {!isLoading && data.requests.length === 0 && (
                    <Alert severity="info">
                        {emptyVisibilityMessage(
                            'own credential requests',
                            'credential interfaces',
                            visibility
                        )}
                    </Alert>
                )}
                {data.requests.map((request) => (
                    <Paper
                        key={request.contractId}
                        sx={{ p: 2, my: 1, overflowWrap: 'anywhere' }}
                    >
                        <Typography>
                            Requested type: {request.requestedType}
                        </Typography>
                        <Typography>
                            {request.version === 'current'
                                ? `Requested issuer: ${request.requestedIssuer}`
                                : 'Old package request: no requested issuer; cannot use direct approval.'}
                        </Typography>
                        <Typography>
                            Registry admin: {request.registryAdmin}
                        </Typography>
                        <Typography>
                            Anchorers: {request.anchorers.join(', ') || 'None'}
                        </Typography>
                        <Button
                            disabled={commands.cancel.isPending}
                            onClick={() =>
                                void run(() =>
                                    commands.cancel.mutateAsync({
                                        party: partyId,
                                        requestId: request.contractId,
                                        version: request.version,
                                    })
                                )
                            }
                        >
                            Cancel
                        </Button>
                    </Paper>
                ))}
            </Box>

            {actionError && (
                <Alert severity="error">
                    Credential transaction failed (check package vetting and
                    authorization): {actionError}
                </Alert>
            )}
        </>
    )
}
