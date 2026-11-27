# Stage 0 and 1: Trace, decide, and close the monorepo migration

## Goal

The later stages start from facts and on a still base. The traces of recovery, of an Airlock landing and of the
Overseer's in-memory state are recorded below, and a real Claude Code session that ended on a network outage is
committed as a stream fixture with claims. The design holds the owner's answers and the run's approach as decisions 35
to 52 (`owner-answers.md`), its figure and its HTML rendering agree with it, and WP0.5 has checked that.
`docs/monorepo/migration.md` describes the landed monorepo, every item in it ticked or closed with a reason. `main` is
the one base of the refactoring: no branch waits to land beside it, every in-flight ticket is dropped and both trackers
are stopped with no login item to start them (decision 46).

## Depends on

- No earlier stage. Stage 0 runs first. WP1.2 runs after gate G3, the owner's stop of both trackers ("Needs the
  owner", item 2).
- Hands to stage 2 (Talos): the recorded outage fixture and its claims (WP0.4), the measured result-line and retry-line
  fields Talos's ending patterns match, what recording B shows about `CLAUDE_CODE_MAX_RETRIES` (WP0.4, P23), the trace
  of today's gate and install lines (tables B and C) that decisions 36 and 37 bound, and a still repository.
- Hands to stage 3 (presence and recovery): the recovery trace (table A), the Airlock trace (table B), the in-memory
  state trace (table C), and the baseline run of today's real-system recovery specs with its twelve cases that assert a
  resume by itself (WP0.2), which decisions 35 and 38 to 41 reverse.
- Hands to stage 4 (the standing contract and the served facts): table E, the measure of what the Bridge's views reach
  in forge, which stage 4 serves as finished facts instead of extracting it into a package (decisions 49 to 51).
- Hands to stage 9 (rename): both trackers stopped, both login items absent, the six ticket branches kept without
  worktrees, and the boards still to be set up anew (decision 46).
- Hands to every later stage: a `main` with no unmerged feature branch beside it, and a design checked to hold
  decisions 35 to 52.

## Decisions this stage carries out

- 12: traces what the pipeline decides from that lives only in memory (table C), so stage 3 can persist it.
- 13: traces every interruption cause and what resumes by itself today (table A), the behaviour stage 3 reverses.
- 14: traces what a crash of the Overseer interrupts today (nothing) and what it leaves behind (tables A and C).
- 15 and 35: records the first real session that ended on a network outage, the evidence Talos's pattern needs to
  recognise the ending that leaves its job waiting.
- 29, 36 and 37: traces today's gate and install lines and where they run (tables B and C), which stage 2 bounds at 15
  minutes that do not count a sleep.
- 30 and 40: traces the crash bound of today (`JOB_RESUMES_BEFORE_FRESH`, then a fresh job) that stage 3 changes.
- 32 and 46: existing boards are set up anew, so every in-flight ticket is dropped and both trackers stop rather than
  migrate (WP1.2).
- 33 and 49 to 52: no package is created; WP0.5 checks the design says so.
- 34: no forge does this work, so both trackers stop moving `main` for the refactoring (WP1.2).

The run's own calls in this stage:

- Recordings A and B are made; a stand-in server error (a 529 from a local server) is not recorded. The overload form
  of decision 35 rests on the retry line's fields read from the program text (WP0.3, "Not established").
- Recording B is described in P23 and committed as no fixture: it answers one question, whether the retry setting
  bounds a session.
- A dropped ticket's uncommitted work is saved to the evidence folder before its worktree is removed, and its branch is
  kept (WP1.2).
- `claude/project-thread-dw1bcu` is deleted: its five commits are in monitor 3 since P4.0 (`migration.md:32-34`,
  `:84`). Its tip is recorded first.
- The migration's open items close by the run's reasons (WP1.1): the P7 smoke is superseded by decision 46, B15 by
  design section 8, and its four open decisions as WP1.1 states.
- The installed clone `~/.forge-program` stays as it is: both trackers stay stopped, so nothing runs it during the
  run.

## Today's code

All paths are from the repository root. The traces are of `main` at `e9b5d057`, the code `entities/integration` brought
(merge `55ec1690`, forge 1.18, install version 36). The integration branch `hephaestus-talos` carries that code; its own
commits change only documents and two recovery specs (`5b68d0ad`, `CrashMatrix.integration.spec.ts` and
`JobResumption.integration.spec.ts`). Line numbers shift once anything lands; see Traps.

### A. Recovery as built: every interruption cause, and what resumes by itself

