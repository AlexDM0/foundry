# FORGE_REQUIREMENTS: system versions, versioned paths, and one definition of the contracts

Forge and Gaia are released independently and may run at different versions, even from one repository, so the only coupling between a
running forge and a running Gaia is what they say on the wire, never a shared package's version. This file adds V1 to V7, written as
tickets for the forge's own board: the forge keeps one system version by interoperability, publishes it at an unversioned
`GET /api/versions`, versions each endpoint by its path, carries the system version in its message protocols, and takes the Overseer's
documents from this package. The Gaia build does not implement them; Gaia already reads `/api/versions`, the versioned paths and the
system version in messages, and reads every forge that serves none of it exactly as before (`apps/gaia/docs/contracts.md`, "The version
model").

This replaces the earlier per-contract minor keys (`monitorMinor`, `identityMinor`, `contractMinors`, `channelMinor`, `answerMinor`) and
the command body's own control version: a REST answer carries no version of its own beyond the integer key it has always carried, and
no endpoint returns a per-endpoint version or version triple.

Checked against forge `main` at `317e5de1` (2026-11-15), whose Overseer serves `SERVED_CONTRACT_VERSIONS` summary, monitor, control and
embed at 1 (`src/shared/constants/OverseerApiContracts.ts`) at unversioned paths only, answers any unknown `/api/` path 404 with
`{ "refusal": "not-found" }` (`src/services/overseer/OverseerServer.ts`), and has monitor 2 and 3 and control 2 on their branches (G1 to G3).

## 1. Rules that hold for every requirement

The earlier four rules hold: every contract carries a version; the forge words, Gaia shows; Gaia reads nothing without a version; User
runs no command. Three more:

5. **One system version per system, by interoperability.** `major.minor`, never the package version: a change that only adds (a key, a
   route, a command kind, a message kind) is a minor bump, and every client built for that major keeps working; anything else (a key
   removed, renamed or retyped, a value that now means something else, a route removed) is a major bump. Forge 1.0 is the first forge
   that serves `/api/versions`, with the contracts released forges serve; forge 1.1 adds Flint's brain (G1 to G3), which only adds.
6. **Endpoints are versioned by path, side by side.** An endpoint is served at `/api/v<n>/<endpoint>`; a breaking change to one endpoint
   is served at `n + 1` beside `n`, backwards compatible where possible. A client version knows which endpoint versions it calls.
7. **The minimum supported is what retires an old endpoint version.** The server's `minimumSupported` is the oldest client system
   version it still serves; an endpoint version, or an unversioned path, may be removed only once no client at or above that minimum
   calls it.

## 2. What exists today

| Fact | Where |
| --- | --- |
| The identity's `identityVersion` and its `contracts` map of each contract's version | `src/services/overseer/OverseerServer.ts`, `src/shared/constants/OverseerApiContracts.ts` |
| `monitorVersion`, `summaryVersion` on the read routes | `src/shared/monitor/@types/MonitorSnapshot.ts`, `src/services/overseer/MonitorSnapshotAssembly.ts`, `BoardState.ts` |
| `controlVersion` on every command answer; the request body carries none | `cli/overseer/routes/CommandRoute.ts` |
| `channelVersion` on the embed channel, compared for equality; other keys passed over | `bridge/shell/VersionedEmbedChannel.ts` |
| Gaia's server record read at `version` 1, only `origin` taken | `cli/overseer/routes/FrameOrigins.ts` |
| The registry, the machine limits file and the program's JSON answers carry `version` or `answerVersion` | the registry writer, `src/adapters/machine-limits/MachineLimitsFile.ts`, the `--json` verbs |
| Every route at its unversioned path only, and no system version anywhere | `src/services/overseer/OverseerServer.ts` |
| Gaia's side of the Overseer's documents, as types, with the versions | this package, `@types/` and `constants/` |

## 3. Requirements

### V1. Serve `GET /api/versions`, unversioned, and never remove it (Must)

**Statement.** The Overseer answers `GET /api/versions` at that path, open like the identity, with this package's `VersionsDocument`:
`{ "current": { "major": 1, "minor": 1 }, "minimumSupported": { "major": 1, "minor": 0 } }`: the forge's own system version, and the
oldest forge system version a client may have been built for and still be served. Both are in the forge's own version space; a Gaia
compares them with the forge version it was built for and the oldest it still talks to. It answers it at every moment it answers anything, starting included, and never moves or versions the path.

**Reason.** It is the one call a client of any version makes first, to learn whether it can talk to the forge and at which paths (rules
6 and 7). Gaia decides its verdict on the forge from it: newer, older, ahead, behind, current, or not reported.

**Acceptance.** A spec: the route answers both versions as whole numbers while serving and while starting, with no token; the path is in
the route table's unversioned list. Gaia's recording `overseer-fetch-versions` is then taken from that forge
(`GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-versions`).

### V2. Keep the system version by interoperability, and raise the minimum only to retire (Must)

**Statement.** The forge keeps its system version in one constant beside `SERVED_CONTRACT_VERSIONS`, raised as rule 5 says with every
change to a route, a document, a command or a message, and its minimum supported in another, raised only when an endpoint version or an
unversioned path is removed (rule 7). Neither is the package version.

**Reason.** Gaia reads every forge it supports with what it knows; a field added under a major bump cuts every running Gaia off for no
reason, and a removal under a minor bump breaks it silently.

**Acceptance.** The forge's contract reference states both rules; a review checklist line asks, for every change to a route or a
document, whether it only adds, and whether it removes something a supported client calls.

### V3. Version each endpoint by its path, and serve old versions side by side (Must)

**Statement.** Every route is served at `/api/v<n>/<endpoint>`. The endpoint versions Gaia calls are this package's
`OVERSEER_ENDPOINT_VERSIONS`: identity, summary, commands and session codes at v1, the monitor and its stream at v2 (the warnings became
objects in monitor contract 2). A breaking change to an endpoint adds `v<n + 1>` beside `v<n>`. Today's unversioned paths keep answering
exactly as now until the minimum is raised past the last client that calls them; the documents keep carrying the integer version key
they carry today (`monitorVersion`, `identityVersion`, `contracts`, `controlVersion`), which every released Gaia reads, and carry no
per-endpoint version of their own.

**Reason.** Rule 6: an old Gaia keeps calling the paths it knows while a new one calls the new version, so neither has to be updated for
the other.

**Acceptance.** A spec per route: it answers at its versioned path as at its unversioned one, behind the same token, session and origin
guards, and a version it is not served at answers 404 `not-found`.

### V4. Carry the system version in the monitor stream's handshake and every event (Must)

**Statement.** `GET /api/v2/monitor/events` opens with a `handshake` event, `{ "systemVersion": { "major": 1, "minor": 1 } }`, before the
first `monitor` event, and every `monitor` event carries the same `systemVersion` beside the snapshot's own keys. The unversioned stream
may carry them too, since a released Gaia passes over keys and events it does not know.

**Reason.** A stream outlives the `/api/versions` answer it was opened after: an Overseer replaced at a Baton pass may be another
version, and the stream is where a client learns it.

**Acceptance.** A spec: the first event is the handshake, and each `monitor` event names the forge's current system version.

### V5. Carry the system version in every embed message of the Bridge (Must)

**Statement.** Every message the Bridge posts to its framing page, its `ready` first, carries `systemVersion`, the forge's system version,
beside `channel` and `channelVersion`, which stays 1 so every Gaia keeps hearing it. The Bridge reads a framing page's message at
`channelVersion: 1` and passes over its `systemVersion` and any other key it does not know; it may read the framing page's
`systemVersion` to decide what it offers.

**Reason.** The embed channel is a message protocol, so it carries the system version in its handshake (`ready`) and every message. Gaia
already sends its own in every message and hands the Bridge's on with each one; it keeps hearing a Bridge that sends none.

**Acceptance.** Specs: the ready and every later message carry the forge's `systemVersion`; a framing page's message with a
`systemVersion` and an added key is heard; one at another `channelVersion` is ignored, as today.

### V6. The Overseer's documents come from this package (Must, at the merge)

**Statement.** After the merge into the monorepo, forge's own types of the versions document, the identity, summary, monitor snapshot,
control commands and embed messages are this package's (`overseer-contracts/VersionsDocument`, `/IdentityDocument`,
`/BoardSummaryDocument`, `/MonitorSnapshotDocument`, `/ForgeControlCommand`, `/EmbedChannelMessage`); `SERVED_CONTRACT_VERSIONS` is
derived from `OVERSEER_CONTRACT_VERSIONS`, the endpoint versions it serves from `OVERSEER_ENDPOINT_VERSIONS`, and its system version from
`SUPPORTED_FORGE_VERSION` at the forge release that publishes it. Forge keeps its own assembly, wording and checks; the package holds
types and versions only. Where forge's type and the package's differ by a key the forge sends and Gaia does not read, the key is added to
the package's type, optional where only some versions carry it.

