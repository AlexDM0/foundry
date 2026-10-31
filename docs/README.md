# The documentation map

> **Question:** Given what I need right now and the time I have, which page do I open?  
> **Time:** 2 minutes to find a page.  
> **Read first:** nothing; the [README](../README.md) says what the project is.  
> **Next:** [Overview](concepts/overview.md), [Getting started](operations/getting-started.md),
> [Runbook](operations/runbook.md).

## In one screen

If something is wrong right now, start here.

| What is happening | Open |
| --- | --- |
| A [ticket](glossary.md#ticket) is not moving | [One ticket will not start](operations/runbook.md#one-ticket-will-not-start), or the lab [Why is my ticket not moving?](interactive/why-not-moving.html), with [Not moving](operations/runbook.md#not-moving) for a whole [board](glossary.md#board) |
| An [agent](glossary.md#agent) looks stuck | [An agent looks stuck](operations/runbook.md#an-agent-looks-stuck) |
| Something crashed | [Something died](operations/runbook.md#something-died) |
| I am updating | [Updating](operations/runbook.md#updating) |
| A [decision](glossary.md#decision) is waiting | [Decisions](operations/runbook.md#decisions) |
| A command printed a [refusal](glossary.md#refusal) | [Refusals](reference/refusals.md), searched for the printed words |

The `.html` pages are [labs](#the-four-interactive-pages): open them from a checkout in a browser, because a Git host
shows only their source.

With time to read, or one thing to find:

| With | Open | For | Open |
| --- | --- | --- | --- |
| 5 minutes | [README](../README.md) | One word | [Glossary](glossary.md) |
| An hour | [The hour path](#the-hour-path) | One concept | [The concept ladder](#the-concept-ladder) |
| A day | [The day path](#the-day-path) | Something to try | [The four interactive pages](#the-four-interactive-pages) |
| One job | [Paths by job](#paths-by-job) | An exact command, route or bound | [Reference shelf](#reference-shelf) |

![Five stacked bands, each listing its documents and its promise: L0 Front door, L1 Concepts, L2 Data model, L3 Architecture and L4 Change. An operator leaves the stack after L1 for the Operate track, which runs beside L2 to L4 and needs neither L2 nor L3. The Reference shelf stands on the other side, looked up and never read through. The four labs sit as tabs on L1, L2, L3 and the Operate track.](figures/docs-index/reading-layers.png)

*Notice the one turn: a reader goes down a band only when the one above stops answering, and an operator turns right
after L1.*

Jump to a band: [L0](#l0-front-door) · [L1](#l1-concepts) · [L2](#l2-data-model) · [L3](#l3-architecture) ·
[L4](#l4-change) · [Operate track](#operate-track) · [Reference shelf](#reference-shelf).

[Every document](#every-document) lists the whole set, which describes the source at commit 70ce56de.

## The hour path

Sixty minutes, no code, in this order. It leaves a reader able to say who acts, how one ticket reaches the
[main line](glossary.md#main-line), what is stored where, where trouble goes, and why killing the
[Overseer](glossary.md#overseer) costs no agent.

| Step | Minutes | Open | Read |
| --- | --- | --- | --- |
| 1 | 5 | [README](../README.md) | All of it |
| 2 | 20 | [The system in twenty minutes](concepts/overview.md) | All of it |
| 3 | 10 | [One ticket, from draft to merged](concepts/ticket-lifecycle.md) | From the top through "Red is not failure" |
| 4 | 10 | Lab: [Walk a ticket](interactive/ticket-journey.html) | The happy path, then one scenario that goes wrong |
| 5 | 5 | [Entities](data-model/entities.md#in-one-screen) | "In one screen" |
| 6 | 5 | [Glossary](glossary.md#words-that-mean-several-things) | "Words that mean several things" |
| 7 | 5 | Lab: [Failure lab](interactive/failure-lab.html#kill-the-overseer) | "Kill a process", with the Overseer killed |

## The day path

After the hour path, this is 500 minutes of reading: the data model, then the mechanisms, in an order that respects
each document's "Read first". The Elapsed column counts reading time only, with no breaks.

The glossary defines the components these blocks name: [Pass](glossary.md#pass), [Customs](glossary.md#customs),
[Airlock](glossary.md#airlock), [Watcher](glossary.md#watcher), [Baton](glossary.md#baton),
[Bridge](glossary.md#bridge), [Assistant](glossary.md#assistant), [Hatch](glossary.md#hatch).

| Elapsed | Block | Minutes | Read, with minutes |
| --- | --- | --- | --- |
| 0:00 | Data model | 90 | [Entities](data-model/entities.md) 15<br>[State machines](data-model/state-machines.md) 35<br>Lab: [State explorer](interactive/state-explorer.html) 10<br>[Storage](data-model/storage.md) 20<br>[On-disk atlas](data-model/on-disk-atlas.md) 10 |
| 1:30 | Lifecycle mechanisms | 125 | [The Pass](architecture/the-pass.md) 20<br>[Build and review](architecture/build-and-review.md) 30<br>[Customs and gates](architecture/customs-and-gates.md) 30<br>[Airlocks and groups](architecture/airlocks-and-groups.md) 20<br>[Questions and incidents](architecture/questions-and-incidents.md) 25 |
| 3:35 | Runtime mechanisms | 63 | [Watchers](architecture/watchers.md) 20<br>[Baton](architecture/baton.md) 18<br>[Failure and recovery](architecture/failure-and-recovery.md) 15<br>Lab: [Failure lab](interactive/failure-lab.html) 10 |
| 4:38 | Agents | 77 | [Roles and launch](architecture/roles-and-launch.md) 25<br>[Confinement](architecture/confinement.md) 20<br>[Control](architecture/control-and-hatch.md) 20<br>[Assistant and intake](architecture/assistant-and-intake.md) 12 |
| 5:55 | Surfaces | 95 | [Code map](architecture/code-map.md) 20<br>[CLI and install](architecture/cli-and-install.md) 25<br>[Bridge](architecture/bridge.md) 20<br>[Overseer API](reference/overseer-api.md) 15<br>[Measurement](architecture/measurement.md) 15 |
| 7:30 | Contributing | 50 | [Changing the code](development/contributing.md) 15<br>[Guards and testing](development/guards-and-testing.md) 20<br>[Why it is built this way](development/decisions.md) 15 |

The day leaves out three things: the Reference shelf except the API, the Operate track, and three L4 documents (Claude
Code contract, end-to-end smoke, porting). Reach for those when a job needs them.

## Paths by job

| Job | Read, in order | Skip |
| --- | --- | --- |
| I run a board | [L1](#l1-concepts) → [Getting started](operations/getting-started.md) → [Running a board](operations/running-a-board.md) → [Runbook](operations/runbook.md) first screen | L2 and L3; the Operate track links them where it needs them |
| I change the code | [Hour path](#the-hour-path) → [Code map](architecture/code-map.md) → [Changing the code](development/contributing.md) → [Guards and testing](development/guards-and-testing.md) → [the mechanism's document in L3](#l3-architecture) → [Rule book](../CLAUDE.md) | The Operate track |
| I integrate with the API | [Overview](concepts/overview.md) → [Overseer API](reference/overseer-api.md) → its [agent-dashboard contract](reference/overseer-api.md#the-agent-dashboard-contract) → [Control](architecture/control-and-hatch.md) → [The Bridge](architecture/bridge.md) as a worked client | L4 and most of L3 |
| I am porting this | [Hour path](#the-hour-path) → [Code map](architecture/code-map.md) → [Porting](development/porting.md) → [Why it is built this way](development/decisions.md) → [Known gaps](reference/known-gaps.md) → [Claude Code contract](development/overseer-claude-probe.md) | The Operate track |
| I review security | [Overview](concepts/overview.md) → [Confinement](architecture/confinement.md) → [Control](architecture/control-and-hatch.md) → [Customs and gates](architecture/customs-and-gates.md) → [request guards](reference/overseer-api.md#request-guards) → [agent text in the Bridge](architecture/bridge.md#agent-text) → [Known gaps](reference/known-gaps.md) | L4 and the Operate track |

## Every document

Each table lists its documents in reading order. Each question is the one the document opens with.

### L0 Front door

**Promise:** five minutes to learn what agent-progress v2 is, what it looks like, that this branch never merges and
where to go next, and one click to the fix when something is wrong.

| Document | Its question | Time |
| --- | --- | --- |
| [The README](../README.md) | What is this, what does it look like, what will it do to my repository, and where do I go next? | 5 min |
| The documentation map, this page | Given what I need right now and the time I have, which page do I open? | 2 min |

### L1 Concepts

**Promise:** one hour, no code, to explain who acts, how one ticket reaches main, what is stored where, where trouble
goes and why killing the Overseer costs no agent. Every word is defined.

| Document | Its question | Time |
| --- | --- | --- |
| [The system in twenty minutes](concepts/overview.md) | What are the moving parts, who decides what, and what ideas does everything else rest on? | 20 min |
| [One ticket, from draft to merged](concepts/ticket-lifecycle.md) | What happens to a ticket at each step, who moves it, and what can send it back? | 15 min |
| Lab: [Walk a ticket](interactive/ticket-journey.html) | What exactly happens to a ticket, step by step, including when it goes wrong, and what does every part of the system show? | 10 min |
| [Glossary](glossary.md) | What does this word mean here, and which of its meanings is this? | 10 min, then lookup |

### L2 Data model

**Promise:** read any stored file, say what any status means and what may legally come next, say how a write commits,
and name who wrote a given file and when it dies.

| Document | Its question | Time |
| --- | --- | --- |
| [Data model: entities and identity](data-model/entities.md) | What things exist, how do they relate, how are they identified, and where does each one live? | 15 min |
| [State machines](data-model/state-machines.md) | What states can each thing be in, what may come next, and what moves it? | 35 min |
| Lab: [State explorer](interactive/state-explorer.html) | From this state, what can happen next, who does it, and what does it leave behind? | 10 min |
| [How a write commits](data-model/storage.md) | How do the board files and the log change as one transaction, and what does a reader see after a crash at any point? | 20 min |
| [On-disk atlas](data-model/on-disk-atlas.md) | What is this file, who writes it, who reads it, when does it die, and may it be touched? | 10 min, then lookup |

### L3 Architecture

**Promise:** one document per mechanism: how it works, what is always true, how it fails, and the exact code that
decides. Enough to trace any behaviour on the board and change it safely. With L2 this is most of
[the day path](#the-day-path).

**Lifecycle**

| Document | Its question | Time |
| --- | --- | --- |
| [The Pass and the Playbook](architecture/the-pass.md) | What does the Overseer do on each Pass, and why does a lost effect not matter? | 20 min |
| [Build and review](architecture/build-and-review.md) | How does a ready ticket become a verified branch, and what happens at each kind of failure? | 30 min |
| [Customs and gates](architecture/customs-and-gates.md) | What exactly is checked before a claim is believed, and how do a repository's gates plug in? | 30 min |
| [Airlocks and groups](architecture/airlocks-and-groups.md) | How does verified work land on a target one branch at a time, without ever putting an ungated tree there? | 20 min |
| [Questions and incidents](architecture/questions-and-incidents.md) | Who gets a judgement call, what does an answer do, what waits for a person, and why nothing else does? | 25 min |

**Runtime**

| Document | Its question | Time |
| --- | --- | --- |
| [Watchers](architecture/watchers.md) | What runs as what process, how do they find each other, and how does the Overseer reach an agent? | 20 min |
| [The Baton: one driver, and handing over](architecture/baton.md) | How is there at most one driver per board, and how does later code take over without touching an agent? | 18 min |
| [Failure and recovery](architecture/failure-and-recovery.md) | For anything that can die or stall, what survives, what notices, and what happens next? | 15 min, then lookup |
| Lab: [Failure lab](interactive/failure-lab.html) | If this dies right now, what survives, and what does the next Pass do? | 10 min |

**Agents**

| Document | Its question | Time |
| --- | --- | --- |
| [Roles and launching an agent](architecture/roles-and-launch.md) | What does each role get, and how does a Playbook step become a running session? | 25 min |
| [Confinement and trust](architecture/confinement.md) | What can an agent never do, what stops it, and what is checked afterwards in case a layer leaked? | 20 min |
| [Control: one contract, three doors](architecture/control-and-hatch.md) | How does any change reach the board, from User, a session or a button? | 20 min |
| [The Assistant and intake](architecture/assistant-and-intake.md) | Which two sessions serve the board itself, how long does each live, and why can neither do lasting harm? | 12 min |

**Surfaces**

| Document | Its question | Time |
| --- | --- | --- |
| [Code map](architecture/code-map.md) | How is the source laid out, what may import what, and where do I start reading? | 20 min |
| [The CLI and install](architecture/cli-and-install.md) | How does one command line run, and what does adopting a repository install? | 25 min |
| [The Bridge](architecture/bridge.md) | How is the live page built, where does its state live, and how does it stay safe with agent text? | 20 min |
| [Measurement: what reviews catch and what agents cost](architecture/measurement.md) | Which numbers does this system keep about itself, where does each come from, how do I read them? | 15 min |

### L4 Change

**Promise:** get a change past every guard, know why the code has this shape, know what the vendor contract rests on,
and carry the code into a separate product.

| Document | Its question | Time |
| --- | --- | --- |
| [Changing the code](development/contributing.md) | How do I get this running, try a change safely and get it past every check? | 15 min |
| [Guards and testing](development/guards-and-testing.md) | Which spec holds which rule, and how is this codebase tested without ever touching live data? | 20 min, then lookup |
| [Why it is built this way](development/decisions.md) | Why does the system have this shape, what was the alternative, and what does it cost? | 15 min |
| [The Claude Code contract and its evidence](development/overseer-claude-probe.md) | What does this system depend on from Claude Code, and what was observed to justify each choice? | 10 min, 30 with the probe record |
| [End-to-end smoke with real Claude sessions](development/cutover-smoke.md) | How do I prove the whole lifecycle on real sessions, and read the result? | 10 min |
| [Porting to the new product](development/porting.md) | What do I take, what do I leave, and what must I know first? | 20 min |

### Operate track

**Promise:** beside the stack, entered from L1. It links L2 and L3 and requires neither: adopt a repository, run a
board and get out of trouble from the symptom seen, with commands to paste.

| Document | Its question | Time |
| --- | --- | --- |
| [Getting started: from clone to first merged ticket](operations/getting-started.md) | What exactly do I run, in what order, and what should I see at each step? | 20 min to read, longer to run |
| [Running a board from the Bridge](operations/running-a-board.md) | What am I looking at, and what do I do here day to day? | 25 min |
| [Runbook](operations/runbook.md) | Something needs me: what do I check and what do I do? | 2 min per recipe |
| Lab: [Why is my ticket not moving?](interactive/why-not-moving.html) | Given what the board shows, what exactly is blocking this ticket, and what clears it? | 2 min |

### Reference shelf

**Promise:** beside the stack, looked up and never read through. Every command, flag, exit code, environment variable,
stored format, API route, bound, decider, printed refusal and known gap has exactly one place.

| Document | Its question | Time |
| --- | --- | --- |
| [Command and file-format reference](cli.md) | What exactly does this command accept, and what exactly is in this file? | Lookup |
| [The Overseer API](reference/overseer-api.md) | What does the Overseer serve, to whom, and how does a client stay in step? | 15 min, or one route |
| [Deciders and bounds](reference/deciders-and-bounds.md) | Which code decides this, from what inputs, and what number bounds it? | 5 min, then lookup |
| [Refusals](reference/refusals.md) | This was refused: what does it mean, was anything written, and what do I do? | 2 min, then search |
| [Known gaps](reference/known-gaps.md) | Where does the code as built fall short of its intent or its own words, and how do I work with it? | 5 min, then 1 per entry |
| [Backlog: agreed, not started](backlog.md) | What is agreed and not started, and why does it wait? | 2 min |

One more lookup sits in L4 because of its path: the
[Claude Code contract](development/overseer-claude-probe.md), for what this system depends on from the vendor's CLI.

## The concept ladder

Each concept climbs three rungs: a first sentence, its rules, and a place to try it.

| Concept | First appears | Rules live in | Try it in a lab |
| --- | --- | --- | --- |
| [Ticket](glossary.md#ticket) | [Overview](concepts/overview.md) | [State machines](data-model/state-machines.md#ticket) | [State explorer](interactive/state-explorer.html#machine=ticket) |
| [Job](glossary.md#job) | [Overview](concepts/overview.md) | [Build and review](architecture/build-and-review.md), [State machines](data-model/state-machines.md#job) | [State explorer](interactive/state-explorer.html#machine=job) |
| [Overseer](glossary.md#overseer) | [Overview](concepts/overview.md#one-driver) | [The Baton](architecture/baton.md), [State machines](data-model/state-machines.md#overseer) | [Failure lab](interactive/failure-lab.html#kill-the-overseer) |
| [Pass](glossary.md#pass) | [Overview](concepts/overview.md#one-driver) | [The Pass](architecture/the-pass.md) | [Failure lab](interactive/failure-lab.html#cut-a-hold-short) |
| [Playbook](glossary.md#playbook) | [Overview](concepts/overview.md#agents-report-code-decides) | [The Pass](architecture/the-pass.md#the-playbook) | [Why is my ticket not moving?](interactive/why-not-moving.html) |
| [Lock hold](glossary.md#lock-hold) | [Overview](concepts/overview.md#one-driver) | [How a write commits](data-model/storage.md) | [Failure lab](interactive/failure-lab.html#cut-a-hold-short) |
| [Hold](glossary.md#hold) on a ticket | [Ticket lifecycle](concepts/ticket-lifecycle.md#four-things-to-read-separately) | [State machines](data-model/state-machines.md#hold-an-overlay-on-any-status) | [Why is my ticket not moving?](interactive/why-not-moving.html) |
| [Watcher](glossary.md#watcher) | [Overview](concepts/overview.md#two-lifetimes) | [Watchers](architecture/watchers.md) | [State explorer](interactive/state-explorer.html#machine=watcher) |
| [Customs](glossary.md#customs) | [Overview](concepts/overview.md#agents-report-code-decides) | [Customs and gates](architecture/customs-and-gates.md) | [Walk a ticket](interactive/ticket-journey.html#customs-refusal) |
| [Gate](glossary.md#gate) | [Overview](concepts/overview.md#agents-report-code-decides) | [Customs and gates](architecture/customs-and-gates.md) | [Walk a ticket](interactive/ticket-journey.html#red-gate) |
| [Airlock](glossary.md#airlock) | [Overview](concepts/overview.md#an-airlock-gates-the-merged-tree) | [Airlocks and groups](architecture/airlocks-and-groups.md) | [State explorer](interactive/state-explorer.html#machine=airlock) |
| [Incident](glossary.md#incident) and decision | [Overview](concepts/overview.md#trouble-goes-three-ways) | [Questions and incidents](architecture/questions-and-incidents.md) | [State explorer (incidents)](interactive/state-explorer.html#machine=incident) |
| [Baton](glossary.md#baton) | [Overview](concepts/overview.md#two-lifetimes) | [The Baton](architecture/baton.md) | [Failure lab](interactive/failure-lab.html#fail-a-baton-pass) |

## The four interactive pages

Each lab is one HTML file that lets a reader try what its home document states.

| Page | What it answers | Home document |
| --- | --- | --- |
| [Walk a ticket](interactive/ticket-journey.html) | What happens to a ticket step by step, on the happy path and on each path that goes wrong | [Ticket lifecycle](concepts/ticket-lifecycle.md) |
| [State explorer](interactive/state-explorer.html) | From a state of a ticket, row, job, Airlock, Watcher, [Baton pass](glossary.md#baton-pass), incident or [filing draft](glossary.md#filing-draft), what can come next and who does it | [State machines](data-model/state-machines.md) |
| [Failure lab](interactive/failure-lab.html) | What survives when a process dies, a lock hold is cut short or a Baton pass fails | [Failure and recovery](architecture/failure-and-recovery.md) |
| [Why is my ticket not moving?](interactive/why-not-moving.html) | Which blockers stop this ticket, in order, and what clears each | [Runbook](operations/runbook.md) |

Open them from a checkout, in a browser. They need no server, so a `file://` address works, and a view can be linked
by its URL hash. From the repository root, on macOS:

```sh
open docs/interactive/ticket-journey.html
```

They do not render on a Git host, which shows their source.

## Names on this branch

The program is `agent-progress-v2`, and it runs beside the released `agent-progress` under folders and environment
variables of its own. Documents write those folders as `<data>`, `<worktrees>` and `<monitor>`.
[Reading names](glossary.md#reading-names) gives the names documents use and the three
reasons a released spelling still appears.

## What is not here

- **Rules** are in [CLAUDE.md](../CLAUDE.md), the rule book these pages link and never restate.
- **Plans** are in [the backlog](backlog.md). A gap in [Known gaps](reference/known-gaps.md) is not a plan.
- **Design material** sits untracked in the owner's main checkout and is frozen.
  [Porting](development/porting.md#design-material-and-evidence) says where. Where it and the code disagree, the code
  wins.

> **Careful.** The `agent-progress:managed` block at the bottom of [CLAUDE.md](../CLAUDE.md) is this checkout's install
> of the released program. It does not describe this code.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Names on this branch | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `src/ProductNames.spec.ts` |
| Component names | `src/ComponentNames.spec.ts` | `RETIRED_NAMES` | `src/ComponentNames.spec.ts` |