The board's resume rule is `crashBoundStepsOf` in `apps/forge/src/lib/tracker-model/Playbook.ts:473-487`. Its holds are
computed in `nextStepsOf` at `Playbook.ts:763-771`: `resumesAreHeld` is a usage limit, an install change, an unset
pipeline, an outage decision or a refused-key decision; a paused board holds new launches only (`newWorkIsHeld`,
`Playbook.ts:771`), never a resume. Jobs carry `entity` and `stage`, three outcomes come from the entities work
(`needs-declared`, `refused`, `package-return`), and a resume carries on only a session of the job's own entity and
stage (`apps/forge/src/services/overseer/JobResumption.ts:1-6`, `:36-51`).

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The eight causes: `watcher-lost`, `agent-crashed`, `reboot`, `answer-delivery`, `usage-limit`, `handoff-red`, `forced-stop-refused`, `authentication-failed` | `apps/forge/src/lib/tracker-model/@types/Job.ts:83-91` | Changed in stage 2 (an end reason of the lease, of a clean quit, of a network outage) and stage 3 (which wait for an instruction) |
| Counted crashes are `watcher-lost` and `agent-crashed` only | `apps/forge/src/lib/tracker-model/constants/JobStates.ts:91`, `Playbook.ts:148-150` | Kept as the counted set; stage 2's new causes must not join it (decision 35: an outage is never a crash) |
| `watcher-lost`: a lost Watcher whose recorded child group took the forced stop; set in the pass and at start | `apps/forge/src/services/overseer/DrivePass.ts:615`, `DrivePass.ts:517-520`, `apps/forge/src/services/overseer/Regrouping.ts:102-124` (line 120), `apps/forge/src/services/overseer/RefusedForcedStops.ts:35` | Replaced in stage 2: no Watcher; Talos's child record names the cause |
| `agent-crashed`: the Watcher ended with no closing result while the job ran, or a lost Watcher with no live child | `DrivePass.ts:614-615`, `Regrouping.ts:110` | Changed in stage 2 (Talos reports the end) and stage 3 (two resumes, then wait) |
| Both crash causes resume by themselves up to `JOB_RESUMES_BEFORE_FRESH` (2), then `replace-job` starts a fresh attempt on the same worktree | `apps/forge/src/shared/constants/LifecycleLimits.ts:12`, `Playbook.ts:409-412`, `Playbook.ts:482`, `Playbook.ts:484-485` | Changed in stage 3: after two resumes the job waits for an instruction, and a user's resume gives the two back (decisions 30, 40) |
| Two `replaced` endings in a row on a ticket open `job-lost` (default `ticket-park`) | `LifecycleLimits.ts:15`, `Playbook.ts:202-212`, `Playbook.ts:512-522` | Kept or retired by stage 3 once nothing replaces by itself |
| Counted crashes on jobs of different tickets back to back (`CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING`, 2) with no verified ending between pause the Overseer and open an `outage` decision | `LifecycleLimits.ts:8`, `Playbook.ts:184-200`, `Playbook.ts:778` | Kept; stage 2's lease end, clean quit and network-outage end must not count. The outcomes `needs-declared`, `refused` and `package-return` are not among the verified outcomes that break the run (`Playbook.ts:87`) |
| `reboot`: a lost Watcher whose recorded boot identity differs from the current one; never counted, resumes whatever the count | `Regrouping.ts:108-111`, `Playbook.ts:409-412` | Changed in stage 3: waits for an instruction; a crash suspected before the reboot keeps the forge off (decision 39) |
| `answer-delivery`: the Overseer stopped the Watcher itself to deliver an answer; resumes with the answer | `DrivePass.ts:610-611`, `apps/forge/src/services/overseer/AnswerDelivery.ts:43-45`, `AnswerDelivery.ts:107` | Kept as workflow (design section 7) |
| `usage-limit`: a top-level usage refusal; resumes once the marker's reset passed, a pass woken at the reset by a timer | `apps/forge/src/services/overseer/UsageLimits.ts:44`, `DrivePass.ts:565-570`, `DrivePass.ts:1317-1328`, `Playbook.ts:175-178` | Kept as workflow |
| `handoff-red`: a red gate or Customs check of a handoff; resumes the same session on its own bound (`RED_HANDOFF_RESUMES_BEFORE_PARKING`, 2), then parks the ticket | `apps/forge/src/services/overseer/JobLaunch.ts:1453`, `apps/forge/src/services/overseer/Airlocks.ts:969`, `Playbook.ts:455-465`, `LifecycleLimits.ts:14` | Kept as workflow |
| `forced-stop-refused`: a lost Watcher whose child tree refused the forced stop; never resumed, the stop retried each sweep, the last refusal ends the job blocked with one decision | `DrivePass.ts:517-520`, `Playbook.ts:472-475`, `DrivePass.ts:1607`, `apps/forge/src/services/overseer/CrashMatrix.spec.ts:890` | Changed in stage 2: the cause stays, set from a lost child's `child-<i>.refused-forced-stops` (stage 2, WP2.9); stage 3 keeps it as never resumed |
| `authentication-failed`: a refused API key; holds every launch and resume until User answers the decision | `apps/forge/src/services/overseer/ApiBillingStops.ts:36`, `Playbook.ts:764-770` | Kept |
| An Assistant interrupted for any cause is replaced, never resumed | `Playbook.ts:83-84`, `Playbook.ts:481` | Changed in stage 8 (a switch per board, off by default) |
| A product owner resumes by id once its question is answered; past the crash bound it waits or a fresh one takes its intake | `Playbook.ts:414-425` | Changed in stage 3 with the crash bound |
| A pipeline agent resumes even while no pipeline is set or the board is paused | `Playbook.ts:483`, `Playbook.ts:781-782` | Changed in stage 3 |
| A resume the vendor cannot take ends the job `replaced` with cause `resume-failed` and opens `resume-failed` (default `job-fresh`); an Airlock agent opens none | `apps/forge/src/services/overseer/JobResumption.ts:102-121` | Kept; the default move is stage 3's to revisit |
| At start, Regrouping attaches every live Watcher from the stored cursor, settles every lost one, and names an unclaimed instance for its re-spawn; a stop on purpose or a crash of the Overseer interrupts no live agent | `Regrouping.ts:223-244`, `DrivePass.ts:1578-1587` | Replaced in stage 2 (Talos reconnect) and stage 3 (reconcile) |
| `oversee stop` without `--now` leaves every agent Watcher running; with `--now` it stops only process Watchers (installs and gates), never an agent | `apps/forge/cli/overseer/OverseerForeground.ts:775-794`, `apps/forge/src/services/overseer/WatcherFleet.ts:340-365` | Changed in stage 2 (clean quit), stage 3 (a stop on record) and stage 9 (`forge stop` at the top level, decision 42) |
| `overseer-started` and `overseer-stopped` (`stopped` or `baton-passed`) are log records already | `apps/forge/src/lib/tracker-model/Jobs.ts:325-332`, `OverseerForeground.ts:169-176`, `OverseerForeground.ts:657`, `apps/forge/src/lib/tracker-model/@types/Job.ts:197` | Changed in stage 3: becomes the presence record's evidence |
| A session's error result (an outage whose retries ran out among them) moves a build or review to Customs like any closing result, and Customs ends it `failed` cause `no-report` | `DrivePass.ts:586-588`, `JobLaunch.ts:1173-1176`, `JobLaunch.ts:397-398` | Changed in stage 2: Talos reports the network-outage end first, and the job waits for the user's resume (decision 35) |
| The stream mapper reads a failure only as `budget-reached`, `rate-limited` (429) or `authentication-failed` (401, 403) | `apps/forge/src/lib/claude-code/ClaudeStreamMapper.ts:218-226`, `apps/forge/src/lib/agent-launch/AgentSessionEvent.ts:21-29` | Changed in stage 2: the adapter renders the ending patterns |
| The real-system matrix: 27 session, Watcher, Overseer, reboot, question, Assistant and product-owner rows on real processes and the fake agent | `apps/forge/src/services/overseer/CrashMatrix.integration.spec.ts:382-1008` | Rows that assert a resume by itself are rewritten in stage 3; baselined in WP0.2 |
| The default-suite matrix: hold-journal replay, gate profiles at start, lock takeover, Apply cut short, session rows behind the Watcher boundary | `CrashMatrix.spec.ts:153-1331` | Same |
| The merge rows of the matrix (table B) | `apps/forge/src/services/overseer/CrashMatrix.merges.spec.ts:95-374` | Kept; they hold table B |

### B. Each step of an Airlock landing, and a stop in its middle

Every Airlock phase is written on the merge job's slot in its own hold (`Airlocks.ts:1-8`, `Airlocks.ts:727-729`), and a
hold's writes are atomic: `commitHold` writes a journal first and the next lock holder replays it
(`apps/forge/src/services/tracker/HoldJournal.ts:121-146`,
`apps/forge/src/services/tracker/TrackerPipeline.ts:178-212`). So a stop between holds always leaves the slot in the
last written phase, and the sweep's `advance` runs that phase again (`Airlocks.ts:1309-1324`). The column "A stop in
the middle" says whether that rerun is safe.

