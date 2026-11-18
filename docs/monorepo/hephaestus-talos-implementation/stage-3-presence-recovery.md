# Stage 3: Presence and recovery

## Goal

Every start of a board's forge knows what kind of start it is: a handover, a start after a stop on purpose, a start
after the machine went down, or a start after a crash. It records that kind, makes the record truthful by itself and
starts no interrupted work until the user says so, for one ticket, one job or everything at once. A crash leaves a crash
log complete enough to trace it back, the forge stays off until the user starts it again from Gaia or the CLI, an agent
that crashed while the forge did not is resumed twice and then waits, a pass that fails is named apart from a crash, and
the CLI alone can show the crash, start the forge again and resume the work.

## Depends on

Stages that must be finished: stage 0 (the owner's decisions of design section 12 and the trace of what an Airlock
leaves half done), stage 1 (the monorepo migration closed) and stage 2 (Talos, the commander).

What this stage needs from stage 2, by role, with the names stage 2's plan gives them (`stage-2-talos.md`). Before the
first work package, confirm each name in stage 2's code. Where an item is missing, stop and report it; do not build it
here.

| Need | What it must be, by stage 2's names | Used by |
| --- | --- | --- |
| N1. The reconnect report | `regroup` (`apps/forge/src/services/overseer/Regrouping.ts`, as stage 2's WP2.13 item 2 leaves it), run once at start before the first pass: per job, `BoardChildren.livenessOf` answers `live`, `ended` with the `ChildEnd` Talos recorded, or `lost` (the child died with Talos, or the machine went down); a `lost` child is settled by `settleLostChild` (`src/services/overseer/TalosStart.ts`, stage 2's WP2.9) into `child-<i>.lost-cause`. Today's report shape is `RegroupingReport` (`Regrouping.ts:43-52`) | WP3.9 |
| N2. The causes stage 2 adds | `talos-paused` (a clean quit of Talos) and `lease-ended`, both in `INTERRUPTION_CAUSES` (`apps/forge/src/lib/tracker-model/constants/JobStates.ts:73-82`, stage 2's WP2.11); both resume by themselves through the Playbook in stage 2 | WP3.1, WP3.2 |
| N3. The crash causes | `CRASH_INTERRUPTION_CAUSES` (`JobStates.ts:91`), unchanged by stage 2: `watcher-lost` and `agent-crashed` | WP3.2 |
| N4. The network-outage ending | The interruption cause `network-outage` (stage 2's WP2.11), set by the pass when Talos's child record lists the recognised ending `network-outage` (stage 2's WP2.13 item 4.1), and stage 2's list `INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage']` in `JobStates.ts`, which WP3.2 replaces with the resume policy table | WP3.1, WP3.2 |
| N5. The lease renewer | `startLeaseRenewal` in `src/services/overseer/LeaseRenewal.ts` and its worker `LeaseRenewalThread.ts` (stage 2's WP2.9), renewing every `LEASE_RENEWAL_INTERVAL_MILLISECONDS` (`src/shared/constants/OverseerLimits.ts`) from its own thread and posting `renewed` notes back. It has no hook for another action: WP3.5 adds the heartbeat write to the thread | WP3.5 |
| N6. A crash of Talos | The two `ensureTalos` call sites (`src/services/overseer/TalosStart.ts`): at start in `startServing`, and while serving after the connection closed or a child read `lost` (stage 2's WP2.13 item 13). Each answers `started` with `previousTalos: 'lost'` once it stopped the orphans and settled their jobs; stage 2 then serves on with a new Talos | WP3.7 |
| N7. Lines under Talos | `lineEndOf(folder)` in `src/services/overseer/JobLaunch.ts` (stage 2's WP2.13 item 6): `pending` while live or unlaunched, `rerun` when the newest instance ended `paused` or reads `lost`, otherwise its `ChildEnd` | WP3.10 |
| N8. The crash matrix on Talos | `CrashMatrix.integration.spec.ts`, `CrashMatrix.spec.ts` and `CrashMatrix.merges.spec.ts` ported to Talos with today's rows and titles (stage 2's WP2.13 specs) | WP3.14 |
| N9. The Baton record | `BatonRecord` (`apps/forge/src/services/overseer/Baton.ts:16-26`) still written whole at each start and released at a stop, with `talosProtocolVersion` in place of `watcherProtocolVersion` (stage 2's WP2.13) | WP3.6, WP3.8 |

What this stage hands to later stages:

- Stage 4 (packages): the resume policy table, the new causes, the new log records and the Playbook change live in the
  tracker model and move with it.
- Stage 5 (store port): the presence record, the heartbeat file and the crash logs are new stored formats under the
  board's data folder. Stage 5 decides whether they sit behind the store port or under the operating system port; this
  stage reads and writes them through one module each, so the move is local.
- Stage 6 (Gaia's views): the presence document on the read API, the registry's presence key and the
  `interrupted-work-resume` command in `packages/forge-contracts`. Gaia's crash alert, the interrupted-work list and the
  resume control are drawn there.
- Stage 8 (shrink the HTTP surface): nothing removed here; the presence route is one of the reads that stays.
- Stage 9 (rename): every new file and folder sits under today's `overseer` folder and names no Overseer in a new
  identifier, so the rename moves them with the rest.

## Decisions this stage carries out

From `docs/monorepo/hephaestus-talos.md` section 2:

- **3.** The presence record, the heartbeat file and the crash log carry a format version.
- **8.** An agent paused by a clean quit of Talos keeps resuming by itself; the resume policy table names that cause so.
- **11.** An answer to a question still resumes its session: answering is an instruction for that job.
- **12.** Presence, the start classification and the resume instructions are persisted, never held in memory.
- **13.** Every start is classified and reconciled by itself; interrupted work waits for an instruction.
- **14.** A crash writes a crash log, keeps the forge off until a start by the user, and is never retried.
- **15.** Only the part both open answers share: an ending on a network outage is an interruption of its own that is
  never counted as a failure or a crash, and that resumes on instruction. Whether it also resumes by itself is the
  owner's (Needs the owner, item 1).
- **20.** The login item still brings a forge back after a reboot by its own means; the work it finds interrupted waits.
- **21.** The forge side of the warning: the presence document and the registry's presence key that Gaia reads.
- **22.** Resuming is a command (`interrupted-work-resume`), from the CLI verb `resume` or the command endpoint.
- **30.** An agent that crashed while the forge did not is resumed twice; after that its job waits.
- **32.** The new stored formats and the changed login item line replace the old outright; boards are set up anew.
- **34.** Orchestrated sessions build this stage outside both trackers.

## Today's code

Paths are from `apps/forge/` unless they start with `packages/` or `apps/gaia/`. Rechecked against `main` after the
entities work landed (forge system version 1.18, install version 36).

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The Baton record: process identity, start stamp, boot identity, port, URL, token file, code version | `src/services/overseer/Baton.ts:16-26` | Kept. Presence is a separate record beside it (WP3.5) |
| A Baton generation is created exclusively and the newest naming a live process is the Overseer | `src/services/overseer/Baton.ts:136-146` | Kept. The classification reads the newest dead generation (WP3.6) |
| `Baton.release` unlinks the holder's generation at a stop | `src/services/overseer/Baton.ts:172-179` | Kept. A completed stop is now also written to presence, before the release (WP3.5) |
| The Baton pass file and its states | `src/services/overseer/BatonPass.ts:28-35`, `:88-104` | Kept |
| The successor's admission `predecessor-gone`, "starts as after a crash" | `src/services/overseer/BatonPass.ts:239-253`, `cli/overseer/OverseerForeground.ts:716` | Changed: classified `crashed`, and a successor is no start by the user, so it stays off (WP3.8) |
| `release`: drive pass stopped, `overseer-stopped` `baton-passed` logged, server stopped | `cli/overseer/OverseerForeground.ts:651-660` | Changed: writes the presence ending `handed-over` (WP3.5) |
| `closeTheStoppedOverseer`: logs `overseer-stopped` `stopped`, removes the registry entry, releases the Baton | `cli/overseer/OverseerForeground.ts:169-176` | Changed: writes the presence ending `stopped` and the registry presence `stopped` (WP3.5, WP3.8) |
| `startServing`: binds, takes the Baton, logs `overseer-started` in one hold, then regroups | `cli/overseer/OverseerForeground.ts:398-648`, the start hold at `:561-568` | Changed: classifies the start before it binds, writes presence after the Baton, logs `start-classified` in the start hold (WP3.8) |
| The Overseer's logger appends `<data>/overseer.log` | `cli/overseer/OverseerForeground.ts:128-138` | Kept. Its tail goes into a crash log (WP3.7) |
| The foreground loop's end: stop waits, then `closeTheStoppedOverseer` | `cli/overseer/OverseerForeground.ts:775-804` | Changed only through `closeTheStoppedOverseer` |
| The stop verbs | `cli/overseer/StopCommand.ts:13-20`, `cli/overseer/OverseerStop.ts:15-38` | Kept; they reach the presence ending through `closeTheStoppedOverseer` |
| `start`: starts the Overseer detached unless one is live | `cli/overseer/StartCommand.ts:34-69` | Changed: passes the start origin `user` (WP3.8) |
| `oversee` and its subcommands, `oversee status` | `cli/overseer/OverseerCommand.ts:63-84`, `:142-172`, `:174-180` | Changed: `--started-by`, presence in `oversee status`, a new `oversee crash` (WP3.8, WP3.13) |
| `oversee resume` (`overseer-resume`): undoes a pause | `cli/overseer/OverseerCommand.ts:128-139` | Kept; the new verb `resume` is a different command (Traps) |
| The detached start shared by `oversee --detach`, `start` and `open` | `cli/overseer/DetachedOverseerStart.ts:36-41` | Changed: carries the start origin (WP3.8) |
| The macOS login item runs `oversee --detach` | `cli/setup/DarwinAutostart.ts:17-19` | Changed: `oversee --detach --started-by login-item`, and the same in the Linux and Windows autostart adapters (WP3.8) |
| The registry's `overseer` key, written at start, `removed` at stop | `src/services/tracker/MonitorRegistration.ts:37-48` | Changed: a `presence` key beside it (WP3.8) |
| Gaia reads only the keys it names from a board's registry entry | `apps/gaia/src/adapters/forge-registry/utils/RegistryMapUtil.ts:32-59` | Kept; it passes over the new `presence` key until stage 6 reads it |
| A lost Watcher's cause: foreign boot `reboot`, a killed surviving child `watcher-lost`, else `agent-crashed` | `src/services/overseer/Regrouping.ts:96-124` | Replaced in stage 2 (N1). This stage maps the start's kind onto children that are gone with no end of their own (WP3.9) |
| `Regrouping.regroup` before the first pass | `src/services/overseer/Regrouping.ts:223-244` | Replaced in stage 2 (N1) |
| `DrivePass.regroup` wakes one forced pass after regrouping | `src/services/overseer/DrivePass.ts:1578-1587` | Changed: receives the start's classification and applies the reconcile causes (WP3.9) |
| A pass that throws is logged ("A drive pass failed and waits for the next wake-up") and waits for the next wake-up | `src/services/overseer/DrivePass.ts:1553-1566` | Changed: named `pass-abandoned`, counted, written to presence, a notice after three in a row (WP3.11) |
| The Overseer's notices, derived each pass | `src/services/overseer/DrivePass.ts:280-301`, `noticesOf` at `:997-1025` | Changed: the notice `passes-abandoned` (WP3.11) |
| The notices worded for `oversee status`, and for the Bridge header and the monitor snapshot's `{ kind, text }` | `cli/overseer/OverseerWording.ts:1044-1073`, `src/shared/monitor/utils/NoticeWordingUtil.ts:43-72` | Changed: the notice `passes-abandoned` (WP3.11) |
| A lost or crashed session interrupts its job | `src/services/overseer/DrivePass.ts:614-615` | Changed by stage 2; not touched here |
| The tracker lock gives up with `tracker-lock-held` | `src/services/tracker/TrackerLock.ts:262-278` | Kept. Named as a reason of an abandoned pass (WP3.11) |
| The interruption causes, unchanged by the entities work | `src/lib/tracker-model/@types/Job.ts:77-91`, `src/lib/tracker-model/constants/JobStates.ts:73-82` | Changed: `forge-stopped` and `forge-crashed` added (WP3.1) |
| `CRASH_INTERRUPTION_CAUSES`, `isCrash` | `src/lib/tracker-model/constants/JobStates.ts:90-91`, `src/lib/tracker-model/Playbook.ts:148-150` | Kept |
| The Playbook's resume steps for interrupted jobs, with the pipeline agent's own hold | `src/lib/tracker-model/Playbook.ts:467-487` | Changed: driven by the resume policy table (WP3.2) |
| Past the crash bound a job is `replace-job`, ended `replaced` | `src/lib/tracker-model/Playbook.ts:409-412`, `:482` | Changed: past the bound the job waits (WP3.2) |
| An interrupted product owner resumes; past the bound `refresh-intake` or `await-answer` | `src/lib/tracker-model/Playbook.ts:414-425` | Changed: follows the policy table; past the bound it waits, or waits `awaiting-answer` with a question open (WP3.2) |
| A red handoff's own resume bound | `src/lib/tracker-model/Playbook.ts:455-465` | Kept |
| Two counted crashes on different tickets open `outage` | `src/lib/tracker-model/Playbook.ts:180-200` | Kept |
| `job-lost` after two `replaced` in a row | `src/lib/tracker-model/Playbook.ts:202-212`, `:512-522` | Kept; the crash bound no longer feeds it (Traps) |
| `resume-job` and `replace-job` steps | `src/lib/tracker-model/@types/PlaybookStep.ts:46-52` | Changed: `resume-job` carries whether it was instructed (WP3.2) |
| `Board.applyPlaybookStep` moves `resume-job` to `running` (through `Board.moveJob`, `:467-469`) and ends `replace-job` `replaced` | `src/lib/tracker-model/Board.ts:824-882`, `:849-852` | Changed: an instructed resume (WP3.2) |
| `Jobs.moveJob` counts a crash resume in `crashResumes` and logs `job-resumed` | `src/lib/tracker-model/Jobs.ts:137-149` | Changed: an instructed resume sets `crashResumes` to 0 (WP3.2) |
| `Jobs.interruptJob` logs `job-interrupted` | `src/lib/tracker-model/Jobs.ts:151-159` | Kept |
| The bound `JOB_RESUMES_BEFORE_FRESH: 2` | `src/shared/constants/LifecycleLimits.ts:12`, `src/lib/tracker-model/@types/LifecycleLimits.ts:7` | Renamed `CRASH_RESUMES_BEFORE_WAITING`, still 2 (WP3.2) |
| The log record schema: `job-interrupted`, `job-resumed`, `overseer-started`, `overseer-stopped` | `src/lib/tracker-model/constants/LogRecordSchema.ts:293-294`, `:325-326`; the field shapes at `:19-80`, among them `optional-count` (added by the entities work) and `optional-flag` | Changed: `start-classified`, `job-resume-instructed`, `job-line-lost` added (WP3.1, WP3.10) |
| The log wording of `overseer-started` and `overseer-stopped` | `src/adapters/utils/LogUtil.ts:293-296` | Changed: words the new records (WP3.1, WP3.10) |
| Each log field shape's copy, a record keyed by every shape | `src/adapters/log/utils/LogRecordMappingUtil.ts:53-115` | Changed: the two new value shapes (WP3.1) |
| `FailedPassUtil`: a ticket's "failed passes" are failed job outcomes, counted per entity and stage since the entities work, and reset by `ticket-unheld` | `src/lib/tracker-model/utils/FailedPassUtil.ts:1-6`, `:74-75` | Kept. The name is taken, so an abandoned pass is never called a failed pass (Traps) |
| A failed vendor resume ends the job `replaced` and opens `resume-failed` (a merge agent opens none) | `src/services/overseer/JobResumption.ts:105-121` | Kept |
| `job fresh` on a job with no session ends it `replaced`, so the next attempt launches | `src/lib/tracker-model/JobControls.ts:51-76`, `src/services/control/JobControls.ts:60-63` | Kept. It is the instruction "start fresh instead" for a waiting job |
| The control service's appliers | `src/services/control/ControlService.ts:27-43` | Changed: `RESUME_CONTROLS` added (WP3.3) |
| The role policy for relayed commands: allowlists per role, the Assistant only an incident move | `src/services/control/Bouncer.ts:59-99`, `:202-211` | Changed only if it would admit the new kind for an agent role (WP3.3) |
| The verbs `job show`, `attach`, `message`, `wind-down`, `stop`, `fresh` | `cli/jobs/JobCommand.ts:188-195` | Kept |
| The command table | `cli/CommandTable.ts:11-48` | Changed: `resume` (WP3.3) |
| The command route takes every control kind | `cli/overseer/routes/CommandRoute.ts:52-55` | Kept; it takes the new kind with no change |
| The read routes | `src/services/overseer/OverseerServer.ts:534-585` | Changed: `presence` (WP3.12) |
| The top-level `status` writes a notice to standard error for an unreadable hold journal | `cli/tracking/status/StatusCommand.ts:39-43` | Changed: the same kind of notice for a forge off after a crash (WP3.13) |
| The command kinds Gaia may send | `packages/forge-contracts/@types/ForgeControlCommand.ts:9-18` | Changed: `interrupted-work-resume` (WP3.3) |
| The forge system version 1.18 | `packages/forge-contracts/constants/ForgeSystemVersions.ts:40-43` | Raised by one minor over what stage 2 left (WP3.3, WP3.12) |
| The compatibility registry's endpoints; the server serves each one not yet removable, mapping `/api/v<n>/<endpoint>` onto its unversioned route | `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:38-49`; `src/services/overseer/OverseerServer.ts:601-619` | Changed: `presence` at version 1 (WP3.12) |
| The process supervision port; no boot time | `src/lib/process-identity/ProcessSupervision.ts:39-70` | Changed: `bootStartedAtEpochSeconds` (WP3.4) |
| macOS reads the boot through `sysctl kern.bootsessionuuid` | `src/lib/process-identity/DarwinProcessIdentity.ts:14-15`, `:49` | Changed: also reads `kern.boottime` (WP3.4) |
| An orphaned merge-in or refresh is aborted and its slot freed and requeued | `src/services/overseer/Airlocks.ts:792-797` | Changed: after a start that waits, the ticket is held `interrupted:merge` instead of retried (WP3.9) |
| An Airlock agent that ended otherwise leaves the slot orphaned and requeued | `src/services/overseer/Airlocks.ts:990-1007` |
| A constitution commit cut short, or whose commit does not read back, ends `orphaned` | `src/services/overseer/Airlocks.ts:1443-1450`, `:1483-1485`, `:1516` | Changed the same way (WP3.9) | Changed the same way (WP3.9) |
| A parked candidate gives up its slot | `src/services/overseer/Airlocks.ts:1326-1344` | Kept; the `interrupted:` hold is read beside `parked:` (WP3.9) |
| A held ticket is no merge candidate: the selection keeps `in-review` tickets with no hold | `src/lib/tracker-model/AirlockClaims.ts:166-169` | Kept; an `interrupted:` hold keeps its ticket out of the queue with no change (WP3.9) |
| A held or merge-queued ticket never launches | `src/lib/tracker-model/Playbook.ts:387-397` | Kept |
| `ticket-unheld` starts a fresh attempt: it resets the builder's return from review and, since the entities work, from its needs | `src/lib/tracker-model/Playbook.ts:309-339` | Kept; lifting an `interrupted:` hold must not log it (WP3.3, Traps) |
| A lost gate or install Watcher reads as a line that never ran | `src/services/overseer/JobLaunch.ts:552-573` | Replaced by stage 2 (N7). This stage turns a lost line into a wait (WP3.10) |
| The crash, reboot and update matrix | `src/services/overseer/CrashMatrix.integration.spec.ts:382-997`, `CrashMatrix.spec.ts`, `CrashMatrix.merges.spec.ts` | Changed: the rows listed in WP3.14 |
| Retired names that no file may hold | `src/ComponentNames.spec.ts:28-63` | Kept. No new name contains one (Traps) |

## Work packages

Order and parallelism:

| Package | Runs after | May run in parallel with |
| --- | --- | --- |
| WP3.1 Causes, policy table, log vocabulary | stage 2 | WP3.4, WP3.5 |
| WP3.2 The Playbook resumes by the table | WP3.1 | WP3.4, WP3.5, WP3.6 |
| WP3.3 The resume command and the verb `resume` | WP3.2 | WP3.4, WP3.6, WP3.7 |
| WP3.4 Boot start time in the process supervision port | stage 2 | WP3.1, WP3.2, WP3.3, WP3.5 |
| WP3.5 Presence record and heartbeat | stage 2 | WP3.1, WP3.2, WP3.4 |
| WP3.6 Start classification | WP3.5 | WP3.2, WP3.3, WP3.4 |
| WP3.7 Crash log and fatal-error note | WP3.5 | WP3.3, WP3.4, WP3.6 |
| WP3.8 The start gate and the start origin | WP3.4, WP3.6, WP3.7 | none: alone |
| WP3.9 Reconcile at start | WP3.2, WP3.8 | none: alone |
| WP3.10 Lost lines wait | WP3.9 | none: alone |
| WP3.11 The abandoned pass | WP3.9 | WP3.13 |
| WP3.12 Presence on the read API and in the contract | WP3.3, WP3.11 | WP3.13 |
| WP3.13 The CLI path: status, crash, resume | WP3.8 | WP3.11, WP3.12 |
| WP3.14 The crash matrix | every other package | none: alone, last |

Packages that run in parallel touch no common file: WP3.1 and WP3.2 stay in `src/lib/tracker-model/`,
`src/shared/constants/` and the log and refusal tables named below (`src/adapters/`, `MonitorSnapshotAssembly.ts`,
`docs/reference/refusals.md`), which no package beside them touches; WP3.4 stays in `src/lib/process-identity/`; WP3.5
to WP3.7 create new files under `src/services/overseer/`; WP3.5 and WP3.7 both touch
`cli/overseer/OverseerForeground.ts` (and WP3.7 the `ensureTalos` call site of stage 2's pass), and WP3.7 runs after
WP3.5. WP3.11 and WP3.13 share no file: WP3.11 changes `DrivePass.ts`, `cli/overseer/OverseerWording.ts`,
`src/shared/monitor/utils/NoticeWordingUtil.ts` and creates `AbandonedPassReason.ts`; WP3.13 changes
`cli/overseer/OverseerCommand.ts`, `cli/tracking/status/StatusCommand.ts`, `cli/HelpText.ts` and `docs/cli.md`, and
words its own lines in `OverseerCommand.ts`, never in `OverseerWording.ts`. Each package ends with the root's
`bun run verify` green, and a package that changes `DrivePass.ts`, `OverseerForeground.ts` or `Playbook.ts` runs alone
among packages that touch the same file.

Every package follows the repository's rules: `apps/forge/CLAUDE.md`, the owner's conventions, full names, one purpose
per file, specs beside their modules opening with a docblock, no fixed sleeps, and `docs/cli.md` updated in the same
package when a command, flag, file format or exit code changes. Two tables are keyed by every member, so the type
checker asks for a row in the same package: a new log record kind takes its wording in `src/adapters/utils/LogUtil.ts`
and its category in `ACTIVITY_CATEGORY_OF_KIND` (`src/services/overseer/MonitorSnapshotAssembly.ts:72`, what the
monitor's activity shows; `null` keeps it out); a new refusal (a `BoardRefusal` reason or an `OperationRefusal` detail
kind) takes its sentences in `src/adapters/utils/OperationRefusalWordingUtil.ts`, a sample in
`OperationRefusalWordingUtil.apiEveryDetail.spec.ts` and a row in `apps/forge/docs/reference/refusals.md`. That holds
for WP3.1, WP3.3 and WP3.10 (records) and WP3.2, WP3.3, WP3.8 and WP3.13 (refusals).

### WP3.1 Causes, the resume policy table and the log vocabulary

**Purpose.** Name every interruption and its resume policy in one table, and add the log records the later packages
write, with no change of behaviour yet.

**Files.**

- Change `apps/forge/src/lib/tracker-model/@types/Job.ts`: `InterruptionCause` gains `forge-stopped` and
  `forge-crashed`; its docblock says what each means.
- Change `apps/forge/src/lib/tracker-model/constants/JobStates.ts`: both causes in `INTERRUPTION_CAUSES`.
- Create `apps/forge/src/lib/tracker-model/constants/ResumePolicy.ts`: the table, beside the other tracker-model
  vocabularies, because the Playbook, the presence document and the CLI all read it, and the tracker model must stay
  DOM-safe and free of I/O.
- Create `apps/forge/src/lib/tracker-model/constants/ResumePolicy.spec.ts`.
- Change `apps/forge/src/lib/tracker-model/@types/LogRecord.ts` and
  `apps/forge/src/lib/tracker-model/constants/LogRecordSchema.ts`: the records `start-classified` and
  `job-resume-instructed` (Interfaces introduced), with their field value kinds.
- Change `apps/forge/src/adapters/log/utils/LogRecordMappingUtil.ts`: a copy for each new value shape in
  `COPY_FOR_FIELD_SHAPE` (`:53-115`), which the compiler asks for once the shapes join `LogFieldShape`.
- Change `apps/forge/src/adapters/utils/LogUtil.ts`: the wording of both records and of the two new causes.
- Change `docs/cli.md` (from `apps/forge/`): the log records and the causes, in the section that lists them.

**What to do.**

1. Add the two causes to the union and to `INTERRUPTION_CAUSES` in the same order as the union.
2. Write `ResumePolicy.ts` exporting `type ResumePolicy` and `RESUME_POLICY_OF_CAUSE`, a frozen
   `Readonly<Record<InterruptionCause, ResumePolicy>>` with exactly the rows of Interfaces introduced, among them stage
   2's `talos-paused`, `lease-ended` and `network-outage` (N2, N4).
3. Export from the same file `WAITING_POLICIES`, the policies that never resume by themselves:
   `waits-for-instruction` and, once its bound is spent, `resumes-twice-then-waits`.
4. Add the two log records to the record union and to `LogRecordSchema` with `subject` and field kinds:
   `start-classified` with subject `board`, `job-resume-instructed` with subject `job`. Add the value kinds the schema
   needs (`start-kind`, `start-origin`) the way `overseer-stop-reason` is added (`LogRecordSchema.ts:50`,
   `@types/LogRecord.ts:82`, `LogRecordMappingUtil.ts:53-115`). The optional fields use the shapes that exist:
   `optional-count` (added by the entities work) for `previousGeneration` and `crashLogGeneration`, `optional-flag` for
   `crashSuspected`.
5. Word both records in `LogUtil` in plain sentences, naming the kind of start and the job.

**Specs.**

- `ResumePolicy.spec.ts` proves: every member of `INTERRUPTION_CAUSES` has exactly one policy;
  `CRASH_INTERRUPTION_CAUSES` are exactly the causes with `resumes-twice-then-waits`; `reboot`, `forge-stopped`,
  `forge-crashed`, `lease-ended` and `network-outage` are `waits-for-instruction`; `answer-delivery`, `handoff-red`,
  `usage-limit` and `talos-paused` are `resumes-by-itself`; `forced-stop-refused` is `never-resumes`;
  `authentication-failed` is `resumes-once-decision-answered`.
- The existing log specs gain a case per new record: `src/adapters/utils/LogUtil.spec.ts` (the wording),
  `src/lib/tracker-model/Board.logRecords.spec.ts` and `src/adapters/log/LogRecordProblem.spec.ts` (the schema; there is
  no `LogRecordSchema` spec of its own). A stored log line of each round-trips
  (`src/adapters/log/LogFileIngestion.spec.ts`).

**Done when.** At the repository root, `bun install --frozen-lockfile` and `bun run verify` pass. In `apps/forge/`,
`bun test src/lib/tracker-model` passes, and `bun test src/ComponentNames.spec.ts` passes.

### WP3.2 The Playbook resumes by the policy table

**Purpose.** Interrupted work that waits stays interrupted until an instruction or an answer; a crashed agent is resumed
twice and then waits; an instructed resume starts a fresh count.

**Files.**

- Change `apps/forge/src/lib/tracker-model/Playbook.ts`.
- Change `apps/forge/src/lib/tracker-model/@types/PlaybookStep.ts`: `resume-job` gains `instructed: boolean`; the
  comment on `replace-job` says it is only for an Assistant that went down.
- Change `apps/forge/src/lib/tracker-model/Board.ts` (`applyPlaybookStep`, `:849-852`, and `moveJob`, `:467-469`) and
  `apps/forge/src/lib/tracker-model/Jobs.ts` (`moveJob`, `:137-149`).
- Change `apps/forge/src/lib/tracker-model/Board.ts` and `apps/forge/src/lib/tracker-model/Jobs.ts`: a method
  `instructResume(jobId, at)` that logs `job-resume-instructed`.
- Change `apps/forge/src/lib/tracker-model/@types/LifecycleLimits.ts` and
  `apps/forge/src/shared/constants/LifecycleLimits.ts`: rename `JOB_RESUMES_BEFORE_FRESH` to
  `CRASH_RESUMES_BEFORE_WAITING`, value 2, and every reader (`grep -rn JOB_RESUMES_BEFORE_FRESH apps/forge`, which
  includes `src/lib/tracker-model/testing/LifecycleWorld.ts:238`, `testing/LifecycleFixtures.ts:35`, the comments in
  `@types/PlaybookStep.ts:47` and `src/services/overseer/UsageLimits.ts:42`, and the specs that spell the limits out,
  among them `src/services/tracker/TrackerReader.stageCounts.spec.ts:48`, which the entities work added).
- Change the specs `apps/forge/src/lib/tracker-model/Playbook.spec.ts` (`:365-367` pins the crash bound) and the aspect
  suites that read the bound or the replace step: `Playbook.redHandoff.spec.ts` (`:67`) and `Board.lifecycle.spec.ts`
  (`:188`); the other suites (`Playbook.entityCaps`, `.forecast`, `.interleavings`, `.needs`, `.reviewPhase`, `.stages`)
  stay green. And `apps/forge/src/lib/tracker-model/Board.jobs.spec.ts`.

**What to do.**

1. In `Playbook.ts` add `resumeIsInstructed(job, logRecords)`: true when the newest `job-resume-instructed` record of
   the job comes after the job's newest `job-interrupted` record, or when a `decision-answered` record of a decision
   whose `jobId` is the job's comes after it (decision 11: an answer resumes its session). Read the log only, never a
   clock.
2. Add `resumePolicyOf(job, limits)`: the table's policy for `job.interruption`, where `resumes-twice-then-waits` reads
   as `waits-for-instruction` once `job.crashResumes >= limits.CRASH_RESUMES_BEFORE_WAITING`.
3. Rewrite `crashBoundStepsOf` (`:472-487`) around the policy, keeping its holds exactly:
   - `forced-stop-refused`: no step, as today (`:475`).
   - `handoff-red`: `redHandoffStepsOf`, unchanged.
   - An Assistant (`SESSION_JOB_KINDS` holds `assistant` and `product-owner`; split it so only `assistant` keeps
     `replace-job`): `replace-job`, unchanged.
   - `resumes-by-itself`, or `resumes-twice-then-waits` with resumes left: `resume-job` with `instructed: false` under
     today's holds (`resumesAreHeld`, `jobResumeIsHeld`, `jobAwaitsAnAnswer`; the pipeline agent's own hold,
     `pipelineAgentResumesAreHeld`, `:483`, which neither the missing pipeline nor the pause holds).
   - `waits-for-instruction` (including a spent crash bound) and `resumes-once-decision-answered`: a `resume-job` with
     `instructed: true` only when `resumeIsInstructed` is true, under the same holds; otherwise no step. For
     `resumes-once-decision-answered` keep today's behaviour exactly: `authenticationHolds` holds every resume until the
     decision is answered, then it resumes by itself.
   - `never-resumes`: no step.
4. Rewrite `productOwnerStepsOf` (`:414-425`): `awaiting-answer` is unchanged; an interrupted product owner follows the
   same policy; past the crash bound with a question open it moves `await-answer` (no process, no work); past the bound
   with no question it waits for an instruction, and an instruction resumes it by id. `refresh-intake` stays only for an
   `awaiting-answer` product owner whose questions are answered.
5. Delete `crashResumesAreSpent`'s use as a `replace-job` trigger; keep the function for `resumePolicyOf`. Delete
   stage 2's `INTERRUPTION_CAUSES_HELD_FROM_RESUMING` (`JobStates.ts`, N4) and its two reads in `crashBoundStepsOf` and
   `productOwnerStepsOf`: the table's `network-outage` row says the same once, so a later answer of the owner changes
   one row.
6. In `Board.applyPlaybookStep`, `resume-job` calls `this.moveJob(step.jobId, 'running', at, { instructed:
   step.instructed })`, and `Board.moveJob` passes the option on to `this.jobRules.moveJob`. In `Jobs.moveJob`, an
   instructed resume sets `crashResumes` to 0 instead of adding one, and logs `job-resumed` with a new field
   `instructed: true` only when instructed (an optional field written only when set, as the stored-file rules ask). Add
   `instructed` to the `job-resumed` schema entry as an optional boolean.
7. Add `Board.instructResume(jobId, at)`: refuses with `BoardRefusal` reason `job-not-interrupted` unless the job is
   `interrupted`; logs `job-resume-instructed` with the job's `childInstance` (stage 2's name, WP2.16). Add
   `Board.instructResumeOfEveryInterruptedJob(at)` returning the logged records of every interrupted job whose policy
   waits, and an empty list when none does.

**Specs.**

- `Playbook.spec.ts`: one claim per policy row: a job interrupted `reboot` gets no step; after `job-resume-instructed`
  it gets `resume-job` with `instructed: true`; an instruction logged before the newest interruption does not count; a
  job interrupted `agent-crashed` with `crashResumes` 0 and 1 gets `resume-job`, with 2 gets nothing, and with 2 plus an
  instruction gets an instructed resume; an answered question of a job interrupted `reboot` resumes it; usage limit,
  install change, outage and a missing pipeline still hold an instructed resume; a product owner past the bound with no
  question waits and with one moves `await-answer`; an Assistant interrupted `reboot` is still replaced.
- `Board.jobs.spec.ts`: an instructed resume sets `crashResumes` to 0 and logs `instructed: true`; `instructResume` of a
  running job is refused `job-not-interrupted`; `instructResumeOfEveryInterruptedJob` logs one record per waiting job.
- `src/lib/tracker-model/testing/LifecycleWorld.ts`: its crash-resume invariant (`:233-238`) reads
  `CRASH_RESUMES_BEFORE_WAITING` and counts only resumes that were not instructed; the world specs that walk the policy
  still pass.

**Done when.** `bun run verify` at the root passes; in `apps/forge/`, `bun test src/lib/tracker-model` passes.
`grep -rn "JOB_RESUMES_BEFORE_FRESH" apps/forge` finds nothing.

### WP3.3 The resume command and the verb `resume`

**Purpose.** The user's instruction, one for a job, one for a ticket, one for everything, through every surface that
applies commands.

**Files.**

- Change `apps/forge/src/shared/@types/ControlCommand.ts`: the kind `interrupted-work-resume` (Interfaces introduced).
- Create `apps/forge/src/services/control/ResumeControls.ts`: `RESUME_CONTROLS`, one applier, beside the other
  appliers of the control service.
- Create `apps/forge/src/services/control/ResumeControls.spec.ts`.
- Change `apps/forge/src/services/control/ControlService.ts`: spread `RESUME_CONTROLS` into `CONTROL_APPLIERS`.
- Change `apps/forge/src/services/control/Bouncer.ts` only if a role set would admit the kind; it must be admitted for
  no agent role.
- Create `apps/forge/cli/resume/ResumeCommand.ts` and `apps/forge/cli/resume/ResumeCommand.spec.ts`: a folder of its
  own, as `cli/CommandTable.spec.ts` asks of a new command.
- Change `apps/forge/cli/CommandTable.ts` and `apps/forge/cli/HelpText.ts`.
- Change `apps/forge/src/lib/tracker-model/TicketSettings.ts` (beside `unholdTicket`, `:152-159`) and
  `apps/forge/src/lib/tracker-model/Board.ts` (beside `unholdTicket`, `:1407-1409`): `liftInterruptedHold(ticketId,
  at)`, and the record `ticket-interrupted-hold-lifted` in `@types/LogRecord.ts`, `constants/LogRecordSchema.ts`,
  `src/adapters/utils/LogUtil.ts` and `ACTIVITY_CATEGORY_OF_KIND`
  (`src/services/overseer/MonitorSnapshotAssembly.ts:72`). Only if the owner keeps the default (Needs the owner, item
  9); otherwise the applier calls `unholdTicket`.
- Change `packages/forge-contracts/@types/ForgeControlCommand.ts` and
  `packages/forge-contracts/constants/ForgeSystemVersions.ts`: the kind, and the current minor raised by one.
- Change `apps/forge/docs/cli.md` and `apps/forge/docs/reference/overseer-api.md`: the verb and the command kind.

**What to do.**

1. Add `{ kind: 'interrupted-work-resume'; target: ResumeTarget }` to `ControlCommand`, with `ResumeTarget` as in
   Interfaces introduced.
2. In `ResumeControls.ts` apply it in the hold:
   - `{ jobId }`: `board.instructResume(jobId, at)`.
   - `{ ticketReference }`: resolve the ticket as `TicketControls` resolves references (`ControlTicketLookup.ts`); for
     its one job, if interrupted, `instructResume`; if the ticket holds a hold starting with `INTERRUPTED_HOLD_PREFIX`
     (WP3.9; until WP3.9 lands, the prefix constant is created here in
     `src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts` beside `PARKED_HOLD_PREFIX`, `:71`), lift it
     with `board.liftInterruptedHold`. Refuse `ticket-not-interrupted` when neither applies.
   - `'all'`: `instructResumeOfEveryInterruptedJob` plus the lift of every ticket holding an `interrupted:` hold. With
     nothing to resume, answer `{ changed: false }` so the service reports `nothing-to-do`.
   - Why not `unholdTicket`: its `ticket-unheld` record starts a fresh attempt. It resets the failed passes
     (`FailedPassUtil.ts:74-75`, per entity and stage since the entities work), the builder's return from review
     (`Playbook.ts:313-323`) and, since the entities work, the return from its needs (`:329-339`). A merge held by a
     crash is no person's unhold. `liftInterruptedHold` refuses `ticket-not-interrupted` unless the hold starts with
     `INTERRUPTED_HOLD_PREFIX`, deletes the hold and logs `ticket-interrupted-hold-lifted` with the lifted hold, which
     none of those readers counts. `ticket unhold <T>` stays a person's unhold, with its resets.
3. Write `cli/resume/ResumeCommand.ts`: `resume <J|T> [--json]` and `resume --all [--json]`. A job id starts with
   `JOB_ID_PREFIX` (`J`); anything else is a ticket reference. It records through `recordIncidentMove` the way `job
   fresh` does (`cli/jobs/JobCommand.ts:172-185`), so it works with the Overseer up or down, and prints "Recorded. The
   Overseer carries it out, at once when it is up, else when it starts." `hatchWhenUnderJob` relays it under a job,
   where the Bouncer refuses it.
4. Add the verb to `cli/CommandTable.ts` and a block to `cli/HelpText.ts`.
5. Add the kind to `ForgeControlCommand` and to forge's pin of it, `CONTROL_CONTRACT_KINDS`
   (`apps/forge/src/shared/constants/OverseerApiContracts.ts:26-36`, nine kinds today), and raise
   `FORGE_SYSTEM_VERSIONS.current.minor` by one over the value stage 2 left (1.18 before stage 2); the change only adds.
6. In `docs/cli.md`, document the verb, its refusals and exit codes; in `docs/reference/overseer-api.md`, the command.
   The frozen surface (`cli/FrozenInstalledSurface.json`, per `INSTALL_VERSION`, 36 today) lists only the commands and
   flags the installed files name (`cli/InstalledSurface.spec.ts:1-9`), so a new verb that no installed file names bumps
   nothing. Only if this package makes an installed file (a skill, the Assistant brief, the reference) name `resume`:
   add a key for a bumped `INSTALL_VERSION` and run `bun run record src/services/overseer/InstallChangeWatch.ts`, as
   `apps/forge/CLAUDE.md` asks.

**Specs.**

- `ResumeControls.spec.ts`: a job target logs one `job-resume-instructed`; a ticket target lifts an `interrupted:merge`
  hold, logging `ticket-interrupted-hold-lifted` and no `ticket-unheld`, and instructs its interrupted job; `all` covers
  both; a running job is refused `job-not-interrupted`; an unknown ticket is refused as `TicketControls` refuses one;
  nothing interrupted is `nothing-to-do`.
- `ResumeCommand.spec.ts`: the verb parses `J12`, `12`, `--all`, refuses a positional together with `--all`, and refuses
  extra positionals with the usage.
- `cli/CommandTable.spec.ts`, `cli/HelpText.spec.ts`, `cli/ControlContract.spec.ts`,
  `cli/overseer/routes/CommandRoute.controlContract.spec.ts`: updated for the new kind and verb.
- `src/services/control/Bouncer.spec.ts`: every agent role is refused the kind.
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.spec.ts` stays green; the contract package's own specs
  pass.

- `src/lib/tracker-model/Board.ticketSettings.spec.ts`: `liftInterruptedHold` refuses a `parked:` hold and a ticket with
  no hold; after a lift, `FailedPassUtil.failedPassesOf` reads the same count as before it.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/control cli/resume
cli/CommandTable.spec.ts cli/HelpText.spec.ts` passes; Gaia's `check` still warns that `SUPPORTED_FORGE_VERSION` (1.1
today, `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9`) is behind forge's current version, and
fails nothing.

### WP3.4 Boot start time in the process supervision port

**Purpose.** The stale-heartbeat refinement needs the time the current boot started; no port reads it today.

**Files.**

- Change `apps/forge/src/lib/process-identity/ProcessSupervision.ts`: `bootStartedAtEpochSeconds: () => number | null`.
- Change `apps/forge/src/lib/process-identity/DarwinProcessIdentity.ts`: read `sysctl -n kern.boottime` through the same
  injected primitive that reads `kern.bootsessionuuid` (`:14-15`, `:49`), and parse its `sec = <n>` field.
- Change `apps/forge/src/lib/process-identity/LinuxProcessIdentity.ts`: read the `btime` line of `/proc/stat`.
- Change `apps/forge/src/lib/process-identity/WindowsProcessIdentity.ts` and
  `apps/forge/src/lib/process-identity/UnsupportedProcessSupervision.ts`: answer `null` (the refinement is then off).
- Change `apps/forge/src/lib/process-identity/ProcessSupervisionFor.ts` if it assembles the record field by field.
- Change the specs and frozen files: `LinuxProcessIdentity.spec.ts`, `WindowsProcessIdentity.spec.ts`,
  `ProcessSupervision.frozen.spec.ts` with `FrozenProcessSupervision.json`,
  `ProcessSupervision.contract.integration.spec.ts`, `ProcessIdentity.integration.spec.ts`, and
  `apps/forge/cli/FrozenPlatformPorts.json` with `cli/PlatformPorts.frozen.spec.ts` if they list the port's members.
- Change `apps/forge/docs/development/platform-status.md`: the new read never ran on Linux or Windows.

**What to do.**

1. Add the member with a docblock: `null` when the boot time cannot be read; an answer is never guessed.
2. On macOS, reuse the command-runner primitive the adapter already uses for `sysctl`; parse
   `{ sec = 1763370000, usec = 0 } ...` with one named pattern constant. A text that does not match answers `null`.
3. On Linux, read `/proc/stat` through the adapter's existing file-read primitive; a missing `btime` answers `null`.
4. Keep `src/PlatformBoundary.spec.ts` green: no platform read outside the adapter files.
5. Record the boundary on macOS: `bun run record <the process-identity boundary as BOUNDARY_SPECS names it>` (look it up
   in `src/testing/BoundarySpecs.ts`), and commit the recording.

**Specs.** The Linux and Windows unit specs prove the parse and the `null` answers on fakes; the frozen spec holds the
new member's shape; the contract integration spec (run through `bun run record`) proves that on the real system the
answer is a whole number below the current epoch second.

**Done when.** `bun run verify` passes at the root, with no stale recording stamp; `bun run record <boundary>` on macOS
writes a recording that names the new call.

### WP3.5 The presence record and the heartbeat

**Purpose.** A record, outside the board and outside the lock, of each generation's start, its heartbeat, and whether
its stop or handover completed.

**Files.**

- Create `apps/forge/src/services/overseer/Presence.ts`: reading and writing `presence.json` and `heartbeat.json`, one
  module because both describe one generation's presence and nothing else writes them.
- Create `apps/forge/src/services/overseer/Presence.spec.ts`.
- Create `apps/forge/src/services/overseer/constants/PresenceLimits.ts`: `PRESENCE_FORMAT_VERSION`,
  `HEARTBEAT_FORMAT_VERSION`, `ABANDONED_PASSES_BEFORE_NOTICE`, `HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS` (Interfaces
  introduced); the `constants/` folder exists beside the overseer services.
- Change `apps/forge/src/services/overseer/OverseerFiles.ts`: `presenceFilePath`, `heartbeatFilePath` and
  `crashLogDirectory` under `overseerDirectory`.
- Change `apps/forge/cli/overseer/OverseerForeground.ts`: the ending `stopped` in `closeTheStoppedOverseer` (`:169-176`)
  and the ending `handed-over` in `release` (`:651-660`); the heartbeat file and the generation handed to the lease
  renewal at its start.
- Change `apps/forge/src/services/overseer/LeaseRenewal.ts` and `LeaseRenewalThread.ts` (stage 2's renewer, N5): the
  facts posted to the thread gain `heartbeatFilePath` and `generation`, and the thread writes the heartbeat after each
  renewal Talos answered `done`; `LeaseRenewal.spec.ts` gains its cases.

**What to do.**

1. Define `PresenceRecord` and `HeartbeatRecord` exactly as in Interfaces introduced. Write each through
   `writeFileAtomically` (`src/lib/atomic-file/AtomicFile.ts`). Read each into a verdict: `{ verdict: 'absent' }`,
   `{ verdict: 'unreadable', reason }` (a malformed file, a version other than the current one) or
   `{ verdict: 'read', record }`. Never throw on a read.
2. Export `Presence` as a frozen object: `readPresence`, `writeStartedPresence`, `writeEnding`, `readHeartbeat`,
   `writeHeartbeat`, `recordAbandonedPass`, `recordCompletedPass`.
3. `writeStartedPresence` is called by WP3.8; in this package call it from `startServing` right after the Baton is
   acquired (`OverseerForeground.ts:526`), with `startOrigin` `user` and `startClassification` `null` until WP3.8 fills
   them. It overwrites the previous generation's record: the classification has already read it (WP3.8 orders this).
4. `writeEnding(files, generation, kind, at)` writes the ending only when the stored record's generation is
   `generation`; a newer generation's record is never touched. Call it with `stopped` inside `closeTheStoppedOverseer`
   before `Baton.release`, and with `handed-over` inside `release` after the drive pass stopped and before
   `overseer-stopped` is logged.
5. The heartbeat file is written only by the lease renewer's thread (N5), on each renewal, with a sequence that rises
   by one; the main thread never writes it. `presence.json` is written only by the main thread. Two files, so no write
   of one writer loses the other's. During a Baton pass the predecessor keeps renewing until it exits (stage 2's WP2.13
   item 10), so two renewers run at once: a renewer writes the heartbeat only while the stored heartbeat's generation
   is not above its own, and never overwrites a successor's beat.
6. No clock comment at the heartbeat write: a heartbeat is one of the real-time measures the clock rules of
   `apps/forge/CLAUDE.md` name (rewritten on 2026-11-18), and only code that does not obey them carries a comment.

**Specs.** `Presence.spec.ts` proves: a record round-trips; a missing file is `absent`; a malformed file and another
version are `unreadable`; `writeEnding` for an older generation leaves a newer record as it was; the heartbeat sequence
rises; a heartbeat of an older generation never replaces a newer one; an abandoned-pass count rises and a completed
pass sets it to 0. `LeaseRenewal.spec.ts`: a renewal answered `done` writes one beat, a refused one writes none. The
stop and handover call sites are proven in WP3.8's specs.

**Done when.** `bun run verify` passes at the root; `bun test src/services/overseer/Presence.spec.ts` passes in
`apps/forge/`.

### WP3.6 The start classification

**Purpose.** One pure decider that says what kind of start this is, read by the start, by `oversee status` and by the
presence document alike.

**Files.**

- Create `apps/forge/src/services/overseer/StartClassification.ts` and
  `apps/forge/src/services/overseer/StartClassification.spec.ts`.

**What to do.**

1. Export `StartClassification.classify(evidence: StartEvidence): StartClassificationVerdict` (Interfaces introduced).
   `StartEvidence` is plain values: the presence reading, the heartbeat reading, the newest Baton reading
   (`Baton.newestBatonOf`, `Baton.ts:98-104`), the current boot identity, the current boot start time or `null`, and the
   start origin with the generation a successor takes over from. It reads no file, process or clock.
2. Apply these rules in this order; the first that matches decides:
   1. No presence record and no Baton generation: `first-start`.
   2. The presence record is `unreadable`: `crashed` (fail closed: a damaged record keeps the forge off).
   3. The newest Baton generation is above the presence record's generation (a generation took the Baton and died
      before it wrote presence): compare that Baton record's boot with the current one through `sameBoot`
      (`src/lib/process-identity/ProcessIdentity.ts:45`): the same boot is `crashed`; another is `machine-went-down`; an
      unreadable Baton record is `crashed`.
   4. The presence ending is `stopped`: `stopped-on-purpose`.
   5. The presence ending is `handed-over`: `handover` when the origin is `successor` and it takes over exactly that
      generation; otherwise `stopped-on-purpose` (the old Overseer let go and its successor never took the Baton, a
      Baton pass failure already logged).
   6. No ending: another boot than the record's is `machine-went-down`; the same boot is `crashed`.
3. The refinement, only for `machine-went-down` with a boot start time and a readable heartbeat: `crashSuspected` is
   true when the boot started more than `HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS` after the last heartbeat. A comment
   at the site says that this compares two recorded instants to judge a fact, against the rule that a clock gives no
   fact, and why: the heartbeat is the only witness of when the process stopped beating.
4. Carry the evidence in the verdict, so `status` and the crash log can show why.

**Specs.** `StartClassification.spec.ts`, one claim per rule and one per known misreading, each written as a claim:

- "a first start with no record and no Baton is a first start";
- "a completed stop on record reads as stopped on purpose";
- "a successor taking over the generation that handed over reads as a handover";
- "a successor whose predecessor died during the Baton pass reads as a crash";
- "a record of another boot with no ending reads as the machine going down";
- "the same boot with no ending reads as a crash";
- "a newer Baton than the record, in the same boot, reads as a crash during start";
- "an unreadable presence record reads as a crash";
- "a crash followed by a reboot reads as the machine going down, with the crash suspected when the heartbeat stopped
  well before the boot" (misreading one, narrowed);
- "a heartbeat that stopped less than the bound before the boot is no suspected crash";
- "a stop on record followed by a killed, wedged process reads as stopped on purpose" (misreading two, kept);
- "an unreadable boot identity reads as another boot" (`sameBoot`'s rule, kept).

**Done when.** `bun run verify` passes at the root; `bun test src/services/overseer/StartClassification.spec.ts` passes.

### WP3.7 The crash log and the fatal-error note

**Purpose.** A crash leaves one immutable file that traces it back: the error where there was one, the jobs and their
steps, Talos's children and the tail of the log.

**Files.**

- Create `apps/forge/src/services/overseer/CrashLog.ts` and `CrashLog.spec.ts`: assembling and writing a crash log, and
  listing and reading the crash logs of a board.
- Create `apps/forge/src/services/overseer/FatalErrorNote.ts` and `FatalErrorNote.spec.ts`: the note a dying process
  leaves.
- Change `apps/forge/cli/overseer/OverseerForeground.ts`: register the fatal-error note at the start of
  `runOverseerInTheForeground` and unregister it when the function returns.
- Change the two `ensureTalos` call sites (N6): an answer `started` with `previousTalos: 'lost'`, whose lost Talos's
  record names a process of the current boot (`sameBoot`, `src/lib/process-identity/ProcessIdentity.ts:45`), is a
  crash of Talos: write a crash log with `component: 'talos'`, then stop without writing a presence ending. A lost
  Talos of another boot is the machine going down, which reconcile handles (WP3.9).

**What to do.**

1. `FatalErrorNote.write(files, generation, thrown, at)` writes `fatal-error-<generation>.json` (Interfaces introduced)
   with `writeFileAtomically`, synchronously, and never throws. `FatalErrorNote.read(files, generation)` answers a
   verdict.
2. Register it on `process.on('uncaughtExceptionMonitor', …)` and `process.on('unhandledRejection', …)`. The monitor
   event leaves the process's own exit untouched. First check that Bun emits `uncaughtExceptionMonitor` (read the
   pinned `bun-types` in `node_modules`, and prove it with a one-off script outside the repository). If it does not,
   register `uncaughtException`, write the note, then rethrow inside a `queueMicrotask` so the process still dies with
   exit code 2; never call `process.exit` here (`eslint.config.js` confines it). A rejection handler writes the note and
   rethrows the same way, so an unhandled rejection still kills the process as today.
3. `CrashLog.assemble(inputs)` builds the record from plain values: the classification verdict, the crashed
   generation's presence and heartbeat, the fatal-error note, the board's live jobs (id, kind, role, tickets, state,
   interruption, instance, Airlock phase, event cursor), Talos's persisted child record as stage 2 stores it, and the
   last `CRASH_LOG_TAIL_LINES` lines of `overseer.log`. Reading the inputs is the caller's.
4. `CrashLog.writeOnce(files, record)` creates `crash-logs/crash-<generation>.json` with `createWholeFileAtomically`
   (`src/lib/atomic-file/AtomicFile.ts:165`), which answers `already-exists` when another start wrote it first: the file
   is never rewritten, and two starters write one log.
5. `CrashLog.list(files)` answers every crash log's generation, ascending, and `CrashLog.read(files, generation)` a
   verdict.
6. Read the tail of `overseer.log` without loading a large file whole: read the last bytes up to a bound and split.

**Specs.** `FatalErrorNote.spec.ts`: a thrown error and a non-error value are both written; a write into a folder that
does not exist fails silently. `CrashLog.spec.ts`: an assembled log holds each input; the second `writeOnce` for a
generation answers `already-exists` and leaves the first file byte for byte; the tail keeps the last lines of a log
longer than the bound and all of a shorter one; `list` ignores a file of another name. No spec registers a process
handler: the handler's registration is proven by WP3.14's integration row.

**Done when.** `bun run verify` passes at the root; both specs pass in `apps/forge/`.

### WP3.8 The start gate and the start origin

**Purpose.** Each start knows who made it, classifies itself before it binds, writes the crash log after a crash, serves
only after a crash when the user started it, and records its kind.

**Files.**

- Change `apps/forge/cli/overseer/OverseerCommand.ts` (`startOverseer`, `:63-84`): the option `--started-by
  user|login-item`; `user` when absent. A successor (`--successor-of`) is `successor` and refuses `--started-by`.
- Change `apps/forge/cli/overseer/StartCommand.ts` and `apps/forge/cli/overseer/DetachedOverseerStart.ts`, and
  `OverseerRemote.startDetached` (`cli/overseer/OverseerRemote.ts`): the detached child gets `--started-by user`.
- Change `apps/forge/cli/setup/DarwinAutostart.ts` (`:17-19`), `apps/forge/cli/setup/LinuxAutostart.ts`,
  `apps/forge/cli/setup/WindowsAutostart.ts`: `oversee --detach --started-by login-item`, and their specs
  (`DarwinAutostart.spec.ts`, `LinuxAutostart.spec.ts`, `WindowsAutostart.spec.ts`, `Autostart.contract.spec.ts`).
- Change `apps/forge/cli/overseer/OverseerForeground.ts`: `ForegroundRunRequest` gains `startOrigin`; the gate before
  `startServing`.
- Create `apps/forge/src/services/overseer/StartGate.ts` and `StartGate.spec.ts`: reads the evidence, classifies, writes
  the crash log, answers whether the start may serve. A file of its own, since `OverseerForeground.ts` is the CLI's and
  the gate is a service that `oversee status` (WP3.13) reads too.
- Change `apps/forge/src/services/tracker/MonitorRegistration.ts`: an optional `presence` registration (Interfaces
  introduced), written beside `overseer`, kept as stored when absent from a call.
- Change `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts`, its sample in
  `OperationRefusalWordingUtil.apiEveryDetail.spec.ts` and `apps/forge/docs/reference/refusals.md`: the refusal
  `forge-off-after-crash`.
- Change `apps/forge/docs/cli.md`: `--started-by`, the refusal and its exit code, the presence files.

**What to do.**

1. `StartGate.evidenceOf(ports, files, startOrigin, successorOf)` reads presence, heartbeat and the newest Baton, and
   the current boot through `processSupervision.identityOf(process.pid)` and `bootStartedAtEpochSeconds()`.
2. `StartGate.admit(...)` classifies, and for `crashed`, or for `machine-went-down` with `crashSuspected`, assembles and
   writes the crash log once (WP3.7), reading the board's jobs with `requireProgressFile` (no lock: the record is a
   snapshot shown to a person) and Talos's child record through stage 2's reader. It answers
   `{ verdict: 'serve', classification, crashLogGeneration }` or
   `{ verdict: 'stay-off', classification, crashLogPath }`.
   It answers `stay-off` exactly when the kind is `crashed` and the origin is not `user`. What a suspected crash does is
   the owner's (Needs the owner, item 3); build it as `serve` with the crash log written, behind one named constant.
3. In `runOverseerInTheForeground`, after `requireNoLiveOverseer` and before `startServing`, call the gate. On
   `stay-off`: write the registry presence `off-after-crash` with the crashed generation, log one line to
   `overseer.log`, take no Baton, bind no port, contact no Talos, and throw
   `OperationRefusal('refused', { kind: 'forge-off-after-crash', crashedGeneration, crashLogPath })`. Exit 1, as every
   refusal.
4. On `serve`: `startServing` writes presence (WP3.5) with the origin and the verdict, and its start hold (`:561-568`)
   logs `start-classified` right after `recordOverseerStarted`. Pass the verdict to the drive pass for WP3.9 through a
   new `DrivePassRequest.startClassification` field.
5. A successor's `predecessor-gone` admission goes through the same gate: it classifies `crashed`, its origin is
   `successor`, so it stays off and reports the Baton pass failure with the refusal's text.
6. The registry presence: `serving` with the generation at start, `stopped` or `handed-over` at the ending, and
   `off-after-crash` from a refused start. A crash itself writes nothing; the stored `serving` entry with a dead process
   is what Gaia sees until a start classifies it.

**Specs.**

- `StartGate.spec.ts` on a scratch data folder and fake ports: a login-item start after a crash stays off and writes one
  crash log; a user start after a crash serves and finds the crash log already there; a second refused start writes no
  second log; a user start after a reboot serves with no crash log unless suspected; a successor after
  `predecessor-gone` stays off.
- `cli/overseer/OverseerForeground.spec.ts` (`OverseerForeground.spec.ts` exists): the start hold logs
  `start-classified` after `overseer-started`; a refused start leaves no Baton generation and no port bound.
- `cli/overseer/OverseerCommand.spec.ts`: `--started-by` parses, refuses an unknown value and refuses it beside
  `--successor-of`.
- The autostart specs: each platform's line ends `oversee --detach --started-by login-item`.
- The registry's specs (`MonitorRegistration.ts` has none of its own: `cli/overseer/OverseerCommand.spec.ts:199` and
  `cli/RegisterWrittenTracker.integration.spec.ts:222` call `registerWithTheMonitor`): the presence key is written, and
  a call without it keeps the stored one.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/overseer/StartGate.spec.ts
cli/overseer cli/setup` passes.

### WP3.9 Reconcile at start

**Purpose.** At a start, every job whose child is gone with no end of its own takes the cause the start's kind names,
and an Airlock left half done is made truthful and held, so nothing interrupted starts again by itself.

**Files.**

- Change `apps/forge/src/services/overseer/DrivePass.ts`: stage 2's start step (today `regroup`, `:1578-1587`) takes the
  classification from `DrivePassRequest.startClassification` (`DrivePassRequest`, `:209`).
- Create `apps/forge/src/services/overseer/ReconcileCauses.ts` and `ReconcileCauses.spec.ts`: the pure map from the
  start's kind to the cause of a child gone with no end of its own.
- Change `apps/forge/src/services/overseer/Airlocks.ts`: the orphan paths, each ending its job with
  `REQUEUE_CAUSES.orphaned` (`:258`): a merge-in or refresh mid-merge at `:792-797`, an Airlock agent at `:990-1007`, a
  constitution commit at `:1443-1450`, `:1483-1485` and `:1516`; and the slot advance at `:1334-1344`. The same paths
  serve a crossing ticket's stage landing and an entity's constitution commit since the entities work.
- Change `apps/forge/src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts`: `INTERRUPTED_HOLD_PREFIX =
  'interrupted:'` if WP3.3 did not create it, and the hold `interrupted:merge`.
- No change to the Playbook's `ticketIsHeld`: a hold of any reason, and a merge-queued ticket, already hold the ticket
  (`Playbook.ts:387-388`).

**What to do.**

1. `ReconcileCauses.causeOfAGoneChild(kind)`: `machine-went-down` is `reboot`; `crashed` is `forge-crashed`;
   `stopped-on-purpose` is `forge-stopped`; `handover` and `first-start` have none (a child gone in a handover is
   stage 2's ordinary loss and keeps the crash cause stage 2 gives it).
2. In the start step, for every job of stage 2's report that is gone with no end of its own (N1), interrupt it with that
   cause in the forced first pass's hold, instead of the cause stage 2 would give a lost child. A child that ended with
   an end Talos recorded (a lease end, a clean-quit pause, a recognised `network-outage`, an exit) keeps the cause
   stage 2 maps.
3. Reconcile starts no work: after this pass the Playbook decides by the table (WP3.2), so a `reboot`, `forge-stopped`
   or `forge-crashed` job stays interrupted until an instruction.
4. The Airlocks, for a start whose kind is not `handover` or `first-start`: an orphaned merge-in in the first sweep
   after the start is still aborted and reset (that makes the record truthful), but instead of requeueing it, the
   ticket is unqueued (`setTicketMergeQueued(false)`) and held `interrupted:merge`. Do the same for an Airlock agent
   left without a holder, for a refresh mid-merge and for a constitution commit's orphan, each holding its ticket, or
   for a constitution commit with no ticket, waiting until `resume --all`. Keep the landing that did complete
   (`CrashMatrix.merges.spec.ts:96`, `:219`, `:242`, `:332`): recording it is reconcile. While the forge stays up, an
   orphan made by an agent crash keeps today's requeue. Read stage 0's trace of what an Airlock leaves half done first
   and follow it where it says more.
5. `advanceTheSlot` (`Airlocks.ts:1334-1344`) treats a holder whose ticket holds an `interrupted:` hold as waiting,
   never as parked (it reads `PARKED_HOLD_PREFIX` at `:1338`): it neither aborts nor advances it.
6. The Airlock's candidate selection already skips a held ticket (`AirlockClaims.ts:166-169` keeps `in-review`
   tickets with no hold, and `:109-110` only merge-queued ones), so the unqueued, held ticket stays out of the queue
   with no change there.

**Specs.**

- `ReconcileCauses.spec.ts`: one claim per kind.
- A `DrivePass` spec beside the existing ones (`cli/overseer/OverseerDrivePass.spec.ts` uses the recorded Talos stages
  stage 2 left): a start after a reboot interrupts the gone job `reboot` and launches nothing for it; after a crash
  `forge-crashed`; after a stop `forge-stopped`; a pending ticket with no job still launches (new work is not
  interrupted work); a resume instruction then resumes the job by id in the same folder.
- `src/services/overseer/Airlocks.spec.ts` (or a new aspect suite `Airlocks.interruptedStart.spec.ts`): after a crash
  start an orphaned merge-in is aborted, reset and held `interrupted:merge`, not requeued; `resume <T>` lifts the hold
  and the next sweep queues it; without a waiting start the orphan requeues as today.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/overseer/Airlocks
cli/overseer/OverseerDrivePass.spec.ts src/services/overseer/ReconcileCauses.spec.ts` passes.

### WP3.10 Lost lines wait

**Purpose.** A gate or install line lost to a crash or a reboot is never read as a red gate; its job waits, and an
instruction runs the line again.

**Files.**

- Change `apps/forge/src/services/overseer/JobLaunch.ts`: stage 2's `lineEndOf` (N7; it replaced today's
  `processWatcherEnd`, `:552-556`, read by the install steps at `:583`, the gate steps at `:812` and the review's
  target catch-up merges at `:938` and `:1017`) answers a fourth verdict, `lost`, for a newest instance that reads
  `lost`, where stage 2 answers `rerun`; `rerun` stays only for an end `paused`.
- Change `apps/forge/src/lib/tracker-model/@types/LogRecord.ts`, `constants/LogRecordSchema.ts`,
  `apps/forge/src/adapters/utils/LogUtil.ts` and `ACTIVITY_CATEGORY_OF_KIND` in
  `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts`: the record `job-line-lost`.
- Change `apps/forge/src/lib/tracker-model/Board.ts` and `Jobs.ts`: `recordLineLost(jobId, line, cause, at)`.
- Change `apps/forge/src/lib/tracker-model/Playbook.ts` only to export `resumeIsInstructed` for the launch to read.

**What to do.**

1. When stage 2 reports a line of a job in `preparing` or `gating` as lost (not exited, not stopped by a clean quit),
   and the start that found it was not a handover, log `job-line-lost` with the line kind and the cause from
   `ReconcileCauses`, and spawn no next step for that job. The job keeps its state, so no job move is invented.
2. The launch spawns the lost step again only once `resumeIsInstructed` is true for that job, counting a
   `job-resume-instructed` record after the `job-line-lost` record. Extend `resumeIsInstructed` to take the newest of
   `job-interrupted` and `job-line-lost` as the point the instruction must follow.
3. `Board.instructResume` accepts a job whose newest record is `job-line-lost` as well as an interrupted job, and
   `instructResumeOfEveryInterruptedJob` includes it. A line stopped by a clean quit of Talos is run again by itself,
   as stage 2 built it.

**Specs.** In the `JobLaunch` gating suite (`src/services/overseer/JobLaunch.gating.spec.ts`): a gate lost at a crash
start logs `job-line-lost`, opens no red handoff and spawns nothing; after `resume J<n>` the same step spawns again; a
gate that exited red still opens the red handoff. In `Board.jobs.spec.ts`: an instruction after `job-line-lost` is
accepted.

**Done when.** `bun run verify` passes at the root; `bun test src/services/overseer/JobLaunch.gating.spec.ts
src/lib/tracker-model` passes in `apps/forge/`.

### WP3.11 The abandoned pass

**Purpose.** A pass that does not complete is named `pass-abandoned`, apart from a crash and from a ticket's failed
pass, counted, and shown.

**Files.**

- Change `apps/forge/src/services/overseer/DrivePass.ts`: `drain` (`:1553-1566`), `OverseerNotice` (`:280-301`),
  `noticesOf` (`:997-1025`), and `OverseerStateDocument` (`:306-315`).
- Create `apps/forge/src/services/overseer/AbandonedPassReason.ts` and its spec: the pure reading of a thrown value into
  a reason.
- Change `apps/forge/cli/overseer/OverseerWording.ts`: the notice's wording in `noticeTextOf` (`:1044-1073`), which
  `oversee status` prints; it has no spec of its own, so create the aspect suite
  `cli/overseer/OverseerWording.notices.spec.ts`.
- Change `apps/forge/src/shared/monitor/utils/NoticeWordingUtil.ts` (`noticeTextOf`, `:43-72`) and its spec: the same
  notice for the Bridge header and the monitor snapshot, which carries each notice as `{ kind, text }`
  (`packages/forge-contracts/@types/MonitorSnapshotDocument.ts:89-92`, `kind` a string), so the contract does not
  change. Without it the Bridge shows the bare kind.

**What to do.**

1. `AbandonedPassReason.of(thrown)`: an `OperationRefusal` whose detail kind is `tracker-lock-held` is
   `tracker-lock-held`; `lock-taken-over` is `lock-taken-over`; any other `OperationRefusal` is `board-refused`;
   anything else is `unexpected-error`. The detail is the error's message.
2. In `drain`, on a throw: `Presence.recordAbandonedPass(files, generation, reason, detail, at)`, the log line names the
   reason ("A drive pass was abandoned (tracker-lock-held) and waits for the next wake-up: …"), and the pass is retried
   at the next wake-up, as today. On a pass that ran to its end, `Presence.recordCompletedPass` sets the count to 0.
   Nothing is written to the board log: the board's lock may be the reason.
3. `noticesOf` adds `{ kind: 'passes-abandoned', inARow, reason }` once the count reaches
   `ABANDONED_PASSES_BEFORE_NOTICE` (3). It is a notice, never a crash: the forge keeps running. Whether an unexpected
   error should instead stop the forge is the owner's (Needs the owner, item 4).
4. Never call this a "failed pass" in code, wording or docs: `FailedPassUtil` owns that name. Today's line, "A drive
   pass failed and waits for the next wake-up" (`DrivePass.ts:1562`), is the one item 2 rewords.

**Specs.** `AbandonedPassReason.spec.ts`: one claim per reason. `OverseerWording.notices.spec.ts` and
`NoticeWordingUtil.spec.ts`: the notice's sentence names the count and the reason. A `DrivePass` spec: a pass whose hold
throws `tracker-lock-held` three times in a row raises the notice and writes the count to presence; the next completed
pass clears both; the pass is retried at the next wake-up.

**Done when.** `bun run verify` passes at the root; the specs pass in `apps/forge/`.

### WP3.12 Presence on the read API and in the contract

**Purpose.** Gaia, and any reader of the API, reads the live forge's presence, its last start and the work that waits.

**Files.**

- Create `packages/forge-contracts/@types/ForgePresenceDocument.ts` and export it in
  `packages/forge-contracts/package.json`.
- Change `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts`: a helper
  `endpointAddedIn(endpoint, version, introducedIn)` beside `currentEndpointOf`, which dates every entry
  `introducedIn: FIRST_VERSIONED_FORGE` (`ForgeCompatibilityRegistry.ts:16-25`), and the entry
  `endpointAddedIn('presence', 1, <this stage's forge version>)` in `FORGE_COMPATIBILITY_REGISTRY` (`:38-49`), so the
  registry dates it truly for `versions:raise-minimum`. The date gates nothing: the server serves every endpoint entry
  not yet removable (`servedEndpointsOf`, `OverseerServer.ts:601-606`), and a client learns what a forge serves from
  its system version. Stages 4 and 6 reuse the helper. And `ForgeSystemVersions.ts` if WP3.3 has not already raised the
  minor in this stage (raise it once per stage).
- No change to `packages/forge-contracts/constants/OverseerContractVersions.ts`: it lists the integer contract keys of
  the documents released before system versions, not endpoints, and the presence document carries no such key.
- Create `apps/forge/src/services/overseer/PresenceDocumentAssembly.ts` and its spec: the document from presence, the
  board and the crash logs.
- Change `apps/forge/src/services/overseer/OverseerServer.ts` (`dataRouteOf`, `:535-552`) and the route record in
  `cli/overseer/routes/OverseerRoutes.ts`: the route `GET /api/presence` behind the token. `/api/v1/presence` then needs
  no route of its own: `requestAtUnversionedPath` (`OverseerServer.ts:608-619`) maps a served `/api/v<n>/<endpoint>`
  onto its unversioned route once the registry lists `presence` at 1, and answers 404 for a version it does not serve.
- Change `apps/forge/docs/reference/overseer-api.md`.

**What to do.**

1. Define the document as in Interfaces introduced. It carries no version key of its own: its path carries it, as
   `apps/gaia/CLAUDE.md` rule 3 asks.
2. `PresenceDocumentAssembly.presenceDocumentOf(inputs)` is pure: the presence and heartbeat records, the live board's
   jobs and log records (for each interrupted job, its cause, its policy from `RESUME_POLICY_OF_CAUSE`, whether it waits
   for an instruction, an answer or a decision, and `crashResumes`), the tickets holding an `interrupted:` hold, and the
   crash logs listed by `CrashLog.list`.
3. Serve it like `state`: read fresh on each request, behind `readerIsAuthorized`.

**Specs.** The assembly spec: a reboot-interrupted job is listed as waiting for an instruction; an agent crashed once is
listed as resuming by itself; an `interrupted:merge` ticket is listed; the crash logs are listed newest last. An
`OverseerServer` spec: the route answers 401 without the token and the document with it, at `/api/presence` and at
`/api/v1/presence`, and `/api/v2/presence` answers 404. The contract package's specs
pass, and the registry spec holds the new endpoint.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/overseer/PresenceDocument
src/services/overseer/OverseerServer.spec.ts` passes.

### WP3.13 The CLI path: see a crash, start again, resume

**Purpose.** With Gaia closed, the CLI shows that a forge is off after a crash, shows its crash log, starts it again and
resumes the work.

**Files.**

- Change `apps/forge/cli/overseer/OverseerCommand.ts`: `printOverseerStatus` (`:142-172`) and a subcommand `crash` in
  `OVERSEE_SUBCOMMANDS` (`:174-180`).
- Change `apps/forge/cli/tracking/status/StatusCommand.ts`: one line on standard error when the forge is off after a
  crash, beside the hold-journal notice (`:39-43`).
- Change `apps/forge/cli/HelpText.ts`, `apps/forge/docs/cli.md`.
- Change the specs `cli/overseer/OverseerCommand.spec.ts`, `cli/tracking/status/StatusCommand.spec.ts`,
  `cli/HelpText.spec.ts`; check `cli/InstalledSurface.status.spec.ts`.

**What to do.**

1. `oversee status`: when no Overseer is live, read the evidence (`StartGate.evidenceOf` with origin `user`) and
   classify. Its JSON entity gains `presence` (Interfaces introduced); its text says, for a crash, "overseer: off after
   a crash of Baton <n> (crash log <path>); start it again with `<program> start`, then resume the interrupted work with
   `<program> resume --all`". When live, it shows the last start's kind, the heartbeat and abandoned passes from
   presence.
2. `oversee crash [<generation>] [--json]`: prints the crash log of that generation, or the newest; refuses
   `no-crash-log` when there is none. Text: the classification and its evidence, the fatal error, the jobs and their
   steps, then the log tail.
3. The top-level `status`: when the classification of a down forge is `crashed`, print to standard error "The forge
   is off after a crash: run `<program> oversee crash` to read why, `<program> start` to start it again." The JSON on
   standard output is unchanged.
4. The path end to end: `oversee status` shows the crash; `oversee crash` shows the log; `start` (origin `user`) serves
   and classifies `crashed`; `resume --all` or `resume <T|J>` resumes. `job fresh <J>` starts a fresh agent instead and
   `job stop <J>` gives the work up; say so in `docs/cli.md`.

**Specs.** `OverseerCommand.spec.ts`: `oversee status` on a scratch data folder with a crashed presence prints the crash
and its path, and `--json` carries `presence`; `oversee crash` prints the newest log, a given generation, and refuses
`no-crash-log`. `StatusCommand.spec.ts`: the notice is on standard error only, and absent for a stopped forge.

**Done when.** `bun run verify` passes at the root; `bun test cli/overseer/OverseerCommand.spec.ts cli/tracking/status`
passes in `apps/forge/`.

### WP3.14 The crash matrix

**Purpose.** The real-system matrix and its default-suite rows hold the reversed behaviour; new rows hold the start
classification and the forge that stays off.

**Files.** `apps/forge/src/services/overseer/CrashMatrix.integration.spec.ts`,
`apps/forge/src/services/overseer/CrashMatrix.spec.ts`, `apps/forge/src/services/overseer/CrashMatrix.merges.spec.ts`,
as stage 2 left them (N8); their opening docblocks say what each row holds now. Line numbers below are today's.

**What to do.** Change these rows; keep every other row as stage 2 left it.

| Spec and today's row | Change |
| --- | --- |
| `CrashMatrix.integration.spec.ts:537` "a job crash-resumed twice and interrupted again ends replaced … two replaced in a row open job-lost" | Becomes: resumed twice by itself, the third crash leaves it interrupted with no step and no fresh attempt; `resume J<n>` resumes it by id with `crashResumes` 0. No `job-lost` opens |
| `CrashMatrix.integration.spec.ts:573` "three reboots in a row during one build: three resumes of the same session, none counted" | Becomes: each reboot leaves the job interrupted `reboot` and spawns nothing; each `resume` instruction resumes the same session by id; none counted |
| `CrashMatrix.integration.spec.ts:469` "watcher dies with its agent alive …" and `:495` "watcher and agent die …" | Their regroup is a start of the same boot with no ending on record, so it classifies `crashed`: the gone child is interrupted `forge-crashed` and waits. Split each row: a child lost while the forge stays up keeps the crash cause and resumes by itself; one found gone at a crash start waits for an instruction |
| `CrashMatrix.integration.spec.ts:615` "a question pending when the machine reboots …" and `:652` "a worker reports a malformed ticket, then the machine reboots …" | Unchanged in outcome: the answer is the instruction. Add an assertion that nothing resumes before the answer |
| `CrashMatrix.integration.spec.ts:836` "a product owner interrupted by a reboot at its question waits …" | Unchanged in outcome, for the same reason |
| `CrashMatrix.spec.ts:1279` "a product owner replaced past the bound with a question open waits awaiting-answer; once answered a fresh one takes …" | The part with the question open is unchanged; past the bound with no question it waits for an instruction instead of a fresh session |
| `CrashMatrix.merges.spec.ts:108` "mid-merge with no live holder: merge --abort, a reset to branchTip and a requeue" | After a waiting start: aborted, reset, held `interrupted:merge`, not requeued; `resume <T>` requeues it. While the forge stays up: unchanged |
| `CrashMatrix.merges.spec.ts:122` "restart during a live or interrupted Airlock agent …" and `:177` "restart during a live or interrupted conflict re-reviewer …" | A live agent keeps its slot as today; an agent interrupted by the start waits for an instruction before its resolution goes on |
| `CrashMatrix.merges.spec.ts:260` "a refresh mid-merge with no live holder …" and `:319` "a job left in committing by a run cut short is an orphan …" | After a waiting start: aborted and held as in WP3.9, run again on `resume` |

Add these rows to `CrashMatrix.integration.spec.ts`, each with real processes and a scratch data folder:

- "a stop on record, then a start: classified stopped on purpose, and the jobs the stop left interrupted wait";
- "the Overseer killed, then a login-item start: it stays off, writes one crash log, takes no Baton, and Talos's lease
  stops the agents";
- "then a user start: it serves, classifies the crash, keeps the crash log, and the interrupted tickets wait until
  `resume --all`";
- "an uncaught error in the Overseer leaves a fatal-error note that the crash log carries";
- "a Baton pass leaves a completed handover on record, and the successor's start interrupts nothing";
- "a reboot, then a login-item start: it serves, classifies the machine going down, and the interrupted work waits";
- "a crash of Talos: the Overseer writes a crash log naming Talos and stops; the next start by the login item stays
  off".

**Specs.** The rows above. The default suite's rows (`CrashMatrix.spec.ts`, `CrashMatrix.merges.spec.ts`) run in
`bun run verify`; the integration rows run through `bun run record <boundary>` for the boundary `BOUNDARY_SPECS` lists
them under, or one at a time with
`bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/CrashMatrix.integration.spec.ts`
when the owner asks.

**Done when.** `bun run verify` passes at the root with no stale stamp; the integration rows pass on macOS when run as
above, and their recording is committed.

## Interfaces introduced

### Interruption causes and the resume policy

```ts
// src/lib/tracker-model/@types/Job.ts, added to InterruptionCause
| 'forge-stopped'   // the child stopped because the forge was stopped on purpose, found gone at the next start
| 'forge-crashed';  // the child gone with the forge's crash (the Overseer or Talos), found gone at the next start

// src/lib/tracker-model/constants/ResumePolicy.ts
export type ResumePolicy =
  | 'resumes-by-itself'
  | 'resumes-twice-then-waits'
  | 'waits-for-instruction'
  | 'resumes-once-decision-answered'
  | 'never-resumes';

export const RESUME_POLICY_OF_CAUSE: Readonly<Record<InterruptionCause, ResumePolicy>>;
```

| Cause | Policy |
| --- | --- |
| `answer-delivery` | `resumes-by-itself` |
| `handoff-red` | `resumes-by-itself`, under its own red-handoff bound |
| `usage-limit` | `resumes-by-itself`, once the reset time passed |
| `talos-paused` (stage 2) | `resumes-by-itself` |
| `reboot` | `waits-for-instruction` |
| `forge-stopped` | `waits-for-instruction` |
| `lease-ended` (stage 2) | `waits-for-instruction` |
| `forge-crashed` | `waits-for-instruction` |
| `network-outage` (stage 2) | `waits-for-instruction` until the owner decides (Needs the owner, item 1) |
| `agent-crashed`, `watcher-lost` (stage 2's `CRASH_INTERRUPTION_CAUSES`) | `resumes-twice-then-waits` |
| `authentication-failed` | `resumes-once-decision-answered` |
| `forced-stop-refused` | `never-resumes` |

An answer to a question of the job, logged after its newest interruption, counts as an instruction for that job.
`LIFECYCLE_LIMITS.CRASH_RESUMES_BEFORE_WAITING = 2` replaces `JOB_RESUMES_BEFORE_FRESH`.

### Playbook step

```ts
| { kind: 'resume-job'; jobId: string; instructed: boolean }
// 'replace-job' remains only for an Assistant that went down.
```

### Log records (board log, `.forge/log.jsonl`)

| Kind | Subject | Fields |
| --- | --- | --- |
| `start-classified` | board | `kind`: `StartKind`; `startOrigin`: `StartOrigin`; `previousGeneration`: count, written only when there is one; `crashSuspected`: boolean, written only when true; `crashLogGeneration`: count, written only when a crash log exists for this start |
| `job-resume-instructed` | job | `childInstance`: the job's instance at the instruction (`Job.childInstance`, stage 2's WP2.16) |
| `job-resumed` (changed) | job | adds `instructed: true`, written only for an instructed resume |
| `job-line-lost` | job | `line`: `'gate' \| 'install'`; `cause`: interruption cause |
| `ticket-interrupted-hold-lifted` | ticket | `hold`: text, the `interrupted:` hold lifted. Logged in place of `ticket-unheld`, so no fresh attempt starts and no count resets (WP3.3; Needs the owner, item 9) |

### Ticket hold

`INTERRUPTED_HOLD_PREFIX = 'interrupted:'` in `src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts`; the
one hold this stage writes is `interrupted:merge`. It holds the ticket as every hold does, and keeps it out of the
merge queue (`AirlockClaims.ts:166-169`). `resume <T>` and `resume --all` lift it through
`Board.liftInterruptedHold(ticketId, at)`, logging `ticket-interrupted-hold-lifted`; `ticket unhold <T>` lifts it as a
person's unhold, logging `ticket-unheld` with its resets.

### Control command

```ts
// src/shared/@types/ControlCommand.ts and packages/forge-contracts/@types/ForgeControlCommand.ts
export type ResumeTarget = { jobId: string } | { ticketReference: string } | 'all';
| { kind: 'interrupted-work-resume'; target: ResumeTarget }
```

Applied in one hold, with the Overseer up or down. Refusals (`OperationRefusal('refused')` with a `BoardRefusal`
reason): `job-not-interrupted` (`jobId`), `ticket-not-interrupted` (`ticketId`), and the ticket lookup's own refusals.
`'all'` with nothing waiting answers `nothing-to-do`. Never admitted for an agent role by the Bouncer.

### CLI

| Verb | Effect | Exit codes |
| --- | --- | --- |
| `resume <J>\|<T> [--json]` | `interrupted-work-resume` for the job or ticket | 0 done or nothing to do; 1 refused |
| `resume --all [--json]` | `interrupted-work-resume` `'all'` | 0 |
| `oversee [--started-by user\|login-item] …` | the start origin; `user` when absent | unchanged, plus 1 `forge-off-after-crash` |
| `oversee crash [<generation>] [--json]` | prints a crash log | 0; 1 `no-crash-log` |
| `oversee status [--json]` | adds `presence` | unchanged |

The login item's line on every platform: `<bun> <isolating arguments> <checkout>/agent-progress.ts oversee --detach
--started-by login-item`. `start` passes `--started-by user` to the detached child.

The refusal `forge-off-after-crash`: detail `{ kind: 'forge-off-after-crash', crashedGeneration: number, crashLogPath:
string }`, exit 1, worded for the command line ("The forge is off after a crash of Baton <n>; read why with `oversee
crash`, and start it yourself with `start`.") and for the API without a command line.

The `presence` block of `oversee status --json`:

```ts
interface StatusPresence {
  state:            'serving' | 'starting' | 'down' | 'off-after-crash';
  lastStart:        StartClassificationVerdict | null;
  crashLog:         { generation: number; path: string } | null;
  heartbeat:        HeartbeatRecord | null;
  abandonedPasses:  PresenceRecord['abandonedPasses'] | null;
}
```

### Stored files, under `<data>/overseer/` (`overseerFilesIn(...).overseerDirectory`)

`presence.json`, written whole and atomically by the main thread only:

```ts
export type StartOrigin = 'user' | 'login-item' | 'successor';

export interface PresenceRecord {
  presenceVersion:     1;                       // PRESENCE_FORMAT_VERSION
  generation:          number;                  // the Baton generation this record describes
  process:             { processId: number; startStamp: string; bootIdentity: string };
  codeVersion:         string;
  startOrigin:         StartOrigin;
  startedAt:           string;                  // local ISO time; shown only
  startClassification: StartClassificationVerdict;
  abandonedPasses:     {
    inARow: number;
    last:   { reason: AbandonedPassReason; detail: string; at: string } | null;
  };
  ending:              null | { kind: 'stopped' | 'handed-over'; at: string };
}
```

`heartbeat.json`, written whole and atomically by the lease renewer only, on each renewal:

```ts
export interface HeartbeatRecord {
  heartbeatVersion: 1;      // HEARTBEAT_FORMAT_VERSION
  generation:       number;
  sequence:         number; // from 1, one up on each beat
  at:               string; // local ISO time of the beat
}
```

`fatal-error-<generation>.json`, written by the dying process:

```ts
export interface FatalErrorNote {
  fatalErrorVersion: 1;
  generation:        number;
  origin:            'uncaught-exception' | 'unhandled-rejection';
  name:              string;
  message:           string;
  stack:             string | null;
  at:                string;
}
```

`crash-logs/crash-<generation>.json`, created exclusively, never rewritten:

```ts
export interface CrashLogRecord {
  crashLogVersion:     1;
  crashedGeneration:   number;
  component:           'overseer' | 'talos' | 'unknown';
  suspected:           boolean;          // true for a crash suspected before a reboot
  classification:      StartClassificationVerdict | null; // null when the Overseer wrote it for a crash of Talos
  recordedAt:          string;
  recordedBy:          { generation: number | null; startOrigin: StartOrigin | null };
  crashedProcess:      { processId: number; startStamp: string; bootIdentity: string } | null;
  codeVersion:         string | null;
  startedAt:           string | null;
  lastHeartbeat:       { sequence: number; at: string } | null;
  fatalError:          FatalErrorNote | null;
  activeJobs:          {
    jobId: string; kind: string; role: string | null; ticketIds: string[]; state: string;
    interruption: string | null; instance: number; airlockPhase: string | null; eventSequence: number;
  }[];
  talosChildren:       unknown[] | null; // stage 2's persisted child records, copied as stored
  logTail:             string[];         // the last CRASH_LOG_TAIL_LINES lines of overseer.log
}
```

Constants in `src/services/overseer/constants/PresenceLimits.ts`: `PRESENCE_FORMAT_VERSION = 1`,
`HEARTBEAT_FORMAT_VERSION = 1`, `CRASH_LOG_FORMAT_VERSION = 1`, `FATAL_ERROR_FORMAT_VERSION = 1`,
`CRASH_LOG_TAIL_LINES = 200`, `ABANDONED_PASSES_BEFORE_NOTICE = 3`, `HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS` = four
lease renewal intervals (60 000 with stage 2's 15 seconds), derived from stage 2's constant, not written as a number.

### Start classification

```ts
export type StartKind = 'first-start' | 'handover' | 'stopped-on-purpose' | 'machine-went-down' | 'crashed';

export interface StartClassificationVerdict {
  kind:               StartKind;
  previousGeneration: number | null;
  crashSuspected:     boolean;  // only ever true with 'machine-went-down'
  evidence: {
    presence:              'absent' | 'unreadable' | 'read';
    previousEnding:        'stopped' | 'handed-over' | null;
    previousBootIdentity:  string | null;
    currentBootIdentity:   string;
    newerBatonThanPresence: boolean;
    lastHeartbeatAt:       string | null;
    bootStartedAt:         string | null;
  };
}

export type StartGateVerdict =
  | { verdict: 'serve'; classification: StartClassificationVerdict; crashLogGeneration: number | null }
  | { verdict: 'stay-off'; classification: StartClassificationVerdict; crashLogPath: string };
```

### Abandoned pass

```ts
export type AbandonedPassReason = 'tracker-lock-held' | 'lock-taken-over' | 'board-refused' | 'unexpected-error';
// OverseerNotice gains:
| { kind: 'passes-abandoned'; inARow: number; reason: AbandonedPassReason }
```

### Process supervision port

```ts
// src/lib/process-identity/ProcessSupervision.ts
readonly bootStartedAtEpochSeconds: () => number | null;
```

### Registry

The entry of a board in the monitor registry gains an optional key beside `overseer`:

```ts
presence?: { state: 'serving' | 'stopped' | 'handed-over' | 'off-after-crash'; generation: number; at: string };
```

It only adds, so the registry's version stays; a reader that knows the version passes it over until it reads it.

### Read API

`GET /api/v1/presence`, behind the bearer token, listed in `FORGE_COMPATIBILITY_REGISTRY` as `presence` version 1 and
answered by the unversioned route `GET /api/presence`, as every versioned read is; the forge's system version rises by
one minor in this stage, over the 1.18 of today plus whatever stage 2 raised.

```ts
// packages/forge-contracts/@types/ForgePresenceDocument.ts
export interface ForgePresenceDocument {
  readonly generation:      number;
  readonly processId:       number;
  readonly codeVersion:     string;
  readonly startedAt:       string;
  readonly startOrigin:     'user' | 'login-item' | 'successor';
  readonly lastStart:       {
    readonly kind:               'first-start' | 'handover' | 'stopped-on-purpose' | 'machine-went-down' | 'crashed';
    readonly previousGeneration: number | null;
    readonly crashSuspected:     boolean;
    readonly crashLogGeneration: number | null;
  };
  readonly heartbeat:       { readonly sequence: number; readonly at: string } | null;
  readonly abandonedPasses: { readonly inARow: number; readonly lastReason: string | null; readonly lastAt: string | null };
  readonly interruptedWork: readonly {
    readonly jobId:        string;
    readonly kind:         string;
    readonly ticketIds:    readonly string[];
    readonly cause:        string;
    readonly waitsFor:     'instruction' | 'answer' | 'decision' | 'nothing' | 'never';
    readonly crashResumes: number;
  }[];
  readonly heldMerges:      readonly { readonly ticketId: string; readonly hold: string }[];
  readonly crashLogs:       readonly { readonly generation: number; readonly recordedAt: string; readonly suspected: boolean }[];
}
```

`waitsFor: 'nothing'` is a job that resumes by itself at the next pass.

## Traps

- **The old auto-resume hides in more than one place.** `crashBoundStepsOf`, `productOwnerStepsOf`, the Airlock orphan
  requeue, the gate step read as never run, and stage 2's reconnect all start work again by themselves. Changing only
  the Playbook leaves merges and gates retrying. WP3.2, WP3.9 and WP3.10 each close one; WP3.14's rows prove all of
  them.
- **A start that is a crash must not take the Baton before it decides to stay off.** If the gate runs after
  `Baton.acquire`, a refused start leaves a fresh dead generation, and the next start reads a newer Baton than the
  presence record and classifies on the wrong evidence. Classify before `startServing`, and write presence only after
  the Baton is acquired.
- **Presence is overwritten by the start that read it.** Read the evidence, classify, write the crash log, and only then
  write the new generation's presence. A crash log written after the overwrite has lost the crashed generation's
  heartbeat and ending.
- **Two writers on one file lose updates.** The lease renewer may run outside the main event loop (N5). If it wrote
  `presence.json`, a read-modify-write from the main thread (an ending, an abandoned pass) could overwrite a heartbeat
  or the other way round. The heartbeat has its own file and its own writer.
- **A stop that is not a stop.** The Overseer also ends on `baton-taken` (`OverseerForeground.ts:795-798`), on a lost
  port after a failed Baton pass (`:683-694`) and after a crash of Talos (N6). Only `closeTheStoppedOverseer` writes
  `stopped`, and only `release` writes `handed-over`. A crash of Talos must leave no ending, or the next start reads it
  as on purpose and serves.
- **`closeTheStoppedOverseer` also runs from the CLI for a dead Overseer** (`OverseerStop.ts:15-20`, a forced or
  unfinished stop). It then writes `stopped` for a process that may have crashed or hung. That is the design's second
  misreading; keep it and its spec, do not try to tell the cases apart here.
- **The successor and the crash.** A successor whose predecessor died during the pass (`predecessor-gone`) used to start
  "as after a crash". Now it classifies `crashed` with origin `successor` and stays off. The user's restart from Gaia
  then needs a second, explicit start; say so in the refusal's text.
- **The login item is the usual start after a reboot.** It must serve after `machine-went-down` and only stay off after
  `crashed`. A refinement that turned every stale heartbeat into a crash would keep every laptop's forge off after a
  sleep that ended in a dead battery; that is why the suspected crash serves until the owner decides.
- **An unreadable boot identity reads as another boot** (`ProcessIdentity.ts:44-46`): a crash on a machine whose boot
  cannot be read reads as the machine going down. Keep `sameBoot`'s rule; the spec states it as a known misreading.
- **The clock rules** (`apps/forge/CLAUDE.md`, rewritten on 2026-11-18). A heartbeat is real time, which the rules
  name, and the boot time is an instant an outside system names. Judging "crash suspected" from their difference takes a
  fact from a clock, against "a clock gives no fact"; that site alone carries the comment the rules ask of code that
  does not obey them. Every limit here that looks back on work (crash resumes, abandoned passes) is a count, never an
  elapsed time.
- **Process handlers can change how the process dies.** A plain `uncaughtException` listener stops Bun from exiting on
  an uncaught error, so the forge would keep running broken. Use the monitor event, or rethrow after the note; and never
  call `process.exit` outside the files `eslint.config.js` allows.
- **The crash log must survive a racing second starter.** Two login-item starts after one crash both classify `crashed`.
  `createWholeFileAtomically` makes the file exclusive; a plain write would let the second overwrite the first with a
  later, shorter log tail.
- **Name collisions.** `FailedPassUtil` and `FAILED_PASSES_BEFORE_PARKING` already mean a ticket's failed job outcomes;
  the new thing is an abandoned pass. `oversee resume` already means "undo a pause" (`OverseerCommand.ts:128-139`, the
  command kind `overseer-resume`); the new command kind is `interrupted-work-resume` and its verb is the top-level
  `resume`, worded in help as "resume interrupted work". `src/ComponentNames.spec.ts:28-63` retires `handing-over`,
  `lease-taken-over`, `Reattachment` and `RunnerLease` among others: the ending is `handed-over`, never `handing-over`,
  and no new identifier may contain a retired name.
- **`job-lost` goes quiet.** `job-lost` opens after two `replaced` endings in a row (`Playbook.ts:202-212`), and the
  crash bound was what produced most of them. After WP3.2 only a failed vendor resume and `job fresh` end a job
  `replaced`. Keep the rule; do not invent a new trigger here.
- **The outage count still counts crashes.** `outageIsDueWith` (`Playbook.ts:188-200`) counts `job-interrupted` records
  of crash causes. `forge-crashed`, `forge-stopped` and `reboot` are not crash causes, so a board coming back after a
  crash with several interrupted jobs does not also open `outage`. Keep them out of `CRASH_INTERRUPTION_CAUSES`.
- **An instruction must not outlive its interruption.** `resumeIsInstructed` compares the newest instruction with the
  newest interruption (or lost line) of the job in log order. A test that only checks "an instruction exists" passes
  while a stale instruction resumes a later interruption by itself.
- **An instructed resume still obeys every hold.** Usage limit, install change, outage, refused key and a missing
  pipeline hold an instructed resume too (`Playbook.ts:763-771`); the instruction stays in the log and is carried out
  when the hold clears. Do not move the job to `running` in the command's hold: that would bypass the holds and the
  slots.
- **An unhold starts a fresh attempt.** `ticket-unheld` resets a ticket's failed passes (`FailedPassUtil.ts:74-75`),
  its builder's return from review (`Playbook.ts:313-323`) and, since the entities work, its return from declared needs
  (`:329-339`). Lifting an `interrupted:merge` hold with `unholdTicket` would make a crash reset those counts, and a
  later red merged tree would launch a fresh builder instead of resuming the one that built it. WP3.3 lifts it with a
  record of its own; a spec proves the failed-pass count reads the same across the lift.
- **A launch decided before a crash is not interrupted work.** A job launched in the hold and never spawned is
  re-spawned at the next start (`CrashMatrix.integration.spec.ts:681`). It never ran, so it keeps that behaviour; do not
  let WP3.9 interrupt it.
- **The command endpoint already takes every control kind** (`CommandRoute.ts:52-55`). Adding the kind to
  `ControlService` exposes it to Gaia at once; the contract package must name it in the same stage, with the minor
  raised.
- **The registry write must never fail a start.** `registerWithTheMonitor` already returns a verdict instead of
  throwing; the presence key goes through it, and a refused start still refuses with its own refusal when the registry
  cannot be written.
- **Scratch only.** No spec and no end-to-end check reads or writes `~/.forge-monitor` or `~/.gaia`, or starts a real
  agent: the fake agent and a scratch home, always.

## Verification of the whole stage

At the repository root:

```
bun install --frozen-lockfile
bun run verify
```

Both pass, with no stale recording stamp and the process-identity boundary recorded on macOS.

The specs that matter most, run in `apps/forge/`:

```
bun test src/lib/tracker-model/constants/ResumePolicy.spec.ts src/lib/tracker-model/Playbook.spec.ts src/lib/tracker-model/Board.jobs.spec.ts
bun test src/services/overseer/Presence.spec.ts src/services/overseer/StartClassification.spec.ts src/services/overseer/CrashLog.spec.ts
bun test src/services/overseer/StartGate.spec.ts src/services/overseer/ReconcileCauses.spec.ts src/services/overseer/AbandonedPassReason.spec.ts
bun test src/services/control/ResumeControls.spec.ts cli/resume cli/overseer cli/tracking/status
bun test src/services/overseer/CrashMatrix.spec.ts src/services/overseer/CrashMatrix.merges.spec.ts
bun test src/ComponentNames.spec.ts src/ImportDirection.spec.ts src/PlatformBoundary.spec.ts src/RealSystemSpecs.spec.ts
```

The real-system matrix, only when the owner asks for it or as the recording of its boundary:

```
bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/CrashMatrix.integration.spec.ts
```

The end-to-end check on a scratch forge. Neither app's rules let anyone run a forge in this checkout; Gaia's rules name
the scratch forge of `apps/gaia/src/testing/ScratchForge.ts`, which runs `apps/forge/agent-progress.ts` under a scratch
home, in a scratch repository, with `FORGE_ROOT` pinned and the forge's fake agent. Use it, or the same setup by hand
(a scratch home under a short scratch root, the fake agent variable `FAKE_AGENT_VARIABLE` of
`apps/forge/src/shared/Environment.ts:26` set, `--port 0`), and check, in order:

1. `init`, file one ticket whose fake agent waits, `start`: `oversee status --json` shows `presence.lastStart.kind`
   `first-start`.
2. `stop`, wait past the lease, then `start`: `stopped-on-purpose`; the ticket's job is interrupted `lease-ended` (Talos
   stopped the agent after a minute without contact), and nothing resumes. `resume --all`: the session resumes by id in
   the same folder.
3. Kill the Overseer's process with `SIGKILL`; run `oversee --detach --started-by login-item`: it exits 1
   `forge-off-after-crash`, `oversee status` says off after a crash, `oversee crash` prints the log with the jobs and
   the log tail, and `status` prints the notice on standard error. After a minute Talos has stopped the agent.
4. `start`: it serves, `lastStart.kind` is `crashed` with the crash log's generation, the job waits; `resume <T>`
   resumes it.
5. `oversee restart`: the successor's start is `handover`, and nothing is interrupted.
6. Remove the scratch home, repository and short link; the leak check of the run must find nothing.

## Out of scope

- Gaia's crash alert, its interrupted-work list and its resume control: stage 6, reading the presence document and the
  registry key this stage serves.
- Recognising the network-outage ending, the lease, the clean quit and lines under Talos: stage 2. This stage only maps
  their causes and endings into the policy.
- A probe that resumes after a network outage once the vendor is reachable: only if the owner chooses it (Needs the
  owner, item 1), and then as its own package.
- A time bound on install lines: open (Needs the owner, item 2); nothing here bounds one.
- Persisting what is held in memory beyond presence (the event replay buffer, the pass fingerprint, the merge-forecast
  and main-line caches, the quiet counts, the notices): design section 7 lists them; this stage persists only presence,
  the heartbeat and the crash logs.
- Redesigning Airlock steps to be safe to redo: stage 0 traces them; this stage only holds what it finds half done.
- The store port: stage 5. Do not introduce a port for the presence files.
- Taking the Assistant off by default and its new trigger: stage 8. The Assistant keeps being replaced when it goes
  down.
- Renaming the Overseer, `overseer.log`, the `overseer` folder or `oversee resume`: stage 9.
- A new package: none is created in this stage.

## Needs the owner

1. **What follows an ending on a network outage** (design section 12, item 1). Built here: the ending is an interruption
   of its own, never counted as failed or crashed, shown in the presence document, and resumable by `resume`. The fork:
   resume by itself once the vendor answers again (a real-time probe, new code), or wait for the instruction.
   Recommended default: wait for the instruction, which is the table's row today and needs no probe; the probe can come
   later as one package that flips the row.
2. **Whether an install line gets a time bound** (design section 12, item 2). This stage touches lines only to make a
   lost one wait (WP3.10), which both answers share. The owner answers in stage 0, and stage 2 carries the answer in
   `INSTALL_LINE_TIME_BOUND_MILLISECONDS`; nothing here bounds a line.
3. **What a crash suspected before a reboot does.** Built here: the classification flags it, a crash log is written and
   marked `suspected`, and the flag is shown. The fork: keep the forge off as after a crash, or serve with a warning.
   Recommended default: serve with the warning, because a sleep that ends in a dead battery reads the same and would
   otherwise keep the forge off after a harmless shutdown.
4. **Whether an unexpected error in a pass is a crash.** Built here: `pass-abandoned` with the reason
   `unexpected-error`, retried, counted, and a notice after three in a row. Recommended default: keep it a notice in
   this stage; if the owner wants decision 14 applied to it, the change is to stop after the third and write a crash
   log.
5. **What an instructed resume does to the crash count.** Recommended default: an instruction sets `crashResumes` to 0,
   so a job the user resumed gets two automatic resumes again before it waits.
6. **Whether a retried merge, refresh or constitution commit after a waiting start waits too.** Built here: all three
   wait after a crash, reboot or stop, and keep today's retry while the forge stays up. Recommended default: as built,
   adjusted to stage 0's trace of what an Airlock leaves half done.
7. **Whether the verb is `resume`** beside `oversee resume`, which undoes a pause. Recommended default: keep `resume`
   for interrupted work and keep the pause pair, told apart by help text; stage 9 renames the pair to
   `hephaestus pause` and `hephaestus resume` with the rest of the verb (stage 9's replacement table). The alternative,
   renaming the unpause verb (for example to `continue`), is a change to stage 9's table and its command kind
   `hephaestus-resume`.

8. **How Gaia learns that a forge that is down crashed.** The design has Gaia watch presence (section 8) and run the
   CLI only to start, stop and set up a forge (section 3.4); a down forge serves no API. Built: a `presence` key in the
   machine registry's entry, written at a start, a stop, a handover and a refused start (WP3.8), which Gaia reads with
   the rest of the registry. A crash itself writes nothing, so until a start classifies it Gaia sees `serving` with a
   dead process. Recommended default: as built; stage 6 (WP6.21) reads that as "down".

9. **Whether lifting a hold a crash put on starts a fresh attempt.** Built here: `resume` lifts an `interrupted:` hold
   with `Board.liftInterruptedHold`, which logs `ticket-interrupted-hold-lifted`, so the failed passes, the builder's
   return from review and the return from its needs are kept (Traps). The fork: lift it with `unholdTicket`, as a
   person's unhold, and accept the resets, which needs no new record. Recommended default: as built, because the hold
   records a crash, not a decision of the user about the ticket.

## Not established

- Stage 2's code for every need N1 to N9: stage 2 is not built, so the names in the table come from its plan
  (`stage-2-talos.md`). The builder confirms each name in the code before starting.
- Whether Bun emits `uncaughtExceptionMonitor`: `node_modules/@types/node/process.d.ts:134` declares it, but Bun's
  runtime behaviour was not checked.
- How `kern.boottime` reads through the existing `sysctl` primitive of `DarwinProcessIdentity.ts`, and what Windows can
  answer for the boot start; WP3.4 answers `null` on Windows.
- What an Airlock leaves half done at each step (stage 0's trace); WP3.9's holds are built on today's orphan paths
  (`Airlocks.ts:792-797`, `:990-1007`, `:1443-1450`, `:1483-1485`, `:1516`) only. The crossing stages and entity
  constitutions of the entities work reach the same paths, but their half-done steps were not traced either.
- Whether driving `apps/gaia/src/testing/ScratchForge.ts` outside a recording spec is supported, for the end-to-end
  check.

Settled when the plan was rechecked after the entities work: the Airlock's candidate selection skips a held ticket
(`AirlockClaims.ts:166-169`); the frozen installed surface lists only what installed files name, so the verb `resume`
bumps no install version by itself (WP3.3); a served `/api/v<n>/<endpoint>` is mapped onto its unversioned route
(`OverseerServer.ts:608-619`); Gaia's registry reader reads only the keys it names (`RegistryMapUtil.ts:32-59`); and the
spec files are named in WP3.1, WP3.2 and WP3.8.
