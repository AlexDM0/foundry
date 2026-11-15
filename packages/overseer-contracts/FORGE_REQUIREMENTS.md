# FORGE_REQUIREMENTS: contract versions as major.minor

Forge and Gaia are released as independent packages. Even in one repository the running forge and the running Gaia may be of
different versions, so the only coupling between them at runtime is a contract on the wire, never a shared package's version. This
file adds V1 to V6, so that the forge carries each contract's minor beside its major and the Overseer's contracts are defined once, in
this package. They are written as tickets for the forge's own board. The Gaia build does not implement them; Gaia already reads and
writes both keys (`apps/gaia/docs/contracts.md`, "The version rule").

Checked against forge `main` at `317e5de1` (2026-11-15), whose Overseer serves `SERVED_CONTRACT_VERSIONS` summary, monitor, control and
embed at 1 (`src/shared/constants/OverseerApiContracts.ts`), with monitor 2 and 3 and control 2 on their branches (G1 to G3).

## 1. Rules that hold for every requirement

The earlier four rules hold: every contract carries a version; the forge words, Gaia shows; Gaia reads nothing without a version; User
runs no command. Two more:

5. **A version is a major and a minor.** The integer key each contract has always carried keeps meaning the major; the minor travels in
   an optional sibling key, and an absent minor reads as 0. Never a string such as `"3.1"`: every Gaia already running compares the
   integer key and would refuse it.
6. **A change that only adds fields is a minor bump** and backwards compatible: a reader of the same major reads it and passes over the
   keys it does not know. Anything else (a key removed, renamed or retyped, a value that now means something else, a new required key
   in what a reader sends) is a major bump.

Under rule 6, monitor 3 would have been 2.1: it only adds `flintBrain` and the `kind` and `tokens` of an ended brain's activity entry.
Control 2 would have been 1.1, since it only adds two command kinds; a sender then sends a new kind only to a forge whose minor carries
it (V3). Monitor 2 stays a major: it turned each warning from a sentence into an object.

## 2. What exists today

| Fact | Where |
| --- | --- |
| The identity's `identityVersion` and its `contracts` map of majors | `src/services/overseer/OverseerServer.ts`, `src/shared/constants/OverseerApiContracts.ts` |
| `monitorVersion`, `summaryVersion` on the read routes | `src/shared/monitor/@types/MonitorSnapshot.ts`, `src/services/overseer/MonitorSnapshotAssembly.ts`, `BoardState.ts` |
| `controlVersion` on every command answer; the request body carries none | `cli/overseer/routes/CommandRoute.ts` |
| `channelVersion` on the embed channel, compared for equality; other keys passed over | `bridge/shell/VersionedEmbedChannel.ts` |
| Gaia's server record read at `version` 1, only `origin` taken | `cli/overseer/routes/FrameOrigins.ts` |
| The registry, the machine limits file and the program's JSON answers carry `version` or `answerVersion` | the registry writer, `src/adapters/machine-limits/MachineLimitsFile.ts`, the `--json` verbs |
| Gaia's side of the Overseer's documents, as types, with the versions | this package, `@types/` and `constants/OverseerContractVersions.ts` |

## 3. Requirements

### V1. The minor beside each version the forge writes (Must)

**Statement.** Every document the forge serves or writes carries its minor beside its major, at 0 until a field is added:
`identityMinor` beside `identityVersion`; `contractMinors` beside `contracts` on the identity, the same keys, each a whole number;
`summaryMinor`, `monitorMinor` on the read routes and on each `monitor` event; `controlMinor` beside `controlVersion` on every command
answer; `channelMinor` beside `channelVersion` on every message the Bridge posts; `minor` beside `version` in the registry and the
machine limits file; `answerMinor` beside `answerVersion` in every `--json` answer.

**Reason.** Rule 5. A reader learns that a forge serves more than it knows without refusing it.

**Acceptance.** A spec per route, file and answer finds both keys; the identity's `contractMinors` names exactly the contracts
`contracts` names. Gaia's recordings taken from that forge (`bun run record overseer-fetch-every-contract` and the others) carry them.

### V2. Bump the minor only for additive changes (Must)

