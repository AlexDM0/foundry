# Stage 5: the store port

## Goal

The forge reaches its stored board through one port, `BoardStore`, with two faces: a command face that the CLI and the
command endpoint apply `ControlCommand`s through, and a board transaction face that Hephaestus's pass (still the
Overseer in code) changes the board through inside one exclusive write, with git inside it as today. Both faces share a
lock-free read side. One adapter exists, `LocalFilesBoardStore`, which wraps today's tracker stores, the tracker lock
and the single hold of `writeTracker`; a contract spec states what any adapter must do, and a guard spec,
`src/StoreBoundary.spec.ts`, refuses every shipping line outside the adapter that names the path of a record.

The adapter judges a stored pipeline once, in the one reading every read and every write takes. Hand-editing of ticket
files ends: a ticket's content changes only through the command `ticket-edit`, every other change of a ticket through
its own command, and no output names where a readable record is kept. The model carries no storage location; only the
adapter knows where a ticket or an epic is stored.

The stage ends with the committed ticket (decision 48). Today's status `pending` takes the name `committed`. From
committed onward the Board refuses an edit of the ticket's content, the store keeps the content by its hash and agents
build from that, and a committed ticket no agent has picked up can be put back into `draft` and edited there. The
store's write lock passes to another writer only once its holder's process is gone, never because the lock is old.

In this file a path names a file of forge from `apps/forge/`, and a file of the root or of a package from the repository
root, as `apps/forge/CLAUDE.md` sets. Line numbers are those of `b4174bd9`, the head of the branch `hephaestus-talos`,
where every shipping file this file cites reads as it did at `0a648b2b` (forge 1.18, after the entities work landed).
Stages 2 to 4 move many of these lines, so find each place by the function or symbol named beside it, never by the
number alone.

## Depends on

- **Stage 1** (the monorepo migration closed): this stage starts on a base that does not move.
- **Stage 2** (Talos): `DrivePass.ts`, `Regrouping.ts`, `JobLaunch.ts` and `OverseerForeground.ts` are rewritten there.
  This stage changes how those files reach the store, so it runs on stage 2's versions. Talos's files stay outside the
  store, under the operating system port (stage 2's plan says so for its own files).
- **Stage 3** (presence and recovery): it adds the command `interrupted-work-resume`, the verb `resume` (decision 41),
  the log records `start-classified`, `job-resume-instructed` and `job-line-lost`, and the files `presence.json`,
  `heartbeat.json` and `crash-logs/crash-<number>.json` under `<data>/overseer/`.
  Those files stay outside the store port (Decisions this stage carries out). `interrupted-work-resume` is a relayable
  kind: it stays in `RELAYED_VERB_OF_CONTROL_KIND` (`cli/constants/JobVerbs.ts:48`) as `resume`, the command endpoint
  accepts it as stage 3 adds it to `packages/forge-contracts`, the Bouncer refuses it for every agent role, and this
  stage never lists it among the by-hand kinds. The verb `resume` records through `cli/RecordedIncidentMove.ts`, whose
  relay under a job comes first, and WP5.8 switches its write to the command face.
- **This stage runs after stage 4.** The tracker model stays at `apps/forge/src/lib/tracker-model/` and its fixtures at
  `apps/forge/src/testing/BoardFixtures.ts` and `apps/forge/src/lib/tracker-model/testing/` (decision 49), so no path
  here waits on a move of stage 4. The two stages change the same files, though: `src/shared/@types/ControlCommand.ts`,
  `src/services/control/ControlService.ts`, `PipelineSetupControls.ts`, `PipelineAgentControls.ts`,
  `cli/overseer/routes/CommandRoute.ts`, `OverseerRoutes.ts`, `src/adapters/utils/OperationRefusalWordingUtil.ts`,
  `docs/reference/refusals.md`, `src/ImportDirection.spec.ts`, and the adapter in which stage 4 maps a `Ticket` into
  the contract's ticket document. So no package of this stage runs beside a package of stage 4.
- **WP5.14 to WP5.17 build on stage 4's contract.** From stage 4 on the contract's ticket and task statuses say
  `committed` (WP4.6), mapped from the model's `pending` in forge's board-document mapper (WP4.8), and its served fact
  `noAgentHasPickedItUp` reads the status set WP5.14 renames (WP4.10). WP5.14 removes that mapping, and the four
  packages change `ControlCommand.ts`, `OperationRefusalWordingUtil.ts` and `docs/reference/refusals.md` again, so they
  start once stage 4 has finished.

Hands to later stages:

- **Stage 6** (Gaia hosts the views): the command endpoint applies every command through the command face, so a view's
  command does what the same CLI verb does. A ticket's content is edited with `ticket-edit`, which the endpoint already
  accepts; Gaia's editing screen comes after this run (decision 22). The 17 by-hand kinds this stage adds (16 in WP5.6
  and WP5.7, `ticket-unready` in WP5.17) are kept off the endpoint; a view that needs one adds it to
  `packages/forge-contracts` and to the endpoint with a minor system version, as design section 4 says for the board's
  command kinds. A ticket's status reads `committed` in the model, the Bridge and the contract alike (WP5.14); an edit
  of a committed ticket's content is refused `content-of-a-committed-ticket` with its sentence (WP5.16).
- **Stage 7** (conversations): `job-message` and `intake-start` go through the command face unchanged.
- **Stage 8** (shrink the HTTP surface): the read side gives the reads the server keeps. After WP5.9 the registry
  entry carries no `progressJson`; stage 8 drops `progressHtml` with `Workspace.htmlFilePath`. WP5.13 rewrites lines of
  `resources/templates/SessionInstructions.md` beside the `open` line that stage 8 removes (decision 43); each stage
  raises `INSTALL_VERSION` for its own change.
- **Stage 9** (rename): no identifier this stage adds names the Watcher. Three name the Overseer, as everything does
  until stage 9: `ControlContext.liveOverseerOf`, `writeAsTheOverseer` and its file
  `cli/overseer/OverseerBoardWrites.ts`; stage 9's replacement table renames them with the rest. The entries `oversee`,
  `start` and `stop` of `NOT_RELAYABLE_MUTATING_VERBS` (`cli/ControlContract.spec.ts`) follow stage 9's verb set
  (decision 42).
- **A remote adapter, later and not built**: it implements `BoardStore` and must pass
  `src/services/store/BoardStore.contract.spec.ts`. Its transaction face cannot carry a hold that spans a git
  fast-forward (design section 4); that redesign stays out of this plan.

## Decisions this stage carries out

- **2.** The forge owns the data model and the stored formats: they live inside the local adapter, and only it reads or
  writes a record.
- **3.** Stored formats stay versioned as today; the versions move with the formats inside the adapter. WP5.14 to
  WP5.16 change the ticket file, the progress rows and the lock record (`LockPayload`) and add the kept-content file
  `<data>/committed-content/<hash>.json`, and raise no version: of these only `progress.json` carries one, raised once
  in stage 9 (WP9.2), and every board is set up anew after stage 9 (gate G6), so no reader of an older form is kept.
- **12.** What the pipeline decides from stays persisted: the hold journal and the atomic writes are kept as they are.
- **16.** Storage is a port with local files first: `BoardStore` and `LocalFilesBoardStore`.
- **17.** The remote store is not built; the port and its contract spec keep it possible.
- **19.** The command endpoint applies through the same command face as the CLI.
- **22.** Outside Hephaestus, state changes only through a command: every CLI verb that changes the board applies a
  `ControlCommand`, the by-hand verbs included. Nobody hand-edits a ticket file: the content edit is `ticket-edit`
  (`src/shared/@types/ControlCommand.ts:89-97`), which exists and which this stage keeps as the one way to change a
  ticket's title or body (WP5.13).
- **32.** Nothing that exists is kept: names, refusal texts, output fields, installed text and the place of the Baton
  check change outright.
- **33.** This stage creates no package. Its new folder `src/services/store/` is a service unit inside `apps/forge`.
- **34.** Orchestrated sessions do this work outside both trackers, and may change any rule file it touches.
- **45.** A new refusal is worded once, as the sentence the command line prints, and forge serves that sentence.
- **46.** Boards are set up anew, so changed outputs and installed text need no reader of the old ones.
- **47.** Forge owns tickets: every change of a ticket is a command forge accepts or refuses.
- **48.** A committed ticket's content is fixed: `pending` takes the name (WP5.14), the store's lock passes only from a
  holder whose process is gone (WP5.15), the content is kept by its hash and an edit of it refused (WP5.16), and a
  committed ticket no agent has picked up goes back into draft (WP5.17).
- **49.** The tracker model, its spec helpers, the readings and the refusal wording stay in `apps/forge`; every model
  path below is under `apps/forge/src/lib/tracker-model/`.

The run settles these for this stage:

- **The by-hand verbs become command kinds.** The verbs that change the board with no kind today (`task`, `log`,
  `namespace`, eight `ticket` verbs, `epic edit`, `epic remove`) get 16 kinds (WP5.6, WP5.7), so the CLI needs only the
  command face, the one face a remote adapter can serve (design section 9, seam 1). They are never relayed from a job
  and never accepted by the command endpoint: `COMMAND_ROUTE_KINDS` leaves them out, so the endpoint answers exactly
  what it answers today and no system version changes in this stage.
- **The read side is a third part of the port,** shared by both faces. The CLI's reads and the pass's observation take
  no lock today (`apps/forge/CLAUDE.md:382-383`, `DrivePass.ts:2-4`), and the port keeps that.
- **The store judges a stored pipeline once.** Today only a write judges a pipeline with entities in a tracker in a
  folder (`TrackerPipeline.ts:84-101`); every other reader takes the file as it is. The adapter's one pipeline reading
  applies that judgement, so `observe`, the gate runs, `gate list`, the board state and every write read the same
  verdict, and a write still refuses to store such a pipeline (WP5.4).
- **Record locations leave the model and the output.** `Ticket.filePath`, `Epic.filePath`, the `file:` lines of
  `ticket show`, `epic show` and `draft show`, the JSON `filePath` and the page payload's `filePath` go (WP5.13), and
  the registry entry's `progressJson` goes (WP5.9). A record the store cannot read is still reported with its
  location: an ignored ticket file, a malformed pipeline, a malformed hold journal. Nothing but a repair outside every
  command can fix such a record, and the location is what that repair needs.
- **Hand-editing ends in the rules and the installed text** (WP5.13): `apps/forge/CLAUDE.md`'s rule that tickets are
  hand-edited between runs, the session instructions that point at the file to edit, and the reference's invitation to
  add a field by hand. `INSTALL_VERSION` rises once for it.
- **Committed is one ladder's value.** `TicketStatus` derives from `TaskStatus` (`@types/Ticket.ts:9`) and a row
  takes its ticket's status in the same move, so both ladders say `committed` (WP5.14). The log record
  `ticket-readied` becomes `ticket-committed`; `ticket-reopened` keeps its name.
- **The content is the title and the body,** hashed together as `contentHash` in place of `claimedBodyHash`, which
  today is taken only when a build starts (`TicketMoves.ts:289`). Forge's own records in a body (the Handoff, a
  review, waived items, an answer) are no edit of the content: they move the hash along, as a retitle moves
  `claimedBodyHash` along today (`TicketEdits.ts:66-68`). `ticket edit --force` goes, with no replacement: nothing
  overrides a committed ticket's fixed content (WP5.16).
- **`ticket unready` is a by-hand verb** (WP5.17): the user puts a committed ticket back into draft; no agent does,
  and the command endpoint does not take it until Gaia's editing screen, so no system version changes in this stage.
- **The lock judges the process, never the age** (WP5.15): the record names its holder's process identity, and a
  record no process can be read from is refused for a repair, never taken over by its file's age.
- **What stays outside the port:** stage 3's presence, heartbeat and crash-log files and the Baton under
  `<data>/overseer/`, which describe a local process and its boot; Talos's files; job folders; gate profile output;
  pictures (`src/services/tracker/PictureStore.ts`). Each is a place, read and written as today; the guard names none of
  them.

