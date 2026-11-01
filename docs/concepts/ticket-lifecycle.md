# One ticket, from draft to merged

> **Question:** What happens to a ticket at each step, who moves it, and what can send it back?
> **Time:** 15 minutes.
> **Read first:** [Overview](overview.md).
> **Next:** [Walk a ticket](../interactive/ticket-journey.html), [State machines](../data-model/state-machines.md),
> [Build and review](../architecture/build-and-review.md).

## In one screen

![A swimlane of one ticket from ticket ready to merge-landed: User readies it, setting pending, and the Overseer then moves it to in-progress after the build job launches, to in-review after Customs and the gates pass and code writes the Handoff, and through reviewed to delivered in the lock hold where the Airlock fast-forwards main. Builder and reviewer only commit and report, and their lines end at their reports, so no agent exists during the merge. The merge-queue mark changes no status.](../figures/ticket-lifecycle/happy-path.png)

*Follow the dots: every filled dot is a status write, and none sits on an agent's lane.*

A [ticket](../glossary.md#ticket) on the [board](../glossary.md#board) starts as a [draft
ticket](../glossary.md#draft-ticket). User, the person running the board, readies it, and from that point the
[Overseer](../glossary.md#overseer) carries it through a [build job](../glossary.md#build-job),
[Customs](../glossary.md#customs), the [gates](../glossary.md#gate), an optional [review
round](../glossary.md#review-round), the [merge queue](../glossary.md#merge-queue) and an
[Airlock](../glossary.md#airlock) that lands it.

Three things make the board readable:

- **Agents report; code moves.** A [builder](../glossary.md#builder) or [reviewer](../glossary.md#reviewer) has no route
  to a status or to its ticket's body. The Overseer writes both from verified reports.
- **Four things move separately.** Status, [hold](../glossary.md#hold), the [row](../glossary.md#row)'s `mergeQueued`
  mark and [jobs](../glossary.md#job) are independent. No status says merging: a queued ticket stays `in-review`.
- **Red is not failure.** [Acceptance](../glossary.md#acceptance) is the ticket's numbered list of what must hold. A
  red gate, a review that finds an Acceptance item unmet and a moved [target](../glossary.md#target) each send the
  ticket back with its work intact, up to a bound. Past the bound the ticket is [parked](../glossary.md#park) for User.

## The worked ticket

Alex Example is the User here and wants ticket #003 'Double-click a role to edit it' on Example Storefront. Each step
below names who acts.

**Filing.** User runs `agent-progress-v2 ticket add`, which writes the file with status `draft`, the only way into that
status. Nothing builds a draft ticket. An agent can file too, through a [product owner](../glossary.md#product-owner)
session. That session keeps its notes in a [filing draft](../glossary.md#filing-draft), which is a working record and
not a ticket. A builder, reviewer or [merge-fix](../glossary.md#merge-fix) session may also file low draft findings
through the [Hatch](../glossary.md#hatch), up to `WORKER_FILINGS_PER_JOB`; that is how a
[finding](../glossary.md#finding) reaches the [Assistant](../glossary.md#assistant).

**Ready.** User runs `agent-progress-v2 ticket ready 003`, which moves it to `pending` and gives it a row. The verb
refuses a ticket without a numbered `## Acceptance` and a [`## Brief`](../glossary.md#brief) holding a non-blank line,
because those two sections are what the builder is held to.

**Build job.** The [Playbook](../glossary.md#playbook) picks #003 for a build job once its dependencies are settled, it
is not held and a [launch slot](../glossary.md#launch-slot) is free, and the Overseer launches it. On the next
[Pass](../glossary.md#pass) the ticket goes `in-progress`. The Overseer then adds a [worktree](../glossary.md#worktree)
on branch `ticket-003` from the target's tip, and a [Watcher](../glossary.md#watcher) runs the builder's
[session](../glossary.md#session) there. The builder commits on its branch and ends with a
[report](../glossary.md#report).

**Customs.** The report is a claim, so Customs reads git and checks it. The ticket body must be unchanged since launch,
the worktree clean, the report must account for every Acceptance item with evidence or a
[waiver](../glossary.md#waiver) proposal, and it must claim each agent-run gate on HEAD. The checks are in [Customs
and gates](../architecture/customs-and-gates.md).

**Gates.** Each gate of the [pipeline](../glossary.md#pipeline) runs in order under a Watcher, on the builder's commit.
The Overseer runs every gate itself, so the report's claim that a gate passed counts for nothing here.

**[Handoff](../glossary.md#handoff).** When the gates pass, code writes the ticket's `## Handoff` from the verified
report, ends the job `built` and moves the ticket `in-review`, all in one [lock hold](../glossary.md#lock-hold): one
run under the board's lock, so the change lands whole. A lock hold is not a [ticket hold](../glossary.md#ticket-hold):
[Words that mean several things](../glossary.md#words-that-mean-several-things) separates them. When a launch slot is
free, the Playbook picks the review job in that same lock hold.

**Review.** A review job reuses the worktree and goes through Customs and the gates too; when the reviewer leaves the
tree as it was, the Overseer runs no gate. The reviewer judges each Acceptance item, and code appends `## Review 1` to
the ticket from the report. A review ends in one of four moves, set out in [Build and
review](../architecture/build-and-review.md): the ticket is queued, another round is granted, a waiver is proposed, or
the reviewer finds an Acceptance item unmet.

> **As built.** A proposed waiver waits for an answer that has no effect: [the waiver
> answer](../reference/known-gaps.md#gap-waiver-answer-has-no-effect).

**Merge queue.** A passed review sets `mergeQueued` on the row and adds `merge-queued` to the
[log](../glossary.md#log). The status does not change, and no job exists until an Airlock claims the ticket.

**Airlock.** Each target has one Airlock slot. The Airlock [sweep](../glossary.md#sweep) inside the Pass claims it for
the next queued ticket and launches a merge job, which is Overseer code with no agent. The merge job works in order:

1. It merges the target into `ticket-003`. A conflict brings in a [resolver](../glossary.md#resolver), a story told in
   [Airlocks and groups](../architecture/airlocks-and-groups.md).
2. It gates the merged tree, skipping this when the merge changed nothing and that tree already passed.
3. It refuses the ticket if the review did not settle its Acceptance. This is the last check before git moves.
4. It fast-forwards main, only if main's tip is still the one it merged.

**Delivered.** In the same lock hold as the fast-forward, this [landing](../glossary.md#landing) moves #003 to
`reviewed` then `delivered`, and the log gains `merge-landed` with kind `landed`. On the [main
line](../glossary.md#main-line) `reviewed` is never a resting place.

> **As built.** The branch and worktree of a landed ticket stay on disk: [landed worktrees
> stay](../reference/known-gaps.md#gap-landed-worktrees-stay).

## Who moves a ticket

**After `ticket ready`, the Overseer's code writes every status on the normal path. No agent does.**

![Every write to a ticket comes from code or User, or passes the Bouncer. Overseer code writes every status on the normal path, User runs its verbs, and a product owner or the Assistant may ask through the Hatch, where the Bouncer admits the request and the Overseer applies it. Builder, reviewer and merge-fix sessions stop at confinement and Customs with no route to an existing ticket, and may only file a new low finding through the Hatch. A resolver has no Hatch at all.](../figures/ticket-lifecycle/who-moves.png)

*Agents working a ticket have no route to an existing ticket, at most a new low finding. The product owner and the
Assistant ask, and only for the move shown.*

No session writes files in [`<data>`](../glossary.md#reading-names): [confinement](../architecture/confinement.md)
denies it, and Customs refuses a run whose commits touch that folder or that changed the ticket body.

That is why the Handoff is the code's. The builder writes a `handoff` field in its report, and the Overseer copies it
into the ticket once it has verified the rest.

`ticket deliver --by-hand` is for work landed outside the Overseer. A request through the Hatch applies only after the
[Bouncer](../glossary.md#bouncer) admits it, and [Control and Hatch](../architecture/control-and-hatch.md) shows how a
verb travels. A hold is not a status, so it is not on this list: [State machines](../data-model/state-machines.md) has
the legal moves and hold forms.

## Four things to read separately

![Four parallel tracks for one ticket on one time axis: status, hold, the row mergeQueued mark and jobs. The status stays in-review through a stopped review, a hold, a second review job, the merge queue and the merge job. While the ticket is held or queued no job exists, and only the landing moves the status to delivered.](../figures/ticket-lifecycle/four-axes.png)

*One status bar spans a stopped job, a hold, a queue wait and a merge: the status alone says little about what is
happening.*

Here User stopped the first review job, which ended it and held the ticket with a stop hold, `stopped by User (J2)`,
naming job J2. Lifting the hold lets the Playbook pick another review. The status never moved.

| Track | Stored in | It answers | It changes when |
| --- | --- | --- | --- |
| Status | the ticket's `status` | How far has the work come? | the Overseer or a User verb moves the ticket |
| Hold | the ticket's `hold`, whose presence is the hold | Is something keeping it from the next step? | User or the Overseer sets it; `ticket unhold` lifts any form, and an answer lifts some ([every form](../data-model/state-machines.md)) |
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
| `pending`, no job, no hold | usually a dependency unsettled, no launch slot free, or an open incident or a blocking decision |

These are the common readings. A launch also waits on the board as a whole, and [Why is this not
moving?](../interactive/why-not-moving.html) walks the full check.

> **As built.** A refused merge relaunches a review while its decision is open: [refused
> merges](../reference/known-gaps.md#gap-refused-merge-relaunches-review).

> **Careful.** In the [Bridge](../glossary.md#bridge), the web client, trust the Kanban lane over the state word. A
> queued ticket sits in the Merge queue lane while its word stays `Awaiting review`, because the word comes from the
> row's status. [Running a board](../operations/running-a-board.md) covers the views.

## Red is not failure

![A strip of the main path: Build, Customs, Gates, Review, Queue, Airlock, Landed. Three loops return: a red gate or a fixable Customs fault goes back to Build in the same session and job, and a review job does the same with its reviewer; a review that finds an Acceptance item unmet goes back to Build in the same builder session under another job; a moved target goes from the Airlock back to the queue to merge again.](../figures/ticket-lifecycle/ways-back.png)

*Each loop returns to the nearest step that can put it right, and the two to Build resume a session that remembers
the work.*

The commits stay on the branch.

| Way back | What happens | Status | What ends it |
| --- | --- | --- | --- |
| Red gate | The job stops `interrupted`, the Overseer writes the [red-handoff note](../glossary.md#red-handoff) and resumes the same session. | unchanged | `RED_HANDOFF_RESUMES_BEFORE_PARKING` (2) resumes, then parked |
| Review finds an Acceptance item unmet | The review job ends, and another build job resumes the builder's session with the findings. | `in-review` to `in-progress` | the same count, one [handoff cycle](../glossary.md#handoff-cycle) shared with red gates |
| Target moved | The merge job ends, the Airlock slot frees and the ticket stays queued. The next claim merges again. | unchanged | `TARGET_MOVED_MERGES_BEFORE_PARKING` (2) moves in a row, then parked |

A red gate on a review job resumes the reviewer the same way, on its own count. Customs takes the first way back too
when the fault is one a session can fix: no commit, a dirty worktree, or missing gate claims.

Step through each in the lab: [a red gate](../interactive/ticket-journey.html#red-gate), [a Customs refusal the session
can fix](../interactive/ticket-journey.html#customs-resumable), [a review that does not
hold](../interactive/ticket-journey.html#review-fails) and [a moved
target](../interactive/ticket-journey.html#target-moved).

A [failed pass](../glossary.md#failed-pass) is the harsher path, for an ending the session cannot repair, such as a
session that exits cleanly with no valid report. A session that crashes is resumed instead and does not count. The next
job of that kind starts fresh on the same branch, and `FAILED_PASSES_BEFORE_PARKING` (2) of them park the ticket. A
review that resumes its builder is not a failed pass.

Every way back ends the same way once its bound is reached: a `parked:<cause>` hold and a `parked` decision to User,
with the status unchanged. The rules are in [Build and review](../architecture/build-and-review.md), the values in
[Deciders and bounds](../reference/deciders-and-bounds.md).

> **As built.** Answering a `parked` decision lifts nothing; `ticket unhold` does: [answering
> parked](../reference/known-gaps.md#gap-answering-parked-does-not-unhold).

## Variants

Each variant keeps the main path and changes one part: a skipped step, a different ending, or a wait.

![Five strips of Build, Review, Queue, Airlock and an ending, the main path ending delivered. The four variants are no review phase, which skips Review; a group ticket, which lands on its group branch and rests on reviewed; a release ticket, built on the group branch, which delivers its whole bundle; and a question to User, which pauses the job in waiting-for-answer until the answer returns it. Each changes one part and keeps the rest.](../figures/ticket-lifecycle/variants.png)

*Read each strip against the main path at the top: the outlined or dashed boxes are what differs.*

**[No review phase](../interactive/ticket-journey.html#no-review).** Review exists only when the pipeline has a `review`
key. Without it, the lock hold that records the passed gates also queues the ticket, and the merge job skips its check
that the review settled Acceptance, since no reviewer judged the items.

**[Group ticket](../interactive/ticket-journey.html#group-release).** A ticket with a [group](../glossary.md#group)
targets the branch `group-<name>`, and its branch forks from that tip. Landing there logs `merge-landed` with kind
[integrated](../glossary.md#integrated), and the Bridge shows the `reviewed` status as `Awaiting merge`. `reviewed`
settles a dependency, so the group's next ticket can start.

**Release ticket.** A group's [release ticket](../glossary.md#release-ticket) is built and reviewed on the group branch.
It is a candidate only once the rest of its [release bundle](../glossary.md#release-bundle) has integrated. Its landing
moves it and every `reviewed` ticket of the bundle to `delivered` in one lock hold, and the group's worktree and branch
are removed after that.

**[A question to User](../interactive/ticket-journey.html#question).** A builder or reviewer may ask, and the Overseer
opens an `agent-question` decision. The answer returns the job to `running`. A question that outlives its job holds the
ticket until answered, and a question the system can answer goes to the Assistant: see [Questions and
incidents](../architecture/questions-and-incidents.md).

Every other branch can be stepped through in [Walk a ticket](../interactive/ticket-journey.html), among them [a granted
round](../interactive/ticket-journey.html#round-granted), [a merge
conflict](../interactive/ticket-journey.html#conflict) and [a red merged
tree](../interactive/ticket-journey.html#merge-gate-red).

## Invariants

The general ones are in [State machines](../data-model/state-machines.md). These belong to this story.

1. Every ticket starts `draft`.
2. No agent working a ticket, whether builder, reviewer, resolver or merge-fix, changes an existing ticket's status or
   body. Code writes `## Handoff` and `## Review <n>` from verified reports, and any other session's change passes the
   Bouncer first.
3. On the Overseer's path, a ticket on the main line passes `reviewed` and reaches `delivered` in the lock hold that
   lands it; only a group ticket rests on `reviewed`.
4. The Overseer moves a target only by a fast-forward from the tip it merged.
5. Every count that parks a ticket is read from the log, so a restart derives the same answer.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Filing, readying, moves, release | `src/lib/tracker-model/TicketMoves.ts` | `fileTicket`, `readyDraftTickets`, `moveTicket`, `releaseTickets` | `src/lib/tracker-model/Board.ticketMoves.spec.ts`, `src/lib/tracker-model/Board.ready.spec.ts`, `src/lib/tracker-model/Board.release.spec.ts` |
| What launches next, and held | `src/lib/tracker-model/Playbook.ts` | `nextStepsOf`, `candidateOf`, `ticketIsHeld` | `src/lib/tracker-model/Playbook.spec.ts` |
| Counts toward parking | `src/lib/tracker-model/Playbook.ts` | `handoffCycleResumesOf`, `redHandoffStepsOf` | `src/lib/tracker-model/Playbook.redHandoff.spec.ts` |
| Failed passes | `src/lib/tracker-model/utils/FailedPassUtil.ts` | `failedPassesOf` | `src/lib/tracker-model/utils/FailedPassUtil.spec.ts` |
| A build job, Handoff included | `src/services/overseer/JobLaunch.ts` | `applyObservation`, `verifyAndRoute`, `settleGate` | `src/services/overseer/JobLaunch.spec.ts` |
| What a review leads to | `src/services/lifecycle/ReviewOutcome.ts` | `settleReviewPass` | `src/services/lifecycle/ReviewOutcome.spec.ts` |
| The queue mark | `src/lib/tracker-model/MergeQueueMarks.ts` | `queueTicketForMerge` | `src/services/overseer/BoardState.mergeQueue.spec.ts` |
| Landing | `src/services/lifecycle/Landing.ts`, `src/services/overseer/Airlocks.ts` | `landOnTarget`, `landOnTheBoard`, `settleMovedTarget` | `src/services/lifecycle/Landing.spec.ts`, `src/services/overseer/Airlocks.integration.spec.ts` |
| Who may relay what | `src/services/control/Bouncer.ts` | `verdictOf` | `src/services/control/Bouncer.spec.ts` |
| Questions | `src/services/overseer/QuestionRouting.ts`, `src/lib/tracker-model/AgentQuestions.ts` | `routeOf`, `afterAnswer` | `src/services/overseer/QuestionRouting.spec.ts` |
