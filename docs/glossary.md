# Glossary

> **Question:** What does this word mean here, and which of its meanings is this?
> **Time:** about 10 minutes for the tables before A to Z; after that, look words up.
> **Read first:** nothing.
> **Next:** [Overview](concepts/overview.md), [Ticket lifecycle](concepts/ticket-lifecycle.md), [Docs index](README.md).

## In one screen

`forge` runs AI coding agents on a repository's [tickets](#ticket) and lands their work on the
[main line](#main-line). A [board](#board) is one repository's tickets and everything kept about them. Most of the
twelve capitalised names sit on one ticket's path, and the rest act beside it. Learn where each one sits and most other
words follow.

![Most of the twelve names sit on one path from User to the main line. User works through the Bridge. Inside the
Overseer the Pass runs the Playbook and launches a Watcher holding a session, whose requests pass the Hatch and the
Bouncer and whose result passes Customs and the Airlock. Beside that path the Assistant takes incidents, and the Baton
and Regrouping act across Overseer restarts.](figures/glossary/component-map.png)

*A [session](#session) never touches the board directly: what it sends through the Hatch passes the Bouncer, and what
it says in its event stream and final report is read by the Overseer and checked by Customs. Gates and reviews are left
out to keep the map readable.*

Several words mean different things in different places: pass, slot, draft, hold and others. If a word could mean two
things, read [Words that mean several things](#words-that-mean-several-things). For anything else, go to
[A to Z](#a-to-z).

A definition here is short and links the document that holds the rules. Bounds and values live in
[Deciders and bounds](reference/deciders-and-bounds.md), never here.

## Reading names

Two programs exist: the released `agent-progress` and this build, `forge`. This build uses its own command,
folders and environment prefix, so both can be installed on one machine and neither touches the other's files.
`PRODUCT_NAMES` in `src/shared/constants/ProductNames.ts` is the one source. Documents use these names.

| Documents say | Means | `PRODUCT_NAMES` field |
| --- | --- | --- |
| `forge` | the program | `PROGRAM` |
| `<data>` | `.forge/`, in the repository root | `DATA_FOLDER` |
| `<worktrees>` | `.forge-worktrees/`, in the repository root | `WORKTREES_FOLDER` |
| `<monitor>` | `~/.forge-monitor/` | `MONITOR_FOLDER` |
| `<PREFIX>` | `FORGE_`, the start of every environment variable | `ENVIRONMENT_PREFIX` |
| `forge-po` | the [product owner](#product-owner) skill | `PRODUCT_OWNER_SKILL` |
| `forge-orchestrate` | the [orchestrator](#orchestrator) wrapper skill | `ORCHESTRATE_SKILL` |

Other files show the released spelling, listed in `ORIGINAL_PRODUCT_NAMES`, for three reasons:

- Source paths keep it: `agent-progress.ts`, `skills/agent-po/`, `skills/agent-progress-orchestrate/`.
- This repository's `CLAUDE.md` block and this checkout's own `.agent-progress/` folder belong to the released program,
  not to this code.
- Templates hold placeholders such as `{{program}}`, and an install fills them from `PRODUCT_NAMES`.

Ids in text and output have one of these forms.

| Identifier | Names |
| --- | --- |
| `#003` | a ticket, by its padded id |
| `J<n>` | a [job](#job) |
| `E<n>` | a [decision](#decision) |
| `I<n>` | an [incident](#incident) |
| `D<n>` | a [filing draft](#filing-draft) |

In a command or path, `<J>`, `<E>`, `<I>` and `<D>` stand for one such id, as in `job stop <J>`.

## Words that mean several things

Read the row that fits the context. Component names are capitalised, like the twelve in the figure.

| Word | Meaning | How to recognise it | Home |
| --- | --- | --- | --- |
| **pass** | the [Pass](#pass), the Overseer's loop | capitalised; `runOnePass`, `passes` | [The Pass](architecture/the-pass.md) |
| | a [failed pass](#failed-pass), a bound on a ticket's jobs | only in "failed pass"; `FailedPassUtil`, `FAILED_PASSES_BEFORE_PARKING` | [Build and review](architecture/build-and-review.md) |
| | a review pass, the same thing as a [review round](#review-round) | code comments, `reviewPassCount`; this documentation says review round | [Build and review](architecture/build-and-review.md) |
| | a [Baton pass](#baton-pass), the Overseer hand-over | `src/services/overseer/BatonPass.ts` | [Baton](architecture/baton.md) |
| | the red-handoff note, `gate-failure.md` | "The Baton pass is in ..." in `RedHandoffMessage.md`; `batonPass` in `RedHandoff.ts`. No Overseer hand-over is involved | [Build and review](architecture/build-and-review.md) |
| | an onboarder's whole run | "its pass" in `src/services/overseer/Onboarding.ts` | [Customs and gates](architecture/customs-and-gates.md) |
| **draft** | a [filing draft](#filing-draft), `D<n>` | `draft` verbs; no status, no [row](#row) | [Assistant and intake](architecture/assistant-and-intake.md) |
| | a [draft ticket](#draft-ticket), status `draft` | `#003`; a real ticket, not yet ready | [State machines](data-model/state-machines.md) |
| **slot** | a [launch slot](#launch-slot) | `LaunchSlotUtil` counts build and review jobs; the Overseer launches by this, and `status` and the [Next line](#next-line) print it | [The Pass](architecture/the-pass.md) |
| | an [Airlock slot](#airlock-slot), one per [target](#target) | `slotHolderOf`, `Job.airlock`; held by a merge or refresh job | [Airlocks and groups](architecture/airlocks-and-groups.md) |
| | a [gate slot](#gate-slot), machine-wide | files in `<monitor>/gate-slots/` | [Customs and gates](architecture/customs-and-gates.md) |
| | an [epic colour slot](#epic-colour-slot) | the stored `slot` field, set at `epic add`; a colour, no capacity | [Entities](data-model/entities.md) |
| **orchestrator** | the optional interactive wrapper session | the skill `forge-orchestrate` around a running Overseer; the only use in these documents | [Assistant and intake](architecture/assistant-and-intake.md) |
| | the Assistant, in surviving comments | `UsageMarkerFile.ts`, `ControlCommand.ts`: read as "Assistant" | [Stale prose in code](reference/known-gaps.md#gap-stale-prose-in-code) |
| | the released program's session in the `CLAUDE.md` managed block | that block describes the released program, not this code | [CLI and install](architecture/cli-and-install.md) |
| **dispatch** | launching jobs; no dispatcher exists in this build | surviving names: `cli/dispatch/concurrency/`, `DISPATCH_PROTOCOL`, `DispatchQueries`, `dispatchCapacity` | [The Pass](architecture/the-pass.md) |
| | a retired stored record | the `dispatcher-set` log kind, read so an older log stays readable | [CLI reference](cli.md) |
| **fixer** | a review's move | `fixer` in `settleReviewPass`: job ends `does-not-hold`, the ticket goes back to a builder | [Build and review](architecture/build-and-review.md) |
| **render** | Markdown to HTML | `src/services/render/MarkdownRenderer.ts` | [Bridge](architecture/bridge.md) |
| | assembling the page payload | `assemblePagePayload`; the Overseer sends it inside `BoardState` | [Overseer API](reference/overseer-api.md) |
| | no command | there is no `render` verb, and no command rebuilds a page | [CLI reference](cli.md) |
| **page** | the [Bridge](#bridge), served at `GET /` | `HTMLBundle`, the `page` field of `BoardState` | [Bridge](architecture/bridge.md) |
| | `<data>/progress.html`, a stub | `ProgressPageStubWriter`: it only says where the live board is | [On-disk atlas](data-model/on-disk-atlas.md) |
| **claim** | a report claim | the [builder](#builder) report's `gates`, the [reviewer](#reviewer) report's `claims`; never trusted | [Customs and gates](architecture/customs-and-gates.md) |
| | a `review-recorded` claim | `ReviewClaim` in the log; counted by `review-stats` | [Measurement](architecture/measurement.md) |
| | a retired ticket claim | the `ticket claim` verb is unknown; `Board.claimTickets` remains ([as built](reference/known-gaps.md#gap-dead-code-and-unused-states)) | [State machines](data-model/state-machines.md) |
| | a filing-draft claim | `DraftClaim`: who holds the draft | [Assistant and intake](architecture/assistant-and-intake.md) |
| | a Watcher's claim of its file | the record in `watcher-<n>.json` | [Watchers](architecture/watchers.md) |
| **alive** | a live Baton | `BatonReading` verdict `live`: the newest generation names a running process | [Baton](architecture/baton.md) |
| | a live Watcher | `WatcherLiveness`: `unclaimed` before it claims its file, `live` while the claimed process identity matches, `ended` once it recorded its end, `lost` when it vanished without one | [Watchers](architecture/watchers.md) |
| | an agent | no verdict of its own: read through its Watcher, and `agent-crashed` or `watcher-lost` says which died | [Failure and recovery](architecture/failure-and-recovery.md) |
| **hold** | a [ticket hold](#ticket-hold) | frontmatter `hold`, such as `parked:<cause>` | [State machines](data-model/state-machines.md) |
| | a [lock hold](#lock-hold) | one `writeTracker` run, as in "in the same hold" | [Storage](data-model/storage.md) |
| | an [install hold](#install-hold) | the runtime state `held-by-install-change` | [State machines](data-model/state-machines.md) |
| | a review that does not hold | job outcome `does-not-hold`: the review sent the build back; nothing is held | [Build and review](architecture/build-and-review.md) |
| **finding** | a recorded review finding | `ReviewFinding`, in a `review-recorded` record | [Measurement](architecture/measurement.md) |
| | a filed finding | a low ticket a job filed through its Hatch, waiting in `dependsOn` for the ticket that found it | [Assistant and intake](architecture/assistant-and-intake.md) |
| **sweep** | the Overseer's timed [wake](#wake) | `OVERSEER_SWEEP_SECONDS`, `DataFolderWatch`; "silent sweeps" (`silentSweepsOf`) counts those a job's [cursor](#cursor) stood still for | [The Pass](architecture/the-pass.md) |
| | the [Airlock sweep](#airlock-sweep), a step inside a Pass | `airlocks.sweep` | [Airlocks and groups](architecture/airlocks-and-groups.md) |
| **marker** | the [usage marker](#usage-marker) | `<monitor>/usage-limit.json` | [Failure and recovery](architecture/failure-and-recovery.md) |
| | a delivery marker | `.sent` and `.delivered` files in a job folder; each says a line went out once | [Control and Hatch](architecture/control-and-hatch.md) |
| | an [install marker](#install-marker) | `session-instructions.md` or `agent-brief.md`: its presence tells the version check an install exists | [CLI and install](architecture/cli-and-install.md) |
| | a managed-block marker | the start and end comments of the [managed block](#managed-block) | [CLI and install](architecture/cli-and-install.md) |
| **request** | a Hatch request | `<worktrees>/hatch/J<n>/requests/<requestId>.json`, a session's file for the Overseer | [Control and Hatch](architecture/control-and-hatch.md) |
| | a question request | one `AskUserQuestion` call; `requestId` on the decision or in the incident's facts | [Questions and incidents](architecture/questions-and-incidents.md) |
| **settled** | a job | ended, and out of `progress.json`; "unsettled jobs" are the stored ones | [Entities](data-model/entities.md) |
| | a ticket | `delivered` or `abandoned`, `SETTLED_TICKET_STATUSES` | [State machines](data-model/state-machines.md) |
| | a dependency | `reviewed` or `delivered`, `TICKET_STATUSES_THAT_SETTLE_A_DEPENDENCY`; a missing ticket counts as unsettled | [The Pass](architecture/the-pass.md) |
| | a decision or incident | answered, withdrawn or defaulted, and off the board | [Questions and incidents](architecture/questions-and-incidents.md) |
| | a [fingerprint](#settled-fingerprint) | the one kept from a Pass that left no unapplied events | [The Pass](architecture/the-pass.md) |
| **move** | an incident move | `IncidentMove`, named after its control command | [Questions and incidents](architecture/questions-and-incidents.md) |
| | a ticket move | a status transition; `Board.moveTicket`, the named verbs | [State machines](data-model/state-machines.md) |
| | a job move | `Jobs.moveJob`, a change of job state | [State machines](data-model/state-machines.md) |
| | a review's move | what `settleReviewPass` picks: `fixer`, `fresh-reviewer`, `waiver` or `merge-queued` | [Build and review](architecture/build-and-review.md) |

> **As built.** The red-handoff text [says Baton pass](reference/known-gaps.md#gap-red-handoff-says-baton-pass).

### Words often confused

These are different words for neighbouring things. Each row says what separates them.

| Words | Which is which | How to recognise it | Home |
| --- | --- | --- | --- |
| **gate**, **checks line** | a gate is one named check; the checks line is the gates joined into one shell line | `pipeline.json` entries, the word to use; `PipelineUtil`, surviving comments and prompts | [Customs and gates](architecture/customs-and-gates.md) |
| **job** | the board's unit of work; it can span Watcher instances | `J<n>`; settled by a `job-ended` log record | [Watchers](architecture/watchers.md) |
| **Watcher instance** | one spawn of a Watcher for a job; a resume spawns the next | `watcher-<n>.json`, `Job.watcherInstance` | [Watchers](architecture/watchers.md) |
| **session** | the conversation with Claude Code; it can span jobs | `sessionIdOf`; a build sent back by review resumes it under a further job | [Watchers](architecture/watchers.md) |
| **attempt** | a fresh try at a build, numbered on the job | `Job.attempt` | [Watchers](architecture/watchers.md) |
| **reviewed**, **delivered** | `reviewed` is not yet on the main line; a ticket that is `delivered` is on it | shown `Awaiting merge` and `Done` | [State machines](data-model/state-machines.md) |
| **Handoff**, **red handoff** | the Handoff is a ticket body section, the builder's account; a red handoff is the moment a session ended and verification failed | `## Handoff`; `handoff-red`, and the same session is resumed | [Build and review](architecture/build-and-review.md) |
| **landing**, **landed** | landing is any move onto a target; landed is that outcome on the main line only | `src/services/lifecycle/Landing.ts`; `LandingKind`, whose group outcome is `integrated` | [Airlocks and groups](architecture/airlocks-and-groups.md) |

[Job, instance, session and attempt](architecture/watchers.md#job-instance-session-and-attempt) draws how these four
nest.

> **As built.** Agent-facing text [says checks line](reference/known-gaps.md#gap-checks-line-wording).

## Status words

The stored value is what `<data>/progress.json`, tickets, `status --json` and verbs use. The Bridge word comes from
`DisplayStateWordingUtil`. Rules are in [State machines](data-model/state-machines.md).

| Stored value | Stored on | The Bridge shows |
| --- | --- | --- |
| `draft` | ticket only | Draft |
| `pending` | ticket, row (none yet on a low-priority ticket) | To do |
| `in-progress` | ticket, row | In progress |
| `paused` | row only | Paused |
| `in-review` | ticket, row | Awaiting review |
| `reviewing` | not stored: derived | Reviewing |
| `re-review` | row only | Reviewing (round n) |
| `reviewed` | ticket, row | Awaiting merge |
| `delivered` | ticket, its row; a closed [review bar](#review-bar), where it says only that the review ended | Done |
| `abandoned` | ticket, row | Abandoned |

`reviewing` is an `in-review` row of an `in-review` ticket with a review running.

> **Careful.** A ticket whose review passed stays `in-review` while it waits in the [merge queue](#merge-queue), so its
> badge reads Awaiting review, not Awaiting merge: see [reviewed](#reviewed). The four tracks in
> [Ticket lifecycle](concepts/ticket-lifecycle.md) show the status holding still while the ticket moves.

## A to Z

### Acceptance

The `## Acceptance` section of a ticket body, numbered `A1.`, `A2.` and so on. Home: [CLI reference](cli.md).

### acknowledgement frame

The frame that lets an ended Watcher exit: `close-input` for an [agent Watcher](#watcher-kind), `stop` for a [process
Watcher](#process-watcher). Until it arrives the Watcher lingers, so the Overseer can read how the child ended. Home:
[Watchers](architecture/watchers.md).

### admin folder

`.git/worktrees/<name>`, the folder in the shared `.git` where git keeps a linked [worktree](#worktree)'s `HEAD` and
index. A session is denied every other worktree's. Home: [Confinement](architecture/confinement.md).

### agent

An AI coding session launched for a job, running one [role](#role). This documentation says [session](#session) when the
conversation itself matters. Home: [Roles and launch](architecture/roles-and-launch.md).

### Airlock

The code that lets one merge at a time into a [target](#target) and lands it, `src/services/overseer/Airlocks.ts`.
Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### Airlock slot

The one place per [target](#target) in its [Airlock](#airlock), held by a merge or refresh job through `Job.airlock`
(`slotHolderOf`). Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### Airlock sweep

The Airlocks' step inside a [Pass](#pass), `airlocks.sweep`, which claims and advances merges. It differs from the timed
[sweep](#sweep). Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### alive

Three different things share this word. See [Words that mean several things](#words-that-mean-several-things).

### AskUserQuestion

The vendor's tool through which a session asks a question. Calling it is a [question request](#request), which opens a
[decision](#decision) or an [incident](#incident) (`QuestionRouting`). Roles that may not ask have it removed through
`--disallowedTools`. Home: [Questions and incidents](architecture/questions-and-incidents.md).

### Assistant

The agent session of the one long-lived job of kind `assistant`. It receives [incidents](#incident) before User does.
Home: [Assistant and intake](architecture/assistant-and-intake.md).

### attempt

`Job.attempt`, from 1. On a build job, one fresh try at the ticket: a fresh agent runs one higher, except a replacement
after a [red handoff](#red-handoff) and a builder resumed after review, which keep it. A review job stores its
[review round](#review-round) here; merge, refresh and merge-agent jobs store their own launch count. Home:
[Watchers](architecture/watchers.md).

### auto mode

The vendor's permission mode, `--permission-mode auto`, under which a classifier approves most tool calls without a
prompt. Every session runs in it, inside the other [confinement](architecture/confinement.md) layers. Home:
[Confinement](architecture/confinement.md).

### Baton

A file `<data>/overseer/baton-<n>.json` created exclusively at each Overseer start. The newest
[generation](#generation) decides: if it names a live process, that process is the Overseer; if not, no Overseer is
running (`src/services/overseer/Baton.ts`). Home: [Baton](architecture/baton.md).

### Baton pass

The hand-over from a running Overseer to its successor, `src/services/overseer/BatonPass.ts`, with no restart of the
Watchers. The red-handoff text uses the same words for something else: see [Words that mean several
things](#words-that-mean-several-things). Home: [Baton](architecture/baton.md).

### board

One repository's work as one model: tickets, rows, jobs, decisions, incidents and the log, read into the `Board` class.
The [tracker](#tracker) is the same thing on disk. Home: [Entities](data-model/entities.md).

### `Board` class

The class in `src/lib/tracker-model/Board.ts` that holds a [board](#board) in memory and owns its rules. A command
builds one for each [lock hold](#lock-hold); it never touches a file. Home: [Entities](data-model/entities.md).

### Bouncer

The pure table of which command, sent through the [Hatch](#hatch), each job role may run,
`src/services/control/Bouncer.ts`. The role comes from the Hatch folder's job record, never from the request. Home:
[Control and Hatch](architecture/control-and-hatch.md).

### bound

A `SCREAMING_CASE` constant that limits a count, such as `FAILED_PASSES_BEFORE_PARKING`. A resume bound ends in a
[park](#park), a replacement or an incident; a [call budget](#call-budget) stops a session. Home: [Deciders and
bounds](reference/deciders-and-bounds.md).

### Bridge

The browser client in `bridge/`. The Overseer serves it and feeds it over an event stream. Home:
[Bridge](architecture/bridge.md).

### Brief

The `## Brief` section of a ticket body, which is what its builder reads. Home: [CLI reference](cli.md).

### build job

A job of [kind](#job-kind) `build`, role `builder`, on one ticket's [worktree](#worktree). Home: [Build and
review](architecture/build-and-review.md).

### builder

The job role that does a ticket's work and reports. Home: [Roles and launch](architecture/roles-and-launch.md).

### call

One top-level assistant turn of a session, however many tool calls it holds. `sessionReadingOf` counts distinct message
ids and leaves out subagents' turns. [Call budgets](#call-budget) spend these. Home: [Roles and
launch](architecture/roles-and-launch.md).

### call budget

The API turns of its own session, not its subagents', that a builder, reviewer or [merge agent](#merge-agent) may
spend, or an Assistant per turn (`DISPATCH_PROTOCOL`, `ASSISTANT_TURN_CALL_BUDGET`). A turn with several tool calls
counts once. Product-owner and onboarder sessions have none. What follows differs by role: a builder or reviewer
receives the [wind-down](#wind-down) message, a merge agent's merge is aborted, and an Assistant's turn ends. Home:
[Roles and launch](architecture/roles-and-launch.md). Values: [Deciders and bounds](reference/deciders-and-bounds.md).

### candidate

A ticket that could start. A launch candidate is what the [Playbook](#playbook) keeps with `candidateOf` and sorts with
`candidateOrder`; a merge candidate is what `mergeCandidatesOf` derives for a [target](#target). Homes: [The
Pass](architecture/the-pass.md), [Airlocks and groups](architecture/airlocks-and-groups.md).

### change size

The bucket `review-stats` files a builder's change under (`CHANGE_SIZE_BUCKETS`), from the lines a review measured. It
differs from the ticket's `size` field, which is the filer's estimate. Home: [Measurement](architecture/measurement.md).

### checks line

The gates joined into one shell line by `PipelineUtil`. Prefer [gate](#gate). See [Words that mean several
things](#words-that-mean-several-things).

### claim

Five different things share this word. See [Words that mean several things](#words-that-mean-several-things).

### `claude` trap

A stub `claude` first on `PATH` during a test run, which records where it ran and exits non-zero, so no spec starts a
real session. One of the program traps, beside the `gpgconf` one (`src/testing/ProgramTraps.ts`). Home: [Guards and
testing](development/guards-and-testing.md).

### code version

A content hash of the program's shipping files (`CodeVersion.onDisk`). It differs from the [install
version](#install-version), which a person bumps. Home: [CLI and install](architecture/cli-and-install.md).

### cohort

One group of agents summarised on a line of `usage`: `All`, plus the groups before and after the instant `--since` names
(`TranscriptCohortUtil.cohortSplitAt`). Home: [Measurement](architecture/measurement.md).

### commit point

The atomic rename that lands `hold-journal.json` whole. Before it a [lock hold](#lock-hold) changed nothing; after it
the hold always completes, by replay if need be. Home: [Storage](data-model/storage.md).

### concurrency limit

The stored number of build and review jobs that may run at once, set with `concurrency`. It sizes the [launch
slots](#launch-slot). Home: [The Pass](architecture/the-pass.md).

### constitution

The files an agent that changes or reviews code reads first: the [pipeline](#pipeline)'s `constitution` list, or
`<data>/briefs/defaults/constitution.md` (`ROLES_GIVEN_THE_CONSTITUTION`). Home: [Roles and
launch](architecture/roles-and-launch.md).

### context roll-over

The swap to a fresh [Assistant](#assistant): an idle one at `ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH` is stopped, and the
next delivery goes to a new one (`deliverIncidentsWhenIdle`). Home: [Assistant and
intake](architecture/assistant-and-intake.md).

> **As built.** [A past usage marker skips it](reference/known-gaps.md#gap-stale-usage-marker-stops-delivery).

### control command

One typed change to a board, `ControlCommand` in `src/shared/@types/ControlCommand.ts`. A verb, a [relayed
command](#relayed-command) and the Overseer's API all reach the same code through it. A button on the [Bridge](#bridge)
is a control that sends one. Home: [Control and Hatch](architecture/control-and-hatch.md).

### crash bound

`JOB_RESUMES_BEFORE_FRESH`, the number of [crash resumes](#crash-resume) a job gets, counted in `crashResumes`, before
the [Playbook](#playbook) replaces it instead of resuming it. Home: [Failure and
recovery](architecture/failure-and-recovery.md).

### crash resume

A [resume](#resume) after an interruption with a crash cause. It adds one to the job's `crashResumes`; other causes add
nothing. Home: [Failure and recovery](architecture/failure-and-recovery.md).

### cursor

`Job.eventCursor`, the last Watcher event the Overseer applied, as instance and sequence, written in the [lock
hold](#lock-hold) that applied it. The Bridge's transcript cursor is a separate value. Home:
[Watchers](architecture/watchers.md).

### Customs

The code that verifies what a session left, `src/services/lifecycle/Customs.ts`: it checks the [report](#report)'s
claims against git and the ticket body instead of believing them. A role's Customs column is the ordered list of
checks it owes (`CHECKS_OF_ROLE`). Home: [Customs and gates](architecture/customs-and-gates.md).

### data folder

`.forge/` in the repository root (`DATA_FOLDER`), written `<data>` in these documents. It holds the
[tracker](#tracker). Home: [On-disk atlas](data-model/on-disk-atlas.md).

### decider

A function that takes facts, returns a verdict and fails closed. It acts on nothing and words nothing. Home: [Deciders
and bounds](reference/deciders-and-bounds.md).

### decision

A question for User, `E<n>`, stored in `progress.json` while open (`Decision`, `DecisionKind`). Home: [Questions and
incidents](architecture/questions-and-incidents.md).

### default move

The stored `defaultMove` of an [incident](#incident): the [move](#move) code takes if the Assistant settles nothing.
Home: [Questions and incidents](architecture/questions-and-incidents.md).

### delivered

The ticket status that means the work landed on the main line, shown as `Done`; the ticket's own row follows it. A
closed [review bar](#review-bar) also reads `delivered`, which says only that the review ended. Compare
[reviewed](#reviewed). Home: [State machines](data-model/state-machines.md).

### dispatch

A surviving name for launching jobs. See [Words that mean several things](#words-that-mean-several-things).

### display state

What a row or ticket shows (`DisplayState`): its stored status, except for the derived `reviewing`. See [Status
words](#status-words).

### draft ticket

A ticket with status `draft`: filed, not yet ready, with no row. `ticket ready` moves it to `pending`. It differs from a
[filing draft](#filing-draft). Home: [State machines](data-model/state-machines.md).

### epic

A named collection of tickets, `<data>/epics/<key>.md`. It has no lifecycle: its progress is a roll-up over the tickets
naming it (`EpicRollup`). Home: [Entities](data-model/entities.md).

### epic colour slot

The stored `slot` number on an epic, assigned once at `epic add`, which picks its colour (`EPIC_COLOUR_SLOT_COUNT`).
Home: [Entities](data-model/entities.md).

### escaped bug

A bug naming a delivered ticket in its [introducedBy](#introducedby) field, counted by `review-stats`
(`EscapedBugCounts`). Home: [Measurement](architecture/measurement.md).

### event broker

`EventBroker`, one per Overseer generation, which holds the event ids and replay buffer of `GET /api/events`. Home:
[Overseer API](reference/overseer-api.md).

### event log

`<data>/jobs/J<n>/events-<instance>.ndjson`, the events one [Watcher instance](#watcher-instance) wrote. It differs from
the board's [log](#log). Home: [Watchers](architecture/watchers.md).

### failed pass

A job on a ticket that ended `failed` or `does-not-hold`, counted by `FailedPassUtil`; enough of them [park](#park) the
ticket. A review that sends a finished build back counts toward the [handoff cycle](#handoff-cycle) instead. Home:
[Build and review](architecture/build-and-review.md).

### fake agent

`FakeAgentAdapter`, an [adapter](#vendor-seam) that scripts a session for specs. It lives in `src/testing/` yet ships,
because `agentAdapterOfThisProcess` chooses it when `fakeAgentIsOn`. Home: [Guards and
testing](development/guards-and-testing.md).

### fence

`HoldFence.requireStillHeld`, checked before every write of a [lock hold](#lock-hold): it throws once the lock was taken
over, so a stale holder writes nothing further. Home: [Storage](data-model/storage.md).

### filing draft

A working record `D<n>` in `<data>/filing-cabinet/` that a filing session builds tickets from. It is never a ticket: no
status, row or move (`src/lib/tracker-model/Drafts.ts`). Home: [Assistant and
intake](architecture/assistant-and-intake.md).

### finding

Something a review found, recorded with class, severity and outcome (`ReviewFinding`), or a low-priority ticket a job
filed through its Hatch, which waits in `dependsOn` for the ticket that found it. See [Words that mean several
things](#words-that-mean-several-things). Homes: [Measurement](architecture/measurement.md), [Assistant and
intake](architecture/assistant-and-intake.md).

### fingerprint

A hash of what a [Pass](#pass) observes, never of time (`fingerprintOf`). An unchanged fingerprint skips the Pass. Home:
[The Pass](architecture/the-pass.md).

### first message

The task a session starts from, `AgentLaunchRequest.firstMessage`. It travels on stdin, never in argv, and a resumed
instance never receives it again. Home: [Roles and launch](architecture/roles-and-launch.md).

### fixer

One of a review's moves in build and review code: the ticket goes back to a builder. See [Words that mean several
things](#words-that-mean-several-things). Home: [Build and review](architecture/build-and-review.md).

### forced Pass

A [Pass](#pass) that runs even when the [fingerprint](#fingerprint) is unchanged, because something that moved nothing
on disk woke it: `wake(true)`, as a restart or a quiet job does. Home: [The Pass](architecture/the-pass.md).

### foundInReview

The ticket frontmatter field naming the ticket whose review found this one. Home:
[Measurement](architecture/measurement.md).

### frame

One JSON object on a Watcher's socket, in either direction (`ClientFrame`, `WatcherFrame`). An acting frame, `write`,
`close-input` or `stop`, acts on the child. See [Protocol 1](architecture/watchers.md#protocol-1). Home:
[Watchers](architecture/watchers.md).

### free-standing row

A [row](#row) with neither `ticket` nor `reviewOf`: tracked work that belongs to no ticket. Compare [own row](#own-row)
and [review bar](#review-bar). Home: [Entities](data-model/entities.md).

### gate

One named check in the [pipeline](#pipeline) (`PipelineGate`), run on a tree by `GateRun`. Its outcome is `passed`,
`failed` or `cannot-run`. Home: [Customs and gates](architecture/customs-and-gates.md).

### gate slot

One of the machine-wide files in `<monitor>/gate-slots/` that cap gate runs (`GateRunSlots`, `GATE_RUNS_AT_ONCE`). Home:
[Customs and gates](architecture/customs-and-gates.md).

### gate-ran

The [log](#log) record of one gate run on a tree, with `tree`, `outcome` and `cached`. An Airlock reads the newest one
to skip gating a tree that already passed. Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### generation

The number in a lock record `generation-<n>` or a Baton file `baton-<n>.json`. Each is created exclusively and never
rewritten, so the newest number decides. Homes: [Storage](data-model/storage.md), [Baton](architecture/baton.md).

### group

Tickets sharing a `group` field that land on a `group-<name>` branch and reach the main line together. Home: [Airlocks
and groups](architecture/airlocks-and-groups.md).

### guard

A spec that reads the real tree and fails when a rule is broken, proving first that its scan found something. Home:
[Guards and testing](development/guards-and-testing.md).

### guard hook

The `PreToolUse` hook `forge hook bash-domains`, which refuses network domains off the list that [auto
mode](#auto-mode)'s classifier would grant. Home: [Confinement](architecture/confinement.md).

### Handoff

The `## Handoff` section of a ticket, which the Overseer writes from the `handoff` field of the builder's
[report](#report). In lower case, a handoff is the moment a session ends and the Overseer verifies what it left and
writes that section. Home: [Build and review](architecture/build-and-review.md).

### handoff cycle

How many times the same work has been resumed after its session ended, counted per job kind, ticket set and attempt
from the log (`handoffCycleResumesOf`). For a build, each review that sent the work back also counts. Home: [Build and
review](architecture/build-and-review.md).

### Hatch

The folder `<worktrees>/hatch/J<n>/` through which a confined session sends requests and reads replies. Home: [Control
and Hatch](architecture/control-and-hatch.md).

### hold

Four different things share this word: a [ticket hold](#ticket-hold), a [lock hold](#lock-hold), an [install
hold](#install-hold) and a review that does not hold. See [Words that mean several
things](#words-that-mean-several-things).

### hold journal

`<data>/hold-journal.json`, the redo journal of a [lock hold](#lock-hold). The next lock holder replays a lock hold cut
short. Home: [Storage](data-model/storage.md).

### incident

Operational trouble addressed to the Assistant, `I<n>`, with a default move if nobody settles it (`Incident`,
`IncidentKind`). Home: [Questions and incidents](architecture/questions-and-incidents.md).

### install hold

The state in which an Overseer launches and resumes nothing because the [install version](#install-version) changed
under it, runtime state `held-by-install-change`. Its API answers most commands 423. A [Baton pass](#baton-pass) ends
it. Home: [State machines](data-model/state-machines.md).

### install marker

`session-instructions.md` or `agent-brief.md`, whose presence tells the version check an install exists. See [Words that
mean several things](#words-that-mean-several-things). Home: [CLI and install](architecture/cli-and-install.md).

### install version

`INSTALL_VERSION`, bumped by hand, stored in `<data>/version.json`. It states which CLI the installed files match.
Compare [code version](#code-version). Home: [CLI and install](architecture/cli-and-install.md).

### installed brief

One of the nine instruction files the install's `briefs` part writes into `<data>`. It differs from a ticket's
[Brief](#brief). Home: [CLI and install](architecture/cli-and-install.md).

### instruction file

A file that tells a session how to work: a [constitution](#constitution) file or a [role brief](#role-brief).
`InstructionFiles` reads them from `<data>` or the main line, never from the branch. Customs check V11 refuses a branch
that changes a tracked one unless its ticket names it. Home: [Roles and launch](architecture/roles-and-launch.md).

### intake

A [product owner](#product-owner)'s filing conversation, started by `forge intake -- <text>` or the Bridge's
Intake view. It ends with a `ready-drafts` decision. Home: [Assistant and intake](architecture/assistant-and-intake.md).

### integrated

The landing kind for a group branch (`LandingKind`). A ticket that integrated is `reviewed`, waiting for its group's
release. Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### introducedBy

The frontmatter field on a bug naming the delivered ticket whose change introduced it. Home:
[Measurement](architecture/measurement.md).

### job

The board's unit of work, `J<n>`, stored in `progress.json` while unsettled (`src/lib/tracker-model/@types/Job.ts`). A
merge or refresh job runs no agent of its own. Home: [Watchers](architecture/watchers.md).

### job kind

`JobKind`: `build`, `review`, `merge`, `merge-agent`, `refresh`, `assistant`, `product-owner` or `onboarder`. It differs
from a job's [role](#role). Home: [Entities](data-model/entities.md).

### landing

Moving a gated commit onto its [target](#target), `src/services/lifecycle/Landing.ts`. The word covers both targets; the
outcome `landed` means the main line and `integrated` a group branch. Home: [Airlocks and
groups](architecture/airlocks-and-groups.md).

### launch file

`<data>/jobs/J<n>/launch-<instance>.json`, which tells a Watcher what to spawn and where, and names the owner-only file
of its secret (`WatcherLaunch`). Sessions are denied reading it. Home: [Watchers](architecture/watchers.md).

### launch slot

Room for one more build or review job under the [concurrency limit](#concurrency-limit), counted from jobs by
`LaunchSlotUtil`: the Playbook's `freeSlotsOf`, `status`, the [Next line](#next-line) and the Bridge header all read
this one count. The Overseer serves which jobs hold one as `launchSlots` in `BoardState`, and the Bridge's activity
strip shows one chip per slot job. Home: [The Pass](architecture/the-pass.md).

### liveness

The verdict on one [Watcher instance](#watcher-instance) from its record and the process table,
`WatcherFleet.livenessOf`: `unclaimed`, `live`, `ended` or `lost`. It says nothing about the agent. Home:
[Watchers](architecture/watchers.md).

### lock hold

One `writeTracker` run under the board's lock, holding every write of one change. Home:
[Storage](data-model/storage.md).

### log

`<data>/log.jsonl`, the board's typed record of what happened, which the Playbook also reads back. It differs from an
[event log](#event-log). Homes: [Storage](data-model/storage.md); kinds in [CLI reference](cli.md).

### main checkout

The checkout that holds the shared `.git` folder, where the [main line](#main-line) lands. Every [worktree](#worktree)
is linked to it. Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### main line

The repository's main branch, the [target](#target) of every ungrouped ticket and of a release ticket. Home: [Airlocks
and groups](architecture/airlocks-and-groups.md).

### managed block

The text between `<!-- forge:managed:start -->` and its `:end` marker in a repository's `CLAUDE.md`. This
build never writes it: `init` and `update` remove it, and a target that has it committed stops launches and resumes on
that target. The released program's block carries its own name and this build leaves it alone.
Home: [CLI and install](architecture/cli-and-install.md).

### marker

A small file or text mark whose presence records a fact. See [Words that mean several
things](#words-that-mean-several-things).

### merge agent

A job of kind `merge-agent`, with the role of the ticket's most recent agent, `builder` or `reviewer`, working under a
merge job (`parentJobId`). It resolves a conflict or fixes a red merged tree in the [Airlock](#airlock), and resumes
that agent's session when it can. Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### merge job

A job of [kind](#job-kind) `merge`, with no role and no agent of its own, that carries one ticket through the
[Airlock](#airlock) phases. It holds the [Airlock slot](#airlock-slot) and may launch a [merge agent](#merge-agent).
Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### merge queue

The tickets whose review passed, waiting per target to land (`mergeQueued` on the row, `MergeQueueFacts`). They stay
`in-review` while they wait. Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### merged tree

The tree a [target](#target) would receive: the target's tip merged with the branch. An Airlock gates this, not the
branch. Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### monitor folder

`~/.forge-monitor/`, written `<monitor>` in these documents: the machine-wide folder shared by every board.
It holds the registry, Watcher sockets, [gate slots](#gate-slot) and the [usage marker](#usage-marker). Home: [On-disk
atlas](data-model/on-disk-atlas.md).

### move

A named action. On an [incident](#incident) it is an `IncidentMove`, named after its [control
command](#control-command); on a ticket it is a status transition; a review's move is what `settleReviewPass` picks. See
[Words that mean several things](#words-that-mean-several-things).

### Next line

The last line a human-facing command prints, starting `Next:` (`NextLineUtil`). It reports [launch
slots](#launch-slot) and ready tickets. Home: [CLI reference](cli.md).

### notice

A warning the Overseer shows and nobody answers (`OverseerNotice`), such as `dirty-main-checkout`. Home: [Questions and
incidents](architecture/questions-and-incidents.md).

### onboarder

The job kind and role that reads a repository and proposes its [pipeline](#pipeline), or advises on the one it has. It
never touches a ticket. Home: [Customs and gates](architecture/customs-and-gates.md).

### orchestrator

Used only for the optional interactive wrapper session. See [Words that mean several
things](#words-that-mean-several-things).

### OS sandbox

Confinement the operating system enforces on a process. The vendor's sandbox holds a session's Bash and its children;
[Seatbelt](#seatbelt) holds gate, prepare and install processes. Home: [Confinement](architecture/confinement.md).

### Overseer

The one long-running process that owns a board, started by `forge oversee`. Its [Pass](#pass) launches every
job. Home: [The Pass](architecture/the-pass.md).

### own row

The [row](#row) a ticket holds through its `ticket` key, its bar on the chart. Compare [review bar](#review-bar) and
[free-standing row](#free-standing-row). Home: [Entities](data-model/entities.md).

### pace path

The dependency chain from the last [wave](#wave) back to the first (`pacePathNodeIds`). The Bridge's run order takes its
tickets first within a priority. Home: [Bridge](architecture/bridge.md).

### park

To hold a ticket `parked:<cause>` and open a `parked` [decision](#decision) for User. A Playbook step and the `ticket
park` verb both do this. Home: [State machines](data-model/state-machines.md).

### Pass

One turn of the Overseer's loop, `runOnePass` in `src/services/overseer/DrivePass.ts`: observe, apply, run the
[Playbook](#playbook), then act. Home: [The Pass](architecture/the-pass.md).

### pipeline

The board's `<data>/pipeline.json`: prepare steps, [gates](#gate), and optional review, constitution and agent settings
(`Pipeline`). Meaning: [Customs and gates](architecture/customs-and-gates.md). Fields: [CLI reference](cli.md).

### Playbook

The pure function that derives what runs next from the board and the Overseer's observations,
`src/lib/tracker-model/Playbook.ts`. It reads no clock, file or process. Home: [The Pass](architecture/the-pass.md).

### prepare step

A `pipeline.json` step that sets a tree up before the gates run (`PipelineStep`). Home: [Customs and
gates](architecture/customs-and-gates.md).

### process Watcher

A [Watcher](#watcher) of [kind](#watcher-kind) `process`, which runs a build or review job's install or gate instead of
a session. It has no session to resume, so losing it costs its job. `oversee stop --now` stops only these. Home:
[Watchers](architecture/watchers.md).

### processless state

A job state with no process behind it, `PROCESSLESS_JOB_STATES`: `interrupted` or `awaiting-answer`. A move from one
into `running` is a [resume](#resume). Home: [State machines](data-model/state-machines.md).

### product owner

The job kind and role that runs a filing intake and writes draft tickets, and the skill `forge-po` it loads. Home:
[Assistant and intake](architecture/assistant-and-intake.md).

### projection

What the [Bridge](#bridge) is: a view of one document replaced whole, never a store. Closing the page loses no record.
Home: [Bridge](architecture/bridge.md).

### publish

One complete re-read of the board sent to the browser, `publishState`, after every [Pass](#pass) that does not throw. It
differs from an event, and no publish depends on the one before. Home: [Bridge](architecture/bridge.md).

### reach

One use of a process-wide API such as `process.env`. `CONFINED_REACHES` in `eslint.config.js` confines each to its
allowed files. Home: [Guards and testing](development/guards-and-testing.md).

### readiness position

A ticket's place in the [log](#log): the position of its latest `ticket-readied` or `ticket-reopened` record. Among
ready tickets of one priority it sorts the earlier first (`readinessPositionByTicketId`). Home: [Deciders and
bounds](reference/deciders-and-bounds.md).

### ready

As a verb, to move a [draft ticket](#draft-ticket) to `pending` with `ticket ready`, which checks its Acceptance and
Brief. As an adjective, a ticket `readyTicketIdsOf` lists, which may start now. Home: [State
machines](data-model/state-machines.md).

### recorded ticket

A ticket with at least one `review-recorded` log record, the only tickets `review-stats` counts. Home:
[Measurement](architecture/measurement.md).

### red handoff

A handoff whose gate or Customs check went red (`handoff-red`). The same session is resumed to fix it. Its note is
`gate-failure.md`, the red-handoff note. Home: [Build and review](architecture/build-and-review.md).

### red-handoff note

`gate-failure.md`, the note a [red handoff](#red-handoff) leaves for the resumed session (`RedHandoff.ts`). Its text
says Baton pass, which here means no Overseer hand-over. Home: [Build and review](architecture/build-and-review.md).

### refresh

A job of kind `refresh` that merges the main line into a group branch, under its target's Airlock. Home: [Airlocks and
groups](architecture/airlocks-and-groups.md).

### refusal

A deliberate no, carried as data: `OperationRefusal` with status `refused` or `unrepaired`, or a `BoardRefusal` for a
Board rule. Home: [Refusals](reference/refusals.md).

### Regrouping

What a starting Overseer does before its first Pass: it reattaches live Watchers from their [cursors](#cursor) and
cleans up what died (`src/services/overseer/Regrouping.ts`). Home: [Failure and
recovery](architecture/failure-and-recovery.md).

### relayed command

A verb run inside a job that travels through the job's [Hatch](#hatch) and is applied by the Overseer (`jobRouteOf`
answers `relayed`). The session never touches the board itself. Home: [Control and
Hatch](architecture/control-and-hatch.md).

### release bundle

A group's open [release ticket](#release-ticket) plus every ticket of the group it depends on (`ReleaseBundleUtil`).
Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### release ticket

The one open ticket of a group marked `releasesGroup: true`, whose landing on the main line delivers the bundle. Home:
[Airlocks and groups](architecture/airlocks-and-groups.md).

### release-behind-group

The refusal of a [release ticket](#release-ticket) whose branch lacks the [group](#group)'s tip, from `releaseGapOf`
before merge-in. Home: [Airlocks and groups](architecture/airlocks-and-groups.md).

### released program

`agent-progress`, the program on `main`, as opposed to this build. See [Reading names](#reading-names). Home:
[Porting](development/porting.md).

### report

The JSON a session leaves as its result, checked against its role's schema (`src/adapters/reports/ReportSchemas.ts`).
Home: [Customs and gates](architecture/customs-and-gates.md).

### request

A session's file in its [Hatch](#hatch), or one [AskUserQuestion](#askuserquestion) call, each with a `requestId`. See
[Words that mean several things](#words-that-mean-several-things).

### result

The vendor's event that closes a session's turn (`AgentSessionEvent` kind `result`), carrying its [report](#report). On
a job that reports, it moves the job to `in-customs`. Home: [Control and Hatch](architecture/control-and-hatch.md).

### resume

A job's move into `running` from a [processless state](#processless-state): the next [Watcher
instance](#watcher-instance) carries on the same [session](#session). It differs from a fresh job, which starts a new
one. Home: [State machines](data-model/state-machines.md).

### review bar

A chart row of its own, not the ticket's [row](#row), carrying `reviewOf`, in which one review of a ticket runs
(`src/lib/tracker-model/ReviewBars.ts`). Home: [Build and review](architecture/build-and-review.md).

### review pass

The label `review-stats` prints for one kept `review-recorded` line, one per ticket and [review round](#review-round).
Prose says review round. Home: [Measurement](architecture/measurement.md).

### review round

One review of a ticket, numbered by `reviewBarRound` on its bar and by `## Review <n>` in the body. Home: [Build and
review](architecture/build-and-review.md).

### reviewed

The ticket and row status shown as `Awaiting merge`. A [group](#group) ticket rests here on its group branch until the
release; a main-line ticket passes through it as the merge lands (`landOnTheBoard`, `releaseTickets`). Home: [State
machines](data-model/state-machines.md).

### reviewer

The job role that reviews a ticket's change from its Handoff and reports. Home: [Roles and
launch](architecture/roles-and-launch.md).

### rework

The code lines a reviewer's own fixes changed, counted by `ReworkCountUtil` from the review's start commit to its head.
It decides the [round verdict](#round-verdict), against `REWORK_ROUND_THRESHOLD_LINES`. Home: [Build and
review](architecture/build-and-review.md).

### role

`JobRole`, what an agent is in a job: `builder`, `reviewer`, `assistant`, `product-owner` or `onboarder`. A
[merge agent](#merge-agent) takes `builder` or `reviewer`. Home: [Roles and launch](architecture/roles-and-launch.md).

### role brief

The instruction file for one [role](#role), by default `<data>/briefs/defaults/<role>.md`, or what the
[pipeline](#pipeline)'s `agents` array names. It differs from a ticket's [Brief](#brief). Home: [Roles and
launch](architecture/roles-and-launch.md).

### root override

The environment variable `FORGE_ROOT`, which names the repository to use with no walk up from the working
directory. Each program reads only its own. Variables: [CLI reference](cli.md). Home: [Guards and
testing](development/guards-and-testing.md).

### round verdict

Whether another review round is granted (`RoundVerdictUtil.nextRoundVerdictOf`): rework must exceed its threshold, and
later rounds must also show the findings converging. Home: [Build and review](architecture/build-and-review.md).

### row

One line of the progress chart, the `Task` record, numbered and stored in `progress.json`. A ticket gets one when
readied, except a low-priority ticket, which gets one when it starts or its priority is raised; a ticket without one
that is abandoned before it started stays without one. Code says `task`. Home: [Entities](data-model/entities.md).

### scratch root

The canonical `tmpdir()`, the only place specs may work; `src/testing/TrackerIsolation.ts` refuses every way out of it.
Home: [Guards and testing](development/guards-and-testing.md).

### seam

The one place the core meets something a port may replace. Six exist, and only the [vendor seam](#vendor-seam) chooses
an implementation at one guarded point. Home: [Porting](development/porting.md).

### Seatbelt

macOS's `sandbox-exec`. A profile from `ProcessWatcherSandbox` holds gate, prepare and install processes, which run
outside any session, a proposal's lines excepted. Where it cannot apply, they run unconfined. It differs from a [worker
profile](#worker-profile). Home: [Confinement](architecture/confinement.md).

### serious finding

A finding of severity `would-ship-a-bug` or `acceptance-fails` (`SERIOUS_FINDING_SEVERITIES`). Home:
[Measurement](architecture/measurement.md).

### session

One conversation with the vendor's agent CLI, Claude Code, named by `sessionIdOf`. A build job sent back by its review
resumes its predecessor's session, so a session can outlive a job. Home: [Watchers](architecture/watchers.md).

### session owner

The job whose [session](#session) a job carries on: an earlier builder for a build sent back by its review, otherwise
the job itself (`sessionOwnerJobIdOf`). Home: [Roles and launch](architecture/roles-and-launch.md).

### settled

Finished, for good, and said of several things. See [Words that mean several things](#words-that-mean-several-things).

### settled fingerprint

The [fingerprint](#fingerprint) `runOnePass` kept from the last Pass that left no unapplied events (`lastFingerprint`).
A wake that observes the same one skips the Pass, unless forced. Home: [The Pass](architecture/the-pass.md).

### side-by-side build

This build under `PRODUCT_NAMES`, whose names differ from the [released program](#released-program)'s so both fit on one
machine. It alone refuses an install beside the other's data folder (`older-program-present`). Home:
[Porting](development/porting.md).

### source mutant

One text rewritten in one module as Bun bundles it (`src/testing/SourceMutant.ts`), so a claim can be watched failing. A
text not found exactly once fails the build. Home: [Guards and testing](development/guards-and-testing.md).

### stale lock

A held lock record whose process is gone or whose stamp is older than `LOCK_STALE_MILLISECONDS`. The next taker takes it
over, even from a live holder; the [fence](#fence) then stops that holder's writes. Home:
[Storage](data-model/storage.md).

### standing reply

A rule that lets a Watcher answer a line on the session's stdout without the Overseer (`StandingReply`). A line no
rule matches waits for the Overseer. Home: [Watchers](architecture/watchers.md).

### successor

The Overseer that follows another, on the code on disk: in a [Baton pass](#baton-pass), or after one died. Home:
[Baton](architecture/baton.md).

### sweep

The Overseer's timed backstop [wake](#wake) (`OVERSEER_SWEEP_SECONDS`). A job's silent sweeps count those its
[cursor](#cursor) stood still for. It differs from the [Airlock sweep](#airlock-sweep). Home: [The
Pass](architecture/the-pass.md).

### target

`Job.target`: the main line or a `group-<name>` branch that a job's work goes to. Home: [Airlocks and
groups](architecture/airlocks-and-groups.md).

### task

The code's name for a [row](#row).

### ticket

A Markdown work item, `<data>/tickets/`, known by its frontmatter `id` such as `#003`, never by its file name. Home:
[Entities](data-model/entities.md).

### ticket hold

The frontmatter field `hold`, whose presence stops launches on that ticket. Home: [State
machines](data-model/state-machines.md).

### tracker

The `<data>` folder and its files, the on-disk form of a [board](#board). Commands find it from the working directory.
Home: [On-disk atlas](data-model/on-disk-atlas.md).

### twice-run

Running a proposed [pipeline](#pipeline)'s gates `PROPOSAL_RUN_COUNT` times on one folder (`ProposalTwiceRun`), to catch
a flaky gate and one that leans on what the first run left. Home: [Customs and
gates](architecture/customs-and-gates.md).

### undriven gap

The moment in a [Baton pass](#baton-pass) when neither Overseer drives the board: the old one closed its listener and
the successor has not claimed. Watchers run through it. Home: [Baton](architecture/baton.md).

### usage marker

`<monitor>/usage-limit.json`, machine-wide, which stops launches on every board until its `resetsAt`. Home: [Failure and
recovery](architecture/failure-and-recovery.md).

### User

The person running the board, written with a capital, matching the code. A document's reader is 'you', and the project's
owner is 'the owner'. Home: [State machines](data-model/state-machines.md).

### vendor seam

The `AgentAdapter` interface in `src/lib/agent-launch/AgentAdapter.ts`, the one path from launch and session code to the
vendor's agent CLI. Home: [Roles and launch](architecture/roles-and-launch.md).

### verb

One `forge` command, an entry in `COMMAND_TABLE`, such as `ticket ready`. Home: [CLI reference](cli.md).

### view model

The pure data a Bridge view renders, derived from the board state by a `*Model.ts` module beside the view. Home:
[Bridge](architecture/bridge.md).

### waiver

Dropping an Acceptance item: a session proposes it and a `waiver` [decision](#decision) asks User. An item written
`A<n>. Waived: <reason>` is waived. Home: [Build and review](architecture/build-and-review.md).

> **As built.** [Answering the decision does not apply it](reference/known-gaps.md#gap-waiver-answer-has-no-effect).

### wake

A request for a [Pass](#pass), `DrivePass.wake`. Wakes during a Pass add exactly one more. Unless
[forced](#forced-pass), the Pass stops at an unchanged [fingerprint](#fingerprint). Home: [The
Pass](architecture/the-pass.md).

### Watcher

The small detached process that holds one session and logs its events, `watcher.ts` and `src/lib/watcher/Watcher.ts`. It
outlives the Overseer. Home: [Watchers](architecture/watchers.md).

### Watcher instance

One spawn of a Watcher for a job, numbered by `Job.watcherInstance`. Its files carry the number. Home:
[Watchers](architecture/watchers.md).

### Watcher kind

`WatcherKind`: `agent` holds a session, `process` runs a gate or install as a [process Watcher](#process-watcher). The
kind sets which [frames](#frame) a Watcher accepts. Home: [Watchers](architecture/watchers.md).

### wave

A Bridge grouping of open tickets by the open dependencies in front of them (`DependencyGraphUtil`). Drafts and pending
low-priority tickets enter no wave, yet still hold their dependents out of Now. It says nothing about readiness, which the
`Board` class decides. Home: [Running a board](operations/running-a-board.md).

### wind-down

The message that asks a session to finish and report, and the stop mode `wind-down` User can request. Home: [Control and
Hatch](architecture/control-and-hatch.md).

### worker

A job role under the [Bouncer](#bouncer)'s worker rules, `WORKER_ROLES` in `src/services/control/Bouncer.ts`: `builder`
or `reviewer`. Home: [Control and Hatch](architecture/control-and-hatch.md).

### worker profile

`WorkerProfile`, a role's permissions as neutral data, from `profileOf`. An adapter renders it into vendor settings and
flags. It differs from a [Seatbelt](#seatbelt) profile. Home: [Confinement](architecture/confinement.md).

### worktree

A linked git checkout of its own: `<worktrees>/ticket-<id>/` for a ticket, `<worktrees>/group-<name>/` for a group. A
refresh job uses a temporary detached `<worktrees>/refresh-group-<name>/`. Home: [Build and
review](architecture/build-and-review.md).

### worktrees folder

`.forge-worktrees/` in the repository root, written `<worktrees>` in these documents. It holds
[worktrees](#worktree) and the [Hatch](#hatch) folders. Home: [On-disk atlas](data-model/on-disk-atlas.md).

### write-set

What a [lock hold](#lock-hold) must write, the change lists `BoardRecords` keeps: `changedTicketRecords`,
`loggedRecords` and the like. Home: [Entities](data-model/entities.md).

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Product names | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES`, `ORIGINAL_PRODUCT_NAMES` | `src/ProductNames.spec.ts` |
| Hard-coded product names | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `src/ProductNameLiterals.spec.ts` |
| Decided component names | every tracked file | `RETIRED_NAMES` | `src/ComponentNames.spec.ts` |
| Bridge status words | `bridge/utils/DisplayStateWordingUtil.ts` | `DisplayStateWordingUtil` | `bridge/utils/DisplayStateWordingUtil.spec.ts` |
| Derived display state | `src/lib/tracker-model/DisplayQueries.ts` | `displayStateFor` | `src/lib/tracker-model/Board.displayQueries.spec.ts` |