**Statement.** A change that only adds fields bumps the minor of that contract and keeps its major; anything else bumps the major and
resets the minor to 0 (rule 6). The forge's own versions of the Overseer's contracts are `OVERSEER_CONTRACT_VERSIONS` in this package
(V5), so one change names both the documents and the version.

**Reason.** Gaia reads any minor of a major it knows (`ContractVersionUtil`) and refuses a newer major; a field added under a major bump
cuts every running Gaia off from the forge for no reason, and a removal under a minor bump breaks it silently.

**Acceptance.** The forge's contract reference states the rule; a review checklist line asks, for every change to a document in
`@types/`, whether it only adds fields.

### V3. Read every minor of a major the forge reads, and keep the older majors it supports (Must)

**Statement.** Where the forge reads what Gaia writes, it reads the major and passes over the minor and the keys it does not know: Gaia's
server record (`version`, `minor`), the embed channel's messages from the framing page (`channelVersion`, `channelMinor`), the command
body. A forge keeps reading the older majors it lists as supported, and keeps serving the commands of an older control major to a sender
that names it. A command kind a minor adds is refused by a forge at an older minor as `malformed-body`, as an unknown kind is today.

**Reason.** Running versions differ in both directions: an older forge meets a newer Gaia as often as the other way round.

**Acceptance.** Specs: the server record at `minor: 1` with an added key still gives its origin; a parent message at `channelMinor: 1`
with an added key is still heard; a record or message at another major is ignored, as today.

### V4. The command body names its control version (Should)

**Statement.** `POST /api/commands` accepts an optional `controlVersion` and `controlMinor` in its body, the version the sender built
the command for. A body at a newer major than the forge serves is refused with a code of its own, `newer-control-contract`, and its
sentence; a body without them is read as today.

**Reason.** Rule 1: every contract carries its version. Today the body carries none, so a forge cannot tell a command built for a
newer contract from a malformed one. Gaia sends the keys once a forge it reads names V4 in the identity's minor of `control`.

**Acceptance.** A spec per case: no keys, the served major at any minor, a newer major.

### V5. The Overseer's documents come from this package (Must, at the merge)

**Statement.** After the merge into the monorepo, forge's own types of the identity, summary, monitor snapshot, control commands and
embed messages are this package's (`overseer-contracts/IdentityDocument`, `/BoardSummaryDocument`, `/MonitorSnapshotDocument`,
`/ForgeControlCommand`, `/EmbedChannelMessage`), and `SERVED_CONTRACT_VERSIONS` is derived from `OVERSEER_CONTRACT_VERSIONS`. Forge keeps
its own assembly, wording and checks; the package holds types and versions only. Where forge's type and the package's differ by a key the
forge sends and Gaia does not read, the key is added to the package's type, optional where only some majors carry it.

**Reason.** One definition of each document on the producing and the reading side removes the copy that drifted (W7.2, D5).

**Acceptance.** Forge's typecheck builds its routes against the package's types; this package's spec holds its versions; a change to a
document in this package bumps its version as V2 says and the package's own semantic version as its README says.

### V6. The package's own version is not the wire's (Must)

**Statement.** `overseer-contracts` is released with its own semantic version, independently of forge and of Gaia, and both depend on it
by a version range (`workspace:^` in the repository). A wire minor bump is a package minor bump; a wire major bump is a package major
bump, since it removes or changes a type. A package release changes no running process: only the wire version a forge serves does.

**Reason.** Forge and Gaia are released apart; neither may need the other's release to build.

**Acceptance.** The package is publishable (not private) and its README states this rule.

## 4. What Gaia does while a requirement is missing

| Missing | Gaia shows |
| --- | --- |
| V1 | Nothing different: an absent minor reads as 0, so a forge without minors reads as today. |
| V2 | A field added under a major bump makes Gaia show that forge as newer than it knows until Gaia is updated. |
| V3 | Nothing different today; a forge that refused Gaia's minor keys would stop framing Gaia's page, which no forge does. |
| V4 | Gaia sends no version in the command body and gates each command by the identity's `contracts.control`, as today. |
| V5, V6 | Nothing at runtime: the package is a build-time definition. |

## 5. Order for the forge's board

V1 and V3 first, together with the next contract change; V2 with them, as a rule; V4 independently; V5 and V6 at the merge, after the
package lands in the monorepo.
