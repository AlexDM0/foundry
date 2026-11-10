# Code map

> **Question:** How is the source laid out, what may import what, and where do I start reading?
> **Time:** 20 minutes.
> **Read first:** [Overview](../concepts/overview.md), [Glossary](../glossary.md).
> **Next:** [Pass](the-pass.md), [CLI and install](cli-and-install.md), [Guards](../development/guards-and-testing.md).

## In one screen

The repository is one Bun and TypeScript codebase, run from source with nothing compiled ahead of time. The
[Overseer](../glossary.md#overseer), the long-running process that drives the [board](../glossary.md#board), bundles the
[Watcher](../glossary.md#watcher), a thin process around one [agent](../glossary.md#agent)
[session](../glossary.md#session), when it starts. Bun bundles the [Bridge](../glossary.md#bridge), the browser client,
for the Overseer's web server.

The source stacks into layers: twelve building-block packages in `src/lib/`, then `src/shared/`, `src/adapters/`, five
services, and two user-facing surfaces, the `cli/` commands and the `bridge/` browser client. The services are `render`
(the Bridge's data), `tracker` (writes the board's files), `lifecycle` (work on a tree, review outcomes), `control`
(applies one command) and `overseer` (the Overseer itself). Two one-statement binaries sit on top: `agent-progress.ts`
and `watcher.ts`. Two more entry files sit beside them: `setup.ts`, the machine setup, and `launcher.ts`, the installed
command that `setup.ts` compiles.

The layer order is a permission, and a test enforces it. The project calls such a spec a guard, and says it holds the
rule. `LAYER_REACH` in `src/ImportDirection.spec.ts` is one table of data, and `bun test` is the architecture checker.
Permission is not use: `lifecycle` imports no `tracker`, and only `control` and `overseer` compose other services. The
Bridge imports types and a few pure helpers from `src/`, and gets all other data from the Overseer over HTTP.

Start reading at `src/lib/tracker-model/Playbook.ts` and follow [the reading order](#where-to-start-reading).

![Ten bands from the binaries down to src/lib, with one column per importer. A blue dot is real shipping imports into that band, its area the edge count. Eleven dashed rings are imports the layer order allows and nothing makes: lifecycle imports neither tracker nor render, tracker no render, control no render, the command line no lifecycle, and the Bridge reaches only shared and lib.](../figures/code-map/layer-stack.png)

*Read a column downward: each ring is an import the layer order allows and that importer never makes.*

## The layer rule is data

`LAYER_REACH` decides every import between repository files. `layerOf` places each scanned file in a layer by its path,
and `directionFinding` fails an edge whose target layer is not on the importer's list. The rule's text lives in the
[root `CLAUDE.md`](../../CLAUDE.md), under Imports. The figure above draws the source layers. This table holds the rest.

| Layer | Where | May import |
| --- | --- | --- |
| `test-support` | `src/testing/` | every source layer, not `cli` or `bridge` |
| `repository-guard` | a spec directly in `src/` | nothing outside a `testing/` folder |
| `unplaced` | anything else | nothing; a test fails while any scanned file sits here |
| `watcher-binary` | `watcher.ts` | `lib`, narrowed by `directionFinding` to `src/lib/watcher/`, and no builtin |

A `testing/` target skips the direction check, and `TESTING_FOLDER_IMPORTERS` judges it instead. The scanner counts a
type-only import as an edge, so a type cannot cross a layer either. Each rule's guard is described in
[Guards and testing](../development/guards-and-testing.md), and
[How to read a guard](../development/guards-and-testing.md#how-to-read-a-guard) explains the form.

## Allowed versus used

The service order is a permission, not a call chain: only two services compose the others.

![overseer imports control, tracker, lifecycle and render, and control imports tracker and lifecycle, with the edge count on each arrow. render, tracker and lifecycle import no other service. Dashed arrows from lifecycle to tracker and from tracker to render are imports the layer order allows and nothing makes, so the order is a permission, not a call chain.](../figures/code-map/service-composition.png)

*The arrows do not walk the layer order: `tracker` and `lifecycle` are siblings, and neither dashed import exists.*

A shipping file is one that is not a spec and sits outside every `testing/` folder, and counts here are its import edges
at commit `70ce56de`.

<details>
<summary>The edge counts between layers</summary>

A bold zero is an import the layer rule allows and the code does not make. An empty cell is an import the rule forbids,
or a layer's imports of itself, which the table does not count.

| From \ to | `lib` | `shared` | `adapters` | `render` | `tracker` | `lifecycle` | `control` | `overseer` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shared` | 12 | | | | | | | |
| `adapters` | 115 | 22 | | | | | | |
| `render` | 7 | 7 | 2 | | | | | |
| `tracker` | 20 | 11 | 23 | **0** | | | | |
| `lifecycle` | 35 | 4 | 4 | **0** | **0** | | | |
| `control` | 19 | 25 | 2 | **0** | 14 | 1 | | |
| `overseer` | 161 | 32 | 9 | 2 | 10 | 12 | 2 | |
| `cli` | 125 | 176 | 42 | 1 | 62 | **0** | 25 | 52 |
| `bridge` | 37 | 3 | **0** | **0** | **0** | **0** | **0** | **0** |

</details>

- **The order only permits.** `LAYER_REACH` lets a later service reach an earlier one, and among `render`, `tracker` and
  `lifecycle` none does.
- **`overseer` reaches `control` in one file.** Both edges start in `src/services/overseer/HatchInbox.ts`.
- **`lifecycle` has no command above it.** `cli` imports the other four services and never `lifecycle`.
- **`bridge` reaches `src/` narrowly.** Its 37 `lib` edges are 31 into `tracker-model`, 3 into `local-time`, 2 into
  `token-count` and 1 into `html-escape`. Inside `tracker-model` it takes types plus two constants files. Its 3 `shared`
  edges all name `src/shared/constants/ProductNames.ts`.

Two edges sit outside the bands. `cli/overseer/routes/OverseerRoutes.ts` imports `bridge/index.html` so Bun can bundle
it, the one entry in `FEATURE_REACHES_BY_PATH`. The one shipping module that imports test code is
`cli/CommandContext.ts`, which imports `src/testing/FakeAgentAdapter.ts`, explained [under the
seams](#the-fake-agent-ships).

## Reading a path by its name

A path says what a file is. A file is `PascalCase.ts`, named after its main export. No `index.ts` exists.

| Mark | Meaning | Example |
| --- | --- | --- |
| `*Util.ts` | An object of at least two pure members, usually `as const`; `src/UtilShape.spec.ts` holds only the member count | `src/lib/local-time/LocalTimeUtil.ts` |
| `*Ingestion.ts` | Reads a stored file into the model | `src/adapters/tickets/TicketFileIngestion.ts` |
| `*Writer.ts` | Writes a stored file | `src/adapters/tickets/TicketFileWriter.ts` |
| `@types/` | Types several modules use | `src/lib/tracker-model/@types/Ticket.ts` |
| `constants/` | Values; inline magic numbers are lint errors elsewhere | `src/shared/constants/Limits.ts` |
| `utils/` | Utils a folder shares | `src/adapters/utils/` |
| `testing/` | Test-only helpers, with importers held by an allowlist | `src/testing/ImportGraph.ts` |
| `<Module>.spec.ts` | The module's suite, beside it | `src/lib/tracker-model/Board.spec.ts` |
| `<Module>.<aspect>.spec.ts` | A further suite | `src/lib/tracker-model/Board.airlocks.spec.ts` |
| `*.dom.tsx` | A Bridge component suite, run by `bridge/testing/RunDomSpecs.ts` | `bridge/shell/Header.dom.tsx` |

## `src/lib/`: twelve packages

Twelve packages hold the reusable building blocks, and `tracker-model` is the one the rest of the code depends on most.
A package knows nothing about its callers ([`CLAUDE.md`](../../CLAUDE.md), Imports). The one recorded exception is the
`Board`, which throws `BoardRefusal` rather than returning a verdict.

![The twelve src/lib packages, sized by inbound shipping imports. tracker-model, at 360, dwarfs the rest and has no arrow to any package. Only claude-code, git, watcher and versioned-registry import another package, the heaviest arrow being claude-code to agent-launch at 7; the other eight depend on nothing.](../figures/code-map/lib-packages.png)

*Only four packages have an outgoing arrow, and none of the arrows reaches `tracker-model`. Counts are at commit
`70ce56de`.*

| Package | Purpose | Main exports |
| --- | --- | --- |
| `tracker-model` | The domain: the `Board` aggregate, the [`Playbook`](../glossary.md#playbook), ticket and Airlock moves, and queries. No I/O. | `Board`, `Playbook`, `BoardRefusal` |
| `watcher` | One Watcher: runs one child detached, logs every line, speaks a socket protocol, records the end. | `runWatcher`, `createEventLogWriter`, `clientFrameOf` |
| `agent-launch` | The vendor-neutral launcher port: types plus the launch environment. | `AgentAdapter`, `AgentLaunchPlan`, `WorkerProfile` |
| `claude-code` | The Claude Code adapter, stream mapper, transcripts, settings hooks and managed block. | `CLAUDE_CODE_ADAPTER`, `claudeStreamEventsOf` |
| `git` | Every git spawn, and answers about a repository as returned values. | `GitProcess`, `predictMerges`, `fastForwardTo` |
| `atomic-file` | Replace a file in one step: temporary file beside the target, `fsync`, rename. | `writeFileAtomically` |
| `process-identity` | Tell a process from a reused pid, and signal only after that check. | `identityOf`, `sameProcess` |
| `versioned-registry` | A versioned JSON file of entries that keeps unknown keys in order. | `VersionedRegistryUtil` |
| `json-record` | Plain-object checks of parsed JSON. | `JsonRecordUtil` |
| `local-time` | Local-offset ISO 8601 timestamps. | `LocalTimeUtil` |
| `token-count` | One display format for token counts. | `TokenCountUtil` |
| `html-escape` | HTML escaping. | `HtmlEscapeUtil` |

> **Careful.** A header comment can be a build input. `declaredLibDependenciesOf` reads the sentence "depends on
> `src/lib/<package>`" from the header of whichever one top-level module of the package declares it (for `claude-code`,
> `ClaudeTranscripts.ts`). An import of a package the sentence does not name fails as
> `lib-imports-an-undeclared-package`, a named package nothing imports fails as an unused allowance, and two modules of
> a package declaring fails the scan. Rewording that sentence can fail `bun test`.

**Why `tracker-model` has no builtins.** The Bridge's program compiles the whole package, so nothing in it may need Node
or Bun. The rule `tracker-model-reaches-outside-itself` allows no import outside its own folder, builtins included. The
rule shapes algorithms: `src/lib/tracker-model/utils/TicketBodyHashUtil.ts` computes FNV-1a by hand in `BigInt` because
`node:crypto` is out of reach. Keeping the domain free of I/O also lets its specs run without a disk.

**Why `watcher` has no product name.** The Overseer bundles `watcher.ts` once at its start, in
`src/services/overseer/WatcherBundle.ts`, so a [landing](../glossary.md#landing) or a `bun install` never changes what a
running Watcher runs. A running Watcher therefore holds old code through an update, and rules it held would go stale
under a live agent ([Decisions](../development/decisions.md)). So it knows no board, no ticket and no vendor, and reads
what to run from its [job](../glossary.md#job) folder's launch file.

`src/lib/watcher/WatcherBundleClosure.spec.ts` holds its import closure inside `src/lib/watcher/` and the two packages
it declares, `atomic-file` and `process-identity`, and fails on any product or vendor name in the `src/lib/watcher/`
files. [Watchers](watchers.md) covers the rest.

## `src/shared/`

`src/shared/` holds what several parts of this application use and a lib package may not know. It imports only `lib`,
and all of those edges go to `tracker-model`.

- `Environment.ts` is a seam; see [Seams](#seams).
- `OperationRefusal.ts` is the typed [refusal](../glossary.md#refusal) thrown instead of exiting.
- `constants/` holds `ProductNames.ts`, `DispatchProtocol.ts` and the bound lists: `Limits.ts`, `LifecycleLimits.ts`,
  `AirlockLimits.ts`, `OverseerLimits.ts`. The values live in [Deciders and
  bounds](../reference/deciders-and-bounds.md).
- `@types/ControlCommand.ts` is the shape of a command `ControlService` applies, and `@types/PagePayload.ts` the payload
  the Bridge receives.
- `rework/` classifies diff lines as code or comment, for `src/services/lifecycle/ReviewOutcome.ts`.

## `src/adapters/`

`src/adapters/` is the boundary where stored formats and wording live. Each stored format has a folder, and the layer
imports only `lib` and `shared`. Its only builtins are `node:fs` and `node:path`.

- `<format>/*Ingestion.ts` reads a stored file into the model. `<format>/*Writer.ts` writes it. Ingestion and writer
  exist for [tickets](../glossary.md#ticket), progress, log, epics, [filing drafts](../glossary.md#filing-draft), the
  [hold journal](../glossary.md#hold-journal) and the install manifest.
- `<format>/utils/*DocumentUtil.ts` maps between the model and a document, such as `TicketDocumentUtil`.
- `pipeline/`, `hatch/`, `usage-marker/` and `reports/` read, write or validate their own formats, `reports/` through
  the report schemas.
- `utils/OperationRefusalWordingUtil.ts` is the one place a refusal gets its words.

The formats are in the [CLI reference](../cli.md), and the write order in [Storage](../data-model/storage.md).

## `src/services/`: five services

| Service | What it is | Start at |
| --- | --- | --- |
| `render` | Turns the [tracker](../glossary.md#tracker)'s stored files into the Bridge's data: the page payload, board facts and Markdown. The only user of `marked`. | `PagePayloadAssembly.ts` |
| `tracker` | Finds a tracker and writes it: lock, hold journal, stored files, and the one write sequence. | `TrackerPipeline.ts`, `writeTracker` |
| `lifecycle` | Work on a tree and what follows from it: [Customs](../glossary.md#customs), [gate](../glossary.md#gate) runs, merge runs, landing, review outcomes, onboarding proposals, token crediting. It keeps no gate result; its only files are two in a job folder, the onboarding outcome and the waiver proposals. | `Customs.ts`, `GateRun.ts` |
| `control` | Applies one control command to a `Board`, for a CLI verb, a request an agent relays through the [Hatch](../glossary.md#hatch), or the API alike. It changes records and starts nothing; the one exception is `WorktreeRepair.ts`, which runs git inside the [lock hold](../glossary.md#lock-hold) that records the repair. | `ControlService.ts`; the [Bouncer](../glossary.md#bouncer), `Bouncer.ts` |
| `overseer` | The long-running process. It runs the [Pass](../glossary.md#pass), launches jobs, runs the [Airlocks](../glossary.md#airlock) that merge and land, keeps the Watcher fleet, holds the [Baton](../glossary.md#baton) that names the one live Overseer, runs [Regrouping](../glossary.md#regrouping) at its start, and serves the API. | `DrivePass.ts` |

## `cli/`

`cli/` is the command surface and the composition root. `agent-progress.ts` calls `runCommandLine` in `cli/Main.ts`,
which looks the verb up in `COMMAND_TABLE` and imports its module lazily, so each top-level verb loads only what it
needs. `cli/Main.ts` is the only place an exit code is decided. Command flow is explained in [CLI and
install](cli-and-install.md), and every verb in the [CLI reference](../cli.md).

<details>
<summary>The folders of <code>cli/</code></summary>

Files are shipping modules at commit `70ce56de`.

| Folder | Files | Verbs or purpose |
| --- | --- | --- |
| root | 18 | `Main.ts`, `CommandTable.ts`, `CommandContext.ts`, `HelpText.ts`, `HatchUnderJob.ts`, install-version check |
| `adoption/` | 10 | `init`, `update` |
| `tickets/` | 21 | `ticket` |
| `tracking/` | 11 | `status`, `task`, `log`, `await`, `range`, `open`, `clear` |
| `overseer/` | 8 | `oversee`, `version`, the API routes |
| `measurement/` | 5 | `usage`, `review-stats` |
| `drafts/` | 5 | `draft` |
| `epics/` | 4 | `epic` |
| `hooks/` | 3 | `hook` |
| `gates/` | 2 | `gate` |
| `jobs/` | 2 | `jobs`, `job` |
| `merges/` | 2 | `merges`, `merge` |
| `decisions/` | 2 | `decisions`, `decide` |
| `incidents/` | 2 | `incidents`, `incident` |
| `dispatch/`, `worktrees/`, `intake/`, `onboarding/` | 1 each | `concurrency`, `worktree`, `intake`, `advise` |
| `arguments/`, `constants/`, `utils/` | 3 each | The parser, constants and output helpers commands share |

</details>

## `bridge/`

`bridge/` is the browser client, one React root and its own TypeScript program. `bridge/Main.tsx` mounts it.
`bridge/api/` talks to the Overseer, `bridge/shell/` is the frame and router, and `bridge/views/` holds one folder per
view. `bridge/@types/`, `bridge/utils/`, `bridge/design-system/`, `bridge/chips/`, `bridge/conversation/` and
`bridge/preferences/` hold what views share. A view folder may not import another view folder, and
`bridge/design-system/` imports nothing outside itself but the display-state type. [The Bridge](bridge.md) explains
the client.

## Two binaries

Each binary runs its command as soon as it is imported, so no spec can import it and specs spawn it instead. That is why
each holds a single statement: everything worth testing lives in an importable module.

| Binary | Imports | What its one statement does |
| --- | --- | --- |
| `agent-progress.ts` | `cli/` only | Builds the process context, runs the command line and exits with the exit code. |
| `watcher.ts` | `src/lib/watcher/` only, no builtin | Hands `runWatcher` its arguments and the clock that stamps event-log entries, then exits with the result. The Overseer bundles it and pins the bundle. |

`launcher.ts` is the installed command, in the `launcher-binary` layer, which imports only `src/shared/`. `setup.ts`
compiles it, and it starts `agent-progress.ts` on the Bun and checkout it was compiled against, passing its streams,
arguments and exit code through.

## Seams

Each seam is the one file where the code meets something outside it (the process, the vendor, git, the product's name),
so a spec has one thing to replace and a port one place to start. A process reach is code touching the process itself:
its environment, clock, working directory, home folder or exit.

![Process facts enter through Environment.ts and CommandContext. Commands take the context, pass values to services and return or throw, and runCommandLine turns that into the exit code for agent-progress.ts. A spec swaps in a captured context, and watcher.ts stays outside the funnel with its own clock.](../figures/code-map/process-reach.png)

*What a test must control passes through two files, so a whole command runs inside a test. The Watcher's clock sits
outside.*

`CONFINED_REACHES` and the clock selectors in `eslint.config.js` hold these reaches to the listed files
([`CLAUDE.md`](../../CLAUDE.md), Runtime; [Guards](../development/guards-and-testing.md)).

- **`CommandContext`** (`cli/CommandContext.ts`) carries the directory, clock, streams, home, platform and agent
  adapter. `createProcessContext` builds the real one, and only `agent-progress.ts` calls it outside its own file.
- **`Environment`** (`src/shared/Environment.ts`) is the one reader of `process.env`, through documented getters.
- **`AgentAdapter`** (`src/lib/agent-launch/AgentAdapter.ts`) is the vendor port, chosen once. Only
  `agentAdapterOfThisProcess` in `cli/CommandContext.ts` imports `CLAUDE_CODE_ADAPTER` from outside
  `src/lib/claude-code/`, and the violation `vendor-adapter-imported-outside-its-seam` holds that. Transcript reading,
  `usage` and the install also import `src/lib/claude-code/`; [Porting](../development/porting.md) lists them.
- **`GitProcess`** (`src/lib/git/GitProcess.ts`) is the one git spawn, with hooks off by default, because a repository's
  hooks are code an agent can write ([Confinement](confinement.md)).
- **`PRODUCT_NAMES`** (`src/shared/constants/ProductNames.ts`) is one assignment that every program name, folder, skill,
  variable prefix and first port derives from. [Porting](../development/porting.md) explains why two name sets exist,
  one of them the released product's names.

### The fake agent ships

![A spec spawns the binary through CliProcess.ts with FAKE_AGENT_SWITCHES set, and in the child agentAdapterOfThisProcess forks on fakeAgentIsOn. Off, as in a real run, it takes CLAUDE_CODE_ADAPTER; on, it takes FakeAgentAdapter, which starts FakeAgentChild by path. A spawned binary cannot be injected, so it must choose its own adapter.](../figures/code-map/fake-agent-switch.png)

*The fork is in shipping code, so a module from a test folder loads on every run.*

`src/testing/FakeAgentAdapter.ts` lives in a test folder, yet every run of the binary loads it, because
`cli/CommandContext.ts` imports it. It stays inert unless `fakeAgentIsOn`. A spec that spawns the binary cannot inject a
dependency into another process, so the choice has to live in the binary.

`TESTING_FOLDER_IMPORTERS` lists `cli/CommandContext.ts` as its one shipping importer. `FakeAgentAdapter.ts` imports
`agent-launch` and `CLAUDE_STREAM_LINES` from `claude-code`, never `ClaudeCodeAdapter.ts`, so the vendor seam holds.

## Three TypeScript programs

Bun runs the TypeScript and `tsc` only checks it. `bun run typecheck` compiles three programs, and each proves something
the others cannot.

![tsconfig.json holds the binaries, cli and src with Bun types. bridge/tsconfig.json holds the shipping Bridge with the DOM library and no ambient types, and bridge/tsconfig.spec.json contains it and adds 69 Bridge test files plus 306 src and cli files reached by imports, under Bun types. The tracker model and four named files sit in all three, so they compile with and without Bun types and depend on neither world.](../figures/code-map/three-programs.png)

*The green overlap compiles with Bun types and again with none, so it cannot depend on either world.*

File counts are at commit `70ce56de`.

| Program | Sees | Proves |
| --- | --- | --- |
| `tsconfig.json` | `agent-progress.ts`, `watcher.ts`, `cli/`, `src/`, specs included; 750 files | The server side, under Bun types and no DOM |
| `bridge/tsconfig.json` | `bridge/` shipping modules, the 86 `tracker-model` modules, and the 4 files the Bridge imports by name (`ProductNames.ts`, `HtmlEscapeUtil.ts`, `LocalTimeUtil.ts`, `TokenCountUtil.ts`); 174 files | The browser code uses no Node or Bun API |
| `bridge/tsconfig.spec.json` | The same plus the Bridge's specs, DOM specs and `bridge/testing/`; 243 files named. Following their imports adds 306 `src/` and `cli/` files under Bun types, so it compiles 549 | The Bridge's tests compile, with Bun types added |

`types: []` in `bridge/tsconfig.json` is the wall. It removes the Bun and Node ambient types, so a module that imports
`node:fs` or calls `Bun.file` fails to compile. The 174-file program is the proof; the spec program is not, since it
adds Bun types back.

The Bridge takes little from `tracker-model`. The program compiles all 86 modules to prove the package safe, not because
the Bridge runs them. `src/ProjectIncludeLists.spec.ts` holds the `include` list exact both ways.

## Where to start reading

Read these seven files in order. The first five follow one ticket from the Playbook's choice of a next step to a
landing. The last two show what sits beneath: the process around a session and how a command becomes a Board change.

1. `src/lib/tracker-model/Playbook.ts`: what runs next, a pure function of the board and observations. Start at
   `nextStepsOf`.
2. `src/lib/tracker-model/Board.ts`: the aggregate every change goes through. Its methods hand each rule to the module
   beside it. Start at the `Board` class.
3. `src/services/overseer/DrivePass.ts`: one Pass, observing, applying and running the `Playbook`'s steps. Start at
   `runOnePass`.
4. `src/services/lifecycle/Customs.ts`: how code checks what a session left. Start at `clearCustoms`.
5. `src/services/overseer/Airlocks.ts`: merging and landing, one Airlock per target. Start at `createAirlocks`.
6. `src/lib/watcher/Watcher.ts`: the thin process around one agent session. Start at `runWatcher`.
7. `src/services/control/ControlService.ts`: the one applier a CLI verb, a request relayed through the Hatch and an API
   command share, inside a `writeTracker` hold. The Overseer's own writes and some verbs skip it and call `writeTracker`
   in `src/services/tracker/TrackerPipeline.ts` directly. Start at `ControlService.apply`.

## The repository in numbers

The tree is 47,689 shipping lines held by 60,514 lines of specs and test helpers, at commit `70ce56de`. Shipping is
counted by path, so `src/testing/FakeAgentAdapter.ts`, which every run loads, counts as test code; see [The fake agent
ships](#the-fake-agent-ships).

<details>
<summary>Totals and sizes per unit</summary>

Lines are newline-split, over the files the guards scan.

| Measure | Value |
| --- | --- |
| Git-tracked files | 1,007 |
| Files in the TypeScript programs | 903 |
| Shipping modules (not a spec, not under `testing/`) | 480 |
| Spec files | 365, of which 17 are `.dom.tsx` |
| Test helper files | 58 |
| Lines of test per shipping line | 1.27 |
| Import edges | 5,007, of which 4,089 stay inside the repository |
| Repository edges from shipping code | 2,326 |
| Dynamic imports | 31, all in `cli/CommandTable.ts` |
| Runtime dependencies | 3: `marked`, `react`, `react-dom` |

| Unit | Shipping files | Test files | Shipping lines | Test lines |
| --- | --- | --- | --- | --- |
| `agent-progress.ts`, `watcher.ts` | 2 | 0 | 20 | 0 |
| `src/lib/` (twelve packages) | 129 | 98 | 12,288 | 15,269 |
| `src/shared/` | 26 | 7 | 1,555 | 618 |
| `src/adapters/` | 51 | 46 | 4,919 | 4,974 |
| `src/services/render/` | 4 | 2 | 283 | 372 |
| `src/services/tracker/` | 13 | 11 | 1,276 | 1,650 |
| `src/services/lifecycle/` | 9 | 9 | 1,700 | 1,874 |
| `src/services/control/` | 14 | 6 | 869 | 1,137 |
| `src/services/overseer/` | 40 | 38 | 7,608 | 6,772 |
| `src/testing/` and root guards | 0 | 38 | 0 | 3,596 |
| `cli/` | 108 | 99 | 8,626 | 16,936 |
| `bridge/` | 84 | 69 | 8,545 | 7,316 |

The largest shipping modules are `src/lib/tracker-model/Board.ts` (1,033 lines), `src/services/overseer/DrivePass.ts`
(982), `src/services/overseer/JobLaunch.ts` (934) and `src/services/overseer/Airlocks.ts` (806).

</details>

<details>
<summary>Recompute the counts</summary>

Run this from the repository root. `createImportGraphScanner` is the scanner the guards use, so the numbers are the
graph they see. Filter `graph.edges` by `fromPath` and `target` for the tables on this page. The scanner reads
`tsconfig.json` and `bridge/tsconfig.spec.json`, since the spec program contains the shipping one.

```sh
bun -e "
import { createImportGraphScanner, repositoryRootOfThisCheckout } from './src/testing/ImportGraph.ts';
const { graph } = createImportGraphScanner(repositoryRootOfThisCheckout());
const isShipping = (path) => !path.endsWith('.spec.ts') && !path.endsWith('.dom.tsx') && !path.split('/').includes('testing');
console.log(graph.scannedPaths.length, graph.scannedPaths.filter(isShipping).length, graph.edges.length);
"
```

</details>

## Invariants

1. No shipping or test file imports against `LAYER_REACH`, except a `testing/` target that `TESTING_FOLDER_IMPORTERS`
   allows and the one `FEATURE_REACHES_BY_PATH` entry.
2. No import cycle exists, over files or over lib packages.
3. No barrel exists: no re-export and no `index.ts`.
4. `tracker-model`'s shipping modules import nothing outside its own folder, builtins included.
5. `agent-progress.ts` imports only `cli/`, and `watcher.ts` imports only `src/lib/watcher/`.
6. A lib package imports another only when the header of its one declaring top-level module names it, and a header
   names only what is imported.
7. `bridge/tsconfig.json` names exactly the files the Bridge reaches outside its folder, plus every `tracker-model`
   module.
8. A process reach named in `CONFINED_REACHES` happens only in that entry's listed files.

## In the code

| Concept | Path | Symbol | Held by |
| --- | --- | --- | --- |
| Layer rule | `src/ImportDirection.spec.ts` | `LAYER_REACH`, `layerOf`, `directionFinding` | `src/ImportDirection.spec.ts` |
| Import scanner | `src/testing/ImportGraph.ts` | `createImportGraphScanner`, `reachablePathsFrom` | `src/ImportDirection.spec.ts` |
| Test folder allowlist | `src/ImportDirection.spec.ts` | `TESTING_FOLDER_IMPORTERS` | `src/ImportDirection.spec.ts` |
| Lib dependency header | `src/ImportDirection.spec.ts` | `declaredLibDependenciesOf` | `src/ImportDirection.spec.ts` |
| Watcher closure | `watcher.ts` | `runWatcher` | `src/lib/watcher/WatcherBundleClosure.spec.ts` |
| Process seam | `cli/CommandContext.ts` | `CommandContext`, `createProcessContext` | `src/TestFileConventions.spec.ts` |
| Environment seam | `src/shared/Environment.ts` | `CONFINED_REACHES` in `eslint.config.js` | `src/LintRules.spec.ts` |
| Vendor seam | `src/lib/agent-launch/AgentAdapter.ts` | `AgentAdapter`; `agentAdapterOfThisProcess` in `cli/CommandContext.ts` | `src/ImportDirection.spec.ts` |
| Git seam | `src/lib/git/GitProcess.ts` | `GitProcess`, `GitHookPolicy` | `src/lib/git/GitProcess.integration.spec.ts` |
| Product names | `src/shared/constants/ProductNames.ts` | `PRODUCT_NAMES` | `src/ProductNames.spec.ts`, `src/ProductNameLiterals.spec.ts` |
| DOM-only program | `bridge/tsconfig.json` | `types: []`, `include` | `src/ProjectIncludeLists.spec.ts` |
| Fake agent | `src/testing/FakeAgentAdapter.ts` | `fakeAgentAdapter`; `fakeAgentIsOn` in `src/shared/Environment.ts` | `src/testing/FakeAgentAdapter.integration.spec.ts` |
