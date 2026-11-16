# Compounding: the data to gather and what it would improve

> **Question:** What must forge record so that it can say where the tokens and the time of a period went, grade a
> delivered feature, replay it under another configuration, and name what to improve?  
> **Time:** 25 minutes.  
> **Read first:** [The system in twenty minutes](../../concepts/overview.md).  
> **Next:** [Entities: one forge for a monorepo](../../../../../docs/monorepo/research/monorepo-entities/strategy.md),
> [Backlog](../../backlog.md).

Design of 16 November 2026. Nothing here is built, and the Bridge's views for it are a later design. Statements
about today's code were checked against the files named in [Sources](#sources), at commit `ede42a12`. Names of
things that do not exist yet are proposals. The outside sources were opened by a research agent on the same day;
what it could not confirm from an opened page is left out.

## 1. Summary

| Question | Answer |
| --- | --- |
| Can forge already say where the tokens went? | Almost. Every job session's raw stream is kept in its job folder, with a stamp per line, and nothing deletes it. Tokens per call, per tool and per file are a pure function of those files. Only totals reach the log today. |
| Can it say how often gates failed and how long they took? | No. A gate run is logged with a tree and an outcome only: no job, no ticket, no gate name, no duration. The newest red output overwrites the one before. This is the largest gap. |
| Can it replay a delivered ticket? | The start commit is recorded. The ticket text as launched is kept as a hash only, the pipeline a job ran under is not kept, and nothing runs a job that does not land. |
| What is new to gather? | Six things: a record per gate step, the reason of each red handoff, the configuration each job ran under, the ticket text as launched, a mark on everything an experiment writes, and compounding's own records. |
| What is derived, not gathered? | A digest per job and a feature record per delivered ticket, both computed by code from files forge already keeps, so every past job is covered on the first day. |
| What would it improve? | Gates, instructions, the constitution, documentation and the model per role. Each has signals in the numbers, a change forge can already store, and an experiment that tests it. |

## 2. The feature

User starts a compounding run from the Bridge, for one entity of a monorepo or for the whole board, over a time
range User gives. It has four parts:

1. **Numbers.** Code computes every figure of the range from what forge recorded. No model is called.
2. **Metrics.** A metric is a deterministic measurement of one delivered feature. forge ships some; a compounding
   agent defines more with User, each with a test suite that pins what it measures.
3. **Experiments.** The compounding proposes changes to try. Each experiment replays a delivered ticket, the case
   study, from the tree it started on, under the changed configuration: build, review and delivery. The original
   delivered feature is the baseline.
4. **Evaluation.** The metrics grade both features, and an evaluation agent compares them and says which is better
   and why.

forge shows a reminder when two weeks passed since the last run. It starts nothing by itself.

### Decided by the owner

| Topic | Decision |
| --- | --- |
| Trigger | User starts every run. forge keeps the time since the last one and reminds every two weeks. |
| Scope | Per entity in a monorepo. |
| Analysis | Numbers, over a time range User gives. |
| Sessions counted | Jobs the Overseer ran, and their subagents. No session User ran by hand. |
| Case study | A worktree of the tree as it was when the feature started; build, review and deliver with the new configuration. The compounding proposes the experiments, and several may run. |
| Baseline | The original delivered feature. |
| Verdict | The metrics, and the compounding or evaluation agent. |
| Metrics | Anything measurable deterministically. More can be added with a compounding agent, which spars with User on the definition and writes the test suite. |
| What the compounding agent reads | The figures and the job digests. It opens a raw session log only when User points it at one. |
| Control and repetitions | An experiment set defaults to one no-change control and three repetitions per experiment. User sets both per run, after seeing the estimated cost. |
| A board's metrics | Tracked in the repository and landed by a ticket, so the repository's own gates run their test suites. |
| Executing metrics | Allowed, confined as a gate is. |
| Where an experiment delivers | On a reference of its own at the start commit. It never shows on the board; it shows in compounding's views only. |
| How the history is cut | Each experiment runs in a copy of the repository that holds the start commit's history and nothing later. |
| Case study candidates | A ticket the Overseer delivered alone on the main line. |
| The reminder's unit | One per board, and silent when nothing was delivered since the last run. |
| Retention of raw logs | Configurable, by count and not by age, so a board nobody touches loses nothing. The default keeps the newest 100. |
| Briefs forge ships | Compounding either copies a shipped brief and changes the copy, or adds a brief with additions. The shipped briefs stay lean. |
| Bridge views | Designed later. |

