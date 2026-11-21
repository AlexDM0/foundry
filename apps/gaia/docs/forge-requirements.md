# Forge requirements: system versions, the compatibility registry, and a forge that knows no client

What Gaia needs from forge for the version model of 2026-11-15, written as tickets for forge's own board. Gaia sits on top of forge, and
forge never knows about it: each requirement below speaks of a client or a host, and none asks forge to name one. Forge owns
`packages/forge-contracts`, where most of what these tickets describe is already prepared, and decides every version in it.

## Status

Forge 3.0 meets V1 to V5 and V9: it answers `/api/versions` with current 3.0 and minimum 3.0, serves identity 1, summary 2, monitor 5
and control 3 at their `/api/v<n>/` paths beside the unversioned ones, carries the system version in the monitor stream, and takes its
documents from `forge-contracts`, every registry entry `shipped`. Gaia supports forge 3.0. Since 2.0 forge serves no page of its own, so the
requirements that let a host frame that page, V6 and V8, went with it, and V5 keeps only its half about the monitor stream. The numbers
V6 to V8 are not used again.

## 1. Rules that hold for every requirement

1. **Forge names no client.** Nothing forge serves, and nothing in a package forge depends on, names a program that calls it: a value,
   a path, a query and a sentence speak of a client or a host. `forge-contracts/PackageIsolation.spec.ts` holds this for the package.
2. **One system version, by interoperability.** `major.minor`, never the package version: a change that only adds (a key, a route, a
   command kind, a message kind) is a minor bump, and every client built for that major keeps working; anything else (a key removed,
   renamed or retyped, a value that now means something else, a route removed) is a major bump.
3. **Forge alone decides what it still supports.** Its minimum supported version is the oldest forge version a client may have been
   built for and still be served, whoever calls. Raising it is what retires an endpoint version or a compatibility path.
4. **Endpoints are versioned by path; messages carry the version.** A REST endpoint is served at `/api/v<n>/<endpoint>`, side by side
   with its other versions, and its answer carries no per-endpoint version. A message protocol carries the system version in its
   handshake and every message.

## 2. Requirements

### V1. Serve `GET /api/versions`, unversioned, and never remove it (Must)

**Statement.** Hephaestus answers `GET /api/versions` at that path, open like the identity, with `forge-contracts/ForgeSystemVersions`:
`{ "current": { "major": 1, "minor": 0 }, "minimumSupported": { "major": 0, "minor": 0 } }`, forge's own system version and its minimum
supported, both in forge's own version space. Version 0.0 stands for every forge released before system versions. It answers the path at
every moment it answers anything, starting included, and never moves or versions it.

**Reason.** It is the one call a client of any version makes first, to learn whether it can talk to the forge at all.

**Acceptance.** A spec: the route answers both versions as whole numbers while serving and while starting, with no token; the path is in
the route table's unversioned list. A client's recording of `/api/versions` is then taken from that forge.

### V2. Keep the system version by interoperability, and raise the minimum only to retire (Must)

**Statement.** Forge keeps its versions in `FORGE_SYSTEM_VERSIONS`: the current version raised as rule 2 says with every change to a
route, a document, a command or a message, and the minimum raised only to retire entries of the compatibility registry (V4). Neither is
the package version.

**Reason.** A client reads every forge version it supports with what it knows; an addition under a major bump cuts every running client
off for no reason, and a removal under a minor bump breaks it silently.

**Acceptance.** Forge's contract reference states both rules; a review checklist line asks, for every change to a route or a document,
whether it only adds, and whether it removes something a supported client needs.

### V3. Version each endpoint by its path, side by side (Must)

**Statement.** Every route is served at `/api/v<n>/<endpoint>`, at the versions the registry's endpoint entries name: identity and summary at
v1, commands at v2, the monitor and its stream at v3. A breaking change
to an endpoint adds `v<n + 1>` beside `v<n>`, with a registry entry. The unversioned paths keep answering exactly as before, since
forge's own command line calls them. No answer gains a per-endpoint version or a version triple.

**Reason.** A client built for one forge version calls the endpoint versions that version serves, so an older client and a newer one are
both served without either being updated for the other.

**Acceptance.** A spec per route: it answers at its versioned path as at its unversioned one, behind the same token and origin
guards, and a version it is not served at answers 404 `not-found`.

