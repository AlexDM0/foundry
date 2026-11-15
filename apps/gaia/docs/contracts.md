# Contracts

Every versioned contract Gaia reads, writes, sends or serves. Forge and Gaia are released apart and may run at any two versions, so
they meet only through the model below. The known version of each contract lives once, in `CONTRACT_VERSIONS`
(`src/shared/constants/ContractVersions.ts`); an Overseer's come from the `forge-contracts` package (`packages/forge-contracts/`),
which forge produces. The tables below name each with that version, and `src/shared/constants/ContractVersions.reference.spec.ts` fails
`bun run verify` when a table and its constant disagree. A shape is defined once, in the module the table names; this file does not repeat
its keys.

## The version model

- **A system version per system.** Forge and Gaia each have one system version, major.minor, by interoperability, never their package
  version: a minor change only adds, and every client of that major keeps working; a major change may break a client of an older major.
  Gaia's is `GAIA_SYSTEM_VERSION` (`src/shared/constants/GaiaSystemVersions.ts`); the forge versions Gaia knows are
  `SUPPORTED_FORGE_VERSION` (the forge version this Gaia is built for) and `MINIMUM_FORGE_VERSION` (the oldest it still talks to, through
  the migrations below), in `src/lib/forge-client/constants/SupportedForgeVersions.ts`. Each constant's docblock says what raises it. What a
  forge answers is `forge-contracts/ForgeSystemVersions`, forge's own.
- **`GET /api/versions`, unversioned and never removed.** A server answers its `current` system version and its `minimumSupported`, the
  oldest version of its own system a client may have been built for and still be served (`system-versions/VersionsDocument`). Raising
  the minimum is what lets a server remove an old endpoint version: no client it still supports calls it. Gaia's own server answers it
  for its page and its launcher (`src/features/page-server/routes/VersionsRoute.ts`), and Gaia asks it of every forge first.
- **Endpoints versioned by path.** A route is served at `/api/v<n>/<endpoint>`, and an endpoint's breaking change is served side by side
  at the next `n` until the minimum is raised (`src/lib/api-paths/ApiPathUtil.ts`). A REST answer carries no version of its own for this:
  each client version knows which endpoint versions it calls. Gaia's routes also keep answering at their unversioned `/api/<endpoint>`,
  so a window open across an upgrade keeps working; the page calls the versioned paths, and the launcher falls back to the unversioned
  ones for an older running Gaia. The version of each forge endpoint Gaia calls is the one forge's compatibility registry
  (`forge-contracts/ForgeCompatibilityRegistry`) serves `SUPPORTED_FORGE_VERSION` (`forgeEndpointVersionOf` in
  `src/lib/forge-client/ForgeClient.ts`): Gaia calls them at those paths when a forge publishes its versions, and at today's unversioned
  paths when it does not.
- **Message protocols carry the system version.** The fleet stream opens on a `handshake` event and carries Gaia's `systemVersion` in every
  `fleet` event; every embed message Gaia posts carries Gaia's `systemVersion`, and a Bridge's message names its forge's where it does
  (V5). A page that hears a handshake of another system major is a stale page and reloads once. The forge's monitor stream and Bridge
  carry the forge's (V5 in `docs/forge-requirements.md`); Gaia keeps reading today's messages without it.
- **The keys documents have always carried stay, as whole versions.** `monitorVersion`, `identityVersion`, `contracts`, `fleetVersion`,
  `answerVersion` and the like keep their integer and keep being read: released forges send them, and an open page of an older Gaia reads
  them on the unversioned paths. A known version reads with its unknown keys passed over; an older one only where "Older versions Gaia
  still reads" lists it, migrated on its ingestion; a newer one never reaches a mapper. `src/shared/utils/ContractVersionUtil.ts` holds
  the reading rule once. So a forge's integer keys stay where forge 1.1 leaves them (V3): an addition raises only the system minor, or an
  `ahead` forge would read as newer than Gaia can talk to.
- **Stored files keep their own format version**, major.minor: the integer `version` (or `recordingVersion`) is the major, an optional
  `minor` the minor, absent read as 0. A newer minor of a known major is read, and a file Gaia would rewrite at a newer minor is kept as
  it is (`kept-newer-version`), since the rewrite would drop the keys it adds.

