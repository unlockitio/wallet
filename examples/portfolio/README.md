# Portfolio — dApp

A feature-rich dApp showcasing a wallet portfolio built with the [`@canton-network/dapp-sdk`](https://www.npmjs.com/package/@canton-network/dapp-sdk). Built with React + TypeScript + Vite + MUI + TanStack Router/Query.

## What It Shows

- Wallet connectivity and account management
- Viewing token holdings across multiple instruments
- Initiating and settling transfers between parties
- Allocation requests and settlement workflows
- Transaction history
- Network and registry validation
- Dark/light theme support
- Credentials and stakeholder-visible DID documents from the primary party's interface-filtered ACS

## Prerequisites

- See [`docs/CONTRIBUTING.md`](../../docs/CONTRIBUTING.md) for development environment setup.
- A running [Wallet Gateway](../../docs/wallet-gateway/quickstart.md) (default: `http://localhost:3030`)

## Running

First, install and build dependencies from the repository root:

```bash
pnpm install
pnpm build:all
```

Then start the dev server from this directory:

```bash
cd examples/portfolio
pnpm dev
```

Or from the repository root:

```bash
pnpm --filter @canton-network/example-portfolio dev
```

The app will be available at [http://localhost:8081](http://localhost:8081).

## Runtime configuration

The app loads `config.json` at startup and validates it before rendering. The local/default config is in [`public/config.json`](public/config.json):

```json
{
    "amulet": {
        "validatorUrl": "http://localhost:2000/api/validator",
        "registry": "http://scan.localhost:4000/registry/"
    },
    "token": {
        "validatorUrl": "http://localhost:2000/api/validator",
        "registries": [
            {
                "name": "DA Registry",
                "partyId": "operator::1234567890",
                "url": "https://apps.da.com/registrar/operator::1234567890/"
            }
        ]
    }
}
```

The `amulet` section configures Canton Coin (Amulet) operations. The `token` section configures token-standard operations and default registries. Registry `partyId` values are optional; when omitted, the app discovers the registry admin party from the registry metadata endpoint.

For static or Docker deployments, replace or mount `/config.json`.

Credential commands use optional Vite build-time variables. All default to empty: `VITE_CREDENTIAL_REGISTRY_ADMIN` (request routing party), `VITE_CREDENTIAL_ANCHORERS` (comma-separated routing parties), `VITE_CREDENTIAL_TYPES` (comma-separated type suggestions), `VITE_CREDENTIAL_DISCLOSURE_BASE_URL` (HTTP(S) issuer disclosure endpoint for the configured registry admin), `VITE_CREDENTIAL_FACTORY` (fallback registry factory contract ID for the issue flow when none is visible in the ACS), and `VITE_CREDENTIAL_TYPES_API_URL` (optional credential registry base URL; the request dialog reads `GET <base>/v1/credential-types` and falls back to ACS-derived suggestions when it is absent or fails). That endpoint is an optional capability of the credential registry interface and is not part of the Wallet Gateway, so a LocalNet without a credential registry service has none; leave the variable empty there. The request form permits editing routing parties. Accept fetches `GET <base>/factory-disclosures/<encoded factoryContractId>` and expects `{templateId, contractId, createdEventBlob, synchronizerId}`; the issuer must supply the registry-admin-signed factory disclosure off-ledger. The holder can instead paste that JSON in the Accept dialog. The app checks the contract ID matches the offer and the package-ID template ID shape, but does not authenticate the issuer or verify the disclosed blob. Without either source, Accept remains disabled. These variables are baked into the Vite build, so configure the disclosure URL per deployment and avoid embedding secrets.

### Credential and DID navigation

The sidebar **Credentials** entry (directly below Dashboard) opens `/dashboard/credentials`, which has two tabs:

- **Credentials** — credentials visible to the primary party (credential and registration interface views joined by contract ID), and own requests with Cancel.
- **DIDs** — stakeholder-visible DID documents.

Two header buttons sit beside the page title, mirroring the dashboard Transfer button:

- **Request credential type** — one dialog with presets and manual entry. It suggests `(issuer, type)` pairs derived from credentials visible to this wallet, which is an observation and not an issuer catalogue, and optionally merges entries from `VITE_CREDENTIAL_TYPES_API_URL`. Selecting a pair pre-fills the requested type plus the registry admin and anchorers taken from that observed credential, all still editable. The request carries only the type and its routing parties: the protocol has no issuer field, so it is addressed to the registry admin and the anchorers rather than to the issuer itself.

    The registry read follows the `CredentialTypeCollection` contract: `{items, page, pageSize, hasNext}` with zero-based `page` and `pageSize` capped at 100, and it pages while `hasNext` is true up to a local bound of 10 pages or 500 pairs. A body that is not that shape is rejected whole rather than partly read. A registry aggregate item carries only `issuer`, `credentialType` and its observation window: it names no registry admin and no anchorers, so a registry pair is only offered when the same issuer string also appears in a credential visible here, whose routing is then reused. Pairs reached by neither route, a page bound or entry cap hit while the registry reported more, and a malformed page are each reported in the dialog, so a shortened catalogue is never shown as a complete one.

- **Issue credential** — a three-step issuer-side dialog that creates a request-bound `DemoCredentialOffer`. The dialog header states that it creates an offer the holder accepts later, not a direct issuance. Step 1 lists pending `CredentialRequest`s the primary party sees as registry admin or anchorer; issuance answers a holder's request, and an unsolicited offer is not supported by the current protocol. Step 2 collects the credential payload: the issuer is the primary party and must be one of the request anchorers, the types are `VerifiableCredential` plus the requested type with add-only extras, the subject defaults to the holder, claims are text-valued, and the registration retention `expiresAt` is distinct from the credential's own validity. The factory comes from `CredentialRegistryFactory` contracts visible for the request's registry admin, or from `VITE_CREDENTIAL_FACTORY`. Step 3 names the exact required signatories (request anchorers, issuer, registry admin), marks which of them this wallet user controls, and disables submit when any is missing, because the registry admin would then have to co-sign off-wallet. On success the dialog states that the holder must accept the offer before the credential is created.

Pending credential offers live on the **Credential offers** tab of `/dashboard/offers`, alongside the existing Transfers and Allocations tabs, with Accept (factory disclosure dialog) and Reject. The sidebar Offers badge counts pending credential offers together with active token-standard offers.

An empty list distinguishes its two causes: the hint about a missing package appears only when the ACS read actually reported the interface package absent, otherwise the message names the primary party the read was filtered by.

### DID read-only manual check

With the DID interfaces package vetted on the participant, connect a wallet whose primary party is a stakeholder of a DID contract and open the **DIDs** tab under **Credentials**. Check the DID document, controllers, methods, relationships, services and any registered metadata. Switch to a primary party that is not a stakeholder and confirm that contract is absent. Without the DID package, the tab displays an availability message. This is an ACS stakeholder view only: it cannot resolve other parties' DIDs, assert aliases, or create, update or deactivate DID contracts. The V1 document view has no `alsoKnownAs` field, so none is displayed.

Alternatively, start all services (Wallet Gateway + example dApps) together from the repository root:

```bash
pnpm start:all     # starts all services via pm2
pnpm stop:all      # stops all services
```

## Further Reading

See the [dApp Building Guide](../../docs/dapp-building) for full documentation on the dApp SDK, Wallet Gateway configuration, APIs, and signing providers.