### V4. Keep the compatibility registry, and raise the minimum by its report (Must)

**Statement.** `forge-contracts/ForgeCompatibilityRegistry` holds one entry per thing forge keeps for clients of its older versions:
every versioned endpoint, and every compatibility path that is no endpoint (an unversioned alias, a payload migration, an older message
form), each with the forge version that introduced it and the last forge version whose clients still need it. Each entry forge has not
shipped is marked `authored` until it ships. `bun run versions:raise-minimum <major.minor>`, run in the package, is the dry run of a raise;
the raise itself is the one-line change to `FORGE_SYSTEM_VERSIONS.minimumSupported`, after which `ForgeCompatibilityRegistry.spec.ts`
fails until each listed entry, and the code it stands for, is removed or its entry corrected. The registry's logic is the
`system-versions` package's, which names no server.

**Reason.** What forge keeps for older clients is otherwise found only by reading the code; the registry says what a raise retires before
it is made, and the guard keeps the code and the registry in step after it.

**Acceptance.** Forge adds an entry with every endpoint version and every compatibility path it adds, and turns each `authored` entry
`shipped` when it ships; the package's specs pass.

### V5. Carry the system version in the monitor stream (Must)

**Statement.** `GET /api/v4/monitor/events` opens with a `handshake` event, `{ "systemVersion": { "major": 3, "minor": 0 } }`, before the
first `monitor` event, and every `monitor` event carries the same `systemVersion` beside the snapshot's own keys.

**Reason.** A stream outlives the `/api/versions` answer it was opened after: a Hephaestus replaced at a Baton pass may be another
version, and the message is where a client learns it.

**Acceptance.** Specs: the stream's first event is the handshake, and each `monitor` event names forge's current system version.

### V9. Take the documents from `forge-contracts`, released on its own version (Must, at the merge)

**Statement.** After the merge into the monorepo, forge's own types of the identity, summary, monitor snapshot and control commands
are the package's, and its served versions, endpoint versions and system version come from `HEPHAESTUS_CONTRACT_VERSIONS`, the
registry and `FORGE_SYSTEM_VERSIONS`. Forge keeps its own assembly, wording and checks; the package holds types, versions and the registry.
The package keeps its own semantic version, and an app depends on it by a version range (`workspace:^`): a forge system minor bump is a
package minor bump; a system major bump, or a removed or changed type, a package major bump. A package release changes no running process.

**Reason.** One definition of each document on the producing and the reading side removes the copy that drifted, and forge and its
clients release apart.

**Acceptance.** Forge's typecheck builds its routes against the package's types; the package is publishable and its README states the
version rule.

### V10. Declare the board stream's documents and the conversation entries in the contract (Should)

The board event stream's events carry forge's internal board state, and the job stream's entries, the profile stream's lines and a
command's applied and refused answers have no type in `forge-contracts`. Gaia reads the event stream as change signals and reads the
board document anew on each `board` event, and types the rest against its own copy (`src/adapters/forge-api/@types/ForgeStreamDocuments.ts`).
Declaring them in the contract, and carrying the board document in the `board` event, lets Gaia type every shape against the contract
and skip the extra read.

## 3. What Gaia does with a forge that misses a requirement

Gaia supports exactly one forge system version (`SUPPORTED_FORGE_VERSION`, forge 3.0) and keeps nothing for an older forge: forge 1 or 2,
and a forge that serves no V1 to V3, as every forge from before system versions, read as older, and Gaia offers Update forge.

| Missing | Gaia shows |
| --- | --- |
| V1 | The forge as older than Gaia can talk to: it serves no `/api/versions`. Gaia offers Update forge. |
| V2 | An addition under a major bump makes Gaia show the forge as newer than it can talk to until Gaia is updated. |
| V3 | A forge that publishes V1 but serves no versioned paths answers Gaia's calls 404 and reads as unreachable: V1 and V3 land together. |
| V4 | Nothing at runtime: the registry is a build-time definition, and Gaia's endpoint versions are derived from it as prepared. |
| V5 | Nothing different: Gaia takes the forge's version from `/api/versions` at every round of its watch. |
| V9 | Nothing at runtime. |
| V10 | Nothing different: Gaia reads the board document anew on each `board` event. |

## 4. Order for the forge's board

V1 to V5 and V9 shipped together as forge 1.0, with V6 and V8, which forge 2.0 retired with its page.
