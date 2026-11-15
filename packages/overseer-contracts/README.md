# overseer-contracts

The shared contract between a forge's Overseer and the programs that read it: the documents the Overseer serves and reads, as
TypeScript types, the forge system versions a reader knows, and each endpoint's version. Forge produces these documents; Gaia reads them and sends the commands.

| Export | Holds |
| --- | --- |
| `overseer-contracts/VersionsDocument` | `GET /api/versions`, unversioned and never removed: a server's system version and its minimum supported, and `SystemVersion` |
| `overseer-contracts/ForgeSystemVersions` | the forge version a reader built against this package supports, the oldest it still talks to, and each forge endpoint's path version |
| `overseer-contracts/IdentityDocument` | `GET /api/identity`, with the `contracts` it names |
| `overseer-contracts/BoardSummaryDocument` | `GET /api/summary` |
| `overseer-contracts/MonitorSnapshotDocument` | `GET /api/monitor` and each `monitor` event, at `monitorVersion` 3 and the 1 and 2 a reader still reads |
| `overseer-contracts/ForgeControlCommand` | the bodies of `POST /api/commands`, at control 2 and control 1 |
| `overseer-contracts/EmbedChannelMessage` | the messages between a framing page and the Bridge in its frame, each with its sender's system version |
| `overseer-contracts/OverseerContractVersions` | the integer version each document has always carried, the older ones the types still describe, and the first control version of Flint's brain |

## What it holds, and what it does not

Types and versions only, and no imports. No ingestion, migration, check or mapping lives here: each program maps the documents into its
own model at its own boundary (Gaia in `apps/gaia/src/adapters/forge-api/`). A type names the keys a reader checks; a key no reader
checks may be left out.

## Three kinds of version, never mixed

- **The system version** is the forge's own, `major.minor` by interoperability: a minor change only adds, so every client of that major
  keeps working; a major change may break a client of an older major. A forge publishes it, with the oldest forge version a client may
  have been built for and still be served, at `GET /api/versions`, a path never versioned and never removed. `SUPPORTED_FORGE_VERSION`
  is the forge version these types describe, which a reader is built for; `MINIMUM_FORGE_VERSION` the oldest it still talks to. A reader
  decides from the two and the forge's answer whether it can talk to that forge at all. The message protocols (the monitor stream, the
  embed channel) carry the system version in their handshake and in every message.
- **The endpoint version** is in the path, `/api/v<n>/<endpoint>`, per endpoint (`OVERSEER_ENDPOINT_VERSIONS`); a breaking change to one
  endpoint is served at the next version beside the old, until the forge raises its minimum. A document carries no version of its own
  for this. The integer key each document has always carried (`monitorVersion`, `identityVersion`, the identity's `contracts`) stays,
  since every released reader checks it, and `OverseerContractVersions` names it.
- **The package version** (`package.json`) is this package's own semantic version. It says which types and versions a build compiles
  against, never what runs: a running forge and a running Gaia meet only on the wire, whatever package versions they were built with. A
  forge system minor bump is a package minor bump; a system major bump, or a removed or changed type, a package major bump.

Forge and Gaia are released as independent packages, so both depend on this one by a version range (`workspace:^` in the repository,
which becomes `^0.1.0` on release), never `workspace:*`. The package is publishable.

## Recordings stay with the reader

Gaia tests what it does with a forge's answers against answers recorded from released forges (`apps/gaia/src/testing/recordings/`),
stamped with the forge's install and code version, never against the forge source in the same repository. A running Gaia meets forges
of other versions, released before or after it, and only a recording of a real released forge shows what such a forge sends; a test
against the source beside it would only prove that two builds of the same commit agree. The types here say what a forge promises; the
recordings show what one sent.

## Verify

```bash
bun run verify
```

typechecks, lints and runs the one spec, which holds that the versions are consistent: whole versions, older versions below the current
ones, and a minimum forge version no newer than the supported one. `FORGE_REQUIREMENTS.md` lists what forge must do for this model:
`/api/versions`, the system version, versioned paths, and the system version in its message protocols.