## The verdict on a forge

One verdict per forge, from its `/api/versions` and Gaia's two numbers (`src/shared/utils/ForgeVersionsUtil.ts`), carried in the
internal model (`ForgeReading.versions`) and the page contract (`FleetDocumentForge.versions`, with Gaia's numbers in
`FleetDocumentGaia.versions`).

| Verdict | When | What Gaia does |
| --- | --- | --- |
| `newer` | Gaia's `SUPPORTED_FORGE_VERSION` is below the forge's `minimumSupported`: they cannot talk | Asks nothing more; reads the forge at fidelity `newer-contract`. Gaia needs an update: it explains only, offers no update of itself and names no command, and offers Open in new tab where the Bridge can be reached. |
| `older` | The forge's `current` is below Gaia's `MINIMUM_FORGE_VERSION`: they cannot talk | Asks nothing more; reads the forge at fidelity `older-contract`. The forge needs an update: Update forge, which Gaia runs as today. |
| `ahead` | The forge's `current` is above `SUPPORTED_FORGE_VERSION`, and its minimum is not | Reads it in full at the versioned paths, with what this Gaia knows; full use of it needs a newer Gaia. Quiet. |
| `behind` | The forge's `current` is below `SUPPORTED_FORGE_VERSION`, at or above `MINIMUM_FORGE_VERSION` | Reads it in full at the versioned paths; Gaia's newest features for it (Flint's brain) need a forge update. Quiet; Update forge as a secondary action. |
| `current` | The forge's `current` is `SUPPORTED_FORGE_VERSION` | Reads it in full at the versioned paths. |
| `not-reported` | The forge serves no `/api/versions`, or none Gaia can read: every released forge today | Reads it exactly as before versions, at today's unversioned paths. |

## Gaia's endpoints

Each route of Gaia's server at its endpoint version, from `GAIA_ENDPOINT_VERSIONS` (`src/shared/constants/GaiaSystemVersions.ts`), served
at `/api/v<n>/<endpoint>` and at `/api/<endpoint>`, behind the same Host, Origin, CSP and session guards (`src/features/page-server/PageServer.ts`).
A version above 1 names the breaking changes the endpoint already had.

| Key in `GAIA_ENDPOINT_VERSIONS` | Version | Path | Breaking changes |
| --- | --- | --- | --- |
| `health` | 1 | `GET /api/v1/health` | none |
| `sessionCodes` | 1 | `POST /api/v1/session-codes` | none |
| `session` | 1 | `POST /api/v1/session` | none |
| `fleet` | 4 | `GET /api/v4/fleet` | monitor contract 2's warning kinds (2); Flint's brain (3); a forge too old to talk to, fidelity `older-contract` (4) |
| `events` | 4 | `GET /api/v4/events` | as `fleet`, whose document each `fleet` event carries |
| `commands` | 3 | `POST /api/v3/commands` | Gaia's own sentences for forge refusals (2); the brain's commands and `brain-not-served` (3) |
| `frameSession` | 1 | `POST /api/v1/forges/<trackerId>/frame-session` | none |

`GET /api/versions` is the one route served only at its unversioned path.

## Versioned contracts

Each document, program answer and message channel names the version its key carries, a whole number; each stored file its format
version, major.minor.

| Key in `CONTRACT_VERSIONS` | Version | Version key | What and where | Gaia | Defined in | Served by |
| --- | --- | --- | --- | --- | --- | --- |
| `forgeRegistry` | 1.0 | `version`, `minor` | `~/.forge-monitor/projects.json`, the registry every forge of the account writes itself into | reads | `src/adapters/forge-registry/RegistryFile.ts` | the forge; `program` per entry with F9 |
| `forgeIdentity` | 1 | `identityVersion` | an Overseer's open `GET /api/identity`; its `contracts` names the version of each contract below that the forge serves | reads | `forge-contracts/IdentityDocument`, `src/adapters/forge-api/IdentityIngestion.ts` | the forge from F1; before it, no version key and no `contracts` |
| `forgeBoardSummary` | 1 | `summaryVersion` | an Overseer's open `GET /api/summary`, polled for a forge without the monitor contract | reads | `forge-contracts/BoardSummaryDocument`, `src/adapters/forge-api/BoardSummaryIngestion.ts` | the forge |
| `forgeMonitor` | 3 | `monitorVersion` | an Overseer's `GET /api/monitor` and each `monitor` event of `GET /api/monitor/events`, with the bearer token | reads | `forge-contracts/MonitorSnapshotDocument`, `src/adapters/forge-api/MonitorSnapshotIngestion.ts` | the forge from F2 and F3; monitor 2 adds a kind to each warning and the current usage window; monitor 3 adds `flintBrain`, `null` for a forge without Flint, and an ended brain's activity entry of kind `flint-brain` with its tokens (G1, G2), authored in `src/testing/recordings/darwin/overseer-fetch-monitor-3.json` until a forge serves it |
| `forgeControl` | 2 | `contracts.control` of the identity | an Overseer's `POST /api/commands`, with the bearer token | sends | `forge-contracts/ForgeControlCommand` | the forge from F7; control 2 adds `flint-brain-start` and `flint-brain-stop` and their refusals (G3), authored in `src/testing/recordings/darwin/overseer-fetch-monitor-3.json` until a forge serves it |
| `forgeEmbedChannel` | 1 | `channelVersion`, and `contracts.embed` of the identity; every message also carries its sender's `systemVersion` | the messages between Gaia's page and a forge's Bridge in Gaia's frame | reads and sends | `forge-contracts/EmbedChannelMessage`, `page/views/forge-frame/EmbedChannel.ts` | the forge from F5; the Bridge's `systemVersion` from V5 |
| `forgeProgramAnswer` | 1 | `answerVersion` | the forge program's JSON on standard output, for each verb Gaia runs (`start`, `stop`, `init`, `update`, `version`, `login-item`, the machine limit) | reads | `src/adapters/forge-program/@types/ForgeProgramAnswer.ts`, `utils/ForgeAnswerMapUtil.ts` | the forge from F8 |
| `forgeMachineLimits` | 1.0 | `version`, `minor` | `~/.forge-monitor/machine-limits.json`, the machine-wide agent limit | never reads: the limit arrives in the monitor snapshot and is set through the control contract | the forge alone | the forge from F6 |
| `gaiaSettings` | 1.0 | `version`, `minor` | `~/.gaia/settings.json` | reads and writes | `src/adapters/gaia-files/@types/StoredSettings.ts`, `SettingsFile.ts`, `SettingsWriter.ts` | Gaia |
| `gaiaServerRecord` | 1.0 | `version`, `minor` | `~/.forge-monitor/gaia/server.json`, which a forge reads to let Gaia's origin frame its Bridge | writes | `src/adapters/gaia-files/ServerRecordWriter.ts` | Gaia; the forge reads it from F5 |
| `gaiaFleetDocument` | 4 | `fleetVersion` | `GET /api/v4/fleet` and the `fleet` event of `GET /api/v4/events`, which opens on a `handshake` event and carries Gaia's `systemVersion` in every event | serves; the page reads | `page/@types/FleetDocument.ts`, mapped out by `src/adapters/page-api/FleetDocumentMapUtil.ts` | Gaia |
| `gaiaCommand` | 2 | `commandVersion` | the body of `POST /api/v3/commands` | the page sends; the server reads | `page/@types/CommandDocument.ts`, read in by `src/adapters/page-api/GaiaCommandIngestion.ts` | Gaia |
| `gaiaCommandAnswer` | 3 | `answerVersion` | the answer of `POST /api/v3/commands` | serves; the page reads | `page/@types/CommandDocument.ts`, mapped out by `src/adapters/page-api/PageAnswerMapUtil.ts` | Gaia |
| `gaiaFrameSession` | 1 | `frameSessionVersion` | the answer of `POST /api/v1/forges/<trackerId>/frame-session` | serves; the page reads | `page/@types/FrameSessionDocument.ts`, mapped out by `src/adapters/page-api/PageAnswerMapUtil.ts` | Gaia |
| `gaiaHealth` | 1 | `healthVersion` | the open `GET /api/v1/health` | serves; the launcher and a second `serve` read | `src/adapters/gaia-server/HealthDocument.ts` | Gaia |
| `gaiaProgramAnswer` | 1 | `answerVersion` | `gaia version --json` on standard output | writes | `src/Main.ts` | Gaia |
| `boundaryRecording` | 1.0 | `recordingVersion`, `recordingMinor` | `src/testing/recordings/<os>/<name>.json`, a boundary's recorded answers; test-only | writes in `bun run record`, reads in specs and verify | `src/testing/BoundaryRecordings.ts` | Gaia |

The forge's requirements F1 to F9, G1 to G4 and V1 to V9 (`docs/forge-requirements.md`) are the owner's to run on the forge's own board. Every fixture of a forge
contract is recorded from a forge that serves it (`bun run record <name>`), and `bun run verify` fails on a forge recording stamped
`authored`, except one whose entry in `RECORDED_BOUNDARIES` names the forge requirements it waits on: monitor 3 and control 2 (G1 to
G3), and `/api/versions` with the versioned paths (V1 to V3), whose recording also holds what a forge before them answers there.

## Older versions Gaia still reads

A forge on older code keeps serving an older contract until it is updated, so Gaia reads these versions too. Each is migrated on its
ingestion to the current version's shape, and a mapper only ever sees the current shape; an older control version, which Gaia sends
rather than reads, is held instead by the guard that sends it only the commands it carries. The versions live once, in
`OLDER_CONTRACT_VERSIONS_READ` (`src/shared/constants/ContractVersions.ts`, from `OLDER_OVERSEER_CONTRACT_VERSIONS` in
`forge-contracts`), and the same spec holds this table to it, both ways. They are what `MINIMUM_FORGE_VERSION` stands on: dropping
one raises it.

| Key in `CONTRACT_VERSIONS` | Older version | What the migration does | Migrated by |
| --- | --- | --- | --- |
| `forgeMonitor` | 1 | A warning is the forge's sentence alone, so it reads as a warning of no kind, worded only by the command guard and firing no look; the current usage window is unknown, so `null`; then as monitor 2. An identity naming monitor 1, 2 or 3 is read in full. | `src/adapters/forge-api/utils/MonitorSnapshotMigrationUtil.ts`, called by `MonitorSnapshotIngestion.ts` |
| `forgeMonitor` | 2 | No Flint: `flintBrain` reads as `null`, so the forge's brain is `not-reported` and nothing of a brain shows for it. | `src/adapters/forge-api/utils/MonitorSnapshotMigrationUtil.ts`, called by `MonitorSnapshotIngestion.ts` |
| `forgeControl` | 1 | Nothing to migrate: Gaia sends a control-1 forge every command as at 2, except Flint's brain's two, which Gaia's guard refuses with `brain-not-served` before it sends anything. | `src/features/forge-control/ForgeControl.ts` |

## The install version

`GAIA_INSTALL_VERSION` (`src/shared/constants/InstallVersion.ts`) is the contract between Gaia and the `Gaia.app` it installs, kept apart
from `CONTRACT_VERSIONS` because it versions an installed artifact, not a document. `gaia install-app` writes it as `GaiaInstallVersion`
into the bundle's `Contents/Info.plist` (`resources/app-bundle/Info.plist.template`), `src/adapters/app-bundle/AppBundleInfoFile.ts` reads
it back, and the launcher refuses a bundle of another number before it starts anything. The health document and `gaia version --json` carry it as `installVersion`.

## Unversioned on purpose

- `~/.gaia/token`: a secret, written owner-only at every start (`src/features/page-server/ServerToken.ts`) and read by the launcher
  (`src/adapters/gaia-files/ServerTokenFile.ts`).
- The bodies of `POST /api/v1/session-codes` and `POST /api/v1/session`: an opaque one-time code and the session cookie it buys, as an
  Overseer's own (`src/features/page-server/routes/SessionRoutes.ts`); the routes themselves are versioned by path.
- `GET /api/versions`: its path and its shape never change, since it is what a client of any version reads first.
- An Overseer's token file, named by the registry's `overseer.tokenPath` (`src/adapters/forge-api/OverseerTokenFile.ts`).
