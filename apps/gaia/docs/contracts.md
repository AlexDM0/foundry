# Contracts

Every versioned contract Gaia reads, writes, sends or serves. Forge and Gaia are released apart and may run at any two versions, so
they meet only through the model below. The one version Gaia knows of each contract lives once: in `CONTRACT_VERSIONS`
(`src/shared/constants/ContractVersions.ts`) for the forge's contracts and Gaia's stored files, an Overseer's from the `forge-contracts`
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
  `fleet` event; every embed message Gaia posts carries Gaia's `systemVersion`, and a Bridge's message names its forge's where it does
  (V5). A page that hears a handshake of another system major is a stale page and reloads once.
- **A compatibility registry per server.** Each server keeps one entry per thing it serves for clients of its older versions: every
  versioned endpoint, and every compatibility path that is no endpoint (an unversioned alias, a payload migration, an older message
  form), each with the version that introduced it and the last version whose clients still need it. The logic is the `system-versions`
  package's (`system-versions/CompatibilityRegistryUtil`), which names no server. Forge's is `forge-contracts/ForgeCompatibilityRegistry`;
  Gaia's own, toward its page and launcher, is `GAIA_COMPATIBILITY_REGISTRY` (`src/shared/constants/GaiaCompatibilityRegistry.ts`), which
  keeps Gaia's routes at their unversioned paths too, for a page or a launcher from before system versions. `bun run
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
  `src/shared/utils/ContractVersionUtil.ts` holds the reading rule once. Forge's registry keeps its documents' integer keys only for
  clients from before system versions, so Gaia still leans on a compatibility path it was not built for; `docs/backlog.md` holds the step
  that ends it, before forge's minimum is raised past 0.0.
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
| `newer` | `SUPPORTED_FORGE_VERSION` is below the forge's `minimumSupported`: they cannot talk | Asks nothing more; reads the forge at fidelity `newer-contract`. Gaia needs an update: it explains only, offers no update of itself and names no command, and offers Open in new tab where the Bridge can be reached. |
| `older` | The forge's `current` is below `SUPPORTED_FORGE_VERSION`, or the forge serves no `/api/versions` (it refuses the path as any unknown one): every forge from before system versions | Asks nothing more; reads the forge at fidelity `older-contract`. The forge needs an update: Update forge, which Gaia runs through the forge program, with its pending, done and refused states. |

A `/api/versions` answer that is no versions document, as another program on the port gives, is a failed try, as no answer is.

## Gaia's endpoints

Each route of Gaia's server at its endpoint version, from `GAIA_ENDPOINT_VERSIONS` (`src/shared/constants/GaiaSystemVersions.ts`), with its
lifetime in `GAIA_COMPATIBILITY_REGISTRY`, served at `/api/v<n>/<endpoint>` and, while the registry keeps them, at `/api/<endpoint>`,
behind the same Host, Origin, CSP and session guards (`src/features/page-server/PageServer.ts`). A version above 1 names the breaking
changes the endpoint already had.

| Key in `GAIA_ENDPOINT_VERSIONS` | Version | Path | Breaking changes |
| --- | --- | --- | --- |
| `health` | 1 | `GET /api/v1/health` | none |
| `sessionCodes` | 1 | `POST /api/v1/session-codes` | none |
| `session` | 1 | `POST /api/v1/session` | none |
| `fleet` | 4 | `GET /api/v4/fleet` | monitor contract 2's warning kinds (2); Flint's brain (3); a forge too old to talk to, fidelity `older-contract` (4) |
| `events` | 4 | `GET /api/v4/events` | as `fleet`, whose document each `fleet` event carries |
| `commands` | 3 | `POST /api/v3/commands` | Gaia's own sentences for forge refusals (2); the brain's commands (3) |
| `frameSession` | 1 | `POST /api/v1/forges/<trackerId>/frame-session` | none |

`GET /api/versions` is the one route served only at its unversioned path.

