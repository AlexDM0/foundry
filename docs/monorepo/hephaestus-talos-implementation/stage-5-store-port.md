# Stage 5: the store port

## Goal

The forge reaches its stored board through one port, `BoardStore`, with two faces: a command face that the CLI and the
command endpoint apply `ControlCommand`s through, and a board transaction face that Hephaestus's pass (still the
Overseer in code) changes the board through inside one exclusive write, with git inside it as today. Both faces share a
lock-free read side. One adapter exists, `LocalFilesBoardStore`, which wraps today's tracker stores, the tracker lock
and the single hold of `writeTracker`; a contract spec states what any adapter must do, and a guard spec,
`src/StoreBoundary.spec.ts`, refuses every shipping line outside the adapter that names the path of a record.

In this file a path names a file of forge from `apps/forge/`, and a file of the root or of a package from the repository
root, as `apps/forge/CLAUDE.md` sets. Line numbers are those of `main` at `3e6cb660`; stages 2 to 4 move many of these
lines, so find each place by the function or symbol named beside it, never by the number alone.

## Depends on

- **Stage 1** (the monorepo migration closed): this stage starts on a base that does not move.
- **Stage 2** (Talos): `DrivePass.ts`, `Regrouping.ts`, `JobLaunch.ts` and `OverseerForeground.ts` are rewritten there.
  This stage changes how those files reach the store, so it runs on stage 2's versions. Talos's files stay outside the
  store, under the operating system port (stage 2's plan says so for its own files).
- **Stage 3** (presence and recovery): it adds the command `interrupted-work-resume`, the verb `resume`, the log records
  `start-classified`, `job-resume-instructed` and `job-line-lost`, and the files `presence.json`, `heartbeat.json`,
  `fatal-error-<generation>.json` and `crash-logs/crash-<generation>.json` under `<data>/overseer/`. Stage 3 leaves to
  this stage whether those files sit behind the store port; this plan keeps them outside it (Needs the owner, item 5).
  Its new command goes through the command face like every other kind; its new verb `resume` writes through
  `cli/RecordedIncidentMove.ts`, which WP5.8 switches.
- **Stage 4** (packages): the tracker model, with `Board`, `Ticket`, `LogRecord` and `TrackerProgress`, lives in the
  package stage 0 named (`packages/tracker-model` as stage 0's WP0.5 proposes). Every `src/lib/tracker-model/...` path
  below means that package's file of the same name. `src/ImportDirection.spec.ts` is changed by stage 4 first; WP5.4
  changes it again.

Hands to later stages:

- **Stage 6** (Gaia hosts the views): the command endpoint applies every command through the command face, so a view's
  command does what the same CLI verb does. The by-hand command kinds this stage adds are kept off the endpoint (Needs
  the owner, item 2); a view that needs one adds it to the endpoint with a minor system version.
- **Stage 7** (conversations): `job-message` and `intake-start` go through the command face unchanged.
- **Stage 8** (shrink the HTTP surface): the read side gives the reads the server keeps; the registry's `progressJson`
  is filled from `locationOf` and can be dropped there (Needs the owner, item 4).
- **Stage 9** (rename): no identifier this stage adds names the Watcher. Three name the Overseer, as everything does
  until stage 9: `ControlContext.liveOverseerOf`, `writeAsTheOverseer` and its file
  `cli/overseer/OverseerBoardWrites.ts`; stage 9's replacement table renames them with the rest.
- **A remote adapter, later and not built**: it implements `BoardStore` and must pass
  `src/services/store/BoardStore.contract.spec.ts`. Its transaction face cannot carry a hold that spans a git
  fast-forward (design section 4); that redesign stays out of this plan.

## Decisions this stage carries out

- **2.** The forge owns the data model and the stored formats: they live inside the local adapter, and only it reads or
  writes a record.
- **3.** Stored formats stay versioned as today; the versions move with the formats inside the adapter, unchanged.
- **12.** What the pipeline decides from stays persisted: the hold journal and the atomic writes are kept as they are.
- **16.** Storage is a port with local files first: `BoardStore` and `LocalFilesBoardStore`.
- **17.** The remote store is not built; the port and its contract spec keep it possible.
- **19.** The command endpoint applies through the same command face as the CLI.
- **22.** Outside Hephaestus, state changes only through a command: every CLI verb that changes the board applies a
  `ControlCommand`, the by-hand verbs included.
- **32.** Nothing that exists is kept: names, refusal texts and the place of the Baton check change outright.
- **33.** This stage creates no package. Its new folder `src/services/store/` is a service unit inside `apps/forge`.
- **34.** Orchestrated sessions do this work outside both trackers.

## Today's code

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| `writeTracker`: lock, journal replay, read into a Board, mutate (may be async), write in order, one hold | `src/services/tracker/TrackerPipeline.ts:153` | Kept, inside the adapter; only `LocalFilesBoardStore` calls it (WP5.8, WP5.10) |
| `TrackerChange`, what a mutation receives, with the whole `Workspace` | `src/services/tracker/TrackerPipeline.ts:33` | Replaced by `BoardTransaction` in `src/services/tracker/BoardTransaction.ts` (WP5.3) |
| `TrackerWriteRequest`, `TrackerWritten` | `src/services/tracker/TrackerPipeline.ts:50`, `:63` | Changed: `TrackerWritten` carries `unreadableRecords` (WP5.3) |
| The planned write order of a hold | `src/services/tracker/TrackerPipeline.ts:108` | Kept |
| `withLock`, the tracker lock with the journal replayed first | `src/services/tracker/TrackerLock.ts:217` | Kept, inside the adapter |
| `withLockIfFree`, with no caller in the repository | `src/services/tracker/TrackerLock.ts:233` | Deleted (WP5.2) |
| `withLockAt`, `LockGenerationSteps`, `LockHolderIsGone`, used by the registry, the repository tracker list and the shared-repository landing | `src/services/tracker/TrackerLock.ts:256`, `:184`, `:41`; imported at `src/services/tracker/MonitorRegistration.ts:22`, `src/services/tracker/RepositoryTrackerList.ts:14`, `src/services/lifecycle/Landing.ts:18` | Moved to `src/services/tracker/GenerationLock.ts` (WP5.2) |
| The hold journal: `commitHold`, `replayHoldJournal`, `readHoldJournal`, `holdJournalFilePathOf` | `src/services/tracker/HoldJournal.ts:121`, `:139`, `:29`, `:24` | Kept, inside the adapter; `status` reads it through `readUnfinishedWrite` (WP5.9) |
| `TrackerContents`, `readTracker`, `requireTracker`, `requireProgressFile` | `src/services/tracker/TrackerReader.ts:20`, `:53`, `:84`, `:91` | Kept inside the adapter; the type moves to `src/services/tracker/@types/BoardRecords.ts` as `BoardContents` (WP5.3) |
| `Workspace` with every record path, `workspacePathsFor`, `findWorkspace`, `requireWorkspace` | `src/services/tracker/Workspace.ts:17`, `:34`, `:69`, `:111` | Changed: `Workspace` keeps `rootDirectory`, `trackerDirectory`, `htmlFilePath`; the record paths move to `LocalStoreLayout` (WP5.11) |
| A tracker is detected by its progress file | `src/services/tracker/Workspace.ts:55` | Kept, asked of `LocalStoreLayout` (WP5.11) |
| `listTickets`, `readTicket`, `nextTicketId`, `createTicket`, `everyTicketFilePathIn`, `MalformedTicketFile` | `src/services/tracker/TicketStore.ts:63`, `:112`, `:125`, `:149`, `:172`, `:22` | Kept inside the adapter; `createTicket` is reached through `RecordAllocation.newTicket` (WP5.3, WP5.5) |
| `listEpics`, `everyEpicFilePathIn`, `epicFilePathOf` | `src/services/tracker/EpicStore.ts:23`, `:38`, `:42` | Kept inside the adapter; reached through `RecordAllocation` (WP5.5) |
| `listDrafts`, `draftFilePathOf` | `src/services/tracker/DraftStore.ts:23`, `:37` | Kept inside the adapter; reached through `RecordAllocation` and `locationOf` (WP5.5, WP5.9) |
| `storeFolderFileNamesIn`, `listStoreFolder` | `src/services/tracker/StoreFolderListing.ts:26`, `:37` | Kept inside the adapter |
| `createTracker` for `init` | `src/services/tracker/TrackerCreation.ts:21` | Kept, reached through `BoardStore.initialise` (WP5.9) |
| `TRACKER_FILES`: record names, plus the data folder and page names | `src/services/tracker/constants/TrackerFiles.ts:4` | Changed: record names become `LOCAL_STORE_FILES` inside the adapter; the data folder name is `PRODUCT_NAMES.DATA_FOLDER` (WP5.11) |
| The registry reads the progress file and publishes its path as `progressJson` | `src/services/tracker/MonitorRegistration.ts:140`, `:152` | Changed: the caller reads through the port and passes the facts in (WP5.9) |
| `ControlService.apply` on a `TrackerChange`; `CONTROL_APPLIERS`; `CONTROL_COMMAND_KINDS` | `src/services/control/ControlService.ts:67`, `:27`, `:56` | Changed: applies on a `BoardTransaction`; gains the by-hand kinds (WP5.3, WP5.6, WP5.7) |
| `ControlCommand`, 76 kinds | `src/shared/@types/ControlCommand.ts:66` | Changed: gains the by-hand kinds (WP5.6, WP5.7) |
| `ControlContext` | `src/shared/@types/ControlContext.ts:49` | Changed: gains `liveOverseerOf` (WP5.7) |
| `ticket-add` names the new ticket's file through `createTicket(change.workspace, …)` | `src/services/control/TicketControls.ts:49` | Changed: `transaction.records.newTicket` (WP5.5) |
| `epic-add` and `draft-open` name their file and compare it with the unreadable files | `src/services/control/FilingControls.ts:9`, `:21` | Changed: `transaction.records` (WP5.5) |
| The pipeline refusal names `pipelineFilePath` | `src/services/control/SettingControls.ts:11` | Changed: `transaction.records.locationOf` (WP5.5) |
| A ticket reference is matched to an unreadable file by parsing its file name | `src/services/control/ControlTicketLookup.ts:11-17`, `cli/tickets/utils/TicketLookupUtil.ts:11-18` | Changed: matched by `UnreadableRecord.key` (WP5.5) |
| Appliers that run git or reach job folders and pictures through `change.workspace.rootDirectory` and `trackerDirectory` | `src/services/control/AirlockControls.ts:43-89`, `RepairControls.ts:35`, `JobControls.ts:32`, `BoardLifetimeControls.ts:107`, `PipelineSetupControls.ts:156`, `:262`, `PipelineAgentControls.ts:53` | Kept: these are places, not records |
| The merged-tree gate step named `TRACKER_FILES.PIPELINE_FILE_NAME` | `src/services/overseer/UnreadablePipelineGate.ts:12` | Changed: a wordless step value (WP5.5) |
| The pass fingerprint reads the bytes of `progress.json`, `log.jsonl` and `gate-profiles.json` | `src/services/overseer/DrivePass.ts:396-419` (`:407-409`), helper `fileTextOrEmpty` at `:377` | Replaced by `reads.revision()` (WP5.10) |
| `observe` reads the progress file and the pipeline outside the lock | `src/services/overseer/DrivePass.ts:424`, `:453` | Changed: the read side (WP5.10) |
| The tracker id and the paused state read outside the lock | `src/services/overseer/DrivePass.ts:982`, `:1208` | Changed: the read side (WP5.10) |
| `holdTracker`, the Airlocks', gate profiles' and pipeline checks' hold runner, on `writeTracker` | `src/services/overseer/DrivePass.ts:1085-1098`; type at `src/services/overseer/Airlocks.ts:48-54` | Changed: on `transactions.transact` (WP5.10) |
| The landing's git fast-forward runs inside a hold | `src/services/overseer/Airlocks.ts:897-916` (`Landing.landOnTarget`) | Kept, inside a transaction |
| The pass's one hold: relayed commands, events, lifecycle | `src/services/overseer/DrivePass.ts:1253-1345` | Changed: on `transactions.transact` (WP5.10) |
| The merged-tree gate reads `pipeline.json` afresh | `src/services/overseer/DrivePass.ts:1171` | Changed: `reads.readPipeline()` (WP5.10) |
| Relayed commands applied inside the pass's hold | `src/services/overseer/HatchInbox.ts:166` | Changed: on the `BoardTransaction` (WP5.3) |
| Regrouping reads the progress file | `src/services/overseer/Regrouping.ts:224` | Changed: the read side, or gone with stage 2 (WP5.10) |
| The data folder watch wakes the pass on any file event | `src/services/overseer/DataFolderWatch.ts:57` | Kept: it watches a place |
| The CLI's write path: job check, workspace, `--at`, `writeTracker`, report, register, nudge | `cli/OpenTrackerForWriting.ts:15-58` | Replaced by `cli/ApplyCommandOfVerb.ts` (WP5.8) |
| 30 CLI call sites in 25 files that apply a control command inside `openTrackerForWriting` | listed by `grep -rn "ControlService.apply" cli` | Changed: the command face (WP5.8) |
| CLI verbs that change the Board directly, with no command kind: `task` (add, move, update, remove), `log`, `namespace`, `ticket link`, `ticket size`, `ticket agent`, `ticket introduced-by`, `ticket release-of`, `ticket rereview`, `ticket reopen`, `ticket status`, `epic edit`, `epic remove` | `cli/tracking/task/TaskAdd.ts:30`, `TaskCommand.ts:37`, `TaskCorrection.ts:40`, `:57`, `cli/tracking/log/LogCommand.ts:20`, `cli/tracking/namespace/NamespaceCommand.ts:103-119`, `:138`, `cli/tickets/TicketSettingSubcommands.ts:41`, `:81`, `:104`, `cli/tickets/TicketIntroducedBy.ts:32`, `cli/tickets/TicketReleaseMarker.ts:24`, `cli/tickets/TicketMoveSubcommands.ts:108`, `cli/tickets/TicketTransition.ts:40`, `cli/epics/EpicChangeSubcommands.ts:76`, `:93` | Replaced by command kinds (WP5.6, WP5.7) |
| The list of mutating verbs with no kind | `cli/ControlContract.spec.ts:34-55` | Changed: keeps only `init`, `update`, `oversee`, `start`, `stop`, `login-item add`, `login-item remove` (WP5.6, WP5.7) |
| The unrelayed kinds and their verbs | `cli/constants/JobVerbs.ts:38-42` | Kept; a third map `BY_HAND_VERB_OF_CONTROL_KIND` beside it (WP5.6) |
| `ticket deliver --by-hand` checks the live Baton inside the hold through `change.workspace.trackerDirectory` | `cli/tickets/TicketMoveSubcommands.ts:67-75` | Changed: `ControlContext.liveOverseerOf`, judged by the applier (WP5.7) |
| The command endpoint applies through `openTrackerForWriting`; `COMMAND_ROUTE_KINDS` | `cli/overseer/routes/CommandRoute.ts:161`, `:52` | Changed: the command face; the by-hand kinds are left out (WP5.6, WP5.8) |
| The Overseer's own board writes from its process | `cli/overseer/OverseerForeground.ts:171`, `:561-566`, `:655`, `:677`, `:690`; `cli/overseer/OverseerFlintBrain.ts:74` | Changed: the transaction face (WP5.8) |
| The board state reads the tracker and the raw `pipeline.json` text | `cli/overseer/routes/BoardStateReader.ts:133-137`, `:153` | Changed: the read side (WP5.10) |
| The routes read `log.jsonl` and `gate-profiles.json` by path | `cli/overseer/routes/OverseerRoutes.ts:76-79`, `:88-91`, `:153`, `:161` | Changed: the read side (WP5.10) |
| CLI reads: `status`, `ticket list`, `ticket show`, `epic`, `draft`, `decisions`, `incidents`, `jobs`, `job`, `merges`, `review-stats`, `await`, `concurrency`, `namespace`, `gate list`, `init`, `login-item`, `oversee`, `start` | `cli/tracking/status/StatusCommand.ts:39-46`, `cli/tickets/TicketList.ts:79`, `cli/tickets/TicketReadingSubcommands.ts:22`, `:66`, `cli/epics/EpicCommand.ts:24`, `cli/drafts/DraftCommand.ts:25`, `:49`, `cli/decisions/DecisionsCommand.ts:28`, `cli/incidents/IncidentsCommand.ts:27`, `cli/jobs/JobsCommand.ts:22`, `:34`, `cli/jobs/JobCommand.ts:72`, `:74`, `:144`, `cli/merges/MergesCommand.ts:95`, `cli/measurement/review-stats/ReviewStatsCommand.ts:21`, `cli/tracking/await/AwaitCommand.ts:58`, `:63`, `cli/dispatch/concurrency/ConcurrencyCommand.ts:37`, `cli/tracking/namespace/NamespaceCommand.ts:61`, `:82`, `:94`, `cli/gates/GatePipelineVerbs.ts:222-225`, `cli/adoption/init/InitCommand.ts:66`, `:160`, `:172`, `cli/setup/login-item/LoginItemCommand.ts:86`, `cli/overseer/OverseerCommand.ts:72`, `:146`, `cli/overseer/StartCommand.ts:42` | Changed: the read side (WP5.9) |
| A ticket's and an epic's `filePath` in the domain model, printed by the CLI and sent in the page payload | `src/lib/tracker-model/@types/Ticket.ts:75`, `src/lib/tracker-model/@types/Epic.ts:16`, `:25`; `src/adapters/utils/TicketJsonUtil.ts:18`, `src/services/render/PagePayloadAssembly.ts:61`, `cli/tickets/TicketReadingSubcommands.ts:51`, `cli/epics/EpicOutput.ts:7` | Kept as data the adapter fills (Needs the owner, item 3) |
| The port convention: one frozen record of ports, a contract spec per adapter, a boundary guard with an exact allowlist | `src/lib/platform-ports/PlatformPortsFor.ts:43`, `src/testing/PortContract.ts:14`, `src/PlatformBoundary.spec.ts:1-471` | Followed by `BoardStore`, its contract and `src/StoreBoundary.spec.ts` (WP5.1, WP5.4) |
| The service layers of the import guard | `src/ImportDirection.spec.ts:79-96`, `:236-241` | Changed: `store-service` between `control-service` and `overseer-service` (WP5.4) |
| The rule that every mutating command writes through `writeTracker` | `CLAUDE.md:368-372` | Changed: through the store port (WP5.12) |
| The import direction diagram | `CLAUDE.md:58-63` | Changed: `control → store → overseer` (WP5.12) |
| The Deviations table | `CLAUDE.md:313-343` | Changed: a row for the port with one adapter (WP5.12) |
| Docs naming `writeTracker`, `TrackerChange` and `openTrackerForWriting` | `docs/concepts/overview.md:190`, `:205`, `:210`, `docs/glossary.md:104`, `:681`, `docs/backlog.md:30` | Changed (WP5.12); `docs/research/remote-state/findings.md:64` is a dated record and stays |

## Work packages

Order and parallelism:

| Package | Runs after | May run in parallel with | Must run alone |
| --- | --- | --- | --- |
| WP5.1 The store boundary guard, today's leaks allowlisted | stages 1 to 4 | none | yes |
| WP5.2 The generation lock apart from the tracker lock | WP5.1 | none | no |
| WP5.3 `BoardTransaction`, record allocation and keyed unreadable records | WP5.2 | none | no |
| WP5.4 The port, the local-files adapter and the contract spec | WP5.2, WP5.3 | WP5.5, WP5.6 | no |
| WP5.5 Appliers and lookups through the transaction's records | WP5.3 | WP5.4, WP5.6 | no |
| WP5.6 By-hand verbs become commands: task, log, namespace | WP5.3 | WP5.4, WP5.5 | no |
| WP5.7 By-hand verbs become commands: tickets and epics; the deliver-by-hand fact | WP5.5, WP5.6 | WP5.4 | no |
| WP5.8 The CLI and the command endpoint write through the store | WP5.4, WP5.7 | none | yes |
| WP5.9 The CLI reads through the read side | WP5.8 | WP5.10 | no |
| WP5.10 The Overseer's pass, server and reads through the store | WP5.8 | WP5.9 | no |
| WP5.11 The record paths leave `Workspace`; the guard's final form | WP5.9, WP5.10 | WP5.12 | no |
| WP5.12 Rules, docs and the Deviations row | WP5.10 | WP5.11 | no |

Parallel packages touch disjoint source files. WP5.2 and WP5.3 run one after the other: both change
`src/services/tracker/TrackerPipeline.ts`, `TrackerCreation.ts` and `TrackerPipeline.spec.ts`, which import the lock's
names that WP5.2 moves (`TrackerPipeline.ts:29`, `TrackerCreation.ts:7`, `TrackerPipeline.spec.ts:34`). Every package
edits `src/StoreBoundary.spec.ts`, but only the allowlist entries of its own files; the entries are sorted by path, one
per line, so two parallel packages merge without a conflict unless they own entries of the same file, which the table
above avoids. Each package works in its own worktree under `.claude/worktrees/<name>` cut from the branch the previous
packages landed on, and ends with the root's `bun install --frozen-lockfile` and `bun run verify` green.

Every package also follows these rules: full descriptive names, no abbreviations; one purpose per file, named after its
main export; a spec beside its module opening with a docblock of the cases that matter, test names written as claims; no
fixed sleep in a spec (`src/SpecSleeps.spec.ts`); every spec under the scratch root (`src/testing/ScratchWorkspace.ts`);
no `!` assertion; no work at module load; a refusal from `src/` carries a wordless detail, worded only by
`src/adapters/utils/OperationRefusalWordingUtil.ts`.

### WP5.1 The store boundary guard, today's leaks allowlisted

**Purpose.** Make the boundary measurable before anything moves: a guard spec that finds every shipping line outside the
adapter that names a record's path, with an exact allowlist of today's leaks, each entry naming the package that removes
it. Every later package is done when its entries are gone.

**Files.**

- Create `src/StoreBoundary.spec.ts`. Beside `src/PlatformBoundary.spec.ts`, because it is a repository guard of the
  same kind (`repository-guard` layer in `src/ImportDirection.spec.ts:228`).

**What to do.**

1. Copy the structure of `src/PlatformBoundary.spec.ts`: a header docblock; a `StoreForm` string-literal union; a
   `STORE_FORM_PATTERNS` record from each form to its regular expressions; `isShippingCode` (the same definition as
   `PlatformBoundary.spec.ts:124-126`); `isCommentLine` (`:132-134`); a memoised per-source scan with
   `memoisedPerSource` from `src/testing/RepositorySources.ts:114`; a `boundaryReportOf(sources, allowedLines)` that
   returns `{ violations, unusedAllowances }`; sources from `programTypeScriptSources(repositoryRootOfThisCheckout())`.
2. Define the adapter as an exact list, never a folder of `src/services/`:
   - `STORE_ADAPTER_FILES`: `src/services/store/LocalFilesBoardStore.ts`, `src/services/tracker/TrackerPipeline.ts`,
     `TrackerReader.ts`, `TicketStore.ts`, `EpicStore.ts`, `DraftStore.ts`, `StoreFolderListing.ts`, `TrackerLock.ts`,
     `HoldJournal.ts`, `TrackerCreation.ts`, `Workspace.ts`, `constants/TrackerFiles.ts` (all under
     `src/services/tracker/`), and the files later packages add: `src/services/tracker/LocalRecordAllocation.ts`,
     `src/services/tracker/LocalStoreLayout.ts`, `src/services/tracker/constants/LocalStoreFiles.ts`. A listed file that
     does not exist yet is allowed; the "scan saw the tree" test checks the ones that exist.
   - `STORE_ADAPTER_FOLDERS`: the record format adapters, `src/adapters/progress/`, `src/adapters/log/`,
     `src/adapters/tickets/`, `src/adapters/epics/`, `src/adapters/drafts/`, `src/adapters/pipeline/`,
     `src/adapters/pipeline-setup/`, `src/adapters/hold-journal/`.
3. Define these forms, each matched on trimmed code lines of shipping files outside the adapter:
   - `record-file-name`: a string literal that is exactly a record's name: ``
     /(['"`])(?:progress\.json|pipeline\.json|pipeline-setup\.json|gate-profiles\.json|constitution-sources\.json|log\.jsonl|hold-journal\.json|filing-cabinet)\1/
     ``. Prose in a template literal (help text, wording) does not match, since the literal is longer than the name.
   - `record-folder-join`: a `join` that names a record folder: ``
     /\bjoin\([^)]*(['"`])(?:tickets|epics|filing-cabinet)\1/ ``.
   - `record-path-name`: a record path by its field or helper name:
     `/\b(?:progressFilePath|pipelineFilePath|pipelineSetupFilePath|gateProfilesFilePath|constitutionSourcesFilePath|ticketsDirectory|epicsDirectory|draftsDirectory|holdJournalFilePathOf|epicFilePathOf|draftFilePathOf|everyTicketFilePathIn|everyEpicFilePathIn)\b/`,
     and the two ambiguous fields only on a workspace:
     `/\b(?:workspace|Workspace)\??\.(?:logFilePath|lockDirectoryPath)\b/`. `logFilePath` alone is also the Overseer's
     own log (`src/services/overseer/OverseerFiles.ts:9`) and `lockDirectoryPath` alone is also the registry's and the
     landing's lock, so they are matched only on a workspace.
   - `record-constant`: `/\bTRACKER_FILES\.(?!TRACKER_DIRECTORY_NAME\b|HTML_FILE_NAME\b)\w+/` and
     `/\bLOCAL_STORE_FILES\b/`.
   - `store-internal-import`: an import of a module of the adapter:
     `/\bfrom\s+['"][^'"]*\/(?:TrackerPipeline|TrackerReader|TicketStore|EpicStore|DraftStore|StoreFolderListing|TrackerLock|HoldJournal|TrackerCreation|LocalRecordAllocation|LocalStoreLayout|LocalStoreFiles|TrackerFiles|LocalFilesBoardStore|ProgressFileIngestion|ProgressFileWriter|LogFileIngestion|LogFileWriter|TicketFileIngestion|TicketFileWriter|EpicFileIngestion|EpicFileWriter|DraftFileIngestion|DraftFileWriter|HoldJournalIngestion|HoldJournalWriter)\.ts['"]/`.
     An import spread over several lines is matched on its `from` line, which is the line the allowlist names.
   - `stored-record-read`: `/\b(?:PipelineFile|GateProfilesFile|PipelineSetupFile|ConstitutionSourcesFile)\.read\(/`.
     The pure members of these adapters (`contentsOf`, `documentReadingOf`, `storedDocumentOf`, `billingOf`) stay
     usable.
4. Run the scan and write `ALLOWED_STORE_LINES: Readonly<Record<string, string>>`, keyed
   `<path>: <form>: <trimmed line>` exactly as the scan prints it, one entry per finding, sorted by path. Each value
   names the package that removes it, as `'Removed by WP5.10: the pass fingerprint reads the stored files.'`. Read each
   finding before listing it: a finding that is no record path (for example an `approval` literal `'tickets'` matched by
   mistake) is a pattern bug, fixed in the pattern, never allowlisted. Expect findings at least in
   `src/services/overseer/DrivePass.ts`, `src/services/overseer/Regrouping.ts`,
   `src/services/overseer/UnreadablePipelineGate.ts`, `src/services/overseer/HatchInbox.ts`,
   `src/services/control/*Controls.ts`, `src/services/control/ControlService.ts`,
   `src/services/control/ControlTicketLookup.ts`, `src/services/lifecycle/Landing.ts`,
   `src/services/tracker/MonitorRegistration.ts`, `src/services/tracker/RepositoryTrackerList.ts`, and in `cli/` every
   file the Today's code table lists.
5. Write the tests, mirroring `PlatformBoundary.spec.ts:204-471`:
   - "the scan saw the tree": more than 400 shipping paths; the adapter files that exist are found; the forms really
     stand in the adapter (`record-file-name` in `src/services/tracker/constants/TrackerFiles.ts`,
     `store-internal-import` in `src/services/tracker/TrackerPipeline.ts`).
   - "every shipping line naming a form is allowlisted, and every allowlist entry is found":
     `expect(boundaryReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] })`, with
     `ALLOWED_LINES = Object.keys(ALLOWED_STORE_LINES)` as `PlatformBoundary.spec.ts:122` does.
   - "the allowlist is exact both ways": removing an entry leaves its line a violation; an unused entry is named; a
     second copy of an allowed line in the same file is a violation; an allowed line in another file is a violation.
   - "the guard names each form, planted in memory", one planted line per form and per pattern, at the path
     `src/services/overseer/Planted.ts`, and a test that every form is planted.
   - "what the boundary exempts is exact": a planted form in each adapter file and folder passes; the same line in
     `src/services/tracker/PlantedHelper.ts`, `src/services/store/PlantedStore.ts` and `cli/Planted.ts` fails; a
     comment, a spec, a `.dom.tsx` and a `testing/` folder are not scanned.

**Specs.** `src/StoreBoundary.spec.ts` itself proves: the scan found the adapter and the leaks; each form is caught when
planted; the allowlist is exact both ways; the exemptions are exact.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**' ./src/StoreBoundary.spec.ts` passes. At
the root: `bun install --frozen-lockfile` then `bun run verify` is green. No source file outside the new spec changed.

### WP5.2 The generation lock apart from the tracker lock

**Purpose.** The lock mechanism serves three locks that hold no record (the machine registry, the repository tracker
list, the shared-repository landing). Separate it, so the tracker lock is the adapter's alone.

**Files.**

- Create `src/services/tracker/GenerationLock.ts`: the numbered generation lock on any folder. It stays in the tracker
  service because its three users are there and in `src/services/lifecycle/`.
- Create `src/services/tracker/GenerationLock.spec.ts` by moving the cases of `src/services/tracker/TrackerLock.spec.ts`
  that test `withLockAt` and `LockGenerationSteps`; move the matching cases of `TrackerLock.integration.spec.ts` into
  `GenerationLock.integration.spec.ts` if they test only the generic lock, and update `BOUNDARY_SPECS` in
  `src/testing/BoundarySpecs.ts` if it names the moved file.
- Change `src/services/tracker/TrackerLock.ts`, `src/services/tracker/MonitorRegistration.ts`,
  `src/services/tracker/RepositoryTrackerList.ts`, `src/services/lifecycle/Landing.ts`, the two shipping importers of
  `LockHolderIsGone` and `NO_LOCK_HOLDER_READS_AS_GONE` (`src/services/tracker/TrackerPipeline.ts:29`,
  `src/services/tracker/TrackerCreation.ts:7`), every spec and testing helper that imports a moved name (`grep -rln
  "LockGenerationSteps\|NO_LOCK_HOLDER_READS_AS_GONE\|LockHolderIsGone\|withLockAt" src cli`, among them
  `TrackerPipeline.spec.ts:34`, `CrashMatrix.spec.ts:74`, `Airlocks.siblingTrackers.spec.ts:22`,
  `cli/overseer/OverseerCommand.spec.ts:26`, `cli/tickets/TicketCommand.spec.ts:23`), and `src/StoreBoundary.spec.ts`
  (remove the entries of the three users). No file re-exports a moved name: each importer names `GenerationLock.ts`.

**What to do.**

1. Move into `GenerationLock.ts`, unchanged: `LockPayload`, `GENERATION_STATES`, `GenerationRecord`, `LockHolderIsGone`,
   `NO_LOCK_HOLDER_READS_AS_GONE`, `AcquireAttempt`, `ACQUIRE_STEPS`, every helper from `generationNumberOf` to
   `release` (`TrackerLock.ts:54-181`), `LockGenerationSteps` (`:184-190`), `lockHoldOf` (`:193-199`), `lockPayloadAt`
   (`:228-230`) and `withLockAt` (`:256-285`). Export `withLockAt`, `LockGenerationSteps`, `LockHolderIsGone`,
   `NO_LOCK_HOLDER_READS_AS_GONE`. Move the header docblock's second paragraph (the stated clock exception) with it.
   Move `HoldFence` (`HoldJournal.ts:20-22`) into `GenerationLock.ts` too, since a fence belongs to a lock hold;
   `HoldJournal.ts` then imports it from there, so `GenerationLock.ts` imports nothing of the adapter.
2. Keep in `TrackerLock.ts` only `withLock` and `replayingTheJournalFirst`, importing `withLockAt` and the types from
   `GenerationLock.ts`.
3. Delete `withLockIfFree` and `LockIfFreeOutcome` (`TrackerLock.ts:226-253`): `grep -rn withLockIfFree src cli` finds
   it only where it is defined.
4. Point `MonitorRegistration.ts:22`, `RepositoryTrackerList.ts:14` and `Landing.ts:18` at `GenerationLock.ts`.
5. Remove the three users' `store-internal-import` entries from the allowlist.

**Specs.** `GenerationLock.spec.ts` proves what the moved cases proved: acquire, release, takeover of a gone or stale
holder, contention. `TrackerLock.spec.ts` keeps the cases that prove the journal is replayed before the action runs.

**Done when.** `bun test --path-ignore-patterns='.claude/**' ./src/services/tracker/` passes in `apps/forge`; `grep -rn
"withLockIfFree" src cli` prints nothing; the root's `bun run verify` is green.

### WP5.3 `BoardTransaction`, record allocation and keyed unreadable records

**Purpose.** Give the board transaction its own type, the one a command applier and the pass receive, and give it what
an applier needs from the store without a path: allocating a new record, and reports of unreadable records that carry
the record's key. Nothing is switched to the new members yet beyond what the rename forces.

**Files.**

- Create `src/services/tracker/BoardTransaction.ts`: `BoardTransaction` and `RecordAllocation`. In the tracker service,
  because the control service (below the store service) applies on it.
- Create `src/services/tracker/@types/BoardRecords.ts`: `UnreadableRecord`, `UnreadableRecords`, `RecordReference`,
  `BoardContents`, `StoredBoardReading`, `UnfinishedWriteReading`, `LogRecordsReading`, `TicketListing`, `NewTracker`,
  `TrackerCreation`. These are the port's vocabulary and must be importable without importing an adapter module.
- Create `src/services/tracker/LocalRecordAllocation.ts` and its spec: the local adapter's `RecordAllocation`.
- Change `src/services/tracker/TrackerPipeline.ts`, `TrackerReader.ts`, `TicketStore.ts`, `EpicStore.ts`,
  `DraftStore.ts`, `StoreFolderListing.ts`, `TrackerCreation.ts`: use the moved types; report unreadable records with a
  key.
- Change every file that names `TrackerChange` (`grep -rl TrackerChange src cli bridge`, 46 files today, 28 of them
  shipping), `MalformedTicketFile`, `MalformedEpicFile` or `MalformedDraftFile`, and `cli/utils/OutputUtil.ts`
  (`reportIgnoredTicketFiles`, `reportIgnoredEpicFiles`, `reportIgnoredDraftFiles`, `ignoredTicketFileText`).
- Create `src/testing/FixtureRecordAllocation.ts`: a `RecordAllocation` for specs that build a transaction by hand.
- Change `src/StoreBoundary.spec.ts`: the entries whose line text changed or disappeared.

**What to do.**

1. Write the types of Interfaces introduced into `BoardRecords.ts` and `BoardTransaction.ts`, exactly.
2. Rename `TrackerChange` to `BoardTransaction` everywhere, importing it from `BoardTransaction.ts`; delete the
   interface from `TrackerPipeline.ts`. Keep every member it had (`board`, `workspace`, `at`, `unreadablePipeline`,
   `storedLogEntryCount`, `storedLogRecords`, `deleteAllTicketFilesAfterwards`), replace `malformedTickets`,
   `malformedEpics` and `malformedDrafts` with `unreadableRecords: UnreadableRecords`, and add `records`. `workspace`
   stays on the transaction until WP5.11 strips the record paths out of `Workspace`.
3. Report unreadable records with a key. In `TicketStore.ts` the key of an unreadable ticket file is
   `identifierInFileName(fileName)` (`:187`), `null` when the name carries none; for a file listed because its name and
   `id` disagree, or because another file holds the same `id` (`:83-99`), the key is the `id` it holds. In
   `StoreFolderListing.ts` the key of an unreadable epic or draft is the file name without its extension (`keyInName`,
   `:44`). `location` is today's `filePath`. `record` is `'ticket'`, `'epic'` or `'draft'`.
4. Write `createLocalRecordAllocation(workspace, board, unreadableRecords)` in `LocalRecordAllocation.ts`:
   - `newTicket(input)` calls `createTicket(workspace, board, input)` (`TicketStore.ts:149`); the Board satisfies
     `TicketsSpentInHold` as today.
   - `newEpicLocation(epicKey)` returns `epicFilePathOf(workspace, epicKey)`, and first throws
     `OperationRefusal('refused', { kind: 'unreadable-file-in-the-way', filePath, record: 'epic' })` when an unreadable
     epic record has that key, as `FilingControls.ts:11-13` does today.
   - `requireDraftKeyIsFree(draftId)` throws the same refusal with `record: 'draft'` when an unreadable draft record has
     that key (`FilingControls.ts:23-25`).
   - `locationOf(reference)` returns the path of the record the reference names (the progress file, the pipeline, the
     pipeline setup record, the gate profiles, the constitution sources, the log, the hold journal for
     `unfinished-write`, a ticket by id from the Board's tickets or the unreadable records, an epic or draft by key). A
     ticket id that no listing names answers the path a new ticket of that id would get without a slug,
     `<tickets>/<id>.md`.
   - `writeTracker` builds the allocation after `openBoard` and passes it to the mutation as `records`.
5. The listings' `malformed` members (`TicketStore.ts:31`, `EpicStore.ts:17`, `DraftStore.ts:17`) become `unreadable`,
   and `TicketListing` drops `verdict`. Rename `TrackerWritten.malformedTickets` and `malformedEpics` to
   `unreadableRecords`; `OutputUtil`'s reporters take `readonly UnreadableRecord[]` and print `location` where they
   printed `filePath`, with the same words.
6. The specs that build a change by hand (`grep -rln deleteAllTicketFilesAfterwards src cli`: the specs of
   `SettingControls`, `GateProfileControls`, `PipelineAgentControls`, `PipelineSetupControls`, `BoardLifetimeControls`
   and `TrackerPipeline`) gain `records` and `unreadableRecords`. `FixtureRecordAllocation.ts` answers tickets with the
   next free id under the fixture tickets folder of `BoardFixtures` (`src/testing/BoardFixtures.ts:63` today, imported
   as `tracker-model/testing/BoardFixtures` after stage 4) and refuses nothing, so no spec
   writes its own.
7. Update the allowlist entries whose text changed: an import of `TrackerChange` from `TrackerPipeline.ts` that became
   an import of `BoardTransaction` from `BoardTransaction.ts` is no longer a finding; delete that entry.

**Specs.**

- `src/services/tracker/LocalRecordAllocation.spec.ts`: two tickets allocated in one hold get consecutive ids and
  distinct slugs; an epic key held by an unreadable file is refused `unreadable-file-in-the-way`; a draft key held by an
  unreadable file is refused; `locationOf` answers a path inside the data folder for each reference kind.
- `src/services/tracker/TicketStore.spec.ts`, `StoreFolderListing.spec.ts`: each unreadable entry carries its key, and
  `null` for a ticket file whose name carries no number.
- `src/services/tracker/TrackerPipeline.spec.ts`: `records` and `unreadableRecords` reach the mutation.

**Done when.** In `apps/forge`:
`grep -rnwE "TrackerChange|MalformedTicketFile|MalformedEpicFile|MalformedDraftFile" src cli bridge` prints nothing (the
word match keeps the tracker model's `TrackerChanges.ts` out);
`bun test --path-ignore-patterns='.claude/**' ./src/services/tracker/ ./src/services/control/` passes; the root's
`bun run verify` is green.

### WP5.4 The port, the local-files adapter and the contract spec

**Purpose.** Introduce `BoardStore` with its command face, its transaction face and its read side, the one adapter
around `writeTracker` and the readers, and the contract spec any adapter must pass. Nothing calls the port yet.

**Files.**

- Create `src/services/store/BoardStore.ts`: the port, its faces and their request and answer types. A new service unit,
  because the command face's typed results come from `src/services/control/ControlService.ts`, which the tracker service
  may not import.
- Create `src/services/store/LocalFilesBoardStore.ts`: `createLocalFilesBoardStore(options)`.
- Create `src/services/store/BoardStore.contract.spec.ts`: the contract.
- Create `src/services/store/LocalFilesBoardStore.spec.ts`: what only the local adapter promises.
- Change `src/ImportDirection.spec.ts`: the layer `store-service`.
- Change `src/StoreBoundary.spec.ts`: a test that every `*BoardStore.ts` adapter of `src/services/store/` is named by
  the contract spec.

**What to do.**

1. In `src/ImportDirection.spec.ts`: add `'store-service'` to the `Layer` union (`:47-51`), to `SOURCE_LAYERS` between
   `'control-service'` and `'overseer-service'` (`:79-81`), and to `LAYER_REACH` as `'store-service': ['lib', 'shared',
   'adapters', 'render-service', 'tracker-service', 'lifecycle-service', 'control-service', 'store-service',
   'workspace-package']`; in the unit switch (`:236-241`) map `unitFolder === 'store'` to `'store-service'`. Add planted
   cases beside `:674-705`: a control file importing `../store/BoardStore.ts` is `layer-imports-upward`; a store file
   importing `../control/ControlService.ts` and an overseer file importing `../store/BoardStore.ts` pass.
2. Write `BoardStore.ts` exactly as in Interfaces introduced.
3. Write `createLocalFilesBoardStore({ workspace, now, lockHolderIsGone, afterFileWritten })` returning a frozen
   `BoardStore`:
   - `commands.apply(request)` runs `writeTracker({ workspace, at: request.at, now, lockHolderIsGone, afterFileWritten,
     mutate: (transaction) => ControlService.apply(request.command, transaction, request.context) })` and answers `{
     outcome: written.result.outcome, result: written.result.result, board: written.board, unreadableRecords:
     written.unreadableRecords }`.
   - `transactions.transact(request)` runs `writeTracker` with `request.mutate` and answers `{ result, board,
     unreadableRecords }`. It adds no timeout and no retry: the hold lasts as long as the mutation.
   - `reads.readBoard()` returns `readTracker(workspace)` mapped to `StoredBoardReading`, with `unfinishedWrite` from
     `readHoldJournal(workspace)` (`absent` → `{ verdict: 'none' }`, `readable` → `{ verdict: 'pending' }`, `malformed`
     → `{ verdict: 'malformed', location: holdJournalFilePathOf(workspace), reason }`). `requireBoard()` is
     `requireTracker(workspace)`; `requireProgress()` is `requireProgressFile(workspace)`.
   - `reads.readPipeline()` is `PipelineFile.read(workspace.pipelineFilePath)`; `reads.storedPipelineText()` moves the
     logic of `pipelineFileTextOf` (`cli/overseer/routes/BoardStateReader.ts:133-137`) without its `verdict` argument:
     the stored text when the file is readable as text, else `null`.
   - `reads.readGateProfiles()` is `GateProfilesFile.read(workspace.gateProfilesFilePath)`.
   - `reads.readLogRecords()` moves `logRecordsIn` (`cli/overseer/routes/OverseerRoutes.ts:88-91`) and answers a verdict
     instead of an empty list.
   - `reads.listTickets()` is `listTickets(workspace)`.
   - `reads.readUnfinishedWrite()` is the mapping above, alone.
   - `reads.revision()` moves `fileTextOrEmpty` (`DrivePass.ts:377-383`) and the three digest lines (`:407-409`): the
     sha256, in hex, of the progress file's text, `\0`, the log's text, `\0`, the gate profiles' text, `\0`; a missing
     or unreadable file reads as empty.
   - `reads.locationOf(reference)` answers what `LocalRecordAllocation` answers, read from a fresh listing.
   - `initialise(newTracker)` is `createTracker(workspace, newTracker, now, lockHolderIsGone)`.
4. Write the contract spec with `runPortContract` (`src/testing/PortContract.ts:14`). The subject type is `() =>
   Promise<BoardStoreUnderContract>` with `{ store: BoardStore; anotherClientOfTheSameBoard: () => BoardStore }`; the
   local subject makes a scratch directory with `createScratchDirectory('board-store')`, builds a store on
   `workspacePathsFor(directory)` with a fixed `now` and `lockHolderIsGone: () => false`, awaits `initialise` with `{
   project: 'Example Agency', startedAt: <fixed stamp>, trackerId: 'example-tracker' }`, and answers a second store
   built from the same options as `anotherClientOfTheSameBoard`. Every command uses the context of
   `src/testing/EchoedControlContext.ts`. The clauses are the ones listed under Specs below; each uses only the port.
5. Write the local adapter's own spec for what the contract cannot ask of every adapter (listed under Specs).
6. In `src/StoreBoundary.spec.ts` add "every board store adapter is named by the contract": every shipping file matching
   `/^src\/services\/store\/\w+BoardStore\.ts$/` other than `BoardStore.ts` is named on a code line of
   `src/services/store/BoardStore.contract.spec.ts`, with a planted adapter that no contract names failing, as
   `PlatformBoundary.spec.ts:397-430` does for platform adapters.

**Specs.**

`BoardStore.contract.spec.ts`, one clause each, run against `LocalFilesBoardStore on a scratch tracker`:

- A new board reads as readable, with no ticket, epic or draft, no unreadable record and no unfinished write.
- A command's change is in the board it answers and in every later read: `concurrency-set` with limit 2, then
  `requireProgress()` holds 2.
- A command that changes nothing answers `nothing-to-do` and leaves the revision as it was: `draft-open` by `Alex
  Example`, then `draft-claim` of the same draft by `Alex Example` (`src/lib/tracker-model/Drafts.ts:44`).
- A command the Board refuses changes nothing and leaves as `OperationRefusal` `refused` with detail `board-refusal`:
  `draft-claim` of that draft by `Example Agency` without `forces` (`Drafts.ts:45`); the revision is unchanged.
- A transaction's changes are in the board it answers and in every later read, and its result is answered.
- A transaction that throws changes nothing; a thrown `BoardRefusal` leaves as `OperationRefusal` `refused`
  `board-refusal`, any other throw leaves as itself.
- Two transactions started together run one after the other: each reads the concurrency limit and sets it one higher,
  and the limit ends two higher.
- A command waits for a transaction that holds the board, also across an `await` inside the transaction: the command's
  change is not visible inside the transaction and is visible after it. Use `parkingLockRetries`
  (`src/testing/LockRetryWaits.ts:11`) so no retry interval is slept.
- The revision changes with a write that changes the progress record or the log, and a read changes nothing.
- A second client of the same board sees every write of the first.
- `records.newTicket` inside one transaction gives rising ids, and a later transaction continues past them.
- A transaction's `at` is the stamp it was given, and the records it logs carry it.

`LocalFilesBoardStore.spec.ts`:

- A write cut short after its first file (an `afterFileWritten` that throws) is finished by the next write of another
  store over the same folder, and `readUnfinishedWrite()` answers `pending` between the two.
- A malformed hold journal reads as `malformed` with the journal's location, and every write refuses
  `malformed-hold-journal` (`HoldJournal.ts:142-144`).
- An unreadable ticket file is listed with its key and is not on the Board.
- `revision()` is unchanged by a hand edit of a ticket body, and changed by a hand edit of the progress file: the limit
  of the revision is part of its contract (Traps).
- A read answers at once while another store holds the lock: the read side takes no lock.
- `locationOf` answers paths inside the data folder.
- `initialise` on an existing tracker answers `already-exists` and writes nothing.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**' ./src/services/store/
./src/ImportDirection.spec.ts ./src/StoreBoundary.spec.ts` passes; the root's `bun run verify` is green.

### WP5.5 Appliers and lookups through the transaction's records

**Purpose.** No command applier and no ticket lookup names a record's path or parses a record's file name.

**Files.** Change `src/services/control/TicketControls.ts`, `FilingControls.ts`, `SettingControls.ts`,
`ControlTicketLookup.ts`, `cli/tickets/utils/TicketLookupUtil.ts`, `src/services/overseer/UnreadablePipelineGate.ts`,
their specs, and `src/StoreBoundary.spec.ts`.

**What to do.**

1. `TicketControls.ts:49`: `createTicket(change.workspace, change.board, {…})` becomes
   `transaction.records.newTicket({…})`; drop the import of `TicketStore.ts`.
2. `FilingControls.ts`: `addEpic` takes `filePath` from `transaction.records.newEpicLocation(command.key)`, which
   refuses for itself; `openDraft` calls `transaction.records.requireDraftKeyIsFree(result.draft.id)` after
   `board.openDraft` (the refusal leaves before the hold writes, so the Board change is dropped). Drop the imports of
   `DraftStore.ts` and `EpicStore.ts`.
3. `SettingControls.ts:11`: `filePath` is `transaction.records.locationOf({ record: 'pipeline' })`.
4. `ControlTicketLookup.ts:11-17` and `TicketLookupUtil.ts:11-18`: match an unreadable ticket by `record === 'ticket' &&
   key === TicketIdUtil.parseTicketReference(reference)`; drop `basename` and the file-name patterns. The refusal
   details keep their field names (`filePath`, `line`, `reason`), filled from `location`.
5. `UnreadablePipelineGate.ts:12`: replace `TRACKER_FILES.PIPELINE_FILE_NAME` with an exported constant
   `UNREADABLE_PIPELINE_STEP = 'stored-pipeline'` in the same file. Search the Bridge and the wording utils for a reader
   of the step value `pipeline.json` (`grep -rn "'pipeline.json'" bridge src cli`) and change any that keys on it.
6. Remove the entries of these files from the allowlist.

**Specs.** `TicketControls.spec.ts`: a filed ticket is the ticket `records.newTicket` answered. A new
`src/services/control/FilingControls.spec.ts`: an epic and a draft over an unreadable file are refused
`unreadable-file-in-the-way` with that file's location. `ControlTicketLookup` through `TicketControls.spec.ts`: a
reference to an unreadable ticket is `unrepaired` `malformed-ticket-file`, also for a file named `<id>.md`. Update the
merged-tree gate spec that asserts the step.

**Done when.** `grep -rn "createTicket\|epicFilePathOf\|draftFilePathOf\|basename" src/services/control
cli/tickets/utils` finds no call; the allowlist holds no entry of these files; the root's `bun run verify` is green.

### WP5.6 By-hand verbs become commands: task, log, namespace

**Purpose.** Every CLI verb that changes the board applies a `ControlCommand`, so the CLI needs only the command face.
This package converts the `task`, `log` and `namespace` verbs; WP5.7 converts the rest. The new kinds are never relayed
from a job and never accepted by the command endpoint.

**Files.**

- Create `src/services/control/TaskControls.ts` (the kinds `task-add`, `task-move`, `task-correct`, `task-remove`) and
  `src/services/control/ByHandBoardControls.ts` (`log-note`, `namespace-set`), each with a spec.
- Change `src/shared/@types/ControlCommand.ts`, `src/services/control/ControlService.ts`, `cli/constants/JobVerbs.ts`,
  `cli/ControlContract.spec.ts`, `cli/overseer/routes/CommandRoute.ts` and its contract spec,
  `src/shared/OperationRefusal.ts`, `src/adapters/utils/OperationRefusalWordingUtil.ts` and its spec,
  `docs/reference/refusals.md`, `src/services/control/ControlService.spec.ts`, `cli/tracking/task/TaskAdd.ts`,
  `TaskCommand.ts`, `TaskCorrection.ts`, `cli/tracking/log/LogCommand.ts`, `cli/tracking/namespace/NamespaceCommand.ts`.

**What to do.**

1. Add to `ControlCommand` the kinds of Interfaces introduced for this package, with their fields.
2. Write the appliers by moving each verb's mutation body into `TaskControls.ts` or `ByHandBoardControls.ts`, unchanged
   in what it does to the Board:
   - `task-add`: the body of `TaskAdd.ts:30-56`; the ticket and the reviewed ticket are looked up with
     `board.ticketByReference`; a reference with no ticket throws `OperationRefusal('refused', { kind:
     'task-ticket-missing', option: 'ticket' | 'review-of', reference })`.
   - `task-move`: `board.moveTask` then `board.annotateTask` (`TaskCommand.ts:37-40`).
   - `task-correct`: `board.correctTask` then `board.annotateTask` (`TaskCorrection.ts:40-46`).
   - `task-remove`: `board.removeTask` (`TaskCorrection.ts:57`).
   - `log-note`: `board.recordNote(text, at)` and the entry `LogCommand.ts:20-23` answers.
   - `namespace-set`: the body of `setNamespace` (`NamespaceCommand.ts:103-119`), with git run at
     `transaction.workspace.rootDirectory`. Its three worded refusals become details: `{ kind:
     'namespace-board-has-jobs'; jobCount: number }`, `{ kind: 'namespace-branch-list-failed'; reason: string }` and `{
     kind: 'namespace-not-free'; refusal: BranchNamespaceRefusal; wantedNamespace: string }`
     (`src/shared/BranchNames.ts:26`). Spread both new tables into `CONTROL_APPLIERS` (`ControlService.ts:27-43`).
3. Word the four new refusal details in `OperationRefusalWordingUtil` for the command line with the sentences the verbs
   print today (`TaskAdd.ts:33-44`, `NamespaceCommand.ts:106-118`), and for the API with sentences that name no command;
   add rows to `docs/reference/refusals.md`.
4. In `cli/constants/JobVerbs.ts` add `BY_HAND_VERB_OF_CONTROL_KIND` beside `UNRELAYED_VERB_OF_CONTROL_KIND` (`:38-42`),
   mapping `task-add`, `task-move`, `task-correct`, `task-remove` to `task`, `log-note` to `log`, `namespace-set` to
   `namespace`. Exclude its keys from `RelayedControlCommandKind` (`:44`) and export `BY_HAND_COMMAND_KINDS` (its keys,
   frozen).
5. In `cli/ControlContract.spec.ts`: `VERB_OF_KIND` (`:31`) spreads the new map too; remove `task`, `log` and
   `namespace` from `NOT_RELAYABLE_MUTATING_VERBS` (`:34-55`). Rewrite the docblock of the list to say it holds only the
   verbs that apply no control command: machine setup and the Overseer's own start and stop.
6. In `cli/overseer/routes/CommandRoute.ts:52`, `COMMAND_ROUTE_KINDS` leaves out `BY_HAND_COMMAND_KINDS`, so the
   endpoint answers such a body 400 `malformed-body` as for any unknown kind; add that case to
   `CommandRoute.controlContract.spec.ts`. No system version changes: the endpoint answers exactly what it answered.
7. The verbs build the command and apply it with `ControlService.apply` inside today's `openTrackerForWriting`; WP5.8
   moves them to the command face. A verb's argument checks stay in the verb, before the command is built.

**Specs.** `TaskControls.spec.ts` and `ByHandBoardControls.spec.ts`, on Board fixtures
(`tracker-model/testing/BoardFixtures`, moved there by stage 4):
each kind does what its verb did, and each new refusal leaves with its detail. `ControlService.spec.ts`: an example
command per new kind in its table. `OperationRefusalWordingUtil.spec.ts`: each new detail is worded for both channels.
`ControlContract.spec.ts`: passes with the shorter list. The existing verb specs under `cli/tracking/` pass with the
printed text unchanged; where a refusal sentence changed, the spec changes with it.

**Done when.** `grep -n "openTrackerForWriting" cli/tracking/task cli/tracking/log cli/tracking/namespace` shows only
calls whose mutation is `ControlService.apply`; `bun test --path-ignore-patterns='.claude/**'
./cli/ControlContract.spec.ts ./src/services/control/ ./cli/tracking/` passes; the root's `bun run verify` is green.

### WP5.7 By-hand verbs become commands: tickets and epics; the deliver-by-hand fact

**Purpose.** Convert the remaining by-hand verbs, and move the live-Baton check of `ticket deliver --by-hand` out of the
CLI's mutation into the applier, through a fact the caller provides.

**Files.**

- Create `src/services/control/TicketByHandControls.ts` (`ticket-link`, `ticket-size`, `ticket-agent`,
  `ticket-introduced-by`, `ticket-release-of`, `ticket-rereview`, `ticket-reopen`, `ticket-status-set`) and
  `src/services/control/EpicByHandControls.ts` (`epic-edit`, `epic-remove`), each with a spec.
- Change `src/shared/@types/ControlCommand.ts`, `src/shared/@types/ControlContext.ts`,
  `src/services/control/ControlService.ts`, `src/services/control/TicketControls.ts` (`deliverTicketByHand`, `:117`),
  `cli/CommandControlContext.ts`, `src/services/overseer/HatchInbox.ts` (`RELAYED_COMMAND_CONTEXT`, `:45`),
  `src/testing/EchoedControlContext.ts`, `cli/constants/JobVerbs.ts`, `cli/ControlContract.spec.ts`,
  `src/shared/OperationRefusal.ts`, `src/adapters/utils/OperationRefusalWordingUtil.ts`, `docs/reference/refusals.md`,
  `cli/tickets/TicketSettingSubcommands.ts`, `TicketIntroducedBy.ts`, `TicketReleaseMarker.ts`,
  `TicketMoveSubcommands.ts`, `TicketTransition.ts`, `ReviewBarRequest.ts`, `cli/epics/EpicChangeSubcommands.ts`,
  `cli/overseer/routes/CommandRoute.ts`.

**What to do.**

1. Add the kinds of Interfaces introduced for this package to `ControlCommand`, and to `BY_HAND_VERB_OF_CONTROL_KIND`:
   `ticket link`, `ticket size`, `ticket agent`, `ticket introduced-by`, `ticket release-of`, `ticket rereview`, `ticket
   reopen`, `ticket status`, `epic edit`, `epic remove`. Remove those verbs from `NOT_RELAYABLE_MUTATING_VERBS`.
2. Move each mutation body into its applier: the ticket is resolved with `ticketIdOfReference`
   (`src/services/control/ControlTicketLookup.ts:20`) in place of the CLI's `TicketLookupUtil.requireTicket`; the review
   bar of `ticket-rereview` is started in the applier, so move `reviewBarStartedFor`
   (`cli/tickets/ReviewBarRequest.ts:35`) into `TicketByHandControls.ts` and leave `reviewBarRequestFrom` in the CLI.
   `ticket-reopen` moves to `pending` with `checksLegality: true`; `ticket-status-set` moves to the given status with
   `checksLegality: false` (`TicketTransition.ts:40-50`). `epic-edit` answers `{ ...result, rollup:
   board.epicRollupOf(result.epic) }` (`EpicChangeSubcommands.ts:76-82`).
3. Values the CLI read from the Board inside the hold and only prints (the unsettled dependencies of a moved ticket,
   `TicketTransition.ts:48`; the Next line) are read after the write from the board the command face answers (WP5.8).
   Until WP5.8, keep them inside the mutation callback, beside the `ControlService.apply` call.
4. The deliver-by-hand fact: add to `ControlContext` `liveOverseerOf: (dataFolder: string) => { url: string;
   batonFilePath: string } | null`. `deliverTicketByHand` (`TicketControls.ts:117`) calls it with
   `transaction.workspace.trackerDirectory` first and throws `OperationRefusal('refused', { kind:
   'overseer-owns-the-lifecycle', url, batonFilePath })` when it answers a value, as `TicketMoveSubcommands.ts:68-73`
   does today. `cli/CommandControlContext.ts` becomes `commandControlContextOf(platformPorts)` for the command line,
   whose `liveOverseerOf` is the Baton lookup of `TicketMoveSubcommands.ts:68-72` (`Baton.newestBatonOf`,
   `overseerFilesIn`, `Baton.batonFilePathFor`); the command endpoint (inside the live Overseer) and
   `RELAYED_COMMAND_CONTEXT` answer `null`, since there the Overseer applies the command in its own hold
   (`docs/cli.md:590`). `src/testing/EchoedControlContext.ts` answers `null`.
5. Word any new refusal detail as in WP5.6; add the rows to `docs/reference/refusals.md`.

**Specs.** `TicketByHandControls.spec.ts`, `EpicByHandControls.spec.ts`: each kind does what its verb did. A
`TicketControls.spec.ts` case: `ticket-deliver-by-hand` with a context whose `liveOverseerOf` answers a value is refused
`overseer-owns-the-lifecycle` and writes nothing; with `null` it delivers. `ControlContract.spec.ts`:
`NOT_RELAYABLE_MUTATING_VERBS` holds only `init`, `update`, `oversee`, `start`, `stop`, `login-item add`, `login-item
remove`. The existing specs of these verbs under `cli/tickets/` and `cli/epics/` pass.

**Done when.** Every hit of `grep -rn openTrackerForWriting cli` outside `cli/overseer/` and the `testing/` folders
passes a mutation whose whole body is one `ControlService.apply` call (read each hit); the root's `bun run verify` is
green.

### WP5.8 The CLI and the command endpoint write through the store

**Purpose.** The CLI and the command endpoint apply every command through `commands.apply`; the Overseer process's own
board records go through `transactions.transact`. `cli/OpenTrackerForWriting.ts` is deleted.

**Files.**

- Create `cli/BoardStoreOf.ts`: `boardStoreOf(context): { workspace: Workspace; store: BoardStore }`, the CLI's
  composition root of the port (it imports `createLocalFilesBoardStore`, the one allowlisted import of the adapter).
- Create `cli/ApplyCommandOfVerb.ts`: `applyCommandOfVerb(commandArguments, context, command)` and
  `applyCommandOfVerbThenReadNextLine(…)`.
- Create `cli/overseer/OverseerBoardWrites.ts`: `writeAsTheOverseer(store, context, workspace, mutate)`, the Overseer
  process's transaction with the registry update after it.
- Delete `cli/OpenTrackerForWriting.ts`.
- Change every caller of `openTrackerForWriting` and `openTrackerForWritingThenReadNextLine` (`grep -rln
  "openTrackerForWriting" cli`), `cli/overseer/routes/CommandRoute.ts`, `cli/RecordedIncidentMove.ts`,
  `cli/overseer/OverseerForeground.ts` (the five write sites only), `cli/overseer/OverseerFlintBrain.ts` (`:74`),
  `cli/testing/OverseerTicketMoves.ts`, their specs, and `src/StoreBoundary.spec.ts`.

**What to do.**

1. `boardStoreOf(context)`: `const workspace = requireWorkspace(context.currentDirectory)`; build
   `createLocalFilesBoardStore({ workspace, now: context.now, lockHolderIsGone:
   context.platformPorts.processSupervision.processIsGone })`.
2. `applyCommandOfVerb` keeps every step of `writeTrackerForCommand` (`OpenTrackerForWriting.ts:15-35`) in order: refuse
   `verb-not-relayable` when `context.job` is set, before the store is touched; `boardStoreOf`; the `--at` stamp;
   `store.commands.apply({ command, at, context: commandControlContextOf(context.platformPorts) })`; report
   `unreadableRecords` on standard error; `registerWrittenTracker`; the nudge (`:41-49`), after the lock is released. It
   answers the `CommandWritten`. The `…ThenReadNextLine` form adds `NextLineUtil.nextLineOf(written.board)`.
3. Switch every verb: a call `openTrackerForWriting(arguments, context, (change) => ControlService.apply(command,
   change, COMMAND_CONTROL_CONTEXT).result)` becomes `(await applyCommandOfVerb(arguments, context, command)).result`. A
   value the verb printed from the Board inside the hold (WP5.7, step 3) is read from `written.board`.
4. `CommandRoute.ts:161`: the route receives the Overseer's store (passed in its `CommandRouteRequest`, built once by
   WP5.10; until then, `boardStoreOf(request.context)`), applies with `store.commands.apply` and the endpoint's context
   (`liveOverseerOf` answers `null`), and answers `appliedAnswerOf({ outcome, result })` as before. Its refusal and
   `TypeError` handling (`:163-168`) are unchanged.
5. `OverseerForeground.ts:171`, `:561-566`, `:655`, `:677`, `:690` and `OverseerFlintBrain.ts:74`: each becomes
   `writeAsTheOverseer(store, context, workspace, (transaction) => …)` with the same Board call; `writeAsTheOverseer`
   runs `store.transactions.transact({ at: context.now() formatted as today, mutate })`, then `registerWrittenTracker`.
   It sends no nudge: the writer is the Overseer itself.
6. `cli/testing/OverseerTicketMoves.ts`: applies its Overseer moves through `transactions.transact` of a store from
   `boardStoreOf`. It is testing code; the guard does not scan it.
7. Remove the allowlist entries of every switched file; add the one entry `cli/BoardStoreOf.ts: store-internal-import:
   <its import line>` with the reason "The CLI's composition root picks the store's adapter."

**Specs.** `cli/ApplyCommandOfVerb.spec.ts`: a verb under a job is refused `verb-not-relayable` before any file is read;
an unreadable ticket file is reported on standard error after a write and the exit code is 0; the nudge is sent after
the lock is released (observe through the store: a read during the nudge is not blocked). `CommandRoute` specs pass
unchanged in what they assert. Every verb spec passes.

**Done when.** `cli/OpenTrackerForWriting.ts` does not exist; `grep -rn "writeTracker\|ControlService.apply" cli` finds
no shipping line; the root's `bun run verify` is green; the end-to-end check of the whole stage passes on a scratch
board up to `jobs`.

### WP5.9 The CLI reads through the read side

**Purpose.** No CLI verb outside the Overseer process reads a record except through `store.reads`, and `init` creates
the board through `initialise`.

**Files.** Change the read sites of the Today's code table in `cli/tracking/status/StatusCommand.ts`,
`cli/tickets/TicketList.ts`, `cli/tickets/TicketReadingSubcommands.ts`, `cli/epics/EpicCommand.ts`,
`cli/drafts/DraftCommand.ts`, `cli/decisions/DecisionsCommand.ts`, `cli/incidents/IncidentsCommand.ts`,
`cli/jobs/JobsCommand.ts`, `cli/jobs/JobCommand.ts`, `cli/merges/MergesCommand.ts`,
`cli/measurement/review-stats/ReviewStatsCommand.ts`, `cli/tracking/await/AwaitCommand.ts`,
`cli/dispatch/concurrency/ConcurrencyCommand.ts`, `cli/tracking/namespace/NamespaceCommand.ts`,
`cli/gates/GatePipelineVerbs.ts`, `cli/adoption/init/InitCommand.ts`, `cli/setup/login-item/LoginItemCommand.ts`,
`cli/overseer/OverseerCommand.ts`, `cli/overseer/StartCommand.ts`, `cli/overseer/StopCommand.ts`,
`cli/RegisterWrittenTracker.ts`, `src/services/tracker/MonitorRegistration.ts`, their specs, and
`src/StoreBoundary.spec.ts`.

**What to do.**

1. Each `requireTracker(workspace)` becomes `store.reads.requireBoard()`; each `requireProgressFile(workspace)` becomes
   `store.reads.requireProgress()`; `listTickets(workspace)` and `readTicket(workspace, reference)` become
   `store.reads.listTickets()` and a find over it by `TicketIdUtil.parseTicketReference`.
2. `StatusCommand.ts:39-43`: `store.reads.readUnfinishedWrite()`; on `malformed` print the same sentence with `location`
   where it printed `holdJournalFilePathOf(workspace)`.
3. `DraftCommand.ts:49`: the draft's path is `store.reads.locationOf({ record: 'draft', draftId })`.
4. `GatePipelineVerbs.ts:222-225`: `store.reads.readPipeline()`; the refusals take `filePath` from
   `store.reads.locationOf({ record: 'pipeline' })`.
5. `InitCommand.ts:160`: `store.initialise({…})`; `:172` reports `store.reads.listTickets().unreadable`; `:66`
   `store.reads.requireProgress()`.
6. `MonitorRegistration.ts`: `MonitorRegistrationRequest` (`:26-41`) loses `workspace`'s record use: it takes
   `rootDirectory`, `htmlFilePath`, `progress: ProgressRegistrationReading` (`{ verdict: 'readable'; trackerId; project
   } | { verdict: 'absent' } | { verdict: 'unreadable'; reason }`) and `progressLocation: string`; the reading at
   `:140-142` moves to the caller. `cli/RegisterWrittenTracker.ts` builds both from `store.reads.requireProgress`
   (caught as a verdict) and `store.reads.locationOf({ record: 'progress' })`. The registry file keeps its
   `progressJson` field (Needs the owner, item 4).
7. Remove the switched files' allowlist entries.

**Specs.** The existing verb specs pass with the same output. `MonitorRegistration` specs build the request with the new
fields. A `StatusCommand` spec: a malformed hold journal prints its location and `status` still prints the board.

**Done when.** `grep -rnE "tracker/(TrackerReader|TicketStore|EpicStore|DraftStore|HoldJournal|TrackerCreation)\.ts"
cli` finds no shipping line (specs and `testing/` folders aside); the allowlist holds no entry of the files above; the
root's `bun run verify` is green.

### WP5.10 The Overseer's pass, server and reads through the store

**Purpose.** The Overseer process builds one store at its start and hands it to the pass, the Airlocks' hold runner,
gate profiling, pipeline checks, the reconnect at start, the HTTP routes and its own records. The pass changes the board
only through `transactions.transact` and reads only through `reads`.

**Files.** Change `src/services/overseer/DrivePass.ts`, `src/services/overseer/Regrouping.ts` (or the module stage 2 put
in its place), `cli/overseer/OverseerForeground.ts`, `cli/overseer/OverseerFlintBrain.ts`,
`cli/overseer/routes/BoardStateReader.ts`, `cli/overseer/routes/OverseerRoutes.ts`,
`cli/overseer/routes/CommandRoute.ts` (the store from its request), `src/testing/DrivePassHarness.ts`, their specs, and
`src/StoreBoundary.spec.ts`.

**What to do.**

1. `DrivePassRequest` (`DrivePass.ts:181`) gains `boardStore: BoardStore`. `OverseerForeground.ts` builds it once with
   `createLocalFilesBoardStore({ workspace, now, lockHolderIsGone: platformPorts.processSupervision.processIsGone })`
   and passes it to the pass, to `writeAsTheOverseer` (replacing WP5.8's per-call store), to the routes and to the
   command route. Add an allowlist entry for this import line, with the reason "The Overseer's composition root picks
   the store's adapter."
2. `holdTracker` (`DrivePass.ts:1085-1098`) runs `request.boardStore.transactions.transact({ at, mutate })` with the
   same body: the Baton check first, the copy of the jobs, the mutation, the token credit. `AirlockHoldRunner`
   (`Airlocks.ts:54`) and `AirlockHold` keep their shapes.
3. `runOnePass` (`DrivePass.ts:1253-1345`) runs `transactions.transact` with the same mutation; the pass reads
   `written.result` and `written.board` as before.
4. `observe` (`:424`, `:453`): `request.boardStore.reads.requireProgress()` and `reads.readPipeline()`. `fingerprintOf`
   (`:396-419`) takes the revision in place of the workspace and digests `revision ${boardStore.reads.revision()}\n`
   where the three file digests were; delete `fileTextOrEmpty`.
5. `:982` and `:1208`: `reads.requireProgress()`. `:1171`: `reads.readPipeline()`, still read afresh at every gate run.
6. Regrouping (`Regrouping.ts:224`), or stage 2's reconnect: `reads.requireProgress()`.
7. `OverseerForeground.ts:269`, `:275`, `:339`, and `OverseerFlintBrain.ts:42`: `reads.requireProgress()`.
8. `BoardStateReader.ts:133-137`, `:153`: `reads.requireBoard()` and `reads.storedPipelineText()`.
9. `OverseerRoutes.ts:76-79`, `:88-91`, `:153`, `:161`: `reads.readGateProfiles()` and `reads.readLogRecords()` (an
   unreadable log still names no sender, as `:87` says).
10. `src/testing/DrivePassHarness.ts`: build the store for the harness's scratch workspace.
11. Remove the switched files' allowlist entries.

**Specs.** The DrivePass specs pass with their assertions unchanged; a new `DrivePass` case: a write by another client
of the store between two wakes is seen by the next pass, and an unforced wake with no write is skipped by the
fingerprint. The routes' specs pass. The crash matrix (`CrashMatrix.integration.spec.ts`) is not run by `verify`; run it
only when the owner asks (`apps/forge/CLAUDE.md:20`).

**Done when.** `src/StoreBoundary.spec.ts`'s allowlist holds no entry of `src/services/overseer/` or `cli/overseer/` but
the composition-root import of `OverseerForeground.ts`; the root's `bun run verify` is green; the end-to-end check of
the whole stage passes in full.

### WP5.11 The record paths leave `Workspace`; the guard's final form

**Purpose.** No type outside the adapter carries a record path. `Workspace` is the board's place; the record layout is
the adapter's. The allowlist holds only the composition roots.

**Files.**

- Create `src/services/tracker/LocalStoreLayout.ts`: `localStoreLayoutOf(workspace)` and
  `boardIsStoredAt(rootDirectory)`.
- Create `src/services/tracker/constants/LocalStoreFiles.ts` (`LOCAL_STORE_FILES`), and delete
  `src/services/tracker/constants/TrackerFiles.ts` and its spec (move its cases to `LocalStoreFiles.spec.ts`).
- Change `src/services/tracker/Workspace.ts`, every adapter file (`TrackerPipeline.ts`, `TrackerReader.ts`,
  `TicketStore.ts`, `EpicStore.ts`, `DraftStore.ts`, `HoldJournal.ts`, `TrackerLock.ts`, `TrackerCreation.ts`,
  `LocalRecordAllocation.ts`, `src/services/store/LocalFilesBoardStore.ts`), `cli/InstalledFiles.ts`,
  `cli/adoption/init/InitCommand.ts`, every spec and testing helper that reads a record field of a `Workspace` (found
  with the grep below), and `src/StoreBoundary.spec.ts`.

  ```sh
  grep -rlE "progressFilePath|pipelineFilePath|pipelineSetupFilePath|gateProfilesFilePath|constitutionSourcesFilePath|ticketsDirectory|epicsDirectory|draftsDirectory|lockDirectoryPath|logFilePath" src cli bridge
  ```

  The names `lockDirectoryPath` and `logFilePath` also stand for the registry's lock and the Overseer's log; change only
  the hits that read a `Workspace`.

**What to do.**

1. `LocalStoreLayout` holds `progressRecordPath`, `pipelineRecordPath`, `pipelineSetupRecordPath`,
   `gateProfilesRecordPath`, `constitutionSourcesRecordPath`, `logRecordPath`, `ticketRecordsFolder`,
   `epicRecordsFolder`, `draftRecordsFolder`, `storeLockFolder`, `holdJournalPath`, all absolute, built by joining
   `LOCAL_STORE_FILES` names onto `workspace.trackerDirectory` as `workspacePathsFor` does today (`Workspace.ts:34-52`).
   `boardIsStoredAt(rootDirectory)` is today's `directoryHoldsATracker` (`:55-63`).
2. `Workspace` keeps `rootDirectory`, `trackerDirectory` and `htmlFilePath`. `workspacePathsFor` builds those three;
   `findWorkspace` asks `boardIsStoredAt`. `progress.html` keeps its name in a constant private to `Workspace.ts`.
3. `LOCAL_STORE_FILES` holds the record names of today's `TRACKER_FILES` (`TrackerFiles.ts:5-17` without
   `TRACKER_DIRECTORY_NAME` and `HTML_FILE_NAME`). `cli/InstalledFiles.ts` and `InitCommand.ts:157` use
   `PRODUCT_NAMES.DATA_FOLDER`.
4. Every adapter file takes its paths from `localStoreLayoutOf(workspace)`; `holdJournalFilePathOf`, `epicFilePathOf`,
   `draftFilePathOf`, `everyTicketFilePathIn` and `everyEpicFilePathIn` stop being exported where only the adapter calls
   them.
5. Testing helpers (`src/testing/TrackerFileFixtures.ts`, `src/testing/TrackerIsolation.ts`, `cli/testing/Stored*.ts`,
   `bridge/testing/HeadlessBridgeCheck.ts`) and specs that seed or read record files use `localStoreLayoutOf`; they may
   import the adapter, as testing code.
6. Tighten the guard: add `/\b(?:localStoreLayoutOf|LocalStoreLayout|boardIsStoredAt)\b/` and
   `/\b\w+(?:RecordPath|RecordsFolder)\b|\bstoreLockFolder\b|\bholdJournalPath\b/` to `record-path-name`; check first
   with `grep -rnE "\w+(RecordPath|RecordsFolder)\b" src cli bridge ../../packages` that no other identifier ends so.
   The allowlist now holds exactly the two composition-root lines (`cli/BoardStoreOf.ts`,
   `cli/overseer/OverseerForeground.ts`).

**Specs.** `LocalStoreLayout.spec.ts`: every path is inside the data folder and distinct; `boardIsStoredAt` is true only
where the progress record is a file. `Workspace.spec`s pass with three fields. `StoreBoundary.spec.ts`: the planted
forms of the new patterns; the allowlist holds the two lines.

**Done when.** `grep -rn "progressFilePath\|ticketsDirectory\|TRACKER_FILES" src cli bridge` finds nothing;
`src/StoreBoundary.spec.ts`'s allowlist has two entries; the root's `bun run verify` is green.

### WP5.12 Rules, docs and the Deviations row

**Purpose.** The rules and docs state what is true after this stage.

**Files.** Change `apps/forge/CLAUDE.md`, `apps/forge/docs/concepts/overview.md`, `apps/forge/docs/glossary.md`,
`apps/forge/docs/backlog.md`. No rule under the root's `.claude/rules/` names `writeTracker` or `TrackerChange` today;
if one does by then, it is the owner's: list it for the owner and leave it.

**What to do.**

1. `CLAUDE.md`, Imports (`:58-63`): `src/services/ (render → tracker → lifecycle → control → store → overseer)`.
2. `CLAUDE.md`, Stored files: add the rule "The core reaches a stored record only through the store port, `BoardStore`
   in `src/services/store/BoardStore.ts`: commands through its command face, the Overseer's pass through its transaction
   face, every read through its read side. Its one adapter, `LocalFilesBoardStore`, is the only code that names a
   record's path; `src/StoreBoundary.spec.ts` holds it, and `src/services/store/BoardStore.contract.spec.ts` is what any
   adapter must pass."
3. `CLAUDE.md`, Command surface (`:368-372`): "Every mutating command applies a `ControlCommand` through the store's
   command face (`cli/ApplyCommandOfVerb.ts`), whose local adapter runs `writeTracker` in
   `src/services/tracker/TrackerPipeline.ts` (lock, read into a Board, change, writes in `docs/cli.md`'s order, one lock
   hold; nothing renders), and `cli/RegisterWrittenTracker.ts` registers the tracker with the monitor after every write
   and at the Overseer's start. A verb that changes the board and is never relayed applies a by-hand kind, which the
   command endpoint refuses. …" keeping the rest of the bullet.
4. `CLAUDE.md`, Deviations: add the row of Interfaces introduced (the last subsection).
5. `docs/concepts/overview.md:190`, `:210`: the transaction is the store's transaction face, run by `writeTracker` in
   the local adapter; `:205`: a verb with no Overseer applies through `cli/ApplyCommandOfVerb.ts`.
   `docs/glossary.md:104`, `:681`: a lock hold is one write of the store's local adapter. `docs/backlog.md:30`:
   `TrackerChange.deleteAllTicketFilesAfterwards` becomes `BoardTransaction.deleteAllTicketFilesAfterwards` in
   `src/services/tracker/BoardTransaction.ts`.

**Specs.** `src/ProseWrap.spec.ts` holds the 120-column wrap of `CLAUDE.md`.

**Done when.** From the repository root, `grep -rnwE "TrackerChange|OpenTrackerForWriting|openTrackerForWriting"
--exclude-dir=research apps/forge/CLAUDE.md apps/forge/docs` prints nothing; the root's `bun run verify` is green.
`docs/research/` is a dated record and is not changed.

## Interfaces introduced

### The port: `src/services/store/BoardStore.ts`

```ts
import type { Board }                         from 'tracker-model/Board';
import type { TrackerProgress }               from 'tracker-model/TrackerProgress';
import type { GateProfilesReading }           from 'tracker-model/GateProfile';
import type { PipelineReading }               from '../../adapters/pipeline/PipelineFile.ts';
import type { ControlCommand }                from '../../shared/@types/ControlCommand.ts';
import type { ControlContext }                from '../../shared/@types/ControlContext.ts';
import type { ControlResultOf }               from '../control/ControlService.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';
import type {
  BoardContents, LogRecordsReading, NewTracker, RecordReference, StoredBoardReading, TicketListing, TrackerCreation,
  UnfinishedWriteReading, UnreadableRecords,
} from '../tracker/@types/BoardRecords.ts';

export interface BoardStore {
  readonly commands:     StoreCommandFace;
  readonly transactions: StoreTransactionFace;
  readonly reads:        StoreReadFace;
  /** Creates the board's records; an existing board is never replaced. */
  initialise(newTracker: NewTracker): Promise<TrackerCreation>;
}

export interface CommandRequest<Command extends ControlCommand> {
  command: Command;
  /** Already resolved by the caller; the Board stamps and logs with it. */
  at:      string;
  context: ControlContext;
}

export interface CommandWritten<Result> {
  /** `nothing-to-do` when the applier answered `changed: false`. */
  outcome:           'done' | 'nothing-to-do';
  result:            Result;
  /** The board as this write left it; only the caller holds it. */
  board:             Board;
  unreadableRecords: UnreadableRecords;
}

/** The face of the CLI and the command endpoint: one command, applied in one exclusive write, or refused writing nothing. */
export interface StoreCommandFace {
  apply<Command extends ControlCommand>(request: CommandRequest<Command>): Promise<CommandWritten<ControlResultOf<Command['kind']>>>;
}

export interface TransactionRequest<Result> {
  at:     string;
  mutate: (transaction: BoardTransaction) => Result | Promise<Result>;
}

export interface TransactionWritten<Result> {
  result:            Result;
  board:             Board;
  unreadableRecords: UnreadableRecords;
}

/**
 * The Overseer's face: everything `mutate` changes is written together after it returns, or nothing when it throws. The write is
 * exclusive for as long as `mutate` runs, an `await` and a git call inside it included; a remote adapter cannot offer that.
 */
export interface StoreTransactionFace {
  transact<Result>(request: TransactionRequest<Result>): Promise<TransactionWritten<Result>>;
}

/** Lock-free reads, shared by both faces: a read may see a write that is half done, and never waits for one. */
export interface StoreReadFace {
  readBoard():           StoredBoardReading;
  /** Unrepaired `unreadable-tracker` when the board cannot be read. */
  requireBoard():        BoardContents;
  /** The progress record alone; the log is not read, so a broken log does not stop it. */
  requireProgress():     TrackerProgress;
  readPipeline():        PipelineReading;
  /** The pipeline as stored, for display; `null` when none is stored or it cannot be read as text. */
  storedPipelineText():  string | null;
  readGateProfiles():    GateProfilesReading;
  readLogRecords():      LogRecordsReading;
  listTickets():         TicketListing;
  readUnfinishedWrite(): UnfinishedWriteReading;
  /**
   * The identity of the stored progress record, log and gate profile runs: equal strings mean none of the three changed. A change to a
   * ticket body, an epic or a draft alone does not change it.
   */
  revision():            string;
  /** Where a record is kept, for a report or a refusal to name; never for reading or writing it. */
  locationOf(record: RecordReference): string;
}
```

Errors: `apply` and `transact` throw `OperationRefusal('refused', { kind: 'board-refusal', boardRefusal })` for a
`BoardRefusal`, the applier's own `OperationRefusal` unchanged, `OperationRefusal('unrepaired', { kind:
'tracker-lock-held' })` when the lock cannot be taken within `LIMITS.LOCK_RETRY_COUNT` tries, `OperationRefusal(
'unrepaired', { kind: 'lock-taken-over' })` when a hold lost its lock, and `OperationRefusal('unrepaired', { kind:
'unreadable-tracker' | 'malformed-hold-journal' })`; nothing is written in any of these cases.

### The local adapter: `src/services/store/LocalFilesBoardStore.ts`

```ts
export interface LocalFilesBoardStoreOptions {
  workspace:         Workspace;
  /** The caller's clock, for the lock's records only. */
  now:               () => Date;
  /** The platform's process check; `NO_LOCK_HOLDER_READS_AS_GONE` where there is none. */
  lockHolderIsGone:  LockHolderIsGone;
  /** Called after each file a write stores; the step a spec interrupts to cut a write short. */
  afterFileWritten?: (location: string) => void;
}

export function createLocalFilesBoardStore(options: LocalFilesBoardStoreOptions): BoardStore;
```

### The transaction: `src/services/tracker/BoardTransaction.ts`

```ts
export interface BoardTransaction {
  board:                          Board;
  /** The board's place: the repository root for git and worktrees, the data folder for job folders and pictures. Never a record. */
  workspace:                      Workspace;
  at:                             string;
  records:                        RecordAllocation;
  unreadableRecords:              UnreadableRecords;
  /** The stored pipeline when the board cannot use it, older or malformed; `null` when it was read, or none is stored. */
  unreadablePipeline:             UnreadablePipelineReading | null;
  storedLogEntryCount:            number;
  storedLogRecords:               readonly LogRecord[];
  /** `clear --all`: after the progress file and the changed tickets, the epic records too; the callback gets the ticket count. */
  deleteAllTicketFilesAfterwards: (onDeleted: (deletedTicketCount: number) => void) => void;
}

export interface RecordAllocation {
  /** A ticket with the next free id and its storage location, written by this transaction's commit; only safe inside it. */
  newTicket(input: CreateTicketInput): Ticket;
  /** Refuses `unreadable-file-in-the-way` (record `epic`) when an unreadable record holds the key. */
  newEpicLocation(epicKey: string): string;
  /** Refuses `unreadable-file-in-the-way` (record `draft`) when an unreadable record holds the key. */
  requireDraftKeyIsFree(draftId: string): void;
  locationOf(record: RecordReference): string;
}
```

`CreateTicketInput` is today's (`src/services/tracker/TicketStore.ts:34-44`), moved to `@types/BoardRecords.ts`.

### The record vocabulary: `src/services/tracker/@types/BoardRecords.ts`

```ts
export type RecordKind = 'ticket' | 'epic' | 'draft';

/** A record the store holds and cannot read; it is no part of the Board. */
export interface UnreadableRecord {
  record:   RecordKind;
  /** The ticket id, epic key or draft id the record's storage names; `null` when it names none. */
  key:      string | null;
  /** Where it is kept, for the report; the local adapter's file path. */
  location: string;
  reason:   string;
  /** The line the reason points at; 0 where there is none. */
  line:     number;
}

export interface UnreadableRecords {
  tickets: readonly UnreadableRecord[];
  epics:   readonly UnreadableRecord[];
  drafts:  readonly UnreadableRecord[];
}

export type RecordReference =
  | { record: 'progress' | 'pipeline' | 'pipeline-setup' | 'gate-profiles' | 'constitution-sources' | 'log' | 'unfinished-write' }
  | { record: 'ticket'; ticketId: string }
  | { record: 'epic'; epicKey: string }
  | { record: 'draft'; draftId: string };

/** Today's `TrackerContents` (`src/services/tracker/TrackerReader.ts:20-34`), its listings' `malformed` replaced. */
export interface BoardContents {
  progress:                   TrackerProgress;
  pipelineReading:            PipelineReading;
  pipelineSetupReading:       PipelineSetupReading;
  gateProfilesReading:        GateProfilesReading;
  constitutionSourcesReading: ConstitutionSourcesReading;
  storedLog:                  StoredLog;
  listing:                    TicketListing;
  epicListing:                { epics: Epic[]; unreadable: UnreadableRecord[] };
  draftListing:               { drafts: Draft[]; unreadable: UnreadableRecord[] };
}

export interface TicketListing {
  tickets:    Ticket[];
  unreadable: UnreadableRecord[];
}

export type UnfinishedWriteReading =
  | { verdict: 'none' }
  | { verdict: 'pending' }
  | { verdict: 'malformed'; location: string; reason: string };

export type StoredBoardReading =
  | { verdict: 'readable'; contents: BoardContents; unfinishedWrite: UnfinishedWriteReading }
  | UnreadableTracker;

export type LogRecordsReading =
  | { verdict: 'readable'; records: readonly LogRecord[] }
  | { verdict: 'unreadable'; reason: string };

/** Today's, moved from `src/services/tracker/TrackerCreation.ts:10-19`. */
export interface NewTracker { project: string; startedAt: string; trackerId: string; branchNamespace?: string }
export type TrackerCreation = { verdict: 'created' } | { verdict: 'already-exists' };
```

`TicketListing` loses today's `verdict: 'listed'` member (`TicketStore.ts:29`), which carries nothing.

### `Workspace` and the local layout (WP5.11)

```ts
/** src/services/tracker/Workspace.ts: the board's place; no record path. */
export interface Workspace {
  rootDirectory:    string;
  trackerDirectory: string;
  htmlFilePath:     string;
}

/** src/services/tracker/LocalStoreLayout.ts: the local adapter's own; nothing outside the adapter imports it. */
export interface LocalStoreLayout {
  progressRecordPath:            string;
  pipelineRecordPath:            string;
  pipelineSetupRecordPath:       string;
  gateProfilesRecordPath:        string;
  constitutionSourcesRecordPath: string;
  logRecordPath:                 string;
  ticketRecordsFolder:           string;
  epicRecordsFolder:             string;
  draftRecordsFolder:            string;
  storeLockFolder:               string;
  holdJournalPath:               string;
}
export function localStoreLayoutOf(workspace: Workspace): LocalStoreLayout;
export function boardIsStoredAt(rootDirectory: string): boolean;
```

### The generation lock: `src/services/tracker/GenerationLock.ts` (WP5.2)

Exports, unchanged in shape from `TrackerLock.ts`: `withLockAt(lockDirectoryPath, action, now, holderIsGone)`,
`LockGenerationSteps`, `type LockHolderIsGone`, `NO_LOCK_HOLDER_READS_AS_GONE`, and `interface HoldFence {
requireStillHeld(): void }`, moved from `HoldJournal.ts:20-22`.

### New command kinds (WP5.6, WP5.7), added to `ControlCommand`

Never relayed from a job, never accepted by `POST /api/commands`; listed in `BY_HAND_VERB_OF_CONTROL_KIND` and
`BY_HAND_COMMAND_KINDS` (`cli/constants/JobVerbs.ts`).

```ts
  | { kind: 'task-add'; name: string; ticketReference?: string; reviewOfReference?: string; owner?: string; note?: string;
      tokens?: number; startsNow: boolean; movesTheLink: boolean }
  | { kind: 'task-move'; taskId: number; status: MovedToStatus; movesAnyway: boolean; annotation: TaskAnnotation }
  | { kind: 'task-correct'; taskId: number; correction: TaskCorrection; movesAnyway: boolean; annotation: TaskAnnotation }
  | { kind: 'task-remove'; taskId: number }
  | { kind: 'log-note'; text: string }
  | { kind: 'namespace-set'; namespace: string }
  | { kind: 'ticket-link'; ticketReference: string; taskId: number; movesTheLink: boolean }
  | { kind: 'ticket-size'; ticketReference: string; size: TicketSize }
  | { kind: 'ticket-agent'; ticketReference: string; model?: AgentModel; effort?: AgentEffort }
  | { kind: 'ticket-introduced-by'; ticketReference: string; causeTicketId: string | null }
  | { kind: 'ticket-release-of'; ticketReference: string; clears: boolean }
  | { kind: 'ticket-rereview'; ticketReference: string; reviewBar: AgentAssignment | null }
  | { kind: 'ticket-reopen'; ticketReference: string; branch?: string; commit?: string; reason?: string; tokens?: number }
  | { kind: 'ticket-status-set'; ticketReference: string; status: TicketStatus; branch?: string; commit?: string;
      reason?: string; tokens?: number }
  | { kind: 'epic-edit'; key: string; title?: string; body?: { text: string; appends: boolean } }
  | { kind: 'epic-remove'; key: string }
```

`MovedToStatus` is today's (`src/adapters/utils/StatusWordingUtil.ts`); `TaskAnnotation`, `TaskCorrection`,
`AgentAssignment` are the tracker model's (`@types/BoardChanges.ts`). Results are what the Board call answered, as each
verb's mutation returned it today. `causeTicketId` is the padded id the verb parses before the hold, `null` to clear
(`cli/tickets/TicketIntroducedBy.ts:26`, `TicketArgumentUtil.linkedTicketIdFrom`).

New refusal details: `{ kind: 'task-ticket-missing'; option: 'ticket' | 'review-of'; reference: string }`, `{ kind:
'namespace-board-has-jobs'; jobCount: number }`, `{ kind: 'namespace-branch-list-failed'; reason: string }`, `{ kind:
'namespace-not-free'; refusal: BranchNamespaceRefusal; wantedNamespace: string }`, with `BranchNamespaceRefusal` from
`src/shared/BranchNames.ts:26`.

### `ControlContext` (WP5.7)

```ts
export interface ControlContext {
  setupMessageWordingOf: (message: SetupMessage) => string;
  mainConstitutionOf:    (rootDirectory: string) => MainConstitutionReading;
  /** The live Overseer that owns the lifecycle of the board in this data folder; `null` where the applier runs inside it. */
  liveOverseerOf:        (dataFolder: string) => { url: string; batonFilePath: string } | null;
}
```

### CLI helpers (WP5.8)

```ts
// cli/BoardStoreOf.ts
export function boardStoreOf(context: CommandContext): { workspace: Workspace; store: BoardStore };
// cli/ApplyCommandOfVerb.ts
export function applyCommandOfVerb<Command extends ControlCommand>(
  commandArguments: ArgumentParser, context: CommandContext, command: Command,
): Promise<CommandWritten<ControlResultOf<Command['kind']>>>;
export function applyCommandOfVerbThenReadNextLine<Command extends ControlCommand>(
  commandArguments: ArgumentParser, context: CommandContext, command: Command,
): Promise<{ written: CommandWritten<ControlResultOf<Command['kind']>>; nextLine: string }>;
// cli/overseer/OverseerBoardWrites.ts
export function writeAsTheOverseer<Result>(
  store: BoardStore, context: CommandContext, workspace: Workspace, mutate: (transaction: BoardTransaction) => Result,
): Promise<Result>;
```

### The registry request (WP5.9)

`MonitorRegistrationRequest` (`src/services/tracker/MonitorRegistration.ts:26`) replaces `workspace` with
`rootDirectory: string`, `htmlFilePath: string`, `progress: { verdict: 'readable'; trackerId: string; project: string }
| { verdict: 'absent' } | { verdict: 'unreadable'; reason: string }` and `progressLocation: string`. The registry file's
format is unchanged.

### Guard and contract

- `src/StoreBoundary.spec.ts`: the forms `record-file-name`, `record-folder-join`, `record-path-name`,
  `record-constant`, `store-internal-import`, `stored-record-read`; the exact `STORE_ADAPTER_FILES` and
  `STORE_ADAPTER_FOLDERS`; the exact allowlist; every `src/services/store/*BoardStore.ts` adapter named by the contract.
- `src/services/store/BoardStore.contract.spec.ts`: the clauses of WP5.4, run through `runPortContract('BoardStore',
  …)`.

### The Deviations row (WP5.12)

| Rule | Done instead | Why |
| --- | --- | --- |
| Code starts beside its only consumer and moves, generalised, on a second one. | The store port `BoardStore` (`src/services/store/BoardStore.ts`) has one adapter, `LocalFilesBoardStore`, and a contract spec, `src/services/store/BoardStore.contract.spec.ts`, that any adapter must pass; `src/StoreBoundary.spec.ts` holds that no shipping code outside the adapter names a record's path. | The forge keeps a remote store possible (`docs/monorepo/hephaestus-talos.md`, sections 4 and 5): the seam is fixed before a second adapter exists, and the contract is what a second adapter must pass. |

## Traps

- **The transaction must stay one hold across `await` and git.** `writeTracker` already accepts an async mutation
  (`TrackerPipeline.ts:56`) and the landing runs git inside the hold (`Airlocks.ts:897-916`). Do not add a timeout, a
  retry or a split into "plan, then write" to `transact`: a timeout would leave the lock while git runs. The lock's own
  staleness (`LIMITS.LOCK_STALE_MILLISECONDS`, 30 seconds, `src/shared/constants/Limits.ts:3`) already lets another
  process take over a hold that runs longer, and the fence then refuses the stale holder's writes
  (`TrackerLock.ts:193-199`). Keep that behaviour exactly; do not lengthen or shorten it here.
- **Reads take no lock.** `status` takes no lock (`CLAUDE.md:372`) and the pass observes outside the hold
  (`DrivePass.ts:2-4`). Implement every `reads` member without `withLock`. A read can see a write half done; that is the
  documented limit, not a bug to fix here.
- **A command waits at most about five seconds for the lock** (`LIMITS.LOCK_RETRY_COUNT` 50 × 100 ms) and then throws
  `tracker-lock-held`, while a pass may hold the lock for a git fast-forward. This is today's behaviour; the contract
  clause on waiting must use `parkingLockRetries` so it neither sleeps nor runs out the budget.
- **The revision is narrower than "the board".** The fingerprint covers only the progress record, the log and the gate
  profile runs (`DrivePass.ts:407-409`). Widening it to every ticket would read every ticket file on every wake;
  narrowing it would let a gate profile stop (`:408`) go unseen. Keep it exactly, and keep its limit in its docblock and
  in the local adapter's spec.
- **Relayed commands are applied inside the pass's transaction** (`HatchInbox.ts:166`) with no rollback of their own: a
  refused relayed command's partial Board changes are not undone, as today. Do not route them through the command face,
  which would take the lock a second time inside the pass's hold and wait for itself until `tracker-lock-held`.
- **The command endpoint runs inside the Overseer.** Its commands go through `commands.apply`, which takes the lock like
  any client; it must never be called from inside a transaction of the same process for the reason above.
- **`ticket deliver --by-hand` must still be judged inside the hold** (`docs/cli.md:590`). Moving the Baton check before
  the apply would open a race with an Overseer that starts between the check and the write; `liveOverseerOf` keeps it in
  the applier. The command endpoint's and the Hatch's contexts must answer `null`, or the live Overseer would refuse its
  own command.
- **New command kinds widen the endpoint unless excluded.** `COMMAND_ROUTE_KINDS` is built from `CONTROL_COMMAND_KINDS`
  (`CommandRoute.ts:52`). Leaving out `BY_HAND_COMMAND_KINDS` keeps the served contract as it is; forgetting it changes
  a route without a system version (`CLAUDE.md:93-97`). The Bouncer refuses the new kinds by default
  (`Bouncer.ts:147-157`), and `ALLOWED_MOVES_BY_INCIDENT_KIND` does not name them; do not add them there.
- **Refusal texts move with the appliers.** The CLI words its refusals in place today (`TaskAdd.ts:33-44`,
  `NamespaceCommand.ts:106-118`); in `src/` a refusal is a wordless detail. Each new detail needs both wordings
  (`messageOf`, `apiMessageOf`) and a row in `docs/reference/refusals.md`. Specs that assert a sentence change with it.
- **`TicketLookupUtil.requireTicket` and `ticketIdOfReference` word a missing ticket differently**
  (`cli/tickets/utils/TicketLookupUtil.ts:21-29` against `src/services/control/ControlTicketLookup.ts:20-30`). Moving a
  verb into an applier changes its printed refusal to the wording util's; check the verb's specs and accept the util's
  sentence.
- **The Next line and other printed values must come from the board after the write**, never from a read taken after the
  write returns: another writer may have changed the board meanwhile. `CommandWritten.board` is the board this write
  left, which only the caller holds (`TrackerPipeline.ts:65`).
- **The nudge and the registry update come after the lock is released** (`OpenTrackerForWriting.ts:37-40`). Keep them
  outside `apply`.
- **Unreadable records keyed by file name.** Today a ticket reference finds its unreadable file by the file name's
  number (`ControlTicketLookup.ts:14-17`). The key must be derived the same way, including `012.md` with no slug and a
  file whose name and `id` disagree, or a reference to a broken ticket reads as "no ticket" instead of "malformed".
- **`TRACKER_FILES` mixes records and places.** `TRACKER_DIRECTORY_NAME` and `HTML_FILE_NAME` are not records and are
  used by `cli/InstalledFiles.ts` and `cli/adoption/init/InitCommand.ts:157`; move them before deleting the constant.
- **`logFilePath` and `lockDirectoryPath` are ambiguous names.** The Overseer's own log (`OverseerFiles.ts:9`), the
  registry lock and the landing lock use the same words. The guard matches them only on a workspace until WP5.11 renames
  the record fields.
- **The step value of an unreadable pipeline is stored on the board.** `UnreadablePipelineGate.ts:12` writes
  `pipeline.json` as the gate step into what the merge records; changing it is allowed (decision 32) but every reader of
  that value must change with it.
- **Names.** `src/ComponentNames.spec.ts:28-63` retires, among others, `BoardWatcher` and `lease-taken-over`; the lock's
  existing refusal `lock-taken-over` is different and stays. Check every new name against the list before using it.
- **Specs that build a `Workspace` by hand** break at WP5.11. Find them with the grep of WP5.11 before starting it, and
  move them to `localStoreLayoutOf`.
- **`programTypeScriptSources` scans declared workspace packages too** (`src/testing/RepositorySources.ts:195`). The
  tracker-model package holds `Ticket.filePath` as a field; the guard's forms do not match a `.filePath` read, by
  design.

## Verification of the whole stage

At the repository root:

```sh
bun install --frozen-lockfile
bun run verify
```

Both succeed with no change to `bun.lock` or any `package.json`.

In `apps/forge`, the specs that matter most, each run as `bun test --path-ignore-patterns='.claude/**' ./<path>`:

- `src/StoreBoundary.spec.ts`: the allowlist holds exactly the two composition-root lines.
- `src/services/store/BoardStore.contract.spec.ts` and `src/services/store/LocalFilesBoardStore.spec.ts`.
- `src/ImportDirection.spec.ts`: the `store-service` layer.
- `src/services/tracker/` and `src/services/control/`.
- `cli/ControlContract.spec.ts` and `cli/overseer/routes/CommandRoute.controlContract.spec.ts`.
- `src/services/overseer/DrivePass*.spec.ts`.

Greps that must print nothing (from `apps/forge`):

```sh
grep -rnwE "TrackerChange|OpenTrackerForWriting|openTrackerForWriting|withLockIfFree" --exclude-dir=research src cli bridge docs CLAUDE.md
grep -rn "progressFilePath\|ticketsDirectory\|epicsDirectory\|draftsDirectory\|TRACKER_FILES" src cli bridge
```

End to end on a scratch board, as `docs/development/contributing.md:76-170` prescribes, from `apps/forge` in one scratch
shell: create `SCRATCH="$(mktemp -d /tmp/ap-scratch.XXXXXX)"` with a scratch `HOME`, run `init --root`, set
`FORGE_ROOT`, `FORGE_FAKE_AGENT=1` and `FORGE_FAKE_AGENT_KEEPS_WORKING=1`, then check each of these:

1. `ticket add "Double-click a role to edit it" --type ticket`, `log "Scratch board started"`, `task add "Example row"`,
   `task start 1`, `epic add example "Example"`, `epic edit example --title "Example epic"`, `ticket size 001 S`, then
   `status`: every change is listed and `status` exits 0. `namespace` is left to its specs.
2. `oversee --port 0 --detach`, `oversee status` (serving, paused), `gate none`, `ticket edit 001 --append --body "##
   Brief …"`, `ticket ready 001`, `oversee resume`, `jobs`: within seconds a `build/builder` job on `#001` is listed, so
   the pass's transaction and the command face work together.
3. With the Overseer live, `ticket deliver 001 --by-hand` is refused `overseer-owns-the-lifecycle`, naming its URL, and
   writes nothing.
4. A command posted to the endpoint with the token from the Baton's `tokenFile` (`concurrency-set`) answers 200; a body
   of kind `task-add` answers 400 `malformed-body`.
5. Hand-break a ticket file's frontmatter: `status` reports it as ignored with its path and exits 0; `ticket show` of
   its id exits 2 and names the file.
6. End the board with `oversee stop --now`, `pkill -f "$REPOSITORY/.forge"`, restore `HOME` and remove the scratch
   folder.

Nothing in this check reads or writes `~/.forge-monitor` or `~/.gaia`, and nothing runs in this checkout's own tracker.

## Out of scope

- The remote adapter, a server-side store, a change feed for the pass, and the redesign of the pass that a remote store
  needs (design section 4 and section 9).
- Removing `filePath` from `Ticket` and `Epic`, the `file:` lines and the JSON `filePath`, and ending hand-edits of
  ticket files in the installed text (`resources/templates/Reference.md:15`,
  `resources/templates/SessionInstructions.md:24`), which bumps `INSTALL_VERSION` (Needs the owner, item 3).
- Accepting any by-hand kind on the command endpoint, or adding any kind to `packages/forge-contracts`: stage 6.
- Changing the lock's timing, the hold journal's format, the write order of a hold or any stored format.
- Moving pictures (`src/services/tracker/PictureStore.ts`), job folders, gate profile output, Talos's files, the Baton
  or stage 3's presence and crash files behind the port.
- The two open decisions of design section 12: what follows an ending on a network outage, and a bound on an install
  line. This stage touches neither.
- Naming a failed pass (design section 7) and the Overseer-to-Hephaestus rename: stages 3 and 9.

## Needs the owner

1. **The by-hand verbs become command kinds.** Recommended default: yes, as WP5.6 and WP5.7 plan, so the CLI needs only
   the command face (decision 22, design section 9, seam 1). The alternative keeps those verbs on the transaction face,
   which leaves the CLI a face a remote adapter cannot serve; WP5.6 and WP5.7 are then skipped and the verbs call
   `transactions.transact` in WP5.8.
2. **The by-hand kinds stay off the command endpoint.** Recommended default: yes, so no system version changes and Gaia
   records nothing again in this stage; a view that needs one adds it in stage 6 with a minor version.
3. **A ticket's and an epic's `filePath`.** Recommended default: keep them in the tracker model as values the adapter
   fills, and keep the `file:` lines and JSON fields. Removing them belongs with ending hand-edits, which the design
   names as a consequence (section 4) but no stage owns; it changes installed files and needs an `INSTALL_VERSION` bump
   and the rule "Tickets are hand-edited between runs" (`CLAUDE.md:376-377`) replaced.
4. **The registry's `progressJson`.** Recommended default: keep the field, filled from `locationOf({ record: 'progress'
   })`; no code in `apps/gaia/src` reads it (only a recording does), so stage 8 may drop it.
5. **Stage 3's presence, heartbeat, fatal-error and crash files.** Recommended default: outside the store port, beside
   the Baton under `<data>/overseer/`: they describe a local process and its boot, which a remote store could not hold
   truthfully. The guard does not name them.
6. **The read side as a third part of the port.** The design names two faces; the CLI's reads and the pass's observation
   need lock-free reads. Recommended default: the read side is shared by both faces, as planned.
7. **Pictures.** Recommended default: they stay outside the port, under the data folder, as today.

## Not established

- The state of `DrivePass.ts`, `Regrouping.ts`, `OverseerForeground.ts` and `JobLaunch.ts` after stages 2 and 3, and the
  final name of the tracker-model package after stage 4; this plan was written against today's code.
- Whether every Board change writes a log record; if one does not and changes no progress field, the revision does not
  see it. Not traced.
- Whether a spec, the Bridge or a wording util reads the stored step value `pipeline.json` of an unreadable pipeline
  (`UnreadablePipelineGate.ts:12`); WP5.5 asks the builder to grep.
- Whether moving the `ticket` verbs' refusals to `ticketIdOfReference` changes any printed sentence that an installed
  skill or prompt depends on.
- Whether `readBoard()` on every HTTP request of the board state costs more than today's `requireTracker` (it is the
  same call); not measured.
- Whether `TrackerLock.integration.spec.ts` holds cases of the generic lock only, which decides whether WP5.2 moves it.
