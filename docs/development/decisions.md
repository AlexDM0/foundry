# Why it is built this way

> **Question:** Why does the system have this shape, what was the alternative, and what does it cost?
> **Time:** 15 minutes.
> **Read first:** [Overview](../concepts/overview.md), [Code map](../architecture/code-map.md).
> **Next:** [Porting](porting.md), [Deciders and bounds](../reference/deciders-and-bounds.md).

## In one screen

Three ideas explain most of the records below. The first is that state lives in files, so losing the
[Overseer](../glossary.md#overseer) costs little; the figure shows the four decisions behind it.

![Four boxes on the left name the decisions: current state plus typed history, thin Watchers, fenced and journaled lock holds, and counts instead of durations. Each points to what it leaves on disk: the board and log, Watcher job folders, the hold journal, and counts in the board and log. All four lead to one blue box, what reads them: the next Overseer regroups, and it derives the same steps.](../figures/decisions/four-decisions-make-a-lost-overseer-cheap.png)

*Notice that everything entering the Overseer box comes from a gray box: nothing the next
[Pass](../glossary.md#pass) needs to stay correct lives only in the lost process.*

- **State lives in files, and one process acts on it.** The Overseer, the one long-lived process that launches agents,
  merges and lands, is the sole driver. Any Overseer can read the files, find the live
  [Watcher](../glossary.md#watcher) processes and carry on.
- **Code decides, agents claim.** A session's [report](../glossary.md#report) is input. Code reads git and the
  [ticket](../glossary.md#ticket) and reaches the verdict.
- **The product knows the workflow, and the repository knows the stack.** A [gate](../glossary.md#gate) is an opaque
  shell line. Agent vendors sit behind one interface.

Each record gives the decision, the alternative and the cost. Rules live in [CLAUDE.md](../../CLAUDE.md), where a
decision is made in code lives in [Deciders and bounds](../reference/deciders-and-bounds.md), and plans live in [the
backlog](../backlog.md).

## State and storage

### One tracker shared by every worktree

**Decision.** A repository has one [tracker](../glossary.md#tracker). `findWorkspace` walks up from the working
directory to the nearest tracker. When the walk finds none, it asks `git rev-parse --git-common-dir`, which resolves any
[worktree](../glossary.md#worktree) to the main checkout. A verb run in a sibling worktree therefore reaches the same
[board](../glossary.md#board).

**Alternative.** A tracker per checkout. A fan-out of five agents makes five charts and no picture of the work.

**Cost.** The tracker cannot describe one worktree in isolation, and every worktree contends for one lock.

### Every write in one lock hold

**Decision.** A mutating verb and a Pass write through `writeTracker`: lock, read into the in-memory `Board`, change,
write every file, all in one [lock hold](../glossary.md#lock-hold). Two writers never interleave, and a holder always
finds a finished state. The mechanics are in [Storage](../data-model/storage.md).

**Alternative.** Atomic writes per file with no shared lock. Each file stays whole, but a ticket and its
[row](../glossary.md#row) can disagree for as long as two writers overlap.

**Cost.** Writers queue, and a CLI waiter gives up after `LOCK_RETRY_COUNT` tries. So a lock hold stays short: agents
and gates run outside it. Git steps do run inside: a [landing's](../glossary.md#landing) fast-forward, which must not
race a launch, and [Customs'](../glossary.md#customs) reads and a review's settlement. A lock-free reader such as
`agent-progress-v2 status` reads the files as they stand and can see a lock hold half written.

### Current state plus a typed history, not event sourcing

**Decision.** `progress.json` and the ticket files hold the current state. The [log](../glossary.md#log), `log.jsonl`,
holds what happened, as typed records. The [Playbook](../glossary.md#playbook) is level-triggered: it derives the next
steps from the Board as it stands, so a Pass after a crash and an ordinary Pass are one code path.

**Alternative.** Event sourcing, with state rebuilt from the log. It cannot work here: tickets are hand-edited between
runs, and `tracker-cleared` starts the log again, so a replay rebuilds a board that never existed.

**Cost.** There is no time travel: the log explains the past but cannot restore it. The log is also more than a record.
The Playbook reads its counts from it, so it is an input that a hand edit can change.
[Storage](../data-model/storage.md) says what reads it.

> **As built.** Reads and log writes take the whole log, so their cost grows with the board's life: [known
> gap](../reference/known-gaps.md#gap-scaling-whole-log-and-bodies).

### Fenced, journaled lock holds

**Decision.** Before it touches any file, a lock hold writes every file's contents to the [hold
journal](../glossary.md#hold-journal). Every lock acquisition replays a journal it finds. A
[fence](../glossary.md#fence) checks before each write that the lock [generation](../glossary.md#generation) is still
the newest, and a taken-over holder stops with `lock-taken-over`.

The journal is the commit point: a stale holder's complete lock hold counts, and the next holder finishes it. The
mechanics are in [Storage](../data-model/storage.md).

**Alternative.** Rely on the lock alone, so a crash between `progress.json` and a ticket leaves them disagreeing until
somebody notices. A journal of byte offsets into the log fails too, because the log writer re-serializes the stored
records, and a hand-edited log's raw length differs.

**Cost.** Every lock hold writes its contents twice, the log included. A malformed journal stops every writer with an
`unrepaired` exit until a person looks. One window remains: between a fence check and that file's write, a stale holder
can still land one file.

> **As built.** A live lock hold slower than `LOCK_STALE_MILLISECONDS` can be taken over: [known
> gap](../reference/known-gaps.md#gap-hold-past-stale-window).

### A clock decides nothing

**Decision.** Identity is a content hash, a generation or a sequence number. [Call budgets](../glossary.md#call-budget),
[review rounds](../glossary.md#review-round) and resumes are counts. A timestamp is recorded and shown.
`eslint.config.js` confines the clock in `src/` and `cli/` to `cli/CommandContext.ts`, with `watcher.ts` its one other
site, and the Overseer takes `now` as a parameter from the command context. The Playbook reads no clock but the time
the vendor's usage limit ends, so a restart derives the same steps.

**Alternative.** Timeouts: a [job](../glossary.md#job) silent for too long counts as dead. A timeout turns a slow
machine, a sleeping laptop or a long test run into a wrong verdict, and it gives two Overseers different answers on the
same board.

**Cost.** A few clock exceptions remain where counts cannot help. A hung session makes no calls, so nothing counts up
to a bound. A wedged lock holder whose process is alive counts nothing, so its staleness is a time; a dead holder is
found by its process id. The vendor's usage limit ends at a clock time. Onboarding suggests caching from measured gate
durations. [Deciders and bounds](../reference/deciders-and-bounds.md#clock-exceptions) lists every exception and where
each is stated.

## Driving

### The Overseer is the sole driver

**Decision.** Driving means launching agents, merging and landing; only the Overseer does these. A lifecycle verb
records in one lock hold, then sends a best-effort `POST /api/nudge`. Three verbs reach further:

- `agent-progress-v2 oversee` starts and stops the Overseer itself.
- `agent-progress-v2 worktree repair` runs its git step in the lock hold.
- `agent-progress-v2 ticket deliver <id> --by-hand` records a ticket finished outside the Overseer, and it is refused
  while a live [Baton](../glossary.md#baton) exists.

**Alternative.** A separate driver over the CLI reads `status --json`, decides with no lock held, and acts in a later
lock hold, on a stale read.

![Top strip, the alternative: a driver reads status --json with no lock and decides with no lock held. A verb of User's takes its own lock hold in the gap and moves the board, and the driver's own verb then runs in a later lock hold on the old read, so it acts on a stale read. Bottom strip, as built: the Overseer observes with no lock, reads the Board, steps the Playbook and writes every file inside one lock hold, then runs its effects with no lock. Its decision is made on the Board as held.](../figures/decisions/deciding-inside-the-hold-leaves-no-board-read-to-race.png)

*Notice the gap in the top strip: from the read to the driver's lock hold, the board can change under the decision. The
Overseer's observations and effects sit outside its lock hold, and its decision does not.*

Such a driver also pays a process spawn and a lock round trip per step, and `agent-progress-v2 status --json` has to
carry every fact the Playbook reads.

**Cost.** Without an Overseer the board stands still: filing and recording work, and nothing launches. Each repository
runs a long-lived process, with a [Baton](../architecture/baton.md) to keep it singular.

### Thin Watchers, reads through files

**Decision.** Every agent session, and every prepare step and gate of a build or review, runs under a Watcher, a
detached process running a copy of its code fixed when the Overseer started. It knows no board, no ticket and no vendor.

The Overseer reads Watchers through their files and writes to them through their sockets. Only
[Regrouping](../glossary.md#regrouping) asks a socket for history, and it falls back to the [event
log](../glossary.md#event-log) when no answer comes. [Watchers](../architecture/watchers.md) holds the process tree.

An [Airlock's](../glossary.md#airlock) merge gates run in the Overseer's process and rerun after a loss, and git
commands run directly. Neither outlives a lost Overseer the way a Watcher's child does.

> **As built.** A merged-tree gate blocks the Pass: [known gap](../reference/known-gaps.md#gap-merge-gate-blocks-pass).

**Alternative.** Agents as children of the Overseer, which is simpler, or thick supervisors holding lifecycle logic.

![Three process shapes against two events. An agent as a child of the Overseer dies in an Overseer crash and in an update. An agent under a detached thick supervisor lives through both, but after an update the supervisor keeps running the old rules. An agent under a detached thin Watcher lives through both, and the rules stay in the Overseer, so an update reaches them.](../figures/decisions/only-a-thin-watcher-survives-a-crash-and-an-update.png)

*Notice the update row: a process that survives and holds rules is the failure the thin Watcher avoids.*

**Cost.** One more process per job. The Overseer keeps a contract with Watchers of older code, in
`src/services/overseer/LegacyWatcherReader.ts`. File reads need a wake-up, so `fs.watch` and a backstop sweep both run.

## Verdicts

### Code owns the verdicts

**Decision.** Nothing a session says is taken as true. Customs reads git, the ticket body and the report and answers a
verdict code per check, with no prose. The gates judge the tree itself, not the session's account of it.
`src/services/lifecycle/ReviewOutcome.ts` and `nextRoundVerdictOf` compute what a review leads to. A
[reviewer's](../glossary.md#reviewer) claim that an [Acceptance](../glossary.md#acceptance) item is not met remains a
judgement, and code decides its consequence.

> **As built.** Merge agents' reports do not reach Customs: [known
> gap](../reference/known-gaps.md#gap-merge-agents-skip-customs).

**Alternative.** An agent runs its own checks and releases its own branch. That is cheap and honest until a session
finishes early or summarises optimistically, and a board of many agents meets both.

**Cost.** Every rule is code that must keep up with what agents can do. A Customs refusal either resumes the same
session with a red-handoff note, for the checks in `RESUMABLE_CUSTOMS_CHECKS`, or ends the job. Customs proves a session
did what it reported, not that the work is good. That judgement stays with review and gates.

### Stack-neutral, opaque gates

**Decision.** A gate is a name and a shell line, run in User's shell. It passes when it exits 0 and leaves tracked
files unchanged. The product parses no output and knows no language. What is stack-specific belongs to the repository,
and an [onboarder](../glossary.md#onboarder) proposes the lines for User to accept. See [Customs and
gates](../architecture/customs-and-gates.md).

**Alternative.** Built-in knowledge of test runners and type checkers, with per-test results. Each stack then needs an
adapter, and the product is wrong on the first stack it has not met.

**Cost.** A red gate is a whole-line failure with raw output, and the product cannot tell which test failed or rerun
only that test. Speed depends on how the repository writes its lines.

### No gate cache of our own

**Decision.** The product has no gate cache store. Each build, review and merge job runs the
[pipeline](../glossary.md#pipeline) on its own tree, with two skips. A review job that leaves the tree as it received
it runs no gates, because the build's gates passed that tree. A merge whose merged tree equals the branch's own tree
lands without gating when the newest `gate-ran` log record on that tree passed.

**What is not kept.** No file holds a green result behind a key. Both skips rest on a real run of the identical tree and
compare trees alone, so a changed outside input or gate line goes unjudged there. A step verdict is one job's own note,
read by no other job. [Customs and gates](../architecture/customs-and-gates.md) lists who reads what.

**Why.** `src/services/lifecycle/GateRun.ts` says at its head that caching is the repository's own tooling's. A correct
cache key has to name every input of the gate, and only that tooling knows those.

![Two inputs sit inside what a key sees: the tree, which covers every tracked file, and the gate line. Four sit outside it: installed dependencies, generated files ignored by git, a binary found on PATH and the toolchain version. A real gate run reads all six, and only the first two reach the stored result. When an outside input changes, the key stays the same, so the stored result passes, a false green, while a real run fails and catches it before landing.](../figures/decisions/a-tree-key-misses-what-the-gate-reads.png)

*Notice that no line runs from the four outside inputs to the stored result: a change there cannot reach it.*

Gates are the last judgement before landing, so a false green there reaches the target. A stored result would also be
one more file whose trust rests on nobody else writing it.

**Alternative.** A stored result keyed by a hash of the tree and the lines. It makes a repeat run free and leaves the
product answering for the correctness of a key it cannot see into.

**Cost.** A repository without a caching tool pays full runs, bounded across the machine by [gate
slots](../glossary.md#gate-slot). The onboarder's proposal mitigates that: `src/services/lifecycle/CachingChecks.ts`
suggests a tool or a fix from `turbo.json` and measured times, installing nothing and editing no tracked file.

> **Careful.** A gate's `writes` folders, held by `src/services/overseer/GateCachePaths.ts`, are a separate matter. They
> are folders the repository's own tool caches into, and the question there is what worker-written code may reach.
> [Confinement](../architecture/confinement.md) owns that rule.

### Review is an optional pipeline phase

**Decision.** The stored pipeline's `review` key turns review on. Without it the Playbook launches no reviewer, a gated
build goes straight to the [merge queue](../glossary.md#merge-queue), and landing skips its check of the Acceptance. See
[Build and review](../architecture/build-and-review.md).

**Alternative.** A mandatory reviewer on every ticket. On a small repository with strong gates, that spends tokens and
time for little.

**Cost.** A board that leaves review out lands on its gates alone: only the builder's own evidence, held by [Customs
check](../architecture/customs-and-gates.md) `V8`, speaks to the Acceptance. No second agent judges it, and nothing
stops a change that passes every gate and misses the point of the ticket.

## Surfaces and seams

### Layout computed in the browser, limits as data

**Decision.** The Overseer's board state carries the progress file as a payload, and `bridge/utils/GeometryUtil.ts`
computes the timeline chart's bars, ticks and labels from it, so a range preset redraws with no round trip, and one
implementation of the geometry exists. Its bounds travel in the payload through `pageLimits`. The payload's
`boardFacts`, from `boardFactsOf`, carries the Board's answers, so the [Bridge](../glossary.md#bridge) holds no copy of
the rules.

**Alternative.** Server-computed layout, or a server copy and a client copy. The first needs a round trip per range
change, and the second gives two implementations that disagree.

**Cost.** The payload is larger than a drawn chart would need, and the browser repeats the arithmetic for each viewer.

### The Bridge is served through `fetch`

**Decision.** The Overseer serves the Bridge from its own `fetch` handler, so every answer but a job file, which keeps
its own sandbox policy, carries the Bridge's Content Security Policy. The policy's `frame-ancestors` lets the separate
agent-dashboard application, and no other, show the Bridge in a frame. `src/services/overseer/OverseerServer.ts` builds
`bridge/index.html` with `Bun.build` on the first page request and serves `/` and each chunk itself. See
[Bridge](../architecture/bridge.md).

**Alternative.** Bun's own HTML route, which is shorter and does the bundling. It takes no headers, so the page cannot
carry the policy.

**Cost.** The first page load waits for a build, and a failed build answers `page-build-failed` until a later request
succeeds. The server owns routing and content types that Bun would otherwise supply.

### Claude only, behind a port

**Decision.** The Overseer launches Claude Code and nothing else, through `AgentAdapter` in `src/lib/agent-launch/`,
behind a port, an interface in the hexagonal sense. Only `src/lib/claude-code/` knows the vendor's stream and command
line, and only `cli/CommandContext.ts` picks the adapter. Services hold the adapter as a parameter, and Watchers and
event logs know no vendor.

**Alternative.** Several vendors from the start, or Claude calls wherever they are needed. The first buys a capability
matrix nobody uses. The second leaves no seam.

**Cost.** A port with one implementation is unproven, and `reportChannel` in `AgentCapabilities` has one possible value.
The seam covers launching: `agent-progress-v2 usage` and the install surface are Claude's by name, and the job live
facts read Claude's transcript layout through `src/services/overseer/ClaudeTranscripts.ts`, outside the port.
[Porting](porting.md) lists what remains.

### Side-by-side product names

[Product names](porting.md#product-names) in Porting says what a rename touches.

**Decision.** This build goes by names of its own, the second of the two spellings [Reading
names](../glossary.md#reading-names) explains. Every such name comes from `PRODUCT_NAMES` in
`src/shared/constants/ProductNames.ts`, which holds `SIDE_BY_SIDE_PRODUCT_NAMES` in this build. So this build and the
released `agent-progress` can be `bun link`ed together, and neither reads or removes the other's files.
`agent-progress-v2 init` and `update` refuse `older-program-present` where the released program keeps a data folder.

**Alternative.** Build under the released names. A link of the checkout then replaces the released program, and a test
run can touch a live board.

**Cost.** Two spellings exist, and readers meet both. `package.json` cannot import the constant, so
`src/ProductNames.spec.ts` holds it to it. The setup, `setup.ts` with its steps in `cli/setup/`, imports the constant;
the two bootstraps that start it, `setup.sh` (macOS, Linux) and `setup.ps1` (Windows), name no product.

## Reading the source comments

Source comments cite a design file, `docs/design/code-owned-lifecycle/design.md`, that is in no git history: it is an
untracked file in the owner's own checkout, so a clone does not have it. The table below stands in for it. The file
holds rationale, never authority.

> **Careful.** The design file predates `pipeline.json`, [Customs checks](../architecture/customs-and-gates.md) `V15`
> and `V16`, and the optional review phase. It specifies a gate cache and a single `checks` line. Where it and the code
> disagree, the code wins.

**Tnn** in a comment is a ticket of the design's plan, and `T1-Pn` is probe Pn in [the probe
record](overseer-claude-probe.md). **Qnn** and **owner answer** name a numbered question the owner answered during
design.

Recompute the table with `git grep -n 'design section' -- '*.ts'`.

| Section | What it covered | Where it is stated here |
| --- | --- | --- |
| 2.5 | The Overseer as only driver, the Pass | [The Pass](../architecture/the-pass.md) |
| 3.2 | State machines | [State machines](../data-model/state-machines.md) |
| 3.6 | Crash, reboot and update matrix, resuming a job | [Failure and recovery](../architecture/failure-and-recovery.md) |
| 4.2 | The Claude Code adapter and its command line | [Roles and launch](../architecture/roles-and-launch.md), [the probe record](overseer-claude-probe.md) |
| 4.3 | Report schemas | [Customs and gates](../architecture/customs-and-gates.md) |
| 4.4 | Permissions per role, the Hatch | [Confinement](../architecture/confinement.md), [Control and Hatch](../architecture/control-and-hatch.md) |
| 4.5 | Subagents and tokens | [Roles and launch](../architecture/roles-and-launch.md) |
| 5 | Trusting nothing an agent says, a build job end to end | [Build and review](../architecture/build-and-review.md) |
| 5.1 | Customs | [Customs and gates](../architecture/customs-and-gates.md) |
| 5.2 | Gates and their sandbox profile | [Customs and gates](../architecture/customs-and-gates.md), [Confinement](../architecture/confinement.md) |
| 5.3 | Second review and rework | [Build and review](../architecture/build-and-review.md) |
| 5.4 | Failure handling, incidents | [Questions and incidents](../architecture/questions-and-incidents.md) |
| 6 | Merge queue | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| 6.2 | Allocation | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| 6.3 | The merge | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| 6.7 | Groups | [Airlocks and groups](../architecture/airlocks-and-groups.md) |
| 7.3 | Regrouping, updating the Overseer | [Baton](../architecture/baton.md), [Failure and recovery](../architecture/failure-and-recovery.md) |
| 7.4 | Job controls | [Control and Hatch](../architecture/control-and-hatch.md) |
| 7.5 | Stuck detection, usage limits | [Failure and recovery](../architecture/failure-and-recovery.md), [Questions and incidents](../architecture/questions-and-incidents.md) |
| 7.6 | A clock decides nothing | This document, [Deciders and bounds](../reference/deciders-and-bounds.md) |
| 8.1 | Filing drafts and the ready step | [State machines](../data-model/state-machines.md), [Assistant and intake](../architecture/assistant-and-intake.md) |
| 8.2 | Questions as decisions | [Questions and incidents](../architecture/questions-and-incidents.md) |
| 8.3 | The Assistant and its incidents | [Questions and incidents](../architecture/questions-and-incidents.md), [Assistant and intake](../architecture/assistant-and-intake.md) |
| 8.4 | Product-owner intake | [Assistant and intake](../architecture/assistant-and-intake.md) |
| 9.1 | The control contract | [Control and Hatch](../architecture/control-and-hatch.md) |
| 9.2 | The CLI surface | [CLI reference](../cli.md), [CLI and install](../architecture/cli-and-install.md) |
| 9.3 | The HTTP and SSE API | [Overseer API](../reference/overseer-api.md) |

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| One tracker | `src/services/tracker/Workspace.ts` | `findWorkspace` | `src/services/tracker/Workspace.integration.spec.ts` |
| One lock hold | `src/services/tracker/TrackerPipeline.ts` | `writeTracker` | `src/services/tracker/TrackerPipeline.spec.ts` |
| Lock and fence | `src/services/tracker/TrackerLock.ts` | `withLock`, `requireStillHeld` | `src/services/tracker/TrackerLock.spec.ts` |
| Journal | `src/services/tracker/HoldJournal.ts` | `commitHold`, `replayHoldJournal` | `src/services/tracker/HoldJournal.spec.ts`, `cli/HoldJournalCrash.integration.spec.ts` |
| Level-triggered steps | `src/lib/tracker-model/Playbook.ts` | `Playbook.nextStepsOf` | `src/lib/tracker-model/Playbook.interleavings.spec.ts` |
| Restart safety | `src/services/overseer/Regrouping.ts` | module | `src/services/overseer/CrashMatrix.spec.ts` |
| Sole driver | `cli/OpenTrackerForWriting.ts` | `nudgeTheOverseer` | `cli/RetiredVerbs.spec.ts` |
| Thin Watcher | `src/lib/watcher/Watcher.ts`, `src/services/overseer/WatcherFleet.ts` | `WatcherFleet` | `src/lib/watcher/Watcher.integration.spec.ts`, `src/lib/watcher/WatcherBundleClosure.spec.ts` |
| Clock confined | `eslint.config.js` | `CLOCK_MESSAGE` selectors | `src/LintRules.spec.ts` |
| Customs | `src/services/lifecycle/Customs.ts` | `CUSTOMS_CHECKS`, `CHECKS_OF_ROLE` | `src/services/lifecycle/Customs.spec.ts` |
| Review verdict | `src/services/lifecycle/ReviewOutcome.ts`, `src/lib/tracker-model/utils/RoundVerdictUtil.ts` | `nextRoundVerdictOf` | `src/services/lifecycle/ReviewOutcome.spec.ts` |
| Opaque gates | `src/services/lifecycle/GateRun.ts` | `gateOutcomeOf` | `src/services/lifecycle/GateRun.integration.spec.ts` |
| No gate cache | `src/services/overseer/JobLaunch.ts`, `src/services/overseer/Airlocks.ts`, `src/services/control/AirlockControls.ts`, `src/services/lifecycle/CachingChecks.ts` | `stepVerdictOf`, `reviewLeftTheTreeAsItWas`, `mergedTreeWasLastPassed`, `landMerge`, `cachingSuggestionsOf` | `src/services/control/AirlockControls.spec.ts`, `src/services/lifecycle/CachingChecks.spec.ts` |
| Optional review | `src/lib/tracker-model/Playbook.ts`, `src/services/overseer/JobLaunch.ts`, `src/services/overseer/Airlocks.ts` | `reviewIsSet`, `settleGate`, `acceptanceIsReviewed` | `src/lib/tracker-model/Playbook.reviewPhase.spec.ts` |
| Layout as data | `bridge/utils/GeometryUtil.ts`, `src/services/render/BoardFacts.ts` | `computeTimeline`, `boardFactsOf` | `bridge/utils/GeometryUtil.spec.ts`, `src/services/render/BoardFacts.spec.ts` |
| Bridge through `fetch` | `src/services/overseer/OverseerServer.ts` | `buildPage`, `OverseerServer.start` | `src/services/overseer/OverseerServer.integration.spec.ts` |
| Vendor port | `src/lib/agent-launch/AgentAdapter.ts`, `cli/CommandContext.ts` | `AgentAdapter` | `src/ImportDirection.spec.ts` |
| Product names | `src/shared/constants/ProductNames.ts`, `cli/adoption/OlderProgramRefusal.ts` | `PRODUCT_NAMES`, `refuseBesideAnOlderProgram` | `src/ProductNames.spec.ts` |
