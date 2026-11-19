# Stage 6 and 7: Gaia hosts the views, and conversations with hosted agents

## Goal

Every view of the Bridge is Gaia's own: one forge is drawn under Gaia's route `#forge/<trackerId>/<tab>[/<item>]`, at
full size in Gaia's window or in a browser tab of its own. Gaia's server reads the forge's board through its versioned
read API, maps each forge document into Gaia's own board model at its boundary, and serves the page a board contract
of Gaia's own; the page imports no forge code and no `forge-contracts` type. Each view is rewired to the finished facts
the forge serves as it moves, so no view recomputes a forge rule. Every change a view makes is a command the forge
accepts or refuses, and a refusal reads as the forge's own sentence. No forge page is embedded by iframe and no forge
session code is asked for.

Gaia alerts when a forge crashed (a crash suspected before a reboot included, with its crash summary and log), is down,
is hung, or holds work that waits for an instruction, and shows when a forge stopped supervising its agents. It alerts
when agents ended on a network outage, and one control, always clickable, resumes every such job across all forges. It
shows the running and the newest version of the Overseer and of Talos with a clean restart of each, every line's run
time in the pipeline overview, and the Assistant's switch. The user talks to an intake session and to a pipeline setup
session in Gaia (`job-message` in, the job stream out, pictures through the upload route), and pipeline setup has a
skill of its own, which the hosted pipeline agent and the user's own agent run alike.

## Depends on

Stages 0 to 5 must be finished, and stage 8's Assistant switch before WP6.27. This stage reads their results by role;
their exact names may differ from the ones below. Before WP6.1, open the code and the stage plans in this folder, write
down the name each item below got, and use that name everywhere this file uses the default. Where an item is missing,
stop and report it; do not build it here.

| Need | What it must be | From | Used by |
| --- | --- | --- | --- |
| N1. The board documents of the contract | `ForgeBoardDocument` at `GET /api/v1/board` (registry endpoint `board` at version 1) and its part documents (`BoardPageDocuments`, `BoardJobDocuments`, `BoardConversationDocuments`, `BoardPipelineDocuments`, `BoardMergeQueueDocument`, `BoardLimitsDocument`, `BoardReadingDocuments`), declared in `packages/forge-contracts` with types of their own that import nothing from forge's model and filled by forge's typed mapper; the value lists of their unions in `forge-contracts/BoardVocabulary`; the stream's `board` event and its part events carrying the same documents; every refusal a `ForgeRefusalDocument` (`code`, `fields`, `sentence`), and a refused command answered 409 `{ controlVersion, refusal, fields, text }` | stage 4 | WP6.2, WP6.24 |
| N2. The served facts | In the board document (stage 4's WP4.10): attention entries with a typed `target` (`{ subject, id }`, no Bridge fragment); notices and warnings as `{ kind, facts, sentence, causeSentence? }`; `today` with the `calendarDate` it counted; `openDecisionIds` in answering order and `escalatedDecisionIds`; per ticket `resolvedPriority`, `settlesADependency`, `isClosed`, `noAgentHasPickedItUp`, `reviewRound`, `isRepeatReview` and its `offers` (the command kinds it accepts now and its priority choices); per job its `stopHolds` and `offers` (stop modes, fresh, message); each entity's `effectivePipeline`; `limits` (concurrency bounds, worker model and effort, rework threshold, default ticket priority, first repeat-review round, page and picture limits); a decision option's `recommended` flag beside its unmarked label; each draft entity's transitive dependents (`dependentEntityKeys`), and in `limits` the default instructions per role and the re-review step the agent dialogs show. The monitor document's `route` strings stay Bridge fragments until stage 8 | stage 4 | WP6.24, WP6.6 to WP6.20 |
| N3. The entities draft and the refusals | The forge keeps an unfinished entities draft and serves its `entityRefusals` (each with its reason, its entity keys, the entity whose row shows it, the sentence and a `fix` of typed draft edits); Continue and Apply are refused `entity-refusals-stand` while any stands (decision 44); the setup document's `applyRefusal` is served, not predicted. Every refusal, in a command's answer and in a document, carries its reason code, its structured fields and the sentence the command line prints (decision 45). `pipeline-draft-edit` carries a typed edit, not an encoded field string | stage 4 | WP6.24, WP6.25, WP6.19, WP6.20 |
| N4. The board command kinds | The 34 kinds the Bridge sends as `ForgeBoardCommand` in `forge-contracts`, with payload types declared there, pinned in forge by `BOARD_COMMAND_CONTRACT_KINDS`, and forge's typed command ingestion that maps each contract command into its model | stage 4 | WP6.1, WP6.25 |
| N5. Talos in the identity, and its clean quit | `talosProtocolVersion` in the identity document, replacing `watcherProtocolVersion` (`OverseerServer.ts:637`); Talos's `quit` frame with reason `restart`, after which the Overseer starts Talos again and the paused agents resume by themselves | stage 2 | WP6.22 |
| N6. The interruption causes | `network-outage` (decision 35) and `lease-ended` (decision 38) on a job, served as the job's interruption in the board document and in the presence document's interrupted work | stage 2 | WP6.11, WP6.21, WP6.26 |
| N7. Presence | `GET /api/v1/presence` (`ForgePresenceDocument`, with `supervision`, `interruptedWork[].cause`, `.waitsFor` and `.automaticRestartsLeft`, and `crashLogs[]` with `suspected`) and `GET /api/v1/crash-log?number=<n>` (`ForgeCrashLogDocument`); the registry entry's `presence` key, `serving`, `stopped`, `handed-over` or `crashed` with a crash summary (component, `suspected` for a crash suspected before a reboot, the error's name and message); `interrupted-work-resume` with `ForgeResumeTarget` `{ jobId }`, `{ ticketReference }`, `'all'` or `'network-outage'` (decision 41) | stage 3 | WP6.21, WP6.26 |
| N8. Line run times | The pipeline facts' `stepRunTimes`: the newest run of each step line per entity, step kind (`prepare`, the install line's steps, or `gate`), step name and phase, with `runMilliseconds` in the measure the 15-minute bound uses (a sleep not counted, decisions 36 and 37) and its `ending` (`passed`, `failed`, `time-bound`) | stage 2 (WP2.20) records and serves, stage 4 declares | WP6.24, WP6.20 |
| N9. The forge system version | `FORGE_SYSTEM_VERSIONS.current` as stages 2, 3 and 4 left it (`packages/forge-contracts/constants/ForgeSystemVersions.ts`; stage 5 raises none) | stages 2, 3, 4 | WP6.1, WP6.2 |
| N10. The Assistant's switch in forge | The command `pipeline-assistant-set` with `on: boolean` in the contract, and the board's switch state served in the board document; while off, an incident takes its default with the reason recorded and served as a worded notice | stage 8 (WP8.9) | WP6.27 |
| N11. The committed ticket | A ticket's and a row's status reads `committed` where it read `pending`, in the board document's vocabulary and in the Bridge's views the stage moves; the served per-ticket fact `noAgentHasPickedItUp`; an edit of a committed ticket's content refused `content-of-a-committed-ticket` with its sentence; the move back into draft, `ticket-unready`, a by-hand kind the endpoint refuses (decision 48) | stage 4 (WP4.6, WP4.10), stage 5 (WP5.14, WP5.16, WP5.17) | WP6.10 to WP6.20 |

What this stage hands on:

- To stage 8 (shrink the HTTP surface): no client of the forge's session routes (`/api/session-codes`, `/api/session`,
  `/api/session-token`), of the embed channel or of the frame-ancestor records is left in Gaia; Gaia writes no
  frame-ancestor record, reads no forge's `embed` contract and runs no `forge open` (WP6.9, WP6.23). No module of
  Gaia's page imports `forge-contracts` (WP6.23). `apps/forge/bridge/`, the bundle build, `BrowserSessions`, the
  session routes, the forge's side of the embed machinery, Flint's ask route, `forge open` and the `progress.html` stub
  stay in forge for stage 8 to delete. Gaia's page imports `design-system/*`, `flint` and `brand/*` by package name;
  stage 8 folds the three into `page/lib/` and rewrites those imports to each library's interface file (decision 52).
- To stage 9 (rename): every word Gaia shows still says "Overseer"; the command kinds added to the contract keep their
  `overseer-*` names; Gaia's "Unpause" sends today's kind `overseer-resume`, which stage 9 renames.

## Decisions this stage carries out

From the design (`../hephaestus-talos.md`, section 2):

- **11.** Gaia shows each question with its context, its choices and its recommendation, read from the decision
  document's field (WP6.10).
- **13.** Gaia offers the instruction that resumes interrupted work, per job, per ticket or for everything (WP6.21).
- **14, 39.** Gaia alerts that a forge crashed, a crash suspected before a reboot included, shows its crash log and
  offers to start it; it never restarts one by itself (WP6.21).
- **15, 35.** Gaia alerts that agents ended on a network outage; one control, always clickable, resumes every job that
  ended this way across all forges (WP6.26).
- **18.** One interface server, in Gaia: every view is served by Gaia's server (WP6.3 onwards).
- **19.** Gaia reads the forge through its versioned read API and forwards instructions through the command endpoint
  (WP6.1 to WP6.3).
- **21, 38.** Gaia warns when a forge goes down or hangs, and shows when a forge stopped supervising its agents
  (WP6.21).
- **22, 47.** Every change the views make is a command; Gaia holds no ticket and writes no ticket file (WP6.25, WP6.3).
- **23.** Intake and pipeline setup are hosted sessions with a conversation in Gaia, and pipeline setup gets a skill, as
  intake has one (WP7.1, WP6.20, WP7.2).
- **24.** The Assistant's switch per board is offered in Gaia (WP6.27); the switch itself is stage 8's.
- **25.** Flint shows only inside a forge's board in Gaia, one per forge, with no brain (WP6.4, WP6.7).
- **26.** The work the Bridge offered is done through Gaia (all of stage 6).
- **27.** One design and one interface, a forge maximized in the window or in a tab of its own, nothing embedded by
  iframe (WP6.9, WP6.23).
- **28.** The Bridge's views move into Gaia's page and render from Gaia's own model; `apps/forge` stays the core
  (WP6.4 to WP6.20).
- **31.** Gaia shows the running and the newest version of the Overseer and of Talos and restarts each cleanly
  (WP6.22).
- **32.** Gaia's frame, its frame session, the embed channel and the frame-ancestor record go outright once every tab
  has moved; no older link form and no Bridge preference is read (WP6.5, WP6.9, WP6.23).
- **34.** Orchestrated Opus sessions do every package below, outside both trackers, and edit the rule files with the
  code they govern, with no approval gate (WP6.4, WP6.7, WP7.2).
- **36.** Every line's run time is shown in the pipeline overview (WP6.20).
- **40, 41.** A resume from Gaia is the forge's `interrupted-work-resume`; the forge gives the agent its restarts back.
  Undoing a pause is "Unpause" in Gaia's words and commands (WP6.21).
- **43.** Gaia opens a forge's board as its own route and runs no `forge open` (WP6.9, WP6.23).
- **44.** The entities step sends each edit at once and shows the forge's standing refusals; no view validates a draft
  itself (WP6.19, WP6.20).
- **45.** Gaia shows each forge refusal in the forge's own sentence (WP6.3, WP6.4, WP6.25).
- **49, 51.** Gaia imports only `forge-contracts` and `system-versions` from what forge produces, and only in its
  server's adapters; it maps each forge document into its own model and serves its page its own contract (WP6.24,
  WP6.25, WP6.4, WP6.23).
- **50.** The views read finished facts the forge serves (N2) instead of recomputing them (WP6.6 to WP6.20).

Decisions the run takes here:

- **The board's specs keep a document.** The Bridge's views are held by 77 DOM specs. `page/board/` keeps them under a
  `test:dom` task, and Gaia's rule 10 says so for that folder; Gaia's own views keep the rule that their specs have no
  document (WP6.4, WP6.5).
- **The board's stylesheets.** `page/styles/board/*.css` with `board-` names, held by the Bridge's four style guards
  plus Gaia's class and contrast checks in a board section of `page/StyleContract.spec.ts`; a board `@keyframes` is
  named `board-` and lives only there (WP6.4). Unifying them with `gaia.css` is later design work.
- **The forge route's header.** Gaia's forge bar keeps the forge's controls, versions and alerts; the board header keeps
  the figures, the tabs, the setup stepper and the waiting-on-user pill, without its own stop and restart (WP6.8). The
  route's look follows the Bridge's and Gaia's boards where they agree; a difference stays where it reads better and
  is listed in the package that makes it.
- **The Gaia board model holds only what Gaia reads.** Its fields are those a moved view or model reads, field by field;
  a key Gaia does not read is passed over, as every Gaia ingestion does (WP6.24).
- **The page's board contract mirrors the views' reads** under Gaia's names and Gaia's own unions, so moving a view is
  re-pointing its type imports and rewiring its value imports to served facts, never a reshaping (WP6.25).
- **Counts and times are worded by Gaia**: token counts through `CountTextUtil.shortCountTextOf`
  (`page/shared/utils/CountTextUtil.ts:19`), minutes through a Gaia constant. Sentences that state a forge rule
  (refusals, notices, warnings, attention meta) are the forge's served sentences; state words, draft words among
  them, are Gaia's, as the Bridge's views word them today. Gaia rewords a notice or
  a warning that names a command by its kind, under its rule 4; it shows a refusal verbatim (decision 45).
- **A crashed forge's alert reads the registry's crash summary**; a forge off after a crash serves no API and Gaia
  never touches the store. The full crash log is read at `GET /api/v1/crash-log` once the forge serves again, and shown
  on request (WP6.21).
- **The fleet-wide outage resume** is a Gaia command with no tracker id. Gaia's server sends the forge's resume of every
  outage ending to each forge whose API answers, one after another, and answers per forge `resumed`, `nothing-to-do`
  or `not-reached`; a forge that does not answer is named and skipped, since Gaia runs no CLI verb but start, stop and
  setup to change a forge. The control is drawn and enabled at all times, also with nothing to resume (WP6.26).
- **A hung forge** is one whose API answers while its presence reads `supervision: 'stopped'` (N7); a forge whose API
  does not answer while the registry says it serves reads as not answering, since a hung Hephaestus counts as gone and
  nothing tells a blocked process from a killed one (WP6.21).
- **The Assistant's switch** sits in the Assistant tab's head and sends `pipeline-assistant-set` (WP6.27).
- **No package is created here.** The views live in `apps/gaia/page/board/`; `packages/flint` gains Gaia as a second
  consumer until stage 8 folds it into Gaia's page.

## Today's code

Paths from the repository root. "Moved" means: copied into Gaia, rewired to Gaia's board contract and the forge's served
facts, while the Bridge's copy keeps running until stage 8 deletes it. Checked against the code at `b4174bd9`, which
changes nothing under `apps/` or `packages/` since `0a648b2b`, when `entities/integration` grew the Bridge by 82 files.

