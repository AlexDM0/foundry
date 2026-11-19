# Stage 3: Presence and recovery

## Goal

Every start of a board's forge knows what kind of start it is: a handover, a start after a stop on purpose, a start
after the machine went down, a start after a crash, or a start after a crash suspected before a reboot. It records that
kind, makes the record truthful by itself and starts no interrupted work until the user says so, for one job, one
ticket, everything, or everything that ended on a network outage. A crash, an unexpected error in a pass on its first
occurrence among them, leaves a crash log complete enough to trace it back, and the forge stays off until the user
starts it. An agent that crashed while the forge did not is resumed twice and then waits; a user's resume gives it its
two automatic restarts back. Presence tells Gaia, through the registry and the read API, that a forge crashed (before
any start reads it), that it stopped supervising its agents, and which work waits, by cause. The CLI alone can show the
crash, start the forge again and resume the work. Nothing of this stage moves into a package.

## Depends on

Stages that must be finished: stage 0 (the traces of recovery, of an Airlock landing and of what the Overseer holds only
in memory, tables A to C of `stage-0-1-trace-and-base.md`), stage 1 (the monorepo migration closed) and stage 2 (Talos,
the commander).

What this stage needs from stage 2, by role, with the names stage 2's plan gives them (`stage-2-talos.md`). Before the
first work package, confirm each name in stage 2's code. Where an item is missing, stop and report it; do not build it
here.

