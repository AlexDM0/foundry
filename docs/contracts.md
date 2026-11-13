# Contracts

Every versioned contract Gaia reads, writes, sends or serves. The known number of each lives once, in `CONTRACT_VERSIONS`
(`src/shared/constants/ContractVersions.ts`); the table below names each with that number, and
`src/shared/constants/ContractVersions.reference.spec.ts` fails `bun run verify` when the two disagree. A shape is defined once, in the
module the table names; this file does not repeat its keys.

A reading at another number never reaches a mapper: its ingestion answers a verdict (`newer-contract`, `older-contract`, `newer-version`
or `other-version`), and Gaia shows the forge or the file as one it cannot read in full. Gaia and its page ship together, so a page that
reads another `fleetVersion` is a stale page and reloads once.

## Versioned contracts

| Key in `CONTRACT_VERSIONS` | Version | Version key | What and where | Gaia | Defined in | Served by |
| --- | --- | --- | --- | --- | --- | --- |
| `forgeRegistry` | 1 | `version` | `~/.forge-monitor/projects.json`, the registry every forge of the account writes itself into | reads | `src/adapters/forge-registry/RegistryFile.ts` | the forge; `program` per entry with F9 |
| `forgeIdentity` | 1 | `identityVersion` | an Overseer's open `GET /api/identity`; its `contracts` names the number of each contract below that the forge serves | reads | `src/adapters/forge-api/@types/IdentityDocument.ts`, `IdentityIngestion.ts` | the forge from F1; before it, no version key and no `contracts` |
| `forgeBoardSummary` | 1 | `summaryVersion` | an Overseer's open `GET /api/summary`, polled for a forge without the monitor contract | reads | `src/adapters/forge-api/@types/BoardSummaryDocument.ts`, `BoardSummaryIngestion.ts` | the forge |
| `forgeMonitor` | 1 | `monitorVersion` | an Overseer's `GET /api/monitor` and each `monitor` event of `GET /api/monitor/events`, with the bearer token | reads | `src/adapters/forge-api/@types/MonitorSnapshotDocument.ts`, `MonitorSnapshotIngestion.ts` | the forge from F2 and F3 |
| `forgeControl` | 1 | `contracts.control` of the identity | an Overseer's `POST /api/commands`, with the bearer token | sends | `src/lib/forge-client/@types/ForgeControlCommand.ts` | the forge from F7 |
| `forgeEmbedChannel` | 1 | `channelVersion`, and `contracts.embed` of the identity | the messages between Gaia's page and a forge's Bridge in Gaia's frame | reads and sends | `page/views/forge-frame/EmbedChannel.ts` | the forge from F5 |
| `forgeProgramAnswer` | 1 | `answerVersion` | the forge program's JSON on standard output, for each verb Gaia runs (`start`, `stop`, `init`, `update`, `version`, `login-item`, the machine limit) | reads | `src/adapters/forge-program/@types/ForgeProgramAnswer.ts`, `utils/ForgeAnswerMapUtil.ts` | the forge from F8 |
| `forgeMachineLimits` | 1 | `version` | `~/.forge-monitor/machine-limits.json`, the machine-wide agent limit | never reads: the limit arrives in the monitor snapshot and is set through the control contract | the forge alone | the forge from F6 |
| `gaiaSettings` | 1 | `version` | `~/.gaia/settings.json` | reads and writes | `src/adapters/gaia-files/@types/StoredSettings.ts`, `SettingsFile.ts`, `SettingsWriter.ts` | Gaia |
| `gaiaServerRecord` | 1 | `version` | `~/.forge-monitor/gaia/server.json`, which a forge reads to let Gaia's origin frame its Bridge | writes | `src/adapters/gaia-files/ServerRecordWriter.ts` | Gaia; the forge reads it from F5 |
| `gaiaFleetDocument` | 1 | `fleetVersion` | `GET /api/fleet` and the `fleet` event of `GET /api/events` | serves; the page reads | `page/@types/FleetDocument.ts`, mapped out by `src/adapters/page-api/FleetDocumentMapUtil.ts` | Gaia |
| `gaiaCommand` | 1 | `commandVersion` | the body of `POST /api/commands` | the page sends; the server reads | `page/@types/CommandDocument.ts`, read in by `src/adapters/page-api/GaiaCommandIngestion.ts` | Gaia |
| `gaiaCommandAnswer` | 1 | `answerVersion` | the answer of `POST /api/commands` | serves; the page reads | `page/@types/CommandDocument.ts`, mapped out by `src/adapters/page-api/CommandAnswerMapUtil.ts` | Gaia |
| `gaiaFrameSession` | 1 | `frameSessionVersion` | the answer of `POST /api/forges/<trackerId>/frame-session` | serves; the page reads | `page/@types/FrameSessionDocument.ts`, mapped out by `src/adapters/page-api/FrameSessionAnswerMapUtil.ts` | Gaia |
| `gaiaHealth` | 1 | `healthVersion` | the open `GET /api/health` | serves; the launcher and a second `serve` read | `src/adapters/gaia-server/HealthDocument.ts` | Gaia |
| `gaiaProgramAnswer` | 1 | `answerVersion` | `gaia version --json` on standard output | writes | `src/Main.ts` | Gaia |
| `boundaryRecording` | 1 | `recordingVersion` | `src/testing/recordings/<os>/<name>.json`, a boundary's recorded answers; test-only | writes in `bun run record`, reads in specs and verify | `src/testing/BoundaryRecordings.ts` | Gaia |

The forge's requirements F1 to F9 are the owner's to run on the forge's own board. Until the forge serves one, the fixtures of that
contract are authored by hand and stamped `authored`, and `bun run verify` lists each of them; recording them from a real forge waits in
`docs/backlog.md`.

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
