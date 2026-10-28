import { Box, Chip, MenuItem, TextField, Typography } from '@mui/material'
import type { Identifier } from '@services/credentials'
import {
    issuerOptionKey,
    issuerShortLabel,
    REGISTRATION_STATUSES,
    VALIDITY_STATUSES,
    type CredentialFilters,
    type CredentialSort,
    type RegistrationStatus,
    type ValidityStatus,
} from '@services/credential-view'

const SORT_LABELS: Record<CredentialSort, string> = {
    'registered-desc': 'Newest registered first',
    'type-asc': 'Type (A–Z)',
    'issuer-asc': 'Issuer (A–Z)',
}

interface CredentialToolbarProps {
    filters: CredentialFilters
    sort: CredentialSort
    typeOptions: string[]
    issuerOptions: Identifier[]
    onFiltersChange: (filters: CredentialFilters) => void
    onSortChange: (sort: CredentialSort) => void
}

export function CredentialToolbar({
    filters,
    sort,
    typeOptions,
    issuerOptions,
    onFiltersChange,
    onSortChange,
}: CredentialToolbarProps) {
    const toggle = <Status extends ValidityStatus | RegistrationStatus>(
        selected: Status[],
        status: Status
    ): Status[] =>
        selected.includes(status)
            ? selected.filter((entry) => entry !== status)
            : [...selected, status]

    return (
        <Box
            sx={{
                display: 'grid',
                gap: 2,
                mb: 3,
                p: 2,
                bgcolor: 'background.paper',
                borderRadius: 1,
            }}
        >
            <Box
                sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                        xs: '1fr',
                        md: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
                    },
                    alignItems: 'start',
                }}
            >
                <TextField
                    label="Search credentials"
                    placeholder="ID, type, issuer, subject or claim value"
                    value={filters.search}
                    size="small"
                    onChange={(event) =>
                        onFiltersChange({
                            ...filters,
                            search: event.target.value,
                        })
                    }
                    slotProps={{
                        htmlInput: {
                            'aria-label':
                                'Search credentials by ID, type, issuer, subject or claim value',
                        },
                    }}
                />
                <TextField
                    select
                    label="Credential type"
                    size="small"
                    value={filters.types}
                    onChange={(event) =>
                        onFiltersChange({
                            ...filters,
                            types:
                                typeof event.target.value === 'string'
                                    ? event.target.value
                                          .split(',')
                                          .filter(Boolean)
                                    : (event.target.value as string[]),
                        })
                    }
                    slotProps={{
                        select: {
                            multiple: true,
                            renderValue: (selected) =>
                                (selected as string[]).length === 0
                                    ? 'All types'
                                    : (selected as string[]).join(', '),
                            displayEmpty: true,
                        },
                    }}
                    helperText={
                        typeOptions.length === 0
                            ? 'No types loaded'
                            : `${typeOptions.length} types loaded`
                    }
                >
                    {typeOptions.map((type) => (
                        <MenuItem key={type} value={type}>
                            {type}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label="Issuer"
                    size="small"
                    value={filters.issuer}
                    onChange={(event) =>
                        onFiltersChange({
                            ...filters,
                            issuer: event.target.value,
                        })
                    }
                >
                    <MenuItem value="">All issuers</MenuItem>
                    {issuerOptions.map((issuer) => (
                        <MenuItem
                            key={issuerOptionKey(issuer)}
                            value={issuerOptionKey(issuer)}
                        >
                            {issuerShortLabel(issuer)}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    label="Sort by"
                    size="small"
                    value={sort}
                    onChange={(event) =>
                        onSortChange(event.target.value as CredentialSort)
                    }
                >
                    {(Object.keys(SORT_LABELS) as CredentialSort[]).map(
                        (option) => (
                            <MenuItem key={option} value={option}>
                                {SORT_LABELS[option]}
                            </MenuItem>
                        )
                    )}
                </TextField>
            </Box>

            <Box
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 2,
                }}
            >
                <FilterChipGroup
                    label="Credential validity"
                    options={VALIDITY_STATUSES}
                    selected={filters.validity}
                    onToggle={(status) =>
                        onFiltersChange({
                            ...filters,
                            validity: toggle(filters.validity, status),
                        })
                    }
                />
                <FilterChipGroup
                    label="Registration"
                    options={REGISTRATION_STATUSES}
                    selected={filters.registration}
                    onToggle={(status) =>
                        onFiltersChange({
                            ...filters,
                            registration: toggle(filters.registration, status),
                        })
                    }
                />
            </Box>
        </Box>
    )
}

interface FilterChipGroupProps<Status extends string> {
    label: string
    options: readonly Status[]
    selected: Status[]
    onToggle: (status: Status) => void
}

function FilterChipGroup<Status extends string>({
    label,
    options,
    selected,
    onToggle,
}: FilterChipGroupProps<Status>) {
    return (
        <Box
            role="group"
            aria-label={`${label} filter`}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
            <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textTransform: 'uppercase' }}
            >
                {label}
            </Typography>
            {options.map((status) => {
                const active = selected.includes(status)
                return (
                    <Chip
                        key={status}
                        label={status}
                        size="small"
                        clickable
                        aria-pressed={active}
                        variant={active ? 'filled' : 'outlined'}
                        onClick={() => onToggle(status)}
                        sx={{
                            borderRadius: 999,
                            ...(active
                                ? {
                                      bgcolor: (theme) =>
                                          theme.portfolio.nav.soft,
                                      color: 'common.black',
                                  }
                                : {}),
                        }}
                    />
                )
            })}
        </Box>
    )
}
