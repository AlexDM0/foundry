# Command and file-format reference

> **Question:** What exactly does this command accept, and what exactly is in this file?
> **Time:** A minute per lookup; search it rather than read it through.
> **Read first:** [Overview](concepts/overview.md), [Reading names](glossary.md#reading-names).
> **Next:** [Running a board](operations/running-a-board.md), [Refusals](reference/refusals.md),
> [Known gaps](reference/known-gaps.md).

This page is the one reference for commands, flags, exit codes, environment variables, the ticket format, log kinds and
stored formats, for the `agent-progress-v2` build. Every section gives the contract and links the page that explains it.

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
| `concurrency`, `gate` | [Concurrency and gates](#concurrency-and-gates) |
| `review-stats` | [Review statistics](#review-statistics) |
| `hook`, `usage` | [Hooks and usage](#hooks-and-usage) |
| `oversee`, `open`, `version` | [The Overseer](#the-overseer) |
| `merges`, `merge`, `worktree repair` | [Merges and worktrees](#merges-and-worktrees) |
| `decisions`, `decide`, `incidents`, `incident`, `await` | [Decisions and incidents](#decisions-and-incidents) |
| `jobs`, `job`, `intake`, `advise` | [Jobs and sessions](#jobs-and-sessions) |
| `range`, `clear` | [The board's lifetime](#the-boards-lifetime) |

| stored file | section |
|---|---|
| `<data>/progress.json` | [The board's state](#dataprogressjson) |
| `<data>/pipeline.json` | [The gate pipeline](#datapipelinejson) |
| `<data>/log.jsonl` | [The log and its kinds](#datalogjsonl) |
| `<data>/hold-journal.json` | [The hold journal](#datahold-journaljson) |
| `<data>/version.json` | [The install version file](#dataversionjson) |
| `<monitor>/projects.json` | [The machine's registry](#monitorprojectsjson) |
| `<data>/tickets/<id>-<slug>.md` | [The ticket file](#datafoldertickets003-double-click-a-role-to-edit-itmd) |
| `<data>/epics/<key>.md` | [The epic file](#dataepicscheckout-redesignmd) |
| `<data>/filing-cabinet/D<n>.json` | [The filing draft](#datafiling-cabinetd1json) |

[The on-disk atlas](data-model/on-disk-atlas.md) names every other path.

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
- [Ticket moves and their rows](#ticket-moves-and-their-rows), whose legality is drawn in [State
  machines](data-model/state-machines.md)

## About this page

Bound values live in [Bounds](reference/deciders-and-bounds.md#bounds).
`agent-progress-v2 help` prints a shorter command reference from `cli/HelpText.ts`. `cli/HelpText.flags.spec.ts` holds
both texts against the parsers, and where their prose differs this page is right.

> **As built.** The help prose lags this page in places: [help text
> stale](reference/known-gaps.md#gap-help-text-stale).

`resources/templates/Reference.md`, installed as `<data>/reference.md`, copies three sections of this page word for
word: the ticket file, the ticket moves and the exit codes. `cli/ReferenceCopies.spec.ts` holds the copies, so a change
to either side changes both. Inside those sections `{{program}}` stands for `agent-progress-v2` and `{{dataFolder}}` for
`<data>`, which the install fills in.

The project overview is in the [README](../README.md) and the documentation map in [docs/README.md](README.md). Working
on this repository is in [Contributing](development/contributing.md).

## Conventions

| term | meaning |
|---|---|
| `<when>` | An ISO 8601 timestamp, `now`, or an offset from now: `-5m`, `-2h`, `-1d`, `+30m`. `--at <when>` backfills: a stamp already recorded is kept, so a row nobody registered at the time can be dated afterwards. |
| `<n>` | The figure on `--tokens`: a whole number or a decimal with a `k`/`m`/`b` suffix: `12000`, `12k`, `12.3k`, `1.2m`, `1.20b`, so a figure `status` or the [Bridge](glossary.md#bridge) prints reads back. A bare decimal and a negative are refused. It is a figure the caller reports, never one this tool measures, and it replaces the row's figure rather than adding to it. |
| `<id>` | A task id is a number (`17`); a ticket id is its padded number (`003`), and `3` or `#3` name the same ticket. |
| `<J>` | A [job](glossary.md#job) id, such as `J4`. |
| `<I>` | An [incident](glossary.md#incident) id, such as `I1`. |
| `<decision>` | A [decision](glossary.md#decision) id, such as `E7`. |
| `<hatch>` | The job's [Hatch](glossary.md#hatch) folder. |
| `--json` | Accepted by every command but `init`, `update`, `open`, `hook` and `help`, and prints one JSON document on standard output in place of the human output. A reading command prints the document its row describes. A command that writes prints what it wrote: the row for a `task` verb, the ticket for a `ticket` verb or setting (a list for several ids), the epic for `epic add` and `epic edit` (`{ key, removed: true, filePath }` for `epic remove`), the log entry for `log`, the stored axis for `range`, the new state for `concurrency <n>` and `oversee pause\|resume`, and the counts for `clear`. Nothing follows the document on standard output, no Next line or resume line, while a warning still goes to standard error. |
| `<data>`, `<worktrees>`, `<monitor>` | The board's data folder, its worktrees folder and the machine's monitor folder: `.agent-progress-v2/` and `.agent-progress-v2-worktrees/` in the repository root, and `~/.agent-progress-v2-monitor/`. [Reading names](glossary.md#reading-names) defines them. |
| product names | Every name the build goes by is `PRODUCT_NAMES` in `src/shared/constants/ProductNames.ts`; [Product names](development/porting.md#product-names) explains why two programs exist. |

### One tracker per repository

The [tracker](glossary.md#tracker) lives in `<data>/` at the repository root, found with
`git rev-parse --git-common-dir`, so every [worktree](glossary.md#worktree) of a repository shares one tracker and one
[board](glossary.md#board).

### Locking

Every mutating command takes the tracker's lock. It reads, changes and writes in one hold, in this order:
`progress.json`, `pipeline.json` when it changed, the tickets, the epics, the filing drafts, then `log.jsonl` when it
logged something. A ticket file is therefore never ahead of the progress file, and a log line never describes a change
that was not stored. Nothing renders: the [Overseer](glossary.md#overseer) serves the Bridge from the store.
[Storage](data-model/storage.md) holds the mechanics.

| takes the lock | takes no lock |
|---|---|
| `init` on a root with no tracker | `update`, and `init` on an existing tracker |
| `task`, `log`, `range`, `clear` | `status`, `usage`, `review-stats` |
| every `ticket` verb but the two reads | `ticket list`, `ticket show` |
| every `epic` verb but the two reads | `epic list`, `epic show` |
| every `draft` verb but the two reads | `draft list`, `draft show` |
| `concurrency <n>` | `concurrency` without an argument |
| the `gate` writes, `gate retry` | `gate list` |
| `merge`, `worktree repair` | `merges` |
| `decide`, `incident` | `decisions`, `incidents`, `await` |
| `job message`, `job fresh`, `job wind-down`, `job stop`, `intake`, `advise` | `jobs`, `job show`, `job attach` |
| `oversee pause\|resume` | `oversee status`, `open`, `version` |

Each file a lockless command reads is written atomically, so it is whole, but one such read can meet `progress.json`
ahead of the tickets and the log while a hold writes. `update`, and `init` on an existing tracker, never touch the
tracker's own files but the `progress.html` stub.

### Help and options

`agent-progress-v2 help` prints every command on one screen. `--help` works after a command word as well as on its own,
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
While the Overseer is paused, as a board that never set its Overseer state is, the line ends with
`; Overseer paused: wait for the user's go`. `--json` output never carries the line.

> **As built.** The free count here can differ from the one the Overseer launches by: [a launch slot has two
> definitions](reference/known-gaps.md#gap-slot-has-two-definitions).

## Environment variables

`src/shared/Environment.ts` is the one module that reads the environment. The product's own variables are named from
`PRODUCT_NAMES.ENVIRONMENT_PREFIX`: the `agent-progress-v2` build reads only `AGENT_PROGRESS_V2_` names and never the
released program's, so an `AGENT_PROGRESS_ROOT` in the environment does nothing here.

| variable | should a person set it | empty value | set by | what it does |
|---|---|---|---|---|
| `AGENT_PROGRESS_V2_ROOT` | Yes, for a command run from outside the repository or on a scratch board | Empty or whitespace reads as unset | User | Names the repository to use instead of walking up from the current directory. |
| `AGENT_PROGRESS_V2_REQUIRE_EVERY_TOOL` | Yes, on a test run only | On for any value but empty, whitespace or `0` | User, for a test run | Turns every spec `src/testing/ToolGuard.ts` would skip for a missing tool into a failure, for a machine that must prove every claim. |
| `AGENT_PROGRESS_V2_FAKE_AGENT` | Only on a scratch board, where the sessions do no real work | On for any value but empty, whitespace or `0` | Specs, the demo script, or User | Launches every session the Overseer starts as the scripted fake agent rather than the vendor's CLI. |
| `AGENT_PROGRESS_V2_FAKE_AGENT_KEEPS_WORKING` | Only to stage a running board | On for any value but empty, whitespace or `0` | `.readme-graphics/bridge-demo.sh` | Under the fake-agent switch, keeps every fake session working until its standard input closes. Read only while `AGENT_PROGRESS_V2_FAKE_AGENT` is on. |
| `AGENT_PROGRESS_V2_OVERSEER_POLL_INTERVAL_MILLISECONDS` | No, a test setting | Empty or whitespace reads as unset; any value but a positive whole number stops the command at exit 2 | `cli/testing/CliProcess.ts`, on every child a spec spawns | Replaces the 250 ms between the polls of `oversee --detach`, `oversee restart`, `oversee stop` and a Baton pass; the polls grow in number to keep each whole wait. |
| `AGENT_PROGRESS_V2_JOB_ID` | No | Empty or whitespace reads as unset | The Overseer, on every session it launches | The job this process runs under. |
| `AGENT_PROGRESS_V2_HATCH_DIRECTORY` | No | Empty or whitespace reads as unset | The Overseer, on every session it launches | The job's Hatch folder, the one place outside its working directory the session may write. |
| `SHELL` | Not for this program | Empty or whitespace reads as unset, and the line runs in `/bin/sh` | The login environment | The shell that runs each prepare step and gate line. |
| `ComSpec` | Not for this program | Empty or whitespace reads as unset | Windows | On Windows, the cmd.exe that runs each prepare step and gate line, taken only as an absolute path with a drive letter. |
| `SystemRoot` | Not for this program | Empty or whitespace reads as unset | Windows | On Windows, whose `System32\cmd.exe` runs the lines when `ComSpec` is no absolute path; with neither, no line runs. |
| `PATH` | Not for this program | An empty entry is left out | The login environment; the test preload prepends one folder | Its folders are the executables a gate's `--writes` must never let a branch replace, as `gate add` says. |

- `AGENT_PROGRESS_V2_ROOT` is for a command run from somewhere else entirely. It does not create a tracker: a value
  naming a directory that has none is refused with a message saying the variable is set. `init` does not choose its
  directory by it, and refuses at exit 1 when it names a directory other than the one `init` targets.
- `AGENT_PROGRESS_V2_FAKE_AGENT` is set by `cli/testing/CliProcess.ts` on every child a spec spawns, by
  `.readme-graphics/bridge-demo.sh`, or by User on a scratch board, so nothing spends a subscription.
- `AGENT_PROGRESS_V2_JOB_ID` and `AGENT_PROGRESS_V2_HATCH_DIRECTORY`, both set, make verbs follow [the
  Hatch](#under-a-job-the-hatch); one alone runs as any other process does. A gate's environment drops both, so a gate's
  verbs run directly.

> **As built.** The hook guard also needs the program on `PATH`: [a guard hook that cannot
> start](reference/known-gaps.md#gap-guard-hook-start-failure).

## Adopting a repository

```sh
cd ~/code/example-storefront
agent-progress-v2 init
```

`init` creates the tracker and installs everything a session needs to use it, the seven items below. `init` never writes
`CLAUDE.md`: a repository's `CLAUDE.md` holds its own conventions only. [CLI and
install](architecture/cli-and-install.md) explains the install and its two version numbers; [the on-disk
atlas](data-model/on-disk-atlas.md) names every path.

Git 2.38 or newer is required: merge forecasts and merge verification use `git merge-tree --write-tree`, which came in
2.38. `init` and `oversee` read `git version` first and refuse with exit 1 below it, or when no git answers, before
writing anything. Every git the tool starts, and every git a worker or gate starts, runs with `core.longpaths=true`, so
a worktree path past 260 characters still checks out on Windows; no repository's own git config is written.

| # | what | path | written by | opt-out |
|---|---|---|---|---|
| [1](#1-the-tracker) | The tracker: `progress.json`, `log.jsonl`, a `tickets/` folder, the `progress.html` stub, and the `.lock` directory | `<data>/` | `init` only; the stub also `update` and `oversee` | none |
| [2](#2-the-gitignore-entries) | `.gitignore` entries for the tracker (`init` only) and for the worktrees folder | `.gitignore` | `init`, `update` | none |
| [3](#3-the-files-beside-the-tracker) | The session instructions, from `resources/templates/SessionInstructions.md`, the reference, from `Reference.md`, and the seven instruction defaults, from `Constitution.md`, `OnboarderBrief.md` and `AssistantBrief.md` there and `BuildPrompt.md`, `ReviewPrompt.md`, `MergerBrief.md` and `ProductOwnerPrompt.md` under `resources/prompts/` | `<data>/session-instructions.md`, `reference.md`, `briefs/defaults/<constitution\|builder\|reviewer\|merger\|productOwner\|onboarder\|assistant>.md` | `init`, `update` | none |
| [4](#4-the-hook) | The `SessionStart` hook running `agent-progress-v2 hook session-start`, kept current in `.claude/settings.json` when that file already holds it | `.claude/settings.local.json` | `init`, `update` | `--no-hooks` |
| [5](#5-the-skills) | The two skills, copied from this checkout's `skills/agent-po/` and `skills/agent-progress-orchestrate/`, each with its `.gitignore` entry | `.claude/skills/agent-po-v2/`, `.claude/skills/agent-progress-orchestrate-v2/` | `init`, `update` | none |
| [6](#6-what-version-16-installed) | Removed once: the managed `CLAUDE.md` block, the `SubagentStop`, `PreToolUse` and `PostToolUse` hook entries, the worker agent definition, the dispatcher script and the three briefs install version 16 wrote, and the `assistant-brief.md` versions before 19 wrote | `CLAUDE.md`, `.claude/`, `<data>/` | `init`, `update` | `--no-hooks` keeps the hook entries |
| [7](#7-the-install-version) | The install version | `<data>/version.json` | `init`, `update` | none |

### Re-running

To pick up later instructions, hooks or skills, run `agent-progress-v2 update`, never `init` again. `init` at a root
that already has a tracker does exactly what `update` does and says so. `init` is refused below an existing tracker,
inside a bare repository, with a `--root` that is not an existing directory, or with `AGENT_PROGRESS_V2_ROOT` naming a
directory other than the one it would create the tracker in. `init` never replaces an existing `progress.json`: it
creates the store with an exclusive create, under the lock.

### The login item

`setup.sh --login-overseer <repository> [--label <label>]` (`setup.ps1` on Windows) writes an optional login item that
starts that repository's Overseer when the user logs in, and nothing else. The label defaults to `LOGIN_ITEM_LABEL`, and
a label that already starts another repository's Overseer is refused unless `--label` names another.

| OS | item | runs |
|---|---|---|
| macOS | the LaunchAgent `~/Library/LaunchAgents/<label>.plist`, `RunAtLoad`; setup prints the `launchctl bootstrap` line | `oversee --detach` in the repository |
| Linux | the systemd user unit `~/.config/systemd/user/<label>.service`, `Type=simple`, `KillMode=process`, `Restart=on-failure`, enabled with `systemctl --user enable`; setup prints the `loginctl enable-linger` hint | `oversee` in the foreground, in the repository |
| Windows | the value `<label>` under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, written through `reg.exe` by absolute path, no admin; a command line over 260 characters is refused | `oversee --detach --repository <repository>`, as a Run value has no working directory |

`KillMode=process` lets every Watcher outlive a stop or restart of the unit. On another OS, on Linux with no `systemctl`
or no user service manager, and on Windows with no absolute `SystemRoot`, setup exits 1 and writes nothing.

### What a run reports

`update`, and `init` at a root that already has a tracker, report items 3 to 6 and the worktrees entry on a line each:

- `updated` or `unchanged`, judged from the file's bytes before and after;
- for the hook, the same judged from its entry, or `installed` when it was added;
- `left alone` under the item's opt-out.

The session instructions' `updated` adds "re-read it before your next brief", so a session that read them at its start
learns its copy is stale. A first `init` prints the session instructions' path instead.

### The seven items

#### 1. The tracker

Its root is the main checkout, found from any worktree.

#### 2. The `.gitignore` entries

They are added only where the repository does not already ignore the path: `git check-ignore` decides, so a repository
covered by a broader pattern, a parent `.gitignore` or `.git/info/exclude` gets no diff at all. `init` adds the
worktrees folder's before any worktree can exist, and `update` adds it to a repository adopted earlier.

#### 3. The files beside the tracker

- `session-instructions.md` is what the SessionStart hook prints to every session User opens: how this repository tracks
  its work, which skill to load for what, and where the reference is. Its presence marks the files installed.
- `reference.md` is the ticket file's format, the ticket moves and the exit codes copied from this file, which a session
  reads on demand.
- `briefs/defaults/` holds the instruction file each role reads when the pipeline names none (see [Files on
  disk](#files-on-disk)), which the Overseer fills with the job's values at each launch.

These are guidance shipped with the tool rather than files a project edits, so every `init` and `update` rewrites them
all; a project adds its own tracked files through the pipeline instead. Item 3's report line names the session
instructions, and says `updated` when any of these files changed. Install version 19 removes the `assistant-brief.md`
earlier versions wrote.

> **As built.** The marker leaves a window while a fresh `init` runs: [the init marker
> window](reference/known-gaps.md#gap-init-marker-window).

#### 4. The hook

The hook goes in under an empty matcher, into `.claude/settings.local.json`. That is the per-user file Claude Code
applies over the shared one and keeps out of git, and a job's `--setting-sources project` never loads it, so the hook
lands in nothing colleagues share and reaches no worker. A repository that already keeps the hook in the shared
`.claude/settings.json` has it kept current there instead.

Either way it merges into whatever the file holds and is never added twice. It refuses a document it cannot parse rather
than replacing it, and writes nothing when the entry already says what it should.

Claude Code adds `**/.claude/settings.local.json` to the user's global git excludes the first time it writes that file
itself. Until then the file this tool creates shows up in `git status`; this tool writes no `.gitignore` entry for it.

#### 5. The skills

`agent-po-v2` and `agent-progress-orchestrate-v2` ([The two skills](#the-two-skills)) are copied file for file from this
checkout's `skills/` into `.claude/skills/<name>/`, where Claude Code reads a project's skills.

- Every `init` and `update` rewrites each file the skill ships, so a hand edit is undone.
- A file somebody else put in the folder is never touched, so one a newer skill no longer ships stays behind until
  removed by hand.
- Each folder gets its own `.gitignore` entry unless git already ignores it, since it is a copy the next `update`
  replaces.
- A skill folder an earlier version installed and this one retired, `.claude/skills/agent-progress-v2/`, loses the files
  that version shipped there (`SKILL.md`, `Reference.md`) and its exact `.gitignore` entry. A file somebody else put in
  it stays, and so does the folder then.

Item 5's report line names each folder, `updated` or `unchanged`, adds `.gitignore entry added` when it added one, and
says `retired` for a retired folder it cleared.

#### 6. What version 16 installed

- The managed block between `<!-- agent-progress-v2:managed:start -->` and `<!-- agent-progress-v2:managed:end -->` goes
  with the blank lines that separated it, everything else in `CLAUDE.md` byte for byte, and a file the block was all of
  is removed.
- The `CLAUDE.md` line says `removed; commit CLAUDE.md`, since the Overseer launches nothing onto a target whose
  committed `CLAUDE.md` still holds the markers (the `claude-md-block-committed` notice).
- A start marker with no end marker is refused and the file left alone.
- The three hook entries go from both settings files, unless `--no-hooks`.
- `.claude/agents/agent-progress-v2-worker.md`, the dispatcher script and `agent-brief.md`, `builder-brief.md` and
  `review-brief.md` go from where version 16 wrote them.

The `retired` line names what went, or says `nothing to remove`.

#### 7. The install version

[Its file](#dataversionjson) holds the one version of everything above that the tool installs, which changes only when
what the CLI and those files expect of each other changes. `init` and `update` compute every installed file first and
write this one last, after every other write, so a run that fails part way leaves the version it found and a second run
completes it. A refused `CLAUDE.md` block or settings file is reported and does not hold it back.

### The retired agent host

Claude Code is the only agent host. A `version.json` naming the `agentHost` an install before version 11 recorded for a
host agent-progress-v2 no longer installs for is refused by `init` and `update` at exit 1, writing nothing and deleting
nothing, naming the files that install left: remove them and the key by hand, then run the command again.

### Install version

`<data>/version.json` records which [install version](glossary.md#install-version) the installed files are (item 7
above), written last by `init` and `update`. Every command checks it against the running program before it does
anything, unless the second table below spares it.

| `version.json` | marker file | verdict | way out |
|---|---|---|---|
| records this program's version | any | the command runs | none needed |
| records a different version, older | any | refused | `agent-progress-v2 update` |
| records a different version, newer | any | refused | update the program itself first |
| missing | `<data>/session-instructions.md`, or a version 16 board's `agent-brief.md`: the files predate versioning or a fresh `init` was cut short | refused | `agent-progress-v2 update` |
| missing | neither, so nothing is installed that could disagree | the command runs | none needed |
| unreadable, or not a whole number of at least 1 | any | refused | `agent-progress-v2 update` |
| a directory sits at its path | any | refused | remove that directory, then `agent-progress-v2 update`, which could not replace it |

A refusal is one paragraph on standard error at exit 1, naming the tracked root and the way out; nothing is locked or
written first. Where no tracker governs the directory, the command's own no-tracker refusal is unchanged.

These commands do not take the refusal above:

| command | under a mismatch |
|---|---|
| `init`, `update` | They lift the refusal. They refuse, at exit 1 with the same paragraph and writing nothing, only files a later program installed, so an older program never writes its files over a later one's, and a directory at the file's path, which they could not replace. |
| `help`, `version` | They run; neither checks. |
| `status` | It never refuses and says nothing about a mismatch, because its output is what scripts read. The refusal first shows at the next command. |
| `hook session-start`, `hook bash-domains` | They skip the check, so a mismatch changes nothing: each answers at exit 0. |
| `oversee status`, `oversee stop` | They run, so an Overseer whose install changed can still be inspected and stopped. |
| `oversee --successor-of` | It skips this check and compares the manifest as a step of the [Baton pass](glossary.md#baton-pass), so a mismatch is reported as that Baton pass's failure. |
| a verb relayed [under a job](#under-a-job-the-hatch) | It relays before any check. |

## The two skills

`init` and `update` copy two Claude Code skills from this checkout's `skills/` into the tracked repository's git-ignored
`.claude/skills/` (item 5 of [Adopting a repository](#adopting-a-repository)). Neither lists commands:
`agent-progress-v2 help` is the reference, and both name it and `<data>/reference.md`. [Roles and
launch](architecture/roles-and-launch.md) says what each holds and which session loads it.

| installed skill | source folder | loads |
|---|---|---|
| `agent-po-v2` | `skills/agent-po/` | by itself in any session asked to file, report or track a ticket, bug or research question, or with `/agent-po-v2`; by the [orchestrator](glossary.md#orchestrator) wrapper session for its intake; and as the first line of an Overseer's product-owner job |
| `agent-progress-orchestrate-v2` | `skills/agent-progress-orchestrate/` | only with `/agent-progress-orchestrate-v2` or when asked to run the board |

## Commands

Options in `[brackets]` are optional; `a|b` is a choice of one. Everything after a bare `--` is one free text,
`-- <text>`, so a text may start with a dash.

### Setup

| command | what it does |
|---|---|
| `init [--project <name>] [--root <path>] [--no-hooks]` | Create the tracker here and write the seven items in [Adopting a repository](#adopting-a-repository). `--project` names the project shown on the Bridge (default: the root directory's name); `--root` tracks that directory instead of the discovered repository root. |
| `update [--no-hooks]` | Refresh what the tool wrote into a repository it already tracks: the files beside the tracker, the SessionStart hook, the two skills and the worktrees folder's `.gitignore` entry, undoing a hand edit to any of them, and removing once what earlier install versions wrote (item 6); then `version.json`. The tracker's own files are left alone, and the first line says so. |
| `help` | The command reference. |

#### `init` and `update` refusals

Both are refused at exit 1, writing nothing, while `version.json` names a retired agent host (`init` names each file and
deletes none) and over files a later program installed ([Install version](#install-version)). This build also refuses
`init` `older-program-present` at exit 1, like `update`, while the root holds the released program's `.agent-progress/`
folder, writing nothing.

`init` is also refused:

- when an ancestor already holds a tracker;
- when `--root` is not an existing directory;
- inside a bare repository;
- when `AGENT_PROGRESS_V2_ROOT` is set to a directory other than the one it would create the tracker in. The message
  names both, and nothing is written.

A re-run of `init` refreshes only what `update` refreshes and leaves the tracker's own files alone.

`update` creates no tracker, so it takes no `--project` and no `--root`. With no tracker it is refused at exit 1, naming
`agent-progress-v2 init`. A tracker in a format this one no longer reads is refused at exit 2 by every command that
reads it, the reason ending in `OLDER_FORMAT_ADVICE`.

#### What `update` does to a live Overseer

Last, when the board's Overseer is live and its [Baton](glossary.md#baton) names a code or install version other than
the one on disk, `update` sends `overseer-restart` and prints the checked [Baton pass](glossary.md#baton-pass)'s outcome
(see `oversee restart`). It exits 1 `baton-pass-failed` with the old Overseer still driving and what it installed
standing. With no live Overseer it does nothing more.

### Reading the board

| command | what it does |
|---|---|
| `status [--json] [--full] [--tickets-only]` | The project, the counts, the rows that are not delivered or abandoned, and the last five log entries newest first, then the Next line. [The flags](#status-flags) and [the `--json` documents](#what-status---json-holds) are below. |
| `ticket list [--status <s>] [--priority <p>] [--json]` | The tickets with their status, priority, type and row id, the model and effort after the title where the ticket names them, and "waiting on #003" where a dependency is unsettled. `--status` and `--priority` narrow the listing. `--json` carries no bodies. |
| `ticket show <id> [--json]` | One ticket: its frontmatter, its priority, its model and effort where it names them, its body, and always its file path, which an agent needs to edit that body. Once the ticket started it says whether the body changed since: a hash of the body now against the stored `claimedBodyHash`, never a clock; under `--json`, and in `status --json` and `ticket list --json`, that is `bodyChangedSinceClaim`, absent on a ticket never started. |

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

Both documents carry these keys in this order, except `omitted`, which only the working view has. The Overseer decides
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
| `concurrency` | `limit`, `agentsInFlight`, `freeSlots`, `readyTicketIds`, `overseerState`, `heldTicketIds`, then `inProgressTicketIds` and `inProgressReviewOfIds`. |
| `concurrency.inProgressTicketIds` | The `ticket` of every `in-progress` row that has one. |
| `concurrency.inProgressReviewOfIds` | The `reviewOf` of every `in-progress` row that stores one, on any row, a ticket's own row included. |
| `readyTickets` | See [Ready tickets](#ready-tickets). |
| `confinement` | The confinement in force for gate and install lines: `confined`, `unavailable` or `unconfined-by-design`, the word the Bridge header shows. |
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

A ticket is ready when it is pending and every ticket it depends on is reviewed or delivered; priority never keeps a
ticket from being ready, it only orders them. When one stays put, the [why-not-moving
lab](interactive/why-not-moving.html) walks the reasons.

- `readyTicketIds` orders them high priority first, then normal, then low.
- Within a priority they go by readiness: the log position of the ticket's latest `ticket-readied` or `ticket-reopened`
  line. A ticket with neither, readied before readiness was logged or behind a `Tracker cleared` line, comes first.
- Then lowest id first.

`readyTickets` lists the same tickets in the same order as `{ id, priority, model, effort }` with the defaults resolved,
plus `group` on a ticket that has one (absent otherwise, as in `tickets`) and `held: true` on a held one, so a reader
derives none of them itself.

#### A group awaiting its release

While a [group](glossary.md#group) has a release ticket (see `ticket release-of`) that is neither delivered nor
abandoned, every ticket of that group is left out of `readyTicketIds`, `readyTickets`, `reviewWaitingTickets` and
`pausedBuilds`, though the Overseer still builds them. Once the release ticket is delivered or abandoned, the group has
no release ticket, so its remaining open tickets list as any other. A group with no release ticket lists as ungrouped
tickets do.

> **As built.** [Group tickets missing from the ready
> ids](reference/known-gaps.md#gap-group-tickets-missing-from-ready-ids).

### Tasks

A task is a row on the Gantt chart. A row a ticket owns is moved by the `ticket` verbs; the `task` verbs refuse it,
except a pause and its resume, naming the `ticket` verb that moves both, and `--force` moves only the row.

| command | what it does |
|---|---|
| `task add "<name>" [--owner <who>] [--note <text>] [--ticket <id>] [--review-of <id>] [--start] [--tokens <n>] [--at <when>] [--force]` | Add a row. `--start` marks it in-progress at `--at` (default now); `--note` is the detail shown beside the bar; `--tokens` records what the work cost. `--ticket` and `--review-of` link it: see [below](#task-add-links). |
| `task start\|pause\|finish\|approve\|rereview\|deliver <id> [--owner <who>] [--note <text>] [--tokens <n>] [--at <when>] [--force]` | Move one row and stamp it. `start` sets its start and resumes a paused row; `pause` records that the work is waiting without closing the bar; `finish` and `approve` set its end; `rereview` sends a row whose review found too much into its next review round, 2 and then 3, without reopening the bar; `deliver` records that the work reached its destination. |
| `task update <id> [--name <text>] [--owner <who>] [--note <text>] [--status <status>] [--tokens <n>] [--force]` | Change a row without moving its clock, and without adding to its `history`: a correction is not something that happened. At least one field is required. `--status` is for a correction the transitions cannot express, and on a row a ticket owns is refused unless `--force`, except a pause and its resume. A rename never links a row, and never moves or drops a stored `reviewOf`. |
| `task remove <id>` | Delete a row. A ticket pointing at it is unlinked rather than deleted. The id is never given to another row. |
| `log "<text>" [--at <when>]` | Append one line to the log, which `status` and the Bridge's detail panel show. Every positional is joined, so an unquoted sentence is kept whole. |

The task statuses are `pending`, `in-progress`, `paused`, `in-review`, `re-review`, `reviewed`, `delivered` and
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

A [ticket](glossary.md#ticket) is a markdown file under `<data>/tickets/` driving one Gantt [row](glossary.md#row). Its
statuses and legal moves are drawn in [State machines](data-model/state-machines.md), and the [ticket journey
lab](interactive/ticket-journey.html) walks one through them.

Types are `ticket`, `bug` and `research`, and `ticket add` requires one; a stored `change` or `feature` reads as
`ticket`. Priorities are `low`, `normal` (the default) and `high`; models `haiku`, `sonnet`, `opus` and `fable`; efforts
`low`, `medium`, `high`, `xhigh` and `max`. A model or effort left unnamed reads as `opus` and `medium`. A ticket's
model and effort are stored and shown, and no launch reads them: [Roles and launch](architecture/roles-and-launch.md)
says what picks each session's model.

| command | what it does |
|---|---|
| `ticket add "<title>" --type ticket\|bug\|research [--priority low\|normal\|high] [--size XS\|S\|M\|L\|XL\|XXL] [--model <m>] [--effort <e>] [--group <name>] [--depends-on <ids>] [--epic <keys>] [--network <domains>] [--introduced-by <id>] [--found-in-review <id>] [--body <markdown>] [--body-file <path\|->] [--at <when>] [--needs-user]` | File a draft ticket, status `draft`, with no row at any priority and no task id spent: `ticket ready` makes it `pending` and files its row. [Its options and refusals](#ticket-add) are below. |
| `ticket edit <id> [--title "<title>"] [--append] [--body <markdown>] [--body-file <path\|->] [--force] [--at <when>] [--json]` | Rename a ticket with `--title`, replace its body with `--body` or `--body-file` (`-` reads standard input), or with `--append` add to its end. Only a draft or `pending` ticket is edited unless `--force`; [the rules](#ticket-edit) are below. |
| `ticket ready <id> [<id>...] [--incident <I>] [--at <when>] [--json]` | Ready draft tickets, or tickets in `ready-for-review`, to build, all or nothing in one lock hold: each becomes `pending` with a `pending` row at any priority, and one `ticket-readied` line is logged per ticket. [Its refusals](#ticket-ready) are below. |
| `ticket submit <id> [<id>...] [--at <when>] [--json]` | The filer's close of its draft tickets, in one lock hold. With ticket review off (`gate approval tickets off`) each complete draft becomes `pending` with its row (`ticket-readied`); with it on, the default, each becomes `ready-for-review` with no row (`ticket-submitted-for-review`) and waits for User's `ticket ready`. An incomplete draft stays a draft, named with its gaps; `--json` prints `{ tickets, incompleteTickets }`. A ticket that is not a draft is refused at exit 1 with nothing written (`ready-of-a-ticket-not-in-draft`). No role an agent runs under may relay it; a product owner under the Overseer closes with `intake close`. |
| `ticket triage <id> [<id>...] [--incident <I>] [--at <when>] [--json]` | Put findings to User's low-priority triage in one hold: each gets `findingRoute: user`, logged `ticket-triaged`, and a `first-run review` hold stays. A `findings-delivered` incident closes (`incident-handled`) once every finding it lists is readied, triaged or abandoned; its default triages every finding still listed. `--incident` is checked as on `ticket ready`. |
| `ticket park <id> [--incident <I>] -- <reason> [--at <when>] [--json]` | Hold the ticket `parked:<incident kind>` (`parked:user` with no incident, replacing any hold) and open a `parked` decision to User, the reason its question. Under an incident whose job waits on a question, the job ends `stopped` (cause `parked`) in the same hold and the decision carries the agent's questions, the reason as its context. |
| `ticket agent <id> [--model <m>] [--effort <e>] [--at <when>]` | Change the model or effort stored on a ticket, or both, with one log line such as `Ticket #003 agents opus/medium → sonnet/medium`. No launch reads them (see above). Refused at exit 1, writing nothing, on a delivered or abandoned ticket, with neither option, with a value outside the lists, and when the resolved pair would not change. |
| `ticket priority <id> low\|normal\|high [--at <when>]` | Change a ticket's priority, with one log line. Lowering to low is refused unless the ticket is a draft ticket or pending, and keeps its row: priority only orders the ready tickets. A draft ticket has none at any priority; raising a low ticket that has no row gives it one at once. A low ticket with no row gets its row when it starts, and keeps it; abandoning a low ticket that has none creates none. |
| `ticket size <id> XS\|S\|M\|L\|XL\|XXL [--at <when>]` | Change a ticket's size, in any status, with one `ticket-size-changed` log line. A size outside the list, in capitals only, and an unchanged size are refused at exit 1 with nothing written. |
| `ticket network <id> <domain>... \| --clear [--at <when>] [--json]` | Set the public domains the ticket's agents may reach, comma- or space-separated, stored lower case and once each as the frontmatter key `network`; `--clear` removes the key. One `ticket-network-set` log line, `updated` not stamped; [its refusals](#ticket-network) are below. |
| `ticket hold <id> [--reason <text>] [--at <when>]` | Pause a ticket between build and review, or between review rounds, without pausing the Overseer. While the frontmatter's `hold` key is set (to the reason, empty without one) the Overseer launches no builder or reviewer for it, and `status --json` lists it in `concurrency.heldTicketIds` and marks its `readyTickets` entry `held: true`. An agent already running is never interrupted. One log line; refused at exit 1 on a delivered or abandoned ticket and on one already held. |
| `ticket unhold <id> [--at <when>]` | Lift the hold, with one log line; the step it held starts at the Overseer's next [Pass](glossary.md#pass). On a ticket in progress whose row is paused, a last line says to resume it with `task start <row>`, since the Overseer never takes a paused row over. Refused at exit 1 on a delivered or abandoned ticket and on one not held. |
| `ticket release-of <id> [--clear] [--at <when>] [--json]` | Mark a ticket as its group's release ticket, the one whose release takes the group's work to the main line, or with `--clear` remove the mark. [The rules](#ticket-release-of) are below. |
| `ticket epic <id> [<key>...] \| --add <keys> \| --remove <keys> [--at <when>] [--json]` | Set the epics a ticket belongs to, in order: the first is its primary epic. Bare keys replace its list and no keys clears it; `--add` appends (a key already there keeps its place), `--remove` takes keys out. Either beside bare keys, or the two together, is refused as ambiguous at exit 1, and a key naming no epic is refused at exit 1 with nothing written. One log line, `Ticket #003 belongs to epics checkout-redesign, search`; `updated` is not stamped. `--json` prints the ticket with `added` and `dropped`. Epics never affect launching, concurrency or release: that is `group`. |
| `ticket introduced-by <id> [<cause id>] [--at <when>] [--json]` | Name the delivered ticket whose change introduced a bug, stored as its `introducedBy`; no cause, or an empty one, removes the key. Refused at exit 1 with nothing written when the ticket is not a bug, or the cause does not exist, is the ticket itself or is not delivered. One log line, `Ticket #007 introduced by #005`; `updated` is not stamped, and every other line of the file is kept. `--json` prints the ticket. |
| `ticket depends <id> [<id>...] \| --add <ids> \| --remove <ids> [--json]` | Set the tickets this one waits on: bare ids replace its list, no ids clears it, `--add 3,4` appends and `--remove 3,4` takes ids out. [The output and refusals](#ticket-depends) are below. |
| `ticket link <ticketId> <taskId> [--force]` | Point a ticket at an existing row instead of the one it filed. Refused when that row already belongs to another ticket, unless `--force`, which unlinks it there first. |
| `ticket abandon\|reopen <id> [--branch <b>] [--commit <sha>] [--reason <text>] [--tokens <n>] [--at <when>]` | Move a ticket and its row together, stamping both; the Overseer makes every other lifecycle move. `abandon` requires `--reason`; `reopen` clears the stamps and returns the row to pending. [The rules](#ticket-abandonreopen) are below. |
| `ticket status <id> <status> [...same options]` | The same move as `ticket abandon\|reopen`, naming the target status directly (pending, in-progress, in-review, reviewed, delivered or abandoned) with the same options. The documented way to make a move the verbs refuse: it skips the matrix, but never moves a ticket into `draft` (`move-to-draft`) or a draft ticket anywhere but `abandoned` (`move-of-a-draft`). |
| `ticket deliver <id> --by-hand [--branch <b>] [--commit <sha>] [--at <when>] [--json]` | The one record-only lifecycle verb: records as delivered a ticket User finished and landed outside the Overseer, from any status but draft, in one hold, merging, landing and spawning nothing; it logs `ticket-delivered` with `byHand: true`. Refused at exit 1, writing nothing, while an Overseer's Baton is live (`overseer-owns-the-lifecycle`, naming its URL) and while a job of the ticket is live (`ticket-has-live-job`), both judged inside the hold. Never relayed. |
| `ticket rereview <id> --start-review [--owner <who>] [--note <text>] [--at <when>]` | The next review round and the reviewer's in-progress bar (`Review <N> #<id> — <title>`, its `reviewOf` the ticket, N the bare `## Review` headings plus one, stored on the bar as `reviewBarRound`) in one lock hold, closing any bar of the round before, so `status --json` never shows the launch slot free between them. `--owner` and `--note` name the bar, and are refused without the flag. |
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
- `--size M` stores `size`, the expected change in code lines, comments and docs not counted: XS ≤ 20, S ≤ 100, M ≤ 300,
  L ≤ 750, XL ≤ 1500, XXL beyond.
- `--needs-user` routes a worker's low finding relayed under a job to User, and is refused `worker-filing-flag` anywhere
  else.

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
  of a draft ticket or a pending ticket is not logged. The write takes the tracker's lock and is atomic.
- Past `pending` (started, in review, reviewed, delivered, abandoned) the edit is refused at exit 1 with nothing written
  unless `--force`, held or not. Its status is read inside the same lock hold as the write, so no move slips between
  them.
- A forced edit that changes the body of a ticket carrying a `claimedBodyHash` logs one
  `ticket-body-changed-after-claim` record and shows as the body changed, while a ticket with no hash logs nothing. A
  rename alone moves `claimedBodyHash` along with the retitled heading, so it does not.
- An edit that changes nothing, an empty append or the current title included, writes nothing and exits 0.
- An empty replacement or `--title`, none of `--title`, `--body` and `--body-file`, or both body options are refused at
  exit 1.
- `--json` prints the ticket.

#### `ticket ready`

Refused at exit 1 with nothing written when any ticket named is not a draft ticket (`ready-of-a-ticket-not-in-draft`,
naming its status), or when any is incomplete (`incomplete-tickets`, naming each ticket and its gaps):

- `acceptance-unnumbered` when its `## Acceptance` holds no numbered item, read as a landing reads it;
- `brief-missing` when it has no `## Brief` holding a non-blank line.

No move returns a ticket to `draft`, and a draft ticket moves on only through `ticket ready`, `ticket submit`,
`intake close` or `ticket abandon`. Without `--incident` it also readies a ticket in `ready-for-review`: that is User's
ticket review, and no role an agent runs under may relay it. A ticket in `ready-for-review` moves on only through
`ticket ready` or `ticket abandon`; every other move, `ticket status` included, is refused
(`move-of-a-ticket-ready-for-review`), and no move reaches `ready-for-review` (`move-to-ready-for-review`).
`--incident <I>` readies only findings the open `findings-delivered` incident lists (`finding-not-listed` otherwise), a
first-run leftover by lifting its `first-run review` hold. A readied draft ticket is struck off every incident listing
it, whoever readied it. `--json` prints the ticket, or with several ids the list.

#### `ticket network`

The log line reads `Ticket #003 network: api.example.com` or `Ticket #003 needs no network`. Refused at exit 1 with
nothing written:

- a ticket that is not a draft ticket or pending (`network-of-a-ticket-past-pending`);
- any domain that is not public, naming each (`network-domain-not-public`): a loopback name (`localhost`, a name under
  `.localhost`), a `.local` name, an IPv4 literal in a loopback, private, link-local or shared range, an IPv6 literal
  outside global unicast, a single label or malformed text;
- the same list, or a clear of a ticket with none (`network-unchanged`);
- domains beside `--clear`.

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
| `epic show <key> [--json]` | One epic: its roll-up, its file path and its description. |
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
Bridge's board facts: `{ key, title, slot, ticketIds, ticketCountByStatus, tokens, span }`.

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
| `draft answer D<n> Q<k> "<answer>" [--json]` | Record the answer. A comma-separated list of option letters (`a`, `a,c`) chooses those options; anything else is free text, never both. Several letters on a single-select question, or a letter outside the options on either kind, is refused at exit 1 with nothing written, and so is a question the filing draft does not hold. Answering again overwrites the answer: the filing draft keeps only the current one, the log every one. Needs no claim, so the Bridge or any session may answer; the later write wins. |
| `draft drop D<n> N<k>\|Q<k> [--json]` | Remove a note or question made moot; dropping a question drops its follow-ups too, logging one line each. An item the filing draft does not hold is refused at exit 1. |
| `draft close D<n> --tickets <ids> [--json]` | End a filing draft once its tickets are filed: remove its file and log the ticket ids it became. `<ids>` are comma- or space-separated ticket references (`5`, `#005`); one that names no ticket is refused at exit 1 with nothing written, and so is no `--tickets`. While any question is unanswered, follow-ups included, it is refused at exit 1 with nothing written, naming the open question numbers in number order. A filing draft with no question closes at once, so a simple request goes open, note, tickets, close in one run. |
| `draft abandon D<n> --reason <text> [--json]` | Remove the filing draft's file, logging the reason. Refused at exit 1 without `--reason` or with a blank one. |
| `draft show D<n> [--json]` | One filing draft: its title, claim, state, file path, request, notes and question tree. `--json` prints the whole stored filing draft. |
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

The Overseer gates a tree by running the prepare steps, then each stored [gate](glossary.md#gate) in list order, the
first red gate stopping the rest. A gate passes only when it exits 0 and leaves every tracked file as it was. Exit 126
or 127, or a signal, is `gate-cannot-run`. A failed prepare step is a setup failure, never a red gate. The Overseer
never runs a gate's `fix`. [Customs and gates](architecture/customs-and-gates.md) holds how gates run, their gate slots
and their confinement.

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
stop waits out the grace and then ends the gate's whole process tree through `taskkill`. The Watcher records that end
as `signalled`, `SIGKILL`, so a stopped gate is `gate-cannot-run`; a kill from anything else, such as Task Manager,
reads as exit 1. The tree is walked through parent ids from the leader while it lives, so a member whose parent died
before the first listing is out of reach, as it is on POSIX.

| command | what it does |
|---|---|
| `concurrency [<n>] [--json]` | Print how many agents may be in flight at once, or store a new limit for every worktree: a whole number from 1 to 10. A higher one is refused at exit 1 with nothing written, and one an older tracker stored above 10 reads as 10. A tracker that never set one reads 2. A limit below the agents already in flight is accepted and leaves no free launch slot. A launch slot is an agent; [below](#launch-slots) says how each side counts. `--json` prints `{ limit, agentsInFlight, freeSlots }`, after a change as well. |
| `gate list [--json]` | Print the board's gate pipeline, stored in `<data>/pipeline.json` beside `progress.json`, never tracked and never inside a branch. Read-only, no lock. `--json` prints `{ pipelineIsSet, pipelineHash, prepare, gates }`, with `review`, `constitution` and `agents` when stored; with no pipeline `pipelineIsSet` is `false`, `pipelineHash` `null` and both lists empty. A malformed file is refused at exit 1 with its reason. |
| `gate prepare <name> [--json] -- <command>` | Set the prepare step `<name>`, which prepares a fresh worktree before a gate, with one log line (`Prepare step <name> set to <command>`, kind `pipeline-prepare-step-set`); a step of the same name is replaced where it stands. The steps run in order, with the network, before the gates. On a board with no `pipeline.json` this also stores an empty gate list, so tickets land ungated until a gate is added ([why to add gates first](architecture/customs-and-gates.md)). |
| `gate add <name> [--fix "<command>"] [--in <folder>] [--defined-by <pattern>]… [--network <domain>]… [--writes <path>]… [--overseer-only] [--json] -- <command>` | Add the gate `<name>`, run after the others, or replace a gate of the same name where it stands, with one log line (`Gate <name> set to <command>`, kind `pipeline-gate-added`). The gates run in order through this machine's shell (the Overseer's `SHELL`, or cmd.exe on Windows) in the worktree, `--in` a folder of it, each sandboxed with its own `--writes` folders and the network on when it names a `--network` domain, off otherwise; [the options](#gate-add) are below. |
| `gate none [--json]` | Store an empty gate list on purpose, with one log line (`No gates, on purpose`, kind `pipeline-gates-none`). Unlike no `pipeline.json` at all, which opens the `checks-not-set` decision and holds new work, it counts as set, and a landing runs no gate. |
| `gate remove <name> [--json]` | Remove the gate `<name>`, with one log line (`Gate <name> removed`, kind `pipeline-gate-removed`); an unknown name is refused at exit 1 with nothing written (`unknown-gate`). |
| `gate approval tickets on\|off [--json]` | Switch ticket review, stored as `approvals.tickets` in `pipeline.json`, with one log line (`Approval tickets set off`, kind `pipeline-approval-set`). On, as with no `approvals` key, a filer's closed draft waits in `ready-for-review` until User runs `ticket ready`; off, `ticket submit` and `intake close` make a complete draft `pending` at once. Any other approval or switch word is refused at exit 1 with nothing written, and so is a board with no `pipeline.json` (`approval-without-pipeline`), since a file holding only the switch would read as no gates on purpose. No role an agent runs under may relay it. |
| `gate retry <J> [--incident <I>] [--json]` | Settle job `J`'s `gate-cannot-run` or `sandbox-unavailable` incident (`incident-handled`): a merge job's [Airlock](glossary.md#airlock) gates its merged tree again on the next sweep, and an ended build's ticket is free for its next attempt. Without `--incident` it takes `J`'s one open incident that allows it; with none there is nothing to do. |

Every `gate` write (`prepare`, `add`, `none`, `remove`, `approval`) takes the lock, writes `pipeline.json` atomically
after `progress.json`, is accepted with tickets in flight and refuses a malformed `pipeline.json` at exit 1 rather than
overwrite it. A ticket's row records the content hash of the pipeline it was gated by (`pipelineHash`) at its next gate
run, which reads the pipeline afresh. `--json` on these writes prints `{ pipeline, pipelineHash }`.

#### `gate add`

`--defined-by` names the files that define the gate, as git pathspec-style globs. The Overseer's check V11 refuses a job
(`checks-definition-changed`) when a commit in its range changes a matching path its ticket body does not name.

- `*` and `?` stay inside one folder, and `**` crosses folders.
- A pattern without an inner `/` matches its name at any depth; one with an inner `/` is anchored at the repository
  root.
- A trailing `/` takes a folder's whole content.

`--network` turns a gate's network on or off: on when the gate names a domain, off when it names none. The domains do
not limit where an on network reaches. Off means a different thing on each OS:

- On macOS (Seatbelt) the gate cannot connect to any address, loopback included.
- On Linux (bubblewrap) the gate gets its own network namespace: it can reach its own loopback, but no host service and
  nothing outside. A Linux gate also runs read-only outside its writable folders, in its own pid namespace with a fresh
  `/proc`, and from bubblewrap 0.8.0 it cannot make a user namespace of its own, so a test that needs nested
  namespaces fails there. Where `bwrap` is missing, or the kernel or a container blocks its namespaces (as Ubuntu
  24.04's `kernel.apparmor_restrict_unprivileged_userns` can), the line is refused as `sandbox-unavailable`.

`--writes` names a folder a gate and a prepare step may write besides the worktree, its git admin folder and temp,
absolute on any OS (`/`, a drive or a share) or home-relative (`~/` or `~\`).

- A relative one, or one that is, sits in or holds a folder of executables or a folder on the Overseer's `PATH`, is
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
- An `--overseer-only` gate gives it none of these, since only the Overseer runs it.
- On Linux a worker's ref protection is `packed-refs` and the loose refs present at launch of the targets and of the
  ticket branches a worktree holds, with check V14 for any other ref; a Linux worker commits unsigned.
- Every session, whatever its role, may not read `~/.ssh`, `~/.aws`, `~/.netrc`, `~/.git-credentials`, Claude Code's
  `<config folder>/.credentials.json` and `~/.config/anthropic`. On Windows only the Read tool is denied them.
- A worker signs its commits through the gpg-agent and keyboxd sockets `gpgconf --list-dirs` names, with GnuPG's home
  readable and its `private-keys-v1.d` denied. With no gpgconf, or no agent socket, it commits unsigned and GnuPG's
  home is denied whole; a repository that sets `commit.gpgsign` then gets one log line per launch saying so.
- `--fix` is named in the builder's first message, to run before fixing by hand; the Overseer never runs it.

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

> **As built.** Gate network and sessions' writes are weaker than stated: [gate network
> unfiltered](reference/known-gaps.md#gap-gate-network-unfiltered), [gate writes unchecked for
> sessions](reference/known-gaps.md#gap-gate-writes-unchecked-for-sessions).

#### Launch slots

`status`, the Next line and `concurrency` count `in-progress` rows: each row with a stored `agent` key, grouped by that
key, plus each row with none, such as a review bar or a `task add --start` row. No production path writes `agent`. The
Overseer launches by a different count, its live build and review jobs.

> **As built.** The `agent` key is never written and the two counts can differ: [dead code and unused
> states](reference/known-gaps.md#gap-dead-code-and-unused-states), [a launch slot has two
> definitions](reference/known-gaps.md#gap-slot-has-two-definitions).

### Review statistics

| command | what it does |
|---|---|
| `review-stats [--json]` | What the recorded reviews catch, miss and cost, in one table over every recorded ticket and one per split. [Measurement](architecture/measurement.md) says how to read it. It takes no lock and writes nothing, as `status` does. |

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
| `hook session-start` | Print `session-instructions.md` for the session Claude Code is starting. `init` and `update` wire it as the `SessionStart` hook in `.claude/settings.local.json`, which a job's `--setting-sources project` never loads. It prints nothing under a job, skips the install version check, and exits 0 whatever happens, printing nothing on failure. |
| `hook bash-domains --allow <domains>` | Keep a job's network inside its ticket's `network` line: the `PreToolUse` guard an Overseer renders into a job's settings for a role with a `network` line, since auto mode's classifier may grant a domain the session asks for. [What it denies](#hook-bash-domains) is below. |
| `usage [--since <when>] [--transcripts <folder>] [--json]` | What this repository's subagents cost, read out of the transcripts the harness wrote for them under `~/.claude/projects/` (`$CLAUDE_CONFIG_DIR/projects/` when that variable is set): one row per agent, oldest first, then the cohort summary. It writes nothing and takes no lock; a repository with no transcripts is one sentence at exit 0. [The columns and flags](#usage) are below. |

#### `hook bash-domains`

It denies, through the hook's JSON on standard output (`hookSpecificOutput.permissionDecision` `deny`, with a reason), a
`Bash` or `PowerShell` call whose `allowed_domains`, or a `WebFetch` whose URL host, names a domain outside the
comma-separated `--allow` list. An entry `*.example.com` admits that domain's subdomains, never the domain itself. A
tool it does not know is denied, since it may be a new shell; a known tool that runs no command (`Read`, `Edit`,
`Write`, `Glob`, `Grep`, `NotebookEdit`, `TodoWrite`, `AskUserQuestion`) passes, printing nothing and granting nothing.

It reads no tracker, skips the install-version check, runs directly under a job, and exits 0 whatever happens. It
answers deny on any failure: no input, input that is not a JSON object, a url naming no host, an `allowed_domains` that
is no list of domains, an unknown option.

The Overseer renders it in exec form, before every `Bash`, `PowerShell` and `WebFetch` call: the program's absolute
path, resolved from the Overseer's `PATH` at launch, with its arguments and no shell, so a program missing from the
session's `PATH` cannot let a call through. When the program does not resolve at launch, the job's settings deny
`Bash`, `PowerShell` and `WebFetch` outright instead. What it enforces per OS:

| OS | shell calls | `WebFetch` |
|---|---|---|
| macOS, Linux | Each call's `allowed_domains`, the domains auto mode may add to the sandbox's strict network allowlist. | The URL host. |
| Windows | Nothing to check: no sandbox exists, so a call carries no `allowed_domains` and the network of a shell call is not limited. | The URL host. |

#### `usage`

The transcripts read include a workflow's agents under `subagents/workflows/<run>/`. Each row holds the agent's start,
its API calls, its end context, its input and output, its browser calls, the characters the harness injected into it and
the first line of its brief. The cohort summary holds median calls and end context, mean input and output, and the mean
of each figure below.

| column | counts |
|---|---|
| `over 200k` | The share of an agent's input sent at a context past 200,000 tokens (a raw token count under `--json`). |
| `bash edits` | The edits it made through a shell command (a heredoc, an inline interpreter or an in-place editor) instead of the editing tools. |
| `checks` | The Bash commands holding a test, type-check or lint fragment. |

`--since` splits the agents on an instant and summarises both sides; [Measurement](architecture/measurement.md) says
what that can and cannot compare. `--transcripts` reads a folder other than the one this repository's path resolves to.

> **As built.** No job session appears here: [usage misses job
> sessions](reference/known-gaps.md#gap-usage-misses-job-sessions).

### The Overseer

[Baton](architecture/baton.md) holds the start, the stop and the Baton file; [the Overseer
API](reference/overseer-api.md) holds the routes, guards and event stream.

The API binds `127.0.0.1` and refuses, 403, a Host other than `127.0.0.1:<port>` or `localhost:<port>`, an Origin other
than the API's own, and every preflight. Behind those guards, `POST /api/commands` and `POST /api/session-codes` need
the bearer token from the file the Baton names. The five data routes (`GET /api/session-token`, `/api/state`,
`/api/events`, `/api/jobs/<J>/stream`, `/api/jobs/<J>/files/<name>`) need that token or the HttpOnly, SameSite=Strict
session cookie that one code from `open` buys once at `POST /api/session`, and answer 401 otherwise; no request header a
local program can forge counts. `GET /api/identity`, `GET /api/summary` and `POST /api/nudge` stay open.

| command | what it does |
|---|---|
| `oversee [--port <n>] [--detach] [--repository <path>] [--json]` | Start the board's one Overseer in the foreground, logging to standard error and `<data>/overseer.log`, and print its URL (`--json`: `{url, generation}`). `--port` binds the one given, `0` any free one, and none keeps the board's derived port ([Watchers](architecture/watchers.md)); `--detach` starts the same command detached; `--repository` starts the Overseer of the repository at that path, relative to the working directory, in place of the working directory's. |
| `oversee --successor-of <generation> [--port <n>]` | The successor's side of `oversee restart`'s Baton pass, which only the live Overseer starts; see `oversee restart`. |
| `oversee stop [--now] [--json]` | Stop the live Overseer through its API with the token from the file the Baton names, else ends the process its Baton names, its identity checked first: SIGTERM where a process can be asked from outside, by force on Windows. It waits a bounded number of tries for the Baton to be gone or to name a dead process, else refuses `overseer-still-live` at exit 1. A Baton left naming a dead process means the Overseer never finished its own stop: once that process is gone the command records `overseer-stopped`, removes the registry entry, writes the page stub as down and releases the Baton, says so in place of a clean stop, and `--json` adds `ending` (`forced` or `unfinished`) beside `outcome: done`. A live [Watcher](glossary.md#watcher) is left running; `--now` also stops process Watchers, through the API only. With no live Overseer it has nothing to do (exit 0). It checks no install version. [Baton](architecture/baton.md) holds the paths. |
| `oversee restart [--now] [--json]` | The checked [Baton pass](architecture/baton.md) to the code on disk, after an install-version check. On success it prints `Overseer handed over to code <codeVersion> at <url>` (`--json`: `{outcome: done, url, codeVersion}`); [the rest](#oversee-restart) is below. |
| `oversee pause\|resume [--json]` | Store `overseerState` `paused` or `running` through the write pipeline, logged as an `overseer-set` record, with the Overseer up or down: a paused Overseer starts no new job. `--json` prints `{overseerState, previousState}`. |
| `oversee status [--json]` | The newest Baton, the URL, the runtime state, whether the board is paused, the code version on disk against the live Overseer's, the Overseer's notices, and the warning of a failed Baton pass. Read-only, no lock, no install-version check. [The states and JSON](#oversee-status) are below. |
| `open` | Open the live Overseer's URL in the default browser (`open` on macOS, `%SystemRoot%\System32\rundll32.exe url.dll,FileProtocolHandler` by absolute path on Windows, `xdg-open` on Linux and elsewhere, each detached) and print it, when the newest Baton in `<data>/overseer/` names a live process; otherwise refused `overseer-down` at exit 1, advising `oversee --detach`. The URL carries a one-time session code in its fragment, `#session=<code>`, asked for with the token; the Bridge exchanges it once for the session cookie every data route needs ([Browser sessions](reference/overseer-api.md#browser-sessions)). An Overseer that gives no code is reported on standard error and the plain URL opened. It takes no lock and writes nothing. |
| `version [--json]` | Print `{codeVersion, installVersion}`: a content hash of the program's shipping files on disk, and the install version this program writes. Read-only; it needs no tracker and checks no install version. |

#### Where the secrets live

The API token and every Watcher secret sit in `<monitor>/watchers/<trackerId>/`, under the user's home on every OS; a
launch file names its secret's file and holds no copy. Every session's read deny covers `<monitor>/watchers`.

| OS | The guarantee |
|---|---|
| macOS, Linux | The folder is mode 0700 and each file mode 0600, the temporary file of a write included. |
| Windows | Nothing writes an ACL: the profile's inherited ACL is the guarantee. Each folder and file is read back with `icacls.exe`, and one holding a trustee beyond SYSTEM, Administrators and the user, or one it cannot read, is refused. English trustee names only, so another display language refuses too. |

#### `oversee restart`

The live Overseer starts a successor, which proves it can take over before the old Overseer lets go; no Watcher is sent
anything. The Overseer never restarts itself.

- On a failure an Overseer of the old code keeps or takes back the board, `oversee status` shows the warning until a
  Baton pass succeeds, and `restart` refuses `baton-pass-failed` at exit 1.
- An Overseer whose API does not take the command is stopped and started again detached on its port. With none live, one
  is started.

> **As built.** `--now` counts only on that fallback: [restart drops
> `--now`](reference/known-gaps.md#gap-restart-now-dropped). The successor proves the Watcher bundle, not the Bridge: [a
> Baton pass builds no Bridge](reference/known-gaps.md#gap-baton-pass-builds-no-bridge).

#### `oversee status`

The runtime state comes from the Overseer's `GET /api/state`: `serving`, `held-by-install-change`, `passing-baton`;
`starting` while the API does not answer yet, or `down`. `--json` prints
`{state, paused, url, baton, codeVersionOnDisk, codeVersionInMemory, notices, batonPassWarning}`.

An install version that differs from the Overseer's holds launches, the stored `overseerState` untouched, with the
notice `install-version-changed`. Code that differs alone shows the notice `new-code`. Both say to run
`agent-progress-v2 update`, and [Baton](architecture/baton.md) holds the rest.

### Merges and worktrees

| command | what it does |
|---|---|
| `merges [--json]` | The merge queue, read as `status` reads the tracker (no lock, nothing written): each held Airlock slot `{target, jobId, ticketIds, phase, targetTip, branchTip}`, then each queued ticket `{ticketId, target, priority, queuedAt}` by target, priority, then queue order (the Airlock's own pick also weighs predicted conflicts), `queuedAt` its `merge-queued` record's place in the log. `--json` prints `{slots, queue}`. |
| `merge fixer\|abort\|review\|land <J> [--incident <I>] [--json]` | An [Airlock](glossary.md#airlock) move on merge job `J`'s open `merge-gate-failed` or `resolution-over-threshold` incident, recorded in a hold with the Overseer up or down and carried out by the Airlock on its next sweep; each marks the incident handled (`incident-handled`). [Each move](#merge-moves) is below. |
| `worktree repair <id> --step prune\|reinstall\|recreate\|unlock [--incident <I>] [--json]` | A code-implemented repair of the ticket's worktree `<worktrees>/ticket-<id>/`, run inside the hold that records it (`worktree-repaired {step, patchPath}`). [Each step](#worktree-repair) is below. |

#### `merge` moves

| move | allowed on | effect |
|---|---|---|
| `fixer` | `merge-gate-failed` | Sets the Airlock slot `fixing`, and the Airlock launches one merge-gate fixer (`MERGE_FIX_ATTEMPTS`, its own `MERGE_FIXER_API_CALL_BUDGET`) given the failed gate's last `CHECK_OUTPUT_TAIL_LINES` lines. A merged tree still failing after its fix resumes the same fixer twice, and the next red aborts the merge and parks the ticket `parked:merge-gate-failed`. |
| `review` | `resolution-over-threshold`, also its default | Lets the Airlock launch a resolution reviewer (`RESOLUTION_REVIEWER_API_CALL_BUDGET`). Claims that do not hold (`cannot-resolve` with no `reportKind`) abort the merge and park it `parked:merge-resolution-rejected`. |
| `abort` | both | Parks every ticket of the incident `parked:<kind>` with a `parked` decision, and the Airlock aborts the merge and frees the Airlock slot. |
| `land` | `resolution-over-threshold` | Moves the Airlock slot to landing when a `gate-ran` record passed the merged tree the incident names, else it is refused `merge-gate-not-passed`. |

Both Airlock agents run with the question tool disallowed. Without `--incident` the move takes `J`'s one open incident
that allows it. None is refused `no-open-incident`, several `several-open-incidents`, and a job holding no Airlock slot
`job-holds-no-airlock`.

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
| `decide <decision> <letters>... \| -- <text> [--json]` | Answer an open decision through the write pipeline, with the Overseer up or down: one choice of option letters per question (`decide E7 b`; `decide E7 b ac` when the second question is multi-select, its labels joined by `, `), or free text after `--` for a decision asking one question. The first answer wins; [the refusals and delivery](#decide) are below. |
| `await [--json] [--after <n>]` | Wait until the log holds a `decision-opened` or `incident-escalated` record past position `<n>` (the log's length at the start when absent; positions count from 1), then print them and stop. `--json` prints `{after, position, records}`, each record with its `position`; the next wait is `await --after <position>`. A stop signal ends the wait with nothing printed. Read-only, no lock. |
| `incidents [--json]` | The open incidents for the [Assistant](glossary.md#assistant), read from `progress.json` (no lock, nothing written), in opening order, each with its facts, the moves its kind allows and its default. `--json` prints `{incidents}` as `progress.json` stores them. |
| `incident answer <I> -- <text> [--json]` | Answer a `system-question` or `malformed-ticket` (`incident-not-a-question` for another kind): logged `incident-handled` and `incident-answered` with the question's request, which joins the waiting job's `answeredRequestIds`, and the job moves to `running` once nothing else it asked is open. The answer does not reach the session ([as built](reference/known-gaps.md#gap-incident-answer-not-delivered)). A `malformed-ticket`'s answer, or one no job waits on, is also written under the ticket's `## Questions`. |
| `incident note <I> -- <text> [--json]` | Record a finding under the incident, logged `incident-noted`; the incident stays open. |
| `incident escalate <I> [--json]` | Close the incident and put exactly the agent's questions to User as an `agent-question` decision on the same tickets, job and request, logged `incident-escalated`; one carrying no questions is refused `decision-without-questions`. Every move naming an incident, here or through `--incident`, is refused (`incident-move-not-allowed`, `incident-target-mismatch`, `finding-not-listed`) unless the incident is open, its kind's row of `ALLOWED_MOVES_BY_INCIDENT_KIND` allows the move, and a `job fresh`, `job message` or `ticket park` names the incident's own job or a ticket it lists, and marks it handled in the same hold. |

#### `decide`

Refused:

- `decision-has-several-questions`: free text on a decision with more than one question;
- `decision-option-unknown`: a letter naming no option;
- `decision-single-choice`: several letters on a single-choice question;
- `decision-answer-count`: a wrong number of choices;
- `decision-already-answered`: a second answer.

The answer is stored as `{question: answer}` and logged `decision-answered` with the question request it answers. The
request id joins the asking job's `answeredRequestIds`, and a job waiting on that answer alone moves back to `running`.

The Overseer then delivers it. A live Watcher still holding the request gets the `control_response` allow with
`updatedInput.answers`; a resumed session takes it as its first user line. A question whose ticket job ended `replaced`
or `stopped` was held on its ticket `awaiting answer (E<n>)`: the answer goes under the ticket's `## Questions` and
lifts the hold. `--json` prints `{decisionId, answer}`.

### Jobs and sessions

| command | what it does |
|---|---|
| `jobs [--json]` | The live jobs, one line each (id, kind and role, state, tickets, attempt, Watcher instance, a stop asked), then the Overseer (`live` with its URL, or `down`), paused or not, agents against the limit, the open decisions and incidents, and a warning line per incident that took its default since the Overseer last started. Read-only, no lock. `--json` prints `{jobs, overseer, paused, agentsInFlight, limit, openDecisions, openIncidents, defaultedIncidents}`, each defaulted one `{incidentId, move, cause, at}`. |
| `job show <J> [--json]` | The job's record from `progress.json`, or for a finished job what its `job-launched` and `job-ended` records hold, and its job folder; an unknown job is refused. Read-only, no lock. `--json` prints `{job, jobFolder}`. |
| `job attach <J> [--json]` | Every Watcher instance's event log in instance order through the adapter's mapper, then the newest followed while the job is on the board; it never connects to a Watcher ([why](architecture/watchers.md#protocol-1)). Read-only, no lock. `--json` prints `{jobId, lines}` of the replay and follows nothing. |
| `job message <J> [--incident <I>] -- <text> [--json]` | Record a chat turn in a hold, logged `job-messaged`, with the Overseer up or down; the Overseer writes it to the live session in log order, once; to the Assistant only at its next idle point (see [The Assistant](#the-assistant)). [Reopening and refusals](#job-message) are below. |
| `job fresh <J> [--incident <I>] [--json]` | End the job `replaced`, holding nothing, so the next attempt starts on its worktree with the earlier-session note. `--incident` names the incident it handles; a job with no ticket is refused `job-has-no-ticket`. |
| `job wind-down\|stop <J> [--json]` | Logged `job-stop-requested` with its mode and kept as the job's `stopRequest`, with the Overseer up or down. `wind-down` sends the wind-down turn; `stop` moves the job to `stopping` and the Overseer stops its Watcher, the job ending `stopped`. [What each holds](#job-wind-downstop) is below. |
| `job stop --all [--wind-down] [--json]` | `oversee pause`, then a stop (or wind-down) of every build, review and product-owner job, in one hold. |
| `intake -- <text> [--json]` | Record a `product-owner` job with no ticket and no launch slot, `launching`, with the Overseer up or down; several may run at once. The Overseer launches it in `<worktrees>/sessions/<J>/`, its first line `/<agent-po skill> <text>`, skills on, WebFetch and WebSearch allowed and Bash `allowedDomains: []`; it files draft tickets through its Hatch folder and never readies one. Follow-ups are `job message` turns. |
| `advise [--json]` | Record an [onboarder](glossary.md#onboarder) job with no ticket, no target and no launch slot, `launching`, with the Overseer up or down; its mode is `setup` with no pipeline and `advise` with one. [Where it runs and what it writes](#advise) is below. |
| `intake close <J> [--set <id,id>]... [--json]` | Close the [product owner](glossary.md#product-owner)'s input (`job-not-intake` for another kind of job, `job-finished` once closed). Under the product owner's own job it names no job: the Overseer stamps its own. [What follows](#intake-close) is below. |

#### `job message`

A product-owner job that ended `closed` (its own `intake-close` or `job stop`) is reopened instead, logged
`job-reopened`: back on the board `running` in its next Watcher instance, which resumes its session by id in the same
folder with the text as its first line.

- Any other finished job, or a session whose input is closing, is refused `job-finished`.
- Under an incident it is refused `job-awaits-user-answer` for a job in `waiting-for-answer` or whose ticket has an open
  `agent-question`, and `job-is-product-owner` for User's product-owner session.

#### `job wind-down|stop`

- `stop` and `wind-down` hold the job's ticket `stopped by User (J<n>)` or `wound down by User (J<n>)` in the same hold
  (an already held ticket keeps its hold), which the policy never undoes. `ticket unhold` lets a fresh agent take it.
- A job with no session yet (launching, preparing, interrupted, awaiting an answer) ends `stopped` in the same hold.
- A stopped product owner is finished: its open decisions are withdrawn (`decision-withdrawn`), its draft tickets stay
  draft tickets, and it resumes only when User sends it a `job message`.

[State machines](data-model/state-machines.md) draws the job states and the stop modes, and the [state
explorer](interactive/state-explorer.html) walks them.

> **As built.** A `job stop` does not stop a merge: [job stop misses a
> merge](reference/known-gaps.md#gap-job-stop-misses-merge). It sends no frame to a merge agent or onboarder: [a stop of
> a merge agent sends no frame](reference/known-gaps.md#gap-stop-of-merge-agent-sends-no-frame).
> On POSIX, a stop reaches the groups below a job only through a live parent, so a tree whose leader died with its
> Watcher stays unreachable: [gap-bash-group-survives-kill](reference/known-gaps.md#gap-bash-group-survives-kill).

#### `advise`

With no pipeline stored the lifecycle starts one by itself, answering `checks-not-set`, once per opening of that
decision. The Overseer launches it in a detached snapshot of the main line, `<worktrees>/onboard/<J>/`, writing only its
Hatch folder, with no network.

A verified `setup` proposal ends the job `closed` and opens a `pipeline-proposal` decision: `Accept` writes the prepare
steps and gates through the `gate prepare`, `gate add` and `gate none` moves in the answering hold, `Decline` changes
nothing. The review, constitution and agent arrays are shown, never written. The decision also names, read from git's
index of the snapshot and so the same on every OS, what the tree cannot represent everywhere: a path part that is a
reserved device name (`aux.c`), one Windows cannot store, paths differing only in case (`README.md`, `readme.md`) and
symbolic links (mode 120000), one finding each; a refused pass adds them to its facts. Nothing is repaired. [Customs and
gates](architecture/customs-and-gates.md) holds the report, the two runs and the hand-edit route.

> **As built.** An `advise` run cannot file its optimisations: [onboarder advise
> filing](reference/known-gaps.md#gap-onboarder-advise-filing).

#### `intake close`

In the same hold it submits every draft ticket it (and any session it took over from) filed, as `ticket submit` does:
with ticket review off each complete one becomes `pending` with its row, with it on each becomes `ready-for-review`
for User's `ticket ready`, and an incomplete one stays a draft. `--set` is stored on the job and decides nothing. Once
no Watcher of it is live the Overseer ends it `closed`.

A product owner interrupted by a reboot resumes by id once its question is answered. One past the crash bound with a
question open waits `awaiting-answer`, and once answered a fresh session takes over with its draft tickets and the
answers in its first message, never a resume.

### The board's lifetime

| command | what it does |
|---|---|
| `range --from <when> --to <when> [--tick <15m\|1h\|1d>]` | Store the default axis of the chart, with one log line. `--tick` takes any positive whole number of minutes, hours or days (`15m`, `2h`, `1d`), or a bare number of minutes. Besides a `<when>`, a bound may be `start`, the earliest visible row. A relative bound is stored as written, so `--from -2h` keeps meaning "the last two hours" on every refresh. A pair that is not in order is refused at exit 1 when both are timestamps or both are relative to now; a pair naming `start` or mixing the two is not judged. The Bridge's own range menu overrides it per browser. |
| `range --auto` | Reset the axis to the automatic span. It takes no `--from`, `--to` or `--tick`; any of them beside it is refused at exit 1. |
| `clear [--all] [--yes]` | Throw away every task row and the log, restart the clock and reset the stored axis to automatic, leaving one `Tracker cleared` log line, and keep the tickets. `--all` deletes the tickets and every epic too. `--yes` skips the confirmation, and is required when standard input is not a terminal; [what survives](#clear) is below. |

#### `clear`

- Each surviving ticket is given a fresh row seeded from its own frontmatter, with a fresh id, except a rowless ticket
  that stays off the chart ([Ticket and row](data-model/entities.md#ticket-and-row)).
- Row ids are not reused, and every epic file is kept untouched.
- `--all` restarts the ticket ids at 001.
- `--json` prints `removedTaskCount`, `removedLogCount`, `deletedTicketCount`, `deletedEpicCount` and
  `reseededTicketCount`.

> **As built.** [`clear --all` reuses ticket ids](reference/known-gaps.md#gap-clear-all-reuses-ticket-ids).

## Job contracts

These five sections are contracts, not command groups. Each says what a job does, what shows, and which moves User or
the [Assistant](glossary.md#assistant) has. [State machines](data-model/state-machines.md) draws the job states, and the
[failure lab](interactive/failure-lab.html) tries the failure rows.

### A build job

A readied ticket's [build job](glossary.md#build-job) moves through `launching`, `preparing`, `running`, `in-customs`
and `gating`, one state to a [Pass](glossary.md#pass). The Overseer adds `<worktrees>/ticket-<id>/` on branch
`ticket-<id>`, runs the install line, and launches the [builder](glossary.md#builder) with the ticket and every gate it
must pass. A builder ends by reporting; it never edits its ticket file.

[Customs](glossary.md#customs) verifies the report, the gates run, and when they pass the Overseer replaces the ticket's
`## Handoff` with the report's handoff and Acceptance evidence and moves the ticket `in-review`. [Build and
review](architecture/build-and-review.md) holds the flow, [Customs and gates](architecture/customs-and-gates.md) the
checks and how each refusal routes, and [Confinement](architecture/confinement.md) what a session may reach.

| what happens | what shows | moves for User or the Assistant |
| --- | --- | --- |
| worktree creation, the install line or a gating prepare step fails | incident `setup-failed`; the job ends `stopped` | `worktree repair`, `ticket park` |
| the session exits without a valid report, the report says `cannot-build`, a commit carries an attribution trailer, or Customs refuses for any reason the next row does not name | a [failed pass](glossary.md#failed-pass), `job-ended` `failed` with its cause; an attribution trailer also shows the `attribution-found` notice, and a V13 refusal also opens the `branch-touches-agent-config` decision | none: the next attempt is automatic, up to the bound; answer the decision where one opened |
| a gate fails, Customs refuses V3 (no commit), V4 (a dirty worktree) or V15 (missing or stale gate claims), or a session working off a red handoff spends its call budget and grace | a [red handoff](glossary.md#red-handoff): the same session resumes on `gate-failure.md`, the red-handoff note, up to `RED_HANDOFF_RESUMES_BEFORE_PARKING` (2) times, then the ticket parks `parked:red-resumes-spent` with a `parked` decision | `ticket unhold` for a fresh attempt |
| the report says `blocked` | incident `blocked`; the job ends `blocked` | `job fresh`, `worktree repair`, `ticket park` |
| the report says `wound-down`, or a session not working off a red handoff spends its call budget and grace | incident `out-of-calls` | `job fresh`, `ticket park` |
| a gate exits 126 or 127, or a signal kills it | incident `gate-cannot-run`; the job ends `stopped` | `gate retry`, `worktree repair`, `ticket park` |
| a gate, prepare or install line is refused because confinement is `unavailable` | incident `sandbox-unavailable`; the job ends `stopped`; the line never starts | `gate retry`, `ticket park` |
| on Linux, the worktree's `.claude/` folder cannot be made before a gate, prepare, install or worker launch | incident `sandbox-unavailable`; the job ends `stopped`; the launch never starts | `gate retry`, `ticket park` |
| no `pipeline.json` is stored | the `checks-not-set` decision; nothing launches | `gate add`, `gate none`, `advise` |
| `pipeline.json` is malformed | the `checks-not-set` decision; nothing launches | repair or delete `<data>/pipeline.json`: every `gate` write refuses it until then |
| a running build or review's event log stands still for `QUIET_JOB_SWEEPS` (6) sweeps | incident `quiet-job` | `job message`, `job fresh` |

A ticket an open incident names launches no new job until the incident is settled.

On macOS and Linux a line never runs unconfined: `oversee` refuses at exit 1 where confinement is `unavailable`, naming
what is missing, and each gate path refuses again. On Windows the answer is `unconfined-by-design` and a line runs
unwrapped in its job worktree.

### The Airlocks

After each Pass the Overseer sweeps one [Airlock](glossary.md#airlock) per target: the main line and each `group-<name>`
with an open ticket. A queued ticket merges in a `merge` job, whose record carries
`airlock: {target, targetTip, branchTip, phase}`.

The merged tree is gated, unless it is the branch's own tree and that tree last passed, then landed by a
compare-and-swap fast-forward, logging `merge-landed`. A group ticket lands on `group-<name>` of kind `integrated` and
moves to `reviewed`; the group's release ticket lands its whole bundle on the main line.

`merges` shows the queue. [Airlocks and groups](architecture/airlocks-and-groups.md) holds the order, the phases,
refresh and release.

| what happens | what shows | moves for User or the Assistant |
| --- | --- | --- |
| a resolver cannot finish | the merge aborts, the Airlock slot frees and the `merge-refused` decision opens | answer the decision |
| the resolution changes over `RESOLUTION_REVIEW_THRESHOLD_LINES` (150) lines | incident `resolution-over-threshold`; the Airlock slot waits | `merge review`, `merge land`, `merge abort` |
| the merged tree fails its gate | incident `merge-gate-failed`; the Airlock slot waits | `merge fixer`, `merge abort`, `ticket park` |
| the merged tree fails its gate after `MERGE_FIX_ATTEMPTS` launches, or a fixer's resumes are spent | no incident: the merge aborts, the Airlock slot frees and the ticket parks `parked:merge-gate-failed` with a `parked` decision | answer the decision |
| a merged tree's gate cannot run | incident `gate-cannot-run`; the Airlock slot waits | `gate retry`, `worktree repair`, `ticket park` |
| a merged tree's line is refused because confinement is `unavailable` | incident `sandbox-unavailable`; the Airlock slot waits | `gate retry`, `ticket park` |
| a merged tree's prepare step fails | incident `setup-failed`; the Airlock slot waits | `worktree repair`, `ticket park` |
| the Acceptance is not accounted for at landing | the ticket leaves the queue, held, with the `landing-refused` decision | answer the decision |
| the main checkout is off the main line, or its changes block the fast-forward | that target's landings wait under the `dirty-main-checkout` notice | clean the main checkout |
| another process holds a file of the target's checkout open, so git cannot replace it (Windows), on each of `HELD_CHECKOUT_RETRY_TRIES` (3) tries | the files git already wrote go back to HEAD; that target's landings wait under the `target-file-held` notice, which names the held files | close the program that holds the file |

### A review job

A ticket `in-review` gets a [review round](glossary.md#review-round) when the pipeline has a `review` key; without one,
a gated build queues to merge at once and lands on its gates alone.

A review job starts a [review bar](glossary.md#review-bar), reuses the ticket's worktree, and moves through the same
states as a build job. Once verified and gated, the Overseer counts the rework, commits
`Review round <n> of #<id>: no changes` when the reviewer committed nothing, appends `## Review <n>` and takes the
[round verdict](glossary.md#round-verdict). [Build and review](architecture/build-and-review.md) holds the rules.

Before the reviewer starts, the review job brings the branch up to its target. Once the install line passed, the
Overseer reads the target's tip and checks that the branch holds it. A branch that holds it starts its reviewer with no
merge and no gate run. Otherwise the Overseer records both tips in the job folder and merges the target's tip into the
ticket's worktree (`git merge --no-ff --no-edit`), in a process Watcher of its own, its folder `target-merge`, with
every hook off. That merge is the Overseer's own git, so it runs outside the gate sandbox.

| the merge | what the Overseer does |
| --- | --- |
| is clean | it gates the merged tree, each step in a `target-` Watcher folder; the reviewer starts only when every gate is green |
| is clean, but a gate is red | the job ends `does-not-hold` (cause `target-gate-red`) and the ticket goes `in-progress`; the builder's session resumes with the red handoff, its Baton pass in the review's job folder |
| conflicts | the merge is aborted and the worktree reset to the branch tip; the job ends `does-not-hold` (cause `target-conflict`) and the ticket goes `in-progress`; the builder's session resumes with the target tip and the conflicted files |
| cannot run or settle | incident `setup-failed` (step `target-merge`); the job ends `stopped` |

Each return to the builder counts with its red handoffs, so the return past the last resume parks the ticket
`red-resumes-spent`. The review job checks only once, against the tip it recorded: a target that moves after the check
is merged in by the Airlock.

| the review | what the Overseer does |
| --- | --- |
| claims an item `does-not-hold` | the job ends `does-not-hold` and the ticket goes `in-progress`: a resume of the builder when its build was `built`, counted with its red handoffs, otherwise a failed pass |
| reworked over `REWORK_ROUND_THRESHOLD_LINES` (750) and the round verdict grants another round | the job ends `round-granted`, and a fresh reviewer runs one round on |
| reworked over the threshold and was refused another round | it passes on; the ticket shows the `rounds-not-converging` notice |
| claims an item `waiver-proposed` | the `waiver` decision opens, the job waits `awaiting-answer`, and the ticket leaves the merge queue, held. Answering does not act on the ruling ([as built](reference/known-gaps.md#gap-waiver-answer-has-no-effect)) |
| otherwise | the job ends `reviewed`, the ticket is marked `mergeQueued` and `merge-queued` is logged with its target |

### The Assistant

The Overseer always has one `assistant` job, the [Assistant](glossary.md#assistant): no ticket, no launch slot, never
resumed, with no off switch. It receives open [incidents](glossary.md#incident) in numbered chats and settles them
through its Hatch. An incident it leaves takes its default when its chat turn closes.

User reads and talks to it with `incidents`, `job message <J>`, `incident note`, and the Assistant tab. `job message` is
written at its next idle point. [The Assistant](architecture/assistant-and-intake.md#the-assistant) holds its turns,
bounds and replacement, and [Questions and incidents](architecture/questions-and-incidents.md) the incident table.

### Under a job: the Hatch

A session the Overseer launched cannot write the data folder; its Hatch folder is its one way to change the board. It
counts as under a job with both `AGENT_PROGRESS_V2_JOB_ID` and `AGENT_PROGRESS_V2_HATCH_DIRECTORY` set ([Environment
variables](#environment-variables)). [Control and Hatch](architecture/control-and-hatch.md) holds the contract, the
[Bouncer](glossary.md#bouncer)'s rules and how a request is applied.

- **Direct:** `help`, `status`, `usage`, `review-stats`, `ticket show|list`, `epic show|list`, `draft show|list`,
  `hook bash-domains`, `hook session-start`, `version`, `oversee status`, `decisions`, `incidents`, `merges`, `jobs`,
  `job show|attach`, `gate list` and `concurrency` with no argument, which only reads, run as usual.
- **Relayed:** a verb of a control command parses its arguments as usual, then, before any install-version check, writes
  `<hatch>/requests/<requestId>.json` atomically, `{hatchFormatVersion: 1, requestId, command, bodyText?}`, and waits
  for `<hatch>/replies/<requestId>.json`, up to `HATCH_REPLY_TRIES` times `HATCH_REPLY_INTERVAL_MILLISECONDS` apart. It
  prints `done <requestId>` or `nothing-to-do <requestId>` with the tickets it touched at exit 0, or the refusal worded
  as a direct run words it. With no reply it prints `queued <requestId>` at exit 0.
- **Refused:** every other verb, at exit 1 (`verb-not-relayable`).
- **Identity:** a request names no job and no role. The Overseer takes both from the Hatch folder's job record and
  refuses a request carrying either `hatch-identity-mismatch`.
- **Filing:** an admitted filing is stamped `filedByJob`, and a worker's finding `findingRoute`, `assistant` or `user`;
  both are in the ticket file's format. `ticket add --needs-user` exists only for a worker's relayed low finding and is
  refused `worker-filing-flag` anywhere else.

> **As built.** A refused relayed command keeps what it changed before the refusal, so "nothing written" holds only at a
> terminal: [a refused relayed command](reference/known-gaps.md#gap-refused-relayed-command-partial).

**Findings.** A builder's, reviewer's or merge-gate fixer's finding is that relayed low draft ticket. With route
`assistant` it waits for one `findings-delivered` incident, where the Assistant readies it with
`ticket ready <id> --incident <I>` or triages it with `ticket triage <id> --incident <I>`. With route `user` it waits in
User's Low-priority triage list. [The findings path](architecture/assistant-and-intake.md#the-findings-path) holds the
rest.

> **As built.** A landing opens no such incident: [delivery opens no findings
> incident](reference/known-gaps.md#gap-delivery-opens-no-findings-incident).

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
| `oversee` where confinement is unavailable | refuses at exit 1 | refuses at exit 1 | never: nothing is confined |
| Stop of a process | SIGTERM, then by force | SIGTERM, then by force | by force: `taskkill` of the whole tree |
| Watcher endpoint | a Unix socket, path at most 103 bytes | a Unix socket, path at most 107 bytes | a named pipe with a random name |
| Owner-only files | mode 0700 and 0600 | mode 0700 and 0600 | the profile's inherited ACL, read back with `icacls.exe` |
| Temp folders a tracker may not live in | `os.tmpdir()`, `/tmp`, `/var/tmp` | `os.tmpdir()`, `/tmp`, `/var/tmp` | `os.tmpdir()` |
| `open` | `open` | `xdg-open` | `rundll32.exe url.dll,FileProtocolHandler` |
| Login item | a LaunchAgent | a systemd user unit | a `Run` registry value |

A Watcher outlives its Overseer only where nothing kills the Overseer's whole process group, cgroup or job:

- On Linux, a logout ends every Watcher started from that login session when logind sets `KillUserProcesses=yes`. The
  login item's unit sets `KillMode=process`, so a stop or restart of the unit leaves its Watchers running.
- In a container, run with `--init` (as `docker run --init`), so a process reaps the ended Watchers; without it an
  ended Watcher stays a zombie, which still reads as a live process.
- On Windows, a detached child stays in its parent's job object, as Bun has no option to break away from it. When the
  Overseer starts inside a job that ends its members on close, as some terminals and CI runners do, closing it ends
  every Watcher. Start the Overseer from a plain console or the login item.

In the Git Bash terminal (mintty), standard input is a pipe and not a console, so no command sees a terminal: `clear`
refuses without `--yes`, and must be given it there.

What native Windows loses with no confinement: a worker's or a gate's shell can read the Overseer's token and the
launch data, and so drive the Overseer's API with no role check; it can write another job's Hatch folder, and the
Bouncer then takes that write as the other job's; it can forge a gate-ran record, move any ref, and reach any network.
Customs and V14 find a moved ref only afterward. Run on Windows only what you would run unconfined on your own
account.

The repository's own development tooling, `.claude/hooks/fix-lint-on-edit.sh` and `.readme-graphics/`, is bash, for
the owner's macOS and Linux machines only; it is no part of the product.

## Exit codes

| code | meaning | examples |
|---|---|---|
| **0** | done, or there was nothing to do | also a command under a job that printed `done`, `nothing-to-do` or `queued` with its request id, `oversee stop` with no live Overseer, every `hook session-start` run, and every `hook bash-domains` run, a deny answered through its JSON |
| **1** | a refusal the caller can act on | no tracker here (run `{{program}} init`), no such task or ticket, a missing `--reason`, a move the matrix refuses, readying a ticket that is not a draft or lacks a numbered Acceptance or a Brief (`incomplete-tickets`), lowering a ticket that is not a draft or pending, a `network` domain that is not public, `ticket deliver --by-hand` while an Overseer is live (`overseer-owns-the-lifecycle`), an answer to a decision already answered, a move its incident does not allow, a command under a job that its role may not run or that the Overseer refused, a second Overseer (`overseer-already-running`), installed files of another install version (every command but `init`, `update`, `help`, `status`, `version`, `oversee status` and `oversee stop`; run `{{program}} update`), `init` or `update` over files a newer {{program}} installed or a `version.json` naming a retired agent host, `hook` given a wrong event word, an extra argument or an option, and an unknown command |
| **2** | a state the tool will not repair on its own | an unreadable or malformed progress file, an unreadable or malformed log.jsonl, a malformed ticket file a command names, a lock it could not take, an Overseer whose Baton a newer generation took (`baton-taken`), and any error the tool did not expect |

Check the code rather than the wording.

## The Handoff and the token column

A ticket's body ends with a [Handoff](glossary.md#handoff) section. Under the Overseer it is code's: written from the
builder's verified report once its gate passes. The review round and whoever picks the work up next read it instead of
re-deriving it from the diff. [Build and review](architecture/build-and-review.md) holds that step.

Every row carries a token count, shown beside the bar. The Overseer credits a job's tokens to its tickets' rows when it
ends, logging one `agent-stopped` record; `GET /api/state` carries a running job's figure. `--tokens` on a task or
ticket move replaces the figure. A row without a figure (`null`) is not a row that cost nothing; it is a row nobody
measured. [Token crediting](architecture/roles-and-launch.md) holds the arithmetic.

## The dashboard

The dashboard is the Bridge, which the live Overseer serves at its URL. Open it with `agent-progress-v2 open`, which is
refused `overseer-down` when no Overseer serves the board. `<data>/progress.html` is only a stub naming the URL. Tabs,
controls, pills and routines are in [Running a board](operations/running-a-board.md).

## Files on disk

This section holds the stored formats. [The on-disk atlas](data-model/on-disk-atlas.md) names every path, its writer and
its lifetime, and [Storage](data-model/storage.md) says how a write commits.

A mutating command writes in the [order under Conventions](#conventions), under one lock hold. Before the first file it
writes `hold-journal.json` with every file's contents, and removes the journal after the last. Every file a reader may
hold open is written atomically: a temporary file beside the target, fsync, rename. On Windows a rename or removal of a
file something else holds is retried 12 times, under 2 seconds in all. Timestamps carry the offset of the
machine that wrote them and are displayed as written, never re-parsed into a viewer's zone.

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
  "overseerState": "running",
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
      "watcherInstance": 1,
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
  "overseerFirstStartedAt": "2026-09-18T21:00:00+02:00",
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
        { "status": "pending", "at": "2026-09-18T21:12:00+02:00" },
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
      "pipelineHash": "0f871814e52ef878"
    }
  ]
}
```

#### Top-level keys

| key | optional | value |
|---|---|---|
| `version` | no | `2`, the only version read. |
| `trackerId` | no | Namespaces the Bridge's browser storage per tracker. |
| `project`, `startedAt` | no | The project name and when the tracker started. |
| `view` | no | `{ "kind": "auto" }`, or kind `absolute` or `relative` with `from`, `to` and `tickMinutes` (a number or null). |
| `nextTaskId` | no | The number the next row takes, never wound back, so an id is never reused. |
| `concurrencyLimit` | yes | Absent reads 2, above 10 reads 10. |
| `overseerState` | yes | `running` or `paused`; absent reads paused. |
| `nextDraftId` | yes | The number the next filing draft takes, written by the first `draft open`, never wound back. |
| `nextJobId` | yes | The number the next job takes (`J5`), written by the first launch, never wound back. |
| `jobs` | yes | The unsettled jobs in launch order, written by the first launch. |
| `nextDecisionId` | yes | The number the next decision takes (`E3`), written by the first opening, never wound back. |
| `decisions` | yes | The open decisions for User in opening order, written by the first opening. |
| `nextIncidentId` | yes | The number the next incident takes (`I2`), written by the first opening, never wound back. |
| `incidents` | yes | The open incidents for the Assistant in opening order. |
| `overseerFirstStartedAt` | yes | The Overseer's first start on this board, kept by `clear`. |
| `tasks` | no | The rows. |

Job states are drawn in [State machines](data-model/state-machines.md), and the [state
explorer](interactive/state-explorer.html) walks them.

<details>
<summary>A job's keys</summary>

| key | optional | value |
|---|---|---|
| `id` | no | `J<n>`. |
| `kind` | no | `build`, `review`, `merge`, `merge-agent`, `refresh`, `assistant`, `product-owner` or `onboarder`. |
| `role` | no | `builder`, `reviewer`, `merge-fix`, `resolver`, `resolution-review`, `assistant`, `product-owner` or `onboarder`, or null for a merge or refresh job. |
| `ticketIds` | no | The job's tickets. |
| `parentJobId` | no | A merge agent's merge or refresh job, else null. |
| `attempt` | no | From 1. |
| `target` | no | The main line or `group-<name>`, or null for a session. |
| `state` | no | `launching`, `preparing`, `running`, `waiting-for-answer`, `interrupted`, `awaiting-answer`, `in-customs`, `gating`, `merging`, `landing` or `stopping`. |
| `interruption` | yes | Why it was last interrupted: `watcher-lost`, `agent-crashed`, `reboot`, `answer-delivery`, `usage-limit` or `handoff-red`. |
| `watcherInstance` | no | The newest Watcher instance spawned or to spawn, from 1. |
| `eventCursor` | no | `{ instance, sequence }`, the last Watcher event applied. |
| `answeredRequestIds` | no | The question requests already answered. |
| `crashResumes` | no | Resumes after `watcher-lost` or `agent-crashed` only. |
| `airlock` | yes | While it holds its target's Airlock slot: `{ target, targetTip, branchTip, phase }`, phase `merge-in`, `resolving`, `reviewing-resolution`, `gating`, `fixing` or `landing`. |
| `stopRequest` | yes | `stop`, `wind-down` or `fresh`, written once User asked it. |
| `intake` | yes | On a product-owner job: `{text}`, then `proposedDraftSets` once its intake closed and `carriedAnswers` on a fresh session that took over a replaced one. |

</details>

<details>
<summary>A decision's and an incident's keys</summary>

| key | on | value |
|---|---|---|
| `id` | both | `E<n>` or `I<n>`. |
| `kind` | decision | `agent-question`, `parked`, `waiver`, `landing-refused`, `merge-refused`, `checks-not-set`, `target-moved`, `branch-touches-agent-config`, `outage`, `quiet-job`, `leftover-worktree` or `pipeline-proposal`. |
| `kind` | incident | `system-question`, `malformed-ticket`, `setup-failed`, `out-of-calls`, `blocked`, `job-lost`, `resume-failed`, `gate-cannot-run`, `sandbox-unavailable`, `merge-gate-failed`, `resolution-over-threshold`, `quiet-job` or `findings-delivered`. |
| `ticketIds` | both | The tickets it names. |
| `jobId` | both | The job, or null. |
| `askedBy` | decision | A job role, `overseer` or `assistant`. |
| `requestId` | decision | The question request it was opened for, or null for one code opened. |
| `questions` | decision | AskUserQuestion's own shape. |
| `context` | decision | Text shown with the questions. |
| `facts` | incident | Text the Overseer names; `requestId` when a question opened it. |
| `defaultMove` | incident | The move it takes when its delivery turn closes unhandled. |
| `deliveredInTurn` | incident | Null, or `{ jobId, chatSequence }`, the Assistant's chat turn it went out in. |
| `openedAt` | both | When it opened. |

</details>

<details>
<summary>A row's keys</summary>

| key | optional | value |
|---|---|---|
| `id`, `name` | no | The row's id and name. |
| `status` | no | `pending`, `in-progress`, `paused`, `in-review`, `re-review`, `reviewed`, `delivered` or `abandoned`. |
| `start`, `end`, `owner`, `note` | no | Stamps and text. |
| `ticket` | no | The ticket's id, or null for a free-standing row. |
| `tokens` | no | A number, or null: "nobody said", which is not "it used none". |
| `agent` | yes | Rows sharing it count as one agent; no production path writes it. |
| `reviewed` | yes | When the row first reached reviewed, kept through delivery. |
| `reviewRound` | yes | The review round, from the second. |
| `mergeQueued` | yes | `true` once the ticket's review passed, until it lands or leaves in-review. |
| `history` | yes | Every status the row reached, oldest first, starting with its filing; absent on a row filed before the field existed. |
| `reviewOf` | yes | The ticket this row reviews. A row is a review bar by this key alone, never by its name. |
| `reviewBarRound` | yes | Which review of that ticket this bar is, from 1. |
| `pipelineHash` | yes | The content hash of the pipeline the row's ticket was last gated by. |

</details>

#### What makes the file unreadable

Each of these reads as exit 2:

- a version 2 file holding `log`, or a version other than 2. A file at version 1, which holds its own log, is not read:
  its reason ends in `OLDER_FORMAT_ADVICE`;
- a present `concurrencyLimit` that is not a whole number of at least 1;
- an `overseerState` outside the two;
- a `nextDraftId` or `nextJobId` that is not a whole number of at least 1, or a `nextDecisionId` or `nextIncidentId`
  below 1;
- a present optional row key of the wrong shape: `reviewRound` below 2, `reviewBarRound` below 1, a row `pipelineHash`
  that is not text, a `history` that is not a list of known statuses with their stamps, or a `mergeQueued` that is not
  `true`;
- a job, decision or incident whose field is missing, outside its vocabulary or of the wrong shape;
- an `overseerFirstStartedAt` that is not text;
- a row or history phase in a status the file format does not know, the retired `running` or `finished` included, with
  the same advice.

A file holding `checkCommand`, `installCommand`, `checksDefinitionFiles`, `gateKeyCommand` or `gateCachePaths`, or a row
holding `checkCommand`, is an older file: its reason names the key and ends in `OLDER_FORMAT_ADVICE`. The gate pipeline
lives in [`pipeline.json`](#datapipelinejson).

#### Writing and unknown keys

- Keys the tool does not know survive a read and a write, in the file's order: at the top level, on a row, on a job, its
  `eventCursor` and its `airlock`, and on a decision, its questions and their options, an incident and its
  `deliveredInTurn`. A ticket's unknown frontmatter lines do the same.
- `jobs`, `nextJobId`, a row's `mergeQueued`, `decisions`, `nextDecisionId`, `incidents` and `nextIncidentId` are each
  written only once set, so a file without them stays byte-identical.
- A stored `dispatcherState` or `dispatcherRunId` is an unknown key: kept byte for byte and never read, so such a board
  reads as paused until `oversee resume`.

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
- `overseerFirstStartedAt` is written once, by the Overseer's first `overseer-started` on the board, and never
  rewritten. Only a start on a board with neither it nor an `overseer-started` log record holds every low `pending`
  ticket `first-run review` under one `findings-delivered` incident, so a start after `clear` holds nothing.

### `<data>/pipeline.json`

The board's gate pipeline, beside `progress.json`, never tracked and never inside a branch. The `gate` verbs write it
through the lock. [The pipeline](architecture/customs-and-gates.md) says what it means, what `review`, `constitution`
and `agents` change, and how to edit those three by hand.

```json
{
  "prepare": [{ "name": "install", "run": "bun install --frozen-lockfile" }],
  "gates": [
    { "name": "tests", "run": "bun test", "fix": "bun run lint:fix", "definedBy": ["package.json"] }
  ],
  "review": { "name": "strict", "model": "opus", "effort": "high" }
}
```

| key | required | value |
|---|---|---|
| `prepare` | no | steps in run order, each `name` and `run` |
| `gates` | no | gates in run order, each `name` and `run`, with optional `fix`, `in`, `definedBy`, `network`, `writes` and `overseerOnly: true` |
| `review` | no | `name`, `model`, `effort`; its presence sets the review phase |
| `constitution` | no | a list of files, in place of `<data>/briefs/defaults/constitution.md` |
| `agents` | no | a list of files per role: `builder`, `reviewer`, `merger`, `productOwner`, `onboarder`, `assistant`, each in place of `<data>/briefs/defaults/<role>.md` |
| `approvals` | no | `tickets`: `true` or `false`, the ticket review switch `gate approval` writes; absent reads as `true`. Any other key or value makes the file malformed. It is not part of `pipelineHash`. |

An unknown key, a step or gate without `name` or `run`, or a name given twice makes it malformed: the board reads it as
no pipeline, and `gate list` and every `gate` write refuse it at exit 1. Each launch writes
`<data>/jobs/<J>/instructions-<instance>.json`, `{ files: [{ path, contentHash }] }`, the first 16 hex digits of each
file's SHA-256 as it was read.

### `<data>/log.jsonl`

One record per line, each a JSON object ending in a newline: `at`, `kind`, then `taskId`, `ticketId`, `epicKey`,
`draftId`, `jobId`, `decisionId` or `incidentId` where the kind names them, then `fields`. `status` and the Bridge word
each record as a sentence; a note's sentence is its text.

The kinds fall into families: [board](#board-records), [ticket](#ticket-records), [epic](#epic-records), [filing
draft](#filing-draft-records), [review](#review-records), [pipeline and gate](#pipeline-and-gate-records),
[Overseer](#overseer-records), [job](#job-records), [merge](#merge-records), [decision](#decision-records) and
[incident](#incident-records).

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
| `ticket-filed` | `ticketId` | `title`; for a ticket a job filed also `status`, `priority`, `filedByJob` and `findingRoute` (when set) as filed |
| `ticket-readied`, `ticket-submitted-for-review`, `ticket-reopened`, `ticket-started`, `ticket-finished`, `ticket-approved`, `ticket-unheld`, `ticket-release-cleared` | `ticketId` | none |
| `ticket-delivered` | `ticketId` | `byHand`: `true`, only when `ticket deliver --by-hand` recorded it |
| `ticket-abandoned`, `ticket-held` | `ticketId` | `reason` |
| `ticket-retitled` | `ticketId` | `from`, `to`: titles |
| `ticket-body-changed-after-claim` | `ticketId` | none |
| `ticket-rereviewed` | `ticketId` | `round`, from 2 |
| `ticket-priority-changed` | `ticketId` | `from`, `to`: priorities |
| `ticket-size-changed` | `ticketId` | `from`, `to`: sizes, `from` absent when the ticket had none |
| `ticket-agents-changed` | `ticketId` | `from`, `to`: each `{ model, effort }` |
| `ticket-dependencies-set` | `ticketId` | `dependsOn`: ticket ids |
| `ticket-introduced-by-set` | `ticketId` | `introducedBy`: the cause's ticket id, absent when it was cleared |
| `ticket-epics-set` | `ticketId` | `epics`: epic keys |
| `ticket-network-set` | `ticketId` | `domains`: empty when the line was cleared |
| `ticket-release-marked` | `ticketId` | `group` |
| `ticket-triaged` | `ticketId` | none: a finding put to User's low-priority triage |
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
| `pipeline-approval-set` | none | `approval`: `tickets`, `state`: `on` or `off` |
| `check-command-set` | none | `command` (the shell line, or `null` when cleared); retired: still read, never logged |
| `install-command-set` | none | `command` (the install line); retired: still read, never logged |
| `checks-definition-files-set` | none | `patterns` (empty when cleared); retired: still read, never logged |
| `gate-key-command-set` | none | `command` (or `null` when cleared); retired: still read, never logged |
| `gate-cache-paths-set` | none | `paths` (empty when cleared); retired: still read, never logged |
| `gate-ran` | none | `tree` (the gated tree's object id), `outcome` (`passed`, `failed`, `cannot-run`), `cached` (false, since no gate result is kept; true only in older logs) |

#### Overseer records

| kind | ids | fields |
|---|---|---|
| `overseer-set` | none | `state` (`running` or `paused`) |
| `overseer-started` | none | `codeVersion`, `installVersion` |
| `overseer-stopped` | none | `reason`: `stopped` or `baton-passed` |
| `baton-pass-failed` | none | `successorCodeVersion`, `step`, `error` |
| `dispatcher-set` | none | `state` (`running`, `finished` or `stopped`), `runId` (a run id or `null`); retired: still read, never logged |

#### Job records

| kind | ids | fields |
|---|---|---|
| `job-launched` | `jobId` | `kind`, `role` (or `null`), `ticketIds`, `attempt`, `target` and `parentJobId` (each or `null`) |
| `job-interrupted` | `jobId` | `cause`, `watcherInstance`: the instance that was lost |
| `job-resumed` | `jobId` | `watcherInstance`: the instance spawned, `cause`: the interruption it resumes from |
| `usage-limit-hit` | `jobId` | `window` (as the vendor names it, such as `five_hour`), `resetsAt` (ISO): the vendor refused the job's requests, and nothing launches or resumes before `resetsAt` |
| `job-ended` | `jobId` | `outcome`, `cause` and `commit` each only when named, `deniedPermissions` |
| `job-stop-requested` | `jobId` | `mode`: `stop`, `wind-down` or `fresh`, User's `job stop`, `job wind-down` or `job fresh` |
| `job-messaged` | `jobId` | `text`: a chat turn the Overseer writes to the session in log order |
| `job-reopened` | `jobId` | `watcherInstance`: the instance that resumes the closed product owner, `text`: User's message, its first line, `offeredTicketIds`: the tickets its intake filed before the reopening, recorded only |
| `agent-stopped` | none | below |
| `hatch-applied` | `jobId` | `requestId`, `commandKind`, `outcome` (`done`, `nothing-to-do` or `refused`): a relayed request the Overseer answered, never applied again |

#### Merge records

| kind | ids | fields |
|---|---|---|
| `merge-queued` | `ticketId` | `target`: a passing review queued the ticket to land there |
| `merge-started` | `jobId` | `target`, `targetTip`, `branchTip`, `predictedConflictFiles` (empty for a clean prediction): the merge job took the target's Airlock slot |
| `merge-landed` | `jobId` | `target`, `commit`, `kind` (`landed` on the main line, `integrated` on a group branch): the Overseer's list of tips it landed |
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
| `incident-defaulted` | `incidentId` | `move`: its default move, `cause`: `turn-closed`, `turn-budget` or `no-assistant` |
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
when it has one. Each is written only when known, so a plain subagent's record holds neither. The record is one line in
the file, spread over several here:

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
written atomically.

Each entry's `path` is relative to the data folder and never leaves it, with forward slashes on every platform, so a
backslash or a Windows drive prefix is refused; it carries either the file's whole new `contents`, `log.jsonl` included,
or `"removed": true`.

Every command that takes the lock first finishes a journal it finds, rewriting or removing each file verbatim, then
removes it. A journal that cannot be read, another `version`, or an entry breaking these rules stops every write at exit
2 until it is repaired or removed; `status`, which takes no lock, reports it on standard error and replays nothing. A
journal that cannot be removed fails that command at exit 2 with `hold-journal-unremovable`, and the next command
replays it. [The hold journal](data-model/storage.md#the-hold-journal) holds the mechanics.

### `<data>/version.json`

```json
{
  "installVersion": 19
}
```

The install version of the files `init` and `update` installed, indented two spaces and ending in a newline, written
atomically by both after every other file they write. It is read as a JSON object whose `installVersion` is a whole
number of at least 1. An `agentHost` naming the retired host an install before version 11 recorded makes `init` and
`update` refuse ([Adopting a repository](#adopting-a-repository)); any other key is ignored and not written back.

A file recording another version, holding anything else or unreadable is a mismatch, and so is an absent file while
`session-instructions.md`, or a version 16 board's `agent-brief.md`, is there; an absent file with neither is none.
[Install version](#install-version) says what a mismatch does.

### `<monitor>/projects.json`

```json
{
  "version": 1,
  "projects": {
    "5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c0a37": {
      "project": "Example Agency",
      "root": "/Users/alex.example/development/example-agency",
      "progressHtml": "/Users/alex.example/development/example-agency/.agent-progress-v2/progress.html",
      "progressJson": "/Users/alex.example/development/example-agency/.agent-progress-v2/progress.json",
      "gitOrigin": "git@example.invalid:example/example-agency.git",
      "registeredAt": "2026-10-21T10:00:00+02:00",
      "lastChangedAt": "2026-10-21T11:30:00+02:00",
      "lastCommand": "ticket ready",
      "overseer": { "url": "http://127.0.0.1:4987/", "processId": 4242, "startedAt": "2026-10-21T10:05:00+02:00" }
    }
  }
}
```

The machine-wide registry of every project this machine's program wrote a tracker for, in the home folder, for a monitor
to find each project's stub and data; a folder, so the monitor can keep its own files beside it.

A project registers, its entry added or updated, exactly when the call wrote its tracker: every mutating command,
`init`, and the Overseer at its start. `update` never writes the tracker, so it never registers; neither does a
read-only call or `open`.

A tracker whose root lies under a temp folder is never registered: the system temp folder (`os.tmpdir()`, on macOS
`$TMPDIR` under `/var/folders`), and on macOS and Linux also `/tmp` and `/var/tmp`, each compared after resolving
symlinks (`/tmp` to `/private/tmp` on macOS). On Windows the system temp folder is the only one. An entry already in
the registry stays.

An entry is keyed by the tracker's `trackerId`, so a moved or renamed folder updates its one entry. It holds the board's
`project` name, the `root` folder, the absolute paths of `progressHtml` and `progressJson`, `gitOrigin` (the `origin`
remote's URL, or `null`), `registeredAt` (the first registration, kept), `lastChangedAt` (this write) and `lastCommand`
(the verb that wrote, the command word and its subcommand), and, while an Overseer serves the board, `overseer`
(`{url, processId, startedAt}`, removed by a stop).

No board summary is copied: the monitor reads each project's own files. The CLI never removes an entry and has no
command for the registry.

The read-modify-write holds the registry's own lock, `<monitor>/.lock/`, and writes the file atomically, indented two
spaces and ending in a newline. Unknown keys, at the top level and on an entry, are kept in order. A file whose
`version` is newer than 1 is left untouched and a warning is printed. A malformed file is reported and rewritten with
every entry that is still an object, plus this one. A registry that cannot be read or written, its lock included, is a
warning on standard error: the command keeps its exit code, 0 when it succeeded.

### `{{dataFolder}}/tickets/003-double-click-a-role-to-edit-it.md`

The file name is the padded id and a slug of the title; the ticket is known by its frontmatter `id`.
The CLI writes its keys in this order, omitting an optional key it does not have:

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
filedByJob: "J12"
findingRoute: "assistant"
claimedBodyHash: "5f1d3c9a0b7e2468"
task: 17
owner: Alex Example
---
# 003 — Double-click a role to edit it

## Report
…
```

| key | written | value |
|---|---|---|
| `id`, `title`, `type`, `status`, `filed`, `updated` | always; required | `type`: ticket, bug, research; a stored change or feature reads as ticket and is written back as stored. `status`: draft, ready-for-review, pending, in-progress, in-review, reviewed, delivered, abandoned. `updated` is stamped on every move. |
| `priority`, `size`, `model`, `effort` | only once named | `priority`: low, normal, high. `size`: XS, S, M, L, XL, XXL, in capitals. `model`: haiku, sonnet, opus, fable. `effort`: low, medium, high, xhigh, max. Absent reads as normal, as no size, and as opus and medium, so an older ticket is never rewritten to gain them. |
| `hold` | only while held | the hold's reason, empty without one; any value but `null`, a bare `hold:` included, is held. Set and remove it with `ticket hold` and `unhold`. |
| `started`, `finished`, `delivered`, `abandonedAt` | always | a timestamp or `null`; an absent one reads as `null` |
| `group`, `branch`, `commit`, `reason` | when given | text; `reason` is dropped by `reopen` |
| `releasesGroup` | only on a group's release ticket | `true`; absent or `null` is not the release ticket, any other value makes the file malformed. Set and remove it with `ticket release-of`. |
| `dependsOn` | when non-empty | ticket ids, written `"001, 002"`, read from any mix of commas and spaces with or without `#` or padding. Set it with `ticket depends`, which refuses a missing id or a circle; bare ids replace the list, `--add` and `--remove` change it. |
| `epics` | when non-empty | epic keys, written `"loyalty-programme, checkout-redesign"` and read like `dependsOn`, in order: the first is the primary epic. A part that is not an epic key makes the file malformed; a key whose epic is gone is kept. Set it with `ticket epic`, which refuses an epic that does not exist. |
| `network` | only once set | the public domains the ticket's agents may reach, written `"api.example.com, cdn.example.com"` and read like `epics`, lower case, in order. A domain that is not public makes the file malformed. Set it with `ticket add --network` or `ticket network`, only while the ticket is a draft or pending; `--clear` removes it. |
| `introducedBy` | only once named, on a bug | one ticket id, written `"005"`, read like a `dependsOn` entry: the delivered ticket whose change introduced the bug. Set it with `ticket add --introduced-by` or `ticket introduced-by`, which refuse a ticket that is not a bug and a cause that is missing, the ticket itself or not delivered; an empty cause removes it. |
| `foundInReview` | only once named | one ticket id, written and read like `introducedBy`: the ticket whose review found this one. Set only at filing, with `ticket add --found-in-review`, which refuses a ticket that does not exist. |
| `filedByJob` | only on a ticket a job filed | the id of the job whose Hatch filed it, written `"J12"`, stamped by the Overseer from the Hatch folder's job, never from the request |
| `findingRoute` | only on a worker's finding | who settles the low draft a builder, reviewer or merge-gate fixer filed: `assistant`, the Assistant once the ticket it was found on is delivered, or `user`, User's Low-priority triage list, for a finding filed with `--needs-user`. Only `ticket triage` changes it afterwards, to `user`; any other value makes the file malformed. |
| `claimedBodyHash` | once the ticket was started | the content hash (64-bit FNV-1a, 16 hex digits) of the body as it read when the ticket last moved to in-progress; absent on a ticket never started. `ticket show` compares it with a hash of the body now to say whether the body changed since. |
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

**Unknown keys, comments and blank lines are kept and written back**, so a field you add by hand —
`owner: Alex Example` above — survives every transition. The CLI's own keys are rewritten at the top
in the order above and everything else follows, keeping its order among itself, so a hand-written
line moves below the CLI's block once and never again.

The body is preserved byte for byte from the ticket template (Report, Wanted, Acceptance, Handoff),
`--body` or `--body-file`; an empty body falls back to the template. `ticket edit` replaces the body or
appends to it and leaves the frontmatter's bytes as they are, a hand-written layout included; `ticket edit --title`
rewrites only the `title` line, and a first body line still reading `# <id> — <old title>`, never the file name; on a
started ticket whose body is unchanged since its build started it moves `claimedBodyHash` along. Past `pending`,
`ticket edit` needs `--force`. A malformed ticket file is listed as ignored rather than failing `status`.
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
  "nextQuestionNumber": 2
}
```

Keys the CLI does not know are kept, in their stored order, after its own. A filing-draft file that is not JSON, lacks a
field, holds one of the wrong shape, or has another `version` (older or newer, refused with `OLDER_FORMAT_ADVICE`) is
listed as ignored on standard error by `status` and `draft list`, rather than failing them, and `draft open` refuses to
overwrite it.

A closed or abandoned filing draft's file is removed; the log keeps what it became. A tracker that never opened a filing
draft has no `filing-cabinet/` folder and no `nextDraftId`.

## Ticket moves and their rows

The **from** column is the matrix the named verbs enforce and the Overseer's moves keep; `ticket status <id> <status>`
skips it. **its row** is the status stored; **pill** is what that row then reads on the chart.

| move | from | ticket status | its row | pill | stamps written | log line |
|---|---|---|---|---|---|---|
| `ticket add` | — | draft | none, at any priority | `Draft` | `filed` | `Ticket #003 filed: <title>` |
| `ticket ready` | draft, for every id named, each with a numbered `## Acceptance` and a `## Brief` holding a non-blank line; ready-for-review too when User runs it without `--incident` | pending | created `pending`, at any priority | `To do` | — | `Ticket #003 ready to build`, one per ticket |
| `ticket submit`, `intake close` with ticket review on | draft, each complete one; an incomplete one stays draft | ready-for-review | none | `Ready for review` | — | `Ticket #003 ready for review`, one per ticket |
| `ticket submit`, `intake close` with ticket review off | draft, each complete one; an incomplete one stays draft | pending | created `pending`, at any priority | `To do` | — | `Ticket #003 ready to build`, one per ticket |
| a build job prepares its worktree, or a review finds an item that does not hold | pending; in-review | in-progress | `in-progress`; created for a ticket without one | `In progress` | `started` if null; the row's end cleared | `Ticket #003 started` |
| a build job passes its gate | in-progress | in-review | `in-review` | `Awaiting review`; `Reviewing` while a review bar of the ticket is in progress | `finished` if null | `Ticket #003 in review` |
| a review job launches | in-review | in-review, unchanged | `in-review`, plus an in-progress review row for the job's round | `Reviewing` | — | `Review row #18 started: <name>` |
| a group ticket's merge lands on its group branch | in-review | reviewed | `reviewed`, its `reviewed` stamp set if unset | `Awaiting merge` | `finished` if null | `Ticket #003 reviewed` |
| a merge lands on the main line | in-review; reviewed for a release bundle's ticket landed with its group's release ticket | reviewed (unless already), then delivered | `delivered`; in-progress review rows delivered | `Done` | `finished` and `delivered` if null; `branch`, `commit` | the reviewed and delivered lines, and one per review row closed |
| `ticket deliver --by-hand` | anything but draft, while no Overseer is live and no job of the ticket is | delivered | `delivered` | `Done` | `delivered` if null | `Ticket #003 delivered` |
| `ticket abandon` | anything but delivered, abandoned | abandoned | `abandoned`; none created for a ticket without one | `Abandoned` | `abandonedAt`, always; the row's end if it had started | `Ticket #003 abandoned: <reason>` |
| `ticket reopen` | anything but draft and pending; a group's release ticket only while no other release ticket of its group is open | pending | `pending`, its start, end, `reviewed` and `reviewRound` cleared | `To do` | all four cleared; `reason` dropped | `Ticket #003 reopened` |
| `ticket priority … low` | draft, pending | unchanged | kept | — | — | `Ticket #003 priority normal → low` |
| `ticket priority` from low | any | unchanged | created when it has none and is not a draft: `pending` while the ticket is pending, else seeded from its stamps | per status | — | `Ticket #003 priority low → normal` |

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
