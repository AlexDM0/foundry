# Stage 0 and 1: Trace, decide, and close the monorepo migration

## Goal

The later stages start from facts and on a still base. The traces of recovery, of an Airlock landing and of the
Overseer's in-memory state are recorded below, a real Claude Code session that ended on a network outage is committed
as a stream fixture with claims, and the owner has answered every decision this stage lists, with the answers written
into the design. `docs/monorepo/migration.md` describes the landed monorepo, every item in it is ticked or closed with a
reason, and `main` is the one base of the refactoring: no branch waits to land beside it and no live tracker moves it.

## Depends on

- No earlier stage. Stage 0 runs first; stage 1 runs after stage 0's owner decisions (WP0.5), because two of its items
  (the `entities/integration` branch and the live trackers) are decided there.
- Hands to stage 2 (Talos): the recorded outage fixture and its claims (WP0.4), the measured result-line and retry-line
  fields Talos's ending patterns match, the answer to the install-line bound, and a quiesced repository.
- Hands to stage 3 (presence and recovery): the recovery trace (table A), the Airlock trace (table B), the in-memory
  state trace (table C), the corrections to the design in WP0.1, the baseline run of today's real-system recovery specs
  (WP0.2), and the answer on what follows an ending on a network outage.
- Hands to stage 4 (packages): the package names and contents decided in WP0.5 from the import graph in table E.
- Hands to every later stage: a `main` with no unmerged feature branch beside it, and the decision records 35 and on in
  design section 2.

## Decisions this stage carries out

- 12: traces what the pipeline decides from that lives only in memory (table C), so stage 3 can persist it.
- 13: traces every interruption cause and what resumes by itself today (table A), the behaviour stage 3 reverses.
- 14: traces what a crash of the Overseer interrupts today (nothing) and what it leaves behind (tables A and C).
- 15: records the first real session that ended on a network outage, the evidence Talos's pattern needs.
- 29: traces today's gate and install lines and where they run (tables A and C); the install bound is asked.
- 30: traces the crash bound of today (`JOB_RESUMES_BEFORE_FRESH`, then a fresh job) that stage 3 changes.
- 32: existing boards are set up anew, so the live trackers are quiesced rather than migrated (WP1.2).
- 33: names the packages stage 4 creates, before any builder runs (WP0.5).
- 34: no forge does this work, so both trackers stop moving `main` for the refactoring (WP1.2).

## Today's code

All paths are from the repository root. The traces are of `main` at `3e6cb660`. Line numbers shift once anything lands;
see Traps.

### A. Recovery as built: every interruption cause, and what resumes by itself

The board's resume rule is `crashBoundStepsOf` in `apps/forge/src/lib/tracker-model/Playbook.ts:375-389`. Its holds are
computed in `nextStepsOf` at `Playbook.ts:525-533`: `resumesAreHeld` is a usage limit, an install change, an unset
pipeline, an outage decision or a refused-key decision; a paused board holds new launches only (`newWorkIsHeld`,
`Playbook.ts:533`), never a resume.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The eight causes: `watcher-lost`, `agent-crashed`, `reboot`, `answer-delivery`, `usage-limit`, `handoff-red`, `forced-stop-refused`, `authentication-failed` | `apps/forge/src/lib/tracker-model/@types/Job.ts:76-84` | Changed in stage 2 (an end reason of the lease, of a clean quit, of a network outage) and stage 3 (which wait for an instruction) |
| Counted crashes are `watcher-lost` and `agent-crashed` only | `apps/forge/src/lib/tracker-model/constants/JobStates.ts:88`, `Playbook.ts:106-108` | Kept as the counted set; stage 2's new causes must not join it |
| `watcher-lost`: a lost Watcher whose recorded child group took the forced stop; set in the pass and at start | `apps/forge/src/services/overseer/DrivePass.ts:575`, `DrivePass.ts:477-480`, `apps/forge/src/services/overseer/Regrouping.ts:102-124` (line 120), `apps/forge/src/services/overseer/RefusedForcedStops.ts:35` | Replaced in stage 2: no Watcher; Talos's child record names the cause |
| `agent-crashed`: the Watcher ended with no closing result while the job ran, or a lost Watcher with no live child | `DrivePass.ts:574-575`, `Regrouping.ts:110` | Changed in stage 2 (Talos reports the end) and stage 3 (two resumes, then wait) |
| Both crash causes resume by themselves up to `JOB_RESUMES_BEFORE_FRESH` (2), then `replace-job` starts a fresh attempt on the same worktree | `apps/forge/src/shared/constants/LifecycleLimits.ts:12`, `Playbook.ts:311-314`, `Playbook.ts:384`, `Playbook.ts:386-387` | Changed in stage 3: after two resumes the job waits for an instruction |
| Two `replaced` endings in a row on a ticket open `job-lost` (default `ticket-park`) | `LifecycleLimits.ts:15`, `Playbook.ts:153-163`, `Playbook.ts:407-417` | Kept or retired by stage 3 once nothing replaces by itself |
| Counted crashes on jobs of different tickets back to back (`CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING`, 2) with no verified ending between pause the Overseer and open an `outage` decision | `LifecycleLimits.ts:8`, `Playbook.ts:135-151`, `Playbook.ts:540` | Kept; stage 2's lease end, clean quit and network-outage end must not count |
| `reboot`: a lost Watcher whose recorded boot identity differs from the current one; never counted, resumes whatever the count | `Regrouping.ts:108-111`, `Playbook.ts:311-314` | Changed in stage 3: waits for an instruction |
| `answer-delivery`: the Overseer stopped the Watcher itself to deliver an answer; resumes with the answer | `DrivePass.ts:570-571`, `apps/forge/src/services/overseer/AnswerDelivery.ts:43-45`, `AnswerDelivery.ts:107` | Kept as workflow (design section 7) |
| `usage-limit`: a top-level usage refusal; resumes once the marker's reset passed, a pass woken at the reset by a timer | `apps/forge/src/services/overseer/UsageLimits.ts:44`, `DrivePass.ts:525-530`, `DrivePass.ts:1234-1245`, `Playbook.ts:126-129` | Kept as workflow |
| `handoff-red`: a red gate or Customs check of a handoff; resumes the same session on its own bound (`RED_HANDOFF_RESUMES_BEFORE_PARKING`, 2), then parks the ticket | `apps/forge/src/services/overseer/JobLaunch.ts:1069`, `apps/forge/src/services/overseer/Airlocks.ts:695`, `Playbook.ts:357-367`, `LifecycleLimits.ts:14` | Kept as workflow |
| `forced-stop-refused`: a lost Watcher whose child tree refused the forced stop; never resumed, the stop retried each sweep, the last refusal ends the job blocked with one decision | `DrivePass.ts:477-480`, `Playbook.ts:374-377`, `DrivePass.ts:1512`, `apps/forge/src/services/overseer/CrashMatrix.spec.ts:890` | Changed in stage 2: the cause stays, set from a lost child's `child-<i>.refused-forced-stops` (stage 2, WP2.9); stage 3 keeps it as never resumed |
| `authentication-failed`: a refused API key; holds every launch and resume until User answers the decision | `apps/forge/src/services/overseer/ApiBillingStops.ts:36`, `Playbook.ts:526-532` | Kept |
| An Assistant interrupted for any cause is replaced, never resumed | `Playbook.ts:58-59`, `Playbook.ts:383` | Changed in stage 8 (off by default) |
| A product owner resumes by id once its question is answered; past the crash bound it waits or a fresh one takes its intake | `Playbook.ts:316-327` | Changed in stage 3 with the crash bound |
| A pipeline agent resumes even while no pipeline is set or the board is paused | `Playbook.ts:385`, `Playbook.ts:543-544` | Changed in stage 3 |
| A resume the vendor cannot take ends the job `replaced` with cause `resume-failed` and opens `resume-failed` (default `job-fresh`); an Airlock agent opens none | `apps/forge/src/services/overseer/JobResumption.ts:84-103` | Kept; the default move is stage 3's to revisit |
| At start, Regrouping attaches every live Watcher from the stored cursor, settles every lost one, and names an unclaimed instance for its re-spawn; a stop on purpose or a crash of the Overseer interrupts no live agent | `Regrouping.ts:223-244`, `DrivePass.ts:1483-1492` | Replaced in stage 2 (Talos reconnect) and stage 3 (reconcile) |
| `oversee stop` without `--now` leaves every agent Watcher running; with `--now` it stops only process Watchers (installs and gates), never an agent | `apps/forge/cli/overseer/OverseerForeground.ts:773-792`, `apps/forge/src/services/overseer/WatcherFleet.ts:340-365` | Changed in stage 2 (clean quit) and stage 3 (a stop on record) |
| `overseer-started` and `overseer-stopped` (`stopped` or `baton-passed`) are log records already | `apps/forge/src/lib/tracker-model/Jobs.ts:304-311`, `OverseerForeground.ts:169-176`, `OverseerForeground.ts:655`, `apps/forge/src/lib/tracker-model/@types/Job.ts:182` | Changed in stage 3: becomes the presence record's evidence |
| A session's error result (an outage whose retries ran out among them) moves a build or review to Customs like any closing result, and Customs ends it `failed` cause `no-report` | `DrivePass.ts:546-548`, `JobLaunch.ts:939-942`, `JobLaunch.ts:360-361` | Changed in stage 2: Talos reports the network-outage end first |
| The stream mapper reads a failure only as `budget-reached`, `rate-limited` (429) or `authentication-failed` (401, 403) | `apps/forge/src/lib/claude-code/ClaudeStreamMapper.ts:218-226`, `apps/forge/src/lib/agent-launch/AgentSessionEvent.ts:21-29` | Changed in stage 2: the adapter renders the ending patterns |
| The real-system matrix: 27 session, Watcher, Overseer, reboot, question, Assistant and product-owner rows on real processes and the fake agent | `apps/forge/src/services/overseer/CrashMatrix.integration.spec.ts:382-997` | Rows that assert a resume by itself are rewritten in stage 3; baselined in WP0.2 |
| The default-suite matrix: hold-journal replay, gate profiles at start, lock takeover, Apply cut short, session rows behind the Watcher boundary | `CrashMatrix.spec.ts:153-1331` | Same |
| The merge rows of the matrix (table B) | `apps/forge/src/services/overseer/CrashMatrix.merges.spec.ts:95-374` | Kept; they hold table B |