The owner's first metrics: the number of unneeded tests, too many comments, how often gates fail, and how often a
session rewrites its own approach.

## 3. Use cases

Ordered by the value the research expects. "Numbers" needs only the analysis; "experiment" needs a case study.

| # | Use case | Needs |
| --- | --- | --- |
| 1 | Spend per delivered ticket, by role, model and token type, with the costliest sessions named. Runs of one task differ up to thirty times in tokens, so averages hide the story and outliers tell it. | Numbers |
| 2 | Failed gate loops: which gate goes red at a first handoff, and what each repair cost in calls and tokens. | Numbers |
| 3 | Flaky gates: red, then green, on the same tree. | Numbers |
| 4 | Gate wall time: time per gate times its runs, the wait for a gate slot, what the cache saved. | Numbers |
| 5 | What filled the context: instruction files, files read again and again, test output, search results. | Numbers |
| 6 | Rework: review rounds, lines reworked by review, tickets filed from reviews, escaped bugs. `review-stats` has most of it. | Numbers |
| 7 | Grading a feature on the owner's metrics, and watching a metric over time. | Metrics |
| 8 | Testing one change (a gate order, a brief, a rule, a model) on a delivered ticket before it reaches the board. | Experiment |
| 9 | A cheaper model for one role: does the feature still pass review, and at what cost? | Experiment |
| 10 | A ledger of accepted changes, graded by the next run: did the change move the figure it was meant to move? | Numbers |
| 11 | An audit of the constitution and the briefs: size, paths and commands that no longer exist, rules no finding ever cites. | Numbers |
| 12 | The reminder itself. | A clock |

## 4. The figures, and where each comes from

"Derived" means code can compute it today from kept files. "Gap" means forge does not record it.

### 4.1 Where did the token spend go?

