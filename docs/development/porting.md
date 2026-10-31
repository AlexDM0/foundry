# Porting to the new product

> **Question:** What do I take, what do I leave, and what must I know first?
> **Time:** 20 minutes.
> **Read first:** [Overview](../concepts/overview.md), [Code map](../architecture/code-map.md).
> **Next:** [Known gaps](../reference/known-gaps.md), [Decisions](decisions.md), [Guards](guards-and-testing.md).

## In one screen

This branch is the source of a separate product. It never merges into `main`. The owner carries it into a project of
its own, and the released `agent-progress` stays what it is. A seam is the one place the core meets something a port
may replace.

| | |
| --- | --- |
| **Take** | The core: the [Board](../glossary.md#board), [Overseer](../glossary.md#overseer), [Customs](../glossary.md#customs), [Airlocks](../glossary.md#airlock) and [Bridge](../glossary.md#bridge). |
| **Change** | Six seams: product names (one assignment plus [a short list](#what-a-rename-touches)), vendor adapter, git, monitor folder, platform, dashboard contract. |
| **Leave** | What exists only for coexistence with `agent-progress` or for its old files: the [residue catalogue](#residue-catalogue). |
| **Know first** | Claude Code is the only vendor. The tools are macOS tools. Design material and probes exist only in the [owner's main checkout](#design-material-and-evidence). |

![The core stands in the middle, with Board, Pass, Playbook, Customs and Airlocks. Six seams surround it. Product names spell folders, skills and the TCP port; the monitor folder, one of its keys, stores the registry, sockets and gate slots; agent-dashboard reads and frames through the contract and reads the registry. AgentAdapter spawns Claude Code, GitProcess.run spawns the git binary, and the platform modules call macOS tools and Bun. Two edges bypass the seams: other places know Claude, and Bun is used everywhere. A vendor or platform port also reaches past its seam.](../figures/porting/seams.png)
*Notice the right-hand seams: only `AgentAdapter` is chosen at one point, so a second platform is a code change, not a
new adapter.*

This document states what exists. Sequencing lives in [docs/backlog.md](../backlog.md) and defects in
[Known gaps](../reference/known-gaps.md).

## Why two programs exist

Two programs exist because the Overseer lifecycle became a product of its own. The released program runs on `main`.
This line of work was built beside it, on the same machines, so that it could be developed while the released program
ran the [board](../glossary.md#board) that tracked it. Hence the second name set.

![Git graph. main runs on to the released agent-progress. group-code-lifecycle leaves it at merge base 9a081774 and is 495 commits past it at 70ce56de, then continues. group-docs forks at 70ce56de for documentation only. A dashed arrow runs from the tip of group-code-lifecycle to a new project; nothing returns to main.](../figures/porting/two-lines-of-work.png)
*Notice that the port starts at the tip of `group-code-lifecycle`, not at the commit this documentation describes.*

State at commit 70ce56de; every count in this document is at that commit:

| Fact | Value |
| --- | --- |
| Lines of work | `group-code-lifecycle`, and `group-docs`, which forks at 70ce56de for this documentation |
| Distance from `main` | 495 commits ahead of merge base 9a081774; `git rev-list --left-right --count main...70ce56de` gives both sides |
| Source | 903 tracked `.ts` and `.tsx` files, 365 of them specs or DOM specs |
| Active name set | `SIDE_BY_SIDE_PRODUCT_NAMES` |
| [Install version](../glossary.md#install-version) | `INSTALL_VERSION` (19) |
| Vendors | Claude Code only |
| Platform in daily use | macOS |

`group-code-lifecycle` continued past 70ce56de and `group-docs` lacks those commits, so a port starts from the branch
tip and not from this table.

> **Careful.** The main checkout is a different, older codebase. Its `CLAUDE.md`, tracker and `docs/` do not describe
> this code. The rule book for this code is this branch's [CLAUDE.md](../../CLAUDE.md).

## What travels and what stays

Code sorts into three columns: the core travels, parameters take a new value or name, and coexistence code stays
behind.

![Three blocks. Core travels minus the residue on the right: the tracker model, Overseer, lifecycle, control, Watcher, stored format adapters, the Bridge and the building blocks, and LegacyWatcherReader and RETIRED_NAMES stay despite their names. Parameter travels with a changed value or name: the name set, vendor adapter, prompts and skills, the install and frozen tables, which are retaken, and the live budgets. Coexistence and history stays behind in three groups: code beside the released program, its install on a board, and its stored words.](../figures/porting/keep-or-leave.png)
*Notice the right column: every item exists for another program or for another program's files, never for the
lifecycle.*

Core folders still hold the vendor knowledge in [The vendor seam](#the-vendor-seam) and the rows of the
[residue catalogue](#residue-catalogue). Those lines change; the folders travel.

## Product names

`PRODUCT_NAMES` in `src/shared/constants/ProductNames.ts` is every name the product goes by on a machine. It is one
assignment to one of two sets. Nothing else in shipping code spells them, apart from the short list further down. The
module imports nothing, so the Bridge's project compiles it too.

| Key | `ORIGINAL_PRODUCT_NAMES` | `SIDE_BY_SIDE_PRODUCT_NAMES` (active) | Reaches |
| --- | --- | --- | --- |
| `PROGRAM` | `agent-progress` | `agent-progress-v2` | every printed command, hook commands, [managed-block](../glossary.md#managed-block) markers |
| `DATA_FOLDER` | `.agent-progress` | `.agent-progress-v2` | the [tracker](../glossary.md#tracker) folder, [`<data>`](../glossary.md#reading-names) |
| `WORKTREES_FOLDER` | `.agent-progress-worktrees` | `.agent-progress-v2-worktrees` | [`<worktrees>`](../glossary.md#reading-names) |
| `MONITOR_FOLDER` | `.agent-progress-monitor` | `.agent-progress-v2-monitor` | [`<monitor>`](../glossary.md#reading-names) under the home folder |
| `PRODUCT_OWNER_SKILL` | `agent-po` | `agent-po-v2` | installed skill folder, intake first line |
| `ORCHESTRATE_SKILL` | `agent-progress-orchestrate` | `agent-progress-orchestrate-v2` | installed skill folder |
| `STORAGE_PREFIX` | `agent-progress` | `agent-progress-v2` | browser preference keys |
| `ENVIRONMENT_PREFIX` | `AGENT_PROGRESS_` | `AGENT_PROGRESS_V2_` | every environment variable, [`<PREFIX>`](../glossary.md#reading-names) |
| `LAUNCH_AGENT_LABEL` | `com.agent-progress.overseer` | `com.agent-progress-v2.overseer` | the login item's default label |
| `OVERSEER_PORT_FIRST` | 4730 | 4930 | start of the board's TCP port range |

A path or browser key spelled `agent-progress` elsewhere in these documents belongs to the released program. The source
folders `skills/agent-po/` and `skills/agent-progress-orchestrate/` keep their names and install under the set's names
(`installedSkillNamesFor`).

### What keeps the two apart

Three mechanisms keep the programs from touching each other's files, and only the side-by-side build ever refuses.

![A two by two grid of program against repository. The released program installs in both repositories and is never refused. The side-by-side build installs in a repository without the released data folder and refuses older-program-present in one that holds it. Below the grid, a strip says each name set keeps its own data folder, worktrees folder, monitor folder and first TCP port.](../figures/porting/who-refuses-whom.png)
*Notice the one red cell: this build cannot be installed in a repository the released program tracks, this one
included.*

- In TypeScript, every path a removal reaches carries a name from the constant: the data folder, the skill folder, or
  for the worker definition under `.claude/agents/` the file name. So the side-by-side build never deletes a released
  file. `setup.sh` is the exception: it spells `RETIRED_SKILL_NAMES`.
- `refuseBesideAnOlderProgram` in `cli/adoption/OlderProgramRefusal.ts` refuses `older-program-present` in `init` and
  `update` while the root holds `ORIGINAL_PRODUCT_NAMES.DATA_FOLDER`.
- `cli/testing/OtherProductNamesPreload.ts` rewrites the one assignment in a spawned binary, so
  `cli/ProductNameIsolation.spec.ts` runs each case as both programs. Its pattern accepts only the two set names, and
  it throws on any other declaration.

### What a rename touches

![One assignment, PRODUCT_NAMES, on the left. Commands, hooks and markers, three folders, two skills, environment variables, browser keys and the port derive with no edit. package.json, setup.sh, the frozen install table, four specs and the prose change by hand. The dashboard server record, the theme and escape message types, the row marker, retired file names, retired skill names and the entry file name stay literal.](../figures/porting/name-reach.png)
*Notice that no amber box is shipping TypeScript: the source needs no edit beyond the constant.*

A rename changes the values of one set and nothing else in shipping source. Evidence at 70ce56de: on a scratch copy with
the side-by-side set's values replaced by `example-product` and port 5130, `bun test` with a scratch home gives 3875
tests, 3863 passing. Two of the 12 failures also fail on an unmodified copy (no `.git`, and headless Chrome timing
out). The other 10 are the whole hand list. Typecheck, lint and the Bridge's DOM specs were not part of that run.

| By hand | Failing guard | Why it cannot derive |
| --- | --- | --- |
| `package.json` name and bin key | `src/ProductNames.spec.ts` | JSON imports nothing |
| `LAUNCH_AGENT_LABEL` in `setup.sh` | `src/ProductNames.spec.ts`, `cli/SetupScript.spec.ts` | Shell imports nothing |
| `cli/adoption/FrozenClaudeInstall.json` | `cli/adoption/TrackerRefresh.claudeInstall.spec.ts` | A frozen table; retake it |
| Name literals in specs | `cli/ProductNameIsolation.spec.ts`, `src/ProductNameLiterals.spec.ts`, `cli/overseer/OverseerBuildJob.spec.ts`, `cli/overseer/OverseerDrivePass.spec.ts` | They spell the folder or skill names |
| Prose | none | `README.md`, `CLAUDE.md`, `docs/`, `.readme-graphics/` and the messages in `setup.sh` |

Replace the values in place rather than adding a third set: the preload accepts two set names, and
`refuseBesideAnOlderProgram` only knows `ORIGINAL_PRODUCT_NAMES`.

These keep a released-name literal after a rename:

| Literal | Where | Why |
| --- | --- | --- |
| Dashboard server record and message types | [The agent-dashboard contract](#the-agent-dashboard-contract) | The dashboard's own path and wire contract |
| The `agent-progress row:` marker | One refusal in `src/adapters/utils/OperationRefusalWordingUtil.ts`, excused by `BRIEF_MARKER_PATTERN` in `src/ProductNameLiterals.spec.ts` | [Marker](../glossary.md#marker) of the released briefs. No prompt or template in this tree writes that line |
| Retired file names | `cli/adoption/RetiredAgentHostRefusal.ts`, `RetiredClaudeInstall.ts` | Residue, below |
| `RETIRED_SKILL_NAMES` | `setup.sh` | The two global symlink names, removed only when they resolve into this checkout; no guard reads them |
| Entry file `agent-progress.ts` | `package.json`, `setup.sh`'s plist, `SHIPPING_FILES` in `src/services/overseer/CodeVersion.ts` | They name the file |

## Seams

Six seams exist, and only the vendor seam chooses an implementation at one guarded point. The other five change by
editing a constant, a module or a contract. [Seams](../architecture/code-map.md#seams) in the code map places them in
the layout.

| Seam | What it is | A change touches |
| --- | --- | --- |
| Product names | One assignment, above | [What a rename touches](#what-a-rename-touches) |
| Vendor adapter | The `AgentAdapter` interface in `src/lib/agent-launch/AgentAdapter.ts`; `CLAUDE_CODE_ADAPTER` is its one production implementation, chosen in `agentAdapterOfThisProcess` in `cli/CommandContext.ts` | See [The vendor seam](#the-vendor-seam) |
| Git | `GitProcess.run` in `src/lib/git/GitProcess.ts`, where shipping code spawns git; 22 non-spec files outside `src/lib/git/` import the package | Merge prediction assumes `git merge-tree --write-tree` and `--stdin` (`src/lib/git/MergeTree.ts`). Git is a seam for where it is spawned, not for replacing it: tickets, worktrees, Airlocks and Customs all speak refs |
| Monitor folder | `MONITOR_FOLDER`, one machine-wide folder and a key of `PRODUCT_NAMES` | The registry (`src/services/tracker/constants/MonitorRegistryFiles.ts`), [Watcher](../glossary.md#watcher) sockets, [gate slots](../glossary.md#gate-slot) and the [usage marker](../glossary.md#usage-marker) all sit under it, so a rename moves them together |
| Platform | Several modules, plus `setup.sh`; `ProcessWatcherSandbox` is a typed interface with one implementation | See [Platform dependencies](#platform-dependencies) |
| Dashboard contract | The HTTP and `postMessage` surface agent-dashboard consumes | See [The agent-dashboard contract](#the-agent-dashboard-contract) |

### The vendor seam

`AgentAdapter` renders a launch plan, maps each stdout line to events, and writes chat, answer and interrupt lines. The
Watcher knows no vendor, and `src/ImportDirection.spec.ts` holds that only `cli/CommandContext.ts` chooses the adapter.
The `AgentAdapter` interface is narrower than the vendor knowledge in the tree.

![A horizontal strip of one agent's life. Install, session start and confinement know Claude Code directly, through TrackerRefresh.ts, SessionStartHook.ts and WorkerProfiles.ts. Launch and the stream and chat sit behind AgentAdapter. Customs, then transcripts and usage, know Claude Code directly again.](../figures/porting/vendor-knowledge-strip.png)
*Notice how little of the strip is blue: a second vendor's work sits mostly in the coral boxes.*

These also know Claude Code:

| Place | What it knows |
| --- | --- |
| `src/services/overseer/ClaudeTranscripts.ts`, read by `JobLiveFactsReader.ts` | Claude Code's transcript folder layout for a session's subagents |
| `cli/measurement/usage/` | The same transcripts, through `src/lib/claude-code/` |
| `cli/adoption/TrackerRefresh.ts`, `cli/adoption/constants/ClaudeCodeInstall.ts` | Install parts: the settings hook, skills under `.claude/skills/` |
| `cli/hooks/SessionStartHook.ts` | Prints session instructions for Claude Code to add |
| `cli/hooks/BashDomainsHook.ts` | The network guard is a Claude Code `PreToolUse` hook on Bash and WebFetch |
| `src/services/lifecycle/Customs.ts` | `AGENT_CONFIG_PATTERNS`: `.claude/` and `.mcp.json` count as agent configuration |
| `src/services/overseer/WorkerProfiles.ts` | Denies writes under the worktree's `.claude`, and wires in the network guard |
| `src/lib/tracker-model/@types/Decision.ts`, `src/services/overseer/QuestionRouting.ts` | The stored question shape is AskUserQuestion's, field for field |
| `src/lib/tracker-model/@types/Ticket.ts` | The model aliases are Claude Code's |
| `src/testing/FakeAgentAdapter.ts` | Prints Claude-shaped lines and reuses `CLAUDE_CODE_CAPABILITIES`, so the specs exercise that shape |
| `resources/prompts/`, `resources/templates/Constitution.md` | Eight templates name `CLAUDE.md`, `.claude/` or Claude's tools |

> **Careful.** `AgentCapabilities` exists on the interface, and no shipping code reads it. The only references are the
> interface and the two adapters setting it. A vendor lacking a capability has no fallback path in the code at
> 70ce56de; the code assumes every capability Claude Code has.

The vendor contract itself, as probed, is in [the Claude probe record](overseer-claude-probe.md).

### Platform dependencies

The product runs on Bun and macOS tools. Linux reaches two code paths, boot identity and opening a page; confinement
and the login item have none.

| Dependency | Where | Off macOS |
| --- | --- | --- |
| `sandbox-exec` Seatbelt profiles | `src/services/overseer/ProcessWatcherSandbox.ts`, `createProcessWatcherSandbox` | No profile is applied and the child runs unconfined; `isUsable` is false. See [confinement](../architecture/confinement.md) |
| Boot identity | `readBootIdentity` in `src/lib/process-identity/ProcessIdentity.ts` | Reads `/proc/sys/kernel/random/boot_id` when present, otherwise `sysctl` `kern.bootsessionuuid` |
| Process start and group listing | `identityOf`, `memberStartsOf`, through `/bin/ps -o lstart=` | Depends on that output format; `START_STAMP_PATTERN` parses it |
| Socket path length | `WATCHER_SOCKET_PATH_LIMIT_BYTES` (104), `watcherSocketPathOf` | A macOS limit. The name is a hash so the path stays short, but `MONITOR_FOLDER` and the home path count against it |
| System temp folders | `SYSTEM_TEMPORARY_FOLDERS` in `ProcessWatcherSandbox.ts` | macOS paths |
| Login item | `write_login_overseer` in `setup.sh`, writing under `~/Library/LaunchAgents/` | launchd only; nothing else starts an Overseer at login |
| Opening a page | `openerFor` in `cli/OpenerFor.ts` | Any platform but darwin gets `xdg-open` |
| Runtime | `Bun.spawn`, `Bun.spawnSync`, `Bun.build` and Bun's server across shipping code | Bun is assumed everywhere |

### The agent-dashboard contract

agent-dashboard is a separate program that lists boards and frames the Bridge. Its integration is in
[the Overseer API](../reference/overseer-api.md). Its surface here is small, and it carries the released name on
purpose.

| Part | Where | What a port keeps |
| --- | --- | --- |
| Summary document, `summaryVersion` 1 | `BoardSummary` in `src/services/overseer/BoardState.ts`, route `/api/summary` | Held by `src/services/overseer/testing/fixtures/summary-v1.json` |
| Server record | `DASHBOARD_SERVER_RECORD` in `cli/overseer/routes/OverseerRoutes.ts` | A literal under `.agent-progress-monitor/agent-dashboard/`, the dashboard's own path, never the product's constant. With no readable record, no origin may frame the Bridge |
| Embedded mode | `?embedded=dashboard` in `bridge/shell/ThemeBootstrap.ts` | The literal value is the contract |
| Messages | `THEME_MESSAGE_TYPE`, `ESCAPE_MESSAGE_TYPE` in `bridge/shell/EmbeddedChannel.ts` | Literal `agent-progress:theme` and `agent-progress:escape`, unrelated to `STORAGE_PREFIX` |
| Monitor registry | `projects.json` under `<monitor>` | Follows `MONITOR_FOLDER`, so a dashboard must read the renamed folder |

## Residue catalogue

Most of this code stays behind. Some of it only looks like residue. The tables below sort it by what a port does, and
each right column states what the code requires, not when to do it.

Install version 16 is what the released program writes: it is `INSTALL_VERSION` on `main`. `update` at version 17 or
later removes that layout, spelled with the active names.

![Four pieces of residue pull others with them. ORIGINAL_PRODUCT_NAMES has three independent readers, one arrow each: the older-program-present refusal, the preload with its two-program specs, and the cutover smoke. removeManagedBlock takes the markers, the committed-block notice and the Playbook launch refusal, which is live code. holdFirstRunLeftovers takes FIRST_RUN_REVIEW_HOLD, the readyFindings and Bridge branches, and the stored key overseerFirstStartedAt. Board.claimTickets takes TicketClaims.ts and OverseerTicketMoves.ts, which 18 tracked files use. Everything else lifts out alone.](../figures/porting/removal-chains.png)
*Notice the blue box: one chain ends in a rule the [Playbook](../glossary.md#playbook) still applies.*

### Remove

| Residue | Where | Why it exists | Removing it implies |
| --- | --- | --- | --- |
| `ORIGINAL_PRODUCT_NAMES` | `src/shared/constants/ProductNames.ts` | Names the program this build must not touch | Some readers go, others only lose the reference; see [What each chain takes](#what-each-chain-takes) |
| `refuseBesideAnOlderProgram`, `older-program-present` | `cli/adoption/OlderProgramRefusal.ts`, `OperationRefusal.ts`, `OperationRefusalWordingUtil.ts` | Protects released files | Drop two call sites, one detail kind and its wording; a new product beside either program has no such guard unless one is written |
| `OtherProductNamesPreload` | `cli/testing/`, `runsAsTheOtherProgram` in `cli/testing/CliProcess.ts` | Runs each case as both programs | `cli/ProductNameIsolation.spec.ts` goes with it |
| Cutover smoke | `cli/testing/CutoverSmoke.ts`, `cli/testing/CutoverSmokeUtil.ts` | Runs real sessions under the side-by-side names and refuses the original ones | Its purpose ends with the two-program state; [the smoke's document](cutover-smoke.md) goes with it |
| `RetiredClaudeInstall` | `cli/adoption/constants/RetiredClaudeInstall.ts` | Install version 16's hooks and files, and the Assistant brief 19 retired | Remove the `retired-install` part, `removeTheRetiredInstall` and `agentBrief` from the marker in `cli/InstallVersionCheck.ts`, which keeps `session-instructions.md` |
| `removeManagedBlock` path | `src/lib/claude-code/ClaudeInstructions.ts`, `retired-managed-block` part in `ClaudeCodeInstall.ts`, `ClaudeManagedBlockMarkers.ts` | Takes install version 16's block out of `CLAUDE.md` once | A committed block no longer stops launches; see [What each chain takes](#what-each-chain-takes) |
| `CLAUDE.md` managed block | This branch's `CLAUDE.md` | The checkout's own install of the released program | A copied rule book must drop it; it describes the released workflow, not this code |
| `RetiredAgentHostRefusal` | `cli/adoption/RetiredAgentHostRefusal.ts`, `agentHost` in `InstallManifestIngestion.ts` | Refuses installs from before version 11 for Copilot CLI, a vendor the released program supported | Drop the check from `init` and `update`, and the key from the reading |
| Retired skill folder | `RETIRED_SKILL_FOLDERS` in `ClaudeCodeInstall.ts`, `retiredSkillFolderLinesOf` | Removes, per repository, one skill named after the program; the name derives | The list goes empty |
| Retired global skills | `RETIRED_SKILL_NAMES`, step 3 of `setup.sh` | Removes two global symlinks into this checkout; the names are literal | `setup.sh` loses its symlink step |
| `*_BRIEF_PATH_IN_REPOSITORY`, `WORKER_AGENT_TYPE` | `src/shared/constants/DispatchProtocol.ts` | Dead entries beside live budgets | The three paths have no reader; `WORKER_AGENT_TYPE` goes with `RetiredClaudeInstall.ts` |
| Retired log kinds | `RETIRED_LOG_RECORD_KINDS` and `RETIRED_DISPATCHER_STATES` in `src/lib/tracker-model/constants/LogRecordSchema.ts`, `LogRecordProblem.ts`, `LogUtil.ts` | A log holding them still reads | With the schema entries gone, one such line makes the whole `log.jsonl` `unreadable`, which stops `status`, writes and the [Pass](../glossary.md#pass); see [Storage](../data-model/storage.md). A log the new product wrote has none: `Board.logRecords.spec.ts` holds that nothing emits them |
| `change` and `feature` ticket types | `RETIRED_TICKET_TYPES`, `storedType`, `TicketDocumentUtil.ts`, `TicketFileWriter.ts`; a Deviations row | Stored tickets are never rewritten | Such a ticket becomes malformed: nothing on a fresh board, and a copied one is skipped and reported |
| `Board.claimTickets` | `src/lib/tracker-model/Board.ts`, `TicketClaims.ts` | Retired claim move; see [gaps](../reference/known-gaps.md#gap-dead-code-and-unused-states) | Specs lose their route to `in-progress`; see [What each chain takes](#what-each-chain-takes) |
| `holdFirstRunLeftovers` | `AgentQuestions.ts`, `Board.ts`, a call in `OverseerForeground.ts` | Written for low pending tickets install version 16 left, but it tests only for a first Overseer start, so it fires on any board, fresh ones included | Behaviour changes on a fresh board: low tickets filed before the first start are no longer held |
| Retired Bridge values | `RETIRED_AUTOMATIC_PRESET`, `RETIRED_RECENT_VISIBILITY` | Accepts the `auto` range preset and `recent` visibility a browser may have stored | A changed `STORAGE_PREFIX` leaves no such value behind |
| `cli/RetiredVerbs.spec.ts` | `cli/` | Proves retired verbs are unknown | The verbs do not exist either way; the spec only guards a return |
| Stale `dispatcherState` Deviations row | `CLAUDE.md` | Names a stored field no code reads | Text only. The word survives only in the frozen surface table and in one spec that uses it as an unknown stored key |

#### What each chain takes

<details>
<summary>The readers and dependants of the four chains</summary>

- `ORIGINAL_PRODUCT_NAMES`:
  - Go with it: `cli/adoption/OlderProgramRefusal.ts`, `cli/testing/OtherProductNamesPreload.ts`,
    `cli/testing/CutoverSmokeUtil.ts` and its spec, `cli/ProductNameIsolation.spec.ts`.
  - Drop the reference, keep the file: `cli/testing/CliProcess.ts` (`ROOT_OVERRIDE_VARIABLES`, `FAKE_AGENT_SWITCHES`,
    and `runsAsTheOtherProgram` with the preload) and its spec, `cli/InstalledSurface.spec.ts`,
    `src/ProductNames.spec.ts`. `CliProcess.ts` is the only route specs have to the binary.
  - Keep the file, spell the released name another way: `src/ProductNameLiterals.spec.ts` reads it as the first
    `PROGRAM:` in the file. `cli/BinarySmoke.spec.ts` builds its `BRIEF_MARKER_PATTERN` from it, and that marker stays a
    literal. `OperationRefusalWordingUtil.installVersion.spec.ts` (`messageFor`) and
    `OperationRefusalWordingUtil.boardRefusal.spec.ts` (`namingThisProgram`) convert the wording to or from the released
    name their expected text holds, so either spell that name or retake the expected text.
- `removeManagedBlock`: the marker also drives [notice](../glossary.md#notice) `claude-md-block-committed` and the
  Playbook's launch refusal on such a target (`DrivePass.ts`, `Playbook.ts`), plus `managedBlockMarker` in
  `OverseerForeground.ts` and the wording in `OverseerWording.ts` and `HeaderModel.ts`. All of it goes together.
- `holdFirstRunLeftovers`: `FIRST_RUN_REVIEW_HOLD`, the [ticket hold](../glossary.md#ticket-hold) branch in
  `IncidentMoves.readyFindings`, the leftover row in `bridge/views/questions/` and `overseerFirstStartedAt` lose their
  reason. That field is a stored key; see [Stored formats](#stored-formats).
- `Board.claimTickets`: its only non-spec caller is `cli/testing/OverseerTicketMoves.ts`, which 18 tracked files use,
  plus five `Board.*.spec.ts` files that call it directly. Those specs need another way to reach `in-progress` first.

</details>

### Keep and rename

| Residue | Where | Why it exists | What a port does |
| --- | --- | --- | --- |
| `DISPATCH_PROTOCOL` | `src/shared/constants/DispatchProtocol.ts` | Live budgets under a historic name | Keep the live keys under a new name; the dead entries are under [Remove](#remove) |
| `dispatch` names | `cli/dispatch/concurrency/`, `src/lib/tracker-model/DispatchQueries.ts`, `DispatchCapacity`, `Board.dispatchCapacity` and comments | Historic vocabulary around live code | Rename only: `cli/CommandTable.ts` names the folder |
| `OLDER_FORMAT_ADVICE` | `src/adapters/constants/OlderFormatAdvice.ts` | Tells a reader to run a release that still reads the file | The refusals stay; the advice must name something else, or the refusal must lose the advice |
| `FrozenInstalledSurface.json` | `cli/`, read by `cli/InstalledSurface.spec.ts` | One key per install version, 1 to 19, carrying retired names | Retake it; see [Stored formats](#stored-formats) |
| `FrozenClaudeInstall.json` | `cli/adoption/`, read by `TrackerRefresh.claudeInstall.spec.ts` | Installed text, spelled with the active names | Retake it after any rename; the spec's header says how |

The live budgets and `REWORK_ROUND_THRESHOLD_LINES` are read by `cli/overseer/OverseerWording.ts`, `JobLaunch.ts`,
`AirlockLimits.ts` and `LifecycleLimits.ts`. `OLDER_FORMAT_ADVICE` targets a `progress.json` version, a row status,
`history`, `checkCommand`, `RETIRED_PIPELINE_KEYS`, a ticket status and a [filing draft](../glossary.md#filing-draft)
version.

### Keep

| Name | Where | Why it stays |
| --- | --- | --- |
| `LegacyWatcherReader` | `src/services/overseer/LegacyWatcherReader.ts` | `WATCHER_PROTOCOL_OLDEST_SUPPORTED` (1) equals `WATCHER_PROTOCOL_VERSION` (1), so it has no work at 70ce56de; it is what lets a [Baton pass](../glossary.md#baton-pass) survive a protocol change |
| `RETIRED_NAMES` | `src/ComponentNames.spec.ts` | It works in any repository; `UNSCANNED_FOLDERS` holds `.agent-progress/` and `docs/design/`, so update it to the new data folder and to wherever the design material lands |

## Stored formats

Only `INSTALL_VERSION` and `CURRENT_PROGRESS_FILE_VERSION` have a value to reset; every other version is at 1. No file
carries over by itself: a rename changes `DATA_FOLDER`, so a new product starts with an empty tracker unless someone
copies one in. That fact decides how much of the residue can go.

| Version constant | Value | Where | Starting point |
| --- | --- | --- | --- |
| `INSTALL_VERSION` | 19 | `cli/constants/InstallVersion.ts` | Free to reset: the lowest value `InstallManifestIngestion` accepts is 1 |
| `CURRENT_PROGRESS_FILE_VERSION` | 2 | `src/adapters/progress/constants/ProgressFileVersions.ts` | Free to reset, by equality check. `EMBEDDED_LOG_PROGRESS_FILE_VERSION` (1) is the `status --json` document's shape, not a stored version: after a reset both constants read 1 for different things, so rename one or skip the value 1 |
| `CURRENT_DRAFT_FILE_VERSION`, `HOLD_JOURNAL_FORMAT_VERSION`, `HATCH_FORMAT_VERSION`, `WATCHER_PROTOCOL_VERSION`, `EVENT_LOG_FORMAT_VERSION`, monitor registry `SUPPORTED_VERSION` | 1 | Their stored-format modules; `HATCH_FORMAT_VERSION` has two copies, in `src/adapters/hatch/utils/HatchFormatUtil.ts` and `src/services/overseer/HatchInbox.ts` | Already at 1 |
| `summaryVersion` | 1 | `src/services/overseer/BoardState.ts` | Contract with agent-dashboard, unaffected by a rename |

An install version means this: the files `init` and `update` wrote are of that version, and every command but the
exempt ones refuses another. A running Overseer holds launches when it changes (`createInstallChangeWatch` in
`src/services/overseer/InstallChangeWatch.ts`). The [bump rule](../../CLAUDE.md) and the verdicts are in the rule book
and [CLI and install](../architecture/cli-and-install.md).

Resetting the install version also resets its frozen table. `cli/InstalledSurface.spec.ts` keeps one key per version
and says never to delete a name from a version already frozen, because a file installed at that version may name it.
A new product has no such installs, so a table with one key is consistent with that reasoning. Stored key
`overseerFirstStartedAt` is optional and written only once set, so it can go with `holdFirstRunLeftovers` on a fresh
board; on a copied one, `progress.json` keeps unknown keys, so the file still reads.

## Decisions to keep

Keep these unless the mechanisms that rest on them are redone. Each has its record under this heading in
[Decisions](decisions.md).

| Decision | What a port loses by dropping it |
| --- | --- |
| One tracker shared by every worktree | One picture of a fan-out across worktrees |
| Every write in one lock hold | A ticket and its row that always agree |
| Current state plus a typed history, not event sourcing | Hand-edited tickets, and one path after a crash |
| Fenced, journaled lock holds | A finished state after a crash mid-write |
| A clock decides nothing | The same verdict on a slow machine |
| The Overseer is the sole driver | Decisions made on a current read |
| Thin Watchers, reads through files | Agents that outlive an Overseer and an update |
| Code owns the verdicts | Proof that does not rest on a session's account |
| Stack-neutral, opaque [gates](../glossary.md#gate) | Working on any stack without an adapter |
| No gate cache of our own | Gates free of a false green from a stored key |
| Review is an optional [pipeline](../glossary.md#pipeline) phase | A small board landing on gates alone |
| Claude only, behind a port (an interface) | The one seam a second vendor starts from |

Side-by-side product names is a decision too, and the one a port ends. The Deviations table in
[CLAUDE.md](../../CLAUDE.md) records where the code differs from the rules. All of those rows travel with the rule book
except two residue rows: the `change` and `feature` ticket row and the `dispatcherState` row.

## Known gaps by what they touch

This is a reading order of [Known gaps](../reference/known-gaps.md) for someone carrying the code across. It is not a
plan.

| Area touched | Read first |
| --- | --- |
| The vendor seam | [usage misses job sessions](../reference/known-gaps.md#gap-usage-misses-job-sessions), [subagents always empty](../reference/known-gaps.md#gap-subagents-always-empty), [launch file deny](../reference/known-gaps.md#gap-launch-file-deny-one-level) |
| Confinement or the platform | [session profiles](../reference/known-gaps.md#gap-session-profiles-weaker), [login item](../reference/known-gaps.md#gap-login-item-no-keepalive), [reboot mid-install](../reference/known-gaps.md#gap-reboot-mid-install-ends-job) |
| Names and install | [setup names the released program](../reference/known-gaps.md#gap-setup-names-the-released-program), [init marker window](../reference/known-gaps.md#gap-init-marker-window), [help text](../reference/known-gaps.md#gap-help-text-stale) |
| Prompts and templates, which travel as they are | [worker filing](../reference/known-gaps.md#gap-worker-filing-omits-type), [merge fix wording](../reference/known-gaps.md#gap-merge-fix-one-attempt-wording), [ticket body template](../reference/known-gaps.md#gap-ticket-body-template), [red handoff wording](../reference/known-gaps.md#gap-red-handoff-says-baton-pass), [checks line wording](../reference/known-gaps.md#gap-checks-line-wording), [job kinds](../reference/known-gaps.md#gap-reference-omits-job-kinds) |
| Lifecycle rules | [waiver answer](../reference/known-gaps.md#gap-waiver-answer-has-no-effect), [merge agents skip Customs](../reference/known-gaps.md#gap-merge-agents-skip-customs), [refused merge](../reference/known-gaps.md#gap-refused-merge-relaunches-review), [ticket ids after clear](../reference/known-gaps.md#gap-clear-all-reuses-ticket-ids) |
| Scale and housekeeping | [nothing is removed](../reference/known-gaps.md#gap-nothing-is-ever-removed), [landed worktrees](../reference/known-gaps.md#gap-landed-worktrees-stay), [whole log and bodies](../reference/known-gaps.md#gap-scaling-whole-log-and-bodies) |
| The residue | [dead code](../reference/known-gaps.md#gap-dead-code-and-unused-states), [stale prose](../reference/known-gaps.md#gap-stale-prose-in-code) |

## Design material and evidence

A clone of this branch lacks the design material and the evidence. Both exist only in the owner's main checkout, so a
port must copy them deliberately.

| Material | Location in the main checkout | State | Copy it because |
| --- | --- | --- | --- |
| Design | `docs/design/code-owned-lifecycle/design.md`, `plan.json`, `docs/design/code-owned-lifecycle.html` | Untracked in git | 58 lines across 48 shipping and spec files cite "design section N" |
| Owner answers | `.claude/.evidence/code-owned-lifecycle/owner-answers.md`, `requirements.md` | Ignored through `.git/info/exclude`, so local to that clone | Source comments cite "owner answer Q41" and the like |
| Probes | `.claude/.evidence/code-owned-lifecycle/probes-v2/`, `.claude/.evidence/runner-claude-probe/` | Same | The logs and `drive.py` behind [the probe record](overseer-claude-probe.md) |
| Smoke logs | `.claude/.evidence/cutover-smoke/` | Same | History of [the smoke](cutover-smoke.md) only |
| This documentation's plan | `.claude/.evidence/group-docs/` | Same | Optional |

> **Careful.** Probe evidence is not portable in a second sense. It records Claude Code 2.1.311 on one day, so it
> proves nothing about a later release. Only the stream fixtures in `src/lib/claude-code/testing/fixtures/` are
> tracked, and they travel. A vendor upgrade needs its probes run again.

The design is rationale, never authority. These sections differ from the code:

| Design section | The code instead |
| --- | --- |
| §1, a new version rather than a new project | A separate product; this branch never merges |
| §5.2 and elsewhere, the stored `checks` line | `pipeline.json`; see [Customs and gates](../architecture/customs-and-gates.md) |
| §5.2, a gate cache | No gate cache of the product's own; see `src/services/lifecycle/GateRun.ts` |
| §5.1, Customs check ids V1 to V14 | Customs check ids V1 to V16 in `src/services/lifecycle/Customs.ts` |
| §12.2, `INSTALL_VERSION` 17, an installed Assistant brief | `INSTALL_VERSION` (19), `briefs/defaults/assistant.md` |
| Mandatory review | An optional pipeline phase |
| §11.3, capabilities with fallback paths | No code reads `AgentCapabilities` |
| §13.4, cutover and `dispatcher/` | No cutover, and that folder does not exist on this branch |

## Invariants

1. Shipping code names the program through `PRODUCT_NAMES`, apart from the literals listed under
   [What a rename touches](#what-a-rename-touches).
2. Only `cli/CommandContext.ts` chooses the vendor's adapter.
3. In shipping code, only `GitProcess.run` spawns git; no guard holds this.
4. A build whose `PROGRAM` is not the original refuses to install beside the released program's data folder.
5. `package.json`'s name and single bin key equal `PROGRAM`, and `setup.sh`'s default label equals `LAUNCH_AGENT_LABEL`.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Name sets | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `src/ProductNames.spec.ts`, `src/ProductNameLiterals.spec.ts` |
| Two-program isolation | `cli/adoption/OlderProgramRefusal.ts` | `refuseBesideAnOlderProgram` | `cli/ProductNameIsolation.spec.ts` |
| Running as the other program | `cli/testing/OtherProductNamesPreload.ts` | `swappedProductNamesSource` | `cli/ProductNameIsolation.spec.ts` |
| Vendor interface | `src/lib/agent-launch/AgentAdapter.ts` | `AgentAdapter` | `src/ImportDirection.spec.ts` |
| Git | `src/lib/git/GitProcess.ts` | `GitProcess.run` | `src/lib/git/GitProcess.spec.ts` tests `run` itself |
| Sandbox | `src/services/overseer/ProcessWatcherSandbox.ts` | `createProcessWatcherSandbox` | `src/services/overseer/ProcessWatcherSandbox.spec.ts` |
| Retired install | `cli/adoption/constants/RetiredClaudeInstall.ts` | `RETIRED_HOOKS`, `retiredInstalledFilePathsIn` | `cli/adoption/update/UpdateCommand.spec.ts` |
| Installed surface | `cli/FrozenInstalledSurface.json` | | `cli/InstalledSurface.spec.ts` |
| Installed text | `cli/adoption/FrozenClaudeInstall.json` | | `cli/adoption/TrackerRefresh.claudeInstall.spec.ts` |
| Retired names | `src/ComponentNames.spec.ts` | `RETIRED_NAMES` | itself |
