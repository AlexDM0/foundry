# Compounding: the data to gather and what it would improve

> **Question:** What must forge record so that it can say where the tokens and the time of a period went, grade a
> delivered feature, replay it under another configuration, and name what to improve? And what does the whitepaper
> ask of compounding that this design did not yet hold?  
> **Time:** 30 minutes.  
> **Read first:** [The system in twenty minutes](../../concepts/overview.md).  
> **Next:** [Phases and hooks](../../../../../docs/monorepo/context-pipeline.md),
> [The headless forge: Hephaestus and Talos](../../../../../docs/monorepo/hephaestus-talos.md),
> [Entities: one forge for a monorepo](../../../../../docs/monorepo/research/monorepo-entities/strategy.md),
> [Backlog](../../backlog.md).

Version 2, of 23 November 2026. Nothing here is built. Statements about today's code were checked against the files
named in [Sources](#sources), at commit `0f1e760f` on the main line. Names of things that do not exist yet are
proposals. Version 1, of 16 November 2026, is this file at commit `1ba31404`;
[section 17](#17-from-version-1-to-version-2) lists what changed and why. The owner answered this version's
questions on 23 November 2026; the answers are in [section 3](#decided-by-the-owner-on-23-november).

Version 2 has two inputs that version 1 did not have:

- **The codebase after the rework.** Forge is headless: Hephaestus and Talos run the flow, a client of the API is
  the window, a store port holds the records, and entities are built.
- **The whitepaper.** "Agentic Software Factory: Structured Whitepaper" of 20 November 2026, chapter 7, and its tab
  "Foundry on the road to the factory", which makes compounding stage 2 of seven.

## 1. Summary

| Question | Answer |
| --- | --- |
| Can forge already say where the tokens went? | Almost, as in version 1. Every job session's raw stream is kept in its job folder with a stamp per line, and nothing deletes it. Only totals reach the log. New: reading that stream is the agent port's work, so the digest is a capability of the port. |
| Can it say how often gates failed and how long they took? | Half. Since the rework the log holds one record per pipeline step that ran, with its name, phase, entity, run time and ending. It names no job, no ticket and no tree, so a red gate still belongs to nobody. The reason of a red handoff is in a file of the job folder that the next red overwrites. |
| Can it replay a delivered ticket? | Closer. The start commit is recorded, and a committed ticket's title and body are now kept under their content hash. The pipeline a job ran under is still not kept, and nothing runs a job that does not land. |
| What is new to gather? | Six things. Two are smaller than in version 1: the job on each gate step, and the reason of a red handoff in the log. Two are as they were: the configuration each job ran under, and a mark on everything an experiment writes. Compounding's own records are wider. One is new: the session measurements the log drops today. The ticket as launched, which version 1 asked for, is kept now. |
| What does the whitepaper add? | A person's own score of a comparison; a quality agent that is optional; versions and an audit trail for everything compounding changes; a wider list of what can be improved; figures that a company can read above the factory; and a second kind of metric, which an agent judges and which the owner reserved for later. |
| What does the whitepaper confirm? | The loop itself: measure finished work, propose, experiment when wanted, a person decides, nothing is applied automatically. Version 1 already had it. |
| What would it improve? | Gates, briefs, the constitution, skills, documentation, architecture descriptions, the model per role and the codebase itself; and, once phases and hooks exist, the plan, the hooks and the approvals. |

## 2. Where this sits

Compounding is stage 2 of forge's road to the whitepaper's factory. It comes first because it needs nothing outside
the machine, and because it gives every later stage a way to measure itself.

| The whitepaper says (chapter 7) | Version 1 | Version 2 |
| --- | --- | --- |
| Compounding measures finished features and sessions and proposes improvements; a person decides | The same | Kept |
| Metrics are of two kinds: deterministic checks and build statistics, and an agent's analysis of each feature | Deterministic only, by the owner's decision of 16 November | Deterministic first, by the owner's answer of 23 November. The judged kind is reserved for later: [section 8](#8-metrics) |
| Metrics can be part of the harness, but do not have to be | Computed in a run only | A metric is measured in a run, and may also be measured at each delivery once hooks exist |
| Metrics are created and tried with an agent's help | A compounding agent defines a metric with User and writes its test suite | Kept |
| Six areas can be improved: the agents, their guidance, architecture, models, checks, codebase and platform | Five targets: gates, instructions, constitution, documentation, model | All six, mapped to what forge can store: [section 11](#11-what-compounding-would-improve) |
| It runs periodically: by itself, or on a reminder, or when a user triggers it | A reminder every two weeks; User starts every run | Kept. The figures become available without a run: [section 3](#3-the-feature) |
| Outcomes are never applied automatically | The same | Kept |
| Who approves depends on the team and on company policy; a change of the workflow is discussed with the team | User accepts or rejects | User still decides, through the path each kind of change already has: [section 9](#9-proposals-versions-and-the-audit-trail) |
| Every element is versioned, and every compounded change leaves an audit trail | Configuration by content hash; a ledger of accepted changes | The same two, stated as the audit trail, with a version for an agent as a whole |
| The company monitors at its own level and may run an agent store | Not covered | Kept possible, not built: [section 14](#14-among-the-other-stages) |
| An experiment on a past feature is a tool, not a required step | Implied: use cases need "numbers" or an "experiment" | Stated |
| A comparison is judged on a metric suite and by a person; a quality agent is optional; the person may fill in a small eval | The metrics and an evaluation agent | The metric suite, then the person's eval, made in the open, then a quality agent where a board has one |

## 3. The feature

The whitepaper's loop has six steps, and one of them is a person's.

1. **Finished work.** Delivered tickets and the sessions that built them.
2. **Measure.** Code computes the figures. Metrics grade each delivered feature.
3. **Propose.** A compounding run turns the figures into proposals, each with its evidence.
4. **Experiment, when wanted.** A proposal is tried on a delivered ticket, replayed from the tree it started on.
5. **A person decides.** Nothing is applied by the run.
6. **The improved factory.** The next tickets run on the changed configuration, and become case studies in turn.

Its parts in forge:

- **Figures.** Code computes them from what forge recorded. No model is called. They are there without a run: a
  digest is written when each job ends, so a client can show the figures of any range at any time. This is what a
  burn rate per ticket needs.
- **Metrics.** A deterministic measurement of one delivered feature. A metric that an agent judges is reserved for
  later.
- **A compounding run.** User starts it from a client of the API, for one entity or for the whole board, over a
  range User gives. A compounding agent reads the figures and the job digests and writes proposals.
- **Experiments.** Optional. User says which phase an experiment studies. It replays a delivered ticket, the case
  study, under a changed configuration, and the original delivered feature is the baseline.
- **Evaluation.** The metrics grade both results. The person who compares them may record a score of their own. A
  board may add a quality agent that compares the two and says why.

Forge shows a reminder when two weeks passed since the last run. It starts nothing by itself.

### Decided by the owner on 16 November

Carried from version 1, with the names of today's components.

| Topic | Decision |
| --- | --- |
| Trigger | User starts every run. Forge keeps the time since the last one and reminds every two weeks. |
| Scope | Per entity in a monorepo. |
| Analysis | Numbers, over a time range User gives. |
| Sessions counted | Jobs Hephaestus ran, and their subagents. No session User ran by hand. |
| Case study | A copy of the tree as it was when the feature started; build, review and deliver with the new configuration. The compounding proposes the experiments, and several may run. |
| Baseline | The original delivered feature. |
| Verdict | The metrics, and the compounding or evaluation agent. Replaced on 23 November, below. |
| Metrics | Anything measurable deterministically. More can be added with a compounding agent, which spars with User on the definition and writes the test suite. |
| What the compounding agent reads | The figures and the job digests. It opens a raw session log only when User points it at one. |
| Control and repetitions | An experiment set defaults to one no-change control and three repetitions per experiment. User sets both per run, after seeing the estimated cost. |
| A board's metrics | Tracked in the repository and landed by a ticket, so the repository's own gates run their test suites. |
| Executing metrics | Allowed, confined as a gate is. |
| Where an experiment delivers | On a reference of its own at the start commit. It never shows on the board; it shows in compounding's views only. |
| How the history is cut | Each experiment runs in a copy of the repository that holds the start commit's history and nothing later. |
| Case study candidates | A ticket Hephaestus delivered alone on the main line. |
| The reminder's unit | One per board, and silent when nothing was delivered since the last run. |
| Retention of raw logs | Configurable, by count and not by age, so a board nobody touches loses nothing. The default keeps the newest 100. |
| Briefs forge ships | Compounding either copies a shipped brief and changes the copy, or adds a brief with additions. The shipped briefs stay lean. |
| Views | Designed later. They are a client's now, since forge serves no page. |

The owner's first metrics: the number of unneeded tests, too many comments, how often gates fail, and how often a
session rewrites its own approach.

### Decided by the owner on 23 November

Version 2 put its questions to the owner, and one answer led to a further one. The first two rows settle where the
whitepaper of 20 November differs from the decisions of 16 November.

| Topic | Decision |
| --- | --- |
| Kinds of metric | Forge starts with deterministic metrics. A metric that an agent judges is reserved for later, and so is the question of when such a judge runs. |
| Verdict of a comparison | The metric suite, then the person's eval, then a quality agent where a board has one. |
| The person's eval | Always open: the person sees which result is the original, which the experiment made, and what was changed. |
| Figures | Always there, without a run. A run is the analysis and its proposals. |
| Experiments and real work | User gives an experiment set a share of the launch slots. |
| The subject of an experiment | User says which phase is compounded. When the spec or the plan is the subject, that step is compounded in isolation: it runs alone, the experiment ends at the artifact it puts out, and that artifact is what is compared. When the build is the subject, the spec and the plan are kept static as its input. |

## 4. Use cases

Ordered by the value the research expects. "Figures" needs only what code computes; "experiment" needs a case
study. Cases 13 to 16 are new in version 2.

| # | Use case | Needs |
| --- | --- | --- |
| 1 | Spend per delivered ticket, by role, model and token type, with the costliest sessions named. Runs of one task differ up to thirty times in tokens, so averages hide the story and outliers tell it. | Figures |
| 2 | Failed gate loops: which gate goes red at a first handoff, and what each repair cost in calls and tokens. | Figures |
| 3 | Flaky gates: red, then green, on the same tree. | Figures |
| 4 | Gate wall time: time per gate times its runs, the wait for a gate slot, what the cache saved. | Figures |
| 5 | What filled the context: instruction files, files read again and again, test output, search results. | Figures |
| 6 | Rework: review rounds, lines reworked by review, tickets filed from reviews, escaped bugs. `review-stats` has most of it. | Figures |
| 7 | Grading a feature on the owner's metrics, and watching a metric over time. | Metrics |
| 8 | Testing one change (a gate order, a brief, a rule, a model) on a delivered ticket before it reaches the board. | Experiment |
| 9 | A cheaper model for one role: does the feature still pass review, and at what cost? | Experiment |
| 10 | A ledger of accepted changes, graded by the next run: did the change move the figure it was meant to move? | Figures |
| 11 | An audit of the constitution and the briefs: size, paths and commands that no longer exist, rules no finding ever cites. | Figures |
| 12 | The reminder itself. | A clock |
| 13 | Burn rate: tokens and cost per delivered ticket and per size class, per period. The whitepaper asks for it per ticket and per story point; a ticket's `size` is forge's nearest unit. | Figures |
| 14 | Rework by a person, beside rework by the reviewer: what a person sent back, edited or pushed past. | Figures |
| 15 | The judged quality of a feature over time: test quality, adherence to the conventions. | Judged metrics, reserved for later |
| 16 | Once hooks exist: a hook's false reds, its accepts on a red, its cost and its time in the path of every ticket. | Figures |

## 5. The figures, and where each comes from

"Recorded" means a stored record holds it today. "Derived" means code can compute it today from kept files. "Gap"
means forge does not record it.

### 5.1 Where did the token spend go?

| Figure | Source | State |
| --- | --- | --- |
| Tokens per call: fresh input, cache creation, cache read, output | `usage` of each assistant line in `<data>/jobs/<J>/events-<n>.ndjson`, one file per child instance, appended by Talos | Derived |
| Thinking tokens | The result line of a session and its totals per model. No assistant line carries them, and the stream mapper drops them. | Derived, per session and not per call |
| Tokens per job in the log | `agent-stopped`: `totalInputTokens` (fresh input, cache read and cache creation together), `cacheReadInputTokens`, `outputTokens` | Recorded. Cache creation is not apart, and thinking is absent. |
| Cost in USD | `total_cost_usd` of a session's result, the newest per child instance, summed into `agent-stopped.costUsd` | Recorded when the vendor named it. No served document carries it. |
| Split over the job's own session and its subagents | `TokenCrediting.sessionTokensOf` computes `topLevel` and `subagents`; only the total is stored | Derived |
| Per role, job kind and attempt | `job-launched` (`kind`, `role`, `ticketIds`, `attempt`) | Recorded |
| Per pipeline phase | The job kind: `product-owner` is intake, `build`, `review`, and the merge kinds. A plan phase and hooks add theirs when they exist. | Derived. This is the whitepaper's "tokens used per phase". |
| Per model and effort | `<data>/jobs/<J>/launch-settings.json`, written once at the first launch; the model's id is on every assistant turn, and the `started` event names the vendor's version | Derived. `agent-stopped` names neither. |
| Per model, as the vendor totals it | The result event's totals per model, mapped and stored nowhere | Derived |
| Per ticket | A row's `tokens` in `progress.json`: the growth of the input total; a bundle's tokens are split evenly over its tickets | Recorded, input only. The board document serves it per row, per epic and for today. |
| Per entity and stage | `job-launched.entity` and `stage` | Recorded since entities were built |
| Per configuration | Which pipeline and which instruction files the job ran under | Gap: [G3](#g3-the-configuration-a-job-ran-under) |
| Against a budget | `billing.maxBudgetUsd` in the pipeline caps each launch; reaching it opens the decision `budget-reached` | Recorded as a decision; no figure says how near a job came |

### 5.2 How many turns?

| Figure | Source | State |
| --- | --- | --- |
| API calls of the job's own session | `agent-stopped.apiCallCount` | Recorded |
| API calls of its subagents | Assistant lines with a parent tool use | Derived |
| Turns as the vendor counts them, and its API time | `num_turns` and `duration_api_ms` of the raw result line; the stream mapper maps neither | Derived from the raw line |
| Chat turns sent to the session | `job-messaged` (with `byHephaestus`), `job-reopened` | Recorded |
| Sessions per job: resumes and their causes | `job-interrupted`, `job-resumed` (`cause`, `childInstance`), `job-resume-instructed`. The causes are thirteen now, a network outage, a lease that ended and a stopped or crashed forge among them. | Recorded |
| Context at the end, at its peak, and the calls past 200,000 tokens | Per-call usage | Derived. `agent-stopped.endContextTokens` holds the end. |

### 5.3 What were the tokens spent on?

No standard taxonomy exists for this; the research of version 1 found none in any tool it opened. Two views are
proposed, both deterministic.

**By activity: when in the job.** Version 1 called this "phase". The word now belongs to the pipeline, so version 2
calls it activity. Each call falls in one activity, with boundaries the event log shows.

| Activity | Starts at |
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
| The ticket and the launch text | `first-message-<n>.txt` in the job folder, and the first client line of the event log |
| Files read, per path, with how often | Read tool calls and the size of their results |
| Search results | Search tool calls and results |
| Shell output: the session's own check runs, git, installs, other | Shell tool calls and results |
| The red-handoff note with the gate's output | The client line of a `handoff-red` resume |
| Subagent results | Tool results of agent calls |
| Its own output: thinking, prose, the text of edits | The blocks of each assistant line |

`TranscriptUsageUtil` already classifies a transcript this way for subagents (browser calls, shell edits, check
runs, injected instruction characters). `usage` prints it through the agent port, and says of itself that no job
session appears there.

### 5.4 How many times did the gates fail?

| Figure | Source | State |
| --- | --- | --- |
| Gate runs and their outcome | `gate-ran`: `tree`, `outcome`, `cached`, and `cacheReports` once a gate reported. Shipping code always writes `cached: false`. | Recorded, with no job, no ticket and no gate name |
| Each step that ran | `pipeline-step-ran`: `stepKind`, `stepName`, `phase`, `entity`, `runMilliseconds`, `ending` (`passed`, `failed`, `time-bound`). Written for a job's gate runs and installs, for an Airlock and for a gate profile. | Recorded since the rework, with no job, no ticket, no tree and no exit code |
| Which gate went red, for which job | Job folder files: the manifest `gate-run[-n].json`, a verdict file per step, `gate.log`, `red-handoff.json` (`kind`: `gate`, `customs` or `merge-conflict`; `name`; the exit code; the resume count). A later run overwrites the last three. | Gap in the log: [G1](#g1-the-job-on-each-gate-step), [G2](#g2-the-reason-of-a-red-handoff) |
| Red handoffs per job | `job-interrupted` with the cause `handoff-red` | Recorded, without what went red: G2 |
| First-handoff pass rate per gate | | Gap: G1 |
| Flaky gates | Two steps of one gate on one tree with different endings | Gap: G1, since a step names no tree |
| A prepare step or an install that failed | The incident `setup-failed`; a step record is written, a `gate-ran` is not | Recorded without its job: G1 |
| Reds on the Airlock's merged tree | `gate-ran` and step records, with no job | Gap: G1 |
| A dependent's gates on a package build | Steps named `<entity>: <gate>`; reds past the resumes open the decision `dependent-broken` | Recorded without its job: G1 |
| A Customs refusal | Three checks, and V17 once for a job of an entity, send the session back, and `red-handoff.json` names the check. Any other refusal ends the job, and `job-ended.cause` holds a reason. The log never holds the check's id. | Gap: G2 |

### 5.5 How much time went into running gates?

| Figure | Source | State |
| --- | --- | --- |
| Wall time of a step | `pipeline-step-ran.runMilliseconds`, a sleep not counted. A client's pipeline overview shows the newest run per step. | Recorded since the rework; per job it needs G1 |
| The wait for a machine-wide gate slot | Nothing | Gap: G1 |
| Time of a gate on a quiet machine | `gate-profiled.elapsedMilliseconds`, on User's press, the newest run per gate and phase | Recorded, and not a job's run |
| What the cache saved | `cacheReports` (`hit`, `partial`, `miss`) | Recorded; with durations it becomes time |
| The checks a session runs itself | Shell calls with a check fragment, and the stamps of the call and its result | Derived. This is gate time too, and it is paid in tokens as well: the output enters the context. |

### 5.6 What a person did

The whitepaper lists "amount of rework by humans" beside the rework in agent reviews. Forge records the second in
full (`review-recorded` holds the reworked lines of a round). Of a person's part it records a few moves today, and
the phases-and-hooks design adds the rest.

| Figure | Source | State |
| --- | --- | --- |
| A ticket waited on User | `decision-opened` to `decision-answered` | Recorded |
| A person sent text to a session | `job-messaged` without `byHephaestus` | Recorded |
| A ticket went back to draft | `ticket-unreadied` | Recorded |
| A person approved a ticket or accepted a merge | `ticket-approved`, `merge-acceptance-set` | Recorded |
| An accept on a red, an edit of an artifact, findings sent to the builder, a reopening, a move by hand | The audit trail of the phases-and-hooks design, each record with the version it concerns | Not built; that design gathers it |
| Lines changed after a person's findings | The commits between those findings and the next handoff | Derived once the findings are recorded |

### 5.7 Figures the owner did not ask for, and the same data gives

Time a ticket waited on the vendor's limit (`usage-limit-hit`) and for a launch slot; review rounds, findings by
class and severity, and reworked lines (`review-recorded`); permissions a session was denied
(`job-ended.deniedPermissions`); incidents by kind; lead time from `ticket-committed` to `merge-landed`; the stages
of a crossing ticket (`stage-started`, `package-return`).

## 6. What to gather

Each item is something forge must start recording. Everything else in section 5 is derived.

### G1. The job on each gate step

Version 1 asked for a new record per gate step. The rework built most of it as `pipeline-step-ran`. What is left is
the join: a step must name the work it judged.

| Field to add | Why |
| --- | --- |
| `jobId` and `ticketIds`, absent for a gate profile | Without them a red gate belongs to nobody. |
| The place it ran: a handoff, the target's catch-up, the merge before User's accept, an Airlock's merged tree | A red at the Airlock that the build phase could have caught is a finding. |
| `tree` | Two endings on one tree is a flaky gate. |
| `exitCode` and the gate's own outcome | `ending` says how the line ended; a gate that could not run is a different thing from a red one. |
| `waitedForSlotMilliseconds` | Recorded and shown only, as the run time is. |
| `cacheReport` | As `gate-ran` holds it today. |
| `childInstance` | Which handoff of the job it judged. |
| Where its output is kept | One output file per red step, in place of one `gate.log` that the next red overwrites. |

`gate-ran` stays: an Airlock reads the newest one to skip a tree that already passed.

### G2. The reason of a red handoff

`red-handoff.json` already holds what went red: its kind, the gate's name or the Customs check, the exit code and
the resume count. It is a file of the job folder and the next red overwrites it. `job-interrupted` with
`handoff-red` gains those fields, and a job that Customs ends gains the check's id on `job-ended`. A session that
fails `V15` in every job points at a brief; one that fails the same gate points at the gate.

### G3. The configuration a job ran under

- The content hash of the pipeline at launch, on `job-launched`. `PipelineUtil.contentHashOf` exists; its result is
  stored only as the base of a pipeline setup. A row's `pipelineHash` is the hash of a gate phase, not of the
  pipeline.
- Each stored pipeline, kept by that hash. `pipeline.json` is ignored by git and overwritten; `pipeline-applied`
  keeps the names of the fields an Apply changed and not their values.
- Each instruction file's content, kept by the hash `instructions-<n>.json` already records. A tracked file can be
  read back from git; a brief under `<data>/briefs/` cannot.

A range of time then splits by configuration, and the ledger can ask whether the figures moved after a change.
Identity is a content hash, as the rules ask. [Section 9](#9-proposals-versions-and-the-audit-trail) builds the
whitepaper's versions on these three.

### G4. The ticket as launched: closed

Version 1 asked for the ticket text as launched. The rework closed that, and nothing is left to gather:

- A committed ticket's title and body are kept under their content hash in `<data>/committed-content/`, written
  once and never rewritten. A job's `start.json` names the hash as `contentHashAtLaunch`. The Handoff and the
  Reviews that code writes later do not reach that kept content.
- A ticket holds no picture. User's pictures go to the product owner only, and they are kept under the hash of
  their bytes for as long as a log record names them. So a replay from the build needs none, and a replay from the
  intake finds them.

### G5. A mark on everything an experiment writes

Every job, gate step and token record of an experiment carries its experiment id and its repetition. No experiment
credits a row, counts toward a ticket's bounds or appears in a figure of real work. Compounding's own spend is a
figure of its own: the feature must be able to say what it cost.

### G6. Compounding's own records

| Record | Holds |
| --- | --- |
| A run started and ended | Who started it, the entity, the range, the version of the metric set. The reminder reads the newest. |
| A proposal and its fate | The lever, the change, the figures that support it, the figure it is meant to move, and `accepted`, `rejected` or `tried`, with who decided. A rejected proposal stays out of later runs until new evidence appears. |
| What an accepted proposal became | The pipeline revision of the Apply, the ticket, or the constitution commit that carried it. |
| An experiment | The case ticket, the phase it studies, the change set, its share of the launch slots, the repetitions, and for each the jobs, the result and every metric's value. |
| A person's eval | Who, which two results, and the score per criterion. |
| A quality agent's verdict | The verdict and reasons, beside the metric values it read. |
| A grading | For an accepted change, the figure it was meant to move, measured again by a later run. |

### G7. The session measurements the log drops

At a job's end the log keeps three token counts and a cost. The stream holds more, and the digest of
[section 7](#7-derived-by-code) needs it: cache creation apart from input, thinking, the totals per model, the
vendor's turn count and API time, the peak context. They are read from the raw stream, and since the rework only
the agent port's adapter may read it. So the agent port gains one capability, the measurements of a session, and
the digest is built from its answer.

### Where the records live

- **Behind the store port.** Every stored record of compounding (runs, proposals, experiments, values, kept
  pipelines, kept instruction files) is a record of `BoardStore` with a kind of its own, and no code outside the
  local adapter names its path. The contract spec covers it.
- **Raw logs stay local.** Event logs, worktrees and the files of a job folder are outside the store by design. So
  the digest is written by the forge that ran the job, when the job ends, and it goes through the store. A store
  shared between machines then holds every figure, and no machine needs another's logs.
- **Served, not read.** A client gets figures, proposals and experiments as documents of the Hephaestus API, each
  built by a typed mapper, and starts a run through a command. Cost joins the served documents here for the first time.

### What gathering costs

- A log record of an unknown kind, or with an unknown word of a stored vocabulary, refuses the whole log. An older
  program cannot read a log that holds the first new record.
- New records, documents and commands only add, so the system version's minor increases. It is 4.0 today.
- The rework's rule holds here as well: nothing that exists has to be kept, and a stored format may change
  outright.

### Retention

Job folders are still kept without a bound; no code deletes one. The owner's rule replaces that:

- The raw logs of the newest 100 are kept, and the number is a setting of the board. The bound is a count, never an
  age, so a board nobody works on keeps all it has, and no clock decides.
- What goes past the bound is the bulk: the event logs and the kept gate outputs. The digest, the gate step
  records, `start.json`, the launch settings, the instruction hashes and the committed content are small and stay
  for good.
- So the digest of a job is written before its raw logs can go: when the job ends.
- A metric defined later can read an old feature's record, digests and trees, and no longer its raw sessions. An old
  ticket stays a case study candidate: its baseline needs the feature record and the two commits, not the logs.

## 7. Derived by code

### The job digest

One document per ended job, a pure function of the session measurements and the launch files, tested against
constructed logs as `TranscriptUsageUtil` is. It is written when the job ends and kept through the store under a
format version. For the jobs that ended before the feature exists it is computed once, from the logs still there,
so past work is covered on the first day. An event log older than the stamps gives `null` for a time, which reads
as "nobody measured", like a row's `tokens`. A new format version can be computed only for the jobs whose raw logs
are still kept.

It holds: the job, kind, role, attempt, entity and stage; the model ids, the effort and the vendor's version;
tokens by type, by model, and split over the session and its subagents; cost; calls, turns and chat turns; end and
peak context; wall time, API time and tool time per tool; tool calls, errors and result sizes per tool; reads per
path; shell commands by class with their durations; lines written per path; the activities of 5.3 with calls and
tokens; the content classes of 5.3 with size entered and size carried.

### The feature record

Everything measurable about one delivered feature, the original or an experiment's, in one document. It is the
input of every metric, of the person who compares and of a quality agent.

| Part | Holds | From |
| --- | --- | --- |
| Identity | Ticket, entity, size, `original` or the experiment and repetition, the configuration hashes, the agent versions, the code version | Log, G3, G5 |
| Trees | Start commit, delivered commit, and the feature's own change: the target's tip at the merge against the landed commit | `start.json`, `merge-started.targetTip`, `merge-landed.commit` |
| Change | Files changed by class, lines added and removed | git |
| Jobs | The digest of every job of the ticket | Section 7 |
| Gates | Every gate step | G1, G2 |
| Review | Rounds, verdicts, claims, findings, reworked lines | `review-recorded` |
| People | What a person sent back, edited, accepted on a red or pushed past | Section 5.6 |
| Times | Committed, started, each handoff, delivered, and the waits | Log |
| Afterwards | Bugs whose `introducedBy` names the ticket; for an original only | Log |

## 8. Metrics

A metric maps one feature record to one number, and it is deterministic: the same feature record gives the same
number. The owner decided that on 16 November and confirmed on 23 November that forge starts there. The whitepaper
names a second kind, an agent's analysis of each feature. It is
[reserved for later](#judged-metrics-reserved-for-later).

Forge's own metrics are language-neutral: they read the log, the digests and git's own counts. Anything that reads
source text depends on the language, so it is a metric of the board.

**Proposed contract.** A metric is a command line, as a gate is, so forge knows no language. Forge hands it the
feature record and read access to the start tree and the delivered tree; it writes its value, its unit and optional
detail to a report file. A metric that only reads is *static*. One that must run something is *executing*, and runs
in a scratch worktree under a gate's confinement, network line and slot limit. A metric has a key, a title, a unit,
the direction that is better, and a version: the content hash of its definition.

Forge runs gate lines and prepare steps confined today, and has no way to run any other line that way. The
phases-and-hooks design needs the same thing for a command hook: a confined, bounded line on a snapshot. One runner
serves both.

**The test suite.** Each metric comes with small feature records and trees whose value is known. The suite proves
the metric measures what User and the compounding agent agreed, and a change of the definition that moves a known
value fails it. The agent's work with User is those cases: this test is unneeded, that one is not.

### When a metric is measured

The whitepaper says a metric can be part of the harness or not. Both fit.

| When | How | For |
| --- | --- | --- |
| In a run, over the range | Code hands each feature record to each metric | Every metric. Past features are graded on the first day, and a metric defined later grades old work. |
| At each delivery | A hook after the merge that blocks nothing, once hooks exist. The owner's own example of such a hook is a statistics tracker. | A metric a board wants on every feature without asking |

Version 2 proposes that a metric of forge's own is computed for every delivery, since it costs no model call and
the figures are always there. Whether an executing metric of the board runs at every delivery is the board's
choice.

### Where a board's metrics live

In a tracked folder of the repository. The compounding agent and User settle the definition and the cases; a ticket
then lands the metric as any change lands, built, reviewed and gated, and the repository's own gates run its suite
from then on. Every clone has the same metrics, and git holds their versions.

### Judged metrics: reserved for later

The whitepaper's three are test quality per criteria, adherence to the coding conventions, and code complexity,
each an agent's score of a feature against a brief that the board writes. The owner reserved them on 23 November.
What this version found about them is kept here for the version that takes them up:

- **A judged value is not a measured figure.** It would be stored with the judge's version (its brief, model and
  effort) and its repetition, and shown apart.
- **A judge cannot have a test suite that pins a value.** It would have a calibration set: features with a score
  that a person gave. The person's evals of [section 10](#10-case-studies) are such cases, and forge gathers them
  from the first experiment on.
- **A judge costs about as much as a review,** so when it runs is a choice: in a run, or at each delivery.
- **Nothing in this version blocks them.** A value is stored with its metric's version, so a second kind can sit
  beside the first.

### The metrics named so far

| Metric | Named by | Kind | Reads | State of its data |
| --- | --- | --- | --- | --- |
| Failing gates: red steps over all steps, and the share of gates green at the first handoff | Both | Forge's own | Gate steps | Needs G1 |
| Duration of the gates | Whitepaper | Forge's own | Gate steps | Recorded per step; per feature it needs G1 |
| Tokens per phase | Whitepaper | Forge's own | Digests | Derived |
| Rework in agent reviews | Whitepaper | Forge's own | `review-recorded` | Recorded |
| Rework by a person | Whitepaper | Forge's own | Section 5.6 | Partly recorded |
| Rewrites of its own approach: lines the sessions wrote that are not in the delivered change; files created and then deleted; edits of a region already edited | Owner, 16 November | Forge's own | Digests, the change | Derived |
| Comment lines added; comment runs longer than the repository's rule allows | Both | The board's, static | The change | Derived |
| Anti-slop checks | Whitepaper | The board's, static | The change | A tool the board names |
| Unneeded tests: test cases the feature added that also pass on the start tree | Owner, 16 November | The board's, executing | Both trees | Derived |
| Code coverage by feature: the share of the changed lines that the feature's tests run | Whitepaper | The board's, executing | The delivered tree | Derived |
| Code complexity | Whitepaper, as an agent's analysis | The board's, static, where the board has a complexity tool; else judged and reserved | The change | Derived |
| Test quality per criteria | Whitepaper | Judged: reserved | Both trees | |
| Adherence to the coding conventions | Whitepaper | Judged: reserved | The change, the constitution | |

## 9. Proposals, versions and the audit trail

### Who decides

The whitepaper leaves this to the team and to company policy: the company whitelists what a team controls, a
developer applies what touches no workflow, and a change of the workflow is discussed with the team. Forge is one
owner on one machine, so every proposal is User's to accept. The shape still fits a team later:

- **A proposal changes nothing.** It is a record with its evidence. Accepting it starts the path that kind of
  change already has: a pipeline setup that User applies, a ticket that passes ticket review, or the constitution
  commit of an Apply. So every approval forge has today, and every approval a board declares later, also guards a
  compounded change.
- **A proposal names its lever.** A board can then list the levers compounding may propose on, which is the
  whitepaper's whitelist. The default is all of them. Proposed, not decided.
- **A proposal on the workflow is marked as one.** Gates, phases, hooks and approvals are the workflow. On a board
  with roles, that mark routes the proposal to the role that owns the workflow.

### Versions

The whitepaper asks that every element compounding can change is versioned. In forge a version is a content hash,
and most of them exist.

| Element | Its version | State |
| --- | --- | --- |
| The pipeline | `PipelineUtil.contentHashOf` | Computed; kept nowhere per job: G3 |
| An instruction file: a brief, the constitution | The hash in `instructions-<n>.json` | Recorded per launch; the content is not kept: G3 |
| The constitution on the main line | Its commit | Recorded on `pipeline-applied` |
| A gate phase | The phase hash on a row's green | Recorded |
| A metric | The hash of its definition | Proposed |
| An agent as a whole | The hash over a role's instruction file hashes, its model and its effort | Proposed |

The last row is the whitepaper's "each agent for a specific task is versioned". With it a figure can be grouped by
agent version, two versions of the builder can be compared, and one agent can be handed to another board as one
thing.

### The audit trail

The records of G6 are the trail. For one compounded change they answer, in order: which figures led to it, who
accepted it, what it became (a pipeline revision, a ticket, a constitution commit), which configuration hashes
changed with it, and whether a later run saw the figure move. The log is append-only, so the trail is too.

## 10. Case studies

An experiment is a tool. A run can end in proposals that User accepts on the figures alone.

### What a replay needs

| Need | State |
| --- | --- |
| The tree the feature started on | `startCommit` in `start.json`. It is on the main line's history, so it stays reachable. |
| The ticket as committed | Kept by its content hash: [G4](#g4-the-ticket-as-launched-closed). |
| A job that does not land on the main line | Nothing today. A gate profile and a pipeline check run gates in a fresh worktree and record no green, and neither runs an agent. |
| A target to deliver on | A reference at the start commit that only that repetition moves. Build, review and the Airlock then run as they are. |
| A place to run | A copy of the repository cut at the start commit, one per experiment set. It is local, as every worktree is. |
| The changed configuration | A pipeline draft and instruction files that apply to the experiment only. |
| The baseline's feature record | Derived, for a ticket delivered through Hephaestus whose records exist. |
| A cap on its spend | `billing.maxBudgetUsd` caps a launch today. An experiment set needs a cap of its own, shown with the estimate. |
| Launch slots | User gives the set a share of the board's launch slots when starting it. Real work keeps the rest while the set runs. |

A ticket is a candidate when Hephaestus delivered it alone on the main line. Since the rework that excludes more:

- a ticket delivered by hand, in a group's release or in a bundle, as in version 1: its own change cannot be cut
  cleanly from the others';
- a crossing ticket, whose stages ran under several entities and whose package changes were sealed;
- a ticket that declared a need, or whose group holds a fix ticket of a dependent.

An experiment never shows on the board. It has no row, counts toward no bound of a ticket and credits no tokens;
its jobs, its delivery and its figures show in compounding's own views. The original's tokens, times the
experiments and their repetitions, is the estimate User sees before starting a set.

### The subject of an experiment

User says which phase an experiment compounds. What comes before that phase is kept static as its input, and only
the subject runs under the changed configuration.

| Subject | Kept static as input | What runs | What is compared |
| --- | --- | --- | --- |
| The build | The ticket as committed, and the accepted plan where the board has one, each by its hash | Build, review and delivery, as the owner decided on 16 November | Two delivered features, on their feature records |
| The plan, once it is a phase | The ticket as committed | The plan phase alone | Two plans |
| The spec | The request as User gave it to the intake | The intake alone | Two tickets |
| The review | The commit the builder handed over | Review and delivery | Two delivered features |

The first three rows are the owner's answers of 23 November. An experiment on the plan ends at the plan: no build
follows it, and the two plans are what is compared. The spec is read the same way. The last row is this document's,
by the same rule: a change of the reviewer's brief or model is a use case of section 4. Two things follow, and each
is in [section 16](#16-open-questions):

- **A spec or a plan is no delivered feature,** so no metric of section 8 grades it. The person's eval compares the
  two artifacts. A deterministic metric of an artifact is not designed.
- **The intake is a conversation with a person,** and an experiment asks no person anything.

Inside its subject an experiment still asks nobody. An approval the pipeline declares there is passed by the
experiment and recorded as passed by it. A session that asks a question ends its repetition there, and that is a
result: the original asked, or it did not.

### What the session must not see

Replays leak. In a public benchmark an agent found the fix by listing every reference of the repository, and in
another evaluation a trial read the history an earlier trial left. The experiment's session must not reach the
landed commit or anything after the start commit, the ticket file with its Handoff and Reviews, the work of other
repetitions, or its own baseline. A worktree of the repository shares its objects and references, so a case study
runs in a copy that holds the start commit's history and nothing later: no later commit and no other reference.
It costs disk, and a leak is no longer one missed rule away. Customs and the session's confinement apply as in any
job.

### How far the baseline carries

The original is one run, made by an older forge, under an older pipeline, by whatever model the tier `opus` meant
that day. A difference between it and an experiment is the change, plus that drift, plus the spread between two
runs of the same thing. So:

- An experiment set holds one experiment with no change, unless User takes it out. This control separates the change
  from the drift.
- Each experiment runs three times, unless User sets another count. The repetitions show the spread; one run cannot
  show a small gain.
- What a metric reads from a tree compares well. Token and time figures are the noisy ones.

### How a comparison is judged

In the whitepaper's order, which the owner confirmed on 23 November:

1. **The metric suite.** Every metric of the board grades both results. This is the score the ledger keeps.
2. **The person.** The person who compares may fill in a small eval: a few criteria, a score each. Forge stores it,
   so there is a number to calculate with. The eval is always open: the person sees which result is the original,
   which the experiment made, and what was changed.
3. **A quality agent, where the board has one.** It sees the metric values and both changes and judges what no
   metric holds: whether the feature meets the ticket's Acceptance as well as the original does.

## 11. What compounding would improve

Every change below is one forge can already store, unless its row says otherwise. An accepted proposal goes the way
that kind of change goes today; compounding adds the evidence and, when wanted, the experiment. The first column is
the whitepaper's area.

| Area | Lever in forge | Signals in the figures | Changes to propose | Lands by |
| --- | --- | --- | --- | --- |
| **The agents themselves** | The briefs of a role: builder, reviewer, re-reviewer, conflict re-reviewer per entity; product owner and pipeline agent per forge | Tokens spent in Orient; the same files read in job after job; a Customs check that refuses again and again; permissions denied again and again; questions to User that repeat; self-checks that double the gates; the size of each brief times the calls that carry it | A brief of the board's with additions, after the shipped one; or a copy of the shipped brief, changed, in its place; say once where things are; remove what no job needs | The role's `instructions` in the pipeline, through Apply; a tracked file through a ticket that names it |
| **Guidance: the constitution** | One per entity | Findings of the class `convention` that repeat; rules no finding and no gate ever cites; paths and commands in it that no longer exist; its size times the calls that carry it | One rule added, cut or reworded at a time, never a rewrite; a rule turned into a gate | The constitution commit of an Apply |
| **Guidance: the repository's own instruction file, skills, readme and docs** | Tracked files. Forge never writes a repository's own instruction file. | Reads per path over many jobs; searches that repeat; a large document read whole for one fact; findings of the class `docs`; paths in a document that no longer exist | A map of where things are; a split of a large document; a correction; a page for what sessions keep searching; a skill for a task sessions redo by hand | A ticket, filed with the evidence |
| **Architecture** | The architecture rules of an entity's constitution, and tracked descriptions | Findings about structure that repeat; a red architecture test; changes outside an entity's home that Customs V17 sends back | A description made exact; a rule turned into an architecture test | A ticket, or the constitution commit. A description that a team may not edit and that forge injects is a later stage's: it needs roles. |
| **Models** | `agents.<role>`, model and effort, per entity | Cost per delivered ticket by role, model, effort, ticket type and size; serious findings per review token; rounds per ticket; escaped bugs; the share of thinking in the output | Another model or effort for one role | The pipeline, through Apply |
| **Checks** | Gates with their phases, `fix` line, network line and prepare steps; the re-review threshold | Reds at the first handoff per gate; tokens of the repairs each gate causes; wall time times runs; flaky outcomes; a gate that cannot run; cache misses; a red at the Airlock that an earlier phase could have caught; sessions running the gate's own line again and again; a finding class that returns in review after review and a check could hold | Order cheap gates first; move a gate to another phase; split a slow gate; give a gate a `fix` line; add a gate or a deterministic tool for a repeating finding; remove or repair a flaky one; cut the output a red sends back | A pipeline setup in `update` mode, the check that runs a changed gate twice, then Apply. CI outside forge is a later stage. |
| **Codebase and platform** | The code itself; the machine's limits | Files that draw the most rework, reds and reads; a gate that is slow on every tree; time waiting for a launch slot or a gate slot | A ticket that pays a debt; a cache path for a gate; another concurrency limit | A ticket, filed with the evidence; the board's and the machine's settings |
| **The workflow**, once phases and hooks exist | The plan phase, the hooks of each hook point, the approvals | A hook's reds that a person accepts anyway; its cost per ticket and its time in the path; an approval's wait, and how many versions it took; plans that the build did not follow | Move a noisy judge to "halt for a person"; drop a hook that never says no; switch the plan on for one entity | Pipeline setup, through Apply. Marked as a change of the workflow. |

Limits on this list:

- **Instruction files grow, and growth costs.** A study of repository context files found that they do not
  generally raise task success and add over a fifth to the cost; another saw a context rewritten whole collapse and
  score below no context at all. Compounding proposes one small edit at a time, and proposes cuts first.
- **A shipped brief is never edited where it is installed.** `update` rewrites `<data>/briefs/defaults/` whole on
  every refresh. So a board's change is a file of its own in the role's list: an addition after the shipped brief,
  or a changed copy that takes its place. The shipped briefs stay lean, which leaves the board room to add, and a
  board that replaced one no longer follows forge's later changes to it.
- **The ticket's own model is not applied.** A ticket stores `model` and `effort`, and no launch reads them. A model
  per ticket size is therefore not a change forge can store today; a model per role is.
- **The figures also show what nobody listed:** the product owner's tickets (findings of the class
  `acceptance-gap`), the review settings, and the Assistant, whose switch the rework left to "accumulated data".

The pipeline agent's `advise` mode is the nearest thing forge has. It is still given the last 200 `gate-ran` lines,
each an outcome and a tree, which is too little to advise from. The figures of section 5 are the input it lacks.

## 12. The reminder

The whitepaper allows three ways: compounding runs by itself, the factory reminds, or a user triggers it. The owner
chose the last two for forge.

- A notice, since nobody answers it and it is derived afresh at each Pass: two weeks since the newest run-started
  record, or since the board's first delivery when there is none. No notice of today's is a reminder.
- One per board, whatever its entities: a run of any entity is the newest run.
- Silent when no ticket was delivered since that run. A board nobody worked on has nothing to analyse.
- It names no command. Its sentence names a neutral action, and a client shows the control.
- The rules now read "a clock gives no fact". This notice launches nothing and only selects what is shown, which
  those rules allow a timestamp to do. Whether it still takes a row in the Deviations table is the owner's reading
  of that rule.
- The research on reminders found that repetition is what wears them out. One notice that stays until a run starts
  is enough; a second mechanism would be noise.
- How often a team compounds is company policy in the whitepaper. The two weeks is then a setting of the board.

## 13. Entities

Entities are built. Compounding is designed for them and works without them.

- A job carries `entity` and `stage`, and `job-launched` records both. Every figure of a job groups by entity with
  no change to what is gathered.
- A step record names the entity whose gate it is. A package build runs its dependents' gates as well, named
  `<entity>: <gate>`, so that entity is often not the job's.
- A crossing ticket spends tokens under several entities. They count for the entity of each stage's job, not for
  the ticket's home.
- Each entity has its own constitution, prepare steps, gates, phases, review settings, agent settings and
  concurrency, so each has its own proposals, experiments and ledger. The product owner, the pipeline agent and the
  Assistant are the forge's, and so are proposals about them. Metrics may be shared: a metric of the board applies
  to every entity whose language it reads.
- A crossing ticket is no case study candidate: [section 10](#10-case-studies).
- On a forge without entities, the unit is the tracker.

## 14. Among the other stages

The whitepaper's road places compounding second of seven.

| Stage | What compounding gives it | What it gives compounding |
| --- | --- | --- |
| 3. A configurable workflow: phases and hooks | The figures that say what a hook, a plan or an approval costs and catches | The runner for a confined line on a snapshot; a hook after the merge, where a metric runs at each delivery; the audit trail of what a person did; the plan, as one more phase to count and to replay from |
| 4. Company systems at the boundary | A figure to report outward | A way out: in the phases-and-hooks design a hook after the merge reports to another system. CI becomes a check to improve. |
| 5. Shared state, many machines | The cost and rework of a ticket, which say whether a second machine pays | One record of figures for the factory, since every digest goes through the store |
| 6. Teams and the company | Burn rate per ticket and per size class, the metric values and the run records, served as documents a company view can read; an agent's version, which an agent store needs | Roles, so a proposal goes to who may accept it; whitelists; a policy for how often a team compounds |
| 7. Other workflows | A metric and a proposal are not tied to software | Features that are not code |

**A build order, proposed.** Compounding does not have to arrive whole.

1. **Figures.** G1, G2, G3 and G7, the digest, the feature record, the served documents and a client's view of them.
   This step calls no model and needs nothing from the other stages.
2. **Metrics and proposals.** The measured metrics of forge's own, the compounding run, the proposal records and
   the reminder. A board's metrics follow once the runner exists.
3. **Experiments.** The job that does not land, the cut copy, G5, the person's eval and the optional quality agent.

## 15. Risks

| Risk | What the sources say | Guard in this design |
| --- | --- | --- |
| Noise read as improvement | Single runs of one agent task swing by points even at temperature zero | Repetitions, a control, and a report that says when the sample decides nothing |
| A replay that saw the answer | Agents use any reference or history left in reach | A copy cut at the start commit; the ticket as committed, without Handoff or Reviews |
| Instructions that bloat or collapse | Context files cost and seldom help; whole rewrites collapse | Small edits, cuts first, each tested on a case study |
| Fitting the rules to three tickets | Evaluations need held-out cases; the whitepaper names it: recursive overfitting on bad practice | Experiments on more than one case ticket before a change is called good; the ledger grades it on later work; nothing is applied automatically |
| Fewer tokens, worse features | Accuracy peaks at a middle cost; cheaper models can add rework | The figure is cost per delivered ticket with its rework, never tokens alone |
| A judge that drifts, flatters or costs a review per feature | The phases-and-hooks design warns that a builder can write for the judge, and that judges multiply false reds | Judged metrics are reserved for later; forge starts with deterministic ones |
| A person's eval that proves nothing | One person, a few comparisons, made in the open | Stored as a score beside the metrics, never in their place |
| Experiments that starve real work | An experiment set is some thirty jobs | User gives a set its share of the launch slots; a cap on a set's spend |

## 16. Open questions

The owner answered the questions this version first asked on 23 November 2026; the answers are in
[section 3](#decided-by-the-owner-on-23-november). These remain. Questions 1 and 2 follow from those answers, and
questions 3 to 7 are carried from version 1.

1. **What measures a spec or a plan.** An experiment on either compares the two artifacts it put out, and a feature
   record does not describe one. With judged metrics reserved, that comparison rests on the person's eval, and on
   a deterministic metric of an artifact where a board defines one. That kind of metric is not designed.
2. **A replay of the spec.** The intake is a conversation in which a person answers. A replay asks no person
   anything, so it can only run the product owner on the request as User first gave it. Whether that is worth
   comparing is open.
3. **What the retention count counts.** The owner said 100 sessions. This document reads that as the newest 100 job
   folders, since a job's sessions share one folder and are measured together.
4. **Experiments and the retention count.** A set of four experiments with three repetitions each is some thirty
   jobs. The proposal counts experiment jobs apart, so a set does not push real work past the bound.
5. **One change per experiment?** An experiment with one change says what caused a difference; one with several is
   cheaper and says less.
6. **The compounding agent and the quality agent.** Their job kinds, roles, models and what each may reach are not
   designed. A new job kind touches the job and role unions, a default brief, the launch settings, the Playbook and
   the log's vocabulary.
7. **A finding about a shipped brief.** A board solves it with a file of its own. Whether the finding also reaches
   forge itself, so the shipped brief improves for every board, is not decided. No forge tracks forge's own
   repository, so today it could only arrive as a ticket a person files there.

Reserved by the owner, and so no question of this version: judged metrics, and when a judge runs.

## 17. From version 1 to version 2

| What changed | Why |
| --- | --- |
| The Bridge is gone, and a client of the API is the window; the Overseer is Hephaestus; the Watcher is Talos; source paths moved to `src/services/hephaestus/` | The rework |
| Compounding's records go through the store port, and its views and commands through the Hephaestus API | The rework: `BoardStore`, the contract package, typed mappers |
| The digest is built from the agent port's measurements of a session | The rework: only the agent port's adapter reads the vendor's stream |
| G1 shrank from a new record to the join of a step with its job | The rework records `pipeline-step-ran` |
| G2 moves a reason from a file to the log | The rework writes `red-handoff.json` |
| G4 is closed | The rework keeps committed content by hash, and pictures by the hash of their bytes |
| G7 is new: the measurements the log drops | The check of the code: thinking, cache creation and the totals per model are in the stream and nowhere else |
| Entities are built, and a crossing ticket is no case study candidate | The rework |
| "Phase" inside a job is "activity" | The pipeline owns the word, and the whitepaper measures tokens per phase |
| Judged metrics are named, and reserved for later | The whitepaper, 7.1; the owner's answer of 23 November |
| A metric may be measured at each delivery | The whitepaper, 7.1, and the hook after the merge of the phases-and-hooks design |
| The person's eval, made in the open, and the quality agent as an option | The whitepaper, 7.4; the owner's answer of 23 November |
| Proposals, versions and the audit trail have a section; an agent has a version as a whole | The whitepaper, 7.3 |
| Three more areas to improve: skills and the repository's instruction file, architecture, the codebase; and the workflow | The whitepaper, 7.2; the phases-and-hooks design |
| Figures are there without a run | The whitepaper's company-level monitoring needs a burn rate at any time; the owner's answer of 23 November |
| An experiment names the phase it studies, and gets a share of the launch slots. One on the spec or the plan ends at that artifact. | The owner's answers of 23 November |
| A cap on an experiment's spend | The pipeline's `billing` |
| The other stages and a build order | The whitepaper's road |

## Sources

### Code and documents of this repository

Checked at commit `0f1e760f`. A path names a file of forge from `apps/forge/`, and a file of the root or of a
package from the repository root.

| Fact | File |
| --- | --- |
| Log record kinds and fields | `src/lib/tracker-model/constants/LogRecordSchema.ts`, `docs/cli.md` ("`<data>/log.jsonl`") |
| A job's token total and cost | `src/services/hephaestus/EndedJobTokens.ts`, `src/services/lifecycle/TokenCrediting.ts` |
| The event log and its stamps | `src/lib/talos/EventLog.ts` |
| What a stream line maps to | `src/lib/agent-launch/AgentSessionEvent.ts`, `src/lib/claude-code/ClaudeStreamMapper.ts` |
| A raw result line | `src/lib/claude-code/testing/fixtures/resume-structured-output.stdout.jsonl` |
| Job folder files, step verdicts, the gate run manifest, `gate.log`, `start.json` | `src/services/hephaestus/JobLaunch.ts` |
| The red handoff file | `src/services/hephaestus/RedHandoff.ts` |
| Gate lines, their confinement and slots | `src/services/lifecycle/GateLineRun.ts`, `src/services/lifecycle/GateRun.ts`, `src/services/hephaestus/GateRunSlots.ts` |
| Gate profiles and the pipeline check | `src/services/hephaestus/GateProfiling.ts`, `src/services/hephaestus/PipelineChecking.ts` |
| The Airlock's reading of `gate-ran` | `src/services/hephaestus/Airlocks.ts` |
| The transcript classifier | `src/lib/claude-code/utils/TranscriptUsageUtil.ts`, `docs/cli.md` ("`usage`") |
| Review figures | `src/lib/tracker-model/ReviewStatistics.ts`, `src/lib/tracker-model/constants/ReviewRecordVocabulary.ts` |
| Pipeline, roles, entities, billing, approvals | `src/lib/tracker-model/@types/Pipeline.ts`, `src/lib/tracker-model/utils/PipelineUtil.ts` |
| Instruction files and their hashes | `src/services/hephaestus/InstructionFiles.ts` |
| Model and effort at launch | `src/services/hephaestus/LaunchSettings.ts`, `docs/cli.md` ("Tickets") |
| Committed content by hash, and the pictures | `src/adapters/tickets/CommittedContentFile.ts`, `src/lib/tracker-model/utils/TicketBodyHashUtil.ts`, `docs/cli.md` ("`<data>/committed-content/<hash>.json`", "`<data>/pictures/`") |
| Shipped briefs rewritten on every refresh | `cli/adoption/TrackerRefresh.ts`, `cli/adoption/constants/AgentInstall.ts` |
| What `advise` is given | `src/services/hephaestus/PipelineAgentSessions.ts` |
| Customs checks | `src/services/lifecycle/Customs.ts` |
| Job kinds and roles | `src/lib/tracker-model/@types/Job.ts` |
| Decisions, incidents, notices | `src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts`, `src/services/hephaestus/DrivePass.ts`, `docs/concepts/overview.md` |
| The budget of a launch | `src/services/hephaestus/ApiBillingStops.ts` |
| A ticket's size | `src/lib/tracker-model/@types/Ticket.ts` |
| The store port | `src/services/store/BoardStore.ts`, `src/StoreBoundary.spec.ts` |
| The agent port's boundary | `src/AgentBoundary.spec.ts` |
| The system version | `packages/forge-contracts/constants/ForgeSystemVersions.ts`, `docs/reference/hephaestus-api.md` |
| The rework: headless forge, ports, the store | `docs/monorepo/hephaestus-talos.md` |
| Phases, hooks, artifacts, approvals | `docs/monorepo/context-pipeline.md`, as it stood in the working tree on 23 November 2026 |
| Entities | `docs/monorepo/research/monorepo-entities/strategy.md`, `src/services/hephaestus/CrossingStages.ts` |

Not confirmed by this check: whether the gate run of the merge before User's accept writes step records, and how a
step's verdict file is named per child instance.

### The whitepaper

"Agentic Software Factory: Structured Whitepaper", the owner's document of 20 November 2026, read on 23 November
2026: chapter 7 ("Compounding: how the factory improves") and the tab "Foundry on the road to the factory".

### Outside sources

Opened by a research agent on 16 November 2026 for version 1, and not opened again for version 2.

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
