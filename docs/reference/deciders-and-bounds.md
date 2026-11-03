# Deciders and bounds

> **Question:** Which code decides this, from what inputs, and what number bounds it?
> **Time:** 5 minutes for the first two sections; the tables are for lookup.
> **Read first:** [Overview](../concepts/overview.md), [The Pass](../architecture/the-pass.md).
> **Next:** [Known gaps](known-gaps.md), [Refusals](refusals.md), [Code map](../architecture/code-map.md).

## In one screen

Every lifecycle choice in agent-progress is one function that returns an answer, and every count that limits a choice
is one `SCREAMING_CASE` constant. This document is the single home of those values, as of commit 70ce56de. Other
documents name a constant and link here.

![Four inputs, log records, the stored board, observations and bound constants, feed a decider that fails closed. It
returns one answer: go on, held for User, refused, or a plain answer such as a count, order, route or port. The caller
acts, unless the check and the act must be one step.](../figures/deciders-and-bounds/a-decider-answers-others-act.png)

*Notice what is absent: no decider takes a clock, apart from the [clock exceptions](#clock-exceptions), and no decider
words its refusal.*

Counts that park or replace live in the [log](../glossary.md#log) or the stored [board](../glossary.md#board), so the
[Playbook](../glossary.md#playbook) derives the same steps on the [Pass](../glossary.md#pass) after a restart. [Bounds
fall into three kinds](#how-many-times-before-it-gives-up): a resume bound ends in a [park](../glossary.md#park), a
replacement or an [incident](../glossary.md#incident); a [call budget](../glossary.md#call-budget) stops a session; a
`*_TRIES` constant only limits a wait. [Three things are settings](#what-configuration-changes); the rest are source
constants.

## How many times before it gives up

Nothing retries forever except the gate slot wait and an Assistant boot: most bounds are 2 or 3, then the ticket parks,
the job is replaced or an incident opens. Constants resolve in [Bounds](#bounds). A call in a call budget is one
top-level model turn of the [session](../glossary.md#session), subagent turns excluded (`sessionReadingOf` in
`src/services/overseer/JobLaunch.ts`), not one tool use. Grace is the `WIND_DOWN_GRACE_CALLS` calls a session keeps
after the [wind-down](../glossary.md#wind-down) message.

| Question | Answer | Arithmetic | Then | Home |
| --- | --- | --- | --- | --- |
| [Failed passes](../glossary.md#failed-pass) on a [ticket](../glossary.md#ticket) | 2 | `FAILED_PASSES_BEFORE_PARKING` | Parks `failed-passes` | [Build and review](../architecture/build-and-review.md) |
| Sessions a crashing [job](../glossary.md#job) starts | 3 | 1 launch + `JOB_RESUMES_BEFORE_FRESH` | Job ends `replaced`, fresh job. An [Assistant](../glossary.md#assistant) is never resumed; a [product owner](../glossary.md#product-owner) past the bound waits for its answer or takes a fresh intake | [Failure and recovery](../architecture/failure-and-recovery.md) |
| Crash-ended sessions before a ticket's `job-lost` | 6 | 3 × `REPLACED_JOBS_BEFORE_JOB_LOST` | Incident `job-lost`, default `ticket-park` | [Failure and recovery](../architecture/failure-and-recovery.md) |
| [Red handoffs](../glossary.md#red-handoff) in one [handoff cycle](../glossary.md#handoff-cycle) | 3 | 1 + `RED_HANDOFF_RESUMES_BEFORE_PARKING` | Third red parks `red-resumes-spent` | [Build and review](../architecture/build-and-review.md) |
| Calls across red handoffs of one [builder](../glossary.md#builder) job | 240 | `BUILDER_API_CALL_BUDGET` + `WIND_DOWN_GRACE_CALLS` + `RED_HANDOFF_RESUMES_BEFORE_PARKING` × (`RED_HANDOFF_RESUME_CALL_BUDGET` + `WIND_DOWN_GRACE_CALLS`) = 150 + 10 + 2 × (30 + 10) | Third red parks; a `wound-down` [report](../glossary.md#report) opens `out-of-calls` instead | [Build and review](../architecture/build-and-review.md) |
| Calls across red handoffs of one [reviewer](../glossary.md#reviewer) job | 165 | `REVIEWER_API_CALL_BUDGET` + `WIND_DOWN_GRACE_CALLS` + `RED_HANDOFF_RESUMES_BEFORE_PARKING` × (`RED_HANDOFF_RESUME_CALL_BUDGET` + `WIND_DOWN_GRACE_CALLS`) = 75 + 10 + 2 × (30 + 10) | Third red parks | [Build and review](../architecture/build-and-review.md) |
| Calls in a builder cycle with two returned reviews | 480 | (1 + `RED_HANDOFF_RESUMES_BEFORE_PARKING`) × (`BUILDER_API_CALL_BUDGET` + `WIND_DOWN_GRACE_CALLS`) = 3 × (150 + 10) | Third [review ending `does-not-hold`](../glossary.md#failed-pass) parks `red-resumes-spent` | [Build and review](../architecture/build-and-review.md) |
| Back-to-back crashes on different tickets | 2 | `CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING` | [Overseer](../glossary.md#overseer) pauses, `outage` [decision](../glossary.md#decision) | [Failure and recovery](../architecture/failure-and-recovery.md) |
| Failed Assistant boots in a row | 2 | `FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING` | Incidents default until one answers | [Assistant and intake](../architecture/assistant-and-intake.md) |
| [Target](../glossary.md#target) moves in a row under a merge | 2 | `TARGET_MOVED_MERGES_BEFORE_PARKING` | Parks `target-moved` | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| [Review rounds](../glossary.md#review-round) | No fixed count | None; `nextRoundVerdictOf` grants each repeat. Each repeat needs rework above `REWORK_ROUND_THRESHOLD_LINES`; from round 3 on, findings must also converge | The next round is refused with a reason and no further review round runs: the ticket queues to merge or waits on a waiver | [Build and review](../architecture/build-and-review.md) |
| [Findings](../glossary.md#finding) a worker may file | 10 | `WORKER_FILINGS_PER_JOB` | Refused `worker-filing-limit` | [Control and Hatch](../architecture/control-and-hatch.md) |

![A builder's first attempt has 150 calls plus 10 of grace, and a red handoff resumes the same session with 30 plus 10,
twice, so a third red parks the ticket after at most 240 calls. A report that clears leaves for review or the Airlock.
A wound-down report, or a first attempt still silent at the limit, opens out-of-calls; a silent resume counts as
red.](../figures/deciders-and-bounds/red-handoff-call-ladder.png)

*Notice that a resume is a fifth of a first [attempt](../glossary.md#attempt): a red handoff asks for a fix, not a
rebuild.*

A review that sends the builder back spends one resume of the same cycle (`handoffCycleResumesOf`), and that builder is
a job of its own with the full budget, which is where 480 comes from. A replaced or fresh job adds its own budget on
top. Rules: [Build and review](../architecture/build-and-review.md), section Call budgets.

A [merge agent](../glossary.md#merge-agent) in the [Airlock](../glossary.md#airlock) has no grace. The Overseer stops it
when its count reaches its budget, and the merge is refused `out-of-calls`. Its red handoff resumes are counted per
merge job against `RED_HANDOFF_RESUMES_BEFORE_PARKING`; past them the merge aborts and the ticket parks
`merge-gate-red`.

### Derived durations

A person asks these in seconds, and no constant holds them. Each is tries × interval, or [sweeps](../glossary.md#sweep)
× sweep interval.

| Wait | Arithmetic | Duration | At the end |
| --- | --- | --- | --- |
| A relayed verb for its reply | `HATCH_REPLY_TRIES` × `HATCH_REPLY_INTERVAL_MILLISECONDS` = 20 × 250 ms | 5 s | Prints `queued <requestId>` |
| A writer for the [tracker](../glossary.md#tracker) lock | `LOCK_RETRY_COUNT` × `LOCK_RETRY_INTERVAL_MILLISECONDS` = 50 × 100 ms | 5 s of sleep, at most | `tracker-lock-held` |
| `agent-progress-v2 oversee --detach` and `agent-progress-v2 oversee restart` for the Overseer they started | `OVERSEER_READY_TRIES` × `OVERSEER_READY_INTERVAL_MILLISECONDS` = 40 × 250 ms | 10 s | `overseer-did-not-start` |
| `agent-progress-v2 oversee stop` for the [Baton](../glossary.md#baton) to go | `OVERSEER_STOP_TRIES` × `OVERSEER_STOP_INTERVAL_MILLISECONDS` = 40 × 250 ms | 10 s | Reports the Overseer still live |
| Old Overseer for the successor's `ready` | `BATON_PASS_READY_TRIES` × 250 ms = 120 × 250 ms | 30 s | Kills the successor, keeps driving |
| Successor for `released`, then old Overseer for `serving` | `BATON_PASS_RELEASE_TRIES` × 250 ms = 240 × 250 ms | 60 s each | Fails the step; the old Overseer takes the Baton back |
| Old Overseer rebinding its port on the way back | `BATON_PASS_REBIND_TRIES` × 250 ms = 40 × 250 ms | 10 s | Refused `baton-pass-failed`, step `bind-port`; the old Overseer exits and the board has no Overseer |
| `agent-progress-v2 oversee restart` and `agent-progress-v2 update` for a [Baton pass](../glossary.md#baton-pass) outcome | `BATON_PASS_OUTCOME_TRIES` × 250 ms = 600 × 250 ms | 150 s | Refused `baton-pass-failed` |
| A running job's [event log](../glossary.md#event-log) standing still | `QUIET_JOB_SWEEPS` × `OVERSEER_SWEEP_SECONDS` = 6 × 30 s | 3 to 3.5 minutes | `quiet-job` incident |
| An Assistant mid-turn standing still | `QUIET_JOB_SWEEPS` × `OVERSEER_SWEEP_SECONDS` | 3 to 3.5 minutes | The session ends, a fresh one boots |
| `agent-progress-v2 oversee stop --now` for [Watchers](../glossary.md#watcher) running a command to end | `STOPPED_WATCHER_WAIT_TRIES` × `STOPPED_WATCHER_WAIT_INTERVAL_MILLISECONDS` = 100 × 20 ms | 2 s | Stops waiting |

The quiet window is a range because the first sweep to see a [cursor](../glossary.md#cursor) records it, and the sweeps
count from there.

`BATON_PASS_OUTCOME_TRIES` is the sum of the three waits inside it, so the caller outlasts each of them.

![BATON_PASS_OUTCOME_TRIES, 150 seconds, is the sum of BATON_PASS_READY_TRIES, 30 seconds, and BATON_PASS_RELEASE_TRIES
twice, 60 seconds each. A failed ready wait keeps the old Overseer driving; a failed release or serving wait takes the
Baton back. BATON_PASS_REBIND_TRIES, 10 seconds, runs only on the way back, outside the
sum.](../figures/deciders-and-bounds/baton-pass-waits.png)

*Notice the tail past the caller's bar: only a failed Baton pass reaches it.*

> **As built.** A [gate](../glossary.md#gate) waiting for a [gate slot](../glossary.md#gate-slot) has no time bound:
> `GateRunSlots.acquire` retries every `GATE_SLOT_RETRY_MILLISECONDS` until a gate slot frees. A gate itself has no
> timeout, and neither does a [pipeline](../glossary.md#pipeline) step; see [a slow merge
> gate](known-gaps.md#gap-merge-gate-blocks-pass).

## Deciders

Each question has one function; the table says where it is, what it reads and who carries out its answer.

![A ticket passes six stations left to right: Launch, Report, Gate, Review, Airlock and Landing, each with its main
deciders. Four more deciders answer at any step: Playbook.nextStepsOf, livenessOf, Baton.acquire and
Bouncer.verdictOf.](../figures/deciders-and-bounds/decider-map.png)

*Notice that the stations follow one ticket; the transitions between them belong to [State
machines](../data-model/state-machines.md).*

How each one decides: [The Pass](../architecture/the-pass.md), [Build and review](../architecture/build-and-review.md),
[Customs and gates](../architecture/customs-and-gates.md), [Airlocks and
groups](../architecture/airlocks-and-groups.md), [Control and Hatch](../architecture/control-and-hatch.md),
[Watchers](../architecture/watchers.md) and [Baton](../architecture/baton.md).

| Question | File and symbol | Inputs | Acts | Spec |
| --- | --- | --- | --- | --- |
| What runs next? | `src/lib/tracker-model/Playbook.ts`, `Playbook.nextStepsOf` | `PlaybookFacts`, `LifecycleLimits` | `Board.followPlaybook` | `src/lib/tracker-model/Playbook.spec.ts` and its `src/lib/tracker-model/Playbook.interleavings.spec.ts`, `src/lib/tracker-model/Playbook.redHandoff.spec.ts`, `src/lib/tracker-model/Playbook.reviewPhase.spec.ts` suites |
| Is a ticket held? | `src/lib/tracker-model/Playbook.ts`, `ticketIsHeld` | [Hold](../glossary.md#hold), `mergeQueued`, open decisions and incidents, observations | `launchStepsOf`, `mergeQueueStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| How many [launch slots](../glossary.md#launch-slot) are free? | `src/lib/tracker-model/Playbook.ts`, `freeSlotsOf` | `concurrencyLimit`, live `build` and `review` jobs | `launchStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| Which ticket launches first? | `src/lib/tracker-model/Playbook.ts`, `candidateOrder` | Priority, phase, readiness, id | `launchStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| Is the board in an outage? | `src/lib/tracker-model/Playbook.ts`, `Playbook.outageIsDue` | Log records | `nextStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| How many failed passes? | `src/lib/tracker-model/utils/FailedPassUtil.ts`, `failedPassesOf` | Log records | `parkStepsOf` | `src/lib/tracker-model/utils/FailedPassUtil.spec.ts` |
| Is a ticket ready? | `src/lib/tracker-model/utils/TicketDependencyUtil.ts`, `readyTicketIdsOf` | Tickets, readiness positions | `DispatchQueries`, status output | `src/lib/tracker-model/utils/TicketDependencyUtil.spec.ts` |
| Is a ticket move legal? | `src/lib/tracker-model/utils/TicketMoveUtil.ts`, `ticketMoveIsLegal` | `LEGAL_SOURCE_STATUSES_FOR_TICKET_STATUS` | `TicketMoves` | `src/lib/tracker-model/constants/TicketMoveLegality.spec.ts`, `src/lib/tracker-model/Board.ticketMoves.spec.ts` |
| Is a job move legal? | `src/lib/tracker-model/constants/JobMoveLegality.ts`, `LEGAL_SOURCE_STATES_FOR_JOB_MOVE` | Job state, target state | `Jobs` | `src/lib/tracker-model/Board.jobs.spec.ts` |
| Does a report clear [Customs](../glossary.md#customs)? | `src/services/lifecycle/Customs.ts`, `clearCustoms`, `CHECKS_OF_ROLE` | `CustomsSubject`: report, git range, launch snapshot, log | `JobLaunch.verifyAndRoute`, `Onboarding` | `src/services/lifecycle/Customs.spec.ts`, `src/services/lifecycle/Customs.verification.spec.ts`, `src/services/lifecycle/Customs.provenance.spec.ts`, `src/services/lifecycle/Customs.onboarder.spec.ts` |
| Did a gate pass? | `src/services/lifecycle/GateRun.ts`, `gateOutcomeOf` | Exit code, tracked changes | `runPipeline`, `JobLaunch.stepVerdictOf`, `ProposalTwiceRun` | `src/services/lifecycle/GateRun.integration.spec.ts` |
| What follows a review? | `src/services/lifecycle/ReviewOutcome.ts`, `settleReviewPass` | Report, rework count, recorded rounds | Itself; called by `JobLaunch` | `src/services/lifecycle/ReviewOutcome.spec.ts` |
| Is another review round granted? | `src/lib/tracker-model/utils/RoundVerdictUtil.ts`, `nextRoundVerdictOf` | Earlier rounds, this round's findings and rework, `RoundLimits` | `settleReviewPass` | `src/lib/tracker-model/utils/RoundVerdictUtil.spec.ts` |
| Which tickets may land on a target? | `src/lib/tracker-model/AirlockClaims.ts`, `mergeCandidatesOf` | Tickets, `mergeQueued`, decisions, jobs, [release bundle](../glossary.md#release-bundle) | `Airlocks.allocate` | `src/lib/tracker-model/Board.airlocks.spec.ts` |
| In what order do they land? | `src/services/overseer/Airlocks.ts`, `orderedPredictions` | Candidates, git merge predictions | `Airlocks.allocate` | `src/services/overseer/Airlocks.spec.ts` |
| In what order does the [Bridge](../glossary.md#bridge) show them? | `src/lib/tracker-model/utils/MergeQueueUtil.ts`, `orderOf` | Candidates, pairwise conflicts | `BoardState` | `src/lib/tracker-model/utils/MergeQueueUtil.spec.ts`, `src/services/overseer/BoardState.mergeQueue.spec.ts` |
| Is a [group](../glossary.md#group) refresh due? | `src/lib/tracker-model/utils/MergeQueueUtil.ts`, `groupRefreshIsDue` | Main's lead, group tip forecast, release state | `Airlocks` | `src/lib/tracker-model/utils/MergeQueueUtil.spec.ts` |
| May this claim take the Airlock? | `src/lib/tracker-model/AirlockClaims.ts`, `claimAirlock`, `claimRefreshSlot` | Claim, candidates or release state, holder | Itself; called by `Airlocks.allocate` | `src/lib/tracker-model/Board.airlocks.spec.ts` |
| Why was a [landing](../glossary.md#landing) refused, and what then? | `src/services/lifecycle/Landing.ts`, `landOnTarget`, `ticketRefusalOf`, `LANDING_OUTCOME_OF_REFUSAL` | Target tip, recorded landings, checkout state, [Acceptance](../glossary.md#acceptance) | Itself; called by `Airlocks` | `src/services/lifecycle/Landing.spec.ts` |
| May this job run this relayed verb? | `src/services/control/Bouncer.ts`, [`Bouncer`](../glossary.md#bouncer)`.verdictOf` | Job record from the [Hatch](../glossary.md#hatch) folder, command | `HatchInbox` | `src/services/control/Bouncer.spec.ts` |
| Which moves does an incident allow? | `src/services/control/Bouncer.ts`, `Bouncer.incidentMoveVerdictOf`, `ALLOWED_MOVES_BY_INCIDENT_KIND` | Incident, command | `IncidentControls`, `assistantVerdictOf` | `src/services/control/Bouncer.spec.ts` |
| When does an incident default? | `src/lib/tracker-model/Playbook.ts`, `incidentDefaultStepsOf` | Incidents, delivery turns, Assistant state | `Board.applyPlaybookStep` | `src/lib/tracker-model/Playbook.spec.ts` |
| What does the default do? | `src/lib/tracker-model/IncidentMoves.ts`, `IncidentMoves.defaultIncident` | Incident, `defaultMove`, earlier defaults in the log | Itself; called by `Board.applyPlaybookStep` | `src/lib/tracker-model/IncidentMoves.spec.ts` |
| Who answers an agent's question? | `src/services/overseer/QuestionRouting.ts`, `routeOf` | Question headers | `openQuestion` | `src/services/overseer/QuestionRouting.spec.ts` |
| Is a Watcher alive? | `src/services/overseer/WatcherFleet.ts`, `livenessOf` | Watcher record, process identity | `DrivePass`, `Regrouping` and others | `src/services/overseer/WatcherFleet.spec.ts` |
| Why was a Watcher lost? | `src/services/overseer/Regrouping.ts`, `settleLostWatcher` | Watcher record, boot identity, stored cause | Itself; called by `DrivePass`, `regroup` | `src/services/overseer/Regrouping.integration.spec.ts` |
| Does the install match the program? | `cli/InstallVersionVerdict.ts`, `installVersionVerdictOf` | Manifest reading, files present, `INSTALL_VERSION` | `requireCurrentInstall` | `cli/InstallVersionVerdict.spec.ts` |
| Which port? | `src/services/overseer/OverseerPort.ts`, `preferredPortOf`, `bindFirstFree` | Tracker id or `--port` | `bindFirstFree` itself; called by `OverseerServer` | `src/services/overseer/OverseerServer.integration.spec.ts` |
| Who holds the Baton? | `src/services/overseer/Baton.ts`, `Baton.acquire`, `acquireAbove`, `newestBatonOf` | Numbered Baton files, process identity | `Baton.acquire` and `acquireAbove` themselves; called by `OverseerForeground` | `src/services/overseer/Baton.spec.ts`, `src/services/overseer/BatonPass.spec.ts` |
| What may a worker touch? | `src/services/overseer/WorkerProfiles.ts`, `WorkerProfiles.profileOf` | Role, `SandboxFacts`, toolchain | `launchProfileOf` in `DrivePass` | `src/services/overseer/WorkerProfiles.spec.ts`, `src/services/overseer/WorkerProfiles.airlock.integration.spec.ts` |
| Is a lock free? | `src/services/tracker/TrackerLock.ts`, `generationIsFree` | Newest [generation](../glossary.md#generation) record, process, stamp | `attemptedAcquire` | `src/services/tracker/TrackerLock.spec.ts` |
| Which exit number? | `cli/Main.ts`, `runCommandLine` | The thrown refusal | `agent-progress.ts` | `cli/Main.spec.ts` |
| What words does a refusal print? | `src/adapters/utils/OperationRefusalWordingUtil.ts`, `messageOf` | `OperationRefusal` detail | `cli/Main.ts`, `CommandRoute` | `src/adapters/utils/OperationRefusalWordingUtil.spec.ts` and its suites |

These deciders carry out their own answer, so the check and the act stay one step. `landOnTarget` fast-forwards the
target. `Baton.acquire` and `acquireAbove` create the Baton file. `claimAirlock` and `claimRefreshSlot` launch the merge
or refresh job in the same hold. `settleReviewPass` commits, edits the ticket, records the review, ends the job and
moves the ticket. `IncidentMoves.defaultIncident` applies the default on the board. `settleLostWatcher` kills the child
group and stores the cause. `bindFirstFree` binds the port.

> **As built.** The Airlock and the Bridge order candidates separately; see
> [the duplicate order](known-gaps.md#gap-dead-code-and-unused-states).

> **As built.** A launch slot means one thing to `freeSlotsOf` and another to `status`; see
> [the two definitions](known-gaps.md#gap-slot-has-two-definitions).

## Bounds

Every design constant that bounds behaviour is here, read from the source at commit 70ce56de.

![Log records, the stored board and the Watcher's event log survive a restart, so counts such as
FAILED_PASSES_BEFORE_PARKING, JOB_RESUMES_BEFORE_FRESH and BUILDER_API_CALL_BUDGET carry on. Memory alone is cleared:
QUIET_JOB_SWEEPS, REPLAY_BUFFER_EVENTS and ROUNDS_PER_SWEEP start again. Schedules, timers and constants count
nothing.](../figures/deciders-and-bounds/restart-clears-memory.png)

*Notice how little sits in the memory row: a restart costs a wait, never a count that parks or replaces.*

"Read from" names where the counted value comes from at run time.

| Read from | Meaning | After a restart |
| --- | --- | --- |
| Log | The log records | Survives |
| Stored | `progress.json` or a ticket | Survives |
| Event log | The Watcher's file | Survives |
| Memory | A variable in the running process | Lost |
| Schedule | How often code looks; it counts nothing | Nothing to lose |
| Timer | A single wait | Nothing to lose |
| Constant | A value nothing counts | Nothing to lose |

Any other cell names its source directly. The Models and effort, Bridge and Other constants tables omit the column:
each value is read from the constant itself, and no Pass counts against it.

Files, abbreviated in the tables: `LifecycleLimits.ts`, `AirlockLimits.ts`, `DispatchProtocol.ts`, `OverseerLimits.ts`
and `Limits.ts` are under `src/shared/constants/`. Any other bare file name repeats the path of an earlier row.
`LIFECYCLE_LIMITS`, `AIRLOCK_LIMITS` and `DISPATCH_PROTOCOL` members are written bare. Commands in the tables omit
`agent-progress-v2`.

### Call budgets

Home: [Build and review](../architecture/build-and-review.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `BUILDER_API_CALL_BUDGET` | 150 | calls | Wind-down message | Event log | `DispatchProtocol.ts` |
| `REVIEWER_API_CALL_BUDGET` | 75 | calls | Wind-down message | Event log | `DispatchProtocol.ts` |
| `RESOLVER_API_CALL_BUDGET` | 75 | calls | Stopped, merge refused | Event log | `DispatchProtocol.ts` |
| `MERGE_FIXER_API_CALL_BUDGET` | 75 | calls | Stopped, merge refused | Event log | `DispatchProtocol.ts` |
| `RESOLUTION_REVIEWER_API_CALL_BUDGET` | 37 | calls | Stopped, merge refused | Event log | `DispatchProtocol.ts` |
| `WIND_DOWN_GRACE_CALLS` | 10 | calls | Past budget + grace: stopped `out-of-calls` | Event log | `OverseerLimits.ts` |
| `RED_HANDOFF_RESUME_CALL_BUDGET` | 30 | calls | Replaces the role's budget after a red handoff | Event log, from the resume | `OverseerLimits.ts` |
| `ASSISTANT_TURN_CALL_BUDGET` | 40 | calls in one turn | Interrupted; the turn's incidents default `turn-budget` | Event log | `OverseerLimits.ts` |

A product owner and an onboarder have no call budget.

### Resumes and parking

Home: [The rework ladder](../architecture/build-and-review.md#the-rework-ladder), [Failure and
recovery](../architecture/failure-and-recovery.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `FAILED_PASSES_BEFORE_PARKING` | 2 | failed passes | Parks `failed-passes` | Log | `LifecycleLimits.ts` |
| `RED_HANDOFF_RESUMES_BEFORE_PARKING` | 2 | resumes in a cycle | Next red of a build or review job parks `red-resumes-spent` | Log | `LifecycleLimits.ts` |
| `JOB_RESUMES_BEFORE_FRESH` | 2 | crash resumes | Next crash: `replace-job`, except for the Assistant and the product owner (see [How many times](#how-many-times-before-it-gives-up)) | Stored, `job.crashResumes` | `LifecycleLimits.ts` |
| `REPLACED_JOBS_BEFORE_JOB_LOST` | 2 | `replaced` endings in a row | Incident `job-lost` | Log | `LifecycleLimits.ts` |
| `CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING` | 2 | crashes on different tickets | `pause-overseer`, `outage` decision | Log | `LifecycleLimits.ts` |
| `FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING` | 2 | failed boots in a row | Open incidents default `no-assistant`; one boot per sweep | Log | `LifecycleLimits.ts` |
| `QUIET_JOB_SWEEPS` | 6 | sweeps | Build or review: `quiet-job`. Assistant mid-turn: ended | Memory | `OverseerLimits.ts` |
| `SESSION_STOP_GRACE_MILLISECONDS` | 5000 | ms | Watcher kills the process group | Timer in the Watcher | `OverseerLimits.ts` |

### Red handoff text

Home: [Build and review](../architecture/build-and-review.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `BATON_PASS_OUTPUT_LIMITS.HEAD_LINES` | 40 | lines | Kept from the top of a red output | Output | `src/services/overseer/RedHandoff.ts` |
| `BATON_PASS_OUTPUT_LIMITS.TAIL_LINES` | 40 | lines | Kept from the bottom | Output | `RedHandoff.ts` |
| `BATON_PASS_OUTPUT_LIMITS.BYTES` | 8192 | bytes | Cut, with a mark | Output | `RedHandoff.ts` |
| `BYTE_CUT_MARGIN` | 64 | bytes | Room kept for the cut's mark | Constant | `RedHandoff.ts` |

`BATON_PASS_OUTPUT_LIMITS` bounds the red handoff text despite its name.

### Reviews and rounds

Home: [Build and review](../architecture/build-and-review.md), which holds what each constant does in a
[round verdict](../glossary.md#round-verdict).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `REWORK_ROUND_THRESHOLD_LINES` | 750 | reworked code lines | Above it: another round is possible | Git, logged per round | `DispatchProtocol.ts` |
| `ROUND_GRANTED_ON_REWORK_ALONE` | 2 | round number | Round 2 needs only rework over `REWORK_ROUND_THRESHOLD_LINES`; later rounds also need converging findings | Job attempt | `LifecycleLimits.ts` |
| `FINDINGS_SHRINK_FACTOR_PER_ROUND` | 2 | factor | This round's findings must be at most half the last round's, or refused `findings-not-halved` | Log | `LifecycleLimits.ts` |
| `FIRST_REPEAT_REVIEW_ROUND` | 2 | round number | First `reviewRound` stored on a [row](../glossary.md#row); round 1 stores none | Stored | `src/lib/tracker-model/constants/ReviewRounds.ts` |
| `FIRST_REVIEW_BAR_ROUND` | 1 | round number | First [review bar](../glossary.md#review-bar)'s round | Stored | `ReviewRounds.ts` |

### Airlock

Home: [Airlocks and groups](../architecture/airlocks-and-groups.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `TARGET_MOVED_MERGES_BEFORE_PARKING` | 2 | moves in a row | Ticket parks `target-moved` | Log | `AirlockLimits.ts` |
| `GROUP_REFRESH_AFTER_MAIN_COMMITS` | 30 | commits on main | Refresh due | Git | `AirlockLimits.ts` |
| `CHECK_OUTPUT_TAIL_LINES` | 20 | lines | Gate output shown to a merge agent | Gate output | `AirlockLimits.ts` |
| `FRESH_BUILDER_API_CALL_BUDGET`, `FRESH_REVIEWER_API_CALL_BUDGET` | `BUILDER_API_CALL_BUDGET`, `REVIEWER_API_CALL_BUDGET` | calls | A fresh merge agent that replaced an unresumable session is stopped; merge refused `out-of-calls` | Event log | `AirlockLimits.ts` |
| `ROUNDS_PER_SWEEP` | 8 | advance-and-allocate cycles | An [Airlock slot](../glossary.md#airlock-slot) still moving waits for the next Pass | Memory, one sweep | `src/services/overseer/Airlocks.ts` |

### Assistant

Home: [Assistant and intake](../architecture/assistant-and-intake.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `ASSISTANT_HISTORY_RECORDS` | 20 | incident log records | Oldest left out of the first message | Log | `OverseerLimits.ts` |
| `ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH` | 200000 | tokens | Idle session's input closed; a fresh one boots | Event log | `OverseerLimits.ts` |

### Models and effort

Home: [Roles and launch](../architecture/roles-and-launch.md). Each value is read from the constant; a reviewer's can
come from `pipeline.json` ([What configuration changes](#what-configuration-changes)).

| Constant | Value | Applies to | File |
| --- | --- | --- | --- |
| `ASSISTANT_MODEL` | `sonnet` | The Assistant | `OverseerLimits.ts` |
| `ASSISTANT_EFFORT` | `medium` | The Assistant | `OverseerLimits.ts` |
| `WORKER_MODEL` | `opus` | Every other role, unless the pipeline sets a reviewer's | `OverseerLimits.ts` |
| `WORKER_EFFORT` | `medium` | Every other role, unless the pipeline sets a reviewer's | `OverseerLimits.ts` |
| `DEFAULT_AGENT_MODEL` | `opus` | Shown for a ticket with no `model` | `src/lib/tracker-model/constants/AgentSettings.ts` |
| `DEFAULT_AGENT_EFFORT` | `medium` | Shown for a ticket with no `effort` | `AgentSettings.ts` |

### Overseer timing and buffers

Home: [The Pass](../architecture/the-pass.md), [Baton](../architecture/baton.md),
[Watchers](../architecture/watchers.md).

| Constant | Value | Unit | Effect | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `OVERSEER_SWEEP_SECONDS` | 30 | s | Backstop re-read of the board; also the quiet-job tick | Schedule | `OverseerLimits.ts` |
| `OVERSEER_WATCH_DEBOUNCE_MILLISECONDS` | 150 | ms | A burst of file events settles before a wake | Schedule | `OverseerLimits.ts` |
| `OVERSEER_NUDGE_TIMEOUT_MILLISECONDS` | 500 | ms | A verb stops waiting on its nudge | Timer | `OverseerLimits.ts` |
| `OVERSEER_REQUEST_TIMEOUT_MILLISECONDS` | 2000 | ms | API reads as not answering | Timer | `OverseerLimits.ts` |
| `OVERSEER_READY_TRIES` | 40 | tries | `overseer-did-not-start` | Schedule | `OverseerLimits.ts` |
| `OVERSEER_READY_INTERVAL_MILLISECONDS` | 250 | ms | Spacing of those tries | Schedule | `OverseerLimits.ts` |
| `OVERSEER_STOP_TRIES` | 40 | tries | Reports the Overseer still live | Schedule | `OverseerLimits.ts` |
| `OVERSEER_STOP_INTERVAL_MILLISECONDS` | 250 | ms | Spacing of those tries | Schedule | `OverseerLimits.ts` |
| `OVERSEER_PORT_COUNT` | 100 | ports | Spread and reach; past it, `overseer-port-in-use` | Constant | `OverseerLimits.ts` |
| `OVERSEER_PORT_FIRST` | 4930 | port | Lowest preferred port of this build | Constant | `src/shared/constants/ProductNames.ts` |
| `REGROUP_HELLO_TIMEOUT_MILLISECONDS` | 2000 | ms | [Regrouping](../glossary.md#regrouping) reads the event log alone | Timer | `OverseerLimits.ts` |
| `WATCHER_FRAME_TIMEOUT_MILLISECONDS` | 2000 | ms | A frame send gives up | Timer | `src/services/overseer/WatcherFleet.ts` |
| `STOPPED_WATCHER_WAIT_TRIES` | 100 | tries | Stops waiting for Watchers running a command | Schedule | `WatcherFleet.ts` |
| `STOPPED_WATCHER_WAIT_INTERVAL_MILLISECONDS` | 20 | ms | Spacing of those tries | Schedule | `WatcherFleet.ts` |
| `WATCHER_LINGER_FRAMES` | 5 | client frames | An ended Watcher exits unacknowledged | Memory, in the Watcher | `src/lib/watcher/constants/WatcherProtocol.ts` |
| `MACOS_SOCKET_PATH_LIMIT_BYTES` | 104 | bytes | A socket path on macOS stays under it | Constant | `PosixSocketEndpoint.ts` |
| `LINUX_SOCKET_PATH_LIMIT_BYTES` | 108 | bytes | A socket path on Linux stays under it | Constant | `PosixSocketEndpoint.ts` |
| `LONGEST_TIMER_DELAY_MILLISECONDS` | 2147483647 | ms | Longest reset timer; a Pass woken early schedules the rest | Constant | `src/services/overseer/UsageLimits.ts` |
| `SSE_HEARTBEAT_SECONDS` | 5 | s | `: ping`, under Bun's idle timeout | Schedule | `OverseerLimits.ts` |
| `REPLAY_BUFFER_EVENTS` | 256 | events | Older events drop; a reconnect past them gets a fresh `board` | Memory | `src/services/overseer/EventBroker.ts` |
| `ENDED_JOBS_SHOWN` | 32 | jobs | Newest endings in `BoardState` | Log | `src/services/overseer/BoardState.ts` |

Preferred ports span 4930 to 5029; a busy port moves upward through `OVERSEER_PORT_COUNT` ports, so a board can land as
high as 5128 (5029 + 99). Derivation: [Watchers](../architecture/watchers.md).

### Baton pass waits

Home: [Baton](../architecture/baton.md). All of these share `BATON_PASS_READY_INTERVAL_MILLISECONDS`.

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `BATON_PASS_READY_INTERVAL_MILLISECONDS` | 250 | ms | Spacing of every try below | Schedule | `OverseerLimits.ts` |
| `BATON_PASS_READY_TRIES` | 120 | tries | Successor killed as silent | Schedule | `OverseerLimits.ts` |
| `BATON_PASS_RELEASE_TRIES` | 240 | tries | Step fails, each way | Schedule | `OverseerLimits.ts` |
| `BATON_PASS_REBIND_TRIES` | 40 | tries | Refused `baton-pass-failed`, step `bind-port`; the old Overseer exits and the board has no Overseer | Schedule | `OverseerLimits.ts` |
| `BATON_PASS_OUTCOME_TRIES` | 600 | tries | `baton-pass-failed`, step `serve` | Schedule | `OverseerLimits.ts` |

### Hatch

Home: [Control and Hatch](../architecture/control-and-hatch.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `HATCH_REPLY_TRIES` | 20 | tries | `queued <requestId>` | Schedule | `OverseerLimits.ts` |
| `HATCH_REPLY_INTERVAL_MILLISECONDS` | 250 | ms | Spacing of those tries | Schedule | `OverseerLimits.ts` |
| `WORKER_FILINGS_PER_JOB` | 10 | low findings | `worker-filing-limit` | Stored, `filedByJob` | `OverseerLimits.ts` |
| `SHORT_NOTE_CHARACTERS` | 300 | characters | Report schema refuses a longer note | Report | `src/adapters/reports/ReportSchemas.ts` |

### Gate slots

Home: [Customs and gates](../architecture/customs-and-gates.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `GATE_RUNS_AT_ONCE` | 2 | gates, machine-wide | The rest queue | `<monitor>` gate slot files | `OverseerLimits.ts` |
| `GATE_SLOT_RETRY_MILLISECONDS` | 500 | ms | Spacing of an in-process wait | Schedule | `OverseerLimits.ts` |
| `SLOW_GATE_MILLISECONDS` | 30000 | ms | A gate this slow is worth a cache: a suggestion | Twice-run timing | `src/services/lifecycle/CachingChecks.ts` |
| `PROPOSAL_RUN_COUNT` | 2 | runs | A proposed pipeline runs this many times | Constant | `src/services/lifecycle/ProposalTwiceRun.ts` |
| `GATE_HISTORY_RECORDS` | 200 | records | Newest gate runs an `advise` [onboarder](../glossary.md#onboarder) reads | Log | `src/services/overseer/Onboarding.ts` |

[Prepare steps](../glossary.md#prepare-step) take no gate slot (`GateRun.runPipeline`).

### Locks

Home: [Storage](../data-model/storage.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `LIMITS.LOCK_STALE_MILLISECONDS` | 30000 | ms | Taken over, live holder or not | Stored stamp | `Limits.ts` |
| `LIMITS.LOCK_RETRY_COUNT` | 50 | tries | `tracker-lock-held` | Schedule | `Limits.ts` |
| `LIMITS.LOCK_RETRY_INTERVAL_MILLISECONDS` | 100 | ms | Sleep between tries; contention retries at once | Schedule | `Limits.ts` |

> **As built.** A hold longer than `LOCK_STALE_MILLISECONDS` can lose its lock; see
> [the stale window](known-gaps.md#gap-hold-past-stale-window).

### Concurrency

Home: [The Pass](../architecture/the-pass.md).

| Constant | Value | Unit | At the bound | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `DEFAULT_CONCURRENCY_LIMIT_AGENTS` | 2 | agents | What an unset tracker reads | Stored | `src/lib/tracker-model/constants/ConcurrencyLimits.ts` |
| `CONCURRENCY_LIMIT_CEILING_AGENTS` | 10 | agents | Higher is refused; a higher stored value reads as this | Stored | `ConcurrencyLimits.ts` |
| `LOWEST_CONCURRENCY_LIMIT_AGENTS` | 1 | agents | Lower is refused | Stored | `ConcurrencyLimits.ts` |

Only `build` and `review` jobs take a launch slot. No other [job kind](../glossary.md#job-kind) waits behind them.

### Measurement

Home: [Measurement](../architecture/measurement.md).

| Constant | Value | Unit | Effect | Read from | File |
| --- | --- | --- | --- | --- | --- |
| `SMALL_CHANGE_MAXIMUM_CHANGED_LINES` | 50 | changed lines | Top of `small` | Log | `src/lib/tracker-model/constants/ChangeSizeBuckets.ts` |
| `MEDIUM_CHANGE_MAXIMUM_CHANGED_LINES` | 200 | changed lines | Top of `medium` | Log | `ChangeSizeBuckets.ts` |
| `LARGE_CHANGE_MAXIMUM_CHANGED_LINES` | 750 | changed lines | Top of `large`; above is `oversized` | Log | `ChangeSizeBuckets.ts` |
| `LIMITS.OVERSIZED_CONTEXT_THRESHOLD_TOKENS` | 200000 | tokens | A call above it counts as oversized in `usage` | Transcript | `Limits.ts` |

### Bridge

Home: [Bridge](../architecture/bridge.md).

<details>
<summary>Bridge bounds and timeline limits</summary>

Timeline values reach the Bridge through the payload (`PagePayloadAssembly`); the others live in the Bridge.

| Constant | Value | Unit | Effect | File |
| --- | --- | --- | --- | --- |
| `REOPEN_DELAY_MILLISECONDS` | 2000 | ms | Wait before an event or transcript stream reopens | `bridge/api/EventStreamClient.ts`, `bridge/api/TranscriptStreamClient.ts` |
| `CLOSED_LANE_FIRST_PAGE_CARDS` | 15 | cards | First page of a closed lane | `bridge/views/kanban/KanbanModel.ts` |
| `CLOSED_LANE_PAGE_STEP_CARDS` | 25 | cards | Each further page | `KanbanModel.ts` |
| `HEAVY_HELD_COUNT` | 5 | tickets | From this many waiting tickets on, a card's mark turns solid | `KanbanModel.ts` |
| `HEAVY_WAIT_COUNT` | 5 | tickets | The same mark on the dependencies view | `bridge/views/progress/dependencies/DependenciesModel.ts` |
| `MINIMUM_SIZED_SAMPLES` | 8 | tickets | With this many delivered tickets of one size, the forecast for that size uses only those | `bridge/utils/WaveForecastUtil.ts` |
| `PESSIMISTIC_QUANTILE` | 0.8 | quantile | The forecast's late edge | `WaveForecastUtil.ts` |
| `MEDIAN_QUANTILE` | 0.5 | quantile | The forecast's middle | `WaveForecastUtil.ts` |
| `FIT_MARGIN_SHARE` | 0.03 | share of span | Space the chart's Fit range leaves before the earliest start and after now, as a share of the span | `bridge/views/progress/constants/ProgressChart.ts` |
| `FIT_MARGIN_MINIMUM_MINUTES` | 5 | minutes | Fewest minutes of that space | `ProgressChart.ts` |
| `TICK_MINUTE_CHOICES` | 5, 15, 60, 360, 1440 | minutes | The custom range's tick sizes | `ProgressChart.ts` |
| `LINEAGE_CLEAR_GRACE_MILLISECONDS` | 120 | ms | Lineage highlight lingers | `bridge/views/progress/dependencies/DependenciesView.tsx` |
| `ARROW_STAGGER_MILLISECONDS` | 90 | ms | Dependency arrows redraw staggered | `bridge/views/kanban/KanbanView.tsx` |
| `MINIMUM_TICK_STEP_MINUTES` | 1 | minutes | Smallest tick a typed range may ask for | `bridge/utils/GeometryUtil.ts` |
| `LIMITS.TICK_STEP_LADDER_MINUTES` | 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440 | minutes | Automatic tick sizes | `Limits.ts` |
| `LIMITS.MAXIMUM_TICKS_PER_AXIS` | 12 | ticks | Automatic step stays under it | `Limits.ts` |
| `LIMITS.AXIS_MINIMUM_SPAN_MINUTES` | 60 | minutes | Shortest automatic axis | `Limits.ts` |
| `LIMITS.AXIS_PADDING_MINUTES` | 15 | minutes | Automatic axis padding | `Limits.ts` |
| `LIMITS.MINIMUM_BAR_WIDTH_PERCENT` | 0.6 | percent | Shortest drawn bar | `Limits.ts` |
| `LIMITS.HOURS_AXIS_LABEL_LIMIT_MINUTES` | 1440 | minutes | Up to here labels show the clock alone | `Limits.ts` |
| `LIMITS.WEEK_AXIS_LABEL_LIMIT_MINUTES` | 10080 | minutes | Up to here labels show the weekday | `Limits.ts` |
| `LIMITS.TICK_COUNT_SAFETY_BOUND` | 500 | ticks | The axis truncates | `Limits.ts` |

</details>

### Other constants

<details>
<summary>Command output, formats, versions and identity lengths</summary>

| Constant | Value | Unit | Effect | File |
| --- | --- | --- | --- | --- |
| `INSTALL_VERSION` | 19 | version | What an install must match | `cli/constants/InstallVersion.ts` |
| `LOWEST_INSTALL_VERSION` | 1 | version | Lowest readable manifest | `src/adapters/install/InstallManifestIngestion.ts` |
| `CURRENT_PROGRESS_FILE_VERSION` | 2 | version | `progress.json` format | `src/adapters/progress/constants/ProgressFileVersions.ts` |
| `EMBEDDED_LOG_PROGRESS_FILE_VERSION` | 1 | version | The format that embedded the log | `ProgressFileVersions.ts` |
| `CURRENT_DRAFT_FILE_VERSION` | 1 | version | [Filing draft](../glossary.md#filing-draft) format | `src/adapters/drafts/constants/DraftFileVersions.ts` |
| `HOLD_JOURNAL_FORMAT_VERSION` | 1 | version | [Hold journal](../glossary.md#hold-journal) format | `src/adapters/hold-journal/HoldJournalIngestion.ts` |
| `HATCH_FORMAT_VERSION` | 1 | version | Hatch file format | `src/adapters/hatch/utils/HatchFormatUtil.ts`, `src/services/overseer/HatchInbox.ts` |
| `WATCHER_PROTOCOL_VERSION` | 2 | version | Watcher protocol spoken | `WatcherProtocol.ts` |
| `WATCHER_PROTOCOL_OLDEST_SUPPORTED` | 1 | version | Below it a Watcher is watch-only | `WatcherProtocol.ts` |
| `EVENT_LOG_FORMAT_VERSION` | 1 | version | Event log line shape | `WatcherProtocol.ts` |
| `MONITOR_REGISTRY_FILES.SUPPORTED_VERSION` | 1 | version | Monitor registry format | `src/services/tracker/constants/MonitorRegistryFiles.ts` |
| `WORKING_VIEW_LOG_ENTRY_COUNT` | 10 | entries | Log lines in a working status view | `cli/StatusDocuments.ts` |
| `HUMAN_LOG_ENTRY_COUNT` | 5 | entries | Log lines in plain `status` | `cli/tracking/status/StatusText.ts` |
| `READY_TICKETS_LISTED_AT_MOST` | 5 | tickets | Named in the [Next line](../glossary.md#next-line) | `cli/utils/NextLineUtil.ts` |
| `AWAIT_SWEEP_MILLISECONDS` | 1000 | ms | `await` re-reads as a backstop | `cli/tracking/await/AwaitCommand.ts` |
| `ATTACH_POLL_MILLISECONDS` | 1000 | ms | `job attach` polls | `cli/jobs/JobCommand.ts` |
| `HIGHEST_PORT` | 65535 | port | `--port` refused above it | `cli/overseer/OverseerCommand.ts` |
| `SESSION_START_HOOK.timeoutSeconds` | 10 | s | Timeout set on the installed hook | `cli/adoption/constants/ClaudeCodeInstall.ts` |
| `TOKEN_BYTES` | 32 | bytes | Bridge session token | `cli/overseer/OverseerForeground.ts` |
| `WATCHER_SECRET_BYTES` | 24 | bytes | Watcher secret | `WatcherFleet.ts` |
| `WATCHER_SOCKET_NAME_HEX_DIGITS` | 16 | digits | Socket file name | `src/lib/watcher/PosixSocketEndpoint.ts` |
| `CODE_VERSION_LENGTH` | 12 | characters | [Code version](../glossary.md#code-version) | `src/services/overseer/CodeVersion.ts` |
| `CONTENT_HASH_LENGTH` | 16 | characters | Instruction file hash | `src/services/overseer/InstructionFiles.ts` |
| `MARKER_DIGEST_LENGTH` | 16 | characters | Answer delivery [marker](../glossary.md#marker) | `src/services/overseer/AnswerDelivery.ts` |
| `SHORT_COMMIT_LENGTH_CHARACTERS` | 8 | characters | Printed commits | `cli/constants/GitDefaults.ts` |
| `SLUG_MAXIMUM_LENGTH` | 60 | characters | Ticket file slug | `src/services/tracker/SlugFromTitle.ts` |
| `INPUT_SUMMARY_CHARACTERS` | 200 | characters | Tool input shown in an event | `src/lib/claude-code/ClaudeStreamMapper.ts` |
| `BRIEF_EXCERPT_CHARACTERS` | 80 | characters | Brief shown in `usage` | `cli/measurement/usage/UsageAgents.ts` |
| `DIFF_CONTEXT_LINES` | 25 | lines | Context of the branch diffs rework counting reads | `src/lib/git/BranchDiffs.ts` |
| `OMITTED_HUNK_LENGTH_LINES` | 1 | lines | Git's omitted hunk length | `src/shared/rework/utils/ReworkCountUtil.ts` |
| `HREF_DECODE_PASSES` | 3 | decode runs | Link decoding before the scheme check | `src/services/render/MarkdownRenderer.ts` |
| `SYMBOLIC_LINK_FOLLOW_LIMIT_HOPS` | 40 | hops | Atomic write stops following | `src/lib/atomic-file/AtomicFile.ts` |
| `TEMPORARY_NAME_RANDOM_CHARACTERS` | 8 | characters | Atomic write's temporary name | `AtomicFile.ts` |
| `EPIC_COLOUR_SLOT_COUNT` | 6 | slots | [Epic colour slots](../glossary.md#epic-colour-slot) of an [epic](../glossary.md#epic) | `src/lib/tracker-model/constants/EpicFields.ts` |
| `MINIMUM_DRAFT_QUESTION_OPTIONS` | 2 | options | Least options on a filing draft's question | `src/lib/tracker-model/constants/DraftFields.ts` |

</details>

Left out on purpose: arithmetic units (`TIME_UNITS`, `MILLISECONDS_PER_*`), timestamp offsets (`TIMESTAMP_SLICES`), the
exit codes of git and the shell, HTTP statuses, file modes, radixes, hash parameters, column widths, decimals, pixel
geometry, other `FIRST_*` counters and calendar ceilings. They restate an outside fact or lay out text, and bound
nothing.

## What configuration changes

Three things can be set: one true bound and two launch choices. Everything else is a constant: changing one means
changing the source and restarting the Overseer. No environment variable changes a bound, and `pipeline.json` has no
timeout, budget or retry key.

| Setting | Where | Range | Default | Takes effect |
| --- | --- | --- | --- | --- |
| [Concurrency limit](../glossary.md#concurrency-limit) | `agent-progress-v2 concurrency <n>`, stored in `progress.json` | `LOWEST_CONCURRENCY_LIMIT_AGENTS` to `CONCURRENCY_LIMIT_CEILING_AGENTS` | `DEFAULT_CONCURRENCY_LIMIT_AGENTS` | The next launch; running agents go on |
| Overseer port | `agent-progress-v2 oversee --port <n>` | 0 to `HIGHEST_PORT`; 0 lets the system choose | Derived | That Overseer's start; given ports never move upward |
| Reviewer model and effort | `review.model`, `review.effort` in `pipeline.json` | A model text; an effort in `AGENT_EFFORTS` | `WORKER_MODEL`, `WORKER_EFFORT` | The next review launch; an unknown effort keeps the default |

[`cli.md`](../cli.md) holds the commands and the pipeline fields. A ticket's priority, `network` and dependencies steer
one ticket, and bound nothing.

> **Careful.** A ticket's `model` and `effort` do not reach a launch. `agent-progress-v2 ticket agent` stores them, and
> `launchSettingsOf` in `src/services/overseer/AssistantBoot.ts` reads neither.

Whether a constant change needs an `INSTALL_VERSION` bump: [CLAUDE.md, Generated and installed
files](../../CLAUDE.md).

## Clock exceptions

[A clock decides nothing](../development/decisions.md#a-clock-decides-nothing), with the exceptions below. Each states
this at its site, apart from `usageResetsAtOf`, `markHits`, `oldestFirst`, `spanOf`, `statisticsOf` and
`elapsedSinceText`, and `WaveForecastUtil`, whose header says clock-free. The last column of the first table uses the
wording of the [Deviation index](#deviation-index).

Changes what the system does:

| Where | What the clock decides | Comment site | CLAUDE.md Deviations row |
| --- | --- | --- | --- |
| `usageLimitHolds` in `src/lib/tracker-model/Playbook.ts` | No launch, resume or Assistant delivery before the [usage marker](../glossary.md#usage-marker)'s reset | Docblock on the function | No launch before the usage marker's `resetsAt` |
| `scheduleThePassAtTheReset` in `src/services/overseer/DrivePass.ts` | The Overseer wakes a Pass at the reset | Docblock on the function | No launch before the usage marker's `resetsAt` |
| `usageResetsAtOf` and `markHits` in `src/services/overseer/UsageLimits.ts` | The later of two reset stamps is the one that holds | None | No launch before the usage marker's `resetsAt` |
| `createQuietJobWatch` in `src/services/overseer/IncidentRouter.ts` | A count of timed sweeps opens `quiet-job` | Docblock on the function | A quiet job opens `quiet-job` by counted sweeps |
| `createAssistantQuietWatch` in `src/services/overseer/AssistantSession.ts` | The same count ends a quiet Assistant | Docblock on the function | None |
| `generationIsFree` in `src/services/tracker/TrackerLock.ts` | Lock staleness, against a time the tool wrote | File header | None |
| `millisecondsNow` in `src/services/lifecycle/ProposalTwiceRun.ts` | A gate's duration; `CachingChecks` suggests from it | Field docblock, also in `src/services/overseer/Onboarding.ts` | None |

Changes only what a person reads:

| Where | What the clock decides | Comment site |
| --- | --- | --- |
| `logNewestFirstOf` in `cli/tracking/status/StatusCommand.ts` | Print order | Docblock |
| `oldestFirst` in `cli/measurement/usage/UsageAgents.ts` | Print order of the agents in `usage` | None |
| `logLinesOf` in `bridge/views/detail-panel/DetailPanelModel.ts` | Display order | Inline |
| `spanOf` in `src/lib/tracker-model/utils/EpicUtil.ts` | Which stamps show as an epic's span | None |
| `cohortSplitAt` in `src/lib/claude-code/utils/TranscriptCohortUtil.ts` | Which cohort a transcript is summarised in | Docblock |
| `bridge/utils/TimeUtil.ts` | The text a stamp prints as | File header |
| `BridgeApp` in `bridge/shell/BridgeApp.tsx` | Hands `now` to the header, the chart's now line and Fit range, the detail panel, and the finished and epics views | Inline, for the chart only |
| `statisticsOf` in `bridge/shell/HeaderModel.ts` | Which tickets and tokens count as today in the header | None |
| `bridge/views/finished-work/FinishedWorkModel.ts` | What the finished view shows | File header |
| `watcher.ts` | Stamps event log entries, which are only recorded and shown | Inline |
| `bridge/utils/WaveForecastUtil.ts` | The forecast shown, from a `now` it is handed | File header says clock-free |
| `elapsedSinceText` in `bridge/views/agents/ElapsedTimeUtil.ts` | Elapsed text on an agent row | None |

## Deviation index

Each row of the Deviations table in [`CLAUDE.md`](../../CLAUDE.md), and where its behaviour is explained. The table
holds the reason.

| Deviation | Explained in |
| --- | --- |
| The ticket parse is one line-oriented walk | [Storage](../data-model/storage.md) |
| Entry points do work at module load | [`CLAUDE.md`](../../CLAUDE.md) lists all; [Code map](../architecture/code-map.md) names `agent-progress.ts` and `watcher.ts` |
| `Environment.spec.ts` and the launch guard set the environment | [Guards and testing](../development/guards-and-testing.md) |
| `cli/FrozenInstalledSurface.json` comes from the installed files | [Guards and testing](../development/guards-and-testing.md) |
| A stored `type` of `change` or `feature` reads as `ticket` | [CLI reference](../cli.md) |
| A stale row: no code reads `dispatcherState`, an unknown key kept in place | [CLI reference](../cli.md), [Porting](../development/porting.md) |
| A Watcher's files are read in that Watcher's own format | [Watchers](../architecture/watchers.md) |
| `watcher.ts` exits with `runWatcher`'s code | [Watchers](../architecture/watchers.md) |
| A Watcher appends its event log in place | [On-disk atlas](../data-model/on-disk-atlas.md) |
| The Overseer appends `overseer.log` in place | [On-disk atlas](../data-model/on-disk-atlas.md) |
| The tracker model's `Board` throws `BoardRefusal` | [Refusals](refusals.md) |
| `OverseerRoutes.ts` imports `bridge/index.html` | [Bridge](../architecture/bridge.md) |
| `Reference.md` copies three `docs/cli.md` sections | [CLI and install](../architecture/cli-and-install.md) |
| `hook session-start` exits 0 whatever happens | [CLI and install](../architecture/cli-and-install.md) |
| `hook bash-domains` exits 0 and answers deny on failure | [Confinement](../architecture/confinement.md) |
| No launch before the usage marker's `resetsAt` | [Failure and recovery](../architecture/failure-and-recovery.md), [Clock exceptions](#clock-exceptions) |
| A relayed verb with no reply prints `queued <requestId>` | [Control and Hatch](../architecture/control-and-hatch.md) |
| A quiet job opens `quiet-job` by counted sweeps | [Questions and incidents](../architecture/questions-and-incidents.md), [Clock exceptions](#clock-exceptions) |
| A monitor registry failure keeps the command's exit code | [On-disk atlas](../data-model/on-disk-atlas.md) |

## Invariants

1. A count that can park or replace a job reads the log or the stored board. Call budgets read the Watcher's event log,
   which survives a restart. Of the counts that open an incident or end a session, only `QUIET_JOB_SWEEPS` lives in
   memory: a restart clears it, which delays a `quiet-job` incident or the end of a quiet Assistant.
2. A `*_TRIES` constant is a schedule. It never decides the state of the thing it waits for.
3. Reaching a resume bound parks, replaces or opens an incident. No bound retries forever, apart from the gate slot
   wait and an Assistant boot per sweep.
4. A merge or refresh job launches only through `claimAirlock` or `claimRefreshSlot`. `claimAirlock` derives the holder
   and candidates again inside the hold; `claimRefreshSlot` derives the holder and the release state. A prediction made
   outside the lock never decides alone.
5. A decider, including one that acts, ends in an answer or a wordless refusal. Words come from
   `OperationRefusalWordingUtil`.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Lifecycle thresholds | `src/shared/constants/LifecycleLimits.ts` | `LIFECYCLE_LIMITS` | `src/lib/tracker-model/Playbook.spec.ts` |
| Airlock counts | `src/shared/constants/AirlockLimits.ts` | `AIRLOCK_LIMITS` | `src/services/overseer/Airlocks.spec.ts` |
| Budgets stated to agents | `src/shared/constants/DispatchProtocol.ts` | `DISPATCH_PROTOCOL` | `cli/overseer/OverseerBuildJob.spec.ts` |
| Overseer and session bounds | `src/shared/constants/OverseerLimits.ts` | One named export each | `src/services/overseer/JobLaunch.redHandoff.spec.ts`, `src/services/overseer/IncidentRouter.spec.ts`, `src/services/overseer/AssistantSession.spec.ts` |
| App-wide tuning | `src/shared/constants/Limits.ts` | `LIMITS` | `src/shared/constants/Limits.spec.ts` |
| Limit types | `src/lib/tracker-model/@types/LifecycleLimits.ts` | `LifecycleLimits` | `tsc` under `tsconfig.json` |
| Where limits enter a Pass | `src/services/overseer/DrivePass.ts` | `runOnePass`, `followPlaybook` | `cli/overseer/OverseerDrivePass.spec.ts` |
| The rule that limits are named | `eslint.config.js` | `@typescript-eslint/no-magic-numbers` | `src/LintRules.spec.ts` |
