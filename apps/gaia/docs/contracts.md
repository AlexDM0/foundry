# Contracts

Every versioned contract Gaia reads, writes, sends or serves. Forge and Gaia are released apart and may run at any two versions, so
they meet only through the model below. The one version Gaia knows of each contract lives once: in `CONTRACT_VERSIONS`
(`src/shared/constants/ContractVersions.ts`) for the forge's contracts and Gaia's stored files, a Hephaestus's from the `forge-contracts`
package (`packages/forge-contracts/`), which forge produces; and in `PAGE_CONTRACT_VERSIONS` (`src/shared/constants/PageContractVersions.ts`)
for what Gaia's server serves its page and launcher, which the page reads and which imports nothing. The tables below name each with that
version, and `src/shared/constants/ContractVersions.reference.spec.ts` fails
`bun run verify` when a table and its constant disagree. A shape is defined once, in the module the table names; this file does not repeat
its keys.

## The version model

- **Forge never knows Gaia.** Gaia sits on top of forge. Nothing forge serves, and nothing in a package forge depends on
  (`forge-contracts`, `brand`, the design system), names Gaia; forge speaks of a client or a host (`docs/forge-requirements.md`).
- **A system version per system.** Forge and Gaia each have one system version, major.minor, by interoperability, never their package
  version: a minor change only adds, and every client of that major keeps working; a major change may break a client of an older major.
  Gaia's is `GAIA_SYSTEM_VERSION` (`src/shared/constants/GaiaSystemVersions.ts`); forge's is forge's own,
  `forge-contracts/ForgeSystemVersions`.
- **`GET /api/versions`, unversioned and never removed.** A server answers its `current` system version and its `minimumSupported`, the
  oldest version of its own system a client may have been built for and still be served (`system-versions/VersionsDocument`). The server
  alone decides the minimum, whoever calls it. Gaia's own server answers it for its page and its launcher
  (`src/features/page-server/routes/VersionsRoute.ts`), and Gaia asks it of every forge first.
- **Endpoints versioned by path.** A route is served at `/api/v<n>/<endpoint>`, and an endpoint's breaking change is served side by side
  at the next `n` until the minimum is raised (`src/lib/api-paths/ApiPathUtil.ts`). A REST answer carries no per-endpoint version: each
  client version knows which endpoint versions it calls.
- **Message protocols carry the system version.** The fleet stream opens on a `handshake` event and carries Gaia's `systemVersion` in every
  `fleet` event. A page that hears a handshake of another system major is a stale page and reloads once.
- **A compatibility registry per server.** Each server keeps one entry per thing it serves for clients of its older versions: every
  versioned endpoint, and every compatibility path that is no endpoint (an unversioned alias, a payload migration, an older message
  form), each with the version that introduced it and the last version whose clients still need it. The logic is the `system-versions`
  package's (`system-versions/CompatibilityRegistryUtil`), which names no server. Forge's is `forge-contracts/ForgeCompatibilityRegistry`;
  Gaia's own, toward its page and launcher, is `GAIA_COMPATIBILITY_REGISTRY` (`src/shared/constants/GaiaCompatibilityRegistry.ts`). Since
  Gaia 2.0 and forge 2.0, and now at 4.0 with each minimum at 4.0, neither registry holds a compatibility path: only routes. `bun run
  versions:raise-minimum <major.minor>`, in `apps/gaia` for Gaia's and in `packages/forge-contracts` for forge's, is the dry run of a raise
  of the minimum: it lists what becomes removable and what must stay. The raise is then the one-line change of the minimum, after which the
  registry's spec fails until each listed entry, and what it keeps, is removed or its entry corrected.
- **Gaia supports exactly one forge version**, `SUPPORTED_FORGE_VERSION` (`src/lib/forge-client/constants/SupportedForgeVersions.ts`), and
  keeps nothing for any other: no migration of an older forge document, no fallback to forge's unversioned paths, no recording of an older
  forge read. The version of each forge endpoint Gaia calls is the one forge's registry serves `SUPPORTED_FORGE_VERSION`
  (`forgeEndpointVersionOf` in `src/lib/forge-client/ForgeClient.ts`), never a list of Gaia's own. In the monorepo Gaia strives for forge's
  latest: `bun run verify` warns, and does not fail, while `SUPPORTED_FORGE_VERSION` is behind forge's current version in
  `forge-contracts` (`src/testing/CheckSupportedForgeVersion.ts`).
