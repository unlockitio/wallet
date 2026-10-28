import { useMemo, useState } from 'react'
import { Alert, Box, TablePagination } from '@mui/material'
import type { Credential } from '@services/credentials'
import {
    credentialIssuerOptions,
    credentialPage,
    credentialTypeOptions,
    DEFAULT_PAGE_SIZE,
    emptyCredentialFilters,
    hasActiveFilters,
    PAGE_SIZE_OPTIONS,
    pageRangeLabel,
    type CredentialFilters,
    type CredentialSort,
} from '@services/credential-view'
import { CredentialDetailDialog } from './credential-detail-dialog'
import { CredentialRow, CredentialRowSkeleton } from './credential-row'
import { CredentialToolbar } from './credential-toolbar'

interface CredentialListProps {
    credentials: Credential[]
    partyHint: string | null
    isLoading: boolean
    emptyMessage: string
    // The instant the credentials were read, used to classify validity.
    asOf: number
}

export function CredentialList({
    credentials,
    partyHint,
    isLoading,
    emptyMessage,
    asOf,
}: CredentialListProps) {
    const [filters, setFilters] = useState<CredentialFilters>(
        emptyCredentialFilters
    )
    const [sort, setSort] = useState<CredentialSort>('registered-desc')
    const [page, setPage] = useState(0)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Filtering changes which results exist, so a page index from the previous
    // result set would point at unrelated rows. Reset where the change happens
    // rather than in an effect, which would render the stale page first.
    const changeFilters = (next: CredentialFilters) => {
        setFilters(next)
        setPage(0)
    }
    const changeSort = (next: CredentialSort) => {
        setSort(next)
        setPage(0)
    }
    const changePageSize = (next: number) => {
        setPageSize(next)
        setPage(0)
    }

    const typeOptions = useMemo(
        () => credentialTypeOptions(credentials),
        [credentials]
    )
    const issuerOptions = useMemo(
        () => credentialIssuerOptions(credentials),
        [credentials]
    )
    const result = useMemo(
        () => credentialPage(credentials, filters, sort, page, pageSize, asOf),
        [credentials, filters, sort, page, pageSize, asOf]
    )
    const selected = useMemo(
        () =>
            credentials.find(
                (credential) => credential.contractId === selectedId
            ) ?? null,
        [credentials, selectedId]
    )

    if (isLoading) {
        return (
            <Box sx={{ display: 'grid', gap: 2 }}>
                {Array.from({ length: 5 }, (_, index) => (
                    <CredentialRowSkeleton key={index} />
                ))}
            </Box>
        )
    }

    if (credentials.length === 0) {
        return <Alert severity="info">{emptyMessage}</Alert>
    }

    return (
        <>
            <CredentialToolbar
                filters={filters}
                sort={sort}
                typeOptions={typeOptions}
                issuerOptions={issuerOptions}
                onFiltersChange={changeFilters}
                onSortChange={changeSort}
            />

            {result.matched === 0 ? (
                <Alert severity="info">
                    {hasActiveFilters(filters)
                        ? 'No credentials match the current filters.'
                        : emptyMessage}
                </Alert>
            ) : (
                <>
                    <Box sx={{ display: 'grid', gap: 2 }}>
                        {result.page.items.map((credential) => (
                            <CredentialRow
                                key={credential.contractId}
                                credential={credential}
                                partyHint={partyHint}
                                now={asOf}
                                onOpen={() =>
                                    setSelectedId(credential.contractId)
                                }
                            />
                        ))}
                    </Box>
                    <TablePagination
                        component="div"
                        count={result.page.total}
                        page={result.page.page}
                        rowsPerPage={result.page.pageSize}
                        rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
                        labelRowsPerPage="Credentials per page"
                        labelDisplayedRows={() => pageRangeLabel(result.page)}
                        onPageChange={(_, nextPage) => setPage(nextPage)}
                        onRowsPerPageChange={(event) =>
                            changePageSize(Number(event.target.value))
                        }
                        slotProps={{
                            select: {
                                inputProps: {
                                    'aria-label': 'Credentials per page',
                                },
                            },
                        }}
                        sx={{ mt: 1 }}
                    />
                </>
            )}

            <CredentialDetailDialog
                credential={selected}
                now={asOf}
                onClose={() => setSelectedId(null)}
            />
        </>
    )
}
