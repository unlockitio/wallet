import { useState } from 'react'
import { Box, Tab, Tabs, Typography } from '@mui/material'
import { createFileRoute } from '@tanstack/react-router'
import { CredentialIssueDialog } from '@components/credentials/credential-issue-dialog'
import { CredentialRequestDialog } from '@components/credentials/credential-request-dialog'
import { CredentialsPanel } from '@components/credentials/credentials-panel'
import { DidsPanel } from '@components/credentials/dids-panel'
import { PillButton } from '@components/ui/PillButton'

export const Route = createFileRoute('/dashboard/credentials')({
    component: RouteComponent,
})

type CredentialTab = 'credentials' | 'dids'

function RouteComponent() {
    const [selectedTab, setSelectedTab] = useState<CredentialTab>('credentials')
    const [issueOpen, setIssueOpen] = useState(false)
    const [requestOpen, setRequestOpen] = useState(false)

    return (
        <Box sx={{ px: 5.5, py: 7.5 }}>
            <Box
                sx={{
                    mb: 5,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 2,
                }}
            >
                <Box>
                    <Typography variant="h4" component="h1" sx={{ mb: 1.5 }}>
                        Credentials
                    </Typography>
                    <Typography variant="body1" color="text.primary">
                        Credentials and DID documents visible to your primary
                        wallet
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5, flexShrink: 0 }}>
                    <PillButton
                        type="button"
                        tone="neutral"
                        onClick={() => setRequestOpen(true)}
                    >
                        Request credential type
                    </PillButton>
                    <PillButton
                        type="button"
                        onClick={() => setIssueOpen(true)}
                    >
                        Issue credential
                    </PillButton>
                </Box>
            </Box>

            <Box
                sx={{
                    mb: 4,
                    borderBottom: (theme) =>
                        `1px solid ${theme.palette.divider}`,
                }}
            >
                <Tabs
                    value={selectedTab}
                    onChange={(_, nextValue: CredentialTab) =>
                        setSelectedTab(nextValue)
                    }
                    aria-label="Credential view"
                    textColor="inherit"
                    slotProps={{
                        indicator: {
                            sx: {
                                backgroundColor: (theme) =>
                                    theme.portfolio.nav.main,
                            },
                        },
                    }}
                    sx={{
                        minHeight: 'unset',
                        '& .MuiTab-root': {
                            minHeight: 'unset',
                            px: 0,
                            py: 0,
                            pb: 2,
                            mr: 2,
                            color: 'text.secondary',
                            fontSize: (theme) =>
                                theme.typography.body1.fontSize,
                            lineHeight: (theme) =>
                                theme.typography.body1.lineHeight,
                            textTransform: 'none',
                            alignItems: 'flex-start',
                            textAlign: 'left',
                        },
                        '& .Mui-selected': {
                            color: 'text.primary',
                            fontWeight: 600,
                        },
                    }}
                >
                    <Tab
                        disableRipple
                        value="credentials"
                        label="Credentials"
                    />
                    <Tab disableRipple value="dids" label="DIDs" />
                </Tabs>
            </Box>

            {selectedTab === 'credentials' ? (
                <CredentialsPanel />
            ) : (
                <DidsPanel />
            )}

            <CredentialIssueDialog
                open={issueOpen}
                onClose={() => setIssueOpen(false)}
            />
            <CredentialRequestDialog
                open={requestOpen}
                onClose={() => setRequestOpen(false)}
            />
        </Box>
    )
}