## Versioned contracts

Each document, program answer and message channel names the version its key carries, a whole number; each stored file its format
version, major.minor.

| Key in `CONTRACT_VERSIONS` or `PAGE_CONTRACT_VERSIONS` | Version | Version key | What and where | Gaia | Defined in | Served by |
| --- | --- | --- | --- | --- | --- | --- |
| `forgeRegistry` | 1.0 | `version`, `minor` | `~/.forge-monitor/projects.json`, the registry every forge of the account writes itself into | reads | `src/adapters/forge-registry/RegistryFile.ts` | the forge; `program` per entry with F9 |
| `forgeIdentity` | 1 | `identityVersion` | an Overseer's open `GET /api/v1/identity`; its `contracts` names the version of each contract below that the forge serves | reads | `forge-contracts/IdentityDocument`, `src/adapters/forge-api/IdentityIngestion.ts` | the forge; one without the version key or `contracts` is older than Gaia reads |
| `forgeBoardSummary` | 1 | `summaryVersion` | an Overseer's open `GET /api/v1/summary`, polled for a forge whose registry entry names no token file | reads | `forge-contracts/BoardSummaryDocument`, `src/adapters/forge-api/BoardSummaryIngestion.ts` | the forge |
| `forgeMonitor` | 3 | `monitorVersion` | an Overseer's `GET /api/v2/monitor` and each `monitor` event of `GET /api/v2/monitor/events`, with the bearer token | reads | `forge-contracts/MonitorSnapshotDocument`, `src/adapters/forge-api/MonitorSnapshotIngestion.ts` | the forge at 1.1, with Flint's brain as `flintBrain` (`null` on a forge that cannot run it), and an ended brain's activity entry, category `agent`, of kind `flint-brain` with its tokens (G1, G2) |
| `forgeControl` | 1 | `contracts.control` of the identity | an Overseer's `POST /api/v1/commands`, with the bearer token | sends | `forge-contracts/ForgeControlCommand` | the forge at 1.1, with `flint-brain-start` and `flint-brain-stop` and their refusals (G3); forge keeps `contracts.control` at 1, since a client built for 1.0 compares it for equality, and its system version, not the integer, announces the two commands |
| `forgeEmbedChannel` | 1 | `channelVersion`, and `contracts.embed` of the identity; every message also carries its sender's `systemVersion` | the messages between Gaia's page and a forge's Bridge in Gaia's frame | reads and sends | `forge-contracts/EmbedChannelMessage`, `page/views/forge-frame/EmbedChannel.ts` | the forge from F5; the Bridge's `systemVersion` from V5 |
| `forgeProgramAnswer` | 1 | `answerVersion` | the forge program's JSON on standard output, for each verb Gaia runs (`start`, `stop`, `init`, `update`, `version`, `login-item`, the machine limit) | reads | `src/adapters/forge-program/@types/ForgeProgramAnswer.ts`, `utils/ForgeAnswerMapUtil.ts` | the forge from F8 |
| `forgeMachineLimits` | 1.0 | `version`, `minor` | `~/.forge-monitor/machine-limits.json`, the machine-wide agent limit | never reads: the limit arrives in the monitor snapshot and is set through the control contract | the forge alone | the forge from F6 |
| `forgeFrameAncestorRecord` | 1.0 | `version`, `minor` | `~/.forge-monitor/frame-ancestors/gaia.json`, the frame-ancestor record every forge reads to let Gaia's origin frame its Bridge; Gaia adds `url`, `processId` and `startedAt`, which a forge passes over | writes | `forge-contracts/FrameAncestorRecord`, `src/adapters/gaia-files/ServerRecordWriter.ts` | Gaia; the forge reads it from V8 |
| `gaiaSettings` | 1.0 | `version`, `minor` | `~/.gaia/settings.json` | reads and writes | `src/adapters/gaia-files/@types/StoredSettings.ts`, `SettingsFile.ts`, `SettingsWriter.ts` | Gaia |
| `gaiaFleetDocument` | 4 | `fleetVersion` | `GET /api/v4/fleet` and the `fleet` event of `GET /api/v4/events`, which opens on a `handshake` event and carries Gaia's `systemVersion` in every event | serves; the page reads | `page/@types/FleetDocument.ts`, mapped out by `src/adapters/page-api/FleetDocumentMapUtil.ts` | Gaia; each forge's `program`, the one its registry entry names, from Gaia 1.1 |
| `gaiaCommand` | 2 | `commandVersion` | the body of `POST /api/v3/commands` | the page sends; the server reads | `page/@types/CommandDocument.ts`, read in by `src/adapters/page-api/GaiaCommandIngestion.ts` | Gaia |
| `gaiaCommandAnswer` | 3 | `answerVersion` | the answer of `POST /api/v3/commands` | serves; the page reads | `page/@types/CommandDocument.ts`, mapped out by `src/adapters/page-api/PageAnswerMapUtil.ts` | Gaia |
| `gaiaFrameSession` | 1 | `frameSessionVersion` | the answer of `POST /api/v1/forges/<trackerId>/frame-session` | serves; the page reads | `page/@types/FrameSessionDocument.ts`, mapped out by `src/adapters/page-api/PageAnswerMapUtil.ts` | Gaia |
| `gaiaHealth` | 1 | `healthVersion` | the open `GET /api/v1/health` | serves; the launcher and a second `serve` read | `src/adapters/gaia-server/HealthDocument.ts` | Gaia |
| `gaiaProgramAnswer` | 1 | `answerVersion` | `gaia version --json` on standard output | writes | `src/Main.ts` | Gaia |
| `boundaryRecording` | 1.0 | `recordingVersion`, `recordingMinor` | `src/testing/recordings/<os>/<name>.json`, a boundary's recorded answers; test-only | writes in `bun run record`, reads in specs and verify | `src/testing/BoundaryRecordings.ts` | Gaia |

