# Questions and incidents

> **Question:** Who gets a judgement call, what does an answer do, what waits for a person, and why nothing else does?
> **Time:** 25 minutes.
> **Read first:** [The system in twenty minutes](../concepts/overview.md), [Glossary](../glossary.md).
> **Next:** [Assistant](assistant-and-intake.md), [Control](control-and-hatch.md), [Airlocks](airlocks-and-groups.md).

## In one screen

Trouble goes to one of three audiences, and only one is meant to wait for a person.

![An agent raises an incident or a decision, and code raises all three kinds. An incident closes by a move or its default, can become a decision through an escalation, a park or a quiet-job default, and its default raises a notice. No path leads from a decision back to an incident.](../figures/questions-and-incidents/audiences-funnel.png)

*Trouble drains away from User: no path runs from a decision back to an incident.*

| | [Decision](../glossary.md#decision), decision id `E<n>` | [Incident](../glossary.md#incident), incident id `I<n>` | [Notice](../glossary.md#notice) |
| --- | --- | --- | --- |
| Audience | User | The [Assistant](../glossary.md#assistant) | User, to read |
| Storage | `progress.json` while open, then the log | `progress.json` while open, then the log | Derived each [Pass](../glossary.md#pass), never stored |
| How it ends | The first answer, or a withdrawal | A move, a named action by the Assistant or User; its default, the preset move code takes if nobody picks an allowed one; or an escalation | Its condition goes away |
| Can it wait forever? | Yes, by design | Sent to the Assistant: no, the end of that chat turn takes the default. Not yet sent: until an Assistant can take it, or code decides none can. Two as-built board states strand it until a person acts: a [changed install](../reference/known-gaps.md#gap-install-change-strands-incidents) and a [stale usage marker](../reference/known-gaps.md#gap-stale-usage-marker-stops-delivery) | Nothing waits on it |

[Reading names](../glossary.md#reading-names) explains ids and placeholders.

An [agent](../glossary.md#agent)'s question picks its audience by its headers. An `agent-question` answer arrives in the
[session](../glossary.md#session) or on the [ticket](../glossary.md#ticket), with one
[as-built exception](../reference/known-gaps.md#gap-escalated-question-of-ended-job). A `parked` decision's answer
[reaches nobody](../reference/known-gaps.md#gap-answering-parked-does-not-unhold), and an incident's answer sends a live
session no line: see [Answer delivery](#answer-delivery). Most decisions only close when answered: three run code.

## Three audiences

A decision needs User, an incident needs the Assistant or code, a notice needs nobody.

A decision is a question only User can answer. It survives a reboot and can be answered with the
[Overseer](../glossary.md#overseer) up or down, because answering is an ordinary tracker write that needs no running
Overseer. Its states are in [State machines](../data-model/state-machines.md). The first answer wins. The only
withdrawal in production is `JobControls.requestJobStop` stopping a [product owner](../glossary.md#product-owner).

An incident is operational trouble that code cannot settle alone. It costs no human attention unless the Assistant or a
default sends it to User. While open, it holds its tickets: [`Playbook`](../glossary.md#playbook) `ticketIsHeld` refuses
a launch on any ticket an incident names, whatever the kind. That is the same effect as a [hold](../glossary.md#hold),
with no hold written. A default may [park](../glossary.md#park) the ticket.

## Decisions

Commands below omit the `forge` prefix ([cli.md](../cli.md) has them all). A move such as `job-fresh` is the
value logged and checked, and `job fresh <J>` is the verb that makes it; `<J>` is a [job](../glossary.md#job) id. The
runbook's [Decisions](../operations/runbook.md#decisions) gives the follow-up for each kind.

`DECISION_KINDS` holds 13 kinds. Three run code on the answer, in `DecisionControls.answerDecision` and
`AgentQuestions.afterAnswer`. Seven are read while open, so closing them frees something, and most need a further step
from User: see the last column. `outage`, `checks-not-set`, `waiver` and `landing-refused` need a further command, and
`quiet-job` needs one only to act on the job. For the other three, the answer changes nothing.

One rule covers every kind. When the last open decision naming a waiting job closes, `afterAnswer` moves that job from
`waiting-for-answer` back to `running`.

![Of thirteen decision kinds, the answer runs code for agent-question, ready-drafts and pipeline-proposal. Seven are read while open, so closing them frees something, and outage, checks-not-set, waiver and landing-refused need a further command too. Answering parked, leftover-worktree or target-moved moves nothing.](../figures/questions-and-incidents/answer-effects.png)

*Amber marks a step the answer does not take. In the right column the answer only records a sentence in the log.*

Most decisions offer no options, so User answers with free text (`decide E7 -- <text>`), which nothing reads.
`ready-drafts` and `pipeline-proposal` have options of their own, and free text is read the same way on these two, so
`decide E7 -- Accept` accepts a proposal and `decide E7 -- #12` readies a draft. A `parked` decision keeps the options
of any agent's questions it carries.

| Kind | Means | Opened by | What the answer does in code | What User must do besides |
| --- | --- | --- | --- | --- |
| `agent-question` | An agent asked what only User can settle | `QuestionRouting.openQuestion`, or an incident's escalation | Moves the job from `waiting-for-answer` back to `running`; the next Pass sends the answer. For an ended job, writes `## Questions` and lifts the hold (see [Answer delivery](#answer-delivery)) | Nothing |
| `ready-drafts` | An intake closed and left draft tickets | `Board.endIntakeJob` | Readies each `#<id>` in the answer that the decision lists, that is still a draft and has no readiness gaps | Nothing |
| `pipeline-proposal` | The [onboarder](../glossary.md#onboarder) proposed a [pipeline](../glossary.md#pipeline) | `Onboarding` `applySettledOnboarders`, on a `proposed` outcome | An answer starting `ACCEPT_PROPOSAL_LABEL` writes the [prepare steps](../glossary.md#prepare-step) and [gates](../glossary.md#gate) in the same write as the answer; any other answer changes nothing. Review, constitution and agents are shown, never written | Nothing |
| `branch-touches-agent-config` | A branch changes the agents' own configuration, so a person reads it first | `JobLaunch` `openAgentConfigDecision`, [Customs](../glossary.md#customs) V13 or the check before a launch | No kind-specific code. As with any decision naming a job, the last answer moves a waiting job back to `running`. Open, it holds the ticket, and `agentConfigHitIsSettled` counts any answer as settled until another job on the ticket ends | Read the branch first: "no" releases it too |
| `outage` | Agents died in a row across tickets, so the Overseer paused | `Playbook.nextStepsOf`, with `pause-overseer`, past `CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING` | No code. Open, it holds every launch and resume, so closing it lets interrupted jobs resume | `oversee resume`: the Overseer stays paused for new work |
| `merge-refused` | An [Airlock](../glossary.md#airlock) gave up on a merge or a [refresh](../glossary.md#refresh) | `Airlocks` `refuseMerge` | No code. On a [board](../glossary.md#board) with no review phase the open decision keeps the ticket out of the [merge queue](../glossary.md#merge-queue); a refused refresh's open decision keeps that [group](../glossary.md#group)'s next refresh waiting | Read the refusal in the decision's context, repair the cause, then answer. No verb requeues: closing it lets the next Pass queue the ticket on such a board, or lets the refresh rerun |
| `checks-not-set` | No pipeline is stored | `Playbook.nextStepsOf` | No code. With no pipeline set, the next Pass opens another, and an unheld board launches another onboarder | Set a pipeline with `gate add`, or accept a `pipeline-proposal` |
| `waiver` | A reviewer proposes [waiving](../glossary.md#waiver) [Acceptance](../glossary.md#acceptance) items | `ReviewOutcome.settleReviewPass`, on a `waiver-proposed` claim | No code. Open, it holds every launch on its ticket and that ticket's Airlock claim; the job stays `awaiting-answer` | Answer it **and** run `job fresh <J>`, or the fresh review stays blocked. To grant, first make the `ticket edit --force` step in the known gap below |
| `landing-refused` | The [landing](../glossary.md#landing)'s Acceptance check refused | `Airlocks` `runLanding`, on an acceptance refusal | No code. Open, it keeps the ticket from the Airlock claim; the ticket also keeps its `landing-refused:<reason>` hold | Repair the Acceptance, answer it **and** run `ticket unhold <id>`: neither alone lands |
| `quiet-job` | A silent job's incident took its default | `IncidentMoves.defaultIncident`, the `quiet-job` default | No kind-specific code. As with any decision naming a job, the last answer moves a waiting job back to `running`. Open, it holds an interrupted job's resume; a running job is untouched | `job message <J>`, `job fresh <J>` or `job stop <J>`, and answer it |
| `parked` | A ticket stopped until User looks | `IncidentMoves` `parkUnder`, the Playbook's `park` step, `Airlocks` `abortAndPark`, `Airlocks` `settleMovedTarget` | None, even when it carries the agent's questions | `ticket unhold <id>` |
| `leftover-worktree` | A [worktree](../glossary.md#worktree) folder stands that nothing owns | `DrivePass` `openLeftoverWorktreeDecisions`, one per folder [Regrouping](../glossary.md#regrouping) reports | None; the next Regrouping opens another if the folder stands | Remove the folder |
| `target-moved` | A [target](../glossary.md#target) kept moving under its merges | `Airlocks` `settleMovedTarget`, only while `TARGET_REF_DENIES_HOLD` is false, and it is true | None | Nothing: this kind does not open as built |

> **As built.** Answering a `parked` decision does not lift the hold, and its answer reaches nobody:
> [known gap](../reference/known-gaps.md#gap-answering-parked-does-not-unhold).

> **As built.** Answering a `waiver` writes no waiver and leaves the review job waiting:
> [known gap](../reference/known-gaps.md#gap-waiver-answer-has-no-effect).

> **As built.** With a review phase set, an open `merge-refused` does not stop a review from launching:
> [known gap](../reference/known-gaps.md#gap-refused-merge-relaunches-review).

### What an open decision blocks

An open item blocks only steps its code names, and only `outage` reaches the whole board. A ticket launch starts a build
or review job. Queueing to merge puts a ticket in the [merge queue](../glossary.md#merge-queue). An Airlock claim lets a
queued ticket take its target's [Airlock slot](../glossary.md#airlock-slot). A resume restarts an interrupted session.

![A grid of eight open items against five steps. Only outage reaches the whole board: it holds every launch and resume, merge queueing, and the Airlock claim while the board is paused. Every other row stalls one ticket or one job, so an unanswered decision costs only its marked cells.](../figures/questions-and-incidents/what-an-open-decision-blocks.png)

*Only `outage` stops the whole board; every other row stalls one ticket or one job.*

The grid comes from lists and functions, not a rule per kind: `TICKET_HOLDING_DECISION_KINDS`,
`Playbook` `jobAwaitsAnAnswer` and `Playbook` `jobResumeIsHeld`, `newWorkIsHeld` in `Playbook.nextStepsOf`, all in
`src/lib/tracker-model/Playbook.ts`; `SLOT_HOLDING_DECISION_KINDS` in `src/lib/tracker-model/AirlockClaims.ts`; and
`dispatchIsStopped` in `src/services/overseer/Airlocks.ts`. `jobAwaitsAnAnswer` counts every decision naming the job,
whatever its kind.

## Notices

Ten kinds exist in `OverseerNotice`, and `DrivePass` `noticesOf` recomputes the list each Pass. No command answers a
notice: it stays until its condition goes away. `cli/overseer/OverseerWording.ts` words them for `oversee status`, and
the [Bridge](../glossary.md#bridge) header shows them; it shows `new-code` as its own line and every `incident-defaulted`
in one incident line above the header, whose drawer lists each default with its trail.

| Kind | Raised by | Means | Action |
| --- | --- | --- | --- |
| `install-version-changed` | `InstallChangeWatch` | The [install version](../glossary.md#install-version) differs, so launches are held | Run `update`; see the [Baton](../glossary.md#baton) in [baton.md](baton.md) |
| `new-code` | `InstallChangeWatch` | Code on disk differs and the install version does not; nothing is held | Run `update` when convenient |
| `claude-md-block-committed` | `DrivePass`, `targetHoldsManagedBlock` | The target's committed `CLAUDE.md` holds the managed block, so launches onto it wait | Commit the change `update` made |
| `dirty-main-checkout` | `Airlocks`, `hold-target` landing refusals | The target's checkout is off its branch, dirty or failed in git; that target's landings wait and other work goes on | Restore the checkout; `recheckHeldTargets` clears it at the next sweep |
| `target-file-held` | `Airlocks`, a `target-file-held` landing refusal | Another process held a file of the target's checkout open on every try, so git could not replace it; what git wrote went back to HEAD | Close the program; `recheckHeldTargets` clears it at the next sweep |
| `attribution-found` | `JobLaunch.attributionTicketIdsOf` | The ticket's newest ended job failed Customs on an AI attribution | Inspect the ticket; it clears when its next job ends |
| `rounds-not-converging` | `ReviewOutcome.nonConvergingTicketIdsOf` | The newest review reworked past `REWORK_ROUND_THRESHOLD_LINES` and was refused another round | Decide whether a separate ticket should pin down the rule that keeps breaking |
| `incident-defaulted` | `IncidentRouter.defaultedIncidentsOf` | An incident took its default since the Overseer last started | Read the incident's log lines, or its trail in the Bridge's incident drawer; it clears at the next start |
| `cleanup-declined` | `Airlocks` `reportDeclinedCleanup` | Git declined a removal after a refresh or a release | Remove what is named; a later Pass drops the notice |
| `instructions-missing` | `DrivePass` `launchWatcher` | A job's launch was refused, nothing spawned, because an instruction file the pipeline names is missing; retried each Pass | Restore the file or change the pipeline |
| `agent-program-refused` | `DrivePass` `launchWatcher` | A job's launch was refused, nothing spawned, because the agent program did not resolve to an absolute path outside the repository, or resolved to a Windows batch file; retried each Pass | Install the program outside the repository, on Windows the native one, and put its folder first on `PATH` |
| `watcher-endpoint-does-not-fit` | `DrivePass` `launchWatcher` | A job's launch was refused, nothing spawned, because this platform cannot bind its Watcher's endpoint; retried each Pass | Move the home folder to a shorter path |

A failed [Baton pass](../glossary.md#baton-pass) is a warning of its own, not a notice: see [Baton](baton.md).

## Agent questions

`AskUserQuestion` is the Claude Code tool an agent calls to ask something. One call, a request, holds one or
more questions, each with a short header the agent writes. `resources/prompts/BuildPrompt.md` and
`resources/prompts/ReviewPrompt.md` tell an agent to write `ticket` for a malformed ticket, `system` for trouble with
the system, and any other header for what only User can settle.

![An AskUserQuestion request reaches routeOf: all system or all ticket headers open an incident for the Assistant, anything else an agent-question decision for User, and an incident can escalate into that decision. An agent-question answer reaches the session as a control_response or a chat line, or the ticket's Questions section when the job ended. An incident answer on a live job sends no line, whatever its kind, so the tool call stays open; a malformed-ticket answer, or one with no job left, also goes under Questions.](../figures/questions-and-incidents/question-router.png)

*Follow any answer down: every box but the dashed one reaches an agent or the ticket.*

A `question` event on a `running` job reaches `QuestionRouting.openQuestion`, which picks the route with `routeOf`:

| Headers of the request | Route | Answered by |
| --- | --- | --- |
| Every question headed `system` | `system-question` incident | The Assistant, with the limit in [Answer delivery](#answer-delivery) |
| Every question headed `ticket` | `malformed-ticket` incident | The Assistant, with the limit in [Answer delivery](#answer-delivery) |
| Anything else, a mix of the two included | `agent-question` decision | User |

Only builders, reviewers and product owners can ask. `ROLES_THAT_MAY_ASK` lists those three
[roles](../glossary.md#role), and every other session starts with `AskUserQuestion` disallowed by `ClaudeCodeAdapter`
`disallowedToolsOf`. That covers the Assistant and the onboarder. A builder or reviewer resumed in the Airlock as a
[merge agent](../glossary.md#merge-agent) cannot ask either: `launchProfileOf` turns asking off for it.

- **The job waits.** It moves to `waiting-for-answer` and keeps its [launch slot](../glossary.md#launch-slot), because
  `Playbook` `freeSlotsOf` counts every live build and review job. The [Watcher](../glossary.md#watcher) and session
  stay up.
- **Replays open nothing.** A question event can arrive twice, because a Watcher replays its log after a restart. The
  second opens nothing: `openQuestion` returns for a request in `answeredRequestIds`, and
  `BoardRecords.questionRequestStanding` gives back what stands for a request already open. An escalation carries the
  request over.
- **The words stay the agent's.** Questions are stored field for field. An escalation adds no word of the Assistant's.
- **Options carry their consequences.** AskUserQuestion takes only a label and a description per option, and Claude
  Code strips any other key before the `can_use_tool` request (probe `.platform-probes/claude-p20-question-option-fields.js`).
  So the three prompts tell an agent to run `question options -- '<json>'` before it asks, giving each option the paths
  it changes (`touches`), what User gets and loses (`tradeOff`) and its effect on the Acceptance (`acceptanceEffect`).
  The notes wait on the job as `pendingOptionNotes`. `openQuestion` takes the notes whose question text matches a
  question it routes and puts each option's facts on the option with the same label, on a decision and in an incident's
  `questions` fact alike, so an escalation keeps them. An option no note names keeps its label and description alone,
  and notes for a question never asked leave with the job. A job keeps the notes of its newest eight questions. The
  Bridge shows each fact the option carries under it, in the question panel and on the Questions and Intake cards, and
  shows nothing for an option without them; it never derives a fact.
- **A second request while the job waits is dropped.** `DrivePass` `applyWatcherEvents` applies a question event only on
  a `running` job, and the event cursor moves past it. Nothing ever answers that request, so its tool call stays open.
- **Any open decision keeps the job waiting.** `AgentQuestions.jobIsStillAsking` holds it while any decision naming the
  job, or any question incident on it, is open. An open `quiet-job` counts too.

## Answer delivery

An `agent-question` answer arrives in the session, or under the ticket's `## Questions` for the next agent, with one
as-built exception under [A decision's answer](#a-decisions-answer). A `parked` decision's answer reaches nobody, even
when it carries the agent's questions. An incident's answer sends a live session no line: it lands on the ticket, or
nowhere.

![A session asks, its Watcher logs the event, and the Overseer records the decision and moves the job to waiting-for-answer. User's answer is a tracker write that moves the job back to running and needs no Overseer. The next Pass sends the line and writes the marker once the Watcher took it, and a Watcher not listening is tried again next Pass.](../figures/questions-and-incidents/answer-trip.png)

*The answer survives an Overseer outage because the write comes first. The marker comes last, so a line the Watcher
never took is tried again.*

### A decision's answer

`AnswerDelivery.deliverAnswers` tries every answered, undelivered request of a `running` job with a live Watcher, so a
Watcher not listening yet is tried on the next Pass.

| Situation | What arrives | Where it is decided |
| --- | --- | --- |
| The instance that asked is live | A `control_response` allow carrying the answers: the tool call returns. `control_response` is the vendor protocol's reply to a pending tool call; see [the probe](../development/overseer-claude-probe.md) | `AnswerDelivery` `deliverOne`, `adapter.answerLineOf` |
| Another instance, which never held the request | The answer as a plain chat line, and as a resumed session's first line | `adapter.chatLineOf`, `OverseerWording.answerMessageOf` |
| A `build` or `review` job ended `replaced` or `stopped` | The answer under the ticket's `## Questions`, for the next agent | `AgentQuestions.afterAnswer` |
| A product owner past `JOB_RESUMES_BEFORE_FRESH` crash resumes | Its answers as `carriedAnswers` in a fresh session's first message; see [The Assistant and intake](assistant-and-intake.md) | `JobControls.refreshIntake` |

A [marker](../glossary.md#marker) `answer-<digest>.delivered` in the job folder is written only after the Watcher took
the line, so a line it never took is tried again and a marked one never is. A crash between the send and the marker
sends the line twice: answers are at least once, see
[at most once](failure-and-recovery.md#at-most-once).

A question can outlive its job. `AgentQuestions.rebindQuestionsOfEndedJob` runs for a `build` or `review` job ended
`replaced` or `stopped`, and it sets the open `agent-question` decision's `jobId` to null, so no fresh job inherits a
request the dead session held. A stopped product owner's decisions are withdrawn instead.

![A swimlane across User, Overseer, ticket file and agent. A build or review job ends replaced with a question open, the decision's jobId becomes null, the ticket takes the hold awaiting answer, and nobody drives until User answers. The answer goes under the ticket's Questions section, the hold lifts, and a fresh job's agent reads it; a stopped or parked job keeps its own hold, so ticket unhold is needed too.](../figures/questions-and-incidents/question-outlives-job.png)

*The shaded span is the wait: nothing on the board moves this ticket until User answers.*

The hold `awaiting answer (E<n>)` is written only if the ticket holds nothing else. `Playbook` `ticketIsHeld` keeps it
from launching either way, because it reads the open question itself. A job stopped by `job stop` or a park leaves its
own hold first, so no `awaiting answer` hold is written. The answer still lands under `## Questions`, it lifts nothing,
and no fresh job launches until User runs `ticket unhold <id>`.

> **As built.** Rebinding reads decisions only. A question still open as an incident keeps its ended job's id, and if it
> escalates, the answer reaches nobody and the ticket is not held:
> [known gap](../reference/known-gaps.md#gap-escalated-question-of-ended-job).

### An incident's answer

`AgentQuestions.answerIncident` logs `incident-answered`, records the request as answered on the job and moves the job
back to `running`. A `malformed-ticket` answer, or any answer whose job is gone, also goes under `## Questions`.

> **As built.** `incident answer` on a live job sends the session no line, whatever the kind, and that job gets no
> resume line afterwards: [known gap](../reference/known-gaps.md#gap-incident-answer-not-delivered). The lab
> [walks it](../interactive/ticket-journey.html#question-system/answer-undelivered).

> **As built.** An answer under `## Questions` on a live job changes the ticket body that job's Customs compares:
> [known gap](../reference/known-gaps.md#gap-malformed-ticket-answer-v6).

## Incidents

Every kind names who opens it, one default and the only moves allowed. `ALLOWED_MOVES_BY_INCIDENT_KIND` is one table for
everyone: [`Bouncer`](../glossary.md#bouncer)`.incidentMoveVerdictOf` applies it to the Assistant at the
[Hatch](../glossary.md#hatch), and `IncidentControls.requireIncidentAllows` applies it to User at the command line. Who
settles an incident, chat by chat, is in [The Assistant and intake](assistant-and-intake.md).

| Kind | Means | Opened by | Default | Allowed moves |
| --- | --- | --- | --- | --- |
| `system-question` | An agent asked about the system, or a merge agent reported a system blocker | `QuestionRouting.openQuestion`; `Airlocks` `refuseMerge` on a `system-blocker` report | `incident-escalate` | `incident-answer`, `incident-escalate`, `job-fresh`, `ticket-park`, `incident-note` |
| `malformed-ticket` | The ticket cannot be worked as written | `QuestionRouting.openQuestion`; `Airlocks` `refuseMerge` on a `malformed-ticket` report | `incident-escalate` | `incident-answer`, `incident-escalate`, `ticket-park`, `incident-note` |
| `setup-failed` | The worktree, install or a prepare step failed, so no gate judged the tree | `JobLaunch` while preparing or at the prepare step; the merged-tree gate | `worktree-repair`; `gate-retry` from an Airlock | `worktree-repair`, `ticket-park`, `incident-note` |
| `out-of-calls` | An agent spent its [call budget](../glossary.md#call-budget) | `JobLaunch`: a `wound-down` report, or a session not working off a red handoff that passes its call budget plus `WIND_DOWN_GRACE_CALLS` | `job-fresh` | `job-fresh`, `ticket-park`, `incident-note` |
| `blocked` | An agent reported it cannot go on | `JobLaunch` `verifyAndRoute`, a `blocked` report | `ticket-park` | `job-fresh`, `worktree-repair`, `ticket-park`, `incident-note` |
| `job-lost` | A ticket's agents kept being replaced without finishing | `Playbook` `jobLostStepsOf`, past `REPLACED_JOBS_BEFORE_JOB_LOST` | `ticket-park` | `job-fresh`, `ticket-park`, `incident-note` |
| `resume-failed` | A session could not be resumed | `JobResumption.applyResumeFailure` | `job-fresh` | `job-fresh`, `ticket-park` |
| `gate-cannot-run` | A gate could not judge the tree at all | `JobLaunch` `settleGate`; the merged-tree gate | `gate-retry` | `gate-retry`, `worktree-repair`, `ticket-park` |
| `sandbox-unavailable` | The `GateConfinement` port refused a gate, prepare or install line, so it never started | `JobLaunch` `applyObservation`; the merged-tree gate; `Onboarding` `applySettledOnboarders` | `gate-retry` | `gate-retry`, `ticket-park` |
| `quiet-job` | A running job's [event log](../glossary.md#event-log) stopped growing | `IncidentRouter.openQuietJobIncidents` | `open-quiet-job-decision` | `job-message`, `job-fresh`, `incident-note` |

No kind allows `merge-land` on a failed merge gate, because that would land a red tree (invariant 9).

An allowed move can still be refused: the table says only what the kind permits. `job-fresh` also needs an incident
naming a job, and a job still on the board.

- **No job named:** `job-lost`, and a question an Airlock opened.
- **Job already ended, refused `job-finished`:** `blocked`, `resume-failed`, and `out-of-calls` from a `wound-down`
  report, whose job ends in the same write that opens the incident.

> **As built.** The Hatch refuses moves naming a `jobId`, so the Assistant cannot make them:
> [known gap](../reference/known-gaps.md#gap-assistant-job-moves-refused-at-hatch).

### Life of an incident

The [State explorer](../interactive/state-explorer.html#machine=incident) walks this life.

Every incident ends without a person once an Assistant can take it. The Overseer sends open incidents to an idle
Assistant in one chat turn, and any still open when that turn closes takes its default. A chat turn is one message to
the Assistant and the work up to its `result`; [The Assistant and intake](assistant-and-intake.md) numbers them.

![An incident opens not yet sent and goes out in an Assistant chat turn; a move closes it, an incident-note leaves it open, and an Assistant going down returns it to waiting. A closed or over-budget turn fires the default, and no-assistant fires it from either state. A default with questions escalates to an agent-question decision, and any other default closes the incident, then either tells User or frees the work.](../figures/questions-and-incidents/incident-life.png)

*Once sent, the end of the turn forces an outcome unless the Assistant goes down, which returns the incident to
waiting.*

`Incidents` closes an incident in one of three ways, each in the same write that removes it from the board. They are
alternatives: an escalating default logs `incident-escalated` and no `incident-defaulted`.

| Close | Log record | Trigger |
| --- | --- | --- |
| Handled | `incident-handled` naming the move | A move under the incident; `IncidentControls.handledUnder` marks it in the same write as the move |
| Defaulted | `incident-defaulted` naming the move and cause | `Playbook` `incidentDefaultStepsOf` |
| Escalated | `incident-escalated` naming the decision | `incident escalate`, or a default with questions to put |

`incident-note` logs a finding and closes nothing. The incident stays with the Assistant, so a note buys no time: the
turn's end still takes the default. Whether an incident was sent is the Overseer's state, stored in `deliveredInTurn`
and never logged. User may make an allowed move on any open incident, sent or not.

An [Assistant](assistant-and-intake.md) that goes down never closes its turn. `AssistantSession.endDownAssistants`
withdraws what it was sent, so a fresh session takes it again.

### Why a default fires

`IncidentDefaultCause` has three values. A cause is logged, and every `incident-defaulted` raises the notice of that
name. `no-assistant` is tested first and applies to every open incident, so a usage limit defaults an incident in the
middle of its turn.

| Cause | When |
| --- | --- |
| `no-assistant` | No Assistant can come up: a usage limit holds, or `FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING` boots failed and none has answered; or none is running and the kind is in `AIRLOCK_HOLDING_INCIDENT_KINDS` |
| `turn-closed` | The chat turn it went out in closed, or that job is gone |
| `turn-budget` | The open turn reached `ASSISTANT_TURN_CALL_BUDGET` |

An escalating default raises no notice, since it logs no `incident-defaulted`, so the
[smoke](../development/cutover-smoke.md) cannot tell one from an Assistant's escalation.

An incident not yet sent has no turn to close, so it takes no default until an Assistant takes it or `no-assistant`
fires. Two board states stop both, and in them it waits for a person:

> **As built.** While the install version differs, no Assistant boots and `no-assistant` does not count that as a cause:
> [known gap](../reference/known-gaps.md#gap-install-change-strands-incidents).

> **As built.** A [usage marker](../glossary.md#usage-marker) past its reset stops sending while no default fires:
> [known gap](../reference/known-gaps.md#gap-stale-usage-marker-stops-delivery).

### What each default does

If nobody acts, every kind falls to one of four ends.

![Ten incident kinds grouped by what their default does. Question kinds and quiet-job ask User, blocked and job-lost park the ticket, out-of-calls and resume-failed get a fresh agent, and setup-failed, gate-cannot-run and sandbox-unavailable only close. The four kinds marked once park on their next default, so a retry cannot loop.](../figures/questions-and-incidents/what-silence-does.png)

*A failing ticket reaches User on the second default, so a retry cannot loop.*

`IncidentMoves.defaultIncident` applies these in order, and the first that fits wins.

| When | What happens |
| --- | --- |
| `incident-escalate` with questions | The agent's own questions open as an `agent-question` decision |
| A `DEFAULTS_TAKEN_ONCE` kind already defaulted on these tickets | Parks every ticket, whatever its `defaultMove`. Covers `setup-failed`, `out-of-calls`, `gate-cannot-run`, `sandbox-unavailable` |
| `ticket-park` | Parks every ticket: hold `parked:<kind>`, replacing any earlier hold; a waiting job ended `stopped`; a `parked` decision carrying the agent's questions if it has any. The Airlock then aborts a parked merge |
| `job-fresh` | Asks for a fresh agent if the job is live and not `stopping`; otherwise only closes |
| `open-quiet-job-decision` | Opens a `quiet-job` decision |
| `worktree-repair`, `gate-retry` | Only closes. No repair runs: the closure frees the ticket for its next launch, or the Airlock for its next step |
| `incident-escalate` with no questions | Only closes. Airlock-opened question incidents carry no `questions` fact, and the `merge-refused` decision already asked User |

### How an Airlock avoids waiting on a person

A conflict or a red merged tree opens no incident: it goes to the ticket's own builder or reviewer, resumed in the
Airlock, which cannot ask. An Airlock serves a whole target, so trouble that keeps the Airlock held goes to the
Assistant. A refusal, or an abort the Airlock runs itself once the agent's red handoff resumes are spent, frees the
Airlock and opens a decision for User in the same write.

- **After the default.** On a ticket's merge, `ticket-park` parks the ticket and opens its `parked` decision. In a later
  write `Airlocks` `abortParkedMerge` restores the worktree and frees the Airlock, without waiting for User.
- **The two that wait.** `setup-failed` and `gate-cannot-run` from an Airlock wait for a fresh
  Assistant session or `no-assistant`, or, while the install version differs, for `update`.

> **As built.** A refresh has no ticket, so a default parks nothing and the Airlock stays held, rerunning the gate:
> [known gap](../reference/known-gaps.md#gap-refresh-gate-default-loops).

## Quiet job detection

`IncidentRouter.createQuietJobWatch` opens a `quiet-job` incident when a job's event log stops growing. Each
[sweep](../glossary.md#sweep) of `OVERSEER_SWEEP_SECONDS` (30) compares the job's
[Watcher instance](../glossary.md#watcher-instance) and [cursor](../glossary.md#cursor) with the last.

![A strip of sweeps for one running job, each showing the count, where an event moves the cursor and resets it. At QUIET_JOB_SWEEPS the job is due: a quiet-job incident opens, its default opens a decision for User, and the due sweep restarts the count. A job still silent comes due again and opens another incident and decision, none while one is open.](../figures/questions-and-incidents/quiet-job-sweeps.png)

*A job silent for `QUIET_JOB_SWEEPS` (6) sweeps comes due, and a job still silent comes due again as often.*

This is a [clock exception](../reference/deciders-and-bounds.md#clock-exceptions). Sweeps come at an interval, so the
count is time-shaped. It is allowed because it decides nothing: it only opens an incident, whose default only asks User.

It sees a `running` `build` or `review` job whose event log stood still. A working long tool call looks the same, and
costs User a `quiet-job` decision. It cannot see:

- A session looping while it prints: any event moves the cursor.
- A job waiting for an answer, in Customs or at a gate: only `running` counts.
- The Assistant and product owners, quiet on purpose, and merge agents.
- Time across a restart: the count lives in memory, which delays an incident and never invents one.

`openQuietJobIncidents` opens none for a job with one open. The Bridge tints a quiet job through `DrivePass`
`silentSweepsOf`. The Assistant has its own watch with the same bound, `AssistantSession.createAssistantQuietWatch`,
whose outcome is ending the session.

## Invariants

1. Every incident kind has an allowed-moves row and a `defaultMove`, and an incident sent to the Assistant closes at the
   latest when its turn does, unless an Assistant going down withdraws it first.
2. An incident closes in exactly one of three ways, and leaves the board in that write.
3. `ALLOWED_MOVES_BY_INCIDENT_KIND` binds User and the Assistant alike.
4. The first answer to a decision wins; a later one is refused `decision-already-answered`.
5. A request id opens at most one decision or incident on a job, across replays and restarts.
6. An escalation puts exactly the agent's questions to User.
7. No fresh job inherits a request an ended job left open as a decision: the decision is rebound to the ticket first.
8. An open incident naming a ticket holds every launch on that ticket.
9. No incident move lands a tree no gate passed.
10. A notice is never stored and never answered.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Routing a question | `src/services/overseer/QuestionRouting.ts` | `routeOf`, `openQuestion` | `src/services/overseer/QuestionRouting.spec.ts` |
| Who may ask | `src/services/overseer/DrivePass.ts`, `src/services/overseer/WorkerProfiles.ts` | `ROLES_THAT_MAY_ASK`, `profileOf` | `src/services/overseer/WorkerProfiles.spec.ts` |
| An answer's effect on the board | `src/lib/tracker-model/AgentQuestions.ts` | `afterAnswer`, `answerIncident`, `rebindQuestionsOfEndedJob` | `src/lib/tracker-model/AgentQuestions.spec.ts` |
| Decision storage | `src/lib/tracker-model/Decisions.ts` | `Decisions` | `src/lib/tracker-model/Board.decisions.spec.ts` |
| Answer effects by kind | `src/services/control/DecisionControls.ts` | `answerDecision`, `answerPipelineProposal` | `src/services/control/DecisionControls.pipelineProposal.spec.ts` |
| What an open decision blocks | `src/lib/tracker-model/Playbook.ts`, `src/lib/tracker-model/AirlockClaims.ts` | `TICKET_HOLDING_DECISION_KINDS`, `jobAwaitsAnAnswer`, `jobResumeIsHeld`, `SLOT_HOLDING_DECISION_KINDS` | `src/lib/tracker-model/Playbook.spec.ts` |
| Delivery to a session | `src/services/overseer/AnswerDelivery.ts` | `deliverAnswers` | `src/services/overseer/CrashMatrix.spec.ts` |
| Incident storage and closes | `src/lib/tracker-model/Incidents.ts` | `Incidents` | `src/lib/tracker-model/Board.incidents.spec.ts` |
| Moves and defaults | `src/lib/tracker-model/IncidentMoves.ts` | `defaultIncident`, `parkTicket`, `DEFAULTS_TAKEN_ONCE` | `src/lib/tracker-model/IncidentMoves.spec.ts` |
| Allowed moves | `src/services/control/constants/AllowedMovesByIncidentKind.ts` | `ALLOWED_MOVES_BY_INCIDENT_KIND` | `src/services/control/Bouncer.spec.ts` |
| When a default fires | `src/lib/tracker-model/Playbook.ts` | `incidentDefaultStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| Quiet jobs and default warnings | `src/services/overseer/IncidentRouter.ts` | `createQuietJobWatch`, `defaultedIncidentsOf` | `src/services/overseer/IncidentRouter.spec.ts` |
| Notices | `src/services/overseer/DrivePass.ts`, `cli/overseer/OverseerWording.ts` | `OverseerNotice`, `noticesOf`, `noticeTextOf` | `cli/overseer/OverseerDrivePass.spec.ts` |
| Vocabulary | `src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts` | `DECISION_KINDS`, `INCIDENT_KINDS`, `INCIDENT_MOVES` | `src/lib/tracker-model/Playbook.spec.ts` |