| Figure | Source | State |
| --- | --- | --- |
| Tokens per job: fresh input, cache creation, cache read, output, thinking | `usage` of each assistant line in `<data>/jobs/<J>/events-<n>.ndjson`; the log's `agent-stopped` keeps input in total, cache read and output | Derived. The log adds cache creation into the input total and drops thinking. |
| Cost in USD | `total_cost_usd` of a session's result, summed into `agent-stopped.costUsd` | Recorded when the vendor named it; no view shows it. |
| Split over the job's own session and its subagents | `TokenCrediting.sessionTokensOf` computes `topLevel` and `subagents`; only the total is stored | Derived. |
| Per role, job kind and attempt | `job-launched` (`kind`, `role`, `ticketIds`, `attempt`) | Recorded. |
| Per model and effort | `<data>/jobs/<J>/launch-settings.json`; the model's full id is on every assistant line | Derived. `agent-stopped` names neither. |
| Per ticket | A row's `tokens` in `progress.json` | Recorded, input only; a bundle's tokens are split evenly over its tickets. |
| Per entity | The job's `entity`, once entities exist | Gap until then; see [section 11](#11-entities). |
| Per configuration | Which pipeline and which instruction files the job ran under | Gap: [G3](#g3-the-configuration-a-job-ran-under). |

### 4.2 How many turns?

| Figure | Source | State |
| --- | --- | --- |
| API calls of the job's own session | `agent-stopped.apiCallCount` | Recorded. |
| API calls of its subagents | Assistant lines with a parent tool use | Derived. |
| Turns as the vendor counts them, and its API time | `num_turns` and `duration_api_ms` of the raw result line; `ClaudeStreamMapper` maps neither | Derived from the raw line. |
| Chat turns sent to the session | `job-messaged`, `job-reopened` | Recorded. |
| Sessions per job: resumes and their causes | `job-interrupted`, `job-resumed` (`cause`, `watcherInstance`) | Recorded. |
| Context at the end, at its peak, and the calls past 200,000 tokens | Per-call usage | Derived. `agent-stopped.endContextTokens` holds the end. |

### 4.3 What were the tokens spent on?

No standard taxonomy exists for this; the research found none in any tool it opened. Two views are proposed, both
deterministic.

**By phase: when in the job.** Each call falls in one phase, with boundaries the event log shows.

| Phase | Starts at |
| --- | --- |
| Orient | The session's first call |
| Build | Its first edit of a file |
| Self-check | A shell command holding a test, type-check or lint fragment, until the next edit |
| Repair | A resume with the cause `handoff-red` |
| Catch-up | A conflict of the target's merge sent to the session |
| Report | The last call before the result |

**By content: what filled the context.** A session pays for its whole context again at every call, so an item
costs its size once, when it enters, and its size again at each later call. The growth of the context between two
calls is exactly what entered between them, so the event log gives both figures per item.

| Content | Read from |
| --- | --- |
| Instruction files: the constitution and each brief | `instructions-<n>.json` names each file's path and content hash |
| The ticket body and the launch text | The first client line of the event log |
| Files read, per path, with how often | Read tool calls and the size of their results |
| Search results | Grep and Glob calls and results |
| Shell output: the session's own check runs, git, installs, other | Shell tool calls and results |
| The red-handoff note with the gate's output | The client line of a `handoff-red` resume |
| Subagent results | Tool results of agent calls |
| Its own output: thinking, prose, the text of edits | The blocks of each assistant line |

`TranscriptUsageUtil` already classifies a transcript this way for subagents (browser calls, shell edits, check
runs, injected instruction characters). `usage` prints it, and says of itself that no job session appears there.

### 4.4 How many times did the gates fail?

| Figure | Source | State |
| --- | --- | --- |
| Gate runs and their outcome | `gate-ran`: `tree`, `outcome`, `cached`, and `cacheReports` once a gate reported | Recorded, with no job, no ticket, no gate name, no phase unless a cache report came. |
| Which gate went red, for which job | `gate.log` in the job folder; the newest red step overwrites it | Gap: [G1](#g1-one-record-per-gate-step). |
| Red handoffs per job | `job-interrupted` with the cause `handoff-red` | Recorded, but not whether a gate or a Customs check went red, nor which: [G2](#g2-the-reason-of-a-red-handoff). |
| First-handoff pass rate per gate | | Gap: G1. |
| Flaky gates | Two steps of one gate on one tree with different outcomes | Gap: G1. |
| A prepare step or an install that failed | The incident `setup-failed`; no gate record | Gap: G1. |
| Reds on the Airlock's merged tree | `gate-ran`, with no job | Gap: G1. |

### 4.5 How much time went into running gates?

| Figure | Source | State |
| --- | --- | --- |
| Wall time of a gate step | Nothing. `GateLineRun.milliseconds` exists and only a gate profile and a pipeline check keep it. | Gap: G1. |
| The wait for a machine-wide gate slot | Nothing | Gap: G1. |
| Time of a gate on a quiet machine | `gate-profiled.elapsedMilliseconds`, on User's press, the newest run per gate and phase | Recorded, and not a job's run. |
| What the cache saved | `cacheReports` (`hit`, `partial`, `miss`) | Recorded; with durations it becomes time. |
| The checks a session runs itself | Shell calls with a check fragment, and the stamps of the call and its result | Derived. This is gate time too, and it is paid in tokens as well: the output enters the context. |

### 4.6 Figures the owner did not ask for, and the same data gives

Time a ticket waited on User (`decision-opened` to `decision-answered`), on the vendor's limit (`usage-limit-hit`),
and for a launch slot; review rounds, findings by class and severity, and reworked lines (`review-recorded`);
permissions a session was denied (`job-ended.deniedPermissions`); incidents by kind; lead time from `ticket-readied`
to `merge-landed`.

## 5. What to gather

Each item is something forge must start recording. Everything else in section 4 is derived.

### G1. One record per gate step

A log record for every prepare step and gate step that ran, wherever it ran: a build or review handoff, the
target's catch-up, the merge before User's Merge, an Airlock's merged tree.

| Field | Why |
| --- | --- |
| `jobId`, `ticketIds`, and the gate's entity once entities exist | Without them a red gate belongs to nobody. |
| `phase` (`build`, `review`, `merge`) and the place it ran | A red at the Airlock that the build phase could have caught is a finding. |
| `stepKind` (`prepare`, `gate`) and `gateName` | The unit every gate figure groups by. |
| `tree` | Two outcomes on one tree is a flaky gate. |
| `outcome`, `exitCode` | As the step verdict holds them today. |
| `elapsedMilliseconds`, `waitedForSlotMilliseconds` | Recorded and shown only, as a profile's duration is. |
| `cacheReport` | As today. |
| `watcherInstance` | Which handoff of the job it judged. |
| Where its output is kept | One output file per red step, not one `gate.log` that the next red overwrites. |

`gate-ran` stays: an Airlock reads the newest one to skip a tree that already passed.

### G2. The reason of a red handoff

`job-interrupted` with `handoff-red` gains what went red: the gate's name, or the Customs check (`V1` to `V17`) and
its reason. A session that fails `V15` in every job points at a brief; one that fails the same gate points at the
gate.

### G3. The configuration a job ran under

- The content hash of the pipeline at launch, on `job-launched`. `PipelineUtil.contentHashOf` exists; nothing stores
  its result.
- Each stored pipeline, kept by that hash. `pipeline.json` is ignored by git and overwritten; the log keeps the names
  of the fields an Apply changed and not their values.
- Each instruction file's content, kept by the hash `instructions-<n>.json` already records. A tracked file can be
  read back from git; a brief in `<data>/briefs/` cannot.

A range of time then splits by configuration, and the ledger can ask whether the figures moved after a change.
Identity is a content hash, as the rules ask.

### G4. The ticket as launched

`start.json` holds `bodyHashAtLaunch`. A replay needs the text, and the pictures it names: the body as the builder
got it, before code wrote the Handoff and the Review sections into it. Keep the text in the job folder at the first
launch.

### G5. A mark on everything an experiment writes

Every job, gate step and token record of an experiment carries its experiment id and its repetition. No experiment
credits a row, counts toward a ticket's bounds or appears in a figure of real work. Compounding's own spend is a
figure of its own: the feature must be able to say what it cost.

### G6. Compounding's own records

| Record | Holds |
| --- | --- |
| A run started and ended | Who started it, the entity, the time range, the version of the metric set. The reminder reads the newest. |
| A proposal and its fate | The target, the change, the figures that support it, and `accepted`, `rejected` or `tried`. A rejected proposal stays out of later runs until new evidence appears. |
| An experiment | The case ticket, the change set, the repetitions, and for each the jobs, the delivered commit and every metric's value. |
| An evaluation | The agent's verdict and reasons, beside the metric values it read. |
| A grading | For an accepted change, the figure it was meant to move, measured again by a later run. |

### What gathering costs

- A new log kind makes the log unreadable to an older program, since a line of an unknown kind refuses the whole
  log. Rolling back past the first such record is no longer possible.
- New records and routes only add, so the system version's minor increases.

### Retention

Today job folders are kept without a bound, and no code that deletes one was found. The owner's rule replaces that:

- The raw logs of the newest 100 are kept, and the number is a setting of the board. The bound is a count, never an
  age, so a board nobody works on keeps all it has, and no clock decides.
- What goes past the bound is the bulk: the event logs and the kept gate outputs. The digest, the gate step
  records, `start.json`, the launch settings, the instruction hashes and the ticket as launched are small and stay
  for good.
- So the digest of a job is written before its raw logs can go: when the job ends.
- A metric defined later can read an old feature's record, digests and trees, and no longer its raw sessions. An old
  ticket stays a case study candidate: its baseline needs the feature record and the two commits, not the logs.

## 6. Derived by code

### The job digest

One document per ended job, a pure function of its event logs and launch files, tested against constructed logs as
`TranscriptUsageUtil` is. It is written when the job ends and kept in the job folder under a format version. For
the jobs that ended before the feature exists it is computed once, from the logs still there, so past work is
covered on the first day. An event log older than the stamps gives `null` for a time, which reads as "nobody
measured", like a row's `tokens`. A new format version can be computed only for the jobs whose raw logs are still
kept.

It holds: the job, kind, role and attempt; the model ids and the effort; tokens by type, by model, and split over
the session and its subagents; cost; calls, turns and chat turns; end and peak context; wall time, API time and
tool time per tool; tool calls, errors and result sizes per tool; reads per path; shell commands by class with
their durations; lines written per path; the phases of 4.3 with calls and tokens; the content classes of 4.3 with
size entered and size carried.

### The feature record

Everything measurable about one delivered feature, the original or an experiment's, in one document. It is the
input of every metric and of the evaluation agent.

| Part | Holds | From |
| --- | --- | --- |
| Identity | Ticket, entity, `original` or the experiment and repetition, the configuration hashes, the model ids, the code version | Log, G3, G5 |
| Trees | Start commit, delivered commit, and the feature's own change: the target's tip at the merge against the landed commit | `start.json`, `merge-started.targetTip`, `merge-landed.commit` |
| Change | Files changed by class, lines added and removed | git |
| Jobs | The digest of every job of the ticket | Section 6 |
| Gates | Every gate step | G1, G2 |
| Review | Rounds, verdicts, claims, findings, reworked lines | `review-recorded` |
| Times | Readied, started, each handoff, delivered, and the waits | Log |
| Afterwards | Bugs whose `introducedBy` names the ticket; for an original only | Log |

## 7. Metrics

A metric maps one feature record to one number. forge's own metrics are language-neutral: they read the log, the
digests and git's own counts. Anything that reads source text depends on the language, so it is a metric of the
board.

**Proposed contract.** A metric is a command line, as a gate is, so forge knows no language. forge hands it the
feature record and read access to the start tree and the delivered tree; it writes its value, its unit and optional
detail to a report file. A metric that only reads is *static*. One that must run something is *executing*, and runs
in a scratch worktree under a gate's confinement, network line and slot limit. A metric has a key, a title, a unit,
the direction that is better, and a version: the content hash of its definition.

**The test suite.** Each metric comes with small feature records and trees whose value is known. The suite proves
the metric measures what User and the compounding agent agreed, and a change of the definition that moves a known
value fails it. The agent's work with User is those cases: this test is unneeded, that one is not.

**Where a board's metrics live.** In a tracked folder of the repository. The compounding agent and User settle the
definition and the cases; a ticket then lands the metric as any change lands, built, reviewed and gated, and the
repository's own gates run its suite from then on. Every clone has the same metrics, and git holds their versions.

The owner's four, as a first definition to spar on:

| Metric | First definition | Kind | Reads |
| --- | --- | --- | --- |
| Failing gates | Red gate steps over all gate steps of the feature's jobs; and the share of gates green at the first handoff | Static, forge's own | Gate steps |
| Rewrites of its own approach | Lines the sessions wrote that are not in the delivered change, over all lines they wrote; files created and then deleted; edits of a region it already edited | Static, forge's own | Digests, the change |
| Too many comments | Comment lines added over code lines added; comment runs longer than the repository's rule allows | Static, the board's | The change |
| Unneeded tests | Test cases the feature added that also pass on the start tree, so they do not exercise the change | Executing, the board's | Both trees |

## 8. Case studies

### What a replay needs

| Need | State |
| --- | --- |
| The tree the feature started on | `startCommit` in `start.json`. It is on the main line's history, so it stays reachable. |
| The ticket as launched | Gap: G4. |
| A job that does not land on the main line | Nothing today: a gate profile and a pipeline check run gates in a fresh worktree and record no green, and neither runs an agent. |
| A target to deliver on | A reference at the start commit that only that repetition moves. Build, review and the Airlock then run as they are. |
| A place to run | A copy of the repository cut at the start commit, one per experiment set. |
| The changed configuration | A pipeline draft and instruction files that apply to the experiment only. |
| The baseline's feature record | Derived, for a ticket delivered through the Overseer whose records exist. |

A ticket is a candidate when the Overseer delivered it alone on the main line: not delivered by hand, not in a
group's release, not in a bundle, since its own change cannot then be cut cleanly from the others'.

An experiment never shows on the board. It has no row, counts toward no bound of a ticket and credits no tokens;
its jobs, its delivery and its figures show in compounding's own views. The original's tokens, times the
experiments and their repetitions, is the estimate User sees before starting a set.

### What the session must not see

Replays leak. In a public benchmark an agent found the fix by listing every reference of the repository, and in
another evaluation a trial read the history an earlier trial left. The experiment's session must not reach the
landed commit or anything after the start commit, the ticket file with its Handoff and Reviews, the work of other
repetitions, or its own baseline. A worktree of the repository shares its objects and references, so a case study
runs in a copy that holds the start commit's history and nothing later: no later commit and no other reference.
It costs disk, and a leak is no longer one missed rule away.

### How far the baseline carries

The original is one run, made by an older forge, under an older pipeline, by whatever model the name `opus` meant
that day. A difference between it and an experiment is the change, plus that drift, plus the spread between two
runs of the same thing. So:

- An experiment set holds one experiment with no change, unless User takes it out. This control separates the change
  from the drift.
- Each experiment runs three times, unless User sets another count. The repetitions show the spread; one run cannot
  show a small gain.
- What a metric reads from a tree compares well. Token and time figures are the noisy ones.
- The evaluation agent sees the metric values and both changes. It judges what no metric holds: whether the
  feature meets the ticket's Acceptance as well as the original does.

## 9. What compounding would improve

Every change below is one forge can already store. An accepted proposal goes the way that kind of change goes
today; compounding adds the evidence and the experiment.

| Target | Signals in the numbers | Changes to propose | Lands by |
| --- | --- | --- | --- |
| **Gates** | Reds at the first handoff per gate; tokens of the repairs each gate causes; wall time times runs; flaky outcomes; `cannot-run`; cache misses; a red at the Airlock that an earlier phase could have caught; sessions running the gate's own line again and again; a finding class that returns in review after review and a check could hold | Order cheap gates first; move a gate to another phase; split a slow gate; give a gate a `fix` line; add a gate for a repeating finding; remove or repair a flaky one; cut the output a red sends back | A pipeline setup in `update` mode, the check that runs a changed gate twice, then Apply |
| **Instructions** | Tokens spent in Orient; the same files read in job after job; a Customs check that refuses again and again; permissions denied again and again; questions to User that repeat; self-checks that double the gates; the size of each brief times the calls that carry it | A brief of the board's with additions, after the shipped one; or a copy of the shipped brief, changed, in its place; say once where things are; remove what no job needs | The role's `instructions` in the pipeline, through Apply; a tracked file through a ticket that names it |
| **Constitution** | Findings of the class `convention` that repeat; rules no finding and no gate ever cites; paths and commands in it that no longer exist; its size times the calls that carry it | One rule added, cut or reworded at a time, never a rewrite; a rule turned into a gate | The constitution commit of an Apply |
| **Documentation** | Reads per path over many jobs; searches that repeat; a large document read whole for one fact; findings of the class `docs`; paths in a document that no longer exist | A map of where things are; a split of a large document; a correction; a page for what sessions keep searching | A ticket, filed with the evidence |
| **Model** | Cost per delivered ticket by role, model, effort, ticket type and size; serious findings per review token; rounds per ticket; escaped bugs; the share of thinking in the output | Another model or effort for one role | `agents.<role>` in the pipeline, through Apply |

Three limits on this list:

- **Instruction files grow, and growth costs.** A study of repository context files found that they do not
  generally raise task success and add over a fifth to the cost; another saw a context rewritten whole collapse and
  score below no context at all. Compounding proposes one small edit at a time, and proposes cuts first.
- **A shipped brief is never edited where it is installed.** `update` rewrites `<data>/briefs/defaults/` whole on
  every refresh. So a board's change is a file of its own in the role's list: an addition after the shipped brief,
  or a changed copy that takes its place. The shipped briefs stay lean, which leaves the board room to add, and a
  board that replaced one no longer follows forge's later changes to it.
- **The ticket's own model is not applied.** A ticket stores `model` and `effort`, and no launch reads them. A model
  per ticket size is therefore not a change forge can store today; a model per role is.
- **The numbers also show what the owner did not list:** the product owner's tickets (findings of the class
  `acceptance-gap`, bodies changed after the claim), the review settings, prepare steps, and the concurrency limit
  (time waiting for a slot). They are candidates for a later version.

The pipeline agent's `advise` mode is the nearest thing forge has. It is given the last 200 `gate-ran` lines, each
an outcome and a tree, which is too little to advise from. The figures of section 4 are the input it lacks.

## 10. The reminder

- A notice, since nobody answers it and it is derived afresh at each Pass: two weeks since the newest
  run-started record, or since the board's first delivery when there is none.
- One per board, whatever its entities: a run of any entity is the newest run.
- Silent when no ticket was delivered since that run. A board nobody worked on has nothing to analyse.
- It names no command. Its sentence names the Bridge's control.
- It is a new exception to "a clock decides nothing", and takes a row in the Deviations table. It launches nothing.
- The research on reminders found that repetition is what wears them out. One notice that stays until a run starts
  is enough; a second mechanism would be noise.

## 11. Entities

Entities are a strategy and not built. Compounding is designed for them and works without them.

- Every record above hangs on a job. Once a job carries `entity` and `stage`, every figure groups by entity with no
  change to what is gathered.
- A gate step also names the entity whose gate it is. A landing runs the gates of every changed entity and of its
  dependents, so that entity is often not the job's.
- A ticket that crosses into a package spends tokens under two entities. They count for the entity of each stage's
  job, not for the ticket's home.
- Each entity has its own constitution, pipeline and agent settings, so each has its own proposals, experiments
  and ledger. Metrics may be shared: a metric of the board applies to every entity whose language it reads.
- Until entities exist, the unit is the tracker: a single repository, or one folder forge.

## 12. Risks

| Risk | What the sources say | Guard in this design |
| --- | --- | --- |
| Noise read as improvement | Single runs of one agent task swing by points even at temperature zero | Repetitions, a control, and a report that says when the sample decides nothing |
| A replay that saw the answer | Agents use any reference or history left in reach | A copy cut at the start commit; the ticket as launched, without Handoff or Reviews |
| Instructions that bloat or collapse | Context files cost and seldom help; whole rewrites collapse | Small edits, cuts first, each tested on a case study |
| Fitting the rules to three tickets | Evaluations need held-out cases | Experiments on more than one case ticket before a change is called good; the ledger grades it on later work |
| Fewer tokens, worse features | Accuracy peaks at a middle cost; cheaper models can add rework | The figure is cost per delivered ticket with its rework, never tokens alone |

## 13. Open questions

The owner answered the first ten on 16 November 2026; they are in [section 2](#decided-by-the-owner). These
remain:

1. **What the retention count counts.** The owner said 100 sessions. This document reads that as the newest 100 job
   folders, since a job's sessions share one folder and are measured together. A count of sessions would cut a
   resumed job in two.
2. **Experiments and the retention count.** A set of four experiments with three repetitions each is some thirty
   jobs. The proposal counts experiment jobs apart, so a set does not push real work past the bound.
3. **One change per experiment?** An experiment with one change says what caused a difference; one with several is
   cheaper and says less.
4. **The evaluation agent and the compounding agent.** Their job kinds, roles, models and what each may reach are not
   designed.
5. **A finding about a shipped brief.** A board solves it with a file of its own. Whether the finding also reaches
   forge's own board, so the shipped brief improves for every board, is not decided.

## Sources

### Code and documents of this repository

| Fact | File |
| --- | --- |
| Log record kinds and fields | `src/lib/tracker-model/constants/LogRecordSchema.ts`, `docs/cli.md` ("`<data>/log.jsonl`") |
| A job's token total and cost | `src/services/overseer/EndedJobTokens.ts`, `src/services/lifecycle/TokenCrediting.ts` |
| The event log and its stamps | `src/lib/watcher/EventLog.ts` |
| What a stream line maps to | `src/lib/agent-launch/AgentSessionEvent.ts`, `src/lib/claude-code/ClaudeStreamMapper.ts` |
| A raw result line | `src/lib/claude-code/testing/fixtures/resume-structured-output.stdout.jsonl` |
| Job folder files, step verdicts, `gate.log` | `src/services/overseer/JobLaunch.ts` |
| Gate duration kept for profiles only | `src/services/lifecycle/GateLineRun.ts`, `docs/cli.md` ("`<data>/gate-profiles.json`") |
| The transcript classifier | `src/lib/claude-code/utils/TranscriptUsageUtil.ts`, `docs/cli.md` ("`usage`") |
| Review figures | `src/lib/tracker-model/ReviewStatistics.ts`, `src/lib/tracker-model/constants/ReviewRecordVocabulary.ts` |
| Pipeline, roles, instruction lists | `src/lib/tracker-model/@types/Pipeline.ts`, `src/services/overseer/InstructionFiles.ts` |
| Model and effort at launch | `src/services/overseer/LaunchSettings.ts`, `docs/cli.md` ("Tickets") |
| Shipped briefs rewritten on every refresh | `cli/adoption/TrackerRefresh.ts`, `cli/adoption/constants/ClaudeCodeInstall.ts` |
| What `advise` is given | `src/services/overseer/PipelineAgentSessions.ts` |
| Customs checks | `src/services/lifecycle/Customs.ts` |
| Decisions, incidents, notices | `src/lib/tracker-model/@types/Decision.ts`, `docs/concepts/overview.md` |
| Entities | `docs/monorepo/research/monorepo-entities/strategy.md`, at the repository root |

### Outside sources

| Topic | Source |
| --- | --- |
| The compound step, its retrospective and its ledger | <https://every.to/guides/compound-engineering>, <https://github.com/EveryInc/compound-engineering-plugin> |
| Token spend of coding agents, and its spread | <https://arxiv.org/abs/2604.22750> |
| Evaluations from real tasks, trials, isolation | <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents> |
| Randomness of single runs | <https://arxiv.org/abs/2602.07150> |
| A replay that found the fix in the references | <https://bayes.net/swebench-hack> |
| Context files and their cost | <https://arxiv.org/abs/2602.11988> |
| Context collapse on a whole rewrite | <https://arxiv.org/html/2510.04618v2> |
| Accuracy degrading with input length | <https://www.trychroma.com/research/context-rot> |
| Instruction file size and conflicts | <https://code.claude.com/docs/en/memory> |
| Cost beside accuracy, and held-out cases | <https://arxiv.org/abs/2407.01502> |
| Flaky tests and their rate | <https://www.trunk.io/blog/what-we-learned-from-analyzing-20-2-million-ci-jobs-in-trunk-flaky-tests-part-1> |
| Test selection | <https://engineering.fb.com/developer-tools/predictive-test-selection/> |
| Rework as a delivery metric | <https://dora.dev/guides/dora-metrics/history/> |
| Repeated reminders | <https://psnet.ahrq.gov/issue/effects-workload-work-complexity-and-repeated-alerts-alert-fatigue-clinical-decision-support> |
