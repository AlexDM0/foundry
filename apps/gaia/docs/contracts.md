# Contracts

Every versioned contract Gaia reads, writes, sends or serves. The known version of each lives once, in `CONTRACT_VERSIONS`
(`src/shared/constants/ContractVersions.ts`), as a major and a minor; an Overseer's contracts come from the `overseer-contracts` package
(`packages/overseer-contracts/`), which forge produces. The table below names each with that version, and
`src/shared/constants/ContractVersions.reference.spec.ts` fails `bun run verify` when the two disagree. A shape is defined once, in the
module the table names; this file does not repeat its keys.

## The version rule

Gaia and the forges it reads are released apart, so a running forge and a running Gaia may be of any two versions. Every contract
carries its version in its protocol, as two keys:

- **The major** travels in the integer key the contract has always carried (`monitorVersion`, a stored file's `version`); a reader of
  any age reads it there.
- **The minor** travels in an optional sibling key (`monitorMinor`, a stored file's `minor`; the identity's `contractMinors` beside
  `contracts`). An absent minor reads as 0. A version is never a string such as `"3.1"`, which an older reader would refuse.
- **A change that only adds fields is a minor bump** and backwards compatible; anything else (a key removed, renamed or retyped, a value
  that means something new) is a major bump.

The reading rule lives once, in `src/shared/utils/ContractVersionUtil.ts`, and every ingestion decides by it: a known major reads at any
minor, its unknown keys passed over; an older major reads only where it is listed under "Older majors Gaia still reads", migrated on its
ingestion to the current shape; a newer major, an older one not listed, a missing major or a version key that is no whole number never
reaches a mapper. The ingestion answers a verdict (`newer-contract`, `older-contract`, `newer-version`, `other-version` or `malformed`),
and Gaia shows the forge or the file as one it cannot read in full. Gaia writes and serves its own contracts with both keys. A
stored file Gaia rewrites at a newer minor than it knows is kept as it is, since the rewrite would drop the keys that minor adds
(`kept-newer-version`). Gaia and its page ship together, so a page that reads another major of `fleetVersion` is a stale page and
reloads once.

## Versioned contracts

| Key in `CONTRACT_VERSIONS` | Version | Major key, minor key | What and where | Gaia | Defined in | Served by |
| --- | --- | --- | --- | --- | --- | --- |
| `forgeRegistry` | 1.0 | `version`, `minor` | `~/.forge-monitor/projects.json`, the registry every forge of the account writes itself into | reads | `src/adapters/forge-registry/RegistryFile.ts` | the forge; `program` per entry with F9 |
| `forgeIdentity` | 1.0 | `identityVersion`, `identityMinor` | an Overseer's open `GET /api/identity`; its `contracts` names the major of each contract below that the forge serves, and `contractMinors` the minor | reads | `overseer-contracts/IdentityDocument`, `src/adapters/forge-api/IdentityIngestion.ts` | the forge from F1; before it, no version key and no `contracts` |
| `forgeBoardSummary` | 1.0 | `summaryVersion`, `summaryMinor` | an Overseer's open `GET /api/summary`, polled for a forge without the monitor contract | reads | `overseer-contracts/BoardSummaryDocument`, `src/adapters/forge-api/BoardSummaryIngestion.ts` | the forge |
| `forgeMonitor` | 3.0 | `monitorVersion`, `monitorMinor` | an Overseer's `GET /api/monitor` and each `monitor` event of `GET /api/monitor/events`, with the bearer token | reads | `overseer-contracts/MonitorSnapshotDocument`, `src/adapters/forge-api/MonitorSnapshotIngestion.ts` | the forge from F2 and F3; monitor 2 adds a kind to each warning and the current usage window; monitor 3 adds `flintBrain`, `null` for a forge without Flint, and an ended brain's activity entry of kind `flint-brain` with its tokens (G1, G2), authored in `src/testing/recordings/darwin/overseer-fetch-monitor-3.json` until a forge serves it |
| `forgeControl` | 2.0 | `contracts.control` and `contractMinors.control` of the identity | an Overseer's `POST /api/commands`, with the bearer token | sends | `overseer-contracts/ForgeControlCommand` | the forge from F7; control 2 adds `flint-brain-start` and `flint-brain-stop` and their refusals (G3), authored in `src/testing/recordings/darwin/overseer-fetch-monitor-3.json` until a forge serves it |
| `forgeEmbedChannel` | 1.0 | `channelVersion`, `channelMinor`; and `contracts.embed`, `contractMinors.embed` of the identity | the messages between Gaia's page and a forge's Bridge in Gaia's frame | reads and sends | `overseer-contracts/EmbedChannelMessage`, `page/views/forge-frame/EmbedChannel.ts` | the forge from F5 |
| `forgeProgramAnswer` | 1.0 | `answerVersion`, `answerMinor` | the forge program's JSON on standard output, for each verb Gaia runs (`start`, `stop`, `init`, `update`, `version`, `login-item`, the machine limit) | reads | `src/adapters/forge-program/@types/ForgeProgramAnswer.ts`, `utils/ForgeAnswerMapUtil.ts` | the forge from F8 |
| `forgeMachineLimits` | 1.0 | `version`, `minor` | `~/.forge-monitor/machine-limits.json`, the machine-wide agent limit | never reads: the limit arrives in the monitor snapshot and is set through the control contract | the forge alone | the forge from F6 |
| `gaiaSettings` | 1.0 | `version`, `minor` | `~/.gaia/settings.json` | reads and writes | `src/adapters/gaia-files/@types/StoredSettings.ts`, `SettingsFile.ts`, `SettingsWriter.ts` | Gaia |
| `gaiaServerRecord` | 1.0 | `version`, `minor` | `~/.forge-monitor/gaia/server.json`, which a forge reads to let Gaia's origin frame its Bridge | writes | `src/adapters/gaia-files/ServerRecordWriter.ts` | Gaia; the forge reads it from F5 |
| `gaiaFleetDocument` | 3.0 | `fleetVersion`, `fleetMinor` | `GET /api/fleet` and the `fleet` event of `GET /api/events` | serves; the page reads | `page/@types/FleetDocument.ts`, mapped out by `src/adapters/page-api/FleetDocumentMapUtil.ts` | Gaia |
| `gaiaCommand` | 2.0 | `commandVersion`, `commandMinor` | the body of `POST /api/commands` | the page sends; the server reads | `page/@types/CommandDocument.ts`, read in by `src/adapters/page-api/GaiaCommandIngestion.ts` | Gaia |
| `gaiaCommandAnswer` | 3.0 | `answerVersion`, `answerMinor` | the answer of `POST /api/commands` | serves; the page reads | `page/@types/CommandDocument.ts`, mapped out by `src/adapters/page-api/PageAnswerMapUtil.ts` | Gaia |
| `gaiaFrameSession` | 1.0 | `frameSessionVersion`, `frameSessionMinor` | the answer of `POST /api/forges/<trackerId>/frame-session` | serves; the page reads | `page/@types/FrameSessionDocument.ts`, mapped out by `src/adapters/page-api/PageAnswerMapUtil.ts` | Gaia |
| `gaiaHealth` | 1.0 | `healthVersion`, `healthMinor` | the open `GET /api/health` | serves; the launcher and a second `serve` read | `src/adapters/gaia-server/HealthDocument.ts` | Gaia |
| `gaiaProgramAnswer` | 1.0 | `answerVersion`, `answerMinor` | `gaia version --json` on standard output | writes | `src/Main.ts` | Gaia |
| `boundaryRecording` | 1.0 | `recordingVersion`, `recordingMinor` | `src/testing/recordings/<os>/<name>.json`, a boundary's recorded answers; test-only | writes in `bun run record`, reads in specs and verify | `src/testing/BoundaryRecordings.ts` | Gaia |

The forge's requirements F1 to F9 and G1 to G4 are the owner's to run on the forge's own board. Every fixture of a forge contract is
recorded from a forge that serves it (`bun run record <name>`), and `bun run verify` fails on a forge recording stamped `authored`, except
one whose entry in `RECORDED_BOUNDARIES` names the forge requirements it waits on: monitor 3 and control 2 (G1 to G3).

## Older majors Gaia still reads

A forge on older code keeps serving an older contract until it is updated, so Gaia reads these majors too, at any minor. Each is migrated
on its ingestion to the current major's shape, and a mapper only ever sees the current shape; an older control major, which Gaia sends
rather than reads, is held instead by the guard that sends it only the commands it carries. The majors live once, in
`OLDER_CONTRACT_VERSIONS_READ` (`src/shared/constants/ContractVersions.ts`, from `OLDER_OVERSEER_CONTRACT_MAJORS` in `overseer-contracts`),
and the same spec holds this table to it, both ways.

| Key in `CONTRACT_VERSIONS` | Older major | What the migration does | Migrated by |
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
- `POST /api/session-codes` and `POST /api/session`: an opaque one-time code and the session cookie it buys, as an Overseer's own
  (`src/features/page-server/routes/SessionRoutes.ts`).
- An Overseer's token file, named by the registry's `overseer.tokenPath` (`src/adapters/forge-api/OverseerTokenFile.ts`).
