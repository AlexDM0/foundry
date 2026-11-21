# Glossary

> **Question:** What does this word mean here, and which of its meanings is this?
> **Time:** about 10 minutes for the tables before A to Z; after that, look words up.
> **Read first:** nothing.
> **Next:** [Overview](concepts/overview.md), [Ticket lifecycle](concepts/ticket-lifecycle.md), [Docs index](README.md).

## In one screen

`forge` runs AI coding agents on a repository's [tickets](#ticket) and lands their work on the
[main line](#main-line). A [board](#board) is one repository's tickets and everything kept about them. Most of the
eleven capitalised names sit on one ticket's path, and the rest act beside it. Learn where each one sits and most other
words follow.

Most of the eleven names sit on one path from User to the main line. User works through a client of the API. Inside
Hephaestus the Pass runs the Playbook and has Talos run a session, whose requests pass the Hatch and the Bouncer and whose
result passes Customs and the Airlock. Beside that path the Assistant takes incidents, and the Baton and Regrouping act
across Hephaestus restarts.

A [session](#session) never touches the board directly: what it sends through the Hatch passes the Bouncer, and what it
says in its event stream and final report is read by Hephaestus and checked by Customs. Gates and reviews are left out
of this path to keep it short.

Several words mean different things in different places: pass, slot, draft, hold and others. If a word could mean two
things, read [Words that mean several things](#words-that-mean-several-things). For anything else, go to
[A to Z](#a-to-z).

A definition here is short. Bounds and values are not repeated here.

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
| `forge-pipeline` | the pipeline setup skill the pipeline agent runs | `PIPELINE_SETUP_SKILL` |

Other files show the released spelling, listed in `ORIGINAL_PRODUCT_NAMES`, for three reasons:

- Source paths keep it: `agent-progress.ts`, `skills/agent-po/`, `skills/agent-pipeline/`.
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

Read the row that fits the context. Component names are capitalised, like the eleven under [In one screen](#in-one-screen).

| Word | Meaning | How to recognise it |
| --- | --- | --- |
| **pass** | the [Pass](#pass), Hephaestus's loop | capitalised; `runOnePass`, `passes` |
| | a [failed pass](#failed-pass), a bound on a ticket's jobs | only in "failed pass"; `FailedPassUtil`, `FAILED_PASSES_BEFORE_PARKING` |
| | a review pass, the same thing as a [review round](#review-round) | code comments, `reviewPassCount`; this documentation says review round |
| | a [Baton pass](#baton-pass), the Hephaestus hand-over | `src/services/hephaestus/BatonPass.ts` |
| | the red-handoff note, `gate-failure.md` | "The Baton pass is in ..." in `RedHandoffMessage.md`; `batonPass` in `RedHandoff.ts`. No Hephaestus hand-over is involved |
| **phase** | a [gate phase](#gate-phase): `build`, `review` or `merge` | `phases` in `pipeline.json`, `greenPhase` on a row, `GatePhase` |
| | an Airlock phase, how far a merge, refresh or constitution commit job is | `airlock.phase`: `merge-in` … `landing`, `AirlockPhase` |
| | a setup step of a [setup record](#setup-record) | `stepStates`, `currentStep`: `billing` … `apply` |
| **draft** | a [filing draft](#filing-draft), `D<n>` | `draft` verbs; no status, no [row](#row) |
| | a [draft ticket](#draft-ticket), status `draft` | `#003`; a real ticket, not yet ready |
| **slot** | a [launch slot](#launch-slot) | `LaunchSlotUtil` counts build and review jobs; Hephaestus launches by this, and `status` and the [Next line](#next-line) print it |
| | an [Airlock slot](#airlock-slot), one per [target](#target) | `slotHolderOf`, `Job.airlock`; held by a merge or refresh job |
| | a [gate slot](#gate-slot), machine-wide | files in `<monitor>/gate-slots/` |
| | an [epic colour slot](#epic-colour-slot) | the stored `slot` field, set at `epic add`; a colour, no capacity |
| **orchestrator** | the session that drove the board in the first version; no orchestrator exists in this build | [the overview](concepts/overview.md); the only use in these documents |
| | the Assistant, in surviving comments | `UsageMarkerFile.ts`, `ControlCommand.ts`: read as "Assistant" |
| **dispatch** | launching jobs; no dispatcher exists in this build | surviving names: `cli/dispatch/concurrency/`, `DISPATCH_PROTOCOL`, `DispatchQueries`, `dispatchCapacity` |
| | a retired stored record | the `dispatcher-set` log kind, read so an older log stays readable |
| **fixer** | a review's move | `fixer` in `settleReviewPass`: job ends `does-not-hold`, the ticket goes back to a builder |
| **render** | assembling the page payload | `assemblePagePayload`; Hephaestus sends it inside `BoardState` |
| | no command | there is no `render` verb, and no command rebuilds a page |
| **page** | the payload of a client's board view; forge serves no page | `AssembledPagePayload`, the `page` field of `BoardState` |
| **claim** | a report claim | the [builder](#builder) report's `gates`, the [reviewer](#reviewer) report's `claims`; never trusted |
| | a `review-recorded` claim | `ReviewClaim` in the log; counted by `review-stats` |
| | a retired ticket claim | the `ticket claim` verb is unknown; `Board.claimTickets` remains (as built) |
| | a filing-draft claim | `DraftClaim`: who holds the draft |
| **alive** | a live Baton | `BatonReading` verdict `live`: the newest generation names a running process |
| | a live child | `ChildLiveness`: `unlaunched` before Talos launched it, `live` while its child record says it runs, `ended` once Talos recorded its end, `lost` when its record cannot be read or says ended with no end |
| | an agent | no verdict of its own: read through its child, and `agent-crashed` or `talos-lost` says which died |
| **hold** | a [ticket hold](#ticket-hold) | frontmatter `hold`, such as `parked:<cause>` |
| | a [lock hold](#lock-hold) | one write of the store's local adapter (one `writeTracker` run), as in "in the same hold" |
| | an [install hold](#install-hold) | the runtime state `held-by-install-change` |
| | a review that does not hold | job outcome `does-not-hold`: the review sent the build back; nothing is held |
| **finding** | a recorded review finding | `ReviewFinding`, in a `review-recorded` record |
| | a filed finding | a low ticket a job filed through its Hatch, waiting in `dependsOn` for the ticket that found it |
| **sweep** | Hephaestus's timed [wake](#wake) | `HEPHAESTUS_SWEEP_SECONDS`, `DataFolderWatch`; "silent sweeps" (`silentSweepsOf`) counts those a job's [cursor](#cursor) stood still for |
| | the [Airlock sweep](#airlock-sweep), a step inside a Pass | `airlocks.sweep` |
| **marker** | the [usage marker](#usage-marker) | `<monitor>/usage-limit.json` |
| | a delivery marker | `.sent` and `.delivered` files in a job folder; each says a line went out, written after Talos took it, so a Hephaestus that dies in between sends it again: at least once |
| | an [install marker](#install-marker) | `session-instructions.md`: its presence tells the version check an install exists |
| **request** | a Hatch request | `<worktrees>/hatch/J<n>/requests/<requestId>.json`, a session's file for Hephaestus |
| | a question request | one `AskUserQuestion` call; `requestId` on the decision or in the incident's facts |
| **settled** | a job | ended, and out of `progress.json`; "unsettled jobs" are the stored ones |
| | a ticket | `delivered` or `abandoned`, `SETTLED_TICKET_STATUSES` |
| | a dependency | `reviewed` or `delivered`, `TICKET_STATUSES_THAT_SETTLE_A_DEPENDENCY`; a missing ticket counts as unsettled |
| | a decision or incident | answered, withdrawn or defaulted, and off the board |
| | a [fingerprint](#settled-fingerprint) | the one kept from a Pass that left no unapplied events |
| **move** | an incident move | `IncidentMove`, named after its control command |
| | a ticket move | a status transition; `Board.moveTicket`, the named verbs |
| | a job move | `Jobs.moveJob`, a change of job state |
| | a review's move | what `settleReviewPass` picks: `fixer`, `fresh-reviewer`, `waiver` or `merge-queued` |

> **As built.** The red-handoff text says Baton pass.

### Words often confused

These are different words for neighbouring things. Each row says what separates them.

| Words | Which is which | How to recognise it |
| --- | --- | --- |
| **gate**, **checks line** | a gate is one named check; the checks line is the gates joined into one shell line | `pipeline.json` entries, the word to use; `PipelineUtil`, surviving comments and prompts |
| **job** | the board's unit of work; it can span child instances | `J<n>`; settled by a `job-ended` log record |
| **child instance** | one launch of a job's child under Talos; a resume launches the next | `child-<n>.json`, `Job.childInstance` |
| **session** | the conversation with Claude Code; it can span jobs | `sessionIdOf`; a build sent back by review resumes it under a further job |
| **attempt** | a fresh try at a build, numbered on the job | `Job.attempt` |
| **reviewed**, **delivered** | `reviewed` is not yet on the main line; a ticket that is `delivered` is on it | shown `Awaiting merge` and `Done` |
| **Handoff**, **red handoff** | the Handoff is a ticket body section, the builder's account; a red handoff is the moment a session ended and verification failed | `## Handoff`; `handoff-red`, and the same session is resumed |
| **landing**, **landed** | landing is any move onto a target; landed is that outcome on the main line only | `src/services/lifecycle/Landing.ts`; `LandingKind`, whose group outcome is `integrated` |

> **As built.** Agent-facing text says checks line.

## Status words

The stored value is what `<data>/progress.json`, tickets, `status --json` and verbs use. The shown word is the one a
client's board view prints. Rules are in [Ticket lifecycle](concepts/ticket-lifecycle.md).

| Stored value | Stored on | A board view shows |
| --- | --- | --- |
| `draft` | ticket only | Draft |
| `committed` | ticket, row (none yet on a low-priority ticket) | To do |
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

### admin folder

`.git/worktrees/<name>`, the folder in the shared `.git` where git keeps a linked [worktree](#worktree)'s `HEAD` and
index. A session is denied every other worktree's.

### agent

An AI coding session launched for a job, running one [role](#role). This documentation says [session](#session) when the
conversation itself matters.

### Airlock

The code that lets one merge at a time into a [target](#target) and lands it, `src/services/hephaestus/Airlocks.ts`.

### Airlock phase

`airlock.phase`, the step a job holding an [Airlock slot](#airlock-slot) is at: `merge-in`, `resolving`, `re-reviewing`,
`gating`, `fixing`, `committing` (a [constitution commit](#constitution-commit) only) or `landing`. The job state stays
`merging`.

### Airlock slot

The one place per [target](#target) in its [Airlock](#airlock), held by a merge, refresh or constitution commit job
through `Job.airlock`
(`slotHolderOf`).

### Airlock sweep

The Airlocks' step inside a [Pass](#pass), `airlocks.sweep`, which claims and advances merges. It differs from the timed
[sweep](#sweep).

### alive

Three different things share this word. See [Words that mean several things](#words-that-mean-several-things).

### AskUserQuestion

The vendor's tool through which a session asks a question. Calling it is a [question request](#request), which opens a
[decision](#decision) or an [incident](#incident) (`QuestionRouting`). Roles that may not ask have it removed through
`--disallowedTools`.

### Assistant

The agent session of the one long-lived job of kind `assistant`, which a board has while its switch is on
(`gate assistant on`; off by default). It receives [incidents](#incident) before User does.

### attempt

`Job.attempt`, from 1. On a build job, one fresh try at the ticket: a fresh agent runs one higher, except a replacement
after a [red handoff](#red-handoff) and a builder resumed after review, which keep it. A review job stores its
[review round](#review-round) here; merge, refresh and merge-agent jobs store their own launch count.

### auto mode

The vendor's permission mode, `--permission-mode auto`, under which a classifier approves most tool calls without a
prompt. Every session runs in it, inside the other confinement layers.

### Baton

A file `<data>/hephaestus/baton-<n>.json` created exclusively at each Hephaestus start. The newest
[generation](#generation) decides: if it names a live process, that process is Hephaestus; if not, no Hephaestus is
running (`src/services/hephaestus/Baton.ts`).

### Baton pass

The hand-over from a running Hephaestus to its successor, `src/services/hephaestus/BatonPass.ts`, with no restart of
Talos or its children. The red-handoff text uses the same words for something else: see [Words that mean several
things](#words-that-mean-several-things).

### board

One repository's work as one model: tickets, rows, jobs, decisions, incidents and the log, read into the `Board` class.
The [tracker](#tracker) is the same thing on disk.

### `Board` class

The class in `src/lib/tracker-model/Board.ts` that holds a [board](#board) in memory and owns its rules. A command
builds one for each [lock hold](#lock-hold); it never touches a file.

### Bouncer

The pure table of which command, sent through the [Hatch](#hatch), each job role may run,
`src/services/control/Bouncer.ts`. The role comes from the Hatch folder's job record, never from the request.

### bound

A `SCREAMING_CASE` constant that limits a count, such as `FAILED_PASSES_BEFORE_PARKING`. A resume bound ends in a
[park](#park), a replacement or an incident; a [call budget](#call-budget) stops a session.

### Brief

The `## Brief` section of a ticket body, which is what its builder reads. Home: [CLI reference](cli.md).

### build job

A job of [kind](#job-kind) `build`, role `builder`, on one ticket's [worktree](#worktree).

### builder

The job role that does a ticket's work and reports.

### call

One top-level assistant turn of a session, however many tool calls it holds. `sessionReadingOf` counts distinct message
ids and leaves out subagents' turns. [Call budgets](#call-budget) spend these.

### call budget

The API turns of its own session, not its subagents', that a builder, reviewer or [merge agent](#merge-agent) may
spend, or an Assistant per turn (`DISPATCH_PROTOCOL`, `ASSISTANT_TURN_CALL_BUDGET`). A turn with several tool calls
counts once. Product-owner and pipeline agent sessions have none. What follows differs by role: a builder or reviewer
receives the [wind-down](#wind-down) message, a merge agent's merge is aborted, and an Assistant's turn ends.

### candidate

A ticket that could start. A launch candidate is what the [Playbook](#playbook) keeps with `candidateOf` and sorts with
`candidateOrder`; a merge candidate is what `mergeCandidatesOf` derives for a [target](#target).

### change size

The bucket `review-stats` files a builder's change under (`CHANGE_SIZE_BUCKETS`), from the lines a review measured. It
differs from the ticket's `size` field, which is the filer's estimate.

### checks line

The gates joined into one shell line by `PipelineUtil`. Prefer [gate](#gate). See [Words that mean several
things](#words-that-mean-several-things).

### child instance

One launch of a job's child under [Talos](#talos), numbered by `Job.childInstance`. Its files carry the number.

### child record

`child-<n>.json` in a child's folder, Talos's record of one child: who runs it, its working directory, its state, the
endings it recognised and its end (`exited`, `signalled`, `spawn-failed`, `paused`, `lease-ended` or `time-bound`) with
its run time. Talos replaces it atomically on each change; a reader gets a verdict, never a throw.

### claim

Five different things share this word. See [Words that mean several things](#words-that-mean-several-things).

### `claude` trap

A stub `claude` first on `PATH` during a test run, which records where it ran and exits non-zero, so no spec starts a
real session. One of the program traps, beside the `gpgconf` one (`src/testing/ProgramTraps.ts`). Home: [Guards and
testing](development/guards-and-testing.md).

### clean quit

How [Talos](#talos) ends without losing work: it refuses new launches, stops every line at once, asks every agent to
quit at the end of its turn, stops what still runs after 10 seconds and records every end. Its agents' jobs are
interrupted `talos-paused` and resume by themselves; a line ended `paused` runs again, never judged.

### code version

A content hash of the program's shipping files (`CodeVersion.onDisk`). It differs from the [install
version](#install-version), which a person bumps.

### cohort

One group of agents summarised on a line of `usage`: `All`, plus the groups before and after the instant `--since` names
(`UsageCohortUtil.cohortSplitAt`).

### commit point

The atomic rename that lands `hold-journal.json` whole. Before it a [lock hold](#lock-hold) changed nothing; after it
the hold always completes, by replay if need be.

### concurrency limit

The stored number of build and review jobs that may run at once, set with `concurrency`. It sizes the [launch
slots](#launch-slot).

### conditional re-review

A re-review the [pipeline](#pipeline) asks for only past a size: `review.reReview` grants one more review round, run by
a fresh `re-reviewer`, when the review's fixes changed more than `thresholdLines` lines, and `airlock.reReview` runs a
fresh `conflict-re-reviewer` on a conflict resolution of more lines, or one git cannot measure. With no `reReview` key
none runs.

### constitution

The repository's own rules, which an agent that changes or reviews code reads first: the [pipeline](#pipeline)'s
`constitution.path`, which an Apply sets to the tracked `CONSTITUTION.md` at the repository root, read from the
[main line](#main-line); with no key, `<data>/briefs/defaults/constitution.md`. `DEFAULT_INSTRUCTIONS_OF_ROLE` names it
for `builder`, `reviewer`, `reReviewer` and `conflictReReviewer`.

### constitution commit

The job of kind `constitution-commit` that commits an Apply's `CONSTITUTION.md` to the [main line](#main-line) through
its [Airlock](#airlock): no role, no agent, no gate, and no path but that file. It is the one write of the program to
the main line outside a ticket's [landing](#landing). Home: [CLI reference](cli.md#the-constitution-commit).

### context roll-over

The swap to a fresh [Assistant](#assistant): an idle one at `ASSISTANT_CONTEXT_TOKENS_BEFORE_FRESH` is stopped, and the
next delivery goes to a new one (`deliverIncidentsWhenIdle`).

> **As built.** A past usage marker skips it.

### control command

One typed change to a board, `ControlCommand` in `src/shared/@types/ControlCommand.ts`. A verb, a [relayed
command](#relayed-command) and Hephaestus's API all reach the same code through it. A control of a client of the API
sends one.

### crash bound

`CRASH_RESUMES_BEFORE_WAITING`, the number of [crash resumes](#crash-resume) a job gets, counted in `crashResumes`,
before the [Playbook](#playbook) leaves it waiting for User's resume. User's resume sets the count back to 0.

### crash resume

A [resume](#resume) after an interruption with a crash cause that User did not instruct. It adds one to the job's
`crashResumes`; other causes add nothing, and a resume User instructed sets the count to 0 and adds nothing.

### cursor

`Job.eventCursor`, the last event of the job's child Hephaestus applied, as instance and sequence, written in the [lock
hold](#lock-hold) that applied it. The job stream's transcript cursor is a separate value.

### Customs

The code that verifies what a session left, `src/services/lifecycle/Customs.ts`: it checks the [report](#report)'s
claims against git and the ticket body instead of believing them. A role's Customs column is the ordered list of
checks it owes (`CHECKS_OF_ROLE`).

### data folder

`.forge/` in the repository root (`DATA_FOLDER`), written `<data>` in these documents. It holds the
[tracker](#tracker).

### decider

A function that takes facts, returns a verdict and fails closed. It acts on nothing and words nothing.

### decision

A question for User, `E<n>`, stored in `progress.json` while open (`Decision`, `DecisionKind`).

### default move

The stored `defaultMove` of an [incident](#incident): the [move](#move) code takes if the Assistant settles nothing.

### delivered

The ticket status that means the work landed on the main line, shown as `Done`; the ticket's own row follows it. A
closed [review bar](#review-bar) also reads `delivered`, which says only that the review ended. Compare
[reviewed](#reviewed).

### dispatch

A surviving name for launching jobs. See [Words that mean several things](#words-that-mean-several-things).

### display state

What a row or ticket shows (`DisplayState`): its stored status, except for the derived `reviewing`. See [Status
words](#status-words).

### draft ticket

A ticket with status `draft`: filed, not yet ready, with no row. `ticket ready` moves it to `committed`. It differs from a
[filing draft](#filing-draft).

### epic

A named collection of tickets, `<data>/epics/<key>.md`. It has no lifecycle: its progress is a roll-up over the tickets
naming it (`EpicRollup`).

### epic colour slot

The stored `slot` number on an epic, assigned once at `epic add`, which picks its colour (`EPIC_COLOUR_SLOT_COUNT`).

### escaped bug

A bug naming a delivered ticket in its [introducedBy](#introducedby) field, counted by `review-stats`
(`EscapedBugCounts`).

### event broker

`EventBroker`, one per Hephaestus generation, which holds the event ids and replay buffer of `GET /api/events`. Home:
[Hephaestus API](reference/hephaestus-api.md).

### event log

`<data>/jobs/J<n>/events-<instance>.ndjson`, the events one [child instance](#child-instance) wrote. It differs from
the board's [log](#log).

### failed pass

A job on a ticket that ended `failed` or `does-not-hold`, counted by `FailedPassUtil`; enough of them [park](#park) the
ticket. A review that sends a finished build back counts toward the [handoff cycle](#handoff-cycle) instead.

### fake agent

`FakeAgentAdapter`, an [adapter](#vendor-seam) that scripts a session for specs. It lives in `src/testing/` yet ships,
because `agentAdapterOfThisProcess` chooses it when `fakeAgentIsOn`. Home: [Guards and
testing](development/guards-and-testing.md).

### fence

`HoldFence.requireStillHeld`, checked before every write of a [lock hold](#lock-hold): it throws once the lock was taken
over, so a holder a platform misjudged as gone writes nothing further.

### filing draft

A working record `D<n>` in `<data>/filing-cabinet/` that a filing session builds tickets from. It is never a ticket: no
status, row or move (`src/lib/tracker-model/Drafts.ts`).

### finding

Something a review found, recorded with class, severity and outcome (`ReviewFinding`), or a low-priority ticket a job
filed through its Hatch, which waits in `dependsOn` for the ticket that found it. See [Words that mean several
things](#words-that-mean-several-things).

### fingerprint

A hash of what a [Pass](#pass) observes, never of time (`fingerprintOf`). An unchanged fingerprint skips the Pass.

### first message

The task a session starts from, `AgentLaunchRequest.firstMessage`. It travels on stdin, never in argv, and a resumed
instance never receives it again.

### fixer

One of a review's moves in build and review code: the ticket goes back to a builder. See [Words that mean several
things](#words-that-mean-several-things).

### forced Pass

A [Pass](#pass) that runs even when the [fingerprint](#fingerprint) is unchanged, because something that moved nothing
on disk woke it: `wake(true)`, as a restart or a quiet job does.

### foundInReview

The ticket frontmatter field naming the ticket whose review found this one.

### frame

One JSON line on Talos's socket, in either direction (`ClientFrame`, `TalosFrame`). The first line of a connection is
`hello`, read by `helloFrameOf` alone and frozen (`FrozenTalosHandshake.json`); an acting frame, `launch`, `input`,
`stop`, `stop-lines` or `quit`, is answered `done`, and `state` tells a child's state and end.

### free-standing row

A [row](#row) with neither `ticket` nor `reviewOf`: tracked work that belongs to no ticket. Compare [own row](#own-row)
and [review bar](#review-bar).

### gate

One named check in the [pipeline](#pipeline) (`PipelineGate`), run on a tree by `GateRun`. Its outcome is `passed`,
`failed` or `cannot-run`.

### gate phase

One of `build`, `review` and `merge`: which [gates](#gate) a tree runs at one place. `build` gates a builder's work and
the [merge before review](#merge-before-review), `review` a reviewer's work and the merge before User's Merge, `merge`
the [Airlock](#airlock)'s merged tree. A gate runs in one or more phases.

### gate profile

One gate run once in one [gate phase](#gate-phase), on User's press only, in a fresh worktree of the main line, to
show how long it takes (`GateProfiling`, `P<n>`). It records no green.

### gate slot

One of the machine-wide files in `<monitor>/gate-slots/` that cap gate runs (`GateRunSlots`, `GATE_RUNS_AT_ONCE`).

### gate-ran

The [log](#log) record of one gate run on a tree, with `tree`, `outcome` and `cached`, and `cacheReports` once a gate
reported its cache. An Airlock reads the newest one to skip gating a tree that already passed.

### generation

The number in a lock record `generation-<n>` or a Baton file `baton-<n>.json`. Each is created exclusively and never
rewritten, so the newest number decides.

### group

Tickets sharing a `group` field that land on a `group-<name>` branch and reach the main line together.

### guard

A spec that reads the real tree and fails when a rule is broken, proving first that its scan found something. Home:
[Guards and testing](development/guards-and-testing.md).

### guard hook

The `PreToolUse` hook `forge hook bash-domains`, which refuses network domains off the list that [auto
mode](#auto-mode)'s classifier would grant. Its sibling `forge hook stage-edits` refuses an `Edit` or `Write` outside
the folders of a stage of a job of an entity.

### Handoff

The `## Handoff` section of a ticket, which Hephaestus writes from the `handoff` field of the builder's
[report](#report). In lower case, a handoff is the moment a session ends and Hephaestus verifies what it left and
writes that section.

### handoff cycle

How many times the same work has been resumed after its session ended, counted per job kind, ticket set and attempt
from the log (`handoffCycleResumesOf`). For a build, each review that sent the work back also counts.

### Hatch

The folder `<worktrees>/hatch/J<n>/` through which a confined session sends requests and reads replies.

### hold

Four different things share this word: a [ticket hold](#ticket-hold), a [lock hold](#lock-hold), an [install
hold](#install-hold) and a review that does not hold. See [Words that mean several
things](#words-that-mean-several-things).

### hold journal

`<data>/hold-journal.json`, the redo journal of a [lock hold](#lock-hold). The next lock holder replays a lock hold cut
short.

### incident

Operational trouble addressed to the Assistant, `I<n>`, with a default move if nobody settles it (`Incident`,
`IncidentKind`).

### install hold

The state in which a Hephaestus launches and resumes nothing because the [install version](#install-version) changed
under it, runtime state `held-by-install-change`. Its API answers most commands 423. A [Baton pass](#baton-pass) ends
it.

### install marker

`session-instructions.md`, whose presence tells the version check an install exists. See [Words that mean several
things](#words-that-mean-several-things).

### install version

`INSTALL_VERSION`, bumped by hand, stored in `<data>/version.json`. It states which CLI the installed files match.
Compare [code version](#code-version).

### installed brief

One of the nine instruction files the install's `briefs` part writes into `<data>`. It differs from a ticket's
[Brief](#brief).

### instruction file

A file that tells a session how to work: a [constitution](#constitution) file or a [role brief](#role-brief).
`InstructionFiles` reads them from `<data>` or the main line, never from the branch. Customs check V11 refuses a branch
that changes a tracked one unless its ticket names it. It counts only a change the branch made itself: a change that a
merge of the job's target brought in, such as a constitution commit, does not.

### intake

A [product owner](#product-owner)'s filing conversation, started by `forge intake -- <text>` or the
`intake-start` control command. Its close submits the complete draft tickets it filed for User's ticket review.

### integrated

The landing kind for a group branch (`LandingKind`). A ticket that integrated is `reviewed`, waiting for its group's
release.

### introducedBy

The frontmatter field on a bug naming the delivered ticket whose change introduced it.

### job

The board's unit of work, `J<n>`, stored in `progress.json` while unsettled (`src/lib/tracker-model/@types/Job.ts`). A
merge or refresh job runs no agent of its own.

### job kind

`JobKind`: `build`, `review`, `merge`, `merge-agent`, `refresh`, `constitution-commit`, `assistant`, `product-owner` or
`pipeline-agent`. It differs from a job's [role](#role).

### job state

`JobState`: `launching`, `preparing`, `running`, `waiting-for-answer`, `interrupted`, `awaiting-answer`, `in-customs`,
`gating`, `merging-main`, `merging`, `landing` or `stopping`, and `ended` once it leaves the board. `merging-main` is a
build or review job's merge of the target's tip before User's Merge, with merge approval on.

### landing

Moving a gated commit onto its [target](#target), `src/services/lifecycle/Landing.ts`. The word covers both targets; the
outcome `landed` means the main line and `integrated` a group branch.

### last worker

A ticket's newest ended build or review job, read from the log whatever the [pipeline](#pipeline) says now, and its
role: the builder, or the reviewer or re-reviewer. With none ended, the reviewer, or the builder with no review step.
It fixes the conflicts and red gates of the [Airlock](#airlock), and a [merge agent](#merge-agent) carries on its
session and its model and effort (`lastWorkerOf`).

### launch slot

Room for one more build or review job under the [concurrency limit](#concurrency-limit), counted from jobs by
`LaunchSlotUtil`: the Playbook's `freeSlotsOf`, `status`, the [Next line](#next-line) and the served board state all read
this one count. Hephaestus serves which jobs hold one as `launchSlots` in `BoardState`.

### liveness

The verdict on one [child instance](#child-instance) from its [child record](#child-record), `BoardChildren.livenessOf`:
`unlaunched`, `live`, `ended` or `lost`. It says nothing about the agent.

### lock hold

One write of the store's local adapter, a `writeTracker` run under the board's lock, holding every write of one
change: a command through the store's command face or a transaction through its transaction face.

### log

`<data>/log.jsonl`, the board's typed record of what happened, which the Playbook also reads back. It differs from an
[event log](#event-log). Kinds: [CLI reference](cli.md).

### main checkout

The checkout that holds the shared `.git` folder, where the [main line](#main-line) lands. Every [worktree](#worktree)
is linked to it.

### main line

The repository's main branch, the [target](#target) of every ungrouped ticket and of a release ticket.

### marker

A small file or text mark whose presence records a fact. See [Words that mean several
things](#words-that-mean-several-things).

### merge agent

A job of kind `merge-agent`, with the role of the ticket's [last worker](#last-worker), `builder`, `reviewer` or
`re-reviewer`, working under a merge job (`parentJobId`). It resolves a conflict or fixes a red merged tree in the
[Airlock](#airlock), and resumes that worker's session when it can. A `conflict-re-reviewer` is a merge agent too: a
fresh session that re-reviews a large conflict resolution as a [conditional re-review](#conditional-re-review), in the
Airlock, or under its build or review job before User's Merge.

### merge before review

The merge of the [target](#target)'s tip into a ticket's branch that a review job makes before its reviewer starts,
when the branch lacks that tip, followed by the build [gate phase](#gate-phase). A conflict or a red gate goes back to
the builder. Home: [CLI reference](cli.md#a-review-job).

### merge job

A job of [kind](#job-kind) `merge`, with no role and no agent of its own, that carries one ticket through the
[Airlock](#airlock) phases. It holds the [Airlock slot](#airlock-slot) and may launch a [merge agent](#merge-agent).

### merge queue

The tickets whose review passed, waiting per target to land (`mergeQueued` on the row, `MergeQueueFacts`). They stay
`in-review` while they wait.

### merged tree

The tree a [target](#target) would receive: the target's tip merged with the branch. An Airlock gates this, not the
branch.

### monitor folder

`~/.forge-monitor/`, written `<monitor>` in these documents: the machine-wide folder shared by every board.
It holds the registry, each board's Talos socket and secret, [gate slots](#gate-slot) and the [usage marker](#usage-marker).

### move

A named action. On an [incident](#incident) it is an `IncidentMove`, named after its [control
command](#control-command); on a ticket it is a status transition; a review's move is what `settleReviewPass` picks. See
[Words that mean several things](#words-that-mean-several-things).

### Next line

The last line a human-facing command prints, starting `Next:` (`NextLineUtil`). It reports [launch
slots](#launch-slot) and ready tickets. Home: [CLI reference](cli.md).

### notice

A warning Hephaestus shows and nobody answers (`HephaestusNotice`), such as `dirty-main-checkout`.

### orchestrator

Used only for the session that drove the board in the first version; this build has none. See [Words that mean
several things](#words-that-mean-several-things).

### OS sandbox

Confinement the operating system enforces on a process. The vendor's sandbox holds a session's Bash and its children;
[Seatbelt](#seatbelt) holds gate, prepare and install processes.

### Hephaestus

The one long-running process that owns a board, started by `forge start`. Its [Pass](#pass) launches every
job.

### own row

The [row](#row) a ticket holds through its `ticket` key, its bar on the chart. Compare [review bar](#review-bar) and
[free-standing row](#free-standing-row).

### pace path

The dependency chain from the last [wave](#wave) back to the first. A board view's run order takes its
tickets first within a priority.

### park

To hold a ticket `parked:<cause>` and open a `parked` [decision](#decision) for User. A Playbook step and the `ticket
park` verb both do this.

### Pass

One turn of Hephaestus's loop, `runOnePass` in `src/services/hephaestus/DrivePass.ts`: observe, apply, run the
[Playbook](#playbook), then act.

### pipeline

The board's `<data>/pipeline.json`, in its one format: prepare steps, [gates](#gate) and their
[gate phases](#gate-phase), and optional review, merge train, constitution, agent, approval and billing settings and the
Assistant's switch (`Pipeline`). Fields: [CLI reference](cli.md).

### pipeline agent

The job kind and role (`pipeline-agent`; `pipelineAgent` in `pipeline.json`) of the session that reads a repository and
designs its [pipeline](#pipeline) and constitution with User, through a [setup record](#setup-record), or advises on
the pipeline it has. It runs no script, files no ticket and writes nothing but its relayed verbs.

### pipeline check

User's check of the gates a [setup record](#setup-record)'s draft changes or adds: the [twice-run](#twice-run) in a
fresh worktree of the main line, its result sent to the [pipeline agent](#pipeline-agent). It records no green.

### Playbook

The pure function that derives what runs next from the board and Hephaestus's observations,
`src/lib/tracker-model/Playbook.ts`. It reads no clock, file or process.

### pipeline-step-ran

The [log](#log) record of one pipeline step line that ran: its kind, name, phase, entity, run time and ending. It is
recorded and shown only, as the pipeline facts' `stepRunTimes`.

### prepare step

A `pipeline.json` step that sets a tree up before the gates run (`PipelineStep`).

### processless state

A job state with no process behind it, `PROCESSLESS_JOB_STATES`: `interrupted` or `awaiting-answer`. A move from one
into `running` is a [resume](#resume).

### product owner

The job kind and role that runs a filing intake and writes draft tickets, and the skill `forge-po` it loads.

### projection

What a client's board view is: a view of one document replaced whole, never a store. Closing it loses no record.

### publish

One complete re-read of the board sent to the browser, `publishState`, after every [Pass](#pass) that does not throw. It
differs from an event, and no publish depends on the one before.

### reach

One use of a process-wide API such as `process.env`. `CONFINED_REACHES` in `eslint.config.js` confines each to its
allowed files. Home: [Guards and testing](development/guards-and-testing.md).

### readiness position

A ticket's place in the [log](#log): the position of its latest `ticket-committed` or `ticket-reopened` record. Among
ready tickets of one priority it sorts the earlier first (`readinessPositionByTicketId`).

### ready

As a verb, to move a [draft ticket](#draft-ticket) to `committed` with `ticket ready`, which checks its Acceptance and
Brief. As an adjective, a ticket `readyTicketIdsOf` lists, which may start now.

### recorded ticket

A ticket with at least one `review-recorded` log record, the only tickets `review-stats` counts.

### red handoff

A handoff whose gate or Customs check went red (`handoff-red`). The same session is resumed to fix it. Its note is
`gate-failure.md`, the red-handoff note.

### red-handoff note

`gate-failure.md`, the note a [red handoff](#red-handoff) leaves for the resumed session (`RedHandoff.ts`). Its text
says Baton pass, which here means no Hephaestus hand-over.

### refresh

A job of kind `refresh` that merges the main line into a group branch, under its target's Airlock.

### refusal

A deliberate no, carried as data: `OperationRefusal` with status `refused` or `unrepaired`, or a `BoardRefusal` for a
Board rule. Home: [Refusals](reference/refusals.md).

### Regrouping

What a starting Hephaestus does before its first Pass: it connects to its board's [Talos](#talos), or starts one, reads
each job's child from its [cursor](#cursor) on, and cleans up what died (`src/services/hephaestus/Regrouping.ts`).

### relayed command

A verb run inside a job that travels through the job's [Hatch](#hatch) and is applied by Hephaestus (`jobRouteOf`
answers `relayed`). The session never touches the board itself.

### release bundle

A group's open [release ticket](#release-ticket) plus every ticket of the group it depends on (`ReleaseBundleUtil`).

### release ticket

The one open ticket of a group marked `releasesGroup: true`, whose landing on the main line delivers the bundle.

### release-behind-group

The refusal of a [release ticket](#release-ticket) whose branch lacks the [group](#group)'s tip, from `releaseGapOf`
before merge-in.

### released program

`agent-progress`, the program on `main`, as opposed to this build. See [Reading names](#reading-names).

### report

The JSON a session leaves as its result, checked against its role's schema (`src/adapters/reports/ReportSchemas.ts`).

### request

A session's file in its [Hatch](#hatch), or one [AskUserQuestion](#askuserquestion) call, each with a `requestId`. See
[Words that mean several things](#words-that-mean-several-things).

### result

The vendor's event that closes a session's turn (`AgentSessionEvent` kind `result`), carrying its [report](#report). On
a job that reports, it moves the job to `in-customs`.

### resume

A job's move into `running` from a [processless state](#processless-state): the next [child
instance](#child-instance) carries on the same [session](#session). It differs from a fresh job, which starts a new
one.

### review bar

A chart row of its own, not the ticket's [row](#row), carrying `reviewOf`, in which one review of a ticket runs
(`src/lib/tracker-model/ReviewBars.ts`).

### review pass

The label `review-stats` prints for one kept `review-recorded` line, one per ticket and [review round](#review-round).
Prose says review round.

### review round

One review of a ticket, numbered by `reviewBarRound` on its bar and by `## Review <n>` in the body.

### reviewed

The ticket and row status shown as `Awaiting merge`. A [group](#group) ticket rests here on its group branch until the
release; a main-line ticket passes through it as the merge lands (`landOnTheBoard`, `releaseTickets`).

### reviewer

The job role that reviews a ticket's change from its Handoff and reports.

### rework

The code lines a reviewer's own fixes changed, counted by `ReworkCountUtil` from the review's start commit to its head.
It decides the [round verdict](#round-verdict), against the pipeline's `review.reReview.thresholdLines`
(`REWORK_ROUND_THRESHOLD_LINES` only with no pipeline).

### role

`JobRole`, what an agent is in a job: `builder`, `reviewer`, `re-reviewer`, `conflict-re-reviewer`, `assistant`,
`product-owner` or `pipeline-agent`. A [merge agent](#merge-agent) takes its [last worker](#last-worker)'s role, or
`conflict-re-reviewer`.

### role brief

The instruction file for one [role](#role), by default `<data>/briefs/defaults/<role>.md`, or what the
[pipeline](#pipeline)'s `agents` array names. It differs from a ticket's [Brief](#brief).

### root override

The environment variable `FORGE_ROOT`, which names the repository to use with no walk up from the working
directory. Each program reads only its own. Variables: [CLI reference](cli.md). Home: [Guards and
testing](development/guards-and-testing.md).

### round verdict

Whether another review round is granted (`RoundVerdictUtil.nextRoundVerdictOf`): rework must exceed its threshold, and
later rounds must also show the findings converging.

### row

One line of the progress chart, the `Task` record, numbered and stored in `progress.json`. A ticket gets one when
readied, except a low-priority ticket, which gets one when it starts or its priority is raised; a ticket without one
that is abandoned before it started stays without one. Code says `task`.

### scratch root

The canonical `tmpdir()`, the only place specs may work; `src/testing/TrackerIsolation.ts` refuses every way out of it.
Home: [Guards and testing](development/guards-and-testing.md).

### seam

The one place the core meets something a port may replace. Six exist, and only the [vendor seam](#vendor-seam) chooses
an implementation at one guarded point.

### Seatbelt

macOS's `sandbox-exec`. A profile from `LineSandbox` holds gate, prepare and install processes, which run
outside any session, a proposal's lines excepted. Where it cannot apply, they run unconfined. It differs from a [worker
profile](#worker-profile).

### serious finding

A finding of severity `would-ship-a-bug` or `acceptance-fails` (`SERIOUS_FINDING_SEVERITIES`).

### session

One conversation with the vendor's agent CLI, Claude Code, named by `sessionIdOf`. A build job sent back by its review
resumes its predecessor's session, so a session can outlive a job.

### session owner

The job whose [session](#session) a job carries on: an earlier builder for a build sent back by its review, otherwise
the job itself (`sessionOwnerJobIdOf`).

### settled

Finished, for good, and said of several things. See [Words that mean several things](#words-that-mean-several-things).

### settled fingerprint

The [fingerprint](#fingerprint) `runOnePass` kept from the last Pass that left no unapplied events (`lastFingerprint`).
A wake that observes the same one skips the Pass, unless forced.

### setup record

`<data>/pipeline-setup.json`, the one open pipeline setup, update or advise session (`PipelineSetup`, `S<n>`): its
steps, findings, questions, constitution draft, draft pipeline and edits, saved as each happens. Only User's Apply
turns it into `pipeline.json`.

### side-by-side build

This build under `PRODUCT_NAMES`, whose names differ from the [released program](#released-program)'s so both fit on one
machine. It alone refuses an install beside the other's data folder (`older-program-present`).

### source mutant

One text rewritten in one module as Bun bundles it (`src/testing/SourceMutant.ts`), so a claim can be watched failing. A
text not found exactly once fails the build. Home: [Guards and testing](development/guards-and-testing.md).

### stale lock

A held lock record whose process is gone, or whose process id now names another process: its start stamp or boot differs
from the one the record names. The next taker takes it over. Its age frees nothing: a live holder keeps the lock however
long it holds, and where the platform cannot read a process's identity the holder reads as alive. If a platform misjudges a
running holder as gone, the [fence](#fence) stops that holder's writes.

### standing reply

A rule that lets Talos answer a line on the session's stdout without Hephaestus (`StandingReply`). A line no
rule matches waits for Hephaestus.

### successor

The Hephaestus that follows another, on the code on disk: in a [Baton pass](#baton-pass), or after one died.

### supervision lease

How long [Talos](#talos) lets the board's agents run without a Hephaestus: one minute, renewed every 15 seconds from
Hephaestus's main loop and only while its [Passes](#pass) make progress (`LeaseRenewal.ts`). When it ends, Talos asks
every agent to quit at the end of its turn and the jobs wait, interrupted `lease-ended`, for User's resume. After a gap
in Talos's ticks, such as a sleep, it ends no sooner than one renewal interval later. Lines are never stopped by it.

### sweep

Hephaestus's timed backstop [wake](#wake) (`HEPHAESTUS_SWEEP_SECONDS`). A job's silent sweeps count those its
[cursor](#cursor) stood still for. It differs from the [Airlock sweep](#airlock-sweep).

### Talos

The board's one detached supervisor of children, `talos.ts` and `src/lib/talos/Talos.ts`, with a protocol version of its
own (`TALOS_PROTOCOL_VERSION`). Hephaestus starts it once per board and talks to it over a local socket in
[frames](#frame); it runs every agent session and every install, prepare, gate and merge line, records each in a [child
record](#child-record) and an event log, and outlives Hephaestus. It holds the [supervision
lease](#supervision-lease), bounds every install, prepare and gate line to 15 minutes of awake time, recognises an
agent's ending on a network outage, and ends by a [clean quit](#clean-quit). Its files are in `<data>/talos/`.

### target

`Job.target`: the main line or a `group-<name>` branch that a job's work goes to.

### task

The code's name for a [row](#row).

### ticket

A Markdown work item, `<data>/tickets/`, known by its frontmatter `id` such as `#003`, never by its file name.

### ticket hold

The frontmatter field `hold`, whose presence stops launches on that ticket.

### tracker

The `<data>` folder and its files, the on-disk form of a [board](#board). Commands find it from the working directory.

### twice-run

Running the gates a draft [pipeline](#pipeline) changes or adds `PROPOSAL_RUN_COUNT` times on one folder
(`ProposalTwiceRun`), on User's [pipeline check](#pipeline-check), to catch a flaky gate and one that leans on what the
first run left.

### undriven gap

The moment in a [Baton pass](#baton-pass) when neither Hephaestus drives the board: the old one closed its listener and
the successor has not claimed. Talos and its children run through it.

### usage marker

`<monitor>/usage-limit.json`, machine-wide, which stops launches on every board until its `resetsAt`.

### User

The person running the board, written with a capital, matching the code. A document's reader is 'you', and the project's
owner is 'the owner'.

### vendor seam

The `AgentAdapter` interface in `src/lib/agent-launch/AgentAdapter.ts`, the one path from the launch and the session to the
vendor's agent CLI.

### verb

One `forge` command, an entry in `COMMAND_TABLE`, such as `ticket ready`. Home: [CLI reference](cli.md).

### view model

The pure data a client's view renders, derived from the board document by the client.

### waiver

Dropping an Acceptance item: a session proposes it and a `waiver` [decision](#decision) asks User. An item written
`A<n>. Waived: <reason>` is waived. Hephaestus's next [Pass](#pass) after User's answer applies it.

### wake

A request for a [Pass](#pass), `DrivePass.wake`. Wakes during a Pass add exactly one more. Unless
[forced](#forced-pass), the Pass stops at an unchanged [fingerprint](#fingerprint).

### Watcher

The retired name of the per-session process [Talos](#talos) replaced. Dated records still carry the word.

### wave

A board view's grouping of open tickets by the open dependencies in front of them. Drafts and committed
low-priority tickets enter no wave, yet still hold their dependents out of Now. It says nothing about readiness, which
the `Board` class decides. Home: [Running a board](operations/running-a-board.md).

### wind-down

The message that asks a session to finish and report, and the stop mode `wind-down` User can request.

### worker

A job role under the [Bouncer](#bouncer)'s worker rules, `WORKER_ROLES` in `src/services/control/Bouncer.ts`: `builder`
or `reviewer`.

### worker profile

`WorkerProfile`, a role's permissions as neutral data, from `profileOf`. An adapter renders it into vendor settings and
flags. It differs from a [Seatbelt](#seatbelt) profile.

### worktree

A linked git checkout of its own: `<worktrees>/ticket-<id>/` for a ticket, `<worktrees>/group-<name>/` for a group. A
refresh job uses a temporary detached `<worktrees>/refresh-group-<name>/`.

### worktrees folder

`.forge-worktrees/` in the repository root, written `<worktrees>` in these documents. It holds
[worktrees](#worktree) and the [Hatch](#hatch) folders.

### write-set

What a [lock hold](#lock-hold) must write, the change lists `BoardRecords` keeps: `changedTicketRecords`,
`loggedRecords` and the like.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Product names | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES`, `ORIGINAL_PRODUCT_NAMES` | `src/ProductNames.spec.ts` |
| Hard-coded product names | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `src/ProductNameLiterals.spec.ts` |
| Decided component names | every tracked file | `RETIRED_NAMES` | `src/ComponentNames.spec.ts` |
| Derived display state | `src/lib/tracker-model/DisplayQueries.ts` | `displayStateFor` | `src/lib/tracker-model/Board.displayQueries.spec.ts` |