### B. Each step of an Airlock landing, and a stop in its middle

Every Airlock phase is written on the merge job's slot in its own hold (`Airlocks.ts:1-7`, `Airlocks.ts:515-517`), and a
hold's writes are atomic: `commitHold` writes a journal first and the next lock holder replays it
(`apps/forge/src/services/tracker/HoldJournal.ts:121-146`,
`apps/forge/src/services/tracker/TrackerPipeline.ts:153-185`). So a stop between holds always leaves the slot in the
last written phase, and the sweep's `advance` runs that phase again (`Airlocks.ts:965-980`). The column "A stop in
the middle" says whether that rerun is safe.

| What exists | Where (path:line) | A stop in the middle | What happens to it |
| --- | --- | --- | --- |
| Allocation: the tip is read, then claimed in a hold that checks the tip did not move | `Airlocks.ts:1233-1265`, `Airlocks.ts:1061-1072`, `Airlocks.ts:1205-1231` | Safe: nothing written before the claim; a moved tip claims nothing | Kept |
| `merge-in`: a `--no-ff` merge of the recorded target tip into the ticket's worktree, then `gating` in a hold | `Airlocks.ts:570-611`, `apps/forge/src/services/lifecycle/MergeRun.ts:50-53`, `apps/forge/src/lib/git/BranchMerge.ts:64-76` | Detectable: a merge left with `MERGE_HEAD` and no live holder frees the slot `orphaned` (abort, reset, requeue, `Airlocks.ts:580-585`); a finished merge reads `already-descends` on the rerun (`BranchMerge.ts:71-73`). Held by `CrashMatrix.merges.spec.ts:108` | Kept |
| A refresh's temporary worktree is prepared before its merge | `Airlocks.ts:573-579` | Safe: prepared again; never two refreshes (`CrashMatrix.merges.spec.ts:260`) | Kept |
| `resolving`, `re-reviewing`, `fixing`: an Airlock agent under a Watcher | `Airlocks.ts:720-731`, `Airlocks.ts:738-754` | Detectable: a live or interrupted agent keeps the slot; a `replaced` one is relaunched at the same attempt; any other ending frees the slot `orphaned` (`CrashMatrix.merges.spec.ts:122`, `:177-204`) | Changed in stage 2: the agent is Talos's child |
| `gating`: the merged-tree gate runs in the Overseer's own process, then its verdict is written in a hold | `Airlocks.ts:623-663`, `DrivePass.ts:1059-1083`, `DrivePass.ts:1168-1195` | Safe to redo for the board: the phase stays `gating` and the gate runs again, or lands ungated when the tree was last passed (`Airlocks.ts:631-637`). Not safe for the process: after a crash the gate's process group runs on, unstopped, and its gate slot counts as free once the Overseer's process is gone (`apps/forge/src/services/overseer/GateRunSlots.ts:107-112`) | Changed in stage 2: the gate runs under Talos, bounded at 15 minutes |
| `landing`: inside one hold, the target's branch and tip are compared with the slot's (compare-and-swap), `git merge --ff-only` moves the target, and the board records the landing | `Airlocks.ts:887-916`, `apps/forge/src/services/lifecycle/Landing.ts:120-136`, `apps/forge/src/lib/git/BranchIntegration.ts:169-184` | Detectable as done: a stop after the fast-forward and before the hold's journal leaves the target past the slot's tip; the rerun finds the merged commit an ancestor and answers `already-landed`, which finishes the board side (`Landing.ts:94-95`, `Landing.ts:109-118`). Held by `CrashMatrix.merges.spec.ts:96`, `:219`, `:242` | Kept |
| A project tracker's landing takes the repository's landing lock, then appends the landing journal line after the fast-forward | `Landing.ts:142-177` | Not redone: a stop between the fast-forward and the journal line leaves an unrecorded move, which a sibling tracker reads as `target-moved` and asks User (`Landing.ts:166-169`); the lock itself is taken over once its holder is gone (`Landing.ts:147`) | Kept; stage 3 may record it at start |
| After the landing hold: a refresh's worktree is removed, and a release removes the group's worktree and deletes its branch | `Airlocks.ts:917-919`, `Airlocks.ts:878-885` | Not redone and not detected: the job has ended, so nothing runs the cleanup again; a group worktree left on its branch is branch-owned, so Regrouping never names it (`Regrouping.ts:204-216`) | Stage 3: reconcile names it |
| `freeSlot`: the worktree is restored to the slot's start tip (merge abort, hard reset), then the jobs end in a hold | `Airlocks.ts:525-535`, `MergeRun.ts:55-59` | Safe by the compare-and-swap, not by design: a stop between the reset and the hold reruns the slot's phase on the restored worktree; the rerun merges again (`merge-in`) or gates the branch tree (`gating`), and a landing of a tree that lacks the target's tip is refused by `--ff-only` (`Landing.ts:131-135`) | Stage 3: reconcile reads a worktree that differs from its phase |
| The constitution commit, `committing`: a detached worktree at the tip, the file written, committed, checked to change one path | `Airlocks.ts:1103-1129`, `apps/forge/src/services/overseer/ConstitutionCommits.ts:84-113` | Detectable: a worktree already there is a run cut short, so the job ends `orphaned` and a fresh job commits again (`Airlocks.ts:1100-1106`, `CrashMatrix.merges.spec.ts:319`) | Kept |
| The constitution commit, `landing`: the same compare-and-swap fast-forward, and Apply's stage 2 in the same hold | `Airlocks.ts:1136-1188` | Detectable as done, as a ticket's landing (`CrashMatrix.merges.spec.ts:332`); main already holding the text finishes Apply with no commit (`Airlocks.ts:1190-1199`, `CrashMatrix.merges.spec.ts:360`) | Kept |
| A stale green re-gated outside any slot | `Airlocks.ts:465-495` | Safe: the verdict is applied in a hold that checks the ticket still waits on the same tree (`Airlocks.ts:432-436`) | Changed in stage 2: the gate is Talos's child |
| Git runs synchronously with no timeout, the fast-forward and every worktree add among it | `apps/forge/src/lib/git/GitProcess.ts:59-87` | A hung git blocks the Overseer's event loop, and with it any timer | Stage 2: the lease renewal must not depend on it |

