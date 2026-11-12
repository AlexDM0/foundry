# Build and review

> **Question:** How does a ready ticket become a verified branch, and what happens at each kind of failure?
> **Time:** 30 minutes.
> **Read first:** [Ticket lifecycle](../concepts/ticket-lifecycle.md), [The Pass](the-pass.md).
> **Next:** [Customs and gates](customs-and-gates.md), [Airlocks and groups](airlocks-and-groups.md),
> [Failure and recovery](failure-and-recovery.md).

## In one screen

![Swimlane of one build job with no failure: the Overseer records the job, adds the worktree, runs the install Watcher, spawns the session and sends the first message. The builder commits and ends with a result, Customs checks it in that lock hold, and the Overseer closes the input and runs the gate Watchers. The Overseer writes the Handoff and ends the job built, so only code moves the job.](../figures/build-and-review/one-build-job.png)

*Notice that the Overseer lane runs unbroken from top to bottom: the builder only commits and reports.*

A ready [ticket](../glossary.md#ticket) is built by a [build job](../glossary.md#build-job) on a
[worktree](../glossary.md#worktree) of its own. With a review phase in the [pipeline](../glossary.md#pipeline), a review
job then checks it there. The [Overseer](../glossary.md#overseer) moves each [job](../glossary.md#job) at its
[Passes](../glossary.md#pass); no [session](../glossary.md#session) moves a job or a ticket.

A session's close has four outcomes:

1. Its [report](../glossary.md#report), [Customs](../glossary.md#customs) and [gates](../glossary.md#gate) clear. A
   build moves the ticket `in-review`; a review queues it for its [Airlock](../glossary.md#airlock) or sends it back.
2. A gate or a repairable Customs check fails (a [red](../glossary.md#red-handoff)). The same session resumes.
3. The job fails. A later job starts a fresh session on the same worktree.
4. A person or the [Assistant](../glossary.md#assistant) must act. An [incident](../glossary.md#incident) or a
   [decision](../glossary.md#decision) stops the ticket until it settles.

Each failure has its own recovery track. A red resumes the session, then parks the ticket. A crash resumes the session,
then replaces it, then opens an incident. A failed job takes a fresh [attempt](../glossary.md#attempt), then parks. A
[parked](../glossary.md#park) ticket waits for User. Bounds: [Deciders and
bounds](../reference/deciders-and-bounds.md#how-many-times-before-it-gives-up).

## A build job, Pass by Pass

**The Overseer moves a job in two halves: state changes inside a [lock hold](../glossary.md#lock-hold), then worktree
creation, Watcher spawns and frames after it.** A restart therefore observes the same step again from the files in the
job folder. Most rows last one or more Passes; `in-customs` normally lasts less than one.

| State | What moves it | Function |
| --- | --- | --- |
| `launching` | The [Playbook](../glossary.md#playbook)'s `launch-build` step records the job. The next lock hold moves it to `preparing` and, for a `pending` ticket, moves the ticket `in-progress` with its branch. | `launchStepsOf`, `applyObservation` |
| `preparing` | After the lock hold, the Overseer adds the worktree and starts the install [Watcher](../glossary.md#watcher). `setup` reads `installed`: the job moves to `running`. `worktree-failed` or `install-failed`: see [Setup failures](#setup-failures). | `runBuildJobEffects`, `setupProgressOf` |
| `running` | The session's Watcher spawns. `start.json` is written once per job. A `result` event, the session's closing structured message that carries its report, moves the job to `in-customs`. | `jobsNeedingAWatcher`, `recordJobStart`, `applyWatcherEvents` |
| `in-customs` | Inside the lock hold that read the `result`, `verifyAndRoute` routes the job, so the state is normally not stored past that lock hold. | `applyObservation`, `verifyAndRoute` |
| `gating` | After the lock hold, the Overseer closes the session's input once. The prepare steps run again, then each gate, one step per Pass, each gate behind a [gate slot](../glossary.md#gate-slot). A judged run settles the job. | `deliverBuildJobFrames`, `spawnNextGateStep`, `settleGate` |
| `stopping` | The [call budget](../glossary.md#call-budget) ran out, or User stopped the job. Once the agent has ended, the job ends, or a session on a red handoff takes another red handoff. | `applyObservation` |

Three states sit outside this table. `waiting-for-answer` keeps its process while a question is open ([Questions and
incidents](questions-and-incidents.md)). `awaiting-answer` follows a [`waiver`](../glossary.md#waiver) move, after
`gating`, so its session has ended. `interrupted` has its causes in
[Interruption and resume](failure-and-recovery.md#interruption-and-resume);
it holds no process, except after a Customs red, whose input was never closed (see [Red handoff](#red-handoff)). The
full legality table is in [State machines](../data-model/state-machines.md).

A few effects run inside the lock hold: a [review round](../glossary.md#review-round)'s no-changes commit, the
job-folder files for a red handoff and a waiver, the `git worktree remove` of `PipelineAgentSessions.applySettledPipelineAgents`, and
the git step of `src/services/control/RepairControls.ts`. If a no-changes commit lands and the store write does not,
the job is still `gating`, so the next Pass settles it again and commits a second empty commit. The branch shows the
round twice; the store records it once.

Some steps change nothing that the next observation would read, such as a freshly launched job or a gate judged from its
kept verdict. `someBuildJobAwaitsAPass` forces another Pass there, because the [fingerprint](../glossary.md#fingerprint)
alone would leave the job waiting.

A review job moves through the same states, with `startReviewBar` in place of the ticket move and a reviewer in place of
the builder. `WORKTREE_JOB_KINDS` names the two kinds that share this path.

## Worktrees and branches

**A worktree belongs to its ticket and outlives every job on it.** The branch `ticket-<id>` and the folder
[`<worktrees>`](../glossary.md#reading-names)`/ticket-<id>/` carry work across failures, resumes and review rounds.

![Timeline of ticket 003 across six jobs: J1 creates the worktree and fails, J2 is a fresh attempt on it and is sent back by review J3, J4 resumes the J2 session. Review J5 passes and J6 lands. The worktree bar runs under all six jobs and continues past the landing.](../figures/build-and-review/worktree-life.png)

*Notice the bar under the jobs: no job creates its own copy, and the bar does not end at the landing.*

### Creating a ticket worktree

`createWorktree` in `src/services/overseer/JobLaunch.ts` runs after the lock hold of `preparing`, only when the folder
is absent and the job folder holds no `worktree-failure.txt`.

1. A ticket whose [target](../glossary.md#target) is a [group](../glossary.md#group) first prepares the group's own
   worktree through `GroupWorktrees.prepareGroupWorktree`, because its branch forks off the group's tip.
2. If `ticket-<id>` exists, git re-attaches it: `git worktree add <path> ticket-<id>`. Its commits carry over.
3. Otherwise git forks it from the target's tip: `git worktree add -b ticket-<id> <path> <target>`.

A review job finding the folder missing takes step 2, so a removed worktree comes back from its branch. Every job, the
review included, then runs the install line in an `install` Watcher of its own.

### Setup failures

**A setup failure opens one incident and ends the job; the job never retries it.**

![State diagram with the normal path straight down: creating-worktree, installing, installed, then the job runs, with a dashed shortcut past installing when there are no prepare steps. worktree-failed and install-failed peel off into one setup-failed incident, and a failed prepare step in gating enters it too. The incident names its step and the job ends stopped.](../figures/build-and-review/setup-progress.png)

*Notice that three different failures meet in one box: only the incident's `step` fact tells them apart.*

`setupProgressOf` reads `SetupProgress` from disk at each observation. The prepare steps are joined into one line
(`PipelineUtil.installLineOf`) and run in one process Watcher. A failed `git worktree add` writes its error to
`worktree-failure.txt`, which stops a retry inside the same job. The job's cause is `setup-failed`. The incident's
default move is `worktree-repair`; the repair steps are in [the CLI reference](../cli.md).

### Every worktree kind

`<J>` is a job id, written `J<n>` in [Reading names](../glossary.md#reading-names).

| Kind, under `<worktrees>/` | Created by | Reused when | Removed by |
| --- | --- | --- | --- |
| `ticket-<id>`, branch `ticket-<id>` | `createWorktree`, in `preparing` | The folder exists; every job on the ticket and its Airlock merge use it. An existing branch is re-attached. | Only `forge worktree repair --step recreate` |
| `group-<name>`, branch `group-<name>` | `GroupWorktrees.prepareGroupWorktree`, at the group's first launch or Airlock target lookup | The folder exists. An existing branch is checked out as it stands. | `GroupWorktrees.removeGroup`, after the release |
| `refresh-group-<name>`, detached | `GroupWorktrees.prepareRefreshWorktree`, in a refresh's merge-in | A leftover at the group tip, or moved there by `detachLeftoverAt`. One holding a merge or uncommitted changes refuses. | `removeRefreshWorktree` |
| `sessions/<J>`, a plain folder | `workingDirectoryOf`, for a job with no ticket worktree: the Assistant and each [product owner](../glossary.md#product-owner) | `mkdir` is idempotent, so a resumed instance finds it. | Nothing |
| `pipeline-agent/<J>`, detached | `PipelineAgentSessions.prepareSnapshot`, at the main line's tip, for a [pipeline agent](../glossary.md#pipeline-agent) | The folder exists. | `applySettledPipelineAgents` |

<details>
<summary>How each is removed</summary>

| Kind | Removal |
| --- | --- |
| `ticket-<id>` | `worktree repair --step recreate` saves any changes to `recreate-<n>.patch`, then runs `git worktree remove --force`. It is refused while a job names the ticket. Nothing removes the worktree after a landing. |
| `group-<name>` | `worktree remove`, then `branch -d`, never forced. A decline shows the `cleanup-declined` [notice](../glossary.md#notice). |
| `refresh-group-<name>` | Removed when the refresh lands or frees its [Airlock slot](../glossary.md#airlock-slot), never forced. |
| `pipeline-agent/<J>` | Removed with `--force` once the pipeline agent's outcome is stored. A job that ends with no stored outcome leaves its snapshot; nothing else removes it. |

</details>

The [atlas](../data-model/on-disk-atlas.md#worktrees) lists these paths. The Airlock's use of these worktrees is in
[Airlocks and groups](airlocks-and-groups.md). `<worktrees>/hatch/` sits
beside them and is no worktree; [Control and Hatch](control-and-hatch.md) owns it.

> **As built.** A landed ticket keeps its worktree and branch: see
> [the known gap](../reference/known-gaps.md#gap-landed-worktrees-stay).

## Verify and route

**A closing `result` proves nothing yet, and each failure goes to a different owner.** `verifyAndRoute` reads the report
first, then the report's outcome, then Customs. The first match ends the routing.

![Decision ladder from a closing result through report, outcome and Customs: a verified job goes to gating. An invalid report, cannot-build or a refused Customs check ends failed, blocked and wound-down open an incident for the Assistant, V3, V4 and V15 start a red handoff, and V13 opens a decision for User and ends failed. Each failed job enters the failed-pass track: a fresh attempt, then park.](../figures/build-and-review/verify-and-route.png)

*Notice the second line of each exit: it names who acts next.*

`V<n>` numbers a [Customs check](customs-and-gates.md); what each one means lives there.

| Order | Branch | Result |
| --- | --- | --- |
| 1 | The ticket or `start.json` is missing | Ended `failed`, cause `git-failed`. |
| 2 | V1, a valid report naming its head, refuses | Ended `failed`, cause `no-report` for `report-invalid`, otherwise the reason, such as `head-not-reported`. |
| 3 | Outcome `blocked` | Incident `blocked`, job ended `blocked`. |
| 4 | Outcome `wound-down` | Incident `out-of-calls`, job ended `wound-down`. |
| 5 | Outcome `cannot-build` | Ended `failed`, cause `cannot-build`. |
| 6 | `clearCustoms` refuses V3, V4 or V15, the checks a session can repair: no commit, a dirty worktree, an unclaimed gate (`RESUMABLE_CUSTOMS_CHECKS`) | Red handoff, job `interrupted`. |
| 7 | `clearCustoms` refuses V13, the branch touches agent configuration | Decision `branch-touches-agent-config`, once per hit; ended `failed`. |
| 8 | Any other refusal | Ended `failed`, cause `attribution` for V7, the AI attribution check, otherwise the reason. |
| 9 | Verified | Job moves to `gating`. |

A builder report's `outcome` is one of `built`, `blocked`, `cannot-build`, `wound-down`. A reviewer report has no
`outcome` field, so a reviewer falls through branches 3 to 5 to Customs.

A session that exits cleanly with no `result` never reaches this list: `applyWatcherEvents` ends it `failed`, cause
`no-report`.

## Settling the gate

**`settleGate` is the one place a verified job turns into a ticket move.** It waits until `gate.verdict` is `judged` and
the pipeline is set. It then stamps the [row](../glossary.md#row)'s pipeline hash with `recordPipelineJudgedBy`, logs
`gate-ran` unless a prepare step failed or no gate ran, and branches on the outcome.

| Gate outcome | What happens |
| --- | --- |
| `setup-failed` | Incident `setup-failed`, step `prepare`; ended `stopped`. |
| `cannot-run` | Incident `gate-cannot-run`; ended `stopped`, cause `gate-cannot-run`. |
| `failed` | Red handoff naming the gate, its command, fix command and exit code. |
| `passed`, review job | `settleReviewPass`: see [Review](#review). |
| `passed`, build job | The steps below, all in one lock hold. |

A passed build runs four steps in the same lock hold:

1. `bodyWithHandoffOf` replaces the ticket's [`## Handoff`](../glossary.md#handoff), the filing template's guidance
   included, with the section `handoffSectionOf` writes from the verified report: the builder's `handoff` text, then one
   line of evidence per [Acceptance](../glossary.md#acceptance) item. A body without the heading gets the section
   appended.
2. The job ends `built` with the report's `headCommit`.
3. The ticket moves `in-review` with its branch and commit.
4. With no review phase, `queueTicketForMerge` queues it for its Airlock.

The Playbook runs later in that same lock hold, so the review job can launch there.

Code writes the Handoff. A builder never edits its ticket file, because V6, the unchanged ticket body, refuses a changed
body.

## Call budgets

**A session gets one warning, then a stop.** The Overseer counts distinct top-level message ids in the event logs
against the call budget; a subagent's turns do not count (`sessionReadingOf`).

![Two bars of calls, not to scale. A job with no red handoff works to its role's budget, gets the wind-down message once, has WIND_DOWN_GRACE_CALLS further calls, then stops and opens the out-of-calls incident. A session working off a red handoff has RED_HANDOFF_RESUME_CALL_BUDGET and the same grace, then takes another red handoff or parks, with no incident.](../figures/build-and-review/call-budget.png)

*Notice that the two bars end differently: only a job with no red handoff opens an incident.*

- `callBudgetOf` picks `BUILDER_API_CALL_BUDGET` or `REVIEWER_API_CALL_BUDGET`.
- `attemptCallBudgetOf` picks `RED_HANDOFF_RESUME_CALL_BUDGET` whenever the job folder holds `red-handoff.json`.
- At the budget, `deliverBuildJobFrames` sends the wind-down message, once per [Watcher
  instance](../glossary.md#watcher-instance).
- At budget plus `WIND_DOWN_GRACE_CALLS` the job moves to `stopping`. A job with no red handoff opens `out-of-calls`.
- Once the agent has ended, a job with no red handoff ends `stopped`, cause `out-of-calls`. A session on a red handoff
  takes a further red handoff instead, unless User asked for the stop.

A builder sent back by a review is a separate job with an empty folder, so it has the full budget. A wound-down session
that reports in time takes branch 4 of the routing above.

## Red handoff

**A red that the session can repair resumes that session, with the failure written down for it.** A red handoff starts
from a failed gate or from V3, V4 or V15.

![Swimlane of one red handoff: a gate or Customs check goes red, and the Overseer writes gate-failure.md and red-handoff.json and interrupts the job, cause handoff-red. With resumes left the job returns to running on Watcher instance n + 1, the same session reads the note, and its closing result goes through Customs and gates again. With resumes spent the ticket parks instead.](../figures/build-and-review/red-handoff-resume.png)

*Notice that the session id stays the same across instances; only the Watcher changes.*

> **As built.** Only a job in `gating` has its input closed. A Customs red, and any job ended from `in-customs`, leaves
> the instance that reported alive, so a resume runs beside it: see
> [the known gap](../reference/known-gaps.md#gap-customs-red-leaves-input-open).

`interruptOnRedHandoff` writes two files in the job folder before it interrupts the job, cause `handoff-red`:

- `gate-failure.md`, the red-handoff note: what went red, command, fix command, commit, exit code, the full log's path,
  and an output excerpt.
- `red-handoff.json`, the facts: which resume of how many, the call budget, and the Watcher instance that went red.

`outputExcerptOf` keeps the output's first and last lines inside `BATON_PASS_OUTPUT_LIMITS`, so the session reads the
failure and does not rerun the gate to find it.

After the interruption:

1. The Playbook returns `resume-job` while the cycle has resumes left (`redHandoffStepsOf`), normally later in the same
   lock hold.
2. The job returns to `running` with its Watcher instance number increased by one.
3. The Overseer resumes the session with a message filled from the facts (`resumeLineOf`).
4. Calls count from that instance, and gates rerun in instance-suffixed folders, because a Watcher folder runs once.

> **As built.** The note, its facts and the agent's message call `gate-failure.md` a Baton pass: see
> [the known gap](../reference/known-gaps.md#gap-red-handoff-says-baton-pass).

### Handoff cycles

**A handoff cycle caps red resumes across jobs, so a build replaced on a red, or a builder sent back, does not restart
the count.** A [handoff cycle](../glossary.md#handoff-cycle) is every job that shares a job kind, a ticket set and an
attempt. `handoffCycleResumesOf` reads the log and counts two things: each `job-resumed` with cause `handoff-red`, and,
for a build cycle, each `does-not-hold` review after the cycle began. Both spend the same
`RED_HANDOFF_RESUMES_BEFORE_PARKING`.

![Timeline of ticket 003: J1 goes red, is resumed once and ends replaced, J2 takes over at the same attempt, and reviews J3 and J5 each send the builder back. The third count passes the bound and the ticket parks, with one cycle bar under all five jobs. After ticket unhold, J6 runs attempt 2 in a cycle of its own.](../figures/build-and-review/handoff-cycle-span.png)

*Notice that the bar crosses five jobs and ends only where the attempt changes.*

Two paths keep a cycle going across jobs:

- **A vendor refuses a Watcher instance resumed from a red.** The job ends `replaced` and opens `resume-failed`.
  `redHandoffCarriesOver` keeps the attempt, and `adoptRedHandoff` copies the facts into the fresh job's folder, so its
  first message names the red and its calls count against the short budget.
- **A review sends the builder back.** The ticket's newest build ended `built`, so `candidateOf` keeps the attempt.
  `sessionOwnerJobIdOf` finds the builder's session, and a later job resumes it, opening with the newest `## Review <n>`
  section. That job has a job id of its own and the same session. Its first instance is no resumed instance, so a vendor
  refusal there is a failed or crashed session: exit 0 ends `failed`, cause `no-report`, and any other exit interrupts
  it `agent-crashed`.

## Review

**The review's move is computed from the report's [claims](../glossary.md#claim), the diff and the log; no report
carries a verdict.** A reviewer judges each Acceptance item and commits its own fixes on the ticket branch. Rework is
the code lines those fixes changed. A `does-not-hold` claim is different: it names an item that still fails, and it
sends the ticket back.

A review job's `attempt` is its review round. `nextReviewRoundOf` counts the rounds granted since the ticket last
entered `in-review`, plus one, so a builder's return starts again at round 1. A reviewer's report holds one claim per
Acceptance item, its `result` field saying whether that item holds.

![Fan-out from settleReviewPass to four moves tested in order, the first match winning. fixer ends the job does-not-hold and sends the ticket in-progress, fresh-reviewer ends it round-granted and stays in-review, and waiver leaves it awaiting-answer with the ticket held. Otherwise merge-queued ends it reviewed and queues the ticket for its Airlock, so code picks the move and no report does.](../figures/build-and-review/review-moves.png)

*Notice that the rows are an order: a round granted beats a waiver proposal, and a failed claim beats both.*

`settleReviewPass` in `src/services/lifecycle/ReviewOutcome.ts` runs in the lock hold after the review's gate passed, or
after no gate ran, because a review whose tree matches its start commit has nothing to retest
(`reviewLeftTheTreeAsItWas`).

1. If the reported head is the review's start commit, `settleReviewPass` commits
   `Review round <n> of #<id>: no changes`, empty and with `--no-verify`, so the round stays visible on the branch.
2. `ReworkCountUtil` counts reworked code lines in the diff from the start commit to the head. A range git cannot read
   as plain commits counts zero.
3. `settleReviewPass` appends `## Review <n>` to the ticket: the `reviewText`, the claims, the
   [findings](../glossary.md#finding).
4. `settleReviewPass` picks the move, then `recordReview` logs `review-recorded`.

The figure shows the job's ending; `recordReview` logs a separate verdict word, the third column, for measurement. What
those fields measure is in [Measurement](measurement.md).

| Move | When | `recordReview` verdict | What happens |
| --- | --- | --- | --- |
| [`fixer`](../glossary.md#words-that-mean-several-things) | A claim is `does-not-hold` | `does-not-hold` | The move launches no fixer role. While the newest build stands, the builder's session resumes under a new job, within its handoff cycle; otherwise see [What counts](#what-counts). |
| `fresh-reviewer` | The round verdict is granted | `round-requested` | The Playbook launches round `<n>+1`. |
| `waiver` | A claim is `waiver-proposed` | `not-released` | `settleReviewPass` writes `waiver-proposals.json` in the job folder and opens decision `waiver`. |
| `merge-queued` | Otherwise | `released` | `queueTicketForMerge` hands it to the Airlock. |

### Round verdicts

**A large rework is itself unreviewed, so a fresh reviewer checks it.** `RoundVerdictUtil.nextRoundVerdictOf` decides
whether a review with no `does-not-hold` claim earns another round: rework past the threshold, and from the later rounds
on, findings that converge. `RoundVerdictUtil.roundLimitsOf` takes the threshold from the pipeline's
`review.reReview.thresholdLines`; a review with no `reReview` grants no round, and only with no pipeline does
`REWORK_ROUND_THRESHOLD_LINES` hold.

![Strip of one ticket across five jobs. Review J2, round 1, reworks past the threshold and is granted round 2; review J3, round 2, has a claim that does not hold, so the builder session returns as J4. Review J5 starts again at round 1, reports no failed claim, stays under the threshold and queues the ticket for its Airlock.](../figures/build-and-review/review-rounds.png)

*Notice J5: the round number restarts at `ticket-finished`, because only rounds granted since then count.*

<details>
<summary>The seven tests</summary>

Tests run top to bottom. A failed test refuses with the code on its right. Row 2 grants at once when true. A round
passing every test is granted.

| Test | Refused with, when the test fails |
| --- | --- |
| The pipeline's review has a `reReview` | `re-review-off` |
| Rework is over the threshold | `rework-not-over-threshold` |
| The requested round is `ROUND_GRANTED_ON_REWORK_ALONE` | Not a refusal: a true test grants the round |
| The previous round is recorded | `previous-round-not-reviewed-in-this-run` |
| Findings shrank by `FINDINGS_SHRINK_FACTOR_PER_ROUND` | `findings-not-halved` |
| No finding repeats an earlier class | `finding-class-returned` |
| No finding names a file no earlier round named | `new-file-named` |

</details>

A refusal is no failure: the review carries on to the waiver or merge-queue row. When the newest review reworked past
the threshold and was refused, `nonConvergingTicketIdsOf` shows the `rounds-not-converging` notice until a later review
clears it or the ticket is delivered or abandoned.

### Waivers

**A waiver drops an Acceptance item: a reviewer proposes it and User decides.**

> **As built.** Answering the decision has no effect on the job or the ticket, and the review job keeps waiting: see
> [the known gap](../reference/known-gaps.md#gap-waiver-answer-has-no-effect).

A builder can mark an item `waiver-proposed` in its report, and the Handoff shows it. A reviewer takes the `waiver` move
by reporting `waiver-proposed` for an item, whether or not the builder proposed it. The open `waiver` decision blocks
every launch on the ticket through `ticketIsHeld`.

### No review phase

**With no `review` key in the pipeline, `in-review` is only the wait for an Airlock.** `candidateOf` yields nothing for
an `in-review` ticket, no reviewer launches, and `settleGate` queues a passed build in its own lock hold. A ticket
already `in-review` when the pipeline loses its review phase is queued by the `queue-merge` step, unless a
`merge-refused` decision is open. No [review bar](../glossary.md#review-bar) is drawn, and the Airlock skips its
Acceptance check; see [Airlocks and groups](airlocks-and-groups.md).

## The rework ladder

**Cheap recovery comes first and a person comes last, but each failure enters its own track.** Spending the red resumes
never leads to a fresh attempt; the ticket parks.

![Three tracks ending at park. Red or sent back resumes the same session, then parks, and a refused resume reaches replace and keeps the attempt. A crash resumes, then replaces, then opens job-lost, whose default parks; a job ended failed starts a fresh attempt, then parks.](../figures/build-and-review/rework-ladder.png)

*Notice the left track: spending the red resumes skips every fresh session.*

| Track | Rung | Entered by | Bound, and where it is read | Step |
| --- | --- | --- | --- | --- |
| Red | Resume, red | A red handoff; a review sending the builder back | `RED_HANDOFF_RESUMES_BEFORE_PARKING`, `handoffCycleResumesOf` | `resume-job`, or a later job on the same session |
| Crash | Resume, crash | Interruption `watcher-lost` or `agent-crashed` | `JOB_RESUMES_BEFORE_FRESH`, `crashResumesAreSpent` | `resume-job` |
| Crash | Replace | Crash resumes spent; `resume-failed`; User's `forge job fresh` | Unbounded by itself | Ended `replaced` (`replace-job`, `applyResumeFailure`, or the `job fresh` stop). The next job launches once nothing holds the ticket, and its prompt says earlier uncommitted changes are its own work. A replaced build launches at attempt + 1 and so opens a new handoff cycle, unless its last interruption was `handoff-red`. A replaced review stays at its round. |
| Crash | Job lost | Replacements in a row | `REPLACED_JOBS_BEFORE_JOB_LOST`, `replacedInARowOf` | Incident `job-lost`, default `ticket-park` |
| Failed job | Fresh attempt | A [failed pass](../glossary.md#failed-pass) | `FAILED_PASSES_BEFORE_PARKING`, `FailedPassUtil.failedPassesOf` | `launch-build` at attempt + 1, or `launch-review` at the same round |
| All | Park | Spent red resumes or failed passes | Applied by `Board.applyPlaybookStep` | Ended `failed` if a job is named, [ticket hold](../glossary.md#ticket-hold) `parked:<cause>`, decision `parked` |

`resume-failed` opens an incident whose default is `job-fresh`, and that incident stops any launch on the ticket until
it settles. A `job-lost` incident parks only if it defaults (`IncidentMoves.parkUnder`, ticket hold `parked:job-lost`);
the Assistant may settle it first.

![Matrix of six recoveries against job, session, Watcher instance, attempt, handoff cycle and worktree. A red or crash resume keeps everything but the Watcher instance, a builder sent back keeps session, attempt and cycle, and a replacement on a red keeps attempt and cycle. A replacement on a crash and a fresh attempt keep only the worktree, which every recovery keeps.](../figures/build-and-review/what-a-recovery-keeps.png)

*Notice the two Replace rows: a replacement keeps its attempt and its cycle only on a red.*

[Watchers](watchers.md) defines job, session, instance and attempt. A failed or replaced review differs from this
matrix: it relaunches at the same round with a fresh session.

<details>
<summary>Why a red and a review park at different counts</summary>

![Two strips against a count from 0 to 3, with RED_HANDOFF_RESUMES_BEFORE_PARKING (2) marked at count 2. A red reads the count first: it resumes at 0 and 1 and parks at 2. A review raises the count first: it resumes at 1 and 2 and parks at 3, so both allow two resumes.](../figures/build-and-review/red-and-review-bound.png)

*Notice that each strip holds two resumes and one park, shifted by one.*

`redHandoffStepsOf` parks at the bound and `reviewResumesAreSpent` parks past it, because a review's ending already
raised the count.

</details>

### What counts

**Each event spends at most one count that matters, and some spend none.**

![Grid of events against four counts: a failed job adds a failed pass, a resume after handoff-red a cycle resume, a resume after a crash a crash resume, and replaced a replacement in a row. A review that does not hold adds a cycle resume while the newest build was built, and a failed pass otherwise. Reboot, answer delivery, usage limit and stopped add nothing.](../figures/build-and-review/count-matrix.png)

*Notice the two review rows: one ending spends a resume while the newest build stands, a failed pass otherwise.*

`FailedPassUtil.failedPassesOf` reads the failed passes from the log, and `CRASH_INTERRUPTION_CAUSES` names the two
causes that spend a crash resume. The review in the "any other case" row also raises its old cycle's count, which
nothing reads again, because the next build runs a later attempt. Crashes across tickets are a separate bound: [Failure
and recovery](failure-and-recovery.md) covers the outage it opens.

The Playbook derives each count from the log at each Pass, so a restart derives the same steps. `crashResumes` is the
one exception: it lives on the stored job, which survives a restart the same way.

<details>
<summary>What resets each count</summary>

| Count | Reset by, in the log |
| --- | --- |
| Failed passes | `ticket-unheld`; `tracker-cleared`; `ticket-started` from anywhere but `in-review` |
| Handoff cycle resumes | A later attempt, which is another cycle; a review's attempt is its round |
| Crash resumes | A later job: `crashResumes` belongs to the job |
| Replacements in a row | Any other ending of a job on the ticket; an opened `job-lost` |

</details>

### Parking and coming back

**`park` ends the named job, holds the ticket `parked:<cause>` and opens a `parked` decision;
`forge ticket unhold` is the way back.**

> **As built.** Answering the `parked` decision leaves the ticket hold in place: see
> [the known gap](../reference/known-gaps.md#gap-answering-parked-does-not-unhold).

![Fork from ticket unhold, which clears the failed passes, on the ticket's status. An in-progress ticket takes attempt + 1 with a fresh session and its own cycle, or keeps the same attempt if its newest build was replaced on a red. An in-review ticket relaunches its review at the same round.](../figures/build-and-review/after-unhold.png)

*Notice the two lower rows: only the top row starts a new handoff cycle.*

After `ticket-unheld` the Playbook no longer treats the builder as returning from review (`builderReturnsFromReview`).
Every lifted hold logs that record: `ticket unhold`, a park that replaces an existing hold, an answer lifting an
awaiting-answer hold, and `forge ticket ready` on a first-run hold. A re-park therefore clears the failed
passes too.

> **Careful.** A relaunched review keeps its round, so it keeps its spent cycle. A review parked on `red-resumes-spent`
> parks again at its next red, with no resume.

### Other endings

Four endings stop the ticket without climbing: `blocked`, `out-of-calls`, `gate-cannot-run` and `setup-failed` each open
an incident naming the ticket, and `ticketIsHeld` blocks a launch until the [Assistant](assistant-and-intake.md) or its
default settles it. Their moves are in [Questions and incidents](questions-and-incidents.md). V13's ended job holds its
ticket through its open decision (`TICKET_HOLDING_DECISION_KINDS`).

User's `forge job stop` and `forge job wind-down` end the job, `stopped` or by its report, and
hold the ticket `stopped by User (J<n>)` or `wound down by User (J<n>)` until `ticket unhold`. The Playbook never undoes
that hold. `job fresh` takes no hold. [Control and Hatch](control-and-hatch.md) owns these verbs.

## Filing what a worker finds

**A builder or reviewer records what it cannot fix as a low [draft ticket](../glossary.md#draft-ticket) and carries
on.** A defect beside the work goes through `forge ticket add --priority low` under the job, relayed through
its [Hatch](../glossary.md#hatch) and admitted by the [Bouncer](../glossary.md#bouncer) only as a low-priority filing,
in the form [Control and Hatch](control-and-hatch.md) sets, up to `WORKER_FILINGS_PER_JOB`.

The Bouncer stamps the job's tickets on the filing as its finders. The finding waits for them in `dependsOn`, joins
the first finder's group, and follows the ticket review switch: off, a complete finding is `pending` and builds only
once each finder is `reviewed` or `delivered`, so it is built against the finder's code; on, it is `ready-for-review`
for User. An abandoned finder drops out of its findings' `dependsOn`, and an unstarted finding goes to
`ready-for-review`.

A reviewer names each filing in its report as a `filed` finding, and V12, the filed-findings
check, reads the filing record to prove this job filed that low ticket. The whole path is in [Assistant
and intake](assistant-and-intake.md#the-findings-path).

## Invariants

1. No session moves a job or a ticket itself. Code does, in a lock hold: the Overseer from a report or a Hatch request,
   which are only inputs, and User's verbs from the command line.
2. A build or review job's worktree creation, Watcher spawns and frames run after the lock hold, so a step cut short is
   observed again from disk.
3. A ticket has one branch and at most one worktree, however many jobs it takes.
4. A failed job leaves its commits on the branch, and the next job starts from them.
5. `## Handoff` is written only after Customs and the gates pass, in the lock hold that moves the ticket.
6. A build job's ticket moves to `in-review` only with a report whose head is the worktree's HEAD.
7. A review's move is computed from claims, the diff and the log; no report carries a verdict, a round or a rework
   count.
8. A red interruption keeps its attempt: it resumes, carries over if the interrupted job is replaced, or parks. A later
   crash or failed report on the resumed session follows its own track.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Job steps | `src/services/overseer/JobLaunch.ts` | `applyObservation`, `runBuildJobEffects` | `cli/overseer/OverseerBuildJob.spec.ts` |
| Job frames | `src/services/overseer/JobLaunch.ts` | `deliverBuildJobFrames` | `src/services/overseer/JobLaunch.integration.spec.ts` |
| Worktree creation | `src/services/overseer/JobLaunch.ts` | `createWorktree`, `setupProgressOf` | `cli/overseer/OverseerBuildJob.spec.ts` |
| Routing | `src/services/overseer/JobLaunch.ts` | `verifyAndRoute`, `RESUMABLE_CUSTOMS_CHECKS` | `cli/overseer/OverseerBuildJob.spec.ts`, `src/services/overseer/JobLaunch.retry.spec.ts` |
| Settling and Handoff | `src/services/overseer/JobLaunch.ts` | `settleGate`, `bodyWithHandoffOf` | `cli/overseer/OverseerBuildJob.spec.ts` |
| Review moves | `src/services/lifecycle/ReviewOutcome.ts` | `settleReviewPass`, `nonConvergingTicketIdsOf` | `src/services/lifecycle/ReviewOutcome.spec.ts` |
| Ladder steps | `src/lib/tracker-model/Playbook.ts` | `redHandoffStepsOf`, `crashBoundStepsOf`, `parkStepsOf`, `jobLostStepsOf` | `src/lib/tracker-model/Playbook.redHandoff.spec.ts` |
| Failed passes | `src/lib/tracker-model/utils/FailedPassUtil.ts` | `failedPassesOf` | `src/lib/tracker-model/utils/FailedPassUtil.spec.ts` |

<details>
<summary>The other concepts</summary>

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Group and refresh worktrees | `src/services/overseer/GroupWorktrees.ts` | `prepareGroupWorktree`, `prepareRefreshWorktree`, `removeGroup` | `src/services/overseer/GroupWorktrees.spec.ts` |
| Worktree repair | `src/services/control/WorktreeRepair.ts` | `repair` | `src/services/control/WorktreeRepair.spec.ts` |
| Pipeline agent snapshot | `src/services/overseer/PipelineAgentSessions.ts` | `prepareSnapshot`, `applySettledPipelineAgents` | None of its own; `src/services/lifecycle/Customs.pipelineAgent.spec.ts` holds its Customs |
| Red handoff | `src/services/overseer/RedHandoff.ts` | `writeRedHandoff`, `outputExcerptOf`, `adoptRedHandoff` | `src/services/overseer/RedHandoff.spec.ts`, `src/services/overseer/JobLaunch.redHandoff.spec.ts` |
| Resuming | `src/services/overseer/JobResumption.ts` | `sessionOwnerJobIdOf`, `resumeLineOf` | `src/services/overseer/JobResumption.integration.spec.ts` |
| Report schemas | `src/adapters/reports/ReportSchemas.ts` | `BUILDER_REPORT_SCHEMA`, `REVIEWER_REPORT_SCHEMA` | `src/adapters/reports/ReportSchemas.spec.ts` |
| Round verdict | `src/lib/tracker-model/utils/RoundVerdictUtil.ts` | `nextRoundVerdictOf` | `src/lib/tracker-model/utils/RoundVerdictUtil.spec.ts` |
| Rework count | `src/shared/rework/utils/ReworkCountUtil.ts` | `reworkOfFile` | `src/shared/rework/utils/ReworkCountUtil.spec.ts` |
| Bounds | `src/shared/constants/LifecycleLimits.ts` | `LIFECYCLE_LIMITS` | `src/lib/tracker-model/Playbook.spec.ts` |

</details>