## Today's code

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| `writeTracker`: lock, journal replay, read into a Board, mutate (may be async), write in order, one hold | `src/services/tracker/TrackerPipeline.ts:178` | Kept, inside the adapter; only `LocalFilesBoardStore` calls it (WP5.8, WP5.10) |
| `TrackerChange`, what a mutation receives, with the whole `Workspace` | `src/services/tracker/TrackerPipeline.ts:35` | Replaced by `BoardTransaction` in `src/services/tracker/BoardTransaction.ts` (WP5.3) |
| `TrackerWriteRequest`, `TrackerWritten` | `src/services/tracker/TrackerPipeline.ts:52`, `:65` | Changed: `TrackerWritten` carries `unreadableRecords` (WP5.3) |
| The planned write order of a hold; it writes each ticket and epic at its model `filePath` | `src/services/tracker/TrackerPipeline.ts:133` (`plannedHoldOf`), `:144-147` | Kept; the locations come from the adapter (WP5.13) |
| A write judges a pipeline with entities in a tracker in a folder: the pipeline it opens the Board on reads as malformed `entities-in-a-folder`, and a mutation that would store one is refused | `src/services/tracker/TrackerPipeline.ts:84-101` (`folderPrefixHoldingEntitiesOf`, `pipelineReadingInPlaceOf`, `refuseEntitiesInAFolder`), called at `:185` and `:201` | Changed: the judgement moves into the adapter's one reading, which every read and write takes; the refusal of a write stays (WP5.4) |
| Readers outside a write take the stored pipeline as it is | `src/services/tracker/TrackerReader.ts:71`, `src/services/overseer/DrivePass.ts:493`, `:1139`, `:1257`, `cli/gates/GatePipelineVerbs.ts:224` | Changed: the judged reading (WP5.4, WP5.9, WP5.10) |
| `gate list` refuses an `entities-in-a-folder` reading, a branch no reading reaches today | `cli/gates/GatePipelineVerbs.ts:225-227` | Kept; reached once the reading is judged (WP5.9) |
| `withLock`, the tracker lock with the journal replayed first | `src/services/tracker/TrackerLock.ts:217` | Kept, inside the adapter |
| `withLockIfFree`, with no caller in the repository | `src/services/tracker/TrackerLock.ts:233` | Deleted (WP5.2) |
| `withLockAt`, `LockGenerationSteps`, `LockHolderIsGone`, used by the registry, the repository tracker list and the shared-repository landing | `src/services/tracker/TrackerLock.ts:256`, `:184`, `:41`; imported at `src/services/tracker/MonitorRegistration.ts:22`, `src/services/tracker/RepositoryTrackerList.ts:14`, `src/services/lifecycle/Landing.ts:18` | Moved to `src/services/tracker/GenerationLock.ts` (WP5.2) |
| The hold journal: `commitHold`, `replayHoldJournal`, `readHoldJournal`, `holdJournalFilePathOf` | `src/services/tracker/HoldJournal.ts:121`, `:139`, `:29`, `:24` | Kept, inside the adapter; `status` reads it through `readUnfinishedWrite` (WP5.9) |
| `TrackerContents`, `readTracker`, `requireTracker`, `requireProgressFile` | `src/services/tracker/TrackerReader.ts:20`, `:53`, `:84`, `:91` | Kept inside the adapter; the type moves to `src/services/tracker/@types/BoardRecords.ts` as `BoardContents` (WP5.3) |
| `Workspace` with every record path, `workspacePathsFor`, `findWorkspace`, `requireWorkspace` | `src/services/tracker/Workspace.ts:17`, `:34`, `:69`, `:111` | Changed: `Workspace` keeps `rootDirectory`, `trackerDirectory`, `htmlFilePath`; the record paths move to `LocalStoreLayout` (WP5.11) |
| A tracker is detected by its progress file | `src/services/tracker/Workspace.ts:55` | Kept, asked of `LocalStoreLayout` (WP5.11) |
| `listTickets`, `readTicket`, `nextTicketId`, `createTicket`, `everyTicketFilePathIn`, `MalformedTicketFile` | `src/services/tracker/TicketStore.ts:63`, `:112`, `:125`, `:149`, `:172`, `:22` | Kept inside the adapter; `createTicket` is reached through `RecordAllocation.newTicket` (WP5.3, WP5.5); the listing keeps each ticket's location (WP5.13) |
| `TicketsSpentInHold` picks each ticket's `filePath`, so a new slug is unused | `src/services/tracker/TicketStore.ts:50-53`, `unusedSlugFor` at `:213-224` | Changed: the hold's locations come from the allocation (WP5.13) |
| `listEpics`, `everyEpicFilePathIn`, `epicFilePathOf` | `src/services/tracker/EpicStore.ts:23`, `:38`, `:42` | Kept inside the adapter; reached through `RecordAllocation` (WP5.5, WP5.13) |
| `listDrafts`, `draftFilePathOf` | `src/services/tracker/DraftStore.ts:23`, `:37` | Kept inside the adapter; reached through `RecordAllocation` (WP5.5) |
| `storeFolderFileNamesIn`, `listStoreFolder` | `src/services/tracker/StoreFolderListing.ts:26`, `:37` | Kept inside the adapter |
| `createTracker` for `init` | `src/services/tracker/TrackerCreation.ts:21` | Kept, reached through `BoardStore.initialise` (WP5.9) |
| `TRACKER_FILES`: record names, plus the data folder and page names; the data folder name is also read by `cli/InstalledFiles.ts:37`, `:46`, `:47`, `cli/adoption/init/InitCommand.ts:157` and `src/services/tracker/RepositoryTrackerList.ts:52` | `src/services/tracker/constants/TrackerFiles.ts:4` | Changed: record names become `LOCAL_STORE_FILES` inside the adapter; the data folder name is `PRODUCT_NAMES.DATA_FOLDER` (WP5.11) |
| The registry reads the progress file and publishes its path as `progressJson` beside `progressHtml` | `src/services/tracker/MonitorRegistration.ts:140`, `:151-152`; documented at `docs/cli.md:2965`, `:2995`; no code in `apps/` or `packages/` reads `progressJson` | Changed: the caller reads through the port and passes the facts in; `progressJson` is not written (WP5.9) |
| `ControlService.apply` on a `TrackerChange`; `CONTROL_APPLIERS`; `CONTROL_COMMAND_KINDS` | `src/services/control/ControlService.ts:67`, `:27`, `:56` | Changed: applies on a `BoardTransaction`; gains the by-hand kinds (WP5.3, WP5.6, WP5.7) |
| `ControlCommand`, 79 kinds (the entities work added `need-declare`, `ticket-entity` and `ticket-group`, all relayed); the content edit `ticket-edit` among them | `src/shared/@types/ControlCommand.ts:67`, `ticket-edit` at `:89-97` | Changed: gains the by-hand kinds (WP5.6, WP5.7, WP5.17); `ticket-edit` kept, without its override (WP5.16) |
| `ControlContext`; its `mainConstitutionOf` takes an optional `constitutionPath`, an entity's constitution | `src/shared/@types/ControlContext.ts:57` | Changed: gains `liveOverseerOf` (WP5.7) |
| `ticket-add` names the new ticket's file through `createTicket(change.workspace, …)` | `src/services/control/TicketControls.ts:64` | Changed: `transaction.records.newTicket` (WP5.5) |
| The pass files a need's ticket and a dependent's fix ticket through `createTicket(change.workspace, board, …)` | `src/services/overseer/NeedTickets.ts:100`, `src/services/overseer/DependentFixTickets.ts:91` | Changed: `transaction.records.newTicket` (WP5.5) |
| `epic-add` and `draft-open` name their file and compare it with the unreadable files | `src/services/control/FilingControls.ts:9`, `:21` | Changed: `transaction.records` (WP5.5, WP5.13) |
| The pipeline refusals (`older-pipeline`, `entities-in-a-folder`, `malformed-pipeline`) name `pipelineFilePath` | `src/services/control/SettingControls.ts:11-15` | Changed: `transaction.records.locationOf` (WP5.5) |
| A ticket reference is matched to an unreadable file by parsing its file name | `src/services/control/ControlTicketLookup.ts:11-17`, `cli/tickets/utils/TicketLookupUtil.ts:11-18` | Changed: matched by `UnreadableRecord.key` (WP5.5) |
| Appliers that run git or reach job folders and pictures through `change.workspace.rootDirectory` and `trackerDirectory` | `src/services/control/AirlockControls.ts:43-89`, `RepairControls.ts:35`, `JobControls.ts:32`, `BoardLifetimeControls.ts:107`, `PipelineSetupControls.ts:249`, `:375`, `:581`, `:622`, `PipelineAgentControls.ts:38`, `:71` | Kept: these are places, not records |
| The merged-tree gate step named `TRACKER_FILES.PIPELINE_FILE_NAME` | `src/services/overseer/UnreadablePipelineGate.ts:12` | Changed: a wordless step value (WP5.5) |
| The pass fingerprint reads the bytes of `progress.json`, `log.jsonl` and `gate-profiles.json` | `src/services/overseer/DrivePass.ts:436-459` (`:447-449`), helper `fileTextOrEmpty` at `:417-423` | Replaced by `reads.revision()` (WP5.10) |
| `observe` reads the progress file and the pipeline outside the lock | `src/services/overseer/DrivePass.ts:464`, `:493` | Changed: the read side (WP5.10) |
| The tracker id and the paused state read outside the lock | `src/services/overseer/DrivePass.ts:1055`, `:1291` | Changed: the read side (WP5.10) |
| `holdTracker`, the Airlocks', gate profiles' and pipeline checks' hold runner, on `writeTracker` | `src/services/overseer/DrivePass.ts:1170-1183`; type at `src/services/overseer/Airlocks.ts:66-72` | Changed: on `transactions.transact` (WP5.10) |
| The landing's git fast-forward runs inside a hold | `src/services/overseer/Airlocks.ts:1241-1262` (`Landing.landOnTarget` at `:1248`), and the constitution commit's at `:1499` | Kept, inside a transaction |
| The pass's one hold: relayed commands, events, lifecycle | `src/services/overseer/DrivePass.ts:1336-1440` (in `runOnePass`, `:1330`) | Changed: on `transactions.transact` (WP5.10) |
| The merged-tree gate reads `pipeline.json` afresh | `src/services/overseer/DrivePass.ts:1257` | Changed: `reads.readPipeline()` (WP5.10) |
| A gate profile's and a pipeline check's confined lines read `pipeline.json` afresh | `src/services/overseer/DrivePass.ts:1138-1141` (`pipelineOnDisk`), called at `:1194` and `:1213` | Changed: `reads.readPipeline()` (WP5.10) |
| Relayed commands applied inside the pass's hold | `src/services/overseer/HatchInbox.ts:181` | Changed: on the `BoardTransaction` (WP5.3) |
| Regrouping reads the progress file | `src/services/overseer/Regrouping.ts:224` | Changed: the read side, or gone with stage 2 (WP5.10) |
| The data folder watch wakes the pass on any file event | `src/services/overseer/DataFolderWatch.ts:57` | Kept: it watches a place |
| The CLI's write path: job check, workspace, `--at`, `writeTracker`, report, register, nudge | `cli/OpenTrackerForWriting.ts:15-58` | Replaced by `cli/ApplyCommandOfVerb.ts` (WP5.8) |
| 33 CLI call sites in 28 files that apply a control command inside `openTrackerForWriting`, the entities work's `cli/tickets/TicketEntity.ts:32`, `cli/tickets/TicketGroup.ts:29` and `cli/needs/NeedCommand.ts:53` among them | listed by `grep -rn "ControlService.apply" cli` | Changed: the command face (WP5.8) |
| The incident moves record through `recordIncidentMove`: the relay under a job first, then the write | `cli/RecordedIncidentMove.ts:44-53` | Changed: the write through the command face, the relay kept first (WP5.8) |
| CLI verbs that change the Board directly, with no command kind: `task` (add, move, update, remove), `log`, `namespace`, `ticket link`, `ticket size`, `ticket agent`, `ticket introduced-by`, `ticket release-of`, `ticket rereview`, `ticket reopen`, `ticket status`, `epic edit`, `epic remove` | `cli/tracking/task/TaskAdd.ts:30`, `TaskCommand.ts:37`, `TaskCorrection.ts:40`, `:57`, `cli/tracking/log/LogCommand.ts:20`, `cli/tracking/namespace/NamespaceCommand.ts:103-120`, `:138`, `cli/tickets/TicketSettingSubcommands.ts:43`, `:83`, `:106`, `cli/tickets/TicketIntroducedBy.ts:32`, `cli/tickets/TicketReleaseMarker.ts:24`, `cli/tickets/TicketMoveSubcommands.ts:108`, `cli/tickets/TicketTransition.ts:40`, `cli/epics/EpicChangeSubcommands.ts:76`, `:93` | Replaced by command kinds (WP5.6, WP5.7) |
| The list of mutating verbs with no kind | `cli/ControlContract.spec.ts:36-57` | Changed: keeps only `init`, `update`, `oversee`, `start`, `stop`, `login-item add`, `login-item remove` (WP5.6, WP5.7) |
| The unrelayed kinds and their verbs; the relayed ones | `cli/constants/JobVerbs.ts:39-43`; `RELAYED_VERB_OF_CONTROL_KIND` at `:48` | Kept; a third map `BY_HAND_VERB_OF_CONTROL_KIND` beside them (WP5.6) |
| `ticket deliver --by-hand` checks the live Baton inside the hold through `change.workspace.trackerDirectory` | `cli/tickets/TicketMoveSubcommands.ts:67-75` | Changed: `ControlContext.liveOverseerOf`, judged by the applier (WP5.7) |
| The command endpoint applies through `openTrackerForWriting`; `COMMAND_ROUTE_KINDS` is every control kind and Flint's brain's | `cli/overseer/routes/CommandRoute.ts:161`, `:55` | Changed: the command face; the by-hand kinds are left out (WP5.6, WP5.8) |
| The Overseer's own board writes from its process | `cli/overseer/OverseerForeground.ts:171`, `:561-568`, `:657`, `:679`, `:692`; `cli/overseer/OverseerFlintBrain.ts:74` | Changed: the transaction face (WP5.8) |
| The board state reads the tracker and the raw `pipeline.json` text | `cli/overseer/routes/BoardStateReader.ts:133-137`, `:153` | Changed: the read side (WP5.10) |
| The routes read `log.jsonl` and `gate-profiles.json` by path | `cli/overseer/routes/OverseerRoutes.ts:76-79`, `:88-91`, `:153`, `:161` | Changed: the read side (WP5.10) |
| CLI reads: `status`, `ticket list`, `ticket show`, `epic`, `draft`, `decisions`, `incidents`, `jobs`, `job`, `merges`, `review-stats`, `await`, `concurrency`, `namespace`, `gate list`, `init`, `login-item`, `oversee`, `start` | `cli/tracking/status/StatusCommand.ts:39-46`, `cli/tickets/TicketList.ts:79`, `cli/tickets/TicketReadingSubcommands.ts:22`, `:66`, `cli/epics/EpicCommand.ts:24`, `cli/drafts/DraftCommand.ts:25`, `cli/decisions/DecisionsCommand.ts:28`, `cli/incidents/IncidentsCommand.ts:27`, `cli/jobs/JobsCommand.ts:22`, `:34`, `cli/jobs/JobCommand.ts:72`, `:74`, `:144`, `cli/merges/MergesCommand.ts:95`, `cli/measurement/review-stats/ReviewStatsCommand.ts:21`, `cli/tracking/await/AwaitCommand.ts:58`, `:63`, `cli/dispatch/concurrency/ConcurrencyCommand.ts:37`, `cli/tracking/namespace/NamespaceCommand.ts:61`, `:82`, `:94`, `cli/gates/GatePipelineVerbs.ts:222-229`, `cli/adoption/init/InitCommand.ts:66`, `:160`, `:172`, `cli/setup/login-item/LoginItemCommand.ts:86`, `cli/overseer/OverseerCommand.ts:72`, `:146`, `cli/overseer/StartCommand.ts:42` | Changed: the read side (WP5.9) |
| A ticket's and an epic's `filePath` in the model, set at filing and at reading | `src/lib/tracker-model/@types/Ticket.ts:79`, `src/lib/tracker-model/@types/Epic.ts:16`, `:25`, `src/lib/tracker-model/Epics.ts:36`; `src/adapters/tickets/TicketFileIngestion.ts:33`, `src/adapters/epics/EpicFileIngestion.ts:31`; written at `src/adapters/tickets/TicketFileWriter.ts:19-20`, `:34`, `src/adapters/epics/EpicFileWriter.ts:18-32` | Deleted from the model; the adapter keeps each location (WP5.13) |
| Outputs that name a readable record's file: `ticket show`'s `file:` line, the ticket JSON's `filePath`, `epic show`'s `file:` line and JSON `filePath`, `draft show`'s `file:` line, the page payload's `filePath` | `cli/tickets/TicketReadingSubcommands.ts:51`, `src/adapters/utils/TicketJsonUtil.ts:5`, `:18`, `cli/epics/EpicOutput.ts:7`, `:32`, `cli/drafts/DraftOutput.ts:18` with `cli/drafts/DraftCommand.ts:49`, `src/shared/@types/PagePayload.ts:111`, `src/services/render/PagePayloadAssembly.ts:61`; documented at `docs/cli.md:461`, `:756`, `:799` | Deleted (WP5.13) |
| The rule that tickets are hand-edited between runs | `apps/forge/CLAUDE.md:387-388` | Replaced: a ticket changes only through a command (WP5.13) |
| Installed text that sends an agent to the ticket file: the session instructions, the reference's ticket file section and its invitation to add a field by hand, the two skills' pointer to the ticket file's format | `resources/templates/SessionInstructions.md:24-25`, `resources/templates/Reference.md:7`, `:13-17`, `:90-93`, `skills/agent-po/SKILL.md:20`, `skills/agent-progress-orchestrate/SKILL.md:24`; `docs/cli.md:3042`, `:3117-3120` | Changed (WP5.13) |
| The install version, 36 | `cli/constants/InstallVersion.ts:1` | Raised by one over what earlier stages left (WP5.13) |
| The port convention: one frozen record of ports, a contract spec per adapter, a boundary guard with an exact allowlist | `src/lib/platform-ports/PlatformPortsFor.ts:43`, `src/testing/PortContract.ts:14`, `src/PlatformBoundary.spec.ts:1-471` | Followed by `BoardStore`, its contract and `src/StoreBoundary.spec.ts` (WP5.1, WP5.4) |
| The service layers of the import guard | `src/ImportDirection.spec.ts:39-59`, `:79-107`, `:236-241` | Changed: `store-service` between `control-service` and `overseer-service` (WP5.4) |
| The rule that every mutating command writes through `writeTracker` | `apps/forge/CLAUDE.md:379-383` | Changed: through the store port (WP5.12) |
| The import direction diagram | `apps/forge/CLAUDE.md:58-63` | Changed: `control → store → overseer` (WP5.12) |
| The Deviations table | `apps/forge/CLAUDE.md:321-352` | Changed: a row for the port with one adapter (WP5.12) |
| Docs naming `writeTracker`, `TrackerChange` and `openTrackerForWriting` | `docs/concepts/overview.md:190`, `:205`, `:210`, `docs/glossary.md:104`, `:682`, `docs/backlog.md:30` | Changed (WP5.12); `docs/research/remote-state/findings.md:64` is a dated record and stays |
| The ticket and row status `pending`, one ladder; `TICKET_STATUSES_EDITABLE_WITHOUT_FORCE` holds `draft`, `ready-for-review` and `pending` | `src/lib/tracker-model/@types/Task.ts:7`, `@types/Ticket.ts:9-11`, `constants/Statuses.ts:5`, `:7`, `:16` | Renamed `committed`; the set becomes `TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP` (WP5.14) |
| The log record of a draft readied, `ticket-readied` | `src/lib/tracker-model/constants/LogRecordSchema.ts:118` | Renamed `ticket-committed` (WP5.14) |
| An edit past `pending` is refused unless forced; a `pending` ticket's content is edited freely | `src/lib/tracker-model/TicketEdits.ts:52-58`, `cli/tickets/TicketEdit.ts:16`, `:31`, `:50`, `src/shared/@types/ControlCommand.ts:96` | Refused from committed onward with no override; `--force` goes (WP5.16) |
| The body's hash is taken when a build starts, and an edit after it is logged and shown | `TicketMoves.ts:289`, `TicketEdits.ts:66-68`, `:78-80`, `utils/TicketBodyHashUtil.ts:21-24`, `cli/tickets/TicketReadingSubcommands.ts:32`, `:50`, `src/adapters/utils/TicketJsonUtil.ts:9-17` | Replaced by `contentHash`, taken at the commit, with the content kept by the store (WP5.16) |
| A job's start records the body's hash, and Customs V6 refuses a body that moved during the job | `src/services/overseer/JobLaunch.ts:419`, `:2732`; `src/services/lifecycle/Customs.ts:482-485` | On the content hash (WP5.16) |
| The launch text carries the body the Board read from the ticket's file | `src/services/overseer/DrivePass.ts:818-821` (`launchFactsOf`) | Kept; the Board's body is the kept content (WP5.16) |
| Forge writes its own records into a started ticket's body, allowed past `pending` | `JobLaunch.ts:1569-1571`, `:1607-1608`, `:1628-1629`; `src/services/lifecycle/ReviewOutcome.ts:230`, `:349`; `src/lib/tracker-model/AgentQuestions.ts:121`, `:161` | Kept, as forge's own edits that move the content hash (WP5.16) |
| No move returns a ticket to draft | `TicketMoves.ts:68-70`; `src/adapters/utils/OperationRefusalWordingUtil.ts:121-123` | `ticket unready` for a committed ticket with no job (WP5.17) |
| A draft reaches `pending` by the user's `ticket ready`, or by a filer's submit that the ticket review switch stops at `ready-for-review` | `TicketMoves.ts:121-150`, `:156-181`; `src/lib/tracker-model/Board.ts:1341-1344` | Kept: the way forward from draft (WP5.17) |
| The lock frees a held record whose process is gone, and also a live holder's once its stamp is over 30 seconds old; the record names a process id only; an unreadable record is judged by its file's age | `src/services/tracker/TrackerLock.ts:28-31`, `:96-118`; `src/shared/constants/Limits.ts:3` | Judged by process identity, never by age; an unreadable record is refused for a repair (WP5.15) |
| Callers with no process check read every holder as live | `TrackerLock.ts:43-44`; the defaults at `TrackerPipeline.ts:180`, `TrackerCreation.ts:25`, `MonitorRegistration.ts:137` | Every caller passes the platform's judgement (WP5.15) |

## Work packages

Order and parallelism:

| Package | Runs after | May run in parallel with | Must run alone |
| --- | --- | --- | --- |
| WP5.1 The store boundary guard, today's leaks allowlisted | stages 1 to 3 | none | yes |
| WP5.2 The generation lock apart from the tracker lock | WP5.1 | none | no |
| WP5.3 `BoardTransaction`, record allocation and keyed unreadable records | WP5.2 | none | no |
| WP5.4 The port, the local-files adapter, the contract spec and the one pipeline reading | WP5.2, WP5.3 | WP5.5, WP5.6 | no |
| WP5.5 Appliers and lookups through the transaction's records | WP5.3 | WP5.4, WP5.6 | no |
| WP5.6 By-hand verbs become commands: task, log, namespace | WP5.3 | WP5.4, WP5.5 | no |
| WP5.7 By-hand verbs become commands: tickets and epics; the deliver-by-hand fact | WP5.5, WP5.6 | WP5.4 | no |
| WP5.13 Record locations leave the model and the output; hand-editing ends | WP5.4, WP5.7 | none | yes |
| WP5.8 The CLI and the command endpoint write through the store | WP5.13 | none | yes |
| WP5.9 The CLI reads through the read side | WP5.8 | WP5.10 | no |
| WP5.10 The Overseer's pass, server and reads through the store | WP5.8 | WP5.9 | no |
| WP5.11 The record paths leave `Workspace`; the guard's final form | WP5.9, WP5.10 | WP5.12 | no |
| WP5.12 Rules, docs and the Deviations row | WP5.10 | WP5.11 | no |
| WP5.14 Committed: `pending` takes the name | WP5.11, WP5.12, stage 4 | none | yes |
| WP5.15 The store's lock passes only from a holder whose process is gone | WP5.14, stage 4 | none | yes |
| WP5.16 A committed ticket's content is fixed and kept by its hash | WP5.14, WP5.15 | none | yes |
| WP5.17 A committed ticket goes back into draft: `ticket unready` | WP5.16 | none | yes |

WP5.13 runs between WP5.7 and WP5.8 although its number is the last: it needs the allocation (WP5.3), the epic filing
through it (WP5.5) and the adapter (WP5.4), and it changes the CLI's read outputs and the adapter's writers before
WP5.8 to WP5.11 rework the same files.

WP5.14 to WP5.17 come last: they change the model, the CLI and the adapter that the earlier packages rework, and they
wait for stage 4 (Depends on). WP5.14 and WP5.15 run one after the other: both change
`OperationRefusalWordingUtil.ts`, `docs/reference/refusals.md`, `docs/glossary.md` and
`src/services/overseer/testing/AirlocksHarness.ts`.