| What exists | Where (path:line) | A stop in the middle | What happens to it |
| --- | --- | --- | --- |
| Allocation: the tip is read, then claimed in a hold that checks the tip did not move | `Airlocks.ts:1616-1648`, `Airlocks.ts:1405-1416`, `Airlocks.ts:1583-1614` | Safe: nothing written before the claim; a moved tip claims nothing | Kept |
| `merge-in`: a `--no-ff` merge of the recorded target tip into the ticket's worktree, then `gating` in a hold | `Airlocks.ts:782-826`, `apps/forge/src/services/lifecycle/MergeRun.ts:58-61`, `apps/forge/src/lib/git/BranchMerge.ts:64-76` | Detectable: a merge left with `MERGE_HEAD` and no live holder frees the slot `orphaned` (abort, reset, requeue, `Airlocks.ts:792-797`); a finished merge reads `already-descends` on the rerun (`BranchMerge.ts:71-73`). Held by `CrashMatrix.merges.spec.ts:108` | Kept |
| A refresh's temporary worktree is prepared before its merge | `Airlocks.ts:785-791` | Safe: prepared again; never two refreshes (`CrashMatrix.merges.spec.ts:260`) | Kept |
| `resolving`, `re-reviewing`, `fixing`: an Airlock agent under a Watcher | `Airlocks.ts:994-1007`, `Airlocks.ts:1016-1032` | Detectable: a live or interrupted agent keeps the slot; a `replaced` one is relaunched at the same attempt; any other ending frees the slot `orphaned` (`CrashMatrix.merges.spec.ts:122`, `:177-204`) | Changed in stage 2: the agent is Talos's child |
| A crossing ticket's conflict split by owner (E64): the first part's worker is launched in the `merge-in` conflict's hold; a worker that resolved its part and left the merge open hands it on, its job ended `resolved` and the next part's worker launched in one hold. The parts' facts are kept in `airlock-facts.json` in the merge job's folder, written from inside the hold but outside its journal | `Airlocks.ts:813-821`, `Airlocks.ts:1039-1041`, `Airlocks.ts:1081-1099`, `apps/forge/src/services/overseer/AirlockFactsFile.ts:1-4`, `:34-37`, `DrivePass.ts:1286` | Safe to redo for the board: a stop before the hold's journal leaves the phase `resolving` and the agent unlaunched, and the rerun writes the facts again. The facts file is not covered by the journal: a stop after it is written and before the journal names a part no agent was launched for, which the rerun overwrites. No matrix row holds it | Changed in stage 2: each part's worker is Talos's child; stage 3's reconcile reads the facts file with the slot |
| `gating`: the merged-tree gate runs in the Overseer's own process, then its verdict is written in a hold; with entities, each gated entity's part runs from its first home folder | `Airlocks.ts:838-902`, `DrivePass.ts:1143-1168`, `DrivePass.ts:1254-1277`, `apps/forge/src/services/overseer/MergedTreeGateRun.ts:1-4`, `:46` | Safe to redo for the board: the phase stays `gating` and the gate runs again, or lands ungated when the tree was last passed (`Airlocks.ts:846-854`; with entities only once git named the gated entities, `:855-863`). Not safe for the process: after a crash the gate's process group runs on, unstopped, and its gate slot counts as free once the Overseer's process is gone (`apps/forge/src/services/overseer/GateRunSlots.ts:107-112`) | Changed in stage 2: the gate runs under Talos, stopped after 15 minutes that do not count a sleep (decisions 29, 37) |
| `landing`: inside one hold, the target's branch and tip are compared with the slot's (compare-and-swap), `git merge --ff-only` moves the target, and the board records the landing | `Airlocks.ts:1231-1260`, `apps/forge/src/services/lifecycle/Landing.ts:120-136`, `apps/forge/src/lib/git/BranchIntegration.ts:169-184` | Detectable as done: a stop after the fast-forward and before the hold's journal leaves the target past the slot's tip; the rerun finds the merged commit an ancestor and answers `already-landed`, which finishes the board side (`Landing.ts:94-95`, `Landing.ts:109-118`). Held by `CrashMatrix.merges.spec.ts:96`, `:219`, `:242` | Kept |
| A project tracker's landing takes the repository's landing lock, then appends the landing journal line after the fast-forward | `Landing.ts:142-177` | Not redone: a stop between the fast-forward and the journal line leaves an unrecorded move, which a sibling tracker reads as `target-moved` and asks User (`Landing.ts:166-169`); the lock itself is taken over once its holder is gone (`Landing.ts:147`) | Kept; stage 3 may record it at start |
| After the landing hold: a refresh's worktree is removed, and a release removes the group's worktree and deletes its branch | `Airlocks.ts:1261-1263`, `Airlocks.ts:1222-1229` | Not redone and not detected: the job has ended, so nothing runs the cleanup again; a group worktree left on its branch is branch-owned, so Regrouping never names it (`Regrouping.ts:204-216`) | Stage 3: reconcile names it |
| `freeSlot`: the worktree is restored to the slot's start tip (merge abort, hard reset), then the jobs end in a hold; a crossing ticket's red merged tree, returned to the entity that owns the red gate, frees its slot this way too | `Airlocks.ts:736-747`, `MergeRun.ts:63-67`, `Airlocks.ts:904-913` | Safe by the compare-and-swap, not by design: a stop between the reset and the hold reruns the slot's phase on the restored worktree; the rerun merges again (`merge-in`) or gates the branch tree (`gating`), and a landing of a tree that lacks the target's tip is refused by `--ff-only` (`Landing.ts:131-135`) | Stage 3: reconcile reads a worktree that differs from its phase |
| The constitution commit, `committing`: a detached worktree at the tip, each listed constitution written (the project's, and over entities each entity's), committed once, checked to change only the listed paths | `Airlocks.ts:1447-1472`, `apps/forge/src/services/overseer/ConstitutionCommits.ts:105-142` | Detectable: a worktree already there is a run cut short, so the job ends `orphaned` and a fresh job commits again (`Airlocks.ts:1444-1450`, `CrashMatrix.merges.spec.ts:319`) | Kept |
| The constitution commit, `landing`: what stage 2 would refuse is checked first, then the same compare-and-swap fast-forward, and Apply's stage 2 in the same hold | `Airlocks.ts:1479-1535`, `Airlocks.ts:1493-1498` | Detectable as done, as a ticket's landing (`CrashMatrix.merges.spec.ts:332`); main already holding every draft's text finishes Apply with no commit (`Airlocks.ts:1567-1577`, `:1598-1605`, `CrashMatrix.merges.spec.ts:360`) | Kept |
| A stale green re-gated outside any slot | `Airlocks.ts:670-707` | Safe: the verdict is applied in a hold that checks the ticket still waits on the same tree (`Airlocks.ts:629-633`) | Changed in stage 2: the gate is Talos's child |
| Git runs synchronously with no timeout, the fast-forward and every worktree add among it | `apps/forge/src/lib/git/GitProcess.ts:59-87` | A hung git blocks the Overseer's event loop, and with it any timer | Stage 2: the lease renews only on progress, so a hung git stops the board's agents after a minute (decision 38); every synchronous step stays bounded well below the lease (design section 12, risk 2) |

### C. State the Overseer holds only in memory, and which decisions read it

The closure state of `createDrivePass` (`DrivePass.ts:1028-1048`) and the Airlocks' held targets are below; the
entities work's facts (stages, seals, needs, the Airlock facts file of table B) are on disk.

