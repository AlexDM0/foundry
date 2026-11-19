# forge-contracts

What a forge serves and reads, as TypeScript types: its Overseer's documents, the commands it takes, the embed channel of its Bridge, its
system versions and its compatibility registry. Forge owns it and decides every version in it; any client builds against it. The package
names no client.

| Export | Holds |
| --- | --- |
| `forge-contracts/ForgeSystemVersions` | `FORGE_SYSTEM_VERSIONS`, what forge answers at `GET /api/versions`: its current system version and its minimum supported |
| `forge-contracts/ForgeCompatibilityRegistry` | `FORGE_COMPATIBILITY_REGISTRY`: every versioned endpoint and every compatibility path forge keeps, each with its lifetime |
| `forge-contracts/IdentityDocument` | `GET /api/v1/identity`, with the `contracts` it names |
| `forge-contracts/BoardSummaryDocument` | `GET /api/v1/summary` |
| `forge-contracts/MonitorSnapshotDocument` | `GET /api/v2/monitor` and each `monitor` event of `GET /api/v2/monitor/events`, at `monitorVersion` 3; the stream's `handshake` and `monitor` events, each with the forge's system version |
| `forge-contracts/MonitorInterruptionCauses` | `MONITOR_INTERRUPTION_CAUSES`, every cause a monitor job's `interruption` names, as the wire spells it |
| `forge-contracts/ForgePresenceDocument` | `GET /api/v1/presence` from forge 1.20: the last start, Talos's supervision, the work that waits by cause, the held merges and the crash logs |
| `forge-contracts/ForgeCrashLogDocument` | `GET /api/v1/crash-log?number=<n>` from forge 1.20, the newest log without the query |
| `forge-contracts/ForgeControlCommand` | the bodies of `POST /api/v1/commands`, Flint's brain's two kinds from forge 1.1 |
| `forge-contracts/ForgeRefusalDocument` | a refusal as forge serves it from forge 1.21: its reason code, its fields and the sentence its command line prints, as `POST /api/v1/commands` answers it |
| `forge-contracts/ForgeBoardDocument` | the board document, `GET /api/v1/board` from forge 1.21: a board's every fact a view reads, its parts in the six files below |
| `forge-contracts/BoardPageDocuments` | the board document's `page`: the tickets, the task rows, the worded log, the epics, the open filing drafts and the Board's facts of each row and ticket |
| `forge-contracts/BoardJobDocuments` | the board document's jobs with their live facts, the jobs that left the board, and each open ticket's forecast |
| `forge-contracts/BoardConversationDocuments` | the board document's open decisions and incidents, the records a settled one leaves, and the picture limits |
| `forge-contracts/BoardPipelineDocuments` | the board document's pipeline facts: the stored pipeline, the open setup record, the flow, the gates' runs and the pipeline's records |
| `forge-contracts/BoardMergeQueueDocument` | the board document's merge queue, per target |
| `forge-contracts/BoardLimitsDocument` | the board document's `limits`: how a view cuts a stamp and lays out the progress chart |
| `forge-contracts/BoardVocabulary` | the values of the board document's unions a view iterates or compares, each as a list in forge's order and its type |
| `forge-contracts/BoardCommand` | `ForgeBoardCommand`, the board's command kinds of `POST /api/v1/commands` from forge 1.21, with their payloads and the typed draft edit |
| `forge-contracts/EmbedChannelMessage` | the messages between a framing page and the Bridge in its frame, each with its sender's system version |
| `forge-contracts/EmbedMode` | the query a framing page opens the Bridge with, `?embedded=frame` |
| `forge-contracts/OverseerContractVersions` | the integer version each document has always carried |

`SystemVersion`, `VersionsDocument` and the registry's logic are the `system-versions` package's, which names no server either.

## What it holds, and what it does not

Types, versions, the registry, and the value lists of the unions its documents carry, only. No ingestion, migration, check or mapping lives here: each client maps the documents into its own
model at its own boundary. A type names the keys a client checks; a key no client checks may be left out.

## Versions

- **The system version** is forge's own, `major.minor` by interoperability, never this package's version: a minor change only adds, so
  every client built for that major keeps working; a major change may break one. Forge publishes it, with its **minimum supported**, the
  oldest forge version a client may have been built for and still be served, at `GET /api/versions`, a path never versioned and never
  removed. Forge alone decides the minimum, whoever calls it. Version 0.0 stands for every forge released before system versions.
- **REST endpoints are versioned by path**, `/api/v<n>/<endpoint>`, side by side; a breaking change to one endpoint is served at the next
  version beside the old. An answer carries no per-endpoint version. The message protocols (the monitor stream, the embed channel) carry
  the system version in their handshake and in every message.
- **The compatibility registry** has one entry per thing forge keeps for clients of its older versions: each versioned endpoint, and each
  compatibility path that is no endpoint, such as the unversioned routes and the integer version keys released clients check. Each names
  the forge version that introduced it and the last whose clients still need it. An entry forge has not shipped yet is marked `authored`.
  A client calls, of each endpoint, the version the registry serves the forge version it is built for.
- **The package version** (`package.json`) is this package's own semantic version. It says which types a build compiles against, never
  what runs: a running forge and a running client meet only on the wire. A forge system minor bump is a package minor bump; a system major
  bump, or a removed or changed type, a package major bump. The package is publishable, and an app depends on it by a version range
  (`workspace:^` in the repository), never `workspace:*`.

## Raising the minimum

```bash
bun run versions:raise-minimum 1.0
```

is a dry run: it lists what becomes removable at that minimum and what must stay, and changes nothing. Raising the minimum is then the
one-line change to `FORGE_SYSTEM_VERSIONS.minimumSupported`, after which `ForgeCompatibilityRegistry.spec.ts` fails until every listed
entry, and the code in forge it stands for, is removed, or its entry corrected.

## Verify

```bash
bun run verify
```

typechecks, lints and runs the specs: the contract versions hold together, the registry agrees with forge's versions, and no file of
the package names a client.
