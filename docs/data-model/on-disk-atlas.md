# On-disk atlas

> **Question:** What is this file, who writes it, who reads it, when does it die, and may it be touched?
> **Time:** 10 minutes to read, seconds to look up one file.
> **Read first:** [Entities and identity](entities.md), [Reading names](../glossary.md#reading-names).
> **Next:** [How a write commits](storage.md), [Reference](../cli.md), [Confinement](../architecture/confinement.md).

## In one screen

![Two groups of zones. In the repository: the data folder for one board, with one folder per job; the worktrees folder with the code agents change and each job's Hatch files; and the installed .claude items. In the home folder: the monitor folder for the whole machine, the vendor transcripts this system only reads, and the optional login item. A job's record is in the data folder, not the worktrees folder.](../figures/on-disk-atlas/three-zones.png)

*Notice the scope line under each folder name: `<data>` is one board, `<monitor>` the whole machine.*

Every path this system owns sits in one of these zones. It also adds entries to `.gitignore`.

- [`<data>`](../glossary.md#reading-names) is one [board](../glossary.md#board). It sits at the repository root and
  every [worktree](../glossary.md#worktree) shares it. It holds the [three stores](entities.md), one folder per
  [job](../glossary.md#job), and the [Overseer](../glossary.md#overseer)'s own files.
- `<worktrees>` holds the code [agents](../glossary.md#agent) change and each job's [Hatch](../glossary.md#hatch)
  folder.
- `<monitor>` holds what several boards on one machine must share: the [usage marker](../glossary.md#usage-marker),
  which holds launches on every board; the [gate slots](../glossary.md#gate-slot), which cap [gate](../glossary.md#gate)
  runs; and the [Watcher](../glossary.md#watcher) sockets.
- `.claude/` holds the installed skills and hook. The login item is optional. `$CLAUDE_CONFIG_DIR/projects/` (else
  `~/.claude/projects/`) belongs to Claude Code, the vendor's CLI: this system reads it and never writes it.

The rule for touching anything: stored state changes through an `forge` command, never by hand, except a
[ticket](../glossary.md#ticket)'s body and `pipeline.json`. Installed files come back with `forge update`.
Nothing removes job folders; the [housekeeping section](#housekeeping-what-goes-away) says what does go.

## Write modes

Four modes cover every file, and two questions place each one.

![A grid of two questions. Columns ask whether one caller wins or every caller writes; rows ask whether a reader sees whole files or can see a partial file. createFileAtomically wins and shows whole files. writeFileAtomically writes for every caller and shows whole files. writeFileSync with flag wx wins but can be read mid-write. Plain write and append write for every caller and can be read partial.](../figures/on-disk-atlas/write-modes-grid.png)

*Notice that exclusive create sits in both rows: `createFileAtomically` shows no partial file wherever hard links work,
while `writeFileSync` with flag `wx` can be read mid-write, which gate slots and repair patches accept. Where hard
links fail `createFileAtomically` falls back to that same open, and `createWholeFileAtomically`, for the Baton, refuses.*

| Mode | How | Used for | Package call |
| --- | --- | --- | --- |
| Atomic | Temporary file beside the target, fsync, rename | The stores, [Baton pass](../glossary.md#baton-pass) files, Watcher records after their first write, instruction and installed files | `writeFileAtomically` |
| Exclusive create | Fails when the file exists, so one caller wins | First `progress.json`, [Baton](../glossary.md#baton) [generations](../glossary.md#generation), lock generations, the first write of `watcher-<n>.json`, gate slots, repair patches | `createFileAtomically`, `createWholeFileAtomically`, or `writeFileSync` with flag `wx` |
| Append in place | Opened with flag `a`, added to the end, never rewritten; only the event log is one descriptor writing whole lines | `events-<n>.ndjson`, `watcher-<n>.log`, `overseer.log` | `openSync` with flag `a`, `appendFileSync` |
| Plain write | `writeFileSync`; each reader catches a failed parse or only tests for existence | Markers, `start.json`, step verdicts, `gate.log`, sandbox profiles in a job folder | `writeFileSync` |

The package is `src/lib/atomic-file/AtomicFile.ts`. A crash between its temporary write and its rename can leave the
temporary file beside the target. Nothing removes it. A gate slot being taken over sits for a moment as
`slot-<k>.<pid>.stale`, and a crash there can leave that file behind.

Field formats live in [the reference](../cli.md#files-on-disk). Why a write is safe, and what a malformed store does,
lives in [How a write commits](storage.md). Who is stopped from writing what lives in
[Confinement and trust](../architecture/confinement.md). This document names the writer in normal running.

## `<data>/`: one board

The folder is the [tracker](../glossary.md#tracker), the on-disk form of a board. It appears at `init` and is
git-ignored. `findWorkspace` resolves it from any worktree, so every agent and command on a board reaches the same
files. A verb in the tables below is one `forge` command.

```text
<data>/
  progress.json              the rows, jobs, decisions, incidents and counters
  log.jsonl                  the log, one record per line
  pipeline.json              the gates, once a board has them
  hold-journal.json          the write a lock hold committed to, present only until its files are written
  version.json               the install version, written last by init and update
  progress.html              a stub naming the live Overseer's URL, or saying it is down
  overseer.log               the Overseer's own lines
  session-instructions.md    what the SessionStart hook prints
  reference.md               ticket format, moves and exit codes for agents
  .lock/generation-<n>       the lock's generation records
  tickets/<id>-<slug>.md     one file per ticket
  epics/<key>.md             one file per epic; the folder appears with the first epic
  filing-cabinet/D<n>.json   one file per open filing draft; the folder appears with the first
  pictures/<id>.<extension>  one owner-only file per picture User sent; the folder appears with the first upload
  briefs/defaults/           constitution.md and one <role>.md per pipeline role
  overseer/                  the Batons: see below
  jobs/<J>/                  one folder per job: see below
```

The tree's project words are in the glossary: [row](../glossary.md#row), [decision](../glossary.md#decision),
[incident](../glossary.md#incident), [log](../glossary.md#log), [gate](../glossary.md#gate),
[pipeline](../glossary.md#pipeline), [lock hold](../glossary.md#lock-hold), [hold journal](../glossary.md#hold-journal),
[install version](../glossary.md#install-version), [epic](../glossary.md#epic) and [filing
draft](../glossary.md#filing-draft).

`<J>` is a job id such as `J4`, `<id>` a ticket id, `<g>` a gate's position, and `<k>` a running count local to its file
family. In a job folder `<n>` is a [Watcher instance](../glossary.md#watcher-instance). In the Baton, Baton pass and
lock files it is a [generation](../glossary.md#generation), and in `D<n>` a filing draft's number.

### Stores and install

| Path | Writer | Readers | Mode, format version | Lifetime | Safe to delete |
| --- | --- | --- | --- | --- | --- |
| `progress.json` | Every mutating verb and the Overseer, in a lock hold | Everything; `status` reads it with no lock | Exclusive at `init`, then atomic; `CURRENT_PROGRESS_FILE_VERSION` | The board's life | No |
| `log.jsonl` | Every mutating verb and the Overseer, in a lock hold, after the other files | The `Board` class, as an input: [storage](storage.md) | Atomic whole file; no version, strict read | Restarted at `clear` with one `tracker-cleared` record | No: the `Board` reads it as input, so lifecycle facts vanish with it: [storage](storage.md) |
| `pipeline.json` | `gate` verbs; an accepted `pipeline-proposal`; User by hand (the only way to set a [review phase](../architecture/customs-and-gates.md)) | Overseer every [Pass](../glossary.md#pass), `gate list`, `TrackerReader` | Atomic; no version, strict read | The board's life | No |
| `hold-journal.json` | `src/adapters/hold-journal/HoldJournalWriter.ts`, in a lock hold | The next lock taker, which replays it; `status`, lock-free | Atomic; `HOLD_JOURNAL_FORMAT_VERSION` | One lock hold | Never: it is the only redo record |
| `.lock/generation-<n>` | `src/services/tracker/TrackerLock.ts` | Every lock taker | Exclusive; no version | The newest stays; older ones go at each take | No |
| `tickets/<id>-<slug>.md` | Verbs in a lock hold; User below the frontmatter | `Board`, [Bridge](../glossary.md#bridge), launch text | Atomic; no version, line parse | Until `clear --all` | No |
| `epics/<key>.md` | `epic` verbs | `Board`, Bridge | Atomic; no version | Until `epic` removal or `clear --all` | No |
| `filing-cabinet/D<n>.json` | `draft` verbs | `Board`, the filing skill, the Bridge | Atomic; `CURRENT_DRAFT_FILE_VERSION` | While the filing draft is open | No |
| `pictures/<id>.<extension>` | `POST /api/pictures`, through `src/services/tracker/PictureStore.ts`; `<id>` is the sha256 of the bytes | The Overseer when it writes a chat line, `GET /api/pictures/<id>` | Atomic, owner-only; no version, the type read from the first bytes | Until no log record or live job names it at an Overseer start, or `clear --all` | Yes: a message naming one is then refused `picture-unknown`, and a sent one is no longer served |
| `version.json` | `init` and `update`, last | Version check, Overseer every Pass | Atomic; holds `INSTALL_VERSION` | Rewritten each `update` | No: a missing `version.json` beside `session-instructions.md` reads as a mismatch |
| `session-instructions.md` | `init`, `update` | `hook session-start`; its presence marks the files installed | Atomic; no version | Rewritten each `update` | `update` restores it |
| `reference.md` | `init`, `update` | Agents | Atomic; no version | Rewritten each `update` | `update` restores it |
| `briefs/defaults/*.md` | `init`, `update` | `InstructionFiles.readingFor`, from disk at each launch | Atomic; no version | Rewritten each `update` | A missing file stops the launch with the notice `instructions-missing`; `update` restores it |
| `progress.html` | `init`, `update`, Overseer start and stop | A [monitor](#monitor-the-whole-machine), through `progressHtml` in `projects.json` | Atomic; no version | Rewritten at each of those | Yes |
| `overseer.log` | The Overseer; a successor's standard error | People; refusals name its path | Append; no version | Grows without end | Yes |

### `<data>/overseer/`

This folder holds no secret. The API token is in [`<monitor>/watchers/<trackerId>/`](#monitor-the-whole-machine).

| Path | Purpose | Writer | Readers | Mode, format version | Lifetime | Safe to delete |
| --- | --- | --- | --- | --- | --- | --- |
| `token` | The secret a CLI verb presents to the Overseer API | Overseer, at each start | `cli/overseer/OverseerRemote.ts`, through the Baton's `tokenFile` | Atomic; bare text | Replaced at each start | Not while an Overseer is live |
| `baton-<n>.json` | The record of which Overseer is in charge: its process, port and code version | Each starting Overseer | Every mutating verb (to nudge), `ticket deliver` (refuses while live), `oversee` verbs, `jobs`, `open`, `update`, the `progress.html` stub writer, the Overseer | Exclusive, never rewritten; `BatonRecord` | Holder removes lower generations and its own at stop | Never by hand: it is the only proof of which Overseer is in charge |
| `baton-pass-<n>.json` | The progress report of one Overseer hand-over | Old Overseer and successor, in turn | Old Overseer, successor, and `oversee restart` and `update` waiting for the outcome | Atomic; `BatonPassReport` | Stays | Yes, when no Baton pass runs |
| `watcher-<codeVersion>.js` | The bundled Watcher code pinned for one code version, so a change to the checkout never changes what a Watcher runs | `WatcherBundle.pinWatcherBundle` | The Bun runtime (`process.execPath`), at each Watcher spawn | Atomic; bundle | Stays | Yes for any [code version](../glossary.md#code-version) but the live Overseer's |
| `merge-gate-profiles/<worktree>.sb` | The sandbox profile that confines a merge gate step | The Pass, before a merge gate step | `sandbox-exec` | Atomic; sandbox profile | Rewritten before each use | Yes, when no merge gate runs |

> **As built.** Old bundles, profiles and Baton pass files stay on disk:
> [gap-nothing-is-ever-removed](../reference/known-gaps.md#gap-nothing-is-ever-removed).

## `<data>/jobs/<J>/`: one job

A job folder is the record of one job, and most of a build can be reconstructed from it. The Overseer learns what a
[session](../glossary.md#session) did by reading these files, not from a socket.

![Job J leaves traces in five places, found by job id, ticket id, a hash, or a path slug. Its record is in the data folder under the job id, its code in the ticket worktree under the ticket id, its working folder and Hatch files in the worktrees folder under the job id, its socket in the monitor folder under a hash of tracker, job and instance, and its transcripts in the vendor folder under a slug of the working directory, read only.](../figures/on-disk-atlas/one-job-across-zones.png)

*Notice that the key changes by zone: a question about one job starts from its id, its ticket, or its working
directory.*

Inside the job folder, files appear in a fixed order.

![One job folder in the order files appear: the install step, launch inputs by the Overseer, Watcher records and the event log, delivery markers, gate folders and verdicts, and red-handoff files after a red gate or a Customs refusal. Two dashed paths return to launch as instance n+1 with its own numbered set: a session interrupted while it runs, and a red handoff, which resumes the same session. A passed gate never returns. Every n is a Watcher instance, and g is a gate's position.](../figures/on-disk-atlas/job-folder.png)

*Notice that only the two dashed paths return to launch: read one `<n>` across the folder to read one run of the
session.*

Any resume adds a numbered set, whatever interrupted the job, so a folder can hold `launch-2.json` and no
`gate-failure.md`. Whether a file carries `<n>` depends on its family (`watcherFilesOf`, `instanceMarkerOf`,
`gateStepsOf`).

![Five families, with instance 1 and instance 2 side by side. launch-1.json and launch-2.json are always numbered. These three markers read stop-sent and then stop-sent-2. A gate folder reads gate-1/ and then gate-1-2/. start.json has no suffix and both instances share it. settings.json and role.md also have no suffix, but instance 2 replaces them, so no suffix does not mean shared.](../figures/on-disk-atlas/instance-suffixes.png)

*Notice that the three build-job markers (`wind-down-sent`, `input-closed`, `stop-sent`) and a gate folder carry no
suffix at instance 1, so `gate-1-2/` is gate 1 of instance 2. Other numbered markers always carry `<n>`.*

Code treats a missing job file as absent, with the [five exceptions](#job-files-that-must-be-readable) listed below.

### Launch inputs

| File | Writer | Reader | Mode | Purpose | Owning type or call |
| --- | --- | --- | --- | --- | --- |
| `launch-<n>.json` | Overseer | Its Watcher; the Overseer for the secret and socket path | Atomic | What to spawn, where, and the path of this instance's Watcher secret | `WatcherLaunch` |
| `settings.json`, `agents.json`, `mcp.json`, `role.md` | Overseer, rewritten for each instance | The vendor's CLI, named on its command line | Atomic | The session's permissions, subagents, servers and role brief | `CLAUDE_JOB_FILE_NAMES` |
| `report.schema.json` | Overseer, for kinds with a [report](../glossary.md#report) | Nothing | Atomic | The schema reaches the session inline through `--json-schema` | `REPORT_SCHEMA_OF_JOB_KIND` |
| `first-message-<n>.txt` | Overseer, for a fresh instance, so `<n>` is always 1 | Overseer, until delivered | Atomic | Holds the task text across an Overseer restart | `JobResumption.storeFirstMessage` |
| `start.json` | Overseer, once, for build and review jobs | [Customs](../glossary.md#customs), a retry's Customs, and the gate step | Plain, skipped when present | Start commit, body hash and the ref snapshot Customs compares | `JobStart` |
| `pipeline-agent-start.json` | Overseer, once, for a [pipeline agent](../glossary.md#pipeline-agent) | Overseer | Plain | The same start facts for the snapshot worktree | `SnapshotStart` |
| `instructions-<n>.json` | Overseer | Nothing in code; kept for people | Atomic | Path and content hash of every instruction file the session got | `InstructionFileRead` |
| `launch-settings.json` | Overseer, once, at the job's first launch | Overseer, at each later launch of the session | Atomic, skipped when present | The model and effort the session runs on | `JobLaunch.recordLaunchSettings` |
| `worktree-failure.txt` | Overseer | Overseer, for its presence | Plain | Git's error; stops a retry and raises `setup-failed` | `createWorktree` |
| `worktree-unnormalised.txt` | Overseer | Overseer, for its presence | Plain | The paths a fresh checkout already changed, as line-ending normalisation leaves them; stops the install and raises `setup-failed` with cause `line-ending-normalisation` | `createWorktree` |

> **As built.** The `report.schema.json` file has no reader:
> [gap-dead-code-and-unused-states](../reference/known-gaps.md#gap-dead-code-and-unused-states).

### Watcher records and event logs

A frame is one instruction the Overseer gives a Watcher over its socket. The first write of `watcher-<n>.json` is
exclusive, so only one Watcher can take an instance. The [event log](../glossary.md#event-log) is what the Overseer
reads to learn what a session did.

| File | Writer | Reader | Mode | Purpose | Owning type |
| --- | --- | --- | --- | --- | --- |
| `watcher-<n>.json` | The Watcher | Overseer, [Regrouping](../glossary.md#regrouping) | Exclusive first write, then atomic | Identity, child process, socket path, and `end` once over; its presence means a Watcher took this instance | `WatcherRecord` |
| `events-<n>.ndjson` | The Watcher | Overseer, `job` verbs, Bridge transcript | Append, fsynced before `end` | Every line of the session and every frame that changes it; the record names its `EVENT_LOG_FORMAT_VERSION` | `EventLogEntry` |
| `watcher-<n>.log` | The Watcher's output and the child's standard error | People; nothing in code | Append | Diagnosis only | `WatcherFiles` |
| `watcher-<n>.lost-cause` | Overseer, once | Overseer | Atomic | Settles why a Watcher was lost, so a restart reads the same cause after the kill | `Regrouping.settleLostWatcher` |

There is no report file. A report is the `structured_output` of the session's `result` line
in the event log, read by `sessionReadingOf`.

> **As built.** `SERVED_JOB_FILE_NAMES` lists `report.json`, which nothing writes, so that file route finds nothing:
> [gap-dead-code-and-unused-states](../reference/known-gaps.md#gap-dead-code-and-unused-states).

### Delivery markers

A [marker](../glossary.md#marker) here is an empty file. It stops a later Pass repeating a send. It is written after the
send, so a crash in between repeats the frame: delivery is at least once, see [at most
once](../architecture/failure-and-recovery.md#at-most-once). Every marker is a plain write, made after the send reached
the Watcher's socket, with the one exception marked. `[-<n>]` means the suffix appears from instance 2.

| Marker | Prevents | Written by |
| --- | --- | --- |
| `first-message-<n>.sent` | A second copy of the task text | `JobResumption.deliverFirstMessages` |
| `resume-message-<n>.sent` | A second resume line | `JobResumption.deliverResumeMessages` |
| `answer-<digest>.delivered` | Answering one question twice; the digest hashes the request id | `AnswerDelivery` |
| `answer-delivery-stop-<n>` | A second stop; written before the stop frame, so the ended Watcher reads as `answer-delivery`, not a crash | `AnswerDelivery` |
| `wind-down-sent[-<n>]` | A second wind-down turn over the [call budget](../glossary.md#call-budget) | `JobLaunch.deliverBuildJobFrames` |
| `input-closed[-<n>]` | A second close of the session's input | `JobLaunch.deliverBuildJobFrames` |
| `stop-sent[-<n>]` | A second stop | `JobLaunch.deliverBuildJobFrames` |
| `control-frames/message-<k>`, `wind-down`, `input-closed-<n>`, `stop-<n>` | A repeated User message or control on a job | `JobControlDelivery` |
| `assistant-frames/chat-<k>`, `interrupt-<k>` | A repeated [Assistant](../glossary.md#assistant) chat or interrupt | `AssistantSession` |

### Gate folders, verdicts and red-handoff files

A step is the joined [prepare step](../glossary.md#prepare-step) line, or one gate, of `pipeline.json`. Each runs under
a process Watcher, a Watcher that holds a shell line instead of a session, in a subfolder of the job.

![The folder install/ holds a step run and has no verdict file. The folders gate-prepare/ and gate-1/ each hold a step run, with their verdict as a file beside the folder, not inside it. Expanded, gate-1/ holds launch-1.json, watcher-1.json, events-1.ndjson, watcher-1.log and process-sandbox.sb. gate.log exists once per job and holds the newest failed gate-prepare or gate; a failed install writes none. gate-failure.md exists once per job and holds the newest red gate or Customs refusal.](../figures/on-disk-atlas/step-folders.png)

*Notice that a verdict sits beside its folder, and that `install/` has none.*

`install/` sets the worktree up before the session launches. `gate-prepare/` runs the same line again before the gates,
over the tree the session left.

The folder name carries the session's instance: `gate-<g>/` at instance 1, `gate-<g>-<n>/` from instance 2, and the same
for `gate-prepare`. A resumed job gets a fresh folder rather than rerunning one; `install/` takes no suffix. Inside any
step folder the process Watcher's own files always carry 1 (`PROCESS_WATCHER_INSTANCE`), because that Watcher runs once.
Below, `<step>` is any of these folder names.

| File | Writer | Reader | Mode | Purpose | Owning type |
| --- | --- | --- | --- | --- | --- |
| `<step>/process-sandbox.sb` | Overseer | `sandbox-exec` | Plain | The step's confinement | `ProcessWatcherSandbox` |
| `gate-run.json`, `gate-run-<n>.json`, `target-gate-run.json` | Overseer, once, at the gate run's start | Overseer, at each read of the run | Atomic, never rewritten | The run's manifest: its phase, phase hash, prepare steps and gates in order. The run's steps and folders come from it, and the settlement records its phase and hash | `GateRunManifest` |
| `<step>-verdict.json` | Overseer, the first time it reads the step's result | Overseer | Plain | For `gate-prepare` and each gate; `install` has none. Keeps a result by tree id and the manifest's phase and hash, so a later gate that changes the tree never turns an earlier one red, and a verdict under another manifest is never reused | `StepVerdict` |
| `gate.log` | Overseer, when `gate-prepare` or a gate does not pass; a failed `install` leaves its output in `install/events-1.ndjson` | Agents through the red-handoff note; the Bridge through `SERVED_JOB_FILE_NAMES` | Plain | The failing step's whole output, newest failure only | `stepVerdictOf` |
| `gate-failure.md` | Overseer | The resumed session | Atomic | The [red-handoff](../glossary.md#red-handoff) note | `RedHandoff.batonPassTextOf` |
| `red-handoff.json` | Overseer; copied into the job folder of a fresh session taking over (`adoptRedHandoff`) | Overseer, for the resume wording and budget | Atomic | What went red and which resume this is | `RedHandoffFacts` |

The Overseer writes both red-handoff files on a red gate, on a refused Customs check, and in a
[merge agent](../glossary.md#merge-agent)'s folder when the merged tree is red. Only the red gate's note names
a `gate.log` path.

> **As built.** The launch-file read denial covers `jobs/*/launch-*.json` only, one level deep, so a step subfolder's
> launch file is outside it:
> [gap-launch-file-deny-one-level](../reference/known-gaps.md#gap-launch-file-deny-one-level).

### Files of other job kinds

Each of these files belongs to one [job kind](../glossary.md#job-kind), or to any job with a ticket.

| File | Job kind | Writer | Reader | Mode | Purpose | Owning type |
| --- | --- | --- | --- | --- | --- | --- |
| `assistant-chats.json` | `assistant` | Overseer | Overseer | Atomic | The chats sent, with their incident ids, across a Baton pass | `AssistantChat` |
| `airlock-facts.json` | `merge` | Overseer | Overseer, launching a merge agent | Atomic | Merge commit and gate tail, kept because the incident that held them is closed by launch time | `keepAirlockFacts` |
| `pipeline-agent-outcome.json` | `pipeline-agent` | Overseer | Overseer, once settled; the answer to a `pipeline-proposal` decision (`answerPipelineProposal`) | Atomic | The verified outcome; the job ends from it | `PipelineAgentOutcome` |
| `waiver-proposals.json` | `review` | Overseer | The decision answer (`ReviewOutcome.answerWaiver`), in the process applying it, such as the `decide` verb | Plain | The items a reviewer proposes to waive | `WaiverProposal` |
| `recreate-<k>.patch` | any with a ticket | `worktree repair --step recreate` | People | Exclusive | Uncommitted work saved before a worktree is removed; `<k>` is a running count, not an instance | `WorktreeRepair` |

### Job files that must be readable

Five job files stop something when they cannot be read. Every other reader treats the file as absent.

| File | Cannot be read means | Effect |
| --- | --- | --- |
| `watcher-<n>.json` | Unreadable | Reads as a lost Watcher (`WatcherFleet.livenessOf`) |
| `launch-<n>.json` | Missing or unreadable | Its Watcher ends with `launch-unreadable` |
| `start.json` | Missing or unreadable | The job fails at Customs with cause `git-failed` |
| `pipeline-agent-start.json` | Missing or unreadable | The pipeline agent is refused at check V16, and its job ends `failed` with cause `git-failed` |
| `events-<n>.ndjson` | Malformed | `WatcherFleet.eventsAfter` answers `malformed`, and its callers refuse to read in part: [storage](storage.md#what-breaks-and-what-still-works) |

### Deleting a job folder

Delete a job folder only after its ticket is [delivered](../glossary.md#delivered); a job with no ticket, only after it
ended. Even then the delete costs its transcript, its `gate.log` and any token credit not yet logged as `agent-stopped`.
Before delivery, a later job of the ticket may read the folder's `red-handoff.json` and `start.json`. `clear` leaves
`jobs/` alone.

## `<worktrees>/`

This folder sits beside `<data>` at the repository root and is git-ignored. Who creates, reuses and removes each entry
is in [Every worktree kind](../architecture/build-and-review.md#every-worktree-kind).

| Path | Holds | Written by |
| --- | --- | --- |
| `ticket-<id>/` | A ticket's branch checked out | Git and the session |
| `group-<name>/` | A [group](../glossary.md#group) branch checked out | Git |
| `refresh-group-<name>/` | A temporary checkout for a group [refresh](../glossary.md#refresh) | Git |
| `sessions/<J>/` | The working folder of a session with no ticket worktree; empty at start | The session |
| `pipeline-agent/<J>/` | A detached snapshot of the [main line](../glossary.md#main-line) for a pipeline agent | Git |
| `hatch/<J>/requests/<request>.json` | What a session asks of the Overseer | Hatch verb under the job, atomic, `hatchFormatVersion` |
| `hatch/<J>/replies/<request>.json` | The Overseer's answer | Overseer, atomic, `hatchFormatVersion` |

The `sessions`, `hatch` and `pipeline-agent` folders belong to the Overseer, so Regrouping never counts them as leftover
worktrees (`OVERSEER_OWNED_FOLDERS`). The contract behind the Hatch files is in
[Control: one contract, three doors](../architecture/control-and-hatch.md). A ticket worktree is repaired with
`worktree repair`, never removed by hand.

> **As built.** A [landed](../glossary.md#landing) ticket's worktree stays:
> [gap-landed-worktrees-stay](../reference/known-gaps.md#gap-landed-worktrees-stay).

## `<monitor>/`: the whole machine

This folder holds what no single board owns. An Overseer reads it on every Pass. A monitor is a separate program that
lists a machine's boards from `projects.json`, and the folder is named for it; agent-dashboard is the monitor the
[Overseer API](../reference/overseer-api.md) serves. The `watchers/` folder is owner-only.

| Path | Purpose | Writer | Readers | Mode, format version | Lifetime | Safe to delete |
| --- | --- | --- | --- | --- | --- | --- |
| `projects.json` | The list of boards on this machine | `registerWithTheMonitor`, after a CLI verb's tracker write and `init`, and at Overseer start and stop, under its own lock | A monitor; `registerWithTheMonitor`, merging | Atomic; `MONITOR_REGISTRY_FILES.SUPPORTED_VERSION` | Grows with boards; a tracker under a temp folder never enters | Yes: the next CLI write or Overseer start adds the board back; until the Overseer next starts, its entry has no `overseer` pointer |
| `.lock/generation-<n>` | The lock over `projects.json` | `registerWithTheMonitor` | Every writer of `projects.json` | Exclusive | The newest stays | Not during a write |
| `usage-limit.json` | The usage marker: when launches on this machine may go on | Any Overseer that meets a usage limit, only moving the reset later | Every Overseer's Pass, `BoardStateReader` | Atomic; `UsageMarker` | Stays until overwritten | After `resetsAt`, yes. Before it, no: every board on the machine launches again and meets the limit |
| `gate-slots/slot-<k>` | One gate slot; `<k>` runs to `GATE_RUNS_AT_ONCE` | The Overseer taking a gate slot | Every Overseer | Exclusive, then atomic for the holder's process | A merge gate's goes when that gate ends; a gate Watcher's stays until a later gate takes it over | Not while its holder runs: that lets one more gate run. A stale one is taken over without help |
| `watchers/<hash>.sock` | How the Overseer reaches one Watcher | Each Watcher | The Overseer, with the secret | Unix socket; `WATCHER_PROTOCOL_VERSION` | Until the Watcher closes; a killed Watcher's socket stays, and nothing removes it | Not while its Watcher lives: the Overseer loses its connection to that Watcher. A dead Watcher's socket does nothing |

`watchers/<trackerId>/` is the board's owner-only folder: it holds `token`, the API token, and
`<J>-<n>.secret`, one Watcher secret per instance. [`docs/cli.md`](../cli.md#where-the-secrets-live) states the
guarantee per OS.

The socket name is the first `WATCHER_SOCKET_NAME_HEX_DIGITS` hex digits of a hash over tracker id, job id and instance
(`endpointOf`), short enough for `MACOS_SOCKET_PATH_LIMIT_BYTES`. A process Watcher hashes `<J>/<folder>` in
place of the job id.

A monitor registry problem never fails a command: [CLAUDE.md](../../CLAUDE.md) lists that as a deliberate exit-0 case.

> **As built.** A usage marker past its reset still affects delivery:
> [gap-stale-usage-marker-stops-delivery](../reference/known-gaps.md#gap-stale-usage-marker-stops-delivery).

One path sits outside the product's own naming. `~/.agent-progress-monitor/agent-dashboard/server.json` is
agent-dashboard's own record. `dashboardFrameOriginsOf` reads it for the origins that may embed the Bridge in an iframe.
Its spelling is the dashboard's, and with no readable record no origin may embed the Bridge. This system never writes
it.

## Installed items outside `<data>`

| Path | Written by | Read by | Safe to delete |
| --- | --- | --- | --- |
| `.claude/skills/forge-po/`, `.claude/skills/forge-orchestrate/` | `init`, `update`; each git-ignored | The vendor's CLI, in sessions User opens | `update` restores them; a file User added stays |
| `.claude/settings.local.json`, or `.claude/settings.json` when it already holds the entry | `init`, `update`, unless `--no-hooks` | The vendor's CLI, for the `SessionStart` hook | The hook only: `update` restores it |
| `.gitignore` entries for `<data>/`, `<worktrees>/` and both skills | `init` for `<data>/`; `init` and `update` for `<worktrees>/` and both skills | Git | No |
| `~/Library/LaunchAgents/<label>.plist` | `setup.sh --login-overseer`, label default `LOGIN_ITEM_LABEL` | launchd, at login | Yes: it only runs `oversee --detach` |

`init` and `update` also remove what an older install version left: retired files (`retiredInstalledFilePathsIn`), hooks
(`RETIRED_HOOKS`, unless `--no-hooks`), a retired skill folder, and the [managed block](../glossary.md#managed-block) in
`CLAUDE.md`. What each install step does is in [The CLI and install](../architecture/cli-and-install.md).

> **As built.** The login item runs once and has no keep-alive:
> [gap-login-item-no-keepalive](../reference/known-gaps.md#gap-login-item-no-keepalive).

## `<config folder>/projects/<slug>/`: read, never written

The vendor's CLI owns this zone. The config folder is `$CLAUDE_CONFIG_DIR`, else `~/.claude` (`claudeConfigFolderOf`
in `src/lib/claude-code/ClaudeConfigFolder.ts`). The slug is a path with every character outside `[a-zA-Z0-9]`
replaced by `-` (`transcriptFolderFor`). Two readers use it, and they find a folder differently.

| Reader | Folder | Reads | For |
| --- | --- | --- | --- |
| `src/lib/claude-code/ClaudeTranscripts.ts`, `listSubagentTranscripts` | The slug of the repository root | Every session's subagent transcripts | The `usage` command |
| `src/services/overseer/ClaudeTranscripts.ts`, `subagentFactsOf` | Every folder under `<config folder>/projects/`, searched for the session id by `findSessionSubagentTranscripts` | One session's subagent transcripts and `.meta.json` | Subagents an event log lost |

The layout and its evidence are in [The Claude Code contract](../development/overseer-claude-probe.md). What the numbers
mean is in [Measurement](../architecture/measurement.md).

> **As built.** `usage` reads only the repository root's slug:
> [gap-usage-misses-job-sessions](../reference/known-gaps.md#gap-usage-misses-job-sessions).

## Housekeeping: what goes away

Most coordination files end with the span that needs them; job records have no end.

![A ladder of spans, shortest at the top. One lock hold: hold-journal.json. One Watcher: its socket, unless the Watcher is killed. Until a later gate takes it over: a gate slot. One filing draft: its file. One Airlock: a refresh-group checkout. Until clear: the rows and the contents of log.jsonl. Until clear --all: tickets and epics. No end: job folders, ticket worktrees, Hatch folders and overseer.log.](../figures/on-disk-atlas/lifetimes-ladder.png)

*Notice that the last row is the one with real size.*

### What a person may delete

Most files may not be deleted by hand, and the rest depend on a condition or on `update`.

![Four classes of file, by whether a person may delete it. Yes: progress.html, overseer.log and projects.json. update restores: session-instructions.md, reference.md, briefs/defaults/ and the skills. With a condition: Baton pass files, merge gate profiles, old Watcher bundles, the usage marker and the job folders of delivered tickets. Never: progress.json, log.jsonl, pipeline.json, tickets, epics, hold-journal.json and baton files.](../figures/on-disk-atlas/safe-to-delete.png)

*Notice that the amber column names the condition under each file; the path tables above say what breaks.*

### What code removes

While the board runs, code removes coordination files and temporary checkouts; anything else goes only at `clear`, an
`epic` removal, a released group or a repair.

`clear` restarts the log with one `tracker-cleared` record and rebuilds the rows from the surviving tickets; `clear
--all` also deletes tickets and epics, and leaves no rows. [How a write commits](storage.md) shows what that cuts.

| Removed by code | When |
| --- | --- |
| `hold-journal.json` | After the lock hold's last file |
| Lower `.lock` generations | At each lock take |
| Lower `baton-<n>.json` generations; the holder's own | At each start; at stop |
| `gate-slots/slot-<k>` | When a merge gate ends, or when a later gate takes it over |
| `watchers/<hash>.sock` | See [`<monitor>/`](#monitor-the-whole-machine) |
| `filing-cabinet/D<n>.json` | When the filing draft closes |
| The old contents of `log.jsonl`, and the rows in `progress.json` | At `clear`, which restarts the log and rebuilds the rows |
| `epics/<key>.md`, `tickets/*.md` | At `clear --all`; an epic also at its own removal |
| `pipeline-agent/<J>/` | When the pipeline agent settles |
| `refresh-group-<name>/`, `group-<name>/` | When the [Airlock](../glossary.md#airlock) frees, and after a release, when git allows it |
| A ticket worktree | By `worktree repair --step recreate`; the next launch creates it again |

### What nothing removes

Everything here stays for the board's life and grows as listed: see
[gap-nothing-is-ever-removed](../reference/known-gaps.md#gap-nothing-is-ever-removed) and
[gap-landed-worktrees-stay](../reference/known-gaps.md#gap-landed-worktrees-stay).

| Never removed by code | Grows with |
| --- | --- |
| `jobs/<J>/`, whole, with every event log | Every job |
| After landing, `<worktrees>/ticket-<id>/` | Every landed ticket |
| `<worktrees>/hatch/<J>/` | Every job that launches an agent |
| `<worktrees>/sessions/<J>/` | Every job launched with no worktree to work in |
| `overseer/baton-pass-<n>.json` | Each Baton pass |
| `overseer/watcher-<codeVersion>.js` | Each code version |
| `overseer/merge-gate-profiles/` | Each worktree a merge gate ran for |
| `overseer.log` | Every line |
| Entries in `projects.json` | Each board |

`usage-limit.json` never grows, and it stays once written.

> **As built.** The whole log is read on each change:
> [gap-scaling-whole-log-and-bodies](../reference/known-gaps.md#gap-scaling-whole-log-and-bodies).

## Invariants

1. Every file under `<data>/jobs/<J>/` is written by the Overseer, a Watcher or `worktree repair`, never by a session.
2. One Watcher instance creates its `watcher-<n>.json` exclusively, so a second spawn of that instance exits at once.
3. The `<n>` in an instance-numbered file names one Watcher instance, and that instance's files are never rewritten by
   another.
4. A delivery marker exists only after the send reached the Watcher's socket, `answer-delivery-stop-<n>` excepted.
5. No file under `<data>` holds a secret: `launch-<n>.json` names the owner-only file of that instance's Watcher secret.
6. No code path writes under `<config folder>/projects/`.
7. `clear` touches neither `jobs/` nor `<worktrees>/`.

## In the code

| Concept | Path | Symbol | Spec |
| --- | --- | --- | --- |
| Tracker paths | `src/services/tracker/Workspace.ts` | `workspacePathsFor`, `TRACKER_FILES` | `src/services/tracker/Workspace.integration.spec.ts` |
| Installed paths | `cli/InstalledFiles.ts` | `installedFilePathsIn` | `cli/InstalledFiles.spec.ts` |
| Install parts | `cli/adoption/constants/ClaudeCodeInstall.ts` | `CLAUDE_CODE_INSTALL` | `cli/adoption/TrackerRefresh.claudeInstall.spec.ts` |
| Overseer files | `src/services/overseer/OverseerFiles.ts` | `overseerFilesIn` | `cli/overseer/OverseerCommand.spec.ts` |
| Baton and Baton pass files | `src/services/overseer/Baton.ts`, `src/services/overseer/BatonPass.ts` | `Baton`, `BatonPass` | `src/services/overseer/Baton.spec.ts`, `src/services/overseer/BatonPass.spec.ts` |
| Job and Watcher files | `src/lib/watcher/WatcherFiles.ts`, `src/services/overseer/WatcherFleet.ts` | `watcherFilesOf`, `WatcherFleet` | `src/services/overseer/WatcherFleet.spec.ts` |
| Job files beside Watchers | `src/services/overseer/JobLaunch.ts` | `JOB_FILES`, `gateStepsOf` | `src/services/overseer/JobLaunch.integration.spec.ts` |
| Markers | `src/services/overseer/WatcherFleet.ts`, `src/services/overseer/JobResumption.ts`, `src/services/overseer/AnswerDelivery.ts` | `sendFramesOnce`, `deliverFirstMessages` | `src/services/overseer/JobResumption.integration.spec.ts` |
| Lost cause | `src/services/overseer/Regrouping.ts` | `settleLostWatcher` | `src/services/overseer/Regrouping.integration.spec.ts` |
| Red-handoff files | `src/services/overseer/RedHandoff.ts` | `RED_HANDOFF_FILES` | `src/services/overseer/RedHandoff.spec.ts` |
| Hatch folders | `src/adapters/hatch/HatchFolder.ts`, `src/services/overseer/HatchInbox.ts` | `hatchRequestFilePathOf`, `hatchDirectoryOf` | `cli/HatchUnderJob.spec.ts` |
| Gate slots | `src/services/overseer/GateRunSlots.ts` | `createGateRunSlots` | `src/services/overseer/GateRunSlots.spec.ts` |
| Sockets | `src/lib/watcher/LocalEndpoint.ts`, `src/lib/watcher/PosixSocketEndpoint.ts` | `endpointOf` | `src/lib/watcher/PosixSocketEndpoint.spec.ts` |
| Monitor registry | `src/services/tracker/MonitorRegistration.ts` | `registerWithTheMonitor`, `MONITOR_REGISTRY_FILES` | `cli/MonitorRegistryIsolation.integration.spec.ts` |
| Vendor transcripts | `src/lib/claude-code/ClaudeTranscripts.ts`, `src/services/overseer/ClaudeTranscripts.ts` | `transcriptFolderFor`, `ClaudeTranscripts` | `src/services/overseer/ClaudeTranscripts.spec.ts` |
| Write modes | `src/lib/atomic-file/AtomicFile.ts` | `writeFileAtomically`, `createFileAtomically` | `src/lib/atomic-file/AtomicFile.spec.ts` |