| What exists | Where | What happens to it |
| --- | --- | --- |
| The Bridge: 607 tracked files, 77 DOM specs (`.dom.tsx`) | `apps/forge/bridge/` (`git ls-files apps/forge/bridge \| wc -l`) | Moved, view by view, into `apps/gaia/page/board/`; the Bridge itself is deleted in stage 8 |
| The Bridge's views and their sizes: pipeline 195 files and 29 DOM specs (an `entities/` subfolder of 29 files among them), progress 32/4, detail-panel 30/2, agents 27/2, intake 23/3, kanban 18/3, question-panel 7/1, merge-queue 7/1, epics 7/1, waves 6/1, questions 6/1, tickets 4/1, assistant 4/1, finished-work 2/1; and the shared `views/ViewTitle.tsx` with its DOM spec, which nine views import | `apps/forge/bridge/views/*/` | Moved, one work package per view (WP6.10 to WP6.20, WP7.1); `ViewTitle` with the shared parts (WP6.6) |
| The Bridge's infrastructure: shell 56 files/12 DOM specs, flint 35/8, conversation 26/4, utils 40/0, testing 24, api 21, chips 9/1, @types 9, sandboxed-html 3, preferences 2 | `apps/forge/bridge/<folder>/` | Moved in WP6.5 to WP6.9; `api/` rewritten for Gaia's relay; the embed channel, session code exchange, identity reload and Flint's brain are not moved |
| The Bridge's documents: 7 files that re-export or extend forge's model types (`BoardStateDocument`, `Detail`, `Epics`, `Kanban`, `Progress`, `TicketsBoardState`, `ConversationDocuments`), 1,012 lines with `DependencyGraph.ts` and `Timeline.ts` | `apps/forge/bridge/@types/` | Not copied: the views type against Gaia's page board contract (WP6.25) |
| The Bridge's shipping imports of forge's `src/`: 152 files reach 39 modules; 139 import types only. The types come from the model's `@types/{Draft,GatePhase,Job,LogRecord,Pipeline,PipelineFacts,PipelineSetup,Task,Ticket,TicketForecast,TrackerProgress}` and `src/shared/monitor/@types/MonitorSnapshot` | `grep -rnE "from '(\.\./)+src/"` over the Bridge's shipping files | Re-pointed to Gaia's page board contract (transplant step 2) |
| The value imports, by group. Wording and formatting: `TokenCountUtil` (8 files), `NoticeWordingUtil` (4), `DraftWordingUtil` (2), `MILLISECONDS_PER_MINUTE` (4), `HtmlEscapeUtil` (1), `PRODUCT_NAMES` (1). Readings forge computes for the monitor document: `attentionEntriesOf` (`shell/WaitingOnUserModel.ts:71`), `todayFiguresOf` (`shell/HeaderModel.ts:140`), `OpenDecisionsUtil` (`shell/BridgeApp.tsx:20`, `views/assistant/AssistantModel.ts:10`, `views/kanban/KanbanModel.ts:13`, `views/questions/QuestionsModel.ts:6`), `BridgeFragmentUtil` (`shell/DetailRoute.ts:7`, `shell/HashRouter.ts:9`). Vocabulary lists: `GATE_PHASES` (7 files), the role lists (4), `AGENT_EFFORTS` (1). Rule constants: `FIRST_REPEAT_REVIEW_ROUND` (9 files), the status sets (`utils/DependencyGraphUtil.ts:6`, `views/waves/WaveForecastUtil.ts:8`, `views/pipeline/live/EntityWorkModel.ts:11`), `TicketDefaultsUtil` and `DEFAULT_TICKET_PRIORITY` (4), `jobStopHoldOf` (`views/detail-panel/TicketOverviewModel.ts:10`), the concurrency bounds (3), `DEFAULT_INSTRUCTIONS_OF_ROLE`, `RE_REVIEW_THRESHOLD_STEP_LINES`, `WORKER_MODEL`, `WORKER_EFFORT`, `DISPATCH_PROTOCOL` (4). Pipeline logic: `EntityOwnershipUtil` (3 files), `PipelineDraftEditUtil` (2), `EntityValidationUtil` (1), `PipelineUtil.pipelineOfEntity` (1), `OperationRefusal` with `OperationRefusalWordingUtil` (2) | the same grep, `import` lines without `type` | Replaced by served facts (N2, N3) or by Gaia's own words and constants, in the package that moves the file |
| The rest of the value imports: `FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS` (`flint/FlintBrainDirector.ts:14`), `SERVED_CONTRACT_VERSIONS` (`shell/VersionedEmbedChannel.ts:10`); in `testing/`: `LIMITS`, `TIME_UNITS`, `TIMESTAMP_SLICES`, and three forge modules of `HeadlessBridgeCheck.ts` | as above | Not moved (brain, embed, headless check); the fixtures take Gaia's own values |
| Which controls a ticket offers is decided by hand-written status comparisons, about 50 of them | e.g. `apps/forge/bridge/views/detail-panel/DetailControlsModel.ts:56-70` | Replaced by the served moves and controls (WP6.12) |
| The entities step holds edits that would leave a refusal and sends them only once the whole set passes its own validator | `apps/forge/bridge/views/pipeline/setup/EntitiesStep.tsx:176-195`; `EntitiesStepModel.ts:88-92`; `EntityRefusalsModel.ts` | Replaced: each edit is sent at once and the served refusals are shown (WP6.19) |
| The Apply dialog predicts the Board's refusal of an Apply that turns a stored pipeline into entities while tickets are in flight | `apps/forge/bridge/views/pipeline/apply/ApplyDialogModel.ts:135-152` | Replaced by the served Apply refusal (WP6.19) |
| A question's recommendation is read from a label's trailing "(Recommended)" | `apps/forge/bridge/views/question-panel/QuestionPanelModel.ts:228-229` | Replaced by the decision document's field (WP6.10) |
| The gates table shows a gate's profile time chip; no line's recorded run time is shown | `apps/forge/bridge/views/pipeline/gates/GatesAreaModel.ts:112-138` | Changed: every line's run time (WP6.20) |
| The tab list: `kanban`, `waves`, `progress`, `epics`, `tickets`, `agents`, `questions`, `assistant`, `intake`, `pipeline` | `apps/forge/bridge/shell/HashRouter.ts:12` | Kept as the board's tab list in Gaia (`BoardRoute`) |
| Which tabs show: Waves without a dependency, Epics without an epic, only Pipeline without a readable pipeline | `apps/forge/bridge/shell/HashRouter.ts:60-64` | Moved unchanged |
| The services the shell takes (command client, Flint's brain client, picture upload, event stream, identity, reload, storage, embed mode, transcript and profile followers, question notifier) | `apps/forge/bridge/shell/BridgeApp.tsx:88-110` | Replaced by `BoardServices` (Interfaces) without brain, identity, reload and embed |
| The shell reloads the page when the Overseer's `codeVersion` changes | `apps/forge/bridge/shell/BridgeApp.tsx:199-230` (reload at `:225`) | Not moved: Gaia's page is Gaia's bundle; a forge version change is the forge verdict's business |
| The frame side of the embed channel (`ready`, `route`, `session-lost`, `navigate`) | `apps/forge/bridge/shell/BridgeApp.tsx:579-619`, `shell/VersionedEmbedChannel.ts`, `shell/EmbeddedChannel.ts` | Not moved; used by Gaia's frame only while a tab is unmoved |
| Flint's brain controls hidden | `apps/forge/bridge/shell/BridgeApp.tsx:137` | Not moved: no brain part reaches Gaia |
| The entry: fonts, theme and embed mode before first paint, session code exchange, one root | `apps/forge/bridge/Main.tsx:28-62` | Replaced by the board root under Gaia's own entry |
| The API paths the Bridge calls | `apps/forge/bridge/api/EventStreamClient.ts:34`, `CommandClient.ts:28`, `PictureUploadClient.ts:21`, `TranscriptStreamClient.ts:66`, `ProfileStreamClient.ts:31`, `SessionTokenSource.ts:22`, `IdentityClient.ts:6`, `FlintBrainClient.ts:51`, `SessionCodeExchange.ts:21-22`, `views/intake/PictureAttachmentsModel.ts:48` | Each rewritten to a Gaia relay route (WP6.5); session token, identity, session and brain paths are dropped |
| The board event kinds: `board`, `job`, `decision`, `incident`, `overseer`, `usage`, `profile`, `pipeline` | `apps/forge/bridge/api/EventStreamClient.ts:11` | Each ingested and mapped by Gaia's relay (WP6.24, WP6.3) |
| Browser storage keys `<STORAGE_PREFIX>:<trackerId>` | `apps/forge/bridge/preferences/PreferenceStore.ts:6`, `.claude/rules/bridge.md:63-64` | Gaia's own keys; no Bridge key is read (WP6.5) |
| Agent-written HTML only as a sandboxed frame's `srcdoc`, with the page's stylesheet addresses | `apps/forge/bridge/sandboxed-html/SandboxedHtmlFrame.tsx:1-6`, `SandboxedHtmlDocument.ts:13-21` | Moved; the document is built through the DOM, with no forge escape util |
| The Bridge's stylesheets: `board.css` (3,100 lines, 764 `bridge-` classes, 22 `@keyframes`), `tokens.css` (73 tokens) | `apps/forge/bridge/styles/` | Moved per view into `apps/gaia/page/styles/board/` with `board-` class names |
| Frame mode hides only the title row | `apps/forge/bridge/styles/board.css:576-579` | Changed in WP6.9: frame mode hides the Bridge's whole head, while unmoved tabs still show in the frame |
| The Bridge's DOM spec runner and happy-dom preload | `apps/forge/bridge/testing/RunDomSpecs.ts:18-19`, `bridge/testing/HappyDom.ts`; `apps/forge/package.json:18` | Copied for Gaia (WP6.5) |
| The Overseer's data routes: state, events, monitor, job stream, profile stream, job files, pictures, session token | `apps/forge/src/services/overseer/OverseerServer.ts:535-552` | Kept; state has its versioned path from stage 4; events, job stream, profile stream and pictures get theirs (WP6.1) |
| Only registered endpoints are served at `/api/v<n>/`; the match is on the literal path | `OverseerServer.ts:601-606`, `:612-619` | Changed: templated endpoints (`jobs/{jobId}/stream`) match (WP6.1) |
| The board event stream writes no handshake; the monitor stream does | `OverseerServer.ts:410-421`; `:423-426`, `:437-447` | Changed: the board, job and profile streams open with a handshake (WP6.1) |
| The picture upload: raw body, token, bounded read, 3,932,160 bytes | `OverseerServer.ts:254-284`; `apps/forge/src/shared/constants/OverseerLimits.ts:132-135` | Kept, versioned as `pictures` (WP6.1) |
| The contract's control kinds: 9 | `packages/forge-contracts/@types/ForgeControlCommand.ts:9-18` (plus stage 3's `interrupted-work-resume`, stage 4's 34 board kinds) | Changed: one list of every kind (WP6.1); `talos-restart` added (WP6.22) |
| Gaia's ingestion of forge documents: a version check, a shape check of the keys Gaia reads (`DocumentShapeUtil`, shapes typed `satisfies ShapeOf<forge document>`), a map into Gaia's model | `apps/gaia/src/adapters/forge-api/MonitorSnapshotIngestion.ts:1-60`, `BoardSummaryIngestion.ts`, `utils/DocumentShapeUtil.ts`, `utils/ForgeReadingMapUtil.ts` | The pattern of the board ingestion (WP6.24) |
| Gaia's map of its model to its page contract | `apps/gaia/src/adapters/page-api/FleetDocumentMapUtil.ts` (258 lines), `page/@types/FleetDocument.ts` (297 lines) | The pattern of the board's page contract and map (WP6.25) |
| Gaia's map of a page command into its model | `apps/gaia/src/adapters/page-api/GaiaCommandIngestion.ts`, `src/shared/@types/GaiaCommand.ts` | The pattern of the board command ingestion (WP6.25) |
| Forge sentences that name a command leave the server in Gaia's words: refusals by code (`REFUSAL_SENTENCES`), notices by kind | `apps/gaia/src/adapters/page-api/ForgeSentenceUtil.ts:17-36` | Changed: a refusal shows the forge's sentence (WP6.3); notices and warnings keep their rewording |
| The page reaches `forge-contracts` in two places: the embed channel's types, and through `CONTRACT_VERSIONS`, whose module imports `forge-contracts/FrameAncestorRecord` and `forge-contracts/OverseerContractVersions` and which the page project includes | `apps/gaia/page/views/forge-frame/EmbedChannel.ts:8`; `apps/gaia/src/shared/constants/ContractVersions.ts:8-9`; `apps/gaia/page/tsconfig.json:12-21` | Changed: the page's contract versions split from the forge's (WP6.4); the embed channel deleted (WP6.23) |
| Gaia's server routes, every body bounded at 65,536 bytes by Bun | `apps/gaia/src/features/page-server/PageServer.ts:90`, `:130-198`, `:254` | Changed: board relay routes, a per-route body bound (WP6.3) |
| Gaia's CSP frames any loopback port | `apps/gaia/src/lib/local-http-guards/ContentSecurityPolicy.ts:11`; `PageServer.ts:240` | Changed in WP6.23: no frame source |
| The frame session route: a session code from the Overseer with the forge's token, answered as the Bridge's address | `apps/gaia/src/features/page-server/routes/FrameSessionRoute.ts:1-103` | Deleted (WP6.23); its registry and readings check is generalised first (WP6.3) |
| Gaia's forge client: versions, identity, summary, monitor, monitor stream, commands, session codes | `apps/gaia/src/lib/forge-client/ForgeClient.ts:53-60`, `:123-215` | Changed: board reads, streams, pictures (WP6.2), presence (WP6.21); session codes deleted (WP6.23) |
| The HTTP boundary takes a JSON body only and sends no `Last-Event-ID` | `apps/gaia/src/lib/forge-client/OverseerFetch.ts:8-24` | Changed: a byte body, a byte answer, `Last-Event-ID` (WP6.2) |
| Gaia supports forge 1.1 | `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9` | Changed to the version WP6.1 serves (WP6.2) |
| Gaia runs the forge program for `start`, `stop`, `init`, `update`, `version` and `open` | `apps/gaia/src/adapters/forge-program/ForgeProgram.ts:77-86` | Changed: `open` deleted (WP6.23) |
| Gaia's commands: `forge-resume` is the undo of a pause, worded "Resume" | `apps/gaia/src/adapters/page-api/GaiaCommandIngestion.ts:51-62`; `page/shared/utils/ForgeCommandTextUtil.ts:27`; `page/views/forges/ForgesModel.ts:384` | Changed: `forge-unpause`, worded "Unpause" (WP6.21) |
| A fleet-wide Gaia command exists: `fleet-look-again` | `apps/gaia/page/@types/CommandDocument.ts:40` | The pattern of the outage resume (WP6.26) |
| Gaia's endpoint versions and system version | `apps/gaia/src/shared/constants/GaiaSystemVersions.ts` | Changed: relay endpoints, a minor raise (WP6.3), the commands route's change (WP6.21, WP6.23) |
| Gaia's contract versions | `apps/gaia/src/shared/constants/ContractVersions.ts:13-31` | Changed: the board contracts (WP6.24, WP6.25, WP6.3); `forgeEmbedChannel`, `forgeFrameAncestorRecord`, `gaiaFrameSession` deleted (WP6.23) |
| Gaia's forge route carries the Bridge's fragment verbatim: `#forge/<trackerId>/#questions/E2` | `apps/gaia/page/shared/HashRouter.ts:10`, `:46-53`, `:106-109` | Changed: `{ trackerId, boardRoute }`, one written and read form (WP6.9) |
| The forge in place: Gaia's bar over the Bridge's frame, frame session, embed channel, "Open in new tab" | `apps/gaia/page/views/forge-frame/` (`ForgeFrameView.tsx:129`, `ForgeFrameSession.ts`, `EmbedChannel.ts`, `FrameSessionRequest.ts`) | Changed: the frame stays only for unmoved tabs (WP6.9), then is deleted (WP6.23); the bar stays |
| Routes into a forge from Gaia's own views, built from the monitor's `route` fragment strings | `apps/gaia/page/shell/RailModel.ts:75`, `views/attention/AttentionModel.ts:236-237`, `views/activity/ActivityModel.ts:190`, `views/agents/AgentsModel.ts:185-186`, `views/agents/BrainModel.ts:171`; `packages/forge-contracts/@types/MonitorSnapshotDocument.ts:60`, `:85`, `:100` | Changed to `boardRoute` from the served typed target (WP6.9) |
| "Open in new tab" runs `forge open` | `GaiaCommandIngestion.ts:57` (`forge-open-in-browser`), `apps/gaia/src/features/forge-control/ForgeControl.ts:309-310`, `apps/gaia/src/adapters/forge-program/ForgeProgram.ts:77` | Replaced: the page opens Gaia's own route in a new tab (WP6.9); the kind is deleted (WP6.23) |
| Gaia writes the frame-ancestor record `<monitor>/frame-ancestors/gaia.json` | `apps/gaia/src/adapters/gaia-files/ServerRecordWriter.ts:1-3`, `:43-45` | Deleted in WP6.23 |
| Gaia's page has no DOM specs and no `test:dom` task | `apps/gaia/CLAUDE.md`, rule 10; `apps/gaia/package.json:10-18` | Changed: `test:dom` for `page/board/` (WP6.5), rule 10 amended (WP6.4) |
| Gaia draws no Flint, and its screens name no command | `apps/gaia/CLAUDE.md`, rules 12 and 4 | Changed: Flint in the forge route only; a forge refusal in the forge's sentence (WP6.4) |
| Gaia's page imports: views never the shell, shared never the shell or a view | `apps/gaia/page/PageImportDirection.spec.ts:15-18` | Changed: `board` added, and no page module imports `forge-contracts` (WP6.4) |
| Gaia's style contract: classes, tokens, contrast, no keyframe of Gaia's own | `apps/gaia/page/StyleContract.spec.ts:1-11` | Changed: a board stylesheets section (WP6.4) |
| The Notification API has no boundary in Gaia yet | `apps/gaia/CLAUDE.md`, the boundaries table | Created with the question alerts (WP6.8) |
| The registry entry Gaia reads | `apps/gaia/src/adapters/forge-registry/@types/RegisteredForge.ts:12-23` | Changed: stage 3's `presence` (WP6.21) |
| The fleet document's forge: `codeVersion`, `versions` | `apps/gaia/page/@types/FleetDocument.ts` | Changed: presence, waiting work, outage endings, Talos and newest versions (WP6.21, WP6.26, WP6.22) |
| `forge open` and the `progress.html` stub | `apps/forge/cli/tracking/open/OpenCommand.ts:1-92`; `apps/forge/src/adapters/progress-page/ProgressPageStubWriter.ts:10-30` | Kept: they open the Bridge, which forge serves until stage 8 deletes both (decision 43). Gaia stops running `open` (WP6.9, WP6.23) |
| `INSTALL_VERSION = 36` (37 after stage 2's WP2.29, higher if WP2.30 or WP2.32 change the installed surface) | `apps/forge/cli/constants/InstallVersion.ts:1` | Raised once in WP7.2 |
| Two skills: `agent-po`, `agent-progress-orchestrate` | `apps/forge/skills/`; `apps/forge/cli/adoption/constants/ClaudeCodeInstall.ts:23`, `:32-35` at `3274ac88`, which stage 2's WP2.30 moves to `apps/forge/cli/adoption/constants/AgentInstall.ts` (reread there on the tree you run on); `apps/forge/src/shared/constants/ProductNames.ts:11-12`, `:26-27`, `:40-41` | Changed: a third skill for pipeline setup, in `AgentInstall.ts` (WP7.2) |
| The product owner's first message runs its skill | `apps/forge/resources/prompts/ProductOwnerPrompt.md:1-2`; `apps/forge/cli/overseer/OverseerWording.ts:276-277` (`productOwnerTextOf`) at `3274ac88`; stage 2's WP2.25 builds the first line from the agent adapter's `instructionBundleLineOf` (reread on the tree you run on) | Kept; the pipeline agent's first message does the same (WP7.2) |
| The pipeline agent loads no skill | `.claude/rules/skills.md:21-24`; `apps/forge/resources/prompts/PipelineAgentPrompt.md:1-48`; `OverseerWording.ts:823-835` (`pipelineAgentTextOf`, the first message at `:826`) | Changed (WP7.2) |
| The pipeline agent's step blocks: research (also at billing), entities, constitution, design (also at Apply), and the advise block | `OverseerWording.ts:713-728` (`stepPromptFilesOf`); `apps/forge/resources/prompts/PipelineAgent{Research,Entities,Constitution,Design,Advise}.md` | Kept as the messages the Overseer sends per step; their rules move into the skill (WP7.2) |
| Pipeline agent verbs outside a job name the setup record | `apps/forge/cli/pipeline/AgentCommandLine.ts:1-4` | Kept: the user's own agent runs the skill through them |
| Installed and prompt wording names the Bridge | `PipelineAgentPrompt.md:3`, `:34`; `PipelineAgentDesign.md:7`; `resources/templates/PipelineAgentBrief.md:6`; `resources/templates/Reference.md:249`; `skills/agent-po/SKILL.md:147`; `skills/agent-progress-orchestrate/SKILL.md:75` | The pipeline agent's prompts take a neutral word (WP7.2); the rest, which name the Bridge while it still runs, in stage 8 |
| The rule that Flint is imported only by the Bridge | `.claude/rules/flint.md:14-16`; root `CLAUDE.md:17` | Changed: Gaia's page is a second consumer until stage 8 (WP6.4) |
| No shipped forge file names a client | `apps/forge/src/ClientNames.spec.ts:24` | Kept: every forge change here names no client |
| Retired component names | `apps/forge/src/ComponentNames.spec.ts:28-63` | Kept: every new name checked against it |
| The Overseer's server is a recorded boundary | `apps/forge/src/testing/BoundarySpecs.ts:139` | Recorded again after WP6.1 |
| Forge guards that name the Bridge: DOM specs only under `bridge/`, its include list | `apps/forge/src/TestFileConventions.spec.ts:108`, `:122`; the include list's guard is deleted, and the Bridge's tsc projects, lint and DOM specs are out of the gates | Kept: the Bridge stays until stage 8 |

## Work packages

### Order and parallel map

```
WP6.1 (forge) ──► WP6.2 ──► WP6.24 ──► WP6.25 ──► WP6.3 ─────────────┐
      │                                                              ▼
      ├──► WP6.4 (any time after WP6.1) ──────────────────────────► WP6.5 ──► WP6.6 ──► WP6.7 ──► WP6.8 ──► WP6.9
      │                                                                                                    │
      └──► WP7.2 (forge, any time)                                                                         ▼
                                         WP6.10, WP6.11, WP6.12, WP6.18, WP6.19, WP7.1  (in parallel)
                                         WP6.12 ──► WP6.13, WP6.14, WP6.15, WP6.16, WP6.17 (in parallel)
                                         WP6.19 ──► WP6.20
      WP6.3 and WP6.9 ──► WP6.21 ──► WP6.26 ──► WP6.22
      all views, WP6.21, WP6.26, WP6.22 ──► WP6.23
      WP6.18 and stage 8's WP8.9 ──► WP6.27
```

- Run alone: WP6.1, WP6.2, WP6.24, WP6.25, WP6.3, WP6.5 to WP6.9, WP6.21, WP6.26, WP6.22, WP6.23. WP6.4 may run
  beside WP6.2, WP6.24, WP6.25 and WP6.3. It changes `apps/gaia/page/tsconfig.json`, `page/tsconfig.spec.json`,
  `page/PageImportDirection.spec.ts`, `page/StyleContract.spec.ts`, `apps/gaia/src/shared/constants/ContractVersions.ts`
  and the page modules that import it, `apps/gaia/package.json`, `apps/gaia/eslint.config.js`, `apps/gaia/CLAUDE.md`,
  `.claude/rules/flint.md`, the root `CLAUDE.md` and `bun.lock`. WP6.24, WP6.25 and WP6.3 add their contract versions
  to the file WP6.4 splits: whichever lands second rebases and puts its keys in the half WP6.4 named.
- The view packages WP6.10 to WP6.20 and WP7.1 touch disjoint folders under `page/board/views/`. Each also adds one
  line to `apps/gaia/page/board/shell/BoardTabViews.tsx`, one `<link>` line to `apps/gaia/page/index.html` and one row
  to the board section of `apps/gaia/page/StyleContract.spec.ts`' stylesheet list. Those three lines are the only
  overlap: each package rebases before it lands and keeps the other packages' lines. `pipeline.css` is the exception:
  WP6.8 creates, links and lists it for `PipelinePanel.tsx`, and WP6.20 only adds rules to it.
- A view package finds every field it reads in Gaia's page board contract (WP6.25). A field a view needs that the
  contract lacks is added in that package to the contract, the board model, the ingestion and both maps, and the
  package says so in its report; a fact the forge does not serve stops the package (a stop condition: the forge's side
  is stage 4's).
- WP6.8 also moves seven files of `views/pipeline/` that the header's pipeline model reaches (Today's code of the
  header row in WP6.8); WP6.19 and WP6.20 copy the rest of that folder around them.
- WP7.2 touches only `apps/forge/` (skills, prompts, templates, `cli/adoption`, `ProductNames.ts`, the install version,
  `docs/cli.md`) and `.claude/rules/skills.md`; it may run beside any package that changes no file of `apps/forge/`,
  which is every package of this stage but WP6.1 and WP6.22. It is the one package of this stage that raises
  `INSTALL_VERSION` and re-records `InstallChangeWatch`.
- WP6.21, WP6.26 and WP6.22 change `FleetDocument.ts`, its map util and the forge bar: they run one after the other.
- WP6.27 runs once stage 8's WP8.9 has landed (N10); it changes only the Assistant view and the board contract's
  switch fields and command, and may run beside any package that does not change them.

### The transplant procedure

WP6.5 to WP6.20 and WP7.1 move Bridge code by these steps. Each package names its files; the steps are the same.

1. Copy each named file from `apps/forge/bridge/<path>` to `apps/gaia/page/board/<path>` (the same relative path below
   `board/`). Leave the Bridge's file unchanged: the Bridge keeps running until stage 8.
2. Re-point type imports. A type from `../../src/...` (forge's model or monitor types) or from `bridge/@types/` becomes
   the type of the same meaning in Gaia's page board contract (`page/@types/board/`, WP6.25). Never import a file of
   `apps/forge/` and never `forge-contracts`. Imports between moved files stay relative and resolve inside
   `page/board/`. `design-system/*`, `flint*` and `brand/*` stay package imports until stage 8.
3. Rewire value imports to what this stage provides, never to forge code:
   - a reading forge serves (attention entries, today's figures, open decisions and their order, notices, warnings,
     offered moves and controls, resolved priority, stop holds, repeat-review facts, status flags,
     effective pipelines, entity ownership, refusals, limits and defaults) becomes a read of the served field (N2, N3);
   - a vocabulary list (`GATE_PHASES`, the role lists, `AGENT_EFFORTS`) becomes Gaia's own ordered list in
     `page/@types/board/BoardVocabulary.ts`; a draft's state words (`DraftWordingUtil`) become Gaia's own
     `page/board/utils/DraftWordsUtil.ts`, as every state word of the views is Gaia's;
   - `TokenCountUtil.formatTokenCount` becomes `CountTextUtil.shortCountTextOf`; `MILLISECONDS_PER_MINUTE` becomes
     Gaia's `page/shared/constants/TimeUnits.ts` (WP6.6); `PRODUCT_NAMES` becomes Gaia's own;
   - a Bridge fragment (`BridgeFragmentUtil`) becomes a `BoardRoute` that `BoardRouter.routeOfTarget` composes from a
     served target, opening for each subject the tab and item the Bridge opens today (the routes
     `src/shared/monitor/AttentionEntries.ts` writes).

   The behaviour a moved spec holds stays; where a spec fed a forge rule its input, it now feeds the served fact, and
   the case keeps its expected view. Every value import of `src/` a package moves is listed in it; after the package,
   `grep -rn "src/" page/board/<folder>` prints no import.
4. Rename what names the Bridge. Identifiers: `BridgeApp` → `BoardApp`, `BridgeClock` → `BoardClock`,
   `BridgeClockContext` → `BoardClockContext`, `BridgeFlint` → `BoardFlint`, `BridgeTab` → `BoardTab`,
   `BRIDGE_TABS` → `BOARD_TABS`, `BridgeRoute` → `BoardRoute`, `BridgeErrorBoundary` → `BoardErrorBoundary`, and
   every other `Bridge` in an identifier to `Board`. CSS classes, keyframes and custom properties: the prefix `bridge-`
   becomes `board-` (`grep -rn "bridge-" page/board page/styles/board` prints nothing when done). Words shown to the
   user that say "Bridge" become "board". Words that say "Overseer" stay (stage 9). Check each new name against
   `apps/forge/src/ComponentNames.spec.ts:28-63`.
5. Replace the Bridge's services with `BoardServices` (Interfaces). A component that read `services.<x>` reads the
   same member of `BoardServices`; a member that `BoardServices` lacks (brain, identity, reload, embed) is removed with
   the code that used it.
6. Copy each module's plain spec beside it. A spec that imports forge's `src/testing/*` gets a fixture under
   `page/board/testing/` instead, built on Gaia's page board contract. Copy each `.dom.tsx` spec beside its module;
   `page/testing/RunDomSpecs.ts` (WP6.5) runs it.
7. Copy the module's style rules: the rules of `apps/forge/bridge/styles/board.css` whose selectors name a class the
   copied components emit, into `apps/gaia/page/styles/board/<view>.css`, renamed as in step 4; the tokens of
   `apps/forge/bridge/styles/tokens.css` they read into `apps/gaia/page/styles/board/tokens.css`. Find the classes
   with `grep -ohE "className=[^>]+" <files>` and the rules with the selector text. Create
   `page/styles/board/tokens.css` if it does not exist yet and link it in `apps/gaia/page/index.html` after
   `./styles/gaia.css`. Link the new stylesheet after `./styles/board/tokens.css`, and add both to the board stylesheet
   list of `apps/gaia/page/StyleContract.spec.ts`.
8. Run, from `apps/gaia/`: `bun run typecheck`, `bun run lint`, `bun test page/board/<folder>`, `bun run test:dom`;
   then `bun run verify` at the root.

Every package's "Done when" includes, at the repository root: `bun install --frozen-lockfile` and `bun run verify`, both
green. A package that changes dependencies runs `bun install` first and commits `bun.lock` in the same change.

### WP6.1 The forge serves the board streams and pictures at versioned paths, and lists every kind a client sends

**Purpose.** Gaia calls only versioned paths (`apps/gaia/CLAUDE.md`, rule 3). Stage 4 serves the board state at
`/api/v1/board` with its finished facts and puts the board documents and the board command kinds into the contract
(N1 to N4). The board event stream, the job stream, the profile stream and the pictures are served only at their
unversioned paths (`OverseerServer.ts:535-552`, `:612-619`). This package makes them a versioned, recorded contract
that Gaia can build on, and gives forge and Gaia one list of every kind a client may send.

**Files.**

- Change `packages/system-versions/utils/CompatibilityRegistryUtil.ts` and its spec: endpoint templates.
- Change `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts` and its spec: five entries.
- Change `packages/forge-contracts/constants/ForgeSystemVersions.ts`: one minor up.
- Create `packages/forge-contracts/constants/ForgeControlCommandKinds.ts`: the list of every kind a client may send,
  the control kinds of `ForgeControlCommand` and the board kinds of stage 4's `ForgeBoardCommand`. Export it in
  `packages/forge-contracts/package.json`.
- Create `packages/forge-contracts/@types/BoardStreamHandshake.ts`: the handshake of the three streams. Export it.
- Create `apps/forge/src/shared/constants/OverseerApiContracts.parity.spec.ts`: the contract's kinds against forge's
  pins and forge's command ingestion (N4), beside the pins it compares.
- Change `apps/forge/src/services/overseer/OverseerServer.ts`: templated matching and the stream handshakes.
- Change `apps/forge/docs/reference/overseer-api.md`: "Versioned paths", "The event stream", "The transcript stream",
  "System versions".
- Re-record `apps/forge/src/testing/recordings/<os>/` for the boundary `src/services/overseer/OverseerServer.ts`.

**What to do.**

1. In `CompatibilityRegistryUtil`, add `endpointEntryForPath(registry, endpointPath, version)`: the endpoint entry whose
   `endpoint` matches `endpointPath` at `version`, or `null`. A template segment is `{<name>}` and matches one
   non-empty segment of the characters `[A-Za-z0-9_.-]`, the characters the Overseer's own path patterns accept
   (`OverseerServer.ts:170-173`); a literal segment matches itself. Add `endpointPathOf(template, values)`, which
   fills each `{<name>}` from `values` with `encodeURIComponent` and throws on a missing value (a caller's defect).
   `entrySentencesOf` refuses a template with an empty name or two equal names.
2. In `ForgeCompatibilityRegistry.ts`, with the helper `endpointAddedIn` (stage 3), add five entries at version 1,
   introduced in the new forge version: `events`, `jobs/{jobId}/stream`, `profiles/{profileRunId}/stream`, `pictures`,
   `pictures/{pictureId}`. `board`, `presence` and `crash-log` are stage 4's and stage 3's and stay as they are. Add
   no entry for `jobs/{jobId}/files/...`: no view reads a job file (`grep -rn "gate.log\|report.json" apps/forge/bridge`
   prints nothing).
3. Raise `FORGE_SYSTEM_VERSIONS.current.minor` by one over the value the file holds when the package starts. Only adds,
   so the major stays and the minimum stays.
4. In `OverseerServer.ts`, make `servedEndpointsOf` (`:601-606`) return the served entries, and make
   `requestAtUnversionedPath` (`:612-619`) find the entry with `endpointEntryForPath` and rewrite the path to
   `/api/<the concrete endpoint path>`, so every guard and route rule of the unversioned route applies unchanged. The
   unversioned paths stay (stage 8 decides their future).
5. Write the handshake event first on `/api/events` (`eventsResponse`, `:410-421`), the job stream
   (`transcriptResponse`, `:449-461`) and the profile stream (`profileOutputResponse`, `:467-477`), with the existing
   `handshakeEventText(systemVersion)` (`:423-426`): `event: handshake` and `data: {"systemVersion":{...}}`, with no
   `id:` line, so it never moves a client's `Last-Event-ID`. Pass the system version into each response the way
   `monitorEventsResponse` receives it (`:437`).
6. Add no kind to `ForgeControlCommand.ts` here; `talos-restart` joins it in WP6.22. Re-measure the kinds a Bridge view
   sends with stage 4's guard (`bridge/CommandKindsInContract.spec.ts` or the name stage 4 gave it); a kind it names
   outside both lists stops this package and is reported (adding a kind with its payload and its mapping is stage 4's).
7. `ForgeControlCommandKinds.ts` exports `FORGE_CONTROL_COMMAND_KINDS`, a frozen list of every kind of
   `ForgeControlCommand | ForgeBoardCommand`, typed `readonly (ForgeControlCommand | ForgeBoardCommand)['kind'][]`, with
   a spec in the package that holds it exhaustive (a `satisfies` record keyed by every kind). Forge's own pins,
   `CONTROL_CONTRACT_KINDS` and `BOARD_COMMAND_CONTRACT_KINDS`
   (`apps/forge/src/shared/constants/OverseerApiContracts.ts`), stay.
8. The parity spec: the list equals the union of forge's two pins; every listed kind is a kind of forge's
   `OverseerApiCommand` (`apps/forge/src/shared/@types/ControlCommand.ts:271`); and forge's command ingestion (N4)
   has a mapping for every listed kind, a compile-time check (a record typed
   `satisfies Record<(typeof FORGE_CONTROL_COMMAND_KINDS)[number], unknown>` built from the ingestion's own table). The
   contract's payload types stand alone (decision 50), so the spec holds the mapping, not an assignability of the two
   unions.
9. Update `overseer-api.md` for the new versioned paths and the handshake.
10. Run `bun run record src/services/overseer/OverseerServer.ts` in `apps/forge/` and commit the recording. The
    headless Bridge spec in that boundary skips without Chrome (`.claude/rules/bridge.md:65-66`).

**Specs.**

- `CompatibilityRegistryUtil.spec.ts`: a template matches a concrete path of the same length; it refuses an empty
  segment, an extra segment and a `%`-escape; `endpointPathOf` fills and encodes; a template with two equal names is an
  inconsistency.
- `ForgeCompatibilityRegistry.spec.ts`: the five entries at version 1, introduced in the new minor, each needed by a
  client of the current version; the `board`, `presence` and `crash-log` entries unchanged.
- `OverseerServer.spec.ts`: `GET /api/v1/board` still answers as stage 4 left it;
  `GET /api/v1/jobs/J1/stream` and `/api/v1/profiles/P1/stream` reach their routes; `/api/v2/board` and
  `/api/v1/jobs/J1/extra` are 404; each of the three streams writes the handshake before any other event, with no id;
  a `Last-Event-ID` replay on `/api/v1/events` behaves as on `/api/events`.
- The parity spec as in step 8, and the contract's kinds spec as in step 7.

**Done when.** At the root: `bun install --frozen-lockfile`, `bun run verify` green (Gaia's `check` warns that
`SUPPORTED_FORGE_VERSION` is behind; a warning is expected). In `apps/forge/`:
`bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/OverseerServer.spec.ts
./src/shared/constants/OverseerApiContracts.parity.spec.ts` passes; `bun run check` names no stale stamp.

**Parallel.** Alone.

### WP6.2 Gaia's forge client reads the board, recorded from a real forge

**Purpose.** Give Gaia's server the calls the relay needs, each at the endpoint version forge's registry serves the
supported version, and record every answer from this repository's forge.

**Files.**

- Change `apps/gaia/src/lib/forge-client/OverseerFetch.ts` and its recording specs.
- Change `apps/gaia/src/lib/forge-client/ForgeClient.ts`, `@types/ForgeClientAnswer.ts` and `ForgeClient.spec.ts`.
- Change `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts`.
- Change `apps/gaia/src/lib/api-paths/ApiPathUtil.ts` if it cannot build a versioned path from a filled template.
- Create `apps/gaia/src/lib/forge-client/OverseerFetch.board.recording.spec.ts`, and add `overseer-fetch-board` to
  `RECORDED_BOUNDARIES` in `apps/gaia/src/testing/BoundaryRecordings.ts`.
- Change `apps/gaia/src/testing/RecordedAnswers.ts` (board situations, stream call shapes with `lastEventId`, byte
  bodies), `apps/gaia/src/testing/SupportedForgeRecording.ts`.
- Re-record `overseer-fetch-supported-forge`, `overseer-fetch-flint-brain`, `overseer-fetch-versions`; record
  `overseer-fetch-board`, under `apps/gaia/src/testing/recordings/<os>/`.
- Change `apps/gaia/docs/contracts.md` (the recordings paragraph after the versioned contracts table).

**What to do.**

1. `OverseerRequest` (`OverseerFetch.ts:8-16`) gains `byteBody: { bytes: Uint8Array; mediaType: string } | null`
   beside `jsonBody` (at most one of them is set; both set is a caller's defect and throws) and
   `answerAs: 'text' | 'bytes'`. `AnsweredRequest` gains `contentType: string | null` and `bodyBytes: Uint8Array | null`
   (set only when `answerAs` is `bytes`; `bodyText` is then `''`). `OverseerStreamRequest` gains
   `lastEventId: string | null`, sent as the `Last-Event-ID` header when not null.
2. `ForgeClient`: extend `OVERSEER_ENDPOINTS` (`:53-60`) with `board`, `events`, `jobStream: 'jobs/{jobId}/stream'`,
   `profileStream: 'profiles/{profileRunId}/stream'`, `pictures`, `picture: 'pictures/{pictureId}'`. Build each path
   with the endpoint's version from `forgeEndpointVersionOf` and `endpointPathOf`. Add:
   - `boardOf(access)`: `ForgeDocumentAnswer` of `GET board`;
   - `followEvents(access, lastEventId, onEvent)`, `followJobStream(access, jobId, after, lastEventId, onEvent)`,
     `followProfileStream(access, profileRunId, after, lastEventId, onEvent)`: each a `ForgeStreamFollow` (Interfaces)
     that hands each whole event (`id`, `eventName`, `data` text) to `onEvent` and never an unfinished one; `after` goes
     into the query as `after=<value>` when not null. Generalise `followMonitor` (`:160-210`) into one private
     `followEventStream(access, path, lastEventId, onEvent)` that all four use;
   - `uploadPicture(access, bytes, mediaType)`: `ForgePictureUploadAnswer`;
   - `pictureOf(access, pictureId)`: `ForgePictureAnswer` with the bytes, the content type and the status;
   - `sendBoardCommand(access, body: JsonObject)`: `ForgeBoardCommandAnswer`, which keeps the forge's status
     (`200`, `423` for an install hold, any other for a refusal) and its parsed body, unlike `send`, which reads only
     `outcome` (`ForgeClient.ts:96-102`).
3. Raise `SUPPORTED_FORGE_VERSION` to the version WP6.1 set. The raise spans every minor from 1.1 on; each only adds, so
   Gaia's mappers pass the new keys over and only the recordings change. Re-record every forge recording at the new
   version, not only the board's.
4. The recording spec `overseer-fetch-board` starts a scratch forge through `src/testing/ScratchForge.ts` as
   Example Storefront, as `SupportedForgeRecording.ts` does, and records: the state with the token and without, on a
   board with tickets in several statuses, an open question with a recommendation, an incident with a notice, and a
   pipeline setup whose entities draft holds a standing refusal (so every served fact of N2 and N3 appears in one
   document at least); the events stream's handshake and first `board` event, and a reconnect with the first event's
   id as `Last-Event-ID`; the job stream of a product owner job the fake agent plays (start it with `intake-start`
   through `sendBoardCommand`, with one picture uploaded first); the profile stream of one gate profile run
   (`gate-profile-start`); a picture accepted, one refused as too large and one refused as no picture type, and the
   accepted picture read back; a command applied (`ticket-hold`), refused (`ticket-hold` of an unknown ticket, with its
   code, fields and sentence) and refused with `423` while launches are held for an install change, if the scratch
   forge can be brought into that state (as the existing `command-refused` situation is brought); an unknown kind.
   Every value the run draws is an example value, as the existing recordings do.
5. Run, in `apps/gaia/` of the package's worktree, for each forge recording, so the recording runs that worktree's
   forge and never the main checkout's:

   ```
   GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record <name>
   ```

**Specs.** `ForgeClient.spec.ts`: every new call against `RecordedAnswers` for each recorded situation; a stream hands
on only whole events; a closed or broken stream ends its follow with its ending; a call with no recorded answer fails;
the token is the bearer of every request and appears in no answer. `OverseerFetch` keeps its contract: a byte answer
keeps its content type.

**Done when.** At the root `bun install --frozen-lockfile` and `bun run verify` green, and Gaia's `check` does not
warn that the supported version is behind. In `apps/gaia/`: `bun test src/lib/forge-client` passes.

**Parallel.** Alone in `apps/gaia/src/`; WP6.4 and WP7.2 may run beside it.

### WP6.24 Gaia's board model and the board's ingestion

**Purpose.** Decision 51: Gaia maps each forge document into its own model at its boundary. This package ingests the
board document, every board event, the conversation streams' entries and a command's answer into a Gaia board model,
as Gaia ingests the monitor snapshot today (`MonitorSnapshotIngestion.ts`).

**Files.**

- Create `apps/gaia/src/shared/@types/board/`: `ForgeBoard.ts` (the board), `BoardTicket.ts`, `BoardJob.ts`,
  `BoardDecision.ts`, `BoardIncident.ts`, `BoardPipeline.ts` (pipeline, setup, flow and draft facts, entity ownership,
  refusals, line run times), `BoardFacts.ts` (attention, notices, warnings, today's figures, limits and defaults),
  `BoardTarget.ts` (the typed target), `BoardRefusal.ts` (code, fields, sentence), `BoardConversation.ts`
  (transcript entries and profile lines), `BoardEvent.ts` (one union of the event kinds, each with its data),
  `BoardVocabulary.ts` (Gaia's own unions of the forge's value lists).
- Create in `apps/gaia/src/adapters/forge-api/`: `BoardStateIngestion.ts`, `BoardEventIngestion.ts`,
  `ConversationIngestion.ts`, `CommandAnswerIngestion.ts`, each with a spec; `utils/BoardMapUtil.ts`,
  `utils/PipelineMapUtil.ts`, `utils/VocabularyMapUtil.ts`, each with a spec.
- Create `apps/gaia/src/adapters/forge-api/testing/BoardDocuments.ts`: board documents taken from the
  `overseer-fetch-board` recording, for the specs.
- Change `apps/gaia/docs/contracts.md` (the forge contracts Gaia reads) and `docs/architecture.md` (the board model).

**What to do.**

1. Inventory the reads. For each document of N1, list the fields a Bridge view or view model reads (`grep` each field
   name over `apps/forge/bridge/{shell,views,utils,conversation,chips}`, shipping files). The board model holds those
   fields and the served facts of N2 and N3, under Gaia's names where Gaia's names differ, and nothing else. Record
   the inventory as the ingestion's shapes, so a field leaves the model only by a shape change a spec sees.
2. `BoardStateIngestion.boardOf(trackerId, body)` follows `MonitorSnapshotIngestion`, without its version key: the
   board document carries none, since its version is the `board` endpoint's, which Gaia derives from forge's registry
   at the supported forge version (Gaia rule 3). Check the keys Gaia reads with `DocumentShapeUtil`, each shape typed
   `as const satisfies ShapeOf<forge document>` against the `forge-contracts` type, and map to `ForgeBoard`. A malformed
   document maps to `null` with its reason, as the monitor's does. A key Gaia does not read is passed over.
3. Value lists: `VocabularyMapUtil` maps each forge union Gaia reads (ticket status, priority, type and size, display
   state, task phase and status, ticket stage, draft state, job state, gate phase, the role lists, agent effort, the
   history entries the pipeline view shows) through a record typed `Record<forge value, Gaia value>`, so a value forge
   adds is a compile error here and nowhere else. The shapes check each value with `oneOf` over the record's keys.
4. The served facts map as served: the typed target becomes `BoardTarget` (`{ subject, id }` in Gaia's union);
   notices and warnings keep their kind, their facts, the forge's sentence and its cause sentence; refusals keep their
   code, their fields and the forge's sentence (`BoardRefusal`), entity refusals also their row and their fix; open
   decisions keep their answering order; an option keeps its unmarked label and its `recommended` flag; `today` keeps
   its `calendarDate`; each step run time keeps its entity, kind, name, phase, time and ending.
5. `BoardEventIngestion.eventOf(eventName, data)` maps each of the eight event kinds (`board`, `job`, `decision`,
   `incident`, `overseer`, `usage`, `profile`, `pipeline`) to `BoardEvent`, with the same shapes as the state for the
   documents they carry; an unknown event name maps to `null` and is passed over.
6. `ConversationIngestion` maps the job stream's `history` and `message` data and the profile stream's `line` data.
   `CommandAnswerIngestion` maps the forge's command answer: `applied` (outcome `done` or `nothing-to-do`, the result),
   `refused` (status 409, `{ refusal, fields, text }` into a `BoardRefusal`), `install-held` (status `423`, with its
   refusal).
7. Gaia keeps no ticket of its own (decision 47): the model is the last document read, held per forge, never written
   back to a forge or a file.

**Specs.** For each ingestion, on the recorded documents: every served fact of N2 and N3 maps to its model field; a
missing read key is malformed and names the key; an unknown key is passed over; a value outside a vocabulary record is
malformed. `VocabularyMapUtil.spec.ts`: one case per union, and the record covers
every forge value (a compile-time fact, proved by a planted extra value in a spec's own record). The refusal of the
recorded `ticket-hold` maps with its code, its fields and the forge's sentence unchanged.

**Done when.** At the root green. In `apps/gaia/`: `bun test src/adapters/forge-api src/shared` passes.

**Parallel.** Alone in `apps/gaia/src/`; WP6.4 and WP7.2 may run beside it.

### WP6.25 The page's board contract, its map, and Gaia's board commands

**Purpose.** Decision 51: Gaia serves its page a contract of its own, and the page imports no `forge-contracts` type.
This package declares the board's page contract, maps the board model out to it as `FleetDocumentMapUtil` maps the
fleet, and declares the commands the page sends, which the server maps into the forge's commands.

**Files.**

- Create `apps/gaia/page/@types/board/`: `BoardDocument.ts` (the board as the page reads it, with every served fact),
  `BoardEventDocument.ts`, `ConversationDocument.ts`, `BoardVocabulary.ts` (Gaia's unions and the ordered lists the
  views iterate: `BOARD_GATE_PHASES`, `BOARD_PIPELINE_AGENT_ROLES`, `BOARD_FORGE_LEVEL_AGENT_ROLES`,
  `BOARD_AGENT_EFFORTS`), `BoardCommandDocument.ts`, `BoardRelayDocuments.ts` (the relay's answers and refusals,
  Interfaces).
- Create `apps/gaia/src/adapters/page-api/BoardDocumentMapUtil.ts` and spec: the board model, each event and each
  conversation entry to the page contract.
- Create `apps/gaia/src/shared/@types/board/BoardCommand.ts`, `apps/gaia/src/adapters/page-api/BoardCommandIngestion.ts`
  and spec (the page's command into the model, as `GaiaCommandIngestion`), and
  `apps/gaia/src/adapters/forge-api/BoardCommandMapUtil.ts` and spec (the model's command to the contract's
  `ForgeControlCommand | ForgeBoardCommand`).
- Change `apps/gaia/src/shared/constants/ContractVersions.ts`: `gaiaBoard: 1`, `gaiaBoardCommand: 1`, in the page half
  WP6.4 splits off when it has landed; `apps/gaia/docs/contracts.md` (the versioned contracts table, held against
  `CONTRACT_VERSIONS` by a spec).

**What to do.**

1. The page contract follows the inventory of WP6.24: one type per document the views read, field for field what the
   views read, under Gaia's names and Gaia's unions. It imports only from `page/@types/` and the shared files the page
   project names. `BoardDocument` carries `boardVersion: typeof CONTRACT_VERSIONS.gaiaBoard`; each event document
   carries the same key, as the fleet's event carries `fleetVersion`.
2. A served target stays `{ subject, id }` in Gaia's union, and the page's `BoardRouter` turns it into a route; a
   refusal becomes
   `{ refusedBy: 'forge'; code; fields; text }` with the forge's sentence in `text`, unchanged (decision 45); a notice
   or a warning keeps its kind and the forge's sentence, reworded by kind through `ForgeSentenceUtil` only when it
   names a command (Gaia rule 4).
3. `BoardCommandDocument` declares every kind a board view sends, with Gaia's payloads: the 34 board kinds of N4, the
   control kinds the board sends, `interrupted-work-resume`, and `pipeline-draft-edit` with Gaia's typed draft edit
   (N3). Each kind keeps the forge's kind name, so a view reads as the Bridge's; its payload is Gaia's own type.
   `boardCommandVersion: typeof CONTRACT_VERSIONS.gaiaBoardCommand` on every command.
4. `BoardCommandIngestion.commandOf(body)` checks the version, the kind and each field, and answers a `BoardCommand`
   or a refusal (`malformed-body`, `unknown-kind`); `BoardCommandMapUtil.contractCommandOf(command)` maps each kind
   through a table typed `satisfies Record<BoardCommand['kind'], ...>`, every target kind a member of
   `FORGE_CONTROL_COMMAND_KINDS` (WP6.1).
5. No view applies a command before the forge answers: the contract has no optimistic state, and one gesture is in
   flight at a time, as the Bridge's `ControlCommandSender` holds today.

**Specs.** `BoardDocumentMapUtil.spec.ts`: on the model built from the recorded documents, every served fact reaches
its page field; a refusal's text equals the forge's sentence byte for byte; a notice that names a command leaves in
Gaia's words. `BoardCommandIngestion.spec.ts`: each kind with a valid body becomes its model command; a missing field,
a wrong type and an unknown kind are refused. `BoardCommandMapUtil.spec.ts`: each kind maps to the contract's command
of the same kind; a typed draft edit maps to the contract's typed edit. A spec holds `CONTRACT_VERSIONS` against the
contracts table.

**Done when.** At the root green. In `apps/gaia/`: `bun test src/adapters/page-api src/adapters/forge-api` passes.

**Parallel.** Alone in `apps/gaia/src/`; WP6.4 and WP7.2 may run beside it.

### WP6.3 Gaia's server relays a forge's board to the page, in Gaia's contract

**Purpose.** The page reads a forge and sends its commands only through Gaia's server (decision 19, Gaia rule 6:
tokens stay in the server), and reads only Gaia's board contract (decision 51).

**Files.**

- Create `apps/gaia/src/features/page-server/ForgeAccess.ts` and spec: from a tracker id to `OverseerAccess` or a
  refusal, generalised from `frameSessionVerdictFor` (`FrameSessionRoute.ts:88-98`): the registry entry, the watch's
  reading at the same address, a forge version verdict of `current` or `ahead`, and the token file read.
- Change `apps/gaia/src/features/page-server/routes/FrameSessionRoute.ts` to use it (deleted in WP6.23).
- Create `apps/gaia/src/features/page-server/routes/BoardStateRoute.ts`, `BoardStreamRoutes.ts`,
  `BoardPictureRoutes.ts`, `BoardCommandRoute.ts`, each with a spec.
- Create `apps/gaia/src/features/page-server/BoardStreams.ts` and spec: the set of open relayed streams, each with its
  upstream follow, closed together at the server's stop.
- Change `apps/gaia/src/features/page-server/PageServer.ts` and `PageServer.spec.ts`: the routes, a per-route body
  bound, Bun's `maxRequestBodySize` raised to the picture bound.
- Create `apps/gaia/src/lib/local-http-guards/BoundedBody.ts` and spec: reads a body to a bound, as the forge's
  `boundedBodyOf` (`OverseerServer.ts:254-276`).
- Change `apps/gaia/src/adapters/page-api/ForgeSentenceUtil.ts` and its specs: its refusal table goes (step 5).
- Change `apps/gaia/src/shared/constants/GaiaSystemVersions.ts`, `GaiaCompatibilityRegistry.ts`,
  `ContractVersions.ts`, and `apps/gaia/docs/contracts.md` ("Gaia's endpoints", "Versioned contracts"),
  `apps/gaia/docs/architecture.md`.
- Change `apps/gaia/src/Main.ts` where it wires `PageServerOptions`.

**What to do.**

1. `ForgeAccess.forgeAccessVerdictFor(trackerId, sources)` answers
   `{ verdict: 'access'; access: OverseerAccess; forgeSystemVersion }` or a refusal (Interfaces). It reads the
   registry and the token file at each call, never caches a token, and never puts it into an answer or a log line.
2. Routes, each `access: 'session-or-token'`, each matched by a function as the frame session route is
   (`PageServer.ts:189-196`), each at version 1 under a new key of `GAIA_ENDPOINT_VERSIONS`:
   - `GET /api/v1/forges/{trackerId}/board` (`forgeBoard`): the forge's board read, ingested (WP6.24) and mapped to
     `BoardDocument` (WP6.25), with `cache-control: no-store`; a document that does not ingest answers
     `forge-document-unreadable` with its reason;
   - `GET .../board/events` (`forgeBoardEvents`), `GET .../jobs/{jobId}/stream` (`forgeJobStream`),
     `GET .../profiles/{profileRunId}/stream` (`forgeProfileStream`): an event stream that opens with Gaia's
     `handshake` event (`BoardStreamHandshakeDocument`, Interfaces), then emits each forge event, ingested and mapped,
     under its event name and with the forge's `id` unchanged; an event that does not ingest is dropped and counted in
     Gaia's log, never forwarded raw. It drops the forge's own `handshake` after checking it names the version the
     watch read. It forwards the page's `Last-Event-ID` and the `after` query to the forge, writes Gaia's heartbeat as
     the fleet stream does (`src/lib/event-stream/ServedEventStream.ts`), ends the page's stream when the forge's ends,
     and stops the forge's follow when the page closes. `isStream: true` for all three;
   - `POST .../pictures` (`forgePictureUpload`): the raw body, read to `BOARD_PICTURE_UPLOAD_LIMIT_BYTES`, forwarded
     with its content type; answered as `PictureUploadAnswerDocument`;
   - `GET .../pictures/{pictureId}` (`forgePicture`): the bytes with the forge's content type,
     `x-content-type-options: nosniff`, `content-security-policy: sandbox`, `cache-control: no-store`;
   - `POST .../commands` (`forgeCommands`): a `BoardCommandDocument` read to 65,536 bytes, ingested
     (`BoardCommandIngestion`), mapped (`BoardCommandMapUtil`), sent with `sendBoardCommand`, the forge's answer
     ingested (`CommandAnswerIngestion`) and answered as `BoardCommandAnswerDocument`.
3. A route's body bound: add `maximumBodyBytes` to `PageServerRoute` (`PageServer.ts:70-83`), 65,536 for every route
   but the picture upload. Set Bun's `maxRequestBodySize` (`:254`) to `BOARD_PICTURE_UPLOAD_LIMIT_BYTES`, and have the
   commands route (`CommandsRoute.ts:27`) and the session route read through `BoundedBody` so they keep their bound.
4. The board's map runs once per forge event for every open page stream of that forge: map each event once and hand
   the mapped document to every stream of the same forge (`BoardStreams` keys streams by tracker id).
5. A forge refusal reaches the page as the forge's sentence (decision 45). Remove `REFUSAL_SENTENCES`
   (`ForgeSentenceUtil.ts:17-24`) and its use for refusals in `PageAnswerMapUtil.ts` and `FleetDocumentMapUtil.ts`:
   a refusal of Gaia's own commands that the forge or its program answers also shows the forge's sentence. Notices,
   warnings, activity and the registry's last command keep their rewording (Gaia rule 4).
6. Raise `GAIA_SYSTEM_VERSION` by one minor (only adds). Add the seven keys to `GAIA_ENDPOINT_VERSIONS` and their
   entries to `GAIA_COMPATIBILITY_REGISTRY`. Add `gaiaBoardStream`, `gaiaBoardCommandAnswer` and
   `gaiaPictureUploadAnswer` at 1 to `CONTRACT_VERSIONS` and to the contracts table.

**Specs.** Each route spec runs on `RecordedAnswers` (`overseer-fetch-board`) and `ManualTimers`: the board answers
the mapped page document; an unregistered tracker id is `forge-not-registered`; an unreachable forge, a forge at a
version Gaia cannot talk to, an unreadable token file and a refused token are each their refusal; a stream opens with
Gaia's handshake, forwards `Last-Event-ID`, re-emits ids and names unchanged with mapped data, ends when the forge's
stream ends, and closes the forge's follow when the page goes; two page streams of one forge map each event once; the
upload refuses a body over the bound without reading it; the command route refuses an unknown kind and a malformed
body without calling the forge, and a forge refusal answers with the forge's sentence unchanged; no answer and no log
line holds the token. `PageServer.spec.ts`: each route at its versioned and unversioned path behind the session guard;
a body of 65,537 bytes is refused on the commands route and accepted on the picture route; the server's stop closes
every open relay stream. `ForgeSentenceUtil.spec.ts` and its recorded-sentences spec: no refusal is reworded.

**Done when.** At the root green. In `apps/gaia/`: `bun test src/features/page-server src/adapters/page-api
src/lib/local-http-guards` passes, and `src/WholeFlow.spec.ts` passes.

**Parallel.** Alone in `apps/gaia/src/`; WP6.4 and WP7.2 may run beside it.

### WP6.4 Gaia's page gets a home for the board: dependencies, guards and rules

**Purpose.** Prepare `apps/gaia/page/board/` so every later package only adds files: the dependency on `flint`, the
compiler and lint setup, the import-direction and style guards, a page that reaches no `forge-contracts`, and the rules
the move changes. The rule files change with this code (decision 34); no approval gate stands before them.

**Files.**

- Change `apps/gaia/package.json`: add `"flint": "workspace:^"`. Run `bun install` at the root; commit `bun.lock`.
- Change `apps/gaia/page/tsconfig.json` and `page/tsconfig.spec.json`: include `./board/**`; the spec project includes
  `.dom.tsx`; the shared file list names `../src/shared/constants/PageContractVersions.ts` in place of
  `ContractVersions.ts`.
- Split `apps/gaia/src/shared/constants/ContractVersions.ts`: create `PageContractVersions.ts` with the versions of the
  contracts Gaia serves its page (`gaiaFleetDocument`, `gaiaCommand`, `gaiaCommandAnswer`, `gaiaFrameSession`,
  `gaiaHealth`, and later the board's), importing nothing; `ContractVersions.ts` keeps the forge's and the stored
  files' and re-exports nothing (no barrels). Change the page modules that import `CONTRACT_VERSIONS`
  (`page/@types/FleetDocument.ts`, `FrameSessionDocument.ts`, `CommandDocument.ts`,
  `page/shared/utils/ForgeContractUtil.ts`, `page/api/CommandSender.ts`, `page/api/FleetStreamClient.ts`,
  `page/views/forge-frame/EmbedChannel.ts`, `FrameSessionRequest.ts`) and the server modules that read a page
  contract's version.
- Change `apps/gaia/page/PageImportDirection.spec.ts`: `board` (step 2) and the `forge-contracts` rule (step 3).
- Change `apps/gaia/page/StyleContract.spec.ts`: a board section (step 4).
- Create no stylesheet yet: the first package that copies a style rule creates `apps/gaia/page/styles/board/tokens.css`
  and links it in `apps/gaia/page/index.html` after `./styles/gaia.css` (the transplant procedure, step 7).
- Change `apps/gaia/eslint.config.js`: browser storage confined (step 5).
- Change `apps/gaia/CLAUDE.md`: rules 4, 10, 11 and 12, the map and the boundaries table (step 6).
- Change `.claude/rules/flint.md` and the root `CLAUDE.md` (step 7).

**What to do.**

1. Add the dependency, `bun install`, and prove `src/WorkspaceDependencies.spec.ts` accepts it.
2. Add `board` to the page's tsconfig include and to the import-direction guard: `FORBIDDEN_IMPORTS` gains
   `board: ['shell', 'views']` (`views` may import `board`), with a planted case for `board → shell` and
   `board → views`, proved failing then passing.
3. The guard also reads every module the page project compiles, the shared files its tsconfig names among them, and
   refuses an import specifier that starts with `forge-contracts` or names a path under `apps/forge/`. Until WP6.23
   deletes it, `page/views/forge-frame/EmbedChannel.ts` is the one listed exception, named in the spec with that
   reason. Plant a case of each and prove it fails.
4. The board section of the style contract reads every stylesheet in a list `BOARD_STYLESHEETS` (initially empty; the
   planted cases prove each guard until real stylesheets arrive) and holds, as the Bridge's guards do for the Bridge:
   every class a shipping component under `page/board/` emits is styled in a board stylesheet and every styled class is
   emitted (`apps/forge/bridge/StyleContract.spec.ts`); no `:hover` or `:active` rule moves or resizes anything
   (`apps/forge/bridge/HoverMovesNothing.spec.ts`); a `prefers-reduced-motion: reduce` rule stops each animation
   (`ReducedMotionStopsEveryAnimation.spec.ts`); braces balance (`StyleBraceBalance.spec.ts`); every token read is
   defined in the design system's, Gaia's or the board's `tokens.css`, each board colour token has a light and a dark
   value (`ThemeTokens.spec.ts`); no colour literal; no board class is `gaia-` and no Gaia class is `board-`; a
   `@keyframes` is named `board-` and appears only in a board stylesheet. Plant one case of each and prove it fails.
5. `eslint.config.js`: `localStorage` and `sessionStorage` only in `page/board/preferences/PreferenceStore.ts`,
   `page/shell/ThemeBootstrap.ts` and `page/api/FleetStreamClient.ts` (the two that use it today).
6. `apps/gaia/CLAUDE.md`:
   - rule 4: a forge refusal reads as the forge's own sentence, the one its command line prints (decision 45); a
     notice, a warning or another forge sentence that names a command still leaves the server in Gaia's words;
   - rule 10: the board's views under `page/board/` keep their behaviour in `.dom.tsx` specs, which `bun run test:dom`
     runs with a document, and `page/board/` is styled by `page/styles/board/*.css` under the board section of the
     style contract;
   - rule 11: `flint` is a dependency at `workspace:^`, imported by its export names from `page/board/` only;
   - rule 12: Gaia draws Flint only in the forge route, one per forge, with no brain;
   - the map: `page/board/`, `page/@types/board/` and `src/shared/@types/board/`; the page imports no
     `forge-contracts` and reads its own contract versions from `PageContractVersions.ts`;
   - the boundaries table names `page/board/api/` for the relay and keeps the Notification API row for WP6.8.
7. `.claude/rules/flint.md:14-16`: Gaia's `package.json` declares the dependency too, and Gaia's page imports Flint only
   by its exported names from `page/board/`, held by `PageImportDirection.spec.ts`. The root `CLAUDE.md`:
   `packages/flint` is both apps' until stage 8 folds it into Gaia's page (decision 52), and Gaia's tracker's reach
   names `/packages/flint`.

**Specs.** The planted cases of steps 2 to 4; the existing page specs pass with `PageContractVersions`.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/PageImportDirection.spec.ts page/StyleContract.spec.ts
src/WorkspaceDependencies.spec.ts` passes.

**Parallel.** May run beside WP6.2, WP6.24, WP6.25 and WP6.3.

### WP6.5 The board's connection: relay clients, the command sender, preferences and the DOM runner

**Purpose.** The page reads and commands one forge through the relay, with Gaia's session, in Gaia's board contract.

**Files.** Under `apps/gaia/page/board/` unless stated.

- Create `api/BoardApiPaths.ts`: each relay path from `ApiPathUtil` and `GAIA_ENDPOINT_VERSIONS` (both already in the
  page project).
- Create from the Bridge, rewritten for the relay and typed against `page/@types/board/`:
  `api/BoardEventStreamClient.ts` (from `bridge/api/EventStreamClient.ts`), `api/BoardCommandClient.ts` (from
  `CommandClient.ts`), `api/PictureUploadClient.ts`, `api/TranscriptStreamClient.ts`, `api/ProfileStreamClient.ts`,
  `api/RefusalOf.ts`, `api/constants/StreamReopening.ts`, `api/constants/HttpStatus.ts`, each with its spec adapted.
- Create `@types/BoardServices.ts` (Interfaces).
- Transplant `shell/ControlCommandSender.ts` (+ `.dom.tsx`), `shell/CommandButton.tsx`, `shell/ControlAvailability.ts`,
  `shell/BoardStateUpdate.ts` (+ spec), `shell/BridgeClock.ts` as `shell/BoardClock.ts`.
- Transplant `preferences/PreferenceStore.ts` (+ spec), keyed `<gaia>:board:<trackerId>:<choice>` with `gaia` from
  Gaia's `PRODUCT_NAMES.programName`; the shared theme store is not moved (the theme is Gaia's).
- Create `apps/gaia/page/testing/RunDomSpecs.ts` and `apps/gaia/page/testing/HappyDom.ts`, copied from
  `apps/forge/bridge/testing/`, with the pattern `page/board/**/*.dom.tsx` and the preloads
  `./src/testing/TestRunPreload.ts` and `./page/testing/HappyDom.ts`.
- Change `apps/gaia/package.json`: `"test:dom": "bun page/testing/RunDomSpecs.ts"`, and `verify` runs it after
  `bun test`.

**What to do.**

1. `BoardEventStreamClient.open(trackerId, handlers)` opens one `EventSource` on the relay's board events, listens to
   `handshake` and to the board's event kinds (Gaia's list in `page/@types/board/BoardEventDocument.ts`). It refuses a
   handshake whose `boardStreamVersion` is not `CONTRACT_VERSIONS.gaiaBoardStream`, and an event whose `boardVersion`
   is not `gaiaBoard`, by closing and reporting `down`. A closed stream asks Gaia's session standing as Gaia's fleet
   stream does (`page/api/FleetStreamClient.ts`) and reports `no-session` or `down`; on `no-session` it calls the same
   `sessionWasLost` the fleet stream's command sender calls (`page/Main.tsx`), so one session banner shows.
2. `BoardCommandClient.send(command: BoardCommandDocument)` posts to the relay's commands route and maps
   `BoardCommandAnswerDocument` to the Bridge's `CommandOutcome` (`bridge/api/CommandClient.ts:14-22`): `applied`,
   `refused` (with the forge's sentence), `install-held`, `unreachable`, `outcome-unknown`, `no-session` (a 401 from
   Gaia). It holds no token.
3. `PictureUploadClient.upload(file)` posts the bytes to the relay with the file's type; `TranscriptStreamClient` and
   `ProfileStreamClient` keep their cursor rules and point at the relay.
4. The pictures' served address (`PictureAttachmentsModel.ts:48`, `:127-128`) becomes the relay's
   `forges/<trackerId>/pictures/<pictureId>` (done in WP7.1, where the file moves).
5. No preference of the Bridge is read or carried over: the keys are new and start empty.
6. The runner fails when it finds no DOM spec; `ControlCommandSender.dom.tsx` is the first.

**Specs.** The adapted client specs prove each relay path and version, the handshake and version checks, session loss,
each outcome mapping, and that no request carries an `Authorization` header. `ControlCommandSender.dom.tsx` as in the
Bridge: a control is disabled while the stream is down, launches are held or a gesture is in flight, and shows the
forge's refusal sentence verbatim. The `PreferenceStore` spec: keys are per tracker id under Gaia's prefix.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/board/api page/board/shell page/board/preferences` and
`bun run test:dom` pass.

**Parallel.** Alone.

### WP6.6 Shared board parts: utils, chips, sandboxed HTML and the conversation

**Purpose.** Move what several views use, rewired to Gaia's contract and the served facts, so each view package moves
only its own folder.

**Files.** Transplant into `apps/gaia/page/board/`: the view models `@types/DependencyGraph.ts` and `@types/Timeline.ts`
(not `FlintBrainBoardState.ts`, the brain's; not `OverseerIdentity.ts`, since `BoardApp` fetches no identity; not the
seven board documents, which Gaia's contract replaces). Also `utils/` (all 40 files, `EntityGroupUtil.ts` among them),
`chips/` (all 9), `sandboxed-html/` (all 3), `conversation/` (all 26), `views/ViewTitle.tsx` and its DOM spec, and from
`testing/`: `BoardStateFixture.ts`, `TimestampSlicesFixture.ts`, `FakeControls.ts`, `FakeControlSurroundings.ts`,
`PageLimitsFixture.ts`, `WaitingOnUserFixture.ts`, `StyleRuleReader.ts`, `PageStylesheets.ts` (rewritten to read
`page/styles/board/`). Create `apps/gaia/page/shared/constants/TimeUnits.ts` (`MILLISECONDS_PER_MINUTE` and the units
`StampTextUtil.ts:9-10` defines for itself, which it then imports). Styles of chips, conversation and sandboxed HTML
into `page/styles/board/chips.css`, `conversation.css`, `sandboxed-html.css`.

**What to do.**

1. Follow the transplant procedure. The value imports of this package and what they become:
   - `utils/DependencyGraphUtil.ts:6-7`: the status set and `TicketDefaultsUtil` become the served
     `settlesADependency` flag and resolved priority of each ticket;
   - `utils/EpicRollupUtil.ts:8`: `CountTextUtil.shortCountTextOf`;
   - `utils/GeometryUtil.ts:7`, `utils/TimeUtil.ts:8`: `TimeUnits.MILLISECONDS_PER_MINUTE`;
   - `utils/IncidentTrailUtil.ts:7`: the served notice sentence of each incident default;
   - `sandboxed-html/SandboxedHtmlDocument.ts:5`: the `srcdoc` document is built through the DOM
     (`document.implementation.createHTMLDocument`, attributes set with `setAttribute`, read back as
     `documentElement.outerHTML`), so no escape util is needed;
   - the fixtures take Gaia's own values for `LIMITS`, `TIME_UNITS` and `TIMESTAMP_SLICES`, and build board documents
     of Gaia's page contract.
2. `SandboxedHtmlFrame` takes the stylesheet addresses from the page's own `<link rel="stylesheet">` elements at run
   time, never from a constant, since Gaia's built page names its files by hash (`PageFilesRoute.ts:1-6`).
3. `utils/StateToneUtil.ts` stays the one map from a display state and a job state to a tone
   (`.claude/rules/design-system.md:27-29`), keyed by Gaia's unions.
4. `conversation/ChatThreadModel.ts`, `Composer.tsx`, `DecisionCard.tsx`, `AskItem.tsx` are the parts both
   conversations (WP7.1, WP6.20) and the questions (WP6.10) use; they keep their behaviour, typed against
   `ConversationDocument`.

**Specs.** Every moved plain spec and the 6 DOM specs (`chips/FilterChipGroup.dom.tsx`, `conversation/AskItem.dom.tsx`,
`ChatThread.dom.tsx`, `Composer.dom.tsx`, `ToolUseFold.dom.tsx`, `views/ViewTitle.dom.tsx`) pass in Gaia; one new case
in `SandboxedHtmlDocument.spec.ts`: a title with `<`, `&` and `"` reaches the frame as text.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/board` and `bun run test:dom` pass, and
`grep -rn "src/" page/board` prints no import.

**Parallel.** Alone.

### WP6.7 Flint in the forge route

**Purpose.** Flint, the sprite, moves with the views and shows only inside a forge's board, one per forge, with no
brain (decision 25).

**Files.** Transplant `apps/forge/bridge/flint/` into `apps/gaia/page/board/flint/` except `FlintBrainControls.ts`,
`FlintBrainDirector.ts`, `FlintBrainDirector.spec.ts`; `BridgeFlint.tsx` becomes `BoardFlint.tsx` without its
`flintBrain` prop and its brain director; `BridgeFlint.dom.tsx` and `UseBoardOccasions.dom.tsx` lose their brain cases.
`testing/FlintHabitatScene.ts` (with Gaia's `PRODUCT_NAMES`) and `testing/ManualFlintFrames.ts` into
`page/board/testing/`. Styles into `page/styles/board/flint.css`, and the `--flint-*` properties into
`page/styles/board/tokens.css` as the Bridge sets them (`apps/forge/CLAUDE.md:352`).

**What to do.** The transplant procedure. Flint's storage port writes through the board's `PreferenceStore`. A second
Flint on one document is refused by the package (`.claude/rules/flint.md:25`): `BoardFlint` mounts once per forge
route, and the route unmounts it before another forge's board mounts (WP6.9 keys the board root by tracker id).

**Specs.** The moved specs, among them `FlintSlotHabitat.dom.tsx`, `VisitTargetTracker.dom.tsx`,
`UseHabitatHappenings.dom.tsx`; a new case in `BoardFlint.dom.tsx`: no brain part is drawn and no brain request is made.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/` passes.

**Parallel.** Alone.

### WP6.8 The board shell's parts

**Purpose.** Move the parts every tab stands in: the header with its figures, tabs and setup stepper, the activity
strip, the banners, the incident notice, the waiting-on-user inbox and pill, the finished-work filter, detail routing,
change highlights and item presence, each reading the served facts. Unrouted until WP6.9.

**Files.** Transplant from `apps/forge/bridge/shell/`: `ActivityStrip.tsx`, `ActivityStripModel.ts`,
`ChangeHighlight.ts`, `ChangedSinceMount.ts`, `ConnectionBanners.tsx`, `CoveringPanel.ts`, `DetailRoute.ts`,
`DetailRouting.ts`, `FinishedWorkFilter.tsx`, `FinishedWorkWindow.ts`, `Header.tsx`, `HeaderModel.ts`,
`IncidentNotice.tsx`, `IncidentNoticeModel.ts`, `ItemPresence.ts`, `NarrowWindowPlacement.ts`,
`QuestionPanelOpener.ts`, `SetupStepBar.tsx`, `WaitingOnUserInbox.tsx`, `WaitingOnUserModel.ts`,
`WaitingOnUserPill.tsx`, `BridgeErrorBoundary.tsx` (as `BoardErrorBoundary.tsx`), `HashRouter.ts` (as
`BoardRouter.ts`: only `BOARD_TABS`, `routeOf`, `fragmentOf`, `shownTabsOf`, `shownRouteOf`, and `routeOfTarget` from a
served target; no `window.location`), with their specs and DOM specs. The view models the header reads, into their
future folders: `views/agents/AgentsModel.ts`, `views/agents/AgentJobDocument.ts`,
`views/pipeline/PipelineViewModel.ts`, `views/pipeline/live/MinimalPipelineNoteModel.ts`,
`views/questions/QuestionAlerts.ts`, `views/questions/QuestionsModel.ts`,
`views/questions/NotificationAllowanceControl.tsx`, with their specs.
`PipelineViewModel.ts` also reaches `views/pipeline/entities/PipelineLevelModel.ts`, `live/EntityWorkModel.ts`,
`live/FlowActivityPanelModel.ts`, `flow/PipelineFlowModel.ts`, `flow/PipelinePhaseModel.ts`,
`gates/GateCacheMarkModel.ts` and `views/pipeline/PipelinePanel.tsx` (a component, imported for its `PanelStatus`
type): move them here too, with their specs (`PipelineViewModel.levels.spec.ts` and one `*.spec.ts` beside each model).
Create `apps/gaia/page/notifications/NotificationBoundary.ts`, the one module that reaches the Notification API, and
route `QuestionAlerts.browserQuestionNotifier()` through it. Styles into `page/styles/board/shell.css`;
`PipelinePanel.tsx`'s rules (`bridge-pipeline-panel*`) into `page/styles/board/pipeline.css`, which this package
creates, links and lists in the style contract, and WP6.20 completes.

**What to do.**

1. The transplant procedure. Not moved: `FirstPaint.ts`, `ThemeBootstrap.ts`, `ThemeButton.tsx`, `EmbeddedChannel.ts`,
   `VersionedEmbedChannel.ts`, `SessionBannerOf.ts` (Gaia's own connection banner shows a lost session), and
   `DetailPanelHost.tsx` (WP6.12).
2. The value imports of this package and what they become:
   - `shell/HeaderModel.ts:11-14`: today's figures, notices and warnings are the served ones; token counts through
     `CountTextUtil`;
   - `shell/WaitingOnUserModel.ts:7`, `:71`: the served attention entries, each item's route from its typed target
     through `BoardRouter.routeOfTarget`;
   - `shell/IncidentNoticeModel.ts:6`: the served notice sentence;
   - `shell/DetailRoute.ts:7`, `shell/HashRouter.ts:9`: `BoardRouter` reads and writes Gaia's board route, with no
     Bridge fragment;
   - `views/questions/QuestionsModel.ts:5-6`: the served open decisions in answering order and the served notices;
   - `views/agents/AgentsModel.ts:11`, `:13`: `CountTextUtil`, and the served concurrency bounds;
   - `views/pipeline/flow/PipelineFlowModel.ts:20`: the served rework threshold;
   - `views/pipeline/live/EntityWorkModel.ts:11`: the served `isClosed` and `noAgentHasPickedItUp` flags.
3. The header's Overseer controls (stop, restart) are not drawn in Gaia: Gaia's forge bar offers the forge's controls
   through Gaia's own commands. Remove them from `Header.tsx` and its model in Gaia, with their specs.
4. `ConnectionBanners` drops the session banner; Gaia's `ConnectionBanner` (`page/shell/ConnectionBanner.tsx`) shows a
   lost session for the whole page.
5. Add `apps/gaia/CLAUDE.md`'s boundaries row for the Notification API: `page/notifications/NotificationBoundary.ts`.

**Specs.** The moved specs, among them `Header.dom.tsx`, `IncidentNotice.dom.tsx`, `ItemPresence.dom.tsx`,
`FinishedWorkFilter.dom.tsx`, `ChangedSinceMount.dom.tsx`, minus the cases of the removed controls and banner, each fed
the served facts in place of the inputs a forge rule took; new cases: the header shows the served today's figures as
served; a waiting-on-user item routes to the tab and item of its served target; `PipelineFlowModel.spec.ts` reads the
served rework threshold. `NotificationBoundary` gets no real-system spec (no spec opens a page); its users are specced
with a fake notifier.

**Done when.** At the root green; `bun test page/board/shell page/board/views` and `bun run test:dom` in `apps/gaia/`.

**Parallel.** Alone.

### WP6.9 The forge route: the board at full size, a tab of its own, the frame for unmoved tabs

**Purpose.** One forge maximized as a route of Gaia (decision 27), the only way to open a board (decision 43). Tabs
that have moved are Gaia's own; tabs that have not yet moved still show in the frame, with the Bridge's head hidden, so
nothing the user has today is lost while the views move.

**Files.**

- Create `apps/gaia/page/board/shell/BoardApp.tsx` and `BoardApp.dom.tsx` (from `bridge/shell/BridgeApp.tsx` and its
  DOM spec), `apps/gaia/page/board/shell/BoardTabViews.tsx` (the table of moved tabs), `apps/gaia/page/board/Board.tsx`
  (the root a view mounts: services for one tracker id, keyed by it).
- Change `apps/gaia/page/shared/HashRouter.ts` and its spec: `GaiaRoute`'s `forge` view (Interfaces).
- Change `apps/gaia/page/views/forge-frame/` (`ForgeFrameView.tsx`, `ForgeFrameModel.ts`, `ForgeFrameLayout.tsx`,
  `ForgeFrameSession.ts` and specs): the forge view draws Gaia's bar, then `Board` for a moved tab or the frame for an
  unmoved one. Rename the folder to `apps/gaia/page/views/forge/` in this package.
- Change `apps/gaia/page/shell/GaiaApp.tsx`, `RailModel.ts:75`, `views/attention/AttentionModel.ts:236-237`,
  `views/activity/ActivityModel.ts:190`, `views/agents/AgentsModel.ts:185-186`, `views/agents/BrainModel.ts:171`,
  `shared/utils/ForgeContractUtil.ts` (`canOpenInPlace`), and their specs; on the server,
  `src/adapters/forge-api/utils/ForgeReadingMapUtil.ts` and `src/adapters/page-api/FleetDocumentMapUtil.ts` map the
  monitor's `route` fragments (`#<tab>[/<item>]`, Bridge fragments until stage 8) into the fleet document's board
  routes, with `fleetVersion` raised.
- Change `apps/forge/bridge/styles/board.css:576-579`: in frame mode hide the Bridge's whole head
  (`.bridge-head` and the banners above it), and `apps/forge/bridge/StyleContract.spec.ts` if a class is newly read.
- Change `apps/gaia/page/testing/ArtboardScreens.tsx` and `page/Screens.visual.spec.ts` where B1 draws the frame.

**What to do.**

1. `BoardApp` is `BridgeApp` without the identity fetch and reload (`:183-230`), the embed channel (`:259-266`,
   `:579-619`), the theme state (Gaia's), Flint's brain (`:319-323`) and the session code outcome. Its open decisions
   come from the served order (`BridgeApp.tsx:20` imports `OpenDecisionsUtil` today). It takes `BoardServices` and the
   `BoardRoute` from Gaia's route, and navigates by Gaia's `goTo` with
   `HashRouter.fragmentOf({ view: 'forge', trackerId, boardRoute })`. It renders a tab's view only when
   `BoardTabViews` lists the tab; for any other tab it renders nothing in its main area and the forge view shows the
   frame there.
2. The forge view: Gaia's bar (as today), then the board header and tab bar (`Header` from WP6.8) for every tab, then
   either the moved view or the frame. The frame keeps its session and embed channel for unmoved tabs, navigated to
   the board route's fragment (`#<tab>/<item>`) as today. The Bridge, in frame mode, shows no head of its own.
3. The route: `#forge/<trackerId>/<tab>[/<item>]`, the one form read and written. The form with `#` before the tab
   (`HashRouter.ts:46-53`) is not read (decision 32): a link of that form opens the forge's default tab. A route from
   Gaia's own views comes from the fleet document's board route, which the server maps from the monitor's `route`.
4. A tab of its own: "Open in new tab" in the forge bar opens Gaia's own address with the same route in a new tab
   (`window.open(<the page's origin>/#forge/...', '_blank', 'noopener')`) through a surroundings function the specs
   replace. It sends no `forge-open-in-browser` (the kind is deleted in WP6.23). The new tab shares Gaia's session
   cookie (same origin) and needs no session code.
5. `BoardTabViews` starts empty: after this package every tab still shows through the frame, under Gaia's header.

**Specs.** `HashRouter.spec.ts`: the form read and written; the form with `#` before the tab reads as the forge with no
tab; a malformed escape reads as no segment. `BoardApp.dom.tsx`: a tab not in `BoardTabViews` renders no view; the
header's tabs navigate through `goTo`; a lost stream disables controls; the board root remounts for another tracker
id. The forge view's specs: the frame is asked for only for an unmoved tab, never for a moved one; "Open in new tab"
opens the route and sends no command. `FleetDocumentMapUtil.spec.ts`: an attention entry's monitor route becomes its
board route.

**Done when.** At the root green; in `apps/gaia/`: `bun test page src/adapters` and `bun run test:dom` pass; the by-eye
pass of `page/Screens.visual.spec.ts` shows B1 with Gaia's bar and the board header over the frame.

**Parallel.** Alone.

### WP6.10 Questions and the question panel

**Purpose.** The questions view and the panel that shows one question with its context, its choices and its
recommendation (decision 11), over any tab.

**Files.** Transplant `apps/forge/bridge/views/questions/` (the files WP6.8 did not move: `QuestionsView.tsx`,
`QuestionsView.dom.tsx`) and `views/question-panel/` (7 files); `flint/QuestionsSpriteHabitat.ts` is already moved
(WP6.7); `testing/QuestionPanelFixture.ts`. Styles into `page/styles/board/questions.css`. One line in
`BoardTabViews.tsx`; `BoardApp.tsx` renders `QuestionPanel` as `BridgeApp.tsx:549-566` does.

**What to do.** The transplant procedure. The recommended option is the decision document's served field; the label's
trailing mark (`QuestionPanelModel.ts:228-229`) is not read. The questions keep the served answering order.
`#questions/<id>` opens the panel when the route and the question arrive, as `BridgeApp.tsx:268-274`. An answer is the
`decision-answer` command; its refusal shows the forge's sentence.

**Specs.** `QuestionsView.dom.tsx`, `QuestionPanel.dom.tsx`, `QuestionPanelModel.spec.ts`; new cases: a question's
context, each option and the recommended option are shown, the recommended one marked from the field, and a label
ending in "(Recommended)" without the field marks nothing.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`; the Questions tab shows without a frame.

**Parallel.** With WP6.11, WP6.12, WP6.18, WP6.19, WP7.1.

### WP6.11 Agents, and a job that waits after a network outage or a lost supervision

**Purpose.** The agents view with its job table, panels, transcript, controls and concurrency control; it shows a job
that ended on a network outage, and one the forge stopped supervising, by their own words (decisions 35, 38).

**Files.** Transplant `apps/forge/bridge/views/agents/` (27 files; `AgentsModel.ts` and `AgentJobDocument.ts` are
already moved) except `FlintBrainCard.tsx`. Styles into `page/styles/board/agents.css`. One line in `BoardTabViews.tsx`.

**What to do.**

1. The transplant procedure. Drop the brain card and the `flintBrain` and `flintBrainControls` props
   (`BridgeApp.tsx:514-515`). `ConcurrencyLimitControl.tsx:4` reads the served concurrency bounds.
2. Add the interruption causes `network-outage` and `lease-ended` (N6) to the job state wording
   (`utils/JobStateUtil.ts`, `utils/DisplayStateWordingUtil.ts`) and to `StateToneUtil`'s record: "Network outage" and
   "Not supervised", each a waiting tone (dashed: it waits), never the failure tone (crimson is a failure only, Gaia
   rule 12).
3. The job panel of an interrupted job shows what the forge serves as following (the job's `waitsFor`): `instruction`
   offers Resume, which sends `interrupted-work-resume` with `{ jobId }`; `nothing` says it resumes by itself;
   `answer`, `decision`, `never` say so in words. Gaia decides nothing; the restarts a resume gives back are the
   forge's (decision 40).

**Specs.** `AgentsView.dom.tsx`, `UseAgentPanelHabitat.dom.tsx`, `AgentsModel.spec.ts`,
`AgentPanelSpriteModel.spec.ts`; new cases: a `network-outage` job and a `lease-ended` job show their words and the
waiting tone, never the failure tone; with `waitsFor: 'instruction'` Resume sends the command once; with `nothing` no
control shows.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`; the Agents tab shows without a frame.

**Parallel.** With WP6.10, WP6.12, WP6.18, WP6.19, WP7.1.

### WP6.12 The detail panel

**Purpose.** The covering panel of a ticket, a draft, a job, an epic or the merge queue, which every detail tab opens,
offering the moves and controls the forge serves for each.

**Files.** Transplant `apps/forge/bridge/views/detail-panel/` (30 files), `shell/DetailPanelHost.tsx` (+ DOM spec),
`testing/DetailBoardFixture.ts`, `testing/DetailRoutingFixture.ts`. Styles into `page/styles/board/detail-panel.css`.
`BoardApp.tsx` renders `DetailPanelHost` as `BridgeApp.tsx:441-443`. No line in `BoardTabViews.tsx`: the panel shows
once a detail tab moves (WP6.13 to WP6.17).

**What to do.**

1. The transplant procedure. The value imports and what they become:
   - `DetailControlsModel.ts:3` and its status comparisons (`:56-70`): the controls offered are the served moves and
     controls of the ticket or job, and the priority choices exclude the served resolved priority;
   - `DraftDetailModel.ts:6`: Gaia's `DraftWordsUtil`;
   - `RowDetailModel.ts:5`, `:8`, `TicketDetailModel.ts:8-9`, `TicketTimelineModel.ts:6-10`: `CountTextUtil`, Gaia's
     minute constant, the served repeat-review facts and resolved priority;
   - `TicketOverviewModel.ts:10-11`: the served stop holds and repeat-review facts.
2. The ticket moves (`TicketMoves.tsx`, `DetailControls.tsx`, `JobStopMenu.tsx`) send their commands through the relay.
   A move the forge refuses shows the forge's sentence. A job that waits after an outage or a lost supervision shows
   its cause as in WP6.11. A committed ticket shows as `committed` (N11), and no control offers an edit of its content.
3. Served offers can show other buttons than the Bridge's hand-written comparisons. Stage 4's
   `BoardOffers.parity.spec.ts` lists each difference against a frozen table of `DetailControlsModel.controlsOf`; the
   served offers win, and the package's report names each difference that changes a button in Gaia.

**Specs.** `DetailPanelHost.dom.tsx` and the two detail-panel DOM specs; `DetailPanelModel` and `TicketOverviewModel`
plain specs; new cases: a control shows exactly when the served moves offer it; a refused move shows the forge's
sentence.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`.

**Parallel.** With WP6.10, WP6.11, WP6.18, WP6.19, WP7.1.

### WP6.13 Kanban and the merge queue

**Files.** Transplant `views/kanban/` (18 files, the entity rail and entity filter among them: `KanbanEntityRail.tsx`,
`KanbanEntityFilterModel.ts`, `KanbanModel.entities.spec.ts`) and `views/merge-queue/` (7),
`testing/KanbanBoardFixture.ts`. Styles into `page/styles/board/kanban.css`, `merge-queue.css`. One line in
`BoardTabViews.tsx` (`kanban`; the merge queue is its item `merge-queue`, `BridgeApp.tsx:120-121`). The finished-work
filter's Kanban sections (`KanbanFilterSections.tsx`) move here and are wired into the header's filter as
`BridgeApp.tsx:388-401`.

**What to do.** The transplant procedure; the lane highlight from the header's figures as `BridgeApp.tsx:166-169`. The
value imports: `KanbanModel.ts:8`, `:11-13` read `CountTextUtil`, the served repeat-review facts, Gaia's
`DraftWordsUtil` and the served answering order; `KanbanCardTextUtil.ts:7` the served repeat-review facts;
`KanbanFilterSections.tsx:12` `CountTextUtil`. The filter choices hold an entity and the swimlanes beside the pressed
chips and the ready order (`KanbanFilterChoices.ts:31-32`, `:83-84`), read into the filter model as
`BridgeApp.tsx:327-336`, and the view takes `onChooseEntity` (`:424`); both choices are board preferences under Gaia's
prefix (WP6.5). The entity rail draws the design system's `SelectionRail` (`design-system/SelectionRail`).

**Specs.** The Kanban and merge-queue DOM and plain specs, among them `KanbanEntityRail.dom.tsx`,
`KanbanFilterSections.dom.tsx`, `KanbanView.dom.tsx`, `KanbanEntityFilterModel.spec.ts` and
`KanbanModel.entities.spec.ts`. **Done when.** At the root green; `bun run test:dom`; Kanban shows without a frame and
opens the detail panel. **Parallel.** With WP6.14 to WP6.17, WP6.20, after WP6.12.

### WP6.14 Tickets

**Files.** Transplant `views/tickets/` (4), `testing/TicketsBoardFixture.ts`; `flint/TicketsSpriteHabitat.ts` already
moved. Styles into `page/styles/board/tickets.css`. One line in `BoardTabViews.tsx`.

**What to do.** The transplant procedure; `TicketsModel.ts:10` reads the served repeat-review facts.

**Specs.** `TicketsView.dom.tsx`, `TicketsModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.13, WP6.15 to WP6.17, WP6.20, after WP6.12.

### WP6.15 Progress and finished work

**Files.** Transplant `views/progress/` (32) and `views/finished-work/` (2), `testing/ProgressBoardFixture.ts`. Styles
into `page/styles/board/progress.css`. One line in `BoardTabViews.tsx` (`progress`, which draws both views,
`BridgeApp.tsx:429-434`).

**What to do.** The transplant procedure. `ProgressModel.ts:6`, `:10` read `CountTextUtil` and the served
repeat-review facts; `utils/FitRangeUtil.ts:3` Gaia's minute constant. `chart-range-set` and `tracker-clear`
(`ProgressModel.ts`, `BoardLifetimeControls.tsx`) go through the relay.

**Specs.** The four progress DOM specs, `FinishedWorkView.dom.tsx`. **Done when.** At the root green;
`bun run test:dom`. **Parallel.** With WP6.13, WP6.14, WP6.16, WP6.17, WP6.20, after WP6.12.

### WP6.16 Epics

**Files.** Transplant `views/epics/` (7), `testing/EpicsBoardFixture.ts`. Styles into `page/styles/board/epics.css`.
One line in `BoardTabViews.tsx`.

**What to do.** The transplant procedure; `EpicsModel.ts:8` reads the served repeat-review facts.

**Specs.** `EpicsView.dom.tsx`, `EpicsModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.13 to WP6.15, WP6.17, WP6.20, after WP6.12.

### WP6.17 Waves

**Files.** Transplant `views/waves/` (6). Styles into `page/styles/board/waves.css`. One line in `BoardTabViews.tsx`.

**What to do.** The transplant procedure. `WaveForecastUtil.ts:8` reads each ticket's served `settlesADependency`
flag; the wave forecast itself (its p50 and p80) is view logic and stays Gaia's, its only consumer.

**Specs.** `WavesView.dom.tsx`, `WavesModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.13 to WP6.16, WP6.20, after WP6.12.

### WP6.18 Assistant

**Purpose.** The Assistant's chat. Its switch arrives in WP6.27, once stage 8 builds it in forge.

**Files.** Transplant `views/assistant/` (4). Styles into `page/styles/board/assistant.css`. One line in
`BoardTabViews.tsx`.

**What to do.** The transplant procedure; `AssistantModel.ts:10` reads the served open decisions.

**Specs.** `AssistantView.dom.tsx`, `AssistantModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.10 to WP6.12, WP6.19, WP7.1.

### WP6.19 Pipeline, part 1: the code and its plain specs

**Purpose.** The pipeline view is 195 files whose subfolders import each other in cycles (`setup` ↔
`agent-panel`, `flow` ↔ `gates` ↔ `live`, `apply` ↔ `editing`, and `entities/` with `flow`, `apply` and
`agent-panel`, which every other subfolder imports), so it cannot move folder by folder. Part 1 moves every file and
its plain specs, rewired to the served facts and compiled green, but not yet routed. Its pipeline logic is the forge's:
the view sends each edit and shows what the forge serves (decision 44).

**Files.** Transplant `apps/forge/bridge/views/pipeline/` whole (the 10 top-level files and `setup/` (45 files),
`agent-panel/` (8), `entities/` (29), `flow/` (13), `gates/` (8), `dialogs/` (28), `apply/` (26), `editing/` (9),
`live/` (19)), and `testing/PipelineFixture.ts` and `testing/EntitiesStepFixture.ts`. The `.dom.tsx` specs are copied
in WP6.20. Already moved in WP6.8: `PipelineViewModel.ts`, `PipelinePanel.tsx`, `entities/PipelineLevelModel.ts`,
`flow/PipelineFlowModel.ts`, `flow/PipelinePhaseModel.ts`, `gates/GateCacheMarkModel.ts`, `live/EntityWorkModel.ts`,
`live/FlowActivityPanelModel.ts` and `live/MinimalPipelineNoteModel.ts`.

**What to do.**

1. The transplant procedure, steps 1 to 6 for plain specs only.
2. Vocabulary and defaults: `GATE_PHASES` (`apply/ChangeListModel.ts:8`, `dialogs/GateDialog.tsx:15`,
   `dialogs/GateDialogModel.ts:9`, `dialogs/PipelineDialogs.tsx:8`, `editing/CopyBetweenEntitiesDialogModel.ts:8`,
   `setup/DesignStepModel.ts:8`, `setup/EntitiesStepModel.ts:7`), the role lists (`apply/ChangeListModel.ts:9`,
   `entities/EntityLevelFactsModel.ts:7`) and `AGENT_EFFORTS` (`setup/BillingStepModel.ts:12`) become Gaia's ordered
   lists; `DEFAULT_INSTRUCTIONS_OF_ROLE`, `WORKER_MODEL`, `WORKER_EFFORT` (`dialogs/AgentStepDialogModel.ts:8-9`),
   `RE_REVIEW_THRESHOLD_STEP_LINES` and the rework threshold (`dialogs/RereviewSettingsModel.ts:7-8`) and the
   concurrency bounds (`entities/ForgeLevelPageModel.ts:8`) become the served limits and defaults.
3. Entity facts: `PipelineUtil.pipelineOfEntity` (`entities/EntityLevelFactsModel.ts:15`) becomes the served effective
   pipeline of each entity; `EntityOwnershipUtil` (`entities/CrossingDialogModel.ts:7`,
   `setup/EntitiesStepModel.ts:17`, `setup/FoldEntityDialogModel.ts:9`) is not imported: the root entity is the one
   whose served kind is `root`, and each entity's transitive dependents are served (N2).
4. The entities step (`setup/EntitiesStep.tsx:176-195`, `setup/EntitiesStepModel.ts`, `setup/EntityRefusalsModel.ts`):
   the step holds no edits. Each gesture sends its typed draft edits at once as `pipeline-draft-edit`, one gesture in
   flight at a time; the step shows the served draft and its served `entityRefusals`, each with the forge's sentence on
   the row it names (`shownOn`) and, where the forge serves a `fix`, a button with the fix's label that sends its edits;
   Continue is disabled while a refusal stands, and a Continue the forge refuses shows its sentence.
   `PipelineDraftEditUtil` (`setup/EntitiesStepModel.ts:18`, `setup/FoldEntityDialogModel.ts:10`) and
   `EntityValidationUtil` (`setup/EntityRefusalsModel.ts:10`) are not imported; `entitiesAfterEdits` and the held-edit
   state go; the fold dialog sends its edits and reads the served draft.
5. The Apply dialog (`apply/ApplyDialogModel.ts:8`, `:12`, `:135-152`): the Apply refusal is the served one, with its
   sentence and its ticket ids; nothing is predicted. `OperationRefusal` and `OperationRefusalWordingUtil` are not
   imported anywhere in `page/board/`.
6. `ProfileLogFollowerContext.ts` takes the follower from `BoardServices.followProfileLog`.

**Specs.** Every plain `*.spec.ts` of the pipeline passes in Gaia, the `*.levels.spec.ts` and `entities/*Model.spec.ts`
among them, fed the served facts; new cases: each replaced constant is read from the served limits and defaults; the
entities step's model shows a served refusal with the forge's sentence and disables Continue while one stands, and
sends a gesture's edits at once even when the draft they leave has a refusal; the Apply dialog shows the served Apply
refusal and predicts none on a board whose served facts carry none.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/board/views/pipeline` passes, and
`grep -rn "OperationRefusal\|PipelineDraftEditUtil\|EntityValidationUtil\|EntityOwnershipUtil" page/board` prints
nothing.

**Parallel.** With WP6.10 to WP6.12, WP6.18, WP7.1.

### WP6.20 Pipeline, part 2: styles, DOM specs, the route, line run times, and the setup conversation

**Purpose.** The pipeline tab is Gaia's own: setup, the live flow, editing, apply, gate profiles with their log, every
line's recorded run time in the pipeline overview (decision 36), and the pipeline agent's panel, the conversation with
the hosted pipeline setup session (decision 23).

**Files.** Copy the pipeline's 29 DOM specs (`FlowWorkspace`, `EntityAssignmentProgress`, `CopyBetweenEntitiesDialog`,
`MonorepoEditing`, `ChangeGroup`, `EntityLevelBreadcrumb`, `PipelineLevelRail`, `EntitiesStep` and
`PipelineAgentPanel` among them); the rest of the pipeline's styles into `page/styles/board/pipeline.css`, which WP6.8
created; one line in `BoardTabViews.tsx`; `BoardApp.tsx` passes `followProfileLog` and the setup stepper's route as
`BridgeApp.tsx:528-538`. Change `page/board/views/pipeline/gates/GatesAreaModel.ts`, `GatesTable.tsx`, `GateRow.tsx`
and their specs for the run times.

**What to do.**

1. The transplant procedure, steps 6 to 8.
2. While the board has no readable pipeline only the Pipeline tab shows, and the header shows the setup stepper
   (`.claude/rules/bridge.md:50-52`), the entities step among its steps: prove it in Gaia's header.
3. The pipeline agent's panel sends `job-message`, `pipeline-setup-answer` and `pipeline-agent-advise` through the
   relay and follows the agent's job stream; it offers no picture, as today.
4. Line run times (N8): the gates table, the pipeline's overview of its lines, shows on every row its newest served
   run time for the tab's phase and the entity in view: a prepare row (a step of the install line, served with no
   phase) and a gate row alike, worded with `profileTimeTextOf` (`GatesAreaModel.ts:112-117`), with a mark when the
   ending is `time-bound` and the failure tone when it is `failed`. A line with no recorded run shows no time. The time
   is the forge's measure, a sleep not counted; Gaia words it and computes none.

**Specs.** The 29 DOM specs, among them `PipelineView.dom.tsx`, the setup steps' (`EntitiesStep.dom.tsx` among them),
the apply dialogs', the gate dialog's, the entity level rail's and `PipelineAgentPanel.dom.tsx`; new cases: the profile
log follows the relay's profile stream from its cursor after a reopen; `EntitiesStep.dom.tsx` shows a standing refusal
in the forge's sentence with Continue disabled and its fix sends the fix's edits; `GatesTable.dom.tsx` shows each
prepare and gate row's run time for the phase in view, and the bound's mark on a line it stopped.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`; the Pipeline tab shows without a frame on a
board with and without a readable pipeline.

**Parallel.** After WP6.19; with WP6.13 to WP6.17.

### WP6.21 A forge that crashed, is down or hung, and the work that waits

**Purpose.** Gaia alerts that a forge crashed (a crash suspected before a reboot included), is down or is hung, shows
its crash summary and, once the forge serves again, its crash log, says what waits and why, shows when the forge
stopped supervising its agents, offers to start it and offers the instruction that resumes the work (decisions 13, 14,
21, 38, 39). It never starts or resumes anything by
itself. It also renames Gaia's undo of a pause to "Unpause" (decision 41), since "Resume" here means interrupted work.

**Files.**

- Change `apps/gaia/src/adapters/forge-registry/@types/RegisteredForge.ts`, `utils/RegistryMapUtil.ts` and the
  `forge-registry` recording (`bun run record forge-registry` from a scratch forge in each presence state).
- Change `apps/gaia/src/lib/forge-client/ForgeClient.ts`: `presenceOf(access)` and `crashLogOf(access, number)` at
  stage 3's `presence` and `crash-log` endpoints; create `apps/gaia/src/adapters/forge-api/PresenceIngestion.ts` and
  `CrashLogIngestion.ts` with their specs; the `overseer-fetch-board` recording gains the presence document in its
  situations, and `overseer-fetch-supported-forge` a forge started after a crash, with its crash log read.
- Create `apps/gaia/src/features/page-server/routes/ForgeCrashLogRoute.ts` and spec (`GET
  /api/v1/forges/{trackerId}/crash-logs/{number}`, key `forgeCrashLog`), `page/@types/CrashLogDocument.ts` and its
  map in `src/adapters/page-api/FleetDocumentMapUtil.ts` or a `CrashLogDocumentMapUtil.ts` beside it, with
  `gaiaCrashLog: 1` in `PageContractVersions.ts` and the endpoint in `GaiaSystemVersions.ts` and the registry.
- Change `apps/gaia/src/services/ForgeWatch.ts`, `src/shared/@types/ForgeReading.ts`,
  `src/features/fleet/FleetAssembly.ts`, `src/adapters/page-api/FleetDocumentMapUtil.ts`, `page/@types/FleetDocument.ts`
  (`fleetVersion` and the `fleet` and `events` endpoints raised, as the rules for a changed document say).
- Change `apps/gaia/src/shared/@types/GaiaCommand.ts`, `page/@types/CommandDocument.ts`,
  `src/adapters/page-api/GaiaCommandIngestion.ts`, `src/features/forge-control/ForgeControl.ts`: the Gaia command
  `forge-interrupted-work-resume`, and `forge-resume` renamed `forge-unpause`;
  `page/shared/utils/ForgeCommandTextUtil.ts` and `page/views/forges/ForgesModel.ts` word it "Unpause"; the
  `commands` endpoint at its next version (`GaiaSystemVersions.ts`, `GaiaCompatibilityRegistry.ts`).
- Change `apps/gaia/page/views/attention/` (an attention item per crashed, down or hung forge), `page/views/forges/`
  (the forge's row), `page/views/forge/` (the bar's alert, the crash log and the waiting-work list), with specs and
  fixtures.

**What to do.**

1. Read the registry's `presence` key (N7). A forge whose registry presence is `crashed` is `crashed`, with the
   registry's crash summary (component, whether it is suspected before a reboot, the error's name and message); a forge
   with no Overseer answering and presence `stopped` is `stopped`; `serving` with no answer is `down` (the process is
   gone, or hung so that it does not answer: a hung Hephaestus counts as gone). A forge whose API answers and whose
   presence reads `supervision: 'stopped'` is `hung`. Add `presence: FleetDocumentPresence` to `FleetDocumentForge`
   (Interfaces).
2. For a live forge, read `supervision`, `interruptedWork` and `crashLogs` from the presence document at each monitor
   snapshot change (a read per change, never on a timer of its own). A crash log the presence lists is read with
   `crashLogOf` by its `number` when the user opens it in the bar, once per log, and shown with its active jobs, its
   error and the tail of its log.
3. A forge off after a crash serves no API: its alert shows the registry's summary only, and its crash log becomes
   readable once the user starts the forge and it serves.
4. An attention item of the kind `forge-crashed` per crashed forge, action label `Start`, which sends `forge-start`
   (the user's start, which stage 3's start gate accepts). A down forge shows an item of kind `forge-down` with the
   same action; a hung forge an item of kind `forge-hung` with no action but the forge route's.
5. In the forge route, the bar shows the alert with the crash summary, "Suspected crash before a reboot" where
   the log says so, and the waiting-work list: per job its cause in words ("Network outage", "Not supervised: the forge
   stopped supervising this agent", "Machine went down", "Forge stopped", "Forge crashed", "Agent crashed twice"), what
   it waits for, one Resume per job whose `waitsFor` is `instruction`, and one "Resume all". Each sends
   `forge-interrupted-work-resume` (Interfaces), which Gaia forwards as `interrupted-work-resume`.
6. The undo of a pause is `forge-unpause`, worded "Unpause", forwarded as the forge's unpause kind (today
   `overseer-resume`; stage 9 renames the kind). The `commands` endpoint rises a version, since a kind is renamed.
7. The words name no command (Gaia rule 4): "Forge crashed", "Start", "Resume", "Unpause", never a verb.

**Specs.** Registry map: each presence state. Presence ingestion: the recorded document reads; an unknown key is passed
over; the supervision reads. Crash log ingestion: a recorded crash log and a suspected one. Fleet assembly: crashed,
stopped, down and hung are told apart; the attention item appears only for crashed, down and hung; a crash log is read
once per generation and only on request. The command ingestion and control: the new kind with a target forwarded to the
forge, refused for a forge that is not answering; `forge-unpause` forwarded as the forge's unpause; `forge-resume`
refused as unknown at the new version. The crash log route answers the mapped log of a live forge and refuses one that
does not answer. Page specs (no document, as Gaia's own views are specced): the alert, the crash summary, the list with
its causes and its controls, "Unpause" on the bar and the forge row.

**Done when.** At the root green; in `apps/gaia/`: `bun test src page/views` passes; the recordings are fresh
(`bun run check`).

**Parallel.** After WP6.3 and WP6.9; before WP6.26.

### WP6.26 Agents that ended on a network outage, and one control that resumes them all

**Purpose.** Decision 35: when agents end on a network outage, Gaia alerts the user, and one control in Gaia resumes
every job that ended this way, across all forges. It is always clickable; a job that ends on an outage again waits
again.

**Files.**

- Change `apps/gaia/src/features/fleet/FleetAssembly.ts`, `src/adapters/page-api/FleetDocumentMapUtil.ts`,
  `page/@types/FleetDocument.ts`: each forge's count of jobs waiting after an outage and the fleet's total, from the
  presence document's interrupted work (cause `network-outage`); `fleetVersion` and the `fleet` and `events` endpoints
  raised.
- Change `apps/gaia/src/shared/@types/GaiaCommand.ts`, `page/@types/CommandDocument.ts`,
  `src/adapters/page-api/GaiaCommandIngestion.ts`, `src/adapters/page-api/PageAnswerMapUtil.ts`: the fleet command
  `fleet-outage-resume` (no tracker id, as `fleet-look-again`) and its answer per forge; the `commands` endpoint at its
  next version if WP6.21's raise has landed in the same Gaia system version, else with it.
- Create `apps/gaia/src/features/forge-control/OutageResume.ts` and spec: sends the forge's outage resume to every
  forge whose API answers.
- Change `apps/gaia/page/views/attention/` (the alert and the control), `page/shell/` (the rail's mark), with specs
  and fixtures; `page/testing/ArtboardScreens.tsx` for the alert.
- Change the `overseer-fetch-board` recording: a situation where the fake agent's session ends on a network outage
  (stage 2's fake agent outage scenario), and the resume of it.

**What to do.**

1. The alert: while any forge holds a job that waits after an outage, an attention item of the kind
   `agents-ended-on-outage` heads the Attention view, worded "<n> agents stopped on a network outage" with the forges
   it names, and the rail marks it. Each forge's row and its bar show its own count.
2. The control: "Resume agents stopped by an outage", drawn in the Attention view's head at all times and never
   disabled, also with nothing to resume. It sends `fleet-outage-resume`.
3. `OutageResume.resumeAll(fleet)` sends `interrupted-work-resume` with the outage target (N7) to each forge whose API
   answers, one after another, never two at once to one forge; it answers per forge `resumed` with the count,
   `nothing-to-do`, `refused` with the forge's sentence, or `not-reached`. It never retries and never runs a CLI verb.
4. The answer shows as Gaia shows a command's answer: one line per forge that resumed, refused or did not answer;
   "Nothing to resume" when every forge answered `nothing-to-do`.

**Specs.** Fleet assembly: the counts per forge and the total, from recorded presence documents; a forge not answering
counts nothing. `OutageResume.spec.ts` on recorded answers: two forges with outage endings and one not answering give
two `resumed` and one `not-reached`; a refusal keeps the forge's sentence; with nothing waiting every forge answers
`nothing-to-do`. Command ingestion: `fleet-outage-resume` with no tracker id. Page specs: the item, its words and its
forges; the control enabled with zero, one and many endings and while a forge is down.

**Done when.** At the root green; in `apps/gaia/`: `bun test src page/views page/shell` passes; the recordings are
fresh (`bun run check`).

**Parallel.** After WP6.21; before WP6.22.

### WP6.22 The running and the newest Overseer and Talos, each restarted cleanly

**Purpose.** Decision 31: Gaia shows the running and the newest version of the Overseer and of Talos, and restarts each
cleanly: the Overseer by a Baton pass, Talos by a clean quit with automatic resume.

**Files.**

- Forge: create the command `talos-restart` in `apps/forge/src/shared/@types/ControlCommand.ts` (runtime only, never
  relayed, as `overseer-restart` is), refused on the board as runtime only in
  `apps/forge/src/services/control/OverseerControls.ts:17` (`refuseRuntimeOnly`, as `overseer-restart` is), taken as a
  runtime command by the command route (`apps/forge/cli/overseer/routes/CommandRoute.ts:27-30`
  `RuntimeOverseerCommand`, `:52` `RUNTIME_COMMAND_KINDS`) and applied where the live Overseer applies
  `overseer-restart` (`apps/forge/cli/overseer/OverseerForeground.ts:485-497`, `onRuntimeCommand`); the contract kind
  in `packages/forge-contracts/@types/ForgeControlCommand.ts`, `FORGE_CONTROL_COMMAND_KINDS`, forge's pin
  `CONTROL_CONTRACT_KINDS` and forge's command ingestion, the parity spec, the forge system version one minor up, the
  Bouncer's role policy refusing it for every agent role, and `docs/reference/overseer-api.md`, "Commands".
- Forge: `forge version --json` (`apps/forge/cli/overseer/VersionCommand.ts:17-22`) adds `talosProtocolVersion`; the
  presence document (stage 3) gains `talos: { protocolVersion: number; codeVersion: string; startNumber: number } |
  null`, read from Talos's record (stage 2's `TalosRecord`); `answerVersion` of the version answer raised by one
  (`apps/forge/CLAUDE.md:373-375`), and the `version` row of `apps/forge/docs/cli.md` names the new key.
- Gaia: `src/adapters/forge-program/@types/ForgeProgramAnswer.ts` and `utils/ForgeAnswerMapUtil.ts` (the version
  answer), `src/adapters/forge-api/PresenceIngestion.ts`, `ForgeReading.ts`, `FleetDocument.ts`
  (`FleetDocumentRunningVersions`, Interfaces), `GaiaCommand.ts`, `CommandDocument.ts`, `GaiaCommandIngestion.ts`,
  `ForgeControl.ts` (`forge-talos-restart` forwarded as `talos-restart`), `SUPPORTED_FORGE_VERSION`, the recordings
  (`forge-program`, `overseer-fetch-supported-forge`, `overseer-fetch-board`), and the forge bar
  (`page/views/forge/ForgeFrameLayout.tsx` and its model): a versions line and two restart controls.

**What to do.**

1. `talos-restart`: the Overseer sends Talos the `quit` frame with reason `restart` (N5) and starts the right Talos
   when it has quit; the paused agents resume by themselves (design section 3.2). Refused with
   `nothing-to-do` when no Talos runs. Never admitted for an agent role.
2. Running: the Overseer's `codeVersion` (identity), Talos's `protocolVersion` and `codeVersion` (presence). Newest:
   the installed program's `codeVersion` and `talosProtocolVersion`, read with `forge version --json`, which Gaia
   already runs (`ForgeProgram.ts:86`), once per registry check of a forge and never on a timer of its own.
3. The bar shows both pairs; a restart control for each, enabled while the forge answers, with the words
   "Restart Overseer" and "Restart Talos". The Overseer's uses Gaia's existing `forge-restart` (a Baton pass,
   `now: false`). A newer installed version marks the pair, it does not restart by itself.

**Specs.** Forge: `OverseerControls` spec (refused on the board as runtime only), the command route's spec (taken as
a runtime command; the quit frame sent; `nothing-to-do` without Talos), the Bouncer spec, the parity spec,
`VersionCommand` spec. Gaia: the version answer map, the presence ingestion's `talos` block, the command
forwarding, the bar's model (running equal to newest, older, Talos absent).

**Done when.** At the root green; in `apps/forge/`: the forge recordings re-recorded (`bun run record
src/services/overseer/OverseerServer.ts`); in `apps/gaia/`: the forge recordings re-recorded and `bun run check`
clean.

**Parallel.** After WP6.26.

### WP6.23 Gaia retires the frame

**Purpose.** Nothing is embedded by iframe (decision 27). After every tab has moved, Gaia drops the frame, the frame
session, the embed channel and the frame-ancestor record, and its page reaches no `forge-contracts` at all
(decision 51).

**Files.**

- Delete `apps/gaia/src/features/page-server/routes/FrameSessionRoute.ts` and spec; `FrameSessionSources` from
  `PageServer.ts`; `apps/gaia/page/@types/FrameSessionDocument.ts`;
  `apps/gaia/src/shared/@types/FrameSessionVerdict.ts`; the frame-session map of `PageAnswerMapUtil.ts`;
  `apps/gaia/page/views/forge/EmbedChannel.ts`, `ForgeFrameSession.ts`, `FrameSessionRequest.ts` and their specs;
  the frame parts of `ForgeFrameView.tsx`, `ForgeFrameModel.ts`, `ForgeFrameLayout.tsx` (rename what is left to
  `ForgeView.tsx`, `ForgeModel.ts`, `ForgeLayout.tsx`).
- Delete `sessionCodeOf` and the `sessionCodes` endpoint from `ForgeClient.ts`, and the session-code situations from
  the recordings (re-record).
- Delete `apps/gaia/src/adapters/gaia-files/ServerRecordWriter.ts`, its spec and its use in `PageServer.ts:296-301`
  and `:310`: Gaia frames no forge, so it writes no frame-ancestor record. Leave the `frame-ancestors` folder of the
  monitor folder alone; the forge reads it until stage 8.
- Change `ContentSecurityPolicy.ts`: no `frame-src` sources (`'self'`), and `PageServer.ts:240`.
- Delete `forge-open-in-browser` from `CommandDocument.ts`, `GaiaCommand.ts`, `GaiaCommandIngestion.ts:57`,
  `ForgeControl.ts:309-310`, and `openInBrowser` from `ForgeProgram.ts` with its answer type and recording.
- Stop reading the forge's `embed` contract, which only the frame needed: `page/@types/FleetDocument.ts` (`embed` and
  `knownContracts.embed`), `page/shared/utils/ForgeContractUtil.ts` (`canOpenInPlace`, deleted when nothing else reads
  it), `page/views/attention/AttentionModel.ts`, `page/shell/GaiaApp.tsx`, and the server side that fills them
  (`src/adapters/forge-api/IdentityIngestion.ts`, `src/adapters/forge-api/utils/ForgeReadingMapUtil.ts`,
  `src/shared/@types/ForgeReading.ts`, `src/adapters/page-api/FleetDocumentMapUtil.ts`, `src/Main.ts`), with the
  fixtures that carry `embed` (`git grep -n -i "embed" -- apps/gaia` lists them). The forge keeps serving `embed` in
  its identity until stage 8; Gaia passes the key over as any unknown one. The fleet document changes, so
  `fleetVersion` and the `fleet` and `events` endpoints rise with Gaia's other version changes of this package.
- Change `apps/gaia/page/PageImportDirection.spec.ts`: the exception for `EmbedChannel.ts` goes, so no page module
  imports `forge-contracts`.
- Change `GaiaSystemVersions.ts` (`frameSession` removed; `commands` at its next version),
  `GaiaCompatibilityRegistry.ts`, `ContractVersions.ts` and `PageContractVersions.ts` (`forgeEmbedChannel`,
  `forgeFrameAncestorRecord`, `gaiaFrameSession` removed), the page's `BoardTabViews.tsx` (every tab listed; the
  fallback removed), `apps/gaia/CLAUDE.md` (the boundaries row of the embed channel removed; the frame's rule text),
  `apps/gaia/docs/contracts.md`, `docs/architecture.md`, `docs/forge-requirements.md`.
- Change `page/testing/ArtboardScreens.tsx`, `page/testing/AuthoredBridge.ts` (deleted), `page/Screens.visual.spec.ts`.

**What to do.** Delete as listed. A removed route and a removed command kind are breaking changes of Gaia's own
contract toward its page and launcher: follow `apps/gaia/CLAUDE.md` rule 3, serve `commands` at its next version and
retire the older one with `bun run versions:raise-minimum` (decision 32: nothing older is kept).

**Specs.** `PageServer.spec.ts`: no frame-session route; the CSP names no frame source and the sandboxed `srcdoc` frame
still loads (Not established, item 1, settles it). `PageImportDirection.spec.ts`: no exception remains.
`RealProgramRuns.spec.ts` and the recordings list stay exact.

**Done when.** At the root green; `grep -rn "frame-session\|EmbedChannel\|sessionCodeOf\|frame-ancestors\|<iframe"
apps/gaia/src apps/gaia/page` prints only the sandboxed HTML frame, and
`git grep -n "forgeEmbedChannel\|contracts.embed\|frameSession\|forge-contracts" -- apps/gaia/page ':!*.md'` prints
nothing.

**Parallel.** Alone; after WP6.10 to WP6.22, WP6.26 and WP7.1.

### WP6.27 The Assistant's switch in Gaia

**Purpose.** Decision 24: the Assistant is a switch per board, off by default. Stage 8 builds the switch in forge
(N10); this package offers it in Gaia, so the user turns the Assistant on or off without a command line.

**Files.**

- Change the board's contract chain for the switch: `src/shared/@types/board/ForgeBoard.ts`,
  `src/adapters/forge-api/BoardStateIngestion.ts` (the served switch state), `page/@types/board/BoardDocument.ts`,
  `src/adapters/page-api/BoardDocumentMapUtil.ts`, `page/@types/board/BoardCommandDocument.ts`,
  `src/shared/@types/board/BoardCommand.ts`, `src/adapters/page-api/BoardCommandIngestion.ts`,
  `src/adapters/forge-api/BoardCommandMapUtil.ts`, with their specs; `gaiaBoard` and `gaiaBoardCommand` raised.
- Change `apps/gaia/page/board/views/assistant/AssistantView.tsx`, `AssistantModel.ts` and their specs.
- Re-record `overseer-fetch-board` with the switch on and off.

**What to do.**

1. The Assistant tab's head shows a switch, "Assistant on" or "Assistant off", from the served state. A press sends
   `pipeline-assistant-set` with `on` through the relay; the switch shows the forge's answer, never its own guess.
2. While the switch is off, the tab says the Assistant is off and that each incident takes its default; the incidents
   show the reason the forge records and serves (its notice sentence).
3. A refusal (no stored pipeline, an Apply pending) shows the forge's sentence.

**Specs.** The ingestion and both maps: the switch state and the command. `AssistantView.dom.tsx`: the switch reads the
served state, a press sends the command once and waits for the answer, a refusal shows the forge's sentence; with the
switch off the incidents show their served reason.

**Done when.** At the root green; in `apps/gaia/`: `bun test src/adapters page/board/views/assistant` and
`bun run test:dom` pass; the recordings are fresh.

**Parallel.** After WP6.18 and stage 8's WP8.9; beside any package that changes neither the Assistant view nor the
board contract's files.

### WP7.1 The conversation with an intake session in Gaia

**Purpose.** Decision 23: the user starts an intake, talks to the product owner and attaches pictures in Gaia, with
`intake-start` and `job-message` in, the job stream out, and pictures through the upload route.

**Files.** Transplant `apps/forge/bridge/views/intake/` (23 files, 3 DOM specs). Styles into
`page/styles/board/intake.css`. One line in `BoardTabViews.tsx`.

**What to do.**

1. The transplant procedure.
2. `PictureAttachmentsModel.ts:48`, `:127-128`: a picture's served address is the relay's
   `forges/<trackerId>/pictures/<pictureId>` (`BoardApiPaths`), so a `SentPicture` image loads through Gaia.
3. The composer uploads each picture first (`PictureUploadClient`), then sends `job-message` or `intake-start` naming
   the uploaded pictures (`ControlCommand.ts:145-147`), as the Bridge does; `intake-close` with its `jobId` as
   `IntakeAside.tsx` sends it.
4. Picture limits come from the served limits and defaults; Gaia's relay bound (`BOARD_PICTURE_UPLOAD_LIMIT_BYTES`) is
   at least the forge's limit, so the forge's refusal is the one shown, in its sentence.

**Specs.** `IntakeView.dom.tsx`, `PictureAttachments.dom.tsx`, `DraftResearchCue.dom.tsx` and the plain specs; new
cases: an upload then a `job-message` naming its picture id, in that order; a refused upload sends no message and
shows the forge's sentence; a sent picture's image address is the relay's.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`; the Intake tab shows without a frame.

**Parallel.** With WP6.10 to WP6.12, WP6.18, WP6.19.

### WP7.2 A skill for pipeline setup

**Purpose.** Pipeline setup gets one definition, a skill, which the hosted pipeline agent runs as its first message and
which the user can run in an agent of their own (decision 23, design section 3.5).

**Files.**

- Create `apps/forge/skills/agent-pipeline/SKILL.md`: frontmatter `name: {{skillName}}` and a `description` that names
  the words a user says ("set up the pipeline", "change the gates", "review the pipeline", `/{{pipelineSetupSkill}}`);
  the body holds the procedure in `resources/prompts/PipelineAgentPrompt.md:9-48` (the verbs table, the questions
  rules, the lines rule) and the four steps of `PipelineAgentResearch.md`, `PipelineAgentEntities.md` (run when the
  repository has more than one app or package), `PipelineAgentConstitution.md` and `PipelineAgentDesign.md`, in the
  order `stepPromptFilesOf` gives them (`cli/overseer/OverseerWording.ts:713-728`), written as instructions in
  ASD-STE100. It says: under a job the verbs name no setup record; outside a job, the first word after the verb names
  it (`cli/pipeline/AgentCommandLine.ts:1-4`), and the user's own agent starts a record with `pipeline setup` or
  `pipeline update`. It says that the forge keeps an entities draft that has refusals, and that Continue and Apply are
  refused while one stands (decision 44). It lists no command beyond what it cites (`.claude/rules/skills.md:25-29`),
  names `forge help` and `.forge/reference.md`, and names no board page (decision 43).
- Change `apps/forge/src/shared/constants/ProductNames.ts`: `PIPELINE_SETUP_SKILL` (`'forge-pipeline'`, and
  `'agent-pipeline'` in the other product names at `:26-28`), checked against `src/ComponentNames.spec.ts:28-63`.
- Change `apps/forge/cli/adoption/constants/AgentInstall.ts` (stage 2's WP2.30 moved the install table there from
  `ClaudeCodeInstall.ts`): the third instruction bundle, installed into the folder the agent adapter's installer names.
- Change `apps/forge/resources/prompts/PipelineAgentPrompt.md`: the first message runs `{{skill}}` on the setup, as
  `ProductOwnerPrompt.md:1-2` does; the procedure moves to the skill; "the Bridge" (`:3`, `:34`) and
  `PipelineAgentDesign.md:7` become "the board". Change `pipelineAgentTextOf`
  (`cli/overseer/OverseerWording.ts:823-835`, the first message at `:826`) to start with the agent adapter's
  `instructionBundleLineOf(PRODUCT_NAMES.PIPELINE_SETUP_SKILL, …)`, as `productOwnerTextOf` (`:276-286`) does since
  stage 2's WP2.25. The new skill names no agent vendor and no vendor tool: `src/AgentBoundary.spec.ts` scans
  `skills/**` and `resources/**` (stage 2, WP2.22).
- Change `.claude/rules/skills.md`: three skills; the pipeline agent loads its skill as its first line. The rule file
  changes in this commit, with no approval gate (decision 34).
- Raise `INSTALL_VERSION`, update `cli/FrozenInstalledSurface.json`, run
  `bun run record src/services/overseer/InstallChangeWatch.ts`.
- Change `apps/forge/docs/cli.md` and `docs/README.md` where they list the skills.

**What to do.** As listed. The fixed step prompts (`PipelineAgentResearch.md`, `PipelineAgentEntities.md` and the
others) stay as the messages the Overseer sends per step; their rules live in the skill, and each step prompt names the
step only. The installed brief `resources/templates/PipelineAgentBrief.md` keeps its wording here but for "the Bridge"
(`:6`), which stage 8 changes.

**Specs.** `OverseerWording.pipelineAgent.spec.ts`: the first message runs the skill by its installed name.
`InstalledSurface.spec.ts`, `InstalledFiles.spec.ts`: the new folder installed and removed with the others.
`src/ProseWrap.spec.ts` holds the 120-column wrap of the new skill. `cli/HelpText.spec.ts` (no by-hand lifecycle verb
named).

**Done when.** At the root green; in `apps/forge/`: `bun test --path-ignore-patterns='.claude/**'
./cli/overseer/OverseerWording.pipelineAgent.spec.ts ./cli/InstalledSurface.spec.ts` passes and `bun run check` is
clean.

**Parallel.** Any time after stage 5, beside any package that changes no file of `apps/forge/`; never beside WP6.1 or
WP6.22.

## Interfaces introduced

### Forge read API (forge system version: one minor over N9)

| Endpoint (registry name) | Version | Method and path | Access | Answer |
| --- | --- | --- | --- | --- |
| `events` | 1 | `GET /api/v1/events` | bearer token | `text/event-stream`: `handshake` first (no id), then `board`, `job`, `decision`, `incident`, `overseer`, `usage`, `profile`, `pipeline`, each with `id:`; `Last-Event-ID` replays as `/api/events` does |
| `jobs/{jobId}/stream` | 1 | `GET /api/v1/jobs/<jobId>/stream?after=<cursor>` | bearer token | `handshake`, then `history` (id the last cursor, data the entries), then `message` per entry (id its cursor) |
| `profiles/{profileRunId}/stream` | 1 | `GET /api/v1/profiles/<id>/stream?after=<line>` | bearer token | `handshake`, then `line` (id the line number, data `{ text }`) |
| `pictures` | 1 | `POST /api/v1/pictures`, raw bytes | bearer token | `{ pictureId, bytes, mediaType }` or a refusal with its code, fields and sentence |
| `pictures/{pictureId}` | 1 | `GET /api/v1/pictures/<64 hex>` | bearer token | the bytes; `nosniff`, `sandbox`, `no-store` |

`board` (stage 4), `presence` and `crash-log` (stage 3) are unchanged.

```ts
// packages/forge-contracts/@types/BoardStreamHandshake.ts
export interface BoardStreamHandshake {
  readonly systemVersion: SystemVersion; // from system-versions/VersionsDocument
}

// packages/system-versions/utils/CompatibilityRegistryUtil.ts, added
function endpointEntryForPath(registry: readonly CompatibilityEntry[], endpointPath: string, version: number): EndpointEntry | null;
function endpointPathOf(template: string, values: Readonly<Record<string, string>>): string;
// A template segment is `{<name>}`; it matches one non-empty segment of [A-Za-z0-9_.-].
```

### Forge commands in the contract

```ts
// packages/forge-contracts/@types/ForgeControlCommand.ts, WP6.22:
| { readonly kind: 'talos-restart' }

// packages/forge-contracts/constants/ForgeControlCommandKinds.ts, WP6.1:
export const FORGE_CONTROL_COMMAND_KINDS: readonly (ForgeControlCommand | ForgeBoardCommand)['kind'][];
```

`FORGE_CONTROL_COMMAND_KINDS` equals the union of forge's `CONTROL_CONTRACT_KINDS` and `BOARD_COMMAND_CONTRACT_KINDS`,
every member is a kind of `OverseerApiCommand`, and forge's command ingestion maps every member, held by
`OverseerApiContracts.parity.spec.ts`. Gaia's `BoardCommandMapUtil` maps only into members of the list.

`talos-restart`: runtime only; the Overseer quits Talos with reason `restart` and starts the right one; answers
`nothing-to-do` when no Talos runs; never relayed from a job.

`forge version --json` gains `talosProtocolVersion: number` (`answerVersion` raised by one). Stage 3's presence document
gains `talos: { protocolVersion: number; codeVersion: string; startNumber: number } | null`.

### Gaia's board model and ingestion (server side)

```ts
// apps/gaia/src/shared/@types/board/BoardTarget.ts
export interface BoardTarget { readonly tab: BoardTabName; readonly item: string | null }

// apps/gaia/src/shared/@types/board/BoardRefusal.ts
export interface BoardRefusal {
  readonly code:     string;                              // the forge's reason code
  readonly fields:   Readonly<Record<string, JsonValue>>; // the forge's structured fields, as served
  readonly sentence: string;                              // the forge's sentence, the one its command line prints
}

// apps/gaia/src/adapters/forge-api/BoardStateIngestion.ts
boardOf: (trackerId: string, body: unknown) => { readonly board: ForgeBoard } | { readonly board: null; readonly reason: DocumentReadingFailure };
// BoardEventIngestion.eventOf(eventName: string, data: unknown): BoardEvent | null
// ConversationIngestion.historyOf / messageOf / profileLineOf
// CommandAnswerIngestion.answerOf(status: number, body: unknown): BoardCommandAnswer
```

The board model's fields are the inventory of WP6.24 step 1 plus the served facts of N2 and N3. Every forge value list
it reads maps through `VocabularyMapUtil`, a `Record<forge value, Gaia value>` per union.

### Gaia's relay endpoints (Gaia system version: one minor up)

All under `session-or-token`, the Host, Origin and CSP guards, served at `/api/v1/...` and the unversioned path while
the registry keeps it. `{trackerId}` is percent-decoded once and must name a registered forge.

| Key in `GAIA_ENDPOINT_VERSIONS` | Version | Method and path | Body bound | Answer |
| --- | --- | --- | --- | --- |
| `forgeBoard` | 1 | `GET /api/v1/forges/{trackerId}/board` | 65,536 | `BoardDocument`, or `BoardRelayRefusalDocument` |
| `forgeBoardEvents` | 1 | `GET /api/v1/forges/{trackerId}/board/events` | 65,536 | stream: Gaia's `handshake`, then each event as a `BoardEventDocument` under the forge's event name and id |
| `forgeJobStream` | 1 | `GET /api/v1/forges/{trackerId}/jobs/{jobId}/stream?after=` | 65,536 | stream: Gaia's `handshake`, then `history` and `message` as `ConversationDocument` |
| `forgeProfileStream` | 1 | `GET /api/v1/forges/{trackerId}/profiles/{profileRunId}/stream?after=` | 65,536 | stream: Gaia's `handshake`, then `line` |
| `forgePictureUpload` | 1 | `POST /api/v1/forges/{trackerId}/pictures`, raw bytes | `BOARD_PICTURE_UPLOAD_LIMIT_BYTES` | `PictureUploadAnswerDocument` |
| `forgePicture` | 1 | `GET /api/v1/forges/{trackerId}/pictures/{pictureId}` | 65,536 | the bytes, with the forge's content type, `nosniff`, `sandbox`, `no-store` |
| `forgeCommands` | 1 | `POST /api/v1/forges/{trackerId}/commands`, a `BoardCommandDocument` | 65,536 | `BoardCommandAnswerDocument` |
| `forgeCrashLog` | 1 | `GET /api/v1/forges/{trackerId}/crash-logs/{number}` (WP6.21) | 65,536 | `CrashLogDocument`, mapped from `ForgeCrashLogDocument` |

Statuses: 200 answered; 400 a body that is no command Gaia knows; 404 an unregistered forge or an unknown path; 409 a
forge's refusal; 413 a body over its bound; 423 a forge's install hold; 501 a forge version Gaia cannot talk to; 502 a
forge that does not answer, a document that does not ingest, an unreadable token file or a refused token.

```ts
// apps/gaia/src/shared/constants/Limits.ts, added
/** At least the forge's PICTURE_SIZE_LIMIT_BYTES (3,932,160), so the forge's refusal is the one shown. */
export const BOARD_PICTURE_UPLOAD_LIMIT_BYTES = 4_194_304;

// apps/gaia/page/@types/board/BoardRelayDocuments.ts
export type BoardRelayRefusal =
  | 'forge-not-registered' | 'forge-unreachable' | 'forge-version-unsupported' | 'forge-document-unreadable'
  | 'token-unreadable' | 'token-rejected' | 'not-found' | 'too-large' | 'malformed-body' | 'unknown-kind';

export interface BoardRelayRefusalDocument {
  readonly refusal:   BoardRelayRefusal;
  readonly refusedBy: 'gaia';
}

/** The first event of every relayed stream, `event: handshake`, no id. */
export interface BoardStreamHandshakeDocument {
  readonly boardStreamVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoardStream;   // 1
  readonly systemVersion:      { readonly major: number; readonly minor: number }; // Gaia's
  readonly forgeSystemVersion: { readonly major: number; readonly minor: number };
}

/** A refusal as the page shows it: the forge's sentence unchanged, or Gaia's own for a refusal of Gaia's. */
export type BoardRefusalDocument =
  | { readonly refusedBy: 'forge'; readonly code: string; readonly fields: Readonly<Record<string, unknown>>; readonly text: string }
  | { readonly refusedBy: 'gaia'; readonly code: BoardRelayRefusal; readonly text: string };

export type BoardCommandOutcome = 'applied' | 'refused' | 'install-held' | 'unreachable' | 'outcome-unknown';

export interface BoardCommandAnswerDocument {
  readonly boardCommandAnswerVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoardCommandAnswer; // 1
  readonly outcome:                   BoardCommandOutcome;
  /** The forge's `outcome` when applied: `done` or `nothing-to-do`. */
  readonly applied:                   { readonly outcome: 'done' | 'nothing-to-do' } | null;
  readonly refusal:                   BoardRefusalDocument | null;
}

export interface PictureUploadAnswerDocument {
  readonly pictureUploadAnswerVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaPictureUploadAnswer; // 1
  readonly outcome:                    'uploaded' | 'refused';
  readonly picture:                    { readonly pictureId: string; readonly bytes: number; readonly mediaType: string } | null;
  readonly refusal:                    BoardRefusalDocument | null;
}
```

### The page's board contract

```ts
// apps/gaia/src/shared/constants/PageContractVersions.ts (WP6.4), importing nothing
export const PAGE_CONTRACT_VERSIONS = {
  gaiaFleetDocument, gaiaCommand, gaiaCommandAnswer, gaiaHealth,   // moved from CONTRACT_VERSIONS, values unchanged
  gaiaBoard: 1, gaiaBoardCommand: 1, gaiaBoardStream: 1, gaiaBoardCommandAnswer: 1, gaiaPictureUploadAnswer: 1,
} as const;

// apps/gaia/page/@types/board/BoardDocument.ts
export interface BoardDocument {
  readonly boardVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoard;
  // the inventory of WP6.24 step 1, under Gaia's names, and the served facts:
  // attention (each with its target { subject, id }), notices and warnings ({ kind, text, causeText }), today's
  // figures with their calendarDate, open decisions in answering order with the escalated ids, per ticket
  // { offers, resolvedPriority, settlesADependency, isClosed, noAgentHasPickedItUp, reviewRound, isRepeatReview },
  // per job { offers, stopHolds, interruption, waitsFor }, decision options with `recommended`, the pipeline's facts
  // with each entity's effective pipeline and dependents, the entities draft with its entity refusals (row, sentence,
  // fix), the Apply refusal, the step run times, limits and defaults, and (WP6.27) the Assistant's switch.
}

// apps/gaia/page/@types/board/BoardVocabulary.ts: Gaia's unions and the ordered lists the views iterate
export const BOARD_GATE_PHASES: readonly BoardGatePhase[];
export const BOARD_PIPELINE_AGENT_ROLES: readonly BoardPipelineAgentRole[];
export const BOARD_FORGE_LEVEL_AGENT_ROLES: readonly BoardForgeLevelAgentRole[];
export const BOARD_AGENT_EFFORTS: readonly BoardAgentEffort[];

// apps/gaia/page/@types/board/BoardCommandDocument.ts
export type BoardCommandDocument = { readonly boardCommandVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } & (
  | { readonly kind: 'ticket-hold'; readonly ticketId: string }
  // ... one member per kind a board view sends, the forge's kind names, Gaia's payloads
  | { readonly kind: 'pipeline-draft-edit'; readonly setupId: string; readonly edits: readonly BoardDraftEdit[] }
  | { readonly kind: 'interrupted-work-resume'; readonly target: { readonly jobId: string } | { readonly ticketReference: string } | 'all' }
  | { readonly kind: 'pipeline-assistant-set'; readonly on: boolean }   // WP6.27
);
```


### Gaia's forge client (server side)

```ts
// apps/gaia/src/lib/forge-client/OverseerFetch.ts, changed
interface OverseerRequest       { /* ... */ byteBody: { bytes: Uint8Array; mediaType: string } | null; answerAs: 'text' | 'bytes' }
interface AnsweredRequest       { /* ... */ contentType: string | null; bodyBytes: Uint8Array | null }
interface OverseerStreamRequest { /* ... */ lastEventId: string | null }

// apps/gaia/src/lib/forge-client/@types/ForgeClientAnswer.ts, added
export interface ForgeStreamEvent { readonly id: string | null; readonly eventName: string; readonly data: string }
export interface ForgeStreamFollow { readonly ended: Promise<MonitorFollowEnd>; readonly stop: () => void }
export type ForgeBoardCommandAnswer =
  | { readonly verdict: 'answered'; readonly status: number; readonly body: unknown }
  | ForgeClientFailure;
export type ForgePictureUploadAnswer = ForgeBoardCommandAnswer;
export type ForgePictureAnswer =
  | { readonly verdict: 'answered'; readonly status: number; readonly contentType: string | null; readonly bytes: Uint8Array }
  | ForgeClientFailure;

// ForgeClient, added
boardOf:             (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;
followEvents:        (access: OverseerAccess, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
followJobStream:     (access: OverseerAccess, jobId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
followProfileStream: (access: OverseerAccess, profileRunId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
uploadPicture:       (access: OverseerAccess, bytes: Uint8Array, mediaType: string) => Promise<ForgePictureUploadAnswer>;
pictureOf:           (access: OverseerAccess, pictureId: string) => Promise<ForgePictureAnswer>;
sendBoardCommand:    (access: OverseerAccess, body: JsonObject) => Promise<ForgeBoardCommandAnswer>;
presenceOf:          (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;   // WP6.21, stage 3's endpoint
crashLogOf:          (access: OverseerAccess, number: number) => Promise<ForgeDocumentAnswer>; // WP6.21, `crash-log?number=<n>`

// apps/gaia/src/features/page-server/ForgeAccess.ts
export type ForgeAccessVerdict =
  | { readonly verdict: 'access'; readonly access: OverseerAccess; readonly forgeSystemVersion: SystemVersion }
  | { readonly verdict: 'refused'; readonly refusal: Extract<BoardRelayRefusal, 'forge-not-registered' | 'forge-unreachable' | 'forge-version-unsupported' | 'token-unreadable'> };
```

Recording: `overseer-fetch-board` (`src/lib/forge-client/OverseerFetch.board.recording.spec.ts`, system `forge`).

### The page: route, services, preferences

```ts
// apps/gaia/page/board/shell/BoardRouter.ts
export const BOARD_TABS = ['kanban', 'waves', 'progress', 'epics', 'tickets', 'agents', 'questions', 'assistant', 'intake', 'pipeline'] as const;
export type BoardTab = typeof BOARD_TABS[number];
export interface BoardRoute { readonly tab: BoardTab; readonly item: string | null }

// apps/gaia/page/shared/HashRouter.ts, changed
| { readonly view: 'forge'; readonly trackerId: string; readonly boardRoute: BoardRoute | null }
// written and read: #forge/<encoded trackerId>[/<tab>[/<encoded item segments>]]; no other form is read

// apps/gaia/page/board/@types/BoardServices.ts
export interface BoardServices {
  readonly trackerId:            string;
  readonly commandClient:        BoardCommandClient;      // send(command: BoardCommandDocument) => Promise<CommandOutcome>
  readonly pictureUploadClient:  PictureUploadClient;     // upload(file: Blob) => Promise<PictureUpload>
  readonly openEventStream:      (handlers: EventStreamHandlers) => { close: () => void };
  readonly followTranscript:     TranscriptFollower;
  readonly followProfileLog:     ProfileLogFollower;
  readonly storage:              () => PreferenceStorage;
  readonly now:                  () => Date;
  readonly questionNotifier:     QuestionNotifier;        // through page/notifications/NotificationBoundary.ts
  readonly goTo:                 (fragment: string) => void;
  readonly flintFrameSource?:    FlintFrameSource;
  readonly onFlintHandle?:       (handle: FlintHandle | null) => void;
}

// apps/gaia/page/board/shell/BoardTabViews.tsx
export const BOARD_TAB_VIEWS: Readonly<Partial<Record<BoardTab, (props: BoardTabViewProps) => ReactNode>>>;
```

`CommandOutcome`, `PictureUpload`, `EventStreamHandlers`, `ConnectionState`, `TranscriptFollower` and
`ProfileLogFollower` keep the Bridge's shapes (`bridge/api/CommandClient.ts:14-22`, `PictureUploadClient.ts:10-15`,
`EventStreamClient.ts:14-22`), typed against Gaia's page board contract.

Board preferences in browser storage: `gaia:board:<trackerId>:<choice name>`, the choice names the Bridge uses
(`tab`, `seen-incident-defaults`, the Kanban's filter choices, Flint's habitat). No Bridge key is read.

### Fleet document (WP6.21, WP6.26, WP6.22)

```ts
// apps/gaia/page/@types/FleetDocument.ts, added to FleetDocumentForge
presence:        FleetDocumentPresence;
crashSummary:    FleetDocumentCrashSummary | null;       // the registry's, only for a crashed forge
crashLogs:       FleetDocumentCrashLogEntry[];           // listed by the presence document of a live forge
waitingWork:     FleetDocumentWaitingJob[];              // empty for a forge not answering
outageEndings:   number;                                 // jobs waiting after a network outage
runningVersions: FleetDocumentRunningVersions | null;    // null for a forge not answering

// added to the fleet document
outageEndingsTotal: number;

export type FleetDocumentPresenceState = 'serving' | 'hung' | 'stopped' | 'handed-over' | 'crashed' | 'down' | 'unknown';
export interface FleetDocumentPresence {
  state:              FleetDocumentPresenceState;
  generation:         number | null;
  at:                 string | null;          // shown only
}
export interface FleetDocumentCrashSummary {
  component:          'overseer' | 'talos';
  suspected:          boolean;                // a crash suspected before a reboot
  errorName:          string | null;
  errorMessage:       string | null;
}
export interface FleetDocumentCrashLogEntry {
  number:             number;                 // the crash log's own number, the key of its route
  generation:         number | null;          // the Baton generation that crashed, shown only
  component:          'hephaestus' | 'talos' | 'unknown';
  suspected:          boolean;
  recordedAt:         string;                 // shown only
}
// The crash log itself is answered on request by a Gaia route of its own (WP6.21), mapped from ForgeCrashLogDocument.
export interface FleetDocumentWaitingJob {
  jobId:     string;
  kind:      string;
  ticketIds: string[];
  cause:     string;                          // e.g. 'network-outage', 'lease-ended', 'reboot', 'forge-crashed'
  waitsFor:  'instruction' | 'answer' | 'decision' | 'nothing' | 'never';
}
export interface FleetDocumentRunningVersions {
  overseerRunning: string;                    // codeVersion of the identity
  overseerNewest:  string | null;             // codeVersion of `forge version --json`
  talosRunning:    { protocolVersion: number; codeVersion: string } | null;
  talosNewest:     number | null;             // talosProtocolVersion of `forge version --json`
}

// FleetDocumentAttentionKind gains 'forge-crashed' | 'forge-down' | 'forge-hung' | 'agents-ended-on-outage';
// FleetDocumentActionLabel gains 'Start'.
```

`fleetVersion` and the `fleet` and `events` endpoints are raised as Gaia's rules require for a changed document.

### Gaia commands (page to Gaia's server)

```ts
// apps/gaia/page/@types/CommandDocument.ts
| { kind: 'forge-interrupted-work-resume'; trackerId: string; target: { jobId: string } | { ticketReference: string } | 'all' }
| { kind: 'forge-unpause'; trackerId: string }                      // replaces 'forge-resume' (WP6.21)
| { kind: 'forge-talos-restart'; trackerId: string }
| { kind: 'fleet-outage-resume' }                                   // WP6.26, no tracker id
// removed in WP6.23: 'forge-open-in-browser'
```

Forwarded as the forge's `interrupted-work-resume` (stage 3), its unpause kind, `talos-restart`, and, per answering
forge, `interrupted-work-resume` with the outage target. The answer of `fleet-outage-resume` holds one entry per forge:
`{ trackerId, outcome: 'resumed' | 'nothing-to-do' | 'refused' | 'not-reached', resumedCount, refusalText }`.

### Forge installed surface (WP7.2)

- A third skill, source folder `skills/agent-pipeline/`, installed as `PRODUCT_NAMES.PIPELINE_SETUP_SKILL`
  (`forge-pipeline`; `agent-pipeline` under the other product names) into the folder the agent adapter's installer
  names for an instruction bundle (`AgentInstaller.instructionBundleFolderOf`, stage 2's WP2.30; `.claude/skills/` for
  Claude Code).
- `INSTALL_VERSION` raised once.

## Traps

- **Gaia's page may not reach forge's code or the contract.** A Bridge file imports `../../src/...` in 152 shipping
  files. Copying it with a rewritten relative path to `apps/forge/`, or with `forge-contracts` in place of the model,
  compiles and breaks decision 51. The page also reaches `forge-contracts` through `CONTRACT_VERSIONS` today
  (`ContractVersions.ts:8-9`), which the page project includes: WP6.4 splits it before any board file lands, and the
  import guard reads the shared files the page includes.
- **A forge rule copied into a view.** About 50 status comparisons, the status sets, the review-round fallback, the
  default priority and the stop holds decide what a view offers today. Copied, Gaia shows the rules of the forge
  whose code it copied, not of the forge it reads. Read the served fact; where a view seems to need a rule the forge
  does not serve, stop and report it (stage 4 serves it), never re-encode it in Gaia.
- **Served offers can differ from the hand-written ones.** `DetailControlsModel`'s copy of move legality may already
  disagree with the forge's. Stage 4's parity spec lists each difference (WP6.12 step 3); the forge's offers win.
- **Sending each entities edit at once changes the step's feel.** A gesture that leaves the draft refused is now
  stored by the forge and shown with its refusal, not held on screen. Disable Continue from the served refusals, and
  never from a local check; the forge refuses Continue and Apply itself.
- **The double map costs per event.** Every board change re-sends the whole board (`EventBroker.ts:125` ends with
  `send('board', state)`), and Gaia ingests and maps it twice. Map each event once per forge for every open stream
  (WP6.3 step 4); the board's size on a large forge is not measured (Not established, item 9).
- **Three type sets drift only at compile time.** The contract, Gaia's model and the page contract each declare the
  board. A change in the contract shows as a type error in the ingestion's `ShapeOf` and the vocabulary records, and
  nowhere else; keep both typed against the contract so the compiler, not a reviewer, finds it.
- **Today's figures follow the forge's publish rhythm.** They are served with the `calendarDate` they counted, and a
  reader shows them only on that date. Gaia shows zero figures on another date until the forge republishes, and counts
  nothing itself.
- **Wording has one owner per kind of text.** Counts, times and state words are Gaia's; refusals, notices, warnings
  and attention meta are the forge's. No type catches a view that words a forge sentence itself; review each moved model
  for string templates that restate a forge rule.
- **A refusal sentence may name a command.** The forge serves the sentence its command line prints, and Gaia shows it
  verbatim (decision 45, Gaia rule 4 as WP6.4 amends it). Do not route a refusal through `ForgeSentenceUtil`; a notice
  or a warning still goes through it.
- **The header's pipeline model drags the pipeline view in.** `PipelineViewModel.ts` reaches seven more files of
  `views/pipeline/`, one a component that emits classes. Moved without them in WP6.8, the page project does not
  compile; moved without their rules, the board's style contract fails (WP6.8 moves both).
- **Versioned paths match literally today.** `requestAtUnversionedPath` looks up `<endpoint>@<version>` in a set
  (`OverseerServer.ts:612-619`); a registry entry `jobs/{jobId}/stream` never equals `jobs/J1/stream`. Match by
  template (WP6.1 step 1), or every stream path at `/api/v1/` answers 404.
- **The handshake must not move the replay cursor.** The board stream replays from `Last-Event-ID`
  (`OverseerServer.ts:414`). A handshake written with an `id:` line would become the browser's last id after a
  reconnect and lose the replay. Write it with no id, in the forge and in Gaia's relay alike.
- **The relay must forward `Last-Event-ID` and `after`.** Without them a reconnect gets a fresh `board`, and a reopened
  transcript panel gets the whole history again; the Bridge's clients rely on both (`TranscriptStreamClient.ts:1-4`).
  `OverseerFetch` sends no such header today (`OverseerFetch.ts:18-24`).
- **One upstream per page stream, closed with it.** A relay stream that does not stop its forge follow when the page
  closes holds a connection to the Overseer for good; the server's graceful stop then waits on it
  (`PageServer.ts:272-276`). Track every relay stream in `BoardStreams` and close all at stop.
- **Bun's body limit is per server.** `maxRequestBodySize` is 65,536 for every route (`PageServer.ts:90`, `:254`);
  pictures up to 3,932,160 bytes are refused before any route runs. Raising it raises it everywhere: bound each route's
  read yourself (WP6.3 step 3).
- **The command endpoint keeps its own status for an install hold.** The Bridge reads `423` as `install-held`
  (`CommandClient.ts:48`); `ForgeClient.send` collapses every non-200 to a refusal (`ForgeClient.ts:96-102`). Use
  `sendBoardCommand`, which keeps the status.
- **Tokens stay in the server.** A relay that forwards the forge's headers or error bodies verbatim can leak the bearer
  token into the page or a log. Build every answer from the ingested body; never copy request headers back.
- **The Bridge's DOM specs need a document; Gaia's page specs have none.** Put every `.dom.tsx` under `page/board/` and
  run them only through `page/testing/RunDomSpecs.ts`, each in a fresh global; a DOM spec picked up by `bun test`
  pollutes Gaia's main run. The runner must use Gaia's preload (`src/testing/TestRunPreload.ts`), which moves `HOME`
  and `TMPDIR` into `.scratch/`, and the leak check then judges the DOM run too.
- **Style contracts disagree.** Gaia's contract forbids Gaia's own keyframes and styles exactly `gaia.css`'s classes
  (`page/StyleContract.spec.ts:1-11`); the Bridge's CSS has 22 keyframes and 764 classes. Moving them into `gaia.css`
  fails the contract. Keep them in `page/styles/board/` under the board section (WP6.4).
- **Class renames must be complete.** `StyleContract` scans literal `className` values. A `bridge-` class left in a
  component and renamed in its stylesheet fails late and by surprise; rename both in the same step and grep for
  `bridge-` afterwards. Also rename the `data-*` and custom properties a stylesheet reads by the old prefix.
- **One Flint per document.** `createFlint` refuses a second Flint on a document (`.claude/rules/flint.md:25`). Two
  boards mounted at once, or a board mounted before the previous one unmounted, break Flint silently. Key the board
  root by tracker id so React unmounts before it mounts.
- **The Notification API needs a boundary.** `QuestionAlerts.browserQuestionNotifier()` reaches `Notification` directly
  in the Bridge; `page/notifications/NotificationBoundary.ts` is its one module. No other page module may name
  `Notification`.
- **"Resume" means two things today.** Gaia's `forge-resume` undoes a pause; this stage adds Resume for interrupted
  work. Rename the pause's undo to "Unpause" (WP6.21) before any Resume of work is drawn beside it.
- **A forge off after a crash serves no API.** Its alert reads only the registry's crash summary; reading the store is
  forbidden to Gaia. The full log is read through the API once the forge serves, once per generation, never on a
  timer.
- **The outage control must stay clickable.** A disabled state while a forge is down or nothing waits breaks decision
  35. Draw it always enabled and let the answer say what happened per forge.
- **A forge may not name its client.** Every forge change here (WP6.1, WP6.22, WP7.2) passes `src/ClientNames.spec.ts`:
  no "Gaia" and no "fleet" in forge code, docs or installed text. The neutral words are "the board", "a monitor",
  "a host".
- **Retired names.** `HostRecord`, `HostFleet`, `agent-host` and others are retired (`ComponentNames.spec.ts:28-63`); a
  new name such as `BoardHostRecord` contains one. Check every new identifier and file name.
- **Overseer stays Overseer in words.** The rename is stage 9's. A Gaia word "Hephaestus" now is a second rename later.
  Talos is Talos from its first line.
- **The frame header hide changes the Bridge.** It is the only Bridge change in stage 6 (WP6.9). Keep the Bridge's own
  style guards green (`apps/forge/bridge/StyleContract.spec.ts` and the three others) and do not hide the head outside
  frame mode: `forge open` still opens the full Bridge until stage 8.
- **An unmoved tab in the frame and a moved tab natively hold two event streams** to the same forge while the
  migration runs: the frame's own and the relay's. That is expected until WP6.23; do not share them.
- **Version raises collide.** Stages 2, 3 and 4 each raise the forge's minor; WP6.1 and WP6.22 each raise it again;
  Gaia's `SUPPORTED_FORGE_VERSION` must follow each time with fresh recordings, or `bun run check` warns and the
  recordings go stale. Gaia's own `commands` endpoint rises in WP6.21, WP6.26 and WP6.23, and `fleetVersion` in WP6.9,
  WP6.21, WP6.26, WP6.22 and WP6.23. Raise by one over the value found, never to a number written here.
- **`bun install --frozen-lockfile` fails after a dependency change** until `bun.lock` is committed. Run `bun install`
  in the package that adds a dependency and commit the lock with it; never edit `package.json` to make a check pass.
- **Stage 3's start gate.** A start from the login item refuses after a crash; a user's start does not. Gaia's Start of
  a crashed forge is the user's start (`forge start --json`), never `oversee --detach` (Gaia rule 5).
- **No recording waits for a real interval.** The relay's heartbeat and the streams' reopen delays are injectable; the
  specs fire them with `ManualTimers`.

## Verification of the whole stage

At the repository root:

```
bun install --frozen-lockfile
bun run verify
```

Both green, with no warning from Gaia's `check` about the supported forge version and no stale recording stamp.

The specs that matter most, each in its workspace folder:

- `apps/forge/`: `bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/OverseerServer.spec.ts
  ./src/shared/constants/OverseerApiContracts.parity.spec.ts ./cli/InstalledSurface.spec.ts
  ./cli/overseer/OverseerWording.pipelineAgent.spec.ts ./src/ClientNames.spec.ts ./src/ComponentNames.spec.ts`.
- `packages/system-versions/` and `packages/forge-contracts/`: `bun test`.
- `apps/gaia/`: `bun test src/lib/forge-client src/adapters src/features src/WholeFlow.spec.ts page`, then
  `bun run test:dom` (every DOM spec of `page/board/`, at least the 77 the Bridge has minus the brain's cases, plus the
  new ones), then `bun run check`.

The end-to-end check on a scratch forge, as Gaia's rules name it:

1. In `apps/gaia/`, record every forge recording from the forge of the same worktree, never the main checkout's:

   ```
   GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record overseer-fetch-supported-forge
   ```

   then the same for `overseer-fetch-flint-brain`, `overseer-fetch-versions`, `overseer-fetch-board`, `forge-program`
   and `forge-registry`. Each starts the forge under a scratch home with `FORGE_ROOT` pinned, drives it with the fake
   agent and leaves nothing behind (the leak check names what is left).
2. `src/WholeFlow.spec.ts` drives the server over those recordings: open the board as Gaia's page document, follow its
   events, send a command and read a refusal in the forge's sentence, upload a picture and send `job-message` naming
   it, follow the job stream, and resume the jobs that ended on an outage across two forges.
3. The by-eye pass: paint the artboards of `page/Screens.visual.spec.ts` (B1 now Gaia's bar, the board header and a
   moved view; the outage alert; a crashed forge with its crash log), in light and dark, and compare with the design
   boards; a difference that reads better stays and is listed.
4. In `apps/forge/`: `bun run record src/services/overseer/OverseerServer.ts` and
   `bun run record src/services/overseer/InstallChangeWatch.ts` are fresh.
5. `grep -rn "<iframe\|frame-session\|sessionCodeOf" apps/gaia/src apps/gaia/page` prints only the sandboxed HTML
   frame of `page/board/sandboxed-html/`, and `git grep -n "forge-contracts\|apps/forge" -- apps/gaia/page ':!*.md'`
   prints nothing.

## Out of scope

- Deleting `apps/forge/bridge/`, the bundle build, `BrowserSessions`, the session routes, the frame-ancestor reading
  (`cli/overseer/routes/FrameOrigins.ts`), the embed channel's forge side and Flint's ask route: stage 8.
- Retiring `forge open` and the `progress.html` stub, and the wording that names a board page: stage 8 (decision 43).
- Folding `design-system`, `flint` and `brand` into Gaia's page `lib/`: stage 8 (decision 52).
- The forge's side of every served fact, the entities draft and the refusal sentences: stage 4. The forge's side of
  outage endings, the lease, line bounds and run times: stage 2. Presence, resume and the crash log: stage 3.
- The Assistant's switch in forge: stage 8 (WP8.9). This stage offers it in Gaia (WP6.27).
- A Gaia screen that edits a ticket's content or puts a committed ticket back into draft: after this run (decisions 22
  and 48). Forge's side, `ticket-edit` and `ticket-unready`, is stage 5's; the screen adds both to the contract.
- Raising the forge's major, and what happens to the unversioned API paths: stage 8.
- Moving Markdown rendering (`bodyHtml`, `descriptionHtml`) out of the forge: stage 8 decides; the views keep reading
  the forge's HTML through the sandboxed frame.
- Renaming Overseer to Hephaestus in words, identifiers, the registry's `overseer` and `progressHtml` keys and the
  command kinds: stage 9.
- Redesigning Gaia's own fleet views (Attention, Agents, Activity, Forges) or merging Gaia's selected-agent panel with
  the board's job panel; making a design-system component of a board part. Propose either as a follow-up.
- Notifications (Gaia backlog W5.6) beyond routing the existing question alerts through the boundary.
- Showing a forge on another machine (decision 18 leaves it for later).

## Needs the owner

No question of behaviour is open for this stage: the owner's answers of 2026-11-18 settle every one it raised. What
only the owner can do:

1. **The fake agent's outage scenario** (gate G1, stage 2's WP2.2). No session may start a vendor session, so the
   recorded session that ends on a network outage, which the fake agent replays, is the owner's. WP6.26's recorded
   situation needs it; WP6.26 stops at that step and reports if it does not exist when the package runs.

## Not established

1. Whether Gaia's CSP with no `frame-src` source still lets the sandboxed `srcdoc` frame load its stylesheets and
   follow the theme. Not run; prove it in WP6.23's spec or keep `frame-src 'self'`.
2. Whether Gaia's launcher counts a second tab or window opened with `window.open` as a window of Gaia's
   (`src/features/launcher/BrowserWindowWatch.ts`); not read beyond the launcher's header.
3. The exact HTTP statuses of the forge's picture refusals (`OverseerRoutes.ts:173-175` builds them through
   `pictureUploadAnswerOf`, not read).
4. Whether every Bridge DOM spec passes under Gaia's preload and leak check; none has run.
5. The names stages 2, 3, 4 and 8 give each need N1 to N10: the defaults come from the plans in this folder, not from
   code, since none of those stages is built.
6. Whether the scratch forge can be brought into an install-change hold for the `423` recording.
7. Whether `Bun.build` of Gaia's page resolves the board stylesheets' `url(...)` references the same way the Overseer's
   build of the Bridge does.
8. Whether the forge's HTTP server answers while a pass hangs. If it does not, a hung forge reads as down, which
   decision 38 allows; if it does, Gaia shows it as hung from the served supervision fact.
9. The board document's size on a large forge, and so the cost of mapping it twice per event; no recorded board of a
   large forge exists.
10. Whether a refusal sentence the forge's command line prints names a command, which Gaia then shows (decision 45).
11. The design of the unified forge route beyond the current artboard B1, the outage alert and the crash log panel; no
    design board for them is at hand.
