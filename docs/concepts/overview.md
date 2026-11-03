# The system in twenty minutes

> **Question:** What are the moving parts, who decides what, and what ideas does everything else rest on?
> **Time:** 20 minutes.
> **Read first:** nothing; words link to [the glossary](../glossary.md).
> **Next:** [One ticket, draft to merged](ticket-lifecycle.md), [Walk a ticket](../interactive/ticket-journey.html),
> [The documentation map](../README.md).

## In one screen

agent-progress-v2 turns [tickets](../glossary.md#ticket) on a [board](../glossary.md#board) into code merged on the
[main line](../glossary.md#main-line), using parallel AI agents, each in its own [worktree](../glossary.md#worktree).
Such agents need something that does not take their word for it. The first version (v1) let an
[orchestrator](../glossary.md#orchestrator) session drive; here code owns each ticket's path from ready to merged: one
[Overseer](../glossary.md#overseer) per board launches every agent, checks what it left and decides what comes next.

Six ideas carry the rest of the documentation:

1. **One driver.** Only the Overseer launches, stops and lands. Everyone else records a fact.
2. **Agents report, code decides.** A [report](../glossary.md#report) is a claim, checked against git.
3. **Three stores.** Board and [log](../glossary.md#log) commit together; [job](../glossary.md#job) folders track steps.
4. **Two lifetimes.** A [Watcher](../glossary.md#watcher) outlives its Overseer, so a code update kills no agent.
5. **An [Airlock](../glossary.md#airlock) tests the [target](../glossary.md#target) merged into the ticket's
   branch** and lands it only if the target has not moved. Done means merged.
6. **Trouble goes three ways.** A [decision](../glossary.md#decision) waits for User, an
   [incident](../glossary.md#incident) goes to the [Assistant](../glossary.md#assistant) session and always ends, a
   [notice](../glossary.md#notice) is shown and nobody answers it.

![User works through terminal verbs, which record directly in the data folder, and through the Bridge, which sends
commands to the one Overseer and receives live state. The Overseer reads and writes the data folder, lands on git and
spawns detached Watchers. Each Watcher runs one agent or gate and reports only through its event log, and the pair
outlives the Overseer. The Overseer also takes shared limits from the monitor folder, and the agent commits on its
worktree.](../figures/overview/system-topology.png)
*Only the Overseer launches and lands; a verb only records in the data folder, and the dashed box does not depend on
the Overseer.*

## One driver

The Overseer is the only thing that moves work forward. It runs one serial loop, the
[Pass](../glossary.md#pass): observe outside the [tracker](../glossary.md#tracker) lock, change the board in one
[lock hold](../glossary.md#words-that-mean-several-things), then act. Launching a job, delivering a stop request and
landing on a target all happen inside the Pass, and nowhere else.

A CLI verb or a button in the [Bridge](../glossary.md#bridge), the browser page the Overseer serves, records a fact: a
ready ticket, an answer, a stop request. It launches no agent and signals no job, and the next Pass reads the fact and
acts on it. `worktree repair` also runs its git step inside the lock hold, and `oversee stop|restart` act on the
Overseer process, not the board.

Every control command takes one code path, whether it arrives from a verb, an agent's request or the API. Verbs with
no control command, such as `ticket status` and `log`, write the board directly under the same tracker lock.

That split is why the terminal keeps working with the Overseer down. A verb writes the board itself, then nudges the
Overseer if one is live, and the fact waits for the next Pass. The Bridge is different: the Overseer serves it, so its
buttons need a live Overseer.

![Time runs down in two panels. With the Overseer up, a terminal verb records a fact on the board and nudges the
Overseer, and the next Pass reads the fact and acts. With the Overseer down, the verb records the same fact, nobody
drives while it waits, and the first Pass after the Overseer starts reads it and acts.
](../figures/overview/record-now-act-later.png)
*The two panels differ only in the wait: the verb and the Pass do the same thing in both.*

Which verb takes which route lives in [control and the Hatch](../architecture/control-and-hatch.md).

> **Why.** A control that only records cannot race the driver. The two meet at the tracker lock, and the Overseer
> sees every change as input to its next Pass.

## Agents report, code decides

An agent [session](../glossary.md#session) works in its worktree, commits and ends with a report. Nothing in that
report is taken as true. [Customs](../glossary.md#customs) checks it against git and the ticket,
[gates](../glossary.md#gate) run on the worktree, and the [Playbook](../glossary.md#playbook) picks the next step.

![An agent session leaves commits, a report and Hatch requests on the untrusted side of a line. Customs reads the
commits and report against git and the ticket, and gates run. The Pass takes their verdict and the Playbook's next
steps and writes status, Handoff and Review text to the board in one lock hold. A Hatch request reaches the board only
through the Bouncer.](../figures/overview/agents-report-code-decides.png)
*No arrow from the left reaches the board without passing code on the right.*

Code also writes the words a later reader trusts. A ticket's [`## Handoff`](../glossary.md#handoff) comes from a
verified report, after the gate passes, and each `## Review <round>`, one per [review
round](../glossary.md#review-round), comes from `ReviewOutcome`. A [builder](../glossary.md#builder) never edits its
ticket.

An agent that needs the board goes through its [Hatch](../glossary.md#hatch), a request folder the Overseer reads. The
[Bouncer](../glossary.md#bouncer) judges each request against the job's [role](../glossary.md#role), taken from the
folder and never from the request.

> **As built.** [Merge agents](../glossary.md#merge-agent), which work inside an Airlock, do not pass the full Customs
> run; a resolver's merge gets check V10 alone:
> [known gap](../reference/known-gaps.md#gap-merge-agents-skip-customs).

## Three stores, one transaction

The board says what is decided, the log says what happened, and a job folder says how far a step got. A restart reads
all three. The Playbook is pure: it takes the stores plus what the Pass observed (git, the install, the [usage
marker](../glossary.md#usage-marker)) and calls no clock; the one time comparison is the vendor's usage reset, listed
with the other [clock exceptions](../reference/deciders-and-bounds.md).

![The board says what is decided now, the log says what happened and is read back for retry and failure limits, and
both commit in one lock hold with the log written last. The job folder says how far a step got and is written outside
the journal. The Pass reads all three, so the same inputs give the same steps.
](../figures/overview/three-stores.png)
*The log is an input, not a history: limits such as how many times a ticket may fail are counted from it, so a restart
cannot reset them.*

A lock hold writes the board and the log as one transaction, so no log line describes an unstored change. A job folder
sits outside that transaction, and its [markers](../glossary.md#marker) make each step safe to derive again. The rules
live in [storage](../data-model/storage.md), the entities in [entities](../data-model/entities.md).

## Two lifetimes

A dead Overseer costs time, never an agent. The Overseer spawns each Watcher detached, and the Watcher runs one agent
or gate as its own child. A Watcher does not know an Overseer exists: it writes its job folder and keeps going.

![Overseer generation 1 dies and generation 2 starts after a gap. The Watcher and the agent run unbroken while the
event log fills. The stored cursor stands still in the gap and catches up in the first Pass of generation 2.
](../figures/overview/two-lifetimes.png)
*Recovery is no special mode: the next Pass reads past a stored cursor, like any other Pass.*

The Overseer is a single point of progress, never of state. A Watcher appends every event to the [event
log](../glossary.md#event-log) in its job folder. While the Overseer is down, a report or a question waits there. Each
job on the board stores a [cursor](../glossary.md#cursor), the last event the Overseer applied, and the lock hold that
applies an event also moves the cursor, so each event applies once. The [Baton](../glossary.md#baton) keeps one
Overseer per board, and each starting Overseer runs [Regrouping](../glossary.md#regrouping) once, before its first Pass.

An update follows the same logic. A [Baton pass](../glossary.md#baton-pass) replaces the Overseer's code and touches
no Watcher. [Failure and recovery](../architecture/failure-and-recovery.md) covers each crash.

## An Airlock gates the merged tree

A green branch proves little about the tree it lands in. So each target has one Airlock, and it merges the target
into the ticket's branch, gates that merged tree, and lands only if the target has not moved.

![The Airlock merges the target's tip into the ticket's branch and gates the merged tree. Red gates land nothing. Green
gates lead to one lock hold that compares the target's tip with the tip it merged. If the tip is the same the target
fast-forwards and the ticket has landed; if it moved, nothing lands and the ticket stays unmerged.
](../figures/overview/airlock-gates-the-merged-tree.png)
*The comparison and the fast-forward are one compare-and-swap, made inside a lock hold.*

Done means merged. Through the Overseer, the only route to [`delivered`](../glossary.md#delivered) is a landing on the
main line. `ticket deliver --by-hand` and the `ticket status` override record the status without checking git: see
[the CLI reference](../cli.md). A ticket in a [group](../glossary.md#group) lands `reviewed` on its group branch, and
its [release](../glossary.md#release-bundle) delivers the bundle. The phases live in [Airlocks and
groups](../architecture/airlocks-and-groups.md).

> **Careful.** The merged-tree gate runs inside the Overseer, not under a Watcher, so an Overseer death loses the result
> and the next Overseer gates the tree again.

> **As built.** No Pass runs while that gate runs:
> [known gap](../reference/known-gaps.md#gap-merge-gate-blocks-pass).

## Trouble goes three ways

What code cannot settle alone goes to whoever must act. The audience sets the kind, and the kind sets what happens if
nobody acts.

![The Overseer sends trouble three ways. A decision is User's and waits for the first answer. An incident is the
Assistant's and ends by a move or its default. A notice is shown, never stored, and nobody answers it. An incident can
escalate to a decision; no decision becomes an incident.](../figures/overview/trouble-three-ways.png)
*Every incident ends: if the Assistant makes no move, runs out of its [call budget](../glossary.md#call-budget) or is
absent, the incident's default move applies.*

Decisions and incidents are stored; a notice is derived afresh each Pass. The kinds and their moves live in [questions
and incidents](../architecture/questions-and-incidents.md).

> **As built.** Answering a `parked` decision leaves the [ticket hold](../glossary.md#hold) in place:
> [known gap](../reference/known-gaps.md#gap-answering-parked-does-not-unhold). The Assistant cannot make moves that
> target a job: [known gap](../reference/known-gaps.md#gap-assistant-job-moves-refused-at-hatch).

## The cast

Twelve names, each with one purpose. Each row links its home. The figure shows what kind of thing each name is;
[the glossary](../glossary.md) maps the path one ticket takes through them.

![The Overseer is one process, and the Pass, Playbook, Customs, Airlock, Bouncer and Regrouping are code inside it. A
Watcher is a process of its own, and the Assistant is an agent session under one. The Bridge is a page in the browser,
the Baton a numbered record and the Hatch a request folder.](../figures/overview/cast-by-kind.png)
*The Overseer and the Watcher are the only long-running processes of this project; the Assistant is a session a
Watcher runs as its child.*

| Name | What it is | Home |
| --- | --- | --- |
| Overseer | The one process per board that drives everything | [The Pass](../architecture/the-pass.md) |
| Watcher | A detached process that runs one agent or gate and logs every line | [Watchers](../architecture/watchers.md) |
| Pass | The Overseer's serial loop: observe, lock hold, act | [The Pass](../architecture/the-pass.md) |
| Playbook | Pure policy: facts in, next steps out | [The Pass](../architecture/the-pass.md) |
| Hatch | The request folder through which a session reaches the Overseer | [Control and the Hatch](../architecture/control-and-hatch.md) |
| Customs | Checks what a session left against git, the ticket and the report | [Customs and gates](../architecture/customs-and-gates.md) |
| Airlock | One merge at a time per target: merge, gate, land | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| Assistant | The session that takes incidents; it writes no code | [Assistant and intake](../architecture/assistant-and-intake.md) |
| Baton | The numbered record saying which Overseer owns the board | [Baton](../architecture/baton.md) |
| Regrouping | What a starting Overseer does before its first Pass | [Failure and recovery](../architecture/failure-and-recovery.md) |
| Bouncer | The role table judging every Hatch request | [Control and the Hatch](../architecture/control-and-hatch.md) |
| Bridge | The live page the Overseer serves on `127.0.0.1` | [Bridge](../architecture/bridge.md) |

## What this is not

| It is not | What is true instead | Evidence |
| --- | --- | --- |
| Event sourced | `progress.json` is read as current state; the log feeds counts and is never replayed into state | `openBoard` in `src/services/tracker/TrackerPipeline.ts` |
| Self-restarting | The Overseer never restarts itself; an install change stops launches until `agent-progress-v2 oversee restart` or `agent-progress-v2 update` runs a Baton pass | `src/services/overseer/InstallChangeWatch.ts` |
| A machine-wide service | One Overseer per board; [`<monitor>`](../glossary.md#reading-names) is shared files, with no process behind them | `src/services/overseer/GateRunSlots.ts`, `setup.sh` |
| A static page | Nothing renders one: `progress.html` is a stub naming the live URL or saying the Overseer is down | `cli/WriteProgressPageStub.ts`, `cli/tracking/open/OpenCommand.ts` |

## The naming trap

v2 runs beside the released v1 program under names of its own. The program is `agent-progress-v2`, and its data
folder, `<data>`, is `.agent-progress-v2/`; `PRODUCT_NAMES` holds every such name. The `agent-progress:managed` block
in `CLAUDE.md` is the released program's v1 install, so its commands, paths and workflow do not describe v2.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Recording a fact | `src/services/control/ControlService.ts` | `ControlService.apply` | `cli/ControlContract.spec.ts` |
| A verb with no Overseer | `cli/OpenTrackerForWriting.ts` | `openTrackerForWriting` | `src/services/control/JobControls.spec.ts` |
| The loop | `src/services/overseer/DrivePass.ts` | `createDrivePass` | `src/services/overseer/CrashMatrix.spec.ts` |
| Next steps | `src/lib/tracker-model/Playbook.ts` | `Playbook` | `src/lib/tracker-model/Playbook.spec.ts` |
| Checking a report | `src/services/lifecycle/Customs.ts` | `VerificationCheck` | `src/services/lifecycle/Customs.spec.ts` |
| Code-written Handoff | `src/services/overseer/JobLaunch.ts` | `bodyWithHandoffOf` | `cli/overseer/OverseerBuildJob.spec.ts` |
| The one transaction | `src/services/tracker/TrackerPipeline.ts` | `writeTracker` | `src/services/tracker/HoldJournal.spec.ts` |
| A Watcher | `src/lib/watcher/Watcher.ts` | `runWatcher` | `src/lib/watcher/Watcher.protocol.integration.spec.ts` |
| Compare, then land | `src/services/lifecycle/Landing.ts` | `Landing` | `src/services/lifecycle/Landing.integration.spec.ts` |
| Trouble's three kinds | `src/lib/tracker-model/IncidentMoves.ts`, `src/services/overseer/DrivePass.ts` | `defaultIncident`, `OverseerNotice` | `src/lib/tracker-model/IncidentMoves.spec.ts` |
| The twelve names | `src/ComponentNames.spec.ts` | `RETIRED_NAMES` | `src/ComponentNames.spec.ts` |
| Every product name | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `cli/ProductNameIsolation.integration.spec.ts` |

## Now try it

[One ticket, from draft to merged](ticket-lifecycle.md) shows the six ideas acting on one ticket.
[Walk a ticket](../interactive/ticket-journey.html) steps through it, one branch at a time.