### C. State the Overseer holds only in memory, and which decisions read it

| What exists | Where (path:line) | Which decision reads it | What happens to it |
| --- | --- | --- | --- |
| `spawnedInstances`: the job instances this process spawned | `DrivePass.ts:955`, `DrivePass.ts:904-916` | Whether a job needs a Watcher; after a restart Regrouping names unclaimed instances instead (`Regrouping.ts:239-240`) | Replaced in stage 2 (Talos's child record) |
| `lastFingerprint`, `running`, `wokenAgain`, `forcedNext`: pass scheduling | `DrivePass.ts:956-959`, `DrivePass.ts:1249`, `DrivePass.ts:1458-1481` | Whether an unforced wake runs a pass; no board decision | Kept in memory: a restart runs a forced pass (`DrivePass.ts:1489`) |
| Quiet-job counts: sweeps each running build or review was quiet | `DrivePass.ts:960-961`, `apps/forge/src/services/overseer/IncidentRouter.ts:33` | Opens `quiet-job` after `QUIET_JOB_SWEEPS` (6) sweeps (`DrivePass.ts:1288`, `apps/forge/src/shared/constants/OverseerLimits.ts:18`); a restart starts the count at zero | Changed: becomes a time bound (`apps/forge/CLAUDE.md` Deviations); persisted or derived in stage 3 |
| The Assistant's quiet watch and its mid-turn list | `DrivePass.ts:965-967`, `apps/forge/src/services/overseer/AssistantSession.ts:246` | Ends a quiet Assistant (`DrivePass.ts:1290`) | Changed in stage 8 (Assistant off by default) |
| `assistantBootRetryRequested` | `DrivePass.ts:968`, `DrivePass.ts:1291-1292` | The Playbook's `assistantBootRetryDue` (`Playbook.ts:536`) | Changed in stage 8 |
| `forcedStopRetryJobIdsDue`, `jobsAtTheLastPass`, `targetsHeldAtTheLastPass` | `DrivePass.ts:962-964`, `DrivePass.ts:1508-1525` | Which sweeps force a pass | Replaced in stage 2 (forced stops) and kept for the sweep |
| The state document: `notices`, `runtimeState`, `legacyWatcherJobIds`, `ticketsWaitingForMachineSlot`, `passes` | `DrivePass.ts:249-283`, `DrivePass.ts:969-971`, `DrivePass.ts:1428-1445` | The read API and the Bridge; the sweep retries a ticket waiting for a machine slot (`DrivePass.ts:1514`) | Changed in stages 2 and 3 (legacy Watchers go; presence joins) |
| `resetTimer`: the pass at the usage reset | `DrivePass.ts:973`, `DrivePass.ts:1234-1245` | Wakes the pass that resumes limited jobs; derived again each pass from the usage marker file | Kept |
| `leftoverWorktrees`, `declinedCleanups` | `DrivePass.ts:974-975`, `DrivePass.ts:1217-1223` | Opens `leftover-worktree` decisions; the `cleanup-declined` notice | Kept; stage 3's reconcile owns the first |
| `endedJobIdsExamined`, `endedSessionsAwaitingClose`, `triedPipelineAgentSnapshots`, `hatchFolderOfLaunchedJob` | `DrivePass.ts:1023-1025`, `DrivePass.ts:1139`, `DrivePass.ts:1376-1382` | Token credit (also derived from the log), the close of an ended session's input, snapshot removal, folder watches | Changed in stage 2 (input close goes through Talos) |
| `mergedTreeGateProcesses`: the merged-tree gates running now | `DrivePass.ts:1059-1083`, `DrivePass.ts:1494-1502` | Stopped at a clean stop; lost with a crash | Replaced in stage 2 (Talos's child record) |
| Gate profile runs and pipeline checks running in this process | `apps/forge/src/services/overseer/GateProfiling.ts:155`, `GateProfiling.ts:244-248`, `apps/forge/src/services/overseer/PipelineChecking.ts:97` | At the next start their board records read stopped and their worktrees are removed, the process not stopped | Replaced in stage 2 |
| Gate slot rounds: refused and waiting holders of this process | `GateRunSlots.ts:125-126` | Which gate gets the next machine-wide slot | Kept |
| `heldTargets`, `commitsAHeldMainLineWaitsToLand` | `Airlocks.ts:365-373`, `Airlocks.ts:842-850` | Allocation refuses a held target (`Airlocks.ts:1223`, `Airlocks.ts:1238`); a restart forgets the hold and the next landing holds again | Persisted or derived in stage 3 |
| The install-change watch: the versions learned from the program on disk | `apps/forge/src/services/overseer/InstallChangeWatch.ts:80-85`, `OverseerForeground.ts:364-377` | `installVersionChanged` holds every resume and launch (`Playbook.ts:526`) | Kept; asked again at start |
| Event broker: replay buffer, sequence, last state | `apps/forge/src/services/overseer/EventBroker.ts:87-91` | The event stream's replay to a reconnecting reader | Kept in stage 8's read API; a restart starts a new sequence |
| Monitor stream's latest snapshot | `apps/forge/src/services/overseer/MonitorStream.ts:16-18` | The monitor stream | Kept |
| Merge forecast cache and main-line reads | `apps/forge/cli/overseer/routes/BoardStateReader.ts:66-78`, `apps/forge/src/services/overseer/MainLineReads.ts:10-14` | Display only | Kept |
| Browser sessions and session codes | `apps/forge/src/services/overseer/BrowserSessions.ts:31-32` | Bridge access | Deleted in stage 8 |
| Flint's brain phase | `apps/forge/src/services/overseer/FlintBrain.ts:151-153` | The brain's runs | Deleted in stage 8 |
| The foreground's serving state: the pinned Watcher bundle, the token, the Baton pass warning, `handingOver` | `OverseerForeground.ts:379-395` | `runtimeState` `passing-baton`; the bundle path of every launch | Changed in stage 2 (no bundle) and stage 3 |
| Data-folder watch: debounce and the Hatch folder watches | `apps/forge/src/services/overseer/DataFolderWatch.ts:41-64` | Wakes a pass | Kept |

### D. What `docs/monorepo/migration.md` still has open, against what the repository shows

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The status line says P7 waits for the owner's go | `docs/monorepo/migration.md:7-9` | Changed in WP1.1: the root tracker is gone (`.forge` absent at the root), `apps/forge/.forge` and `apps/gaia/.forge` exist, and `main` carries P8's commits (`git log`, `190afd88`, `28a319c8`) |
| P6: the owner's review and go, unticked | `migration.md:132` | Ticked in WP1.1 with the landing as its evidence |
| P7 unticked steps: quiesce, fast-forward, installed clone, forge's tracker into `apps/forge`, its gates, Gaia's tracker, login items, `gaia install-app`, smoke, Gaia's old checkout, the Claude Code memory | `migration.md:139-156` | Ticked in WP1.1 where WP1.1's checks show them done: both trackers' `pipeline.json` carry version 3, a prepare `bun install --frozen-lockfile` in `/`, gates `bun run gate:<app>` and `bun run cache:audit` in `/`, and the reach the root `CLAUDE.md` names; two LaunchAgents `com.forge.overseer.<trackerId>.plist` exist; `~/Applications/Gaia.app` exists; the installed clone `~/.forge-program` is at `28a319c8`; the worktree `graphite-orange-handoff-ebd9dc` is no longer listed. The smoke, the copy of Gaia's old checkout and the memory are the owner's to confirm |
| P8: B15 (`repositoryRoot` and `projectPrefix` in the registry and the monitor snapshot) open; no code names either field in `packages/forge-contracts`, `apps/forge/cli/RegisterWrittenTracker.ts` or `MonitorSnapshotAssembly.ts` | `migration.md:109`, `migration.md:172` | Closed in WP1.1 by the owner's answer |
| Open decision 1: restart after Update forge for an older forge | `migration.md:197` | Closed in WP1.1 by the owner's answer |
| Open decision 2: rule changes under `.claude/rules/` are the owner's | `migration.md:198-199`; already decided in `apps/forge/CLAUDE.md:281-284` | Closed in WP1.1 as decided |
| Open decision 3: `CodeVersion` hashes the whole root `bun.lock` | `migration.md:200-201`; the code now hashes the program's part of the lockfile through its dependency graph (`apps/forge/src/services/overseer/CodeVersion.ts:3`, `CodeVersion.ts:44-55`) | Closed in WP1.1 as done, after WP1.1 confirms it with `CodeVersion.spec.ts` |
| Open decision 4: install version 29 asks every board to update | `migration.md:202-204` | Closed in WP1.1: boards are set up anew (decision 32) |
| Uncommitted edits of the clock rules in both apps' rules, and the untracked design and figures | `git status`: `apps/forge/CLAUDE.md`, `apps/gaia/CLAUDE.md`, `docs/monorepo/hephaestus-talos.md`, `docs/monorepo/hephaestus-talos.html`, `docs/monorepo/figures/` | Committed or discarded by the owner in WP1.2 |
| An unmerged branch, `entities/integration`: 52 commits ahead of `main`, 4 behind, 399 files, forge 1.9 to 1.11, install version 32; its worktrees `entities-integration`, `entities-u4.5`, `entities-u4.6` | `git rev-list --count main..entities/integration`, `git log entities/integration` (`b601ce7a`, `72da4047`) | Landed or set aside in WP1.2 by the owner's answer |
| `claude/project-thread-dw1bcu`, 5 commits ahead, kept since P0 | `migration.md:32-34` | Deleted or kept by the owner in WP1.2 |
| Both trackers live: forge's ticket worktrees 001, 005, 008, 009, 014 and Gaia's 001, each branch 0 commits ahead of `main` | `git worktree list`; `apps/forge/.forge-worktrees/`, `apps/gaia/.forge-worktrees/` | Quiesced by the owner in WP1.2 |

### E. The import graph that stage 4's packages come from

Measured with a walk of every `.ts` and `.tsx` file under `apps/forge` (the folders `node_modules`, `.forge`,
`.forge-worktrees`, `.turbo` and `.claude` left out), resolving relative imports.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The tracker model: 108 shipping files and 84 spec and testing files; its shipping files import nothing outside their folder, and its specs import only `src/testing/BoardFixtures.ts` (46), `SourceMutant.ts` (3), `GreenQueue.ts` (2), `EveryBoardLogRecord.ts` (1) | `apps/forge/src/lib/tracker-model/`; the guard `apps/forge/src/ImportDirection.spec.ts:161`, `:395-397` | Moved in stage 4 into the package named in WP0.5 |
| Files outside the model that import it: 438, of which 265 ship: 100 in `bridge/`, 51 in `cli/`, 31 in `src/services/overseer`, 14 in `src/services/control`, 9 in `src/services/lifecycle`, 7 in `src/services/tracker`, 4 in `src/services/render`, 41 in `src/adapters`, 8 in `src/shared` | the walk | Changed in stage 4: imports by package name |
| The Bridge's shipping reach outside `bridge/`: the tracker model's types, constants and utils; `src/shared/monitor/` (`AttentionEntries.ts`, `TodayFigures.ts`, `@types/MonitorSnapshot.ts`, four wording utils); `src/lib/token-count/`, `src/lib/local-time/`, `src/lib/html-escape/`; the constants `ProductNames.ts`, `DispatchProtocol.ts`, `OverseerLimits.ts`, `OverseerApiContracts.ts`, `TimestampSlices.ts` | `apps/forge/bridge/tsconfig.json:12-42` and on | Changed in stage 4: the include list shrinks to packages |
| `src/shared/monitor/` is also read by the Overseer's server, the monitor snapshot, the monitor stream and the board state reader | `OverseerServer.ts`, `MonitorSnapshotAssembly.ts`, `MonitorStream.ts`, `apps/forge/cli/overseer/routes/BoardStateReader.ts` | Moved in stage 4 |
| The board document `BoardState`, assembled from the Board, render facts and page payload; the Bridge keeps its own field-exact mirrors of it | `apps/forge/src/services/overseer/BoardState.ts:168`, `apps/forge/bridge/@types/ProgressBoardState.ts:1`, `KanbanBoardState.ts`, `TicketsBoardState.ts` | Its types move to the package named in WP0.5 |
| `forge-contracts` today: 9 command kinds, the summary and monitor documents, versions, the registry; depends on `system-versions` only; system version 1.1 | `packages/forge-contracts/package.json:2-29`, `packages/forge-contracts/constants/ForgeSystemVersions.ts:15-16` | Gains the board and ticket documents in stage 4 (WP4.6), in the package WP0.5 decides |

### F. Where the design states something the code contradicts

WP0.1 corrects each of these in the design.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| Design section 3.1 says a record that a stop or a Baton pass completed is missing; the log holds `overseer-stopped` with reason `stopped` or `baton-passed`. What is missing is a heartbeat and a start that reads the record | `apps/forge/src/lib/tracker-model/Jobs.ts:309-311`, `apps/forge/cli/overseer/OverseerForeground.ts:171`, `:655` | Design corrected in WP0.1; stage 3 builds on the existing record |
| Design section 7's table says a stop on purpose "resumes by itself" today; a stop interrupts no agent, since Watchers are detached and reattached at the next start, and `stop --now` stops only install and gate Watchers. A crash of the Overseer interrupts no agent either | `Regrouping.ts:234-236`, `WatcherFleet.ts:340-345` | Design corrected in WP0.1 |
| Design sections 7 and 12 say the Airlock steps were not traced; table B traces them, and three steps are not redone: the landing journal line, the release cleanup, and the tip restore before `freeSlot`'s hold | table B | Design corrected in WP0.1; stage 3's reconcile covers the three |
| Design section 11 says the tracker model is about 110 files imported by about 280 forge files; measured, 108 shipping files (192 with specs) imported by 438 files, 265 of which ship. The order of size stands | table E | Design's numbers corrected in WP0.5 with the package decision |

## Work packages

Parallel groups: WP0.1, WP0.2 and WP0.3 touch no common file and may run at the same time. WP0.4 runs after WP0.3.
WP0.5 runs after WP0.1 (both change `docs/monorepo/hephaestus-talos.md`) and after the owner has answered "Needs the
owner". WP1.1 runs after WP0.5, because it closes the migration's items with the owner's answers (item 9); it changes
only `docs/monorepo/migration.md`, so it may run beside WP0.4. WP1.2 runs alone, after WP0.5 and WP1.1, because it
changes branches and the main checkout. WP1.3 runs last and alone.

Every package works in a worktree under `.claude/worktrees/<name>` cut from `main`, never in the main checkout, which
the live trackers land on until WP1.2 quiesces them. Evidence goes to `.claude/.evidence/hephaestus-talos/` in the main
checkout, which `.gitignore:16` already ignores (`.claude/.evidence/`).

### WP0.1 Bring the design in line with the traces

Purpose: the design states three things the traces show otherwise, and two things as untraced that are now traced.
Later stages read the design first, so it must not mislead them.

Files to change: `docs/monorepo/hephaestus-talos.md`.

What to do:

1. In section 3.1, "Presence", replace the claim that a record of a completed stop or Baton pass is missing. State that
   the log already holds `overseer-started` and `overseer-stopped` with reason `stopped` or `baton-passed`
   (`apps/forge/src/lib/tracker-model/Jobs.ts:304-311`), written by the Overseer before it releases its Baton
   (`apps/forge/cli/overseer/OverseerForeground.ts:169-176`, `:655`). State what is still missing: a heartbeat, and a
   presence record that a start reads to classify itself (the log line is not read at start today).
2. In section 7, table "Which interruptions wait for an instruction", row "`reboot`, a stop on purpose, a lease end",
   correct the "Today" cell: a stop on purpose interrupts no agent today, since each Watcher is detached and the next
   start attaches it (`Regrouping.ts:223-244`), and `stop --now` stops only install and gate Watchers
   (`WatcherFleet.ts:340-365`). Do the same for the row "The forge crashed": a crash of the Overseer interrupts no
   agent.
3. In section 7, "What must be persisted", replace the sentence "Whether every Airlock step is safe to redo or
   detectable as done has not been traced" with a two-sentence summary of table B of this plan and a link to it, naming
   the three steps that are not redone: the landing journal line, the release cleanup, and the tip restore before
   `freeSlot`'s hold.
4. In section 12, "Risks", item 5, say that the trace exists and what it found, in one sentence, with the link.
5. In section 7, add one sentence: a paused board holds no resume today (`Playbook.ts:532-533`).
6. Keep the prose wrapped at 120 columns, plain English, no history.

Specs: none (a document).

Done when: `git diff --stat` shows only `docs/monorepo/hephaestus-talos.md`; every changed sentence cites a path that
exists (`grep -o 'apps/forge/[^`:]*' docs/monorepo/hephaestus-talos.md | sort -u | xargs ls` lists no missing file).

### WP0.2 Baseline today's real-system recovery specs

Purpose: stage 3 rewrites the rows that assert a resume by itself. A recorded green run of today's matrix proves which
rows held before, so stage 3 can tell a changed row from a broken one.

Files to create: `.claude/.evidence/hephaestus-talos/stage-0/recovery-baseline.txt` in the main checkout (ignored, not
committed). No tracked file changes.

What to do:

1. In a worktree of `main`, run `bun install --frozen-lockfile` at the root.
2. In `apps/forge`, run each of these alone, in this form (`apps/forge/CLAUDE.md:20-22`; never `verify:integration`):
   `bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/CrashMatrix.integration.spec.ts`,
   then the same for `./src/services/overseer/Regrouping.integration.spec.ts` and
   `./src/services/overseer/JobResumption.integration.spec.ts`, then the default-suite files
   `./src/services/overseer/CrashMatrix.spec.ts`, `./src/services/overseer/CrashMatrix.merges.spec.ts`,
   `./src/lib/tracker-model/Playbook.spec.ts`. These start the fake agent only; the preload
   `src/testing/ProgramTrapGuard.ts` fails any run that reaches a real `claude`.
3. Write to the evidence file: the commit, the date, each command, its pass, fail and skip counts, and the names of the
   test cases that assert a resume by itself. Find them by name: every case title in table A's matrix rows that says
   "resumed", "resumes" or "re-spawns" (`CrashMatrix.integration.spec.ts:469`, `:495`, `:528`, `:537`, `:573`, `:836`;
   `CrashMatrix.spec.ts:1155`, `:1177`), each with its line.
4. If a run is red, record the failing case and its output, and stop: stage 3 must not start on a red baseline. Report
   it to the owner.

Specs: none changed.

Done when: the evidence file exists with every command's counts, and every listed run reports 0 failures.

### WP0.3 The owner records a session that ends on a network outage

Purpose: decision 15 needs the fields of a real ending on an outage. No such session is recorded (design section 12,
risk 13). No agent may start a `claude` session, so the owner runs every step. Claude Code 2.1.326 is installed
(`~/.local/bin/claude` links to `~/.local/share/claude/versions/2.1.326`); its program text names the retry setting
`CLAUDE_CODE_MAX_RETRIES` and writes a `system` line of subtype `api_retry` with `attempt`, `max_retries`,
`retry_delay_ms`, `error_status`, `error` and, for no response, `no_response.waited_ms`.

Files to create (owner, outside the repository): a scratch folder, for example `/tmp/outage-probe/`, and the raw logs
copied afterwards to `.claude/.evidence/hephaestus-talos/stage-0/outage/` in the main checkout.

What the owner does, step by step:

1. Make a scratch repository outside every tracked repository, so no forge hook and no repository `CLAUDE.md` loads:

   ```sh
   mkdir -p /tmp/outage-probe/repo && cd /tmp/outage-probe/repo
   git init -q && git commit -q --allow-empty -m start
   ```

2. Write the one input line. A shell sleep keeps the turn open while the network goes off. This is the stdin format of
   the committed fixtures (`apps/forge/src/lib/claude-code/testing/fixtures/rate-limit-rejected.stdin.jsonl`):

   ```sh
   printf '%s\n' '{"type":"user","message":{"role":"user","content":"Run exactly this shell command with the Bash tool, unchanged: sleep 45 . Then reply with one word."}}' \
     > /tmp/outage-probe/stdin.jsonl
   ```

3. Recording A, the default retries, which is the ending Talos must recognise. In a terminal with the network on, start
   the session in a clean environment, as the earlier probes did
   (`apps/forge/docs/development/overseer-claude-probe.md:394-401`):

   ```sh
   cd /tmp/outage-probe/repo
   env -i HOME="$HOME" PATH="$PATH" USER="$USER" \
     claude -p --input-format stream-json --output-format stream-json --verbose --model haiku \
       --permission-mode acceptEdits --allowedTools Bash \
     < /tmp/outage-probe/stdin.jsonl > /tmp/outage-probe/a.stdout.jsonl 2> /tmp/outage-probe/a.stderr.txt
   ```
4. In a second terminal, watch the log: `tail -f /tmp/outage-probe/a.stdout.jsonl`. As soon as an `assistant` line with
   a `tool_use` of `Bash` appears, turn Wi-Fi off and unplug any cable. Leave the network off until a line with
   `"type":"result"` appears. This can take minutes: the client waits between retries. Do not turn the network on before
   the result line, or the recording shows a recovery instead of an ending.
5. Turn the network on. Copy `stdin.jsonl`, `a.stdout.jsonl` and `a.stderr.txt` to
   `.claude/.evidence/hephaestus-talos/stage-0/outage/` in the main checkout, and write beside them a `notes.txt` with
   the date, `claude --version`, the macOS version (`sw_vers -productVersion`), when the network went off and on, and
   the login kind (subscription or API key).
6. Recording B, optional and short: the same as steps 3 to 5 with `CLAUDE_CODE_MAX_RETRIES=2` added after `env -i` and
   the files named `b.*`. It shows whether the setting bounds the retries. It does not replace recording A.
7. Recording C, optional, a server error: a real 5xx or 529 cannot be caused on demand. If the owner wants one, it is a
   stand-in as in probe P10 (`overseer-claude-probe.md:615-631`): `ANTHROPIC_BASE_URL` pointed at a local server that
   answers 529, and it is labelled a stand-in in its notes.

Specs: none.

Done when: `.claude/.evidence/hephaestus-talos/stage-0/outage/a.stdout.jsonl` exists, its last line has
`"type":"result"`, and the lines before it include at least one `"subtype":"api_retry"` line. If the result never came
or no retry line was written, the owner records what happened in `notes.txt` and WP0.4 reports it as a finding instead.

### WP0.4 Commit the outage fixture and its claims

Purpose: turn recording A into the portable evidence stage 2 builds its ending patterns on, held by claims so a later
re-recording that no longer shows the ending fails.

Depends on WP0.3.

Files to create:

- `apps/forge/src/lib/claude-code/testing/fixtures/network-outage-retries-spent.stdout.jsonl` and
  `apps/forge/src/lib/claude-code/testing/fixtures/network-outage-retries-spent.stdin.jsonl`: the folder of every
  recorded stream fixture, and a pair because `ClaudeStreamFixtures.spec.ts:43-52` requires every `.jsonl` to have its
  partner.

Files to change:

- `apps/forge/src/lib/claude-code/ClaudeStreamFixtures.spec.ts`: a new `describe` block
  `network-outage-retries-spent (P23, Claude Code 2.1.326)`.
- `apps/forge/docs/development/overseer-claude-probe.md`: a new entry `### P23: a session whose retries ran out on a
  network outage` after `### P21` and before `### Not answered on 2026-11-15` (`overseer-claude-probe.md:851-864`), a
  row in the table "The committed fixtures" (`:411-418`), and the version note (`:365-366`).

What to do:

1. Copy `a.stdout.jsonl` and `stdin.jsonl` from the evidence folder into the two fixture files.
2. Make them synthetic as the other fixtures are (`overseer-claude-probe.md:405-409`): set every `session_id` to
   `7a1f0c52-0001-4000-8000-000000000001` (`ClaudeStreamFixtures.spec.ts:15`); replace `cwd`, `original_cwd`,
   `memory_paths` and `messaging_socket_path` of the `init` line with `/repo` paths; replace the `skills`,
   `slash_commands`, `plugins`, `agents` and `mcp_servers` lists with empty lists; remove every account id, email,
   organisation id and request id; keep every other key and value of every line, the `api_retry` lines and the result
   line byte for byte apart from those replacements. Keep one JSON object per line.
3. Write the claims. Each claim reads a field, never free text:
   - the stream holds at least one `system` line of subtype `api_retry`, and each carries a numeric `attempt` and
     `max_retries`;
   - the `attempt` values rise by one, and the last one equals `max_retries` (if the recording shows otherwise, write
     the claim the recording supports and note it in P23);
   - the stream ends in one `result` line with `is_error` true;
   - the result names its API failure in fields: record which of `api_error`, `api_error_status` and `terminal_reason`
     it carries and with what values, and claim exactly those;
   - no `rate_limit_event` line is in the stream, so the ending cannot be read as a usage limit.
4. Do not add the fixture to the replay list of `ClaudeStreamMapper.spec.ts:102`: today's mapper has no ending of this
   kind. Stage 2 holds this fixture against Talos's ending pattern (stage 2, WP2.2) and keeps the mapper as it is,
   since Talos, not the mapper, recognises the outage.
5. Write P23 in past tense, like the entries before it: what ran, the command, what the stream showed field by field,
   how long the retries took from the first `api_retry` line to the result, and whether recordings B and C were made.
   End it with a "Selects" line: Talos's network-outage pattern matches the result's fields and the count of
   `api_retry` lines, never the result text.

Specs: `ClaudeStreamFixtures.spec.ts` must prove each claim of step 3 on the committed fixture, and the existing pair
check must pass with the new pair.

Done when, in `apps/forge`:

```sh
bun test --path-ignore-patterns='.claude/**' \
  ./src/lib/claude-code/ClaudeStreamFixtures.spec.ts ./src/lib/claude-code/ClaudeStreamMapper.spec.ts
grep -c '"subtype":"api_retry"' src/lib/claude-code/testing/fixtures/network-outage-retries-spent.stdout.jsonl
grep -E "$(basename "$HOME")|@" src/lib/claude-code/testing/fixtures/network-outage-retries-spent.*
```

the specs pass, the count is 1 or more, and the last grep prints nothing; at the root `bun run verify` is green.

### WP0.5 Record the owner's decisions in the design

Purpose: decisions 33 and the two open items of design section 12 are taken before stage 2. They must be written where
every later stage reads them.

Depends on WP0.1 and on the owner's answers to "Needs the owner" below.

Files to change: `docs/monorepo/hephaestus-talos.md`.

What to do:

1. Append the owner's answers to section 2 as decisions numbered from 35, one sentence or two each, in the list's style:
   what follows an ending on a network outage; the install-line bound; the packages stage 4 creates, by name, with their
   contents in one clause each; where the board documents live; what happens to `entities/integration`; the quiet
   period of the live trackers.
2. In section 12, "To decide", replace each settled item with "Settled by decision <n>." Keep a still-open item as
   it is.
3. In section 11, the stage 4 row, replace "Which packages exist is settled in stage 0" with the names of the decided
   packages, and replace "about 110 files, imported by path from about 280 forge files" with the measured counts of
   table E (108 shipping files, imported by 265 shipping files and 173 specs).
4. If the owner chose to wait for an instruction after a network outage, add the cause to the table in section 7 in the
   "Waits for an instruction" group; if the owner chose to resume by itself, add it to the workflow group with the probe
   interval the owner named.

Specs: none.

Done when: section 2 holds the new decisions, section 12 "To decide" holds no item that the owner answered, and
`grep -n "settled in stage 0" docs/monorepo/hephaestus-talos.md` prints nothing.

### WP1.1 Bring the migration checklist to the landed monorepo

Purpose: `docs/monorepo/migration.md` still says P7 waits for the go (`migration.md:7-9`). Close it so it no longer
names open work, with evidence for each tick.

Files to change: `docs/monorepo/migration.md`.

What to do:

1. Check each P7 item read-only and keep the result for the commit message:
   - `ls -d .forge .forge-worktrees` at the root fails (the root tracker is gone);
   - `apps/forge/.forge/pipeline.json` and `apps/gaia/.forge/pipeline.json` read `version` 3, a prepare step
     `bun install --frozen-lockfile` with `in` `/`, the gates `bun run gate:forge` (or `gate:gaia`) and
     `bun run cache:audit` with `in` `/`, and the reach of the root `CLAUDE.md` table (read them with a JSON reader;
     write nothing into `.forge`);
   - `ls ~/Library/LaunchAgents | grep com.forge.overseer` shows two items;
   - `ls -d ~/Applications/Gaia.app` exists;
   - `git -C ~/.forge-program log --oneline -1` shows the installed clone's commit;
   - `git worktree list` shows no `graphite-orange-handoff-ebd9dc`.
   Never read or list `~/.forge-monitor` or `~/.gaia`, and run no forge verb.
2. Tick P6's last item and every P7 item step 1 proved. Leave the smoke, the copy of Gaia's old checkout and the
   Claude Code memory unticked unless the owner confirmed them in WP0.5's answers; if confirmed, tick them, quoting the
   owner's answer as "the owner confirmed on <date>".
3. Replace the status line (`migration.md:7-9`) with the landed state: P0 to P8 done, the trackers live in
   `apps/forge` and `apps/gaia`, the installed forge in a second clone.
4. Close B15 and the four "Still open" decisions (`migration.md:195-204`) with the owner's answers: move each to
   "Decisions" as "Decided by the owner on <date>" with one clause, or to "Backlog" with why it waits. Decision 2 is
   closed by `apps/forge/CLAUDE.md:281-284`; decision 3 is closed by `CodeVersion.ts:3` once
   `bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/CodeVersion.spec.ts` in `apps/forge` passes.
5. Remove nothing from the history of a phase; only the status, the ticks, "Still open" and "Backlog" change.

Specs: none.

Done when: `grep -n '\- \[ \]' docs/monorepo/migration.md` prints only items the owner left open on purpose, each with
its reason, and the "Still open" list is empty or names only items with the owner's reason to wait.

### WP1.2 Settle the base: branches, uncommitted edits and the live trackers

Purpose: the refactoring changes the Playbook, the Watcher and every stored name; a branch or a tracker that moves
`main` beside it turns each stage's traces and line numbers stale. Runs alone.

Files to change: none of the source. Git branches and worktrees only, and the owner's commands.

What to do:

1. The owner commits or discards the uncommitted edits of `apps/forge/CLAUDE.md` and `apps/gaia/CLAUDE.md`, and
   commits `docs/monorepo/hephaestus-talos.md`, `docs/monorepo/hephaestus-talos.html`, `docs/monorepo/figures/` and
   `docs/monorepo/hephaestus-talos-implementation/`. Each commit is one plain subject line with no attribution.
2. `entities/integration`, as the owner decided:
   - to land it: in its worktree run `bun install --frozen-lockfile` and `bun run verify` at the root; on green,
     fast-forward or merge `main` to it as the owner says, then remove the worktrees `entities-integration`,
     `entities-u4.5` and `entities-u4.6` with `git worktree remove` and delete the merged branches with `git branch -d`;
     then rerun the traces of tables A to C on the new `main` and update this file's line numbers in the same change;
   - to set it aside: leave the branch and its worktrees, and add one line to `docs/monorepo/migration.md`'s "Backlog"
     naming the branch, its head commit and that it lands after stage 9 or never.
3. `claude/project-thread-dw1bcu`: delete with `git branch -D` only on the owner's answer; otherwise leave it.
4. The live trackers, quiesced by the owner (Claude runs no forge verb here, `apps/forge/CLAUDE.md:349-351`). Hand the
   owner this command list, run with the installed program in each app folder:
   - let each in-flight ticket land or stop it (`forge job stop <J>` per live job, `docs/cli.md:1372`);
   - `forge stop` in `apps/forge`, then in `apps/gaia`;
   - `forge login-item remove` in each folder (`docs/cli.md:1254`), so a login does not start an Overseer during the
     refactoring;
   - confirm with `forge login-item status` in each folder: `state` `absent`.
5. Record in `.claude/.evidence/hephaestus-talos/stage-1/base.txt`: `git rev-parse main`, `git branch --no-merged main`,
   `git worktree list`, and the owner's confirmation that both Overseers are stopped.

Specs: none.

Done when: `git status --porcelain` in the main checkout prints nothing; `git branch --no-merged main` prints only
branches the owner set aside, each named in the backlog; `git worktree list` shows no `.forge-worktrees` folder with a
live job; the owner confirmed both Overseers stopped and both login items absent.

### WP1.3 The stage's gate

Purpose: prove the base is green before stage 2 starts.

Files: none.

What to do: in a fresh worktree of `main` under `.claude/worktrees/stage-1-gate`, run the root verification below, then
remove the worktree.

Done when: every command of "Verification of the whole stage" ends with exit 0, and the cold forced run is green once.

## Interfaces introduced

No type, frame, command kind or endpoint is introduced in code by this stage. It introduces these records and names,
which later stages build on.

1. **The outage fixture pair.** In `apps/forge/src/lib/claude-code/testing/fixtures/`:
   `network-outage-retries-spent.stdout.jsonl` and `network-outage-retries-spent.stdin.jsonl`. Format: one JSON object
   per line, as every fixture pair. Session id `7a1f0c52-0001-4000-8000-000000000001`; paths synthetic under
   `/repo`. Lines stage 2 matches:
   - retry line: `{ "type": "system", "subtype": "api_retry", "attempt": number, "max_retries": number,
     "retry_delay_ms": number, "error_status": number | null, "error": string, "no_response"?: { "waited_ms": number },
     "session_id": string, "uuid": string }`, the key set read from the 2.1.326 program text and confirmed or corrected
     by the recording;
   - closing line: `{ "type": "result", "is_error": true, "subtype": string, "api_error": ..., "api_error_status":
     number | null, "terminal_reason": string, ... }`, with the exact values the recording shows written into P23 and
     the claims. These keys are present on the committed P10 result line
     (`rate-limit-rejected.stdout.jsonl`), so they are the stable fields to match.
2. **Probe record P23** in `apps/forge/docs/development/overseer-claude-probe.md`: heading, a "What the run showed"
   block, a "Selects" line; the next free number, since the record ends at P21 and the fixture claims name P22 for
   Flint's brain (`ClaudeStreamFixtures.spec.ts:165`).
3. **The claims block** `describe('network-outage-retries-spent (P23, Claude Code 2.1.326)')` in
   `ClaudeStreamFixtures.spec.ts`, its test names claims as listed in WP0.4 step 3.
4. **The packages stage 4 creates**, proposed from table E, each a workspace member at `packages/<name>` with its own
   `package.json` (`"version": "0.1.0"`, `"type": "module"`, `"engines": { "bun": "1.4.2" }`, an `exports` map of one
   entry per public file, `files`, scripts `typecheck`, `lint`, `test`, `test:dom` where it has DOM specs), its own
   `tsconfig.json`, `eslint.config.js` and `README.md`, as `packages/forge-contracts/package.json` is built:
   - `tracker-model` at `packages/tracker-model`: every file of `apps/forge/src/lib/tracker-model/` (108 shipping, 84
     spec and testing), plus the spec helpers its specs import (`apps/forge/src/testing/BoardFixtures.ts`,
     `SourceMutant.ts`, `GreenQueue.ts`, `EveryBoardLogRecord.ts`) moved into its own `testing/` or kept in forge by
     inverting the import, as stage 4 measures. Depends on nothing. DOM-safe, as today (`apps/forge/CLAUDE.md:71`).
   - `board-readings` at `packages/board-readings`: what both Hephaestus and the views compute from a board, all pure:
     `apps/forge/src/shared/monitor/` (`AttentionEntries.ts`, `TodayFigures.ts`, `@types/MonitorSnapshot.ts` unless
     `forge-contracts` already holds it, `utils/BridgeFragmentUtil.ts`, `utils/DraftWordingUtil.ts`,
     `utils/NoticeWordingUtil.ts`, `utils/OpenDecisionsUtil.ts`), `apps/forge/src/lib/token-count/`,
     `apps/forge/src/lib/local-time/`, `apps/forge/src/lib/html-escape/`. Depends on `tracker-model` and
     `forge-contracts`.
   - `forge-contracts` (exists) gains the board and ticket documents: the served `BoardState` and the documents the
     Bridge's views read (`apps/forge/bridge/@types/*BoardState.ts`), as types, behind the system version
     (design section 4). Depends on `system-versions` and, new, `tracker-model` for the types it names.
   Each name is checked against `apps/forge/src/ComponentNames.spec.ts:27-62`: neither `tracker-model` nor
   `board-readings` contains a retired name.
5. **Decision records 35 and on** in `docs/monorepo/hephaestus-talos.md` section 2: a numbered list item, one or two
   sentences, in the existing list's voice.
6. **Evidence folders** (ignored, never committed): `.claude/.evidence/hephaestus-talos/stage-0/recovery-baseline.txt`,
   `.claude/.evidence/hephaestus-talos/stage-0/outage/{stdin.jsonl,a.stdout.jsonl,a.stderr.txt,notes.txt}` and the
   optional `b.*` and `c.*`, `.claude/.evidence/hephaestus-talos/stage-1/base.txt`.

## Traps

- **The traces go stale the moment `entities/integration` lands.** It changes 399 files, the Playbook and job fields
  among them (`git log entities/integration`: stage fields, install version 32, forge 1.9 to 1.11). If it lands, rerun
  tables A to C on the new `main` in the same change (WP1.2 step 2), or stages 2 and 3 work from wrong line numbers.
- **Working in the main checkout holds the live trackers' landings.** A landing finds the main checkout dirty and holds
  the target (`Landing.ts:126`, `Landing.ts:134`; the `dirty-main-checkout` notice, `DrivePass.ts:256-257`). Work in
  `.claude/worktrees/<name>` until WP1.2 has quiesced both trackers.
- **A recording made inside the repository loads forge's hooks.** The repository's Claude settings carry forge's
  SessionStart hook and network guard, and a parent session's `CLAUDE*` variables leak into a child
  (`overseer-claude-probe.md:394-397`). Record only in `/tmp/outage-probe/repo` under `env -i`.
- **Turning the network back on early records a recovery, not an ending.** The retries wait longer between attempts as
  they go; keep the network off until the `result` line is written.
- **A fixture leaks the owner's identity.** The `init` line carries `cwd`, `memory_paths`, `messaging_socket_path`,
  skills, plugins and agents (keys of `rate-limit-rejected.stdout.jsonl`'s init line); a result may carry ids. Replace
  them as WP0.4 step 2 says, and grep for the home folder's name before committing.
- **A claim on free text can be imitated by a model** (design section 3.2). Write every claim on a field of the line
  (`is_error`, `api_error_status`, `terminal_reason`, `attempt`, `max_retries`), never on `result` text.
- **Adding the fixture to the mapper's replay list makes today's mapper look wrong.** `ClaudeStreamMapper.spec.ts:102`
  names its replays exactly; leave the new fixture out. Stage 2 matches it with Talos's pattern, not with the mapper.
- **Every `.jsonl` in the fixtures folder must have its partner.** `ClaudeStreamFixtures.spec.ts:43-52` fails a lone
  `.stdout.jsonl`; commit the `.stdin.jsonl` with it.
- **`bun run verify:integration` runs every real-system spec.** The rules allow it only when a person asks
  (`apps/forge/CLAUDE.md:20-22`); WP0.2 runs named files with `bun test --path-ignore-patterns='.claude/**' ./<path>`.
- **Reading a tracker's data is not running a forge verb, but writing it is touching the live board.** WP1.1 reads
  `pipeline.json` with a JSON reader only; it never opens a `.forge` file for writing and never runs `forge`.
- **`~/.forge-monitor` and `~/.gaia` are off limits even for a listing** (root `CLAUDE.md`, "Never touch the real
  home"). The login items are checked by their LaunchAgent names in `~/Library/LaunchAgents`, never through the
  registry.
- **A paused board still resumes.** Stage 3 builders reading table A must not assume `oversee pause` holds a resume
  today; it holds only new launches (`Playbook.ts:532-533`).
- **The checklist holds over the design where they differ** (`migration.md:4-5`). WP1.1 changes status and ticks, not
  the phases' records, so the history the design relies on stays.
- **Stage 0's package names are binding.** Decision 33 says a running builder never introduces a package. If stage 4
  finds that a file belongs elsewhere, it stops and asks the owner; it does not add a third package.

## Verification of the whole stage

At the repository root, in a fresh worktree of `main` after WP1.2:

1. `bun install --frozen-lockfile`
2. `bun run verify`
3. `bun run verify -- --force` once, cold, as the migration's gates did (`migration.md:12`).
4. `bun run gate:forge` and `bun run gate:gaia`, each green.

Inside `apps/forge`:

```sh
bun test --path-ignore-patterns='.claude/**' \
  ./src/lib/claude-code/ClaudeStreamFixtures.spec.ts ./src/lib/claude-code/ClaudeStreamMapper.spec.ts
bun test --path-ignore-patterns='.claude/**' \
  ./src/services/overseer/CrashMatrix.spec.ts ./src/services/overseer/CrashMatrix.merges.spec.ts \
  ./src/services/overseer/CodeVersion.spec.ts
```

and the real-system baseline of WP0.2, rerun once on the final `main` if `entities/integration` landed, with the same 0
failures.

End-to-end on a scratch forge: this stage changes no runtime code of forge or Gaia (a fixture, a spec, documents), so
there is no new behaviour to exercise. The real-system baseline of WP0.2, which runs the Overseer's pass, Watchers and
the fake agent on scratch repositories, is the end-to-end proof that the base works.

Repository state:

- `git status --porcelain` prints nothing; `git branch --no-merged main` lists only branches the owner set aside.
- `docs/monorepo/hephaestus-talos.md` section 12 "To decide" holds no item the owner answered.
- `docs/monorepo/migration.md` names no open item without a reason.

## Out of scope

- Writing Talos's ending patterns or any mapper change for the outage ending: stage 2. This stage commits the evidence
  and its claims only.
- Changing any resume rule, cause or crash bound of table A, or rewriting a matrix row: stage 3.
- Persisting any in-memory state of table C: stage 3 (and stage 2 for the child records).
- Making any Airlock step of table B safe to redo, or naming a half-done release cleanup at start: stage 3's reconcile.
- Moving a file into a package, or changing `ImportDirection.spec.ts` and the Bridge's include list: stage 4.
- Adding board documents to `forge-contracts`: stage 4 (WP4.6).
- Building B15 or any registry field: closed or deferred here, never built here.
- Running `forge stop`, `login-item remove`, `init`, `update` or `clear`: the owner's commands only.
- Setting up new boards: they are set up anew after the rename, stage 9.

## Needs the owner

1. **What the forge does after an agent ended on a network outage.** Resume by itself, which needs a reachability probe
   on a real-time interval, or wait for an instruction. Recommended default: wait for an instruction, with one
   instruction to resume every job that ended this way, since it matches decision 13 and needs no probe. Stage 2 builds
   what both answers share: the recognised ending, its own end reason and cause, never counted as a crash or a failure.
2. **Whether an install line gets a time bound.** Recommended default: yes, 15 minutes of real time, the gate's bound,
   with the stop and the end reason of a bounded gate. Stage 2 builds the bound as one constant per line kind
   (`GATE_TIME_BOUND_MILLISECONDS` and `INSTALL_LINE_TIME_BOUND_MILLISECONDS`, stage 2's "Interfaces introduced"), so
   either answer is one value: `null` for no bound, or the number of milliseconds the owner names.
3. **The packages stage 4 creates.** Recommended default: `tracker-model` and `board-readings` as new packages, with the
   contents in "Interfaces introduced", item 4.
4. **Where the board and ticket documents live.** Recommended default: in `forge-contracts`, behind the system version,
   as design section 4 says. The cost: `forge-contracts` then depends on `tracker-model`, so a change of a model type a
   document names is a change of the contract. The alternative is a third package of document types that copies the
   fields it serves and depends on nothing.
5. **`entities/integration` (52 commits, 399 files, forge 1.9 to 1.11).** Recommended default: land it through its own
   verify before stage 2, then rerun the traces; if it is not ready when stage 1 ends, set it aside until after stage 9
   rather than rebase it through the refactoring.
6. **The live trackers during stages 2 to 9.** Recommended default: let the in-flight tickets (forge 001, 005, 008, 009,
   014; Gaia 001) land or stop them, stop both Overseers and remove both login items until stage 9 sets the boards up
   anew; the installed clone `~/.forge-program` is not pulled meanwhile.
7. **The uncommitted clock-rule edits in both apps' `CLAUDE.md`.** Recommended default: commit them before WP1.3, as
   they are the owner's own rule change.
8. **`claude/project-thread-dw1bcu`.** Recommended default: delete it; its five commits were taken into monitor 3 in
   P4.0 (`migration.md:32-34`, `:84`).
9. **The migration's open items.** Recommended defaults: B15 closed as superseded, since Gaia identifies a project by
   its forge through the read API (design section 8); open decision 1 closed, since Gaia supports exactly one forge
   version (`apps/gaia/CLAUDE.md:36-38`) and nothing has to be kept (decision 32); decision 2 closed as decided
   (`apps/forge/CLAUDE.md:281-284`); decision 3 closed as built (`CodeVersion.ts:3`); decision 4 closed since boards are
   set up anew. The owner confirms or ticks the P7 smoke, the copy of Gaia's old checkout and the Claude Code memory.
10. **Recordings B and C of WP0.3.** Recommended default: record B (it costs two minutes and tells stage 2 whether the
    retry setting bounds a session); skip C unless the owner wants a 529 pattern before a real one is seen.
11. **The corrections of WP0.1.** Recommended default: accept them as written in table A and the conflicts below.

## Not established

- Whether `main` at `3e6cb660` is green: no verify has run on it (a run writes the turbo cache and scratch folders);
  WP1.3 establishes it.
- What Claude Code 2.1.326 writes when the network is off: the exact result fields and values, the number of retries,
  the waits between them, whether a session starts at all with no network, and what `CLAUDE_CODE_MAX_RETRIES` does. Only
  the names of the setting and of the `api_retry` line's keys were read, from the program text.
- Whether a real 5xx or 529 ending can be recorded on demand; it cannot be caused by the owner without a stand-in
  server.
- What a stop inside `git merge --ff-only` of the main checkout leaves (a partial checkout or an `index.lock`), and
  whether the next landing then holds the target or fails differently; table B traces the stops between steps only.
- Whether `src/testing/BoardFixtures.ts` and the other spec helpers the model's specs import reach anything but the
  model (their closure for stage 4); only their first imports were read.
- Where the earlier probes' driver scripts are (`drive.py`, `export-fixture.py`):
  `.claude/.evidence/runner-claude-probe/` does not exist in this checkout, so WP0.3 and WP0.4 do not rely on them.
- Whether the owner formally gave the P7 go, ran the P7 smoke, copied Gaia's old checkout, or carried the Claude Code
  memory; only the landed state was seen.
- Whether the two login items are loaded; only their file names in `~/Library/LaunchAgents` were seen.
- Whether the gate slot of an in-process merged-tree gate frees exactly as table B says in every case; the holder check
  was read (`GateRunSlots.ts:107-112`), not run.
- Why the fixture claims name a probe P22 that has no entry in the probe record.