| Need | What it must be, by stage 2's names | Used by |
| --- | --- | --- |
| N1. The reconnect report | `regroup` (`apps/forge/src/services/overseer/Regrouping.ts`, as stage 2's WP2.13 item 2 leaves it), run once at start before the first pass: per job, `BoardChildren.livenessOf` answers `live`, `ended` with the `ChildEnd` Talos recorded, or `lost` (the child died with Talos, or the machine went down); a `lost` child is settled by `settleLostChild` (`src/services/overseer/TalosStart.ts`, stage 2's WP2.9) into `child-<i>.lost-cause` | WP3.9 |
| N2. The causes stage 2 adds | `talos-paused` (a clean quit of Talos), `lease-ended` and `network-outage`, in `INTERRUPTION_CAUSES` (`apps/forge/src/lib/tracker-model/constants/JobStates.ts:73-82` today, stage 2's WP2.11), none of them in `CRASH_INTERRUPTION_CAUSES` | WP3.1, WP3.2 |
| N3. The crash causes | `CRASH_INTERRUPTION_CAUSES` (`JobStates.ts:91`), unchanged by stage 2: `watcher-lost` and `agent-crashed` | WP3.2 |
| N4. The network-outage ending | The pass interrupts a job `network-outage` when Talos's child record lists the recognised ending `network-outage` (stage 2's WP2.13 item 4.1). Stage 2's list `INTERRUPTION_CAUSES_HELD_FROM_RESUMING = ['network-outage', 'lease-ended']` in `JobStates.ts` holds both causes from resuming; WP3.2 deletes it, since the resume policy table says the same once | WP3.1, WP3.2 |
| N5. The lease renewer | `startLeaseRenewal` in `src/services/overseer/LeaseRenewal.ts` (stage 2's WP2.9): a timer on the Overseer's main loop, with no thread of its own, that renews every `LEASE_RENEWAL_INTERVAL_MILLISECONDS` (15 seconds) when no pass is in flight or the pass in flight moved on, and withholds the renewal while one pass stays in flight (decision 38). Its `onRenewed` hook fires at each renewal Talos confirmed; WP3.5 writes the heartbeat there | WP3.5 |
| N6. A crash of Talos | The two `ensureTalos` call sites (`src/services/overseer/TalosStart.ts`): at start in `startServing`, and while serving after the connection closed or a child read `lost` (stage 2's WP2.13 item 13). Each answers `started` with `previousTalos: 'lost'` once it stopped the orphans and settled their jobs | WP3.6, WP3.7 |
| N7. Lines under Talos | `lineEndOf(folder)` in `src/services/overseer/JobLaunch.ts` (stage 2's WP2.13 item 6): `pending` while live or unlaunched, `rerun` when the newest instance ended `paused` or reads `lost`, otherwise its `ChildEnd`; an end `time-bound` (the 15-minute bound of a gate or install line, a sleep not counted, decisions 29, 36 and 37) is a judged end | WP3.10 |
| N8. The crash matrix on Talos | `CrashMatrix.integration.spec.ts`, `CrashMatrix.spec.ts` and `CrashMatrix.merges.spec.ts` ported to Talos with today's rows and titles (stage 2's WP2.13 specs) | WP3.14 |
| N9. The Baton record | `BatonRecord` (`apps/forge/src/services/overseer/Baton.ts:16-26`) still written whole at each start and released at a stop, with `talosProtocolVersion` in place of `watcherProtocolVersion` (stage 2's WP2.13) | WP3.6, WP3.8 |
| N10. Talos's record | `TalosRecord` in `talos-<n>.json` with `state`, `talos` (its process identity) and `lease.standing` (`'unheld' \| 'held' \| 'waiting-after-gap' \| 'ended'`, written on each change of standing), and stage 2's reader of the newest record, which needs no connection | WP3.6, WP3.12 |

What this stage hands to later stages:

- Stage 4 (the standing contract and the served facts): the presence and crash-log documents in
  `packages/forge-contracts` with types of their own and forge's typed mapping into them, the `endpointAddedIn` helper
  of the compatibility registry, the command `interrupted-work-resume`, and five refusals worded in the one wording
  table, which stage 4 serves with their reason code, fields and sentence (decision 45). The resume policy table, the
  causes and the log records stay in `apps/forge/src/lib/tracker-model` (decision 49).
- Stage 5 (store port): the presence record, the heartbeat file and the crash logs are stored formats under the board's
  `overseer` folder. Stage 5 decides whether they sit behind the store port; this stage reads and writes them through
  one module each, so the move is local.
- Stage 6 (Gaia's views): the registry's `presence` key (`serving`, `stopped`, `handed-over`, `crashed` with a crash
  summary), `GET /api/v1/presence` (interrupted work by cause, supervision, crash logs) and `GET /api/v1/crash-log`, and
  the command `interrupted-work-resume` with its target `network-outage`, from which Gaia draws its crash alert, the
  forge that stopped supervising its agents, the interrupted-work list and the one control that resumes every job that
  ended on a network outage across all forges (decision 35).
- Stage 8 (shrink the HTTP surface): nothing removed here; the presence and crash-log reads are among those that stay.
- Stage 9 (rename): every new file sits under today's `overseer` folder and names no Overseer in a new identifier; the
  stored component value `overseer` of a crash log, the internal foreground entry `oversee` with its `--started-by`, the
  presence block of `oversee status` and `oversee resume`, which stage 9 renames `unpause` (decision 41), move with the
  rest.

## Decisions this stage carries out

From `docs/monorepo/hephaestus-talos.md` section 2:

- **3.** The presence record, the heartbeat file and the crash log carry a format version.
- **8.** An agent paused by a clean quit of Talos keeps resuming by itself; the resume policy table names that cause so.
- **11.** An answer to a question still resumes its session: answering is an instruction for that job.
- **12.** Presence, the start classification, the abandoned-pass count and the resume instructions are persisted, never
  held in memory.
- **13.** Every start is classified and reconciled by itself; interrupted work waits for an instruction.
- **14.** A crash writes a crash log, keeps the forge off until a start by the user, and is never retried. An unexpected
  error in a pass is a crash on its first occurrence. A crash of Talos stops everything of its board.
- **15** and **35.** An ending on a network outage is an interruption of its own, never counted as a failure or a crash;
  the job waits, and one instruction resumes every job that ended this way. A job that ends on an outage again waits
  again.
- **20.** The login item still brings a forge back after a reboot by its own means; the work it finds interrupted waits.
- **21.** The forge side of the warning: the registry's presence key and the presence document that Gaia reads.
- **22.** Resuming is a command (`interrupted-work-resume`), from the CLI verb `resume` or the command endpoint.
- **30** and **40.** An agent that crashed while the forge did not is resumed twice; after that its job waits. A user's
  resume sets its count back to zero, so it has its two automatic restarts again.
- **32** and **46.** The new stored formats and the changed login item lines replace the old outright; boards are set up
  anew, and both trackers stay stopped, so no user meets a verb of this stage before stage 9 settles the set.
- **33.** No package is created or extracted.
- **34.** Orchestrated sessions build this stage outside both trackers.
- **38.** A hung Hephaestus counts as gone: its agents end `lease-ended` and wait for the user's resume, and presence
  shows that the forge stopped supervising them.
- **39.** A crash suspected before a reboot keeps the forge off, as after a crash, with its crash log.
- **41.** `resume` restarts interrupted work: one job, one ticket, everything, or everything that ended on a network
  outage. Undoing a pause is `unpause`, which stage 9 names.
- **42** (in part). `start` is the one start a user types and carries the start origin; the new verb `crash-log` sits at
  the top level; no new verb goes under `oversee`.
- **45** (in part). Each new refusal has one sentence in forge's wording table, the one the command line prints.
- **49** and **50** (in part). The presence and crash-log documents are contract types that import nothing from forge's
  model; forge maps its records into them in its own typed assembly.

The run's own calls that this stage carries out, each settled here:

- **R1. The expected conditions of a pass are the lock's two.** A pass that throws `tracker-lock-held` or
  `lock-taken-over` (today's lock frees a holder whose stamp is stale, which a sleep in the middle of a hold produces)
  is an abandoned pass, retried at the next wake-up and counted. Any other throw, every other `OperationRefusal`
  included, is a crash (WP3.11).
- **R2. Gaia learns of a crash from the registry.** The crash path, a refused start and a start that serves write the
  registry's `presence` key, with a short crash summary for `crashed`. Gaia never reads the crash log file; once the
  forge serves, the full log is served at `GET /api/v1/crash-log`, and `crash-log` prints it from the CLI at any time
  (WP3.8, WP3.12, WP3.13).
- **R3. Two shapes of a hung Hephaestus.** One whose event loop still turns serves its API, and the presence document
  reads Talos's lease standing: `stopped` once the lease ended. One whose event loop is blocked answers nothing while
  its registry key reads `serving`, which Gaia shows as a forge that does not answer. A killed process leaves the same
  trace; no forge code runs to tell the two apart (WP3.12).
- **R4. A crash path in the process.** An unexpected error in a pass, a crash of Talos found while serving, an uncaught
  exception and an unhandled rejection all run one crash path: crash log, presence ending `crashed`, the lease renewal
  stopped so Talos's lease runs out, the registry key `crashed`, then the process ends. A kill from outside runs
  nothing; the next start writes the crash log (WP3.7, WP3.8).
- **R5. Lifting a hold a crash put on starts no fresh attempt.** `resume` lifts an `interrupted:` hold with
  `Board.liftInterruptedHold`, which logs `ticket-interrupted-hold-lifted`, so a ticket's failed passes and its
  builder's returns from review and from its needs are kept (WP3.3).
- **R6. A merge cut short by a start that waits, waits too.** After a start that is not a handover or a first start,
  every Airlock slot with no live holder is restored and its ticket held `interrupted:merge`; while the forge stays up,
  today's requeue holds (WP3.9). The three steps stage 0 found not redone are covered (WP3.15).
- **R7. The pause pair keeps its names until stage 9.** `oversee resume` and the command kind `overseer-resume` undo a
  pause until stage 9 renames them to `unpause`; the new command kind is `interrupted-work-resume` and its verb the
  top-level `resume`, worded in help as "resume interrupted work".
- **R8. The login item starts through `start`.** On macOS and Windows the login item runs `start --started-by
  login-item`; on Linux, whose unit keeps its process in the foreground, it runs the internal foreground entry with the
  same flag. The detached child and a Baton pass's successor carry their origin on the same entry.
- **R9. What stays in memory.** The quiet-job counts and the Airlocks' held targets (stage 0, table C) are derived again
  after a start and make no decision wrong, only later; this stage persists neither.

## Today's code

Paths are from `apps/forge/` unless they start with `packages/` or `apps/gaia/`. Checked against `HEAD` of the branch
`hephaestus-talos` (forge system version 1.18, install version 36). Rows that name stage 2 describe what stage 2's plan
leaves.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The Baton record: process identity, start stamp, boot identity, port, URL, token file, code version | `src/services/overseer/Baton.ts:16-26` | Kept. Presence is a separate record beside it (WP3.5) |
| A Baton generation is created exclusively and the newest naming a live process is the Overseer | `src/services/overseer/Baton.ts:98-146` | Kept. The classification reads the newest generation (WP3.6) |
| `Baton.release` unlinks the holder's generation at a stop | `src/services/overseer/Baton.ts:172-179` | Kept. A completed stop is also written to presence, before the release (WP3.5) |
| The Baton pass file and its states | `src/services/overseer/BatonPass.ts:28-35`, `:88-104` | Kept |
| The successor's admission `predecessor-gone`, "starting as after a crash" | `src/services/overseer/BatonPass.ts:239-253`, `cli/overseer/OverseerForeground.ts:716` | Changed: classified `crashed`, and a successor is no start by the user, so it stays off (WP3.8) |
| `release`: drive pass stopped, `overseer-stopped` `baton-passed` logged, server stopped | `cli/overseer/OverseerForeground.ts:651-660` | Changed: writes the presence ending `handed-over` (WP3.5) |
| `closeTheStoppedOverseer`: logs `overseer-stopped` `stopped`, removes the registry entry's Overseer, writes the page stub, releases the Baton | `cli/overseer/OverseerForeground.ts:169-176` | Changed: writes the presence ending `stopped` and the registry presence `stopped` (WP3.5, WP3.8) |
| `startServing`: binds, takes the Baton (`:521-526`), logs `overseer-started` in one hold (`:561-568`), then regroups | `cli/overseer/OverseerForeground.ts:398-648` | Changed: the start gate runs before it binds, presence is written after the Baton, `start-classified` is logged in the start hold (WP3.8) |
| The Overseer's logger appends `<data>/overseer.log` | `cli/overseer/OverseerForeground.ts:128-138` | Kept. Its tail goes into a crash log (WP3.7) |
| The foreground loop's end: stop waits, then `closeTheStoppedOverseer` | `cli/overseer/OverseerForeground.ts:775-804` | Changed: a third end, the crash path, which writes no stop (WP3.7) |
| The stop verbs | `cli/overseer/StopCommand.ts:13-20`, `cli/overseer/OverseerStop.ts:15-38` | Kept; they reach the presence ending through `closeTheStoppedOverseer` |
| `start`: starts the Overseer detached unless one is live, waits until its API answers, refuses `overseer-down` when no Baton is live after it | `cli/overseer/StartCommand.ts:34-69`, `:51` | Changed: the option `--started-by user\|login-item`, `user` when absent, and the start gate before the spawn (WP3.8) |
| `oversee` and its subcommands, `oversee status` | `cli/overseer/OverseerCommand.ts:63-84`, `:142-172`, `:174-180` | Changed: `--started-by` on the foreground entry, presence in `oversee status` (WP3.8, WP3.13) |
| `oversee resume` (`overseer-resume`): undoes a pause | `cli/overseer/OverseerCommand.ts:128-139` | Kept until stage 9 renames it `unpause` (R7) |
| The detached start shared by `oversee --detach`, `start` and `open` | `cli/overseer/DetachedOverseerStart.ts:36-41` | Changed: runs the start gate first and carries the start origin (WP3.8) |
| The login items: macOS `oversee --detach`, Linux `oversee` in the foreground, Windows `oversee --detach --repository <path>` | `cli/setup/DarwinAutostart.ts:17-19`, `cli/setup/LinuxAutostart.ts:21`, `cli/setup/WindowsAutostart.ts:59` | Changed: macOS and Windows run `start --started-by login-item`, Linux `oversee --started-by login-item` (WP3.8, R8) |
| The registry's `overseer` key, written at start, `removed` at stop; the write never fails a command and is async under the registry lock | `src/services/tracker/MonitorRegistration.ts:26-48`, `:135` | Changed: a `presence` key beside it (WP3.8) |
| Gaia reads only the keys it names from a board's registry entry, and reads no board file | `apps/gaia/src/adapters/forge-registry/utils/RegistryMapUtil.ts:32-59`, `apps/gaia/src/features/fleet/utils/ForgeLookUtil.ts:29` | Kept; it passes over the new `presence` key until stage 6 reads it |
| A lost Watcher's cause: foreign boot `reboot`, a killed surviving child `watcher-lost`, else `agent-crashed` | `src/services/overseer/Regrouping.ts:96-124` | Replaced in stage 2 (N1). This stage maps the start's kind onto children that are gone with no end of their own (WP3.9) |
| Leftover worktrees: folders no live job and no branch owns | `src/services/overseer/Regrouping.ts:200-216` | Kept; a released group's worktree, which its branch still owns, is cleaned up by WP3.15 |
| `DrivePass.regroup` wakes one forced pass after regrouping | `src/services/overseer/DrivePass.ts:1578-1587` | Changed: receives the start's classification and applies the reconcile causes (WP3.9) |
| A pass that throws is logged ("A drive pass failed and waits for the next wake-up") and waits for the next wake-up | `src/services/overseer/DrivePass.ts:1553-1566` | Changed: the lock's two conditions are an abandoned pass, counted, with a notice after three in a row; every other throw runs the crash path (WP3.11) |
| The Overseer's notices, derived each pass | `src/services/overseer/DrivePass.ts:280-301`, `noticesOf` at `:997-1025` | Changed: the notice `passes-abandoned` (WP3.11) |
| The notices worded for `oversee status`, and for the Bridge header and the monitor snapshot's `{ kind, text }` | `cli/overseer/OverseerWording.ts:1044-1073`, `src/shared/monitor/utils/NoticeWordingUtil.ts:43-72` | Changed: the notice `passes-abandoned` (WP3.11) |
| The refusal kinds a pass can throw: the lock's `tracker-lock-held` and `lock-taken-over` among the others | `src/shared/OperationRefusal.ts:14-44` | Kept. R1 names the two expected ones |
| The tracker lock frees a holder whose process is gone or whose stamp is more than `LOCK_STALE_MILLISECONDS` old | `src/services/tracker/TrackerLock.ts:102-114`, `:213-223` | Kept here |
| The interruption causes | `src/lib/tracker-model/@types/Job.ts:83-91`, `src/lib/tracker-model/constants/JobStates.ts:73-82` | Changed: `forge-stopped` and `forge-crashed` added (WP3.1) |
| `CRASH_INTERRUPTION_CAUSES`, `isCrash` | `src/lib/tracker-model/constants/JobStates.ts:91`, `src/lib/tracker-model/Playbook.ts:148-150` | Kept |
| The Playbook's resume steps for interrupted jobs, with the pipeline agent's own hold | `src/lib/tracker-model/Playbook.ts:466-489` | Changed: driven by the resume policy table (WP3.2) |
| Past the crash bound a job is `replace-job`, ended `replaced` | `src/lib/tracker-model/Playbook.ts:409-412`, `:482` | Changed: past the bound the job waits (WP3.2) |
| An interrupted product owner resumes; past the bound `refresh-intake` or `await-answer` | `src/lib/tracker-model/Playbook.ts:414-425` | Changed: follows the policy table; past the bound it waits, or waits `awaiting-answer` with a question open (WP3.2) |
| A red handoff's own resume bound | `src/lib/tracker-model/Playbook.ts:455-465` | Kept |
| The holds on every resume: usage limit, install change, unset pipeline, outage, refused key; a pause holds new work only | `src/lib/tracker-model/Playbook.ts:760-771` | Kept; an instructed resume obeys them too |
| Two counted crashes on different tickets open `outage` | `src/lib/tracker-model/Playbook.ts:184-200` | Kept |
| `job-lost` after two `replaced` in a row | `src/lib/tracker-model/Playbook.ts:202-212`, `:512-522` | Kept; the crash bound feeds it no more (Traps) |
| `resume-job` and `replace-job` steps | `src/lib/tracker-model/@types/PlaybookStep.ts:46-52` | Changed: `resume-job` carries whether it is instructed (WP3.2) |
| `Board.applyPlaybookStep` moves `resume-job` to `running` (through `Board.moveJob`, `:467-469`) and ends `replace-job` `replaced` | `src/lib/tracker-model/Board.ts:824-882`, `:849-852` | Changed: an instructed resume (WP3.2) |
| `Jobs.moveJob` counts a crash resume in `crashResumes` and logs `job-resumed` | `src/lib/tracker-model/Jobs.ts:138-150` | Changed: an instructed resume sets `crashResumes` to 0 (WP3.2) |
| `Jobs.interruptJob` logs `job-interrupted` | `src/lib/tracker-model/Jobs.ts:152-160` | Kept |
| The bound `JOB_RESUMES_BEFORE_FRESH: 2` | `src/shared/constants/LifecycleLimits.ts:12`, `src/lib/tracker-model/@types/LifecycleLimits.ts:7` | Renamed `CRASH_RESUMES_BEFORE_WAITING`, still 2 (WP3.2) |
| The log record schema: `job-interrupted`, `job-resumed`, `overseer-started`, `overseer-stopped` | `src/lib/tracker-model/constants/LogRecordSchema.ts:293-294`, `:325-326`; the field shapes at `:19-80`, among them `optional-count` and `optional-flag` | Changed: `start-classified`, `job-resume-instructed`, `job-line-lost`, `ticket-interrupted-hold-lifted` added (WP3.1, WP3.3, WP3.10) |
| The log wording of `overseer-started` and `overseer-stopped` | `src/adapters/utils/LogUtil.ts:293-296` | Changed: words the new records (WP3.1, WP3.3, WP3.10) |
| Each log field shape's copy, a record keyed by every shape | `src/adapters/log/utils/LogRecordMappingUtil.ts:53-115` | Changed: the two new value shapes (WP3.1) |
| `FailedPassUtil`: a ticket's "failed passes" are failed job outcomes, counted per entity and stage, and reset by `ticket-unheld` | `src/lib/tracker-model/utils/FailedPassUtil.ts:1-6`, `:74-75` | Kept. The name is taken, so an abandoned pass is never called a failed pass (Traps) |
| A failed vendor resume ends the job `replaced` and opens `resume-failed` (a merge agent opens none) | `src/services/overseer/JobResumption.ts:102-121` | Kept |
| `job fresh` on a job with no session ends it `replaced`, so the next attempt launches | `src/lib/tracker-model/JobControls.ts:51-76`, `src/services/control/JobControls.ts:60-63` | Kept. It is the instruction "start fresh instead" for a waiting job |
| The control service's appliers | `src/services/control/ControlService.ts:27-43` | Changed: `RESUME_CONTROLS` added (WP3.3) |
| The role policy for relayed commands: allowlists per role, the Assistant only an incident move | `src/services/control/Bouncer.ts:59-99`, `:202-211` | Changed only if it would admit the new kind for an agent role (WP3.3) |
| The command table: `status`, `job`, `open`, `oversee`, `start`, `stop` among the verbs | `cli/CommandTable.ts:11-48` | Changed: `resume` and `crash-log` (WP3.3, WP3.13) |
| The command route takes every control kind | `cli/overseer/routes/CommandRoute.ts:52-55` | Kept; it takes the new kind with no change |
| The read routes; a served `/api/v<n>/<endpoint>` is answered by its unversioned route, the query kept | `src/services/overseer/OverseerServer.ts:535-552`, `:601-619` | Changed: `presence` and `crash-log` (WP3.12) |
| The top-level `status` writes a notice to standard error for an unreadable hold journal | `cli/tracking/status/StatusCommand.ts:39-43` | Changed: the same kind of notice for a forge off after a crash (WP3.13) |
| The command kinds Gaia may send, nine of them | `packages/forge-contracts/@types/ForgeControlCommand.ts:9-18`; forge's pin `CONTROL_CONTRACT_KINDS` at `src/shared/constants/OverseerApiContracts.ts:26` | Changed: `interrupted-work-resume` (WP3.3) |
| The forge system version 1.18 | `packages/forge-contracts/constants/ForgeSystemVersions.ts:40-43` | Raised by one minor over what stage 2 left (WP3.3, WP3.12) |
| The compatibility registry's endpoints, each dated `introducedIn: FIRST_VERSIONED_FORGE` | `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:16-49` | Changed: `presence` and `crash-log` at version 1, dated truly (WP3.12) |
| The process supervision port; no boot time | `src/lib/process-identity/ProcessSupervision.ts:39-70` | Changed: `bootStartedAtEpochSeconds` (WP3.4) |
| macOS reads the boot through `sysctl kern.bootsessionuuid` | `src/lib/process-identity/DarwinProcessIdentity.ts:14-15`, `:49` | Changed: also reads `kern.boottime` (WP3.4) |
| `sameBoot`: an unreadable boot identity reads as the same boot as any other | `src/lib/process-identity/ProcessIdentity.ts:44-47` | Kept |
| Exclusive whole-file creation that answers `already-exists` | `src/lib/atomic-file/AtomicFile.ts:165` | Kept; the crash log uses it (WP3.7) |
| An orphaned merge-in or refresh is aborted, its slot freed and requeued | `src/services/overseer/Airlocks.ts:792-797` | Changed: after a start that waits, the ticket is held `interrupted:merge` instead (WP3.9) |
| An Airlock agent that ended otherwise leaves the slot orphaned and requeued | `src/services/overseer/Airlocks.ts:990-1007` | Changed the same way (WP3.9) |
| A constitution commit cut short, or whose commit does not read back, ends `orphaned` | `src/services/overseer/Airlocks.ts:1443-1450`, `:1483-1492` | Changed the same way (WP3.9) |
| `freeSlot` restores the worktree to the slot's start tip, then ends the jobs in a hold | `src/services/overseer/Airlocks.ts:737-747` | Kept; reconcile reuses its restore (WP3.9) |
| A parked candidate gives up its slot | `src/services/overseer/Airlocks.ts:1334-1344` | Kept; the `interrupted:` hold is read beside `parked:` (WP3.9) |
| The release cleanup after the landing hold: a refresh's worktree goes, a released group's worktree and branch go | `src/services/overseer/Airlocks.ts:1222-1229`, called at `:1261-1263`; the released group read at `:1257` | Changed: run again at start for a landed release whose group branch still stands (WP3.15) |
| A shared repository's landing appends the landing journal line after the fast-forward; a rerun that finds the commit landed answers `already-landed` and appends nothing | `src/services/lifecycle/Landing.ts:109-118`, `:160-171` | Changed: an `already-landed` rerun appends the missing line (WP3.15) |
| A held ticket is no merge candidate: the selection keeps `in-review` tickets with no hold | `src/lib/tracker-model/AirlockClaims.ts:166-169` | Kept; an `interrupted:` hold keeps its ticket out of the queue with no change (WP3.9) |
| A held or merge-queued ticket never launches | `src/lib/tracker-model/Playbook.ts:387-397` | Kept |
| `ticket-unheld` starts a fresh attempt: it resets the builder's return from review and from its needs | `src/lib/tracker-model/Playbook.ts:309-339` | Kept; lifting an `interrupted:` hold does not log it (R5) |
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
| WP3.7 The crash log and the crash path | WP3.5 | WP3.3, WP3.4, WP3.6 |
| WP3.8 The start gate, the start origin and the registry's presence | WP3.4, WP3.6, WP3.7 | none: alone |
| WP3.9 Reconcile at start | WP3.2, WP3.8 | none: alone |
| WP3.10 Lost lines wait | WP3.9 | WP3.15 |
| WP3.11 The abandoned pass, and a crash for anything else | WP3.9 | WP3.13, WP3.15 |
| WP3.12 Presence and the crash log on the read API and in the contract | WP3.3, WP3.11 | WP3.13, WP3.15 |
| WP3.13 The CLI path: status, crash log, resume | WP3.8 | WP3.11, WP3.12, WP3.15 |
| WP3.15 The landing steps a stop leaves undone | WP3.9 | WP3.10, WP3.11, WP3.12, WP3.13 |
| WP3.14 The crash matrix | every other package | none: alone, last |

Packages that run in parallel touch no common file: WP3.1 and WP3.2 stay in `src/lib/tracker-model/`,
`src/shared/constants/` and the log tables named below (`src/adapters/`, `MonitorSnapshotAssembly.ts`), which no package
beside them touches; WP3.4 stays in `src/lib/process-identity/`; WP3.5 to WP3.7 create new files under
`src/services/overseer/`; WP3.5 and WP3.7 both touch `cli/overseer/OverseerForeground.ts` (and WP3.7 the serving
`ensureTalos` call site of stage 2's pass), and WP3.7 runs after WP3.5. WP3.10 changes `JobLaunch.ts` and the model's
`Board.ts`, `Jobs.ts` and log tables; WP3.15 changes only `Airlocks.ts`, `src/services/lifecycle/Landing.ts` and their
specs. WP3.11 changes `DrivePass.ts`, `cli/overseer/OverseerWording.ts`, `src/shared/monitor/utils/NoticeWordingUtil.ts`
and creates `AbandonedPassReason.ts`; WP3.12 changes `OverseerServer.ts`, the route record and
`packages/forge-contracts`; WP3.13 changes `cli/overseer/OverseerCommand.ts`, `cli/tracking/status/StatusCommand.ts`,
`cli/CommandTable.ts`, `cli/HelpText.ts` and `docs/cli.md`, creates `cli/crash-log/`, and words its own lines in
`OverseerCommand.ts` and `cli/crash-log/`, never in `OverseerWording.ts`. Each package ends with the root's `bun run
verify` green, and a package that changes `DrivePass.ts`, `OverseerForeground.ts` or `Playbook.ts` runs alone among
packages that touch the same file.

Every package follows the repository's rules: `apps/forge/CLAUDE.md`, the owner's conventions
(`~/coding-conventions-new.md`), full names, one purpose per file, specs beside their modules opening with a docblock,
no fixed sleeps, and `docs/cli.md` updated in the same package when a command, flag, file format or exit code changes.
Two tables are keyed by every member, so the type checker asks for a row in the same package: a new log record kind
takes its wording in `src/adapters/utils/LogUtil.ts` and its category in `ACTIVITY_CATEGORY_OF_KIND`
(`src/services/overseer/MonitorSnapshotAssembly.ts:72`, what the monitor's activity shows; `null` keeps it out); a new
refusal (a `BoardRefusal` reason or an `OperationRefusal` detail kind) takes its sentences in
`src/adapters/utils/OperationRefusalWordingUtil.ts`, a sample in `OperationRefusalWordingUtil.apiEveryDetail.spec.ts`
and a row in `apps/forge/docs/reference/refusals.md`. That holds for WP3.1, WP3.3 and WP3.10 (records) and WP3.2, WP3.3,
WP3.7, WP3.8 and WP3.13 (refusals).

### WP3.1 Causes, the resume policy table and the log vocabulary

**Purpose.** Name every interruption and its resume policy in one table, and add the log records the later packages
write, with no change of behaviour yet.

**Files.**

- Change `apps/forge/src/lib/tracker-model/@types/Job.ts`: `InterruptionCause` gains `forge-stopped` and
  `forge-crashed`; its docblock says what each means.
- Change `apps/forge/src/lib/tracker-model/constants/JobStates.ts`: both causes in `INTERRUPTION_CAUSES`.
- Create `apps/forge/src/lib/tracker-model/constants/ResumePolicy.ts`: the table, beside the other tracker-model
  vocabularies, because the Playbook, the presence assembly and the CLI all read it, and the tracker model stays
  DOM-safe and free of I/O.
- Create `apps/forge/src/lib/tracker-model/constants/ResumePolicy.spec.ts`.
- Change `apps/forge/src/lib/tracker-model/@types/LogRecord.ts` and
  `apps/forge/src/lib/tracker-model/constants/LogRecordSchema.ts`: the records `start-classified` and
  `job-resume-instructed` (Interfaces introduced), with their field value kinds.
- Change `apps/forge/src/adapters/log/utils/LogRecordMappingUtil.ts`: a copy for each new value shape in
  `COPY_FOR_FIELD_SHAPE` (`:53-115`), which the compiler asks for once the shapes join `LogFieldShape`.
- Change `apps/forge/src/adapters/utils/LogUtil.ts` and `ACTIVITY_CATEGORY_OF_KIND`: the wording and category of both
  records, and the wording of the two new causes.
- Change `apps/forge/docs/cli.md`: the log records and the causes, in the section that lists them.
- Change `packages/forge-contracts/@types/MonitorSnapshotDocument.ts` and `MonitorSnapshotAssembly.ts`: stage 2's
  `MONITOR_INTERRUPTION_CAUSES` gains both causes and its cause record maps them, so the contract keeps one cause union.

**What to do.**

1. Add the two causes to the union and to `INTERRUPTION_CAUSES` in the same order as the union, and to stage 2's
   contract union `MONITOR_INTERRUPTION_CAUSES` (WP2.11). Neither joins `CRASH_INTERRUPTION_CAUSES`.
2. Write `ResumePolicy.ts` exporting `type ResumePolicy` and `RESUME_POLICY_OF_CAUSE`, a frozen
   `Readonly<Record<InterruptionCause, ResumePolicy>>` with exactly the rows of Interfaces introduced, among them stage
   2's `talos-paused`, `lease-ended` and `network-outage` (N2).
3. Export from the same file `WAITING_POLICIES`, the policies that never resume by themselves:
   `waits-for-instruction` and, once its bound is spent, `resumes-twice-then-waits`.
4. Add the two log records to the record union and to `LogRecordSchema` with `subject` and field kinds:
   `start-classified` with subject `board`, `job-resume-instructed` with subject `job`. Add the value kinds the schema
   needs (`start-kind`, `start-origin`) the way `overseer-stop-reason` is added (`LogRecordSchema.ts:50`,
   `@types/LogRecord.ts:82`, `LogRecordMappingUtil.ts:53-115`). The optional fields use the shapes that exist:
   `optional-count` for `previousGeneration` and `crashLogNumber`, `optional-flag` for `crashSuspected`.
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
twice and then waits; an instructed resume gives it its two automatic restarts back (decisions 30 and 40).

**Files.**

- Change `apps/forge/src/lib/tracker-model/Playbook.ts`.
- Change `apps/forge/src/lib/tracker-model/@types/PlaybookStep.ts`: `resume-job` gains `instructed: boolean`; the
  comment on `replace-job` says it is only for an Assistant that went down.
- Change `apps/forge/src/lib/tracker-model/Board.ts` (`applyPlaybookStep`, `:849-852`, and `moveJob`, `:467-469`) and
  `apps/forge/src/lib/tracker-model/Jobs.ts` (`moveJob`, `:138-150`): the instructed resume, and the methods
  `instructResume`, `instructResumeOfEveryWaitingJob` and `instructResumeOfEveryNetworkOutageJob`, which log
  `job-resume-instructed`.
- Change `apps/forge/src/lib/tracker-model/constants/JobStates.ts`: delete `INTERRUPTION_CAUSES_HELD_FROM_RESUMING`
  where stage 2 left it (N4).
- Change `apps/forge/src/lib/tracker-model/@types/LifecycleLimits.ts` and
  `apps/forge/src/shared/constants/LifecycleLimits.ts`: rename `JOB_RESUMES_BEFORE_FRESH` to
  `CRASH_RESUMES_BEFORE_WAITING`, value 2, and every reader (`git grep -n JOB_RESUMES_BEFORE_FRESH apps/forge`, which
  includes `src/lib/tracker-model/testing/LifecycleWorld.ts:238`, `testing/LifecycleFixtures.ts:35`, the comments in
  `@types/PlaybookStep.ts:47` and `src/services/overseer/UsageLimits.ts:42`, and the specs that spell the limits out,
  among them `src/services/tracker/TrackerReader.stageCounts.spec.ts:48`).
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
3. Rewrite `crashBoundStepsOf` (`:473-489`) around the policy, keeping its holds exactly:
   - `forced-stop-refused`: no step, as today (`:475`).
   - `handoff-red`: `redHandoffStepsOf`, unchanged.
   - An Assistant (`SESSION_JOB_KINDS` holds `assistant` and `product-owner`; split it so only `assistant` keeps
     `replace-job`): `replace-job`, unchanged. Stage 8 turns the Assistant off by default.
   - `resumes-by-itself`, or `resumes-twice-then-waits` with resumes left: `resume-job` with `instructed: false` under
     today's holds (`resumesAreHeld`, `jobResumeIsHeld`, `jobAwaitsAnAnswer`; the pipeline agent's own hold,
     `pipelineAgentResumesAreHeld`, `:483`, which neither the missing pipeline nor the pause holds).
   - `waits-for-instruction` (a spent crash bound included): a `resume-job` with `instructed: true` only when
     `resumeIsInstructed` is true, under the same holds; otherwise no step.
   - `resumes-once-decision-answered`: today's behaviour exactly; `authenticationHolds` holds every resume until the
     decision is answered, then it resumes by itself.
   - `never-resumes`: no step.
4. Rewrite `productOwnerStepsOf` (`:418-425`): `awaiting-answer` is unchanged; an interrupted product owner follows the
   same policy; past the crash bound with a question open it moves `await-answer` (no process, no work); past the bound
   with no question it waits for an instruction, and an instruction resumes it by id. `refresh-intake` stays only for an
   `awaiting-answer` product owner whose questions are answered.
5. Delete `crashResumesAreSpent`'s use as a `replace-job` trigger; keep the function for `resumePolicyOf`. Delete stage
   2's `INTERRUPTION_CAUSES_HELD_FROM_RESUMING` and its reads in `crashBoundStepsOf` and `productOwnerStepsOf`: the
   table's `network-outage` row says the same once.
6. In `Board.applyPlaybookStep`, `resume-job` calls `this.moveJob(step.jobId, 'running', at, { instructed:
   step.instructed })`, and `Board.moveJob` passes the option on to `this.jobRules.moveJob`. In `Jobs.moveJob`, an
   instructed resume sets `crashResumes` to 0 instead of adding one (decision 40), and logs `job-resumed` with a field
   `instructed: true` only when instructed (an optional field written only when set, as the stored-file rules ask). Add
   `instructed` to the `job-resumed` schema entry as an optional flag.
7. Add `Board.instructResume(jobId, at)`: refuses with `BoardRefusal` reason `job-not-interrupted` unless the job is
   `interrupted`; logs `job-resume-instructed` with the job's `childInstance` (stage 2's name, WP2.16). Add
   `Board.instructResumeOfEveryWaitingJob(at)`, which logs one record for every interrupted job whose policy waits, and
   `Board.instructResumeOfEveryNetworkOutageJob(at)`, which logs one for every job interrupted `network-outage`. Each
   answers the logged records, and an empty list when none applies.

**Specs.**

- `Playbook.spec.ts`: one claim per policy row: a job interrupted `reboot` gets no step; after `job-resume-instructed`
  it gets `resume-job` with `instructed: true`; an instruction logged before the newest interruption does not count; a
  job interrupted `agent-crashed` with `crashResumes` 0 and 1 gets `resume-job`, with 2 gets nothing, and with 2 plus an
  instruction gets an instructed resume; a job interrupted `lease-ended` or `network-outage` gets no step until an
  instruction; an answered question of a job interrupted `reboot` resumes it; usage limit, install change, outage and a
  missing pipeline still hold an instructed resume; a product owner past the bound with no question waits and with one
  moves `await-answer`; an Assistant interrupted `reboot` is still replaced.
- `Board.jobs.spec.ts`: an instructed resume sets `crashResumes` to 0 and logs `instructed: true`, and the job is then
  resumed twice by itself after two more crashes; `instructResume` of a running job is refused `job-not-interrupted`;
  `instructResumeOfEveryWaitingJob` logs one record per waiting job and none for a job that resumes by itself;
  `instructResumeOfEveryNetworkOutageJob` logs one per `network-outage` job only.
- `src/lib/tracker-model/testing/LifecycleWorld.ts`: its crash-resume invariant (`:233-238`) reads
  `CRASH_RESUMES_BEFORE_WAITING` and counts only resumes not instructed; the world specs that walk the policy
  still pass.

**Done when.** `bun run verify` at the root passes; in `apps/forge/`, `bun test src/lib/tracker-model` passes.
`git grep -n "JOB_RESUMES_BEFORE_FRESH\|INTERRUPTION_CAUSES_HELD_FROM_RESUMING" apps/forge` finds nothing.

### WP3.3 The resume command and the verb `resume`

**Purpose.** The user's instruction for one job, one ticket, everything, or everything that ended on a network outage,
through every surface that applies commands (decision 41).

**Files.**

- Change `apps/forge/src/shared/@types/ControlCommand.ts`: the kind `interrupted-work-resume` (Interfaces introduced).
- Create `apps/forge/src/services/control/ResumeControls.ts`: `RESUME_CONTROLS`, one applier, beside the other
  appliers of the control service.
- Create `apps/forge/src/services/control/ResumeControls.spec.ts`.
- Change `apps/forge/src/services/control/ControlService.ts`: spread `RESUME_CONTROLS` into `CONTROL_APPLIERS`.
- Change `apps/forge/src/services/control/Bouncer.ts` only if a role set would admit the kind; it is admitted for no
  agent role.
- Create `apps/forge/cli/resume/ResumeCommand.ts` and `apps/forge/cli/resume/ResumeCommand.spec.ts`: a folder of its
  own, as `cli/CommandTable.spec.ts` asks of a new command.
- Change `apps/forge/cli/CommandTable.ts` and `apps/forge/cli/HelpText.ts`.
- Change `apps/forge/src/lib/tracker-model/TicketSettings.ts` (beside `unholdTicket`, `:152`) and
  `apps/forge/src/lib/tracker-model/Board.ts` (beside `unholdTicket`, `:1407-1409`): `liftInterruptedHold(ticketId,
  at)`, and the record `ticket-interrupted-hold-lifted` in `@types/LogRecord.ts`, `constants/LogRecordSchema.ts`,
  `src/adapters/utils/LogUtil.ts` and `ACTIVITY_CATEGORY_OF_KIND`.
- Change `apps/forge/src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts`: `INTERRUPTED_HOLD_PREFIX =
  'interrupted:'` beside `PARKED_HOLD_PREFIX` (`:71`).
- Change `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts`, its sample in
  `OperationRefusalWordingUtil.apiEveryDetail.spec.ts` and `apps/forge/docs/reference/refusals.md`: the refusals
  `job-not-interrupted` and `ticket-not-interrupted`.
- Change `packages/forge-contracts/@types/ForgeControlCommand.ts` and
  `packages/forge-contracts/constants/ForgeSystemVersions.ts`: the kind with a target type of the contract's own, and
  the current minor raised by one.
- Change `apps/forge/docs/cli.md` and `apps/forge/docs/reference/overseer-api.md`: the verb and the command kind.

**What to do.**

1. Add `{ kind: 'interrupted-work-resume'; target: ResumeTarget }` to `ControlCommand`, with `ResumeTarget` as in
   Interfaces introduced.
2. In `ResumeControls.ts` apply it in the hold:
   - `{ jobId }`: `board.instructResume(jobId, at)`.
   - `{ ticketReference }`: resolve the ticket as `TicketControls` resolves references (`ControlTicketLookup.ts`); for
     its one job, if interrupted, `instructResume`; if the ticket holds a hold starting with `INTERRUPTED_HOLD_PREFIX`,
     lift it with `board.liftInterruptedHold`. Refuse `ticket-not-interrupted` when neither applies.
   - `'all'`: `instructResumeOfEveryWaitingJob` plus the lift of every ticket holding an `interrupted:` hold.
   - `'network-outage'`: `instructResumeOfEveryNetworkOutageJob`.
   - With nothing to resume, `'all'` and `'network-outage'` answer `{ changed: false }`, so the service reports
     `nothing-to-do`, a success: Gaia's control is always clickable and sends the target to every forge (decision 35).
   - `liftInterruptedHold` (R5) refuses `ticket-not-interrupted` unless the hold starts with `INTERRUPTED_HOLD_PREFIX`,
     deletes the hold and logs `ticket-interrupted-hold-lifted` with the lifted hold. `ticket-unheld` is not logged: it
     resets the failed passes (`FailedPassUtil.ts:74-75`), the builder's return from review (`Playbook.ts:313-323`) and
     the return from its needs (`:329-339`), and a hold a crash put on is no decision of the user about the ticket.
     `ticket unhold <T>` stays a person's unhold, with its resets.
3. Write `cli/resume/ResumeCommand.ts`: `resume <J|T> [--json]`, `resume --all [--json]` and `resume --network-outage
   [--json]`. A job id starts with `JOB_ID_PREFIX` (`J`); anything else is a ticket reference. Exactly one of a
   positional, `--all` and `--network-outage`. It records through `recordIncidentMove` the way `job fresh` does
   (`cli/jobs/JobCommand.ts:172-185`), so it works with the forge up or down, and prints "Recorded. The forge carries it
   out at once when it is up, else when it starts." `hatchWhenUnderJob` relays it under a job, where the Bouncer refuses
   it.
4. Add the verb to `cli/CommandTable.ts` and a block to `cli/HelpText.ts` worded "resume interrupted work"; the help of
   `oversee resume` says it undoes a pause (R7).
5. In the contract declare `ForgeResumeTarget` with its own members (Interfaces introduced) and add the kind to
   `ForgeControlCommand`; add it to forge's pin, `CONTROL_CONTRACT_KINDS` (`OverseerApiContracts.ts:26`, nine kinds
   today), whose spec `cli/ControlContract.spec.ts` holds forge's `ResumeTarget` and the contract's equal. Raise
   `FORGE_SYSTEM_VERSIONS.current.minor` by one over the value stage 2 left; the change only adds.
6. In `docs/cli.md`, document the verb, its refusals and exit codes; in `docs/reference/overseer-api.md`, the command.
   The frozen surface (`cli/FrozenInstalledSurface.json`, per `INSTALL_VERSION`, 36 today) lists only the commands and
   flags the installed files name (`cli/InstalledSurface.spec.ts:1-9`), so a new verb that no installed file names bumps
   nothing. Only if this package makes an installed file (a skill, the Assistant brief, the reference) name `resume`:
   add a key for a bumped `INSTALL_VERSION` and run `bun run record src/services/overseer/InstallChangeWatch.ts`, as
   `apps/forge/CLAUDE.md` asks.

**Specs.**

- `ResumeControls.spec.ts`: a job target logs one `job-resume-instructed`; a ticket target lifts an `interrupted:merge`
  hold, logging `ticket-interrupted-hold-lifted` and no `ticket-unheld`, and instructs its interrupted job; `all` covers
  both; `network-outage` instructs only the jobs of that cause; a running job is refused `job-not-interrupted`; an
  unknown ticket is refused as `TicketControls` refuses one; nothing interrupted is `nothing-to-do` for `all` and for
  `network-outage`.
- `ResumeCommand.spec.ts`: the verb parses `J12`, `12`, `--all` and `--network-outage`, refuses two of them together,
  and refuses extra positionals with the usage.
- `cli/CommandTable.spec.ts`, `cli/HelpText.spec.ts`, `cli/ControlContract.spec.ts`,
  `cli/overseer/routes/CommandRoute.controlContract.spec.ts`: updated for the new kind and verb.
- `src/services/control/Bouncer.spec.ts`: every agent role is refused the kind.
- `src/lib/tracker-model/Board.ticketSettings.spec.ts`: `liftInterruptedHold` refuses a `parked:` hold and a ticket with
  no hold; after a lift, `FailedPassUtil.failedPassesOf` reads the same count as before it.
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.spec.ts` stays green; the contract package's own specs
  pass.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/control cli/resume
cli/CommandTable.spec.ts cli/HelpText.spec.ts` passes; Gaia's `check` still warns that `SUPPORTED_FORGE_VERSION` (1.1
today, `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9`) is behind forge's current version, and
fails nothing.

### WP3.4 Boot start time in the process supervision port

**Purpose.** The rule for a crash suspected before a reboot needs the time the current boot started; no port reads it
today.

**Files.**

- Change `apps/forge/src/lib/process-identity/ProcessSupervision.ts`: `bootStartedAtEpochSeconds: () => number | null`.
- Change `apps/forge/src/lib/process-identity/DarwinProcessIdentity.ts`: read `sysctl -n kern.boottime` through the same
  injected primitive that reads `kern.bootsessionuuid` (`:14-15`, `:49`), and parse its `sec = <n>` field.
- Change `apps/forge/src/lib/process-identity/LinuxProcessIdentity.ts`: read the `btime` line of `/proc/stat`.
- Change `apps/forge/src/lib/process-identity/WindowsProcessIdentity.ts` and
  `apps/forge/src/lib/process-identity/UnsupportedProcessSupervision.ts`: answer `null` (the rule is then off).
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
it ended by a stop, a handover or a crash it recorded itself.

**Files.**

- Create `apps/forge/src/services/overseer/Presence.ts`: reading and writing `presence.json` and `heartbeat.json`, one
  module because both describe one generation's presence and nothing else writes them.
- Create `apps/forge/src/services/overseer/Presence.spec.ts`.
- Create `apps/forge/src/services/overseer/constants/PresenceLimits.ts`: the constants of Interfaces introduced.
- Change `apps/forge/src/services/overseer/OverseerFiles.ts`: `presenceFilePath`, `heartbeatFilePath` and
  `crashLogDirectory` under `overseerDirectory`.
- Change `apps/forge/cli/overseer/OverseerForeground.ts`: the ending `stopped` in `closeTheStoppedOverseer` (`:169-176`)
  and the ending `handed-over` in `release` (`:651-660`); the heartbeat write handed to the lease renewal as its
  `onRenewed` hook (N5). `LeaseRenewal.ts` itself does not change.

**What to do.**

1. Define `PresenceRecord` and `HeartbeatRecord` exactly as in Interfaces introduced. Write each through
   `writeFileAtomically` (`src/lib/atomic-file/AtomicFile.ts:103`). Read each into a verdict: `{ verdict: 'absent' }`,
   `{ verdict: 'unreadable', reason }` (a malformed file, a version other than the current one) or
   `{ verdict: 'read', record }`. Never throw on a read.
2. Export `Presence` as a frozen object: `readPresence`, `writeStartedPresence`, `writeEnding`, `readHeartbeat`,
   `writeHeartbeat`, `recordAbandonedPass`, `recordCompletedPass`.
3. `writeStartedPresence` is called by WP3.8; in this package call it from `startServing` right after the Baton is
   acquired (`OverseerForeground.ts:526`), with `startOrigin` `user` and `startClassification` `null` until WP3.8 fills
   them. It overwrites the previous generation's record: the classification has already read it (WP3.8 orders this).
4. `writeEnding(files, generation, ending, at)` writes the ending only when the stored record's generation is
   `generation`; a newer generation's record is never touched. The endings are `stopped`, `handed-over` and `crashed`
   (with the crash log's number, `null` when the crash path could not write the log; WP3.7 writes it). Call it with
   `stopped` inside `closeTheStoppedOverseer` before `Baton.release`, and with `handed-over` inside `release` after the
   drive pass stopped and before `overseer-stopped` is logged. Every write is synchronous, so the crash path can make it
   in a dying process.
5. The heartbeat file is written only through the renewal's `onRenewed` hook, at each renewal Talos confirmed, with a
   sequence that rises by one. Since the renewer renews only on progress (decision 38), a heartbeat stands for
   progress, and an idle healthy forge, with no pass in flight, beats every renewal interval (N5). The heartbeat has a
   file of its own: it is rewritten every 15 seconds, and `presence.json`, read and rewritten whole for an ending or an
   abandoned pass, then never races it. During a Baton pass the predecessor keeps renewing until it exits (stage 2's
   WP2.13 item 10), so two processes beat at once: a process writes the heartbeat unless the stored heartbeat's
   generation is above its own and is the generation `presence.json` names, so it never overwrites a successor's beat,
   and the last beat of an ended run never silences a run whose generations started again at 1.
6. No clock comment at the heartbeat write: a heartbeat is one of the real-time measures the clock rules of
   `apps/forge/CLAUDE.md` name, and only code that does not obey them carries a comment.

**Specs.** `Presence.spec.ts` proves: a record round-trips; a missing file is `absent`; a malformed file and another
version are `unreadable`; `writeEnding` for an older generation leaves a newer record untouched; a `crashed` ending
keeps its crash log number, or `null`; the heartbeat sequence rises; a heartbeat of an older generation never
replaces a newer one; an abandoned-pass count rises and a completed pass sets it to 0. A spec of the hook in
`cli/overseer/OverseerForeground.spec.ts`: a confirmed renewal writes one beat, and a withheld renewal writes none. The
stop and handover call sites are proven in `cli/overseer/OverseerCommand.spec.ts` (`closeTheStoppedOverseer` writes
`stopped`; `recordTheHandover`, which `release` calls, writes `handed-over` to presence and the registry).

**Done when.** `bun run verify` passes at the root; `bun test src/services/overseer/Presence.spec.ts` passes in
`apps/forge/`.

### WP3.6 The start classification

**Purpose.** One pure decider that says what kind of start this is, read by the start gate, by `oversee status` and by
the presence document alike.

**Files.**

- Create `apps/forge/src/services/overseer/StartClassification.ts` and
  `apps/forge/src/services/overseer/StartClassification.spec.ts`.

**What to do.**

1. Export `StartClassification.classify(evidence: StartEvidence): StartClassificationVerdict` (Interfaces introduced).
   `StartEvidence` is plain values: the presence reading, the heartbeat reading, the newest Baton reading
   (`Baton.newestBatonOf`, `Baton.ts:98-104`), the reading of Talos's newest record (N10: none, quit, live, or its
   process gone, with the boot it ran in), the current boot identity, the current boot start time or `null`, and the
   start origin with the generation a successor takes over from. It reads no file, process or clock.
2. Apply these rules in this order; the first that matches decides the kind:
   1. No presence record and no Baton generation: `first-start`.
   2. The presence record is `unreadable`: `crashed` (fail closed: a damaged record keeps the forge off).
   3. The newest Baton is dead and its holder is not the process the presence record names, or there is no record (a
      start took the Baton and died before it wrote presence). Judge by the holder, never by the generation: once a stop
      released the last Baton, `Baton.acquire` claims generation 1 again, so a start killed before its presence write
      leaves a Baton below the record's generation. Compare that Baton record's boot with the current one through
      `sameBoot` (`src/lib/process-identity/ProcessIdentity.ts:45`): the same boot is `crashed`; another is
      `machine-went-down`, with no beat of it to judge, since it never beat; an unreadable Baton record names no holder
      and is `crashed`.
   4. The presence ending is `crashed`: `crashed`.
   5. The presence ending is `stopped`: `stopped-on-purpose`.
   6. The presence ending is `handed-over`: `handover` when the origin is `successor` and it takes over exactly that
      generation; otherwise `stopped-on-purpose` (the old generation let go and its successor never took the Baton, a
      Baton pass failure already logged).
   7. No ending: another boot than the record's is `machine-went-down`; the same boot is `crashed`.
3. Talos: a Talos record that is not `quit` whose process is gone, in the current boot, makes any kind but `handover`
   and `first-start` read `crashed` with `crashedComponent: 'talos'` (decision 14: a crash of Talos is a bug, also one
   that happens while the forge is off). A lost Talos of another boot is the machine going down. `crashedComponent`
   is `overseer` for a `crashed` kind that rules 2 to 4 or 7 decided, unless rule 4's recorded crash names Talos.
4. The suspected crash, only for `machine-went-down` with a boot start time and a readable heartbeat: `crashSuspected`
   is true when the boot started more than `HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS` after the last heartbeat. A
   comment at the site says that this compares two recorded instants to judge a fact, against the rule that a clock
   gives no fact, and why: the heartbeat is the only witness of when the process stopped beating. What a suspected crash
   does is the gate's (WP3.8, decision 39).
5. Carry the evidence in the verdict, so `status`, the presence document and the crash log can show why.

**Specs.** `StartClassification.spec.ts`, one claim per rule and one per known misreading, each written as a claim:

- "a first start with no record and no Baton is a first start";
- "a completed stop on record reads as stopped on purpose";
- "a crash the forge recorded itself reads as a crash";
- "a successor taking over the generation that handed over reads as a handover";
- "a successor whose predecessor died during the Baton pass reads as a crash";
- "a record of another boot with no ending reads as the machine going down";
- "the same boot with no ending reads as a crash";
- "a newer Baton than the record, in the same boot, reads as a crash during start";
- "a stop on record followed by a start that took Baton 1 again and died before its presence write reads as a crash";
- "an unreadable presence record reads as a crash";
- "a Talos lost in this boot after a stop on record reads as a crash of Talos";
- "a Talos lost in another boot reads as the machine going down";
- "a crash followed by a reboot reads as the machine going down, with the crash suspected when the heartbeat stopped
  well before the boot" (misreading one, narrowed);
- "a heartbeat that stopped less than the bound before the boot is no suspected crash";
- "a stop on record followed by a killed, wedged process reads as stopped on purpose" (misreading two, kept);
- "an unreadable boot identity reads as the same boot, so a reboot on such a machine reads as a crash" (`sameBoot`'s
  rule, kept).

**Done when.** `bun run verify` passes at the root; `bun test src/services/overseer/StartClassification.spec.ts` passes.

### WP3.7 The crash log and the crash path

**Purpose.** A crash leaves one immutable file that traces it back: the error where there is one, the jobs and their
steps, Talos's children and the tail of the log; and every crash the process itself sees runs one path that records it
and ends the forge (R4).

**Files.**

- Create `apps/forge/src/services/overseer/CrashLog.ts` and `CrashLog.spec.ts`: assembling and writing a crash log, and
  listing and reading the crash logs of a board.
- Create `apps/forge/src/services/overseer/CrashPath.ts` and `CrashPath.spec.ts`: the crash path of a live process.
- Change `apps/forge/cli/overseer/OverseerForeground.ts`: register the crash path's process listeners at the start of
  `runOverseerInTheForeground` and remove them when the function returns; a third end of the foreground loop, `crashed`,
  beside `stopped` and `taken-over` (`:775-804`).
- Change the serving `ensureTalos` call site of stage 2's pass (N6): an answer `started` with `previousTalos: 'lost'`,
  whose lost Talos's record names a process of the current boot (`sameBoot`), is a crash of Talos: run the crash path
  with `component: 'talos'`. A lost Talos of another boot is the machine going down, which reconcile handles (WP3.9).
  The start call site needs no change: WP3.6 classifies a Talos lost before the start, so its sweep at start is
  expected.
- Change `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts`, its sample and
  `apps/forge/docs/reference/refusals.md`: the refusal `forge-crashed`.

**What to do.**

1. `CrashLog.assemble(inputs)` builds the record from plain values: the crashed component, the thrown value where there
   is one (name, message, stack), the classification verdict or `null`, the crashed generation's presence and
   heartbeat, the board's live jobs (id, kind, role, tickets, state, interruption, instance, Airlock phase, event
   cursor), Talos's persisted child records as stage 2 stores them, and the last `CRASH_LOG_TAIL_LINES` lines of
   `overseer.log`. Reading the inputs is the caller's; an input that cannot be read is `null`, never a throw.
2. A crash log is named by a number of its own, never by the Baton generation: once a stop released the last Baton,
   `Baton.acquire` claims generation 1 again, so a generation repeats and a later crash of it would find an older
   log. `CrashLog.writeOnce(files, record)` answers `{ verdict: 'written' | 'already-written', crashLogNumber }`: when
   the newest log records the same crash (the same crashed generation and crashed process; with no process named, the
   same classification), it answers `already-written` with that log's number; otherwise it creates
   `crash-logs/crash-<number>.json`, the number one above the highest log on disk, with `createWholeFileAtomically`
   (`src/lib/atomic-file/AtomicFile.ts:165`), and on `already-exists` (another writer took the number) reads again,
   up to `CRASH_LOG_CREATION_ATTEMPTS`. The file is never rewritten, and two writers of one crash write one log.
   Removing older logs frees no number; once the folder is emptied, numbering starts again at 1, since nothing can
   read a removed log. The Baton generation is the record's `crashedGeneration`, `null` when no presence record or
   Baton names it, and `crashedProcess` is the presence record's process, or else the dead Baton's holder.
3. `CrashLog.list(files)` answers every crash log's number, ascending, and `CrashLog.read(files, number)` a
   verdict. Read the tail of `overseer.log` without loading a large file whole: read the last bytes up to a bound and
   split.
4. `CrashPath.record(context, crash)`, where `crash` names the component and the thrown value, runs in this order, the
   first three steps synchronous so that a dying process makes them: write the crash log once; write the presence ending
   `crashed` with the crash log's number (`null` when the log could not be written); stop the lease renewal, so Talos's
   lease runs out and Talos stops the board's agents at the end of their turn (`lease-ended`, which waits). Then,
   asynchronously and bounded by `CRASH_PATH_REGISTRY_BOUND_MILLISECONDS`: the registry presence `crashed` with the
   crash summary (WP3.8 adds that write; until then this step does nothing). It never throws.
5. A crash the pass sees (WP3.11) and a crash of Talos while serving end the foreground loop with the end `crashed`:
   stop the drive pass and the server as a stop does, write no `stopped` ending, release no Baton, remove no registry
   entry, and throw `OperationRefusal('unrepaired', { kind: 'forge-crashed', component, crashLogPath })`, so the process
   exits as every unrepaired refusal does.
6. Register `process.on('uncaughtException', …)` and `process.on('unhandledRejection', …)`: each runs the crash path
   with the thrown value, removes both listeners, then rethrows the value inside a `queueMicrotask`, so the process
   still dies as an uncaught error does; a timer of `CRASH_PATH_REGISTRY_BOUND_MILLISECONDS` rethrows if the
   asynchronous step has not settled. Never call `process.exit` here (`eslint.config.js` confines it). Before writing
   this, read the pinned `bun-types` in `node_modules` for both events, and prove with a one-off script outside the
   repository that a rethrow from a microtask after the listeners are removed ends a Bun process with a non-zero exit
   code; if it does not, stop and report rather than choose another mechanism.

**Specs.** `CrashLog.spec.ts`: an assembled log holds each input; an input that is `null` is kept `null`; the second
`writeOnce` of the same crash answers `already-written` and leaves the first file byte for byte; a crash of a
generation that came round again gets the next number; removing an older log frees no number, and an emptied folder
starts again at 1; the tail keeps the last
lines of a log longer than the bound and all of a shorter one; `list` ignores a file of another name.
`CrashPath.spec.ts`, on a scratch data folder with a fake lease renewal and a fake registry write: the crash log and the
presence ending `crashed` are written before the registry step; the renewal is stopped; a registry write that never
settles is cut off at the bound; a crash log already there is kept; a crash log that cannot be written leaves the
ending's `crashLogNumber` and the registry's `crashLogPath` `null`. No spec registers a process listener: the
listeners are proven by WP3.14's integration row.

**Done when.** `bun run verify` passes at the root; both specs pass in `apps/forge/`.

### WP3.8 The start gate, the start origin and the registry's presence

**Purpose.** Each start knows who made it, classifies itself before it binds, writes the crash log after a crash it
finds, serves after a crash or a suspected crash only when the user started it, records its kind, and keeps the
registry's presence key true at every start, stop, handover and crash (R2, R8).

**Files.**

- Change `apps/forge/cli/overseer/StartCommand.ts`: the option `--started-by user|login-item`, `user` when absent.
- Change `apps/forge/cli/overseer/OverseerCommand.ts` (`startOverseer`, `:63-84`): the same option on the internal
  foreground entry and on `--detach`. A successor (`--successor-of`) is `successor` and refuses `--started-by`.
- Change `apps/forge/cli/overseer/DetachedOverseerStart.ts` and `OverseerRemote.startDetached`
  (`cli/overseer/OverseerRemote.ts`): run the start gate before the spawn, and pass the origin to the detached child.
- Change `apps/forge/cli/setup/DarwinAutostart.ts` (`:17-19`) and `apps/forge/cli/setup/WindowsAutostart.ts` (`:59`):
  `start --started-by login-item` (Windows keeps `--repository <path>`); `apps/forge/cli/setup/LinuxAutostart.ts`
  (`:21`): `oversee --started-by login-item`; and their specs (`DarwinAutostart.spec.ts`, `LinuxAutostart.spec.ts`,
  `WindowsAutostart.spec.ts`, `Autostart.contract.spec.ts`), with the parse of a stored line where an adapter reads one
  back (`WindowsAutostart.ts:84`).
- Change `apps/forge/cli/overseer/OverseerForeground.ts`: `ForegroundRunRequest` gains `startOrigin`; the gate before
  `startServing`.
- Create `apps/forge/src/services/overseer/StartGate.ts` and `StartGate.spec.ts`: reads the evidence, classifies,
  writes the crash log, answers whether the start may serve. A file of its own, since `OverseerForeground.ts` is the
  CLI's and the gate is a service that `start`, the foreground entry and `oversee status` (WP3.13) read.
- Change `apps/forge/src/services/tracker/MonitorRegistration.ts`: an optional `presence` registration (Interfaces
  introduced), written beside `overseer`, kept as stored when absent from a call.
- Change `apps/forge/src/services/overseer/CrashPath.ts`: its registry step writes `crashed`.
- Change `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts`, its sample and
  `apps/forge/docs/reference/refusals.md`: the refusal `forge-off-after-crash`.
- Change `apps/forge/docs/cli.md`: `--started-by`, the login item lines, the refusal and its exit code, the presence
  files and the registry key.

**What to do.**

1. `StartGate.evidenceOf(ports, files, startOrigin, successorOf)` reads presence, heartbeat, the newest Baton and
   Talos's newest record (N10), and the current boot through `processSupervision.identityOf(process.pid)` and
   `bootStartedAtEpochSeconds()`.
2. `StartGate.admit(...)` classifies, and for `crashed`, or for `machine-went-down` with `crashSuspected`, assembles and
   writes the crash log once (WP3.7; `suspected: true` for the second), reading the board's jobs with
   `requireProgressFile` (no lock: the record is a snapshot shown to a person) and Talos's child records through stage
   2's reader. A `crashed` ending of the crashed generation that names a crash log still on disk is the crash path's
   log, kept as it is; otherwise the gate writes through `CrashLog.writeOnce`. It answers `{ verdict: 'serve',
   classification, crashLogNumber }` or `{ verdict: 'stay-off', classification, crashLogNumber, crashedGeneration,
   crashLogPath }`. It answers `stay-off` exactly when the kind is `crashed`, or `machine-went-down` with
   `crashSuspected`, and the origin is not `user` (decisions 14 and 39).
3. In `runOverseerInTheForeground`, after `requireNoLiveOverseer` and before `startServing`, call the gate. On
   `stay-off`: write the registry presence `crashed` with the crash summary, log one line to `overseer.log`, take no
   Baton, bind no port, contact no Talos, and throw `OperationRefusal('refused', { kind: 'forge-off-after-crash',
   crashedGeneration, crashLogPath, suspected })`. Exit 1, as every refusal.
4. `startTheOverseerDetached` runs the same gate with the origin it will pass, before it spawns, and refuses the same
   way, so `start` and the login item on macOS and Windows print the refusal instead of waiting for a child that stays
   off. The child runs the gate again; it is the authority, and a crash log already written answers `already-exists`.
5. On `serve`: `startServing` writes presence (WP3.5) with the origin and the verdict, and its start hold (`:561-568`)
   logs `start-classified` right after `recordOverseerStarted`. Pass the verdict to the drive pass for WP3.9 through a
   new `DrivePassRequest.startClassification` field.
6. A successor's `predecessor-gone` admission goes through the same gate: it classifies `crashed`, its origin is
   `successor`, so it stays off and reports the Baton pass failure with the refusal's sentence, which says that a start
   by the user brings it back.
7. The registry presence: `serving` with the generation and the process identity at start, `stopped` or `handed-over`
   at the ending, `crashed` with the crash summary from the crash path (WP3.7) and from a start that stays off. A kill
   from outside writes nothing: the stored `serving` entry with a process that answers nothing is what Gaia sees until a
   start classifies it (R3).

**Specs.**

- `StartGate.spec.ts` on a scratch data folder and fake ports: a login-item start after a crash stays off and writes one
  crash log; a login-item start after a suspected crash stays off and writes a log marked suspected; a user start after
  a crash serves and finds the crash log already there; a second refused start writes no second log; after an older
  crash log of the same generation, a crash writes a log of its own under the next number and the verdict names it; a
  start that took Baton 1 again and died before its presence write is logged with that Baton's holder; a login-item
  start after a reboot with a fresh heartbeat serves with no crash log; a start after a Talos lost in this boot stays
  off with a log naming Talos; a successor after `predecessor-gone` stays off.
- `cli/overseer/OverseerForeground.spec.ts`: the start hold logs `start-classified` after `overseer-started`; a refused
  start leaves no Baton generation and no port bound.
- `cli/overseer/StartCommand.spec.ts` (create it when none exists) and `cli/overseer/OverseerCommand.spec.ts`:
  `--started-by` parses, refuses an unknown value and refuses it beside `--successor-of`; a refused gate refuses
  `start` before any spawn.
- The autostart specs: the macOS and Windows lines end `start --started-by login-item` (Windows with its
  `--repository`), the Linux line `oversee --started-by login-item`.
- The registry's specs (`MonitorRegistration.ts` has none of its own: `cli/overseer/OverseerCommand.spec.ts:199` and
  `cli/RegisterWrittenTracker.integration.spec.ts:222` call `registerWithTheMonitor`): the presence key is written in
  each state, and a call without it keeps the stored one.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/overseer/StartGate.spec.ts
cli/overseer cli/setup` passes.

### WP3.9 Reconcile at start

**Purpose.** At a start, every job whose child is gone with no end of its own takes the cause the start's kind names,
and an Airlock left half done is made truthful and held, so nothing interrupted starts again by itself (R6).

**Files.**

- Change `apps/forge/src/services/overseer/DrivePass.ts`: stage 2's start step (today `regroup`, `:1578-1587`) takes the
  classification from `DrivePassRequest.startClassification` (`DrivePassRequest`, `:209`).
- Create `apps/forge/src/services/overseer/ReconcileCauses.ts` and `ReconcileCauses.spec.ts`: the pure map from the
  start's kind to the cause of a child gone with no end of its own.
- Change `apps/forge/src/services/overseer/Airlocks.ts`: the orphan paths, each ending its job with
  `REQUEUE_CAUSES.orphaned` (`:258`): a merge-in or refresh mid-merge at `:792-797`, an Airlock agent at `:990-1007`, a
  constitution commit at `:1443-1450` and `:1483-1492`; and the slot advance at `:1334-1344`. The same paths serve a
  crossing ticket's stage landing and an entity's constitution commit.
- Change `apps/forge/src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts`: the hold `interrupted:merge`
  beside WP3.3's prefix.
- No change to the Playbook's `ticketIsHeld`: a hold of any reason, and a merge-queued ticket, already hold the ticket
  (`Playbook.ts:387-388`).

**What to do.**

1. `ReconcileCauses.causeOfAGoneChild(kind)`: `machine-went-down` is `reboot` (a suspected crash too: the machine did
   go down); `crashed` is `forge-crashed`; `stopped-on-purpose` is `forge-stopped`; `handover` and `first-start` have
   none (a child gone in a handover is stage 2's ordinary loss and keeps the crash cause stage 2 gives it).
2. In the start step, for every job of stage 2's report that is gone with no end of its own (N1), interrupt it with that
   cause in the forced first pass's hold, instead of the cause stage 2 would give a lost child. A child that ended with
   an end Talos recorded (a lease end, a clean-quit pause, a recognised `network-outage`, an exit) keeps the cause
   stage 2 maps.
3. Reconcile starts no work: after this pass the Playbook decides by the table (WP3.2), so a `reboot`, `forge-stopped`,
   `forge-crashed` or `lease-ended` job stays interrupted until an instruction.
4. The Airlocks, for a start whose kind is not `handover` or `first-start`, in the first sweep after the start: every
   slot with no live holder is restored as `freeSlot` restores it (`Airlocks.ts:737-747`: merge abort, hard reset to the
   slot's start tip), its job ended `orphaned`, and its ticket held `interrupted:merge` instead of requeued. As built the
   ticket keeps its merge-queued mark (and any `mergeAccepted`): the hold alone keeps it out of the queue, and the lift
   puts it back in, whereas an unqueued `in-review` ticket would get a fresh reviewer after the lift
   (`AirlockClaims.ticketsAwaitingGreenOf`, `Playbook.ts:398`), not the requeue the specs ask for. That covers a merge-in
   mid-merge, an Airlock agent left without a holder, a slot whose worktree a stop left restored before `freeSlot`'s hold
   (stage 0, table B), and a constitution commit's orphan; a constitution commit with no ticket waits until
   `resume --all`: its Apply request is held with the reason `interrupted` (`INTERRUPTED_APPLY_REASON`), the main line's
   allocation waits on it as on a claimed slot, and `resume --all` sets it `committing` again
   (`Board.liftInterruptedApply`, logged `pipeline-apply-requested`). A refresh mid-merge is owed to no ticket and no
   request: it is only freed, and the next allocation derives it again from the branches. A landing that did complete is
   recorded, as the rerun records it today (`CrashMatrix.merges.spec.ts:96`, `:219`, `:242`, `:332`): recording it is
   reconcile. While the forge stays up, an orphan made by an agent crash keeps today's requeue. The Airlock facts file
   of a crossing ticket's split conflict belongs to the ended merge job; the next merge job writes its own.
5. `advanceTheSlot` (`Airlocks.ts:1334-1344`) treats a holder whose ticket holds an `interrupted:` hold as waiting,
   never as parked (it reads `PARKED_HOLD_PREFIX` at `:1338`): it neither aborts nor advances it.
6. The Airlock's candidate selection already skips a held ticket (`AirlockClaims.ts:166-169` keeps `in-review` tickets
   with no hold, and `:109-110` only merge-queued ones), so the unqueued, held ticket stays out of the queue with no
   change there.

**Specs.**

- `ReconcileCauses.spec.ts`: one claim per kind.
- A `DrivePass` spec beside the existing ones (`cli/overseer/OverseerDrivePass.spec.ts` uses the recorded Talos stages
  stage 2 left): a start after a reboot interrupts the gone job `reboot` and launches nothing for it; after a crash
  `forge-crashed`; after a stop `forge-stopped`; a job whose child ended `lease-ended` keeps that cause; a pending
  ticket with no job still launches (new work is not interrupted work); a resume instruction then resumes the job by
  id in the same folder.
- `src/services/overseer/Airlocks.spec.ts` (or a new aspect suite `Airlocks.interruptedStart.spec.ts`): after a crash
  start an orphaned merge-in is aborted, reset and held `interrupted:merge`, not requeued; a slot found restored with no
  holder is held the same way; `resume <T>` lifts the hold and the next sweep queues it; without a waiting start the
  orphan requeues as today.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/overseer/Airlocks
cli/overseer/OverseerDrivePass.spec.ts src/services/overseer/ReconcileCauses.spec.ts` passes.

### WP3.10 Lost lines wait

**Purpose.** A gate or install line lost to a crash or a reboot is never read as a red gate; its job waits, and an
instruction runs the line again.

**Files.**

- Change `apps/forge/src/services/overseer/JobLaunch.ts`: stage 2's `lineEndOf` (N7; it replaces today's
  `processWatcherEnd`, `:552-556`, read by the install steps at `:583`, the gate steps at `:812` and the review's
  target catch-up merges at `:938` and `:1017`) answers a fourth verdict, `lost`, for a newest instance that reads
  `lost`, where stage 2 answers `rerun`; `rerun` stays only for an end `paused`.
- Change `apps/forge/src/lib/tracker-model/@types/LogRecord.ts`, `constants/LogRecordSchema.ts`,
  `apps/forge/src/adapters/utils/LogUtil.ts` and `ACTIVITY_CATEGORY_OF_KIND` in
  `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts`: the record `job-line-lost`.
- Change `apps/forge/src/lib/tracker-model/Board.ts` and `Jobs.ts`: `recordLineLost(jobId, line, cause, at)`.
- Change `apps/forge/src/lib/tracker-model/Playbook.ts` only to export `resumeIsInstructed` for the launch to read.

**What to do.**

1. When stage 2 reports a line of a job in `preparing` or `gating` as lost (not exited, not stopped by a clean quit, not
   ended `time-bound`), and the start that found it is not a handover, log `job-line-lost` with the line kind and the
   cause from `ReconcileCauses`, and spawn no next step for that job. The job keeps its state, so no job move is
   invented. A line ended `time-bound` is a judged end, `cannot-run`, as stage 2 built it (decisions 29, 36).
2. The launch spawns the lost step again only once `resumeIsInstructed` is true for that job, counting a
   `job-resume-instructed` record after the `job-line-lost` record. Extend `resumeIsInstructed` to take the newest of
   `job-interrupted` and `job-line-lost` as the point the instruction must follow.
3. `Board.instructResume` accepts a job whose newest record is `job-line-lost` as well as an interrupted job, and
   `instructResumeOfEveryWaitingJob` includes it. A line stopped by a clean quit of Talos is run again by itself, as
   stage 2 built it.

**Specs.** In the `JobLaunch` gating suite (`src/services/overseer/JobLaunch.gating.spec.ts`): a gate lost at a crash
start logs `job-line-lost`, opens no red handoff and spawns nothing; after `resume J<n>` the same step spawns again; a
gate that exited red still opens the red handoff; a gate ended `time-bound` reads `cannot-run` and logs no lost line. In
`Board.jobs.spec.ts`: an instruction after `job-line-lost` is accepted.

**Done when.** `bun run verify` passes at the root; `bun test src/services/overseer/JobLaunch.gating.spec.ts
src/lib/tracker-model` passes in `apps/forge/`.

### WP3.11 The abandoned pass, and a crash for anything else

**Purpose.** A pass that does not complete on one of the lock's two expected conditions is named `pass-abandoned`,
apart from a crash and from a ticket's failed pass, counted and shown; any other throw in a pass is a crash on its first
occurrence (decision 14, R1).

**Files.**

- Change `apps/forge/src/services/overseer/DrivePass.ts`: `drain` (`:1553-1566`), `OverseerNotice` (`:280-301`),
  `noticesOf` (`:997-1025`), `OverseerStateDocument` (`:306-315`), and `DrivePassRequest` (`:209`), which gains the
  crash path's entry.
- Create `apps/forge/src/services/overseer/AbandonedPassReason.ts` and its spec: the pure reading of a thrown value into
  `{ verdict: 'abandoned', reason, detail }` or `{ verdict: 'crash' }`.
- Change `apps/forge/cli/overseer/OverseerWording.ts`: the notice's wording in `noticeTextOf` (`:1044-1073`), which
  `oversee status` prints; it has no spec of its own, so create the aspect suite
  `cli/overseer/OverseerWording.notices.spec.ts`.
- Change `apps/forge/src/shared/monitor/utils/NoticeWordingUtil.ts` (`noticeTextOf`, `:43-72`) and its spec: the same
  notice for the Bridge header and the monitor snapshot, which carries each notice as `{ kind, text }`
  (`packages/forge-contracts/@types/MonitorSnapshotDocument.ts:89-92`, `kind` a string), so the contract does not
  change.
- Change `apps/forge/cli/overseer/OverseerForeground.ts` only to hand the crash path to the drive pass.

**What to do.**

1. `AbandonedPassReason.of(thrown)`: an `OperationRefusal` whose detail kind is `tracker-lock-held` is abandoned with
   reason `tracker-lock-held`; `lock-taken-over` is abandoned with reason `lock-taken-over`; anything else is a crash.
   The detail is the error's message.
2. In `drain`, on a throw read as abandoned: `Presence.recordAbandonedPass(files, generation, reason, detail, at)`, the
   log line names the reason ("Drive pass abandoned (tracker-lock-held); it waits for the next wake-up: …"), and
   the pass is tried again at the next wake-up. On a pass that ran to its end, `Presence.recordCompletedPass` sets the
   count to 0. Nothing is written to the board log: the board's lock may be the reason.
3. On a throw read as a crash: log one line naming it, run the crash path (WP3.7) with `component: 'overseer'` and the
   thrown value, mark the pass stopped so no wake-up runs another, and end the foreground loop with `crashed`.
4. `noticesOf` adds `{ kind: 'passes-abandoned', inARow, reason }` once the count reaches
   `ABANDONED_PASSES_BEFORE_NOTICE` (3). It is a notice: the forge keeps running.
5. Never call this a "failed pass" in code, wording or docs: `FailedPassUtil` owns that name. Today's line, "A drive
   pass failed and waits for the next wake-up" (`DrivePass.ts:1562`), is the one item 2 rewords.

**Specs.** `AbandonedPassReason.spec.ts`: one claim per reason, and that a `board-refusal`, an `unreadable-tracker`
refusal and a plain `Error` read as a crash. `OverseerWording.notices.spec.ts` and `NoticeWordingUtil.spec.ts`: the
notice's sentence names the count and the reason. A `DrivePass` spec: a pass whose hold throws `tracker-lock-held`
three times in a row raises the notice and writes the count to presence; the next completed pass clears both; the pass
is tried again at the next wake-up; a pass that throws a plain `Error` once runs the crash path once and runs no further
pass.

**Done when.** `bun run verify` passes at the root; the specs pass in `apps/forge/`.

### WP3.12 Presence and the crash log on the read API and in the contract

**Purpose.** Gaia, and any reader of the API, reads the live forge's presence: its last start, whether Talos still
supervises its agents, the work that waits by cause, and its crash logs (decision 21, R2, R3).

**Files.**

- Create `packages/forge-contracts/@types/ForgePresenceDocument.ts` and
  `packages/forge-contracts/@types/ForgeCrashLogDocument.ts`, and export both in
  `packages/forge-contracts/package.json`. Each declares its own unions and imports nothing from `apps/forge`
  (decision 50).
- Change `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts`: a helper
  `endpointAddedIn(endpoint, version, introducedIn)` beside `currentEndpointOf`, which dates every entry
  `introducedIn: FIRST_VERSIONED_FORGE` (`:16-25`), and the entries `endpointAddedIn('presence', 1, <this stage's forge
  version>)` and `endpointAddedIn('crash-log', 1, <the same>)` in `FORGE_COMPATIBILITY_REGISTRY` (`:38-49`), so the
  registry dates them truly for `versions:raise-minimum`. The date gates nothing: the server serves every endpoint entry
  not yet removable (`servedEndpointsOf`, `OverseerServer.ts:601-606`). Stages 4 and 6 reuse the helper. Raise the
  minor in `ForgeSystemVersions.ts` only if WP3.3 has not already raised it in this stage (once per stage).
- No change to `packages/forge-contracts/constants/OverseerContractVersions.ts`: it lists the integer contract keys of
  the documents released before system versions, and these documents carry no such key.
- Create `apps/forge/src/services/overseer/PresenceDocumentAssembly.ts` and its spec: forge's typed mapping from
  presence, the heartbeat, Talos's record, the board and the crash logs into the two documents.
- Change `apps/forge/src/services/overseer/OverseerServer.ts` (`dataRouteOf`, `:535-552`) and the route record in
  `cli/overseer/routes/OverseerRoutes.ts`: the routes `GET /api/presence` and `GET /api/crash-log?number=<n>`
  (the newest without the query) behind the token. The versioned paths need no route of their own:
  `requestAtUnversionedPath` (`OverseerServer.ts:608-619`) maps a served `/api/v<n>/<endpoint>` onto its unversioned
  route, query kept, and answers 404 for a version it does not serve.
- Change `apps/forge/docs/reference/overseer-api.md`.

**What to do.**

1. Define the documents as in Interfaces introduced. They carry no version key of their own: the path carries it, as
   `apps/gaia/CLAUDE.md` rule 3 asks.
2. `PresenceDocumentAssembly.presenceDocumentOf(inputs)` is pure. It maps each `InterruptionCause` to the contract's
   `MonitorInterruptionCause` (stage 2's union, the contract's one cause union) through the assembly's
   `Readonly<Record<InterruptionCause, MonitorInterruptionCause>>`, so a cause added to the model does not compile until
   it is mapped; `watcher-lost` maps to `child-lost`, since the contract carries no name stage 9 retires. For each
   interrupted job: its cause, what it waits for (from `RESUME_POLICY_OF_CAUSE` and the holds: an instruction, an
   answer, a decision, nothing, or never), `crashResumes` and the automatic restarts left. A job with a lost line
   (WP3.10) is listed as waiting for an instruction. Then the tickets holding an `interrupted:` hold, the crash logs
   listed by `CrashLog.list`, each with its number and its crashed generation, and the supervision read from Talos's
   record (N10): `held` is `supervising`, `ended` is `stopped`, `waiting-after-gap` is `checking-after-a-gap`, `unheld`
   is `not-yet-renewed`, no readable record is `no-talos`.
3. `PresenceDocumentAssembly.crashLogDocumentOf(crashLogNumber, record)` maps a stored crash log into the contract's
   document, `number` from the file and `generation` from `crashedGeneration`;
   `component` `overseer` maps to `hephaestus`, the component's name in the contract.
4. Serve both like `state`: read fresh on each request, behind `readerIsAuthorized`. `crash-log` answers 404 with the
   refusal `no-crash-log` for a number that has none.

**Specs.** The assembly spec: a reboot-interrupted job is listed as waiting for an instruction; an agent crashed once is
listed as resuming by itself with one restart left; a `network-outage` job and a `lease-ended` job are listed with
their causes, waiting for an instruction; an `interrupted:merge` ticket is listed; the crash logs are listed newest
last; a Talos record whose lease ended reads `stopped`. An `OverseerServer` spec: each route answers 401 without the
token and the document with it, at `/api/presence`, `/api/v1/presence`, `/api/crash-log` and
`/api/v1/crash-log?number=<n>`; `/api/v2/presence` answers 404. The contract package's specs pass, and the registry
spec holds the new endpoints.

**Done when.** `bun run verify` passes at the root; in `apps/forge/`, `bun test src/services/overseer/PresenceDocument
src/services/overseer/OverseerServer.spec.ts` passes.

### WP3.13 The CLI path: status, crash log, resume

**Purpose.** With Gaia closed, the CLI shows that a forge is off after a crash, shows its crash log, starts it again and
resumes the work (design section 3.4).

**Files.**

- Change `apps/forge/cli/overseer/OverseerCommand.ts`: `printOverseerStatus` (`:142-172`).
- Create `apps/forge/cli/crash-log/CrashLogCommand.ts` and its spec: the top-level verb `crash-log`.
- Change `apps/forge/cli/CommandTable.ts`, `apps/forge/cli/HelpText.ts` and `apps/forge/docs/cli.md`.
- Change `apps/forge/cli/tracking/status/StatusCommand.ts`: one line on standard error when the forge is off after a
  crash, beside the hold-journal notice (`:39-43`).
- Change `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts`, its sample and
  `apps/forge/docs/reference/refusals.md`: the refusal `no-crash-log`.
- Change the specs `cli/overseer/OverseerCommand.spec.ts`, `cli/tracking/status/StatusCommand.spec.ts`,
  `cli/HelpText.spec.ts`, `cli/CommandTable.spec.ts`; check `cli/InstalledSurface.status.spec.ts`.

**What to do.**

1. `oversee status`: when no Overseer is live, read the evidence (`StartGate.evidenceOf` with origin `user`) and
   classify. Its JSON entity gains `presence` (Interfaces introduced); its text says, for a crash, "forge: off after a
   crash of Baton <generation> (crash log <number>, <path>); start it again with `<program> start`, then resume the
   interrupted work with `<program> resume --all`". When live, it shows the last start's kind, the heartbeat, the
   supervision and abandoned passes from presence.
2. `crash-log [<number>] [--json]`: prints the crash log of that number, or the newest; refuses `no-crash-log`
   when there is none. Text: the component, the classification and its evidence, the error, the jobs and their steps,
   then the log tail. It reads files only, so it works with the forge up or down.
3. The top-level `status`: when the classification of a down forge is `crashed`, or `machine-went-down` with
   `crashSuspected`, print to standard error "The forge is off after a crash: run `<program> crash-log` to read why,
   `<program> start` to start it again." The JSON on standard output is unchanged.
4. The path end to end: `oversee status` shows the crash; `crash-log` shows the log; `start` (origin `user`) serves and
   classifies `crashed`; `resume --all`, `resume --network-outage` or `resume <T|J>` resumes. `job fresh <J>` starts a
   fresh agent instead and `job stop <J>` gives the work up; say so in `docs/cli.md`.

**Specs.** `OverseerCommand.spec.ts`: `oversee status` on a scratch data folder with a crashed presence prints the crash
and its path, and `--json` carries `presence`. `CrashLogCommand.spec.ts`: prints the newest log and a given number,
and refuses `no-crash-log`. `StatusCommand.spec.ts`: the notice is on standard error only, and absent for a stopped
forge.

**Done when.** `bun run verify` passes at the root; `bun test cli/overseer/OverseerCommand.spec.ts cli/crash-log
cli/tracking/status` passes in `apps/forge/`.

### WP3.14 The crash matrix

**Purpose.** The real-system matrix and its default-suite rows hold the reversed behaviour; new rows hold the start
classification, the forge that stays off, the crash path and the waits of decisions 35, 38 and 39.

**Files.** `apps/forge/src/services/overseer/CrashMatrix.integration.spec.ts`,
`apps/forge/src/services/overseer/CrashMatrix.spec.ts`, `apps/forge/src/services/overseer/CrashMatrix.merges.spec.ts`,
as stage 2 left them (N8); their opening docblocks say what each row holds. Line numbers below are today's.

**What to do.** Change these rows; keep every other row as stage 2 left it.

| Spec and today's row | Change |
| --- | --- |
| `CrashMatrix.integration.spec.ts:537` "a job crash-resumed twice and interrupted again ends replaced … two replaced in a row open job-lost" | Becomes: resumed twice by itself, the third crash leaves it interrupted with no step and no fresh attempt; `resume J<n>` resumes it by id with `crashResumes` 0, and two more crashes are resumed by themselves. No `job-lost` opens |
| `CrashMatrix.integration.spec.ts:573` "three reboots in a row during one build: three resumes of the same session, none counted" | Becomes: each reboot leaves the job interrupted `reboot` and spawns nothing; each `resume` instruction resumes the same session by id; none counted |
| `CrashMatrix.integration.spec.ts:469` "watcher dies with its agent alive …" and `:495` "watcher and agent die …" | Their start is of the same boot with no ending on record, so it classifies `crashed`: the gone child is interrupted `forge-crashed` and waits. Split each row: a child lost while the forge stays up keeps the crash cause and resumes by itself; one found gone at a crash start waits for an instruction |
| `CrashMatrix.integration.spec.ts:615` "a question pending when the machine reboots …" and `:652` "a worker reports a malformed ticket, then the machine reboots …" | Unchanged in outcome: the answer is the instruction. Add an assertion that nothing resumes before the answer |
| `CrashMatrix.integration.spec.ts:836` "a product owner interrupted by a reboot at its question waits …" | Unchanged in outcome, for the same reason |
| `CrashMatrix.spec.ts:1279` "a product owner replaced past the bound with a question open waits awaiting-answer; once answered a fresh one takes …" | The part with the question open is unchanged; past the bound with no question it waits for an instruction instead of a fresh session |
| `CrashMatrix.merges.spec.ts:108` "mid-merge with no live holder: merge --abort, a reset to branchTip and a requeue" | After a waiting start: aborted, reset, held `interrupted:merge`, not requeued; `resume <T>` requeues it. While the forge stays up: unchanged |
| `CrashMatrix.merges.spec.ts:122` "restart during a live or interrupted Airlock agent …" and `:177` "restart during a live or interrupted conflict re-reviewer …" | A live agent keeps its slot as today; an agent interrupted by the start waits for an instruction before its resolution goes on |
| `CrashMatrix.merges.spec.ts:260` "a refresh mid-merge with no live holder …" and `:319` "a job left in committing by a run cut short is an orphan …" | After a waiting start: aborted and held as in WP3.9, run again on `resume` |

Add these rows to `CrashMatrix.integration.spec.ts`, each with real processes, the fake agent and a scratch data folder:

- "a stop on record, then a start: classified stopped on purpose, and the jobs the stop left interrupted wait";
- "the Overseer killed, then a login-item start: it stays off, writes one crash log, takes no Baton, writes the registry
  presence `crashed`, and Talos's lease stops the agents, which then read `lease-ended`";
- "then a user start: it serves, classifies the crash, keeps the crash log, and the interrupted tickets wait until
  `resume --all`";
- "a crash of Baton 1, a user start and a stop, then a start that takes Baton 1 again and is killed: the next
  login-item start writes a crash log under the next number, keeps the older log of Baton 1 as it was, and the
  registry's crash summary and the refusal name the new log" (crash logs are numbered, never named by generation);
- "an unexpected error in a pass: the crash path writes the crash log with the error and the registry presence
  `crashed`, the forge ends, and the next login-item start stays off";
- "an uncaught exception in the Overseer: the crash log carries the error and the process ends with a non-zero code";
- "a Baton pass leaves a completed handover on record, and the successor's start interrupts nothing";
- "a reboot with a fresh heartbeat, then a login-item start: it serves, classifies the machine going down, and the
  interrupted work waits";
- "a reboot long after the last heartbeat, then a login-item start: it stays off with a crash log marked suspected";
- "a crash of Talos while serving: the forge writes a crash log naming Talos and ends; the next login-item start stays
  off";
- "a stopped Overseer process (`SIGSTOP`) past the lease: Talos stops its agents, which end `lease-ended`; once it runs
  again they wait for `resume`";
- "the fake agent ends on a network outage: the job waits `network-outage`, counted as no crash; `resume
  --network-outage` resumes it; a second outage leaves it waiting again" (only once the fake agent's outage scenario is
  recorded, an owner act of gate G1; until then the row is written and skipped with that reason in its title).

**Specs.** The rows above. The default suite's rows (`CrashMatrix.spec.ts`, `CrashMatrix.merges.spec.ts`) run in
`bun run verify`; the integration rows run through `bun run record <boundary>` for the boundary `BOUNDARY_SPECS` lists
them under, or through `bun run verify:integration` when the owner asks (gate G4).

**Done when.** `bun run verify` passes at the root with no stale stamp; the integration rows pass on macOS when run as
above, and their recording is committed.

### WP3.15 The landing steps a stop leaves undone

**Purpose.** The three steps of an Airlock landing that stage 0 found neither redone nor detected (table B of
`stage-0-1-trace-and-base.md`) are made whole: the landing journal line, the release cleanup and, through WP3.9, the
restore of the worktree's tip.

**Files.**

- Change `apps/forge/src/services/lifecycle/Landing.ts`: `landBesideSiblings` (`:160-171`).
- Change `apps/forge/src/services/overseer/Airlocks.ts`: the release cleanup (`cleanUpAfterLanding`, `:1222-1229`).
- Change the specs `src/services/lifecycle/Landing.spec.ts` (or its shared-repository aspect suite) and
  `src/services/overseer/CrashMatrix.merges.spec.ts`.

**What to do.**

1. In `landBesideSiblings`, a verdict `already-landed` for a commit the landing journal does not name appends the line
   as a landing does (`RepositoryLandings.appendLanding`, `:167`), under the same landing lock, with the target tip
   before the merged commit as its previous tip. A rerun after a stop between the fast-forward and the journal line
   then leaves no unrecorded move for a sibling tracker.
2. In the Airlocks' first sweep after any start, for every landed ticket whose frontmatter has `releasesGroup` true
   (`Airlocks.ts:1257`) and whose group branch (`groupTargetPrefix` plus the group) still stands, run the release half
   of `cleanUpAfterLanding` again (`GroupWorktrees.removeGroup`), reporting a declined cleanup as today. Removing a
   group that is gone does nothing, so the step is safe to redo.
3. The tip restore before `freeSlot`'s hold is covered by WP3.9 item 4; this package adds only its matrix row.

**Specs.** `Landing` spec: an `already-landed` rerun in a shared repository appends exactly one journal line, and a
second rerun appends none. `CrashMatrix.merges.spec.ts`: a stop between the fast-forward and the journal line, then a
start, leaves the journal naming the landing and a sibling tracker lands with no `target-moved`; a stop after the
landing hold and before the release cleanup, then a start, removes the group's worktree and branch; a stop between
`freeSlot`'s restore and its hold, then a start, holds the ticket `interrupted:merge`.

**Done when.** `bun run verify` passes at the root; `bun test src/services/lifecycle/Landing
src/services/overseer/CrashMatrix.merges.spec.ts` passes in `apps/forge/`.

## Interfaces introduced

### Interruption causes and the resume policy

```ts
// src/lib/tracker-model/@types/Job.ts, added to InterruptionCause
| 'forge-stopped'   // the child ended with a stop of the forge on purpose, found gone at the next start
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
| `talos-paused` (stage 2) | `resumes-by-itself` (decision 8) |
| `reboot` | `waits-for-instruction` |
| `forge-stopped` | `waits-for-instruction` |
| `lease-ended` (stage 2) | `waits-for-instruction` (decision 38) |
| `forge-crashed` | `waits-for-instruction` |
| `network-outage` (stage 2) | `waits-for-instruction`; also resumed by the target `network-outage` (decision 35) |
| `agent-crashed`, `watcher-lost` (stage 2's `CRASH_INTERRUPTION_CAUSES`) | `resumes-twice-then-waits`; an instruction sets the count to 0 (decision 40) |
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
| `start-classified` | board | `kind`: `StartKind`; `startOrigin`: `StartOrigin`; `previousGeneration`: count, written only when there is one; `crashSuspected`: flag, written only when true; `crashLogNumber`: count, the crash log's number, written only when a crash log exists for this start |
| `job-resume-instructed` | job | `childInstance`: the job's instance at the instruction (`Job.childInstance`, stage 2's WP2.16) |
| `job-resumed` (changed) | job | adds `instructed: true`, written only for an instructed resume |
| `job-line-lost` | job | `line`: `'gate' \| 'install'`; `cause`: interruption cause |
| `ticket-interrupted-hold-lifted` | ticket | `hold`: text, the `interrupted:` hold lifted. Logged in place of `ticket-unheld`, so no fresh attempt starts and no count resets (R5) |

### Ticket hold

`INTERRUPTED_HOLD_PREFIX = 'interrupted:'` in `src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts`; the
one hold this stage writes is `interrupted:merge`. It holds the ticket as every hold does, and keeps it out of the
merge queue (`AirlockClaims.ts:166-169`). `resume <T>` and `resume --all` lift it through
`Board.liftInterruptedHold(ticketId, at)`, logging `ticket-interrupted-hold-lifted`; `ticket unhold <T>` lifts it as a
person's unhold, logging `ticket-unheld` with its resets.

### Control command

```ts
// src/shared/@types/ControlCommand.ts
export type ResumeTarget = { jobId: string } | { ticketReference: string } | 'all' | 'network-outage';
| { kind: 'interrupted-work-resume'; target: ResumeTarget }

// packages/forge-contracts/@types/ForgeControlCommand.ts, standing alone
export type ForgeResumeTarget =
  | { readonly jobId: string }
  | { readonly ticketReference: string }
  | 'all'
  | 'network-outage';
| { readonly kind: 'interrupted-work-resume'; readonly target: ForgeResumeTarget }
```

Applied in one hold, with the forge up or down. Refusals (`OperationRefusal('refused')` with a `BoardRefusal` reason),
each with its sentence in the one wording table (decision 45): `job-not-interrupted` (`jobId`),
`ticket-not-interrupted` (`ticketId`), and the ticket lookup's own refusals. `'all'` and `'network-outage'` with
nothing waiting answer `nothing-to-do`, a success. Never admitted for an agent role by the Bouncer.

### CLI

| Verb | Effect | Exit codes |
| --- | --- | --- |
| `resume <J>\|<T> [--json]` | `interrupted-work-resume` for the job or ticket | 0 done; 1 refused |
| `resume --all [--json]` | `interrupted-work-resume` `'all'` | 0 done or nothing to do |
| `resume --network-outage [--json]` | `interrupted-work-resume` `'network-outage'` | 0 done or nothing to do |
| `start [--started-by user\|login-item] …` | the start origin; `user` when absent; the start gate before the spawn | unchanged, plus 1 `forge-off-after-crash` |
| `oversee [--started-by user\|login-item] …` | the internal foreground entry, with the same origin | unchanged, plus 1 `forge-off-after-crash`, and the exit of `forge-crashed` |
| `crash-log [<number>] [--json]` | prints a crash log | 0; 1 `no-crash-log` |
| `oversee status [--json]` | adds `presence` | unchanged |

The login item's line: macOS `<bun> <isolating arguments> <checkout>/agent-progress.ts start --started-by login-item`;
Windows the same with `--repository <path>`; Linux `<bun> <isolating arguments> <checkout>/agent-progress.ts oversee
--started-by login-item`, in the foreground. `start` passes `--started-by user` to the detached child unless it is
given `login-item`.

The refusals, each a detail kind of `OperationRefusal` worded for the command line and served with its sentence:

- `forge-off-after-crash` (`refused`, exit 1): `{ crashedGeneration: number | null, crashLogPath: string, suspected:
  boolean }`, "The forge is off after a crash of Baton <n>; read why with `crash-log`, and start it yourself with
  `start`." ("of a Baton nothing names" when the generation is `null`.)
- `forge-crashed` (`unrepaired`): `{ component: 'overseer' | 'talos', crashLogPath: string | null }`, "The forge
  crashed (<component>) and stays off; its crash log is <path>." ("could not be written" when the path is `null`.)
- `no-crash-log` (`refused`, exit 1): `{ number: number | null }`.

The `presence` block of `oversee status --json`:

```ts
interface StatusPresence {
  state:            'serving' | 'starting' | 'down' | 'off-after-crash';
  lastStart:        StartClassificationVerdict | null;
  crashLog:         { number: number; generation: number | null; path: string; suspected: boolean } | null;
  heartbeat:        HeartbeatRecord | null;
  supervision:      'supervising' | 'stopped' | 'checking-after-a-gap' | 'not-yet-renewed' | 'no-talos';
  abandonedPasses:  PresenceRecord['abandonedPasses'] | null;
}
```

### Stored files, under `<data>/overseer/` (`overseerFilesIn(...).overseerDirectory`)

`presence.json`, written whole and atomically by the main thread only:

```ts
export type StartOrigin = 'user' | 'login-item' | 'successor';
export type PresenceEnding =
  | { kind: 'stopped' | 'handed-over'; at: string }
  | { kind: 'crashed'; component: 'overseer' | 'talos'; crashLogNumber: number | null; at: string }; // null: not written

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
  ending:              PresenceEnding | null;
}
```

`heartbeat.json`, written whole and atomically through the renewal's `onRenewed` hook only, at each renewal Talos
confirmed:

```ts
export interface HeartbeatRecord {
  heartbeatVersion: 1;      // HEARTBEAT_FORMAT_VERSION
  generation:       number;
  sequence:         number; // from 1, one up on each beat
  at:               string; // local ISO time of the beat
}
```

`crash-logs/crash-<number>.json`, created exclusively, never rewritten; the number is one above the highest log on
disk (1 in an empty folder), never the Baton generation:

```ts
export interface CrashLogRecord {
  crashLogVersion:     1;
  crashedGeneration:   number | null;     // the Baton generation; null when no presence record or Baton names it
  component:           'overseer' | 'talos' | 'unknown';
  suspected:           boolean;          // true for a crash suspected before a reboot
  classification:      StartClassificationVerdict | null; // null when the crash path wrote it
  recordedAt:          string;
  recordedBy:          { generation: number | null; startOrigin: StartOrigin | null; crashPath: boolean };
  // presence's process, else the holder of the crashed generation's dead Baton
  crashedProcess:      { processId: number; startStamp: string; bootIdentity: string } | null;
  codeVersion:         string | null;
  startedAt:           string | null;
  lastHeartbeat:       { sequence: number; at: string } | null;
  error:               { origin: 'pass' | 'uncaught-exception' | 'unhandled-rejection' | 'talos-lost';
                         name: string; message: string; stack: string | null } | null;
  activeJobs:          {
    jobId: string; kind: string; role: string | null; ticketIds: string[]; state: string;
    interruption: string | null; instance: number; airlockPhase: string | null; eventSequence: number;
  }[];
  talosChildren:       unknown[] | null; // stage 2's persisted child records, copied as stored
  logTail:             string[];         // the last CRASH_LOG_TAIL_LINES lines of overseer.log
}
```

Constants in `src/services/overseer/constants/PresenceLimits.ts`: `PRESENCE_FORMAT_VERSION = 1`,
`HEARTBEAT_FORMAT_VERSION = 1`, `CRASH_LOG_FORMAT_VERSION = 1`, `CRASH_LOG_TAIL_LINES = 200`,
`CRASH_LOG_CREATION_ATTEMPTS = 16`, `ABANDONED_PASSES_BEFORE_NOTICE = 3`, `CRASH_PATH_REGISTRY_BOUND_MILLISECONDS =
5_000`, `HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS` = four lease renewal intervals (60 000 with stage 2's 15 seconds),
derived from stage 2's constant, not written as a number.

### Start classification

```ts
export type StartKind = 'first-start' | 'handover' | 'stopped-on-purpose' | 'machine-went-down' | 'crashed';

export interface StartClassificationVerdict {
  kind:               StartKind;
  previousGeneration: number | null;
  crashSuspected:     boolean;                     // only ever true with 'machine-went-down'
  crashedComponent:   'overseer' | 'talos' | null; // set only with 'crashed'
  evidence: {
    presence:               'absent' | 'unreadable' | 'read';
    previousEnding:         'stopped' | 'handed-over' | 'crashed' | null;
    previousBootIdentity:   string | null;
    currentBootIdentity:    string;
    newerBatonThanPresence: boolean;
    talos:                  'none' | 'quit' | 'live' | 'lost-this-boot' | 'lost-other-boot';
    lastHeartbeatAt:        string | null;
    bootStartedAt:          string | null;
  };
}

export type StartGateVerdict =
  | { verdict: 'serve'; classification: StartClassificationVerdict; crashLogNumber: number | null }
  | { verdict: 'stay-off'; classification: StartClassificationVerdict; crashLogNumber: number;
      crashedGeneration: number | null; crashLogPath: string };
```

### Abandoned pass

```ts
export type AbandonedPassReason = 'tracker-lock-held' | 'lock-taken-over';
export type PassThrowReading =
  | { verdict: 'abandoned'; reason: AbandonedPassReason; detail: string }
  | { verdict: 'crash' };
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
presence?:
  | { state: 'serving'; generation: number; at: string;
      process: { processId: number; startStamp: string; bootIdentity: string } }
  | { state: 'stopped' | 'handed-over'; generation: number; at: string }
  | { state: 'crashed'; generation: number | null; at: string;   // null: no presence record or Baton names it
      crash: { component: 'overseer' | 'talos'; suspected: boolean; errorName: string | null;
               errorMessage: string | null; crashLogPath: string | null } }; // null: the crash path could not write it
```

It only adds, so the registry's version stays; a reader that knows the version passes it over until it reads it.

### Read API

`GET /api/v1/presence` and `GET /api/v1/crash-log?number=<n>`, behind the bearer token, listed in
`FORGE_COMPATIBILITY_REGISTRY` at version 1 and answered by the unversioned routes, as every versioned read is; the
forge's system version rises by one minor in this stage, over the 1.18 of today plus whatever stage 2 raised. Both types
import nothing from `apps/forge`.

```ts
// packages/forge-contracts/@types/ForgePresenceDocument.ts
export type ForgeStartKind = 'first-start' | 'handover' | 'stopped-on-purpose' | 'machine-went-down' | 'crashed';
// The cause of interrupted work is stage 2's MonitorInterruptionCause (MonitorSnapshotDocument.ts), widened by WP3.1.
export type ForgeSupervision = 'supervising' | 'stopped' | 'checking-after-a-gap' | 'not-yet-renewed' | 'no-talos';

export interface ForgePresenceDocument {
  readonly generation:      number;
  readonly processId:       number;
  readonly codeVersion:     string;
  readonly startedAt:       string;
  readonly startOrigin:     'user' | 'login-item' | 'successor';
  readonly lastStart:       {
    readonly kind:               ForgeStartKind;
    readonly previousGeneration: number | null;
    readonly crashSuspected:     boolean;
    readonly crashLogNumber:     number | null;
  };
  readonly heartbeat:       { readonly sequence: number; readonly at: string } | null;
  readonly supervision:     ForgeSupervision;
  readonly abandonedPasses: {
    readonly inARow: number; readonly lastReason: string | null; readonly lastAt: string | null;
  };
  readonly interruptedWork: readonly {
    readonly jobId:                 string;
    readonly kind:                  string;
    readonly ticketIds:             readonly string[];
    readonly cause:                 MonitorInterruptionCause;
    readonly waitsFor:              'instruction' | 'answer' | 'decision' | 'nothing' | 'never';
    readonly crashResumes:          number;
    readonly automaticRestartsLeft: number | null; // null for a cause that is never counted
  }[];
  readonly heldMerges:      readonly { readonly ticketId: string; readonly hold: string }[];
  readonly crashLogs:       readonly {
    readonly number: number; readonly generation: number | null; readonly component: 'hephaestus' | 'talos' | 'unknown';
    readonly recordedAt: string; readonly suspected: boolean;
  }[];
}

// packages/forge-contracts/@types/ForgeCrashLogDocument.ts
export interface ForgeCrashLogDocument {
  readonly number:       number;          // the crash log's own number, the key of `?number=<n>`
  readonly generation:   number | null;   // the Baton generation that crashed
  readonly component:    'hephaestus' | 'talos' | 'unknown';
  readonly suspected:    boolean;
  readonly recordedAt:   string;
  readonly startKind:    ForgeStartKind | null;
  readonly error:        {
    readonly origin: string; readonly name: string; readonly message: string; readonly stack: string | null;
  } | null;
  readonly activeJobs:   readonly {
    readonly jobId: string; readonly kind: string; readonly ticketIds: readonly string[]; readonly state: string;
    readonly interruption: string | null; readonly airlockPhase: string | null;
  }[];
  readonly logTail:      readonly string[];
}
```

`waitsFor: 'nothing'` is a job that resumes by itself at the next pass.

## Traps

- **The old auto-resume hides in more than one place.** `crashBoundStepsOf`, `productOwnerStepsOf`, the Airlock orphan
  requeue, the gate step read as never run, and stage 2's reconnect all start work again by themselves. Changing only
  the Playbook leaves merges and gates retrying. WP3.2, WP3.9 and WP3.10 each close one; WP3.14's rows prove all of
  them.
- **A start that is a crash must not take the Baton before it decides to stay off.** If the gate ran after
  `Baton.acquire`, a refused start would leave a fresh dead generation, and the next start would read a newer Baton than
  the presence record and classify on the wrong evidence. Classify before `startServing`, and write presence only after
  the Baton is acquired.
- **Presence is overwritten by the start that read it.** Read the evidence, classify, write the crash log, and only then
  write the new generation's presence. A crash log written after the overwrite has lost the crashed generation's
  heartbeat and ending.
- **Two processes beat during a Baton pass.** The predecessor renews until it exits and the successor from the moment
  it holds the Baton (N5). Each writes the heartbeat unless the stored generation is above its own and is the one
  `presence.json` names; a plain overwrite would let the old generation's last beat hide the new one's, and order alone
  would let an ended run's beat silence a run whose generations started again at 1.
- **An idle forge must still beat.** The renewer renews only on progress (decision 38). If an idle, healthy forge made
  no progress in the renewer's sense, its heartbeat would go stale, and a reboot hours later would read as a suspected
  crash and keep every idle forge off (decision 39). Stage 2's renewer renews while no pass is in flight; confirm that
  in its code before WP3.5, and if it does not, stop and report.
- **A stop that is not a stop.** The Overseer also ends on `baton-taken` (`OverseerForeground.ts:795-798`), on a lost
  port after a failed Baton pass (`:683-694`) and on the crash path. Only `closeTheStoppedOverseer` writes `stopped`,
  only `release` writes `handed-over`, and only the crash path writes `crashed`. A crash must leave no `stopped`, or the
  next start reads it as on purpose and serves.
- **`closeTheStoppedOverseer` also runs from the CLI for a dead Overseer** (`OverseerStop.ts:15-20`, a forced or
  unfinished stop). It then writes `stopped` for a process that may have crashed or hung. That is the design's second
  misreading; keep it and its spec, do not try to tell the cases apart here.
- **A crash must not pause its agents.** Asking Talos for a clean quit at a crash would end the agents `paused`, cause
  `talos-paused`, which resumes by itself. The crash path stops the lease renewal instead, so the agents end
  `lease-ended`, which waits.
- **The successor and the crash.** A successor whose predecessor died during the pass (`predecessor-gone`) classifies
  `crashed` with origin `successor` and stays off. The user's restart from Gaia then needs a second, explicit start;
  the refusal's sentence says so.
- **The login item is the usual start after a reboot.** It serves after `machine-went-down` with a fresh heartbeat and
  stays off after `crashed` or a suspected crash. A laptop whose battery ran flat long after its forge last beat reads
  as a suspected crash and stays off until the user starts it; that is decision 39, accepted.
- **An unreadable boot identity reads as the same boot as any other** (`ProcessIdentity.ts:44-47`): a reboot on a
  machine whose boot cannot be read reads as a crash, never as the machine going down. Keep `sameBoot`'s rule; the spec
  states it as a known misreading.
- **The clock rules** (`apps/forge/CLAUDE.md`). A heartbeat is real time, which the rules name, and the boot time is an
  instant an outside system names. Judging "crash suspected" from their difference takes a fact from a clock, against "a
  clock gives no fact"; that site alone carries the comment the rules ask of code that does not obey them. Every limit
  here that looks back on work (crash resumes, abandoned passes) is a count, never an elapsed time; the crash path's
  bound only cuts off a registry write.
- **Process listeners can change how the process dies.** A plain `uncaughtException` listener stops Bun from exiting on
  an uncaught error, so the forge would keep running broken. The listener always ends in a rethrow after the crash
  path, with its bound, and removes itself first so the rethrow is not caught again; never call `process.exit` outside
  the files `eslint.config.js` allows.
- **The crash log must survive a racing second writer.** The crash path and a login-item start, or two login-item
  starts, can both write one crash. `createWholeFileAtomically` makes the file exclusive; a plain write would let the
  second overwrite the first with a later, shorter log tail or without the error.
- **A Baton generation is no crash log's name.** Generations start again at 1 after a stop, so a log named by its
  generation makes a later crash of that generation find the older log, lose its own, and hand the gate and the
  registry the older error. A crash log has a number of its own; the generation is a field inside it.
- **Gaia reads no board file.** The crash summary goes into the registry key and the full log is served once the forge
  serves (R2); do not hand Gaia the crash log's path to read.
- **Name collisions.** `FailedPassUtil` and `FAILED_PASSES_BEFORE_PARKING` already mean a ticket's failed job outcomes;
  the new thing is an abandoned pass. `oversee resume` means "undo a pause" (`OverseerCommand.ts:128-139`, the command
  kind `overseer-resume`) until stage 9 renames it `unpause`; the new command kind is `interrupted-work-resume` and its
  verb the top-level `resume`. `src/ComponentNames.spec.ts:28-63` retires `handing-over`, `lease-taken-over`,
  `Reattachment` and `RunnerLease` among others: the ending is `handed-over`, never `handing-over`, and no new
  identifier may contain a retired name; the contract's cause is `child-lost`, never a Watcher's name.
- **`job-lost` goes quiet.** `job-lost` opens after two `replaced` endings in a row (`Playbook.ts:202-212`), and the
  crash bound produced most of them. After WP3.2 only a failed vendor resume and `job fresh` end a job `replaced`. Keep
  the rule; do not invent a new trigger here.
- **The outage count still counts crashes.** `outageIsDueWith` (`Playbook.ts:188-200`) counts `job-interrupted` records
  of crash causes. `forge-crashed`, `forge-stopped`, `reboot`, `lease-ended` and `network-outage` are not crash causes,
  so a board coming back after a crash, a hang or an outage with several interrupted jobs does not also open `outage`.
  Keep them out of `CRASH_INTERRUPTION_CAUSES`.
- **An instruction must not outlive its interruption.** `resumeIsInstructed` compares the newest instruction with the
  newest interruption (or lost line) of the job in log order. A test that only checks "an instruction exists" passes
  while a stale instruction resumes a later interruption by itself; a second network outage must wait again.
- **An instructed resume still obeys every hold.** Usage limit, install change, outage, refused key and a missing
  pipeline hold an instructed resume too (`Playbook.ts:760-771`); the instruction stays in the log and is carried out
  when the hold clears. Do not move the job to `running` in the command's hold: that would bypass the holds and the
  slots.
- **An unhold starts a fresh attempt.** `ticket-unheld` resets a ticket's failed passes (`FailedPassUtil.ts:74-75`), its
  builder's return from review (`Playbook.ts:313-323`) and its return from declared needs (`:329-339`). Lifting an
  `interrupted:merge` hold with `unholdTicket` would make a crash reset those counts. WP3.3 lifts it with a record of
  its own; a spec proves the failed-pass count reads the same across the lift.
- **A launch decided before a crash is not interrupted work.** A job launched in the hold and never spawned is
  re-spawned at the next start (`CrashMatrix.integration.spec.ts:681`). It never ran, so it keeps that behaviour; do not
  let WP3.9 interrupt it.
- **The command endpoint already takes every control kind** (`CommandRoute.ts:52-55`). Adding the kind to
  `ControlService` exposes it to Gaia at once; the contract package names it in the same package, with the minor
  raised.
- **The registry write must never fail a start or a crash.** `registerWithTheMonitor` returns a verdict instead of
  throwing and is asynchronous; the presence key goes through it, a refused start still refuses with its own refusal
  when the registry cannot be written, and the crash path cuts the write off at its bound.
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
bun test src/services/overseer/Presence.spec.ts src/services/overseer/StartClassification.spec.ts
bun test src/services/overseer/CrashLog.spec.ts src/services/overseer/CrashPath.spec.ts
bun test src/services/overseer/StartGate.spec.ts src/services/overseer/ReconcileCauses.spec.ts src/services/overseer/AbandonedPassReason.spec.ts
bun test src/services/overseer/PresenceDocumentAssembly.spec.ts src/services/overseer/OverseerServer.spec.ts
bun test src/services/control/ResumeControls.spec.ts cli/resume cli/crash-log cli/overseer cli/tracking/status
bun test src/services/lifecycle/Landing src/services/overseer/CrashMatrix.spec.ts src/services/overseer/CrashMatrix.merges.spec.ts
bun test src/ComponentNames.spec.ts src/ImportDirection.spec.ts src/PlatformBoundary.spec.ts src/RealSystemSpecs.spec.ts
```

The real-system matrix, only as the recording of its boundary or when the owner asks for `bun run
verify:integration` (gate G4).

The end-to-end check on a scratch forge. Neither app's rules let anyone run a forge in this checkout; Gaia's rules name
the scratch forge of `apps/gaia/src/testing/ScratchForge.ts`, which runs `apps/forge/agent-progress.ts` under a scratch
home, in a scratch repository, with `FORGE_ROOT` pinned and the forge's fake agent. Use it, or the same setup by hand
(a scratch home under a short scratch root, the fake agent variable `FAKE_AGENT_VARIABLE` of
`apps/forge/src/shared/Environment.ts:26` set, `--port 0`), and check, in order:

1. `init`, file one ticket whose fake agent waits, `start`: `oversee status --json` shows `presence.lastStart.kind`
   `first-start`, and the registry's presence reads `serving`.
2. `stop`, wait past the lease, then `start`: `stopped-on-purpose`; the ticket's job is interrupted `lease-ended` (Talos
   stopped the agent after a minute without renewal), and nothing resumes. `resume --all`: the session resumes by id in
   the same folder.
3. Stop the Overseer's process with `SIGSTOP` for more than a minute: Talos stops the agent; after `SIGCONT`, the
   presence document lists the job waiting `lease-ended`; `resume <T>` resumes it.
4. Kill the Overseer's process with `SIGKILL`; run `start --started-by login-item`: it exits 1 `forge-off-after-crash`,
   the registry's presence reads `crashed`, `oversee status` says off after a crash, `crash-log` prints the log with the
   jobs and the log tail, and `status` prints the notice on standard error. After a minute Talos has stopped the agent.
5. `start`: it serves, `lastStart.kind` is `crashed` with the crash log's number, the job waits, and
   `GET /api/v1/crash-log` serves the log; `resume <T>` resumes it.
6. `oversee restart`: the successor's start is `handover`, and nothing is interrupted.
7. Once the fake agent's outage scenario exists (gate G1): a job ending on an outage waits `network-outage`, and
   `resume --network-outage` resumes it.
8. Remove the scratch home, repository and short link; the leak check of the run must find nothing.

## Out of scope

- Gaia's crash alert, its "stopped supervising" and "not answering" states, its interrupted-work list, the resume
  control per forge and the one control for every network-outage job across forges: stage 6, reading the registry key
  and the documents this stage serves.
- Recognising the network-outage ending, the lease and its renewal on progress, the clean quit, the 15-minute bound of
  gate and install lines with sleep not counted, and every line's recorded run time: stage 2. This stage only maps their
  causes and endings into the policy.
- The pipeline overview that shows each line's run time (decision 36): Gaia's views, stage 6.
- Serving each refusal with its reason code, fields and sentence on the command endpoint: stage 4. This stage words its
  five refusals in the one table stage 4 serves from.
- Persisting what is held in memory beyond presence (R9): the quiet-job counts, the held targets, the event replay
  buffer, the pass fingerprint, the caches and the notices.
- The tracker lock's rule for taking over a holder: stage 5's store port owns the lock.
- The store port: stage 5. Do not introduce a port for the presence files.
- Taking the Assistant off by default: stage 8. The Assistant keeps being replaced when it goes down.
- Renaming the Overseer, `overseer.log`, the `overseer` folder, the `oversee` verb with its `--started-by`, and
  `oversee resume` to `unpause`: stage 9.
- A new package: none is created or extracted in this stage.

## Needs the owner

Behaviour questions: none. Decisions 14, 30 and 35 to 41 answer every question this stage had; the run's calls R1 to
R9 settle the rest.

Acts only the owner can do:

1. **Gate G1:** record the fake agent's outage scenario, since no session may start a vendor session. Until then the
   outage row of WP3.14 and step 7 of the end-to-end check are skipped, with that reason in their titles.
2. **Gate G4:** ask for `bun run verify:integration`, which runs the real-system matrix of WP3.14 beyond its recording.

## Not established

- Stage 2's code for every need N1 to N10: stage 2 is not built, so the names in the table come from its plan
  (`stage-2-talos.md`). The builder confirms each name in the code before starting, and in particular that the renewer
  renews on an idle, healthy forge (N5).
- Whether Bun runs an `uncaughtException` listener with a working event loop long enough for the crash path's
  asynchronous step, and ends the process with a non-zero code when the value is rethrown from a microtask after the
  listeners are removed. WP3.7 proves it before building on it.
- How `kern.boottime` reads through the existing `sysctl` primitive of `DarwinProcessIdentity.ts`, and what Windows can
  answer for the boot start; WP3.4 answers `null` on Windows.
- Whether the Linux login unit restarts a failed process; the gate keeps a restart by the login item off either way.
- Whether driving `apps/gaia/src/testing/ScratchForge.ts` outside a recording spec is supported, for the end-to-end
  check.

Checked against `HEAD` and settled: the Airlock's candidate selection skips a held ticket
(`AirlockClaims.ts:166-169`); the frozen installed surface lists only what installed files name, so the verb `resume`
bumps no install version by itself (WP3.3); a served `/api/v<n>/<endpoint>` is mapped onto its unversioned route with
its query (`OverseerServer.ts:608-619`); Gaia's registry reader reads only the keys it names
(`RegistryMapUtil.ts:32-59`) and Gaia reads no board file (`ForgeLookUtil.ts:29`); the registry write is asynchronous
under its lock (`MonitorRegistration.ts:135`, `TrackerLock.ts:256`); and an `already-landed` rerun appends no landing
journal line (`Landing.ts:109-118`, `:160-171`).
