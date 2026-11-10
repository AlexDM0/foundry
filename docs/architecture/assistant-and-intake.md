# The Assistant and intake

> **Question:** Which two sessions serve the board itself, how long does each live, and why can neither do lasting harm?
> **Time:** 12 minutes.
> **Read first:** [Overview](../concepts/overview.md), [Glossary](../glossary.md).
> **Next:** [Questions and incidents](questions-and-incidents.md), [Control and the Hatch](control-and-hatch.md),
> [State machines](../data-model/state-machines.md).

## In one screen

Two agent [sessions](../glossary.md#session) work on the [board](../glossary.md#board) rather than on a
[ticket](../glossary.md#ticket), and hold no [launch slot](../glossary.md#launch-slot). Unlike a build or review job,
each waits for more after a turn, until the [Overseer](../glossary.md#overseer) closes its input. Board changes go
through the [Bouncer](../glossary.md#bouncer). The [product owner](../glossary.md#product-owner) may also ask User, as
a [decision](../glossary.md#decision); the [Assistant](../glossary.md#assistant) may not.

The Assistant takes the [incidents](../glossary.md#incident) the Overseer's code cannot settle alone. It is disposable:
its memory is the board. Every incident has a default, so no turn can leave one open and a missing Assistant never
holds an [Airlock](../glossary.md#airlock). One that holds no Airlock waits for a session, and its ticket with it.

Readying moves a [draft ticket](../glossary.md#draft-ticket) to `pending`, where the Overseer may build it. A
[finding](../glossary.md#finding) is a low ticket a worker files. It waits for the ticket that found it to land, and the
Assistant never handles it.

The product owner turns User's requests into draft tickets, in a conversation that lasts as long as User needs. It
files and never readies: User decides which of its draft tickets get built.

![The Overseer sends an incident to the Assistant, and User's request starts a product owner. Each session writes only its session folder and its Hatch folder, and each files board changes through the Hatch to the Bouncer: incident moves for the Assistant, filing work for the product owner. Every other command that changes the board is refused. Only the product owner may also ask User, which opens a decision.](../figures/assistant-and-intake/two-sessions.png)

*Notice that neither session has a direct path to the board or to git: the worst either can do is what its role's
Bouncer branch admits. Only the product owner can also ask User.*

## The two sessions side by side

The sessions differ because their failure costs differ. Losing an Assistant loses nothing the board does not hold.
Losing a product owner loses a conversation with User, so it resumes.

| | Assistant | Product owner |
| --- | --- | --- |
| [Job kind](../glossary.md#job-kind) and role | `assistant` | `product-owner` |
| Started by | the [Playbook](../glossary.md#playbook), whenever none is live (`boot-assistant`) | User, `forge intake -- <text>` or the [Bridge](../glossary.md#bridge)'s Intake view |
| How many | one | several at once |
| May ask User | no, `AskUserQuestion` is off | yes, as a decision |
| After a crash | ended and replaced, never resumed | resumed by session id, then replaced past `JOB_RESUMES_BEFORE_FRESH` (2) |
| Ends | `closed` at the context limit or on User's `job stop` (`stopped` if it has no session yet), `replaced` or `failed` when down | `closed` once its input is closed and its [Watcher](../glossary.md#watcher) is gone, or `replaced` |

What a role reads and how a launch is put together is in [Roles and launch](roles-and-launch.md). The enforced profiles
are in [Confinement](confinement.md).

An `forge-orchestrate` session is neither of these: it is User's own
[orchestrator](../glossary.md#orchestrator) session, not a job, see [Running a board](../operations/running-a-board.md).

## The Assistant

### Turns are numbered, and the n-th `result` closes chat n

The Overseer counts instead of listening for a state. Every chat to the Assistant has a number, the first message being
chat 1. A session writes a `result` event when it finishes a turn, and `readingOf` counts those events in the session's
[event log](../glossary.md#event-log). The Assistant is idle when its [job](../glossary.md#job) is `running` and it has
at least as many results as its newest chat number.

![Session J7 takes chats 1, 2 and 3. Result 2 closes chat 2 and its open incident defaults with cause turn-closed. Chat 3 reaches its call budget, so the Overseer writes the interrupt line and its open incident defaults with cause turn-budget, and the session goes on. Past the context limit the idle session has its input closed. Fresh session J9 goes down mid-turn, so its incident I4 is withdrawn. Fresh session J11 receives I4 again in its chat 1.](../figures/assistant-and-intake/assistant-turns.png)

*Notice that every line of work ends and the board below stays. Nothing a session knew is needed by the next one.*

The Overseer writes to the Assistant only when it is idle, which until a wind-down means never mid-turn. Two writes
ignore the idle test and carry no number: the budget's interrupt line, and the wind-down line of User's
`job wind-down <J>`.

| What happens | What the Overseer does |
| --- | --- |
| Idle, and an incident is undelivered | marks every undelivered incident delivered in the next chat number and writes them as one chat |
| The n-th `result` of the session | closes chat n: every incident delivered in it and still open takes its default, cause `turn-closed`, which for an agent's question is [a decision for User](questions-and-incidents.md) |
| The open turn reaches `ASSISTANT_TURN_CALL_BUDGET` (40) top-level assistant messages | writes the interrupt line once and the session lives on; the turn's open incidents default, cause `turn-budget` |
| Idle, and the newest `result` reports at least `ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH` (200000) context tokens | moves the job `stopping` and closes its input; it ends `closed` and a fresh one boots |
| User's `job message <J>` | sends it as the next numbered chat at the next idle point |
| Its job is in state `interrupted`, or its event log stands still mid-turn for `QUIET_JOB_SWEEPS` (6) sweeps | ends the job, withdraws what it was delivered, sends its Watcher a stop, boots a fresh one |

> **As built.** A usage marker whose reset time has passed stops idle delivery to a running Assistant. See
> [the known gap](../reference/known-gaps.md#gap-stale-usage-marker-stops-delivery).

Each chat survives a restart without being sent twice. `deliverChats` records the chat list in the job folder before it
sends a line, and a marker per chat makes each send one-shot.

A wind-down's `result` counts like any other, so the count runs ahead of the chats for the rest of the session.

![Chats 1 and 2 each get a result, so the count reads 1 then 2. The wind-down line has no chat number but its result counts, so the count reads 3. Chat 3 is sent with the count already at 3, so it closes on sending and its incident defaults with cause turn-closed.](../figures/assistant-and-intake/wind-down-count.png)

*Notice that the count rises with no chat to match it, and that nothing brings it back.*

> **Careful.** After a wind-down, a later chat closes on the `result` before its own, usually once it is sent. Its
> incidents take their default at the next Pass, whatever the session does with the chat. The session also counts as
> idle while it works, so the next chat can reach it mid-turn and the quiet watch no longer sees it.

### A move beats the default for its turn

![Two runs of one Pass. The Pass reads the result count, reads the Hatch folders, then in the lock hold applies the moves and closes the turn. If the result was written before the count read, the move was written earlier still, so it is applied first and the close finds the incident settled. If the result comes after the count read, this Pass leaves the turn open and the next Pass closes it.](../figures/assistant-and-intake/move-beats-default.png)

*Notice that the result is the later write and the earlier read, so no Pass sees a close without its move.*

`resources/templates/AssistantBrief.md` tells the session that a move printing `queued` counts as taken: the
[Hatch](../glossary.md#hatch) has accepted the request, and the [Pass](../glossary.md#pass) applies it before it closes
the turn. The read order of a whole Pass is in [The Pass](the-pass.md).

### The board is its memory

`assistantTextOf` builds chat 1 from the board:

- every open incident not yet delivered, which includes those withdrawn from a session that went down;
- the newest `ASSISTANT_HISTORY_RECORDS` (20) log records that name an incident;
- a board summary: ticket counts by status, the live jobs, the open decision count.

When a session goes down, a move it made is already on the board and a move it did not make is still an open incident.
At the context limit its turns have all closed, so each incident is settled or defaulted. Neither case needs the
session's memory, so `resources/templates/AssistantBrief.md` tells each session "The board is your memory". It reads
the rest with `forge incidents` and `status`.

### Down and replaced

Any interruption of an Assistant ends it: a lost Watcher, a crashed session, a reboot, a usage limit. So does standing
still mid-turn. `endDownAssistants` withdraws its deliveries and ends the job with cause `assistant-down`. The outcome
is `failed` before its first `result` and `replaced` after it, because only a session that never answered counts against
the boot bound, `FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING` (2).

The Assistant has no off switch. `job stop --all` skips its kind, and a paused Overseer still boots one. User's
`job stop <J>` ends one session and a fresh one boots, but it withdraws nothing.

> **Careful.** What that session was delivered and left open takes its default, cause `turn-closed`, and never reaches
> the fresh session. An Airlock-holding kind defaults earlier, cause `no-assistant`, once the job is `stopping`.

### When no Assistant can come up

The board keeps moving without one. An incident that holds an Airlock never waits. The others wait only while a boot is
still possible or the [install version](../glossary.md#install-version) has changed.

| Situation | Boot | Open incidents |
| --- | --- | --- |
| A usage limit holds | none until it lifts | every one defaults, cause `no-assistant`; none is delivered |
| `FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING` (2) boots failed back to back and no session has answered | once per [sweep](../glossary.md#sweep), never in the Pass a boot failed | every one defaults, cause `no-assistant` |
| The install version changed | none | every one waits |
| An Assistant is booting or closing, so no job is `running` | once that job has ended | every one waits for the next session's chat 1, or for the booting session's next idle point |

No incident kind holds an Airlock on a session: a conflict or a red merged tree goes to the ticket's own agent, never
to an incident. Incident kinds and their moves are in
[Life of an incident](questions-and-incidents.md#life-of-an-incident), their defaults in
[What each default does](questions-and-incidents.md#what-each-default-does).

## The findings path

A finding is a low ticket a worker files beside its work. It is found against code that exists only on the branch of
the ticket that found it, its finder, so it waits for that ticket: it builds only after the finder lands, against the
finder's code. No incident carries it and the Assistant never routes it.

![A worker files a low ticket through its Hatch and the Bouncer admits it with the job's tickets as its finders. The ticket gets its finders in dependsOn and joins the first finder's group. With ticket review off a complete finding is pending and waits for its finders; with ticket review on it goes to ready-for-review for User. An incomplete one stays a draft ticket. When a finder is reviewed or delivered the finding can build; when a finder is abandoned the finding loses that dependency and an unstarted one goes to ready-for-review.](../figures/assistant-and-intake/findings-path.png)

*Notice that no finding builds before its finder is `reviewed` or `delivered`, and none waits on an abandoned one.*

A [builder](../glossary.md#builder), [reviewer](../glossary.md#reviewer) or merge-gate fixer files through its Hatch, at
most `WORKER_FILINGS_PER_JOB` (10) per job. The filing must be `--priority low` and carry no model, effort, group,
dependency, epic or network. `workerVerdictOf` stamps `filedByJob` and the job's tickets as `finderTicketIds`.

`addTicket` adds the finders to the finding's `dependsOn` and puts it in the first finder's group, if one has a group.
It then submits the finding like any draft ticket, in the same hold: with the ticket review switch off a complete
finding is `pending`, and the [Playbook](../glossary.md#playbook) starts no build for it until each finder is
`reviewed` or `delivered`; with the switch on it is `ready-for-review`, where User readies it. An incomplete finding
stays a draft ticket.

`Findings.releaseFindingsOfAbandoned` runs in the lock hold that abandons a ticket. Each open finding that one of the
ticket's jobs filed and that waits on it loses that dependency, and one not yet started moves to `ready-for-review`,
whatever the switch says, so User decides whether it still applies.

### First-run leftovers

The first Overseer start puts low tickets left by an earlier install before User, so none builds unreviewed.
`submitFirstRunLeftovers` moves every unheld low `pending` ticket to `ready-for-review`, whatever the ticket review
switch says. The test is the board's first start, not the ticket's origin, so a low ticket readied before the first
start on any board moves too. A board with a recorded Overseer start skips all of this.

## Product-owner intake

The product owner is the path from a sentence of User's to a ticket a builder can start without asking. It follows
the filing procedure in `skills/agent-po/SKILL.md`, installed as the skill `forge-po`; this section covers what the
Overseer does around it.

![User asks for work and the Overseer launches a session. The session files draft tickets, which the Bouncer admits; a ticket ready from it is refused. The session closes intake, and the Overseer ends the job and opens a ready-drafts decision. User picks a set, which moves those draft tickets to pending in the answering lock hold, with or without a running Overseer, or None, which leaves them draft tickets User can ready later.](../figures/assistant-and-intake/intake-to-ready.png)

*Notice that nothing reaches `pending` here except through User's answer.*

### Starting and talking

`intake -- <text>` records a job in state `launching`, which needs no running Overseer, and the Overseer launches it
when it next runs a Pass. The first message is `/forge-po <text>`. A `result` ends a turn and leaves the session
waiting on its open input. User's `job message` goes out as a new turn straight away, with no idle test: unlike the
Assistant, this session has nothing to number.

A question from `AskUserQuestion` opens a decision for User, and the job waits in `waiting-for-answer`. The routing is
in [Questions and incidents](questions-and-incidents.md).

### Filing drafts

A [filing draft](../glossary.md#filing-draft) is the working record behind a filing, so another session can resume it.
It produces draft tickets and is not a ticket. Its states and its claim are in
[State machines](../data-model/state-machines.md).

### Closing

Closing ends the session and opens the `ready-drafts` decision for User. The session runs `intake close --set <id,id>`,
naming no job because the Bouncer fills in its own. Each `--set` proposes one group of draft tickets to ready together,
stored as `proposedDraftSets` on the job. User can close it with `intake close <J>` or the Bridge's Close intake button.
`job stop` closes it too, and also withdraws its open questions.

Closing moves the job to `stopping`, and the Overseer closes its input. Once no Watcher of the job is live,
`endClosedIntakes` ends it `closed` and opens the decision in the same lock hold.

> **Why.** The decision opens after the session ends, so a draft ticket filed in its last turn is on it.

### The `ready-drafts` decision

`readyDraftsDraftOf` lists every draft ticket the intake filed, across the sessions that took it over, except those
offered before a reopening. With none, nothing opens.

![Two examples over draft tickets 101, 102 and 103, where 103 is incomplete. With sets 101,103 and 102, the completeness filter trims the first set and leaves the options 101 and 102. With only the set 103, no set survives, so one option covers every complete draft ticket, 101 102. Both times 103 is listed as not readiable, and None is always offered.](../figures/assistant-and-intake/ready-drafts-options.png)

*Notice that a set never offers an incomplete draft ticket, whatever the session proposed.*

Each proposed set keeps only its complete draft tickets and an emptied set is dropped; with no set left, or none
proposed, one option covers every complete draft ticket.

Complete means a numbered [Acceptance](../glossary.md#acceptance) and a [Brief](../glossary.md#brief). The incomplete
draft tickets are listed in the decision's context as not readiable.

The answer readies the tickets its option names, in the answering lock hold, and only listed draft tickets that are
still complete. "None" leaves them in the Kanban's Drafts group, where User can ready them later with `ticket ready`.

> **Careful.** A User running `skills/agent-po/SKILL.md` in their own session is a different case: no job, no Hatch, no
> Bouncer. That session asks "Ready these to build?" and runs `ticket ready` on User's yes.

### Reopening

A message to a closed product owner reopens it. `messageJob` brings the same job id back to `running` on a new
[Watcher instance](../glossary.md#watcher-instance), resuming its session with the text as its first line. It records
every ticket the intake filed so far as offered, so its next `ready-drafts` lists only tickets filed after that. A job
that ended any other way refuses the message. The reopening message replaces the stored intake text and clears the
proposed sets.

### Crash and refresh

An intake conversation survives a reboot if the vendor takes the resume. An interrupted product owner resumes by session
id once any open question is answered, and only a crash counts toward the bound, `JOB_RESUMES_BEFORE_FRESH` (2).

If the vendor refuses the resume, the intake ends. The session exits without starting, so `JobResumption.resumeFailed`
holds, and the job ends `replaced` with cause `resume-failed` and a `resume-failed` incident.

> **Careful.** That incident's default, `job-fresh`, finds no job left, so no fresh session comes and no `ready-drafts`
> opens. A message to the job is refused. Its draft tickets stay in the Kanban's Drafts group for User.

![An interrupted product owner resumes by session id once any open question is answered, and each crash counts one. If the vendor refuses the resume, the job ends replaced with cause resume-failed, no ready-drafts opens and the draft tickets stay in the Drafts lane. Another crash past JOB_RESUMES_BEFORE_FRESH ends the resuming: with a question open the job waits in awaiting-answer and refreshes once answered, and with none it refreshes at once.](../figures/assistant-and-intake/intake-crash-ladder.png)

*Notice that `awaiting-answer` is the same wait as `waiting-for-answer` with no session running, and that it ends in a
refresh, never a resume.*

`refreshIntake` ends the job `replaced` and launches a new job whose `parentJobId` names it and whose
[attempt](../glossary.md#attempt) number is one higher. Its first message holds the intake text, the draft tickets the
intake filed that are still draft (`draftsFiledByIntakeOf`) and the answers User gave the session it replaces
(`carriedAnswers`). After a reopening, that text is the reopening message, not the original request. The chain of
parents is how the final `ready-drafts` finds every draft ticket. The job states are in
[State machines](../data-model/state-machines.md).

> **Careful.** Only the replaced session's answers carry, so a second refresh loses the answers given before the first.

![One intake across three runs. J4 files 101 and 102 and closes, and ready-drafts lists both. A job message reopens J4 on a new Watcher instance and records 101 and 102 as offered. J4 files 103, goes over the crash bound and ends replaced. J6, with J4 as its parent, files 104 and closes, and ready-drafts lists only 103 and 104.](../figures/assistant-and-intake/intake-chain.png)

*Notice that the chain finds #103 from an earlier job, and `offeredTicketIds` keeps #101 and #102 off the second
decision.*

## What each session may do through its Hatch

Neither session can harm the board lastingly: it [writes only its own folders](confinement.md), and every board change
goes through the Bouncer, which admits only incident moves or filing work for its role. The product owner's question
to User opens a decision and moves nothing. No incident move merges. The limit covers the board and writes, not reads
of machine secrets.

The Bouncer takes a request's role from the Hatch folder's job record, so a session cannot claim another role. The
contract, the verbs and the refusal reasons are in [Control and the Hatch](control-and-hatch.md). Read-only commands
need no Hatch.

| Session | Admitted | Every other change |
| --- | --- | --- |
| Assistant | the moves an incident's kind allows, naming `--incident <I>`, on an incident delivered to this job | refused `incident-move-not-allowed` |
| Product owner | `ticket add`; `ticket depends` on any ticket, so it can change what a live ticket waits for; `epic add`; the `draft` verbs; `intake close`; `intake title` | refused `command-not-allowed-for-role` |
| Product owner, own draft tickets only | `ticket edit`, `priority`, `network`, `epic`, `abandon`, while its status is `draft` | refused `not-own-draft` |

So the Assistant cannot file a ticket, change a priority, abandon or waive, answer User's decisions or change a setting.
The product owner cannot ready, start or merge anything, and its filings reach only `draft`.

> **As built.** A move that carries a `jobId`, such as `job fresh` or `gate retry`, is refused at the Hatch before the
> Bouncer reads it, so the Assistant settles those incidents another way or by their default. See
> [the known gap](../reference/known-gaps.md#gap-assistant-job-moves-refused-at-hatch).

> **As built.** These two sessions run a weaker profile than a builder's: their limits cover writes, not reads of
> machine secrets. See [the known gap](../reference/known-gaps.md#gap-session-profiles-weaker).

## Invariants

1. Every incident has a default, and a delivered incident left open takes it when its turn closes.
2. A move queued before a `result` is applied before the default for that turn is considered.
3. The Overseer writes to a `running` Assistant only when it is idle, except for the budget's interrupt line and the
   wind-down line of a `job wind-down`.
4. An Assistant is never resumed; what one that went down was delivered is withdrawn, and either a fresh
   session receives it or it takes its default when no session can come up.
5. A `result` never ends an Assistant or a product owner.
6. Under the Overseer, no product-owner session readies a ticket. The Bouncer admits no `ticket-ready` for its role.
7. A worker's finding builds only after each finder is `reviewed` or `delivered`, and no finding waits on an abandoned
   finder.
8. A `ready-drafts` answer readies only tickets the decision lists that are still complete draft tickets.

## In the code

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| Turn numbering, idle test, delivery | `src/services/overseer/AssistantSession.ts` | `readingOf`, `isIdle`, `deliverIncidentsWhenIdle`, `deliverChats` | `src/services/overseer/AssistantSession.spec.ts` |
| Down and replaced | `src/services/overseer/AssistantSession.ts` | `endDownAssistants`, `createAssistantQuietWatch` | `src/services/overseer/AssistantSession.spec.ts` |
| Boot and first message | `src/services/overseer/AssistantBoot.ts`, `cli/overseer/OverseerWording.ts` | `deliverOpenIncidentsAtBoot`, `assistantFactsOf`, `assistantTextOf` | `src/services/overseer/AssistantBoot.spec.ts` |
| When to boot and default | `src/lib/tracker-model/Playbook.ts` | `nextStepsOf`, `incidentDefaultStepsOf`, `failedAssistantBootsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| Findings | `src/services/control/TicketControls.ts`, `src/lib/tracker-model/Findings.ts` | `addTicket`, `releaseFindingsOfAbandoned` | `cli/HatchUnderJob.spec.ts`, `src/lib/tracker-model/Findings.spec.ts` |
| First-run leftovers | `src/lib/tracker-model/Findings.ts` | `submitFirstRunLeftovers` | `src/lib/tracker-model/Findings.spec.ts` |
| Role admission | `src/services/control/Bouncer.ts` | `workerVerdictOf`, `productOwnerVerdictOf`, `assistantVerdictOf` | `src/services/control/Bouncer.spec.ts` |
| Intake end | `src/services/overseer/IntakeSessions.ts` | `endClosedIntakes`, `intakeFactsOf`, `productOwnerProfileOf` | `src/services/overseer/CrashMatrix.spec.ts`, `cli/overseer/OverseerWording.intake.spec.ts` |
| Intake on the board | `src/lib/tracker-model/JobControls.ts` | `closeIntake`, `readyDraftsDraftOf`, `messageJob`, `refreshIntake` | `src/services/control/JobControls.spec.ts` |
| Crash bound | `src/lib/tracker-model/Playbook.ts` | `productOwnerStepsOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| Refused resume | `src/services/overseer/JobResumption.ts` | `resumeFailed`, `applyResumeFailure` | `src/services/overseer/CrashMatrix.spec.ts` |
| Readying from the answer | `src/services/control/DecisionControls.ts` | `answerDecision` | `src/services/control/JobControls.spec.ts` |
| Filing drafts | `src/lib/tracker-model/Drafts.ts` | `claimDraft`, `closeDraft`, `draftStateOf` | `cli/drafts/DraftCommand.spec.ts` |