**Reason.** One definition of each document on the producing and the reading side removes the copy that drifted (W7.2, D5).

**Acceptance.** Forge's typecheck builds its routes against the package's types; this package's spec holds its versions; a change to a
document in this package raises the system version as V2 says and the package's own semantic version as its README says.

### V7. The package's own version is not the wire's (Must)

**Statement.** `overseer-contracts` is released with its own semantic version, independently of forge and of Gaia, and both depend on it
by a version range (`workspace:^` in the repository). A forge system minor bump is a package minor bump; a forge system major bump, or a
change that removes or changes a type, is a package major bump. A package release changes no running process: only the system version
a forge serves does.

**Reason.** Forge and Gaia are released apart; neither may need the other's release to build.

**Acceptance.** The package is publishable (not private) and its README states this rule.

## 4. What Gaia does while a requirement is missing

| Missing | Gaia shows |
| --- | --- |
| V1 | The forge's versions as not reported: Gaia reads it exactly as today, at its unversioned paths, by the integer keys of its documents. |
| V2 | A field added under a major bump makes Gaia show that forge as newer than it can talk to until Gaia is updated. |
| V3 | A forge that publishes V1 but serves no versioned paths answers Gaia's versioned calls 404, and reads as unreachable: V1 and V3 land together. |
| V4 | Nothing different: Gaia takes the forge's version from `/api/versions` and asks it again at every round of its watch. |
| V5 | Nothing different: Gaia hears a Bridge without `systemVersion` as today. |
| V6, V7 | Nothing at runtime: the package is a build-time definition. |

## 5. Order for the forge's board

V1, V2 and V3 together, as forge 1.0; V4 and V5 with them or in the next minor; V6 and V7 at the merge, after the package lands in the
monorepo. G1 to G3 (Flint's brain) land as forge 1.1, a minor: they only add.
