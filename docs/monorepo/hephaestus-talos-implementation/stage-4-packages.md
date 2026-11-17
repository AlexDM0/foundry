# Stage 4: Extract the packages

## Goal

The tracker model lives in `packages/tracker-model` and the pure readings that the Overseer and the Bridge's views both
compute live in `packages/board-readings`; forge imports both by name, and nothing in `apps/forge/src/lib/` holds a
part of the model any more. `packages/forge-contracts` holds the board and ticket documents that the Bridge's views read
and the command kinds that the Bridge sends, the Overseer serves the board state at `GET /api/v1/state`, a spec holds
that the served board state satisfies those documents, and forge's system version is one minor higher. `bun run verify`
is green at the root, and a forge on a scratch board works end to end with the packages in place.

## Depends on

Stages that must be finished before the first work package starts:

- **Stage 0**, for two of its answers: the names and contents of the packages this stage creates (stage 0, WP0.5,
  "Needs the owner" items 3 and 4), and the decision records written into design section 2. This plan carries out
  stage 0's recommended default: `tracker-model` and `board-readings` as new packages, and the documents in
  `forge-contracts`, which then depends on `tracker-model`. If the owner decided otherwise, the mapping table of WP4.2
  and WP4.3 changes and nothing else in the method does; see "Needs the owner", item 1.
- **Stage 1**, so the base does not move under a change of 700 files.
- **Stages 2 and 3**, merged. Both change files of the tracker model (stage 3 adds causes, a resume policy table and
  log records, and changes the Playbook) and both raise forge's system version and add to `forge-contracts` (stage 3
  adds `interrupted-work-resume` and the `presence` endpoint). This stage moves what they left. Every count and line
  number below was measured at `3e6cb660`; WP4.2 and WP4.3 compute their file lists from the tree they run on, never
  from this document.

What this stage hands to later stages:

- **Stage 5 (store port):** the Board, its records and its refusal are `tracker-model/Board`,
  `tracker-model/BoardRecords` and `tracker-model/BoardRefusal`; the local adapter wraps today's stores in
  `apps/forge/src/services/tracker/` and imports the model by name.
- **Stage 6 (Gaia hosts the views):** a Gaia view can import the vocabulary it reads from `tracker-model`, the readings
  from `board-readings`, the documents and the command kinds from `forge-contracts`, each by declaring the package in
  `apps/gaia/package.json`. `GET /api/v1/state` serves the board document at a versioned path. Gaia still supports the
  forge version stage 3 left; stage 6 raises `SUPPORTED_FORGE_VERSION` when it first reads a document added here.
- **Stage 8 (shrink the HTTP surface):** Flint's brain is already outside the contract's board document; its facts live
  only in the Bridge's own type, `apps/forge/bridge/@types/FlintBrainBoardState.ts`.
- **Stage 9 (rename):** the contract's documents keep today's names (`OverseerFactsDocument`, `OverseerRuntimeState`);
  renaming them is a change of the contract and belongs to the rename's major version.

## Decisions this stage carries out

- **2:** the forge owns the data model: the model becomes a package of the forge, which Gaia may read and never write.
- **19:** the read API is versioned: the board document joins the contract, served at `/api/v1/state` under a new
  system minor.
- **22:** outside the forge, state changes through a command: the kinds the views send join the contract.
- **25:** Flint's brain is left out of the core: its board facts stay out of the contract's board document.
- **27 and 28:** the Bridge's code will move into Gaia; this stage gives it packages to import, since a package imports
  nothing from `apps/`.
- **32:** nothing that exists has to be kept: no re-export shim, no old import path, no compatibility entry for the
  move; importers change outright.
- **33:** the packages are the ones stage 0 named; no work package introduces another.
- **34:** orchestrated sessions do the work in worktrees under `.claude/worktrees/`, outside both trackers.

## Today's code

Measured at `3e6cb660` with a walk of every `.ts` and `.tsx` file under `apps/forge`, `apps/gaia` and `packages`
(the folders `node_modules`, `.forge`, `.forge-worktrees`, `.turbo`, `.scratch` and `.claude` left out), resolving
relative imports.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The tracker model: 192 files, 108 shipping (23 in `@types/`, 23 in `constants/`, 25 in `utils/`, 37 at its top), 81 specs, 3 test helpers in `testing/` | `apps/forge/src/lib/tracker-model/` | Moved whole to `packages/tracker-model/` (WP4.2) |
| The model's shipping files import nothing outside their folder and no builtin | guard at `apps/forge/src/ImportDirection.spec.ts:161`, `:395-398`, `:1055-1057` | Changed: the package's own `PackageIsolation.spec.ts` holds it; the violation kind leaves `ImportDirection.spec.ts` (WP4.2) |
| The model's layers: `@types` and `constants` import only each other (type-only); `utils` import only `@types` and `constants`; the top-level modules import all three | the walk | Kept as is inside the package |
| The model's specs import forge helpers: `BoardFixtures.ts` (46 specs), `SourceMutant.ts` (3), `GreenQueue.ts` (2), `EveryBoardLogRecord.ts` (1) | `apps/forge/src/lib/tracker-model/Board.spec.ts:8-9` and the others; `apps/forge/src/testing/` | Moved into the model's `testing/` (WP4.1) |
| `BoardFixtures.ts`, `GreenQueue.ts` and `EveryBoardLogRecord.ts` import only the model; outside the model, 41, 6 and 2 forge specs and helpers import them | `apps/forge/src/testing/BoardFixtures.ts`, `GreenQueue.ts`, `EveryBoardLogRecord.ts` | Moved into the model's `testing/`, exported to forge's specs (WP4.1, WP4.2) |
| `SourceMutant.ts` makes its build folder through forge's `ScratchWorkspace.ts` and roots module paths at `apps/forge` | `apps/forge/src/testing/SourceMutant.ts:5`, `:14` | Moved; rooted at the model's folder with a scratch folder of its own (WP4.1) |
| The Playbook specs name modules by repository path as strings, `'src/lib/tracker-model/Playbook.ts'` | `apps/forge/src/lib/tracker-model/Playbook.spec.ts:34-38`, `Playbook.interleavings.spec.ts:13`, `:36-81`, `Playbook.forecast.spec.ts:14`, `:91-109` | Changed to paths from the model's folder (WP4.1) |
| Files outside the model that import it: 438 files, 989 import lines, 73 distinct model files; 264 ship, 155 are specs, 18 test helpers | the walk; by folder: `bridge/` 136, `cli/` 83, `src/services/` 135 (overseer 73, control 23, lifecycle 20, tracker 11, render 8), `src/adapters/` 68, `src/shared/` 10, `src/testing/` 6 | Changed: each import names the package (WP4.2) |
| No `src/lib/` package imports the model | the walk | Kept: a lib package still cannot reach a workspace package unless WP4.3's rule says so |
| The Bridge program compiles the whole model, one include entry per file, to prove it DOM-safe | `apps/forge/bridge/tsconfig.json:10-11` (comment), `:30-137` | Deleted: the package's own `tsconfig.json` is the proof (WP4.2) |
| The include-list guard holds the whole model as a "whole package folder" | `apps/forge/src/ProjectIncludeLists.spec.ts:35`, `:40`, `:88-93`, `:119-124` | Changed (WP4.2) |
| The include-list guard lists the declared workspace packages | `apps/forge/src/ProjectIncludeLists.spec.ts:95-97` | Changed: gains the two packages (WP4.2, WP4.3) |
| The test-folder allowlist entry of the model | `apps/forge/src/ImportDirection.spec.ts:118` | Changed (WP4.1, WP4.2) |
| The guard's list of packages in the workspace-package layer and forge-contracts' declared packages | `apps/forge/src/ImportDirection.spec.ts:622-631` | Changed (WP4.2, WP4.3, WP4.4) |
| A planted case that reaches the model by path from the design system | `apps/forge/src/ImportDirection.spec.ts:768-771` | Changed to another lib file (WP4.2) |
| A lib package reaches only lib packages; the lib dependency header names `` `src/lib/<name>` `` only | `apps/forge/src/ImportDirection.spec.ts:90`, `:167-168`, `:292-304`, `:392-402`, `:647`, `:835-837` | Changed in WP4.3, as "Needs the owner" item 2 decides |
| Re-exports are findings ("barrel") | `apps/forge/src/ImportDirection.spec.ts:432-434`, `:961-972`, `:1063-1065` | Kept: it is why no shim is used (Traps) |
| A workspace package's entries resolve only by exact `exports` keys, no patterns | `apps/forge/src/testing/ImportGraph.ts:131-139`, `:163-170` | Kept: every entry is listed |
| ESLint lets the model's `testing/` import devDependencies | `apps/forge/eslint.config.js:88` | Deleted (WP4.2) |
| The platform guard allowlists a line of the model by path | `apps/forge/src/PlatformBoundary.spec.ts:110` | Changed to `tracker-model/utils/NetworkDomainUtil.ts` (WP4.2) |
| The util-shape guard checks four folders by name | `apps/forge/src/UtilShape.spec.ts:59` | Changed: gains `tracker-model/` and `board-readings/` |
| The command-text guard scans four folders by name | `apps/forge/src/ProductNameLiterals.spec.ts:20` | Changed: gains `tracker-model/` and `board-readings/`, so the wording utils stay scanned |
| The client-name guard needs more than 1,000 shipped files in forge; forge has about 1,120 | `apps/forge/src/ClientNames.spec.ts:26`, `:44` | Changed: the floor drops below the count left after the moves (WP4.2) |
| Package floors and the list of declared packages | `apps/forge/src/testing/ImportGraph.spec.ts:68`, `apps/forge/src/testing/RepositorySources.spec.ts:86-87` | Changed (WP4.2, WP4.3) |
| The Watcher bundle's forbidden folders name the model | `apps/forge/src/lib/watcher/WatcherBundleClosure.spec.ts:22`; stage 2 deletes it and carries its list into `apps/forge/src/lib/talos/TalosClosure.spec.ts` (stage 2, WP2.7 and WP2.15) | Changed in `TalosClosure.spec.ts` to `tracker-model/` (WP4.2) |
| Documents cite 30 spec paths of the model, checked to exist | `apps/forge/src/DocumentSpecCitations.spec.ts:1-6`; `docs/concepts/overview.md:207`, `docs/development/guards-and-testing.md:154` and the others | Changed to `packages/tracker-model/...` (WP4.2) |
| forge's rules on the model | `apps/forge/CLAUDE.md:59-62`, `:65-67`, `:71`, `:221-224`, `:333` | Changed (WP4.2, WP4.3) |
| The root rules list forge's packages and its tracker's reach | `CLAUDE.md:17`, `:27` | Changed (WP4.2, WP4.3) |
| forge declares five workspace packages | `apps/forge/package.json:25-34` | Changed: gains `tracker-model` and `board-readings` |
| The code version hashes the workspace packages forge depends on | `apps/forge/src/services/overseer/CodeVersion.ts:1-4` | Kept: a change in either package still reads as new code |
| The pure readings: `src/shared/monitor/` (`@types/MonitorSnapshot.ts`, `AttentionEntries.ts`, `TodayFigures.ts`, four utils, six specs) and three lib packages (`token-count`, `local-time`, `html-escape`, one util and one spec each) | `apps/forge/src/shared/monitor/`, `apps/forge/src/lib/token-count/`, `src/lib/local-time/`, `src/lib/html-escape/` | Moved to `packages/board-readings/` (WP4.3) |
| `MonitorSnapshot.ts` reads its version type from forge's `OverseerApiContracts.ts` | `apps/forge/src/shared/monitor/@types/MonitorSnapshot.ts:22`, `:127` | Changed to `forge-contracts/OverseerContractVersions` (WP4.3) |
| `TodayFigures.ts` reads the stamp slices constant | `apps/forge/src/shared/monitor/TodayFigures.ts` (import of `../constants/TimestampSlices.ts`); `apps/forge/src/shared/constants/TimestampSlices.ts:2-8` | The constant moves with it (WP4.3, "Needs the owner" item 3) |
| A spec of the readings reads forge's product names | `apps/forge/src/shared/monitor/utils/NoticeWordingUtil.spec.ts:10`, `:52` | Split: the product-name claim moves to a forge spec (WP4.3) |
| The vendor adapter reads the local-time util | `apps/forge/src/lib/claude-code/utils/TranscriptCohortUtil.ts:6`; header `apps/forge/src/lib/claude-code/ClaudeTranscripts.ts:5` | Changed as "Needs the owner" item 2 decides (WP4.3) |
| Importers of the readings outside their folders: about 70 files (`LocalTimeUtil` 21, `TokenCountUtil` 13, `OpenDecisionsUtil` 10, `MonitorSnapshot` 8, `TimestampSlices` 8 and the rest) | the walk | Changed: each names the package (WP4.3) |
| `forge-contracts`: 9 command kinds, the identity, summary and monitor documents, versions and registry; depends on `system-versions` | `packages/forge-contracts/package.json:8-19`, `:28-30`; `@types/ForgeControlCommand.ts:9-18` | Gains the documents and the board command kinds and depends on `tracker-model` (WP4.4 to WP4.6) |
| The contract package lets modules import only `system-versions/` | `packages/forge-contracts/PackageIsolation.spec.ts:18-19`, `:30-40` | Changed: type-only imports of `tracker-model/` are allowed (WP4.4) |
| forge's system version 1.1 (stage 3 raises it) | `packages/forge-contracts/constants/ForgeSystemVersions.ts:14-17` | Raised by one minor (WP4.4) |
| The registry's endpoints; each current endpoint is introduced in 1.0 by its helper | `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:16-25`, `:38-49`; spec `ForgeCompatibilityRegistry.spec.ts:19-26` | Gains `state` at version 1 (WP4.4) |
| A versioned path is served for each registry endpoint by rewriting it to the unversioned route | `apps/forge/src/services/overseer/OverseerServer.ts:600-619`; the state route `:539` | Kept: the new entry serves `/api/v1/state` |
| forge's own command union: 76 kinds | `apps/forge/src/shared/@types/ControlCommand.ts:66-226` | Changed: the board kinds come from the contract (WP4.5) |
| The kinds of control contract 1, pinned against the package | `apps/forge/src/shared/constants/OverseerApiContracts.ts:26-36`; `apps/forge/cli/overseer/routes/CommandRoute.controlContract.spec.ts:44-58` | Kept; a second list beside it (WP4.5) |
| The command route accepts all 76 kinds and checks a few kinds' fields | `apps/forge/cli/overseer/routes/CommandRoute.ts:91-101`, `:141-170` | Kept |
| The Bridge sends 34 command kinds outside the contract's 9: a scan of `kind: '<kind>'` literals in its shipping files finds 39 command kinds, 5 of them in the contract; `pipeline-approval-set` appears only as a log record's `case` label (`apps/forge/bridge/views/pipeline/live/FlowActivityPanelModel.ts:156`) | a scan of `kind: '<kind>'` literals in the Bridge's shipping files against the kinds of `apps/forge/src/shared/@types/ControlCommand.ts` | Join the contract (WP4.5) |
| The Bridge's body type is any `{ kind: string }` | `apps/forge/bridge/api/CommandClient.ts:9-12` | Kept |
| The Bridge's documents: field-exact mirrors of the served board state, 7 files | `apps/forge/bridge/@types/BoardStateDocument.ts:1-203`, `ConversationDocuments.ts`, `DetailBoardState.ts`, `EpicsBoardState.ts`, `KanbanBoardState.ts`, `ProgressBoardState.ts`, `TicketsBoardState.ts` | Moved into `forge-contracts` (WP4.6) |
| 131 files import those 7 files | the walk | Changed: each names `forge-contracts/<Document>` (WP4.6) |
| The board document carries Flint's brain and the Bridge's view of the identity | `apps/forge/bridge/@types/BoardStateDocument.ts:188-196`, `:198-203` | Stay in the Bridge, in files of their own (WP4.6) |
| The page limits types the documents name | `apps/forge/bridge/utils/TimeUtil.ts:12-24`, `apps/forge/bridge/@types/Timeline.ts:4-16` | Moved into `forge-contracts/BoardLimitsDocument` (WP4.6) |
| `Timeline.ts` and `DependencyGraph.ts` are view models, not documents | `apps/forge/bridge/@types/Timeline.ts:18-82`, `DependencyGraph.ts` | Kept in the Bridge |
| The served board state: an index signature over the spread `status --json` document, `notices` and the Baton warning typed `unknown`, its own copy of `OverseerRuntimeState` | `apps/forge/src/services/overseer/BoardState.ts:36`, `:46`, `:137`, `:168-188`, `:357` | Changed: typed so it satisfies the contract (WP4.7, WP4.8) |
| The status document is built as an untyped `object` | `apps/forge/cli/StatusDocuments.ts:20`, `:41-63`, `:71` | Changed: a named type (WP4.7) |
| Gaia supports forge 1.1 and warns, never fails, while forge is ahead | `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:10`; `apps/gaia/src/testing/CheckSupportedForgeVersion.ts` | Kept (stage 6 raises it) |
| Gaia's guard that every workspace package it names is declared | `apps/gaia/src/WorkspaceDependencies.spec.ts` | Kept |

