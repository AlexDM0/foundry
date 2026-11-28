# One ticket, from draft to merged

> **Question:** What happens to a ticket at each step, who moves it, and what can send it back?
> **Time:** 15 minutes.
> **Read first:** [Overview](overview.md).
> **Next:** [Getting started](../operations/getting-started.md).

## In one screen

![A swimlane of one ticket from ticket ready to merge-landed: User readies it, setting pending, and Hephaestus then moves it to in-progress after the build job launches, to in-review after Customs and the gates pass and code writes the Handoff, and through reviewed to delivered in the lock hold where the Airlock fast-forwards main. Builder and reviewer only commit and report, and their lines end at their reports, so no agent exists during the merge. The merge-queue mark changes no status.](../figures/ticket-lifecycle/happy-path.png)

*Follow the dots: every filled dot is a status write, and none sits on an agent's lane.*

A [ticket](../glossary.md#ticket) on the [board](../glossary.md#board) starts as a [draft
ticket](../glossary.md#draft-ticket). User, the person running the board, readies it, and from that point the
[Hephaestus](../glossary.md#hephaestus) carries it through a [build job](../glossary.md#build-job),
[Customs](../glossary.md#customs), the [gates](../glossary.md#gate), an optional [review
round](../glossary.md#review-round), the [merge queue](../glossary.md#merge-queue) and an
[Airlock](../glossary.md#airlock) that lands it.

Three things make the board readable:

- **Agents report; code moves.** A [builder](../glossary.md#builder) or [reviewer](../glossary.md#reviewer) has no route
  to a status or to its ticket's body. Hephaestus writes both from verified reports.
- **Four things move separately.** Status, [hold](../glossary.md#hold), the [row](../glossary.md#row)'s `mergeQueued`
  mark and [jobs](../glossary.md#job) are independent. No status says merging: a queued ticket stays `in-review`.
- **Red is not failure.** [Acceptance](../glossary.md#acceptance) is the ticket's numbered list of what must hold. A
  red gate, a review that finds an Acceptance item unmet and a moved [target](../glossary.md#target) each send the
  ticket back with its work intact, up to a bound. Past the bound the ticket is [parked](../glossary.md#park) for User.

## The worked ticket

Alex Example is the User here and wants ticket #003 'Double-click a role to edit it' on Example Storefront. Each step
below names who acts.

**Filing.** User runs `forge ticket add`, which writes the file with status `draft`, the only way into that
status. Nothing builds a draft ticket. An agent can file too, through a [product owner](../glossary.md#product-owner)
session. That session keeps its notes in a [filing draft](../glossary.md#filing-draft), which is a working record and
not a ticket. A builder or reviewer session, in the [Airlock](../glossary.md#airlock) too, may also file low draft
findings through the [Hatch](../glossary.md#hatch), up to `WORKER_FILINGS_PER_JOB`; that is how a
[finding](../glossary.md#finding) reaches the [Assistant](../glossary.md#assistant).

**Ready.** User runs `forge ticket ready 003`, which moves it to `committed` and gives it a row. The verb
refuses a ticket without a numbered `## Acceptance` and a [`## Brief`](../glossary.md#brief) holding a non-blank line,
because those two sections are what the builder is held to.

**Build job.** The [Playbook](../glossary.md#playbook) picks #003 for a build job once its dependencies are settled, it
is not held and a [launch slot](../glossary.md#launch-slot) is free, and Hephaestus launches it. On the next
[Pass](../glossary.md#pass) the ticket goes `in-progress`. Hephaestus then adds a [worktree](../glossary.md#worktree)
on branch `ticket-003` from the target's tip, and [Talos](../glossary.md#talos) runs the builder's
[session](../glossary.md#session) there. The builder commits on its branch and ends with a
[report](../glossary.md#report).

**Customs.** The report is a claim, so Customs reads git and checks it. The ticket body must be unchanged since launch,
the worktree clean, the report must account for every Acceptance item with evidence or a
[waiver](../glossary.md#waiver) proposal, and it must claim each agent-run gate on HEAD.

**Gates.** Each gate of the [pipeline](../glossary.md#pipeline) runs in order under Talos, on the builder's commit.
Hephaestus runs the gates of the job's phase itself, so the report's claim that a gate passed counts for nothing here.

**[Handoff](../glossary.md#handoff).** When the gates pass, code writes the ticket's `## Handoff` from the verified
report, ends the job `built` and moves the ticket `in-review`, all in one [lock hold](../glossary.md#lock-hold): one
run under the board's lock, so the change lands whole. A lock hold is not a [ticket hold](../glossary.md#ticket-hold):
[Words that mean several things](../glossary.md#words-that-mean-several-things) separates them. When a launch slot is
free, the Playbook picks the review job in that same lock hold.

**Review.** A review job reuses the worktree and goes through Customs and the gates too; when the reviewer leaves the
tree as it was, Hephaestus runs no gate. The reviewer judges each Acceptance item, and code appends `## Review 1` to
the ticket from the report. A review ends in one of four moves: the ticket is queued, another round is granted, a waiver
is proposed, or the reviewer finds an Acceptance item unmet.

User's answer to a waiver is recorded, with Hephaestus down too, and the next Pass acts on it: a refusal sends the
ticket back to its builder, and a grant writes each proposed item `Waived:` and queues the ticket.

**Merge queue.** A passed review sets `mergeQueued` on the row and adds `merge-queued` to the
[log](../glossary.md#log). The status does not change, and no job exists until an Airlock claims the ticket.

**Airlock.** Each target has one Airlock slot. The Airlock [sweep](../glossary.md#sweep) inside the Pass claims it for
the next queued ticket and launches a merge job, which is Hephaestus code with no agent. The merge job works in order:

1. It merges the target into `ticket-003`. A conflict brings back the ticket's reviewer.
2. It gates the merged tree, skipping this when the merge changed nothing and that tree already passed.
3. It refuses the ticket if the review did not settle its Acceptance. This is the last check before git moves.
4. It fast-forwards main, only if main's tip is still the one it merged.

**Delivered.** In the same lock hold as the fast-forward, this [landing](../glossary.md#landing) moves #003 to
`reviewed` then `delivered`, and the log gains `merge-landed` with kind `landed`. On the [main
line](../glossary.md#main-line) `reviewed` is never a resting place.

> **As built.** The branch and worktree of a landed ticket stay on disk.

## Who moves a ticket

**After `ticket ready`, Hephaestus's code writes every status on the normal path. No agent does.**

![Every write to a ticket comes from code or User, or passes the Bouncer. Hephaestus code writes every status on the normal path, User runs its verbs, and a product owner or the Assistant may ask through the Hatch, where the Bouncer admits the request and Hephaestus applies it. Builder and reviewer sessions, in the Airlock too, stop at confinement and Customs with no route to an existing ticket, and may only file a new low finding through the Hatch.](../figures/ticket-lifecycle/who-moves.png)

*Agents working a ticket have no route to an existing ticket, at most a new low finding. The product owner and the
Assistant ask, and only for the move shown.*

No session writes files in [`<data>`](../glossary.md#reading-names): confinement
denies it, and Customs refuses a run whose commits touch that folder or during which the ticket's content hash moved.

That is why the Handoff is the code's. The builder writes a `handoff` field in its report, and Hephaestus copies it
into the ticket once it has verified the rest.

`ticket deliver --by-hand` is for work landed outside Hephaestus. A request through the Hatch applies only after the
[Bouncer](../glossary.md#bouncer) admits it. A hold is not a status, so it is not on this list.

## Four things to read separately

![Four parallel tracks for one ticket on one time axis: status, hold, the row mergeQueued mark and jobs. The status stays in-review through a stopped review, a hold, a second review job, the merge queue and the merge job. While the ticket is held or queued no job exists, and only the landing moves the status to delivered.](../figures/ticket-lifecycle/four-axes.png)

*One status bar spans a stopped job, a hold, a queue wait and a merge: the status alone says little about what is
happening.*

Here User stopped the first review job, which ended it and held the ticket with a stop hold, `stopped by User (J2)`,
naming job J2. Lifting the hold lets the Playbook pick another review. The status never moved.

| Track | Stored in | It answers | It changes when |
| --- | --- | --- | --- |
| Status | the ticket's `status` | How far has the work come? | Hephaestus or a User verb moves the ticket |
| Hold | the ticket's `hold`, whose presence is the hold | Is something keeping it from the next step? | User or Hephaestus sets it; `ticket unhold` lifts any form, and an answer lifts some |
| Row mark | the row's `mergeQueued` | Is it waiting to land? | usually a passed review, or passed gates with no review phase, sets it; a refused or aborted merge drops it |
| Jobs | `jobs` in `progress.json`, while live | Is anything working on it? | a launch or a job's ending |

A hold stops the next launch and keeps an Airlock from claiming the ticket. It leaves the status alone.

Most 'why is this not moving?' questions end on one of these:

| On the board | Read it as |
| --- | --- |
| `in-review`, no job, `mergeQueued` set | waiting for its Airlock, not for a reviewer |
| `in-review`, no job, a hold | held; the hold's text says why |
| `in-review`, no job, no mark, no hold | with a review phase, usually waiting for a launch slot to start review, or to relaunch it after a refused merge; with no review phase, a refused merge waiting for User. An open [incident](../glossary.md#incident), or a waiver or agent-config [decision](../glossary.md#decision), also blocks a launch with no hold set |
| `in-progress` or `in-review`, job `waiting-for-answer` | a question to User, keeping its launch slot |
| `committed`, no job, no hold | usually a dependency unsettled, no launch slot free, or an open incident or a blocking decision |

These are the common readings. A launch also waits on the board as a whole: the runbook's
[Not moving](../operations/runbook.md#not-moving) ladder walks the full check.

> **As built.** A refused merge relaunches a review while its decision is open.

> **Careful.** In a client's board view, trust the Kanban lane over the state word. A
> queued ticket sits in the Merge queue lane while its word stays `Awaiting review`, because the word comes from the
> row's status. [Running a board](../operations/running-a-board.md) covers the views.

## Red is not failure

![A strip of the main path: Build, Customs, Gates, Review, Queue, Airlock, Landed. Three loops return: a red gate or a fixable Customs fault goes back to Build in the same session and job, and a review job does the same with its reviewer; a review that finds an Acceptance item unmet goes back to Build in the same builder session under another job; a moved target goes from the Airlock back to the queue to merge again.](../figures/ticket-lifecycle/ways-back.png)

*Each loop returns to the nearest step that can put it right, and the two to Build resume a session that remembers
the work.*

The commits stay on the branch.

| Way back | What happens | Status | What ends it |
| --- | --- | --- | --- |
| Red gate | The job stops `interrupted`, Hephaestus writes the [red-handoff note](../glossary.md#red-handoff) and resumes the same session. | unchanged | `RED_HANDOFF_RESUMES_BEFORE_PARKING` (2) resumes, then parked |
| Review finds an Acceptance item unmet | The review job ends, and another build job resumes the builder's session with the findings. | `in-review` to `in-progress` | the same count, one [handoff cycle](../glossary.md#handoff-cycle) shared with red gates |
| Target moved | The merge job ends, the Airlock slot frees and the ticket stays queued. The next claim merges again. | unchanged | `TARGET_MOVED_MERGES_BEFORE_PARKING` (2) moves in a row, then parked |

A red gate on a review job resumes the reviewer the same way, on its own count. Customs takes the first way back too
when the fault is one a session can fix: no commit, a dirty worktree, or missing gate claims.

A [failed pass](../glossary.md#failed-pass) is the harsher path, for an ending the session cannot repair, such as a
session that exits cleanly with no valid report. A session that crashes is resumed instead and does not count. The next
job of that kind starts fresh on the same branch, and `FAILED_PASSES_BEFORE_PARKING` (2) of them park the ticket. A
review that resumes its builder is not a failed pass.

Every way back ends the same way once its bound is reached: a `parked:<cause>` hold and a `parked` decision to User,
with the status unchanged.

> **As built.** Answering a `parked` decision lifts nothing; `ticket unhold` does.

## Variants

Each variant keeps the main path and changes one part: a skipped step, a different ending, or a wait.

![Five strips of Build, Review, Queue, Airlock and an ending, the main path ending delivered. The four variants are no review phase, which skips Review; a group ticket, which lands on its group branch and rests on reviewed; a release ticket, built on the group branch, which delivers its whole bundle; and a question to User, which pauses the job in waiting-for-answer until the answer returns it. Each changes one part and keeps the rest.](../figures/ticket-lifecycle/variants.png)

*Read each strip against the main path at the top: the outlined or dashed boxes are what differs.*

**No review phase.** Review exists only when the pipeline has a `review`
key. Without it, the lock hold that records the passed gates also queues the ticket, and the merge job skips its check
that the review settled Acceptance, since no reviewer judged the items.

**Group ticket.** A ticket with a [group](../glossary.md#group)
targets the branch `group-<name>`, and its branch forks from that tip. Landing there logs `merge-landed` with kind
[integrated](../glossary.md#integrated), and the board shows the `reviewed` status as `Awaiting merge`. `reviewed`
settles a dependency, so the group's next ticket can start.

**Release ticket.** A group's [release ticket](../glossary.md#release-ticket) is built and reviewed on the group branch.
It is a candidate only once the rest of its [release bundle](../glossary.md#release-bundle) has integrated. Its landing
moves it and every `reviewed` ticket of the bundle to `delivered` in one lock hold, and the group's worktree and branch
are removed after that.

**A question to User.** A builder or reviewer may ask, and Hephaestus
opens an `agent-question` decision. The answer returns the job to `running`. A question that outlives its job holds the
ticket until answered, and a question the system can answer goes to the Assistant.

## Invariants

These belong to this story.

1. Every ticket starts `draft`.
2. No agent working a ticket, whether builder or reviewer, in the Airlock or not, changes an existing ticket's status or
   body. Code writes `## Handoff` and `## Review <n>` from verified reports, and any other session's change passes the
   Bouncer first.
3. On Hephaestus's path, a ticket on the main line passes `reviewed` and reaches `delivered` in the lock hold that
   lands it; only a group ticket rests on `reviewed`.
4. Hephaestus moves a target only by a fast-forward from the tip it merged.
5. Every count that parks a ticket is read from the log, so a restart derives the same answer.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Filing, readying, moves, release | `src/domain/tracker-model/TicketMoves.ts` | `fileTicket`, `readyDraftTickets`, `moveTicket`, `releaseTickets` | `src/domain/tracker-model/Board.ticketMoves.spec.ts`, `src/domain/tracker-model/Board.ready.spec.ts`, `src/domain/tracker-model/Board.release.spec.ts` |
| What launches next, and held | `src/domain/tracker-model/Playbook.ts` | `nextStepsOf`, `candidateOf`, `ticketIsHeld` | `src/domain/tracker-model/Playbook.spec.ts` |
| Counts toward parking | `src/domain/tracker-model/Playbook.ts` | `handoffCycleResumesOf`, `redHandoffStepsOf` | `src/domain/tracker-model/Playbook.redHandoff.spec.ts` |
| Failed passes | `src/domain/tracker-model/utils/FailedPassUtil.ts` | `failedPassesOf` | `src/domain/tracker-model/utils/FailedPassUtil.spec.ts` |
| A build job, Handoff included | `src/services/hephaestus/BuildJobPass.ts`, `src/services/hephaestus/BuildJobCustoms.ts`, `src/services/hephaestus/GateSettlement.ts` | `applyObservation`, `verifyAndRoute`, `settleGate` | `src/services/hephaestus/BuildJobSessions.buildJobFrames.spec.ts` |
| What a review leads to | `src/services/lifecycle/ReviewOutcome.ts` | `settleReviewPass` | `src/services/lifecycle/ReviewOutcome.spec.ts` |
| The queue mark | `src/domain/tracker-model/MergeQueueMarks.ts` | `queueTicketForMerge` | `src/services/hephaestus/BoardState.mergeQueue.spec.ts` |
| Landing | `src/services/lifecycle/Landing.ts`, `src/services/hephaestus/AirlockLandings.ts` | `landOnTarget`, `landOnTheBoard`, `settleMovedTarget` | `src/services/lifecycle/Landing.spec.ts`, `src/services/hephaestus/Airlocks.spec.ts` |
| Who may relay what | `src/services/control/Bouncer.ts` | `verdictOf` | `src/services/control/Bouncer.spec.ts` |
| Questions | `src/services/hephaestus/QuestionRouting.ts`, `src/domain/tracker-model/AgentQuestions.ts` | `routeOf`, `afterAnswer` | `src/services/hephaestus/QuestionRouting.spec.ts` |