The forge's requirements are in `docs/forge-requirements.md`: forge 1.0 meets V1 to V6, V8 and V9, and forge 1.1 adds V7 and Flint's
brain (G1 to G3), with the framed Bridge keeping its Agents-at-work strip (G4). Every fixture of a forge contract is recorded from a forge
that serves it (`bun run record <name>`), and `bun run verify` fails on a forge recording stamped `authored`. From this repository's
forge 1.22: `overseer-fetch-supported-forge`, the forge in each situation; `overseer-fetch-flint-brain`, the forge in each state of
Flint's brain, its fake agent playing the brain's session: running after one ask, ended by a stop, refused while the Overseer is paused,
and absent through its test setting `FORGE_WITHOUT_FLINT_BRAIN`; `overseer-fetch-board`, Example Storefront's board as the relay reads it:
the board document (with a draft ticket and a committed one the product owner gives an entity; an agent's question with its
recommendation, escalated to User; an open incident and a defaulted one's notice, left in the forge's store as an ended Assistant turn
leaves them, since the fake agent asks nothing; a pipeline applied over two app entities; and an update setup whose entities draft holds a
standing `equal-homes` refusal with its fix, which Apply refuses as `entity-refusals-stand`), and refused
another's token; the board's event stream from its start and from its first event's id; a board command applied,
refused with its code, fields and sentence, of an unknown kind, and answered 423 while launches are held for an install change, with the
board's notice in that hold; a picture accepted and read back, refused as too large and as no picture; a product owner job's stream (its handshake
and an empty history, since the fake agent writes no conversation) and a gate profile run's output; and `overseer-fetch-versions`, the forge answering older (1.0), one minor ahead and newer (2.1) through its
test setting `FORGE_VERSIONS_ANSWER`, and a forge from before system versions, serving no `/api/versions`. Every situation is a forge at a
system version. Each answer keeps its content type, and an answer read as bytes, such as a picture, is recorded in base64.

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