## Work packages

Every work package runs in its own worktree under `.claude/worktrees/<name>`, cut from `main` after the previous
package it depends on merged, and ends with a single commit: one plain subject line, no AI attribution, never
`--no-verify`. Every work package leaves `bun install --frozen-lockfile && bun run verify` green at the root.

Order and parallelism:

```
WP4.1 ──► WP4.2 ──► WP4.3 ──► WP4.4 ──► WP4.5 ┐
                                       ├─► WP4.6 ├─► WP4.8
                                       └─► WP4.7 ┘     ║
                                                    WP4.9 (beside WP4.8)
```

- WP4.1 to WP4.4 run **alone**, in this order. Each edits the same guards (`ImportDirection.spec.ts`,
  `ProjectIncludeLists.spec.ts`, `bridge/tsconfig.json`, `apps/forge/package.json`) and rewrites import lines in the
  same files, so two of them side by side conflict on nearly every file.
- **The importer rewrites are not split into parallel batches.** Each package's importers change in one scripted
  commit (WP4.2, WP4.3, WP4.6). A batch per folder would need the old path to keep working until the last batch lands,
  and the only way to keep it working is a re-export file at the old path, which the barrel guard refuses
  (`ImportDirection.spec.ts:432-434`) and the rules forbid ("No barrel files", `apps/forge/CLAUDE.md:36`). A script
  rewrites 989 lines in seconds and the typecheck proves it; six agents editing by hand would not be faster and would
  each leave the tree red.
- WP4.5, WP4.6 and WP4.7 may run **in parallel**. WP4.5 and WP4.6 both add `exports` entries and README rows to
  `packages/forge-contracts`; those are appended lines, so the second to merge rebases and keeps both. WP4.7 shares no
  file with them.
- WP4.8 runs after WP4.6 and WP4.7. WP4.9 touches documents only and may run beside WP4.8.

### WP4.1: Bring the model's spec helpers inside it

**Purpose.** After this package the tracker model's specs import nothing outside the model's folder, so the move in
WP4.2 is a pure relocation. Runs alone, first.

**Files.**

- Move (with `git mv`) to `apps/forge/src/lib/tracker-model/testing/`: `apps/forge/src/testing/BoardFixtures.ts`,
  `GreenQueue.ts`, `EveryBoardLogRecord.ts`, `SourceMutant.ts`. They are test helpers whose subject is the model, so
  they belong to the model's test folder.
- Create `apps/forge/src/lib/tracker-model/testing/ScratchFolder.ts`: the model's own scratch folders, under
  `<model folder>/.scratch/`, which the root `.gitignore` already ignores (`.scratch/`). It replaces forge's
  `ScratchWorkspace.ts` for `SourceMutant.ts`, which the package cannot import.
- Change: the model's specs that import the four helpers (46, 3, 2 and 1 files); the forge files outside the model that
  import `BoardFixtures.ts` (41), `GreenQueue.ts` (6) or `EveryBoardLogRecord.ts` (2), among them
  `apps/forge/src/testing/TrackerFileFixtures.ts` and `apps/forge/src/services/overseer/testing/AirlocksHarness.ts`;
  `apps/forge/src/lib/tracker-model/Playbook.spec.ts`, `Playbook.interleavings.spec.ts`, `Playbook.forecast.spec.ts`
  (module path strings); `apps/forge/src/ImportDirection.spec.ts:118`.

**What to do.**

1. Move the four helpers with `git mv`. Fix their own imports: they now reach the model by `../<file>` paths and each
   other by `./<file>`.
2. Write `ScratchFolder.ts` with two functions: `createScratchFolder(prefix: string): string` makes
   `<model folder>/.scratch/` if missing and returns `mkdtempSync(join(<that folder>, `${prefix}-`))`;
   `removeScratchFolder(folder: string): void` removes it recursively. The model folder is
   `join(import.meta.dir, '..')`. Use `node:fs` and `node:path` only.
3. In `SourceMutant.ts`, replace `createScratchDirectory` and `removeScratchDirectory` with the two functions above, and
   replace `REPOSITORY_ROOT` (`join(import.meta.dir, '..', '..')`) by `MODEL_FOLDER = join(import.meta.dir, '..')`.
   Rename the doc comment of `modulePath` to "From the model's folder, as `Playbook.ts`".
4. In the three Playbook specs, rewrite every module path string from `'src/lib/tracker-model/<path>'` to
   `'<path>'`, for example `POLICY_MODULE = 'Playbook.ts'`, `WORLD_MODULE = 'testing/LifecycleWorld.ts'`. Run
   `grep -rn "src/lib/tracker-model/" apps/forge/src/lib/tracker-model --include='*.spec.ts'` until it prints nothing.
5. Rewrite every importer of the three moved fixtures to the new relative path. Do it with a script that resolves each
   relative specifier and replaces it only when it resolves to a moved file; skip `node_modules`, `.forge`,
   `.forge-worktrees`, `.turbo`, `.scratch` and `.claude`.
6. Change `TESTING_FOLDER_IMPORTERS` at `ImportDirection.spec.ts:118` to
   `'src/lib/tracker-model/testing/': ['src/', 'cli/']`: forge's specs and test helpers under `src/` and `cli/` now
   import the model's fixtures, and the model's own specs are under `src/`.
7. Run `bun run lint:fix` in `apps/forge` for import order and alignment, then `bun run lint`.

**Specs to write or change.**

- No new spec. `Playbook.spec.ts`, `Playbook.interleavings.spec.ts` and `Playbook.forecast.spec.ts` must still watch
  each mutant fail: `SourceMutant.ts` throws when a mutant's text occurs other than once (`SourceMutant.ts:24-35`), so a
  wrong root fails loudly rather than passing.
- `ImportDirection.spec.ts` "every allowlist entry ... is still used" must stay green with the new entry.

**Done when.**

```
cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/lib/tracker-model/ ./src/ImportDirection.spec.ts
cd ../..                                                                             # the repository root from here on
grep -rln "src/testing/\(BoardFixtures\|GreenQueue\|EveryBoardLogRecord\|SourceMutant\)" apps/forge --include='*.ts' \
  --exclude-dir=node_modules --exclude-dir=.forge-worktrees --exclude-dir=.forge      # prints nothing
bun install --frozen-lockfile && bun run verify                                      # green
```

and `git status --porcelain` after the run shows no `.scratch` content (the folder is ignored and emptied).

### WP4.2: Move the tracker model into `packages/tracker-model`

**Purpose.** The model becomes the workspace package `tracker-model`, every forge importer names it, and the guards
hold the package where they held the folder. Runs alone; the largest package of the stage, since the rewrite and the
guard changes must land in one commit to stay green.

**Files.**

- Move: `apps/forge/src/lib/tracker-model/` to `packages/tracker-model/` with `git mv`, folder structure unchanged
  (`@types/`, `constants/`, `utils/`, `testing/`, top-level modules and specs).