| What exists | Where (path:line) | Which decision reads it | What happens to it |
| --- | --- | --- | --- |
| `spawnedInstances`: the job instances this process spawned | `DrivePass.ts:1028`, `DrivePass.ts:977-989` | Whether a job needs a Watcher; after a restart Regrouping names unclaimed instances instead (`Regrouping.ts:239-240`) | Replaced in stage 2 (Talos's child record) |
| `lastFingerprint`, `running`, `wokenAgain`, `forcedNext`: pass scheduling | `DrivePass.ts:1029-1032`, `DrivePass.ts:1332`, `DrivePass.ts:1553-1576` | Whether an unforced wake runs a pass; no board decision | Kept in memory: a restart runs a forced pass (`DrivePass.ts:1584`) |
| Quiet-job counts: sweeps each running build or review was quiet | `DrivePass.ts:1033-1034`, `apps/forge/src/services/overseer/IncidentRouter.ts:33` | Opens `quiet-job` after `QUIET_JOB_SWEEPS` (6) sweeps (`DrivePass.ts:1371`, `apps/forge/src/shared/constants/OverseerLimits.ts:18`); a restart starts the count at zero | Changed: becomes a time bound (`apps/forge/CLAUDE.md` Deviations); persisted or derived in stage 3 |
| The Assistant's quiet watch and its mid-turn list | `DrivePass.ts:1038-1040`, `apps/forge/src/services/overseer/AssistantSession.ts:246` | Ends a quiet Assistant (`DrivePass.ts:1373`) | Changed in stage 8 (Assistant off by default) |
| `assistantBootRetryRequested` | `DrivePass.ts:1041`, `DrivePass.ts:1374-1375` | The Playbook's `assistantBootRetryDue` (`Playbook.ts:774`) | Changed in stage 8 |
| `forcedStopRetryJobIdsDue`, `jobsAtTheLastPass`, `targetsHeldAtTheLastPass` | `DrivePass.ts:1035-1037`, `DrivePass.ts:1603-1620` | Which sweeps force a pass | Replaced in stage 2 (forced stops) and kept for the sweep |
| The state document: `notices`, `runtimeState`, `legacyWatcherJobIds`, `ticketsWaitingForMachineSlot`, `passes` | `DrivePass.ts:281-315`, `DrivePass.ts:1042-1044`, `DrivePass.ts:1523-1540` | The read API and the Bridge; the sweep retries a ticket waiting for a machine slot (`DrivePass.ts:1609`) | Changed in stages 2 and 3 (legacy Watchers go; presence joins) |
| `resetTimer`: the pass at the usage reset | `DrivePass.ts:1046`, `DrivePass.ts:1317-1328` | Wakes the pass that resumes limited jobs; derived again each pass from the usage marker file | Kept |
| `leftoverWorktrees`, `declinedCleanups` | `DrivePass.ts:1047-1048`, `DrivePass.ts:1300-1306` | Opens `leftover-worktree` decisions; the `cleanup-declined` notice | Kept; stage 3's reconcile owns the first |
| `endedJobIdsExamined`, `endedSessionsAwaitingClose`, `triedPipelineAgentSnapshots`, `hatchFolderOfLaunchedJob` | `DrivePass.ts:1096-1098`, `DrivePass.ts:1224`, `DrivePass.ts:1471-1477` | Token credit (also derived from the log), the close of an ended session's input, snapshot removal, folder watches | Changed in stage 2 (input close goes through Talos) |
| `mergedTreeGateProcesses`: the merged-tree gates running now | `DrivePass.ts:1143-1168`, `DrivePass.ts:1589-1597` | Stopped at a clean stop; lost with a crash | Replaced in stage 2 (Talos's child record) |
| Gate profile runs and pipeline checks running in this process | `apps/forge/src/services/overseer/GateProfiling.ts:173`, `GateProfiling.ts:262-266`, `apps/forge/src/services/overseer/PipelineChecking.ts:123` | At the next start their board records read stopped and their worktrees are removed, the process not stopped | Replaced in stage 2 |
| Gate slot rounds: refused and waiting holders of this process | `GateRunSlots.ts:125-126` | Which gate gets the next machine-wide slot | Kept |
| `heldTargets`, `commitsAHeldMainLineWaitsToLand` | `Airlocks.ts:562-570`, `Airlocks.ts:1186-1194` | Allocation refuses a held target (`Airlocks.ts:1606`, `Airlocks.ts:1621`); a restart forgets the hold and the next landing holds again | Persisted or derived in stage 3 |
| The install-change watch: the versions learned from the program on disk | `apps/forge/src/services/overseer/InstallChangeWatch.ts:80-85`, `OverseerForeground.ts:364-377` | `installVersionChanged` holds every resume and launch (`Playbook.ts:764`) | Kept; asked again at start |
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
| P7 unticked steps: quiesce, fast-forward, installed clone, forge's tracker into `apps/forge`, its gates, Gaia's tracker, login items, `gaia install-app`, smoke, Gaia's old checkout, the Claude Code memory | `migration.md:139-156` | Ticked in WP1.1 where WP1.1's checks show them done: both trackers' `pipeline.json` carry version 3, a prepare `bun install --frozen-lockfile` in `/`, gates `bun run gate:<app>` and `bun run cache:audit` in `/`, and the reach the root `CLAUDE.md` names; two LaunchAgents `com.forge.overseer.<trackerId>.plist` exist; `~/Applications/Gaia.app` exists; the installed clone `~/.forge-program` is at `28a319c8`; the worktree `graphite-orange-handoff-ebd9dc` is not listed and the main checkout's `.claude/.evidence/gaia/` holds Gaia's handoffs, evidence and `gaia-strategy.html`; forge's Claude Code project memory holds Gaia's notes. The smoke closes as superseded by decision 46 |
| P8: B15 (`repositoryRoot` and `projectPrefix` in the registry and the monitor snapshot) open; no code names either field in `packages/forge-contracts`, `apps/forge/cli/RegisterWrittenTracker.ts` or `MonitorSnapshotAssembly.ts` | `migration.md:109`, `migration.md:172` | Closed in WP1.1 as superseded: Gaia identifies a project by its forge (design section 8) |
| Open decision 1: restart after Update forge for an older forge | `migration.md:197` | Closed in WP1.1: Gaia supports exactly one forge version (`apps/gaia/CLAUDE.md:36-38`) and nothing is kept (decision 32) |
| Open decision 2: rule changes under `.claude/rules/` are the owner's | `migration.md:198-199`; decided for a ticket's agent in `apps/forge/CLAUDE.md:281-284` | Closed in WP1.1 as decided |
| Open decision 3: `CodeVersion` hashes the whole root `bun.lock` | `migration.md:200-201`; the code hashes the program's part of the lockfile through its dependency graph (`apps/forge/src/services/overseer/CodeVersion.ts:3`, `CodeVersion.ts:44-55`) | Closed in WP1.1 as built, after WP1.1 confirms it with `CodeVersion.spec.ts` |
| Open decision 4: install version 29 asks every board to update | `migration.md:202-204`; install version is 36 (`apps/forge/cli/constants/InstallVersion.ts:1`) | Closed in WP1.1: boards are set up anew (decisions 32, 46) |
| `entities/integration` is merged into `main` (`55ec1690`, 0 commits ahead); its worktree `.claude/worktrees/entities-integration` (at `55ec1690`, nothing uncommitted) is listed | `git rev-list --count main..entities/integration`, `git worktree list` | Its worktree removed and its branch deleted in WP1.2 |
| `claude/project-thread-dw1bcu`, 5 commits ahead and 628 behind, kept since P0 for monitor 3 | `migration.md:32-34`, `:84` | Deleted in WP1.2, its tip recorded first |
| Both trackers hold in-flight tickets: forge's worktrees `ticket-001`, `-005`, `-008`, `-009`, `-014` on `forge/forge/ticket-<n>` and Gaia's `ticket-001` on `forge/gaia/ticket-001`, each branch 0 commits ahead of `main` (97 or 111 behind); every worktree but forge's `ticket-008` holds uncommitted changes (27, 5, 2, 1 and 2 `git status --porcelain` lines) | `git worktree list`; `apps/forge/.forge-worktrees/`, `apps/gaia/.forge-worktrees/` | Dropped in WP1.2 (decision 46): the owner stops both trackers, the run saves the uncommitted changes and removes the worktrees, and the branches stay |
| Both login items exist: `com.forge.overseer.1dc461b1-cdeb-4cdf-bc38-2cc5b8cd9757.plist` and `com.forge.overseer.4c2d0ab1-b194-4578-a175-800a56ca477d.plist` | `~/Library/LaunchAgents` | Removed by the owner at gate G3 |
| The installed clone `~/.forge-program` is at `28a319c8`, behind the landed entities work | `git -C ~/.forge-program log --oneline -1` | Left as it is: both trackers stay stopped, so nothing runs it |

### E. What the Bridge's views reach in forge, which stage 4 serves instead

Measured on `e9b5d057` with a walk of every `.ts` and `.tsx` file under `apps/forge` (the folders `node_modules`,
`.forge`, `.forge-worktrees`, `.turbo` and `.claude` left out), resolving relative imports. A file counts as a spec or
testing file when its name holds `.spec.` or ends in `.dom.tsx`, or it lies in a `testing/` folder. The tracker model,
its spec helpers, the readings and the refusal wording stay in `apps/forge` (decision 49); the counts below are what
that spares stage 4, and what the views in Gaia must not reach (decision 51).

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The tracker model: 117 shipping files and 96 spec and testing files; its shipping files import nothing outside their folder, and its specs import only `src/testing/BoardFixtures.ts` (51), `SourceMutant.ts` (5), `EntityForgeFixture.ts` (4), `GreenQueue.ts` (2), `EveryBoardLogRecord.ts` (1) | `apps/forge/src/lib/tracker-model/`; the guard `apps/forge/architecture/ImportDirection.spec.ts:161`, `:395-397` | Stays in `apps/forge`, with its spec helpers (decision 49) |
| Files outside the model that import it: 548, of which 310 ship and 238 are specs: 138 in `bridge/`, 51 in `cli/`, 36 in `src/services/overseer`, 14 in `src/services/control`, 9 in `src/services/lifecycle`, 7 in `src/services/tracker`, 4 in `src/services/render`, 41 in `src/adapters`, 10 in `src/shared` | the walk | Unchanged by stage 4; the 138 in `bridge/` go with the Bridge in stage 8 |
| The Bridge's shipping reach outside `bridge/`: the tracker model's types, constants and utils; `src/shared/monitor/` (`AttentionEntries.ts`, `TodayFigures.ts`, `@types/MonitorSnapshot.ts`, four wording utils); `src/lib/token-count/`, `src/lib/local-time/`, `src/lib/html-escape/`; the constants `ProductNames.ts`, `RootOverrideVariable.ts`, `DispatchProtocol.ts`, `OverseerLimits.ts`, `OverseerApiContracts.ts`, `TimestampSlices.ts`; for the entity and Apply refusals (`bridge/views/pipeline/apply/ApplyDialogModel.ts`, `bridge/views/pipeline/setup/EntityRefusalsModel.ts`), the refusal wording `src/shared/OperationRefusal.ts`, `src/shared/@types/` (`InstallVersionMismatch.ts`, `RoleCommandRefusalReason.ts`, `UnreadableTracker.ts`), `src/adapters/utils/` (`OperationRefusalWordingUtil.ts`, `StatusWordingUtil.ts`, `TicketPhraseUtil.ts`), and the port type file `src/lib/executable-resolver/ExecutableResolver.ts` | `apps/forge/bridge/tsconfig.json:12-156` | Stays in forge. Stage 4 serves what the views compute from it as finished facts in the board document, each refusal with its reason code, fields and sentence (decisions 45, 50); the include list goes with the Bridge in stage 8 |
| `src/shared/monitor/` is also read by the Overseer's server, the monitor snapshot, the monitor stream and the board state reader; the monitor document already carries attention entries, notices, warnings and today's figures, computed by forge | `OverseerServer.ts`, `MonitorSnapshotAssembly.ts`, `MonitorStream.ts`, `apps/forge/cli/overseer/routes/BoardStateReader.ts`; `packages/forge-contracts/@types/MonitorSnapshotDocument.ts:160-165` | Stays in forge; stage 4 serves the same facts in the board document |
| The board document `BoardState`, assembled from the Board, render facts and page payload; the Bridge keeps its own field-exact mirrors of it | `apps/forge/src/services/overseer/BoardState.ts:168`, `apps/forge/bridge/@types/ProgressBoardState.ts:1`, `KanbanBoardState.ts`, `TicketsBoardState.ts` | Declared in stage 4 by `forge-contracts` with types of its own, mapped from the model in forge's adapters (decision 50) |
| `forge-contracts`: 9 command kinds, the summary and monitor documents, versions, the registry; depends on `system-versions` only; system version 1.18 | `packages/forge-contracts/package.json:2-29`, `packages/forge-contracts/constants/ForgeSystemVersions.ts:40-43` | Gains the board and ticket documents and the board's command kinds in stage 4, still depending on `system-versions` only (decision 50) |

### F. Where the design states something the code contradicts

The design holds each correction (WP0.1); WP0.5 checks the fourth row's.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| A record that a stop or a Baton pass completed exists: the log holds `overseer-stopped` with reason `stopped` or `baton-passed`. What is missing is a heartbeat and a start that reads the record | `apps/forge/src/lib/tracker-model/Jobs.ts:330-332`, `apps/forge/cli/overseer/OverseerForeground.ts:171`, `:657` | Design section 3.1 says so; stage 3 builds on the existing record. The HTML rendering lags it (WP0.5) |
| A stop on purpose interrupts no agent, since Watchers are detached and reattached at the next start, and `stop --now` stops only install and gate Watchers. A crash of the Overseer interrupts no agent either | `Regrouping.ts:234-236`, `WatcherFleet.ts:340-345` | Design section 7's table says so |
| Every Airlock step is safe to redo or detectable as done but three: the landing journal line, the release cleanup, and the tip restore before `freeSlot`'s hold | table B | Design sections 7 and 12 say so, with a link to table B |
| The tracker model is 117 shipping files (213 with specs) imported by 548 files, 310 of which ship | table E | The design's stage 4 row extracts no package and names no count (decision 49) |

## Work packages

Parallel groups: WP0.1 and WP0.2 are done. WP0.3 is the owner's (gate G1). WP0.4 runs after WP0.3. WP0.5 and WP1.1
touch no common file and may run beside each other and beside WP0.4. WP1.2 runs alone, after gate G3, because it
changes branches and worktrees of the whole repository. WP1.3 runs last and alone.

Every package works in a worktree under `.claude/worktrees/<name>` cut from the tip of the integration branch, never in
the main checkout. Evidence goes to `.claude/.evidence/hephaestus-talos/` in the main checkout, which `.gitignore:16`
already ignores (`.claude/.evidence/`).

### WP0.1 Bring the design in line with the traces

Purpose: the design states three things the traces show otherwise, and two things as untraced that are now traced.
Later stages read the design first, so it must not mislead them.

Files to change: `docs/monorepo/hephaestus-talos.md`.

What to do:

1. In section 3.1, "Presence", replace the claim that a record of a completed stop or Baton pass is missing. State that
   the log already holds `overseer-started` and `overseer-stopped` with reason `stopped` or `baton-passed`
   (`apps/forge/src/lib/tracker-model/Jobs.ts:325-332`), written by the Overseer before it releases its Baton
   (`apps/forge/cli/overseer/OverseerForeground.ts:169-176`, `:657`). State what is still missing: a heartbeat, and a
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
5. In section 7, add one sentence: a paused board holds no resume today (`Playbook.ts:770-771`).
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

1. In a worktree of the integration branch, run `bun install --frozen-lockfile` at the root.
2. In `apps/forge`, run each of these alone, in this form (`apps/forge/CLAUDE.md:20-22`; never `verify:integration`):
   `bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/CrashMatrix.integration.spec.ts`,
   then the same for `./src/services/overseer/Regrouping.integration.spec.ts` and
   `./src/services/overseer/JobResumption.integration.spec.ts`, then the default-suite files
   `./src/services/overseer/CrashMatrix.spec.ts`, `./src/services/overseer/CrashMatrix.merges.spec.ts`,
   `./src/lib/tracker-model/Playbook.spec.ts`, and the three resume specs that hold whose session a resumed job carries
   on (E29), which stage 3's resume rules must keep:
   `./src/services/overseer/JobResumption.entities.spec.ts`, `./src/services/overseer/JobResumption.adapt.spec.ts`,
   `./src/services/overseer/JobResumption.airlockOwner.spec.ts`. These start the fake agent only; the preload
   `src/testing/ProgramTrapGuard.ts` fails any run that reaches a real `claude`.
3. Write to the evidence file: the commit, the date, each command, its pass, fail and skip counts, and the names of the
   test cases that assert a resume by itself, each with its line. Find them by name: every case title in table A's
   matrix rows that says "resumed", "resumes" or "re-spawns" (among them `CrashMatrix.integration.spec.ts:469`, `:495`,
   `:528`, `:537`, `:573`, `:836`; `CrashMatrix.spec.ts:1155`, `:1177`). The evidence file lists twelve such cases;
   stage 3 reads that list, not this one.
4. If a run is red, record the failing case and its output, and stop: stage 3 must not start on a red baseline.

Specs: none changed.

Done when: the evidence file exists with every command's counts, and every listed run reports 0 failures.

### WP0.3 The owner records a session that ends on a network outage

Purpose: decisions 15 and 35 need the fields of a real ending on an outage. No such session is recorded (design section
12, risk 13). No agent may start a `claude` session, so the owner runs every step (gate G1). Two recordings are asked
for: A, the ending Talos must recognise, and B, whether the retry setting bounds a session. Claude Code updates itself:
on 2026-11-18 `~/.local/bin/claude` links to `~/.local/share/claude/versions/2.1.327`, and the recordings are made with
whatever version is installed then, named in `notes.txt`. The program text of both 2.1.326 and 2.1.327 names the retry
setting `CLAUDE_CODE_MAX_RETRIES` and writes a `system` line of subtype `api_retry` with `attempt`, `max_retries`,
`retry_delay_ms`, `error_status`, `error` and, for no response, `no_response.waited_ms` and
`no_response.retry_wait_ms`; a second form of the same line, for a rate limit, carries `error_status` 429 and `error`
`"rate_limit"`.

Files to create (owner, outside the repository): a scratch folder, for example `/tmp/outage-probe/`, and the raw logs
copied afterwards to `.claude/.evidence/hephaestus-talos/stage-0/outage/` in the main checkout.

What the owner does, step by step:

1. Make a scratch repository outside every tracked repository, so no forge hook and no repository `CLAUDE.md` loads:

   ```sh
   mkdir -p /tmp/outage-probe/repo && cd /tmp/outage-probe/repo
   git init -q && git commit -q --allow-empty -m start
   ```

2. Write the one input line. A loopback ping keeps the turn open for a minute while the network goes off; Claude Code blocks a standalone `sleep`. This is the stdin format of
   the committed fixtures (`apps/forge/src/lib/claude-code/testing/fixtures/rate-limit-rejected.stdin.jsonl`):

   ```sh
   printf '%s\n' '{"type":"user","message":{"role":"user","content":"Run exactly this shell command with the Bash tool, unchanged: ping -c 61 127.0.0.1 . Then reply with one word."}}' \
     > /tmp/outage-probe/stdin.jsonl
   ```

3. Recording A, the default retries. In a terminal with the network on, start the session in a clean environment, as
   the earlier probes did (`apps/forge/docs/development/overseer-claude-probe.md:394-401`):

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
5. Turn the network on.
6. Recording B, the retries bounded by the setting: the same as steps 3 to 5 with `CLAUDE_CODE_MAX_RETRIES=2` added
   after `env -i`, and the output files named `b.stdout.jsonl` and `b.stderr.txt`. It takes a few minutes.
7. Copy `stdin.jsonl`, `a.stdout.jsonl`, `a.stderr.txt`, `b.stdout.jsonl` and `b.stderr.txt` to
   `.claude/.evidence/hephaestus-talos/stage-0/outage/` in the main checkout, and write beside them a `notes.txt` with
   the date, `claude --version`, the macOS version (`sw_vers -productVersion`), when the network went off and on for
   each recording, and the login kind (subscription or API key).

Specs: none.

Done when: `a.stdout.jsonl` and `b.stdout.jsonl` exist in `.claude/.evidence/hephaestus-talos/stage-0/outage/`, the
last line of each has `"type":"result"`, and the lines before it include at least one `"subtype":"api_retry"` line. If
a result never came or no retry line was written, the owner records what happened in `notes.txt` and WP0.4 reports it
as a finding instead.

### WP0.4 Commit the outage fixture and its claims

Purpose: turn recording A into the portable evidence stage 2 builds its ending patterns on, held by claims so a later
re-recording that does not show the ending fails, and record what recording B shows.

Depends on WP0.3.

Files to create:

- `apps/forge/src/lib/claude-code/testing/fixtures/network-outage-retries-spent.stdout.jsonl` and
  `apps/forge/src/lib/claude-code/testing/fixtures/network-outage-retries-spent.stdin.jsonl`: the folder of every
  recorded stream fixture, and a pair because `ClaudeStreamFixtures.spec.ts:43-52` requires every `.jsonl` to have its
  partner.

Files to change:

- `apps/forge/src/lib/claude-code/ClaudeStreamFixtures.spec.ts`: a new `describe` block
  `network-outage-retries-spent (P23, Claude Code <version>)`, the version `notes.txt` names.
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
   - no `rate_limit_event` line is in the stream, and no `api_retry` line carries `error_status` 429 or `error`
     `"rate_limit"` (the rate-limit form of the retry line, WP0.3), so the ending cannot be read as a usage limit.
4. Do not add the fixture to the replay list of `ClaudeStreamMapper.spec.ts:102`: today's mapper has no ending of this
   kind. Stage 2 holds this fixture against Talos's ending pattern (stage 2, WP2.2) and keeps the mapper as it is,
   since Talos, not the mapper, recognises the outage.
5. Read recording B from the evidence folder: count its `api_retry` lines, its last `max_retries`, and how long it ran
   from the first `api_retry` line to the result. It is not committed.
6. Write P23 in past tense, like the entries before it: what ran, the command, what stream A showed field by field, how
   long its retries took from the first `api_retry` line to the result, and what recording B showed against the
   setting's 2. End it with a "Selects" line: Talos's network-outage pattern matches the result's fields and the count
   of `api_retry` lines, never the result text.

Specs: `ClaudeStreamFixtures.spec.ts` must prove each claim of step 3 on the committed fixture, and the existing pair
check must pass with the new pair.

Done when, in `apps/forge`:

```sh
bun test --path-ignore-patterns='.claude/**' \
  ./src/lib/claude-code/ClaudeStreamFixtures.spec.ts ./src/lib/claude-code/ClaudeStreamMapper.spec.ts
grep -c '"subtype":"api_retry"' src/lib/claude-code/testing/fixtures/network-outage-retries-spent.stdout.jsonl
grep -E "$(basename "$HOME")|@" src/lib/claude-code/testing/fixtures/network-outage-retries-spent.*
```

the specs pass, the count is 1 or more, and the last grep prints nothing; P23 names recording B's retry count; at the
root `bun run verify` is green.

### WP0.5 Check that the design holds the decisions

Purpose: the design holds the owner's answers and the run's approach of `owner-answers.md` as decisions 35 to 52.
Every later stage reads the design first, so this package checks that it does, and brings the two renderings that lag
it in line: the migration figure, whose stage 4 reads "Extract the packages", and the HTML page, whose text calls the
stop record missing (`docs/monorepo/hephaestus-talos.html:435`) and holds no decision past 34. It writes no decision
again.

Depends on WP0.1.

Files to change: `docs/monorepo/figures/hephaestus-talos/migration.svg`, `migration.png` beside it, and
`docs/monorepo/hephaestus-talos.html`. `docs/monorepo/hephaestus-talos.md` changes only where a check of steps 1 to 5
fails.

What to do:

1. Check section 2 of `docs/monorepo/hephaestus-talos.md` against `owner-answers.md`: decisions 35 to 48 hold answers 1
   to 14 in order, and decisions 49 to 52 hold "The monorepo". Check the decisions they amend cite them: 28 cites 51,
   29 cites 36 and 37, 30 cites 40, and 33 and 34 state the ground rules (no package unless two apps consume it; the
   run decides the migration and may change any rule file).
2. Check section 11: the stage 0 row names decisions 35 to 48 and 49 to 52; the stage 2 row bounds a gate line and an
   install line at 15 minutes, a sleep not counted, with every line's run time recorded; the stage 4 row is "The
   standing contract and the served facts", in forge and `forge-contracts`, size L, with no package extracted; the
   stage 8 row deletes the Bridge, removes `forge open` and the `progress.html` stub and folds `design-system`, `flint`
   and `brand` into Gaia's page `lib/`, in forge and Gaia; the stage 9 row replaces `oversee` with top-level verbs and
   names no verb after Hephaestus; and the section says every in-flight ticket is dropped.
3. Check section 7's table counts an ending on a network outage among the interruptions that wait for an instruction.
4. Check section 12, "To decide", says that no question of behaviour is open, and that decision 48 answers how a user
   changes a committed ticket: it is put back into `draft`, edited there and committed again by the path any draft
   takes. Check decision 48 names `pending` as the status that takes the name committed.
5. Check decision 22 and section 4 say this run builds the ticket-content edit command and no Gaia editing screen.
6. Run these in the worktree; each must print nothing:
   `grep -n "settled in stage 0\|oversee resume\|forge hephaestus\|freez\|frozen ticket"
   docs/monorepo/hephaestus-talos.md`. And
   `grep -c "board-readings" docs/monorepo/hephaestus-talos.md` prints 1: the sentence of section 1 that says no such
   package exists.
7. Where a check fails, correct the markdown to `owner-answers.md` in the same change, one sentence each, citing the
   decision's number.
8. In `migration.svg`, give stage 4 the title "The standing contract" and the line "documents, commands, served
   facts"; draw stage 8 in Gaia's blue as stage 7 is drawn, with the legend reading "(stages 7 and 8: both)"; and
   bring the `<desc>` in line with both. Render `migration.png` from it at 1360 by 1420 pixels, the size of the PNG it
   replaces.
9. Render `hephaestus-talos.html` again from the markdown with `marked` from the root's `node_modules` (installed, so
   nothing is added), keeping the page's `<head>`, its styles, its `<section data-section>` wrapping and its inline SVG
   figures as they are, so only the text of the body changes. Take each inline figure from its `.svg` file.

Specs: none (documents and figures).

Done when: every check of steps 1 to 6 holds; `git diff --stat` shows only the design, its HTML page and the migration
figure; `grep -c "A hung Hephaestus counts as gone" docs/monorepo/hephaestus-talos.html` and
`grep -c "become libraries in Gaia" docs/monorepo/hephaestus-talos.html` each print 1 or more;
`grep -c "Extract the packages" docs/monorepo/figures/hephaestus-talos/migration.svg` prints 0;
`sips -g pixelWidth -g pixelHeight docs/monorepo/figures/hephaestus-talos/migration.png` prints 1360 and 1420; and
`grep -c 'data-section=' docs/monorepo/hephaestus-talos.html` prints the count it printed before the change.

### WP1.1 Bring the migration checklist to the landed monorepo

Purpose: `docs/monorepo/migration.md` still says P7 waits for the go (`migration.md:7-9`). Close it so it names no open
work, with evidence for each tick and a reason for each item closed without one.

Files to change: `docs/monorepo/migration.md`.

What to do:

1. Check each P7 item read-only and keep the result for the commit message:
   - `ls -d .forge .forge-worktrees` at the root fails (the root tracker is gone);
   - `apps/forge/.forge/pipeline.json` and `apps/gaia/.forge/pipeline.json` read `version` 3, a prepare step
     `bun install --frozen-lockfile` with `in` `/`, the gates `bun run gate:forge` (or `gate:gaia`) and
     `bun run cache:audit` with `in` `/`, and the reach of the root `CLAUDE.md` table (read them with a JSON reader;
     write nothing into `.forge`);
   - `ls ~/Library/LaunchAgents | grep com.forge.overseer` shows two items; once gate G3 has removed them, table D's
     record of the two is the evidence;
   - `ls -d ~/Applications/Gaia.app` exists;
   - `git -C ~/.forge-program log --oneline -1` shows the installed clone's commit;
   - `git worktree list` shows no `graphite-orange-handoff-ebd9dc`, and `ls` of the main checkout's
     `.claude/.evidence/gaia/` lists `gaia-strategy.html` and Gaia's handoff folders;
   - forge's Claude Code project memory holds Gaia's notes (its `gaia-*.md` files), checked by listing the folder.
   Never read or list `~/.forge-monitor` or `~/.gaia`, and run no forge verb.
2. Tick P6's last item and every P7 item step 1 proved, the copy of Gaia's old checkout and the memory among them.
   Close the P7 smoke as superseded: both trackers stop and their boards are set up anew (decision 46), and every stage
   of this run ends on a scratch forge instead.
3. Replace the status line (`migration.md:7-9`) with the landed state: P0 to P8 done, the trackers in `apps/forge` and
   `apps/gaia`, stopped for the Hephaestus and Talos run until their boards are set up anew, the installed forge in a
   second clone.
4. Close B15 and the four "Still open" decisions (`migration.md:195-204`), each moved to "Decisions" as "Decided by the
   run on <date>" with one clause: B15 superseded, since Gaia identifies a project by its forge (design section 8);
   decision 1 closed, since Gaia supports exactly one forge version (`apps/gaia/CLAUDE.md:36-38`) and nothing is kept
   (decision 32); decision 2 decided by `apps/forge/CLAUDE.md:281-284`; decision 3 built (`CodeVersion.ts:3`), once
   `bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/CodeVersion.spec.ts` in `apps/forge` passes;
   decision 4 closed, since boards are set up anew (decisions 32, 46).
5. Remove nothing from the history of a phase; only the status, the ticks, "Still open" and "Decisions" change.

Specs: none.

Done when: `grep -n '\- \[ \]' docs/monorepo/migration.md` prints nothing, every item closed without a tick names its
reason, and "Still open" is empty.

### WP1.2 Settle the base: drop the in-flight tickets, remove the leftover branches

Purpose: the refactoring changes the Playbook, the Watcher and every stored name; a branch or a tracker that moves
`main` beside it turns each stage's traces and line numbers stale. Every in-flight ticket is dropped and both trackers
stay stopped until their boards are set up anew (decision 46). Runs alone.

Depends on gate G3: the owner has stopped both trackers and removed both login items ("Needs the owner", item 2).

Files to change: none tracked. Git worktrees and branches, and the evidence folder.

What to do:

1. Confirm the main checkout holds no uncommitted change: `git -C <main checkout> status --porcelain` prints nothing.
   If it prints anything, stop and hand it to the owner to commit or discard; Claude commits nothing in the main
   checkout.
2. Confirm gate G3 by what the machine shows: `ls ~/Library/LaunchAgents | grep com.forge.overseer` prints nothing;
   `pgrep -fl forge-program` prints nothing; and `lsof -d cwd 2>/dev/null | grep -F .forge-worktrees` prints nothing,
   so no process, an agent's among them, works in a ticket's worktree. If anything prints, stop and hand it to the
   owner.
3. Save each dropped ticket's uncommitted work. For each worktree `apps/forge/.forge-worktrees/ticket-001`, `-005`,
   `-008`, `-009`, `-014` and `apps/gaia/.forge-worktrees/ticket-001`, into
   `.claude/.evidence/hephaestus-talos/stage-1/dropped-tickets/` in the main checkout:
   - `git -C <worktree> diff --binary HEAD > <app>-ticket-<n>.patch`;
   - where `git -C <worktree> ls-files --others --exclude-standard` lists files, archive them into
     `<app>-ticket-<n>-untracked.tar`:

     ```sh
     (cd <worktree> && git ls-files --others --exclude-standard -z \
       | tar --null -T - -cf <evidence folder>/<app>-ticket-<n>-untracked.tar)
     ```

4. Remove the six worktrees with `git worktree remove --force <worktree>`, then `git worktree prune`. Keep their
   branches `forge/forge/ticket-001`, `-005`, `-008`, `-009`, `-014` and `forge/gaia/ticket-001`. Leave `hatch/` and
   `sessions/` in each `.forge-worktrees` folder: they are tracker data, set up anew with the boards.
5. `entities/integration`, merged: confirm `git rev-list --count main..entities/integration` prints 0 and that its
   worktree holds nothing uncommitted (`git -C .claude/worktrees/entities-integration status --porcelain` prints
   nothing), then remove the worktree with `git worktree remove .claude/worktrees/entities-integration` and delete the
   branch with `git branch -d entities/integration`. If either check fails, stop and ask the owner.
6. `claude/project-thread-dw1bcu`: write `git rev-parse claude/project-thread-dw1bcu` into the base record, then delete
   it with `git branch -D claude/project-thread-dw1bcu`.
7. If `main` moved past `e9b5d057`, rerun the traces of tables A to C and update this file's line numbers in the same
   change.
8. Record in `.claude/.evidence/hephaestus-talos/stage-1/base.txt`: `git rev-parse main`,
   `git rev-parse hephaestus-talos`, the deleted branch's tip, `git branch --no-merged main`,
   `git branch --list 'forge/*'`, `git worktree list`, the saved files of step 3 with their sizes, and the outputs of
   step 2.

Specs: none.

Done when: `git status --porcelain` in the main checkout prints nothing; `git branch --no-merged main` prints only the
integration branch `hephaestus-talos`; `git branch --list 'entities/*' 'claude/*'` prints nothing;
`git branch --list 'forge/*'` prints the six ticket branches; `git worktree list` shows no `entities-integration` and no
`.forge-worktrees` path; the dropped-tickets folder holds a patch per ticket; `base.txt` holds every item of step 8.

### WP1.3 The stage's gate

Purpose: prove the base is green before stage 2 starts.

Files: none.

What to do: in a fresh worktree of the integration branch under `.claude/worktrees/stage-1-gate`, run the root
verification below, then remove the worktree.

Done when: every command of "Verification of the whole stage" ends with exit 0, and the cold forced run is green once.

## Interfaces introduced

No type, frame, command kind, endpoint or package is introduced by this stage. It introduces these records and names,
which later stages build on.

1. **The outage fixture pair.** In `apps/forge/src/lib/claude-code/testing/fixtures/`:
   `network-outage-retries-spent.stdout.jsonl` and `network-outage-retries-spent.stdin.jsonl`. Format: one JSON object
   per line, as every fixture pair. Session id `7a1f0c52-0001-4000-8000-000000000001`; paths synthetic under
   `/repo`. Lines stage 2 matches:
   - retry line: `{ "type": "system", "subtype": "api_retry", "attempt": number, "max_retries": number,
     "retry_delay_ms": number, "error_status": number | null, "error": string, "no_response"?: { "waited_ms": number,
     "retry_wait_ms": number }, "session_id": string, "uuid": string }`, the key set read from the 2.1.326 and 2.1.327
     program text and confirmed or corrected by the recording;
   - closing line: `{ "type": "result", "is_error": true, "subtype": string, "api_error": ..., "api_error_status":
     number | null, "terminal_reason": string, ... }`, with the exact values the recording shows written into P23 and
     the claims. These keys are present on the committed P10 result line
     (`rate-limit-rejected.stdout.jsonl`), so they are the stable fields to match.
2. **Probe record P23** in `apps/forge/docs/development/overseer-claude-probe.md`: heading, a "What the run showed"
   block covering recordings A and B, a "Selects" line; the next free number, since the record ends at P21 and the
   fixture claims name P22 for Flint's brain (`ClaudeStreamFixtures.spec.ts:165`).
3. **The claims block** `describe('network-outage-retries-spent (P23, Claude Code <version>)')` in
   `ClaudeStreamFixtures.spec.ts`, `<version>` the one `notes.txt` names (2.1.327 is installed on 2026-11-18), its
   test names claims as listed in WP0.4 step 3.
4. **The base** every later stage starts from: both trackers stopped, both login items absent, the six ticket branches
   `forge/forge/ticket-<n>` and `forge/gaia/ticket-001` kept with no worktree, no `entities/integration` and no
   `claude/project-thread-dw1bcu`, and `main` at the commit `stage-1/base.txt` names.
5. **Evidence folders** (ignored, never committed): `.claude/.evidence/hephaestus-talos/stage-0/recovery-baseline.txt`,
   `.claude/.evidence/hephaestus-talos/stage-0/outage/` (`stdin.jsonl`, `a.stdout.jsonl`, `a.stderr.txt`,
   `b.stdout.jsonl`, `b.stderr.txt`, `notes.txt`), `.claude/.evidence/hephaestus-talos/stage-1/base.txt` and
   `.claude/.evidence/hephaestus-talos/stage-1/dropped-tickets/`.

## Traps

- **The traces go stale the moment anything lands on `main`.** Tables A to C are traced on `e9b5d057`. If `main` moved
  past it before WP1.2, rerun them in the same change (WP1.2 step 7), or stages 2 and 3 work from wrong line numbers.
- **Working in the main checkout holds a landing.** A landing finds the main checkout dirty and holds the target
  (`Landing.ts:126`, `Landing.ts:134`; the `dirty-main-checkout` notice, `DrivePass.ts:288-289`). Work in
  `.claude/worktrees/<name>`.
- **A recording made inside the repository loads forge's hooks.** The repository's Claude settings carry forge's
  SessionStart hook and network guard, and a parent session's `CLAUDE*` variables leak into a child
  (`overseer-claude-probe.md:394-397`). Record only in `/tmp/outage-probe/repo` under `env -i`.
- **Turning the network back on early records a recovery, not an ending.** The retries wait longer between attempts as
  they go; keep the network off until the `result` line is written, in recording B as in A.
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
- **Reading a tracker's data is not running a forge verb, but writing it is touching a board.** WP1.1 reads
  `pipeline.json` with a JSON reader only; it never opens a `.forge` file for writing and never runs `forge`.
- **`~/.forge-monitor` and `~/.gaia` are off limits even for a listing** (root `CLAUDE.md`, "Never touch the real
  home"). The login items are checked by their LaunchAgent names in `~/Library/LaunchAgents`, never through the
  registry.
- **A paused board still resumes.** Stage 3 builders reading table A must not assume `oversee pause` holds a resume
  today; it holds only new launches (`Playbook.ts:770-771`).
- **Stopping the Overseer stops no agent.** `stop` without `--now` leaves every agent Watcher running, and `--now`
  stops only install and gate Watchers (table A); `job stop` sends no frame to a merge agent
  (`apps/forge/docs/cli.md:1589`). WP1.2 step 2 checks the processes, not the board's records, before a worktree goes.
- **Starting an Overseer to tidy a board resumes its jobs.** Nobody starts either tracker again in this run; a login
  item left in place starts one at the next login, which is why gate G3 removes both.
- **A forced worktree removal discards uncommitted work.** Five of the six ticket worktrees hold uncommitted changes
  (table D); save them (WP1.2 step 3) before `git worktree remove --force`.
- **A ticket branch is merged into `main` by git's measure.** Each is 0 commits ahead, so a sweep of merged branches
  (`git branch --merged main | xargs git branch -d`) would delete them; WP1.2 keeps them and deletes only the two
  branches it names.
- **The checklist holds over the design where they differ** (`migration.md:4-5`). WP1.1 changes status and ticks, not
  the phases' records, so the history the design relies on stays.
- **WP0.5 checks the design; it does not write it again.** The decisions are in section 2 already; a check that fails
  is corrected in one sentence, and a rendering is made from the markdown, never edited by hand into a different text.

## Verification of the whole stage

At the repository root, in a fresh worktree of the integration branch after WP1.2:

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

and the real-system baseline of WP0.2, rerun once on the final `main` if `main` moved past `e9b5d057`, with the same 0
failures.

End-to-end on a scratch forge: this stage changes no runtime code of forge or Gaia (a fixture, a spec, documents), so
there is no new behaviour to exercise. The real-system baseline of WP0.2, which runs the Overseer's pass, Watchers and
the fake agent on scratch repositories, is the end-to-end proof that the base works.

Repository state:

- `git status --porcelain` prints nothing; `git branch --no-merged main` lists only `hephaestus-talos`;
  `git branch --list 'forge/*'` lists the six ticket branches; `git worktree list` lists no `.forge-worktrees` path and
  no `entities-integration`.
- `ls ~/Library/LaunchAgents | grep com.forge.overseer` prints nothing, and no process of the installed program runs.
- `docs/monorepo/hephaestus-talos.md` section 12 "To decide" holds no open question, and decision 48 says how a user
  changes a committed ticket; WP0.5's checks hold.
- `docs/monorepo/migration.md` has no unticked item and no "Still open" item.

## Out of scope

- Writing Talos's ending patterns or any mapper change for the outage ending: stage 2. This stage commits the evidence
  and its claims only.
- Bounding gate and install lines, recording their run times: stage 2 (decisions 36, 37).
- Changing any resume rule, cause or crash bound of table A, or rewriting a matrix row: stage 3.
- Persisting any in-memory state of table C: stage 3 (and stage 2 for the child records).
- Making any Airlock step of table B safe to redo, or naming a half-done release cleanup at start: stage 3's reconcile.
- Serving finished facts in the board document, declaring the board and ticket documents and command kinds in
  `forge-contracts`, and the entities draft: stage 4 (decisions 44, 45, 50).
- Deleting the Bridge, removing `forge open` and the `progress.html` stub, and folding `design-system`, `flint` and
  `brand` into Gaia's page `lib/`: stage 8 (decisions 43, 52).
- Building B15 or any registry field: closed here, never built here.
- Running any forge verb (`job stop`, `stop`, `login-item remove`, `init`, `update`, `clear`): the owner's, at gate G3
  or in stage 9.
- Setting up the boards anew and deciding what becomes of the six kept ticket branches: stage 9 and the owner's steps
  around it (gate G6).
- Pulling the installed clone `~/.forge-program`.

## Needs the owner

1. **Gate G1: record recordings A and B** of WP0.3, since no session may start a vendor session. The steps are in
   WP0.3; it takes a few minutes each with the network off.
2. **Gate G3: stop both trackers and remove their login items**, since only the owner runs a forge verb here
   (`apps/forge/CLAUDE.md:357-359`). With the installed program, in `apps/forge` and then in `apps/gaia`:
   - `forge job stop --all`: pauses the board and stops every build, review and product-owner job in one hold
     (`apps/forge/docs/cli.md:1560`); a merge agent is not stopped by it, so let a running merge end first;
   - `forge stop --now`;
   - `forge login-item remove`, then `forge login-item status`, which must read `state` `absent`
     (`apps/forge/docs/cli.md:1374`).
   Then tell the run it is done; WP1.2 checks the machine and does the rest. Neither tracker is started again in this
   run.

## Not established

- Whether `main` at `e9b5d057` is green as a whole: WP0.2 ran the recovery specs green at `5b68d0ad` (235 pass, 0
  fail), and no root `verify` has run for this plan; WP1.3 establishes it.
- What Claude Code 2.1.327 (or the version installed when WP0.3 runs) writes when the network is off: the exact result
  fields and values, the number of retries, the waits between them, whether a session starts at all with no network,
  and what `CLAUDE_CODE_MAX_RETRIES` does. Only the names of the setting and of the `api_retry` line's keys were read,
  from the program text.
- How a session ends on a provider overload (a 5xx or 529) after its retries: it cannot be caused on demand and no
  stand-in is recorded, so decision 35's overload form rests on the retry line's `error_status` as the program text
  names it.
- What a stop inside `git merge --ff-only` of the main checkout leaves (a partial checkout or an `index.lock`), and
  whether the next landing then holds the target or fails differently; table B traces the stops between steps only.
- Where the earlier probes' driver scripts are (`drive.py`, `export-fixture.py`):
  `.claude/.evidence/runner-claude-probe/` does not exist in this checkout, so WP0.3 and WP0.4 do not rely on them.
- Whether the two login items are loaded; only their file names in `~/Library/LaunchAgents` were seen. On 2026-11-18
  no process of the installed program and no `claude -p` session ran.
- What the dropped tickets' uncommitted changes hold; WP1.2 saves them and reads none.
- Whether the gate slot of an in-process merged-tree gate frees exactly as table B says in every case; the holder check
  is read (`GateRunSlots.ts:107-112`), not run.
- Why the fixture claims name a probe P22 that has no entry in the probe record.
- How the HTML page is rendered: no script in the repository makes it; WP0.5 renders it with `marked`.