Parallel packages touch disjoint source files. WP5.2 and WP5.3 run one after the other: both change
`src/services/tracker/TrackerPipeline.ts`, `TrackerCreation.ts` and `TrackerPipeline.spec.ts`, which import the lock's
names that WP5.2 moves (`TrackerPipeline.ts:31`, `TrackerCreation.ts:7`, `TrackerPipeline.spec.ts:34`). Every package
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
     The pure members of these adapters (`contentsOf`, `documentReadingOf`, `entitiesInAFolderReadingOf`,
     `storedDocumentOf`, `billingOf`, `annotationOf`) stay usable.
4. Run the scan and write `ALLOWED_STORE_LINES: Readonly<Record<string, string>>`, keyed
   `<path>: <form>: <trimmed line>` exactly as the scan prints it, one entry per finding, sorted by path. Each value
   names the package that removes it, as `'Removed by WP5.10: the pass fingerprint reads the stored files.'`. Read each
   finding before listing it: a finding that is no record path (for example an `approval` literal `'tickets'` matched by
   mistake) is a pattern bug, fixed in the pattern, never allowlisted. Expect findings at least in
   `src/services/overseer/DrivePass.ts`, `src/services/overseer/Regrouping.ts`,
   `src/services/overseer/UnreadablePipelineGate.ts`, `src/services/overseer/HatchInbox.ts`,
   `src/services/overseer/JobLaunch.ts`, `src/services/overseer/PipelineAgentSessions.ts`, and the entities work's
   `src/services/overseer/NeedTickets.ts`, `src/services/overseer/DependentFixTickets.ts` and
   `src/services/overseer/EntityDecisionAnswers.ts`, `src/services/control/*Controls.ts`,
   `src/services/control/ControlService.ts`, `src/services/control/ControlTicketLookup.ts`,
   `src/services/lifecycle/Landing.ts`, `src/services/tracker/MonitorRegistration.ts`,
   `src/services/tracker/RepositoryTrackerList.ts`, and in `cli/` every file the Today's code table lists,
   `cli/drafts/DraftCommand.ts` (`draftFilePathOf`, removed by WP5.13) among them.
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
  `LockHolderIsGone` and `NO_LOCK_HOLDER_READS_AS_GONE` (`src/services/tracker/TrackerPipeline.ts:31`,
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
  `TrackerCreation`, `CreateTicketInput`. These are the port's vocabulary and must be importable without importing an
  adapter module.
- Create `src/services/tracker/LocalRecordAllocation.ts` and its spec: the local adapter's `RecordAllocation`.
- Change `src/services/tracker/TrackerPipeline.ts`, `TrackerReader.ts`, `TicketStore.ts`, `EpicStore.ts`,
  `DraftStore.ts`, `StoreFolderListing.ts`, `TrackerCreation.ts`: use the moved types; report unreadable records with a
  key.
- Change every file that names `TrackerChange` (`grep -rlw TrackerChange src cli bridge` finds 57 files today, 27 of
  them shipping; the tracker model's `TrackerChanges.ts` is another word and keeps its name), `MalformedTicketFile`,
  `MalformedEpicFile` or `MalformedDraftFile`, and `cli/utils/OutputUtil.ts` (`reportIgnoredTicketFiles`,
  `reportIgnoredEpicFiles`, `reportIgnoredDraftFiles`, `ignoredTicketFileText`).
- Create `src/testing/FixtureRecordAllocation.ts`: a `RecordAllocation` for specs that build a transaction by hand.
- Change `src/StoreBoundary.spec.ts`: the entries whose line text changed or disappeared.

**What to do.**

1. Write the types of Interfaces introduced into `BoardRecords.ts` and `BoardTransaction.ts`, in the form this package
   gives them: `RecordAllocation` with `newEpicLocation`, which WP5.13 replaces.
2. Rename `TrackerChange` to `BoardTransaction` everywhere, importing it from `BoardTransaction.ts`; delete the
   interface from `TrackerPipeline.ts`. Keep every member it had (`board`, `workspace`, `at`, `unreadablePipeline`,
   `storedLogEntryCount`, `storedLogRecords`, `deleteAllTicketFilesAfterwards`), replace `malformedTickets`,
   `malformedEpics` and `malformedDrafts` with `unreadableRecords: UnreadableRecords`, and add `records`. `workspace`
   stays on the transaction until WP5.11 strips the record paths out of `Workspace`.
3. Report unreadable records with a key. In `TicketStore.ts` the key of an unreadable ticket file is
   `identifierInFileName(fileName)` (`:187`), `null` when the name carries none; for a file listed because its name and
   `id` disagree, or because another file holds the same `id` (`:83-99`), the key is the `id` it holds. In
   `StoreFolderListing.ts` the key of an unreadable epic or draft is the file name without its extension (`keyInName`,
   `:43`). `location` is today's `filePath`. `record` is `'ticket'`, `'epic'` or `'draft'`.
4. Write `createLocalRecordAllocation(workspace, board, unreadableRecords)` in `LocalRecordAllocation.ts`:
   - `newTicket(input)` calls `createTicket(workspace, board, input)` (`TicketStore.ts:149`); the Board satisfies
     `TicketsSpentInHold` as today.
   - `newEpicLocation(epicKey)` returns `epicFilePathOf(workspace, epicKey)`, and first throws
     `OperationRefusal('refused', { kind: 'unreadable-file-in-the-way', filePath, record: 'epic' })` when an unreadable
     epic record has that key, as `FilingControls.ts:11-13` does today.
   - `requireDraftKeyIsFree(draftId)` throws the same refusal with `record: 'draft'` when an unreadable draft record has
     that key (`FilingControls.ts:23-25`).
   - `locationOf(reference)` returns the path of the one record the reference names: the progress file, the pipeline,
     the pipeline setup record, the gate profiles, the constitution sources, the log, or the hold journal for
     `unfinished-write`. A ticket, an epic or a draft has no reference: a readable one is never named by its location,
     and an unreadable one carries its own.
   - `writeTracker` builds the allocation after `openBoard` and passes it to the mutation as `records`.
5. The listings' `malformed` members (`TicketStore.ts:31`, `EpicStore.ts:17`, `DraftStore.ts:17`) become `unreadable`,
   and `TicketListing` drops `verdict`. Rename `TrackerWritten.malformedTickets` and `malformedEpics` to
   `unreadableRecords`; `OutputUtil`'s reporters take `readonly UnreadableRecord[]` and print `location` where they
   printed `filePath`, with the same words.
6. The specs that build a change by hand (`grep -rln deleteAllTicketFilesAfterwards src cli`: the specs of
   `SettingControls`, `GateProfileControls`, `PipelineAgentControls`, `PipelineSetupControls` and
   `PipelineSetupControls.entities`, `BoardLifetimeControls`, `PipelineChecking` and `TrackerPipeline`) gain `records`
   and `unreadableRecords`. The specs and testing helpers that cast a partial object to the type (`grep -rln "as unknown
   as TrackerChange" src cli`, 19 files today) change only the type name here; WP5.5 gives `records` to those that reach
   a ticket filing. `FixtureRecordAllocation.ts` answers tickets with the next free id under the fixture tickets folder
   of `src/testing/BoardFixtures.ts` (`:64`) and refuses nothing, so no spec writes its own.
7. Update the allowlist entries whose text changed: an import of `TrackerChange` from `TrackerPipeline.ts` that became
   an import of `BoardTransaction` from `BoardTransaction.ts` is not a finding; delete that entry.

**Specs.**

- `src/services/tracker/LocalRecordAllocation.spec.ts`: two tickets allocated in one hold get consecutive ids and
  distinct slugs; an epic key held by an unreadable file is refused `unreadable-file-in-the-way`; a draft key held by an
  unreadable file is refused; `locationOf` answers a distinct path inside the data folder for each reference kind.
- `src/services/tracker/TicketStore.spec.ts`, `StoreFolderListing.spec.ts`: each unreadable entry carries its key, and
  `null` for a ticket file whose name carries no number.
- `src/services/tracker/TrackerPipeline.spec.ts`: `records` and `unreadableRecords` reach the mutation.

**Done when.** In `apps/forge`:
`grep -rnwE "TrackerChange|MalformedTicketFile|MalformedEpicFile|MalformedDraftFile" src cli bridge` prints nothing (the
word match keeps the tracker model's `TrackerChanges.ts` out);
`bun test --path-ignore-patterns='.claude/**' ./src/services/tracker/ ./src/services/control/` passes; the root's
`bun run verify` is green.

### WP5.4 The port, the local-files adapter, the contract spec and the one pipeline reading

**Purpose.** Introduce `BoardStore` with its command face, its transaction face and its read side, the one adapter
around `writeTracker` and the readers, and the contract spec any adapter must pass. The adapter judges a stored
pipeline in one reading that its reads and its writes share. Nothing calls the port yet; the readers that call
`readTracker` today see the judged pipeline at once.

**Files.**

- Create `src/services/store/BoardStore.ts`: the port, its faces and their request and answer types. A new service unit,
  because the command face's typed results come from `src/services/control/ControlService.ts`, which the tracker service
  may not import.
- Create `src/services/store/LocalFilesBoardStore.ts`: `createLocalFilesBoardStore(options)`.
- Create `src/services/store/BoardStore.contract.spec.ts`: the contract.
- Create `src/services/store/LocalFilesBoardStore.spec.ts`: what only the local adapter promises.
- Change `src/services/tracker/TrackerReader.ts` and `src/services/tracker/TrackerPipeline.ts`: the one pipeline
  reading.
- Change `src/ImportDirection.spec.ts`: the layer `store-service`.
- Change `src/StoreBoundary.spec.ts`: a test that every `*BoardStore.ts` adapter of `src/services/store/` is named by
  the contract spec.

**What to do.**

1. In `src/ImportDirection.spec.ts`: add `'store-service'` to the `Layer` union (`:39-59`, between `'control-service'`
   and `'overseer-service'` at `:50-51`), to `SOURCE_LAYERS` between `'control-service'` and `'overseer-service'`
   (`:79-81`), and to `LAYER_REACH` (`:84-107`) as `'store-service': ['lib', 'shared', 'adapters', 'render-service',
   'tracker-service', 'lifecycle-service', 'control-service', 'store-service', 'workspace-package']`; in the unit switch
   (`:236-241`) map `unitFolder === 'store'` to `'store-service'`. Add planted cases beside `:674-705`: a control file
   importing `../store/BoardStore.ts` is `layer-imports-upward`; a store file importing `../control/ControlService.ts`
   and an overseer file importing `../store/BoardStore.ts` pass.
2. The one pipeline reading. Move `folderPrefixHoldingEntitiesOf` and `pipelineReadingInPlaceOf`
   (`TrackerPipeline.ts:84-94`) into `TrackerReader.ts` as `storedPipelineReadingOf(workspace)`: `PipelineFile.read`
   of the pipeline, then the judgement, so a readable pipeline with entities in a tracker in a folder reads as
   `PipelineFile.entitiesInAFolderReadingOf(projectPrefix)`. `readTracker` (`:71`) fills `pipelineReading` from it.
   `writeTracker` opens the Board on `requireTracker`'s contents as they come (`:185` loses its wrapping), and
   `refuseEntitiesInAFolder` (`:97-101`) stays and asks `folderPrefixHoldingEntitiesOf`, now exported from
   `TrackerReader.ts`. No reader outside the adapter judges for itself.
3. Write `BoardStore.ts` exactly as in Interfaces introduced.
4. Write `createLocalFilesBoardStore({ workspace, now, lockHolderIsGone, afterFileWritten })` returning a frozen
   `BoardStore`:
   - `commands.apply(request)` runs `writeTracker({ workspace, at: request.at, now, lockHolderIsGone, afterFileWritten,
     mutate: (transaction) => ControlService.apply(request.command, transaction, request.context) })` and answers `{
     outcome: written.result.outcome, result: written.result.result, board: written.board, unreadableRecords:
     written.unreadableRecords }`.
   - `transactions.transact(request)` runs `writeTracker` with `request.mutate` and answers `{ result, board,
     unreadableRecords }`. It adds no timeout and no retry: the hold lasts as long as the mutation.
   - `reads.readBoard()` returns `readTracker(workspace)` mapped to `StoredBoardReading`, with `unfinishedWrite` from
     `readHoldJournal(workspace)` (`absent` → `{ verdict: 'none' }`, `readable` → `{ verdict: 'pending' }`,
     `malformed` → `{ verdict: 'malformed', location: holdJournalFilePathOf(workspace), reason }`).
     `requireBoard()` is `requireTracker(workspace)`; `requireProgress()` is `requireProgressFile(workspace)`.
   - `reads.readPipeline()` is `storedPipelineReadingOf(workspace)`, the same reading a write opens the Board on.
     `reads.storedPipelineText()` moves the logic of `pipelineFileTextOf`
     (`cli/overseer/routes/BoardStateReader.ts:133-137`) without its `verdict` argument: the stored text when the file
     is readable as text, else `null`.
   - `reads.readGateProfiles()` is `GateProfilesFile.read(workspace.gateProfilesFilePath)`.
   - `reads.readLogRecords()` moves `logRecordsIn` (`cli/overseer/routes/OverseerRoutes.ts:88-91`) and answers a verdict
     instead of an empty list.
   - `reads.listTickets()` is `listTickets(workspace)`.
   - `reads.readUnfinishedWrite()` is the mapping above, alone.
   - `reads.revision()` moves `fileTextOrEmpty` (`DrivePass.ts:417-423`) and the three digest lines (`:447-449`): the
     sha256, in hex, of the progress file's text, `\0`, the log's text, `\0`, the gate profiles' text, `\0`; a missing
     or unreadable file reads as empty.
   - `reads.locationOf(reference)` answers what `LocalRecordAllocation` answers.
   - `initialise(newTracker)` is `createTracker(workspace, newTracker, now, lockHolderIsGone)`.
5. Write the contract spec with `runPortContract` (`src/testing/PortContract.ts:14`). The subject type is `() =>
   Promise<BoardStoreUnderContract>` with `{ store: BoardStore; anotherClientOfTheSameBoard: () => BoardStore }`; the
   local subject makes a scratch directory with `createScratchDirectory('board-store')`, builds a store on
   `workspacePathsFor(directory)` with a fixed `now` and `lockHolderIsGone: () => false`, awaits `initialise` with `{
   project: 'Example Agency', startedAt: <fixed stamp>, trackerId: 'example-tracker' }`, and answers a second store
   built from the same options as `anotherClientOfTheSameBoard`. Every command uses the context of
   `src/testing/EchoedControlContext.ts`. The clauses are the ones listed under Specs below; each uses only the port.
6. Write the local adapter's own spec for what the contract cannot ask of every adapter (listed under Specs).
7. In `src/StoreBoundary.spec.ts` add "every board store adapter is named by the contract": every shipping file matching
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
- A ticket's content changes only through `ticket-edit`: a `ticket-add`, then a `ticket-edit` that appends to the
  body, leaves the appended body in every later read.
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
- An unreadable ticket file is listed with its key and its location and is not on the Board.
- `revision()` is unchanged by a change of a ticket body on disk, and changed by a change of the progress file: the
  limit of the revision is part of its contract (Traps).
- A read answers at once while another store holds the lock: the read side takes no lock.
- `locationOf` answers paths inside the data folder.
- `initialise` on an existing tracker answers `already-exists` and writes nothing.
- On a tracker in a folder of its repository with a stored pipeline that holds entities, `readPipeline()` and
  `readBoard()`'s `pipelineReading` both answer malformed with `unsupportedEntities` `entities-in-a-folder`, the
  reading a write opens the Board on; a transaction that stores such a pipeline is refused `entities-in-a-folder` and
  writes nothing (`src/services/tracker/TrackerPipeline.entitiesInAFolder.spec.ts` shows the fixture). At the
  repository's root the same pipeline reads `readable`.

`TrackerPipeline.entitiesInAFolder.spec.ts` passes with its assertions unchanged.

**Done when.** In `apps/forge`: `bun test --path-ignore-patterns='.claude/**' ./src/services/store/
./src/services/tracker/ ./src/ImportDirection.spec.ts ./src/StoreBoundary.spec.ts` passes; `grep -n
"pipelineReadingInPlaceOf" src/services/tracker/TrackerPipeline.ts` prints nothing; the root's `bun run verify` is
green.

### WP5.5 Appliers and lookups through the transaction's records

**Purpose.** No command applier, no ticket filing of the pass and no ticket lookup names a record's path or parses a
record's file name.

**Files.** Change `src/services/control/TicketControls.ts`, `FilingControls.ts`, `SettingControls.ts`,
`ControlTicketLookup.ts`, `cli/tickets/utils/TicketLookupUtil.ts`, `src/services/overseer/UnreadablePipelineGate.ts`,
the entities work's `src/services/overseer/NeedTickets.ts` and `src/services/overseer/DependentFixTickets.ts`, their
specs, the specs and testing helpers that reach those two filings through a cast transaction
(`src/services/overseer/NeedTickets.spec.ts`, `EntityDecisionAnswers.spec.ts`, `JobLaunch.entityForge.spec.ts` and
`src/services/overseer/testing/CrossingStageRun.ts`; confirm with `grep -rln "as unknown as BoardTransaction" src cli`),
and `src/StoreBoundary.spec.ts`.

**What to do.**

1. `TicketControls.ts:64`: `createTicket(change.workspace, change.board, {…})` becomes
   `transaction.records.newTicket({…})`; drop the import of `TicketStore.ts`. The same in the pass's filings:
   `NeedTickets.ts:100` (`fileNeed`) and `DependentFixTickets.ts:91` (the fix ticket) call
   `transaction.records.newTicket({…})` with the same input, then set `entity`, `filedByJob` or `dependsOn` on the
   ticket it answers as today; drop their imports of `TicketStore.ts`. The cast transactions of their specs gain
   `records`: `createLocalRecordAllocation` over the scratch workspace they already seed (testing code may import the
   adapter), so the ids they assert stay those of the folder.
2. `FilingControls.ts`: `addEpic` takes `filePath` from `transaction.records.newEpicLocation(command.key)`, which
   refuses for itself; `openDraft` calls `transaction.records.requireDraftKeyIsFree(result.draft.id)` after
   `board.openDraft` (the refusal leaves before the hold writes, so the Board change is dropped). Drop the imports of
   `DraftStore.ts` and `EpicStore.ts`.
3. `SettingControls.ts:11`: `filePath` is `transaction.records.locationOf({ record: 'pipeline' })`, for all three
   refusals of `requireReadablePipeline` (`older-pipeline`, the `entities-in-a-folder` spread, `malformed-pipeline`).
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
merged-tree gate spec that asserts the step. `NeedTickets.spec.ts` and `EntityDecisionAnswers.spec.ts` pass with their
assertions unchanged: a need's ticket and a fix ticket get the ids they got before.

**Done when.** `grep -rn "createTicket\|epicFilePathOf\|draftFilePathOf\|basename" src/services/control
cli/tickets/utils src/services/overseer/NeedTickets.ts src/services/overseer/DependentFixTickets.ts` finds no call; the
allowlist holds no entry of these files; the root's `bun run verify` is green.

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
     (`src/shared/BranchNames.ts:25`). Spread both new tables into `CONTROL_APPLIERS` (`ControlService.ts:27-43`).
3. Word the four new refusal details in `OperationRefusalWordingUtil` with the sentences the verbs print today
   (`TaskAdd.ts:33-44`, `NamespaceCommand.ts:106-118`): one sentence each, the command line's, which forge serves with
   the refusal (decision 45); where the util still words a second channel, that channel gets the same sentence. Add
   rows to `docs/reference/refusals.md`.
4. In `cli/constants/JobVerbs.ts` add `BY_HAND_VERB_OF_CONTROL_KIND` beside `UNRELAYED_VERB_OF_CONTROL_KIND` (`:39-43`),
   mapping `task-add`, `task-move`, `task-correct`, `task-remove` to `task`, `log-note` to `log`, `namespace-set` to
   `namespace`. Exclude its keys from `RelayedControlCommandKind` (`:45`) and export `BY_HAND_COMMAND_KINDS` (its keys,
   frozen). `interrupted-work-resume` (stage 3) stays a relayed kind with its verb `resume`.
5. In `cli/ControlContract.spec.ts`: `VERB_OF_KIND` (`:33`) spreads the new map too; remove `task`, `log` and
   `namespace` from `NOT_RELAYABLE_MUTATING_VERBS` (`:36-57`). Rewrite the docblock of the list to say it holds only the
   verbs that apply no control command: machine setup and the Overseer's own start and stop.
6. In `cli/overseer/routes/CommandRoute.ts:55`, `COMMAND_ROUTE_KINDS` leaves out `BY_HAND_COMMAND_KINDS`, so the
   endpoint answers such a body 400 `malformed-body` as for any unknown kind; add that case to
   `CommandRoute.controlContract.spec.ts`. No system version changes: the endpoint answers exactly what it answered.
7. The verbs build the command and apply it with `ControlService.apply` inside today's `openTrackerForWriting`; WP5.8
   moves them to the command face. A verb's argument checks stay in the verb, before the command is built.

**Specs.** `TaskControls.spec.ts` and `ByHandBoardControls.spec.ts`, on the Board fixtures of
`src/testing/BoardFixtures.ts`: each kind does what its verb did, and each new refusal leaves with its detail.
`ControlService.spec.ts`: an example command per new kind in its table. `OperationRefusalWordingUtil.spec.ts`: each new
detail is worded with the command line's sentence. `ControlContract.spec.ts`: passes with the shorter list. The
existing verb specs under `cli/tracking/` pass with the printed text unchanged; where a refusal sentence changed, the
spec changes with it.

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
  `src/services/control/ControlService.ts`, `src/services/control/TicketControls.ts` (`deliverTicketByHand`, `:151`),
  `cli/CommandControlContext.ts`, `src/services/overseer/HatchInbox.ts` (`RELAYED_COMMAND_CONTEXT`, `:46`),
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
   `TicketTransition.ts:48`; the paused build row of an unheld ticket, `cli/tickets/TicketHold.ts:43`, which is already
   a command kind; the Next line) are read after the write from the board the command face answers (WP5.8). Until
   WP5.8, keep them inside the mutation callback, beside the `ControlService.apply` call.
4. The deliver-by-hand fact: add to `ControlContext` `liveOverseerOf: (dataFolder: string) => { url: string;
   batonFilePath: string } | null`. `deliverTicketByHand` (`TicketControls.ts:151`) calls it with
   `transaction.workspace.trackerDirectory` first and throws `OperationRefusal('refused', { kind:
   'overseer-owns-the-lifecycle', url, batonFilePath })` when it answers a value, as `TicketMoveSubcommands.ts:68-73`
   does today. `cli/CommandControlContext.ts` becomes `commandControlContextOf(platformPorts)` for the command line,
   whose `liveOverseerOf` is the Baton lookup of `TicketMoveSubcommands.ts:68-72` (`Baton.newestBatonOf`,
   `overseerFilesIn`, `Baton.batonFilePathFor`), and whose `mainConstitutionOf` keeps today's two-argument form
   (`rootDirectory`, an optional `constitutionPath`); the command endpoint (inside the live Overseer) and
   `RELAYED_COMMAND_CONTEXT` answer `null`, since there the Overseer applies the command in its own hold
   (`docs/cli.md:596`). `src/testing/EchoedControlContext.ts` answers `null`.
5. Word any new refusal detail as in WP5.6; add the rows to `docs/reference/refusals.md`.

**Specs.** `TicketByHandControls.spec.ts`, `EpicByHandControls.spec.ts`: each kind does what its verb did. A
`TicketControls.spec.ts` case: `ticket-deliver-by-hand` with a context whose `liveOverseerOf` answers a value is refused
`overseer-owns-the-lifecycle` and writes nothing; with `null` it delivers. `ControlContract.spec.ts`:
`NOT_RELAYABLE_MUTATING_VERBS` holds only `init`, `update`, `oversee`, `start`, `stop`, `login-item add`, `login-item
remove`. The existing specs of these verbs under `cli/tickets/` and `cli/epics/` pass.

**Done when.** Every hit of `grep -rn openTrackerForWriting cli` outside `cli/overseer/` and the `testing/` folders
passes a mutation that changes the Board only through `ControlService.apply` calls, and otherwise only reads values to
print (step 3; `TicketHold.ts` picks one of two kinds) (read each hit); the root's `bun run verify` is green.

### WP5.13 Record locations leave the model and the output; hand-editing ends

**Purpose.** Nobody hand-edits a ticket: a ticket's title and body change only through `ticket edit` (`ticket-edit`),
from the command line, a job's Hatch or the command endpoint that Gaia's later editing screen sends it to, and every
other field through its own verb (decisions 22, 47). The model carries no storage location; the local adapter alone
knows where a ticket or an epic is kept. No output names where a readable record is stored; a record the store cannot
read is still reported with its location.

**Files.**

- The model: `src/lib/tracker-model/@types/Ticket.ts` (`filePath`, `:79`), `src/lib/tracker-model/@types/Epic.ts`
  (`Epic.filePath` `:16`, `EpicAddition.filePath` `:25`), `src/lib/tracker-model/Epics.ts` (`:36`).
- The adapter: `src/services/tracker/TicketStore.ts`, `EpicStore.ts`, `TrackerPipeline.ts` (`plannedHoldOf`,
  `:144-147`), `LocalRecordAllocation.ts`, `BoardTransaction.ts`, `src/services/store/LocalFilesBoardStore.ts`,
  `src/adapters/tickets/TicketFileIngestion.ts` (`:33`), `TicketFileWriter.ts` (`:19-20`, `:34`),
  `src/adapters/epics/EpicFileIngestion.ts` (`:31`), `EpicFileWriter.ts` (`:18-32`).
- The epic filing: `src/services/control/FilingControls.ts`.
- The outputs: `cli/tickets/TicketReadingSubcommands.ts` (`:51`), `src/adapters/utils/TicketJsonUtil.ts` (`:5`,
  `:18`), `cli/epics/EpicOutput.ts` (`:7`, `:32`), `cli/drafts/DraftOutput.ts` (`:12-19`), `cli/drafts/DraftCommand.ts`
  (`:49`), `src/shared/@types/PagePayload.ts` (`:111`), `src/services/render/PagePayloadAssembly.ts` (`:61`), and, added by WP5.1,
  `bridge/views/pipeline/live/PipelineFileDialog.tsx` (`title="pipeline.json"`) and `LiveFooter.tsx` ("View
  pipeline.json").
- The fixtures and specs: `src/testing/BoardFixtures.ts` (`:64`, `:75`),
  `src/lib/tracker-model/testing/LifecycleWorld.ts`, `src/testing/TrackerFileFixtures.ts`,
  `src/testing/WatcherJob.ts`, `src/testing/EveryBoardLogRecord.ts`, and every spec that builds a `Ticket` or an
  `Epic` with `filePath` or asserts a `file:` line or a JSON `filePath`. `grep -rln "filePath" src cli bridge | grep
  "\.spec\.\|/testing/\|\.dom\."` lists 69 files today; read each hit, since most name another record's path.
- The installed text: `resources/templates/SessionInstructions.md` (`:24-25`), `resources/templates/Reference.md`
  (`:7`, `:13-17`, `:90-93`, `:96-100`), `skills/agent-po/SKILL.md` (`:20`),
  `skills/agent-progress-orchestrate/SKILL.md` (`:24`), `cli/constants/InstallVersion.ts` (`:1`),
  `cli/FrozenInstalledSurface.json` when the surface specs ask for a new key, and the recording of
  `src/services/overseer/InstallChangeWatch.ts`.
- The rules and docs: `apps/forge/CLAUDE.md` (`:387-388`), `apps/forge/docs/cli.md` (`:461`, `:756`, `:799`, `:3042`,
  `:3117-3127`).
- `src/StoreBoundary.spec.ts`: the entries of the changed files.

**What to do.**

1. Delete `Ticket.filePath`, `Epic.filePath` and `EpicAddition.filePath`; `Epics.addEpic` (`Epics.ts:36`) builds the
   epic without one. The ingestions read a ticket or an epic without a location.
2. Tickets in the adapter. `listTickets(workspace)` answers a `LocalTicketListing`, private to `TicketStore.ts`: the
   port's `TicketListing` plus `ticketLocations: ReadonlyMap<string, string>`, each listed ticket's file by its id.
   `createTicket` answers `{ ticket, location }`, the location being today's `<tickets>/<id>-<slug>.md`.
   `TicketsSpentInHold.tickets()` picks only `frontmatter`, and `unusedSlugFor` (`:213-224`) takes the hold's taken
   file names from the locations the allocation holds instead of `basename(ticket.filePath)`. A retitle renames no file:
   the location stays the one the ticket was read from.
3. `LocalRecordAllocation` keeps the ticket locations: seeded from the listing, extended by every `newTicket`. Beside
   the `RecordAllocation` members it offers the adapter alone `storedTicketLocationOf(ticketId)`, which throws an
   `Error` naming the id for a ticket neither listed nor allocated: the Board changed a ticket the store never held, a
   bug that crashes the pass (decision 14).
4. Epics in the adapter: an epic's location is `epicFilePathOf(workspace, epic.frontmatter.key)`, since an epic is its
   file name (`EpicStore.ts:22`). `RecordAllocation.newEpicLocation(epicKey)` becomes `requireEpicKeyIsFree(epicKey)`,
   refusing as before and answering nothing; `FilingControls.addEpic` calls it and passes no location.
5. `plannedHoldOf` writes each changed ticket at `storedTicketLocationOf(ticket.frontmatter.id)` and each changed or
   removed epic at its key's location. `TicketFileWriter` and `EpicFileWriter` take the location as a parameter where
   they read the stored text to splice (`TicketFileWriter.ts:34`, `EpicFileWriter.ts:32`) and where they write.
   `LocalFilesBoardStore`'s `reads.listTickets()` answers the port's `TicketListing` without the locations.
6. The outputs: delete the `file:` lines of `ticket show`, `epic show` and `draft show` and the `filePath` field of the
   ticket document and the epic document; `draftSummaryOf` loses its `filePath` parameter, and `DraftCommand.ts` stops
   importing `DraftStore.ts`; `PageTicket` and `PagePayloadAssembly` lose `filePath` (the Bridge reads none:
   `grep -rn "filePath" bridge` finds no shipping reader). The reports of unreadable records keep their `location`:
   `status`'s ignored lines, `malformed-ticket-file`, `unreadable-file-in-the-way` and the pipeline refusals.
7. The installed text. In `SessionInstructions.md:24-25`, replace the instruction to edit a ticket below its
   frontmatter with: "Never edit a file under `{{dataFolder}}`. Change a ticket's title or body with `{{program}}
   ticket edit`, and each other field with its own `ticket` verb; the board refuses what it does not allow." In
   `Reference.md`, the section "The ticket file" becomes "A ticket": keep the fields' table and the body sections; drop
   the file's path and name (`:15-17`), the paragraph on unknown keys and hand-written lines (`:90-93`), and the clause
   on the frontmatter's bytes in the `ticket edit` paragraph (`:96-100`); `:7` names "the ticket's fields" in place of
   "the ticket file an agent edits". The two skills name "the ticket's fields" where they name "the ticket file's
   format". Raise `INSTALL_VERSION` by one over the value the stages before left: an installed file names `ticket show`
   as printing the file path to edit, which this package makes false. Add the frozen surface key the two surface
   specs print, if they print one, and in the same commit run
   `bun run record src/services/overseer/InstallChangeWatch.ts`.
8. The rules and docs. `apps/forge/CLAUDE.md:387-388` becomes: "Nobody hand-edits a ticket file: a ticket's title and
   body change through `ticket edit` (`ticket-edit`), each other field through its verb, and every change is a command
   the board accepts or refuses. The local store reads the frontmatter subset of `docs/cli.md` and keeps any other
   line it finds." In `docs/cli.md`, `:461`, `:756` and `:799` stop naming a file path; the section at `:3042` states
   that the file is the local store's format, never edited by hand, and `:3117-3120` drops the invitation to add a
   field by hand while still saying that unknown lines are kept.
9. Remove the allowlist entries of the changed files (`cli/drafts/DraftCommand.ts`'s `draftFilePathOf` among them).

**Specs.**

- `TicketStore.spec.ts`: the listing answers each listed ticket's location by id; a ticket filed in the hold gets a
  slug no listed or allocated file holds.
- `LocalRecordAllocation.spec.ts`: an allocated ticket's location is answered by `storedTicketLocationOf`; an id never
  listed nor allocated throws; an epic key held by an unreadable file is refused by `requireEpicKeyIsFree`.
- `TrackerPipeline.spec.ts`: a changed ticket is written to the file it was read from, also after a retitle; a new
  ticket to its allocated file; an epic to `<key>.md`.
- `FilingControls.spec.ts`: `epic-add` files the epic with no location in the model.
- The verb specs of `ticket show`, `epic show` and `draft show`: no `file:` line, and no `filePath` under `--json`; an
  ignored ticket file is still named by its path on standard error.
- `cli/InstalledSurface.spec.ts` and `cli/InstalledSurface.status.spec.ts` pass with the new version key; the
  `InstallChangeWatch` recording's stamp is the new install version.

**Done when.** In `apps/forge`: `grep -rn "filePath" src/lib/tracker-model` prints nothing; `grep -rnE "file: +\\$\{"
cli/tickets cli/epics cli/drafts` prints nothing; `grep -n "hand-edited" CLAUDE.md` prints nothing; the root's
`bun install --frozen-lockfile` and `bun run verify` are green.

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
3. Switch every verb, the entities work's `ticket entity`, `ticket group` and `need declare` among them: a call
   `openTrackerForWriting(arguments, context, (change) => ControlService.apply(command, change,
   COMMAND_CONTROL_CONTEXT).result)` becomes `(await applyCommandOfVerb(arguments, context, command)).result`. A value
   the verb printed from the Board inside the hold (WP5.7, step 3) is read from `written.board`; `ticket hold` and
   `ticket unhold` build their one command before the call.
4. `recordIncidentMove` (`cli/RecordedIncidentMove.ts:44-53`) keeps `hatchWhenUnderJob` first, so every incident move
   and stage 3's `resume` stay relayed under a job, and then applies with `applyCommandOfVerb`.
5. `CommandRoute.ts:161`: the route receives the Overseer's store (passed in its `CommandRouteRequest`, built once by
   WP5.10; until then, `boardStoreOf(request.context)`), applies with `store.commands.apply` and the endpoint's context
   (`liveOverseerOf` answers `null`), and answers `appliedAnswerOf({ outcome, result })` as before. Its refusal and
   `TypeError` handling (`:163-168`) are unchanged.
6. `OverseerForeground.ts:171`, `:561-568`, `:657`, `:679`, `:692` and `OverseerFlintBrain.ts:74`: each becomes
   `writeAsTheOverseer(store, context, workspace, (transaction) => …)` with the same Board call; `writeAsTheOverseer`
   runs `store.transactions.transact({ at: context.now() formatted as today, mutate })`, then `registerWrittenTracker`.
   It sends no nudge: the writer is the Overseer itself.
7. `cli/testing/OverseerTicketMoves.ts`: applies its Overseer moves through `transactions.transact` of a store from
   `boardStoreOf`. It is testing code; the guard does not scan it.
8. Remove the allowlist entries of every switched file; add the one entry `cli/BoardStoreOf.ts: store-internal-import:
   <its import line>` with the reason "The CLI's composition root picks the store's adapter."

**Specs.** `cli/ApplyCommandOfVerb.spec.ts`: a verb under a job is refused `verb-not-relayable` before any file is read;
an unreadable ticket file is reported on standard error after a write and the exit code is 0; the nudge is sent after
the lock is released (observe through the store: a read during the nudge is not blocked). `RecordedIncidentMove` specs:
under a job the move is relayed and the store is not touched. `CommandRoute` specs pass unchanged in what they assert.
Every verb spec passes.

**Done when.** `cli/OpenTrackerForWriting.ts` does not exist; `grep -rn "writeTracker\|ControlService.apply" cli` finds
no shipping line; the root's `bun run verify` is green; the end-to-end check of the whole stage passes on a scratch
board up to `jobs`.

### WP5.9 The CLI reads through the read side

**Purpose.** No CLI verb outside the Overseer process reads a record except through `store.reads`, `init` creates the
board through `initialise`, and the registry entry names no record's location.

**Files.** Change the read sites of the Today's code table in `cli/tracking/status/StatusCommand.ts`,
`cli/tickets/TicketList.ts`, `cli/tickets/TicketReadingSubcommands.ts`, `cli/epics/EpicCommand.ts`,
`cli/drafts/DraftCommand.ts`, `cli/decisions/DecisionsCommand.ts`, `cli/incidents/IncidentsCommand.ts`,
`cli/jobs/JobsCommand.ts`, `cli/jobs/JobCommand.ts`, `cli/merges/MergesCommand.ts`,
`cli/measurement/review-stats/ReviewStatsCommand.ts`, `cli/tracking/await/AwaitCommand.ts`,
`cli/dispatch/concurrency/ConcurrencyCommand.ts`, `cli/tracking/namespace/NamespaceCommand.ts`,
`cli/gates/GatePipelineVerbs.ts`, `cli/adoption/init/InitCommand.ts`, `cli/setup/login-item/LoginItemCommand.ts`,
`cli/overseer/OverseerCommand.ts`, `cli/overseer/StartCommand.ts`, `cli/overseer/StopCommand.ts`,
`cli/RegisterWrittenTracker.ts`, `src/services/tracker/MonitorRegistration.ts`, `docs/cli.md` (`:2964-2965`, `:2995`),
their specs, and `src/StoreBoundary.spec.ts`.

**What to do.**

1. Each `requireTracker(workspace)` becomes `store.reads.requireBoard()`; each `requireProgressFile(workspace)` becomes
   `store.reads.requireProgress()`; `listTickets(workspace)` and `readTicket(workspace, reference)` become
   `store.reads.listTickets()` and a find over it by `TicketIdUtil.parseTicketReference`.
2. `StatusCommand.ts:39-43`: `store.reads.readUnfinishedWrite()`; on `malformed` print the same sentence with `location`
   where it printed `holdJournalFilePathOf(workspace)`.
3. `GatePipelineVerbs.ts:222-229` (`listPipeline`): `store.reads.readPipeline()`, the judged reading, so its
   `entities-in-a-folder` refusal (`:225-227`) is reached; its three refusals take `filePath` from
   `store.reads.locationOf({ record: 'pipeline' })`.
4. `InitCommand.ts:160`: `store.initialise({…})`; `:172` reports `store.reads.listTickets().unreadable`; `:66`
   `store.reads.requireProgress()`.
5. `MonitorRegistration.ts`: `MonitorRegistrationRequest` (`:26-41`) replaces `workspace` with `rootDirectory`,
   `htmlFilePath` and `progress: ProgressRegistrationReading` (`{ verdict: 'readable'; trackerId; project } | {
   verdict: 'absent' } | { verdict: 'unreadable'; reason }`); the reading at `:140-142` moves to the caller.
   `cli/RegisterWrittenTracker.ts` builds `progress` from `store.reads.requireProgress` (caught as a verdict). The entry
   stops writing `progressJson` (`:152`): no code in `apps/` or `packages/` reads it (`git grep -n "progressJson" --
   apps packages ':!*.spec.ts'` names only the writer, `docs/cli.md` and Gaia's recording), and a board's records are
   reached through the forge, never by path. `docs/cli.md:2965` and `:2995` drop it. The registry's format version is
   unchanged: nothing reads the key.
6. Remove the switched files' allowlist entries.

**Specs.** The existing verb specs pass with the same output. `MonitorRegistration` specs build the request with the new
fields, and an entry it writes holds no `progressJson`. A `StatusCommand` spec: a malformed hold journal prints its
location and `status` still prints the board. A `GatePipelineVerbs` spec: in a tracker in a folder with a stored
pipeline that holds entities, `gate list` is refused `entities-in-a-folder`.

**Done when.** `grep -rnE "tracker/(TrackerReader|TicketStore|EpicStore|DraftStore|HoldJournal|TrackerCreation)\.ts"
cli` finds no shipping line (specs and `testing/` folders aside); `grep -rn "progressJson" src cli` prints nothing; the
allowlist holds no entry of the files above; the root's `bun run verify` is green.

### WP5.10 The Overseer's pass, server and reads through the store

**Purpose.** The Overseer process builds one store at its start and hands it to the pass, the Airlocks' hold runner,
gate profiling, pipeline checks, the reconnect at start, the HTTP routes and its own records. The pass changes the board
only through `transactions.transact` and reads only through `reads`.

**Files.** Change `src/services/overseer/DrivePass.ts`, `src/services/overseer/Regrouping.ts` (or the module stage 2 put
in its place), `cli/overseer/OverseerForeground.ts`, `cli/overseer/OverseerFlintBrain.ts`,
`cli/overseer/routes/BoardStateReader.ts`, `cli/overseer/routes/OverseerRoutes.ts`,
`cli/overseer/routes/CommandRoute.ts` (the store from its request), `src/testing/DrivePassHarness.ts`, their specs, and
`src/StoreBoundary.spec.ts`. Added by WP5.1, stage 3's files with a record path: `src/services/overseer/StartGate.ts`
(`requireProgressFile`) and `cli/overseer/routes/PresenceReader.ts` (`requireTracker`).

**What to do.**

1. `DrivePassRequest` (`DrivePass.ts:209`) gains `boardStore: BoardStore`. `OverseerForeground.ts` builds it once with
   `createLocalFilesBoardStore({ workspace, now, lockHolderIsGone: platformPorts.processSupervision.processIsGone })`
   and passes it to the pass, to `writeAsTheOverseer` (replacing WP5.8's per-call store), to the routes and to the
   command route. Add an allowlist entry for this import line, with the reason "The Overseer's composition root picks
   the store's adapter."
2. `holdTracker` (`DrivePass.ts:1170-1183`) runs `request.boardStore.transactions.transact({ at, mutate })` with the
   same body: the Baton check first, the copy of the jobs, the mutation, the token credit. `AirlockHoldRunner`
   (`Airlocks.ts:72`) and `AirlockHold` keep their shapes.
3. `runOnePass` (`DrivePass.ts:1336-1440`) runs `transactions.transact` with the same mutation; the pass reads
   `written.result` and `written.board` as before.
4. `observe` (`:464`, `:493`): `request.boardStore.reads.requireProgress()` and `reads.readPipeline()`. `fingerprintOf`
   (`:436-459`) takes the revision in place of the workspace and digests `revision ${boardStore.reads.revision()}\n`
   where the three file digests were (`:447-449`); delete `fileTextOrEmpty` (`:417-423`).
5. `:1055` and `:1291`: `reads.requireProgress()`. `:1257`: `reads.readPipeline()`, still read afresh at every gate run.
   `pipelineOnDisk` (`:1138-1141`), which the entities work added for the confined lines of a gate profile and a
   pipeline check: `reads.readPipeline()`, still read afresh at every line. Each now takes the judged reading, the one
   the pass's own write opens the Board on.
6. Regrouping (`Regrouping.ts:224`), or stage 2's reconnect: `reads.requireProgress()`.
7. `OverseerForeground.ts:269`, `:275`, `:339`, and `OverseerFlintBrain.ts:42`: `reads.requireProgress()`.
8. `BoardStateReader.ts:133-137`, `:153`: `reads.requireBoard()` and `reads.storedPipelineText()`.
9. `OverseerRoutes.ts:76-79`, `:88-91`, `:153`, `:161`: `reads.readGateProfiles()` and `reads.readLogRecords()` (an
   unreadable log still names no sender, as `:87` says).
10. `src/testing/DrivePassHarness.ts`: build the store for the harness's scratch workspace.
11. Remove the switched files' allowlist entries.

**Specs.** The DrivePass specs pass with their assertions unchanged. New `DrivePass` cases: a write by another client
of the store between two wakes is seen by the next pass, and an unforced wake with no write is skipped by the
fingerprint; in a tracker in a folder with a stored pipeline that holds entities, the merged-tree gate answers the
unreadable pipeline's step, as the pass's write reads the pipeline unreadable. The routes' specs pass. The crash matrix
(`CrashMatrix.integration.spec.ts`) is not run by `verify`; it runs when the owner asks for `bun run verify:integration`
(gate G4, `apps/forge/CLAUDE.md:20`).

**Done when.** `src/StoreBoundary.spec.ts`'s allowlist holds no entry of `src/services/overseer/` or `cli/overseer/` but
the composition-root import of `OverseerForeground.ts` and the entries WP5.9 owns (`cli/overseer/OverseerCommand.ts`,
`cli/overseer/StartCommand.ts`) while WP5.9 has not landed; the root's `bun run verify` is green; the end-to-end check of
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
  `cli/adoption/init/InitCommand.ts`, `src/services/tracker/RepositoryTrackerList.ts`, every spec and testing helper
  that reads a record field of a `Workspace` (found with the grep below), and `src/StoreBoundary.spec.ts`.

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
   `findWorkspace` asks `boardIsStoredAt`. `progress.html` keeps its name in a constant private to `Workspace.ts`, which
   stage 8 deletes with the stub.
3. `LOCAL_STORE_FILES` holds the record names of today's `TRACKER_FILES` (`TrackerFiles.ts:5-17` without
   `TRACKER_DIRECTORY_NAME` and `HTML_FILE_NAME`). `cli/InstalledFiles.ts` (`:37`, `:46`, `:47`), `InitCommand.ts:157`
   and `RepositoryTrackerList.ts:52` use `PRODUCT_NAMES.DATA_FOLDER`; `cli/InstalledFiles.spec.ts` and
   `TrackerFiles.spec.ts` are the specs that name `TRACKER_FILES` today.
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
`apps/forge/docs/backlog.md`, and any rule under the root's `.claude/rules/` that names `writeTracker`,
`TrackerChange` or `openTrackerForWriting` by then (none does at `b4174bd9`; the run changes rule files as it needs).

**What to do.**

1. `CLAUDE.md`, Imports (`:59`): `src/services/ (render → tracker → lifecycle → control → store → overseer)`.
2. `CLAUDE.md`, Stored files: add the rule "The core reaches a stored record only through the store port, `BoardStore`
   in `src/services/store/BoardStore.ts`: commands through its command face, the Overseer's pass through its transaction
   face, every read through its read side. Its one adapter, `LocalFilesBoardStore`, is the only code that names a
   record's path or judges a stored pipeline; `src/StoreBoundary.spec.ts` holds it, and
   `src/services/store/BoardStore.contract.spec.ts` is what any adapter must pass."
3. `CLAUDE.md`, Command surface (`:379-383`): "Every mutating command applies a `ControlCommand` through the store's
   command face (`cli/ApplyCommandOfVerb.ts`), whose local adapter runs `writeTracker` in
   `src/services/tracker/TrackerPipeline.ts` (lock, read into a Board, change, writes in `docs/cli.md`'s order, one lock
   hold; nothing renders), and `cli/RegisterWrittenTracker.ts` registers the tracker with the monitor after every write
   and at the Overseer's start. A verb that changes the board and is never relayed applies a by-hand kind, which the
   command endpoint refuses. …" keeping the rest of the bullet.
4. `CLAUDE.md`, Deviations: add the row of Interfaces introduced (the last subsection).
5. `docs/concepts/overview.md:190`, `:210`: the transaction is the store's transaction face, run by `writeTracker` in
   the local adapter; `:205`: a verb with no Overseer applies through `cli/ApplyCommandOfVerb.ts`.
   `docs/glossary.md:104`, `:682`: a lock hold is one write of the store's local adapter. `docs/backlog.md:30`:
   `TrackerChange.deleteAllTicketFilesAfterwards` becomes `BoardTransaction.deleteAllTicketFilesAfterwards` in
   `src/services/tracker/BoardTransaction.ts`.

**Specs.** `src/ProseWrap.spec.ts` holds the 120-column wrap of `CLAUDE.md`.

**Done when.** From the repository root, `grep -rnwE "TrackerChange|OpenTrackerForWriting|openTrackerForWriting"
--exclude-dir=research apps/forge/CLAUDE.md apps/forge/docs .claude/rules` prints nothing; the root's `bun run verify`
is green. `docs/research/` is a dated record and is not changed.

### WP5.14 Committed: `pending` takes the name

**Purpose.** Decision 48: committed is the state in which an agent may pick a ticket up at any moment, and today's
status `pending` takes the name, in the model, every stored value and log record, the wording, the CLI, the installed
text and the documents. The rules stay what they are for `pending` today; WP5.16 and WP5.17 change them. Runs after
WP5.11, WP5.12 and the whole of stage 4.

**Files.**

- The ladders: `src/lib/tracker-model/@types/Task.ts` (`TaskStatus`, `:7`), from which `TicketStatus` and
  `RowedTicketStatus` derive (`@types/Ticket.ts:9-11`); `constants/Statuses.ts` (`TASK_STATUSES` `:5`,
  `TICKET_STATUSES` `:7`, `TICKET_STATUSES_EDITABLE_WITHOUT_FORCE` `:16`) and `Statuses.spec.ts`;
  `constants/TicketMoveLegality.ts` (`:11`, `:12`, `:16`).
- Every literal the compiler then refuses: `bun run typecheck` in `apps/forge` lists them. `git grep -n "'pending'" --
  src cli bridge ':!*.spec.ts'` finds 112 lines in 61 files at `e17e26a1`, among them other words' `pending` that stay
  (an Apply pending, `UnfinishedWriteReading`'s `'pending'`, the Bridge's pending pictures): a literal changes only
  where its type is `TaskStatus`, `TicketStatus`, `RowedTicketStatus`, `DisplayState`, `MovedToStatus` or a `Record`
  keyed by one, among them `StatusWordingUtil.ts:13-29`, `LogUtil.ts:25-31` and `TicketMoveSubcommands.ts:30-33`.
- What no type holds: the Bridge's `data-state` selectors (`bridge/styles/board.css:760`, `:832`, `:1550`, `:1771`,
  `:2220`; `git grep -n 'data-state="pending"' -- bridge`).
- The refusal reasons that name the status (`BoardRefusal.ts:65-67`, `:72`): `lowering-a-ticket-that-is-not-pending`,
  `edit-of-a-ticket-past-pending`, `network-of-a-ticket-past-pending`, `entity-of-a-ticket-past-pending`; their
  sentences in `src/adapters/utils/OperationRefusalWordingUtil.ts` and rows in `docs/reference/refusals.md`. The option
  `allowsPastPending` of `TicketEdit` (`TicketEdits.ts:20`), of `setTicketEntity` (`TicketSettings.ts:125`) and of the
  command `ticket-edit` (`src/shared/@types/ControlCommand.ts:96`, `TicketControls.ts:119`).
- The log: `ticket-readied` (`constants/LogRecordSchema.ts:118`) and its readers (`git grep -l "'ticket-readied'" --
  src cli bridge` lists 14 files at `e17e26a1`, `DispatchQueries.ts`, `FailedPassUtil.ts`,
  `MonitorSnapshotAssembly.ts`, `LogUtil.ts` and `cli/testing/CutoverSmokeUtil.ts` among them).
- The wording and the CLI: `src/adapters/utils/StatusWordingUtil.ts`, `cli/HelpText.ts` (`git grep -n pending
  cli/HelpText.ts`), `ticket list --status` (`cli/tickets/TicketList.ts:21`), `ticket status <id> <status>`
  (`cli/tickets/TicketTransition.ts`), `ticket reopen` (`TicketMoveSubcommands.ts:32`).
- The installed text: `resources/templates/Reference.md` (`:99`, `:149-161`, `:213`), `SessionInstructions.md:17`,
  `resources/prompts/ProductOwnerPrompt.md:23`, `resources/prompts/EntityAssignmentRequest.md:1`,
  `skills/agent-po/SKILL.md` (`:27`, `:70-71`, `:145`), `cli/constants/InstallVersion.ts`,
  `cli/FrozenInstalledSurface.json` as the surface specs ask, and the recording of
  `src/services/overseer/InstallChangeWatch.ts`.
- The docs: `apps/forge/docs/cli.md` (47 lines name pending at `e17e26a1`, the moves table at `:3239-3241` among
  them), `docs/reference/refusals.md`, `docs/glossary.md`.
- The contract's mapping: the one value stage 4's board-document mapper and its parity spec map from `pending` to
  `committed` (WP4.6, WP4.8).
- The specs and fixtures that build or assert a `pending` ticket or row: `git grep -n "'pending'" -- '*.spec.ts'
  '*.dom.tsx'` finds 347 lines at `e17e26a1`; the fixtures of `src/testing/` and `src/lib/tracker-model/testing/`; the
  stored JSON fixtures that hold a ticket or row status.

**What to do.**

1. Rename the value in `TaskStatus` and `TASK_STATUSES`, keeping its place in the ladder. It is one ladder:
   `TicketStatus` derives from `TaskStatus`, and a row takes its ticket's status in the same move
   (`TicketMoves.applyTicketMove`, `:276-293`, through `transitionTaskInPlace`), so a row says `committed` too. A
   free-standing row in `committed` is work committed to and not started.
2. Rename `TICKET_STATUSES_EDITABLE_WITHOUT_FORCE` to `TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP`, the same three
   statuses: `draft`, `ready-for-review`, `committed`. Its docblock already says what it holds. Its readers keep their
   rule (`TicketEdits.ts:55`, `TicketSettings.ts:40`, `:100`, `:130`,
   `bridge/views/pipeline/live/EntityWorkModel.ts:106` and stage 4's served `noAgentHasPickedItUp`); WP5.16 gives the
   content edit a set of its own.
3. Rename the refusal reasons to `lowering-a-ticket-that-is-not-committed`, `edit-of-a-ticket-past-committed`,
   `network-of-a-ticket-past-committed` and `entity-of-a-ticket-past-committed`, and the option `allowsPastPending` to
   `allowsPastCommitted`. Each sentence says "committed" where it says "pending" ("only a draft or committed ticket can
   be lowered to low").
4. Rename the log record `ticket-readied` to `ticket-committed`, worded "Ticket #003 committed". `ticket-reopened`
   keeps its name: it is the move back to committed from a later status, and `LogUtil`'s map
   (`STATUS_REACHED_BY_MOVE_KIND`, `:25-31`) names `committed` for it.
5. The CLI words the status as its value, `committed`: `StatusWordingUtil`'s maps, `ticket list --status committed`,
   `ticket status <id> committed`, the help text. `ticket reopen` keeps its verb and moves to `committed`.
6. Stored values: a ticket file's `status: committed`, a row's `status` and each `history[].status`. No stored format's
   version rises here: `progress.json` rises once, in stage 9 (WP9.2), and every board is set up anew after stage 9
   (gate G6), so the renamed code never reads a board that holds `pending`. A ticket file holding `status: pending`
   reads as malformed, as any unknown status does.
7. The documents: the summary's and the monitor's `ticketCountByStatus` (`DisplayQueries.ts:49-53`) carry `committed`
   in place of `pending`. No contract type declares that map and no supported client reads it
   (`packages/forge-contracts/@types/BoardSummaryDocument.ts:3`, `MonitorSnapshotDocument.ts:4`), so no system version
   changes, and Gaia's fixtures, which read none of it, stay. The board document already says `committed` (stage 4):
   delete the mapping of the one value in the mapper and in `BoardVocabulary.parity.spec.ts`, so the parity spec
   compares the lists directly.
8. Replace the status word in the installed text and the docs. Raise `INSTALL_VERSION` by one over what the packages
   before left, add the frozen surface key the surface specs print, and in the same commit run `bun run record
   src/services/overseer/InstallChangeWatch.ts`.

**Specs.**

- The existing specs, their fixtures renamed, pass with their claims unchanged.
- `Statuses.spec.ts`: `TICKET_STATUSES` reads `draft`, `ready-for-review`, `committed`, `in-progress`, `in-review`,
  `reviewed`, `delivered`, `abandoned`, in that order, and `TASK_STATUSES` holds `committed` where it held `pending`.
- `Board.ready.spec.ts`: readying moves a draft to `committed` and logs `ticket-committed`; `Board.ticketMoves.spec.ts`:
  a reopen leaves the ticket `committed` and logs `ticket-reopened`.
- The verb spec of `ticket status`: `ticket status 001 pending` is refused as an unknown status.
- `BoardVocabulary.parity.spec.ts` holds the contract's status lists equal to the model's with no mapping.

**Done when.** In `apps/forge`: `bun run typecheck`, `bun run lint` and `bun test` pass, and these print nothing
(`docs/research/` is a dated record and is not changed):

```sh
git grep -n "past-pending\|not-pending\|PastPending\|EDITABLE_WITHOUT_FORCE\|ticket-readied" \
  -- src cli bridge docs resources skills ':!docs/research'
git grep -n 'data-state="pending"' -- bridge
```

`git grep -nw pending -- resources skills docs/cli.md` prints no line where the word is a ticket's or a row's status
(read each). At the root, `bun install --frozen-lockfile` and `bun run verify` are green.

### WP5.15 The store's lock passes only from a holder whose process is gone

**Purpose.** Decision 48: the store's write lock is taken over from a holder that is no longer alive, judged by the
process and not by the lock's age. Committed (WP5.14) is a status of the ticket record and no lock, so a crashed
Hephaestus leaves nothing of it to release; the lock is the one thing a dead process can leave held. Runs alone after
WP5.14, and so after the whole of stage 4: it changes `OperationRefusalWordingUtil.ts`, which stage 4 also changes.

Today's lock (`src/services/tracker/GenerationLock.ts` after WP5.2, moved unchanged from `TrackerLock.ts:28-199`)
already frees a held record at once when the platform reads its process as gone (`generationIsFree`, `:100-109`; the
case "a lock left behind by a process that no longer exists is taken over at once",
`TrackerLock.integration.spec.ts:169`). What it lacks:

- It also takes a live holder's lock once the record's stamp is older than `LIMITS.LOCK_STALE_MILLISECONDS`, 30
  seconds (`Limits.ts:3`; `TrackerLock.ts:106-108`, and the case at `TrackerLock.integration.spec.ts:180`). A hold
  that runs git for longer, or a machine that sleeps inside a hold, reaches it.
- The record names its holder by process id alone (`LockPayload`, `:28-31`). After a crash and a reboot, or once the
  id is reused, a dead holder's id can read as a live process, and then only the age frees the lock.
- An unreadable record is judged by its file's age (`:100-101`, `:111-118`).
- A caller with no platform check reads every holder as live (`NO_LOCK_HOLDER_READS_AS_GONE`, `:44`), so only the age
  frees its lock: the defaults of `TrackerPipeline.ts:180`, `TrackerCreation.ts:25` and `MonitorRegistration.ts:137`
  at `e17e26a1`.

**Files.**

- `src/services/tracker/GenerationLock.ts` and its specs, `src/services/tracker/TrackerLock.ts` (`withLock`), and a
  new `src/services/tracker/LockHolders.ts` with its spec.
- Every caller that passes a holder check: `git grep -n "lockHolderIsGone\|NO_LOCK_HOLDER_READS_AS_GONE" -- src cli`
  lists them after WP5.11; at `e17e26a1` they are `cli/OpenTrackerForWriting.ts:27`, `cli/RegisterWrittenTracker.ts:18`,
  `cli/overseer/OverseerForeground.ts:160`, `src/services/overseer/DrivePass.ts:1174`, `:1340`,
  `src/services/lifecycle/Landing.ts:28`, `:184`, `src/services/tracker/MonitorRegistration.ts:137`,
  `RepositoryTrackerList.ts:75`, `TrackerCreation.ts:25`, `TrackerPipeline.ts:180`, and
  `src/services/overseer/testing/AirlocksHarness.ts:149`; after this stage, `cli/BoardStoreOf.ts` and
  `src/services/store/LocalFilesBoardStore.ts` (`LocalFilesBoardStoreOptions.lockHolderIsGone`).
- `src/shared/constants/Limits.ts` (`:3`) and `Limits.spec.ts` (`:28`).
- The refusal: `src/shared/OperationRefusal.ts` (the detail), `src/adapters/utils/OperationRefusalWordingUtil.ts`,
  `docs/reference/refusals.md`.
- The specs that take a lock over by age: `src/services/overseer/CrashMatrix.spec.ts` (`:135-140`),
  `src/services/tracker/HoldJournal.spec.ts` (`:236`, `:256`), `TrackerLock.integration.spec.ts` (`:180-207`).
- The docs: `apps/forge/docs/glossary.md` ("stale lock", `:1039-1041`).

**What to do.**

1. The record names its holder by process identity: `LockPayload` becomes `{ holder: LockHolder; acquiredAt: string }`
   with `LockHolder = { processId: number; startStamp: string | null; bootIdentity: string | null }`, read once per
   process from `processSupervision.identityOf(process.pid)` (`src/lib/process-identity/ProcessSupervision.ts:41`);
   both are `null` where the platform cannot read them (`UnsupportedProcessSupervision.ts:16`). `acquiredAt` stays a
   fact for a report, never judged.
2. `LockHolders.ts` exports `lockHolderOf(supervision): LockHolder`, this process's record, and
   `lockHolderIsGoneOf(supervision): LockHolderIsGone`, where `LockHolderIsGone` becomes `(holder: LockHolder) =>
   boolean`. A holder is gone when its process id is gone (`processIsGone`), or when the process now at that id is
   another one: `identityOf` answers an identity and `sameProcess` (`ProcessSupervision.ts:44`) with the recorded
   start stamp and boot identity is false. When the platform cannot tell (no recorded identity, or `identityOf`
   answers `null` for a live id), the holder reads as alive: a lock is never taken from a process that may still run.
3. `generationIsFree`: a record is free when it is released or its holder is gone, and never by its age. Delete the
   age rule, `fileIsOlderThanTheStaleThreshold`, `LIMITS.LOCK_STALE_MILLISECONDS`, the clause of `Limits.spec.ts:28`
   and the docblock's clock exception; the lock then obeys `apps/forge/CLAUDE.md`'s clock rules with no exception.
4. An unreadable record: the tool creates every record whole (`createFileAtomically`), so only damage outside the tool
   leaves one, and no process can be judged from it. The attempt answers it, and `withLockAt` throws
   `OperationRefusal('unrepaired', { kind: 'lock-record-unreadable', recordPath })` at once, exit 2, worded with the
   record's path and that removing it frees the lock. A lock folder that cannot be listed stays "held", as today.
5. Delete `NO_LOCK_HOLDER_READS_AS_GONE`. Every caller passes `lockHolderIsGoneOf(context.platformPorts.
   processSupervision)` and writes `lockHolderOf(...)`: the store's local adapter, and the registry's, the repository
   tracker list's and the landing's locks, which share the mechanism. A spec passes a judgement of its own.
6. Keep the fence (`requireStillHeld`, `lock-taken-over`): a holder that a platform misjudged as gone while it still
   ran must write nothing more. Stage 3's `AbandonedPassReason` keeps `lock-taken-over`.
7. The retry budget stays (`LIMITS.LOCK_RETRY_COUNT` × `LIMITS.LOCK_RETRY_INTERVAL_MILLISECONDS`, about five
   seconds): a command that meets a live holder for longer is refused `tracker-lock-held`, as today.
8. `docs/glossary.md`, "stale lock": a held lock record whose process is gone or is no longer the recorded process;
   its age frees nothing. `docs/reference/refusals.md`: a row for `lock-record-unreadable`.

**Specs.**

- `LockHolders.spec.ts`, on a stubbed supervision: a holder whose id is gone is gone; one whose id now runs a process
  with another start stamp or boot identity is gone; one that is the recorded process is alive; one whose identity
  cannot be read, or that recorded none, while its id lives, is alive.
- `GenerationLock.spec.ts`: a held record whose holder is judged gone is free; one whose holder is alive stays held
  with `now` an hour past its `acquiredAt`; an unreadable record refuses `lock-record-unreadable` at the first attempt
  and writes no generation.
- The crash case, in `GenerationLock.integration.spec.ts` (or `TrackerLock.integration.spec.ts`, wherever WP5.2 left
  the store's lock cases): a child process started with `Bun.spawn` under the scratch root takes the store's lock
  through the local adapter, writes its hold journal and is killed with `SIGKILL` inside its hold; the spec's next
  `commands.apply` takes the lock at its first attempt, replays the journal and applies its command. A second case: a
  live child that holds the lock keeps it past the old 30 seconds of stamp age (a `now` that jumps), and the spec's
  apply is refused `tracker-lock-held` after its retries, with `parkingLockRetries`
  (`src/testing/LockRetryWaits.ts:11`) so no retry interval is slept. The age cases at `:180` and `:187` go.
- `CrashMatrix.spec.ts:135-140` takes the lock over by age with `NO_LOCK_HOLDER_READS_AS_GONE`: take it over with a
  judgement that reads the holder as gone, so the case at `:261` still proves that the holder's fence refuses its
  writes. `HoldJournal.spec.ts:236`, `:256` likewise.
- `LocalFilesBoardStore.spec.ts`: a lock record left by a holder judged gone is taken over by the next `apply`.

**Done when.** In `apps/forge`: `bun run typecheck`, `bun run lint` and `bun test` pass; `git grep -n
"LOCK_STALE_MILLISECONDS\|NO_LOCK_HOLDER_READS_AS_GONE\|fileIsOlderThanTheStaleThreshold" -- src cli docs` prints
nothing. At the root, `bun install --frozen-lockfile` and `bun run verify` are green. The integration cases run under
gate G4.

### WP5.16 A committed ticket's content is fixed and kept by its hash

**Purpose.** Decision 48: from committed onward the Board refuses an edit of a ticket's content with a reason, and at
the commit forge keeps the content by content hash, so agents build from that also where a store lets the text change
behind forge. Runs alone, after WP5.14 and WP5.15.

Today: `TicketEdits.editTicket` (`TicketEdits.ts:52-82`) refuses an edit past `pending` unless the edit allows it,
which `ticket edit --force` sets (`cli/tickets/TicketEdit.ts:16`, `:31`, `:50`) and the command `ticket-edit` carries
(`ControlCommand.ts:96`, `TicketControls.ts:115-121`); a `pending` ticket is edited freely (`Statuses.ts:16`). The
body's hash is recorded when the ticket moves to `in-progress` (`claimedBodyHash`, `TicketMoves.ts:289`), and an edit
after it logs `ticket-body-changed-after-claim` (`TicketEdits.ts:78-80`), shown by `ticket show`
(`cli/tickets/TicketReadingSubcommands.ts:32`, `:50`) and the ticket JSON's `bodyChangedSinceClaim`
(`src/adapters/utils/TicketJsonUtil.ts:9-17`). A job's start records `bodyHashAtLaunch` (`JobLaunch.ts:419`, `:2732`),
and Customs refuses `ticket-body-changed` when the body moved during the job (`Customs.ts:62`, `:482-485`). The launch
text carries the body the Board read from the ticket's file (`launchFactsOf`, `DrivePass.ts:818-821`). Forge itself
writes into a started ticket's body: a verified build's Handoff (`JobLaunch.ts:1569-1571`, `:1607-1608`,
`:1628-1629`), a review's section and its waived items (`ReviewOutcome.ts:230`, `:349`) and an answer under
`## Questions` (`AgentQuestions.ts:121`, `:161`), each allowing the edit past `pending`.

**Files.**

- The model: `src/lib/tracker-model/constants/Statuses.ts`, `TicketEdits.ts`, `TicketMoves.ts` (`readyDraftTickets`
  `:121-150`, `applyTicketMove` `:276-293`), `BoardRefusal.ts`, `@types/Ticket.ts` (`claimedBodyHash`, `:70`),
  `utils/TicketBodyHashUtil.ts`, `constants/LogRecordSchema.ts` (`:131`), `AgentQuestions.ts`.
- Forge's own writes: `src/services/overseer/JobLaunch.ts`, `src/services/lifecycle/ReviewOutcome.ts`,
  `src/services/lifecycle/Customs.ts`, `src/services/overseer/MonitorSnapshotAssembly.ts` (`:88`),
  `src/services/overseer/testing/CrossingStageRun.ts` (`:153`).
- The command and the CLI: `src/shared/@types/ControlCommand.ts`, `src/services/control/TicketControls.ts`,
  `cli/tickets/TicketEdit.ts`, `cli/tickets/TicketReadingSubcommands.ts`, `src/adapters/utils/TicketJsonUtil.ts`,
  `src/adapters/utils/OperationRefusalWordingUtil.ts`, `src/adapters/utils/LogUtil.ts`, `cli/HelpText.ts`.
- The store: `src/services/store/BoardStore.ts`, `BoardStore.contract.spec.ts`, `LocalFilesBoardStore.ts`,
  `src/services/tracker/LocalStoreLayout.ts`, `TicketStore.ts`, `TrackerPipeline.ts` (`plannedHoldOf`),
  `@types/BoardRecords.ts` (`TicketListing`), `src/adapters/tickets/TicketFileWriter.ts` (`:28-52`),
  `src/adapters/tickets/utils/TicketDocumentUtil.ts` (`:53`, `:241-242`, `:607-612`), and the clearing behind
  `BoardTransaction.deleteAllTicketFilesAfterwards`.
- The installed text and docs: `resources/templates/Reference.md` (`:73`, `:99-100`), `apps/forge/docs/cli.md`,
  `docs/reference/refusals.md`, `cli/constants/InstallVersion.ts`, `cli/FrozenInstalledSurface.json`
  (`statusJsonFields` name `claimedBodyHash`), the recording of `InstallChangeWatch.ts`.

**What to do.**

1. `Statuses.ts` gains `TICKET_STATUSES_WITH_EDITABLE_CONTENT = ['draft', 'ready-for-review']`: a ticket's content
   is fixed from committed onward.
2. `TicketEdit` loses `allowsPastCommitted` and gains `writtenBy: 'command' | 'forge'`. A `command` edit of a ticket
   whose status is outside the editable set is refused before anything is read, with the new refusal `{ reason:
   'content-of-a-committed-ticket'; ticketId: string; status: TicketStatus }`, which replaces
   `edit-of-a-ticket-past-committed`. A `forge` edit is forge's own record in the body (the Handoff, a review, waived
   items, an answer), allowed in every status; the seven call sites above pass it (`JobLaunch.ts:1571`, `:1608`,
   `:1629`, `ReviewOutcome.ts:230`, `:349`, `AgentQuestions.ts:121`, `:161`), and so does the fixture
   `src/testing/EveryBoardLogRecord.ts:168`. `ticket-edit`'s applier passes `command`, so no command reaches a `forge`
   edit.
3. `--force` leaves `ticket edit` (`EDIT_OPTION_NAMES`, `TicketEdit.ts:16`) and `allowsPastCommitted` leaves the
   command `ticket-edit`: the content is fixed from committed onward, so nothing overrides the refusal, and `ticket edit
   --force` is refused as an unknown option. The command line's sentence: "Ticket #003 is committed, and its title and
   body were not edited: a committed ticket's content is fixed, since an agent may pick it up at any moment. Nothing
   was written." For a later status it names the status: "... is in progress, and its title and body were not edited:
   a committed ticket's content is fixed." WP5.17 adds the way to change it. No supported client sends `ticket-edit`
   (Gaia sends the contract's `ForgeBoardCommand` kinds, which do not hold it), so the system version does not change.
4. The content hash. `claimedBodyHash` becomes `contentHash`, the hash of the ticket's title and body:
   `TicketBodyHashUtil.contentHashOf(title, body)`, FNV-1a over `JSON.stringify({ title, body })`, as
   `GateProfiles.ts:29` and `PipelineUtil.ts:150` hash a canonical record. It is set where a ticket becomes committed:
   `readyDraftTickets` (from `draft` or `ready-for-review`) and `applyTicketMove` to `committed` (a reopen). A `forge`
   edit moves it to the new content's hash; every later move keeps it. A draft and a ticket ready for review hold
   none. `bodyChangedSinceClaimOf`, the record `ticket-body-changed-after-claim`, `ticket show`'s `body:` line and the
   JSON's `bodyChangedSinceClaim` go: no edit can follow a claim.
5. The store keeps the content by its hash. Through the port, a ticket that holds a `contentHash` is read with the
   title and body kept under that hash, whatever its stored text says, in `reads.listTickets()` and in every Board a
   write opens. `TicketListing` gains `contentRestored: readonly string[]`, the ids of tickets whose stored text no
   longer matches their hash; a write that opens on such a ticket writes the kept content back into it and logs
   `ticket-content-restored` (subject ticket, no fields) in the same hold.
6. The local adapter: `LocalStoreLayout.committedContentFolder` is `<data>/committed-content/`, one file per hash,
   `<hash>.json`, holding `{ "title": …, "body": … }`. The hold writes it whole (`createFileAtomically`) in its planned
   order before the ticket's file, and never rewrites it; a hash already kept is not written again. A ticket with no
   `contentHash` is read as today. One with a hash takes its title and body from the kept file; a kept file that is
   missing or unreadable makes the ticket an unreadable record, reason `committed-content-missing`, located at the
   kept file. The clearing that deletes every ticket file deletes the folder too.
7. What the builder reads: the launch text's ticket (`launchFactsOf`) is the Board's, so after step 5 it is the kept
   content. The job's start records `contentHashAtLaunch`, the ticket's `contentHash`, in place of `bodyHashAtLaunch`,
   and Customs check V6 compares it with the ticket's `contentHash` when the job ends, refusing
   `ticket-content-changed` in place of `ticket-body-changed`. The empty values of the jobs with no ticket stay
   (`MergeRun.ts:114`, `:167`, `PipelineAgentSessions.ts:253`).
8. The stored key: `TicketFileWriter` splices `contentHash` where it splices `claimedBodyHash`, and
   `TicketDocumentUtil` reads and writes it. `Reference.md`'s field row (`:73`) says it holds the hash of the title
   and body kept when the ticket became committed, moved by forge's own records; `:99-100` drop `--force` and say a
   committed ticket's title and body are not edited. Raise `INSTALL_VERSION` by one, change the frozen surface keys
   the surface specs print, and record `InstallChangeWatch.ts` in the same commit.
9. `Bouncer.ts:82` keeps `ticket-edit` among the product owner's own-draft kinds: the product owner edits only its own
   drafts, which the content rule allows.

**Specs.**

- `Board.ticketEdits.spec.ts`: a `command` edit of a draft and of a ticket ready for review lands; of a committed,
  in-progress, in-review, reviewed, delivered or abandoned ticket it is refused `content-of-a-committed-ticket` with
  its status, the title and body unchanged; a retitle of a committed ticket is refused the same way; a `forge` edit of
  an in-review ticket lands and moves `contentHash` to the new content's hash.
- `Board.ready.spec.ts`: readying records the hash of the title and body as readied; `Board.ticketMoves.spec.ts`: a
  reopen to committed records the hash of the content then, and a move to `in-progress` keeps it.
- `LocalFilesBoardStore.spec.ts` and `TrackerPipeline.spec.ts`: a ticket committed in a hold has its kept file written
  before its ticket file, and a hold cut between the two replays to the same board; a ticket file whose body was
  changed on disk reads with the kept body and is listed restored, and the next write puts the kept body back and logs
  `ticket-content-restored` once; a missing kept file makes the ticket unreadable with `committed-content-missing`.
- `BoardStore.contract.spec.ts`, a clause for any adapter: a committed ticket whose stored text is changed behind the
  store reads with the content its hash names, and the next write restores it. Each adapter's harness offers the
  step that changes the text behind it.
- `Customs.spec.ts`: V6 passes when the content hash at the end is the one at launch and refuses
  `ticket-content-changed` otherwise.
- `TicketCommand.edit.spec.ts`: `ticket edit 001 --force` is refused as an unknown option; an edit of a committed
  ticket exits 1 with the sentence and changes nothing.

**Done when.** In `apps/forge`: `bun run typecheck`, `bun run lint` and `bun test` pass; this prints nothing (the
frozen surface keeps the names of the install versions already frozen, which `cli/InstalledSurface.spec.ts:7-8` forbids
deleting, and `docs/research/` is a dated record):

```sh
git grep -n "claimedBodyHash\|bodyChangedSinceClaim\|ticket-body-changed\|bodyHashAtLaunch\|edit-of-a-ticket-past" \
  -- src cli bridge docs resources skills ':!cli/FrozenInstalledSurface.json' ':!docs/research'
```

and `git grep -n "allowsPast" -- src/lib/tracker-model/TicketEdits.ts src/shared cli/tickets` prints nothing. At the
root, `bun install --frozen-lockfile` and `bun run verify` are green.

### WP5.17 A committed ticket goes back into draft: `ticket unready`

**Purpose.** Decision 48: a committed ticket no agent has picked up can be put back into `draft`, is edited there, and
becomes committed again by the path any draft takes. Today no move returns a ticket to draft: `moveTicket` refuses
every move to `draft` (`TicketMoves.ts:68-70`, refusal `move-to-draft`, worded "no move returns a ticket to draft:
filing is the only way in" at `OperationRefusalWordingUtil.ts:121-123`), and `ticket hold` only keeps a ticket from
being built. Runs alone, after WP5.16.

**Files.**

- The model: `src/lib/tracker-model/TicketMoves.ts`, `Board.ts`, `BoardRefusal.ts`, `constants/LogRecordSchema.ts`
  and their specs (`Board.ticketMoves.spec.ts`, `Board.ready.spec.ts`).
- The command: `src/shared/@types/ControlCommand.ts`, `src/services/control/TicketControls.ts`,
  `src/services/control/ControlService.ts`, `cli/constants/JobVerbs.ts` (`BY_HAND_VERB_OF_CONTROL_KIND`,
  `BY_HAND_COMMAND_KINDS`), `cli/ControlContract.spec.ts`, `src/services/control/Bouncer.spec.ts`,
  `cli/overseer/routes/CommandRoute.controlContract.spec.ts`.
- The verb: `cli/tickets/TicketMoveSubcommands.ts`, `cli/tickets/constants/TicketUsage.ts`, `cli/HelpText.ts`,
  `cli/tickets/TicketCommand.spec.ts`.
- The wording: `src/adapters/utils/OperationRefusalWordingUtil.ts` (`move-to-draft`, `:121-123`, and WP5.16's
  `content-of-a-committed-ticket`), `src/adapters/utils/LogUtil.ts`, `docs/reference/refusals.md`.
- The installed text and docs: `resources/templates/Reference.md` (the moves table, `:149-161`),
  `skills/agent-po/SKILL.md` (`:70-71`), `apps/forge/docs/cli.md` (the ticket verbs and the moves table at
  `:3239-3241`), `cli/constants/InstallVersion.ts`, `cli/FrozenInstalledSurface.json`, the recording of
  `InstallChangeWatch.ts`.

**What to do.**

1. `Board.unreadyTicket(ticketId, at): TicketChanged`, in `TicketMoves`. It refuses `{ reason:
   'unready-of-a-ticket-not-committed'; ticketId; status }` unless the ticket is `committed`, and `{ reason:
   'unready-of-a-ticket-with-a-job'; ticketId; jobId }` while the board holds a job that names the ticket (as
   `Playbook.ts:374-376` asks of its facts): a build job is `launching` while its ticket is still committed, and the
   ticket moves to `in-progress` only as the job moves on to `preparing` (`JobLaunch.ts:2113-2121`). Otherwise the
   ticket becomes `draft` with `updated` stamped, loses `contentHash`, loses its row (`BoardRecords.removeTaskRecord`,
   `:165`, and `task: null`), since a draft has none (`TicketChartUtil.ts:6-15`), and the log records
   `ticket-unreadied` (subject ticket, no fields). Its priority, entity, group, epics, dependencies and hold stay. The
   kept content files stay in the store; nothing reads a hash no ticket names.
2. The command `{ kind: 'ticket-unready'; ticketReference: string }` is a by-hand kind: never relayed from a job, so no
   agent puts a committed ticket back, and not accepted by the command endpoint, so the served contract and the
   system version do not change. Gaia's editing screen, built after this run (decision 22), adds it with `ticket-edit`
   to `ForgeBoardCommand` and the endpoint under a system minor.
3. The verb `ticket unready <id> [--at <stamp>] [--json]`, beside `ticket ready`, applies the command through
   `applyCommandOfVerb` (WP5.8) and prints "Ticket #003 is a draft again" with the next line "edit it with `forge
   ticket edit 003`, then commit it with `forge ticket ready 003`".
4. The way forward is today's, unchanged. The user's `ticket ready` commits a draft (`readyDraftTickets`, `:121-150`;
   the user's own ready passes `ready-for-review` as readiable), and is itself the human review. A filer's `ticket
   submit` stops at `ready-for-review` while the pipeline definition requires ticket review (`approvals.tickets`,
   absent means on, `Board.ts:1341-1344`) and commits at once when it does not (`submitDraftTickets`, `:156-181`). An
   unreadied ticket is a draft like any other, so nothing new is built; the specs hold both paths.
5. The sentences. `unready-of-a-ticket-not-committed`: for a draft or a ticket ready for review, its content can be
   edited as it is; for a later status, "an agent has picked it up: stop its work first (`forge job stop <job>`), then
   reopen it (`forge ticket reopen 003`) and put it back into draft". `unready-of-a-ticket-with-a-job`: "Ticket #003
   is committed and job J7 is starting on it, so it stays committed. Stop the job first (`forge job stop J7`)." WP5.16's
   `content-of-a-committed-ticket` ends with "Run `forge ticket unready 003` to put it back into draft and edit it
   there", or, past committed, with the stop and reopen of `unready-of-a-ticket-not-committed`. `move-to-draft` says
   that `ticket status` does not move a ticket into draft and names `ticket unready` for a committed one. The API
   channel's sentences name no command.
6. The installed text and docs: the moves table gains the row `ticket unready` (from committed with no job, to draft,
   its row removed, `Ticket #003 unreadied`); `skills/agent-po/SKILL.md:70-71` says a committed ticket's content is
   fixed and only the user puts it back into draft. Raise `INSTALL_VERSION` by one, add the command to the frozen
   surface as the surface specs ask, and record `InstallChangeWatch.ts` in the same commit.

**Specs.**

- `Board.ticketMoves.spec.ts`: a committed ticket with no job goes back to `draft`, loses its `contentHash` and its
  row, and logs `ticket-unreadied`; a `command` edit of it then lands; it is refused for a draft, a ticket ready for
  review, an in-progress, in-review, reviewed, delivered or abandoned ticket, and for a committed ticket with a
  launching job.
- `Board.ready.spec.ts`: an unreadied and edited ticket becomes committed again by `ticket ready`, with the hash of its
  new content and a new row; with ticket review on, a filer's submit stops it at `ready-for-review`, and with it off,
  commits it.
- `TicketCommand.spec.ts`: the verb, its `--json` answer and its refusals at exit 1; under a job it is refused
  `verb-not-relayable`.
- `CommandRoute.controlContract.spec.ts`: a body of kind `ticket-unready` answers 400 `malformed-body`, as every
  by-hand kind; `cli/ControlContract.spec.ts` and `Bouncer.spec.ts` hold the kind in their exact lists.

**Done when.** In `apps/forge`: `bun run typecheck`, `bun run lint` and `bun test` pass;
`git grep -n "no move returns a ticket to draft" -- src docs resources` prints nothing. At the root,
`bun install --frozen-lockfile` and `bun run verify` are green.

## Interfaces introduced

### The port: `src/services/store/BoardStore.ts`

```ts
import type { Board }                         from '../../lib/tracker-model/Board.ts';
import type { TrackerProgress }               from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { GateProfilesReading }           from '../../lib/tracker-model/@types/GateProfile.ts';
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
  /** The stored pipeline as the store judges it: the reading every write opens the Board on. */
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
'unrepaired', { kind: 'lock-taken-over' })` when a hold lost its lock, `OperationRefusal('unrepaired', { kind:
'unreadable-tracker' | 'malformed-hold-journal' })`, and, from the local adapter, `OperationRefusal('refused', { kind:
'entities-in-a-folder', filePath, projectPrefix })` when the write would store a pipeline with entities in a tracker in
a folder (`TrackerPipeline.ts:97-101`); nothing is written in any of these cases.

### The local adapter: `src/services/store/LocalFilesBoardStore.ts`

```ts
export interface LocalFilesBoardStoreOptions {
  workspace:         Workspace;
  /** The caller's clock, for the lock's records only. */
  now:               () => Date;
  /** The platform's process check; until WP5.15, `NO_LOCK_HOLDER_READS_AS_GONE` where there is none. */
  lockHolderIsGone:  LockHolderIsGone;
  /** Called after each file a write stores; the step a spec interrupts to cut a write short. */
  afterFileWritten?: (location: string) => void;
}

export function createLocalFilesBoardStore(options: LocalFilesBoardStoreOptions): BoardStore;
```

Inside the adapter, `src/services/tracker/TrackerReader.ts` exports `storedPipelineReadingOf(workspace):
PipelineReading` and `folderPrefixHoldingEntitiesOf(workspace, pipeline): string | null` (WP5.4), and
`LocalRecordAllocation` adds `storedTicketLocationOf(ticketId): string` (WP5.13). Nothing outside the adapter imports
them.

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
  /** A ticket with the next free id, stored by this transaction's commit; only safe inside it. */
  newTicket(input: CreateTicketInput): Ticket;
  /** Refuses `unreadable-file-in-the-way` (record `epic`) when an unreadable record holds the key. */
  requireEpicKeyIsFree(epicKey: string): void;
  /** Refuses `unreadable-file-in-the-way` (record `draft`) when an unreadable record holds the key. */
  requireDraftKeyIsFree(draftId: string): void;
  locationOf(record: RecordReference): string;
}
```

This is the form after WP5.13. From WP5.3 to WP5.13, `requireEpicKeyIsFree` is `newEpicLocation(epicKey: string):
string`, which refuses the same way and answers the new epic's file for `EpicAddition.filePath`.

`CreateTicketInput` is today's (`src/services/tracker/TicketStore.ts:34-45`, its `group` member included), moved to
`@types/BoardRecords.ts`.

### The record vocabulary: `src/services/tracker/@types/BoardRecords.ts`

```ts
export type RecordKind = 'ticket' | 'epic' | 'draft';

/** A record the store holds and cannot read; it is no part of the Board. */
export interface UnreadableRecord {
  record:   RecordKind;
  /** The ticket id, epic key or draft id the record's storage names; `null` when it names none. */
  key:      string | null;
  /** Where it is kept, for the report a repair needs; the local adapter's file path. */
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

/** The records a board holds one of; a ticket, an epic or a draft is never named by where it is kept. */
export type RecordReference = {
  record: 'progress' | 'pipeline' | 'pipeline-setup' | 'gate-profiles' | 'constitution-sources' | 'log' | 'unfinished-write';
};

/** Today's `TrackerContents` (`src/services/tracker/TrackerReader.ts:20-34`), its listings' `malformed` replaced. */
export interface BoardContents {
  progress:                   TrackerProgress;
  /** Judged by the store: the reading every write opens the Board on. */
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

### The model without locations (WP5.13)

`Ticket` (`src/lib/tracker-model/@types/Ticket.ts:76-84`) keeps `frontmatter`, `body`, `lineEnding` and `storedType`
and loses `filePath`. `Epic` (`src/lib/tracker-model/@types/Epic.ts:13-19`) keeps `frontmatter`, `body` and
`lineEnding`; `EpicAddition` keeps `key`, `title` and `body`. The ticket document of `TicketJsonUtil`, the epic
document of `cli/epics/EpicOutput.ts` and `PageTicket` lose `filePath`.

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

### The lock's holder (WP5.15)

```ts
// src/services/tracker/LockHolders.ts
/** A lock record's holder: `null` where the platform cannot read the process's start or boot. */
export interface LockHolder {
  processId:    number;
  startStamp:   string | null;
  bootIdentity: string | null;
}
export function lockHolderOf(supervision: ProcessSupervision): LockHolder;
/** True only when the platform knows: the id is gone, or the process at it is not the recorded one. */
export function lockHolderIsGoneOf(supervision: ProcessSupervision): LockHolderIsGone;

// src/services/tracker/GenerationLock.ts
export type LockHolderIsGone = (holder: LockHolder) => boolean;
interface LockPayload { holder: LockHolder; acquiredAt: string }
```

`NO_LOCK_HOLDER_READS_AS_GONE` and `LIMITS.LOCK_STALE_MILLISECONDS` are deleted; a record is free when it is released
or its holder is gone, never by its age. A new refusal detail, `{ kind: 'lock-record-unreadable'; recordPath: string
}`, `unrepaired`, exit 2, worded once with the path a repair removes.

### New command kinds (WP5.6, WP5.7), added to `ControlCommand`

Never relayed from a job, never accepted by `POST /api/commands`; listed in `BY_HAND_VERB_OF_CONTROL_KIND` and
`BY_HAND_COMMAND_KINDS` (`cli/constants/JobVerbs.ts`). Stage 3's `interrupted-work-resume` is not among them.

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
`AgentAssignment` are the tracker model's (`src/lib/tracker-model/@types/BoardChanges.ts`). Results are what the Board
call answered, as each verb's mutation returned it today. `causeTicketId` is the padded id the verb parses before the
hold, `null` to clear (`cli/tickets/TicketIntroducedBy.ts:27`, `TicketArgumentUtil.linkedTicketIdFrom`).

New refusal details: `{ kind: 'task-ticket-missing'; option: 'ticket' | 'review-of'; reference: string }`, `{ kind:
'namespace-board-has-jobs'; jobCount: number }`, `{ kind: 'namespace-branch-list-failed'; reason: string }`, `{ kind:
'namespace-not-free'; refusal: BranchNamespaceRefusal; wantedNamespace: string }`, with `BranchNamespaceRefusal` from
`src/shared/BranchNames.ts:25`. Each is worded once, as the command line prints it.

### `ControlContext` (WP5.7)

```ts
export interface ControlContext {
  setupMessageWordingOf: (message: SetupMessage) => string;
  /** Today's, unchanged: with a project path, an entity's constitution in place of main's `CONSTITUTION.md`. */
  mainConstitutionOf:    (rootDirectory: string, constitutionPath?: string) => MainConstitutionReading;
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
`rootDirectory: string`, `htmlFilePath: string` and `progress: { verdict: 'readable'; trackerId: string; project: string
} | { verdict: 'absent' } | { verdict: 'unreadable'; reason: string }`. The registry entry holds no
`progressJson`; its other keys and the registry's version are unchanged.

### Installed surface (WP5.13)

`INSTALL_VERSION` rises by one. `SessionInstructions.md` and `Reference.md` name no ticket file and invite no hand edit;
`ticket show`, `epic show` and `draft show` print no `file:` line, and their `--json` documents hold no `filePath`.

### The committed status (WP5.14)

```ts
// src/lib/tracker-model/@types/Task.ts
export type TaskStatus = 'committed' | 'in-progress' | 'paused' | 'in-review' | 're-review' | 'reviewed' | 'delivered' | 'abandoned';
// src/lib/tracker-model/constants/Statuses.ts
export const TICKET_STATUSES = ['draft', 'ready-for-review', 'committed', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'] as const;
/** No agent has claimed a ticket in one of these, so a change cannot reach work under way. */
export const TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP: readonly TicketStatus[] = ['draft', 'ready-for-review', 'committed'];
```

Renamed: the log record `ticket-readied` to `ticket-committed`; the refusals `lowering-a-ticket-that-is-not-committed`,
`network-of-a-ticket-past-committed`, `entity-of-a-ticket-past-committed`; `setTicketEntity`'s option
`allowsPastCommitted`. Stored: `status: committed` in a ticket file, a row's `status` and `history[].status`. The verbs
`ticket status <id> committed` and `ticket list --status committed`. `INSTALL_VERSION` rises by one.

### The fixed content (WP5.16)

```ts
// src/lib/tracker-model/constants/Statuses.ts
export const TICKET_STATUSES_WITH_EDITABLE_CONTENT: readonly TicketStatus[] = ['draft', 'ready-for-review'];
// src/lib/tracker-model/TicketEdits.ts
export interface TicketEdit {
  title?:    string;
  body?:     MarkdownBodyEdit;
  /** `command` is refused from committed onward; `forge` is forge's own record in the body and moves `contentHash`. */
  writtenBy: 'command' | 'forge';
}
// src/lib/tracker-model/@types/Ticket.ts, in TicketFrontmatter, in place of claimedBodyHash
  /** The hash of the title and body kept at the commit, moved by forge's own records; none on a draft. */
  contentHash?: string;
// src/lib/tracker-model/utils/TicketBodyHashUtil.ts
function contentHashOf(title: string, body: string): string;
// src/lib/tracker-model/BoardRefusal.ts
  | { reason: 'content-of-a-committed-ticket'; ticketId: string; status: TicketStatus }
// src/services/tracker/@types/BoardRecords.ts, in TicketListing
  /** Tickets whose stored text no longer matches their content hash; read with the kept content. */
  contentRestored: readonly string[];
// src/services/tracker/LocalStoreLayout.ts, in LocalStoreLayout
  committedContentFolder: string;
```

The command `ticket-edit` loses `allowsPastCommitted`, and `ticket edit` loses `--force`. Log records:
`ticket-content-restored` (subject ticket, no fields) is added; `ticket-body-changed-after-claim` goes. Customs's
`ticket-body-changed` becomes `ticket-content-changed`, and the job start's `bodyHashAtLaunch` becomes
`contentHashAtLaunch`. An unreadable ticket record may carry the reason `committed-content-missing`. The local
adapter keeps `<data>/committed-content/<hash>.json` (`{ "title", "body" }`), written whole before the ticket file
and never rewritten. `INSTALL_VERSION` rises by one.

### The move back into draft (WP5.17)

```ts
// src/shared/@types/ControlCommand.ts: a by-hand kind, never relayed, refused by the command endpoint
  | { kind: 'ticket-unready'; ticketReference: string }
// src/lib/tracker-model/Board.ts
unreadyTicket(ticketId: string, at: string): TicketChanged;
// src/lib/tracker-model/BoardRefusal.ts
  | { reason: 'unready-of-a-ticket-not-committed'; ticketId: string; status: TicketStatus }
  | { reason: 'unready-of-a-ticket-with-a-job'; ticketId: string; jobId: string }
```

The verb `ticket unready <id> [--at <stamp>] [--json]`; the log record `ticket-unreadied` (subject ticket, no fields).
The ticket becomes `draft`, loses `contentHash` and its row, and keeps everything else. `INSTALL_VERSION` rises by
one.

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
  (`TrackerPipeline.ts:58`) and the landing runs git inside the hold (`Airlocks.ts:1241-1262`, `:1499`). Do not add a
  timeout, a retry or a split into "plan, then write" to `transact`: a timeout would leave the lock while git runs.
  Until WP5.15 the lock's own staleness (`LIMITS.LOCK_STALE_MILLISECONDS`, 30 seconds,
  `src/shared/constants/Limits.ts:3`) lets another process take over a hold that runs longer, and the fence then
  refuses the stale holder's writes (`TrackerLock.ts:193-199`); the packages before WP5.15 keep that exactly. WP5.15
  removes the age rule and keeps the fence.
- **A live holder keeps the lock however long it holds** (WP5.15). A hung Hephaestus inside a hold leaves every
  command refused `tracker-lock-held` after its five seconds; stage 3 counts a hung Hephaestus as gone, and stopping
  its process frees the lock. Do not bring back an age rule, a longer timeout or a forced takeover to get around it.
- **A process id is not a process.** After a reboot or a reused id, the id of a dead holder can name a live process.
  The judgement compares the recorded start stamp and boot identity (`sameProcess`); where the platform cannot read
  them it reads the holder as alive, never as gone.
- **`pending` is many words.** Only the ticket and row status is renamed (WP5.14). An Apply pending, a job's pending
  answer, `UnfinishedWriteReading`'s `'pending'` and the Bridge's pending pictures keep the word; rename by type, never
  by a search and replace, and read each untyped hit (the Bridge's `data-state` selectors).
- **The kept content is written before the ticket.** A hold cut between the kept file and the ticket file must leave a
  board whose ticket still reads (WP5.16): the kept file is content-addressed and harmless alone, while a ticket file
  naming a hash with no kept file reads as unreadable. Keep the planned order and its journal entry.
- **Forge's own records are no edit of the content.** The Handoff, a review, waived items and an answer are written by
  forge with `writtenBy: 'forge'` in every status (WP5.16). Routing them through the command's rule would refuse the
  pass's own writes and crash it.
- **The move back into draft waits for a launching job.** A build job is `launching` while its ticket is still
  committed (`JobLaunch.ts:2113-2121`); `ticket unready` refuses while the board holds any job of the ticket (WP5.17),
  or a job would go on to build a draft.
- **Reads take no lock.** `status` takes no lock (`apps/forge/CLAUDE.md:382-383`) and the pass observes outside the
  hold (`DrivePass.ts:2-4`). Implement every `reads` member without `withLock`. A read can see a write half done; that
  is the documented limit, not a bug to fix here.
- **A command waits at most about five seconds for the lock** (`LIMITS.LOCK_RETRY_COUNT` 50 × 100 ms) and then throws
  `tracker-lock-held`, while a pass may hold the lock for a git fast-forward. This is today's behaviour; the contract
  clause on waiting must use `parkingLockRetries` so it neither sleeps nor runs out the budget.
- **The revision is narrower than "the board".** The fingerprint covers only the progress record, the log and the gate
  profile runs (`DrivePass.ts:447-449`). Widening it to every ticket would read every ticket file on every wake;
  narrowing it would let a gate profile stop (`:448`) go unseen. Keep it exactly, and keep its limit in its docblock and
  in the local adapter's spec.
- **Relayed commands are applied inside the pass's transaction** (`HatchInbox.ts:181`) with no rollback of their own: a
  refused relayed command's partial Board changes are not undone, as today. Do not route them through the command face,
  which would take the lock a second time inside the pass's hold and wait for itself until `tracker-lock-held`.
- **The command endpoint runs inside the Overseer.** Its commands go through `commands.apply`, which takes the lock like
  any client; it must never be called from inside a transaction of the same process for the reason above.
- **`ticket deliver --by-hand` must still be judged inside the hold** (`docs/cli.md:590`). Moving the Baton check before
  the apply would open a race with an Overseer that starts between the check and the write; `liveOverseerOf` keeps it in
  the applier. The command endpoint's and the Hatch's contexts must answer `null`, or the live Overseer would refuse its
  own command.
- **New command kinds widen the endpoint unless excluded.** `COMMAND_ROUTE_KINDS` is built from `CONTROL_COMMAND_KINDS`
  (`CommandRoute.ts:55`). Leaving out `BY_HAND_COMMAND_KINDS` keeps the served contract as it is; forgetting it changes
  a route without a system version (`apps/forge/CLAUDE.md:93-97`). The Bouncer refuses the new kinds by default
  (`Bouncer.ts:201-210`), and `ALLOWED_MOVES_BY_INCIDENT_KIND` does not name them; do not add them there.
- **The resume command is no by-hand kind.** Stage 3's `interrupted-work-resume` is relayed and accepted by the
  endpoint. `recordIncidentMove` must keep its relay under a job before the write (WP5.8, step 4), or `resume` under a
  job is refused `verb-not-relayable` instead of reaching the Bouncer.
- **Refusal texts move with the appliers.** The CLI words its refusals in place today (`TaskAdd.ts:33-44`,
  `NamespaceCommand.ts:106-118`); in `src/` a refusal is a wordless detail. Each new detail is worded once in
  `OperationRefusalWordingUtil`, with the command line's sentence, and gets a row in `docs/reference/refusals.md`.
  Specs that assert a sentence change with it.
- **`TicketLookupUtil.requireTicket` and `ticketIdOfReference` word a missing ticket differently**
  (`cli/tickets/utils/TicketLookupUtil.ts:21-29` against `src/services/control/ControlTicketLookup.ts:20-30`). Moving a
  verb into an applier changes its printed refusal to the wording util's; check the verb's specs and accept the util's
  sentence.
- **The Next line and other printed values must come from the board after the write**, never from a read taken after the
  write returns: another writer may have changed the board meanwhile. `CommandWritten.board` is the board this write
  left, which only the caller holds (`TrackerPipeline.ts:67`).
- **The nudge and the registry update come after the lock is released** (`OpenTrackerForWriting.ts:37-40`). Keep them
  outside `apply`.
- **Unreadable records keyed by file name.** Today a ticket reference finds its unreadable file by the file name's
  number (`ControlTicketLookup.ts:14-17`). The key must be derived the same way, including `012.md` with no slug and a
  file whose name and `id` disagree, or a reference to a broken ticket reads as "no ticket" instead of "malformed".
- **Unreadable records keep their location.** WP5.13 strips locations from every report of a readable record. The
  reports of a record the store cannot read (`status`'s ignored lines, `malformed-ticket-file`,
  `unreadable-file-in-the-way`, the pipeline refusals, the malformed hold journal) keep naming the file: it is the only
  thing a repair can go by.
- **A ticket's location is the adapter's alone.** After WP5.13 the Board holds no path, so `plannedHoldOf` must find
  every changed ticket's file in the allocation: listed at the hold's start or allocated in it. A ticket the Board
  changed that the store never held is a bug and throws; never fall back to a fresh `<id>-<slug>.md`, which would
  write a second file for a retitled ticket. A retitle renames no file.
- **`INSTALL_VERSION` and its recording move together.** WP5.13 raises the version and runs `bun run record
  src/services/overseer/InstallChangeWatch.ts` in the same commit; `bun run verify` fails on a stale stamp
  (`apps/forge/CLAUDE.md:190-196`). Raise it over whatever the stages before left, never to a fixed number.
- **`TRACKER_FILES` mixes records and places.** `TRACKER_DIRECTORY_NAME` and `HTML_FILE_NAME` are not records and are
  used by `cli/InstalledFiles.ts`, `cli/adoption/init/InitCommand.ts:157` and
  `src/services/tracker/RepositoryTrackerList.ts:52`; move them before deleting the constant.
- **The store judges a stored pipeline once.** The judgement of entities in a tracker in a folder lives in
  `storedPipelineReadingOf` and nowhere else; a caller never judges for itself. Its effect reaches readers that took
  the file as it is: `observe`'s build jobs see no pipeline, the merged-tree gate answers the unreadable pipeline's
  step, and `gate list` refuses `entities-in-a-folder`, as a write already does. `storedPipelineText()` stays the
  stored text, for display. The judgement reads `projectLocationOf` (`src/services/tracker/ProjectLocation.ts:37`)
  only for a pipeline that holds entities, and that reading runs no git, so judging on every pass costs nothing new.
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
  guard's forms do not match a `.filePath` read, by design: the hold journal's `file.filePath` and the refusal details'
  `filePath` are no record path the guard should see.

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
- `cli/InstalledSurface.spec.ts` and `cli/InstalledSurface.status.spec.ts`.
- `src/services/overseer/DrivePass*.spec.ts`.
- `src/services/tracker/LockHolders.spec.ts`, `GenerationLock.spec.ts`, and under gate G4 the crash case of WP5.15.
- `src/lib/tracker-model/Board.ticketEdits.spec.ts`, `Board.ticketMoves.spec.ts`, `Board.ready.spec.ts` and
  `src/services/lifecycle/Customs.spec.ts`.

Greps that must print nothing (from `apps/forge`):

```sh
grep -rnwE "TrackerChange|OpenTrackerForWriting|openTrackerForWriting|withLockIfFree" --exclude-dir=research src cli bridge docs CLAUDE.md
grep -rn "progressFilePath\|ticketsDirectory\|epicsDirectory\|draftsDirectory\|TRACKER_FILES" src cli bridge
grep -rn "filePath" src/lib/tracker-model
grep -rn "progressJson" src cli
grep -n "hand-edited" CLAUDE.md
grep -n "pipelineReadingInPlaceOf" src/services/tracker/TrackerPipeline.ts
grep -rn "LOCK_STALE_MILLISECONDS\|NO_LOCK_HOLDER_READS_AS_GONE" src cli
grep -rn "claimedBodyHash\|bodyChangedSinceClaim\|EDITABLE_WITHOUT_FORCE\|past-pending\|ticket-readied" \
  --exclude=FrozenInstalledSurface.json src cli bridge
```

End to end on a scratch board, as `docs/development/contributing.md:76-179` prescribes, from `apps/forge` in one scratch
shell: create `SCRATCH="$(mktemp -d /tmp/ap-scratch.XXXXXX)"` with a scratch `HOME`, run `init --root`, set
`FORGE_ROOT`, `FORGE_FAKE_AGENT=1` and `FORGE_FAKE_AGENT_KEEPS_WORKING=1`, then check each of these. The lifecycle
verbs are named as stage 3 leaves them; stage 9 renames them (decision 42).

1. `ticket add "Double-click a role to edit it" --type ticket`, `log "Scratch board started"`, `task add "Example row"`,
   `task start 1`, `epic add example "Example"`, `epic edit example --title "Example epic"`, `ticket size 001 S`, then
   `status`: every change is listed and `status` exits 0. `namespace` is left to its specs.
2. `ticket edit 001 --append --body "## Brief …"`, then `ticket show 001` and `ticket show 001 --json`: the body holds
   the appended Brief, no `file:` line is printed and the document holds no `filePath`; `epic show example` and
   `draft show` of a draft opened with `draft open` print no `file:` line either.
3. `oversee --port 0 --detach`, `oversee status` (serving, paused), `gate none`, `ticket ready 001`, `oversee resume`,
   `jobs`: within seconds a `build/builder` job on `#001` is listed, so the pass's transaction and the command face work
   together.
4. With the Overseer live, `ticket deliver 001 --by-hand` is refused `overseer-owns-the-lifecycle`, naming its URL, and
   writes nothing. `resume --all` answers nothing to do and exits 0.
5. A command posted to the endpoint with the token from the Baton's `tokenFile` (`concurrency-set`) answers 200; a body
   of kind `interrupted-work-resume` with target `all` answers 200; a body of kind `task-add` answers 400
   `malformed-body`.
6. Break a ticket file's frontmatter on disk: `status` reports it as ignored with its path and exits 0; `ticket show` of
   its id exits 2 and names the file.
7. The committed ticket, on a second ticket with the Overseer stopped (`oversee stop --now`): `ticket add "Example
   change" --type ticket`, `ticket edit 002 --append --body "## Brief …"` with a numbered `## Acceptance`, `ticket
   ready 002`; `ticket show 002 --json` reads `status: committed` with a `contentHash`. `ticket edit 002 --append
   --body "more"` exits 1 with the sentence that names `ticket unready`, and `ticket show 002` is unchanged; `ticket
   edit 002 --force` is refused as an unknown option. Change the ticket's body in its file under the data folder by
   hand: `ticket show 002` still prints the committed body, and the next write (`ticket size 002 S`) puts it back and
   logs `ticket-content-restored`. `ticket unready 002` makes it a draft with no row; the edit lands; `ticket ready
   002` commits it again with a new `contentHash`.
8. End the board with `oversee stop --now`, `pkill -f "$REPOSITORY/.forge"`, restore `HOME` and remove the scratch
   folder.

Nothing in this check reads or writes `~/.forge-monitor` or `~/.gaia`, and nothing runs in this checkout's own tracker.

## Out of scope

- The remote adapter, a server-side store, a change feed for the pass, and the redesign of the pass that a remote store
  needs (design section 4 and section 9).
- Gaia's screen for editing a ticket's content or putting a committed ticket back into draft (decision 22), and
  accepting any by-hand kind on the command endpoint or adding any kind to `packages/forge-contracts`: stage 6, or
  after this run.
- The worker prompts' "Never edit the ticket file" (`resources/prompts/BuildPrompt.md:26`, `ReviewPrompt.md:26`,
  the built-in briefs): they forbid what this stage ends and stay true.
- Changing the lock's retry budget, the hold journal's format, or a stored format beyond the committed status
  (WP5.14), `contentHash` in place of `claimedBodyHash` and the kept content file (WP5.16). The write order of a hold
  changes only by the kept content file, written before its ticket. The ticket file keeps its frontmatter subset and
  keeps unknown lines it reads.
- Moving pictures (`src/services/tracker/PictureStore.ts`), job folders, gate profile output, Talos's files, the Baton
  or stage 3's presence and crash files behind the port.
- The ending on a network outage and the bound of gate and install lines (decisions 35 to 37): stage 2.
- Naming a failed pass (design section 7) and the Overseer-to-Hephaestus rename: stages 3 and 9.
- `forge open`, the `progress.html` stub and `Workspace.htmlFilePath` (decision 43): stage 8.

## Needs the owner

No question about behaviour is open in this stage. One act is the owner's, and the stage is done without it:

1. **Gate G4:** asking for `bun run verify:integration` after WP5.10, so the crash matrix
   (`CrashMatrix.integration.spec.ts`) runs over the pass's transaction face, and again after WP5.15 for the lock's
   crash case. `apps/forge/CLAUDE.md:20` lets a session run it only when a person asks.

## Not established

- The state of `DrivePass.ts`, `Regrouping.ts`, `OverseerForeground.ts` and `JobLaunch.ts` after stages 2 and 3; this
  plan reads the code at `b4174bd9`.
- Whether stage 4's adapter that maps a `Ticket` into the contract's ticket document reads `Ticket.filePath`; if it
  lands before WP5.13 and does, WP5.13 removes that read with the field.
- Whether every Board change writes a log record; if one does not and changes no progress field, the revision does not
  see it. Not traced.
- Whether a spec, the Bridge or a wording util reads the stored step value `pipeline.json` of an unreadable pipeline
  (`UnreadablePipelineGate.ts:12`); WP5.5 asks the builder to grep. At `0a648b2b` the grep's hits outside the adapter
  and `.spec.ts` files are a dialog name in a DOM spec (`bridge/views/pipeline/live/LiveFooter.dom.tsx:46`) and a
  scratch path in a testing helper (`cli/testing/CutoverSmoke.ts:273`), neither a reader of the step.
- Whether moving the `ticket` verbs' refusals to `ticketIdOfReference` changes any printed sentence that an installed
  skill or prompt depends on.
- Whether `readBoard()` on every HTTP request of the board state costs more than today's `requireTracker` (it is the
  same call); not measured.
- Whether `TrackerLock.integration.spec.ts` holds cases of the generic lock only, which decides whether WP5.2 moves it.
- Whether the two surface specs print a new frozen key for WP5.13's version; the key holds whatever surface they print,
  and none if they print none.
- `owner-answers.md` (answer 14) says a `pending` ticket can be put back into `draft` today. The code says no move
  returns a ticket to draft (`TicketMoves.ts:68-70`); WP5.17 builds the move, and nothing here relies on one existing.
- Whether review statistics or the chart miss the row WP5.17 removes from a ticket that was reopened before it went
  back into draft; the row's history stays in the log. Not traced.
- Whether any reader compares a status string that no type holds beyond the Bridge's `data-state` selectors; WP5.14's
  greps look, and the typecheck finds every typed one.
- Whether the stored JSON fixtures that hold a ticket status (the frozen pipeline and progress fixtures) can be
  renamed in place or are recordings to make again; WP5.14 reads each.
