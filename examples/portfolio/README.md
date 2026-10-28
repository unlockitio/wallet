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

- **Request credential type** — selects or manually enters a full Canton Party issuer and a type, plus registry admin and anchorers. Observed `(issuer, type)` pairs are suggestions, not a catalogue. Textual issuers cannot pre-fill a Party ID. The request contains no claims, subject or proof. The issuer observes and can approve directly only when it is the sole anchorer; the registry admin observes the request and signs the factory, not a separate per-payload approval.

    The registry read follows the `CredentialTypeCollection` contract: `{items, page, pageSize, hasNext}` with zero-based `page` and `pageSize` capped at 100, and it pages while `hasNext` is true up to a local bound of 10 pages or 500 pairs. A body that is not that shape is rejected whole rather than partly read. A registry aggregate item carries only `issuer`, `credentialType` and its observation window: it names no registry admin and no anchorers, so a registry pair is only offered when the same issuer string also appears in a credential visible here, whose routing is then reused. Pairs reached by neither route, a page bound or entry cap hit while the registry reported more, and a malformed page are each reported in the dialog, so a shortened catalogue is never shown as a complete one.

- **Issue credential** — defaults to an unsolicited `DemoCredentialOffer` (`request: null`), with full holder Party ID, type, issuer-provided claims and validity, registry admin, anchorers and factory. All offer signatories (issuer, anchorers, admin) must be controlled by the submitting wallet user. The holder sees it under Offers and must Accept with explicit factory disclosure or Reject. Alternatively, select a current issuer-targeted request to exercise `CredentialRequest_Approve` as the issuer only, supplying the full credential and registration plus factory. Approval issues directly; no second holder acceptance or offer is created. Direct approval is disabled for old package requests, requests for another issuer, or distinct anchorers requiring unsupported preauthorization. Factory visibility to the issuer, or explicit disclosure, is required; a configured factory ID alone does not grant visibility. The admin signs the factory, not a separate review of every approval payload.

Pending unsolicited and request-backed credential offers live on the **Credential offers** tab of `/dashboard/offers`, alongside the existing Transfers and Allocations tabs, with Accept (factory disclosure dialog) and Reject. The sidebar Offers badge counts pending credential offers together with active token-standard offers.

New flows target interface package name `canton-network-credentials-interfaces-v2` v0.3.0 (ID `68824ddd934993972c34c3d7a1e496edd03867210e4b003bbe6e75636c497f8d`) and concrete model name `canton-network-credentials-demo-v2` v0.2.0 (ID `4f9632402336b11e48b82abe9413cb8e235ea9ffbde49b0e55b1f8f8a99e02ed`). The ACS reads new interface names and pinned old interface ID `8e2be0a6512d780aeeeffa7fe791737de737256e944466301336d28544e8e0fc` separately, preserving legacy contract visibility, offer Accept/Reject and request Cancel. The old model ID starts with `6ee444`. Old requests have no requested issuer and cannot use direct Approve; old offers require a request, while new offers may be unsolicited. There is no automatic migration; old contracts remain active. The new DARs are uploaded and vetted on the current LocalNet: issuer-only direct approval was exercised live through the Wallet Gateway (request created as the holder, then `CredentialRequest_Approve` as the issuer via real prepare/sign/execute, producing a holder-signatory `Credential` and its `RegisteredCredential`), and the unsolicited offer plus holder `Accept` was exercised against the raw Ledger API rather than through the dApp UI. `/v1/credential-types` is specified but absent on LocalNet, and remains optional.

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