- Create in `packages/tracker-model/`: `package.json`, `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js`,
  `README.md`, `PackageIsolation.spec.ts`, `PackageExports.spec.ts`, `ProjectIncludeList.spec.ts`, `LintRules.spec.ts`
  (contents under "Interfaces introduced", item 1). They are the files every package of this repository has; the
  three guard specs follow `packages/flint/PackageIsolation.spec.ts`, `packages/brand/PackageExports.spec.ts`,
  `packages/flint/ProjectIncludeList.spec.ts` and `packages/flint/LintRules.spec.ts`.
- Change: every importer found by the script (today 438 files under `apps/forge`); `apps/forge/package.json`;
  `bun.lock`; `apps/forge/bridge/tsconfig.json`; `apps/forge/eslint.config.js`;
  `apps/forge/src/ImportDirection.spec.ts`; `apps/forge/src/ProjectIncludeLists.spec.ts`;
  `apps/forge/src/PlatformBoundary.spec.ts`; `apps/forge/src/UtilShape.spec.ts`;
  `apps/forge/src/ProductNameLiterals.spec.ts`; `apps/forge/src/ClientNames.spec.ts`;
  `apps/forge/src/testing/ImportGraph.spec.ts`; `apps/forge/src/testing/RepositorySources.spec.ts`;
  `apps/forge/src/lib/talos/TalosClosure.spec.ts` (stage 2's); `apps/forge/CLAUDE.md`;
  `CLAUDE.md` (root); every document under `apps/forge/docs/` and `apps/forge/README.md` that names
  `src/lib/tracker-model/`; comments in forge files that name a model file.

**What to do.**

1. Write the rewrite script outside the repository (the session's scratch directory); it is not committed. It must:
   - walk `apps/forge` for `.ts` and `.tsx`, skipping `node_modules`, `.forge`, `.forge-worktrees`, `.turbo`, `.scratch`
     and `.claude`;
   - find every module specifier with TypeScript's scanner (`ts.preProcessFile(text, true, true).importedFiles`, which
     gives each specifier's position, and covers `import`, `export ... from`, `import type` and `import('...')`);
   - resolve each relative specifier against the importer's folder; when it lands in
     `apps/forge/src/lib/tracker-model/`, replace exactly that string literal with `tracker-model/<BaseName>` for a
     shipping module and `tracker-model/testing/<BaseName>` for a file of `testing/`, where `<BaseName>` is the file
     name without `.ts`;
   - collect the set of model files it rewrote to; that set is the `exports` map (step 3);
   - fail if two model files share a base name (none do today) or if a specifier resolves into the model's `testing/`
     outside `BoardFixtures`, `GreenQueue` and `EveryBoardLogRecord`.
   Run it once before the move to print its plan, then move, then run it for real.
2. `git mv apps/forge/src/lib/tracker-model packages/tracker-model`.
3. Write `packages/tracker-model/package.json` with one `exports` entry per file in the script's set (today 73 shipping
   files and the three helpers; the list is under "Interfaces introduced"). Nothing else is exported: the modules only
   the Board composes (`Decisions.ts`, `Jobs.ts`, `Drafts.ts` and the like) stay private to the package.
4. Add `"tracker-model": "workspace:^"` to `apps/forge/package.json` `dependencies`, in name order, then run
   `bun install` at the root (without `--frozen-lockfile`) once, so `bun.lock` gains the member; commit `bun.lock`.
5. Write the package's `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js`, `README.md` and four guard specs as
   specified under "Interfaces introduced", item 1.
6. In `apps/forge/bridge/tsconfig.json`, delete every include entry that starts with `../src/lib/tracker-model/`
   (`:30-137`), and rewrite the comment at `:10-11` to say the include list names the files the Bridge reaches outside
   its folder and outside the workspace packages it declares.
7. Change the guards:
   - `ImportDirection.spec.ts`: delete `'tracker-model-reaches-outside-itself'` from `ImportViolation` (`:34`),
     `TRACKER_MODEL_FOLDER` (`:161`), the model branch of `libFinding` (`:395-398`), the planted test (`:936-946`)
     and the tree test (`:1055-1057`); replace the `TESTING_FOLDER_IMPORTERS` entry with
     `'tracker-model/testing/': ['tracker-model/', 'src/', 'cli/']`; in `:624` expect
     `['brand', 'forge-contracts', 'system-versions', 'tracker-model']`; in the planted case at `:769-770` import
     `'../../../apps/forge/src/lib/json-record/JsonRecordUtil.ts'` instead and expect the sentence naming
     `src/lib/json-record/JsonRecordUtil.ts`; add a planted case that `src/lib/json-record/PlantedStep.ts` importing
     `tracker-model/Board` is `layer-imports-upward` (lib reaches only lib) and that `src/shared/PlantedValue.ts`
     importing `'../lib/tracker-model/Board.ts'` is `import-leaves-the-program` or `workspace-package-reached-by-path`,
     whichever the guard names for a path that no longer exists (read the finding and pin it).
   - `ProjectIncludeLists.spec.ts`: delete `TRACKER_MODEL_FOLDER` (`:35`), the field `wholePackageFolders` and its use
     (`:28`, `:40`, `:71`), the model floor in the scan test (`:91`, and rename the test to "it finds the Bridge's reach
     outside its folder"), and the planted test "a tracker model module no Bridge module imports" (`:119-124`); expect
     `['brand/', 'design-system/', 'flint/', 'forge-contracts/', 'system-versions/', 'tracker-model/']` at `:96`.
   - `PlatformBoundary.spec.ts:110`: the key becomes
     `'tracker-model/utils/NetworkDomainUtil.ts: search-path-separator: ...'` with the same line text.
   - `UtilShape.spec.ts:59`: add `'tracker-model/'`.
   - `ProductNameLiterals.spec.ts:20`: add `'tracker-model/'` to `SCANNED_FOLDERS`, and update the header sentence
     (`:4`) that names the folders.
   - `ClientNames.spec.ts:26`: lower `SMALLEST_SHIPPED_FILE_COUNT` to `800`, still "comfortably under today's count"
     after this stage removes about 125 shipped files from forge (Traps).
   - `ImportGraph.spec.ts:68`: add `['tracker-model', 100]`.
   - `RepositorySources.spec.ts:86-87`: the test name and the expected list gain `tracker-model`.
   - `src/lib/talos/TalosClosure.spec.ts`, its forbidden folders (carried from `WatcherBundleClosure.spec.ts:22` by
     stage 2): `'tracker-model/'` in place of `'src/lib/tracker-model/'`, so Talos still never reaches the model.
   - `apps/forge/eslint.config.js:88`: delete the line.
8. Rewrite every remaining mention of `src/lib/tracker-model/` in comments and documents to `packages/tracker-model/`:
   `grep -rln "src/lib/tracker-model" apps/forge CLAUDE.md --exclude-dir=node_modules --exclude-dir=.forge
   --exclude-dir=.forge-worktrees`. The citation guard (`DocumentSpecCitations.spec.ts`) resolves a path from the
   workspace root, so `packages/tracker-model/Playbook.spec.ts` is a valid citation.
9. Change the rules, in the same commit:
   - `apps/forge/CLAUDE.md:59-62`: the diagram gains a line
     `packages/tracker-model/  →  src/shared/ and every layer above it, bridge/ (by name)`.
   - `:65-67`: drop "and the tracker model's isolation" from what `ImportDirection.spec.ts` holds; add that
     `packages/tracker-model/PackageIsolation.spec.ts` holds the model's isolation.
   - `:71`: becomes "`packages/tracker-model/` stays DOM-safe: its `tsconfig.json` compiles it with the DOM library and
     no Bun or Node types."
   - `:221-224`: the Bridge's include list no longer holds "the whole tracker model".
   - `:333` (Deviations): "The tracker model's `Board` throws `BoardRefusal`" stays, naming `packages/tracker-model/`.
   - Root `CLAUDE.md:17`: `packages/tracker-model` joins the packages that are forge's; `:27`: forge's reach names
     `/packages/tracker-model`.
10. Run `bun run lint:fix` in `apps/forge` and in `packages/tracker-model`, then `bun run verify` at the root, and fix
    what remains by hand.

**Specs to write or change.**

- `packages/tracker-model/PackageIsolation.spec.ts`: proves its scan read the package (it finds `Board.ts` and
  `README.md`), then that no module imports outside the folder, no shipping module imports a `bun:` or `node:` module or
  any package, a spec imports only `bun:test` and its own folder, a file of `testing/` imports only `bun:test`,
  `node:fs`, `node:path` and its own folder, and no file names a client word (`gaia`, `fleet`). Each form planted.
- `packages/tracker-model/PackageExports.spec.ts`: every `exports` entry names a file that exists; every key is
  `./<BaseName>` of its target, or `./testing/<BaseName>` for the three helpers; no entry names a spec; no two entries
  name one file.
- `packages/tracker-model/ProjectIncludeList.spec.ts`: each `include` list names only the package's own folder.
- `packages/tracker-model/LintRules.spec.ts`: each rule the package's `eslint.config.js` adds is watched failing on a
  planted form (a `Date.now()` and a `new Date()` in a shipping module, a magic number outside `constants/`, a `TODO`
  comment, a non-null assertion) and passing on its exception (a magic number in `constants/`, a `new Date()` in a
  spec).
- The changed forge guards above, each still proving its scan and still failing on its planted forms.

**Done when.**

```
cd packages/tracker-model && bun run typecheck && bun run lint && bun test
cd ../../apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/ImportDirection.spec.ts \
  ./src/ProjectIncludeLists.spec.ts ./src/PlatformBoundary.spec.ts ./src/DocumentSpecCitations.spec.ts \
  ./src/ClientNames.spec.ts ./src/UtilShape.spec.ts ./src/ProductNameLiterals.spec.ts
cd ../..                                                                                # the repository root from here on
test ! -e apps/forge/src/lib/tracker-model
grep -rn "src/lib/tracker-model" apps/forge CLAUDE.md --exclude-dir=node_modules --exclude-dir=.forge \
  --exclude-dir=.forge-worktrees                                                        # prints nothing
bun install --frozen-lockfile && bun run verify                                        # at the root, green
```

### WP4.3: Move the board readings into `packages/board-readings`

**Purpose.** The pure readings that the Overseer and the views both compute become the workspace package
`board-readings`, as stage 0 named it. Runs alone, after WP4.2.

**Files.**

- Move with `git mv` (destination in `packages/board-readings/`):
  - `apps/forge/src/shared/monitor/@types/MonitorSnapshot.ts` to `@types/MonitorSnapshot.ts`;
  - `apps/forge/src/shared/monitor/AttentionEntries.ts` and `.spec.ts`, `TodayFigures.ts` and `.spec.ts` to the root;
  - `apps/forge/src/shared/monitor/utils/BridgeFragmentUtil.ts`, `DraftWordingUtil.ts`, `NoticeWordingUtil.ts`,
    `OpenDecisionsUtil.ts` and their specs to `utils/`;
  - `apps/forge/src/lib/token-count/TokenCountUtil.ts`, `apps/forge/src/lib/local-time/LocalTimeUtil.ts`,
    `apps/forge/src/lib/html-escape/HtmlEscapeUtil.ts` and their specs to `utils/`;
  - `apps/forge/src/shared/constants/TimestampSlices.ts` to `constants/TimestampSlices.ts` ("Needs the owner",
    item 3).
- Create in `packages/board-readings/`: `package.json`, `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js`,
  `README.md`, `PackageIsolation.spec.ts`, `PackageExports.spec.ts`, `ProjectIncludeList.spec.ts` (contents under
  "Interfaces introduced", item 2).
- Change: every importer the script finds (about 70 files in `bridge/`, `cli/`, `src/services/`, `src/adapters/`);
  `apps/forge/package.json`; `bun.lock`; `apps/forge/bridge/tsconfig.json`; `apps/forge/src/ImportDirection.spec.ts`;
  `apps/forge/src/ProjectIncludeLists.spec.ts`; `apps/forge/src/UtilShape.spec.ts`;
  `apps/forge/src/ProductNameLiterals.spec.ts`; `apps/forge/src/testing/ImportGraph.spec.ts`;
  `apps/forge/src/testing/RepositorySources.spec.ts`; `apps/forge/src/lib/claude-code/ClaudeTranscripts.ts:5`;
  `apps/forge/src/services/overseer/MonitorSnapshotAssembly.spec.ts`; `apps/forge/CLAUDE.md`; root `CLAUDE.md`; the two
  documents that name `src/shared/monitor`.

**What to do.**

1. Reuse WP4.2's script with a new mapping: each moved file to `board-readings/<BaseName>`. Base names are unique.
2. Move the files. Inside the package:
   - `@types/MonitorSnapshot.ts:22`: import `OVERSEER_CONTRACT_VERSIONS` as a type from
     `forge-contracts/OverseerContractVersions` and write `monitorVersion: typeof OVERSEER_CONTRACT_VERSIONS.monitor` at
     `:127`. The value is the same: `SERVED_CONTRACT_VERSIONS.monitor` is `OVERSEER_CONTRACT_VERSIONS.monitor`
     (`apps/forge/src/shared/constants/OverseerApiContracts.ts:14`).
   - `TodayFigures.ts` and its spec import `./constants/TimestampSlices.ts`.
   - Model types are already `tracker-model/<Name>` after WP4.2.
   - `utils/NoticeWordingUtil.spec.ts`: keep the half of the claim at `:52` that no sentence holds a backtick; delete
     the `PRODUCT_NAMES` import (`:10`) and the program-name half. Add that half to
     `apps/forge/src/services/overseer/MonitorSnapshotAssembly.spec.ts`, which builds notices through the util:
     "no notice sentence names the program" with `PRODUCT_NAMES.PROGRAM`.
3. Add `"board-readings": "workspace:^"` to `apps/forge/package.json` and run `bun install` once; commit `bun.lock`.
4. Carry out "Needs the owner" item 2 for `src/lib/claude-code` (default: a lib package may reach a workspace package
   its main module's header names):
   - `ImportDirection.spec.ts:90`: `'lib': ['lib', 'workspace-package']`.
   - Next to `LIB_PACKAGE_REFERENCE` (`:168`) add `WORKSPACE_PACKAGE_REFERENCE = /the workspace package `([a-z-]+)`/g`;
     `declaredLibDependenciesOf` (`:292-304`) reads both kinds of reference into one list.
   - `libFinding` (`:392-402`): an edge from a lib package to a path in a workspace package is
     `lib-imports-an-undeclared-package` unless the header names that package; the sentence says
     "the header of src/lib/<name>/'s main module does not name the workspace package <package>".
   - `unusedAllowancesOf` (`:553-560`) also reports a named workspace package that the lib package does not import.
   - `ClaudeTranscripts.ts:5`: "The package depends on `src/lib/agent-launch`, `src/lib/atomic-file`, `src/lib/git`
     and `src/lib/json-record`, and on the workspace package `board-readings`." Expect at `:647`
     `['agent-launch', 'atomic-file', 'git', 'json-record', 'board-readings']` (or split the expectation into lib and
     workspace references, as the implementation returns them).
   - Planted cases: replace `:835-837` (a lib file importing `forge-contracts` is no longer `layer-imports-upward`) by
     two cases on `src/lib/json-record/PlantedStep.ts`: importing `forge-contracts/ForgeSystemVersions` with no header
     naming it is `lib-imports-an-undeclared-package`; with a planted main-module header naming it, no finding.
   - Planted case in `unusedAllowancesOf`'s test (`:974-992`): a header naming a workspace package the lib package does
     not import is reported.
   If the owner chose another answer, do that instead and leave `ImportDirection.spec.ts:90` as it is.
5. `apps/forge/bridge/tsconfig.json`: delete the entries for `TimestampSlices.ts`, the seven files of
   `src/shared/monitor/` and the three lib utils (`:19-29` today).
6. Guards: `ImportDirection.spec.ts:624` gains `'board-readings'`; `ProjectIncludeLists.spec.ts:96` gains
   `'board-readings/'`, and the planted test at `:112-117` removes `'../src/shared/constants/DispatchProtocol.ts'`
   instead of the HTML-escape util and expects that sentence; `UtilShape.spec.ts:59` and
   `ProductNameLiterals.spec.ts:20` gain `'board-readings/'`; `ImportGraph.spec.ts:68` gains `['board-readings', 8]`;
   `RepositorySources.spec.ts:86-87` gains `board-readings`.
7. Rules and documents: `apps/forge/CLAUDE.md:62` names `packages/board-readings/` among the packages reached by name
   from `src/shared/` up and from `src/lib/claude-code` through its header; root `CLAUDE.md:17` and `:27` name it;
   rewrite the two mentions of `src/shared/monitor` under `apps/forge/docs/` to `packages/board-readings/`.
8. `bun run lint:fix` in `apps/forge` and the package, then `bun run verify` at the root.

**Specs to write or change.**

- `packages/board-readings/PackageIsolation.spec.ts`: proves its scan, then that a module imports only its own folder,
  `tracker-model/` and `forge-contracts/`; no shipping module imports a `bun:` or `node:` module; a spec imports only
  `bun:test`, its own folder and those two packages; no file names a client word. Each form planted.
- `packages/board-readings/PackageExports.spec.ts` and `ProjectIncludeList.spec.ts`: as in WP4.2.
- `MonitorSnapshotAssembly.spec.ts`: the new case "no notice sentence names the program", watched failing on a planted
  sentence that contains `${PRODUCT_NAMES.PROGRAM} `.
- `ImportDirection.spec.ts`: the planted cases of step 4.

**Done when.**

```
cd packages/board-readings && bun run typecheck && bun run lint && bun test
cd ../../apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/ImportDirection.spec.ts \
  ./src/ProjectIncludeLists.spec.ts ./src/services/overseer/MonitorSnapshotAssembly.spec.ts
cd ../..                                                                                # the repository root from here on
test ! -e apps/forge/src/shared/monitor && test ! -e apps/forge/src/lib/local-time
bun install --frozen-lockfile && bun run verify                                        # at the root, green
```

### WP4.4: Open the contract to the model, raise the system version, serve the state at v1

**Purpose.** `forge-contracts` may name the model's types, forge's system version rises by one minor for everything
this stage adds to the contract, and the board state is served at `GET /api/v1/state`. Runs alone, after WP4.3; it is
small.

**Files.**

- Change: `packages/forge-contracts/package.json`, `PackageIsolation.spec.ts`, `constants/ForgeSystemVersions.ts`,
  `constants/ForgeCompatibilityRegistry.ts`, `constants/ForgeCompatibilityRegistry.spec.ts`, `README.md`;
  `apps/forge/src/ImportDirection.spec.ts:630`; `apps/forge/src/services/overseer/OverseerServer.spec.ts`;
  `apps/forge/docs/reference/overseer-api.md` (sections "System versions" and "Versioned paths", today `:629-668`);
  `bun.lock`.

**What to do.**

1. `packages/forge-contracts/package.json`: add `"tracker-model": "workspace:^"` to `dependencies`; raise `version` by
   one minor (the README's rule, `README.md:39-42`: a system minor is a package minor). Run `bun install`; commit
   `bun.lock`.
2. `ForgeSystemVersions.ts`: raise `current.minor` by one over what stage 3 left. Call that version **S4** below. Add
   one sentence to the docblock: S4 adds the board state at `/api/v1/state`, the board documents and the board command
   kinds, which only adds.
3. `ForgeCompatibilityRegistry.ts`: with the helper `endpointAddedIn(endpoint, version, introducedIn)` that stage 3
   added for `presence` (stage 3, WP3.12), add the entry `endpointAddedIn('state', 1, S4)`.
4. `ForgeCompatibilityRegistry.spec.ts`: `CURRENT_ENDPOINTS` gains `'endpoint state at v1'`; correct the header sentence
   that says the endpoints are the same since 1.0. Add the claim that a client built for the forge version before S4
   is served no `state` endpoint, and one built for S4 calls it at version 1.
5. `PackageIsolation.spec.ts` of `forge-contracts`: a module may import from `tracker-model/` only with `import type`.
   `preProcessFile` cannot tell a type-only import, so read each source with `typescript.createSourceFile` and check
   `importClause.isTypeOnly`, or each specifier's `isTypeOnly` when the clause is not. Plant a value import from
   `tracker-model/GatePhase` (refused) and a type-only one (passes).
6. `ImportDirection.spec.ts:630`: expect `['system-versions', 'tracker-model']`.
7. `OverseerServer.spec.ts`: `GET /api/v1/state` with the bearer token answers 200 with the body `GET /api/state`
   answers; `GET /api/v2/state` answers 404 `not-found`; without the token, 401. The route needs no code: the server
   serves every registry endpoint at its version (`OverseerServer.ts:600-619`).
8. `overseer-api.md`: the system version section names S4 and what it adds; the versioned paths table gains
   `| state | GET /api/v1/state |`.

**Specs to write or change.** As in steps 4, 5 and 7: the registry agrees with the versions, and the raise report still
lists exactly what forge keeps for clients before system versions; the contract imports the model only as types; the
versioned state path answers as the unversioned one.

**Done when.**

```
cd packages/forge-contracts && bun run typecheck && bun run lint && bun test
cd ../../apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/OverseerServer.spec.ts \
  ./src/ImportDirection.spec.ts
cd ../gaia && bun run check          # prints the warning that Gaia supports an older forge, and exits 0
cd ../.. && bun install --frozen-lockfile && bun run verify                            # green
```

### WP4.5: The board commands join the contract

**Purpose.** Every command kind the Bridge sends is in `forge-contracts`, declared once, and forge's own command union
takes those members from the package. Parallel with WP4.6 and WP4.7.

**Files.**

- Create `packages/forge-contracts/@types/BoardCommand.ts` (contents under "Interfaces introduced", item 4): the board
  commands as the contract spells them, beside `ForgeControlCommand.ts`.
- Create `apps/forge/cli/overseer/routes/CommandRoute.boardContract.spec.ts`: the pin of the board kinds, beside the pin
  of the control contract (`CommandRoute.controlContract.spec.ts`).
- Create `apps/forge/bridge/CommandKindsInContract.spec.ts`: a Bridge guard at the Bridge's root, like
  `bridge/StyleContract.spec.ts`, since it reads the Bridge's sources.
- Change: `packages/forge-contracts/package.json` (`exports`), `README.md` (exports table, `:7-17`);
  `apps/forge/src/shared/@types/ControlCommand.ts`; `apps/forge/src/shared/constants/OverseerApiContracts.ts`;
  `apps/forge/docs/reference/overseer-api.md` (section "Commands", today `:165-235`).

**What to do.**

1. Measure the kinds first. List every `ControlCommandKind` (`ControlCommand.ts:66-226`) that appears as the value of a
   `kind` property in an object literal in a shipping file of `apps/forge/bridge/` (not `*.spec.ts`, not `*.dom.tsx`,
   not `testing/`). Use the TypeScript AST, not a text search: a `case 'pipeline-gates-none':` in
   `bridge/views/pipeline/live/FlowActivityPanelModel.ts:150` names a log record, not a command. Subtract the kinds of
   `CONTROL_CONTRACT_KINDS` (`OverseerApiContracts.ts:26-36`, plus what stage 3 added). At `3e6cb660` the result is the
   34 kinds of "Interfaces introduced", item 4; use the measured list if it differs, and record the difference in the
   commit's body.
2. Write `BoardCommand.ts`: `ChartRangeRequest`, `TrackerClearScope` and `PipelineFieldEdit` move here from
   `ControlCommand.ts:37-40` and `:49-55`; `ForgeBoardCommand` is the union of the measured kinds with the fields of
   `ControlCommand.ts`, every field `readonly` and every array `readonly`, the model's types imported with `import type`
   from `tracker-model/<Name>`, and `job-stop`'s mode as `ForgeJobStopMode` from `./ForgeControlCommand.ts`.
3. Add `"./BoardCommand": "./@types/BoardCommand.ts"` to `exports` and a row to the README's table.
4. `ControlCommand.ts`: delete the members of the measured kinds from `ControlCommand` and add
   `| ForgeBoardCommand` to the union; import `ChartRangeRequest`, `TrackerClearScope` and `PipelineFieldEdit` from
   `forge-contracts/BoardCommand` (`ProposedFieldEdit` stays and extends the imported `PipelineFieldEdit`). Where the
   typecheck then fails because an applier passes a `readonly` array to a parameter typed as a mutable array, widen
   that parameter to `readonly string[]` (or the readonly form of its type); never cast, never drop `readonly` from the
   contract.
5. `OverseerApiContracts.ts`: add `BOARD_COMMAND_CONTRACT_KINDS`, the measured kinds in the order of
   "Interfaces introduced", `as const satisfies readonly ForgeBoardCommand['kind'][]`, and correct the docblock of
   `CONTROL_CONTRACT_KINDS` (`:21-25`): every kind in neither list may change without raising the system version.
6. `overseer-api.md`: a subsection "Board commands" under "Commands" listing the kinds and saying they are part of the
   contract from S4, under `controlVersion` 1 like every other answer of the route.

**Specs to write or change.**

- `CommandRoute.boardContract.spec.ts`, its docblock saying which cases matter:
  - `BOARD_COMMAND_CONTRACT_KINDS` covers `ForgeBoardCommand['kind']` exactly, both ways: a type-level check
    (`[Exclude<ForgeBoardCommand['kind'], (typeof BOARD_COMMAND_CONTRACT_KINDS)[number]>] extends [never]`) annotated
    `true`, and a runtime comparison against the keys of a `Record<ForgeBoardCommand['kind'], true>`;
  - no kind is in both lists (`CONTROL_CONTRACT_KINDS` and `BOARD_COMMAND_CONTRACT_KINDS`);
  - for each kind, `Extract<ForgeBoardCommand, { kind: K }>` is assignable to `OverseerApiCommandOf<K>`, which the
    typecheck holds;
  - one board kind applied through `answerControlCommand` answers 200 `{controlVersion: 1, outcome, result}` on a
    scratch board, reusing the setup of `CommandRoute.controlContract.spec.ts:20-33` (`ticket-priority` on a filed
    ticket, outcome `done`), and a body of that kind with no `ticketReference` answers 400 `malformed-body`.
- `bridge/CommandKindsInContract.spec.ts`: every command kind a shipping Bridge file sends, read from object literals as
  in step 1, is in `CONTROL_CONTRACT_KINDS` or `BOARD_COMMAND_CONTRACT_KINDS`. It proves its scan (it finds
  `overseer-pause` in `bridge/shell/Header.tsx` and at least 30 kinds), and plants a file sending `ticket-add` (refused)
  and one with `case 'pipeline-gates-none':` (passed). This guard keeps the contract growing with each view that stage 6
  moves.

**Done when.**

```
cd packages/forge-contracts && bun run typecheck && bun test
cd ../../apps/forge && bun test --path-ignore-patterns='.claude/**' ./cli/overseer/routes/ \
  ./bridge/CommandKindsInContract.spec.ts
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # at the root, green
```

### WP4.6: The board documents join the contract

**Purpose.** The documents the Bridge's views read are `forge-contracts` types, imported by the Bridge by name, with
Flint's brain and the Bridge's identity view left in the Bridge. Parallel with WP4.5 and WP4.7.

**Files.**

- Move with `git mv` from `apps/forge/bridge/@types/` to `packages/forge-contracts/@types/`:
  `BoardStateDocument.ts`, `ConversationDocuments.ts`, `DetailBoardState.ts`, `EpicsBoardState.ts`,
  `KanbanBoardState.ts`, `ProgressBoardState.ts`, `TicketsBoardState.ts`.
- Create `packages/forge-contracts/@types/BoardLimitsDocument.ts`: the page payload's `limits` fields the documents
  name, which today sit in a Bridge util and a Bridge view model.
- Create `apps/forge/bridge/@types/FlintBrainBoardState.ts` and `apps/forge/bridge/@types/OverseerIdentity.ts`: what
  stays the Bridge's own (contents under "Interfaces introduced", item 5).
- Change: `apps/forge/bridge/utils/TimeUtil.ts` (delete `TimestampSlices` and `DurationUnits`, `:12-24`, and import them
  as types from the contract); `apps/forge/bridge/@types/Timeline.ts` (delete `TimelineLimits`, `:4-16`, import it);
  every importer of the moved documents (131 files today), of `TimestampSlices` or `DurationUnits` from `TimeUtil.ts`
  (47 files mention them), and of `TimelineLimits`; the Bridge files that read `flintBrain` (8 shipping files) or
  `OverseerIdentity`; `packages/forge-contracts/package.json` (`exports`) and `README.md`.

**What to do.**

1. Move the seven files. In the moved `BoardStateDocument.ts`: delete the `flintBrain` field (`:188-189`),
   `FlintBrainBoardFactsDocument` (`:192-196`), `OverseerIdentity` (`:198-203`) and the imports they need
   (`:2`, `:15`); import `TimestampSlices` from `./BoardLimitsDocument.ts` (replacing `:16`). In every moved file, the
   model types are `import type` from `tracker-model/<Name>` (WP4.2 already wrote them so), `TimestampSlices`,
   `DurationUnits` and `TimelineLimits` come from `./BoardLimitsDocument.ts`, and a reference to another moved file
   stays relative (`./BoardStateDocument.ts`).
2. Write `BoardLimitsDocument.ts` with `TimestampSlices` and `DurationUnits` (verbatim from `TimeUtil.ts:12-24`) and
   `TimelineLimits` (verbatim from `Timeline.ts:4-16`).
3. Write `bridge/@types/FlintBrainBoardState.ts`: `FlintBrainBoardFactsDocument` as it was, its runs typed by
   `TodayFlintBrainRun` from `board-readings/TodayFigures`, and `FlintBrainBoardState` (the field). Every Bridge module
   that reads `state.flintBrain` takes `BoardStateDocument & FlintBrainBoardState`; the shell's state holder
   (`grep -rn "flintBrain" apps/forge/bridge`) declares that intersection once and hands it on.
4. Write `bridge/@types/OverseerIdentity.ts` with the interface as it was; point its importers there.
5. Rewrite every importer with a script: a specifier resolving to a moved file becomes `forge-contracts/<BaseName>`; an
   import from `TimeUtil.ts` or `Timeline.ts` that names `TimestampSlices`, `DurationUnits` or `TimelineLimits` is split
   so those names come from `forge-contracts/BoardLimitsDocument` with `import type`, and the rest stays.
6. Add the eight entries to `exports` (`./BoardStateDocument`, `./BoardLimitsDocument`, `./ConversationDocuments`,
   `./DetailBoardState`, `./EpicsBoardState`, `./KanbanBoardState`, `./ProgressBoardState`, `./TicketsBoardState`) and
   eight README rows: "the board state of `GET /api/v1/state` and the `board` event, as far as a view reads it" and the
   like.
7. Reword "the Bridge" in the moved docblocks to "a view" where the sentence describes the contract (the package
   speaks of its readers neutrally; `packages/forge-contracts/README.md:3-5`). No client word may appear.
8. `bun run lint:fix` in `apps/forge` and `packages/forge-contracts`.

**Specs to write or change.** No new spec: the Bridge's model specs and DOM specs are the proof that the views read the
same shapes, and WP4.8 proves the server sends them. `forge-contracts/PackageIsolation.spec.ts` must pass on the moved
files (type-only model imports, no client word).

**Done when.**

```
cd packages/forge-contracts && bun run typecheck && bun run lint && bun test
cd ../../apps/forge && bun run typecheck && bun run test:dom
cd ../..                                                                                # the repository root from here on
ls apps/forge/bridge/@types      # DependencyGraph.ts FlintBrainBoardState.ts OverseerIdentity.ts Timeline.ts
bun install --frozen-lockfile && bun run verify                                        # at the root, green
```

### WP4.7: Type the status document that the board state spreads

**Purpose.** The `status --json --full` document has a named type, so the board state's fields that come from it
(`project`, `concurrency`, `confinement` and the rest) are typed rather than reached through `unknown`. Parallel with
WP4.5 and WP4.6.

**Files.**

- Create `apps/forge/src/adapters/@types/StatusDocument.ts`: the type sits in the adapters layer because its fields are
  the return types of adapter utils (`StatusDocumentUtil`, `ProgressFileMappingUtil`, `TicketJsonUtil`), which
  `src/shared/` cannot import; `cli/` and `src/services/overseer/` can.
- Change: `apps/forge/cli/StatusDocuments.ts` (`:20`, `:41-63`); `apps/forge/src/services/overseer/BoardState.ts`
  (`:137`, `:168-169`, `:357`); every reader of a field of `BoardState` through its index signature.

**What to do.**

1. Write `FullStatusDocument` with one key per key that `fullDocumentOf` writes (`StatusDocuments.ts:47-62`): the keys
   of `ProgressFileMappingUtil.wordedDocumentOf`'s result, `tickets`, `epics`, `drafts`, `concurrency`, `readyTickets`,
   the keys of `StatusDocumentUtil.boardWorkOf`, `tokensByOwner`, `ticketCountByStatus`, the keys of
   `StatusDocumentUtil.jobsOf` and `StatusDocumentUtil.decisionsAndIncidentsOf`, `confinement`, `confinementSource`,
   `pipelineIsSet`. Type each by its producer (`ReturnType<typeof StatusDocumentUtil.boardWorkOf>` and the like); give
   `derivedDocumentOf`'s `concurrency` (`:20`, typed `object` today) its real type.
2. `fullDocumentOf` returns `FullStatusDocument`. `workingDocumentOf` (`:71`) keeps `object`: the board state does not
   spread it.
3. `BoardStateReading.statusDocument` (`BoardState.ts:137`) becomes `FullStatusDocument`. Replace the index signature
   (`:169`) by extending `Omit<FullStatusDocument, <the keys BoardState declares itself>>`.
4. Fix every reader that read an undeclared field through the index signature; the typecheck lists them.

**Specs to write or change.** `apps/forge/cli/StatusDocuments.spec.ts` if it exists, else the spec of the `status`
command that prints `--json --full`: the printed document's keys equal the keys `FullStatusDocument` names, both ways,
read from a scratch board (a frozen key list taken from today's output, with a comment saying how to retake it).
`BoardState.spec.ts` keeps passing unchanged.

**Done when.**

```
cd apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/BoardState.spec.ts \
  ./cli/tracking/status/
cd ../..                                                                                # the repository root from here on
grep -n "\[statusField: string\]" apps/forge/src/services/overseer/BoardState.ts       # prints nothing
bun install --frozen-lockfile && bun run verify                                        # at the root, green
```

### WP4.8: The served board state satisfies the contract

**Purpose.** A spec holds, at compile time, that what the Overseer serves at `/api/v1/state` is each document of the
contract, so the documents can no longer drift from the server as the Bridge's mirrors could. Runs after WP4.6 and
WP4.7; WP4.9 may run beside it.

**Files.**

- Create `apps/forge/src/services/overseer/BoardState.documents.spec.ts`: a second suite of `BoardState.ts`, named for
  its aspect (`<Module>.<aspect>.spec.ts`).
- Change: `apps/forge/src/services/overseer/BoardState.ts` and the producers of the fields the spec finds untyped; a
  contract document where it claims a field the server never sends, and that document's Bridge readers.

**What to do.**

1. Write the spec with a type-level helper `type Satisfies<Served, Document> = Served extends Document ? true : false;`
   and one annotated constant per document: `BoardStateDocument`, `ConversationBoardDocument`, `DetailBoardState`,
   `EpicsBoardState`, `KanbanBoardState`, `ProgressBoardState`, `TicketsBoardState`, each written as
   `const servedStateIsTheKanbanDocument: Satisfies<BoardState, KanbanBoardState> = true` and the like. One `test`
   per document asserts the constant, so the run names each claim; the typecheck is the proof.
2. Run `bun run typecheck` and fix each error on the server's side, by typing the server's field with the document's
   type or a type it satisfies. Known from reading:
   - `OverseerFacts.batonPassWarning: unknown` (`BoardState.ts:46`) against `BatonPassWarningDocument | null`
     (contract `BoardStateDocument.ts`, today `bridge/@types/BoardStateDocument.ts:25-29`, `:35`): type the field with
     the record the Baton pass writes.
   - `notices: unknown[]` (`BoardState.ts:174`) against `readonly NoticeDocument[]` (`:39-42` of the same file): type
     the notices with their record type.
   - `OverseerRuntimeState` is declared twice (`BoardState.ts:36` and the contract's `BoardStateDocument.ts`): delete
     the server's and import the contract's.
   - The fields that came through the index signature are typed after WP4.7.
3. Where a document names a field the server never sends (the type check says so), correct the document and the Bridge
   code that read it, in the same commit; never widen a contract field to `unknown`, never cast.

**Specs to write or change.** `BoardState.documents.spec.ts`, its docblock: "What matters: the served board state is
each document a view reads, so a change on either side fails the typecheck." It needs no planted case: a planted
mismatch is a compile error, which the typecheck already watches; say so in the docblock.

**Done when.**

```
cd apps/forge && bun run typecheck && bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/BoardState.documents.spec.ts
cd ../.. && bun install --frozen-lockfile && bun run verify                                        # at the root, green
```

### WP4.9: The documents that describe the packages

**Purpose.** The prose outside the rules files says where the model, the readings and the documents live. Documents
only; may run beside WP4.8.

**Files.**

- Change: `docs/monorepo/design.md` (the package layout, `:35-45`, and the paragraph on `forge-contracts`,
  `:114-116`); `apps/forge/docs/development/guards-and-testing.md` (the import-direction and include-list guards, the
  tracker model's isolation, now the package's); `apps/forge/docs/reference/overseer-api.md` (section "BoardState",
  today `:364` and on: the documents are `forge-contracts` types); `apps/forge/README.md` (its one mention of the
  model); the READMEs of `tracker-model`, `board-readings` and `forge-contracts` if a work package left a row out.

**What to do.** State each fact once and point to its source of truth (the package README for what a package holds,
`overseer-api.md` for routes and versions). Do not edit `docs/monorepo/hephaestus-talos.md`: it is the design record,
which stage 0 corrects.

**Specs to write or change.** None. `DocumentSpecCitations.spec.ts` and the prose-wrap guard
(`apps/forge/src/ProseWrap.spec.ts`, for the forge files it covers) must stay green.

**Done when.** `cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/DocumentSpecCitations.spec.ts
./src/ProseWrap.spec.ts` passes, and `bun install --frozen-lockfile && bun run verify` is green at the root.

## Interfaces introduced

### 1. The package `tracker-model`

Folder `packages/tracker-model/`, every file of today's `apps/forge/src/lib/tracker-model/` at the same relative path,
plus `testing/ScratchFolder.ts` and the three fixtures WP4.1 moved.

`package.json`:

```json
{
  "name": "tracker-model",
  "version": "0.1.0",
  "description": "A forge board's model: its records, the Board that changes them, the Playbook that decides the next steps, and the vocabulary they are written in",
  "type": "module",
  "engines": { "bun": "1.4.2" },
  "files": ["@types", "constants/*.ts", "!constants/*.spec.ts", "utils/*Util.ts", "*.ts", "!*.spec.ts", "README.md"],
  "exports": { "...": "one entry per file below" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.spec.json",
    "lint": "eslint . --cache --cache-strategy content --cache-location node_modules/.cache/lint/",
    "lint:fix": "eslint . --cache --cache-strategy content --cache-location node_modules/.cache/lint/ --fix",
    "test": "bun test"
  }
}
```

No `dependencies`. No `verify` script: the root runs the tasks through turbo.

`exports`: key `./<BaseName>`, value `./<path>`, for exactly the files forge imports from outside the package. At
`3e6cb660` these 73 files (WP4.2's script computes the final list, which grows by what stages 2 and 3 added and
forge imports):

```
@types/BoardChanges.ts @types/Decision.ts @types/Draft.ts @types/Epic.ts @types/GatePhase.ts @types/GateProfile.ts
@types/Incident.ts @types/Job.ts @types/LaunchSlots.ts @types/LifecycleLimits.ts @types/LogRecord.ts
@types/OptionConsequences.ts @types/Pipeline.ts @types/PipelineFacts.ts @types/PipelineSetup.ts @types/PlaybookStep.ts
@types/ReviewRecord.ts @types/ReviewRound.ts @types/Task.ts @types/Ticket.ts @types/TicketForecast.ts
@types/TrackerProgress.ts
AirlockClaims.ts Board.ts BoardRefusal.ts EmptyProgress.ts JobControls.ts Logger.ts Playbook.ts ReadingBoard.ts
ReviewStatistics.ts
constants/AgentSettings.ts constants/ChangeSizeBuckets.ts constants/ConcurrencyLimits.ts
constants/DecisionAndIncidentVocabulary.ts constants/DraftFields.ts constants/EpicFields.ts
constants/FlintBrainVocabulary.ts constants/GateProfileVocabulary.ts constants/JobMoveLegality.ts constants/JobStates.ts
constants/JobStopHolds.ts constants/LogRecordSchema.ts constants/OverseerStates.ts constants/PictureIdPattern.ts
constants/PipelineDefaults.ts constants/PipelineSetupVocabulary.ts constants/ReviewRecordVocabulary.ts
constants/ReviewRounds.ts constants/Statuses.ts constants/TaskIds.ts constants/TicketFields.ts
constants/TicketMoveLegality.ts
utils/BoardSettingsUtil.ts utils/ConcurrencyUtil.ts utils/DraftIdUtil.ts utils/EpicUtil.ts utils/GroupNameUtil.ts
utils/LaunchSlotUtil.ts utils/MergeQueueUtil.ts utils/NetworkDomainUtil.ts utils/OptionConsequencesUtil.ts
utils/PipelineChangeUtil.ts utils/PipelineDraftEditUtil.ts utils/PipelineUtil.ts utils/RoundVerdictUtil.ts
utils/TaskRecordUtil.ts utils/TicketBodyHashUtil.ts utils/TicketDefaultsUtil.ts utils/TicketDependencyUtil.ts
utils/TicketIdUtil.ts utils/TicketMoveUtil.ts utils/VocabularyUtil.ts
```

plus `./testing/BoardFixtures`, `./testing/GreenQueue` and `./testing/EveryBoardLogRecord`, each to its file under
`testing/`. A forge file imports, for example, `import { Board } from 'tracker-model/Board';` and
`import type { Ticket } from 'tracker-model/Ticket';`.

`tsconfig.json`: as `packages/design-system/tsconfig.json` without `jsx`: `lib: ["ESNext", "DOM", "DOM.Iterable"]`,
`types: []`, the strict options of every package,
`tsBuildInfoFile: ./node_modules/.cache/typecheck/tracker-model.tsbuildinfo`, `include: ["./**/*.ts"]`,
`exclude: ["./**/*.spec.ts", "./testing/**"]`. The DOM library is needed: the model calls
`structuredClone` (`PipelineSetups.ts:149` and others) and `TextEncoder` (`utils/TicketBodyHashUtil.ts:14`), which
`ESNext` alone does not declare. `tsconfig.spec.json`: extends it, `types: ["bun"]`, its own build info file,
`include: ["./**/*.ts"]`, `exclude: []`.

`eslint.config.js`: `@reliquary/eslint-config` with every rule forge's config applied to the model: the node protocol,
`.ts` extensions, `no-non-null-assertion`, `no-explicit-any`, `consistent-type-imports` (inline), `id-length` (only
`i`, `a`, `b`), `no-warning-comments` (`todo`, `fixme`, `xxx`, `hack`), `@stylistic/linebreak-style` unix,
`@stylistic/no-trailing-spaces`, `@typescript-eslint/no-magic-numbers` with forge's options
(`apps/forge/eslint.config.js:149-163`) outside `constants/`, specs and `testing/`, the clock selectors
(`apps/forge/eslint.config.js:116-125`) on shipping files, and `import/no-extraneous-dependencies` with
`devDependencies: true` and the root's manifest for specs and `testing/`.

`README.md`: what the package holds (the records, the Board, the Playbook, the queries, the vocabulary), its rules
(imports nothing; DOM-safe; the Board throws `BoardRefusal`, a typed domain error, as forge's Deviations say; a module
starts private and is exported once something outside imports it), and how to verify it.

`testing/ScratchFolder.ts`: `createScratchFolder(prefix: string): string` and `removeScratchFolder(folder: string):
void`, under `<package>/.scratch/`.

### 2. The package `board-readings`

Folder `packages/board-readings/`:

```
@types/MonitorSnapshot.ts  AttentionEntries.ts  TodayFigures.ts  constants/TimestampSlices.ts
utils/BridgeFragmentUtil.ts  utils/DraftWordingUtil.ts  utils/NoticeWordingUtil.ts  utils/OpenDecisionsUtil.ts
utils/TokenCountUtil.ts  utils/LocalTimeUtil.ts  utils/HtmlEscapeUtil.ts       (each with its spec where it had one)
```

`package.json`: as item 1, with `"name": "board-readings"`, `"version": "0.1.0"`, `"description": "What a forge and
its views both read from a board, worded and computed alike: the attention entries, today's figures, the notice and
draft wording, the open decisions, token counts, local time and HTML escaping"`, `"dependencies": { "forge-contracts":
"workspace:^", "tracker-model": "workspace:^" }`, and `exports`:

```
./MonitorSnapshot ./AttentionEntries ./TodayFigures ./TimestampSlices ./BridgeFragmentUtil ./DraftWordingUtil
./NoticeWordingUtil ./OpenDecisionsUtil ./TokenCountUtil ./LocalTimeUtil ./HtmlEscapeUtil
```

each to its file. `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js` as item 1, with
`board-readings.tsbuildinfo`. The exported names and signatures of the moved modules do not change; `MonitorSnapshot`'s
`monitorVersion` is `typeof OVERSEER_CONTRACT_VERSIONS.monitor`, the same literal type `3`.

### 3. The contract additions in `forge-contracts`

- `package.json`: `dependencies` gains `"tracker-model": "workspace:^"`; `version` one minor higher; `exports` gains
  `./BoardCommand`, `./BoardStateDocument`, `./BoardLimitsDocument`, `./ConversationDocuments`, `./DetailBoardState`,
  `./EpicsBoardState`, `./KanbanBoardState`, `./ProgressBoardState`, `./TicketsBoardState`, each to
  `./@types/<Name>.ts`.
- `FORGE_SYSTEM_VERSIONS.current`: S4, one minor over what stage 3 left (1.1 at `3e6cb660`, raised by stages 2 and 3).
  `minimumSupported` unchanged.
- `FORGE_COMPATIBILITY_REGISTRY` gains `{ kind: 'endpoint', endpoint: 'state', version: 1, introducedIn: S4,
  lastNeededBy: null, source: 'shipped' }`.
- Endpoint `GET /api/v1/state`: bearer token (or the Bridge's session while it exists), answer 200 with the board
  state, the same body as `GET /api/state`; 401 `unauthorized`; 404 `not-found` at any other version.
- `@types/BoardLimitsDocument.ts`:

```ts
export interface TimestampSlices {
  readonly dateAndClockLength:    number;
  readonly calendarDateLength:    number;
  readonly monthAndDaySliceStart: number;
  readonly clockSliceStart:       number;
  readonly clockSliceEnd:         number;
}

export interface DurationUnits {
  readonly hourMinutes: number;
  readonly dayMinutes:  number;
}

export interface TimelineLimits {
  readonly tickStepLadderMinutes:      readonly number[];
  readonly maximumTicksPerAxis:        number;
  readonly axisMinimumSpanMinutes:     number;
  readonly axisPaddingMinutes:         number;
  readonly minimumBarWidthPercent:     number;
  readonly hoursAxisLabelLimitMinutes: number;
  readonly weekAxisLabelLimitMinutes:  number;
  readonly hourMinutes:                number;
  readonly dayMinutes:                 number;
  readonly tickCountSafetyBound:       number;
}
```

- `@types/BoardStateDocument.ts`: today's `apps/forge/bridge/@types/BoardStateDocument.ts:18-190` verbatim, with three
  changes: no `flintBrain` field, no `FlintBrainBoardFactsDocument`, no `OverseerIdentity`. Its exports:
  `IdentifiedRecord`, `OverseerRuntimeState`, `BatonPassWarningDocument`, `OverseerFactsDocument`, `NoticeDocument`,
  `ConcurrencyDocument`, `LaunchSlotsDocument`, `UsageWindowDocument`, `UsageDocument`, `TaskDocument`,
  `PageTicketDocument`, `EpicRollupDocument`, `PageDraftDocument`, `PageDocument`, `MergeQueueEntryDocument`,
  `WaitingForMergeEntryDocument`, `MergeTargetDocument`, `MergeQueueDocument`, `BoardStateDocument`. Its imports are
  type-only: `DraftState` (`tracker-model/Draft`), `LogRecord` (`tracker-model/LogRecord`), `AppliedPipelineFacts`,
  `GateCacheMarkFacts`, `GateProfileRunFacts`, `PipelineChoices`, `PipelineFlowFacts`, `PipelineSetupFacts`
  (`tracker-model/PipelineFacts`), `AgentPair` (`tracker-model/Ticket`), `TimestampSlices` (`./BoardLimitsDocument.ts`).
- `@types/ConversationDocuments.ts`, `DetailBoardState.ts`, `EpicsBoardState.ts`, `KanbanBoardState.ts`,
  `ProgressBoardState.ts`, `TicketsBoardState.ts`: today's files verbatim, every import rewritten as in WP4.6 step 1.
  Their exported names are the ones `apps/forge/bridge/@types/<File>.ts` exports today (listed per file in
  "Today's code"); `NoticeDocument` exists in both `BoardStateDocument` and `ConversationDocuments`, as today.

### 4. The board commands

`packages/forge-contracts/@types/BoardCommand.ts`, the 34 kinds measured at `3e6cb660` (WP4.5 step 1 confirms the
list):

```ts
import type { DecisionAnswerForm }                                   from 'tracker-model/Decision';
import type { GatePhase }                                            from 'tracker-model/GatePhase';
import type { PictureReference }                                     from 'tracker-model/Job';
import type { PipelineBilling }                                      from 'tracker-model/Pipeline';
import type { ConstitutionSources, PipelineDraftField, PipelineSetupStep } from 'tracker-model/PipelineSetup';
import type { TicketPriority }                                       from 'tracker-model/Ticket';

import type { ForgeJobStopMode } from './ForgeControlCommand.ts';

/** A chart axis as `range` writes it: each bound a timestamp, `start`, `now` or a signed offset from now. */
export type ChartRangeRequest =
  | { readonly kind: 'automatic' }
  | { readonly kind: 'window'; readonly from: string; readonly to: string; readonly tickMinutes: number | null };

/** `tasks-and-log` keeps the tickets; `everything` also deletes the tickets, the epics and the pictures. */
export type TrackerClearScope = 'tasks-and-log' | 'everything';

/** One field of the draft pipeline and its new value; a `null` value removes the field or writes its default back. */
export interface PipelineFieldEdit {
  readonly field: PipelineDraftField;
  readonly value: unknown;
}

export type ForgeBoardCommand =
  | { readonly kind: 'chart-range-set'; readonly range: ChartRangeRequest }
  | { readonly kind: 'decision-answer'; readonly decisionId: string; readonly answer: DecisionAnswerForm }
  | { readonly kind: 'gate-profile-start'; readonly setupId: string | null; readonly gateName: string; readonly phase: GatePhase }
  | { readonly kind: 'gate-profile-stop'; readonly profileRunId: string }
  | { readonly kind: 'intake-close'; readonly jobId?: string; readonly proposedDraftSets: readonly (readonly string[])[] }
  | { readonly kind: 'intake-start'; readonly text: string; readonly pictures?: readonly PictureReference[] }
  | { readonly kind: 'job-fresh'; readonly jobId: string; readonly incidentId?: string }
  | { readonly kind: 'job-message'; readonly jobId: string; readonly text: string; readonly pictures?: readonly PictureReference[]; readonly incidentId?: string }
  | { readonly kind: 'job-stop'; readonly jobId: string; readonly mode: ForgeJobStopMode }
  | { readonly kind: 'merge-accept'; readonly ticketReference: string }
  | { readonly kind: 'merge-update'; readonly ticketReference: string }
  | { readonly kind: 'pipeline-agent-advise' }
  | { readonly kind: 'pipeline-apply'; readonly setupId: string; readonly draftRevision: number; readonly resumesBoard: boolean }
  | { readonly kind: 'pipeline-apply-cancel'; readonly setupId: string }
  | { readonly kind: 'pipeline-check'; readonly setupId: string }
  | { readonly kind: 'pipeline-constitution-edit'; readonly setupId: string; readonly revision: number; readonly markdown?: string; readonly draftedFrom?: ConstitutionSources }
  | { readonly kind: 'pipeline-draft-discard'; readonly setupId: string }
  | { readonly kind: 'pipeline-draft-edit'; readonly setupId: string; readonly draftRevision: number; readonly edits: readonly PipelineFieldEdit[] }
  | { readonly kind: 'pipeline-draft-undo'; readonly setupId: string; readonly editId: string }
  | { readonly kind: 'pipeline-setup-answer'; readonly setupId: string; readonly questionId: string; readonly answer: DecisionAnswerForm }
  | { readonly kind: 'pipeline-setup-billing'; readonly setupId: string; readonly billing: PipelineBilling }
  | { readonly kind: 'pipeline-setup-resume'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-start'; readonly billing: PipelineBilling; readonly replacesUnreadablePipeline: boolean }
  | { readonly kind: 'pipeline-setup-start-over'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-step'; readonly setupId: string; readonly step: PipelineSetupStep; readonly move: 'continue' }
  | { readonly kind: 'pipeline-update-start' }
  | { readonly kind: 'ticket-deliver-by-hand'; readonly ticketReference: string; readonly branch?: string; readonly commit?: string }
  | { readonly kind: 'ticket-hold'; readonly ticketReference: string; readonly reason: string }
  | { readonly kind: 'ticket-network'; readonly ticketReference: string; readonly domains: readonly string[] }
  | { readonly kind: 'ticket-park'; readonly ticketReference: string; readonly reason: string; readonly incidentId?: string }
  | { readonly kind: 'ticket-priority'; readonly ticketReference: string; readonly priority: TicketPriority }
  | { readonly kind: 'ticket-ready'; readonly ticketReferences: readonly string[] }
  | { readonly kind: 'ticket-unhold'; readonly ticketReference: string }
  | { readonly kind: 'tracker-clear'; readonly scope: TrackerClearScope };
```

The fields are those of `apps/forge/src/shared/@types/ControlCommand.ts:66-226` for the same kinds; `job-stop`'s
`Exclude<JobStopMode, 'fresh'>` (`ControlCommand.ts:134`; `JobStopMode` at `@types/Job.ts:100`) equals
`ForgeJobStopMode` (`ForgeControlCommand.ts:7`). If the line width rule of the package's lint breaks a member over
lines, keep one field per line.

In forge: `ControlCommand` is `| ForgeBoardCommand | <the kinds that stay forge's own>`, which are 42 at `3e6cb660`
plus what stage 3 added; `BOARD_COMMAND_CONTRACT_KINDS` in `apps/forge/src/shared/constants/OverseerApiContracts.ts`
lists the 34 kinds in the order above, `as const satisfies readonly ForgeBoardCommand['kind'][]`. Answers are
unchanged: 200 `{controlVersion: 1, outcome, result}`, 400 `malformed-body`, 409 a refusal, 423 while launches are
held. Stage 6 (WP6.1) lists every kind a client may send, the 9 control kinds and these 34, in
`forge-contracts/ForgeControlCommandKinds`; this stage's two forge-side lists stay its pins.

### 5. What stays the Bridge's

- `apps/forge/bridge/@types/FlintBrainBoardState.ts`: `FlintBrainBoardFactsDocument { readonly reading:
  MonitorFlintBrainDocument | null; readonly runs: readonly TodayFlintBrainRun[] }` and `FlintBrainBoardState {
  readonly flintBrain?: FlintBrainBoardFactsDocument }`, importing `MonitorFlintBrainDocument` from
  `forge-contracts/MonitorSnapshotDocument` and `TodayFlintBrainRun` from `board-readings/TodayFigures`.
- `apps/forge/bridge/@types/OverseerIdentity.ts`: `OverseerIdentity { readonly trackerId: string; readonly project:
  string; readonly codeVersion: string }`, as today.

### 6. Rules and guards

- `ImportDirection.spec.ts`: the violation `tracker-model-reaches-outside-itself` is gone; the test-folder entry
  `'tracker-model/testing/': ['tracker-model/', 'src/', 'cli/']`; the workspace-package layer is `board-readings`,
  `brand`, `forge-contracts`, `system-versions`, `tracker-model`; `forge-contracts` declares `system-versions` and
  `tracker-model`; and, by the owner's default, `'lib': ['lib', 'workspace-package']` with a lib package reaching only
  the workspace packages its main module's header names as "the workspace package `<name>`".
- Each new package holds its own isolation, exports and include list in its own specs, run by its own `bun test`.

## Traps

- **A shim at the old path is a barrel.** The guard reports every re-export (`ImportDirection.spec.ts:432-434`), and
  the rules forbid barrel files (`apps/forge/CLAUDE.md:36`). Do not move with re-export files and rewrite later: rewrite
  every importer in the commit that moves the files. Decision 32 says nothing has to be kept.
- **`exports` are exact keys.** The guard resolves a specifier only by an exact key (`ImportGraph.ts:131-139`,
  `posix.join(name, key)`); a pattern key such as `"./*"` resolves for Bun and TypeScript but the guard reports every
  import through it as `workspace-entry-not-exported`. List each entry.
- **A lib package cannot reach a package.** `LAYER_REACH['lib']` is `['lib']` (`ImportDirection.spec.ts:90`), and the
  vendor adapter reads `LocalTimeUtil` (`TranscriptCohortUtil.ts:6`). Moving `local-time` without the rule change of
  WP4.3 step 4 turns the guard red. The same holds for any later lib package that wants a model type.
- **The model's specs carry module paths as strings.** `SourceMutant.ts` roots them at `apps/forge`
  (`SourceMutant.ts:14`) and the Playbook specs name `'src/lib/tracker-model/Playbook.ts'`. A move that only rewrites
  imports breaks every mutant at build time; WP4.1 roots them at the model's folder first.
- **Copies of the repository sit inside the checkout.** `apps/forge/.forge-worktrees/` and `apps/gaia/.forge-worktrees/`
  hold tracker worktrees with their own `apps/forge/src/lib/tracker-model/`. A rewrite or grep that does not skip
  `.forge-worktrees`, `.forge`, `.claude` and `node_modules` edits a live tracker's worktree or reports false hits.
- **The lint rules weaken when files leave forge's config.** The model was held by forge's `no-magic-numbers`, clock
  selectors, `no-warning-comments`, LF and trailing-space rules (`apps/forge/eslint.config.js:98-163`);
  `forge-contracts`' config has none of them (`packages/forge-contracts/eslint.config.js:7-30`). Copy the rules into
  each new package's config, and plant them in `LintRules.spec.ts`.
- **The DOM-safety proof moves.** The Bridge compiled the whole model to prove it free of Bun and Node
  (`bridge/tsconfig.json:10-11`). Once those entries go, only the package's `tsconfig.json` proves it: keep
  `types: []`, and keep the DOM library, since `structuredClone` and `TextEncoder` are not in `ESNext`.
- **A bare specifier changes the import's group.** A relative import is "internal"; `tracker-model/Board` is
  "external", so the import order and the aligned `from` columns break in every rewritten file. Run `bun run lint:fix`
  and then read `bun run lint`; fix what the fixer leaves.
- **Path-keyed guards.** `PlatformBoundary.spec.ts:110` keys an allowed line by path; `UtilShape.spec.ts:59` and
  `ProductNameLiterals.spec.ts:20` scan named folders, so the model's utils and the notice wording would silently leave
  their scans; `ClientNames.spec.ts:26` needs more than 1,000 shipped files in forge, and about 1,120 minus 108 minus 11
  minus 5 leaves fewer. Change each in the commit that moves the files.
- **Citations are checked.** Thirty citations of model specs in `apps/forge/docs/` must point at
  `packages/tracker-model/...` in the same commit (`DocumentSpecCitations.spec.ts`).
- **`.contract.spec.ts` is taken.** The platform guard treats `*.contract.spec.ts` as an adapter contract spec
  (`apps/forge/CLAUDE.md:150-153`). Name the conformance spec `BoardState.documents.spec.ts`, not
  `BoardState.contract.spec.ts`.
- **A cycle through Flint's brain.** `board-readings` depends on `forge-contracts`; if the contract's board document
  kept `TodayFlintBrainRun`, the contract would import `board-readings` and close a cycle. The brain's facts stay in the
  Bridge (WP4.6).
- **Readonly contract types meet mutable appliers.** `ForgeBoardCommand` is `readonly` throughout, as the package's
  style is; an applier that hands a command's array to a parameter typed `string[]` stops compiling. Widen the
  parameter; never cast and never drop `readonly` from the contract.
- **A text search for command kinds finds log records.** `'pipeline-gates-none'` and `'pipeline-prepare-step-set'`
  appear in the Bridge as `case` labels of log record kinds (`FlowActivityPanelModel.ts:150`, `:154`). Measure the
  kinds from object literals' `kind` properties.
- **`bun.lock` changes with every new member.** `bun install --frozen-lockfile` fails until a plain `bun install` has
  written the new workspace members; run it once in the work package that adds a member or a dependency and commit the
  lockfile. Never edit `package.json` to make a check pass.
- **The code version must still see the model.** `CodeVersion.ts:1-4` hashes the workspace packages forge depends on,
  through the lockfile's dependency graph. Declare both packages in `apps/forge/package.json` directly, or a Baton pass
  stops noticing a model change.
- **An installed forge needs `bun install` after a pull.** The new workspace members resolve only after an install;
  the installed clone is the owner's, and stage 0 keeps it unpulled during the refactoring.
- **Line numbers drift.** Stages 2 and 3 change files this plan cites (the model, `forge-contracts`,
  `ImportDirection.spec.ts`). Read each cited place before editing it, and let the scripts compute the file lists.

## Verification of the whole stage

At the repository root, in a fresh worktree of `main` after the last work package merged:

```
bun install --frozen-lockfile
bun run verify
bun run gate:forge
bun run gate:gaia
```

The specs that matter most, inside each workspace folder:

```
(cd packages/tracker-model   && bun run typecheck && bun run lint && bun test)
(cd packages/board-readings  && bun run typecheck && bun run lint && bun test)
(cd packages/forge-contracts && bun run typecheck && bun run lint && bun test)
(cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./src/ImportDirection.spec.ts ./src/ProjectIncludeLists.spec.ts \
  ./src/DocumentSpecCitations.spec.ts ./src/ClientNames.spec.ts ./src/services/overseer/BoardState.documents.spec.ts \
  ./src/services/overseer/OverseerServer.spec.ts ./cli/overseer/routes/CommandRoute.boardContract.spec.ts \
  ./cli/overseer/routes/CommandRoute.controlContract.spec.ts ./bridge/CommandKindsInContract.spec.ts)
(cd apps/forge && bun run test:dom)
(cd apps/gaia && bun run check)      # the warning that Gaia supports an older forge; exit 0
```

The Bridge bundle built from the packages, in a real Overseer and a headless browser (skips without Chrome; one named
file, as `apps/forge/CLAUDE.md:20-22` allows):

```
cd apps/forge && bun test --path-ignore-patterns='.claude/**' ./bridge/HeadlessBridge.integration.spec.ts
```

The end-to-end check on a scratch forge. Neither app's rules let anyone run a forge on this checkout's boards; Gaia's
rules name the scratch forge of `apps/gaia/src/testing/ScratchForge.ts`, which runs `apps/forge/agent-progress.ts`
under a scratch home, in a scratch repository, with `FORGE_ROOT` pinned and the fake agent (`FORGE_FAKE_AGENT=1`,
`apps/forge/src/shared/Environment.ts:29`). Use it, or the same setup by hand with a scratch home and repository under
a short scratch root, never `~/.forge-monitor` or `~/.gaia`, and check in order:

1. `init` in the scratch repository; `ticket add` one ticket; `ticket ready` it; `status --json` prints the ticket with
   its row: the CLI runs on `tracker-model` and `board-readings`.
2. `start --json`: it answers with the Overseer's URL. Read the bearer token from the file the Baton record's
   `tokenFile` names (`apps/forge/src/services/overseer/OverseerFiles.ts:20`).
3. `GET <url>api/versions`: `current` is S4. `GET <url>api/v1/state` with the token: 200, with `project`, `page`,
   `jobs`, `mergeQueue` and `overseer`; `GET <url>api/v2/state`: 404.
4. `POST <url>api/v1/commands` with `{"kind":"ticket-priority","ticketReference":"1","priority":"high"}` and the token:
   200, `controlVersion` 1, outcome `done`; `status --json` shows the new priority.
5. `GET <url>`: 200, the Bridge's page, built from the packages; the board view lists the ticket.
6. `stop`; remove the scratch home and repository; the leak check of the run, or `git status --porcelain` and a listing
   of the scratch root, finds nothing left.

Repository state: `git status --porcelain` prints nothing; `apps/forge/src/lib/tracker-model`,
`apps/forge/src/shared/monitor`, `apps/forge/src/lib/local-time`, `src/lib/token-count` and `src/lib/html-escape` do not
exist; `grep -rn "src/lib/tracker-model\|src/shared/monitor" apps CLAUDE.md docs/monorepo/design.md
--exclude-dir=node_modules --exclude-dir=.forge --exclude-dir=.forge-worktrees` prints nothing.

## Out of scope

- Moving any view, component or client of the Bridge into Gaia, declaring the new packages in `apps/gaia/package.json`,
  raising Gaia's `SUPPORTED_FORGE_VERSION` and recording Gaia's forge answers again: stage 6.
- The documents of the event stream, the job transcript stream, the gate-profile stream, job files and pictures: stage
  6 adds each as the view that reads it moves. This stage registers only `state`.
- Command kinds the Bridge does not send today (filing, drafts, incidents, epics, `ticket-add`, `job-stop-all` beyond
  what is there): stage 6 or 7 adds them with the view that sends them; the Bridge guard of WP4.5 asks for it.
- The store port, its local adapter and any change to `apps/forge/src/services/tracker/`: stage 5.
- Removing Flint's brain, the session routes or the embed machinery, and the major version that goes with it: stage 8.
- Renaming `Overseer` in documents, types or paths: stage 9.
- Any change of behaviour of the Board, the Playbook, the readings or the routes; renaming a moved file; splitting a
  module. The move is a move.
- A package that stage 0 did not name, such as a separate vocabulary package or a `local-time` package: the owner
  decides it ("Needs the owner", items 1 and 2), and no builder creates one.
- The live trackers' `pipeline.json` `reach`: the owner's, set when the boards are set up anew.
- What follows an ending on a network outage, and whether an install line gets a time bound: this stage touches neither
  (the cause and ending names move with the model unchanged).

## Needs the owner

1. **The package boundaries.** Stage 0 recommends `tracker-model` (the whole model) and `board-readings`; this plan
   builds that. The measured layering also allows a split that keeps the Board out of Gaia's reach: `@types` and
   `constants` import only each other, `utils` import only those two, and the Bridge reaches 26 model files, all
   `@types`, `constants` and `utils/TicketDefaultsUtil.ts`. A vocabulary package of `@types`, `constants` and that one
   util, with the rest as `tracker-model`, would cost two moved spec cases (`constants/Statuses.spec.ts` reads
   `utils/VocabularyUtil.ts`; `constants/TicketMoveLegality.spec.ts` reads `utils/TicketMoveUtil.ts`) and a second
   mapping table in WP4.2's script. Recommended default: stage 0's two packages; reconsider before stage 6, where a Gaia
   guard can keep Gaia's imports from `tracker-model` to types, constants and `TicketDefaultsUtil`.
2. **The vendor adapter reads `LocalTimeUtil`, which moves into `board-readings`.** Recommended default: a `src/lib/`
   package may reach a workspace package its main module's header names (WP4.3 step 4), since the conventions say a
   lib package imports only the packages it declares. Alternatives: keep `local-time` in `apps/forge/src/lib/` and let
   the views copy what they need in stage 6; or make `local-time` a package of its own (a third package, which only the
   owner may add).
3. **`TimestampSlices.ts` joins `board-readings`.** `TodayFigures.ts` reads it, so the readings cannot move without it
   or a parameter in its place. Recommended default: move it (it is in the Bridge's reach today); its other importers
   name the package.
4. **Flint's brain stays out of the contract's board document.** Recommended default: yes, by decision 25; the Bridge
   keeps the field in its own type until stage 8 removes the brain.
5. **Which command kinds join the contract.** Recommended default: exactly the kinds the Bridge sends today (34 new
   kinds), with the Bridge guard of WP4.5 asking for more as views move. The alternative, all 76 kinds, puts the
   pipeline agent's and the product owner's relayed kinds under the contract, which no client sends.
6. **Gaia stays at the forge version stage 3 left** and warns in `bun run check` until stage 6. Recommended default:
   yes; raising it needs Gaia's forge recordings taken again on a scratch forge, which is stage 6's work.
7. **The root rules' tracker reach.** `CLAUDE.md:27` lists forge's reach by package. Recommended default: WP4.2 and
   WP4.3 add the two packages to the table, and the owner sets the reach in the board's `pipeline.json` when the boards
   are set up anew.
8. **What the model exports.** Recommended default: only the modules something outside the package imports (73 today),
   so the modules the Board composes stay private. The alternative, every shipping module, is simpler to guard but
   invites callers past the Board.

## Not established

- Whether the model's specs, run by `bun test` in `packages/tracker-model` without forge's preloads, finish each case
  within Bun's default timeout. Forge gives every case 90 seconds (`apps/forge/src/testing/ChildProcessCaseTimeout.ts`
  through `SharedCaseDeadlinePreload.ts`); the Playbook mutant specs build a bundle per case. No spec was run for this
  plan. If a case times out, give the package a `bunfig.toml` preload that sets the same deadline, as forge's does.
- Whether `bun run lint:fix` repairs the import groups and the aligned `from` columns after the rewrite, or leaves
  them to a hand pass.
- How many type errors WP4.8 meets. Three mismatches were found by reading (the Baton warning, the notices, the fields
  behind the index signature); whether every view slice holds against the served state was not compiled.
- Whether forge's appliers compile against `readonly` command types, and how many parameters WP4.5 must widen.
- The exact list of command kinds: the count of 34 comes from a text scan of `kind: '<kind>'` in the Bridge's shipping
  files, filtered against the 76 kinds; a kind sent through a computed value (as `overseer-pause` may be in
  `bridge/shell/Header.tsx`) is not in that count. WP4.5 measures it from the syntax tree.
- Whether any Gaia spec, beside the warning of `CheckSupportedForgeVersion.ts`, fails when forge's current version
  moves past `SUPPORTED_FORGE_VERSION`. Stages 2 and 3 raise it first and will show it.
- Whether `apps/gaia/src/testing/ScratchForge.ts` can be driven outside a recording spec for the end-to-end check, or
  must be set up by hand.
- The state of every cited file after stages 2 and 3: the counts and lines here are from `3e6cb660`.
- Whether stage 2's `src/lib/talos/TalosClosure.spec.ts` keeps the Watcher spec's forbidden-folder list as planned;
  stage 2 is not built.