- **The keys documents have always carried stay, as whole versions.** `monitorVersion`, `identityVersion`, `contracts`, `fleetVersion`,
  `answerVersion` and the like keep their integer, and Gaia reads exactly one number of each: the one the forge version it supports serves,
  or Gaia's own. A known number reads with its unknown keys passed over; another, older or newer, never reaches a mapper.
  `src/shared/utils/ContractVersionUtil.ts` holds the reading rule once. Forge's integer keys are its current contract, no
  compatibility path: forge 4.0 serves them with its minimum at 4.0, and its API reference says so.
- **Stored files keep their own format version**, major.minor: the integer `version` (or `recordingVersion`) is the major, an optional
  `minor` the minor, absent read as 0. A newer minor of a known major is read, and a file Gaia would rewrite at a newer minor is kept as
  it is (`kept-newer-version`), since the rewrite would drop the keys it adds.

## The verdict on a forge

One verdict per forge, from its `/api/versions` and `SUPPORTED_FORGE_VERSION` (`src/shared/utils/ForgeVersionsUtil.ts`), carried in the
internal model (`ForgeReading.versions`) and the page contract (`FleetDocumentForge.versions`: the verdict and the forge's `current` and
`minimumSupported`; Gaia's own system version and the forge version it supports in `FleetDocumentGaia.versions`). A forge read without its
`/api/versions`, dormant or unreachable, carries no verdict.

| Verdict | When | What Gaia does |
| --- | --- | --- |
| `current` | The forge's `current` is `SUPPORTED_FORGE_VERSION` | Reads it in full at the versioned paths. |
| `ahead` | The forge's `minimumSupported` is at or below `SUPPORTED_FORGE_VERSION`, and its `current` above it | Reads it in full at the versioned paths, with what this Gaia knows; full use of the forge needs a newer Gaia. Quiet: explains only. |
| `newer` | `SUPPORTED_FORGE_VERSION` is below the forge's `minimumSupported`: they cannot talk | Asks nothing more; reads the forge at fidelity `newer-contract`. Gaia needs an update: it explains only, offers no update of itself and names no command, and offers Open in new tab. |
| `older` | The forge's `current` is below `SUPPORTED_FORGE_VERSION`, or the forge serves no `/api/versions` (it refuses the path as any unknown one): every forge from before system versions | Asks nothing more; reads the forge at fidelity `older-contract`. The forge needs an update: Update forge, which Gaia runs through the forge program, with its pending, done and refused states. |

A `/api/versions` answer that is no versions document, as another program on the port gives, is a failed try, as no answer is.

## Gaia's endpoints

Each route of Gaia's server at its endpoint version, from `GAIA_ENDPOINT_VERSIONS` (`src/shared/constants/GaiaSystemVersions.ts`), with its
lifetime in `GAIA_COMPATIBILITY_REGISTRY`, served at `/api/v<n>/<endpoint>` alone, behind the Host, Origin, CSP and session guards
(`src/features/page-server/PageServer.ts`). Gaia answers no route at `/api/<endpoint>` since 2.0, and its minimum supported is 4.0: only a page
or a launcher of Gaia 1 called those paths, and no caller in this repository does. A version above 1 names the breaking changes the
endpoint already had.

| Key in `GAIA_ENDPOINT_VERSIONS` | Version | Path | Breaking changes |
| --- | --- | --- | --- |
| `health` | 1 | `GET /api/v1/health` | none |
| `sessionCodes` | 1 | `POST /api/v1/session-codes` | none |
| `session` | 1 | `POST /api/v1/session` | none |
| `fleet` | 12 | `GET /api/v12/fleet` | monitor contract 2's warning kinds (2); a part since removed (3); a forge too old to talk to, fidelity `older-contract` (4); board routes in place of the fragments of the forge's own page (5); each forge's presence, crash, crash logs and waiting work, and the forge alerts in what waits (6); each forge's outage endings, their total, and the fleet's alert `agents-ended-on-outage`, an attention item of no one forge (7); each forge's `runningVersions`, the running and the newest Hephaestus and Talos (8); no forge's `embed` contract in `contracts` and `knownContracts` (9); in Gaia 2.0, no Flint's brain on a forge, no brain row among its agents, and no `kind` or `tokens` on an activity entry (10); in Gaia 3.0, a forge's serving process named Hephaestus in its keys, `hephaestusStartedAt`, `hephaestusRunning` and `hephaestusNewest`, and the component `hephaestus` (11); in Gaia 4.0, a restarting forge's condition `restarting` and the look of a failed restart `restart-failed` (12) |
| `events` | 12 | `GET /api/v12/events` | as `fleet`, whose document each `fleet` event carries |
| `commands` | 6 | `POST /api/v6/commands` | Gaia's own sentences for forge refusals (2); commands since removed (3); `forge-unpause` in place of `forge-resume`, and `forge-interrupted-work-resume` (4); `forge-talos-restart`, sent as the forge's `talos-restart` (a kind it only adds); no `forge-open-in-browser`, since no forge command opens a board (5); in Gaia 2.0, no command that starts or stops a brain of Flint (6) |
| `forgeBoard` | 1 | `GET /api/v1/forges/<trackerId>/board` | none |
| `forgeBoardEvents` | 1 | `GET /api/v1/forges/<trackerId>/board/events` | none |
| `forgeJobStream` | 1 | `GET /api/v1/forges/<trackerId>/jobs/<jobId>/stream?after=<cursor>` | none |
| `forgeProfileStream` | 1 | `GET /api/v1/forges/<trackerId>/profiles/<profileRunId>/stream?after=<line>` | none |
| `forgePictureUpload` | 1 | `POST /api/v1/forges/<trackerId>/pictures`, raw bytes to `BOARD_PICTURE_UPLOAD_LIMIT_BYTES` | none |
| `forgePicture` | 1 | `GET /api/v1/forges/<trackerId>/pictures/<pictureId>` | none |
| `forgeCommands` | 1 | `POST /api/v1/forges/<trackerId>/commands` | none |
| `forgeCrashLog` | 1 | `GET /api/v1/forges/<trackerId>/crash-logs/<number>` | none |
| `forgeTicketDocuments` | 1 | `GET /api/v1/forges/<trackerId>/tickets/<ticketId>/documents` | none |

`GET /api/versions` is the one route served at an unversioned path. The seven `forge*` routes, Gaia's relay of one forge's board,
came with Gaia 1.2, and `forgeCrashLog`, one crash log of a forge that serves again, with Gaia 1.3; Gaia 2.0 took Flint's brain out of the
fleet document and the commands and dates `commands` at 2.0; Gaia 3.0 named a forge's serving process Hephaestus in the fleet document;
Gaia 4.0 names a restarting forge's condition and the look of a failed restart in it, dates `fleet` and `events` at 4.0, and raised its
minimum supported to 4.0; every route reads a body of at most 65,536 bytes, the picture upload one of at most `BOARD_PICTURE_UPLOAD_LIMIT_BYTES`
(`src/lib/local-http-guards/BoundedBody.ts`), since Bun's own bound is one for the whole server.

## Versioned contracts

Each document, program answer and message channel names the version its key carries, a whole number; each stored file its format
version, major.minor.

| Key in `CONTRACT_VERSIONS` or `PAGE_CONTRACT_VERSIONS` | Version | Version key | What and where | Gaia | Defined in | Served by |
| --- | --- | --- | --- | --- | --- | --- |
| `forgeRegistry` | 2.0 | `version`, `minor` | `~/.forge-monitor/projects.json`, the registry every forge of the account writes itself into | reads | `src/adapters/forge-registry/RegistryFile.ts` | the forge; `program` per entry with F9 |
| `forgeIdentity` | 1 | `identityVersion` | a Hephaestus's open `GET /api/v1/identity`; its `contracts` names the version of each contract below that the forge serves | reads | `forge-contracts/IdentityDocument`, `src/adapters/forge-api/IdentityIngestion.ts` | the forge; one without the version key or `contracts` is older than Gaia reads |
| `forgeBoardSummary` | 3 | `summaryVersion` | a Hephaestus's open `GET /api/v3/summary`, polled for a forge whose registry entry names no token file | reads | `forge-contracts/BoardSummaryDocument`, `src/adapters/forge-api/BoardSummaryIngestion.ts` | the forge |
| `forgeMonitor` | 6 | `monitorVersion` | a Hephaestus's `GET /api/v5/monitor` and each `monitor` event of `GET /api/v5/monitor/events`, with the bearer token | reads | `forge-contracts/MonitorSnapshotDocument`, `src/adapters/forge-api/MonitorSnapshotIngestion.ts` | the forge at 2.0: a typed target on each entry, no Flint's brain; at 3.0: the process's facts under `hephaestus`; at 4.0: the state `restarting` and the warning kind `restart-failed` |
| `forgeControl` | 3 | `contracts.control` of the identity | a Hephaestus's `POST /api/v3/commands`, with the bearer token | sends | `forge-contracts/ForgeControlCommand` | the forge at 3.0, which named the four lifecycle kinds for Hephaestus; forge keeps `contracts.control` at 3 while a minor adds kinds, since a client compares it for equality |
| `forgeProgramAnswer` | 3 | `answerVersion` | the forge program's JSON on standard output, for each verb Gaia runs (`start`, `stop`, `init`, `update`, `version`, the machine limit); `version` names the Talos protocol version the program starts from forge 1.23 (2); `update` names its restart in `restart` and `restartStep` from forge 4.0 (3) | reads | `src/adapters/forge-program/@types/ForgeProgramAnswer.ts`, `utils/ForgeAnswerMapUtil.ts` | the forge from F8 |
| `forgeMachineLimits` | 1.0 | `version`, `minor` | `~/.forge-monitor/machine-limits.json`, the machine-wide agent limit | never reads: the limit arrives in the monitor snapshot and is set through the control contract | the forge alone | the forge from F6 |
| `gaiaSettings` | 1.0 | `version`, `minor` | `~/.gaia/settings.json` | reads and writes | `src/adapters/gaia-files/@types/StoredSettings.ts`, `SettingsFile.ts`, `SettingsWriter.ts` | Gaia |
| `gaiaFleetDocument` | 12 | `fleetVersion` | `GET /api/v12/fleet` and the `fleet` event of `GET /api/v12/events`, which opens on a `handshake` event and carries Gaia's `systemVersion` in every event | serves; the page reads | `page/@types/FleetDocument.ts`, mapped out by `src/adapters/page-api/FleetDocumentMapUtil.ts` | Gaia; each forge's `program`, the one its registry entry names, from Gaia 1.1 |
| `gaiaCommand` | 5 | `commandVersion` | the body of `POST /api/v6/commands` | the page sends; the server reads | `page/@types/CommandDocument.ts`, read in by `src/adapters/page-api/GaiaCommandIngestion.ts` | Gaia |
| `gaiaCommandAnswer` | 3 | `answerVersion` | the answer of `POST /api/v6/commands`, with one answer per forge for `fleet-outage-resume` in `forges` (a key it only adds) | serves; the page reads | `page/@types/CommandDocument.ts`, mapped out by `src/adapters/page-api/PageAnswerMapUtil.ts` | Gaia |
| `gaiaHealth` | 1 | `healthVersion` | the open `GET /api/v1/health` | serves; the launcher and a second `serve` read | `src/adapters/gaia-server/HealthDocument.ts` | Gaia |
| `gaiaBoard` | 2 | `boardVersion` | one forge's board as the page reads it, with `assistantIsOn` (a key it only adds), the spec and plan roles, approvals and steps and a ticket's `documents` (2), each event of its relayed board stream (a change signal) and each relayed conversation event (a job stream's `history` and `message`, a profile stream's `line`) | serves; the page reads | `page/@types/board/BoardDocument.ts`, `BoardEventDocument.ts`, `ConversationDocument.ts`, mapped out by `src/adapters/page-api/BoardDocumentMapUtil.ts` | Gaia, at `forgeBoard` and in the three relayed streams |
| `gaiaBoardCommand` | 2 | `boardCommandVersion` | the body of a board command the page posts for one forge; each kind keeps the forge's kind name, with Gaia's payload; `pipeline-assistant-set` is a kind it only adds; the `ticket-writing` draft edit and the ticket document kinds (2) | the page sends; the server reads | `page/@types/board/BoardCommandDocument.ts`, read in by `src/adapters/page-api/BoardCommandIngestion.ts` and sent as the forge's command by `src/adapters/forge-api/utils/BoardCommandMapUtil.ts` | Gaia |
| `gaiaBoardStream` | 2 | `boardStreamVersion` | the `handshake` that opens every relayed board stream, with Gaia's and the forge's system versions, written with no id; the part `documents` (2) | serves; the page reads | `page/@types/board/BoardRelayDocuments.ts`, mapped out by `src/adapters/page-api/BoardRelayAnswerMapUtil.ts` | Gaia, at `forgeBoardEvents`, `forgeJobStream` and `forgeProfileStream` |
| `gaiaBoardCommandAnswer` | 1 | `boardCommandAnswerVersion` | the answer to a board command: applied, refused with the forge's sentence or Gaia's own, held for an install change, unreachable or of unknown outcome | serves; the page reads | `page/@types/board/BoardRelayDocuments.ts`, mapped out by `src/adapters/page-api/BoardRelayAnswerMapUtil.ts` | Gaia, at `forgeCommands` |
| `gaiaPictureUploadAnswer` | 1 | `pictureUploadAnswerVersion` | the answer to a picture the page uploads for one forge | serves; the page reads | `page/@types/board/BoardRelayDocuments.ts`, mapped out by `src/adapters/page-api/BoardRelayAnswerMapUtil.ts` | Gaia, at `forgePictureUpload` |
| `gaiaTicketDocuments` | 1 | `ticketDocumentsVersion` | one ticket's spec and plan as the page reads them, each with its Markdown as source text, and the newest effect reading of each; a forge's refusal answers as the forge's sentence | serves; the page reads | `page/@types/board/TicketDocumentsDocument.ts`, mapped out by `src/adapters/page-api/TicketDocumentsDocumentMapUtil.ts` | Gaia, at `forgeTicketDocuments` |
| `gaiaDiagramFrame` | 1 | `protocolVersion` | each message between the page and a diagram frame, both ways, under the protocol name `gaia-diagram-frame` | the page and the frame send and read | `page/shared/@types/DiagramFrameMessages.ts`, answered by `page/diagram-frame/DiagramFrameScript.ts` | Gaia, in the frame served at `/diagram-frame/` |
| `gaiaCrashLog` | 1 | `crashLogVersion` | one crash log of a forge that serves again, read through its API when User opens it, once per start of its Hephaestus | serves; the page reads | `page/@types/CrashLogDocument.ts`, mapped out by `src/adapters/page-api/CrashLogDocumentMapUtil.ts` | Gaia, at `forgeCrashLog` |
| `gaiaProgramAnswer` | 1 | `answerVersion` | `gaia version --json` on standard output | writes | `src/Main.ts` | Gaia |
| `boundaryRecording` | 1.0 | `recordingVersion`, `recordingMinor` | `src/testing/recordings/<os>/<name>.json`, a boundary's recorded answers; test-only | writes in `bun run record`, reads in specs and verify | `src/testing/BoundaryRecordings.ts` | Gaia |

The forge's requirements are in `docs/forge-requirements.md`: forge 1.0 meets V1 to V6, V8 and V9. Every fixture of a forge contract is recorded from a forge
that serves it (`bun run record <name>`), and `bun run verify` fails on a forge recording stamped `authored`. From this repository's
forge 4.1: `hephaestus-fetch-supported-forge`, the forge in each situation, its one job the product owner of an intake User started, since a
new board's Assistant is off; `hephaestus-fetch-board`, Example Storefront's board as the relay reads it:
the board document (with a draft ticket and a committed one the product owner gives an entity; a pipeline applied over two app entities
with the Assistant switched on; an agent's question with its
recommendation, escalated to User; an open incident and a defaulted one's notice, left in the stopped forge's store as an ended Assistant turn
leaves them, since the fake agent asks nothing; and an update setup whose entities draft holds a
standing `equal-homes` refusal with its fix, which Apply refuses as `entity-refusals-stand`), and refused
another's token; the board's event stream from its start and from its first event's id; a board command applied,
refused with its code, fields and sentence, of an unknown kind, and answered 423 while launches are held for an install change, with the
board's notice in that hold; a picture accepted and read back, refused as too large and as no picture; a product owner job's stream (its handshake
and an empty history, since the fake agent writes no conversation) and a gate profile run's output; and `hephaestus-fetch-versions`, the forge answering older (1.0), one minor ahead (4.2) and newer (5.1) through its
test setting `FORGE_VERSIONS_ANSWER`, and a forge from before system versions, serving no `/api/versions`;
`hephaestus-fetch-ticket-documents`, Example Bookshop with a pipeline stored in the spec-then-plan route and two drafts: the save of one
draft's spec, which opens its documents, with the board's events up to the `documents` event, the documents and the board read after it,
and the documents refused for the other draft and for no ticket. Every situation is a forge at a
system version. Each answer keeps its content type, and an answer read as bytes, such as a picture, is recorded in base64.

## A forge's board, in Gaia's model

Gaia reads a forge's board into its own model at its boundary (decision 51) and holds the last one read per forge, never written back
(decision 47). The model is `src/shared/@types/board/`, `ForgeBoard` at its root, written in Gaia's own unions; the page's board contract
is a separate document Gaia serves.

- **The board document**, `GET /api/v4/board` (`forge-contracts/ForgeBoardDocument`), carries no version key: its version is the `board`
  endpoint's, derived from forge's registry at `SUPPORTED_FORGE_VERSION`. `src/adapters/forge-api/BoardStateIngestion.ts` checks the keys
  Gaia reads against `constants/BoardDocumentShapes.ts`, each shape typed `satisfies ShapeOf<>` against the contract, and maps through
  `utils/BoardMapUtil.ts` and `utils/PipelineMapUtil.ts`; a missing key or a value outside a value list makes it malformed and is named.
  The forge renders no HTML: a ticket's `bodyMarkdown`, an epic description's `descriptionMarkdown` and the `constitutionMarkdown` of the
  pipeline setup and of each of its entities arrive as Markdown, and the model holds them as Markdown under the same names.
  The shapes are the inventory of what the board's views read plus the facts forge serves; a key no view reads is named `passed-over`
  (the restart warning, which `warnings` words, confinement, a gate's `definedBy` and
  `forgeOnly`, a draft's `baseBlob`, the setup record's `baseContentHash`, `applyRequest` and
  `openedAtEntity`, the Apply state's
  `commitJobId`, a checked gate's outcomes and durations, an annotation's `lineIndex`, an edge's `edgeId`, an application's `appliedBy`).
- **The Assistant's switch** is the stored pipeline's `assistant` key, which the forge writes only while the switch is on. `BoardMapUtil`
  reads it into the board's `assistantIsOn`, off while the key is absent and while no readable pipeline is stored, and the page reads it
  under the same name. A press in the Assistant tab sends the forge's `pipeline-assistant-set` with `on`, and the switch shows the next
  board the forge serves, never its own guess.
- **What a waiting job follows** (`waitsFor`) is served in the forge's presence, `GET /api/v1/presence`
  (`forge-contracts/ForgePresenceDocument`), not in its board. The forge watch has the one presence reader: it reads once per change of
  a live forge's monitor snapshot, never on a timer, for its supervision, its interrupted work and its crash logs, and the board route,
  only when the board holds an interrupted job or a lost line, asks that reader for a read after now (`presenceReadingAfterNow`), sharing
  the read on its way; a presence that does not ingest, or a forge whose monitor the watch does not follow, leaves every wait `null`.
  `src/adapters/forge-api/PresenceIngestion.ts` is its one ingestion. A crash log is read by its number
  (`GET /api/v1/crash-log?number=<n>`, `CrashLogIngestion.ts`) only when User opens it.
- **A ticket's documents** in the spec-then-plan route, from forge 4.1, are read afresh on each ask of the page's documents route
  (`GET /api/v1/tickets/<ticketId>/documents`, `forge-contracts/TicketDocumentsDocument`), never held. The document carries no version
  key: its version is the endpoint's. `src/adapters/forge-api/TicketDocumentsIngestion.ts` checks it against
  `constants/TicketDocumentsShapes.ts` and maps it through `utils/TicketDocumentsMapUtil.ts`, the Markdown kept as source text; the
  forge's 404 for a ticket with no documents, or for no ticket, keeps its code, fields and sentence. The board carries only each
  ticket's documents summary, and the board stream's `documents` event asks the page to read them again. A stored pipeline's
  `ticketWriting` and a builder's or reviewer's `documents` read only where the forge serves them, so a one-ticket pipeline gains no key.
- **The jobs a network outage left waiting** are told from presence alone, by one rule (`src/features/fleet/utils/OutageEndingUtil.ts`):
  a job of the interrupted work whose cause is `network-outage` and which waits for an instruction. Each forge's count and the fleet's
  total are served in the fleet document, and `fleet-outage-resume` sends each forge whose API answers the forge's
  `interrupted-work-resume` with the target `network-outage`, one forge after another.
- **The running and the newest Hephaestus and Talos** (`runningVersions`): the running Hephaestus's code version is its identity's, the
  running Talos's protocol and code versions are its presence's `talos`; the newest are the installed program's `codeVersion` and
  `talosProtocolVersion` from `forge version --json`, run when a registry check follows the forge afresh and when User looks again,
  never on a timer of its own. A newer installed version marks the pair in the forge bar and restarts nothing; Restart Hephaestus sends
  `forge-restart` (the checked restart to the code on disk) and Restart Talos `forge-talos-restart`, the forge's clean quit after which its paused agents resume.
- **A forge's presence in the registry** is the entry's `presence` key (`serving`, `stopped`, `handed-over` or `crashed` with its crash
  summary), read by `src/adapters/forge-registry/utils/RegistryMapUtil.ts`; a state Gaia does not know reads as no presence. The fleet
  tells crashed, stopped, down and hung apart from it, Hephaestus's answer and the served supervision alone
  (`src/features/fleet/utils/ForgePresenceUtil.ts`); a forge at a version Gaia cannot talk to answered its versions, so it is never down.
- **The value lists** map through `utils/VocabularyMapUtil.ts`, one record typed `Record<forge value, Gaia value>` per union, so a value
  forge adds is a compile error there and nowhere else.
- **The board event stream**, `GET /api/v4/events`, carries forge's internal board state in every event, never a contract document. Gaia
  reads only the event's name (`BoardEventIngestion.ts`): `board` asks for the board document anew through `ForgeClient.boardOf`, and each
  part event names its part.
- **The conversation streams and the command answer** have no type in `forge-contracts` yet; their shapes are typed against
  `src/adapters/forge-api/@types/ForgeStreamDocuments.ts`. `ConversationIngestion.ts` reads a job stream's `history` and `message` and a
  profile stream's `line`; `CommandAnswerIngestion.ts` reads a command's answer under `forgeControl`: 200 applied, with the job an
  applied command started, 423 held for an install change, any other status a refusal, its code, fields and sentence unchanged.

## The page's board contract

Gaia serves its page a board contract of its own (decision 51), `page/@types/board/`: field for field what the model holds, under Gaia's
names and unions, with the ordered lists the views iterate (`BoardVocabulary.ts`, held to the forge's order by a spec). The page imports
none of the model and no `forge-contracts` type.

- **Out:** `src/adapters/page-api/BoardDocumentMapUtil.ts` and `PipelineDocumentMapUtil.ts` name every key one by one. A forge's refusal
  becomes `{ refusedBy: 'forge', code, fields, text }` with the forge's sentence in `text`, byte for byte, even when it names a command
  (decision 45); a notice or a warning keeps its kind and facts, and its sentence passes through `ForgeSentenceUtil` by kind, a cause
  that names a command dropped. A served target stays `{ subject, id }`. Every event is a change signal, as the model reads it. The
  model's three Markdown fields leave as the page's `bodyHtml`, `descriptionHtml` and `constitutionHtml`, rendered on the server by
  `src/lib/markdown-render/MarkdownRenderer.ts`: `marked` with raw HTML escaped and a link or image kept only with an `http:`, `https:`
  or `mailto:` scheme or none, since an agent wrote the text. The page holds no Markdown parser and still shows each in a sandboxed frame.
- **In:** `src/adapters/page-api/BoardCommandIngestion.ts` checks `boardCommandVersion`, the kind and each key of the kind, and refuses a
  body as `malformed-body` (naming its keys) or `unknown-kind`. `src/adapters/forge-api/utils/BoardCommandMapUtil.ts` maps each kind
  through one table whose type pairs it with the contract's command of the same kind, so Gaia sends only kinds of
  `FORGE_CONTROL_COMMAND_KINDS`, never a kind the forge's command line alone runs. A key Gaia holds as `null` is absent from the forge's
  command. No view applies a command before the forge answers.
- **Relayed:** the `forge*` routes (`src/features/page-server/`) reach a forge through `ForgeAccess.ts`: the registry's entry, the
  watch's reading at the same address, a version verdict of `current` or `ahead`, and the token file read at each request; the token
  reaches no answer and no log line. The board is read afresh for each request, reads of one forge shared: a request that comes while a
  read is on its way waits for the next, so a burst of change signals costs at most two reads. A relayed stream opens with Gaia's
  `handshake` once the forge's own names the version the watch read, then re-emits each forge event under its name and id, mapped once
  per forge for every page stream that follows it (`BoardStreams.ts`); an event that does not ingest is dropped and logged, never
  forwarded raw. The page's `Last-Event-ID` and `after` reach the forge; a forge stream that ends ends the page's, and a page that goes
  stops the forge's. Statuses (`BoardRelayAnswers.ts`): 200 answered, 400 a body that is no command Gaia knows, 404 an unregistered forge
  or an unknown picture, 409 a forge's refusal, 413 a body over its bound, 423 a forge's install hold, 501 a forge version Gaia cannot
  talk to, 502 a forge that does not answer, a document that does not ingest, an unreadable token file or a refused token.

## The install version

`GAIA_INSTALL_VERSION` (`src/shared/constants/InstallVersion.ts`) is the contract between Gaia and the `Gaia.app` it installs, kept apart
from `CONTRACT_VERSIONS` because it versions an installed artifact, not a document. `gaia install-app` writes it as `GaiaInstallVersion`
into the bundle's `Contents/Info.plist` (`resources/app-bundle/Info.plist.template`), `src/adapters/app-bundle/AppBundleInfoFile.ts` reads
it back, and the launcher refuses a bundle of another number before it starts anything. The health document and `gaia version --json` carry it as `installVersion`.

## Unversioned on purpose

- `~/.gaia/token`: a secret, written owner-only at every start (`src/features/page-server/ServerToken.ts`) and read by the launcher
  (`src/adapters/gaia-files/ServerTokenFile.ts`).
- The bodies of `POST /api/v1/session-codes` and `POST /api/v1/session`: an opaque one-time code and the session cookie it buys, as a
  Hephaestus's own (`src/features/page-server/routes/SessionRoutes.ts`); the routes themselves are versioned by path.
- `GET /api/versions`: its path and its shape never change, since it is what a client of any version reads first.
- A Hephaestus's token file, named by the registry's `hephaestus.tokenPath` (`src/adapters/forge-api/HephaestusTokenFile.ts`).
