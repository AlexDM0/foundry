# Command and file-format reference

> **Question:** What exactly does this command accept, and what exactly is in this file?
> **Time:** A minute per lookup; search it rather than read it through.
> **Read first:** [Overview](concepts/overview.md), [Reading names](glossary.md#reading-names).
> **Next:** [Running a board](operations/running-a-board.md), [Refusals](reference/refusals.md).

This page is the one reference for commands, flags, exit codes, environment variables, the ticket format, log kinds and
stored formats, for the `forge` build. Every section gives the contract and links the page that explains it.

## Find it

Look a command up by its first word, or a stored file by its name.

| command | section |
|---|---|
| `init`, `update`, `help` | [Setup](#setup) |
| `status`, `ticket list`, `ticket show` | [Reading the board](#reading-the-board) |
| `task`, `log` | [Tasks](#tasks) |
| `ticket` | [Tickets](#tickets) |
| `epic` | [Epics](#epics) |
| `draft` | [Drafts](#drafts) |
| `concurrency`, `machine`, `gate` | [Concurrency and gates](#concurrency-and-gates) |
| `pipeline` | [Pipeline setup](#pipeline-setup) |
| `review-stats` | [Review statistics](#review-statistics) |
| `hook`, `usage` | [Hooks and usage](#hooks-and-usage) |
| `start`, `stop`, `restart`, `talos-restart`, `pause`, `unpause`, `version`, `crash-log` | [Hephaestus](#hephaestus) |
| `merges`, `merge`, `worktree repair` | [Merges and worktrees](#merges-and-worktrees) |
| `decisions`, `decide`, `question`, `incidents`, `incident`, `await` | [Decisions and incidents](#decisions-and-incidents) |
| `jobs`, `job`, `intake`, `advise` | [Jobs and sessions](#jobs-and-sessions) |
| `range`, `namespace`, `clear` | [The board's lifetime](#the-boards-lifetime) |

| stored file | section |
|---|---|
| `<data>/progress.json` | [The board's state](#dataprogressjson) |
| `<data>/pipeline.json` | [The gate pipeline](#datapipelinejson) |
| `<data>/pipeline-setup.json` | [The pipeline setup record](#datapipeline-setupjson) |
| `<data>/gate-profiles.json`, `<data>/gate-profile-runs/` | [The gate profile runs](#datagate-profilesjson) |
| `<data>/constitution-sources.json` | [The constitution's sources](#dataconstitution-sourcesjson) |
| `<data>/log.jsonl` | [The log and its kinds](#datalogjsonl) |
| `<data>/pictures/` | [The pictures](#datapictures) |
| `<data>/committed-content/<hash>.json` | [The kept content](#datacommitted-contenthashjson) |
| `<data>/hold-journal.json` | [The hold journal](#datahold-journaljson) |
| `<data>/version.json` | [The install version file](#dataversionjson) |
| `<monitor>/projects.json` | [The machine's registry](#monitorprojectsjson) |
| `<monitor>/config.json` | [The machine's agent programs](#concurrency-and-gates), under `machine agent` |
| `<monitor>/usage-windows.json` | [The machine's usage windows](#monitorusage-windowsjson) |
| `<data>/tickets/<id>-<slug>.md` | [The ticket file](#datafoldertickets003-double-click-a-role-to-edit-itmd) |
| `<data>/epics/<key>.md` | [The epic file](#dataepicscheckout-redesignmd) |
| `<data>/filing-cabinet/D<n>.json` | [The filing draft](#datafiling-cabinetd1json) |

- [About this page](#about-this-page)
- [Conventions](#conventions): [locking](#locking), [help and options](#help-and-options), [the Next
  line](#the-next-line)
- [Environment variables](#environment-variables)
- [Adopting a repository](#adopting-a-repository): [Re-running](#re-running), [Install version](#install-version)
- [The two skills](#the-two-skills)
- [Commands](#commands), by the table above
- [Job contracts](#job-contracts): [A build job](#a-build-job), [The Airlocks](#the-airlocks), [A review
  job](#a-review-job), [The Assistant](#the-assistant), [Under a job: the Hatch](#under-a-job-the-hatch)
- [Platforms](#platforms)
- [Exit codes](#exit-codes)
- [The Handoff and the token column](#the-handoff-and-the-token-column)
- [The dashboard](#the-dashboard)
- [Files on disk](#files-on-disk), by the table above
- [Ticket moves and their rows](#ticket-moves-and-their-rows)

## About this page

`forge help` prints a shorter command reference from `cli/HelpText.ts`. `cli/HelpText.flags.spec.ts` holds both texts
against the parsers, and where their prose differs this page is right.

> **As built.** The help prose lags this page in places.

`resources/templates/Reference.md`, installed as `<data>/reference.md`, copies three sections of this page word for
word: a ticket, the ticket moves and the exit codes. `cli/ReferenceCopies.spec.ts` holds the copies, so a change
to either side changes both. Inside those sections `{{program}}` stands for `forge` and `{{dataFolder}}` for
`<data>`, which the install fills in.

The project overview is in the [README](../README.md) and the documentation map in [docs/README.md](README.md). Working
on this repository is in [Contributing](development/contributing.md).

## Conventions

| term | meaning |
|---|---|
| `<when>` | An ISO 8601 timestamp, `now`, or an offset from now: `-5m`, `-2h`, `-1d`, `+30m`. `--at <when>` backfills: a stamp already recorded is kept, so a row nobody registered at the time can be dated afterwards. |
| `<n>` | The figure on `--tokens`: a whole number or a decimal with a `k`/`m`/`b` suffix: `12000`, `12k`, `12.3k`, `1.2m`, `1.20b`, so a figure `status` prints reads back. A bare decimal and a negative are refused. It is a figure the caller reports, never one this tool measures, and it replaces the row's figure rather than adding to it. |
| `<id>` | A task id is a number (`17`); a ticket id is its padded number (`003`), and `3` or `#3` name the same ticket. |
| `<J>` | A [job](glossary.md#job) id, such as `J4`. |
| `<I>` | An [incident](glossary.md#incident) id, such as `I1`. |
| `<decision>` | A [decision](glossary.md#decision) id, such as `E7`. |
| `<hatch>` | The job's [Hatch](glossary.md#hatch) folder. |
| `-` | As the path of `--body-file`, `--request-file` or `--file`, reads standard input to its end. In a terminal, with nothing piped in, it is refused at exit 1 with nothing written, since it would read as empty text; an empty file or an empty pipe supplies empty text. |
| `--json` | Accepted by every command but `hook` and `help`, and prints one JSON document on standard output in place of the human output. The answers of `start`, `stop`, `init`, `update`, `version` and `machine` carry `answerVersion` `3`, and under `--json` their refusal is the document `{ answerVersion, refusal, text }` at exit 1: the refusal's code and the sentence printed on standard error. A reading command prints the document its row describes. A command that writes prints what it wrote: the row for a `task` verb, the ticket for a `ticket` verb or setting (a list for several ids), the epic for `epic add` and `epic edit` (`{ key, removed: true, filePath }` for `epic remove`), the log entry for `log`, the stored axis for `range`, the new state for `concurrency <n>` and `pause\|resume`, and the counts for `clear`. Nothing follows the document on standard output, no Next line or resume line, while a warning still goes to standard error. |
| `<data>`, `<worktrees>`, `<monitor>` | The board's data folder, its worktrees folder and the machine's monitor folder: `.forge/` and `.forge-worktrees/` in the repository root, and `~/.forge-monitor/`. [Reading names](glossary.md#reading-names) defines them. |
| product names | Every name the build goes by is `PRODUCT_NAMES` in `src/shared/constants/ProductNames.ts`. |

### Trackers in a repository

A [tracker](glossary.md#tracker) lives in `<data>/` of the folder it tracks: the repository root, or a project folder
of the repository that `init --root` names. A command finds it by walking up to the nearest `<data>/`. In a checkout
that has none, such as a [worktree](glossary.md#worktree), it takes the folder's path below that checkout's toplevel,
applies it to the main checkout found with `git rev-parse --git-common-dir`, and walks up from there. So every worktree
of a repository shares its trackers and their [boards](glossary.md#board).

A repository holds one tracker at its root, or several in folders beside each other, never one inside another. A
tracker at the root with no namespace asks git exactly what it asked before a tracker could sit in a folder. A tracker
in a folder:

- needs a branch namespace (`init --namespace`, `namespace`), so two trackers' branches never share a name;
- runs git only at a toplevel: the main checkout for its main line, a job's worktree for the job. A session in a job's
  worktree starts at the worktree's root, where it can commit, and is told the project's folder; its other sessions,
  its gates and prepare steps start in the project's folder of each checkout, and an `--in` that starts with `/` names
  a folder from the checkout's root;
- reads its `CONSTITUTION.md` and instruction files from its own folder. A session at a job worktree's root gets the
  repository root's `CLAUDE.md` and project settings, and the folder's `CLAUDE.md` only when it works in the folder
  ([platform status](development/platform-status.md)). It protects `.claude/`, `.mcp.json` and any `<data>/` at any
  depth;
- may change its own folder and the paths of `reach` (`gate reach`), which Customs holds;
- watches only its own refs: its namespace, its main line, its group branches and its own worktrees. Another tracker's
  branch, a person's checkout, a stash or a tag fails none of its jobs;
- holds a held main line only while the paths a fast-forward changes are dirty in the main checkout.

The trackers of a repository meet in `<git common dir>/forge/`, which every worktree shares:

| file | holds |
|---|---|
| `trackers.json` | `{ version: 1, trackers: { <trackerId>: { prefix, branchNamespace } } }`: each tracker in a folder or with a namespace, which `init` and `namespace` write and check. A bare tracker at the root is not listed. |
| `landings.jsonl` | One line per landing, `{ version: 1, trackerId, target, previousTip, commit }`, appended by each tracker in a folder. A sibling's journaled move of the target requeues a merge silently, as the tracker's own recorded landing does, and never counts toward parking; a move that no line names is `target-moved` as before. A landing a stop cut off between its fast-forward and its line gets the line when its rerun finds the commit already landed. |
| `landings.lock` | The lock folder a landing holds only around its tip check, fast-forward and journal line, and `init` around a change of the list. A landing that finds it held is refused `landing-lock-held`, keeps its slot and tries again on a later sweep. |

### Locking

Every mutating command takes the tracker's lock. It reads, changes and writes in one hold, in this order:
`progress.json`, `pipeline.json` when it changed, `constitution-sources.json` when an Apply stored the constitution's
sources, the tickets, the epics, the filing drafts, `gate-profiles.json` when a profile move changed it, `log.jsonl`
when it logged something, then `pipeline-setup.json` when a setup move changed or removed it. A ticket file is
therefore never ahead of the progress file, a log line never describes a change that was not stored, and an Apply
closes its setup record after everything it stored. A file whose bytes on disk already are its new contents is left in
place, judged inside the hold from the bytes alone, so a hold that changes nothing writes no tracker file and no
journal. Nothing renders: [Hephaestus](glossary.md#hephaestus) serves the board's documents from the store.

| takes the lock | takes no lock |
|---|---|
| `init` on a root with no tracker | `update`, and `init` on an existing tracker |
| `task`, `log`, `range`, `clear` | `status`, `usage`, `review-stats` |
| every `ticket` verb but the two reads | `ticket list`, `ticket show` |
| every `epic` verb but the two reads | `epic list`, `epic show` |
| every `draft` verb but the two reads | `draft list`, `draft show` |
| `concurrency <n>` | `concurrency` without an argument |
| the `gate` writes, `gate retry`, every `pipeline` verb | `gate list` |
| `merge`, `worktree repair` | `merges` |
| `decide`, `incident` | `decisions`, `incidents`, `await` |
| `job message`, `job fresh`, `job wind-down`, `job stop`, `resume`, `intake`, `advise` | `jobs`, `job show`, `job attach` |
| `pause`, `unpause` | `version` |

Each file a lockless command reads is written atomically, so it is whole, but one such read can meet `progress.json`
ahead of the tickets and the log while a hold writes. `update`, and `init` on an existing tracker, never touch the
tracker's own files; each removes the board page file an older version left in `<data>/`, which no version writes now.

### Help and options

`forge help` prints every command on one screen. `--help` works after a command word as well as on its own,
and `-h` on its own or straight after the command word; a `-h` further on is refused at exit 1, since it may be text
(put text behind a bare `--`). An option taking a value, given twice, is refused at exit 1, unless its row marks it
repeatable. An unknown command is refused at exit 1 with the help on standard error, so a typo never exits 0 or prints
the help into a parsed pipe.

### The Next line

`status`, `ticket add`, every ticket or task move (`task add --start` included), `ticket depends`, `priority`, `agent`,
`hold` and `unhold` end their human output with one line read from the board after the change:

```text
Next: 1 of 2 slots free; ready: #003, #005
Next: no slot free (2 agents in flight); ready: #003
Next: 2 of 2 slots free; nothing ready
```

At most five ready ids are named, then `and N more`; a held ready ticket is left out and named apart (`; held: #002`).
While Hephaestus is paused, as a board that never set its Hephaestus state is, the line ends with
`; Hephaestus paused: wait for the user's go`. `--json` output never carries the line. The free count is the one
Hephaestus launches by ([launch slots](#launch-slots)).

## Environment variables

`src/shared/Environment.ts` is the one module that reads the environment. The product's own variables are named from
`PRODUCT_NAMES.ENVIRONMENT_PREFIX`: the `forge` build reads only `FORGE_` names and never the
released program's, so an `AGENT_PROGRESS_ROOT` in the environment does nothing here.

| variable | should a person set it | empty value | set by | what it does |
|---|---|---|---|---|
| `FORGE_ROOT` | Yes, for a command run from outside the repository or on a scratch board | Empty or whitespace reads as unset | User | Names the repository to use instead of walking up from the current directory. |
| `FORGE_REQUIRE_EVERY_TOOL` | Yes, on a test run only | On for any value but empty, whitespace or `0` | User, for a test run | Turns every spec `src/testing/ToolGuard.ts` would skip for a missing tool into a failure, for a machine that must prove every claim. |
| `FORGE_FAKE_AGENT` | Only on a scratch board, where the sessions do no real work | On for any value but empty, whitespace or `0` | Specs, the demo script, or User | Launches every session Hephaestus starts as the scripted fake agent rather than the vendor's CLI. |
| `FORGE_FAKE_AGENT_KEEPS_WORKING` | Only to stage a running board | On for any value but empty, whitespace or `0` | User, on a scratch board | Under the fake-agent switch, keeps every fake session working until its standard input closes. Read only while `FORGE_FAKE_AGENT` is on. |
| `FORGE_FAKE_AGENT_REPORTS` | Only to run a scratch ticket to its landing | On for any value but empty, whitespace or `0` | User, on a scratch board | Under the fake-agent switch, each fake builder appends a line to `fake-agent-work.md` in each folder its stage may change that the ticket's `Work belongs in:` line names (in each such folder when the line names none), commits it and reports `built`, and each fake reviewer reports every Acceptance item as holding, by the report schema of the stage, a crossing ticket's package and adapt stages included. It claims no gate, so only a gate with `forgeOnly: true` passes. Every other session plays as without it. Read only while `FORGE_FAKE_AGENT` is on. |
| `FORGE_FAKE_AGENT_NETWORK_OUTAGE` | Only to see a session end on a network outage | On for any value but empty, whitespace or `0` | User, on a scratch board | Under the fake-agent switch, each fake session starts, prints the retry lines of a request that keeps failing and ends its turn on the error result Claude Code printed when its retries ran out on a network outage, then waits until its standard input closes. Its retry lines need the fake agent's recorded `network-outage` session. Read only while `FORGE_FAKE_AGENT` is on. |
| `FORGE_HEPHAESTUS_POLL_INTERVAL_MILLISECONDS` | No, a test setting | Empty or whitespace reads as unset; any value but a positive whole number is refused, `malformed-hephaestus-poll-interval`, at exit 1 | `cli/testing/CliProcess.ts`, on every child a spec spawns | Replaces the 250 ms between the polls of `start`, `restart` and `stop`; the polls grow in number to keep each whole wait. |
| `FORGE_VERSIONS_ANSWER` | No, a test setting | Empty or whitespace reads as unset; any value but two `major.minor` versions, `<current>/<minimum supported>` with the minimum not newer, is refused, `malformed-versions-answer`, when Hephaestus starts | A client's recording of a scratch forge | Replaces what `GET /api/versions` answers and the system version the monitor stream names, such as `1.3/1.0`, so a client can record a forge ahead of it or of another major ([The Hephaestus API](reference/hephaestus-api.md#system-versions)). |
| `FORGE_HATCH_REPLY_INTERVAL_MILLISECONDS` | No, a test setting | Empty, whitespace or any value but a positive whole number reads as unset | `cli/Main.integration.spec.ts`, where nothing answers the Hatch | Replaces the 250 ms between a relayed verb's 20 looks for its Hatch reply, so a spec sees `queued` without waiting out the 5 s. |
| `FORGE_JOB_ID` | No | Empty or whitespace reads as unset | Hephaestus, on every session it launches | The job this process runs under. |
| `FORGE_HATCH_DIRECTORY` | No | Empty or whitespace reads as unset | Hephaestus, on every session it launches | The job's Hatch folder, the one place outside its working directory the session may write. |
| `FORGE_GATE_REPORT` | No | Never read by the program | Hephaestus, on every gate line it runs, Talos's included | A path in the temporary folder where the gate may write its [report](#gate-reports). |
| `SHELL` | Not for this program | Empty or whitespace reads as unset, and the line runs in `/bin/sh` | The login environment | The shell that runs each prepare step and gate line. |
| `ComSpec` | Not for this program | Empty or whitespace reads as unset | Windows | On Windows, the cmd.exe that runs each prepare step and gate line, taken only as an absolute path with a drive letter. |
| `SystemRoot` | Not for this program | Empty or whitespace reads as unset | Windows | On Windows, whose `System32\cmd.exe` runs the lines when `ComSpec` is no absolute path; with neither, no line runs. |
| `PATH` | Not for this program | An empty entry is left out | The login environment; the test preload prepends one folder | Its folders are the executables a gate's `--writes` must never let a branch replace, as `gate add` says. |

- `FORGE_ROOT` is for a command run from somewhere else entirely. It does not create a tracker: a value
  naming a directory that has none is refused with a message saying the variable is set. `init` does not choose its
  directory by it, and refuses at exit 1 when it names a directory other than the one `init` targets.
- `FORGE_FAKE_AGENT` is set by `cli/testing/CliProcess.ts` on every child a spec spawns,
  or by User on a scratch board, so nothing spends a subscription.
- `FORGE_JOB_ID` and `FORGE_HATCH_DIRECTORY`, both set, make verbs follow [the
  Hatch](#under-a-job-the-hatch); one alone runs as any other process does. A gate's environment drops both, so a gate's
  verbs run directly.
- A gate's environment also drops a `FORGE_GATE_REPORT` it would inherit and carries its own instead.

> **As built.** The hook guard also needs the program on `PATH`.

## Adopting a repository

```sh
cd ~/code/example-storefront
forge init
```

`init` creates the tracker and installs everything a session needs to use it, the six items below. `init` never writes
`CLAUDE.md`: a repository's `CLAUDE.md` holds its own conventions only. Nor does it write a pipeline: no ticket builds
until [`pipeline setup`](#pipeline-setup) designs one with the pipeline agent and its [Apply](#apply) stores
`pipeline.json`, committing the constitution to the main line as the tracked `CONSTITUTION.md` first.

Git 2.38 or newer is required: merge forecasts and merge verification use `git merge-tree --write-tree`, which came in
2.38. `init` and `start` read `git version` first and refuse with exit 1 below it, or when no git answers, before
writing anything. Every git the tool starts, and every git a worker or gate starts, runs with `core.longpaths=true`, so
a worktree path past 260 characters still checks out on Windows; no repository's own git config is written.

| # | what | path | written by | opt-out |
|---|---|---|---|---|
| [1](#1-the-tracker) | The tracker: `progress.json`, `log.jsonl`, a `tickets/` folder, and the `.lock` directory | `<data>/` | `init` only | none |
| [2](#2-the-gitignore-entries) | `.gitignore` entries for the tracker (`init` only) and for the worktrees folder | `.gitignore` | `init`, `update` | none |
| [3](#3-the-files-beside-the-tracker) | The session instructions, from `resources/templates/SessionInstructions.md`, the reference, from `Reference.md`, and the eight instruction defaults, from `Constitution.md`, `ReReviewerBrief.md`, `ConflictReReviewerBrief.md`, `PipelineAgentBrief.md` and `AssistantBrief.md` there and `BuildPrompt.md`, `ReviewPrompt.md` and `ProductOwnerPrompt.md` under `resources/prompts/` | `<data>/session-instructions.md`, `reference.md`, `briefs/defaults/<constitution\|builder\|reviewer\|reReviewer\|conflictReReviewer\|productOwner\|pipelineAgent\|assistant>.md` | `init`, `update` | none |
| [4](#4-the-hook) | The agent's session-start entry running `forge hook session-start`, written by the agent adapter; for Claude Code a `SessionStart` hook, kept current in `.claude/settings.json` when that file already holds it | for Claude Code `.claude/settings.local.json` | `init`, `update` | `--no-hooks` |
| [5](#5-the-skills) | The two skills, copied from this checkout's `skills/agent-po/` and `skills/agent-pipeline/` into the folder the agent loads instruction bundles from, each with its `.gitignore` entry | for Claude Code `.claude/skills/forge-po/`, `.claude/skills/forge-pipeline/` | `init`, `update` | none |
| [6](#6-the-install-version) | The install version | `<data>/version.json` | `init`, `update` | none |

### Re-running

To pick up later instructions, hooks or skills, run `forge update`, never `init` again. `init` at a root
that already has a tracker does exactly what `update` does and says so. `init` is refused below an existing tracker,
inside a bare repository, with a `--root` that is not an existing directory, or with `FORGE_ROOT` naming a
directory other than the one it would create the tracker in. `init` never replaces an existing `progress.json`: it
creates the store with an exclusive create, under the lock.

### What a run reports

`update`, and `init` at a root that already has a tracker, report items 3 to 6 and the worktrees entry on a line each:

- `updated` or `unchanged`, judged from the file's bytes before and after;
- for the hook, the same judged from its entry, or `installed` when it was added;
- `left alone` under the item's opt-out.

The session instructions' `updated` adds "re-read it before your next brief", so a session that read them at its start
learns its copy is stale. A first `init` prints the session instructions' path instead, and ends with three next steps:
run `forge start`, which starts Hephaestus in the background; ask an agent session (Claude Code) in this repository
to file a ticket; and set the pipeline up, as the board starts on Pipeline setup: choose who pays, let the pipeline
agent read the repository, and Apply, which commits `CONSTITUTION.md` to the main line and, with Resume, starts the
board.

### The six items

#### 1. The tracker

Its root is the main checkout, found from any worktree.

#### 2. The `.gitignore` entries

They are added only where the repository does not already ignore the path: `git check-ignore` decides, so a repository
covered by a broader pattern, a parent `.gitignore` or `.git/info/exclude` gets no diff at all. `init` adds the
worktrees folder's before any worktree can exist, and `update` adds it to a repository adopted earlier.

#### 3. The files beside the tracker

- `session-instructions.md` is what the session-start entry prints to every session User opens: how this repository
  tracks its work, which skill to load for what, and where the reference is. Its presence marks the files installed.
- `reference.md` is a ticket's fields, the ticket moves and the exit codes copied from this file, which a session
  reads on demand.
- `briefs/defaults/` holds the instruction file each role reads when the pipeline names none (see [Files on
  disk](#files-on-disk)), which Hephaestus fills with the job's values at each launch.

These are guidance shipped with the tool rather than files a project edits, so every `init` and `update` rewrites them
all; a project adds its own tracked files through the pipeline instead. Item 3's report line names the session
instructions, and says `updated` when any of these files changed. Install version 19 removes the `assistant-brief.md`
earlier versions wrote, and install version 26 removes `briefs/defaults/merger.md`.

> **As built.** The marker leaves a window while a fresh `init` runs.

#### 4. The hook

The agent adapter writes the entry; forge names only the command it runs. Claude Code's adapter puts it in under an
empty matcher, into `.claude/settings.local.json`. That is the per-user file Claude Code applies over the shared one
and keeps out of git, and a job's `--setting-sources project` never loads it, so the hook lands in nothing colleagues
share and reaches no worker. A repository that already keeps the hook in the shared
`.claude/settings.json` has it kept current there instead.

Either way it merges into whatever the file holds and is never added twice. It refuses a document it cannot parse rather
than replacing it, and writes nothing when the entry already says what it should.

Claude Code adds `**/.claude/settings.local.json` to the user's global git excludes the first time it writes that file
itself. Until then the file this tool creates shows up in `git status`; this tool writes no `.gitignore` entry for it.

#### 5. The skills

`forge-po` and `forge-pipeline` ([The two skills](#the-two-skills)) are copied file for
file from this checkout's `skills/` into the folder the agent adapter names for each, Claude Code's
`.claude/skills/<name>/`, where it reads a project's skills. Where a skill quotes the line that runs a skill, the
adapter gives the line (`/<name>` for Claude Code).

- Every `init` and `update` rewrites each file the skill ships, so a hand edit is undone.
- A file somebody else put in the folder is never touched, so one a newer skill no longer ships stays behind until
  removed by hand.
- Each folder gets its own `.gitignore` entry unless git already ignores it, since it is a copy the next `update`
  replaces.

Item 5's report line names each folder, `updated` or `unchanged`, and adds `.gitignore entry added` when it added one.

#### 6. The install version

[Its file](#dataversionjson) holds the one version of everything above that the tool installs, which changes only when
what the CLI and those files expect of each other changes. `init` and `update` compute every installed file first and
write this one last, after every other write, so a run that fails part way leaves the version it found and a second run
completes it. A refused settings file is reported and does not hold it back.

### Install version

`<data>/version.json` records which [install version](glossary.md#install-version) the installed files are (item 6
above), written last by `init` and `update`. Every command checks it against the running program before it does
anything, unless the second table below spares it.

| `version.json` | marker file | verdict | way out |
|---|---|---|---|
| records this program's version | any | the command runs | none needed |
| records a different version, older | any | refused | `forge update` |
| records a different version, newer | any | refused | update the program itself first |
| missing | `<data>/session-instructions.md`: the files predate versioning or a fresh `init` was cut short | refused | `forge update` |
| missing | neither, so nothing is installed that could disagree | the command runs | none needed |
| unreadable, or not a whole number of at least 1 | any | refused | `forge update` |
| a directory sits at its path | any | refused | remove that directory, then `forge update`, which could not replace it |

A refusal is one paragraph on standard error at exit 1, naming the tracked root and the way out; nothing is locked or
written first. Where no tracker governs the directory, the command's own no-tracker refusal is unchanged.

These commands do not take the refusal above:

| command | under a mismatch |
|---|---|
| `init`, `update` | They lift the refusal. They refuse, at exit 1 with the same paragraph and writing nothing, only files a later program installed, so an older program never writes its files over a later one's, and a directory at the file's path, which they could not replace. |
| `help`, `version` | They run; neither checks. |
| `status` | It never refuses and says nothing about a mismatch, because its output is what scripts read. The refusal first shows at the next command. |
| `hook session-start`, `hook bash-domains`, `hook stage-edits` | They skip the check, so a mismatch changes nothing: each answers at exit 0. |
| `stop`, `talos-restart` | They run, so a Hephaestus whose install changed can still be stopped and told to restart its Talos; `status` inspects it. |
| `machine` | It runs: it writes no file of the repository's install. |
| `start` | It checks the repository it starts, which `--repository` may name, not the working directory. |
| `start --successor-of` | It runs the check like any start: a mismatch refuses it, and the [restart](glossary.md#restart) that started it leaves no Hephaestus on the board. |
| `start --preflight` | It is refused nothing before its steps: the check is its last step, `install-version`, so a mismatch is reported as that [restart](glossary.md#restart)'s failure and the old Hephaestus keeps driving. |
| a verb relayed [under a job](#under-a-job-the-hatch) | It relays before any check. |

## The two skills

`init` and `update` copy two skills from this checkout's `skills/` into the tracked repository's git-ignored folder
the agent loads instruction bundles from, Claude Code's `.claude/skills/` (item 5 of
[Adopting a repository](#adopting-a-repository)). None lists commands: `forge help` is the reference, and each names
it and `<data>/reference.md`. The pipeline setup skill alone holds the table of the pipeline agent's five relayed
verbs, which help does not print.

| installed skill | source folder | loads |
|---|---|---|
| `forge-po` | `skills/agent-po/` | by itself in any session asked to file, report or track a ticket, bug or research question, or with `/forge-po`; and as the first line of a Hephaestus's product-owner job |
| `forge-pipeline` | `skills/agent-pipeline/` | by itself in any session asked to set up the pipeline, change the gates or review the pipeline, or with `/forge-pipeline`; and as the first line of a Hephaestus's pipeline agent job, whose step messages name its steps |

## Commands

Options in `[brackets]` are optional; `a|b` is a choice of one. Everything after a bare `--` is one free text,
`-- <text>`, so a text may start with a dash.

### Setup

| command | what it does |
|---|---|
| `init [--project <name>] [--root <path>] [--namespace <name>] [--no-hooks] [--json]` | Create the tracker here and write the six items in [Adopting a repository](#adopting-a-repository), with no pipeline: [`pipeline setup`](#pipeline-setup) designs one. `--project` names the project the board carries (default: the root directory's name); `--root` tracks that directory instead of the discovered root of the repository's main checkout, and run from another folder without it `init` says which root it chose. `--namespace` sets the branch namespace as [`namespace`](#the-boards-lifetime) does; a tracker in a folder of its repository needs one. Refused at exit 1 with nothing written when a tracker the repository's tracker list (`<git common dir>/forge/trackers.json`) names sits above or below the directory, or holds the namespace, or a branch leaves the namespace no room. A tracker in a folder, or with a namespace, is written into that list; a bare tracker at the root is not. `--json` prints `{ answerVersion, outcome, trackerId, project, root }`, `outcome` `created`, or `refreshed` for a tracker that was there. |
| `update [--no-hooks] [--json]` | Refresh what the tool wrote into a repository it already tracks: the files beside the tracker, the agent's session-start entry, the two skills and the worktrees folder's `.gitignore` entry, undoing a hand edit to any of them; then `version.json`. The tracker's own files are left alone, and the first line says so. `--json` prints `{ answerVersion, outcome, installVersion, restart, restartStep }`, `restart` `done`, `not-needed` or `failed`. `restartStep` is `null`, or `restart-not-taken` when the live Hephaestus did not take the restart, at exit 0 with the old Hephaestus still driving. A restart that failed after it was taken is the refusal `restart-failed`, whose answer adds `restart: failed` and its `restartStep`. |
| `help` | The command reference. |

#### `init` and `update` refusals

Both are refused at exit 1, writing nothing, over files a later program installed ([Install version](#install-version)).
This build also refuses `init` `older-program-present` at exit 1, like `update`, while the root holds the released
program's `.agent-progress/` folder, writing nothing.

`init` is also refused:

- when an ancestor already holds a tracker;
- when `--root` is not an existing directory;
- inside a bare repository;
- when `FORGE_ROOT` is set to a directory other than the one it would create the tracker in. The message
  names both, and nothing is written.

A re-run of `init` refreshes only what `update` refreshes and leaves the tracker's own files alone.

`update` creates no tracker, so it takes no `--project` and no `--root`. With no tracker it is refused at exit 1, naming
`forge init`. A tracker in a format this one no longer reads is refused at exit 2 by every command that
reads it, the reason ending in `OLDER_FORMAT_ADVICE`.

#### What `update` does to a live Hephaestus

Last, when the board's Hephaestus is live and its [Hephaestus lock](glossary.md#hephaestus-lock) names a code or
install version other than the one on disk, `update` sends `hephaestus-restart` and prints the outcome of the checked
[restart](glossary.md#restart) (see [`restart`](#restart)). A failed preflight exits 1 `restart-failed` with the old
Hephaestus still driving; a successor that did not serve exits 1 `restart-failed` at step `serve` with no Hephaestus
on the board. What `update` installed stands either way. A Hephaestus whose API does not take the command is left
driving: `update` prints that it did not take the restart and exits 0 with `restartStep` `restart-not-taken`. With no
live Hephaestus it does nothing more.

### Reading the board

| command | what it does |
|---|---|
| `status [--json] [--full] [--tickets-only]` | The project, the counts, the rows that are not delivered or abandoned, and the last five log entries newest first, then the Next line. Above the board it prints Hephaestus's process facts: the newest Hephaestus lock, the URL, the runtime state, whether the board is paused, the code version on disk against the live Hephaestus's, Hephaestus's notices, the warning of a failed restart, and the forge's presence: down, whether it is [off after a crash](#after-a-crash) and its crash log's path; live, its last start, heartbeat, supervision and abandoned passes. `--json` carries them under `hephaestus`. Read-only, no lock, no install-version check. [The states and JSON](#the-hephaestusProcesses-facts-in-status) are below. [The flags](#status-flags) and [the `--json` documents](#what-status---json-holds) are below. |
| `ticket list [--status <s>] [--priority <p>] [--json]` | The tickets with their status, priority, type and row id, the model and effort after the title where the ticket names them, and "waiting on #003" where a dependency is unsettled. `--status` and `--priority` narrow the listing. `--json` carries no bodies. |
| `ticket show <id> [--json]` | One ticket: its frontmatter, its priority, its model and effort where it names them, and its body; never where it is kept, since a ticket changes only through its verbs (`ticket edit` for its title and body). From `committed` onward the title and body shown are the ones kept by the ticket's `contentHash`. |

#### `status` flags

- `--json` prints the same working view for an agent: the unsettled rows and tickets, the last 10 log entries, and an
  `omitted` object counting what was left out.
- `--full` lists everything; with `--json` it prints the whole progress file plus every ticket's frontmatter.
- `--tickets-only`, with or without `--json` and `--full`, leaves out the free-standing task rows, every row that is no
  ticket's own row (`ticket` null) and no [review bar](glossary.md#review-bar) (no `reviewOf`), while the tickets, the
  log and the counts stay.

The human output breaks the token total down per owner. Owners are grouped case-insensitively on the trimmed text and
shown under the group's most common spelling (the first met on a tie), most tokens first, with the reported rows that
carry no owner on a `no owner` line of their own.

#### What `status --json` holds

Both documents carry these keys in this order, except `omitted`, which only the working view has. Hephaestus decides
from the Board, not from these lists. Every list is in file order, each id once, with a ticket's model, effort and
priority resolved to their defaults.

<details>
<summary>The keys of both documents, in order</summary>

| key | holds |
|---|---|
| `version` | The document's own shape version, `1`, whatever version the stored file is at. |
| the stored top-level keys | As `progress.json` holds them. |
| `tasks` | The rows: the unsettled ones, or every one under `--full`. |
| `log` | The worded log, directly after `tasks`. |
| `tickets` | The tickets: the unsettled ones, or every one under `--full`. Each carries `epics`, its list in order, empty when it has none. |
| `epics` | Every epic with its roll-up (see [Epics](#epics)). |
| `drafts` | Every open filing draft (see [Drafts](#drafts)). |
| `concurrency` | `limit`, `agentsInFlight`, `freeSlots`, `readyTicketIds`, `hephaestusState`, `heldTicketIds`, then `inProgressTicketIds` and `inProgressReviewOfIds`. |
| `concurrency.inProgressTicketIds` | The `ticket` of every `in-progress` row that has one. |
| `concurrency.inProgressReviewOfIds` | The `reviewOf` of every `in-progress` row that stores one, on any row, a ticket's own row included. |
| `readyTickets` | See [Ready tickets](#ready-tickets). |
| `confinement` | The confinement in force for gate and install lines: `confined`, `unavailable` or `unconfined-by-design`, the word the board state carries. |
| `confinementSource` | Whose probe gave `confinement`: `hephaestus` when a live Hephaestus answered its `/api/state` with the Hephaestus lock's token, so a sandboxed caller prints Hephaestus's word; `this-process` when none answered and this process probed itself. |
| `pipelineIsSet` | `true` when `<data>/pipeline.json` reads as a pipeline; `false` when none is stored, or it is older or malformed. Only Apply or a `gate` verb writes it. |
| `omitted` | Working view only: `settledTasks`, `settledTickets`, `olderLogEntries`, and `freeStandingTasks` under `--tickets-only`. |
| `reviewWaitingTickets` | `{ id, model, effort }` for every `in-review` ticket whose id is not in `inProgressReviewOfIds`, a held one included; `heldTicketIds` says which are held. A group awaiting its release is left out. |
| `pausedBuilds` | `{ id, note, priority, model, effort }` for every `in-progress` ticket whose row is `paused`, `note` being that row's note, whoever paused it. A group awaiting its release is left out. |
| `ticketRows` | `{ id, row, reviewBars }` for each ticket the document lists, in its order, so the working view covers only the unsettled tickets. `row` is `{ id, status, note }` of the row the ticket's `task` names, or `null`. `reviewBars` are `{ id, status, round }` of the rows whose `reviewOf` is the ticket, one another ticket owns included, as `inProgressReviewOfIds` reads them, oldest filed first, `round` being the stored `reviewBarRound` and absent where the bar stores none. |
| `tokensByOwner` | The human output's breakdown over every row, whatever the flags: `{ owners: [{ owner, tokens, rows }], withoutOwner: { tokens, rows }, withoutTokens: { rows } }`, whose owner and `withoutOwner` tokens add up to the reported total. |
| `ticketCountByStatus` | Every ticket on the board counted per status, settled ones included, every status present, zero or not, so a reader totalling the board needs no `--full`. |
| `jobs` | Every unsettled job as `progress.json` stores it, empty when there is none. |
| `decisions`, `incidents` | Every open one as `progress.json` stores it, each empty when none is open. |

</details>

#### Ready tickets

A ticket is ready when it is committed and every ticket it depends on is reviewed or delivered; priority never keeps a
ticket from being ready, it only orders them.

- `readyTicketIds` orders them high priority first, then normal, then low.
- Within a priority they go by readiness: the log position of the ticket's latest `ticket-committed` or
  `ticket-reopened` line. A ticket with neither, readied before readiness was logged or behind a `Tracker cleared` line,
  comes first.
- Then lowest id first.

`readyTickets` lists the same tickets in the same order as `{ id, priority, model, effort }` with the defaults resolved,
plus `group` on a ticket that has one (absent otherwise, as in `tickets`) and `held: true` on a held one, so a reader
derives none of them itself.

#### A group awaiting its release

While a [group](glossary.md#group) has a release ticket (see `ticket release-of`) that is neither delivered nor
abandoned, every ticket of that group is left out of `readyTicketIds`, `readyTickets`, `reviewWaitingTickets` and
`pausedBuilds`, though Hephaestus still builds them. Once the release ticket is delivered or abandoned, the group has
no release ticket, so its remaining open tickets list as any other. A group with no release ticket lists as ungrouped
tickets do.

> **As built.** Group tickets missing from the ready ids.

### Tasks

A task is a row on the Gantt chart. A row a ticket owns is moved by the `ticket` verbs; the `task` verbs refuse it,
except a pause and its resume, naming the `ticket` verb that moves both, and `--force` moves only the row.

| command | what it does |
|---|---|
| `task add "<name>" [--owner <who>] [--note <text>] [--ticket <id>] [--review-of <id>] [--start] [--tokens <n>] [--at <when>] [--force]` | Add a row. `--start` marks it in-progress at `--at` (default now); `--note` is the detail shown beside the bar; `--tokens` records what the work cost. `--ticket` and `--review-of` link it: see [below](#task-add-links). |
| `task start\|pause\|finish\|approve\|rereview\|deliver <id> [--owner <who>] [--note <text>] [--tokens <n>] [--at <when>] [--force]` | Move one row and stamp it. `start` sets its start and resumes a paused row; `pause` records that the work is waiting without closing the bar; `finish` and `approve` set its end; `rereview` sends a row whose review found too much into its next review round, 2 and then 3, without reopening the bar; `deliver` records that the work reached its destination. |
| `task update <id> [--name <text>] [--owner <who>] [--note <text>] [--status <status>] [--tokens <n>] [--force]` | Change a row without moving its clock, and without adding to its `history`: a correction is not something that happened. At least one field is required. `--status` is for a correction the transitions cannot express, and on a row a ticket owns is refused unless `--force`, except a pause and its resume. A rename never links a row, and never moves or drops a stored `reviewOf`. |
| `task remove <id>` | Delete a row. A ticket pointing at it is unlinked rather than deleted. The id is never given to another row. |
| `log "<text>" [--at <when>]` | Append one line to the log, which `status` and the board document show. Every positional is joined, so an unquoted sentence is kept whole. |

The task statuses are `committed`, `in-progress`, `paused`, `in-review`, `re-review`, `reviewed`, `delivered` and
`abandoned`: the ticket statuses, plus `paused` and `re-review`, which only a row reaches.

Each `task` verb is named for the status it moves to: `start` to in-progress, `pause` to paused, `finish` to in-review,
`rereview` to re-review, `approve` to reviewed and `deliver` to delivered. The ticket verbs are under
[Tickets](#tickets).

#### `task add` links

- `--ticket` links the row to a ticket that has no row of its own, and `--force` moves that link off the row that holds
  it.
- `--review-of` marks the row as a review round of that ticket, drawn directly above the ticket's own row, latest round
  first. It also stores the bar's round as `reviewBarRound`, the ticket's bare `## Review` headings plus one, a
  code-written `## Review <n>` not counting. A ticket that does not exist is refused at exit 1.
- A row filed without `--review-of` is no review bar, whatever its name.

### Tickets

A [ticket](glossary.md#ticket) is a markdown file under `<data>/tickets/` driving one Gantt [row](glossary.md#row).

Types are `ticket`, `bug` and `research`, and `ticket add` requires one; a stored `change` or `feature` reads as
`ticket`. Priorities are `low`, `normal` (the default) and `high`; models `haiku`, `sonnet`, `opus` and `fable`; efforts
`low`, `medium`, `high`, `xhigh` and `max`. A model or effort left unnamed reads as `opus` and `medium`. A ticket's
model and effort are stored and shown, and no launch reads them.

| command | what it does |
|---|---|
| `ticket add "<title>" --type ticket\|bug\|research [--priority low\|normal\|high] [--size XS\|S\|M\|L\|XL\|XXL] [--model <m>] [--effort <e>] [--group <name>] [--depends-on <ids>] [--epic <keys>] [--network <domains>] [--entity <key>] [--introduced-by <id>] [--found-in-review <id>] [--body <markdown>] [--body-file <path\|->] [--at <when>]` | File a draft ticket, status `draft`, with no row at any priority and no task id spent: `ticket ready` makes it `committed` and files its row. [Its options and refusals](#ticket-add) are below. |
| `ticket edit <id> [--title "<title>"] [--append] [--body <markdown>] [--body-file <path\|->] [--at <when>] [--json]` | Rename a ticket with `--title`, replace its body with `--body` or `--body-file` (`-` reads standard input), or with `--append` add to its end. Only a draft or a ticket in `ready-for-review` is edited: a committed ticket's content is fixed; [the rules](#ticket-edit) are below. |
| `ticket ready <id> [<id>...] [--at <when>] [--json]` | Ready draft tickets, or tickets in `ready-for-review`, to build, all or nothing in one lock hold: each becomes `committed` with a `committed` row at any priority, and one `ticket-committed` line is logged per ticket. [Its refusals](#ticket-ready) are below. |
| `ticket unready <id> [--at <when>] [--json]` | Put a committed ticket no job has taken back into `draft` in one lock hold, to edit it there: its row and its kept content go, everything else stays, and one `ticket-unreadied` line is logged. [Its refusals](#ticket-unready) are below. |
| `ticket submit <id> [<id>...] [--at <when>] [--json]` | The filer's close of its draft tickets, in one lock hold. With ticket review off (`gate approval tickets off`) each complete draft becomes `committed` with its row (`ticket-committed`); with it on, the default, each becomes `ready-for-review` with no row (`ticket-submitted-for-review`) and waits for User's `ticket ready`. An incomplete draft stays a draft, named with its gaps; `--json` prints `{ tickets, incompleteTickets }`. A ticket that is not a draft is refused at exit 1 with nothing written (`ready-of-a-ticket-not-in-draft`), and so, with ticket review off in a forge with entities, is a complete draft with no `entity` (`ticket-without-entity`). No role an agent runs under may relay it; a product owner under Hephaestus closes with `intake close`. |
| `ticket park <id> [--incident <I>] -- <reason> [--at <when>] [--json]` | Hold the ticket `parked:<incident kind>` (`parked:user` with no incident, replacing any hold) and open a `parked` decision to User, the reason its question. Under an incident whose job waits on a question, the job ends `stopped` (cause `parked`) in the same hold and the decision carries the agent's questions, the reason as its context. |
| `ticket agent <id> [--model <m>] [--effort <e>] [--at <when>]` | Change the model or effort stored on a ticket, or both, with one log line such as `Ticket #003 agents opus/medium → sonnet/medium`. No launch reads them (see above). Refused at exit 1, writing nothing, on a delivered or abandoned ticket, with neither option, with a value outside the lists, and when the resolved pair would not change. |
| `ticket priority <id> low\|normal\|high [--at <when>]` | Change a ticket's priority, with one log line. Lowering to low is refused unless the ticket is a draft ticket or committed, and keeps its row: priority only orders the ready tickets. A draft ticket has none at any priority; raising a low ticket that has no row gives it one at once. A low ticket with no row gets its row when it starts, and keeps it; abandoning a low ticket that has none creates none. |
| `ticket size <id> XS\|S\|M\|L\|XL\|XXL [--at <when>]` | Change a ticket's size, in any status, with one `ticket-size-changed` log line. A size outside the list, in capitals only, and an unchanged size are refused at exit 1 with nothing written. |
| `ticket network <id> <domain>... \| --clear [--at <when>] [--json]` | Set the public domains the ticket's agents may reach, comma- or space-separated, stored lower case and once each as the frontmatter key `network`; `--clear` removes the key. One `ticket-network-set` log line, `updated` not stamped; [its refusals](#ticket-network) are below. |
| `ticket entity <id> <key> --reason <text> [--at <when>] [--json]` | In a forge with entities, name the entity whose pipeline builds the ticket, stored as the frontmatter key `entity`, and say why. One `entity-assigned` log line holds the reason and who assigned it; `updated` is not stamped. [Who runs it and its refusals](#ticket-entity) are below. |
| `ticket group <id> <name> [--at <when>] [--json]` | Put a ticket that has no group into one, a started ticket too, stored as the frontmatter key `group`: its next landing goes to `group-<name>`, and the group's release takes it to the main line. One `ticket-grouped` log line; `updated` is not stamped. Refused at exit 1, writing nothing, on a ticket already in a group (`ticket-already-in-a-group`), on a delivered or abandoned ticket (`group-of-a-settled-ticket`), and on a name `ticket add --group` refuses (`malformed-group-name`, `group-name-case-twin`). `--json` prints the ticket. No role an agent runs under may relay it. |
| `ticket hold <id> [--reason <text>] [--at <when>]` | Pause a ticket between build and review, or between review rounds, without pausing Hephaestus. While the frontmatter's `hold` key is set (to the reason, empty without one) Hephaestus launches no builder or reviewer for it, and `status --json` lists it in `concurrency.heldTicketIds` and marks its `readyTickets` entry `held: true`. An agent already running is never interrupted. One log line; refused at exit 1 on a delivered or abandoned ticket and on one already held. |
| `ticket unhold <id> [--at <when>]` | Lift the hold, with one log line; the step it held starts at Hephaestus's next [Pass](glossary.md#pass). On a ticket in progress whose row is paused, a last line says to resume it with `task start <row>`, since Hephaestus never takes a paused row over. Refused at exit 1 on a delivered or abandoned ticket and on one not held. |
| `ticket release-of <id> [--clear] [--at <when>] [--json]` | Mark a ticket as its group's release ticket, the one whose release takes the group's work to the main line, or with `--clear` remove the mark. [The rules](#ticket-release-of) are below. |
| `ticket epic <id> [<key>...] \| --add <keys> \| --remove <keys> [--at <when>] [--json]` | Set the epics a ticket belongs to, in order: the first is its primary epic. Bare keys replace its list and no keys clears it; `--add` appends (a key already there keeps its place), `--remove` takes keys out. Either beside bare keys, or the two together, is refused as ambiguous at exit 1, and a key naming no epic is refused at exit 1 with nothing written. One log line, `Ticket #003 belongs to epics checkout-redesign, search`; `updated` is not stamped. `--json` prints the ticket with `added` and `dropped`. Epics never affect launching, concurrency or release: that is `group`. |
| `ticket introduced-by <id> [<cause id>] [--at <when>] [--json]` | Name the delivered ticket whose change introduced a bug, stored as its `introducedBy`; no cause, or an empty one, removes the key. Refused at exit 1 with nothing written when the ticket is not a bug, or the cause does not exist, is the ticket itself or is not delivered. One log line, `Ticket #007 introduced by #005`; `updated` is not stamped, and every other line of the file is kept. `--json` prints the ticket. |
| `ticket depends <id> [<id>...] \| --add <ids> \| --remove <ids> [--json]` | Set the tickets this one waits on: bare ids replace its list, no ids clears it, `--add 3,4` appends and `--remove 3,4` takes ids out. [The output and refusals](#ticket-depends) are below. |
| `ticket link <ticketId> <taskId> [--force]` | Point a ticket at an existing row instead of the one it filed. Refused when that row already belongs to another ticket, unless `--force`, which unlinks it there first. |
| `ticket abandon\|reopen <id> [--branch <b>] [--commit <sha>] [--reason <text>] [--tokens <n>] [--at <when>]` | Move a ticket and its row together, stamping both; Hephaestus makes every other lifecycle move. `abandon` requires `--reason`; `reopen` clears the stamps and returns the row to committed. [The rules](#ticket-abandonreopen) are below. |
| `ticket status <id> <status> [...same options]` | The same move as `ticket abandon\|reopen`, naming the target status directly (committed, in-progress, in-review, reviewed, delivered or abandoned) with the same options. The documented way to make a move the verbs refuse: it skips the matrix, but never moves a ticket into `draft` (`move-to-draft`) or a draft ticket anywhere but `abandoned` (`move-of-a-draft`). |
| `ticket deliver <id> --by-hand [--branch <b>] [--commit <sha>] [--at <when>] [--json]` | The one record-only lifecycle verb: records as delivered a ticket User finished and landed outside Hephaestus, from any status but draft, in one hold, merging, landing and spawning nothing; it logs `ticket-delivered` with `byHand: true`. Refused at exit 1, writing nothing, while a Hephaestus's Hephaestus lock is live (`hephaestus-owns-the-lifecycle`, naming its URL) and while a job of the ticket is live (`ticket-has-live-job`), both judged inside the hold. Never relayed. On a live board a client sends the control command `ticket-deliver-by-hand`, which Hephaestus applies in its own hold, refused `ticket-has-live-job` the same way. |
| `ticket rereview <id> --start-review [--owner <who>] [--note <text>] [--at <when>]` | The next review round and the reviewer's in-progress bar (`Review <N> #<id> — <title>`, its `reviewOf` the ticket, N the bare `## Review` headings plus one, stored on the bar as `reviewBarRound`) in one lock hold, closing any bar of the round before. `--owner` and `--note` name the bar, and are refused without the flag. |
| `ticket rereview <id> [--at <when>]` | Send a ticket already in review round again, for a fresh reviewer: the ticket stays in-review and only its `updated` moves, while its row goes one review round up, from 2, and the log says which round. The one verb legal on the status the ticket already has, and refused from every other. It takes no `--tokens`: the row's figure is the builder's, and a review round has its own row. |

#### `ticket add`

- The body comes from `resources/templates/TicketBody.md`, from `--body`, or from `--body-file` (`-` reads standard
  input). An empty body falls back to the template, and afterwards the body is preserved byte for byte, so an agent may
  edit everything below the frontmatter freely.
- A draft ticket is edited without `--force`.
- `--depends-on 3,4` files it already waiting on those tickets.
- `--group checkout-redesign` files it in that group. A group name is lower-case letters and digits in words joined by
  single hyphens, the same rule on every OS, since it names the branch and folder `group-<name>`; any other name, or
  one that differs from an existing group only in case, is refused at exit 1 with nothing written. A stored group
  that breaks the rule is never migrated: launching its job fails with advice to file its tickets again.
- `--epic checkout-redesign,search` files it in those epics, the first its primary one. An epic that does not exist is
  refused at exit 1 with nothing written.
- `--introduced-by 5` stores `introducedBy`, refused at exit 1 with nothing written as `ticket introduced-by` refuses
  it.
- `--found-in-review 5` stores `foundInReview`, the ticket whose review found this one, refused at exit 1 with nothing
  written when that ticket does not exist.
- `--network api.example.com,cdn.example.com` sets the `network` line as `ticket network` does, logged after the filing
  and refused the same way.
- `--entity web` files it in that entity of a forge with entities, with no `entity-assigned` line and no reason. A key
  the pipeline does not name, and any key in a forge without entities, is refused at exit 1 with nothing written
  (`unknown-entity`).
- `--size M` stores `size`, the expected change in code lines, comments and docs not counted: XS ≤ 20, S ≤ 100, M ≤ 300,
  L ≤ 750, XL ≤ 1500, XXL beyond.
- A worker's low finding relayed under a job gets the tickets of that job in `dependsOn` and, when one of them has a
  group, that group. Then it is submitted at once, as `ticket submit` does.

A model, effort or size outside the lists, or `--body` and `--body-file` together, is refused at exit 1 with nothing
written.

#### `ticket edit`

- `--append` puts one line ending before the text when the body does not already end in one. A title and a body change
  are applied in one write. A value that starts with `--` is passed as `--body=<text>`.
- The text is written in the line ending the body already uses (the frontmatter's when the body holds none), so a CRLF
  ticket stays CRLF throughout.
- A new title rewrites the frontmatter's `title` line, the ticket's own row name (`#<id> <title>`) and a first body line
  still reading as generated (`# <id> — <old title>`), before any body change applies. The file name, a review row's
  name and every other body byte stay as they are, and one `ticket-retitled` record is logged.
- Every other frontmatter byte is kept. `updated` is not stamped, since only a transition stamps it, and a body change
  is not logged. The write takes the tracker's lock and is atomic.
- A ticket's title and body are fixed from `committed` onward (committed, started, in review, reviewed, delivered,
  abandoned): the edit is refused at exit 1 with nothing written (`content-of-a-committed-ticket`), held or not, since
  an agent may pick a committed ticket up at any moment. Its status is read inside the same lock hold as the write, so
  no move slips between them. Nothing overrides the refusal; `--force` is an unknown option. A committed ticket is put
  back into draft with [`ticket unready`](#ticket-unready) and edited there; past committed, its work is stopped and the
  ticket reopened first.
- An edit that changes nothing, an empty append or the current title included, writes nothing and exits 0.
- An empty replacement or `--title`, none of `--title`, `--body` and `--body-file`, or both body options are refused at
  exit 1.
- `--json` prints the ticket.

#### `ticket ready`

Refused at exit 1 with nothing written when any ticket named is not a draft ticket (`ready-of-a-ticket-not-in-draft`,
naming its status), or when any is incomplete (`incomplete-tickets`, naming each ticket and its gaps):

- `acceptance-unnumbered` when its `## Acceptance` holds no numbered item, read as a landing reads it;
- `brief-missing` when it has no `## Brief` holding a non-blank line.

In a forge with entities, a draft or a ticket in `ready-for-review` with no `entity` is refused at exit 1 with nothing
written (`ticket-without-entity`, naming each such ticket), since each ticket builds in the pipeline of its entity. The
Board refuses it on every way to `committed`: `ticket submit` and `intake close` with ticket review off, and a worker's
finding, refuse it too. A forge without entities readies as before. The Playbook launches no committed ticket without an
entity on a pipeline with entities (E94).

In a forge with entities, a draft whose `## Brief` names work outside its entity is refused at exit 1 with nothing
written (`work-outside-entity`, naming each such ticket and path). The work is each path with a folder on the Brief's
`Work belongs in:` line and the lines that continue it. A path is inside when the entity owns it, a package that the
entity whitelists owns it, or it is in the entity's `reach`. `ticket submit`, `intake close` and a worker's finding
refuse it too, with ticket review on or off. A need's ticket, which Hephaestus files for the entity the need names, is
not read.

Only `ticket unready` returns a ticket to `draft`, and a draft ticket moves on only through `ticket ready`,
`ticket submit`, `intake close` or `ticket abandon`. It also readies a ticket in `ready-for-review`: that is User's
ticket review, and no role an agent runs under may relay it. A ticket in `ready-for-review` moves on only through
`ticket ready` or `ticket abandon`; every other move, `ticket status` included, is refused
(`move-of-a-ticket-ready-for-review`), and no move reaches `ready-for-review` (`move-to-ready-for-review`). `--json`
prints the ticket, or with several ids the list.

#### `ticket unready`

Puts a committed ticket back into `draft`, where its title and body are edited; it is the only way back, since `ticket
status` refuses a move to `draft` (`move-to-draft`). The ticket loses its row and its `contentHash`, its `updated` is
stamped, and `Ticket #003 unreadied` is logged; its priority, entity, group, epics, dependencies and hold stay. It
prints `Ticket #003 is a draft again` and how to edit and commit it; `--json` prints the ticket. It is committed again
as any draft is: User's `ticket ready`, which is itself the review, or a filer's `ticket submit`, which stops at
`ready-for-review` while ticket review is on. Refused at exit 1 with nothing written:

- a ticket that is not committed (`unready-of-a-ticket-not-committed`): a draft or a ticket ready for review is edited
  as it is, and a ticket past committed has its work stopped and is reopened first;
- a committed ticket while the board holds a job of it (`unready-of-a-ticket-with-a-job`): a build job is `launching`
  while its ticket is still committed, so the job is stopped first.

Only User runs it: no role an agent runs under may relay it, and `POST /api/commands` does not accept it.

#### `ticket network`

The log line reads `Ticket #003 network: api.example.com` or `Ticket #003 needs no network`. Refused at exit 1 with
nothing written:

- a ticket that is not a draft ticket or committed (`network-of-a-ticket-past-committed`);
- any domain that is not public, naming each (`network-domain-not-public`): a loopback name (`localhost`, a name under
  `.localhost`), a `.local` name, an IPv4 literal in a loopback, private, link-local or shared range, an IPv6 literal
  outside global unicast, a single label or malformed text;
- the same list, or a clear of a ticket with none (`network-unchanged`);
- domains beside `--clear`.

#### `ticket entity`

The product owner runs it: under its job on its own draft ticket at intake, or on any ticket ready for review or
committed, its job stamped by Hephaestus; any other role is refused, and a request naming a job is refused
`hatch-identity-mismatch`. Outside a job, User's own command line runs it. No client's command sends it. The log line
reads `Ticket #003 belongs to entity web: <reason>`, its record `{entity, reason, by}` with `by` `product-owner` or
`user`. Refused at exit 1 with nothing written:

- a key the pipeline's entities do not name, naming the keys it does, or any key in a forge without entities
  (`unknown-entity`);
- a ticket that is not a draft ticket, ready for review or committed (`entity-of-a-ticket-past-committed`);
- the entity the ticket already has (`entity-unchanged`);
- a blank reason (`entity-without-reason`); no `--reason` at all is refused by the usage;
- under a product owner's job, a ticket that is neither its own draft ticket nor ready for review or committed
  (`not-own-draft-or-unclaimed-ticket`).

#### `ticket release-of`

Only an open marked ticket, neither delivered nor abandoned, is the group's release ticket: a settled one's mark is
history, so the group has none, and no release bundle, until another is marked.

- Its **release bundle** is the ticket plus every ticket of the same group it depends on, transitively, following no
  dependency outside the group. The group's other tickets are not in it.
- The mark is stored as the frontmatter's `releasesGroup: true` on that ticket alone. `--clear` removes the key, leaving
  the file as though it had never been set. One log line either way.
- Refused at exit 1, writing nothing: a ticket with no `group`; another open ticket of the group, or this one, already
  its release ticket; a delivered or abandoned ticket; and `--clear` on a ticket not marked.
- A delivered or abandoned ticket keeps its mark. A move that takes it back to an open status (`ticket reopen`, or
  `ticket status`, which skips the move matrix but not this rule) is refused at exit 1, writing nothing, while another
  open ticket of its group carries the mark. With none, the move is made and the ticket is the group's release ticket
  again.
- `--json` prints the ticket.

#### `ticket depends`

- The human line names what a replace dropped, `Ticket #459 waits on #473 (dropped #463)`, and each dropped ticket not
  yet reviewed or delivered gets a line of its own, `#463 is still open: #459 may now start before it`.
- `--add` keeps an id already there. `--add` or `--remove` beside bare ids, or the two together, is refused as ambiguous
  at exit 1.
- `--json` prints the ticket with `added` and `dropped`, the ids the change put in and took out.
- A ticket that does not exist, or a list that would make tickets wait on each other in a circle, is refused.
- Until every one is reviewed or delivered, the ticket's row, table entry and card read "waiting on #003", and
  `ticket list` says so too. An abandoned dependency does not settle it.

#### `ticket abandon|reopen`

- [Ticket moves and their rows](#ticket-moves-and-their-rows) says which status each verb moves from.
- A move to the status the ticket already has is refused and logs nothing.
- Every move out of in-review finishes and delivers the ticket's in-progress review bar, with one log line each.
- A move to in-progress (`ticket status <id> in-progress`) warns on standard error, and still moves it, when the ticket
  is held or waiting on a dependency.
- `--branch` and `--commit` record where the work landed.
- `--tokens` replaces the row's figure, and on a ticket with no row (a low one never started) is refused at exit 1.

### Epics

An [epic](glossary.md#epic) is a larger feature tickets are grouped under, for reading: it has no lifecycle, and its
progress is its tickets'. It never affects launching, concurrency or release; `group` is the integration mechanism. A
ticket belongs to any number of epics through `ticket epic` or `ticket add --epic`.

| command | what it does |
|---|---|
| `epic add <key> "<title>" [--body <markdown>] [--body-file <path\|->] [--at <when>] [--json]` | Write `<data>/epics/<key>.md` with the key, the title and an [epic colour slot](glossary.md#epic-colour-slot), 1 to 6, then the description from `--body` or `--body-file` (`-` reads standard input), kept byte for byte. One log line; [the rules](#epic-add) are below. |
| `epic edit <key> [--title "<title>"] [--append] [--body <markdown>] [--body-file <path\|->] [--at <when>] [--json]` | Change the title, replace the description, or with `--append` add to its end as `ticket edit` does. One log line; an edit that changes nothing writes and logs nothing and exits 0; an empty replacement or `--title`, none of `--title`, `--body` and `--body-file`, or both body options are refused at exit 1. |
| `epic list [--json]` | Every epic, ordered by key, with its roll-up. |
| `epic show <key> [--json]` | One epic: its roll-up and its description. |
| `epic remove <key> [--at <when>] [--json]` | Delete the epic's file, with one log line. Refused at exit 1 while any ticket, of any status, names it. |

#### `epic add`

The key is lower-case letters and digits in words joined by single hyphens, and not a device name Windows reserves
(`con`, `prn`, `aux`, `nul`, `com1` to `com9`, `lpt1` to `lpt9`), the same rule on every OS, since the key is the
file name `<key>.md`. A malformed key, a key already taken, one
whose file exists but cannot be read as an epic, or `--body` and `--body-file` together is refused at exit 1 with
nothing written. The epic colour slot is the one the fewest epics use, the lowest on a tie; it is stored, never
reassigned.

#### The roll-up

The Board computes it, and it is the same in `epic list --json`, `epic show --json`, `status --json`'s `epics` and the
served board facts: `{ key, title, slot, ticketIds, ticketCountByStatus, tokens, span }`.

| key | value |
|---|---|
| `ticketIds` | Every ticket naming the epic, in id order, in whichever place of its list. |
| `ticketCountByStatus` | Those tickets per ticket status, every status present. |
| `tokens` | Each ticket's own row and its review rows added up, a row without a figure counting nothing. |
| `span` | `{ start, end }` over the same rows, from the earliest start to the latest end, ordered by instant and printed as stored. `end` is null while one of them that started has not ended, and `span` itself null while none has started. |

### Drafts

A [filing draft](glossary.md#filing-draft) is the working record a filing session builds its tickets from, never a draft
ticket: it has no status, row or move, and touches no job. Its file, `<data>/filing-cabinet/D<n>.json` (see [Files on
disk](#files-on-disk)), holds everything a rebooted session needs to resume. Ids are `D1`, `D2`, …, from the stored
`nextDraftId`, never reused, not after a close or an abandon. Every move logs one line. Only `draft claim` checks who
holds a filing draft; no other `draft` command looks at the claim.

| command | what it does |
|---|---|
| `draft open "<title>" --owner <who> [--request <text>] [--request-file <path\|->] [--json]` | Write the next `D<n>.json` with the title, the request from `--request` or `--request-file` (`-` reads standard input), kept byte for byte, and the claim held by `<who>`; the first one makes the folder and stores `nextDraftId`. Prints the id; `--json` prints the stored filing draft. A missing title or `--owner`, both request options, or a malformed file already at the new id's path is refused at exit 1 with nothing written. |
| `draft claim D<n> --owner <who> [--force] [--json]` | Take the claim. Refused at exit 1 with nothing written while another owner holds it, unless `--force`, whose log line names the owner it took the filing draft from; how long ago it was claimed is never judged. A claim the owner already holds writes and logs nothing. `--json` prints the stored filing draft. |
| `draft release D<n> [--json]` | Drop the claim, as a session ending with work left does. Releasing an unclaimed filing draft writes and logs nothing. |
| `draft note D<n> "<text>" [--assumption] [--json]` | Add a research fact, its paths written in the text, or with `--assumption` an assumption, as the next note `N<k>`. A blank text is refused at exit 1. `--json` prints the stored filing draft. |
| `draft ask D<n> "<question>" --context <text> --option <text> --option <text> [--option …] --recommended <letters> [--multiple] [--under Q<k>] [--json]` | Add the next question `Q<k>`, its options lettered `a` to `d` in the order given. `--multiple` makes it multi-select, and `--recommended` names one letter or, on a multi-select question, several comma-separated (`a,c`). `--under` makes it a follow-up of an existing question, at any depth and whatever that question's answer. [Its refusals](#draft-ask) are below. |
| `draft answer D<n> Q<k> "<answer>" [--json]` | Record the answer. A comma-separated list of option letters (`a`, `a,c`) chooses those options; anything else is free text, never both. Several letters on a single-select question, or a letter outside the options on either kind, is refused at exit 1 with nothing written, and so is a question the filing draft does not hold. Answering again overwrites the answer: the filing draft keeps only the current one, the log every one. Needs no claim, so a client or any session may answer; the later write wins. |
| `draft drop D<n> N<k>\|Q<k> [--json]` | Remove a note or question made moot; dropping a question drops its follow-ups too, logging one line each. An item the filing draft does not hold is refused at exit 1. |
| `draft close D<n> --tickets <ids> [--json]` | End a filing draft once its tickets are filed: remove its file and log the ticket ids it became. `<ids>` are comma- or space-separated ticket references (`5`, `#005`); one that names no ticket is refused at exit 1 with nothing written, and so is no `--tickets`. While any question is unanswered, follow-ups included, it is refused at exit 1 with nothing written, naming the open question numbers in number order. A filing draft with no question closes at once, so a simple request goes open, note, tickets, close in one run. |
| `draft abandon D<n> --reason <text> [--json]` | Remove the filing draft's file, logging the reason. Refused at exit 1 without `--reason` or with a blank one. |
| `draft show D<n> [--json]` | One filing draft: its title, claim, state, request, notes and question tree. `--json` prints the whole stored filing draft. |
| `draft list [--json]` | Every open filing draft, ordered by id; `--json` prints their stored documents. |

#### `draft ask`

Refused at exit 1 with nothing written: fewer than two or more than four options, a blank question or `--context`, no
`--recommended`, a recommended letter outside the options, several on a single-select question, or a `--under` question
the filing draft does not hold.

#### Ids and states

An id that is not `D` and a number, or names no open filing draft, is refused at exit 1. A filing draft numbers its
notes `N1`, `N2`, … and its questions `Q1`, `Q2`, …, each from its own stored counter, never reused, not after a drop. A
question is open while it has no answer.

Each open filing draft has a derived state, which no clock decides:

| state | when |
|---|---|
| `waiting` | any question is open, claimed or not |
| `researching` | none is open and the filing draft is claimed |
| `resumable` | none is open and nobody holds the claim |

Both `status --json` documents carry `drafts` after `epics`:
`{ id, title, claimOwner, openedAt, state, openQuestionCount, questions }` for every open filing draft ordered by id,
`claimOwner` null while unclaimed, `questions` the stored question tree, an empty list when there is none.

### Concurrency and gates

Hephaestus gates a tree by running the prepare steps, then each [gate](glossary.md#gate) of one phase in that
phase's run order, the first red gate stopping the rest. Each place a tree is gated runs one phase:

| where | phase |
| --- | --- |
| a build job's worktree | `build` |
| the merge of the target into a branch before its review ([A review job](#a-review-job)); a red gate or a conflict there goes back to the builder | `build` |
| a review job's worktree | `review` |
| the merge of the target into the worktree before User's Merge, with merge approval on ([Merge approval](#merge-approval)) | `review`, or `build` with no review phase |
| an Airlock's merged tree | `merge` |
| a stale green, gated again with no slot held | the row's `greenPhase` (with none: `review` with a review phase, `build` without one) |

A phase with no gates passes at once and runs no prepare step. A gate passes only when it exits 0 and leaves every
tracked file as it was. Exit 126 or 127, or a signal, is `gate-cannot-run`. A prepare step fails when it does not
exit 0, or when it exits 0 but changes a tracked file; its output is then the diff of that change. A failed prepare
step is a setup failure, never a red gate, so no gate is blamed for it. Hephaestus never runs a gate's `fix`. Customs
and a worker's sandbox read every gate, whatever phases run it.

A job's gate run starts by writing its manifest, `<data>/jobs/<J>/gate-run.json`, atomically: `{ phase, phaseHash,
prepare, gates }`, the phase, that phase's hash, and the prepare steps and gates it runs in order, as the pipeline held
them then. A session resumed after a red handoff runs again under `gate-run-<instance>.json`, the merge before review
under `target-gate-run.json`, and the merge before User's Merge under `main-gate-run.json`
(`main-gate-run-<instance>.json` in a later round). The run reads only its manifest and never rewrites it: each step's
child folder is named by its position there, so a pipeline edited or reordered mid-run changes no step and passes no
gate that did not run. A step's kept verdict (`<folder>-verdict.json`) counts only on the same tree under the same phase
and hash. The settlement records the manifest's phase and hash on the row, so a green the pipeline changed under is not
current and the ticket is gated again: such a passing review waits unqueued for its next review, and without a review
phase such a build waits unqueued for that gate run. A manifest that cannot be read is never replaced: the run ends
`gate-cannot-run`. An Airlock's merged tree and a stale green are gated from one read of the pipeline, and record that
read's phase and hash in the same way.

A line is stored for the machine that runs it, in that machine's grammar, which `gate add` in `help` names. On macOS
and Linux, `/bin/sh` joins standard error onto standard output and runs the line in the user's `SHELL`. On Windows,
cmd.exe runs it as `cmd.exe /d /s /c "(<line>) 2>&1 & call echo %^errorlevel%>"<status file>""`, the line's own
argument handed over unquoted, from the absolute `ComSpec` or else `SystemRoot`'s `System32\cmd.exe`; with neither,
or with the repository on a network share (`\\server\share`), the line is refused as `sandbox-unavailable` and does
not run. Bun keeps only the low byte of a Windows exit status, so the trailer writes the whole status to a file beside
the step: 0 passes, 9009 (command not found) or an NTSTATUS from `0xC0000000` up is `gate-cannot-run`, any other
fails. With no status written, a non-zero exit fails and exit 0 is `gate-cannot-run`, so a status nobody read never
passes. `gate add` and `gate prepare` refuse a line over 8191 characters on Windows at exit 1, storing nothing.

On Windows a gate gets no grace and must tolerate a hard stop: a child with no console cannot be asked to stop, so a
stop waits out the grace and then ends the gate's whole process tree through `taskkill`. Talos records that end
as `signalled`, `SIGKILL`, so a stopped gate is `gate-cannot-run`; a kill from anything else, such as Task Manager,
reads as exit 1. The tree is walked through parent ids from the leader while it lives, so a member whose parent died
before the first listing is out of reach, as it is on POSIX.

| command | what it does |
|---|---|
| `concurrency [<n>] [--json]` | Print how many agents may be in flight at once, or store a new limit for every worktree: a whole number from 1 to 10. A higher one is refused at exit 1 with nothing written, and one an older tracker stored above 10 reads as 10. A tracker that never set one reads 2. A limit below the agents already in flight is accepted and leaves no free launch slot. A launch slot is a build or review job; [below](#launch-slots) says what counts. `--json` prints `{ limit, agentsInFlight, freeSlots }`, after a change as well. |
| `machine limit [<n>] [--json]` | Print the machine agent limit: how many build and review jobs may run at once across every board of this user on this machine, at most the number of CPUs the runtime reports, which it is when none was set. With `<n>`, store a new one in `<monitor>/machine-limits.json`, `{ version: 1, agentLimit }`, which every Hephaestus reads at its next launch; a value above the CPU count is refused `machine-agent-limit-above-cpus` at exit 1 with nothing written, and a stored value above it reads as the CPU count. Lowering it stops no job in flight. Every Hephaestus claims a slot file in `<monitor>/agent-slots/` before it launches a build or review job, and a ticket that finds none stays ready and is tried again at Hephaestus's next sweep; a slot whose Hephaestus is gone is taken over by the next claim, and a job that outlived its Hephaestus's restart keeps its slot under the new Hephaestus. `--json` prints `{ answerVersion, limit, ceiling, agentsInFlight }`, after a set `{ answerVersion, outcome, limit, ceiling }`. A live Hephaestus takes the same change as the control command `machine-agent-limit-set`. |
| `machine agent [<path>] [--json]` | Print this machine's program of the agent this program runs, which every forge whose agent follows the machine starts, and the places the agent's installers put it, each found or not. With `<path>` (a relative one is taken from the current folder), run that program once with the agent's version arguments, bounded by `AGENT_PROGRAM_CHECK_TIMEOUT_MILLISECONDS` (10 s), and store it in `<monitor>/config.json`, `{ "version": 1, "agents": { "<vendor>": { "programPath": "<path>" } } }`, kept as the path names it, a link never resolved, every other key of the file kept. A program that is not there, cannot run, fails, outlives the bound or answers as another program is refused `agent-program-does-not-run` at exit 1 with nothing written; a newer or malformed file is never written over (`machine-config-unwritable`). `--json` prints `{ answerVersion, vendor, programPath, places }`, after a set `{ answerVersion, outcome, vendor, programPath }`. A live Hephaestus takes the same change as the control command `machine-agent-program-set`. No role an agent runs under may run it. |
| `gate list [--json]` | Print the board's gate pipeline, stored in `<data>/pipeline.json` beside `progress.json`, never tracked and never inside a branch. Read-only, no lock. The text names the phases of a gate that runs in only some (`lint (runs in merge): bun run lint`); a gate with none runs in every phase. `--json` prints `{ pipelineIsSet, contentHash, phaseHashes, version, prepare, gates, phases }`, with `review`, `airlock`, `constitution` (`{ path }`), `agents` (settings per role) and `approvals` when stored; with no pipeline `pipelineIsSet` is `false`, `contentHash` and `phaseHashes` `null`, both lists empty, and `version` and `phases` absent. [The hashes](#the-pipeline-hashes) are below. A malformed file is refused at exit 1 with its reason, and an older one (`older-pipeline`) with the advice to set the pipeline up again. |
| `gate prepare <name> [--in <folder>] [--json] -- <command>` | Set the prepare step `<name>`, which prepares a fresh worktree before a gate, with one log line (`Prepare step <name> set to <command>`, kind `pipeline-prepare-step-set`); a step of the same name is replaced where it stands. `--in` names the folder it runs in, as a gate's `--in` does. The steps run in order, with the network, before the gates. On a board with no `pipeline.json` this also stores an empty gate list, so tickets land ungated until a gate is added. |
| `gate add <name> [--fix "<command>"] [--in <folder>] [--defined-by <pattern>]… [--network <domain>]… [--writes <path>]… [--forge-only] [--phases <phase>,…] [--json] -- <command>` | Add the gate `<name>`, run after the others in every phase, or replace a gate of the same name where it stands, keeping its phases, with one log line (`Gate <name> set to <command>`, kind `pipeline-gate-added`). `--phases`, a comma-separated list of `build`, `review` and `merge`, each once, sets the phases the gate runs in instead: it keeps its place in a phase it already ran in, runs last in a phase it joins and leaves the others. An unknown or repeated phase is refused at exit 1 with nothing written. The gates run in order through this machine's shell (Hephaestus's `SHELL`, or cmd.exe on Windows) in the worktree, `--in` a folder of it, each sandboxed with its own `--writes` folders and the network on when it names a `--network` domain, off otherwise; [the options](#gate-add) are below. |
| `gate order build\|review\|merge <name>… [--json]` | Set the run order of the gates a phase runs, with one log line (`Gates of the merge phase ordered: <names>`, kind `pipeline-gates-ordered`). Name each gate the phase runs once and no other: a gate joins or leaves a phase only through `gate add --phases`, so no gate is left in no phase. An unknown gate (`unknown-gate`) or any other list (`phase-order-not-a-reorder`) is refused at exit 1 with nothing written. |
| `gate none [--json]` | Store an empty gate list and empty phases on purpose, with one log line (`No gates, on purpose`, kind `pipeline-gates-none`). Unlike no `pipeline.json` at all, which opens the `checks-not-set` decision and holds new work, it counts as set, and a landing runs no gate. |
| `gate remove <name> [--json]` | Remove the gate `<name>` from the gates and from every phase, with one log line (`Gate <name> removed`, kind `pipeline-gate-removed`); an unknown name is refused at exit 1 with nothing written (`unknown-gate`). |
| `gate approval tickets on\|off [--json]` | Switch ticket review, stored as `approvals.tickets` in `pipeline.json`, with one log line (`Approval tickets set off`, kind `pipeline-approval-set`). On, as with no `approvals` key, a filer's closed draft waits in `ready-for-review` until User runs `ticket ready`; off, `ticket submit` and `intake close` make a complete draft `committed` at once. Any other approval or switch word is refused at exit 1 with nothing written, and so is a board with no `pipeline.json` (`approval-without-pipeline`), since a file holding only the switch would read as no gates on purpose. No role an agent runs under may relay it. |
| `gate approval merge on\|off [--json]` | Switch merge approval, stored as `approvals.merge` in `pipeline.json`, with one log line of kind `pipeline-approval-set`. Off, as with no key, the Airlocks work as without it. On, on every target (the main line, each group integration and the group release), a ticket in review done waits for merge until User runs `merge accept`: see [Merge approval](#merge-approval). Refused as `gate approval tickets` is. |
| `gate assistant on\|off [--json]` | Switch the board's [Assistant](#the-assistant), stored as `assistant: true` in `pipeline.json` while on and as no key while off, with one log line (`Assistant set on`, kind `pipeline-assistant-set`). A new board has it off. On, the next pass boots an Assistant. Off, no pass boots one; a live one is asked to wind down in the same hold (`job-stop-requested`, mode `wind-down`), finishes its turn and ends `closed`, and every open incident takes its default with the cause `assistant-off`, one delivered in a turn still open once that turn closes. A wind-down once asked stands when the switch goes on again: that Assistant ends, and the next pass boots a fresh one. One that is interrupted or quiet while it winds down ends `closed` too, never a failed boot. Where the `assistant` key leaves `pipeline.json` another way, the next pass asks a live Assistant to wind down the same way. Any other switch word is refused at exit 1 with nothing written, and so is a board with no `pipeline.json` (`assistant-without-pipeline`). A pipeline with entities takes it. It prints what `gate approval` prints. No role an agent runs under may relay it. |
| `gate reach <path>…\|none [--json]` | Store the repository paths besides the project that a ticket may change as `reach` in `pipeline.json`, with one log line (`Reach set to <paths>`, kind `pipeline-reach-set`). Each path starts with `/`, the repository's root, and holds no `..` or backslash; `none` clears the list. A path named twice is refused at exit 1 with nothing written, and so is a board with no `pipeline.json` (`reach-without-pipeline`). No role an agent runs under may relay it. |
| `gate agent machine\|<path> [--json]` | Set the board's agent, stored as `agent` in `pipeline.json` (`pipeline-agent-set`), with one log line (`Agent set to <vendor>, the machine's program`, kind `pipeline-agent-set`): `machine` follows this machine's program of the agent (`machine agent`), and a path pins that program to this board. The program runs once first, as `machine agent <path>` runs it, and one that does not run is refused `agent-program-does-not-run` at exit 1 with nothing written. An open setup record takes the same agent. With no `pipeline.json`, an open setup record alone takes it; with neither it is refused `agent-without-pipeline`. Every job that [stood not launched](#a-launch-that-is-not-launched) launches again. No role an agent runs under may run it. |
| `gate tools <name>[=<path>]…\|pipeline [--json]` | Store the programs whose folders an agent's search path holds as `tools` in `pipeline.json` (`pipeline-tools-set`), with one log line (`Tools set to <paths>`, kind `pipeline-tools-set`). A name alone is found in the places installers put programs on the OS (the `ProgramFolders` port), in order. On macOS: `~/.bun/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, nvm's newest node, then `/usr/bin`, `/bin`, `/usr/sbin`, `/sbin`. On Linux: `~/.bun/bin`, `/usr/local/bin`, `~/.local/bin`, `/home/linuxbrew/.linuxbrew/bin`, `/snap/bin`, nvm's newest node, then the same four. On Windows: `%USERPROFILE%\.local\bin`, `%USERPROFILE%\.bun\bin`, `%APPDATA%\npm`, `%LOCALAPPDATA%\Microsoft\WinGet\Links`, `%ProgramFiles%\nodejs`, `%ProgramFiles%\Git\cmd`, then `System32`, the system root, `System32\Wbem` and `System32\WindowsPowerShell\v1.0` under `%SystemRoot%`. One found nowhere is refused `tool-not-found`. `pipeline` removes the key, so the tools follow the pipeline again. Refused with no `pipeline.json` (`tools-without-pipeline`). No role an agent runs under may run it. |
| `gate look-again [--json]` | Launch again every job that stood not launched for its agent's program (`agent-look-again`), each logged `job-launch-retried`. From a client the forge also runs its program once more, so the views read whether it runs now. No role an agent runs under may run it. |
| `gate retry <J> [--incident <I>] [--json]` | Settle job `J`'s `gate-cannot-run` or `sandbox-unavailable` incident (`incident-handled`): a merge job's [Airlock](glossary.md#airlock) gates its merged tree again on the next sweep, and an ended build's ticket is free for its next attempt. Without `--incident` it takes `J`'s one open incident that allows it; with none there is nothing to do. |

Every `gate` write (`prepare`, `add`, `order`, `none`, `remove`, `approval`, `assistant`) takes the lock, writes
`pipeline.json` atomically after `progress.json`, is accepted with tickets in flight and refuses a malformed or an older
`pipeline.json` at exit 1 rather than overwrite it. On a pipeline with entities every write but `gate approval` and
`gate assistant` is refused at exit 1 with nothing written (`pipeline-set-per-entity`): each entity holds its own
prepare steps, gates and reach, which the pipeline builder sets. On a board with no `pipeline.json` it starts from the
minimal pipeline, with no gates. A ticket's row records the phase it was gated in (`greenPhase`) and that phase's hash
(`pipelineHash`) at its next gate run, as the run read the pipeline at its start. `--json` on these writes prints
`{ pipeline, contentHash, phaseHashes }`.

#### The pipeline hashes

`gate list --json` and the `gate` writes print two kinds of hash of the stored pipeline, each 16 hex digits of a 64-bit
FNV-1a hash over a canonical form, so key order and a gate list option written out empty change neither.

- `contentHash` covers every key but `billing`: the steps, gates, phases, review, merge train, constitution, agent
  settings and approvals. Any change but a billing change moves it.
- `phaseHashes` holds one hash for each of `build`, `review` and `merge`: the prepare steps and the gates of that phase
  in run order, every gate option filled. It moves only when a prepare step or that phase's gates or their order change;
  agent settings, instructions, the constitution, re-review, approvals and billing leave it as it was.

A row's `pipelineHash` is the phase hash of its `greenPhase`, taken at its last gate run. A green is current in a phase
while the row has a `greenPhase` and its `pipelineHash` equals that phase's hash now: an edit outside a phase's prepare
steps and gates never makes a green stale. A row with a `pipelineHash` and no `greenPhase` has no current green, so
Hephaestus gates its ticket again.

On a forge with entities the row also holds `pipelineHashes`: the phase hash of each entity whose gates the run ran, by
entity key, as that entity's own pipeline hashes it. `pipelineHash` stays the forge's own phase hash. A green is current
only while every entity it names keeps that hash, and a row without `pipelineHashes` has no current green. The merged
tree runs the gates of the landing's entities: each entity whose paths the fast-forward changes, each entity that
consumes one of them, and every entity for a path the root owns. A stale green is gated again by its ticket's own
entity. Each entity's prepare steps and gates run from its first home folder; an `in` leading with `/` is the
repository's root. The branch's own tree lands without a gate run only when its green also names every entity of the
landing's gate set. A forge without entities never writes `pipelineHashes`.

#### `gate add`

`--defined-by` names the files that define the gate, as git pathspec-style globs. Hephaestus's check V11 refuses a job
(`checks-definition-changed`) when a commit in its range changes a matching path its ticket body does not name. A merge
of the job's target brings the target's commits into that range, so a definition file another ticket landed fails each
live job that merges the target after it; a fresh attempt started after the merge passes. An instruction file counts
only where the branch changed it itself ([instruction file](glossary.md#instruction-file)).

- `*` and `?` stay inside one folder, and `**` crosses folders.
- A pattern without an inner `/` matches its name at any depth; one with an inner `/` is anchored at the repository
  root.
- A trailing `/` takes a folder's whole content.

`--network` turns a gate's network on or off: on when the gate names a domain, off when it names none. The domains do
not limit where an on network reaches. Off still leaves loopback (`127.0.0.1`, `::1`), so a test may serve and fetch on
it, and means a different thing on each OS:

- On macOS (Seatbelt) the gate can connect to loopback only, which includes any service of the machine listening there.
- On Linux (bubblewrap) the gate gets its own network namespace: it can reach its own loopback, but no host service and
  nothing outside. A Linux gate also runs read-only outside its writable folders, in its own pid namespace with a fresh
  `/proc`, and from bubblewrap 0.8.0 it cannot make a user namespace of its own, so a test that needs nested
  namespaces fails there. Where `bwrap` is missing, or the kernel or a container blocks its namespaces (as Ubuntu
  24.04's `kernel.apparmor_restrict_unprivileged_userns` can), the line is refused as `sandbox-unavailable`.

`--writes` names a folder a gate and a prepare step may write besides the worktree, its git admin folder and temp,
absolute on any OS (`/`, a drive or a share) or home-relative (`~/` or `~\`).

- A relative one, or one that is, sits in or holds a folder of executables or a folder on Hephaestus's `PATH`, is
  refused at exit 1 with nothing written. A folder of executables is a `bin`, on Windows also a `Scripts` or a folder
  holding a `.exe`, `.cmd`, `.bat` or `.ps1` file; names compare without case on macOS and Windows.
- One that became so after it was stored, or one absolute only on another OS, is left out of the gate's and the
  worker's profile.
- Whatever is stored, the `bin` beside each of its ancestors is not writable.

What a session receives:

- A builder or reviewer gets every gate's `--network` and `--writes` in its own sandbox, on macOS and Linux; on
  Windows no sandbox runs, as the table below says.
- It may run unasked the first word of each command in the gate and prepare lines, beside the git verbs it reads and
  commits with. On macOS and Linux a line splits outside quotes on `&&`, `||`, `;`, `|`, `&`, a newline and
  parentheses, past a leading `NAME=value`; on Windows outside double quotes on `&&`, `||`, `&`, `|`, a newline and a
  group's parentheses, a `^` escaping the next character. An `&` inside a redirection such as `2>&1` splits nothing.
- A `--forge-only` gate gives it none of these, since only Hephaestus runs it.
- On Linux a worker's ref protection is `packed-refs` and the loose refs present at launch of the targets and of the
  ticket branches a worktree holds, with check V14 for any other ref; a Linux worker commits unsigned.
- Every session, whatever its role, may not read `~/.ssh`, `~/.aws`, `~/.netrc`, `~/.git-credentials`, Claude Code's
  `<config folder>/.credentials.json` and `~/.config/anthropic`. On Windows only the Read tool is denied them.
- A worker signs its commits through the gpg-agent and keyboxd sockets `gpgconf --list-dirs` names, with GnuPG's home
  readable and its `private-keys-v1.d` denied. With no gpgconf, or no agent socket, it commits unsigned and GnuPG's
  home is denied whole; a repository that sets `commit.gpgsign` then gets one log line per launch saying so.
- `--fix` is named in the builder's first message, to run before fixing by hand; Hephaestus never runs it.

Which guarantees hold for a session, per OS. Windows has no native sandbox, so every session there, whatever its role,
runs unconfined by design in its working directory, the same answer `GateConfinement` gives its gates:

| Guarantee | macOS | Linux | Windows |
| --- | --- | --- | --- |
| The session's sandbox starts, or the session does not run | yes, `failIfUnavailable: true` | yes, `failIfUnavailable: true` | no: the settings carry no `sandbox` key |
| A shell command writes only the worktree, the Hatch folder and the `--writes` folders | yes, Seatbelt | yes, bubblewrap | no: only the Edit and Write permission rules hold |
| A shell command reaches only the allowed network domains | yes | yes | no: only `WebFetch` is checked, by the guard hook |
| A session cannot move a target or another ticket branch | yes, denied in the sandbox | the refs present at launch, as above | no: Customs and V14 find a moved ref afterward |
| A session cannot write another job's Hatch folder | yes | yes | no: the Bouncer takes a job's identity from its folder |
| A session cannot read the credential files above | yes | yes | only through the Read tool |
| The prompts say a sandbox refuses a move | yes | yes | no: they give the same rules without that claim |

> **As built.** Gate network and sessions' writes are weaker than stated: the gate network is unfiltered, and gate
> writes are unchecked for sessions.

#### Launch slots

`status`, the Next line, `concurrency`, the served board state and Hephaestus's launch gate read one count: the live
`build` and `review` jobs (`LaunchSlotUtil`). A job keeps its launch slot in every state, waiting for an answer and
interrupted included. Merge, merge-agent, refresh, Assistant, product-owner and pipeline agent jobs take none, and the
kind decides, never the role: a merge agent runs as its ticket's last worker or as a conflict re-reviewer and still
takes none. No row takes a launch slot: a `task add --start` row or a review bar with no live job counts nothing.

In a forge with entities, an entity's `concurrency` in `pipeline.json` caps its own launch slots under the board's
limit, which stays the `concurrency` setting. The cap counts the live `build` and `review` jobs whose `entity` is that
entity, whatever ticket they serve, so a package stage's job counts against the package. A ticket whose entity is at
its cap waits, and the free slot goes to the next ticket of another entity. An entity without a `concurrency` has the
board's limit alone.

### Pipeline setup

The `pipeline` verbs are User's moves on the [pipeline setup record](#datapipeline-setupjson). Each one is one control
command, applied in a hold, with Hephaestus up or down; a client's setup controls send the same commands. Every verb
takes `--json`, which prints `{ setup, logged }`: the record as the move left it and the log records it wrote. A setup,
question and edit id is read in either case (`s1`, `S1`).

| command | what it does |
|---|---|
| `pipeline setup [--billing subscription\|api] [--max-budget-usd <n>] [--agent machine\|<path>] [--replace-unreadable] [--json]` | Open the record of a first setup (`pipeline-setup-start`), logged `pipeline-setup-opened`, at the agent step with the billing step done, billed by subscription unless `--billing api` says otherwise, with an optional cap. No pipeline agent launches before the agent step is done: its Continue launches the record's [pipeline agent](#advise) in the same hold, `launching`, billed as the record says, and the record names it as `agentJobId`. With `--agent`, as `pipeline agent` names one, or a client's `pipeline-setup-start` carrying its `agent`, the program runs once first: then the record opens at the research step with the agent step done, and its pipeline agent launches at once. `--replace-unreadable` lets its Apply write over a `pipeline.json` the board cannot read. When main holds a `CONSTITUTION.md`, the record's constitution starts from it byte for byte, its `baseBlob` main's blob id of that file, with the sources of [`constitution-sources.json`](#dataconstitution-sourcesjson) only when they were stored for that same blob; a main whose `CONSTITUTION.md` git cannot read is refused `main-constitution-unreadable` at exit 2. Refused `setup-in-progress` beside an open record. |
| `pipeline update [--json]` | Open an update record on the stored pipeline (`pipeline-update-start`): its draft is the stored pipeline, billed as it is, at the design step, with no agent until `pipeline resume` asks for one. Its constitution starts from main's `CONSTITUTION.md` byte for byte (empty when main holds none, as a main line with no commit yet does), its `baseBlob` main's blob id of that file, with the sources of [`constitution-sources.json`](#dataconstitution-sourcesjson) only when they were stored for that same blob. An older or malformed `pipeline.json` is refused with its own reason, and no pipeline as `no-pipeline-to-update`; a main whose `CONSTITUTION.md` git cannot read is refused `main-constitution-unreadable` at exit 2. |
| `pipeline billing <S> subscription\|api [--max-budget-usd <n>] [--json]` | Change the record's billing (`pipeline-setup-billing`), logged `pipeline-setup-billing-set`. A cap of 0 or below is refused `billing-cap-not-positive`. |
| `pipeline agent <S> machine\|<path> [--json]` | Choose the agent the record's pipeline agent runs on and Apply stores (`pipeline-setup-agent`), logged `pipeline-setup-agent-set`: `machine` follows this machine's program, a path pins one to this forge. The program runs once first, as `machine agent <path>` runs it; one that does not run is refused `agent-program-does-not-run` at exit 1 with nothing written. It moves no step; every job that stood not launched launches again. No role an agent runs under may run it. |
| `pipeline continue <S> <step> [--json]` | User's Continue (`pipeline-setup-step`): the current step is done and the next opens, logged `pipeline-setup-step-moved`. On a step that needs a recheck it is the only way out. A first setup opens past billing, so `billing` is current only in a record a reopen left there. The `agent` step's Continue is refused `setup-agent-not-chosen` while the record holds no agent, and launches the record's pipeline agent. Another step than the current one is refused `setup-step-not-current`, and `apply` as `setup-step-not-continued`. While the draft's entities hold a refusal of the entity validator, every Continue is refused `entity-refusals-stand`, naming the reasons. |
| `pipeline answer <S> <Q> <letters>... \| -- <text> [--json]` | Answer a setup question (`pipeline-setup-answer`) with option letters (`a`, or `a c` on a question that takes several) or free text, logged `pipeline-question-answered`; answering again replaces the answer. |
| `pipeline constitution <S> --revision <n> [--file <path>\|-] [--sources <source>,…\|none] [--json]` | Store User's constitution (`pipeline-constitution-edit`), logged `pipeline-constitution-set`: the whole text from the file, or from standard input with `--file -`, byte for byte (an empty file clears it), and the SOURCES ticks, the sources named on (`contributing`, `research`, `installed-default`) and the others off. Give the text, the sources or both. `--revision` is the constitution revision User read; another is refused `constitution-draft-stale`. |
| `pipeline edit <S> --revision <n> --set <field>=<JSON value>... [--json]` | Set fields of the draft pipeline in one move (`pipeline-draft-edit`), logged `pipeline-draft-edited`, each a User edit with its own id. The field is one of those [the record names](#datapipeline-setupjson); the value is JSON as `pipeline.json` holds it, and `null` removes a gate, prepare step, review or merge train, or writes a default back. Each field and value are read into the typed edit the command carries (`target` and its keys, as [the Hephaestus API](reference/hephaestus-api.md#board-commands) names them); a value of the wrong shape is refused `malformed-setup-command`, naming the field, before anything is written. `--revision` is the draft revision User read (`pipeline-draft-stale`). A draft that `pipeline.json`'s validator would refuse, such as a gate in no phase, is refused `pipeline-draft-invalid` with its reason: send a gate and its phase order in one move. Entities the validator refuses together, such as two on one home, are kept: the draft holds them until User resolves them, and Continue and Apply wait (`entity-refusals-stand`). |
| `pipeline undo <S> <E> [--json]` | Write the base pipeline's value of that edit's field back (`pipeline-draft-undo`), logged `pipeline-draft-undone`; the edit stays, marked undone. An Undo that would leave a draft the validator refuses is refused `pipeline-draft-invalid`, but for the entities' refusals, which are kept as an edit keeps them. |
| `pipeline discard <S> [--json]` | Drop every proposed change (`pipeline-draft-discard`), logged `pipeline-draft-discarded`: the draft is the base pipeline again and every edit is undone. |
| `pipeline check <S> [--json]` | Ask Hephaestus to [check](#pipeline-checks) the gates the draft changes or adds (`pipeline-check`), logged `pipeline-check-requested`: the record's `check` is `queued` with those gate names and the draft revision. A draft that changes or adds no gate is refused `no-gate-to-check`, and a second press while the check is `queued` or `running` `pipeline-check-running`. |
| `pipeline start-over <S> [--json]` | Remove the record (`pipeline-setup-start-over`), logged `pipeline-setup-discarded`, and stop its live agent in the same hold. The setup id is not used again. |
| `pipeline profile <gate> build\|review\|merge [<S>] [--json]` | Queue a [gate profile](#gate-profiles) (`gate-profile-start`), logged `gate-profile-requested`: that one gate in that one phase, once, as setup `<S>`'s draft defines it, or with no `<S>` as the stored pipeline does. `--json` prints `{ run, logged }`. A gate the source does not define is refused `unknown-gate`, a setup that is not the open one `no-setup-open`, and a second press while that gate and phase have a run `queued` or `running` `gate-profile-running`. |
| `pipeline profile-stop <P> [--json]` | Stop a gate profile (`gate-profile-stop`): a queued run is `stopped` at once, logged `gate-profile-stopped`; a running one is marked, and Hephaestus ends its process tree and records it `stopped`, with no duration. An ended run is left as it is. An unknown id is refused `unknown-profile-run`. |
| `pipeline apply <S> --revision <n> [--resume] [--json]` | Apply the draft at revision `n` (`pipeline-apply`) in [two stages](#apply). With `--resume` the board resumes once the pipeline is stored. `--json` prints `{ outcome, setup, logged }`: `outcome` is `committing` while the request waits for the constitution commit, `applied` once the pipeline is stored and the record closed, or `already-applied` for a revision an earlier Apply of the record already stored. |
| `pipeline apply-cancel <S> [--json]` | Clear the record's Apply request (`pipeline-apply-cancel`), committing, held or refused, logged `pipeline-apply-cancelled`: the record is back at the design step, `in-progress` and editable, the apply step is `not-started` again, and the stored pipeline stays as it was. With no request it is refused `no-apply-pending`. |
| `pipeline resume <S> [--json]` | Open the record's pipeline agent again (`pipeline-setup-resume`). When main moved past the record's `snapshotCommit`, the record first takes main's tip and the paths that changed, logged `pipeline-setup-resumed`; a done research step and every finding that names a changed path need a recheck, and Hephaestus checks the snapshot out at the new commit before the agent's next launch. The message names how many commits main moved and the paths. A record with no agent, or one whose agent ended other than by a stop, gets a new agent, which starts from the record. Refused `pipeline-apply-pending` while an Apply waits. |

An answer, a constitution edit, a draft edit, an Undo, a discard, a check and a Continue also message the record's
pipeline agent in the same hold, logged `job-messaged` with `byHephaestus`, when its job is live and not stopping, so
its next turn starts from User's move; an agent a stop closed is opened again with the message, logged `job-reopened`
with `byHephaestus`. Its transcript reads the message as Hephaestus's chat, never as User's words. The agent cannot read
the record, so the message carries what the move changed: a constitution edit the whole new text and the new SOURCES
ticks, each when it changed; a draft edit, an Undo and a discard each draft field the move changed, with the value the
draft holds there now (`null` for none). A record with no agent, or with one that ended otherwise, gets no message: the
record is what a later agent starts from. A body sent to `POST /api/commands` that lacks a field or holds one of the
wrong shape is refused `malformed-setup-command`, naming the field (`edits[0].value`);
[Refusals](reference/refusals.md#pipeline-setup) words every setup refusal.

On a forge over entities, each entity has a pipeline-agent session of its own beside the forge's: the Continue of the
`entities` step launches one for each entity of the draft that has none, stamped with its entity (the job's `entity`)
and named in that entity's part of the record (`entities.<key>.agentJobId`). Every session reads the record's one
snapshot. Hephaestus stamps a session's entity on each move it relays, so its findings, questions and constitution go
to its entity's part. `pipeline-agent-advise` and `pipeline-update-start` take an optional `entity`, the level they open
at, which the record names as `openedAtEntity` (absent at the forge): an advise at an entity launches that entity's
session alone, and an update at an entity holds that entity's part, whose session a resume opens without one at the
forge. `pipeline-constitution-edit` takes the same `entity` for that entity's constitution. An entity the pipeline does
not hold is refused `setup-entity-unknown`. Each move messages the session of the level it changes and no other: an
answer the session whose part holds the question, a draft edit, Undo or discard each entity's session with only the
fields inside that entity, and the forge's session with the rest; a Continue and a resume reach every session. A resume
opens the level the record opened at and each entity whose part a session served, never an entity whose part only a
check or an edit made. A start over and an Apply stop every session. A check covers each entity whose gates the draft
touched: that entity's part holds its own `check` of its own gates, run from its first home, and only its session hears
the end.

Hephaestus's board state carries the record as `pipelineSetup` (the [Hephaestus
API](reference/hephaestus-api.md#boardstate)). Its `mainMovedByCommits` (main's commits past `snapshotCommit`) is read
from git and never stored; Hephaestus keeps the count by (`snapshotCommit`, main's tip), so a state read asks git
again only when one of them changed.

#### Gate profiles

A gate profile is informational: it says how long one gate takes in one phase, and how it ended. Only User's press
starts one: `pipeline profile`, the time chip of a gate row, Profile again in the Gate dialog or "Benchmark in the
merge phase" on a new gate's change card. A proposal, an Apply, a draft edit and a Hephaestus start queue none, there is
no "profile all", and the pipeline agent may not relay `gate-profile-start`.

Hephaestus takes the queued runs in order. A run takes one of the machine's gate run slots, and only when no gate run
of a job or an Airlock of this Hephaestus waits for one: a running profile is not cut short, but when it ends, a waiting
real gate takes the slot first. The run gets a fresh detached worktree of main at `<worktrees>/gate-profiles/<P>`, which
needs no setup record, and runs the phase's prepare steps and then the gate in it, once, under the confinement of
Hephaestus's own gate runs. A profile may write only inside its worktree and the temporary folder: the gate's `writes`
folders are not granted, so a gate that needs one ends `red` or `cannot-run`. The process runs outside the hold;
Hephaestus takes the hold only to record `running` and the end (`passed`, `red`, `cannot-run`), with the duration, which
is only recorded and shown. Its output is appended, as it arrives, to `<data>/gate-profile-runs/<P>.ndjson`, one
`{"text": …}` line per piece, and the Hephaestus API streams it at `GET /api/profiles/<P>/stream`; the board's event
stream carries no output line. A profile never records a green or a `gate-ran` record, and Apply never waits on one.
When a run of the open setup ends, the caching checks run over the times its profiles recorded so far, and each new
suggestion becomes a finding of topic `note` (its `label` the suggestion's kind). The pipeline agent's first proposal
records, the same way, what the snapshot's tree cannot hold on every OS, read from git's index.

On a forge over entities, a start names the entity whose gate it profiles. The gate and the prepare steps come from that
entity's pipeline, and each folder is taken from the repository's root through the entity's first home. A run is kept
by entity, gate and phase, so the same gate of two entities runs and ends apart. The caching checks of an entity's run
read only that entity's times and gates, and its notes go to the entity's part of the setup record.

#### Gate reports

A gate may say what its own tooling replayed from its cache. Every gate line is handed a path in the temporary folder
in `FORGE_GATE_REPORT`: a fresh one for a line Hephaestus runs itself (a merge gate, a gate profile and a pipeline
check), and one named for the step's folder for a line Talos runs (a job's build or review gate), so the next pass
reads it. A prepare step is handed none. A gate that writes `{"version": 1, "cache": "hit" | "partial" | "miss"}`
there says that every task, some of them or none replayed from its cache. Hephaestus reads the file after the line
exits and removes it; a file left at a Talos line's path before its line starts is removed first. Anything else, such as
no file, a file over 4096 bytes, a link, text that is no JSON object, another version or another word, is no report.
A key that version 1 does not name is passed over. forge knows no caching tool: a gate writes a report only when its
own scripts do.

A gate profile keeps its gate's report with its end (`cacheReport` in `gate-profiles.json`). A job's gate run keeps
each gate's report in the gate's verdict in the job folder, and its `gate-ran` record carries them all with the run's
phase (`cacheReports`) once a gate of the run reported, or once the log holds a run whose gates did, so a later run
that reported nothing clears the mark; a board whose gates never report logs `gate-ran` as before. The Pipeline view
marks a run whose gate reported `hit` "cached" and `partial` "partly cached": on the time chip of the gate row and in
the Gate dialog's profile box (the profile run's), and on the gate's pill of its phase's gates step (the newest run of
that gate in that phase, a job's or a profile's, in log order). A miss or no report has no mark. A report decides
nothing: no gate passes, fails or is skipped by it. The report reaches the board state and the board document, and
no document of a monitor.

A Hephaestus that stops ends the process tree of each running run and records it `stopped`, with no result. A run that
is still `running` when its Hephaestus ended, as after a crash, is never run again: the next Hephaestus start records it
`stopped`, logged `gate-profile-stopped`, and removes every worktree under `<worktrees>/gate-profiles/`. The folder is
Hephaestus's own, so the regrouping never names it as a leftover.

#### Pipeline checks

A check tells the pipeline agent how the gates the draft changes or adds behave, before Apply. Only User's press starts
one: `pipeline check`, or "Ask the pipeline agent to check" under the editing screen's Changes tab. The pipeline agent
may not relay `pipeline-check`. One check of a record runs at a time.

Hephaestus takes the record's queued check when one of the machine's gate run slots is free and no gate run of a job
or an Airlock of this Hephaestus waits for one, as a [gate profile](#gate-profiles) does. In the hold that marks the
check `running`, it reads the gates the draft changes or adds again, as the draft is then, with the draft's prepare
steps, and the check names that revision and those gates; when none is left, the check ends `cannot-run` with the
reason `no-touched-gate`. Outside the hold, Hephaestus adds a fresh detached worktree of main's tip at
`<worktrees>/pipeline-checks/<S>` and runs the prepare steps and each of those gates in it two times, each gate on its
own, under the confinement of Hephaestus's own gate runs and with no `writes` folder granted. A gate that both runs
passed is `green`, one both runs failed `red`, one that could not run `cannot-run`, and one whose two runs differ
`disagreeing`. The hold that ends the check stores the result in the record (`checked`) or the reason nothing ran
(`cannot-run`: a line the confinement refused, or a worktree git could not add), and messages the record's pipeline
agent with it in the same hold, as a User move does. The worktree is removed when the check ends. A check never records
a green or a `gate-ran` record, and Apply never waits on one.

A Hephaestus that stops ends the running check's process tree and records it `stopped`, with no result and no message.
A check still `running` when its Hephaestus ended is never run again: the next Hephaestus start records it `stopped` and
removes every worktree under `<worktrees>/pipeline-checks/`, a folder the regrouping never names as a leftover. User
presses again.

#### Apply

Apply turns the record's draft into `pipeline.json`. The constitution is the tracked file `CONSTITUTION.md` at the
repository root, which only a commit on the main line can change, so Apply has two stages.

Stage 1 is the `pipeline apply` hold. It refuses, in this order: an older or malformed `pipeline.json`, unless the
record was opened with `--replace-unreadable` (`older-pipeline`, `malformed-pipeline`); a main whose `CONSTITUTION.md`
git cannot read (`main-constitution-unreadable`, exit 2), since it reads that file and its blob id next (a main line
with no commit yet holds none, so it is not refused); another revision while an earlier request waits
(`pipeline-apply-pending`); a revision other than the draft's (`pipeline-draft-stale`); an open setup question
(`setup-question-open`, naming the questions); a step before Apply that needs a recheck (`setup-step-needs-recheck`); a
snapshot a turn end found touched (`setup-snapshot-touched`); a draft whose entities still hold a refusal
(`entity-refusals-stand`); a `CONSTITUTION.md` on main that is not the one the record
opened on (`constitution-moved`), unless main already holds the draft's text; a draft with no constitution text while
main holds one (`constitution-empty`); on a stored pipeline with entities, a draft that removes or renames an entity
that a ticket names, a ticket that is neither delivered nor abandoned (`entity-named-by-tickets`, naming the entity and
the tickets: first give those tickets another entity, or let them land); on a stored pipeline without entities, a draft
that holds entities while a ticket is in progress, in review or reviewed (`entities-while-tickets-in-flight`, naming
them: apply once they land); and a stored pipeline whose content hash is neither the record's `baseContentHash` nor
this draft's as applied (`pipeline-moved`). Then:

- When main already holds the draft's text byte for byte as `CONSTITUTION.md`, or the draft has no text and main no
  file, stage 2 runs in the same hold and no commit is made.
- Otherwise the record stores `applyRequest`, state `committing`, logged `pipeline-apply-requested`, and nothing else is
  written: the stored pipeline and the board stay as they are. Until stage 2 or a cancel, every other setup move and
  every `gate` write is refused `pipeline-apply-pending`, so the revision being committed and the pipeline it was
  checked against cannot change. The commit of `CONSTITUTION.md` to the main line is the Airlock's
  ([The constitution commit](#the-constitution-commit)); until it lands the request waits.

Stage 2 runs in the stage 1 hold, in the hold that records the constitution commit's landing, or in the sweep hold that
finds main already holding the draft's text. It writes, in the hold's order: `progress.json` (the commit job ended when
a commit landed, an open `checks-not-set` decision withdrawn, logged `decision-withdrawn`, and the board resumed with
`--resume`, logged `hephaestus-set`); `pipeline.json`, the whole draft with `constitution.path` set to `CONSTITUTION.md`
when the draft holds a constitution; `constitution-sources.json`, the agent's sources keyed by the blob id of the text
main holds; `log.jsonl` (the commit job's `merge-landed` and `job-ended` when a commit landed, then `pipeline-applied`
with the changed, new and removed field names and the constitution commit, or `null`); and last the removal of
`pipeline-setup.json`. The same hold asks each live pipeline agent of the record, the forge's and every entity's, to
stop, logged `job-stop-requested` (one with no session ends `closed` at once), and once no pipeline agent is left
Hephaestus removes the snapshot under `<worktrees>/pipeline-agent/`. Nothing is written under `<data>/briefs/defaults/`,
and nothing but the commit's fast-forward writes `CONSTITUTION.md` in the main checkout. Nothing stops a ticket from
starting, or from taking an entity, while the request waits, so stage 2 refuses `entity-named-by-tickets` and
`entities-while-tickets-in-flight` again; the Airlock checks both before the commit lands and refuses the request with
that reason.

On a draft with entities the forge has no constitution of its own, so its draft is neither asked for nor committed,
and `constitution-moved` and `constitution-empty` do not refuse for it. Each entity's constitution is the file its
`constitution.path` names, else `CONSTITUTION.md` in its first home. Stage 1 reads each entity's file on main (a read
git cannot answer refuses `main-constitution-unreadable`), and each entity whose part of the record holds a drafted text
takes main's blob of its file as its `baseBlob`. Stage 2 runs at once when main holds every drafted text; else the
request waits for one commit of every drafted constitution. In stage 2 an entity with a drafted text names its file,
and an entity with no drafted text whose file main holds adopts it byte for byte: the pipeline names its path, and
nothing is committed for it. An entity with neither keeps the installed default. Stage 2 refuses an entity's drafted
text main does not hold (`constitution-moved`, naming the entity). No `constitution-sources.json` is written.

The first Apply that stores entities over a pipeline that had none, or over no pipeline, also starts a job of kind
`product-owner` in the same hold, when `committed` tickets without an `entity` exist: an intake of the request in
`resources/prompts/EntityAssignmentRequest.md`, naming those tickets, whose `job-launched` record lists them as
`entitiesToAssign`. The product owner gives each one its entity with `ticket entity --reason`, and asks User where it
cannot tell. A client reads its progress per ticket, and each reason from the ticket's `entity-assigned` record, from
the board state's `entityAssignment`.

Apply is idempotent by setup and revision. A pipeline this draft already stored is no one else's move, so a retried
Apply finishes what is missing and never refuses `pipeline-moved`; the same revision while its request waits answers
with that request; and a revision the log already holds as applied answers `already-applied`. Every hold commits
through the [hold journal](#datahold-journaljson), so an Apply cut short is finished by the next holder. At its start
Hephaestus also finishes an open record whose draft is already the stored pipeline, resuming the board only as its
stored request asked.

#### The pipeline agent's verbs

The [pipeline agent](glossary.md#pipeline-agent) changes the record through five verbs of its own, relayed through its
job's [Hatch](#under-a-job-the-hatch). Help does not list them: the agent's prompt and `<data>/reference.md` do. Under
its job a verb names no record: the [Bouncer](glossary.md#bouncer) stamps the job and the open record whose agent the
job is, refuses a request that names a `setupId` (`hatch-identity-mismatch`) and refuses the move when the job is the
agent of no open record (`job-serves-no-setup`). Outside a job User names the record first (`pipeline finding S1 --
<json>`), which applies the same move as the agent's. The payload is JSON after `--`, or in a file or on standard
input with `--file <path>|-`; it is read through a closed schema, so a missing, misshapen or unknown field is refused
`malformed-setup-command`, naming it, before anything is relayed. A verb Hephaestus refuses changes nothing: the
record and the log stay as they were, although Hephaestus applies it in a hold it goes on to write. The pipeline
agent may relay only these and `question options`; every ticket verb and every other kind is refused
`command-not-allowed-for-role`.

| command | payload | what it does |
|---|---|---|
| `pipeline finding` (`pipeline-finding-record`) | `{topic, label, value?, sourcePaths?, script?: {name, run, meaning, gateCandidate, needs?}}` | Record a finding `F<n>`, logged `pipeline-finding-recorded`. A source path stays inside the repository. |
| `pipeline ask` (`pipeline-question-ask`) | `{step, subject?: {kind, reference}, question, context?, options, recommended, multiple?}` | Ask User a setup question `Q<n>`, logged `pipeline-question-asked`: two to four options (`setup-question-option-count`), lettered `a` on in order, and exactly one recommended letter unless `multiple` (`setup-question-without-recommendation`, `several-letters-on-single-select-setup-question`). An option offering "Other" is refused: a client offers free text itself. |
| `pipeline draft-constitution` (`pipeline-constitution-draft`) | `{markdown, sources: [{lineText, occurrence, kind, path}]}` | Store the whole constitution byte for byte, logged `pipeline-constitution-set` by the agent. Refused: an empty text (`constitution-empty`), one over 20,000 characters (`constitution-too-long`), a source whose line the text does not hold `occurrence` times (`constitution-source-unanchored`), two sources on one line (`constitution-source-repeated`), a source of a kind the record's SOURCES ticks do not select (`constitution-source-not-ticked`; with no constitution yet, the ticks are `contributing` and `research`), and a source path outside the repository. Under a job the markdown travels beside the command, as a ticket body does. |
| `pipeline propose` (`pipeline-draft-propose`) | `{edits: [{field, value, summary}]}` | Edit the draft in one move, logged `pipeline-draft-edited` by the agent, each edit with its own summary sentence. A field outside the record's closed list is refused, and so is a draft `pipeline.json`'s validator would refuse (`pipeline-draft-invalid`), checked before the record changes; entities it refuses together are kept, as User's edit keeps them. The agent's first proposal also records each [tree finding](#gate-profiles) of the snapshot as a `note` finding. |
| `pipeline ready <step>` (`pipeline-step-ready`) | none: `research`, `entities`, `constitution` or `design` | Suggest that User may continue the current step, kept in `readyToContinue` and logged `pipeline-step-ready-suggested` once; it moves no step. Another step is refused `setup-step-not-current`. |

### Review statistics

| command | what it does |
|---|---|
| `review-stats [--json]` | What the recorded reviews catch, miss and cost, in one table over every recorded ticket and one per split. It takes no lock and writes nothing, as `status` does. |

A *recorded ticket* is one with at least one `review-recorded` line in `log.jsonl`. Each `round` of a ticket is one
recorded review round, its latest line the one that counts, so a ticket with two recorded review rounds counts two
rounds and one ticket. Every other ticket appears in no table and is counted on the last line (`unrecordedTicketCount`).
With no recorded ticket at all it prints one sentence saying so, at exit 0. A line naming a ticket the board does not
hold is left out.

Rates print with two decimals and tokens rounded to whole numbers. A rate over nothing is `-` in the text and `null` in
`--json`, which prints the same numbers unrounded as one document.

| table, with a column per group that has a ticket | `--json` key | groups |
|---|---|---|
| All recorded tickets | `all` | one |
| By ticket type | `byType` | the ticket `type` |
| By builder change size | `byChangeSize`: `small`, `medium`, `large`, `oversized` | `<=50 lines`, `<=200 lines`, `<=750 lines`, `>750 lines`: the `builderInsertions` plus `builderDeletions` of the ticket's first recorded review round |
| By builder model and effort | `byBuilder` | the ticket's builder `model` and `effort`, the defaults filled in |

Each table prints these figures per group. "Review passes" is the printed label for recorded review rounds.

<details>
<summary>Every figure: printed label, <code>--json</code> key and definition</summary>

| printed label | `--json` key | definition |
|---|---|---|
| `tickets recorded` | `ticketCount` | The recorded tickets in the group. |
| `review passes` | `reviewPassCount` | The recorded review rounds. |
| `rounds per ticket` | `roundsPerTicket` | The distinct `round` values of each ticket's recorded review rounds, summed and divided by the tickets. |
| `verdict <verdict>` | `verdictCounts` | Verdict counts over the recorded review rounds. |
| `findings class <class>` | `findingCountByClass` | Findings over the recorded review rounds, by `class`. |
| `findings severity <severity>` | `findingCountBySeverity` | Findings over the recorded review rounds, by `severity`. |
| `serious findings` | `seriousFindingCount` | Findings of severity `would-ship-a-bug` or `acceptance-fails`. |
| `serious findings per ticket` | `seriousFindingsPerTicket` | The same, per ticket. |
| `review tokens per ticket` | `reviewTokens`, `reviewTokensPerTicket` | The `tokens` of every row whose `reviewOf` is the ticket, ticket-owned rows excepted. |
| `builder tokens per ticket` | `builderTokens`, `builderTokensPerTicket` | The `tokens` of the ticket's own row. |
| `review tokens per serious finding` | `reviewTokensPerSeriousFinding` | Review tokens over serious findings. |
| `delivered, last review serious`, `delivered, last review clean` | `deliveredTicketCount`, under `afterSeriousLastReview` and `afterCleanLastReview` | The delivered tickets whose last recorded review round in log order had a serious finding, and those whose last one had none. |
| `escaped bugs, last review serious`, `escaped bugs, last review clean` | `escapedBugCount`, under the same two keys | The bug tickets whose `introducedBy` names one of them. |
| `escaped bugs per delivered, serious`, `escaped bugs per delivered, clean` | `escapedBugsPerDeliveredTicket`, under the same two keys | Escaped bugs per delivered ticket. |
| `tickets filed from reviews` | `ticketsFiledFromReviewsCount` | The tickets whose `foundInReview` names the ticket. |
| `claims` | `claimCount` | Claims over the recorded review rounds. |
| `claims contradicting the handoff` | `handoffContradictedClaimCount`, `handoffContradictedShare` | The share of claims whose `handoffContradicted` is true, a percentage in the text. |
| `fix lines per ticket` | `fixLines`, `fixLinesPerTicket` | The recorded review rounds' `fixReworkedCodeLines`, summed and divided by the tickets. |
| `rebase lines per ticket` | `rebaseLines`, `rebaseLinesPerTicket` | The recorded review rounds' `rebaseReworkedCodeLines`, summed and divided by the tickets. |

</details>

### Hooks and usage

| command | what it does |
|---|---|
| `hook session-start` | Print `session-instructions.md` for the session the agent is starting. `init` and `update` wire it as the agent's session-start entry, which the agent adapter writes (for Claude Code the `SessionStart` hook in `.claude/settings.local.json`, which a job's `--setting-sources project` never loads). It prints nothing under a job, skips the install version check, and exits 0 whatever happens, printing nothing on failure. |
| `hook bash-domains --allow <domains>` | Keep a job's network inside its ticket's `network` line: the network guard a Hephaestus renders into a job's launch for a role with a `network` line, run before each shell command and web fetch, since auto mode's classifier may grant a domain the session asks for. [What it denies](#hook-bash-domains) is below. |
| `hook stage-edits --allow <folder>…` | Keep the file edits of a job of an entity inside its stage's folders: the edit guard a Hephaestus renders into the launch of such a job, since its deny rules name only the paths that existed at launch. [What it denies](#hook-stage-edits) is below. |
| `usage [--since <when>] [--transcripts <folder>] [--json]` | What this repository's subagents cost, read out of the subagent transcripts the agent keeps for this repository: one row per agent, oldest first, then the cohort summary. It writes nothing and takes no lock; a repository with no transcripts is one sentence at exit 0. [The columns and flags](#usage) are below. |

#### `hook bash-domains`

The agent's adapter reads the call from the hook input on standard input, and the guard judges it. It denies, through
the adapter's denial line on standard output, a shell command that asks for a domain, or a web fetch whose URL host
names a domain, outside the comma-separated `--allow` list. An entry `*.example.com` admits that domain's subdomains,
never the domain itself. A tool the adapter does not know is denied, since it may be a new shell; a file edit and a
known tool that runs no command pass, printing nothing and granting nothing.

It reads no tracker, skips the install-version check, runs directly under a job, and exits 0 whatever happens. It
answers deny on any failure: no input, input the adapter cannot read, a URL naming no host, requested domains that are
no list of domains, an unknown option.

Hephaestus renders it in exec form, before every shell command and web fetch: the program's absolute path, resolved
from Hephaestus's `PATH` at launch, with its arguments and no shell, so a program missing from the session's `PATH`
cannot let a call through. When the program does not resolve at launch, the job's launch denies shell commands and web
fetches outright instead. What it enforces per OS:

| OS | shell commands | web fetches |
|---|---|---|
| macOS, Linux | The domains each command asks for, which auto mode may add to the sandbox's strict network allowlist. | The URL host. |
| Windows | Nothing to check: no sandbox exists, so a command asks for no domain and its network is not limited. | The URL host. |

#### `hook stage-edits`

The agent's adapter reads the call from the hook input on standard input, and the guard judges it. It denies, through
the adapter's denial line on standard output, a file edit whose path lies outside every `--allow` folder. A relative
path is placed by the call's working directory, and `..` is resolved before the check. A stage file such as
`/bun.lock` is a folder of its own. A path inside a folder passes, printing nothing and granting nothing; any other
call is denied.

The deny rules of a stage name the worktree's paths outside its folders as they stood at launch. A name made later
directly in a folder on the way to a stage folder, such as the worktree root or `/apps`, is named by no rule, and this
guard denies a file edit of it at once. A job without an entity gets no such guard. A stage's folders are its
entity's homes and `reach`; in stage 1 they also hold the homes of the packages the entity whitelists, where the build
may write a proposal, a package whose build refused the ticket's change left out.

It reads no tracker, skips the install-version check, runs directly under a job, and exits 0 whatever happens. It
answers deny on any failure: no input, input the adapter cannot read, no path, a relative path with no absolute working
directory, no `--allow`, a folder that is not an absolute path, an unknown option. Hephaestus renders it in exec
form, before every file edit, as it renders `hook bash-domains`; when the program does not resolve at launch, the job's
launch denies file edits outright instead.

#### `usage`

The transcripts read include a workflow's agents. Each row holds the agent's start,
its API calls, its end context, its input and output, its browser calls, the characters the harness injected into it and
the first line of its brief. The cohort summary holds median calls and end context, mean input and output, and the mean
of each figure below.

| column | counts |
|---|---|
| `over 200k` | The share of an agent's input sent at a context past 200,000 tokens (a raw token count under `--json`). |
| `bash edits` | The edits it made through a shell command (a heredoc, an inline interpreter or an in-place editor) instead of the editing tools. |
| `checks` | The Bash commands holding a test, type-check or lint fragment. |

`--since` splits the agents on an instant and summarises both sides. `--transcripts` reads a folder other than the one
this repository's path resolves to.

> **As built.** No job session appears here.

### Hephaestus

[The Hephaestus API](reference/hephaestus-api.md) holds the routes, guards and event stream.

The API binds `127.0.0.1` and refuses, 403, a Host other than `127.0.0.1:<port>` or `localhost:<port>`, an Origin other
than the API's own, and every preflight. Behind those guards, the bearer token from the file the Hephaestus lock names
is the only credential: `POST /api/commands`, `POST /api/pictures` and every data route (`GET /api/state`, `/api/board`,
`/api/events`, `/api/monitor`, `/api/monitor/events`, `/api/presence`, `/api/crash-log`, `/api/jobs/<J>/stream`,
`/api/jobs/<J>/files/<name>`, `/api/pictures/<id>`, `/api/profiles/<P>/stream`) need it and answer 401 otherwise; no
cookie and no request header a local program can forge counts. `GET /api/versions`, `GET /api/identity`,
`GET /api/summary` and `POST /api/nudge` stay open. A 401, a 403 and a read that fails answer `{refusal, text}`: a
fixed word, and the sentence a client shows.

| command | what it does |
|---|---|
| `start [--repository <path>] [--port <n>] [--started-by user] [--json]` | Start the board's one Hephaestus detached. `--started-by` names who started it, `user` being its one value and the default, and is passed to the detached Hephaestus; [the start gate](#the-start-gate) runs before the spawn. With a Hephaestus live it starts nothing. It returns only once Hephaestus's API answers; a live Hephaestus whose API does not answer within the start's tries is refused `hephaestus-not-answering` at exit 1. `--json` prints `{ answerVersion, started, url, generation, trackerId, codeVersion, installVersion, contracts }`, `contracts` as that Hephaestus's identity names them. `--repository` starts Hephaestus of the repository at that path, relative to the working directory, in place of the working directory's. `--port` binds the one given, `0` any free one, and none keeps the board's derived port. A second `start` answers `started: false` at exit 0. |
| `start --foreground [--repository <path>] [--port <n>] [--started-by user]` | The serving process itself, which the detached `start` runs: it serves in the foreground, logging to standard error and `<data>/hephaestus.log`, and prints its URL. It passes [the start gate](#the-start-gate) first, and a live Hephaestus refuses it `hephaestus-already-running` at exit 1. `--repository`, `--port` and `--started-by` are those of `start`. |
| `start --successor-of <generation> [--port <n>]` | The successor a [restart](#restart) starts, detached, once the old Hephaestus let go of the board; nobody else runs it. It first waits, at most `HEPHAESTUS_STOP_TRIES` looks, for the process of that generation to end; one still live then refuses it `hephaestus-already-running`. Then it serves in the foreground on the port it is given, the old one's, and is a start like any other: the install check, [the start gate](#the-start-gate) and the normal claim of the next Hephaestus lock generation over the dead one, then Regrouping from what the board holds. Its start origin is `successor`, so `--started-by` beside it is refused at exit 1. |
| `start --preflight` | The code on disk proving itself to a Hephaestus about to [restart](#restart), which runs it; it serves nothing, takes no Hephaestus lock and writes nothing. It reads the board, the jobs, the child records and the install version, in the steps `read-board`, `read-jobs`, `read-child-records` and `install-version`, stops at the first that fails, and prints its report as one JSON line: `{verdict: fit, codeVersion}` or `{verdict: unfit, codeVersion, step, error}`. |
| `stop [--now] [--json]` | Stop the live Hephaestus through its API with the token from the file the Hephaestus lock names, else ends the process its Hephaestus lock names, its identity checked first: SIGTERM where a process can be asked from outside, by force on Windows. It waits a bounded number of tries for the Hephaestus lock to be gone or to name a dead process, else refuses `hephaestus-still-live` at exit 1. A Hephaestus lock left naming a dead process means Hephaestus never finished its own stop: once that process is gone the command records `hephaestus-stopped`, removes the registry entry, writes the page stub as down and releases the Hephaestus lock, says so in place of a clean stop, and `--json` adds `ending` (`forced` or `unfinished`) beside `outcome: done`; `--json` prints `{ answerVersion, outcome }`. A newest Hephaestus lock that already names a dead process, such as one a refused close left, gets the same close and reports `ending: unfinished`, so the next stop repairs what an earlier one could not write. The board's [Talos](glossary.md#talos) is left running, and stops the agents at the end of their turn once the lease the stopped Hephaestus no longer renews ends; `--now` also has Talos stop every install, prepare, gate and merge line, through the API only. With no live Hephaestus it has nothing to do (exit 0). It checks no install version. |
| `restart [--now] [--json]` | The checked restart to the code on disk, after an install-version check. On success it prints `Hephaestus handed over to code <codeVersion> at <url>` (`--json`: `{outcome: done, url, codeVersion}`); [the rest](#restart) is below. |
| `talos-restart [--json]` | Ask the live Hephaestus, through its API, for a clean restart of the board's Talos, the control command `talos-restart`: Talos asks each agent to stop at the end of its turn, for at most 10 seconds, and quits; Hephaestus's next pass starts the right Talos, and each agent Talos recorded as paused resumes by itself, never counted as a crash. `--json` prints `{ outcome }`: `done` when Talos took the quit, `nothing-to-do` when no Talos took it (none runs, or it is quitting already), `not-taken` when no live Hephaestus took the command; each exits 0. A session under a job is refused it before it runs. |
| `pause [--json]` | Store `hephaestusState` `paused` through the write pipeline, logged as a `hephaestus-set` record, with Hephaestus up or down: a paused Hephaestus starts no new job. `--json` prints `{hephaestusState, previousState}`. |
| `unpause [--json]` | Undo a pause: store `hephaestusState` `running` the same way. `--json` prints `{hephaestusState, previousState}`. `resume` is another verb, which restarts interrupted work. |
| `crash-log [<number>] [--json]` | Print the crash log `<data>/hephaestus/crash-logs/crash-<number>.json`, the newest when no number is given: its heading (number, path, when and by whom it was recorded), the component and the crashed Hephaestus lock generation, the classification and its evidence, the error and its stack, the jobs as the crash found them, then the tail of `hephaestus.log`. `--json` prints the stored log with `number` and `path` added. It reads files only, takes no lock and writes nothing, so it works with the forge up or down. With no log, or none of that number, it is refused `no-crash-log` at exit 1. [After a crash](#after-a-crash) has the whole path. |
| `version [--json]` | Print `{ answerVersion, codeVersion, installVersion, contracts, talosProtocolVersion, monitorFolder }`: a content hash of the program's shipping files on disk, the install version this program writes, the Hephaestus API contracts this program serves as `GET /api/identity` names them, the protocol version of the Talos this program starts, and the monitor folder. Read-only; it needs no tracker and checks no install version. |

#### The start gate

A forge never starts at login: after a login a board stays stopped until the user starts it with `start` or from a
client. Every start of the forge (`start` and a successor) classifies itself before it takes a Hephaestus lock, from
what the generation before it left: `<data>/hephaestus/presence.json`, `<data>/hephaestus/heartbeat.json`, the
newest Hephaestus lock and Talos's newest record, and the current boot. The kinds are `first-start`, `handover`,
`stopped-on-purpose`, `machine-went-down` (with `crashSuspected` when the last beat was older than four lease renewal
intervals at the boot) and `crashed` (Hephaestus or Talos). After `crashed`, or `machine-went-down` with a suspected
crash, the start writes the crash log `<data>/hephaestus/crash-logs/crash-<number>.json` once; a log already there, from
the crash itself or an earlier start, stays. A crash log's number is its own, one above the highest log on disk (1 again
once the folder is emptied), never the Hephaestus lock generation, which starts again at 1 after a stop; the crashed
generation is a field inside the log. Only a start by `user` then serves. A successor that finds a crash before it
stays off: it writes the registry's `presence` as `crashed`, logs one line to `hephaestus.log`,
takes no Hephaestus lock, binds no port, contacts no Talos, and is refused `forge-off-after-crash` at exit 1 ("The forge
is off after a crash of Hephaestus lock <n>; read why with `forge crash-log`, and start it yourself with
`forge start`."). A start that serves records its kind in `presence.json` (`startClassification`, `startOrigin`) and in
the board log (`start-classified`, right after `hephaestus-started`).

`presence.json` is the newest generation's start, abandoned passes and ending (`stopped`, `handed-over` or `crashed`),
written whole by Hephaestus; `heartbeat.json` is its newest beat, rewritten at each lease renewal Talos confirmed.

#### After a crash

A serving forge that crashes (an uncaught error in Hephaestus, or its Talos lost while the machine stayed up) writes
its crash log, writes its presence ending `crashed`, stops renewing Talos's lease, so its agents end `lease-ended` and
wait, and exits 2, refused `forge-crashed`. It stays off until the user starts it. The command line alone carries the
whole path:

1. `status` says the forge is off after a crash of Hephaestus lock `<n>`, with the crash log's number and path, and
   `--json` carries `presence.state` `off-after-crash`. It classifies as a start by the user would, and writes nothing:
   before any start or the crash itself wrote a crash log, it says the next start writes one. `status` prints one
   line on standard error.
2. `crash-log` prints the newest crash log, `crash-log <number>` an older one.
3. `start` (origin `user`) serves, and records the start as `crashed`, or `machine-went-down` with `crashSuspected`.
   No interrupted work starts by itself.
4. `resume --all` resumes every job that waits for an instruction, `resume --network-outage` every job that ended on a
   network outage, and `resume <J>` or `resume <T>` one job or ticket ([`resume`](#resume)). `job fresh <J>` starts a
   fresh agent on the job's worktree instead, and `job stop <J>` gives the work up.

#### Where the secrets live

#### Talos

Each board's children run under one Talos (`talos.ts`): a detached process with a protocol version of its own, which
Hephaestus starts once per board and which outlives Hephaestus. It runs every agent session and every install, prepare,
gate and merge line, the gates Hephaestus runs itself included. Its files are in `<data>/talos/`: the start file
`start-<n>.json` Hephaestus writes, with the lease and the bounds; its record `talos-<n>.json`, with its start number,
protocol version and state; its log `talos-<n>.log`, which names a child by its label and id only; and
`launches-<n>.ndjson`. The identity document names its protocol (`talosProtocolVersion`). A Talos of another protocol
answers Hephaestus's first frame with `version-mismatch` and quits cleanly; one Hephaestus has just started that
still does not fit refuses Hephaestus's start.

- **The child record.** Each child has a folder of its own: a job's sessions in the job folder, each line in its step's
  folder. `child-<n>.json` records who runs it, its state, the endings it recognised and its end (`exited`, `signalled`,
  `spawn-failed`, `paused`, `lease-ended` or `time-bound`) with its run time; `events-<n>.ndjson` is its event log,
  appended in place; `child-<n>.log` is its standard error. No launch is written to a file, so no file holds a session's
  environment.
- **The lease.** Talos supervises its agents on a lease of one minute (`SUPERVISION_LEASE_MILLISECONDS`). Hephaestus
  renews it every 15 seconds from its main loop, and only while its passes make progress: the same pass in flight at two
  renewal ticks in a row withholds the renewal, so a hung Hephaestus loses the lease within a minute. When the lease
  ends, Talos asks every agent to quit at the end of its turn, and its job is interrupted `lease-ended`; lines run on.
  After a gap in Talos's own ticks, such as a sleep, the lease ends no sooner than one renewal interval later (two below
  5 seconds), so a machine that wakes keeps its agents while its Hephaestus renews again.
- **The clean quit.** On a `quit` frame Talos refuses new launches, stops every line at once, asks every agent to quit
  at the end of its turn, stops what still runs after 10 seconds (`CLEAN_QUIT_TURN_END_WAIT_MILLISECONDS`), records
  every end and exits. An agent ends `paused` and its job is interrupted `talos-paused`, which the next pass resumes; a
  line that ends `paused` is never judged and runs again.
- **The time bound.** Every install, prepare and gate line is stopped after 15 minutes of awake time
  (`LINE_TIME_BOUND_MILLISECONDS`) and ends `time-bound`; its output says so. Each gap in Talos's ticks is added to the
  line's allowance, so a sleep does not count. A merge line has no bound. Each line's run time, in the same measure, is
  recorded (`pipeline-step-ran`) and served in the pipeline facts as `stepRunTimes`.
- **The merged-tree gate** of an Airlock runs beside the pass, never inside it: a pass that reaches a gating Airlock
  whose run is in flight moves on, so no landing holds a pass, nor the lease.
- **A network outage.** An agent whose session ends on a network outage, a provider overload after its retries were
  spent included, is recognised from fields of the session's closing result line, which the agent adapter names, never
  from its text. Talos records the recognition before the line, and the job is interrupted `network-outage`. It waits
  for User's resume, as a lease end does, and is never counted as a crash.

The API token and each Talos's secret (`talos-<n>.secret`) sit in `<monitor>/private/<trackerId>/`, under the user's
home on every OS; the start file names the secret's file and holds no copy, and no launch is written to a file. Every
session's read deny covers `<monitor>/private`.

| OS | The guarantee |
|---|---|
| macOS, Linux | The folder is mode 0700 and each file mode 0600, the temporary file of a write included. |
| Windows | Nothing writes an ACL: the profile's inherited ACL is the guarantee. Each folder and file is read back with `icacls.exe`, and one holding a trustee beyond SYSTEM, Administrators and the user, or one it cannot read, is refused. English trustee names only, so another display language refuses too. |

#### `restart`

`restart` sends the live Hephaestus the command `hephaestus-restart`. Before it lets go of the board, the live
Hephaestus runs the code on disk as a preflight, [`start --preflight`](#hephaestus), and waits at most 20 seconds
(`RESTART_PREFLIGHT_TIMEOUT_MILLISECONDS`) for its report. Its runtime state reads `restarting` from the command on.
Talos is sent nothing, and the successor connects to the same Talos. Hephaestus never restarts itself.

- A failed preflight refuses the command `restart-failed`, with the step that failed: one of the preflight's steps,
  `spawn` when the preflight could not be started, or `preflight` when it left no report in time or exited without
  one. The old Hephaestus keeps driving, logs the failure, records it on the board, and `status` shows the warning
  until a restart succeeds. `restart` exits 1.
- After a passed preflight the old Hephaestus finishes a landing in progress, starts no effect batch, writes the ending
  `handed-over` to `presence.json` and the board log, closes its listener, starts the successor detached,
  `start --successor-of <generation> --port <port>`, on its own port, and exits. Its lease renewal runs until it
  exits. It keeps its Hephaestus lock, which dies with its process: the successor waits for that process to end and
  takes the next generation, so the generation rises by one across a restart and no client reads one twice. Only a
  `stop` releases the Hephaestus lock. `restart` waits for the successor to take the Hephaestus lock and answer, then
  prints `Hephaestus handed over to code <codeVersion> at <url>`. It waits as long as the old Hephaestus holds the
  board, `RESTART_RELEASE_TRIES` looks at most, and counts the successor's own tries only once that process is gone.
- A second `hephaestus-restart` while one runs is answered `done` and starts no second preflight. A `restart` that
  finds a generation already handed over waits for that restart's successor.
- A `stop` sent while the preflight runs is taken: the old Hephaestus still drives then, and it stops. Once it lets
  go of the board, a command is answered `done` and dropped.
- Nothing takes the board back. A successor that does not serve leaves no Hephaestus on the board: it writes the
  presence `crashed` to the registry, so a monitor alerts, and `restart` refuses `restart-failed` at step `serve`, at
  exit 1; run `start`, or `restart` again, which then starts one. An old Hephaestus that never let go is refused the
  same, naming its URL. A successor that took the Hephaestus lock and died is a crash, which the next start
  classifies.
- A Hephaestus whose API does not take the command is stopped and started again detached on its port. With none live,
  one is started, on the port of a Hephaestus found dead, whose stop is recorded in its place.

> **As built.** `--now` counts only on that fallback.

#### Hephaestus's facts in `status`

`status` prints Hephaestus's process facts above the board, and `status --json` carries them under `hephaestus`. The
runtime state comes from Hephaestus's `GET /api/state`: `serving`, `held-by-install-change`, `restarting`;
`starting` while the API does not answer yet, or `down`. `hephaestus` is
`{state, paused, url, hephaestusLock, codeVersionOnDisk, codeVersionInMemory, notices, restartWarning, presence}`.

`presence` is `{state, lastStart, crashLog, heartbeat, supervision, abandonedPasses}`:

- `state`: `serving`, `starting`, `down`, or `off-after-crash` when a start now would classify `crashed`, or
  `machine-went-down` with `crashSuspected`.
- `lastStart`: the classification `presence.json` records for the last start, or `null`.
- `crashLog`: `{number, generation, path, suspected}` of the crash a down forge is off after, or of the crash the live
  forge's last start followed; `null` when there is none, or none is written yet.
- `heartbeat`: `{heartbeatVersion, generation, sequence, at}`, the live generation's newest beat, or with the forge
  down the last beat stored.
- `supervision`: `supervising`, `stopped` (the lease ended), `checking-after-a-gap`, `not-yet-renewed`, or `no-talos`
  when no Talos runs, from Talos's newest record.
- `abandonedPasses`: `{inARow, last}` from `presence.json`, `null` when it records no such generation.

An install version that differs from Hephaestus's holds launches, the stored `hephaestusState` untouched, with the
notice `install-version-changed`. Code that differs alone shows the notice `new-code`. Here both say to run
`forge update`; the API words them with no command: the board is to be updated, or, for new code,
Hephaestus restarted.

### Merges and worktrees

| command | what it does |
|---|---|
| `merges [--json]` | The merge queue, read as `status` reads the tracker (no lock, nothing written): each held Airlock slot `{target, jobId, ticketIds, phase, targetTip, branchTip}`, then each queued ticket `{ticketId, target, priority, queuedAt}` by target, priority, then queue order (the Airlock's own pick also weighs predicted conflicts), `queuedAt` its `merge-queued` record's place in the log. With merge approval on, the queue follows User's press order, as the Airlock does: by target, the accepted tickets by their newest accept, earliest first, then the tickets waiting for an accept in queue order. `--json` prints `{slots, queue}`. |
| `merge accept <id> [--json]` | With merge approval on, User's accept of a ticket waiting for merge: sets the row's `mergeAccepted` and logs `merge-acceptance-set {state: accepted}`, so the ticket's Airlock may land it. In the hold, `git merge-tree` predicts the merge of `ticket-<id>` into its target's current tip; anything but clean is refused at exit 1 with nothing written: `merge-accept-would-conflict` (with the files) or `merge-accept-prediction-failed`. Also refused: `merge-approval-off`, and `merge-accept-of-a-ticket-not-waiting` for a ticket not in review done, held, on a job, or whose branch moved past its green. An accepted ticket answers `nothing-to-do`. |
| `merge update <id> [--json]` | With merge approval on, the target merged into the ticket's worktree in the hold, with no Airlock held (`merge-updated {target, outcome}`). Merged, the branch's green is stale, so Hephaestus gates it on its next pass: green sets review done again, red clears it and the ticket's next reviewer takes the red handoff. A conflict is aborted, the worktree left at its tip, and review done and the accept are cleared, so the ticket's next reviewer merges the target. Refused at exit 1: `merge-approval-off`, `merge-update-of-a-ticket-not-waiting` (not in review done, or a job holds it) and `merge-update-failed` (git could not merge). A branch that already holds the target answers `nothing-to-do`. |
| `worktree repair <id> --step prune\|reinstall\|recreate\|unlock [--incident <I>] [--json]` | A code-implemented repair of the ticket's worktree `<worktrees>/ticket-<id>/`, run inside the hold that records it (`worktree-repaired {step, patchPath}`). [Each step](#worktree-repair) is below. |


#### `worktree repair`

| step | what it does |
|---|---|
| `prune` | Runs `git worktree prune`. |
| `reinstall` | Changes nothing on disk, so the next launch reruns the install line. |
| `recreate` | Saves `git diff HEAD` and every untracked file to `<data>/jobs/<J>/recreate-<n>.patch` (the incident's job, else the ticket's newest) and removes the worktree, which the next launch creates again from the branch. Refused `worktree-has-uncommitted-work` when changes exist and cannot be saved. |
| `unlock` | Removes a stale `index.lock`. |

`recreate` and `unlock` are refused `worktree-in-use` while any job on the board names the ticket; a git failure is
refused `worktree-repair-failed`. Without `--incident` it takes the ticket's one open incident that allows it
(`setup-failed`, `blocked`, `gate-cannot-run`), else applies as a plain User control.

### Decisions and incidents

| command | what it does |
|---|---|
| `decisions [--json]` | The open decisions for User, read from `progress.json` (no lock, nothing written), in opening order, each question's options lettered `a`, `b`, `c` as `decide` takes them. `--json` prints `{decisions}`, each `{id, kind, ticketIds, jobId, askedBy, requestId, questions, context, openedAt}`. |
| `decide <decision> <letters>... \| -- <text> [--json]` | Answer an open decision through the write pipeline, with Hephaestus up or down: one choice of option letters per question (`decide E7 b`; `decide E7 b ac` when the second question is multi-select, its labels joined by `, `), or free text after `--` for a decision asking one question. The first answer wins; [the refusals and delivery](#decide) are below. |
| `question options <J> -- <json> [--json]` | Keep a builder's, reviewer's or product owner's notes for the options of the question it asks next on its job as `pendingOptionNotes`, through the write pipeline and logged nothing, with Hephaestus up or down. Refused `question-options-malformed` for notes that are not well formed, naming the field. Under the asking job it names no job: Hephaestus stamps its own. [What the notes hold and where they go](#question-options) is below. |
| `need declare <J> "<title>" --entity <key> --body <text> \| --body-file <path> [--json]` | Keep a build job's need for another entity in `progress.json`'s `needs`, through the write pipeline and logged nothing, with Hephaestus up or down; Hephaestus files it as that entity's ticket. Under the declaring job it names no job: Hephaestus stamps its own. [What a need holds and its refusals](#need-declare) are below. |
| `await [--json] [--after <n>]` | Wait until the log holds a `decision-opened` or `incident-escalated` record past position `<n>` (the log's length at the start when absent; positions count from 1), then print them and stop. `--json` prints `{after, position, records}`, each record with its `position`; the next wait is `await --after <position>`. A stop signal ends the wait with nothing printed. Read-only, no lock. |
| `incidents [--json]` | The open incidents for the [Assistant](glossary.md#assistant), read from `progress.json` (no lock, nothing written), in opening order, each with its facts, the moves its kind allows and its default. `--json` prints `{incidents}` as `progress.json` stores them. |
| `incident answer <I> -- <text> [--json]` | Answer a `system-question` or `malformed-ticket` (`incident-not-a-question` for another kind): logged `incident-handled` and `incident-answered` with the question's request, which joins the waiting job's `answeredRequestIds`, and the job moves to `running` once nothing else it asked is open. The answer does not reach the session. A `malformed-ticket`'s answer, or one no job waits on, is also written under the ticket's `## Questions`. |
| `incident note <I> -- <text> [--json]` | Record a finding under the incident, logged `incident-noted`; the incident stays open. |
| `incident escalate <I> [--json]` | Close the incident and put exactly the agent's questions to User as an `agent-question` decision on the same tickets, job and request, logged `incident-escalated`; one carrying no questions is refused `decision-without-questions`. Every move naming an incident, here or through `--incident`, is refused (`incident-move-not-allowed`, `incident-target-mismatch`) unless the incident is open, its kind's row of `ALLOWED_MOVES_BY_INCIDENT_KIND` allows the move, and a `job fresh`, `job message` or `ticket park` names the incident's own job or a ticket it lists, and marks it handled in the same hold. |

#### `decide`

Refused:

- `decision-has-several-questions`: free text on a decision with more than one question;
- `decision-option-unknown`: a letter naming no option;
- `decision-single-choice`: several letters on a single-choice question;
- `decision-answer-count`: a wrong number of choices;
- `decision-already-answered`: a second answer.

The answer is stored as `{question: answer}` and logged `decision-answered` with the question request it answers. The
request id joins the asking job's `answeredRequestIds`, and a job waiting on that answer alone moves back to `running`.

Hephaestus then delivers it. A live session still holding the request gets the answer line the agent adapter writes,
through Talos, when the agent takes live answers (Claude Code's `control_response` allow with `updatedInput.answers`); a
resumed session takes it as its first user line. A question whose ticket job ended `replaced` or `stopped` was held on
its ticket `awaiting answer (E<n>)`: the answer goes under the ticket's `## Questions` and lifts the hold. `--json`
prints `{decisionId, answer}`.

#### `question options`

AskUserQuestion carries only a label and a description per option, and Claude Code strips any other key. So the build,
review and product-owner prompts ask an agent to run this verb before it asks, one time for each question:

```sh
forge question options -- '{"question": "Which export format?", "options": [{"label": "CSV", "touches": ["src/export/Csv.ts"], "tradeOff": "Plain, no nesting.", "acceptanceEffect": "A2 fails."}]}'
```

- `question` and each `label` are the texts the question will carry; `touches` (a list of repository paths), `tradeOff`
  (what User gets and loses) and `acceptanceEffect` (what the option does to the Acceptance items, by label) are each
  optional. Every text is trimmed. Any other key, a blank text, an empty list or a repeated label is refused
  `question-options-malformed`; the terminal reads the notes as the Board does, so a session sees the refusal before
  it relays.
- A later note for the same question text replaces the earlier one. A job keeps the notes of its newest eight
  questions.
- When the job's question opens a decision or an incident, each option takes the facts of the note with its question
  text and its label, as `touches`, `tradeOff` and `acceptanceEffect` on the option, and the notes leave the job. An
  option no note names keeps its label and description alone. Notes for a question never asked leave with the job.

#### `need declare`

On a forge with entities, a build job changes only its own entity's homes. When the work needs a change in another
entity, the builder declares a need instead of making the change, and its job's ticket waits for the need's ticket:

```sh
forge need declare "Export the basket total" --entity shared --body-file need.md
```

- The body is the body of the need's ticket: a numbered `## Acceptance` that holds the intended use and a `## Brief`
  with a non-blank line, read as `ticket ready` reads a draft. A blank entity or title, or a body that lacks either
  section, is refused `need-incomplete`, naming each gap (`entity-missing`, `title-missing`, `acceptance-unnumbered`,
  `brief-missing`).
- Only a live build job that runs an entity's stage declares one; any other job, as every job of a forge without
  entities, is refused `need-outside-an-entity-build`. The entity is one the pipeline names (`need-entity-unknown`),
  and never the job's own (`need-of-own-entity`).
- A need for the entity and title the job declared before replaces that need's body, and the same body is nothing to
  do. A job declares at most five needs (`need-limit-reached`).
- A relayed declaration is admitted only from a builder whose job runs an entity's stage, and only complete
  (`need-outside-an-entity`, `need-incomplete`), before the hold. A need for a package whose change for the job's
  ticket a package review sealed is refused `need-for-sealed-package`: only the adapt stage's `package-return` changes
  a sealed package.
- The declaration is only recorded: no ticket is filed and nothing is logged.

When the builder then reports `needs-declared`, its job ends with that outcome, and its branch and commits stay. In the
same hold Hephaestus files each need it kept, in declaring order, and takes it off `needs`:

- The need becomes a ticket of its entity, with its title and body, stamped `filedByJob` with the declaring job, and is
  submitted at once: `committed` with ticket review off, `ready-for-review` with it on, where it waits for User like any
  ticket. Every ticket of the job gets it in `dependsOn`; the need's ticket waits on none of them. Each waiting ticket
  logs `need-declared`.
- A need for the root entity when that entity has no gates is no ticket: it opens `need-for-root` on the waiting
  tickets. A need for an entity that consumes the job's entity, directly or through another entity's `dependsOn`, would
  close a circle: it is no ticket and opens `need-closes-circle` on the waiting tickets. Every entity consumes the root
  entity, so each need of a root entity's job opens it. A need whose ticket would close a circle in the tickets'
  `dependsOn` is not added there and opens `need-closes-circle`.
- A job that reports `needs-declared` with no need kept, or a job without an entity, fails `no-report`.

On a pipeline with entities the Playbook then:

- launches nothing for a ticket with an unsettled dependency, whatever its status, so the waiting ticket keeps its
  status and its counters; a forge without entities still waits only with a `committed` ticket;
- runs a need's ticket at the highest priority of itself and the open tickets that wait on it, also through a need of
  a need, read at each pass, so raising a waiting ticket raises its needs;
- runs the stage that declared the needs again once each need's ticket is delivered, in the same attempt (a `reviewed`
  need is not on the main line yet, so it still holds the waiting ticket): the build resumes the declaring session, or a
  fresh session starts on the same branch, and either is told each need with its ticket and status and merges the main
  line in before it continues, where the needs landed, also when its own target is a group branch;
- drops a need's ticket that was abandoned from the waiting ticket's `dependsOn` and opens `need-abandoned` on it.

An open `need-for-root`, `need-closes-circle`, `need-abandoned` or `work-in-other-entity` decision holds the tickets it
names. A build of an entity gets one V17 resume: once a red handoff of the job was for a change outside its entity, a
second such V17 refusal fails the job with its reason, also after a red gate in between. When that build again changed
nothing in its own entity's folders, Customs refuses it `changed-only-outside-home-and-reach`, the job fails and
`work-in-other-entity` opens. A build that was never sent back for V17 gets its one V17 resume first. A V17 whose git
failed (`git-failed`) is an ordinary red handoff and spends no V17 resume.

`work-in-other-entity` offers `Move to <entity>` for each entity that owns the changed files, and `Abandon`.
Hephaestus acts on the answer at its next pass, with Hephaestus down at the answer too (E15). A move sets the ticket's
`entity`, logged `entity-assigned` with `by` `user` and the reason `work-in-other-entity <decision id>`, also past
`committed`, and clears its row's `stage` and `seals`. The ticket stays `in-progress`, never back through ticket review,
and its next build is a fresh attempt of stage 1 of the new entity: before its worktree is made, that build removes the
ticket's worktree and deletes its branch, once, so it starts from its target. A build of any ticket whose entity was set
after its previous job launched does the same. `Abandon` abandons the ticket. An answer that names no option acts on
nothing, so the ticket runs again as it stood.

### Jobs and sessions

| command | what it does |
|---|---|
| `jobs [--json]` | The live jobs, one line each (id, kind and role, state, tickets, attempt, child instance, a stop asked), then Hephaestus (`live` with its URL, or `down`), paused or not, agents against the limit, the open decisions and incidents, and a warning line per incident that took its default since Hephaestus last started. Read-only, no lock. `--json` prints `{jobs, hephaestus, paused, agentsInFlight, limit, openDecisions, openIncidents, defaultedIncidents}`, each defaulted one `{incidentId, move, cause, at}`. |
| `job show <J> [--json]` | The job's record from `progress.json`, or for a finished job what its `job-launched` and `job-ended` records hold, and its job folder; an unknown job is refused. Read-only, no lock. `--json` prints `{job, jobFolder}`. |
| `job attach <J> [--json]` | Every child instance's event log in instance order through the adapter's mapper, then the newest followed while the job is on the board; it never connects to Talos. Read-only, no lock. `--json` prints `{jobId, lines}` of the replay and follows nothing. |
| `job message <J> [--incident <I>] -- <text> [--json]` | Record a chat turn in a hold, logged `job-messaged`, with Hephaestus up or down; Hephaestus writes it to the live session in log order, once; to the Assistant only at its next idle point (see [The Assistant](#the-assistant)). [Reopening and refusals](#job-message) are below. |
| `job fresh <J> [--incident <I>] [--json]` | End the job `replaced`, holding nothing, so the next attempt starts on its worktree with the earlier-session note. `--incident` names the incident it handles; a job with no ticket is refused `job-has-no-ticket`. |
| `job wind-down\|stop <J> [--json]` | Logged `job-stop-requested` with its mode and kept as the job's `stopRequest`, with Hephaestus up or down. `wind-down` sends the wind-down turn; `stop` moves the job to `stopping` and Hephaestus has Talos stop its child, the job ending `stopped`. [What each holds](#job-wind-downstop) is below. |
| `job stop --all [--wind-down] [--json]` | `pause`, then a stop (or wind-down) of every build, review and product-owner job, in one hold. |
| `resume <J>\|<T> [--json]` | Resume interrupted work: record User's instruction for the job (`job-resume-instructed`), or for the ticket's interrupted job and its `interrupted:` hold, with Hephaestus up or down. [What it records and refuses](#resume) is below. |
| `resume --all [--json]` | Resume every job that waits for an instruction and lift every `interrupted:` hold, in one hold; nothing waiting is nothing to do, exit 0. |
| `resume --network-outage [--json]` | Resume every job that ended on a network outage, in one hold; nothing waiting is nothing to do, exit 0. |
| `intake -- <text> [--json]` | Record a `product-owner` job with no ticket and no launch slot, `launching`, with Hephaestus up or down; several may run at once. Hephaestus launches it in `<worktrees>/sessions/<J>/`, its first line `/<agent-po skill> <text>`, skills on, WebFetch and WebSearch allowed and Bash `allowedDomains: []`; it files draft tickets through its Hatch folder and never readies one. Follow-ups are `job message` turns. |
| `advise [--json]` | Record a [pipeline agent](glossary.md#pipeline-agent) job with no ticket, no target and no launch slot, `launching`, with Hephaestus up or down; its mode is `setup` with no pipeline and `advise` with one. Besides `pipeline setup`, it is the only thing that starts one. [Where it runs and what it writes](#advise) is below. |
| `intake close <J> [--set <id,id>]... [--json]` | Close the [product owner](glossary.md#product-owner)'s input (`job-not-intake` for another kind of job, `job-finished` once closed). Under the product owner's own job it names no job: Hephaestus stamps its own. [What follows](#intake-close) is below. |
| `intake title <J> -- <title> [--json]` | Give the intake a short title, kept on the job as `intake.title` and logged `intake-titled`, with Hephaestus up or down; a later title replaces it. Refused `job-not-intake` for another kind of job and `intake-title-empty` for a blank title. Under the product owner's own job it names no job: Hephaestus stamps its own. [Who runs it](#intake-title) is below. |

#### A launch that is not launched

Each launch starts the program the forge's agent names, never one found on Hephaestus's search path: a pipeline agent's
setup record's agent, else `pipeline.json`'s, through `<monitor>/config.json` when it follows the machine. A forge
that names no agent, an agent of another vendor than this program runs, a machine that names no program of the vendor,
and a program that is relative, inside the repository, a batch file on Windows, not there or not executable each
refuse the launch, with nothing spawned. The job keeps its state, stores `notLaunched` `{ cause, programPath }`, logged
`job-not-launched` once, and a notice words it (`job J1 is not launched: the Claude Code at ~/.local/bin/claude is not
there`); the board document carries it on the job. No pass tries the job again until the program the forge names reads
otherwise (it resolves, or names another path or cause: a change of the forge's agent or of the machine's config does
this), or until User looks again (`gate look-again`, `agent-look-again`); `gate agent` and `pipeline agent` look again
too. Each retry is logged `job-launch-retried`.

#### `job message`

A product-owner job that ended `closed` (its own `intake-close` or `job stop`), or a pipeline agent that a `job stop`
closed, is reopened instead, logged `job-reopened`: back on the board `running` in its next child instance, which
resumes its session by id in the same folder with the text as its first line.

- Any other finished job, or a session asked to quit at the end of its turn, is refused `job-finished`.
- The verb takes no picture. A `job-message` control command from a client may name pictures uploaded to
  `POST /api/pictures`, only to a product owner (`pictures-not-taken` for any other job); see
  [Commands](reference/hephaestus-api.md#commands).
- Under an incident it is refused `job-awaits-user-answer` for a job in `waiting-for-answer` or whose ticket has an open
  `agent-question`, and `job-is-product-owner` for User's product-owner session.

#### `resume`

`resume` records the command `interrupted-work-resume` in a hold: the forge carries it out at its next pass, at once
when it is up, else when it starts. Exactly one of a job, a ticket, `--all` and `--network-outage` is named; an
argument that starts with `J` is a job, any other a ticket. Under a job the Bouncer refuses it for every role.

- A job is resumed only while it is `interrupted`, or while an install or gate line a start found lost waits
  (`job-line-lost`); any other is refused `job-not-interrupted` (exit 1). The instruction is logged
  `job-resume-instructed`, and the resume that carries it out obeys every hold a resume obeys (usage limit, install
  change, outage, refused key, a missing pipeline). An instructed resume sets the job's `crashResumes` back to 0; for a
  lost line, the next pass runs the line again in its next instance.
- A ticket instructs its waiting job and lifts a hold that starts with `interrupted:`, logged
  `ticket-interrupted-hold-lifted` in place of `ticket-unheld`, so the ticket's failed passes and its builder's returns
  are kept. A ticket with neither is refused `ticket-not-interrupted` (exit 1). `ticket unhold` lifts the same hold as
  a person's unhold, with its resets.
- `--all` instructs every job whose resume waits for an instruction, a lost line's job included, lifts every
  `interrupted:` hold and lets an Apply held `interrupted` commit again (logged `pipeline-apply-requested`);
  `--network-outage` instructs every job that ended on a network outage. With nothing waiting either prints
  `Nothing interrupted waits for a resume.` and exits 0. A job that ends on an outage again waits again.

`unpause` is another command: it undoes a pause.

#### `job wind-down|stop`

- `stop` and `wind-down` hold the job's ticket `stopped by User (J<n>)` or `wound down by User (J<n>)` in the same hold
  (an already held ticket keeps its hold), which the policy never undoes. `ticket unhold` lets a fresh agent take it.
- A job with no session yet (launching, preparing, interrupted, awaiting an answer) ends `stopped` in the same hold.
- A stopped product owner is finished: its open decisions are withdrawn (`decision-withdrawn`), its draft tickets stay
  draft tickets, and it resumes only when User sends it a `job message`.
- A stopped pipeline agent ends `closed`, also one with no session yet, and a `job message` or User's next setup move
  opens it again.

> **As built.** A `job stop` does not stop a merge. It sends no frame to a merge agent. On POSIX, a stop reaches the
> groups below a job only through a live parent, so a tree whose leader died with its Talos stays unreachable.

#### `advise`

Nothing starts a pipeline agent by itself: with no pipeline stored the lifecycle opens `checks-not-set` and waits for
User's `pipeline setup`, and a paused board does not hold the launch. `advise` opens an advise record on the stored
pipeline, as `pipeline update` opens an update record, and launches its agent in the same hold; with no pipeline stored
it is refused `no-pipeline-to-update`, and beside an open record `setup-in-progress`. `--json` prints `{ setupId,
jobId, logged }`. The agent is a session, like the
product owner: a turn's `result` never ends it, `job stop` closes it, and a message opens it again with its
conversation. A crashed one resumes, also while no pipeline is stored.

Hephaestus launches it in a detached snapshot of the main line, writing only its Hatch folder, with no network. Its
first message starts with the line that runs the `forge-pipeline` skill, which holds the setup procedure; the
message then gives the record's facts and the current step, and each step message names the step of the skill. The
snapshot belongs to the [setup record](#datapipeline-setupjson), not to the job:
`<worktrees>/pipeline-agent/<S>/`, at the record's `snapshotCommit` (main's tip when the agent first launched), kept
across the record's jobs and checked out at a new `snapshotCommit` after `pipeline resume` moved it. An agent no record
names has its own, `<worktrees>/pipeline-agent/<J>/`. Once no open record and no live pipeline agent holds a snapshot,
Hephaestus removes it, and names one the removal leaves in `hephaestus.log`. A `<worktrees>/onboard/` folder an earlier
release left is a leftover worktree.

At each turn end Customs checks the snapshot: V16 (HEAD unmoved), V4 (clean), V5 (data folder untouched), V13 (agent
configuration untouched) and V14 (no foreign ref moved). The agent owes no report and files nothing, so V1 and V12 do
not run. A refusal logs `pipeline-snapshot-touched` once and opens the incident `setup-snapshot-touched`; the record's
Apply refuses `setup-snapshot-touched` until a resume checks the snapshot out at main's new tip.

A stored open `pipeline-proposal` decision, which an earlier release opened for the one-shot proposal, is withdrawn at
the next pass (`decision-withdrawn`).

The agent's first message holds its current step's instructions and the facts of its record: the findings, the
questions with their answers, the constitution with its sources, the draft and its edits. A fresh session in place of
a replaced one gets the same message, built again from the record, which is the agent's memory. User's Continue sends
the next step's instructions as a message. An advise record's agent reads the stored pipeline and the newest 200 gate
runs, and is told to propose edits of the record's draft and to file no ticket; User applies the edits User keeps.

#### `intake close`

In the same hold it submits every draft ticket it (and any session it took over from) filed, as `ticket submit` does:
with ticket review off each complete one becomes `committed` with its row, with it on each becomes `ready-for-review`
for User's `ticket ready`, and an incomplete one stays a draft. With ticket review off in a forge with entities, a
complete draft with no `entity` refuses the close with nothing written (`ticket-without-entity`). `--set` is stored on
the job and decides nothing. Once no child of it is live Hephaestus ends it `closed`.

A product owner interrupted by a reboot waits for User's resume, and an answer to its question counts as one: it then
resumes by id. One past the crash bound with no question open waits for User's resume in the same way; with a question
open it waits `awaiting-answer`, and once answered a fresh session takes over with its draft tickets and the answers in
its first message, never a resume.

#### `intake title`

The product owner runs it once it knows what the request is, as its prompt asks: a title of at most eight words, again
only when the request changes. The title is trimmed. A closed product owner that User's `job message` reopens keeps its
newest title; a fresh session that takes over a replaced one starts without one. The request itself is on the job's
`job-launched` record as `intakeText`, so a closed session keeps both its request and its title in the log once its job
has left the board.

The `intake` verb takes no picture. An `intake-start` control command from a client may name pictures uploaded to
`POST /api/pictures`, kept on the job as `intake.pictures` and logged as `intakePictures`; with a picture its text may
be blank, and without one a blank request is refused `intake-empty`. The pictures go with the first message of each
session of the intake, a fresh one after a replacement included.

### The board's lifetime

| command | what it does |
|---|---|
| `range --from <when> --to <when> [--tick <15m\|1h\|1d>]` | Store the default axis of the chart, with one log line. `--tick` takes any positive whole number of minutes, hours or days (`15m`, `2h`, `1d`), or a bare number of minutes. Besides a `<when>`, a bound may be `start`, the earliest visible row. A relative bound is stored as written, so `--from -2h` keeps meaning "the last two hours" on every refresh. A pair that is not in order is refused at exit 1 when both are timestamps or both are relative to now; a pair naming `start` or mixing the two is not judged. A client may override it for its own view, and sends a range as the control command `chart-range-set`, Fit as the automatic span. |
| `range --auto` | Reset the axis to the automatic span. It takes no `--from`, `--to` or `--tick`; any of them beside it is refused at exit 1. |
| `namespace [<name>] [--json]` | Print the board's branch namespace, or store `<name>` as `branchNamespace` in `progress.json`, with one log line (`Branch namespace set to <name>`, kind `branch-namespace-set`). A board with a namespace names its ticket branches `<program>/<name>/ticket-<id>` and its group branches `<program>/<name>/group-<group>`; one without keeps the bare `ticket-<id>` and `group-<group>`. A name is lower-case letters and digits, with dashes only between them, at most 40 characters. Refused at exit 1 with nothing written while a Hephaestus serves the board, while a job that works on a branch is on it (the Assistant and the product owner work on none, and a Hephaestus's stop leaves its Assistant on the board), while a branch is left under its current names, while a branch named as the program or as `<program>/<name>` blocks the new names, while the namespace already holds branches, and while another tracker of the repository's tracker list holds it; the board's entry in that list follows the name. `--json` prints `{ branchNamespace }`, `null` for bare names. |
| `clear [--all] [--yes]` | Throw away every task row and the log, restart the clock and reset the stored axis to automatic, leaving one `Tracker cleared` log line, and keep the tickets. `--all` deletes the tickets, every epic and `<data>/pictures/` too. `--yes` skips the confirmation, and is required when standard input is not a terminal. Refused at exit 1, writing nothing, while a job other than the Assistant is live (`tracker-has-live-jobs`). The Progress tab's Clear… asks first, then sends the control command `tracker-clear` with `scope` `tasks-and-log` or `everything` (`--all`); [what survives](#clear) is below. |

#### `clear`

- Each surviving ticket is given a fresh row seeded from its own frontmatter, with a fresh id, except a rowless ticket
  that stays off the chart.
- Row ids are not reused, and every epic file is kept untouched.
- Plain `clear` keeps `<data>/pictures/`; the next Hephaestus start removes every picture no log record and no live job
  names, as it does on any start. `--all` removes the folder after it deletes the ticket files.
- `--all` restarts the ticket ids at 001.
- `--json` prints `removedTaskCount`, `removedLogCount`, `deletedTicketCount`, `deletedEpicCount` and
  `reseededTicketCount`.

> **As built.** `clear --all` reuses ticket ids.

## Job contracts

These five sections are contracts, not command groups. Each says what a job does, what shows, and which moves User or
the [Assistant](glossary.md#assistant) has.

A job that ends in a hold while its session runs, such as a build that Customs ends, has its session asked to quit at
the end of its turn after that hold, and again each Pass until Talos takes the frame or the session ends, so the session
exits; Talos applies the agent's own quit act, and stops an agent that has none. That retry lives only in Hephaestus's
memory: a session whose quit was not taken when Hephaestus stopped runs on after the restart.

### A build job

A readied ticket's [build job](glossary.md#build-job) moves through `launching`, `preparing`, `running`, `in-customs`
and `gating`, one state to a [Pass](glossary.md#pass). Hephaestus adds `<worktrees>/ticket-<id>/` on branch
`ticket-<id>`, runs the install line, and launches the [builder](glossary.md#builder) with the ticket and every gate it
must pass. A builder ends by reporting; it never edits its ticket file.

[Customs](glossary.md#customs) verifies the report, the gates run, and when they pass Hephaestus replaces the ticket's
`## Handoff` with the report's handoff and Acceptance evidence and moves the ticket `in-review`.

On a forge with entities, Customs protects `.claude/`, `.mcp.json` and `<data>/` at the repository root and in every
entity home. A job of an entity installs with its entity's prepare steps, runs its entity's gates from the entity's
first home and stamps that entity's phase hash. Its session is told these gates, and Customs V15 holds it to them. A
gate's `definedBy` pattern without a leading `/` names a file of the entity's first home. The job may change only its
entity's homes and `reach`: a path that a deeper home of another entity holds is that entity's, and the root entity owns
every path that no other home holds. A `reach` path names only a path the root entity owns, such as the lockfile or a
root manifest: a pipeline whose `reach` lies inside or above the home of another entity, the root entity aside, is
refused.
Customs V17 refuses any other change and sends the session back once on a red handoff, whose `gate-failure.md` names
each path to take out; a second V17 refusal fails the job, and one whose branch still changed nothing in its own entity
also opens `work-in-other-entity` (see [`need declare`](#need-declare)). An entity's constitution changes only in a job
of a ticket of that entity: V17 refuses a change of another entity's constitution, and any constitution change in a
package stage, as `constitution-outside-ticket-entity`, also when the ticket body names the file, and sends the session
back once like any other V17 refusal. A job carries on only a session of its own entity and stage. A job without an
entity keeps the checks it always had.

A ticket of an entity whose `whitelist` names a package can cross into it by stages. Its stage 1 build may also write
a proposal in the homes of the whitelisted packages; V17 still refuses a branch that changed only those files
(`changed-only-outside-home-and-reach`). Once its gates pass, the paths the branch changed past its target are sorted
by owner. With no whitelisted package among the owners, the build settles as above. Otherwise its `## Handoff` is
written, it ends `built`, the ticket stays `in-progress`, and the row's `stage` moves to the `package-build` of the
first package, a package before the packages that consume it.

The `## Handoff` of a crossing ticket has one part per stage that built, each under its own heading, such as
`### Stage 2, package build of ui-kit`, in stage order. A stage replaces only its own part. The Acceptance evidence is
under `### Acceptance evidence`, written by stage 1 and replaced by `adapt` when it runs, so the last home build stage
owns it; a package build keeps it. Each move of the row's `stage` logs `stage-started`, each seal `seal-set`; a move
from `adapt` or the home `review` back to a `package-build` is a package return, which lifts that package's seal
(`seal-lifted`), counts in the row's `packageReturns` and logs `package-return`.

A crossing ticket's red handoffs, failed passes and review rounds are counted per stage, by the entity and stage number
its `job-launched` records name, from the log alone: no row key holds them, so they survive a restart of Hephaestus
and read the same once the board is read again from disk (E74). Red handoffs and failed passes start again when the
ticket starts a stage again; review rounds are kept when the ticket returns to a stage.

- **Package build (stage 2).** The package's builder answers for the commits since the first job of its stage, so a
  retry after a refused job still answers for that job's commits, under the package's homes and `reach`. Commits that
  all lie outside them are refused `changed-outside-home-and-reach`, never as work of another entity. It may commit
  nothing (no V3), and no package stage accounts for the ticket's Acceptance (no V8). Its report must also state
  `exposedSurfaceChanged`, else it fails `no-report`. Its gate run checks the package's gates, then the gates of each
  entity that consumes the package but the home entity, each from its own first home and named `<entity>: <gate>`; a
  red one is the package builder's red handoff. A consumer that a ticket of the crossing ticket's group belongs to, one
  not abandoned, is left out too: the group's release gates it (E26). A consumer's gate still red once the red
  handoff's resumes are spent opens `dependent-broken`, which names the gate and holds the ticket; the job ends
  `failed` with cause `gate-failed`. The decision offers `File a fix ticket for <entity>` and `Abandon`, which
  Hephaestus acts on at its next pass. A fix puts the ticket into the group `ticket-<id>` when it has none, logging
  `ticket-grouped`, and files a ticket of that consumer in the group that waits on the crossing ticket, submitted at
  once, logging `dependent-fix-filed`. The fix ticket becomes the group's release ticket when the group has none open,
  and takes the mark from a crossing ticket that carries it; any other release ticket waits on it. A consumer with a
  ticket in the group already gets no second one. The ticket's next package build leaves the consumer's gates out.
  Gated green, it ends `built`, keeps the statement in its job folder as
  `stage-statement.json`, and the row moves to the `package-review`. A package builder whose constitution forbids the
  change reports `refused` with its `refusedReason` (E22): the job ends `refused`, its branch and commits kept, and the
  `package-refused` decision opens with the reason as its context and holds the ticket. The reason also waits in its
  job folder's `stage-statement.json`. Only a package build may report `refused`. The decision offers
  `Drop the package change`, `Turn it into a need` and `Abandon`, which Hephaestus acts on at its next pass. A drop
  moves the row back to the home's `build`: stage 1 is told the reason, and the package is no longer among its proposal
  homes for this ticket, so V17 sends back a stage 1 that still changes it, and its branch no longer crosses into it. A
  stage 1 whose branch then stays in its entity settles as any build, and the row's `stage` is cleared. A need does the
  same and files the change as a ticket of the package, by the refused job, with the reason and the ticket's change of
  the package's homes past its target, which the crossing ticket waits on as on a declared need. Once that ticket is
  delivered, stage 1 runs again and is told the settled need and to merge the main line first, as a build that ended
  `needs-declared` is. `Abandon` abandons the ticket.
- **Package review (stage 3).** Its report must also give `exposedSurfaceConfirmed`, true when the build's statement is
  right. It settles its round as any review: its record and findings, and a further round when its fixes pass the
  package's own `review.reReview` threshold, rounds counted in this stage only. It writes no `## Review` section and
  proposes no waiver. A claim `does-not-hold` ends it `does-not-hold` and the row goes back to the `package-build`.
  Otherwise its confirmation, `reviewText` and `sealedReachPaths` go to `stage-statement.json`, the row's `seals` gains
  the package's seal, the job ends `reviewed` and its bar closes. The seal is a SHA-256 of the ticket's own change past
  the newest commit of the target the branch holds, without hunk line numbers or blob ids, on the package's homes, a
  deeper home of another entity left out, and on `sealedReachPaths`: the package's `reach` paths that its stages
  changed since its first package build. The next crossed package's build follows; after the last, the home `review`
  when every package's build stated no change and its review confirmed it, with the ticket moved `in-review`, else
  `adapt`.
- **Adapt (stage 4).** The home builder resumes its stage 1 session; when that session cannot resume, a fresh one
  starts on the branch. It answers only for its own commits. Gated green it settles as a build above, and the row moves
  to the home `review`. A package that does not give the home what it needs, or one more change in a package, is a
  package return: the builder reports `package-return` with what the package must give in `packageReturnReason`, and
  names the package in `packageReturnEntity` when more than one is sealed. Its own commits still answer to V17, so
  they hold no change of a package; it runs no gate and ends `package-return`, its branch and commits kept, and the
  reason waits in its job folder's `stage-statement.json`. The row then returns to that package's `package-build`,
  whose builder is told the reason. A second return opens the `second-return` decision, which holds the ticket, and the
  row keeps `adapt`. A report that names no sealed package, or a `package-return` from any other stage, fails
  `no-report`.
- **Review (stage 5).** The reviewer gets each package review's `reviewText`. A review that does not hold moves the row
  back to `adapt`, also for a cause in a package, which the adapt builder then returns to that package.

Before a crossing ticket's next stage launches, a package of its stored crossing (a sealed package, or the package of
its package stage) that its home's whitelist no longer names opens `whitelist-removed-mid-crossing` once, naming the
ticket and, in its `context`, the packages (E19). It holds the ticket. `Finish under the old whitelist` lets the stored
stages continue, the crossing keeping those packages until the ticket goes back to `build` or changes entity.
`Turn the package change into a need` lifts each such package's seal (`seal-lifted`), moves the ticket `in-progress`
when it was `in-review`, moves the row back to `build`, and files each package's change as a need as for
`package-refused`, whose delivery runs stage 1 again as there. A package that stage 1 changed but whose package build
had not started when the whitelist dropped it stays in the crossing, since its proposal is no longer crossable: once the
package review before it seals, the row moves to its `package-build`, which opens the decision as for a crossed
package.

From the package build on, a job whose branch no longer holds a sealed change is refused V17
`sealed-change-altered`, which sends the session back once, as any other V17 refusal of a job of an entity. The
Airlock's merge and conflict work are exempt.

A crossing ticket's conflict and red gates go to the entity that owns them. In its Airlock, the files of a sealed
package that conflict go first to that package's builder, which stages them and leaves the merge open while other
files still conflict; the home's last worker resolves the rest and commits the one merge. The Airlock agent of an
entity runs that entity's stage, so it resumes that stage's newest session. A resolution that a package's builder took
part in goes to that package's conflict re-reviewer whatever its size; the home's goes to the home's above
`airlock.reReview`. A red gate on the merged tree aborts the merge and ends the merge job `failed`: a sealed package's
gate, or a gate of an entity that consumes it, as `package-gate-red`, which lifts the package's seal, counts the return
in `packageReturns` and moves the row to that package's `package-build`; any other as `home-gate-red`, which moves the
row to the home `adapt`. Either way the ticket goes `in-progress`, and its newest ended build job's folder keeps the red
handoff that the next build takes over. A second package return opens the `second-return` decision, which names the
package in its `context` and holds the ticket at its stage and status; past the red handoff's resumes the ticket parks
`parked:red-resumes-spent`. The review's catch-up is routed the same way. A red catch-up gate sends a package review
back to its `package-build`, no return counted, and the home review to `adapt`, the seal kept. A catch-up conflict sends
a package review whose conflict is only in its package's files back to its `package-build`; it sends the home review to
`adapt` when no sealed package's file conflicts, and back to the package when only that package's files conflict, a
second return opening `second-return`. A catch-up that conflicts in a package's and the home's files, or a package
review's catch-up that conflicts in home files, parks the ticket `parked:conflict-without-one-owner` with a `parked`
decision whose `context` lists the conflicted files, at its stage. This park is the handling of a catch-up conflict with
no single owner, kept on purpose (E66): no one entity's stage can resolve the conflict, so User resolves it. A group's
landing gates only the entities it changes; the entities that consume them are gated when the release lands on the main
line.

| what happens | what shows | moves for User or the Assistant |
| --- | --- | --- |
| worktree creation, the install line or a gating prepare step fails, or a gating prepare step changes a tracked file | incident `setup-failed`; the job ends `stopped` | `worktree repair`, `ticket park` |
| the session exits without a valid report, the report says `cannot-build`, a commit carries an attribution trailer, or Customs refuses for any reason the next row does not name | a [failed pass](glossary.md#failed-pass), `job-ended` `failed` with its cause; an attribution trailer also shows the `attribution-found` notice, and a V13 refusal also opens the `branch-touches-agent-config` decision | none: the next attempt is automatic, up to the bound; answer the decision where one opened |
| a gate fails, Customs refuses V3 (no commit), V4 (a dirty worktree), V15 (missing or stale gate claims) or, for a job of an entity, V17 once (a change outside its entity's homes and reach), or a session working off a red handoff spends its call budget and grace | a [red handoff](glossary.md#red-handoff): the same session resumes on `gate-failure.md`, the red-handoff note, up to `RED_HANDOFF_RESUMES_BEFORE_PARKING` (2) times, then the ticket parks `parked:red-resumes-spent` with a `parked` decision | `ticket unhold` for a fresh attempt |
| the report says `blocked` | incident `blocked`; the job ends `blocked` | `job fresh`, `worktree repair`, `ticket park` |
| the report says `wound-down`, or a session not working off a red handoff spends its call budget and grace | incident `out-of-calls` | `job fresh`, `ticket park` |
| a gate exits 126 or 127, or a signal kills it | incident `gate-cannot-run`; the job ends `stopped` | `gate retry`, `worktree repair`, `ticket park` |
| a gate, prepare or install line is refused because confinement is `unavailable` | incident `sandbox-unavailable`; the job ends `stopped`; the line never starts | `gate retry`, `ticket park` |
| on Linux, the worktree's `.claude/` folder cannot be made before a gate, prepare, install or worker launch | incident `sandbox-unavailable`; the job ends `stopped`; the launch never starts | `gate retry`, `ticket park` |
| no `pipeline.json` is stored | the `checks-not-set` decision; nothing launches, no pipeline agent either | `pipeline setup`, `gate add`, `gate none`, `advise` |
| `pipeline.json` is malformed | the `checks-not-set` decision; nothing launches | repair or delete `<data>/pipeline.json`: every `gate` write refuses it until then |
| `pipeline.json` is older, written by an earlier release with no `version` or one below 2 | the `checks-not-set` decision; nothing launches | set the pipeline up again: every `gate` write refuses it (`older-pipeline`) until it is deleted |
| a running build or review's event log stands still for `QUIET_JOB_SWEEPS` (6) sweeps | incident `quiet-job` | `job message`, `job fresh` |
| a pipeline agent's turn end finds its snapshot changed (Customs V16, V4, V5, V13 or V14) | `pipeline-snapshot-touched` and incident `setup-snapshot-touched`, facts `setupId`, `check`, `reason`, `paths`; Apply refuses `setup-snapshot-touched` | `job message`, `incident note`; `pipeline resume` once main moved, or `pipeline start-over` |

A ticket an open incident names launches no new job until the incident is settled.

On macOS and Linux a line never runs unconfined: `start` refuses at exit 1 where confinement is `unavailable`, naming
what is missing, and each gate path refuses again. On Windows the answer is `unconfined-by-design` and a line runs
unwrapped in its job worktree.

### The Airlocks

After each Pass Hephaestus sweeps one [Airlock](glossary.md#airlock) per target: the main line and each `group-<name>`
with an open ticket. A queued ticket merges in a `merge` job, whose record carries
`airlock: {target, targetTip, branchTip, phase}`. An Apply waiting for its commit goes before every ticket of the main
line, in a `constitution-commit` job ([The constitution commit](#the-constitution-commit)).

The merged tree is gated with the merge phase's gates, unless it is the branch's own tree, that tree last passed and the
row's green is current in the merge phase; a pass on the branch's own tree records the row's green in the merge phase.
It is then landed by a compare-and-swap fast-forward, logging `merge-landed`. A group ticket lands on `group-<name>` of
kind `integrated` and moves to `reviewed`; the group's release ticket lands its whole bundle on the main line.
The gate runs beside Hephaestus's pass, so no pass waits for its lines: the job stays in phase `gating`, and the first
sweep after the run ended settles the job from the outcome the run kept in `<data>/merge-gates/<hash>/outcome.json`
(`{formatVersion: 1, gate}`), written once at its end. The folder's hash covers the worktree, the tree, the phase, the
gated entities and the phase hashes of the pipeline the run read, so a changed pipeline is another run, and an ask while
a run is in flight starts none. The folder goes once its outcome settled the job. A run that Hephaestus's stop ended
keeps no outcome, and the next start removes its folder and runs it again.

The ticket's last worker is its newest ended build or review job, read from the log whatever the pipeline says now, with
that job's role: a review step removed since still gives the reviewer. With none ended, it is the reviewer, or the
builder with no review step. A conflict re-reviewer is never a later merge's last worker: a freed Airlock slot puts the
branch back at its own tip. With `airlock.reReview` absent no conflict re-review runs; a resolution of exactly
`thresholdLines` lines goes straight to the gate.

`merges` shows the queue.

| what happens | what shows | moves for User or the Assistant |
| --- | --- | --- |
| a ticket's merge-in conflicts | the ticket's last worker is resumed in the Airlock worktree with the target tip and the conflicted files; it commits the merge; the Airlock slot stays held | none: the agent cannot ask |
| the agent in the Airlock cannot finish | the merge aborts, the Airlock slot frees and the `merge-refused` decision opens | answer the decision |
| the resolution changed more lines than `airlock.reReview.thresholdLines`, or git cannot tell how many | the agent ends `resolved`, and a `conflict-re-reviewer` starts as a fresh session in the Airlock worktree, phase `re-reviewing`; it reports as a reviewer, fixes what does not hold, and the merged tree's gate follows | none |
| the conflict re-review leaves a claim `does-not-hold` or `waiver-proposed`, or its HEAD is not the one it reports or does not descend from the resolution | the merge aborts, the Airlock slot frees (cause `re-review-failed`; `no-report` for an invalid report) and the `merge-refused` decision opens | answer the decision |
| the merged tree fails its gate | the same agent is resumed with the red handoff message, the conflict re-reviewer after a re-review, on the red handoff ladder (`RED_HANDOFF_RESUMES_BEFORE_PARKING`, `RED_HANDOFF_RESUME_CALL_BUDGET`) | none |
| the merged tree still fails its gate after the resumes | the merge aborts, the Airlock slot frees and the ticket parks `parked:merge-gate-red` with a `parked` decision | answer the decision |
| the agent's session cannot be resumed | a fresh agent of the same role starts on the same worktree with the ticket's Handoff and Review, as the same attempt | none |
| a group refresh's merge-in conflicts | the refresh aborts, the Airlock slot frees and the `merge-refused` decision opens | answer the decision |
| a merged tree's gate cannot run | incident `gate-cannot-run`; the Airlock slot waits | `gate retry`, `worktree repair`, `ticket park` |
| a merged tree's line is refused because confinement is `unavailable` | incident `sandbox-unavailable`; the Airlock slot waits | `gate retry`, `ticket park` |
| a merged tree's prepare step fails or changes a tracked file | incident `setup-failed`, its `gate` fact naming the step; the Airlock slot waits | `worktree repair`, `ticket park` |
| the Acceptance is not accounted for at landing | the ticket leaves the queue, held, with the `landing-refused` decision | answer the decision |
| the main checkout is off the main line, or its changes block the fast-forward | that target's landings wait under the `dirty-main-checkout` notice; each sweep checks the target again | clean the main checkout |
| another process holds a file of the target's checkout open, so git cannot replace it (Windows), on each of `HELD_CHECKOUT_RETRY_TRIES` (3) tries | the files git already wrote go back to HEAD; that target's landings wait under the `target-file-held` notice, which names the held files; each sweep checks the target again | close the program that holds the file |

#### The constitution commit

[Apply](#apply)'s stage 1 leaves a request whose `CONSTITUTION.md` main lacks. The main line's Airlock commits that text
in a `constitution-commit` job, role `null`, no ticket, no agent and no Customs. It is the one write of this program to
the main line outside a ticket's landing. The job runs no gate of any phase, takes no gate slot and opens no
`merge-refused` decision: the commit changes only the listed constitutions, and the path check below lets nothing else
land.

- **Allocation.** Each sweep, while a request waits (`committing` with no live job, or `held`) and no job holds the
  main line's slot, the Airlock reads main's `CONSTITUTION.md` first, or on a draft with entities each entity's
  constitution file, whose drafted text the job lists. Main already holding every listed text finishes
  Apply at once, with no job and no commit. Otherwise the job is claimed on main's tip, before any ticket candidate,
  also while the board is paused, and the request becomes `committing` under it. While a ticket holds the slot, or the
  main line is held, the request waits, and so does every ticket of the main line.
- **Phases.** `committing`, then `landing`, each written in its own hold; never `merge-in`, `gating` or `fixing`. The
  job logs `job-launched`, then `merge-landed` (kind `landed`) and `job-ended` (outcome `committed`, with the commit)
  when it lands; it logs no `merge-started`.
- **Commit.** In a detached worktree of the slot's `targetTip` at `<worktrees>/constitution-commits/<J>/`, which the
  job owns: main's blob of `CONSTITUTION.md` at that tip must be the record's `baseBlob`; the draft's text is written
  byte for byte, staged with `git add -- CONSTITUTION.md` and committed with
  `git commit --no-verify -q -m <subject>`, hooks off, in Hephaestus's own process and with the repository's own
  configuration. The subject is `Add the repository constitution` when main had no such file, else
  `Update the repository constitution`, with no body. No call overrides `commit.gpgsign`. The commit may change only
  the paths it lists against the tip; a forge without entities lists `CONSTITUTION.md` alone, so its commit changes
  exactly that path. A list on a forge with entities, each entity's drafted constitution, is checked blob by blob
  against each entity's `baseBlob`, staged in one `git add --` and committed under `Update the constitutions`, also
  when it lists one file.
- **Landing.** The same compare-and-swap fast-forward of the main checkout a ticket's landing uses, with no Acceptance
  check. The landing's hold runs Apply's stage 2. The worktree is removed after the hold, and after every end of the
  job.

| what happens | what Hephaestus does | moves for User |
| --- | --- | --- |
| main's `CONSTITUTION.md` changed since the record opened | the job ends `failed`; the request is `refused`, `constitution-moved` | start the update again |
| git cannot make the commit where the repository sets `commit.gpgsign` (no agent, or a pinentry the detached Hephaestus cannot answer) | the job ends `failed`; the request is `refused`, `constitution-commit-unsigned`, with git's text in `pipeline-apply-refused`; no commit exists | commit the text as `CONSTITUTION.md` by hand, signed, then Apply again |
| git cannot make the commit otherwise | the same, `git-failed` | Apply again |
| the commit changes any other path | the job ends `failed` before landing; the request is `refused`, `constitution-commit-unexpected-paths` | Apply again |
| the stored pipeline changed by hand while the commit waited | the job ends `failed` before landing; the request is `refused`, `pipeline-moved` | start the update again |
| a ticket started while the commit waited and the draft turns the pipeline into entities, or a ticket took an entity the draft removes | the job ends `failed` before landing; the request is `refused`, `entities-while-tickets-in-flight` (E94) or `entity-named-by-tickets` (E91) | wait for the ticket, or give it another entity, then Apply again |
| the main checkout is off the main line, holds a change to `CONSTITUTION.md` that stops the fast-forward, holds a file open, or git fails | the main line is held under its notice, the job ends `stopped` (`target-held`), and the request is `held` with the reason, logged `pipeline-apply-held` with the blocking files; it is never refused for this | clean the main checkout: the next sweep commits again |
| main moved past the slot's tip | the job ends `stopped` with the landing's reason, and the next allocation commits again on the new tip | none |
| the request no longer names the job: User cancelled it | the job ends `stopped` (`apply-cancelled`) before it lands | none |
| a job is found in `committing` with its worktree already there: a run was cut short | the job ends `stopped` (`orphaned`), its worktree removed, and the next allocation replaces it | none |
| the first sweep after a start that leaves interrupted work waiting (a reboot, a crash, a stop on purpose) finds the job, not landed | the job ends `stopped` (`orphaned`), its worktree removed, and the request is `held`, `interrupted`; no sweep commits it again by itself, and the main line's tickets wait behind it | `resume --all` |
| a job is found in `landing` whose commit main already holds: a run was cut short after the fast-forward | the board side finishes: `merge-landed`, the job's end and Apply's stage 2 | none |

A ticket's builder or reviewer running meanwhile is not refused for it: Customs V14 exempts the commit worktree's
detached HEAD and the landing of a job ended `committed`.

#### Merge approval

With `approvals.merge` on (`gate approval merge on`), a green review does not queue at once. The review job moves
to `merging-main`: Hephaestus brings the ticket's worktree up to the target's tip before User reviews the code. With
no review phase, a green build does the same, before its Handoff is written and its ticket moves `in-review`. Each
round of `merging-main` is one child instance of the job, and keeps its files in the job folder suffixed like a gate
folder (`-<instance>` past the first). The reviewer prompt still tells the reviewer to merge the target into the branch
as the last step of its review, so `merging-main` finds the branch up to date unless the target moved since.

| the round | what Hephaestus does |
| --- | --- |
| the worktree holds the target's tip and its green is current in the job's phase | the job ends (`reviewed`, or `built` with its Handoff), the ticket is marked `mergeQueued` and waits for User's Merge |
| the worktree lacks the tip | it records both tips (`main-merge.json`) and merges the tip in with every hook off, in a line Talos runs in a child folder of its own (`main-merge`), as the merge before review does |
| the merge is clean, or the worktree holds the tip on a tree whose green is not current | it gates the tree with the job's phase's gates, `review`, or `build` with no review phase (`main-gate-run.json`); green ends the job and queues the ticket |
| a gate is red | a red handoff: the job's own session resumes, the reviewer, or with no review phase the builder |
| the merge conflicts | the merge is aborted and the worktree reset to the branch tip (`main-conflict.json`); a red handoff of kind `merge-conflict`: the job's own session resumes to merge the tip itself, resolve, commit and report again |
| the session's resolution changed more lines than `airlock.reReview.thresholdLines`, or git cannot tell how many | at the first round after it, a `conflict-re-reviewer` starts as a fresh `merge-agent` job under the job, its attempt the conflict's round, and reports as a reviewer before the gates run; with `airlock.reReview` absent, or at the threshold, the gates run at once |
| the conflict re-review leaves a claim `does-not-hold` or `waiver-proposed`, its report is invalid, or it ends any other way | the re-reviewer ends `does-not-hold`, and the job ends `failed` (cause `re-review-failed`): a failed pass, and the next attempt merges again |
| the merge cannot run or settle | incident `setup-failed` (step `main-merge`); the job ends `stopped` |

Each red handoff counts on the session's ladder, so the one past the last resume parks the ticket
`red-resumes-spent`. A conflict re-reviewer whose session could not be resumed is replaced by a fresh one with the
same attempt; a job stopped while its re-reviewer works stops the re-reviewer first. A ticket in review done
(`mergeQueued`, its green current) is waiting for merge: no Airlock takes it until User accepts it with `merge accept`,
which sets the row's `mergeAccepted` only while `git merge-tree` predicts a clean merge into its target's current tip.
Each Pass, the board state serves every waiting ticket under its target as `mergeQueue.targets[].waitingForMerge`,
`{ticketId, priority, againstTarget, conflictedFiles}`, `againstTarget` one of `clean`, `conflicting` (with its files)
or `prediction-failed`, in the order the tickets were queued. `merge update` merges the target into a waiting ticket's
worktree with no Airlock held; Hephaestus never runs it by itself. Clearing `mergeQueued`, or leaving in-review,
clears `mergeAccepted` too.

User's press order sets the train: an accepted ticket's readiness is the place of its newest `merge-acceptance-set`
`accepted` record in the log, and each Airlock takes the earliest accept first, then the lowest ticket id, whatever
the priority or the predicted conflicts. `mergeQueue.targets[].order` lists the accepted tickets in that order.
Once accepted, the ticket runs the same merge train as with merge approval off: a conflict, a large resolution and a
red merged tree go as [The Airlocks](#the-airlocks) says, to its last worker and the conflict re-reviewer in the
Airlock, and `mergeAccepted` stays set. After User's Merge, only the conditional re-review guards what the last worker
changes.

| what happens to an accepted ticket in its Airlock | what shows | moves for User |
| --- | --- | --- |
| its merge-in conflicts, or the merged tree fails its gate | the ticket's last worker is resumed in the Airlock; the slot stays held, and the ticket keeps `mergeQueued` and `mergeAccepted` | none |
| the merged tree passes | it lands, with no second approval | none |

### A review job

A ticket `in-review` gets a [review round](glossary.md#review-round) when the pipeline has a `review` key; without one,
a gated build queues to merge at once and lands on its gates alone.

A review job starts a [review bar](glossary.md#review-bar), reuses the ticket's worktree, and moves through the same
states as a build job. Once verified and gated, Hephaestus counts the rework, commits
`Review round <n> of #<id>: no changes` when the reviewer committed nothing, appends `## Review <n>` and takes the
[round verdict](glossary.md#round-verdict).

Before the reviewer starts, the review job brings the branch up to its target. Once the install line passed, Hephaestus
reads the target's tip and checks that the branch holds it. A branch that holds it starts its reviewer with no merge and
no gate run. Otherwise Hephaestus records both tips in the job folder and merges the target's tip into the ticket's
worktree (`git merge --no-ff --no-edit`), in a line Talos runs in its own child folder, `target-merge`, with every hook
off. That merge is Hephaestus's own git, so it runs outside the gate sandbox.

| the merge | what Hephaestus does |
| --- | --- |
| is clean | it gates the merged tree with the build phase's gates, each step in a `target-` child folder; the reviewer starts only when every gate is green, at once when the build phase has none |
| is clean, but a gate is red | the job ends `does-not-hold` (cause `target-gate-red`) and the ticket goes `in-progress`; the builder's session resumes with the red handoff, its gate failure note in the review's job folder |
| conflicts | the merge is aborted and the worktree reset to the branch tip; the job ends `does-not-hold` (cause `target-conflict`) and the ticket goes `in-progress`; the builder's session resumes with the target tip and the conflicted files |
| cannot run or settle | incident `setup-failed` (step `target-merge`); the job ends `stopped` |

Each return to the builder counts with its red handoffs, so the return past the last resume parks the ticket
`red-resumes-spent`. The review job checks only once, against the tip it recorded: a target that moves after the check
is merged in by the Airlock.

The threshold is the `pipeline.json` `review.reReview.thresholdLines`. On a pipeline with `entities` it is the ticket's
own entity's, or for a stage of a crossing ticket the reviewing entity's, never the top level's. A review with no
`reReview` grants no further round at any rework, and shows no `rounds-not-converging` notice. With no readable
`pipeline.json`, the threshold is `REWORK_ROUND_THRESHOLD_LINES` (750). Round 2 needs only the rework over the
threshold; from round 3 on, the findings must also converge.

| the review | what Hephaestus does |
| --- | --- |
| claims an item `does-not-hold` | the job ends `does-not-hold` and the ticket goes `in-progress`: a resume of the builder when its build was `built`, counted with its red handoffs, otherwise a failed pass |
| reworked over the threshold and the round verdict grants another round | the job ends `round-granted`, and a fresh reviewer runs one round on as a `re-reviewer` |
| reworked over the threshold and was refused another round | it passes on; the ticket shows the `rounds-not-converging` notice |
| claims an item `waiver-proposed` | the `waiver` decision opens, the job waits `awaiting-answer`, and the ticket leaves the merge queue, held. The answer is only recorded, so it is taken with Hephaestus down too; Hephaestus's next pass acts on it. An answer that starts with `refuse` ends the job `does-not-hold` (cause `waiver-refused`) and the ticket goes `in-progress`, as for a claim that does not hold. Any other answer writes each proposed item `A<n>. Waived: <reason>` in the ticket's Acceptance, ends the job `reviewed` and marks the ticket `mergeQueued` while its green is current on the worktree's HEAD tree, else it waits unqueued for a fresh review. Proposals stored in `<data>/jobs/<J>/waiver-proposals.json` that cannot be read waive nothing: the job ends `does-not-hold` (cause `waiver-proposals-unreadable`) |
| otherwise | the job ends `reviewed`, the ticket is marked `mergeQueued` and `merge-queued` is logged with its target; with merge approval on, the job first moves to `merging-main` and ends there ([Merge approval](#merge-approval)) |

Review done is `mergeQueued`. Hephaestus sets it only when the last job's report cleared Customs and the row's
`greenTree` is the tree of the branch HEAD and its `pipelineHash` the current hash of its `greenPhase` ([the pipeline
hashes](#the-pipeline-hashes)); with no review phase the same rule applies to the builder's report. A reviewer that left
the tree as it was skips its gate run only while that green is current for the review phase's gates; under changed gates
its gates run first. The Airlock admits a queued ticket only while its `greenTree` is its branch HEAD's tree and its
`pipelineHash` the current hash of its `greenPhase`, and lands a merged tree ungated only when it is that green tree and
that green is current in the merge phase. Before each allocation the Airlocks gate a stale green (the tree or the
pipeline changed) in the ticket's worktree with no slot held, in the phase of its green. The gate runs beside
Hephaestus's pass, as the merged tree's does; a stale green is no candidate, so the ticket keeps `mergeQueued` until a
later sweep reads the outcome, and then loses it: green records the tree and queues the ticket again; red leaves it
unqueued with no `greenTree`, writes the red handoff in the `stale-green` folder of the job folder of the last session
that passed (its reviewer, or with no review phase its builder, whose ticket goes `in-progress`), and the next session
of that kind takes it over; a gate that cannot run opens its incident on the ticket. A worktree that cannot be gated
clears `mergeQueued` at once. With no review phase, a ticket in review that is not queued is queued there once its green
is current.

### The Assistant

While the board's switch is on (`gate assistant on`; a new board has it off), Hephaestus has one `assistant` job, the
[Assistant](glossary.md#assistant): no ticket, no launch slot, never resumed. It receives open
[incidents](glossary.md#incident) in numbered chats and settles them through its Hatch. An incident it leaves takes its
default when its chat turn closes.

While the switch is off no Assistant boots, and every open incident takes its default in the pass, logged
`incident-defaulted` with the cause `assistant-off`. Switching it off lets a live Assistant finish its turn: an incident
delivered in that turn waits for the turn's end, then takes its default if the Assistant left it, and the Assistant's
input closes once it is idle.

User reads and talks to it with `incidents`, `job message <J>`, `incident note`, and the Assistant tab. `job message` is
written at its next idle point.

### Under a job: the Hatch

A session Hephaestus launched cannot write the data folder; its Hatch folder is its one way to change the board. It
counts as under a job with both `FORGE_JOB_ID` and `FORGE_HATCH_DIRECTORY` set ([Environment
variables](#environment-variables)).

- **Direct:** `help`, `status`, `usage`, `review-stats`, `ticket show|list`, `epic show|list`, `draft show|list`,
  `hook bash-domains`, `hook session-start`, `hook stage-edits`, `version`, `status`, `decisions`, `incidents`,
  `merges`, `jobs`, `job show|attach`, `gate list` and `concurrency` with no argument, which only reads, run as usual.
- **Relayed:** a verb of a control command parses its arguments as usual, then, before any install-version check, writes
  `<hatch>/requests/<requestId>.json` atomically, `{hatchFormatVersion: 1, requestId, command, bodyText?}`, and waits
  for `<hatch>/replies/<requestId>.json`, up to `HATCH_REPLY_TRIES` times `HATCH_REPLY_INTERVAL_MILLISECONDS` apart. It
  prints `done <requestId>` or `nothing-to-do <requestId>` with the tickets it touched at exit 0, or the refusal worded
  as a direct run words it. With no reply it prints `queued <requestId>` at exit 0. A request Hephaestus applied but
  whose reply it did not write (a crash or a Hephaestus lock takeover after the hold committed) is not applied again: a
  later pass writes the same reply from its `hatch-applied` record.
- **Refused:** every other verb, at exit 1 (`verb-not-relayable`).
- **Identity:** a request names no job and no role. Hephaestus takes both from the Hatch folder's job record and
  refuses a request carrying either `hatch-identity-mismatch`.
- **Filing:** an admitted filing is stamped `filedByJob`, in the ticket file's format.
- **Needs:** an admitted `need declare` is stamped with the declaring job; only a builder of an entity's stage relays
  one.

> **As built.** A refused relayed command keeps what it changed before the refusal, so "nothing written" holds only at a
> terminal.

**Findings.** A builder's, reviewer's or merge-gate fixer's finding is that relayed low ticket. Hephaestus puts the
tickets of the filing job (the finders) in its `dependsOn` and, when a finder has a group, the finding in that group;
the worker cannot set either. The filing is then submitted as `ticket submit` does: with ticket review off a complete
finding is `committed` and builds only once its finders are `reviewed` or `delivered`; with it on it is
`ready-for-review`. A worker names no entity: in a forge with entities Hephaestus files its finding for the entity
that owns every path its Brief's `Work belongs in:` line names, so a builder's or a reviewer's finding about a package's
file is that package's (E83, E53). A line that names no path, or paths of several entities, leaves the finding in the
entity of the job that filed it, and paths outside that entity are then refused `work-outside-entity`. A finding that
would still reach `committed` without an entity is refused `ticket-without-entity`; both refusals come before the
finding is filed, so no draft stays behind. When a finder is abandoned, each of its findings that did not start moves to
`ready-for-review` and loses that dependency in the same hold, whatever the switch says.

## Platforms

The core is the same TypeScript on Bun everywhere; each OS-dependent capability is a port with one adapter per OS,
selected once per process. The program has run only on macOS arm64. Every Linux and Windows statement on this page
describes what the code does, proved over fakes on that Mac, never on the OS itself;
[the platform status](development/platform-status.md) lists what has never run, per OS and per port.

| | macOS | Linux | Windows (native, not WSL) |
| --- | --- | --- | --- |
| Architectures | arm64 (run), x64 (never run) | x64, arm64 (never run) | x64, arm64 (never run) |
| Needs | Bun at `.bun-version`, git, a logged-in `claude` | the same, and `bwrap` with user namespaces it may create | the same, and an absolute `SystemRoot`; `setup.ps1` needs PowerShell |
| Gates | confined by Seatbelt, `/usr/bin/sandbox-exec` | confined by bubblewrap | unconfined by design |
| Sessions | in Claude Code's sandbox, which must start | in Claude Code's sandbox, which must start | unconfined by design |
| `start` where confinement is unavailable | refuses at exit 1 | refuses at exit 1 | never: nothing is confined |
| Stop of a process | SIGTERM, then by force | SIGTERM, then by force | by force: `taskkill` of the whole tree |
| Talos endpoint | a Unix socket, path at most 103 bytes | a Unix socket, path at most 107 bytes | a named pipe with a random name |
| Owner-only files | mode 0700 and 0600 | mode 0700 and 0600 | the profile's inherited ACL, read back with `icacls.exe` |
| Temp folders a tracker may not live in | `os.tmpdir()`, `/tmp`, `/var/tmp` | `os.tmpdir()`, `/tmp`, `/var/tmp` | `os.tmpdir()` |

Talos outlives its Hephaestus only where nothing kills Hephaestus's whole process group, cgroup or job:

- On Linux, a logout ends a Talos started from that login session when logind sets `KillUserProcesses=yes`.
- In a container, run with `--init` (as `docker run --init`), so a process reaps an ended Talos and its ended children;
  without it an ended one stays a zombie, which still reads as a live process.
- On Windows, a detached child stays in its parent's job object, as Bun has no option to break away from it. When
  Hephaestus starts inside a job that ends its members on close, as some terminals and CI runners do, closing it ends
  the board's Talos and its children. Start Hephaestus from a plain console.

In the Git Bash terminal (mintty), standard input is a pipe and not a console, so no command sees a terminal: `clear`
refuses without `--yes`, and must be given it there.

What native Windows loses with no confinement: a worker's or a gate's shell can read Hephaestus's token and the
launch data, and so drive Hephaestus's API with no role check; it can write another job's Hatch folder, and the
Bouncer then takes that write as the other job's; it can forge a gate-ran record, move any ref, and reach any network.
Customs and V14 find a moved ref only afterward. Run on Windows only what you would run unconfined on your own
account.

The repository's own development tooling, `.claude/hooks/fix-lint-on-edit.sh` and `.readme-graphics/`, is for
the owner's macOS and Linux machines only; it is no part of the product.

## Exit codes

| code | meaning | examples |
|---|---|---|
| **0** | done, or there was nothing to do | also a command under a job that printed `done`, `nothing-to-do` or `queued` with its request id, `stop` with no live Hephaestus, every `hook session-start` run, and every `hook bash-domains` and `hook stage-edits` run, a deny answered through its JSON |
| **1** | a refusal the caller can act on | no tracker here (run `{{program}} init`), no such task or ticket, a missing `--reason`, a move the matrix refuses, readying a ticket that is not a draft or lacks a numbered Acceptance or a Brief (`incomplete-tickets`), lowering a ticket that is not a draft or committed, a `network` domain that is not public, `ticket deliver --by-hand` while a Hephaestus is live (`hephaestus-owns-the-lifecycle`), an answer to a decision already answered, a move its incident does not allow, a command under a job that its role may not run or that Hephaestus refused, a second Hephaestus (`hephaestus-already-running`), installed files of another install version (every command but `init`, `update`, `help`, `status`, `version`, `stop`, `talos-restart` and `machine`; run `{{program}} update`), `init` or `update` over files a newer {{program}} installed, `hook` given a wrong event word, an extra argument or an option, and an unknown command |
| **2** | a state the tool will not repair on its own | an unreadable or malformed progress file, an unreadable or malformed log.jsonl, a malformed ticket file a command names, a lock it could not take, a Hephaestus whose Hephaestus lock a newer generation took (`hephaestus-lock-taken`), and any error the tool did not expect |

Check the code rather than the wording.

## The Handoff and the token column

A ticket's body ends with a [Handoff](glossary.md#handoff) section. Under Hephaestus it is code's: written from the
builder's verified report once its gate passes. The review round and whoever picks the work up next read it instead of
re-deriving it from the diff.

Every row carries a token count, shown beside the bar. Hephaestus credits a job's tokens to its tickets' rows when it
ends, logging one `agent-stopped` record; `GET /api/state` carries a running job's figure. `--tokens` on a task or
ticket move replaces the figure. A row without a figure (`null`) is not a row that cost nothing; it is a row nobody
measured.

## The dashboard

No forge command opens a page, and forge writes no pointer to one. The live Hephaestus serves the board over its API
([Hephaestus's API](reference/hephaestus-api.md)), and a client shows it.

## Files on disk

This section holds the stored formats.

A mutating command writes in the [order under Conventions](#conventions), under one lock hold. Before the first file it
writes `hold-journal.json` with the contents of every file it changes, and removes the journal after the last. Every
file a reader may hold open is written atomically: a temporary file beside the target, fsync, rename. On Windows a
rename or removal of a file something else holds is retried 12 times, under 2 seconds in all. Timestamps carry the
offset of the machine that wrote them and are displayed as written, never re-parsed into a viewer's zone.

### `<data>/progress.json`

The board's state. The example shows the shape; the tables below give each key's values.

```jsonc
{
  "version": 2,
  "trackerId": "…",
  "project": "Example Agency",
  "startedAt": "2026-09-18T20:55:10+02:00",
  "view": { "kind": "auto" },
  "nextTaskId": 19,
  "concurrencyLimit": 2,
  "hephaestusState": "running",
  "nextDraftId": 3,
  "nextJobId": 5,
  "jobs": [
    {
      "id": "J4",
      "kind": "merge",
      "role": null,
      "ticketIds": ["003"],
      "parentJobId": null,
      "attempt": 1,
      "target": "main",
      "state": "merging",
      "interruption": "reboot",
      "childInstance": 1,
      "eventCursor": { "instance": 1, "sequence": 12 },
      "answeredRequestIds": [],
      "crashResumes": 0,
      "airlock": { "target": "main", "targetTip": "a1b2c3d", "branchTip": "b2c3d4e", "phase": "merge-in" }
    }
  ],
  "nextDecisionId": 3,
  "decisions": [
    {
      "id": "E2",
      "kind": "agent-question",
      "ticketIds": ["003"],
      "jobId": "J4",
      "askedBy": "builder",
      "requestId": "toolu_example",
      "questions": [
        { "question": "Which export format?", "header": "Format", "multiSelect": false,
          "options": [{ "label": "CSV", "description": "Comma separated" }] }
      ],
      "context": "Rewrite the importer",
      "openedAt": "2026-09-18T21:40:00+02:00"
    }
  ],
  "nextIncidentId": 2,
  "incidents": [
    {
      "id": "I1",
      "kind": "setup-failed",
      "ticketIds": ["003"],
      "jobId": "J4",
      "facts": { "step": "install" },
      "defaultMove": "worktree-repair",
      "deliveredInTurn": null,
      "openedAt": "2026-09-18T21:41:00+02:00"
    }
  ],
  "hephaestusFirstStartedAt": "2026-09-18T21:00:00+02:00",
  "tasks": [
    {
      "id": 17,
      "name": "Rewrite the importer",
      "status": "in-progress",
      "start": "2026-09-18T21:30:54+02:00",
      "end": null,
      "owner": "opus",
      "note": "",
      "ticket": "003",
      "tokens": 48000,
      "agent": "003",
      "reviewed": "2026-09-18T22:10:00+02:00",
      "reviewRound": 2,
      "mergeQueued": true,
      "history": [
        { "status": "committed", "at": "2026-09-18T21:12:00+02:00" },
        { "status": "in-progress", "at": "2026-09-18T21:30:54+02:00" }
      ]
    },
    {
      "id": 18,
      "name": "Review 1 #003 — Rewrite the importer",
      "status": "in-progress",
      "start": "2026-09-18T22:00:00+02:00",
      "end": null,
      "owner": "opus",
      "note": "",
      "ticket": null,
      "tokens": null,
      "reviewOf": "003",
      "reviewBarRound": 1,
      "pipelineHash": "0f871814e52ef878",
      "greenPhase": "review"
    }
  ]
}
```

#### Top-level keys

| key | optional | value |
|---|---|---|
| `version` | no | `2`, the only version read. |
| `trackerId` | no | Names the tracker to a client, which may key its own storage by it. |
| `project`, `startedAt` | no | The project name and when the tracker started. |
| `view` | no | `{ "kind": "auto" }`, or kind `absolute` or `relative` with `from`, `to` and `tickMinutes` (a number or null). |
| `nextTaskId` | no | The number the next row takes, never wound back, so an id is never reused. |
| `concurrencyLimit` | yes | Absent reads 2, above 10 reads 10. |
| `hephaestusState` | yes | `running` or `paused`; absent reads paused. |
| `nextDraftId` | yes | The number the next filing draft takes, written by the first `draft open`, never wound back. |
| `nextSetupId` | yes | The number the next pipeline setup record takes (`S2`), written by the first opening, never wound back. |
| `nextJobId` | yes | The number the next job takes (`J5`), written by the first launch, never wound back. |
| `jobs` | yes | The unsettled jobs in launch order, written by the first launch. |
| `nextDecisionId` | yes | The number the next decision takes (`E3`), written by the first opening, never wound back. |
| `decisions` | yes | The open decisions for User in opening order, written by the first opening. |
| `nextIncidentId` | yes | The number the next incident takes (`I2`), written by the first opening, never wound back. |
| `incidents` | yes | The open incidents for the Assistant in opening order. |
| `hephaestusFirstStartedAt` | yes | Hephaestus's first start on this board, kept by `clear`. |
| `branchNamespace` | yes | The namespace the board's branches are named under, written by `namespace`; absent, the branches have bare names. |
| `tasks` | no | The rows. |
| `needs` | yes | The needs build jobs declared with `need declare`, in declaring order, each `{jobId, ticketIds, entity, title, body}`: the declaring job, its tickets, which wait for the need, the entity the need is for, and the title and body of the ticket it becomes. Written only by a declaration, so a forge without entities never writes it. Hephaestus takes a job's needs off as it files them, a job that ends any other way drops its needs unfiled, and the key goes with the last one. |

<details>
<summary>A job's keys</summary>

| key | optional | value |
|---|---|---|
| `id` | no | `J<n>`. |
| `kind` | no | `build`, `review`, `merge`, `merge-agent`, `refresh`, `constitution-commit`, `assistant`, `product-owner` or `pipeline-agent`. |
| `role` | no | `builder`, `reviewer`, `re-reviewer`, `conflict-re-reviewer`, `assistant`, `product-owner` or `pipeline-agent`, or null for a merge, refresh or constitution commit job. A review job past its first round has `re-reviewer`. A `merge-agent` job has the role of its ticket's last worker, `builder`, `reviewer` or `re-reviewer`, or `conflict-re-reviewer`. A job whose kind or role an earlier release named, such as `onboarder`, is refused with the older-format advice. |
| `ticketIds` | no | The job's tickets. |
| `parentJobId` | no | A merge agent's merge or refresh job, or the build or review job in `merging-main` a conflict re-reviewer works under, else null. |
| `attempt` | no | From 1. |
| `target` | no | The main line or `group-<name>`, or null for a session. |
| `state` | no | `launching`, `preparing`, `running`, `waiting-for-answer`, `interrupted`, `awaiting-answer`, `in-customs`, `gating`, `merging-main`, `merging`, `landing` or `stopping`. |
| `interruption` | yes | Why it was last interrupted: `talos-lost` (its child was lost: no end was recorded for it, as when its Talos died; a Talos that failed, such as on a full disk, first writes `talos failed: <cause>` to its `talos-<n>.log`), `agent-crashed`, `reboot`, `answer-delivery`, `usage-limit`, `handoff-red`, `forced-stop-refused` (its lost child's tree refused the forced stop: never resumed, the stop tried again each sweep), `authentication-failed` (the API refused the key under API billing: resumed once the `api-authentication-failed` decision is answered), `talos-paused` (a clean quit of Talos ended the session at its turn end: resumed by itself, as after a reboot), `lease-ended` (Talos stopped the agent at its turn end because Hephaestus stopped renewing its lease), `network-outage` (the agent ended on a network outage or a provider overload its retries did not outlast), `forge-stopped` (the agent ended with a stop of the forge on purpose, found gone at the next start) or `forge-crashed` (the agent was gone with a crash of the forge, Hephaestus or Talos, found gone at the next start). `lease-ended`, `network-outage`, `forge-stopped` and `forge-crashed` wait for User's resume: nothing resumes or replaces the job by itself, and none counts as a crash. The resume policy of every cause is `RESUME_POLICY_OF_CAUSE` (`src/lib/tracker-model/constants/ResumePolicy.ts`). |
| `childInstance` | no | The newest child instance launched or to launch, from 1. |
| `eventCursor` | no | `{ instance, sequence }`, the last event of the job's child applied. |
| `answeredRequestIds` | no | The question requests already answered. |
| `crashResumes` | no | Resumes after `talos-lost` or `agent-crashed` since User last instructed a resume: an instructed resume sets it to 0 and adds nothing. |
| `airlock` | yes | While it holds its target's Airlock slot: `{ target, targetTip, branchTip, phase }`, phase `merge-in`, `resolving`, `re-reviewing`, `gating`, `fixing`, `committing` (a constitution commit job only, whose `branchTip` is the `targetTip` it commits on) or `landing`. |
| `stopRequest` | yes | `stop`, `wind-down` or `fresh`, written once User asked it. |
| `intake` | yes | On a product-owner job: `{text}`, `pictures` (`[{pictureId, name}]`) only when the request came with some, then `title` once the product owner ran `intake title`, `proposedDraftSets` once its intake closed and `carriedAnswers` on a fresh session that took over a replaced one. |
| `pendingOptionNotes` | yes | Written only while `question options` notes wait for their question: `[{question, options: [{label, touches?, tradeOff?, acceptanceEffect?}]}]`, at most eight. |
| `entity` | yes | The entity whose stage the job runs, written by Hephaestus at launch only on a forge with entities. |
| `stage` | yes | The ticket's stage the job runs, from 1, written with `entity`. |
| `notLaunched` | yes | Written only while the job's launch [stands refused](#a-launch-that-is-not-launched) for its agent's program: `{ cause, programPath }`, `programPath` `null` when the forge named none. |

</details>

<details>
<summary>A decision's and an incident's keys</summary>

| key | on | value |
|---|---|---|
| `id` | both | `E<n>` or `I<n>`. |
| `kind` | decision | `agent-question`, `parked`, `waiver`, `landing-refused`, `merge-refused`, `checks-not-set`, `target-moved`, `branch-touches-agent-config`, `outage`, `quiet-job`, `leftover-worktree`, `forced-stop-refused` (a job ended `blocked` after its child tree refused the forced stop three times; its `context` holds the tree's process ids, and it holds the job's tickets), `pipeline-proposal` (retired: a stored open one is withdrawn at the next pass), `api-key-not-set`, `api-authentication-failed` (the API refused a session's key; no agent starts while it is open) `budget-reached` (a session stopped at `maxBudgetUsd` and its job ended `blocked`; it holds the job's tickets), `need-for-root` (a declared need is for the `root` entity and `root` has no gates; the owner makes the change or declines), `need-closes-circle` (a declared need would close a circle in `dependsOn`; it is refused), `need-abandoned` (the ticket filed for a need was abandoned; the waiting ticket continues without it or is abandoned), `work-in-other-entity` (all the work of a ticket belongs to another entity; the ticket moves there or is abandoned), `whitelist-removed-mid-crossing` (a package left the whitelist while a ticket crossed into it; the ticket finishes under the old whitelist or the package change becomes a need), `package-refused` (a package build refused the package change its constitution forbids; its `context` holds the reason; the package change is dropped, becomes a need, or the ticket is abandoned), `second-return` (a crossing ticket would return to a package build a second time; the owner agreed to one way back, so the ticket stays at its stage; its `context` names the package) or `dependent-broken` (a dependent entity's gate is still red in a package build once the red handoff's resumes are spent, so the package change breaks that dependent; the job ends `failed` with cause `gate-failed`, its `context` names the gate, and the ticket of the dependent is filed in the ticket's group, or the ticket is abandoned). `package-refused`, `second-return`, `dependent-broken` and `whitelist-removed-mid-crossing` hold the tickets they name. Each offers its choices as options; Hephaestus acts on the answer to `work-in-other-entity`, `package-refused`, `whitelist-removed-mid-crossing` and `dependent-broken` (see [`need declare`](#need-declare) and the stages of a crossing ticket), and the others release the ticket. |
| `kind` | incident | `system-question`, `malformed-ticket`, `setup-failed`, `out-of-calls`, `blocked`, `job-lost`, `resume-failed`, `gate-cannot-run`, `sandbox-unavailable`, `quiet-job` or `setup-snapshot-touched`. |
| `ticketIds` | both | The tickets it names. |
| `jobId` | both | The job, or null. |
| `askedBy` | decision | A job role, `hephaestus` or `assistant`. |
| `requestId` | decision | The question request it was opened for, or null for one code opened. |
| `questions` | decision | AskUserQuestion's own shape. An option also carries `touches`, `tradeOff` and `acceptanceEffect`, each written only once its asker noted it with `question options`. |
| `context` | decision | Text shown with the questions. |
| `facts` | incident | Text Hephaestus names; `requestId` when a question opened it. |
| `defaultMove` | incident | The move it takes when its delivery turn closes unhandled. |
| `deliveredInTurn` | incident | Null, or `{ jobId, chatSequence }`, the Assistant's chat turn it went out in. |
| `openedAt` | both | When it opened. |

</details>

<details>
<summary>A row's keys</summary>

| key | optional | value |
|---|---|---|
| `id`, `name` | no | The row's id and name. |
| `status` | no | `committed`, `in-progress`, `paused`, `in-review`, `re-review`, `reviewed`, `delivered` or `abandoned`. |
| `start`, `end`, `owner`, `note` | no | Stamps and text. |
| `ticket` | no | The ticket's id, or null for a free-standing row. |
| `tokens` | no | A number, or null: "nobody said", which is not "it used none". |
| `agent` | yes | Rows sharing it count as one agent; no production path writes it. |
| `reviewed` | yes | When the row first reached reviewed, kept through delivery. |
| `reviewRound` | yes | The review round, from the second. |
| `mergeQueued` | yes | `true` once the ticket's review passed, until it lands or leaves in-review. |
| `mergeAccepted` | yes | With merge approval on, `true` once User's `merge accept` accepted the queued ticket; cleared with `mergeQueued`. |
| `history` | yes | Every status the row reached, oldest first, starting with its filing; absent on a row filed before the field existed. |
| `reviewOf` | yes | The ticket this row reviews. A row is a review bar by this key alone, never by its name. |
| `reviewBarRound` | yes | Which review of that ticket this bar is, from 1; on a bar with a `stage`, which review of that stage. |
| `pipelineHash` | yes | The phase hash of the gates the row's ticket was last gated by, in `greenPhase` ([the pipeline hashes](#the-pipeline-hashes)). |
| `pipelineHashes` | yes | On a forge with entities: the phase hash of each entity whose gates that run ran, by entity key ([the pipeline hashes](#the-pipeline-hashes)). Written with `pipelineHash` by a run of entities' gates, removed by any other; a forge without entities never writes it. |
| `greenPhase` | yes | `build`, `review` or `merge`: the phase of that gate run, written with `pipelineHash`. A row with `pipelineHash` and no `greenPhase` has no current green and is gated again; a read adds none. |
| `greenTree` | yes | The tree OID Hephaestus's last gate run on the row's ticket passed, under `pipelineHash` in `greenPhase`. Written by a green run, removed by any other; a row that never passed has none, and a read adds none. |
| `stage` | yes | On a forge with entities, once the ticket crosses into a whitelisted package: `{ name, entity }`, the stage it is in (`build`, `package-build`, `package-review`, `adapt` or `review`) and the key of the entity whose agent runs it; Hephaestus launches the ticket's next job from it. On a review bar of a forge with entities: the stage its reviewer runs. A ticket that stays in one entity, and every row of a forge without entities, has none. |
| `seals` | yes | The seal of each crossed package that a package review sealed, by package entity key: a hash of the ticket's own change to that package. |
| `packageReturns` | yes | How many times the ticket went back from `adapt` or `review` to a package build, from 1; written at the first return. |

</details>

#### What makes the file unreadable

Each of these reads as exit 2:

- a version 2 file holding `log`, or a version other than 2. A file at version 1, which holds its own log, is not read:
  its reason ends in `OLDER_FORMAT_ADVICE`;
- a present `concurrencyLimit` that is not a whole number of at least 1;
- a `hephaestusState` outside the two;
- a `nextDraftId`, `nextSetupId` or `nextJobId` that is not a whole number of at least 1, or a `nextDecisionId` or
  `nextIncidentId` below 1;
- a present optional row key of the wrong shape: `reviewRound` below 2, `reviewBarRound` below 1, a row `pipelineHash`
  or `greenTree` that is not text, a `greenPhase` other than `build`, `review` or `merge`, a `history` that is not a
  list of known statuses with their stamps, or a `mergeQueued` or `mergeAccepted` that is not `true`;
- a job, decision or incident whose field is missing, outside its vocabulary or of the wrong shape;
- a `hephaestusFirstStartedAt` that is not text;
- a `branchNamespace` that is not lower-case letters and digits with dashes only between them, at most 40 characters;
- a row or history phase in a status the file format does not know, the retired `running` or `finished` included, with
  the same advice.

A file holding `checkCommand`, `installCommand`, `checksDefinitionFiles`, `gateKeyCommand` or `gateCachePaths`, or a row
holding `checkCommand`, is an older file: its reason names the key and ends in `OLDER_FORMAT_ADVICE`. The gate pipeline
lives in [`pipeline.json`](#datapipelinejson).

#### Writing and unknown keys

- Keys the tool does not know survive a read and a write, in the file's order: at the top level, on a row, on a job, its
  `eventCursor` and its `airlock`, and on a decision, its questions and their options, an incident and its
  `deliveredInTurn`. A ticket's unknown frontmatter lines do the same.
- One exception to that order: an unknown key whose name is an integer, such as `"2024"`, keeps its value, but a write
  moves it to the front of its object, before every other key, because JavaScript lists such keys first. Give a key you
  add by hand a name that is not a number, so the file stays byte-identical.
- `jobs`, `nextJobId`, a row's `mergeQueued` and `mergeAccepted`, `decisions`, `nextDecisionId`, `incidents` and
  `nextIncidentId` are each written only once set, so a file without them stays byte-identical.
- A stored `dispatcherState` or `dispatcherRunId` is an unknown key: kept byte for byte and never read, so such a board
  reads as paused until `unpause`.

#### Ids and lifetimes

- A task is linked to at most one ticket. Task ids are never reused, not even after `task remove` or `clear`.
- Job ids are `J<n>`, decision ids `E<n>` and incident ids `I<n>`, never reused or gap-filled.
- A job ends only through `job-ended`, which takes it off `jobs` in the same write. A later move of an ended job is
  refused `job-finished`, and a move the job's state does not allow `job-move-illegal`.
- A job's state lives here and is never logged; no process identity is stored on the board.
- `decisions` and `incidents` hold only what is open. An answered or withdrawn decision, and a handled, defaulted or
  escalated incident, leave in the same write and live on in the log.
- A question is keyed by its `requestId` (an incident's by its `requestId` fact) against the open decisions and
  incidents and its job's `answeredRequestIds`, which an answer joins, so a replayed request opens nothing twice. An
  answer gives one text per question, kept by question text; [Refusals](reference/refusals.md) lists what a wrong answer
  prints.
- `hephaestusFirstStartedAt` is written once, by Hephaestus's first `hephaestus-started` on the board, and never
  rewritten. Only a start on a board with neither it nor a `hephaestus-started` log record moves every unheld low
  `committed` ticket to `ready-for-review`, whatever the ticket review switch says, so a start after `clear` moves
  nothing.

### `<data>/pipeline.json`

The board's pipeline, beside `progress.json`, never tracked and never inside a branch. The `gate` verbs and an
[Apply](#apply) write it through the lock, in its one format, version 5; a file of any other version is refused. Only a
tracker at its repository's root holds a pipeline with `entities`: in a tracker in a folder a write that would store one
is refused at exit 1 with nothing written, and a stored one reads as malformed, both as `entities-in-a-folder`.

```json
{
  "version": 5,
  "prepare": [{ "name": "install", "run": "bun install --frozen-lockfile", "in": "/" }],
  "gates": [
    { "name": "tests", "run": "bun test", "fix": "bun run lint:fix", "definedBy": ["package.json"] }
  ],
  "phases": { "build": ["tests"], "review": ["tests"], "merge": ["tests"] },
  "review": { "name": "strict", "reReview": { "thresholdLines": 750 } },
  "constitution": { "path": "CONSTITUTION.md" },
  "agents": {
    "reviewer": {
      "model": "opus",
      "effort": "high",
      "instructions": [{ "kind": "constitution" }, { "kind": "default-brief", "role": "reviewer" }]
    }
  },
  "reach": ["/packages/shared", "/bun.lock"]
}
```

| key | required | value |
|---|---|---|
| `version` | yes | `5`, the one format; written first |
| `prepare` | yes | steps in run order, each `name` and `run`, with an optional `in`, the folder it runs in as a gate's `in` names one |
| `gates` | yes | every gate, defined once, each `name` and `run`, with optional `fix`, `in`, `definedBy`, `network`, `writes` and `forgeOnly: true`; an empty list is no gates on purpose. `in` is a folder of the project in the worktree, or of the repository when it starts with `/`, which alone is the repository's root; it holds no `..`, drive or backslash. `forgeOnly: true` is a gate run by the forge alone, never by an agent in its worktree |
| `phases` | yes | `build`, `review` and `merge`, each a list of gate names in run order; every gate is in at least one phase, and a phase names each gate at most once. The `gate` verbs put a new gate in every phase |
| `review` | no | `name`, and `reReview` (`thresholdLines`, a whole number of at least 50) when a re-review after the review's fixes is on; its presence sets the review phase. On a pipeline with `entities`, a ticket's own entity's `review` sets it for that ticket, whatever this one says |
| `airlock` | no | the merge train: `reReview` (`thresholdLines`, a whole number of at least 50) when a re-review after a conflict merge is on: see [The Airlocks](#the-airlocks) |
| `constitution` | no | `{ path }`, a path inside the repository, in place of `<data>/briefs/defaults/constitution.md`. An [Apply](#apply) sets it to `CONSTITUTION.md` when its draft holds a constitution |
| `agents` | no | settings per role: `productOwner`, `builder`, `reviewer`, `reReviewer`, `conflictReReviewer`, `pipelineAgent`, `assistant`. Each holds an optional `model` (`haiku`, `sonnet`, `opus`, `fable`), `effort` (`low`, `medium`, `high`, `xhigh`, `max`) and `instructions`, a list read top to bottom of `{ "kind": "constitution" }`, `{ "kind": "default-brief", "role": <role> }` (`<data>/briefs/defaults/<role>.md`) and `{ "kind": "file", "path": <path> }` (a path inside the repository; one under `<data>/` is read from disk, any other from the main line). Absent `instructions` is the role's default list: the constitution then the role's default brief for `builder` and `reviewer`; the constitution, the reviewer's default brief, then the role's own for `reReviewer` and `conflictReReviewer`; the role's default brief alone for the others. An empty list reads the role's built-in brief, a short brief the program carries and never installs, so the agent still knows its job. Each entry is listed at most once. A role's `model` and `effort` apply at each session's first launch; one it does not name is its default: `opus` and `medium`, `sonnet` and `medium` for `assistant`, `opus` and `high` for `pipelineAgent`. A review past its first round runs as `reReviewer` and reads its list. An Airlock agent reads the list of the role whose session it carries on, and takes the pair of the build or review job whose session it carries on. A ticket's `model` and `effort` are not applied |
| `approvals` | no | `tickets`: `true` or `false`, the ticket review switch `gate approval` writes; absent reads as `true`. `merge`: `true` or `false`, the merge approval switch; absent reads as `false`. Any other key or value makes the file malformed. It is not part of `pipelineHash`. |
| `billing` | no | How every agent Hephaestus starts is billed, the Assistant and the product owner included. Absent, or `{ "mode": "subscription" }`, is the default: the subscription of the agent's own login (for Claude Code, the Claude login). `{ "mode": "api", "maxBudgetUsd": <number> }` bills the account of the API key in the variable the agent adapter names (for Claude Code, the Claude Console account of `ANTHROPIC_API_KEY`; [API billing set-up](#api-billing-set-up)); `maxBudgetUsd` is optional, a positive number that the agent adapter gives each launch of a session as its budget (for Claude Code, `--max-budget-usd`). It holds no key and no command: any other key or mode, or `maxBudgetUsd` with `subscription`, makes the file malformed. It is not part of `pipelineHash`. |
| `assistant` | no | `true` while the board's Assistant is on, as `gate assistant on` writes it; absent is off, and any other value makes the file malformed. It is not part of `pipelineHash`. |
| `agent` | no | The agent every job of the forge runs: `{ "vendor": "<vendor>", "program": { "follows": "machine" } }`, this machine's program of that vendor in `<monitor>/config.json`, or `{ "program": { "pinned": "<absolute path>" } }`, a program for this forge alone, kept as found. An Apply stores the setup record's; `gate agent` sets it. Absent, no agent is chosen and no job launches: each [stands not launched](#a-launch-that-is-not-launched). Any other shape makes the file malformed. It is not part of `pipelineHash`. |
| `tools` | no | The programs whose folders an agent's search path holds, `[{ "name": "bun", "path": "/Users/x/.bun/bin/bun" }]`, each name once, each path absolute and kept as found. Absent, the tools follow the pipeline: each program its prepare steps and gates run (a gate's `fix` too) is found at each launch in the places `gate tools` names. `git` is always one. A launch gives the agent exactly the folders of the tools that were found, then the agent program's own folder, then the system's (`/usr/bin`, `/bin`, `/usr/sbin`, `/sbin`), and nothing else of Hephaestus's own search path. The list is no security boundary; the sandbox is. It is not part of `pipelineHash`. |
| `reach` | no | the repository paths besides the project that a ticket may change, each starting with `/` and named once, never `/` alone, as `gate reach` writes them; absent reaches none. It is not part of `pipelineHash`. |
| `entities` | no | each entity by its key, with `kind` (`app`, `package` or `root`, at most one `root`), `home` (repository folders, each starting with `/`; `/` alone only for the root entity), its own `prepare`, `gates` and `phases`, and optional `summary`, `constitution`, `review`, `agents` (`builder`, `reviewer`, `reReviewer`, `conflictReReviewer`), `whitelist`, `reach`, `dependsOn` and `concurrency`. Beside it the pipeline's own `prepare`, `gates`, `constitution` and `reach` stay empty. Two equal homes, a `whitelist` or `dependsOn` naming no entity, a whitelisted entity that is not a `package` with a `review`, or a circle in `dependsOn` makes the file malformed. A ticket of an entity that whitelists a package can cross into it by stages. |

A file with no `version`, or a version below 5, is older: an earlier release wrote it, and no release converts it. The
board reads it as no pipeline, and `gate list` and every `gate` write refuse it at exit 1 (`older-pipeline`); set the
pipeline up again. A higher version, an unknown key at any level, a missing required key, a step or gate without `name`
or `run`, a name given twice or shared by a prepare step and a gate, a phase naming an unknown gate, a gate in no
phase, a model or effort outside the lists above, an instruction entry listed twice or a path outside the repository
makes it malformed: the board reads it as no pipeline, and `gate list` and every `gate` write refuse it at exit 1. Each
launch writes `<data>/jobs/<J>/instructions-<instance>.json`, `{ files: [{ path, contentHash }] }`, the first 16 hex
digits of each file's SHA-256 as it was read. A job's first launch writes `<data>/jobs/<J>/launch-settings.json`,
`{ model, effort }`, the pair its session runs on, and never rewrites it: every resume of that session, a later
instance's or another job's that carries it on, runs on the recorded pair, whatever the pipeline says by then.

#### API billing set-up

The agent adapter names the variable that holds the key (`AgentCredentials.billingKeyVariableName`). For Claude Code,
the one adapter, it is `ANTHROPIC_API_KEY`, and this section names Claude Code's variables. With `billing` mode `api`,
each session gets the key from that variable in Hephaestus's environment, and from nowhere else. The key must never
go in a committed file, nor in `pipeline.json`, a ticket or any other file: set it at OS level, where Hephaestus
starts.

- In every mode Hephaestus never passes its own `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` on to a session; in
  mode `api` it passes only `ANTHROPIC_API_KEY`, which Talos copies from its own environment as it starts the
  session, so no file, job record, log or decision holds the key. `CLAUDE_CODE_OAUTH_TOKEN` and the
  cloud-provider variables pass in both modes. A session can read the key from its own environment.
- In mode `api` with `ANTHROPIC_API_KEY` unset, empty or blank, Hephaestus starts no agent and opens one
  `api-key-not-set` decision naming the variable and this section.
- Hephaestus reads its environment when it starts: after you set or change the key, run `stop` and start
  Hephaestus again from where the variable is set.
- In mode `api`, a session result with `api_error_status` 429 interrupts the job as a usage limit (`usage-limit-hit`,
  window `api-rate-limit`), never Customs: nothing launches or resumes for `API_RATE_LIMIT_BACKOFF_SECONDS` (60), and
  then the job resumes.
- In mode `api`, a result with `api_error_status` 401 or 403 (a refused key, or a managed `forceLoginMethod` or
  `forceLoginOrgUUID` setting that refuses keys) interrupts the job, cause `authentication-failed`, and opens one
  `api-authentication-failed` decision whose `context` holds the status and the vendor's text. While it is open no
  agent starts or resumes; answer it with `decide` once the key is fixed.
- In mode `api`, a result of subtype `error_max_budget_usd` ends the job `blocked`, cause `budget-reached`, and opens a
  `budget-reached` decision whose `context` names `maxBudgetUsd`. It holds the job's tickets until answered; one
  without tickets, an Assistant's, holds Assistant boots.
- These mappings are built from the probes and planted lines, not yet from a recorded run of each answer.

| OS | a Hephaestus started from a terminal |
|---|---|
| macOS | `export ANTHROPIC_API_KEY=<key>` in the shell profile (`~/.zprofile` or `~/.zshrc`) |
| Linux | `export ANTHROPIC_API_KEY=<key>` in the shell profile (`~/.profile` or `~/.bashrc`) |
| Windows | `setx ANTHROPIC_API_KEY <key>`, then open a new terminal |

### `<data>/pipeline-setup.json`

The one open pipeline setup record, beside `progress.json`: a first setup, an update or an advise session of the
pipeline agent, saved as each answer, edit and finding happens, so every step can resume. Only an Apply writes
`pipeline.json` from it. The [`pipeline` verbs](#pipeline-setup) and the same commands from a client write it through
the lock, atomically; a start over removes it. This is format version 3: its draft is read as `pipeline.json` is but
for the entities' set check, so it keeps entities the validator refuses until User resolves them.

```jsonc
{
  "formatVersion": 3,                            // only this version is read
  "setupId": "S1",                               // S<n>, from progress.json's nextSetupId, never reused
  "mode": "setup",                               // setup | update | advise
  "baseContentHash": null,                       // the stored pipeline's content hash when an update or advise opened
  "stepStates": {                                // not-started | in-progress | done | needs-recheck
    "billing": "done", "agent": "done", "research": "in-progress", "constitution": "not-started", "design": "not-started",
    "apply": "not-started"                       // and "entities", only once a record over entities walks it
  },
  "currentStep": "research",
  "billing": { "mode": "subscription" },         // as pipeline.json's billing
  "agent": { "vendor": "claude-code", "program": { "follows": "machine" } },  // as pipeline.json's agent; null until chosen
  "agentJobId": null,
  "snapshotCommit": null,                        // the main commit the agent's snapshot holds
  "readyToContinue": [],                         // the agent's suggestion; it never moves a step
  "findings": [
    { "findingId": "F1", "topic": "scripts", "label": "Tests", "value": "bun test", "sourcePaths": ["package.json"],
      "script": null, "needsRecheck": false }   // topic: stack | scripts | conventions | continuous-integration | note | layout
  ],
  "questions": [
    { "questionId": "Q1", "step": "research", "subject": { "kind": "finding", "reference": "F1" },
      "question": "Is the test run a gate?", "context": "", "options": [{ "letter": "a", "text": "Yes" },
      { "letter": "b", "text": "No" }], "recommended": ["a"], "multiple": false, "answer": null }
  ],
  "constitution": null,                          // or { markdown, annotations, draftedFrom, baseBlob, revision }
  "draft": null,                                 // or the whole pipeline being designed, as pipeline.json
  "draftRevision": 0,
  "edits": [],                                   // { editId, by: agent | user, field, summary, undone, batch? }
  "replacesUnreadablePipeline": false,
  "applyRequest": null,                          // or { draftRevision, resumesBoard, commitJobId, state, reason }
  "check": { "draftRevision": 0, "gateNames": ["tests"], "state": "queued", "result": null, "reason": null },
  "nextNumbers": { "finding": 2, "question": 2, "edit": 1 }
}
```

On a forge over entities the record also holds, each written only once set:

```jsonc
{
  "entities": {                                  // each entity's part, by its key; the draft holds every entity
    "web": { "agentJobId": "J7", "findings": [], "questions": [], "constitution": null }  // and "check" once asked for
  },
  "openedAtEntity": "web"                        // an update or advise opened at an entity; absent at the forge
}
```

- The constitution's `markdown` is the whole text, as `CONSTITUTION.md` will hold it, kept byte for byte. Its sources
  are `annotations` beside it, never in the text: each names one whole line (`lineText`, without its line ending), its
  `occurrence` among equal lines (from 1), a `kind` (`contributing`, `research` or `installed-default`) and a `path` or
  `null`. A source whose line the text does not hold that many times is refused (`constitution-source-unanchored`), and
  so is a second source on one line. When User edits the text, each source stays while its line still occurs that many
  times, so an edited line loses its source. `draftedFrom` holds the three SOURCES ticks; `baseBlob` is main's blob of
  `CONSTITUTION.md` when the record opened, or `null`.
- An edit's `field` is one of `gate:<name>`, `phase-order:<phase>`, `prepare:<name>`, `prepare-order`, `role:<role>`,
  `review`, `airlock`, `tools`, `approval:<approval>` and `constitution`; on a draft with entities also
  `entity:<key>`, an entity's `kind`, `home` and `summary`, and `entity:<key>/<field>`, a field inside that entity:
  one of `gate:<name>`, `phase-order:<phase>`, `prepare:<name>`, `prepare-order`, `review`, `constitution`,
  `role:<role>` (`builder`, `reviewer`, `reReviewer`, `conflictReReviewer`), `whitelist`, `reach`, `depends-on` and
  `concurrency`. Undo writes the base pipeline's value of that field back: the stored pipeline's, or the minimal one's
  for a first setup.
- An edit's `batch` is written only by a copy of one entity's settings to other entities: a `pipeline-draft-edit` sent
  with `isACopy`, whose edits each take the set's `batch`, the first of their edit ids. A copy on a draft without
  entities, or with an edit of a field outside an entity, is refused `draft-copy-outside-entities`, so a forge without
  entities never stores a `batch`. Each edit of a set still undoes alone; a `pipeline-draft-undo` sent with `wholeBatch`
  undoes at one revision every edit of the named edit's set at its entity that still stands, each logged
  `pipeline-draft-undone`, and an edit of no set as a set of one. `pipeline undo` sends no `wholeBatch`.
- `entities` holds each entity's part of the record on a forge over entities: `agentJobId` (the entity's own
  pipeline-agent session, or `null`), its `findings` and `questions` of the shapes above, its `constitution` draft, and
  `check`, absent until User first asks for a check of that entity. An entity's check runs that entity's prepare steps
  and gates, their folders read under the entity's first home: the check's start carries it as `entityHome`, which the
  record does not store. `openedAtEntity` names the entity an update or advise opened at, the level whose session a
  resume opens. `stepStates.entities` exists only once the record walks the `entities` step, between `research` and
  `constitution`. A first setup starts to walk it, `not-started`, when the forge's session records its second `layout`
  finding while `research` (or `billing`) is the current step, logged `pipeline-setup-step-moved`; only a tracker at its
  repository's root does, and a record without two `layout` findings walks today's steps. A question and `pipeline
  ready` may name the `entities` step.
- Only one record is open at a time: a second opening is refused (`setup-in-progress`). Only a step at or before the
  current one reopens (`setup-step-not-reached`). Reopening a step sets every later `done` step to `needs-recheck`,
  never `not-started`; Continue on that step sets it `done`, the only way out of a recheck. In a first setup, User's
  answer or edit at a step before the current one reopens that step; the agent's moves never move a step. An answer
  with no letter and no text is refused (`empty-setup-answer`). While `applyRequest` is `committing` or `held`, every
  setup move but the Apply's own, and every `gate` write, is refused (`pipeline-apply-pending`).
- `applyRequest` is [Apply](#apply)'s stage 1: `draftRevision`, `resumesBoard`, `commitJobId` (the Airlock's commit
  job, or `null`), `state` (`committing`, `held` or `refused`) and `reason`, a stored code while `held` or `refused`:
  `not-on-target-branch`, `dirty-checkout`, `target-file-held`, `git-failed`, `constitution-commit-unsigned`,
  `constitution-commit-unexpected-paths`, `constitution-moved`, `pipeline-moved` (the stored pipeline changed by hand
  while the commit waited), `entity-named-by-tickets` or `entities-while-tickets-in-flight` (E91 or E94 while the commit
  waited). A constitution commit job's claim sets `commitJobId` and `committing`, a held one too; its
  end without a landing sets `commitJobId` back to `null`. A refused request leaves the record editable, and a new Apply
  replaces it. Apply's stage 2 removes the file.
- `check` is absent until User first asks for a [check](#pipeline-checks), and then holds the newest one:
  `draftRevision`, `gateNames` (the gates the draft changes or adds, in draft order), `state` (`queued`, `running`,
  `checked`, `cannot-run` or `stopped`), `result` and `reason`. `result` is set only once `checked`: `snapshotCommit`
  (main's tip the worktree held), `prepare` (`failedSteps`, the first failed prepare step of each run or `null`, and
  `output`) and `gates`, each with its `name`, the two runs' `outcomes` (`passed`, `failed`, `cannot-run`), their
  `durationsMilliseconds` (recorded and shown only), its `verdict` (`green`, `red`, `cannot-run` or `disagreeing`) and
  `output`, the last 4,000 characters of the last red or unrunnable run's output. `reason` is set only once
  `cannot-run`.
- Keys the CLI does not know are kept at the top level, in their stored order, after its own, so a read and a write
  leave the file byte for byte. A file that is not JSON, has another `formatVersion`, lacks a key, holds a value of the
  wrong shape or an unknown key below the top level is malformed: the board reads no open record, every setup move
  refuses `pipeline-setup-unreadable` with the reason and nothing writes over the file, and every other command runs as
  before.

### `<data>/gate-profiles.json`

The [gate profiles](#gate-profiles) User started, beside `progress.json`, absent until the first `gate-profile-start`.
Every write is made in the hold: `queued` by the command, `running` and the end by Hephaestus. Only the newest run of
each gate and phase is kept, of each entity on a forge over entities: a new press drops an ended one. This is format
version 1.

```jsonc
{
  "formatVersion": 1,                    // only this version is read
  "nextRunNumber": 3,                    // the next run is P3; ids are never reused
  "runs": [
    {
      "profileRunId": "P2",
      "setupId": "S1",                   // the setup whose draft the gate came from; null: the stored pipeline
      "entity": "web",                   // the entity whose gate it is; written only on a forge over entities
      "phase": "merge",                  // build | review | merge
      "gate": { "name": "tests", "run": "bun test" },  // in and network when set; never writes
      "gateHash": "…",                   // the content hash of run, in and network
      "prepare": [{ "name": "install", "run": "bun install --frozen-lockfile", "in": "/" }],  // in when set
      // with an entity, each in (the gate's and the steps') is from the repository's root
      "state": "passed",                 // queued | running | passed | red | cannot-run | timed-out | stopped
      "stopRequested": false,            // User's Stop of a running run, until Hephaestus records it stopped
      "elapsedMilliseconds": 41200,      // recorded and shown only; null until the run ended by itself
      "cacheReport": "hit"               // hit | partial | miss: the gate's report; written only when it reported one
    }
  ]
}
```

- `<data>/gate-profile-runs/<P>.ndjson` holds a run's output, appended in place outside the hold, one JSON line per
  piece, as a child's event log is; a reader ignores an unterminated last line.
- `<worktrees>/gate-profiles/<P>` is a run's worktree, removed when the run ends and at every Hephaestus start.
- No state is written as `timed-out` yet; the read accepts it.
- A run without `entity` is written without the key, so a file of a forge without entities stays byte for byte. A
  release before entities refuses a file with the key as malformed.
- Keys the CLI does not know are kept at the top level, in their stored order, after its own, so a read and a write
  leave the file byte for byte. A file that is not JSON, has another `formatVersion`, lacks a key, holds a value of the
  wrong shape or an unknown key in a run is malformed: the board reads no run, every profile move refuses
  `gate-profiles-unreadable` with the reason and nothing writes over the file, and every other command runs as before.

### `<data>/constitution-sources.json`

The pipeline agent's sources of the constitution the main line holds, beside `pipeline.json`, never tracked. Only an
[Apply](#apply)'s stage 2 writes it, through the lock and atomically; nothing ever writes a source into
`CONSTITUTION.md`. This is format version 1.

```json
{
  "formatVersion": 1,
  "blob": "<the blob id of the CONSTITUTION.md text these sources belong to>",
  "annotations": [
    { "lineText": "- Keep the basket page fast.", "occurrence": 1, "kind": "research", "path": "package.json" }
  ]
}
```

An annotation is as the [setup record](#datapipeline-setupjson) holds it. The sources belong to one text: `pipeline
setup`, `pipeline update` and `advise` start their constitution with them only when `blob` is main's blob id of
`CONSTITUTION.md`, so the sources of another text never show. Keys the CLI does not know are kept at the top level,
in their stored order, so a read and a write leave the file byte for byte. A file that is not JSON, has another
`formatVersion`, has no `blob` or a malformed annotation is malformed: its sources show nowhere, nothing but an Apply
writes over it, and every command runs as before.

### `<data>/log.jsonl`

One record per line, each a JSON object ending in a newline: `at`, `kind`, then `taskId`, `ticketId`, `epicKey`,
`draftId`, `setupId`, `profileRunId`, `jobId`, `decisionId` or `incidentId` where the kind names them, then `fields`.
`status` and the board document word each record as a sentence; a note's sentence is its text.

The kinds fall into families: [board](#board-records), [ticket](#ticket-records), [epic](#epic-records), [filing
draft](#filing-draft-records), [pipeline setup](#pipeline-setup-records), [gate profile](#gate-profile-records),
[review](#review-records), [pipeline and gate](#pipeline-and-gate-records), [Hephaestus](#hephaestus-records),
[job](#job-records), [merge](#merge-records), [decision](#decision-records) and [incident](#incident-records).

#### Board records

| kind | ids | fields |
|---|---|---|
| `note` | none | `text` |
| `chart-range-set` | none | `view`, shaped as `progress.json`'s |
| `concurrency-limit-set` | none | `limit` |
| `tracker-cleared` | none | none |

#### Ticket records

| kind | ids | fields |
|---|---|---|
| `ticket-filed` | `ticketId` | `title`; for a ticket a job filed also `status`, `priority` and `filedByJob` as filed |
| `ticket-committed`, `ticket-submitted-for-review`, `ticket-unreadied`, `ticket-reopened`, `ticket-started`, `ticket-finished`, `ticket-approved`, `ticket-unheld`, `ticket-release-cleared` | `ticketId` | none |
| `ticket-delivered` | `ticketId` | `byHand`: `true`, only when `ticket deliver --by-hand` recorded it |
| `ticket-abandoned`, `ticket-held` | `ticketId` | `reason` |
| `ticket-interrupted-hold-lifted` | `ticketId` | `hold`: the `interrupted:` hold that `resume` lifted, logged in place of `ticket-unheld`, so no count resets |
| `ticket-retitled` | `ticketId` | `from`, `to`: titles |
| `ticket-content-restored` | `ticketId` | none: the stored title or body no longer matched the ticket's `contentHash`, and the kept content was written back |
| `ticket-rereviewed` | `ticketId` | `round`, from 2 |
| `ticket-priority-changed` | `ticketId` | `from`, `to`: priorities |
| `ticket-size-changed` | `ticketId` | `from`, `to`: sizes, `from` absent when the ticket had none |
| `ticket-agents-changed` | `ticketId` | `from`, `to`: each `{ model, effort }` |
| `ticket-dependencies-set` | `ticketId` | `dependsOn`: ticket ids |
| `ticket-introduced-by-set` | `ticketId` | `introducedBy`: the cause's ticket id, absent when it was cleared |
| `ticket-epics-set` | `ticketId` | `epics`: epic keys |
| `ticket-network-set` | `ticketId` | `domains`: empty when the line was cleared |
| `entity-assigned` | `ticketId` | `entity`: the entity key; `reason`; `by`: `product-owner` or `user` |
| `need-declared` | `ticketId` | `entity`: the entity key of the needed work; `title`; `byJob`: the id of the declaring job |
| `stage-started` | `ticketId` | `stage`: the stage a crossing ticket's row moved into; `entity`: the entity whose agents run it |
| `seal-set` | `ticketId` | `entity`: the sealed package; `seal`: the hash the row stores |
| `seal-lifted` | `ticketId` | `entity`: the package whose seal a package return lifted |
| `package-return` | `ticketId` | `entity`: the package the ticket returned to; `fromStage`: `adapt` or `review`; `returns`: the row's `packageReturns` after it |
| `ticket-release-marked` | `ticketId` | `group` |
| `ticket-grouped` | `ticketId` | `group`: the group `ticket group`, or Hephaestus's act on `dependent-broken`, put the ticket into |
| `dependent-fix-filed` | `ticketId` | `entity`: the dependent the crossing ticket's package change breaks; `fixTicketIds`: the tickets filed in its group to fix it |
| `ticket-check-command-restamped` | `ticketId` | `command` (the line stamped on its row, or `null`); retired: still read, never logged |

#### Epic records

| kind | ids | fields |
|---|---|---|
| `epic-added`, `epic-edited` | `epicKey` | `title` |
| `epic-removed` | `epicKey` | none |

#### Filing-draft records

| kind | ids | fields |
|---|---|---|
| `draft-opened` | `draftId` | `title`, `owner` |
| `draft-claimed` | `draftId` | `owner`, `takenFrom` only when a forced claim took it from another owner |
| `draft-released` | `draftId` | `owner` |
| `draft-closed` | `draftId` | `ticketIds` |
| `draft-abandoned` | `draftId` | `reason` |
| `draft-note-added` | `draftId` | `noteId`, `noteKind` |
| `draft-question-asked` | `draftId` | `questionId`, `underQuestionId` when it is a follow-up |
| `draft-question-answered` | `draftId` | `questionId`, `answer`: the option letters joined by commas, or the free text |
| `draft-item-dropped` | `draftId` | `itemId` |

#### Pipeline setup records

| kind | ids | fields |
|---|---|---|
| `pipeline-setup-opened` | `setupId` | `mode` (`setup`, `update` or `advise`), `replacesUnreadablePipeline` |
| `pipeline-setup-billing-set` | `setupId` | `mode` (`subscription` or `api`), `maxBudgetUsd` only for a cap |
| `pipeline-setup-agent-set` | `setupId` | `vendor`, `program`: `machine` or the pinned path |
| `pipeline-setup-step-moved` | `setupId` | `step`, its new `state`, the `currentStep`, and `needsRecheck`: the later steps a reopening sent back |
| `pipeline-setup-resumed` | `setupId` | `snapshotCommit`, `changedPaths` (changed on main since the earlier snapshot) |
| `pipeline-snapshot-touched` | `setupId` | `check` and `reason` of the Customs refusal at a turn end of the pipeline agent; Apply refuses `setup-snapshot-touched` until the next `pipeline-setup-resumed` |
| `pipeline-finding-recorded` | `setupId` | `findingId`, `topic` |
| `pipeline-question-asked` | `setupId` | `questionId`, `step` |
| `pipeline-question-answered` | `setupId` | `questionId`, `answer`: the option letters joined by commas, or the free text |
| `pipeline-step-ready-suggested` | `setupId` | `step`: the pipeline agent suggests User may continue it; no step moves |
| `pipeline-constitution-set` | `setupId` | `by` (`agent` or `user`), `revision` |
| `pipeline-draft-edited` | `setupId` | `by`, the draft's new `revision`, `editIds` and their `fields`, in order |
| `pipeline-draft-undone` | `setupId` | `editId`, `field`, `revision` |
| `pipeline-draft-discarded` | `setupId` | `revision` |
| `pipeline-setup-discarded` | `setupId` | none |
| `pipeline-check-requested` | `setupId` | `revision`, `gateNames`: the gates of that draft revision a check runs two times |
| `pipeline-apply-requested` | `setupId` | `revision`, `resumesBoard`: the Apply waits for the constitution commit |
| `pipeline-apply-held` | `setupId` | `reason`: the constitution commit waits, for this stored code; `blockingFiles`: the files of the main checkout that stop the fast-forward, or the files another process holds open |
| `pipeline-apply-refused` | `setupId` | `reason`: the constitution commit was refused, for this stored code; `gitFailure`: git's own text when git refused, else `null` |
| `pipeline-apply-cancelled` | `setupId` | `revision`, `state`: the request's state when User cancelled it |
| `pipeline-applied` | `setupId` | `revision`, `resumesBoard`, `changedFields`, `newFields` and `removedFields` (draft field names), `constitutionCommit` (`null` when no commit was made) |

#### Gate profile records

| kind | ids | fields |
|---|---|---|
| `gate-profile-requested` | `profileRunId` | `gateName`, `phase`, `setupId` (`null` for a gate of the stored pipeline) |
| `gate-profiled` | `profileRunId` | `gateName`, `phase`, `state` (`passed`, `red`, `cannot-run` or `timed-out`), `elapsedMilliseconds` |
| `gate-profile-stopped` | `profileRunId` | `gateName`, `phase`: User's Stop, or a Hephaestus start that found the run left running; no result |

#### Review records

| kind | ids | fields |
|---|---|---|
| `review-bar-started`, `review-bar-closed` | `taskId`, `ticketId` | `name` |
| `review-recorded` | `taskId`, `ticketId` | `round` (the bar's, from 1), `verdict`, `reviewStartCommit`, `fixReworkedCodeLines`, `rebaseReworkedCodeLines`, `totalReworkedCodeLines`, `builderChangedFiles`, `builderInsertions`, `builderDeletions`, `claims` and `findings` as the reviewer's findings file holds them, logged by the lifecycle service as it records a review's outcome |

#### Pipeline and gate records

| kind | ids | fields |
|---|---|---|
| `pipeline-prepare-step-set`, `pipeline-gate-added` | none | `name`, `run` (the step's or gate's command) |
| `pipeline-gates-none` | none | none |
| `pipeline-gate-removed` | none | `name` |
| `pipeline-gates-ordered` | none | `phase` (`build`, `review` or `merge`), `names` (the phase's gates in their new run order) |
| `pipeline-approval-set` | none | `approval`: `tickets`, `state`: `on` or `off` |
| `pipeline-assistant-set` | none | `state`: `on` or `off` |
| `pipeline-agent-set` | none | `vendor`, `program`: `machine` or the pinned path |
| `pipeline-tools-set` | none | `paths`: the tools' paths; empty when the list was removed |
| `pipeline-reach-set` | none | `paths`: the repository paths, an empty list when cleared |
| `branch-namespace-set` | none | `namespace` |
| `check-command-set` | none | `command` (the shell line, or `null` when cleared); retired: still read, never logged |
| `install-command-set` | none | `command` (the install line); retired: still read, never logged |
| `checks-definition-files-set` | none | `patterns` (empty when cleared); retired: still read, never logged |
| `gate-key-command-set` | none | `command` (or `null` when cleared); retired: still read, never logged |
| `gate-cache-paths-set` | none | `paths` (empty when cleared); retired: still read, never logged |
| `gate-ran` | none | `tree` (the gated tree's object id), `outcome` (`passed`, `failed`, `cannot-run`), `cached` (false, since no gate result is kept; true only in older logs), and `cacheReports` only once a gate reported: `{phase, gates}`, each gate run `{gateName, cacheReport}` (`hit`, `partial`, `miss` or `null`), in run order |
| `pipeline-step-ran` | none | One step line that ran, recorded and shown only: `stepKind` (`prepare` or `gate`), `stepName`, `phase` (the gate run's phase; absent for a job's install step), `entity` (absent on a forge without entities), `runMilliseconds` (awake time, a sleep not counted), `ending` (`passed`, `failed` or `time-bound`). Written in the hold that consumes the step: a job's install as it leaves `preparing`, a gate run of a job or a merged tree at its settlement, a gate profile's gate at its end; a pipeline check writes none |

#### Hephaestus records

| kind | ids | fields |
|---|---|---|
| `hephaestus-set` | none | `state` (`running` or `paused`) |
| `hephaestus-started` | none | `codeVersion`, `installVersion` |
| `hephaestus-stopped` | none | `reason`: `stopped` or `handed-over` |
| `start-classified` | none | `kind`: what the start found before it, `first-start`, `handover`, `stopped-on-purpose`, `machine-went-down` or `crashed`; `startOrigin`: `user` or `successor`; `previousGeneration`: the Hephaestus lock generation before it, only when there is one; `crashSuspected` (`true`) only when a crash is suspected before the machine went down; `crashLogNumber`: the number of the crash log, only when a crash log exists for this start |
| `restart-failed` | none | `successorCodeVersion`, `step`, `error` |
| `dispatcher-set` | none | `state` (`running`, `finished` or `stopped`), `runId` (a run id or `null`); retired: still read, never logged |

#### Job records

| kind | ids | fields |
|---|---|---|
| `job-launched` | `jobId` | `kind`, `role` (or `null`), `ticketIds`, `attempt`, `target` and `parentJobId` (each or `null`), and on a product-owner launch only `intakeText`: User's request, and `intakePictures` (`[{pictureId, name}]`) only when it came with pictures; on a forge with entities only, `entity` and `stage`: the entity and the ticket's stage the job runs, which scope its red handoffs and failed passes; and only on the product owner the first Apply over entities starts, `entitiesToAssign`: the committed tickets it gives an entity. A `kind` or `role` `onboarder`, which an earlier release logged, reads as `pipeline-agent`; the file is not rewritten |
| `job-interrupted` | `jobId` | `cause`, `childInstance`: the instance that was lost |
| `job-resumed` | `jobId` | `childInstance`: the instance spawned, `cause`: the interruption it resumes from, and `instructed` (`true`) only when User instructed the resume, directly or by answering the job's question: it sets `crashResumes` back to 0 |
| `job-resume-instructed` | `jobId` | `childInstance`: the job's instance when User asked to resume it |
| `job-line-lost` | `jobId` | `line` (`gate` or `install`), `cause`: a start after a crash, a reboot or a stop found the job's line gone with no end of its own; the job keeps its state, is never judged red, and the line runs again once User resumes the job |
| `usage-limit-hit` | `jobId` | `window` (as the vendor names it, such as `five_hour`), `resetsAt` (ISO): the vendor refused the job's requests, and nothing launches or resumes before `resetsAt` |
| `job-ended` | `jobId` | `outcome`, `cause` and `commit` each only when named, `deniedPermissions` |
| `job-stop-requested` | `jobId` | `mode`: `stop`, `wind-down` or `fresh`, User's `job stop`, `job wind-down` or `job fresh` |
| `job-not-launched` | `jobId` | `cause`, `programPath` (`null` when none was named): the launch was refused for the agent's program |
| `job-launch-retried` | `jobId` | none: the agent's program changed, or User looked again |
| `job-messaged` | `jobId` | `text`: a chat turn Hephaestus writes to the session in log order; `pictures` (`[{pictureId, name}]`) only when User sent some; `byHephaestus` (`true`) only when the text is Hephaestus's wording of User's setup move |
| `job-reopened` | `jobId` | `childInstance`: the instance that resumes the closed product owner or pipeline agent, `text`: the message, its first line, `offeredTicketIds`: the tickets its intake filed before the reopening, recorded only; `pictures` only when the message carried some; `byHephaestus` as on `job-messaged` |
| `intake-titled` | `jobId` | `title`: the product owner's short title for its intake; a later record replaces an earlier one |
| `agent-stopped` | none | below |
| `hatch-applied` | `jobId` | `requestId`, `commandKind`, `outcome` (`done`, `nothing-to-do` or `refused`), then the reply's `ticketIds`, or its `status` and `detail` when refused: a relayed request Hephaestus answered, never applied again; a reply lost after the hold committed is written again from this record |

#### Merge records

| kind | ids | fields |
|---|---|---|
| `merge-queued` | `ticketId` | `target`: a passing review queued the ticket to land there |
| `merge-acceptance-set` | `ticketId` | `state`: `accepted` by `merge accept`, or `cleared` when the ticket's queue mark went |
| `merge-updated` | `ticketId` | `target`, `outcome`: `merged` or `conflicted`, from `merge update` |
| `merge-started` | `jobId` | `target`, `targetTip`, `branchTip`, `predictedConflictFiles` (empty for a clean prediction): the merge job took the target's Airlock slot |
| `merge-landed` | `jobId` | `target`, `commit`, `kind` (`landed` on the main line, a constitution commit's included, `integrated` on a group branch): Hephaestus's list of tips it landed |
| `worktree-repaired` | `ticketId` | `step`, `patchPath`: where `recreate` saved the changes, or `null` |

#### Decision records

| kind | ids | fields |
|---|---|---|
| `decision-opened` | `decisionId` | `kind`, `ticketIds` |
| `decision-answered` | `decisionId` | `answer`: one answer per question, keyed by the question's text; `requestId`: the question request it answers, when one |
| `decision-withdrawn` | `decisionId` | `reason` |

#### Incident records

| kind | ids | fields |
|---|---|---|
| `incident-opened` | `incidentId` | `kind`, `ticketIds` |
| `incident-handled` | `incidentId` | `move`: the move that closed it |
| `incident-defaulted` | `incidentId` | `move`: its default move, `cause`: `turn-closed`, `turn-budget`, `no-assistant` or `assistant-off` |
| `incident-escalated` | `incidentId` | `decisionId`: the `agent-question` decision it became |
| `incident-noted` | `incidentId` | `text`: a finding recorded under the open incident |
| `incident-answered` | `incidentId` | `answer`, as `decision-answered`; `requestId`, when one |

#### Examples and rules

```json
{"at":"2026-09-18T21:30:54+02:00","kind":"ticket-started","ticketId":"003","fields":{}}
{"at":"2026-09-18T22:00:00+02:00","kind":"review-bar-started","taskId":18,"ticketId":"003","fields":{"name":"Review 1 #003 — Rewrite the importer"}}
{"at":"2026-09-18T22:05:00+02:00","kind":"note","fields":{"text":"Wave 1 landed."}}
```

The file is always written whole, atomically; an absent file is an empty log, and a blank line is skipped. A line that
is not a well-formed record of a known kind makes the log unreadable (exit 2), naming the line and the field. A record
is kept with only the keys its kind names, so a key added by hand is dropped the next time the file is written.

#### `agent-stopped`

Its `fields` are `agentId`, `agentType`, `apiCallCount`, `endContextTokens`, `totalInputTokens` (fresh input plus both
cache figures), `cacheReadInputTokens` and `outputTokens`.

An agent a workflow run spawned, whose transcript sits at `…/subagents/workflows/<runId>/agent-<id>.jsonl`, also carries
`workflowRunId`, that `<runId>`, and `agentLabel`, the `description` of the `agent-<id>.meta.json` beside the transcript
when it has one. Each is written only when known, so a plain subagent's record holds neither. A job Hephaestus ran
also carries `costUsd` when a `result` of its sessions named `total_cost_usd`: each child instance's newest cost,
summed. It is recorded only; no view shows it. The record is one line in the file, spread over several here:

```json
{
  "at": "2026-09-18T22:10:00+02:00",
  "kind": "agent-stopped",
  "fields": {
    "agentId": "a1",
    "agentType": "workflow-subagent",
    "apiCallCount": 2,
    "endContextTokens": 140020,
    "totalInputTokens": 230030,
    "cacheReadInputTokens": 230000,
    "outputTokens": 2000,
    "workflowRunId": "wf_example",
    "agentLabel": "build #7"
  }
}
```

### `<data>/pictures/`

The pictures User sent through the API, one owner-only file each, named `<pictureId>.<extension>`: `pictureId` is the
sha256 of the bytes as 64 hex digits, and the extension (`png`, `jpg`, `webp`, `gif`) is the type the first bytes tell,
never a name. The folder exists only once a picture was uploaded through `POST /api/pictures`. The same bytes are one
file. At each Hephaestus start, in the hold that records `hephaestus-started`, every picture that no `job-launched`,
`job-messaged` or `job-reopened` record and no live job's `intake.pictures` names is removed: a set difference, never an
age. `clear` keeps the folder and `clear --all` removes it.

### `<data>/committed-content/<hash>.json`

```json
{
  "title": "Double-click a role to edit it",
  "body": "# 003 — Double-click a role to edit it\n\n## Report\n…\n"
}
```

The title and body of a committed ticket, kept under the ticket's `contentHash` (64-bit FNV-1a over the JSON of
`{ title, body }`, 16 hex digits). A hold writes it whole before the ticket file that names it and never rewrites it, so
a hold cut between the two leaves a ticket that still reads. A ticket that holds a `contentHash` is read with this title
and body, whatever its file says, and the next write puts them back into the file and logs `ticket-content-restored`. A
kept file that is missing, unreadable or whose title and body do not hash to its name makes the ticket unreadable,
reason `committed-content-missing`, reported at this file. The same content is one file. `clear --all` removes the
folder's files with the tickets.

### `<data>/hold-journal.json`

```json
{
  "version": 1,
  "files": [
    {
      "path": "progress.json",
      "contents": "{\n  \"version\": 2,\n  …\n}\n"
    },
    {
      "path": "epics/checkout-redesign.md",
      "removed": true
    },
    {
      "path": "log.jsonl",
      "contents": "{\"at\":\"2026-09-18T20:05:00+02:00\",\"kind\":\"note\",\"fields\":{\"text\":\"Example\"}}\n"
    }
  ]
}
```

The write one lock hold committed to, in the order it writes the files, indented two spaces and ending in a newline,
written atomically. It holds only the files whose bytes change; a hold that changes none writes no journal.

Each entry's `path` is relative to the data folder and never leaves it, with forward slashes on every platform, so a
backslash or a Windows drive prefix is refused; it carries either the file's whole new `contents`, `log.jsonl` included,
or `"removed": true`.

Every command that takes the lock first finishes a journal it finds, rewriting or removing each file verbatim, then
removes it. A journal that cannot be read, another `version`, or an entry breaking these rules stops every write at exit
2 until it is repaired or removed; `status`, which takes no lock, reports it on standard error and replays nothing. A
journal that cannot be removed fails that command at exit 2 with `hold-journal-unremovable`, and the next command
replays it.

### `<data>/version.json`

```json
{
  "installVersion": 19
}
```

The install version of the files `init` and `update` installed, indented two spaces and ending in a newline, written
atomically by both after every other file they write. It is read as a JSON object whose `installVersion` is a whole
number of at least 1. Any other key is ignored and not written back.

A file recording another version, holding anything else or unreadable is a mismatch, and so is an absent file while
`session-instructions.md` is there; an absent one while it is not is none.
[Install version](#install-version) says what a mismatch does.

### `<monitor>/projects.json`

```json
{
  "version": 1,
  "projects": {
    "5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c0a37": {
      "project": "Example Agency",
      "root": "/Users/alex.example/development/example-agency",
      "gitOrigin": "git@example.invalid:example/example-agency.git",
      "program": "/Users/alex.example/.bun/bin/forge",
      "registeredAt": "2026-10-21T10:00:00+02:00",
      "lastChangedAt": "2026-10-21T11:30:00+02:00",
      "lastCommand": "ticket ready",
      "hephaestus": {
        "url": "http://127.0.0.1:4987/",
        "processId": 4242,
        "startedAt": "2026-10-21T10:05:00+02:00",
        "tokenPath": "/Users/alex.example/.forge-monitor/private/5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c0a37/token"
      }
    }
  }
}
```

The machine-wide registry of every project this machine's program wrote a tracker for, in the home folder, for a monitor
to find each project; a board's records are reached through its forge, never by path. A folder, so the monitor
can keep its own files beside it.

A project registers, its entry added or updated, exactly when the call wrote its tracker: every mutating command,
`init`, and Hephaestus at its start. `update` never writes the tracker, so it never registers; neither does a
read-only call.

A tracker whose root lies under a temp folder is never registered: the system temp folder (`os.tmpdir()`, on macOS
`$TMPDIR` under `/var/folders`), and on macOS and Linux also `/tmp` and `/var/tmp`, each compared after resolving
symlinks (`/tmp` to `/private/tmp` on macOS). On Windows the system temp folder is the only one. An entry already in
the registry stays.

An entry is keyed by the tracker's `trackerId`, so a moved or renamed folder updates its one entry. It holds the board's
`project` name, the `root` folder, `gitOrigin` (the `origin`
remote's URL, or `null`), `program` (the absolute path of the program that last wrote the entry: the compiled launcher
when one started it, else the entry point), `registeredAt` (the first registration, kept), `lastChangedAt` (this write)
and `lastCommand` (the verb that wrote, the command word and its subcommand), and, while a Hephaestus serves the board,
`hephaestus` (`{url, processId, startedAt, tokenPath}`, written at its start and removed by a stop). `tokenPath` is the
absolute path of that Hephaestus's owner-only token file, which a monitor reads its bearer token from.

`presence` says whether the forge serves: `{state: serving, generation, at, process: {processId, startStamp,
bootIdentity}}` at a start, `{state: stopped|handed-over, generation, at}` at a stop or a restart, and `{state:
crashed, generation, at, crash: {component, suspected, errorName, errorMessage, crashLogPath}}` from a crash and from a
start that stays off. A kill from outside writes nothing, so a `serving` whose process answers nothing stands until the
next start classifies it; a write that names no presence keeps the stored one.

`program`, `hephaestus.tokenPath` and `presence` are keys added to version 1: an optional key added to a stored format
keeps its version, since every reader keeps a key it does not know. An entry an older program wrote has none of them
until its next write.

No board summary is copied: the monitor reads each project's own files. The CLI never removes an entry and has no
command for the registry.

The read-modify-write holds the registry's own lock, `<monitor>/.lock/`, and writes the file atomically, indented two
spaces and ending in a newline. Unknown keys, at the top level and on an entry, are kept in order. A file whose
`version` is newer than 1 is left untouched and a warning is printed. A malformed file is reported and rewritten with
every entry that is still an object, plus this one. A registry that cannot be read or written, its lock included, is a
warning on standard error: the command keeps its exit code, 0 when it succeeded.

### `<monitor>/usage-windows.json`

```json
{
  "windows": {
    "five_hour": { "lengthHours": 5, "utilization": 0.19, "resetsAt": "2026-10-27T23:00:34.000Z" },
    "seven_day": { "lengthHours": 168, "utilization": 0.46, "resetsAt": "2026-10-30T22:00:34.000Z" }
  }
}
```

The newest observation of each usage window of the vendor's plan, machine-wide, beside the usage marker
`<monitor>/usage-limit.json`. Every `rate_limit_event` of a job's session reports each window of its `unifiedWindows`
(Claude Code names them `five_hour` and `seven_day`); Hephaestus's pass writes them after its lock hold, the later
observation of a window replacing its `lengthHours` (the window's length as the agent adapter knows it, `null` for a
window it does not know), `utilization` (the share used, 0 to 1, as the vendor reports it) and `resetsAt` (ISO) in
place. A window seen first is added last. Only the top-level refusal of the window `rateLimitType` names interrupts a
job and writes the usage marker; a window's own status writes nothing more.

Nothing is written under API billing, and a board under API billing shows no window. `/api/state` shows each window as
`usage.windows` (`{window, lengthHours, utilization, resetsAt}`, `utilization` as a whole percent), none before the
first observation.

The file is written atomically, indented two spaces and ending in a newline, and only when a value changes, so an
unchanged file stays byte-identical. Unknown keys, at the top level and on a window, are kept in order. A file that is
not JSON, has no `windows` object, or holds a window without a number or null `lengthHours`, a number `utilization` or a
stamp `resetsAt` is malformed: it shows no window, never stops Hephaestus, and the next observation replaces it.

### `{{dataFolder}}/tickets/003-double-click-a-role-to-edit-it.md`

The file is the local store's format of a ticket, never edited by hand: a ticket's title and body change with
`{{program}} ticket edit`, each other field with its own `ticket` verb, and the board refuses what it does not allow.
The file name is the padded id and a slug of the title, given when the ticket is filed and kept through a retitle; the
ticket is known by its frontmatter `id`. The store reads the frontmatter subset below and keeps any other line it
finds: unknown keys, comments and blank lines are written back below the CLI's own keys, in their order among
themselves.

#### A ticket

The ticket is known by its `id`. The CLI writes its keys in this order, omitting an optional key it does not have:

```
---
id: "003"
title: "Double-click a role to edit it"
type: "ticket"
priority: "high"
model: "sonnet"
effort: "high"
hold: "waiting for the design review"
status: "in-progress"
filed: "2026-09-18T20:11:03+02:00"
updated: "2026-09-18T20:40:00+02:00"
started: "2026-09-18T20:40:00+02:00"
finished: null
delivered: null
abandonedAt: null
group: "role-editor"
branch: "ticket/role-editor"
commit: "0a1b2c3"
reason: "…"
releasesGroup: true
dependsOn: "001, 002"
epics: "loyalty-programme, checkout-redesign"
network: "api.example.com, cdn.example.com"
entity: "web"
crosses: "design-system"
filedByJob: "J12"
contentHash: "5f1d3c9a0b7e2468"
task: 17
---
# 003 — Double-click a role to edit it

## Report
…
```

| key | written | value |
|---|---|---|
| `id`, `title`, `type`, `status`, `filed`, `updated` | always; required | `type`: ticket, bug, research; a stored change or feature reads as ticket and is written back as stored. `status`: draft, ready-for-review, committed, in-progress, in-review, reviewed, delivered, abandoned. `updated` is stamped on every move. |
| `priority`, `size`, `model`, `effort` | only once named | `priority`: low, normal, high. `size`: XS, S, M, L, XL, XXL, in capitals. `model`: haiku, sonnet, opus, fable. `effort`: low, medium, high, xhigh, max. Absent reads as normal, as no size, and as opus and medium, so an older ticket is never rewritten to gain them. |
| `hold` | only while held | the hold's reason, empty without one; any value but `null`, a bare `hold:` included, is held. Set and remove it with `ticket hold` and `unhold`. |
| `started`, `finished`, `delivered`, `abandonedAt` | always | a timestamp or `null`; an absent one reads as `null` |
| `group`, `branch`, `commit`, `reason` | when given | text; `reason` is dropped by `reopen`. Set `group` with `ticket add --group` or `ticket group`. |
| `releasesGroup` | only on a group's release ticket | `true`; absent or `null` is not the release ticket, any other value makes the file malformed. Set and remove it with `ticket release-of`. |
| `dependsOn` | when non-empty | ticket ids, written `"001, 002"`, read from any mix of commas and spaces with or without `#` or padding. Set it with `ticket depends`, which refuses a missing id or a circle; bare ids replace the list, `--add` and `--remove` change it. |
| `epics` | when non-empty | epic keys, written `"loyalty-programme, checkout-redesign"` and read like `dependsOn`, in order: the first is the primary epic. A part that is not an epic key makes the file malformed; a key whose epic is gone is kept. Set it with `ticket epic`, which refuses an epic that does not exist. |
| `network` | only once set | the public domains the ticket's agents may reach, written `"api.example.com, cdn.example.com"` and read like `epics`, lower case, in order. A domain that is not public makes the file malformed. Set it with `ticket add --network` or `ticket network`, only while the ticket is a draft or committed; `--clear` removes it. |
| `entity` | only once assigned | the key of the entity whose pipeline builds the ticket, in a forge with entities, written `"web"`; a blank one makes the file malformed. Set it with `ticket add --entity` or `ticket entity`, only while the ticket is a draft, ready for review or committed; the reason goes to the `entity-assigned` log record, never the file. In a forge with entities a ticket without one never becomes `committed`. |
| `crosses` | only once set | the keys of the whitelisted packages intake expects the ticket to cross into, written `"design-system, contracts"` and read like `epics`: a forecast for the board, never what decides the stages. No verb sets it. |
| `introducedBy` | only once named, on a bug | one ticket id, written `"005"`, read like a `dependsOn` entry: the delivered ticket whose change introduced the bug. Set it with `ticket add --introduced-by` or `ticket introduced-by`, which refuse a ticket that is not a bug and a cause that is missing, the ticket itself or not delivered; an empty cause removes it. |
| `foundInReview` | only once named | one ticket id, written and read like `introducedBy`: the ticket whose review found this one. Set only at filing, with `ticket add --found-in-review`, which refuses a ticket that does not exist. |
| `filedByJob` | only on a ticket a job filed | the id of the job whose Hatch filed it, written `"J12"`, stamped by Hephaestus from the Hatch folder's job, never from the request |
| `contentHash` | once the ticket was committed | the hash (64-bit FNV-1a, 16 hex digits) of the title and body kept when the ticket became committed, and moved by forge's own records in the body (the Handoff, a review, waived items, an answer); absent on a draft and on a ticket ready for review. The title and body read are always the kept ones, so a change of the file's text is undone at the next write. Any other value makes the file malformed. |
| `task` | always | the row's id as an unquoted integer, or `null` for a draft, and for a low ticket filed before install version 17 and never started; a quoted `task` makes the file malformed |

**The frontmatter is a deliberately small YAML subset.** One `key: value` per line, split at the
first `': '`, so `title: Fix: the thing` keeps its second colon; `key:` alone is an empty value.
A value is `null`, a double-quoted JSON string, or an unquoted scalar kept as text; only `task` reads
an unquoted integer as a number, so any other value keeps its leading zeros. A `#` comment starts in
column 0 with one hash; a line opening on two to six `#` followed by whitespace or nothing, indented
or not, is a markdown heading and makes the file malformed, as does any other indented line, a list
item or a bare word. There are no nested maps, lists or block scalars. The closing fence is the
*first later* line equal to `---`, so a body may contain horizontal rules. A leading byte order mark
is dropped and CRLF is kept.

A ticket stored with a status that is not a ticket status, the retired `open` or `done` included, is
malformed at its status line, the reason ending in the advice to run `{{program}} update` with a
release that still reads it.

The body is preserved byte for byte from the ticket template (Report, Wanted, Acceptance, Handoff),
`--body` or `--body-file`; an empty body falls back to the template. `ticket edit` replaces the body or
appends to it; `ticket edit --title`
rewrites only the `title` line, and a first body line still reading `# <id> — <old title>`, never the file name. A
committed ticket's title and body are not edited: from `committed` onward `ticket edit` is refused. A malformed ticket
file is listed as ignored rather than failing `status`.
A new ticket id is one past the highest of every file name, every parsed id and every ticket a row names;
gaps are tolerated, never filled.

**The Acceptance is numbered.** Each item of `## Acceptance` starts a line with `A1.`, `A2.`, …, its
continuation lines beneath it up to a blank line or the next item; an item is never renumbered and its
number never reused. `A3. Waived: <reason>` marks an item the user waived. A review's `## Review` holds
one line per item, bulleted or not: `A2 holds — <evidence>`, `A2 does not hold — <gap>` or
`A3 waived — <reason>`. A landing reads only the latest `## Review`, a heading inside a code fence not
counting as one: an item is accounted for when the Acceptance marks it waived, or when that Review has a
`holds` or `waived` line for it and no `does not hold` one.

**The Brief is the builder's brief.** A ticket's `## Brief` is what its builder reads as its scope and contract,
beside the Report, Wanted and Acceptance. `ticket ready` refuses a draft whose `## Acceptance` holds no numbered
item (`acceptance-unnumbered`) or that has no `## Brief` holding a non-blank line (`brief-missing`), so every
ticket that builds carries both.

### `<data>/epics/checkout-redesign.md`

The file name is the key, and an epic is known by it: a file whose `key` says otherwise is listed as ignored. The CLI
writes, unknown lines after its three:

```text
---
key: "checkout-redesign"
title: "Checkout redesign"
slot: 2
---
The description, kept byte for byte.
```

| key | written | value |
|---|---|---|
| `key` | always; required | lower-case letters and digits in words joined by single hyphens, the file name without `.md` |
| `title` | always; required | text |
| `slot` | always; required | the epic colour slot, a whole number from 1 to 6 written without quotes, assigned once by `epic add` |

The frontmatter follows the ticket file's subset: a quoted value is a JSON string, an unquoted one is kept as text, and
unknown keys, comments and blank lines are kept and written back after the CLI's three. Unlike a ticket's, every line
starting with `#` is a comment, two or more hashes included. The closing fence is the first later `---` line, and a
description edit leaves the frontmatter's bytes as they are.

A malformed epic file is listed as ignored on standard error rather than failing `status`, and `epic add` refuses to
overwrite it. A tracker that never added an epic has no `epics/` folder.

### `<data>/filing-cabinet/D1.json`

The file name is the filing-draft id, and a filing draft is known by it: a file whose `id` says otherwise is listed as
ignored. Only the `draft` commands write it, through the lock, atomically:

```jsonc
{
  "version": 1,                                  // only this version is read
  "id": "D1",
  "title": "Example feature",
  "request": "The user's request, kept byte for byte.",
  "openedAt": "2026-10-24T22:01:45+02:00",
  "claim": { "owner": "opus", "claimedAt": "2026-10-24T22:01:45+02:00" }, // or null while unclaimed
  "notes": [
    { "id": "N1", "kind": "fact", "text": "The export lives in src/export/" } // kind: fact | assumption
  ],
  "questions": [                                 // the top-level questions, each holding its follow-ups
    {
      "id": "Q1",
      "question": "Which format?",
      "context": "What the user needs to answer it",
      "options": [{ "letter": "a", "text": "CSV" }, { "letter": "b", "text": "JSON" }],
      "multiple": false,                         // true for a multi-select question
      "recommended": ["a"],                      // one letter, or several on a multi-select question
      "answer": { "letters": ["a"], "answeredAt": "2026-10-24T22:05:00+02:00" }, // or { "text", "answeredAt" }, or null while open
      "followUps": []                            // questions of the same shape, asked --under Q1
    }
  ],
  "nextNoteNumber": 2,                           // the number the next note and question take, never wound back
  "nextQuestionNumber": 2,
  "entity": "web",                               // optional: the entity the draft's tickets are filed for
  "crosses": ["design-system"]                   // optional: the whitelisted packages they are expected to cross into
}
```

`entity` and `crosses` are optional and written only once set, after `nextQuestionNumber`, so a filing draft without
them round-trips byte for byte. `entity` is an entity key: one that is not a string, or is blank, makes the file
malformed. `crosses` is a list of entity keys: one that is not a list, or holds an item that is not a string or is
blank, makes the file malformed. No `draft` command sets either key: this build reads them and writes them back as
read.

Keys the CLI does not know are kept, in their stored order, after its own. A filing-draft file that is not JSON, lacks a
field, holds one of the wrong shape, or has another `version` (older or newer, refused with `OLDER_FORMAT_ADVICE`) is
listed as ignored on standard error by `status` and `draft list`, rather than failing them, and `draft open` refuses to
overwrite it.

A closed or abandoned filing draft's file is removed; the log keeps what it became. A tracker that never opened a filing
draft has no `filing-cabinet/` folder and no `nextDraftId`.

## Ticket moves and their rows

The **from** column is the matrix the named verbs enforce and Hephaestus's moves keep; `ticket status <id> <status>`
skips it. **its row** is the status stored; **pill** is what that row then reads on the chart.

| move | from | ticket status | its row | pill | stamps written | log line |
|---|---|---|---|---|---|---|
| `ticket add` | — | draft | none, at any priority | `Draft` | `filed` | `Ticket #003 filed: <title>` |
| `ticket ready` | draft, for every id named, each with a numbered `## Acceptance`, a `## Brief` holding a non-blank line and, in a forge with entities, an `entity` and no path on its `Work belongs in:` line outside that entity (`work-outside-entity`); ready-for-review too when User runs it without `--incident` | committed | created `committed`, at any priority | `To do` | — | `Ticket #003 committed`, one per ticket |
| `ticket submit`, `intake close` with ticket review on | draft, each complete one, with no path on its `Work belongs in:` line outside its `entity` in a forge with entities; an incomplete one stays draft | ready-for-review | none | `Ready for review` | — | `Ticket #003 ready for review`, one per ticket |
| `ticket submit`, `intake close` with ticket review off | draft, each complete one, with an `entity` and no path on its `Work belongs in:` line outside that entity in a forge with entities; an incomplete one stays draft | committed | created `committed`, at any priority | `To do` | — | `Ticket #003 committed`, one per ticket |
| a build job prepares its worktree, or a review finds an item that does not hold | committed; in-review | in-progress | `in-progress`; created for a ticket without one | `In progress` | `started` if null; the row's end cleared | `Ticket #003 started` |
| a build job passes its gate | in-progress | in-review | `in-review` | `Awaiting review`; `Reviewing` while a review bar of the ticket is in progress | `finished` if null | `Ticket #003 in review` |
| a review job launches | in-review | in-review, unchanged | `in-review`, plus an in-progress review row for the job's round | `Reviewing` | — | `Review row #18 started: <name>` |
| a group ticket's merge lands on its group branch | in-review | reviewed | `reviewed`, its `reviewed` stamp set if unset | `Awaiting merge` | `finished` if null | `Ticket #003 reviewed` |
| a merge lands on the main line | in-review; reviewed for a release bundle's ticket landed with its group's release ticket | reviewed (unless already), then delivered | `delivered`; in-progress review rows delivered | `Done` | `finished` and `delivered` if null; `branch`, `commit` | the reviewed and delivered lines, and one per review row closed |
| `ticket deliver --by-hand` | anything but draft, while no Hephaestus is live and no job of the ticket is | delivered | `delivered` | `Done` | `delivered` if null | `Ticket #003 delivered` |
| `ticket abandon` | anything but delivered, abandoned | abandoned | `abandoned`; none created for a ticket without one | `Abandoned` | `abandonedAt`, always; the row's end if it had started | `Ticket #003 abandoned: <reason>` |
| `ticket reopen` | anything but draft and committed; a group's release ticket only while no other release ticket of its group is open | committed | `committed`, its start, end, `reviewed` and `reviewRound` cleared | `To do` | all four cleared; `reason` dropped | `Ticket #003 reopened` |
| `ticket unready` | committed, while no job of the ticket is on the board | draft | removed | `Draft` | — | `Ticket #003 unreadied` |
| `ticket priority … low` | draft, committed | unchanged | kept | — | — | `Ticket #003 priority normal → low` |
| `ticket priority` from low | any | unchanged | created when it has none and is not a draft: `committed` while the ticket is committed, else seeded from its stamps | per status | — | `Ticket #003 priority low → normal` |

A closing stamp is written only while it is still null, while `abandonedAt` is written every time:
re-entering a status is a correction, abandoning twice is deciding twice. Every move to a status other
than in-review finishes and delivers the ticket's in-progress review bar, with one log line each.

Filing the row is the first entry in its `history`, and each move appends another, so the detail
panel can say when the row reached each state and how long it sat there — the wait
between `To do` and `In progress` being the queue time. `task update --status` is not appended: it
corrects a row rather than moving it.

Moving a ticket to the status it already has is refused and logs nothing; a review round is counted on its review
bar, never as a move. A ticket taken straight to in-review, reviewed or delivered with `ticket status`, having
never started, gets a row whose start is stamped along with its end — an end without a start would draw from the
origin of the chart. There is no `paused` ticket status: `task pause <id>` records a waiting row and the ticket
stays where it was.
