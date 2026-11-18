# Stage 6 and 7: Gaia hosts the views, and conversations with hosted agents

## Goal

Every view of the Bridge is Gaia's own: one forge is drawn under Gaia's route `#forge/<trackerId>/<tab>[/<item>]`, at
full size in Gaia's window or in a browser tab of its own, reading the forge's API and sending its commands only through
Gaia's server, and no forge page is embedded by iframe and no forge session code is asked for. Gaia alerts when a forge
crashed or is down and lists the work that waits for an instruction, shows a job that ended on a network outage, and
shows the running and the newest version of the Overseer and of Talos with a clean restart of each. The user talks to
an intake session and to a pipeline setup session in Gaia (`job-message` in, the job stream out, pictures through the
upload route), and pipeline setup has a skill of its own, which the hosted pipeline agent and the user's own agent run
alike.

## Depends on

Stages 0 to 5 must be finished. This stage reads their results by role; their exact names may differ from the ones
below. Before WP6.1, open the code and the stage plans in this folder, write down the name each item below got, and use
that name everywhere this file uses the default. Where an item is missing, stop and report it; do not build it here.

| Need | What it must be | From | Used by |
| --- | --- | --- | --- |
| N1. The packages | Stage 0's decided package names. Defaults (`stage-0-1-trace-and-base.md`, WP0.5 item 4): `packages/tracker-model` (today's `apps/forge/src/lib/tracker-model/`), `packages/board-readings` (today's `src/shared/monitor/`, `src/lib/token-count/`, `src/lib/local-time/`, `src/lib/html-escape/`), and the board documents in `packages/forge-contracts` | stage 0, built in stage 4 | WP6.1, WP6.4 to WP6.20, WP7.1 |
| N2. The Bridge's 33 shipping imports of `src/` reachable by package name | Each module listed in "Today's code", row "The Bridge's shipping imports of forge's `src/`", importable as `tracker-model/<entry>`, `board-readings/<entry>` or `forge-contracts/<entry>`, DOM-safe | stage 4 | WP6.4 onwards |
| N3. The board document and the board commands | The served `BoardState` at `GET /api/v1/state` (registry endpoint `state` at version 1, stage 4's WP4.4); the documents the Bridge's views read, moved from `apps/forge/bridge/@types/` into `forge-contracts/BoardStateDocument`, `BoardLimitsDocument`, `ConversationDocuments`, `DetailBoardState`, `EpicsBoardState`, `KanbanBoardState`, `ProgressBoardState`, `TicketsBoardState` (stage 4's WP4.6), held against the server by `BoardState.documents.spec.ts` (WP4.8); and the 34 kinds the Bridge sends as `ForgeBoardCommand` in `forge-contracts/BoardCommand`, pinned by `BOARD_COMMAND_CONTRACT_KINDS` (stage 4's WP4.5) | stage 4 | WP6.1, WP6.3, WP6.6 |
| N4. Talos in the identity | `talosProtocolVersion` in the identity document, replacing `watcherProtocolVersion` (`OverseerServer.ts:637`) | stage 2 | WP6.22 |
| N5. The clean quit for a restart | Talos's `quit` frame with reason `restart` (stage 2, `TalosQuitReason`), after which the Overseer starts Talos again and the paused agents resume by themselves | stage 2 | WP6.22 |
| N6. The outage cause | The interruption cause `network-outage` on a job (stage 2, WP2.11), served as the job's `interruption` in the board document (`apps/forge/bridge/views/agents/AgentJobDocument.ts:44-45`) | stage 2 | WP6.11, WP6.21 |
| N7. Presence | `GET /api/v1/presence` (`ForgePresenceDocument`, with `interruptedWork[].waitsFor`), the registry entry's `presence` key (`state: 'serving' \| 'stopped' \| 'handed-over' \| 'off-after-crash'`), and the command `interrupted-work-resume` in `packages/forge-contracts` | stage 3, WP3.3, WP3.8, WP3.12 | WP6.21 |
| N8. The forge system version | `FORGE_SYSTEM_VERSIONS.current` as stages 2, 3 and 4 left it (each raised the minor once; 1.4 if nothing else moved it; stage 5 raises none) | stages 2, 3, 4 | WP6.1, WP6.2 |

What this stage hands on:

- To stage 8 (shrink the HTTP surface): no client of the forge's session routes (`/api/session-codes`, `/api/session`,
  `/api/session-token`), of the embed channel or of the frame-ancestor records is left in Gaia; Gaia writes no
  frame-ancestor record, and Gaia reads no forge's `embed` contract (WP6.23). `apps/forge/bridge/`, the bundle build,
  `BrowserSessions`, the session routes, the forge's side of the embed machinery, Flint's ask route, `forge open` and
  the `progress.html` stub stay in forge for stage 8 to delete (WP8.4 retires `open` and the stub, whose page is served
  until WP8.1).
- To stage 9 (rename): every word Gaia shows still says "Overseer"; the command kinds added to the contract keep their
  `overseer-*` names.

## Decisions this stage carries out

- **11.** Gaia shows each question with its context, its choices and its recommendation (WP6.10).
- **13.** Gaia offers the instruction that resumes interrupted work, per job, per ticket or for everything (WP6.21).
- **14.** Gaia alerts that a forge crashed and offers to start it; it never restarts one by itself (WP6.21).
- **15.** Gaia shows a job that ended on a network outage, as Talos reported it (WP6.11, WP6.21).
- **18.** One interface server, in Gaia: every view is served by Gaia's server (WP6.3 onwards).
- **19.** Gaia reads the forge through its versioned read API and forwards instructions through the command endpoint
  (WP6.1 to WP6.3).
- **21.** Gaia warns when a forge goes down (WP6.21).
- **22.** Every change the views make is a command to the command endpoint (WP6.1, WP6.5).
- **23.** Intake and pipeline setup are hosted sessions with a conversation in Gaia, and pipeline setup gets a skill, as
  intake has one (WP7.1, WP6.20, WP7.2).
- **25.** Flint's brain is not moved: only the sprite moves (WP6.7).
- **26.** The work the Bridge offered is done through Gaia (all of stage 6).
- **27.** One design and one interface, a forge maximized in the window or in a tab of its own, nothing embedded by
  iframe (WP6.9, WP6.23).
- **28.** The Bridge's code moves into Gaia; `apps/forge` stays the core (WP6.4 to WP6.20).
- **31.** Gaia shows the running and the newest version of the Overseer and of Talos and restarts each cleanly
  (WP6.22).
- **32.** Gaia's frame, its frame session, the embed channel and the frame-ancestor record go outright, with no
  fallback for an unmoved tab once every tab has moved (WP6.23).
- **33.** No package is created here: the views live in `apps/gaia/page/board/`, and the only packages named are those
  stage 0 decided (N1).
- **34.** Orchestrated Opus sessions do every package below, outside both trackers.

## Today's code

Paths from the repository root. "Moved" means: copied into Gaia, while the Bridge's copy keeps running until stage 8
deletes it.

| What exists | Where | What happens to it |
| --- | --- | --- |
| The Bridge: 525 tracked files, 67 DOM specs (`.dom.tsx`) | `apps/forge/bridge/` (`git ls-files apps/forge/bridge \| wc -l`) | Moved, view by view, into `apps/gaia/page/board/`; the Bridge itself is deleted in stage 8 |
| The Bridge's views and their sizes: pipeline 121 files and 20 DOM specs, progress 32/4, detail-panel 30/2, agents 27/2, intake 23/3, kanban 13/2, question-panel 7/1, merge-queue 7/1, epics 7/1, waves 6/1, questions 6/1, tickets 4/1, assistant 4/1, finished-work 2/1 | `apps/forge/bridge/views/*/` | Moved, one work package per view (WP6.10 to WP6.20, WP7.1) |
| The Bridge's infrastructure: shell 56 files/12 DOM specs, flint 35/8, conversation 26/4, utils 38/0, testing 23, api 21, chips 9/1, @types 9, sandboxed-html 3, preferences 2 | `apps/forge/bridge/<folder>/` | Moved in WP6.5 to WP6.9; `api/` rewritten for Gaia's relay; the embed channel, session code exchange, identity reload and Flint's brain are not moved |
| The tab list: `kanban`, `waves`, `progress`, `epics`, `tickets`, `agents`, `questions`, `assistant`, `intake`, `pipeline` | `apps/forge/bridge/shell/HashRouter.ts:12` | Kept as the board's tab list in Gaia (`BoardRoute`) |
| Which tabs show: Waves without a dependency, Epics without an epic, only Pipeline without a readable pipeline | `apps/forge/bridge/shell/HashRouter.ts:60-64` | Moved unchanged |
| The services the shell takes (command client, Flint's brain client, picture upload, event stream, identity, reload, storage, embed mode, transcript and profile followers, question notifier) | `apps/forge/bridge/shell/BridgeApp.tsx:88-110` | Replaced by `BoardServices` (Interfaces) without brain, identity, reload and embed |
| The shell reloads the page when the Overseer's `codeVersion` changes | `apps/forge/bridge/shell/BridgeApp.tsx:199-230` (reload at `:225`) | Deleted in Gaia: Gaia's page is Gaia's bundle; a forge version change is the forge verdict's business |
| The frame side of the embed channel (`ready`, `route`, `session-lost`, `navigate`) | `apps/forge/bridge/shell/BridgeApp.tsx:574-614`, `shell/VersionedEmbedChannel.ts`, `shell/EmbeddedChannel.ts` | Not moved; used by Gaia's frame only while a tab is unmoved |
| Flint's brain controls hidden | `apps/forge/bridge/shell/BridgeApp.tsx:137` | Not moved: no brain part reaches Gaia (decision 25) |
| The entry: fonts, theme and embed mode before first paint, session code exchange, one root | `apps/forge/bridge/Main.tsx:28-62` | Replaced by the board root under Gaia's own entry |
| The API paths the Bridge calls | `apps/forge/bridge/api/EventStreamClient.ts:34`, `CommandClient.ts:28`, `PictureUploadClient.ts:21`, `TranscriptStreamClient.ts:66`, `ProfileStreamClient.ts:31`, `SessionTokenSource.ts:22`, `IdentityClient.ts:6`, `FlintBrainClient.ts:51`, `SessionCodeExchange.ts:21-22`, `views/intake/PictureAttachmentsModel.ts:48` | Each rewritten to a Gaia relay route (WP6.5); session token, identity, session and brain paths are dropped |
| The board event kinds the client listens to | `apps/forge/bridge/api/EventStreamClient.ts:11` | Kept; a new `handshake` event is ignored by the Bridge, which listens by name |
| The Bridge's shipping imports of forge's `src/` (33 modules): the tracker model's `@types/{Draft,GatePhase,Job,LogRecord,Pipeline,PipelineFacts,PipelineSetup,Task,Ticket,TicketForecast,TrackerProgress}`, `constants/{AgentSettings,ConcurrencyLimits,JobStopHolds,PipelineDefaults,ReviewRounds,Statuses,TicketFields}`, `utils/TicketDefaultsUtil`; `src/lib/{html-escape,local-time,token-count}`; `src/shared/monitor/{@types/MonitorSnapshot,AttentionEntries,TodayFigures,utils/BridgeFragmentUtil,utils/DraftWordingUtil,utils/NoticeWordingUtil,utils/OpenDecisionsUtil}`; `src/shared/constants/{DispatchProtocol,OverseerApiContracts,OverseerLimits,ProductNames}` | `grep -rhoE "from '(\.\./)+src/[^']+'"` over the Bridge's shipping files | Read from the packages of N1/N2; the four `src/shared/constants` modules are not imported by Gaia (Traps, "Forge constants") |
| Forge constants the pipeline view reads as code: `WORKER_MODEL`, `WORKER_EFFORT`, `DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES` | `apps/forge/bridge/views/pipeline/dialogs/AgentStepDialogModel.ts:9`, `flow/PipelineFlowModel.ts:19`, `dialogs/RereviewSettingsModel.ts:8` | Changed: served as facts in the board document (WP6.1) |
| Browser storage keys `<STORAGE_PREFIX>:<trackerId>` | `apps/forge/bridge/preferences/PreferenceStore.ts:6`, `.claude/rules/bridge.md:63-64` | Moved under Gaia's own prefix (WP6.5) |
| Agent-written HTML only as a sandboxed frame's `srcdoc`, with the page's stylesheet addresses | `apps/forge/bridge/sandboxed-html/SandboxedHtmlFrame.tsx:1-6`, `SandboxedHtmlDocument.ts:13-21` | Moved; not an embedded forge page |
| The Bridge's stylesheets: `board.css` (2,787 lines, 638 `bridge-` classes, 22 `@keyframes`), `tokens.css` (73 tokens) | `apps/forge/bridge/styles/` | Moved per view into `apps/gaia/page/styles/board/` with `board-` class names (WP6.4 onwards) |
| Frame mode hides only the title row | `apps/forge/bridge/styles/board.css:537-540` | Changed in WP6.9: frame mode hides the Bridge's whole head, while unmoved tabs still show in the frame |
| The Bridge's DOM spec runner and happy-dom preload | `apps/forge/bridge/testing/RunDomSpecs.ts:19-20`, `bridge/testing/HappyDom.ts`; `apps/forge/package.json:18` | Copied for Gaia (WP6.5) |
| The Overseer's data routes: state, events, monitor, job stream, profile stream, job files, pictures, session token | `apps/forge/src/services/overseer/OverseerServer.ts:535-552` | Kept; state has its versioned path from stage 4 (WP4.4); events, job stream, profile stream and pictures get theirs (WP6.1) |
| Only registered endpoints are served at `/api/v<n>/`; the match is on the literal path | `OverseerServer.ts:601-606`, `:612-619` | Changed: templated endpoints (`jobs/{jobId}/stream`) match (WP6.1) |
| The registry serves identity, summary, monitor, monitor/events, commands, session-codes (and stage 3's presence and stage 4's state) | `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:38` onwards | Changed: five endpoints added (WP6.1) |
| The board event stream writes no handshake; the monitor stream does | `OverseerServer.ts:410-421`; `:423-426`, `:437-447` | Changed: the board, job and profile streams open with a handshake (WP6.1) |
| A command carries whether a Bridge session sent it, read only by Flint's brain | `OverseerServer.ts:250`; `apps/forge/cli/overseer/routes/CommandRoute.ts:128` | Kept until stage 8; Gaia's relay never holds a Bridge session |
| The picture upload: raw body, token, bounded read, 3,932,160 bytes | `OverseerServer.ts:254-284`; `apps/forge/src/shared/constants/OverseerLimits.ts:132-135` | Kept, versioned as `pictures` (WP6.1) |
| The contract's command kinds: 9 | `packages/forge-contracts/@types/ForgeControlCommand.ts:9-18` (plus stage 3's `interrupted-work-resume`, and stage 4's 34 board kinds in `forge-contracts/BoardCommand`) | Changed: one list of every kind a client may send (WP6.1); `talos-restart` added (WP6.22) |
| The forge's command union, 76 kinds | `apps/forge/src/shared/@types/ControlCommand.ts:66-226`, `OverseerApiCommand` at `:239`; stage 3 adds one kind, stage 4 takes 34 from `ForgeBoardCommand`, stage 5 adds 16 by-hand kinds the endpoint refuses | Kept; a parity spec holds the contract's kinds against it (WP6.1) |
| Gaia's server routes, every body bounded at 65,536 bytes by Bun | `apps/gaia/src/features/page-server/PageServer.ts:90`, `:130-198`, `:254` | Changed: board relay routes, a per-route body bound (WP6.3) |
| Gaia's CSP frames any loopback port | `apps/gaia/src/lib/local-http-guards/ContentSecurityPolicy.ts:11`; `PageServer.ts:240` | Changed in WP6.23: no frame source |
| The frame session route: a session code from the Overseer with the forge's token, answered as the Bridge's address | `apps/gaia/src/features/page-server/routes/FrameSessionRoute.ts:1-103` | Deleted (WP6.23); its registry and readings check is generalised first (WP6.3) |
| Gaia's forge client: versions, identity, summary, monitor, monitor stream, commands, session codes | `apps/gaia/src/lib/forge-client/ForgeClient.ts:53-60`, `:123-215` | Changed: board reads, streams, pictures (WP6.2); session codes deleted (WP6.23) |
| The HTTP boundary takes a JSON body only and sends no `Last-Event-ID` | `apps/gaia/src/lib/forge-client/OverseerFetch.ts:8-24` | Changed: a byte body, a byte answer, `Last-Event-ID` (WP6.2) |
| Gaia supports forge 1.1 | `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9` | Changed to the version WP6.1 serves (WP6.2) |
| Gaia's endpoint versions and system version 1.1 | `apps/gaia/src/shared/constants/GaiaSystemVersions.ts:15`, `:30-38` | Changed: relay endpoints, a minor raise (WP6.3), the commands route's change (WP6.23) |
| Gaia's contract versions | `apps/gaia/src/shared/constants/ContractVersions.ts:13-31` | Changed: three relay contracts (WP6.3); `forgeEmbedChannel`, `forgeFrameAncestorRecord`, `gaiaFrameSession` deleted (WP6.23) |
| Gaia's forge route carries the Bridge's fragment verbatim: `#forge/<trackerId>/#questions/E2` | `apps/gaia/page/shared/HashRouter.ts:10`, `:46-53`, `:106-109` | Changed: `{ trackerId, boardRoute }` (WP6.9) |
| The forge in place: Gaia's bar over the Bridge's frame, frame session, embed channel, "Open in new tab" | `apps/gaia/page/views/forge-frame/` (`ForgeFrameView.tsx:129`, `ForgeFrameSession.ts`, `EmbedChannel.ts`, `FrameSessionRequest.ts`) | Changed: the frame stays only for unmoved tabs (WP6.9), then is deleted (WP6.23); the bar stays |
| Routes into a forge from Gaia's own views | `apps/gaia/page/shell/RailModel.ts:75`, `views/attention/AttentionModel.ts:236-237`, `views/activity/ActivityModel.ts:190`, `views/agents/AgentsModel.ts:185-186`, `views/agents/BrainModel.ts:171` | Changed to `boardRoute` (WP6.9) |
| "Open in new tab" runs `forge open` | `apps/gaia/src/adapters/page-api/GaiaCommandIngestion.ts:52-63` (`forge-open-in-browser`), `apps/gaia/src/features/forge-control/ForgeControl.ts:309-310`, `apps/gaia/src/adapters/forge-program/ForgeProgram.ts:40`, `:74` | Replaced: the page opens Gaia's own route in a new tab (WP6.9); the kind is deleted (WP6.23) |
| Gaia writes the frame-ancestor record `<monitor>/frame-ancestors/gaia.json` | `apps/gaia/src/adapters/gaia-files/ServerRecordWriter.ts:1-3`, `:43-45` | Deleted in WP6.23 |
| Gaia's page has no DOM specs and no `test:dom` task | `apps/gaia/CLAUDE.md:70-75` (rule 10); `apps/gaia/package.json:10-18` | Changed: `test:dom` for `page/board/` (WP6.5), rule 10 amended (WP6.4) |
| Gaia draws no Flint | `apps/gaia/CLAUDE.md:86-92` (rule 12) | Changed: Flint in the forge route only (WP6.4, WP6.7) |
| Gaia's page imports: views never the shell, shared never the shell or a view | `apps/gaia/page/PageImportDirection.spec.ts:15-18` | Changed: `board` added (WP6.4) |
| Gaia's style contract: classes, tokens, contrast, no keyframe of Gaia's own | `apps/gaia/page/StyleContract.spec.ts:1-11` | Changed: a board stylesheets section (WP6.4) |
| The Notification API has no boundary in Gaia yet | `apps/gaia/CLAUDE.md:125` | Created with the question alerts (WP6.8) |
| The registry entry Gaia reads | `apps/gaia/src/adapters/forge-registry/@types/RegisteredForge.ts:12-23` | Changed: stage 3's `presence` (WP6.21) |
| The fleet document's forge: `codeVersion`, `versions` | `apps/gaia/page/@types/FleetDocument.ts:165-196` | Changed: presence, interrupted work, Talos and newest versions (WP6.21, WP6.22) |
| `forge open`: starts the Overseer when none is live, opens the Overseer's URL with a session code | `apps/forge/cli/tracking/open/OpenCommand.ts:1-90`, `cli/CommandTable.ts:40` | Kept: it opens the Bridge, which forge serves until stage 8; deleted in stage 8 (WP8.4). Gaia stops running it (WP6.9, WP6.23) |
| The `progress.html` stub, written by `init`, `update` and `oversee` | `apps/forge/src/adapters/progress-page/ProgressPageStubWriter.ts:10-30`; `cli/adoption/WriteProgressPageStub.ts:8-10`; `cli/adoption/init/InitCommand.ts:103`, `:173`; `cli/adoption/update/UpdateCommand.ts:69`; `cli/overseer/OverseerForeground.ts:174` | Kept; deleted in stage 8 (WP8.4) |
| The installed instruction "Run `{{program}} open` once per session" | `apps/forge/resources/templates/SessionInstructions.md:26` | Kept; deleted with `open` in stage 8 (WP8.4) |
| `INSTALL_VERSION = 29` | `apps/forge/cli/constants/InstallVersion.ts:1` | Raised once in WP7.2 |
| Two skills: `agent-po`, `agent-progress-orchestrate` | `apps/forge/skills/`; `apps/forge/cli/adoption/constants/ClaudeCodeInstall.ts:23`, `:32-35`; `apps/forge/src/shared/constants/ProductNames.ts:11-12`, `:26-27`, `:40-41` | Changed: a third skill for pipeline setup (WP7.2) |
| The product owner's first message runs its skill | `apps/forge/resources/prompts/ProductOwnerPrompt.md:1-2`; `apps/forge/cli/overseer/OverseerWording.ts:176` | Kept; the pipeline agent's first message does the same (WP7.2) |
| The pipeline agent loads no skill | `.claude/rules/skills.md:21-24`; `apps/forge/resources/prompts/PipelineAgentPrompt.md:1-48`; `OverseerWording.ts:460` | Changed (WP7.2) |
| Pipeline agent verbs outside a job name the setup record | `apps/forge/cli/pipeline/AgentCommandLine.ts:1-4` | Kept: the user's own agent runs the skill through them |
| Installed and prompt wording names the Bridge | `PipelineAgentPrompt.md:3`, `:34`; `PipelineAgentDesign.md:7`; `resources/templates/PipelineAgentBrief.md:6`; `resources/templates/Reference.md:245`; `skills/agent-po/SKILL.md:142`; `skills/agent-progress-orchestrate/SKILL.md:75` | The pipeline agent's prompts changed to a neutral word (WP7.2); the rest, which name the Bridge while it still runs, in stage 8 (WP8.12) |
| A question's recommendation is a mark on an option's label | `apps/forge/bridge/views/question-panel/QuestionPanelModel.ts:228`; `DecisionDocument` at `bridge/@types/ConversationDocuments.ts:27-36` | Kept as the source unless the forge serves a field (Needs the owner, item 7) |
| No shipped forge file names a client | `apps/forge/src/ClientNames.spec.ts:24` | Kept: every forge change here names no client |
| Retired component names | `apps/forge/src/ComponentNames.spec.ts:28-63` | Kept: every new name checked against it |
| The Overseer's server is a recorded boundary | `apps/forge/src/testing/BoundarySpecs.ts:138` | Recorded again after WP6.1 |
| Forge guards that name the Bridge: DOM specs only under `bridge/`, its include list | `apps/forge/src/TestFileConventions.spec.ts:108`, `:122`; `apps/forge/src/ProjectIncludeLists.spec.ts:38` | Kept: the Bridge stays until stage 8 |

## Work packages

### Order and parallel map

```
WP6.1 (forge) ──► WP6.2 ──► WP6.3 ──────────────┐
      │                                         ▼
      ├──► WP6.4 (any time after WP6.1) ──► WP6.5 ──► WP6.6 ──► WP6.7 ──► WP6.8 ──► WP6.9
      │                                                                              │
      └──► WP7.2 (forge, any time)                                                   ▼
                                         WP6.10, WP6.11, WP6.12, WP6.18, WP6.19, WP7.1  (in parallel)
                                         WP6.12 ──► WP6.13, WP6.14, WP6.15, WP6.16, WP6.17 (in parallel)
                                         WP6.19 ──► WP6.20
      WP6.3 ──► WP6.21 (after WP6.9 for its forge-route part) ──► WP6.22
      all views, WP6.21, WP6.22 ──► WP6.23
```

- Run alone: WP6.1 to WP6.3, WP6.5 to WP6.9, WP6.23. WP6.4 may run beside WP6.2 and WP6.3. It changes
  `apps/gaia/page/tsconfig.json`, `page/tsconfig.spec.json`, `page/PageImportDirection.spec.ts`,
  `page/StyleContract.spec.ts`, `apps/gaia/package.json`, `apps/gaia/eslint.config.js`, `apps/gaia/CLAUDE.md`, the root
  `CLAUDE.md` and `bun.lock`. WP6.2 and WP6.3 change none of them; under `apps/gaia/page/` WP6.3 only creates
  `page/@types/BoardRelayDocuments.ts`.
- The view packages WP6.10 to WP6.20 and WP7.1 touch disjoint folders. Each also adds one line to
  `apps/gaia/page/board/shell/BoardTabViews.tsx`, one `<link>` line to `apps/gaia/page/index.html` and one row to the
  board section of `apps/gaia/page/StyleContract.spec.ts`' stylesheet list. Those three lines are the only overlap:
  each package rebases on the latest main before it lands and keeps the other packages' lines.
- WP7.2 touches only `apps/forge/` (skills, prompts, templates, `cli/adoption`, `ProductNames.ts`, the install version,
  `docs/cli.md`) and `.claude/rules/skills.md`; it may run beside any package that changes no file of `apps/forge/`,
  which is every package of this stage but WP6.1 and WP6.22. It is the one package of this stage that raises
  `INSTALL_VERSION` and re-records `InstallChangeWatch`.
- WP6.21 and WP6.22 both change `FleetDocument.ts`, its map util and the forge bar: they run one after the other.

### The transplant procedure

WP6.5 to WP6.20 and WP7.1 move Bridge code by these steps. Each package names its files; the steps are the same.

1. Copy each named file from `apps/forge/bridge/<path>` to `apps/gaia/page/board/<path>` (the same relative path below
   `board/`). Leave the Bridge's file unchanged: the Bridge keeps running until stage 8.
2. Rewrite imports. `../../src/lib/tracker-model/<path>` becomes the `tracker-model` package's entry;
   `src/shared/monitor/*`, `src/lib/{token-count,local-time,html-escape}` the `board-readings` package's;
   `forge-contracts/*`, `design-system/*`, `flint*` and `brand/*` stay as they are. Imports between Bridge files stay
   relative and resolve inside `page/board/`. Never import a file of `apps/forge/`.
3. Rename what names the Bridge. Identifiers: `BridgeApp` → `BoardApp`, `BridgeClock` → `BoardClock`,
   `BridgeClockContext` → `BoardClockContext`, `BridgeFlint` → `BoardFlint`, `BridgeTab` → `BoardTab`,
   `BRIDGE_TABS` → `BOARD_TABS`, `BridgeRoute` → `BoardRoute`, `BridgeErrorBoundary` → `BoardErrorBoundary`, and every
   other `Bridge` in an identifier to `Board`. CSS classes, keyframes and custom properties: the prefix `bridge-`
   becomes `board-` (`grep -rn "bridge-" page/board page/styles/board` prints nothing when done). Words shown to the
   user that say "Bridge" become "board". Words that say "Overseer" stay (stage 9). Check each new name against
   `apps/forge/src/ComponentNames.spec.ts:28-63`.
4. Replace the Bridge's services with `BoardServices` (Interfaces). A component that read `services.<x>` reads the
   same member of `BoardServices`; a member that `BoardServices` lacks (brain, identity, reload, embed) is removed with
   the code that used it.
5. Copy each module's plain spec beside it. A spec that imports forge's `src/testing/*` gets a fixture under
   `page/board/testing/` instead, copied from the Bridge's `testing/` folder. Copy each `.dom.tsx` spec beside its
   module; `page/testing/RunDomSpecs.ts` (WP6.5) runs it.
6. Copy the module's style rules: the rules of `apps/forge/bridge/styles/board.css` whose selectors name a class the
   copied components emit, into `apps/gaia/page/styles/board/<view>.css`, renamed as in step 3; the tokens of
   `apps/forge/bridge/styles/tokens.css` they read into `apps/gaia/page/styles/board/tokens.css`. Find the classes
   with `grep -ohE "className=[^>]+" <files>` and the rules with the selector text. Create
   `page/styles/board/tokens.css` if it does not exist yet and link it in `apps/gaia/page/index.html` after
   `./styles/gaia.css`. Link the new stylesheet after `./styles/board/tokens.css`, and add both to the board stylesheet
   list of `apps/gaia/page/StyleContract.spec.ts`.
7. Run, from `apps/gaia/`: `bun run typecheck`, `bun run lint`, `bun test page/board/<folder>`, `bun run test:dom`;
   then `bun run verify` at the root.

Every package's "Done when" includes, at the repository root: `bun install --frozen-lockfile` and `bun run verify`, both
green. A package that changes dependencies runs `bun install` first and commits `bun.lock` in the same change.

### WP6.1 The forge serves the board streams and pictures at versioned paths, and lists every kind a client sends

**Purpose.** Gaia calls only versioned paths (`apps/gaia/CLAUDE.md:30-33`). Stage 4 served the board state at
`/api/v1/state` and put the board documents and the 34 board command kinds into the contract (N3). The board event
stream, the job stream, the profile stream and the pictures are still served only at their unversioned paths
(`OverseerServer.ts:535-552`, `:612-619`). This package makes them a versioned, recorded contract that Gaia can build
on, and gives Gaia's relay one list of every kind a client may send.

**Files.**

- Change `packages/system-versions/utils/CompatibilityRegistryUtil.ts` and its spec: endpoint templates.
- Change `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts` and its spec: five entries.
- Change `packages/forge-contracts/constants/ForgeSystemVersions.ts`: one minor up.
- Create `packages/forge-contracts/constants/ForgeControlCommandKinds.ts`: the list of every kind a client may send,
  the control kinds of `ForgeControlCommand` and the board kinds of stage 4's `ForgeBoardCommand`, so Gaia's relay can
  name a kind it does not carry. Export it in `packages/forge-contracts/package.json`.
- Create `packages/forge-contracts/@types/BoardStreamHandshake.ts`: the handshake of the three streams. Export it.
- Create `apps/forge/src/shared/constants/OverseerApiContracts.parity.spec.ts`: the contract's kinds against
  `OverseerApiCommand` (`apps/forge/src/shared/@types/ControlCommand.ts:239`), beside the pins it compares. No
  `@types` folder of forge holds a spec today, so the spec is an aspect suite of `OverseerApiContracts.ts`.
- Change `apps/forge/src/services/overseer/OverseerServer.ts`: templated matching and the stream handshakes.
- Change the board document's assembly (`apps/forge/src/services/overseer/BoardState.ts`) and its type
  `forge-contracts/BoardStateDocument` (N3): `pipelineChoices` carries the worker defaults and the rework threshold;
  `BoardState.documents.spec.ts` (stage 4's WP4.8) keeps holding.
- Change `apps/forge/docs/reference/overseer-api.md`: "Versioned paths", "The event stream", "The transcript stream",
  "System versions".
- Re-record `apps/forge/src/testing/recordings/<os>/` for the boundary `src/services/overseer/OverseerServer.ts`.

**What to do.**

1. In `CompatibilityRegistryUtil`, add `endpointEntryForPath(registry, endpointPath, version)`: the endpoint entry whose
   `endpoint` matches `endpointPath` at `version`, or `null`. A template segment is `{<name>}` and matches one
   non-empty segment of the characters `[A-Za-z0-9_.-]`, the characters the Overseer's own path patterns accept
   (`OverseerServer.ts:170-173`); a literal segment matches itself. Add `endpointPathOf(template, values)`, which
   fills each `{<name>}` from `values` with `encodeURIComponent` and throws on a missing value (a caller's defect).
   `entrySentencesOf` (`:42`) refuses a template with an empty name or two equal names.
2. In `ForgeCompatibilityRegistry.ts`, with the helper `endpointAddedIn` (stage 3's WP3.12, used for `state` by stage
   4's WP4.4), add five entries at version 1, introduced in the new forge version: `events`, `jobs/{jobId}/stream`,
   `profiles/{profileRunId}/stream`, `pictures`, `pictures/{pictureId}`. `state` is stage 4's and stays as it is. Add no
   entry for `jobs/{jobId}/files/...`: no view reads a job file (`grep -rn "gate.log\|report.json" apps/forge/bridge`
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
6. The board kinds the views send are in the contract already: stage 4's `ForgeBoardCommand`
   (`forge-contracts/BoardCommand`), with `ChartRangeRequest`, `TrackerClearScope` and `PipelineFieldEdit` declared
   there (N3). Add no kind to `ForgeControlCommand.ts` here; `talos-restart` joins it in WP6.22. Re-measure the kinds a
   Bridge view sends with stage 4's guard `bridge/CommandKindsInContract.spec.ts`; a kind it names outside both lists is
   added to `ForgeBoardCommand` and `BOARD_COMMAND_CONTRACT_KINDS` in this package.
7. `ForgeControlCommandKinds.ts` exports `FORGE_CONTROL_COMMAND_KINDS`, a frozen list of every kind of
   `ForgeControlCommand | ForgeBoardCommand`, typed `readonly (ForgeControlCommand | ForgeBoardCommand)['kind'][]`, with
   a spec in the package that holds it exhaustive (a `satisfies` record keyed by every kind). Forge's own pins,
   `CONTROL_CONTRACT_KINDS` and `BOARD_COMMAND_CONTRACT_KINDS`
   (`apps/forge/src/shared/constants/OverseerApiContracts.ts`), stay; the parity spec holds their union equal to this
   list.
8. The parity spec: for each kind `K` of `FORGE_CONTROL_COMMAND_KINDS`, a type-level check that the contract's member
   of kind `K` and `OverseerApiCommandOf<K>` are assignable both ways (a helper type `MutuallyAssignable<A, B>`
   resolving to `true`; stage 4's `CommandRoute.boardContract.spec.ts` checks one way only), a runtime check that every
   listed kind is a kind of the forge's union, and that the list equals the union of forge's two pins.
9. Board document facts: add to the `pipelineChoices` the pipeline view reads (`forge-contracts/BoardStateDocument`,
   today's `bridge/@types/BoardStateDocument.ts:185`) three fields, `workerModel`, `workerEffort` and
   `reworkRoundThresholdLines`, filled from `WORKER_MODEL`, `WORKER_EFFORT` (`OverseerLimits.ts`) and
   `DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES`. Only adds. The Bridge keeps reading its constants; Gaia reads the
   facts (WP6.19).
10. Update `overseer-api.md` for the new versioned paths, the handshake and the facts.
11. Run `bun run record src/services/overseer/OverseerServer.ts` in `apps/forge/` and commit the recording. The
    headless Bridge spec in that boundary skips without Chrome (`.claude/rules/bridge.md:65-66`).

**Specs.**

- `CompatibilityRegistryUtil.spec.ts`: a template matches a concrete path of the same length; it refuses an empty
  segment, an extra segment and a `%`-escape; `endpointPathOf` fills and encodes; a template with two equal names is an
  inconsistency.
- `ForgeCompatibilityRegistry.spec.ts`: the five entries at version 1, introduced in the new minor, each needed by a
  client of the current version; stage 4's `state` entry unchanged.
- `OverseerServer.spec.ts`: `GET /api/v1/state` still answers as stage 4 left it;
  `GET /api/v1/jobs/J1/stream` and `/api/v1/profiles/P1/stream` reach their routes; `/api/v2/state` and
  `/api/v1/jobs/J1/extra` are 404; each of the three streams writes the handshake before any other event, with no id;
  a `Last-Event-ID` replay on `/api/v1/events` behaves as on `/api/events`.
- The parity spec as in step 8, and the contract's kinds spec as in step 7.
- The board state spec: the three new facts are present with the constants' values.

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
2. `ForgeClient`: extend `OVERSEER_ENDPOINTS` (`:53-60`) with `state`, `events`, `jobStream: 'jobs/{jobId}/stream'`,
   `profileStream: 'profiles/{profileRunId}/stream'`, `pictures`, `picture: 'pictures/{pictureId}'`. Build each path
   with the endpoint's version from `forgeEndpointVersionOf` and `endpointPathOf`. Add:
   - `boardStateOf(access)`: `ForgeDocumentAnswer` of `GET state`;
   - `followEvents(access, lastEventId, onEvent)`, `followJobStream(access, jobId, after, lastEventId, onEvent)`,
     `followProfileStream(access, profileRunId, after, lastEventId, onEvent)`: each a `ForgeStreamFollow` (Interfaces)
     that hands each whole event (`id`, `eventName`, `data` text) to `onEvent` and never an unfinished one; `after` goes
     into the query as `after=<value>` when not null. Generalise `followMonitor` (`:160-210`) into one private
     `followEventStream(access, path, lastEventId, onEvent)` that all four use;
   - `uploadPicture(access, bytes, mediaType)`: `ForgePictureUploadAnswer`;
   - `pictureOf(access, pictureId)`: `ForgePictureAnswer` with the bytes, the content type and the status;
   - `sendBoardCommand(access, body: JsonObject)`: `ForgeBoardCommandAnswer`, which keeps the forge's status
     (`200`, `423` for an install hold, any other for a refusal) and its parsed body, unlike `send`, which reads only
     `outcome`.
3. Raise `SUPPORTED_FORGE_VERSION` to the version WP6.1 set.
4. The recording spec `overseer-fetch-board` starts a scratch forge through `src/testing/ScratchForge.ts` as
   Example Storefront, as `SupportedForgeRecording.ts` does, and records: the state with the token and without;
   the events stream's handshake and first `board` event, and a reconnect with the first event's id as
   `Last-Event-ID`; the job stream of a product owner job the fake agent plays (start it with `intake-start` through
   `sendBoardCommand`, with one picture uploaded first); the profile stream of one gate profile run
   (`gate-profile-start`); a picture accepted, one refused as too large and one refused as no picture type, and the
   accepted picture read back; a command applied (`ticket-hold`), refused (`ticket-hold` of an unknown ticket) and
   refused with `423` while launches are held for an install change, if the scratch forge can be brought into that
   state (as the existing `command-refused` situation is brought); an unknown kind. Every value the run draws is an
   example value, as the existing recordings do.
5. Run, in `apps/gaia/` of the package's worktree, for each forge recording, so the recording runs that worktree's
   forge and never the main checkout's:

   ```
   GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record <name>
   ```

**Specs.** `ForgeClient.spec.ts`: every new call against `RecordedAnswers` for each recorded situation; a stream hands
on only whole events; a closed or broken stream ends its follow with its ending; a call with no recorded answer fails;
the token is the bearer of every request and appears in no answer. `OverseerFetch` keeps its contract: a byte answer
keeps its content type.

**Done when.** At the root `bun install --frozen-lockfile` and `bun run verify` green, and Gaia's `check` no longer
warns that the supported version is behind. In `apps/gaia/`: `bun test src/lib/forge-client` passes.

**Parallel.** Alone in `apps/gaia/src/`; WP6.4 and WP7.2 may run beside it.

### WP6.3 Gaia's server relays a forge's board to the page

**Purpose.** The page reads a forge and sends its commands only through Gaia's server (decision 19, Gaia rule 6:
tokens stay in the server).

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
- Create `apps/gaia/page/@types/BoardRelayDocuments.ts`: the page contract of the relay (Interfaces).
- Create `apps/gaia/src/adapters/page-api/BoardRelayAnswerMapUtil.ts` and spec.
- Change `apps/gaia/src/shared/constants/GaiaSystemVersions.ts`, `GaiaCompatibilityRegistry.ts`,
  `ContractVersions.ts`, and `apps/gaia/docs/contracts.md` ("Gaia's endpoints", "Versioned contracts"),
  `apps/gaia/docs/architecture.md`.
- Change `apps/gaia/src/Main.ts` where it wires `PageServerOptions`.

**What to do.**

1. `ForgeAccess.forgeAccessVerdictFor(trackerId, sources)` answers
   `{ verdict: 'access'; access: OverseerAccess; forgeVersions }` or a `BoardRelayRefusal` (Interfaces). It reads the
   registry and the token file at each call, never caches a token, and never puts it into an answer or a log line.
2. Routes, each `access: 'session-or-token'`, each matched by a function as the frame session route is
   (`PageServer.ts:189-196`), each at version 1 under a new key of `GAIA_ENDPOINT_VERSIONS`:
   - `GET /api/v1/forges/{trackerId}/board` (`forgeBoard`): the forge's state body passed through unchanged with
     `content-type: application/json` and `cache-control: no-store`, or a refusal;
   - `GET .../board/events` (`forgeBoardEvents`), `GET .../jobs/{jobId}/stream` (`forgeJobStream`),
     `GET .../profiles/{profileRunId}/stream` (`forgeProfileStream`): an event stream that opens with Gaia's
     `handshake` event (`BoardStreamHandshake`, Interfaces), then re-emits each forge event with its `id` and its
     event name and its data unchanged, and drops the forge's own `handshake` after checking it names the version the
     watch read. Forward the page's `Last-Event-ID` and the `after` query to the forge. Write Gaia's heartbeat as the
     fleet stream does (`src/lib/event-stream/ServedEventStream.ts`). When the forge's stream ends, end the page's
     stream; when the page closes, stop the forge's follow. `isStream: true` for all three;
   - `POST .../pictures` (`forgePictureUpload`): the raw body, read to `BOARD_PICTURE_UPLOAD_LIMIT_BYTES`, forwarded
     with its content type; answered as `PictureUploadAnswerDocument`;
   - `GET .../pictures/{pictureId}` (`forgePicture`): the bytes with the forge's content type,
     `x-content-type-options: nosniff`, `content-security-policy: sandbox`, `cache-control: no-store`;
   - `POST .../commands` (`forgeCommands`): a JSON object read to 65,536 bytes whose `kind` is in
     `FORGE_CONTROL_COMMAND_KINDS`, forwarded unchanged with `sendBoardCommand`, answered as
     `BoardCommandAnswerDocument`. The forge validates the rest; Gaia never interprets a field but `kind`.
3. A route's body bound: add `maximumBodyBytes` to `PageServerRoute` (`PageServer.ts:70-83`), 65,536 for every route
   but the picture upload. Set Bun's `maxRequestBodySize` (`:254`) to `BOARD_PICTURE_UPLOAD_LIMIT_BYTES`, and have the
   commands route (`CommandsRoute.ts:27`) and the session route read through `BoundedBody` so they keep their bound.
4. A forge refusal's text reaches the page through `ForgeSentenceUtil` (`src/adapters/page-api/ForgeSentenceUtil.ts`)
   so no sentence names a command (Gaia rule 4).
5. Raise `GAIA_SYSTEM_VERSION` by one minor (only adds). Add the seven keys to `GAIA_ENDPOINT_VERSIONS` and their
   entries to `GAIA_COMPATIBILITY_REGISTRY`. Add `gaiaBoardStream`, `gaiaBoardCommandAnswer` and
   `gaiaPictureUploadAnswer` at 1 to `CONTRACT_VERSIONS` and to the contracts table, which a spec holds against
   `CONTRACT_VERSIONS`.

**Specs.** Each route spec runs on `RecordedAnswers` (`overseer-fetch-board`) and `ManualTimers`: the board passes
through byte for byte; an unregistered tracker id is `forge-not-registered`; an unreachable forge, a forge at a version
Gaia cannot talk to, an unreadable token file and a refused token are each their refusal; a stream opens with Gaia's
handshake, forwards `Last-Event-ID`, re-emits ids and names unchanged, ends when the forge's stream ends, and closes
the forge's follow when the page goes; the upload refuses a body over the bound without reading it; the command route
refuses an unknown kind and a body that is no JSON object without calling the forge; no answer and no log line holds
the token. `PageServer.spec.ts`: each route at its versioned and unversioned path behind the session guard; a body of
65,537 bytes is refused on the commands route and accepted on the picture route; the server's stop closes every open
relay stream.

**Done when.** At the root green. In `apps/gaia/`: `bun test src/features/page-server src/adapters/page-api
src/lib/local-http-guards` passes, and `src/WholeFlow.spec.ts` passes.

**Parallel.** Alone in `apps/gaia/src/`; WP6.4 and WP7.2 may run beside it.

### WP6.4 Gaia's page gets a home for the board: dependencies, guards and rules

**Purpose.** Prepare `apps/gaia/page/board/` so every later package only adds files: the dependencies, the compiler
and lint setup, the import-direction and style guards, and the rules in `apps/gaia/CLAUDE.md` the move changes.

**Files.**

- Change `apps/gaia/package.json`: add `"flint": "workspace:^"`, `"tracker-model": "workspace:^"`,
  `"board-readings": "workspace:^"` (N1's names). Run `bun install` at the root; commit `bun.lock`.
- Change `apps/gaia/page/tsconfig.json` and `page/tsconfig.spec.json`: include `./board/**`; the spec project includes
  `.dom.tsx`.
- Change `apps/gaia/page/PageImportDirection.spec.ts`: `FORBIDDEN_IMPORTS` gains `board: ['shell', 'views']`
  (`views` may import `board`).
- Change `apps/gaia/page/StyleContract.spec.ts`: a board section (step 4).
- Create no stylesheet yet: the first package that copies a style rule creates `apps/gaia/page/styles/board/tokens.css`
  and links it in `apps/gaia/page/index.html` after `./styles/gaia.css` (the transplant procedure, step 6).
- Change `apps/gaia/eslint.config.js`: browser storage confined (step 5).
- Change `apps/gaia/CLAUDE.md`: rules 10, 11 and 12, the map and the boundaries table (step 6).
- Change the root `CLAUDE.md`: `packages/flint` is both apps' (needs the owner, item 10).

**What to do.**

1. Add the dependencies, `bun install`, and prove `src/WorkspaceDependencies.spec.ts` accepts them.
2. Add `board` to the page's tsconfig include and to the import-direction guard, with a planted case for
   `board → shell` and `board → views`, proved failing then passing.
3. Decide nothing about the look here: create no component.
4. The board section of the style contract reads every stylesheet in a list `BOARD_STYLESHEETS` (initially empty; the
   planted cases prove each guard until real stylesheets arrive) and holds, as the Bridge's guards do for the Bridge:
   every class a shipping component under `page/board/` emits is styled in a board stylesheet and every styled class is
   emitted (`apps/forge/bridge/StyleContract.spec.ts`); no `:hover` or `:active` rule moves or resizes anything
   (`apps/forge/bridge/HoverMovesNothing.spec.ts`); a `prefers-reduced-motion: reduce` rule stops each animation
   (`ReducedMotionStopsEveryAnimation.spec.ts`); braces balance (`StyleBraceBalance.spec.ts`); every token read is
   defined in the design system's, Gaia's or the board's `tokens.css`, each board colour token has a light and a dark
   value (`ThemeTokens.spec.ts`); no colour literal; no board class is `gaia-` and no Gaia class is `board-`; a
   `@keyframes` is named `board-` and appears only in a board stylesheet (Needs the owner, item 2). Plant one case of
   each and prove it fails.
5. `eslint.config.js`: `localStorage` and `sessionStorage` only in `page/board/preferences/PreferenceStore.ts`,
   `page/shell/ThemeBootstrap.ts` and `page/api/FleetStreamClient.ts` (the two that use it today).
6. `apps/gaia/CLAUDE.md`: rule 10 says the board's views under `page/board/` keep their behaviour in `.dom.tsx` specs,
   which `bun run test:dom` runs with a document, and that `page/board/` is styled by `page/styles/board/*.css` under
   the board section of the style contract (Needs the owner, items 1 and 2); rule 11 names `flint` as a dependency;
   rule 12 says Gaia draws Flint only in the forge route, per forge, with no brain (Needs the owner, item 3); the map
   gains `page/board/`; the boundaries table names `page/board/api/` for the relay and keeps the Notification API row
   for WP6.8.

**Specs.** The planted cases of steps 2 and 4.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/PageImportDirection.spec.ts page/StyleContract.spec.ts
src/WorkspaceDependencies.spec.ts` passes.

**Parallel.** May run beside WP6.2 and WP6.3.

### WP6.5 The board's connection: relay clients, the command sender, preferences and the DOM runner

**Purpose.** The page reads and commands one forge through the relay, with Gaia's session.

**Files.** Under `apps/gaia/page/board/` unless stated.

- Create `api/BoardApiPaths.ts`: each relay path from `ApiPathUtil` and `GAIA_ENDPOINT_VERSIONS` (both already in the
  page project, `page/tsconfig.json:13-14`).
- Create from the Bridge, rewritten for the relay: `api/BoardEventStreamClient.ts` (from
  `bridge/api/EventStreamClient.ts`), `api/BoardCommandClient.ts` (from `CommandClient.ts`),
  `api/PictureUploadClient.ts`, `api/TranscriptStreamClient.ts`, `api/ProfileStreamClient.ts`, `api/RefusalOf.ts`,
  `api/constants/StreamReopening.ts`, `api/constants/HttpStatus.ts`, each with its spec adapted.
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
   `handshake` and to `OVERSEER_EVENT_KINDS` (`EventStreamClient.ts:11`). It refuses a handshake whose
   `boardStreamVersion` is not `CONTRACT_VERSIONS.gaiaBoardStream` by closing and reporting `down`. A closed stream
   asks Gaia's session standing as Gaia's fleet stream does (`page/api/FleetStreamClient.ts`) and reports `no-session`
   or `down`; on `no-session` it calls the same `sessionWasLost` the fleet stream's command sender calls
   (`page/Main.tsx:24-27`), so one session banner shows.
2. `BoardCommandClient.send(command)` posts to the relay's commands route and maps `BoardCommandAnswerDocument` to the
   Bridge's `CommandOutcome` (`bridge/api/CommandClient.ts:14-22`): `applied`, `refused`, `install-held`,
   `unreachable`, `outcome-unknown`, `no-session` (a 401 from Gaia). It holds no token.
3. `PictureUploadClient.upload(file)` posts the bytes to the relay with the file's type; `TranscriptStreamClient` and
   `ProfileStreamClient` keep their cursor rules and point at the relay.
4. The pictures' served address (`PictureAttachmentsModel.ts:48`, `:127-128`) becomes the relay's
   `forges/<trackerId>/pictures/<pictureId>` (done in WP7.1, where the file moves).
5. The runner fails when it finds no DOM spec; `ControlCommandSender.dom.tsx` is the first.

**Specs.** The adapted client specs prove each relay path and version, the handshake check, session loss, each outcome
mapping, and that no request carries an `Authorization` header. `ControlCommandSender.dom.tsx` as in the Bridge: a
control is disabled while the stream is down or launches are held, and shows its refusal verbatim. The
`PreferenceStore` spec: keys are per tracker id under Gaia's prefix.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/board/api page/board/shell page/board/preferences` and
`bun run test:dom` pass.

**Parallel.** Alone.

### WP6.6 Shared board parts: documents, utils, chips, sandboxed HTML and the conversation

**Purpose.** Move what several views use, so each view package moves only its own folder.

**Files.** Transplant into `apps/gaia/page/board/`: what stage 4 left of the Bridge's `@types/`, the view models
`DependencyGraph.ts` and `Timeline.ts` (not `FlintBrainBoardState.ts`, the brain's; not `OverseerIdentity.ts`, since
`BoardApp` fetches no identity). The board documents are not copied: every module imports them by name from
`forge-contracts/<Document>` (N3), so Gaia's views read the very types `BoardState.documents.spec.ts` holds against the
server. Also `utils/` (all 38 files), `chips/` (all 9), `sandboxed-html/` (all 3), `conversation/` (all 26), and from
`testing/`: `BoardStateFixture.ts`, `TimestampSlicesFixture.ts`, `FakeControls.ts`, `FakeControlSurroundings.ts`,
`PageLimitsFixture.ts`, `WaitingOnUserFixture.ts`, `StyleRuleReader.ts`, `PageStylesheets.ts` (rewritten to read
`page/styles/board/`). Styles of chips, conversation and sandboxed HTML into `page/styles/board/chips.css`,
`conversation.css`, `sandboxed-html.css`.

**What to do.**

1. Follow the transplant procedure.
2. `SandboxedHtmlFrame` takes the stylesheet addresses from the page's own `<link rel="stylesheet">` elements at run
   time, never from a constant, since Gaia's built page names its files by hash (`PageFilesRoute.ts:1-6`).
3. `utils/StateToneUtil.ts` stays the one map from a `DisplayState` and a job state to a tone
   (`.claude/rules/design-system.md:27-29`).
4. `conversation/ChatThreadModel.ts`, `Composer.tsx`, `DecisionCard.tsx`, `AskItem.tsx` are the parts both
   conversations (WP7.1, WP6.20) and the questions (WP6.10) use; move them unchanged in behaviour.

**Specs.** Every moved plain spec and the 5 DOM specs (`chips/FilterChipGroup.dom.tsx`, `conversation/AskItem.dom.tsx`,
`ChatThread.dom.tsx`, `Composer.dom.tsx`, `ToolUseFold.dom.tsx`) pass in Gaia.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/board` and `bun run test:dom` pass.

**Parallel.** Alone.

### WP6.7 Flint in the forge route

**Purpose.** Flint, the sprite, moves with the views (design section 3.5); its brain does not (decision 25).

**Files.** Transplant `apps/forge/bridge/flint/` into `apps/gaia/page/board/flint/` except `FlintBrainControls.ts`,
`FlintBrainDirector.ts`, `FlintBrainDirector.spec.ts`; `BridgeFlint.tsx` becomes `BoardFlint.tsx` without its
`flintBrain` prop and its brain director; `BridgeFlint.dom.tsx` and `UseBoardOccasions.dom.tsx` lose their brain cases.
`testing/FlintHabitatScene.ts`, `testing/ManualFlintFrames.ts` into `page/board/testing/`. Styles into
`page/styles/board/flint.css`, and the `--flint-*` properties into `page/styles/board/tokens.css` as the Bridge sets
them (`apps/forge/CLAUDE.md:343`).

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
change highlights and item presence. Unrouted until WP6.9.

**Files.** Transplant from `apps/forge/bridge/shell/`: `ActivityStrip.tsx`, `ActivityStripModel.ts`,
`ChangeHighlight.ts`, `ChangedSinceMount.ts`, `ConnectionBanners.tsx`, `CoveringPanel.ts`, `DetailRoute.ts`,
`DetailRouting.ts`, `FinishedWorkFilter.tsx`, `FinishedWorkWindow.ts`, `Header.tsx`, `HeaderModel.ts`,
`IncidentNotice.tsx`, `IncidentNoticeModel.ts`, `ItemPresence.ts`, `NarrowWindowPlacement.ts`,
`QuestionPanelOpener.ts`, `SetupStepBar.tsx`, `WaitingOnUserInbox.tsx`, `WaitingOnUserModel.ts`,
`WaitingOnUserPill.tsx`, `BridgeErrorBoundary.tsx` (as `BoardErrorBoundary.tsx`), `HashRouter.ts` (as
`BoardRouter.ts`: only `BOARD_TABS`, `routeOf`, `fragmentOf`, `shownTabsOf`, `shownRouteOf`; no `window.location`),
with their specs and DOM specs. The view models the header reads, into their future folders:
`views/agents/AgentsModel.ts`, `views/agents/AgentJobDocument.ts`, `views/pipeline/PipelineViewModel.ts`,
`views/pipeline/live/MinimalPipelineNoteModel.ts`, `views/questions/QuestionAlerts.ts`,
`views/questions/QuestionsModel.ts`, `views/questions/NotificationAllowanceControl.tsx`, with their specs. Create
`apps/gaia/page/notifications/NotificationBoundary.ts`, the one module that reaches the Notification API, and route
`QuestionAlerts.browserQuestionNotifier()` through it. Styles into `page/styles/board/shell.css`.

**What to do.**

1. The transplant procedure. Not moved: `FirstPaint.ts`, `ThemeBootstrap.ts`, `ThemeButton.tsx`, `EmbeddedChannel.ts`,
   `VersionedEmbedChannel.ts`, `SessionBannerOf.ts` (Gaia's own connection banner shows a lost session), and
   `DetailPanelHost.tsx` (WP6.12).
2. The header's Overseer controls (stop, restart) are not drawn in Gaia: Gaia's forge bar already offers stop, pause,
   resume and restart through Gaia's own commands (`GaiaCommandIngestion.ts:52-63`). Remove them from `Header.tsx` and
   its model in Gaia, with their specs (Needs the owner, item 8).
3. `ConnectionBanners` drops the session banner; Gaia's `ConnectionBanner` (`page/shell/ConnectionBanner.tsx`) shows a
   lost session for the whole page.
4. Add `apps/gaia/CLAUDE.md`'s boundaries row for the Notification API: `page/notifications/NotificationBoundary.ts`.

**Specs.** The moved specs, among them `Header.dom.tsx`, `IncidentNotice.dom.tsx`, `ItemPresence.dom.tsx`,
`FinishedWorkFilter.dom.tsx`, `ChangedSinceMount.dom.tsx`, minus the cases of the removed controls and banner.
`NotificationBoundary` gets no real-system spec (no spec opens a page); its users are specced with a fake notifier.

**Done when.** At the root green; `bun test page/board/shell page/board/views` and `bun run test:dom` in `apps/gaia/`.

**Parallel.** Alone.

### WP6.9 The forge route: the board at full size, a tab of its own, the frame for unmoved tabs

**Purpose.** One forge maximized as a route of Gaia (decision 27). Tabs that have moved are Gaia's own; tabs that have
not yet moved still show in the frame, with the Bridge's head hidden, so nothing the user has today is lost while the
views move.

**Files.**

- Create `apps/gaia/page/board/shell/BoardApp.tsx` and `BoardApp.dom.tsx` (from `bridge/shell/BridgeApp.tsx` and its
  DOM spec), `apps/gaia/page/board/shell/BoardTabViews.tsx` (the table of moved tabs), `apps/gaia/page/board/Board.tsx`
  (the root a view mounts: services for one tracker id, keyed by it).
- Change `apps/gaia/page/shared/HashRouter.ts` and its spec: `GaiaRoute`'s `forge` view (Interfaces).
- Change `apps/gaia/page/views/forge-frame/` (`ForgeFrameView.tsx`, `ForgeFrameModel.ts`, `ForgeFrameLayout.tsx`,
  `ForgeFrameSession.ts` and specs): the forge view draws Gaia's bar, then `Board` for a moved tab or the frame for an
  unmoved one. Rename the folder to `apps/gaia/page/views/forge/` in this package.
- Change `apps/gaia/page/shell/GaiaApp.tsx` (`:64-71`, `:104-105`, `:229-233`), `RailModel.ts:75`,
  `views/attention/AttentionModel.ts:236-237`, `views/activity/ActivityModel.ts:190`,
  `views/agents/AgentsModel.ts:185-186`, `views/agents/BrainModel.ts:171`, `shared/utils/ForgeContractUtil.ts`
  (`canOpenInPlace`), and their specs.
- Change `apps/forge/bridge/styles/board.css:537-540`: in frame mode hide the Bridge's whole head
  (`.bridge-head` and the banners above it), and `apps/forge/bridge/StyleContract.spec.ts` if a class is newly read.
- Change `apps/gaia/page/testing/ArtboardScreens.tsx` and `page/Screens.visual.spec.ts` where B1 draws the frame.

**What to do.**

1. `BoardApp` is `BridgeApp` without the identity fetch and reload (`:183-230`), the embed channel (`:259-266`,
   `:574-614`), the theme state (Gaia's), Flint's brain (`:319-323`) and the session code outcome. It takes
   `BoardServices` and the `BoardRoute` from Gaia's route, and navigates by Gaia's `goTo` with
   `HashRouter.fragmentOf({ view: 'forge', trackerId, boardRoute })`. It renders a tab's view only when
   `BoardTabViews` lists the tab; for any other tab it renders nothing in its main area and the forge view shows the
   frame there.
2. The forge view: Gaia's bar (as today), then the board header and tab bar (`Header` from WP6.8) for every tab, then
   either the moved view or the frame. The frame keeps its session and embed channel for unmoved tabs, navigated to
   the board route's fragment (`#<tab>/<item>`) as today. The Bridge, in frame mode, now shows no head of its own.
3. The route: `#forge/<trackerId>/<tab>[/<item>]`. Reading also accepts the old form with `#` before the tab
   (`HashRouter.ts:46-53`), so a stored link and the monitor's `route` values (`#questions/E2`) keep working. Writing
   never puts a `#` before the tab. Monitor routes from forge are a board fragment; compose them into a `BoardRoute`
   with `BoardRouter.routeOf`.
4. A tab of its own: "Open in new tab" in the forge bar opens Gaia's own address with the same route in a new tab
   (`window.open(<the page's origin>/#forge/...', '_blank', 'noopener')`) through a surroundings function the specs
   replace. It no longer sends `forge-open-in-browser` (the kind is deleted in WP6.23). The new tab shares Gaia's
   session cookie (same origin) and needs no session code.
5. `BoardTabViews` starts empty: after this package every tab still shows through the frame, under Gaia's header.

**Specs.** `HashRouter.spec.ts`: both forms read, the new form written, a malformed escape reads as no segment.
`BoardApp.dom.tsx`: a tab not in `BoardTabViews` renders no view; the header's tabs navigate through `goTo`; a lost
stream disables controls; the board root remounts for another tracker id. The forge view's specs: the frame is asked
for only for an unmoved tab, never for a moved one; "Open in new tab" opens the route and sends no command.

**Done when.** At the root green; in `apps/gaia/`: `bun test page` and `bun run test:dom` pass; the by-eye pass of
`page/Screens.visual.spec.ts` shows B1 with Gaia's bar and the board header over the frame.

**Parallel.** Alone.

### WP6.10 Questions and the question panel

**Purpose.** The questions view and the panel that shows one question with its context, its choices and its
recommendation (decision 11), over any tab.

**Files.** Transplant `apps/forge/bridge/views/questions/` (remaining files: `QuestionsView.tsx`,
`QuestionsView.dom.tsx`, `QuestionsModel.spec.ts` if not moved in WP6.8) and `views/question-panel/` (7 files);
`flint/QuestionsSpriteHabitat.ts` is already moved (WP6.7); `testing/QuestionPanelFixture.ts`. Styles into
`page/styles/board/questions.css`. One line in `BoardTabViews.tsx`; `BoardApp.tsx` renders `QuestionPanel` as
`BridgeApp.tsx:544-561` does.

**What to do.** The transplant procedure. The recommendation reads the forge's field when the board document carries
one, else the label mark it reads today (`QuestionPanelModel.ts:228`) (Needs the owner, item 7). `#questions/<id>`
opens the panel when the route and the question arrive, as `BridgeApp.tsx:268-274`.

**Specs.** `QuestionsView.dom.tsx`, `QuestionPanel.dom.tsx`, `QuestionPanelModel.spec.ts`; one new case: a question's
context, each option and the recommended option are shown, the recommended one marked.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`; the Questions tab shows without a frame.

**Parallel.** With WP6.11, WP6.12, WP6.18, WP6.19, WP7.1.

### WP6.11 Agents, and a job that ended on a network outage

**Purpose.** The agents view with its job table, panels, transcript, controls and concurrency control; it shows a job
interrupted on a network outage by its own words (decision 15).

**Files.** Transplant `apps/forge/bridge/views/agents/` (27 files; `AgentsModel.ts` and `AgentJobDocument.ts` are
already moved) except `FlintBrainCard.tsx`. Styles into `page/styles/board/agents.css`. One line in `BoardTabViews.tsx`.

**What to do.**

1. The transplant procedure. Drop the brain card and the `flintBrain` and `flintBrainControls` props
   (`BridgeApp.tsx:509-510`).
2. Add the interruption cause `network-outage` (N6) to the job state wording (`utils/JobStateUtil.ts`,
   `utils/DisplayStateWordingUtil.ts`) and to `StateToneUtil`'s record: the word "Network outage", a waiting tone
   (dashed: it waits), never the failure tone (crimson is a failure only, `apps/gaia/CLAUDE.md:86-88`).
3. The job panel of an interrupted job shows what the forge says follows, from the presence document's
   `interruptedWork[].waitsFor` (N7) when WP6.21 has landed, else nothing: `instruction` offers Resume, which sends
   `interrupted-work-resume` with `{ jobId }`; `nothing` says it resumes by itself; `answer`, `decision`, `never` say
   so in words. Gaia decides nothing (Needs the owner, item 6). Until WP6.21 lands, the panel shows only the cause.

**Specs.** `AgentsView.dom.tsx`, `UseAgentPanelHabitat.dom.tsx`, `AgentsModel.spec.ts`,
`AgentPanelSpriteModel.spec.ts`; new cases: a `network-outage` job shows its word and its tone, never the failure
tone; with `waitsFor: 'instruction'` Resume sends the command once; with `nothing` no control shows.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`; the Agents tab shows without a frame.

**Parallel.** With WP6.10, WP6.12, WP6.18, WP6.19, WP7.1.

### WP6.12 The detail panel

**Purpose.** The covering panel of a ticket, a draft, a job, an epic or the merge queue, which every detail tab opens.

**Files.** Transplant `apps/forge/bridge/views/detail-panel/` (30 files), `shell/DetailPanelHost.tsx` (+ DOM spec),
`testing/DetailBoardFixture.ts`, `testing/DetailRoutingFixture.ts`. Styles into `page/styles/board/detail-panel.css`.
`BoardApp.tsx` renders `DetailPanelHost` as `BridgeApp.tsx:436-438`. No line in `BoardTabViews.tsx`: the panel shows
once a detail tab moves (WP6.13 to WP6.17).

**What to do.** The transplant procedure. The ticket moves (`TicketMoves.tsx`, `DetailControls.tsx`, `JobStopMenu.tsx`)
send their kinds through the relay; each kind is in `FORGE_CONTROL_COMMAND_KINDS` (WP6.1). A job interrupted on a
network outage shows its cause as in WP6.11.

**Specs.** `DetailPanelHost.dom.tsx` and the two detail-panel DOM specs; `DetailPanelModel` and `TicketOverviewModel`
plain specs.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`.

**Parallel.** With WP6.10, WP6.11, WP6.18, WP6.19, WP7.1.

### WP6.13 Kanban and the merge queue

**Files.** Transplant `views/kanban/` (13 files) and `views/merge-queue/` (7), `testing/KanbanBoardFixture.ts`. Styles
into `page/styles/board/kanban.css`, `merge-queue.css`. One line in `BoardTabViews.tsx` (`kanban`; the merge queue is
its item `merge-queue`, `BridgeApp.tsx:120-121`). The finished-work filter's Kanban sections
(`KanbanFilterSections.tsx`) move here and are wired into the header's filter as `BridgeApp.tsx:384-397`.

**What to do.** The transplant procedure; the lane highlight from the header's figures as `BridgeApp.tsx:166-169`.

**Specs.** The Kanban and merge-queue DOM and plain specs. **Done when.** At the root green; `bun run test:dom`; Kanban
shows without a frame and opens the detail panel. **Parallel.** With WP6.14 to WP6.17, after WP6.12.

### WP6.14 Tickets

**Files.** Transplant `views/tickets/` (4), `testing/TicketsBoardFixture.ts`; `flint/TicketsSpriteHabitat.ts` already
moved. Styles into `page/styles/board/tickets.css`. One line in `BoardTabViews.tsx`.

**Specs.** `TicketsView.dom.tsx`, `TicketsModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.13, WP6.15 to WP6.17, after WP6.12.

### WP6.15 Progress and finished work

**Files.** Transplant `views/progress/` (32) and `views/finished-work/` (2), `testing/ProgressBoardFixture.ts`. Styles
into `page/styles/board/progress.css`. One line in `BoardTabViews.tsx` (`progress`, which draws both views,
`BridgeApp.tsx:424-429`).

**What to do.** The transplant procedure. `chart-range-set` and `tracker-clear` (`ProgressModel.ts`,
`BoardLifetimeControls.tsx`) go through the relay.

**Specs.** The four progress DOM specs, `FinishedWorkView.dom.tsx`. **Done when.** At the root green;
`bun run test:dom`. **Parallel.** With WP6.13, WP6.14, WP6.16, WP6.17, after WP6.12.

### WP6.16 Epics

**Files.** Transplant `views/epics/` (7), `testing/EpicsBoardFixture.ts`. Styles into `page/styles/board/epics.css`.
One line in `BoardTabViews.tsx`.

**Specs.** `EpicsView.dom.tsx`, `EpicsModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.13 to WP6.15, WP6.17, after WP6.12.

### WP6.17 Waves

**Files.** Transplant `views/waves/` (6). Styles into `page/styles/board/waves.css`. One line in `BoardTabViews.tsx`.

**Specs.** `WavesView.dom.tsx`, `WavesModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.13 to WP6.16, after WP6.12.

### WP6.18 Assistant

**Purpose.** The Assistant's chat. The Assistant stays in the code (decision 24); its view moves so nothing is lost
before stage 8 decides when it starts.

**Files.** Transplant `views/assistant/` (4). Styles into `page/styles/board/assistant.css`. One line in
`BoardTabViews.tsx`.

**Specs.** `AssistantView.dom.tsx`, `AssistantModel.spec.ts`. **Done when.** At the root green; `bun run test:dom`.
**Parallel.** With WP6.10 to WP6.12, WP6.19, WP7.1.

### WP6.19 Pipeline, part 1: the code and its plain specs

**Purpose.** The pipeline view is 121 files whose subfolders import each other in cycles (`setup` ↔ `agent-panel`,
`flow` ↔ `gates` ↔ `live`, `apply` ↔ `editing`), so it cannot move folder by folder. Part 1 moves every file and its
plain specs, compiled and green, but not yet routed.

**Files.** Transplant `apps/forge/bridge/views/pipeline/` whole (the 8 top-level files and `setup/`, `agent-panel/`,
`flow/`, `gates/`, `dialogs/`, `apply/`, `editing/`, `live/`), and `testing/PipelineFixture.ts`. The
`.dom.tsx` specs are copied in WP6.20. `PipelineViewModel.ts` and `live/MinimalPipelineNoteModel.ts` are already moved.

**What to do.**

1. The transplant procedure, steps 1 to 5 for plain specs only.
2. Replace the three forge constants (`AgentStepDialogModel.ts:9`, `PipelineFlowModel.ts:19`,
   `RereviewSettingsModel.ts:8`) with the facts WP6.1 serves in `pipelineChoices`.
3. `ProfileLogFollowerContext.ts` takes the follower from `BoardServices.followProfileLog`.

**Specs.** Every plain `*Model.spec.ts` of the pipeline passes in Gaia; one new case per replaced constant: the model
reads the served fact.

**Done when.** At the root green; in `apps/gaia/`: `bun test page/board/views/pipeline` passes.

**Parallel.** With WP6.10 to WP6.12, WP6.18, WP7.1.

### WP6.20 Pipeline, part 2: styles, DOM specs, the route, and the setup conversation

**Purpose.** The pipeline tab is Gaia's own: setup, the live flow, editing, apply, gate profiles with their log, and
the pipeline agent's panel, the conversation with the hosted pipeline setup session (decision 23).

**Files.** Copy the pipeline's 20 DOM specs; styles into `page/styles/board/pipeline.css`; one line in
`BoardTabViews.tsx`; `BoardApp.tsx` passes `followProfileLog` and the setup stepper's route as `BridgeApp.tsx:523-533`.

**What to do.**

1. The transplant procedure, steps 5 to 7.
2. While the board has no readable pipeline only the Pipeline tab shows, and the header shows the setup stepper
   (`.claude/rules/bridge.md:50-52`): prove it in Gaia's header.
3. The pipeline agent's panel sends `job-message`, `pipeline-setup-answer` and `pipeline-agent-advise` through the
   relay and follows the agent's job stream; it offers no picture, as today.

**Specs.** The 20 DOM specs, among them `PipelineView.dom.tsx`, the setup steps', the apply dialogs', the gate dialog's
and `ProfileBox`'s; one new case: the profile log follows the relay's profile stream from its cursor after a reopen.

**Done when.** At the root green; `bun run test:dom` in `apps/gaia/`; the Pipeline tab shows without a frame on a
board with and without a readable pipeline.

**Parallel.** After WP6.19; with WP6.13 to WP6.17.

### WP6.21 A forge that crashed or is down, and the work that waits

**Purpose.** Gaia alerts that a forge crashed or is down, says what is interrupted, offers to start it and offers the
instruction that resumes the work (decisions 13, 14, 21). It never starts or resumes anything by itself.

**Files.**

- Change `apps/gaia/src/adapters/forge-registry/@types/RegisteredForge.ts`, `utils/RegistryMapUtil.ts` and the
  `forge-registry` recording (`bun run record forge-registry` from a scratch forge in each presence state).
- Change `apps/gaia/src/lib/forge-client/ForgeClient.ts`: `presenceOf(access)` at stage 3's `presence` endpoint;
  `apps/gaia/src/adapters/forge-api/PresenceIngestion.ts` (new) and spec; the `overseer-fetch-board` recording gains
  the presence document in its situations, and `overseer-fetch-supported-forge` a forge started after a crash.
- Change `apps/gaia/src/services/ForgeWatch.ts`, `src/shared/@types/ForgeReading.ts`,
  `src/features/fleet/FleetAssembly.ts`, `src/adapters/page-api/FleetDocumentMapUtil.ts`, `page/@types/FleetDocument.ts`
  (`fleetVersion` and the `fleet` and `events` endpoints raised, as the rules for a changed document say).
- Change `apps/gaia/src/shared/@types/GaiaCommand.ts`, `page/@types/CommandDocument.ts`,
  `src/adapters/page-api/GaiaCommandIngestion.ts`, `src/features/forge-control/ForgeControl.ts`: the Gaia command
  `forge-interrupted-work-resume`.
- Change `apps/gaia/page/views/attention/` (an attention item per crashed forge), `page/views/forges/` (the forge's
  row), `page/views/forge/` (the bar's alert and the interrupted-work list), with specs and fixtures.

**What to do.**

1. Read the registry's `presence` key (N7). A forge whose registry presence is `off-after-crash` is `crashed`; a
   forge with no Overseer answering and presence `stopped` is `stopped`; `serving` with no answer is `down` (the
   process is gone without a stop on record). Add `presence: FleetDocumentPresence` to `FleetDocumentForge`
   (Interfaces).
2. For a live forge, read `interruptedWork` and `crashLogs` from the presence document at each monitor snapshot change
   (a read per change, never on a timer of its own).
3. An attention item of the new kind `forge-crashed` per crashed forge, action label `Start`, which sends `forge-start`
   (the user's start, which stage 3's start gate accepts). A down forge shows the same item with kind `forge-down`.
4. In the forge route, the bar shows the alert with the crash log's generation and time, and the interrupted-work list
   with one Resume per job whose `waitsFor` is `instruction` and one "Resume all", each sending
   `forge-interrupted-work-resume` (Interfaces), which Gaia forwards as `interrupted-work-resume`.
5. The words name no command (Gaia rule 4): "Forge crashed", "Start", "Resume", never `oversee crash`.

**Specs.** Registry map: each presence state. Presence ingestion: the recorded document reads; an unknown key is passed
over. Fleet assembly: crashed, stopped and down are told apart; the attention item appears only for crashed and down.
The command ingestion and control: the new kind with a target forwarded to the forge, refused for a forge that is not
answering. Page specs (no document, as Gaia's own views are specced): the alert, the list and its controls.

**Done when.** At the root green; in `apps/gaia/`: `bun test src page/views` passes; the recordings are fresh
(`bun run check`).

**Parallel.** After WP6.3 and WP6.9; before WP6.22 (both change `FleetDocument.ts` and the forge bar).

### WP6.22 The running and the newest Overseer and Talos, each restarted cleanly

**Purpose.** Decision 31: Gaia shows the running and the newest version of the Overseer and of Talos, and restarts each
cleanly: the Overseer by a Baton pass, Talos by a clean quit with automatic resume.

**Files.**

- Forge: create the command `talos-restart` in `apps/forge/src/shared/@types/ControlCommand.ts` (runtime only, never
  relayed, as `overseer-restart` is), its applier in `apps/forge/src/services/control/OverseerControls.ts` (the place
  `overseer-restart` is applied), the contract kind in `packages/forge-contracts/@types/ForgeControlCommand.ts`,
  `FORGE_CONTROL_COMMAND_KINDS` and forge's pin `CONTROL_CONTRACT_KINDS`, the parity spec, the forge system version one
  minor up, the Bouncer's role policy refusing it for every agent role, and `docs/reference/overseer-api.md`,
  "Commands".
- Forge: `forge version --json` (`apps/forge/cli/overseer/VersionCommand.ts:18-23`) adds `talosProtocolVersion`; the
  presence document (stage 3) gains `talos: { protocolVersion: number; codeVersion: string; startNumber: number } |
  null`, read from Talos's record (stage 2's `TalosRecord`); `answerVersion` of the version answer raised by one
  (`apps/forge/CLAUDE.md:362-364`), and the `version` row of `apps/forge/docs/cli.md` (`:1251`) names the new key.
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
   already runs (`ForgeProgram.ts`), once per registry check of a forge and never on a timer of its own.
3. The bar shows both pairs; a restart control for each, enabled while the forge answers, with the words
   "Restart Overseer" and "Restart Talos". The Overseer's uses Gaia's existing `forge-restart` (a Baton pass,
   `now: false`). A newer installed version marks the pair, it does not restart by itself.

**Specs.** Forge: `OverseerControls` spec (the quit frame sent; `nothing-to-do` without Talos), the Bouncer spec, the
parity spec, `VersionCommand` spec. Gaia: the version answer map, the presence ingestion's `talos` block, the command
forwarding, the bar's model (running equal to newest, older, Talos absent).

**Done when.** At the root green; in `apps/forge/`: the forge recordings re-recorded (`bun run record
src/services/overseer/OverseerServer.ts`); in `apps/gaia/`: the forge recordings re-recorded and `bun run check`
clean.

**Parallel.** After WP6.21.

### WP6.23 Gaia retires the frame

**Purpose.** Nothing is embedded by iframe (decision 27). After every tab has moved, Gaia drops the frame, the frame
session, the embed channel and the frame-ancestor record.

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
- Delete `forge-open-in-browser` from `CommandDocument.ts`, `GaiaCommand.ts`, `GaiaCommandIngestion.ts:52-63`,
  `ForgeControl.ts:309-310`, and `openInBrowser` from `ForgeProgram.ts:40`, `:74`, `:87` with its answer type and
  recording.
- Stop reading the forge's `embed` contract, which only the frame needed: `page/@types/FleetDocument.ts:17` (`embed`)
  and `:273` (`knownContracts.embed`), `page/shared/utils/ForgeContractUtil.ts:11` (`canOpenInPlace`, deleted when
  nothing else reads it), `page/views/attention/AttentionModel.ts:342`, `page/shell/GaiaApp.tsx:30`, `:70`, `:232`,
  and the server side that fills them (`src/adapters/forge-api/IdentityIngestion.ts`,
  `src/adapters/forge-api/utils/ForgeReadingMapUtil.ts`, `src/shared/@types/ForgeReading.ts`,
  `src/adapters/page-api/FleetDocumentMapUtil.ts`, `src/Main.ts`), with the fixtures that carry `embed`
  (`git grep -n -i "embed" -- apps/gaia` lists them). The forge keeps serving `embed` in its identity until stage 8
  (WP8.10); Gaia passes the key over as any unknown one (`apps/gaia/CLAUDE.md:43-45`). The fleet document changes, so
  `fleetVersion` and the `fleet` and `events` endpoints rise with Gaia's other version changes of this package.
- Change `GaiaSystemVersions.ts` (`frameSession` removed; `commands` at its next version),
  `GaiaCompatibilityRegistry.ts`, `ContractVersions.ts` (`forgeEmbedChannel`, `forgeFrameAncestorRecord`,
  `gaiaFrameSession` removed), the page's `BoardTabViews.tsx` (every tab listed; the fallback removed),
  `apps/gaia/CLAUDE.md` (the boundaries row of the embed channel removed; the frame's rule text),
  `apps/gaia/docs/contracts.md`, `docs/architecture.md`, `docs/forge-requirements.md`.
- Change `page/testing/ArtboardScreens.tsx`, `page/testing/AuthoredBridge.ts` (deleted), `page/Screens.visual.spec.ts`.

**What to do.** Delete as listed. A removed route and a removed command kind are breaking changes of Gaia's own
contract toward its page and launcher: follow `apps/gaia/CLAUDE.md` rule 3, serve `commands` at its next version and
keep or retire the older one with `bun run versions:raise-minimum` (decision 32 allows raising the minimum).

**Specs.** `PageServer.spec.ts`: no frame-session route; the CSP names no frame source and the sandboxed `srcdoc` frame
still loads (Not established, item 1, settles it). `RealProgramRuns.spec.ts` and the recordings list stay exact.

**Done when.** At the root green; `grep -rn "frame-session\|EmbedChannel\|sessionCodeOf\|frame-ancestors\|<iframe"
apps/gaia/src apps/gaia/page` prints only the sandboxed HTML frame, and
`git grep -n "forgeEmbedChannel\|contracts.embed\|frameSession" -- apps/gaia ':!*.md'` prints nothing.

**Parallel.** Alone; after WP6.10 to WP6.22 and WP7.1.

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
4. Picture limits come from the board document's `pictureLimits`, as today; Gaia's relay bound
   (`BOARD_PICTURE_UPLOAD_LIMIT_BYTES`) is at least the forge's limit, so the forge's refusal is the one shown.

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
  the body holds the procedure now in `resources/prompts/PipelineAgentPrompt.md:9-48` (the verbs table, the questions
  rules, the lines rule) and the three steps of `PipelineAgentResearch.md`, `PipelineAgentConstitution.md`,
  `PipelineAgentDesign.md`, written as instructions in ASD-STE100. It says: under a job the verbs name no setup
  record; outside a job, the first word after the verb names it (`cli/pipeline/AgentCommandLine.ts:1-4`), and the
  user's own agent starts a record with `pipeline setup` or `pipeline update`. It lists no command beyond what it
  cites (`.claude/rules/skills.md:25-29`) and names `forge help` and `.forge/reference.md`.
- Change `apps/forge/src/shared/constants/ProductNames.ts`: `PIPELINE_SETUP_SKILL` (`'forge-pipeline'`, and
  `'agent-pipeline'` in the other product names at `:26-28`), checked against `src/ComponentNames.spec.ts:28-63`.
- Change `apps/forge/cli/adoption/constants/ClaudeCodeInstall.ts:23`, `:32-35`: the third skill folder.
- Change `apps/forge/resources/prompts/PipelineAgentPrompt.md`: the first message runs `{{skill}}` on the setup, as
  `ProductOwnerPrompt.md:1-2` does; the procedure moves to the skill; "the Bridge" (`:3`, `:34`) and
  `PipelineAgentDesign.md:7` become "the board". Change `cli/overseer/OverseerWording.ts:460` to fill `skill`.
- Change `.claude/rules/skills.md`: three skills; the pipeline agent loads its skill as its first line
  (needs the owner, item 10).
- Raise `INSTALL_VERSION`, update `cli/FrozenInstalledSurface.json`, run
  `bun run record src/services/overseer/InstallChangeWatch.ts`.
- Change `apps/forge/docs/cli.md` and `docs/README.md` where they list the skills.

**What to do.** As listed. The fixed step prompts (`PipelineAgentResearch.md` and the others) stay as the messages the
Overseer sends per step; their rules live in the skill, and each step prompt names the step only.

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

### Forge read API (forge system version: one minor over N8)

| Endpoint (registry name) | Version | Method and path | Access | Answer |
| --- | --- | --- | --- | --- |
| `state` | 1 | `GET /api/v1/state` | bearer token | the `BoardState` document (N3), unchanged |
| `events` | 1 | `GET /api/v1/events` | bearer token | `text/event-stream`: `handshake` first (no id), then `board`, `job`, `decision`, `incident`, `overseer`, `usage`, `profile`, `pipeline`, each with `id:`; `Last-Event-ID` replays as `/api/events` does |
| `jobs/{jobId}/stream` | 1 | `GET /api/v1/jobs/<jobId>/stream?after=<cursor>` | bearer token | `handshake`, then `history` (id the last cursor, data the entries), then `message` per entry (id its cursor) |
| `profiles/{profileRunId}/stream` | 1 | `GET /api/v1/profiles/<id>/stream?after=<line>` | bearer token | `handshake`, then `line` (id the line number, data `{ text }`) |
| `pictures` | 1 | `POST /api/v1/pictures`, raw bytes | bearer token | `{ pictureId, bytes, mediaType }` or a refusal `{ refusal, text }`, as `/api/pictures` |
| `pictures/{pictureId}` | 1 | `GET /api/v1/pictures/<64 hex>` | bearer token | the bytes; `nosniff`, `sandbox`, `no-store` |

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

Board document facts added to `pipelineChoices` (only adds):

```ts
readonly workerModel:               string;  // WORKER_MODEL
readonly workerEffort:              string;  // WORKER_EFFORT
readonly reworkRoundThresholdLines: number;  // DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES
```

### Forge commands in the contract

The 34 board kinds the views send are stage 4's `ForgeBoardCommand` (`forge-contracts/BoardCommand`, stage 4's
"Interfaces introduced", item 4), with `ChartRangeRequest`, `TrackerClearScope` and `PipelineFieldEdit` declared there.
This stage adds one control kind and one list:

```ts
// packages/forge-contracts/@types/ForgeControlCommand.ts, WP6.22:
| { readonly kind: 'talos-restart' }

// packages/forge-contracts/constants/ForgeControlCommandKinds.ts, WP6.1:
export const FORGE_CONTROL_COMMAND_KINDS: readonly (ForgeControlCommand | ForgeBoardCommand)['kind'][];
```

`FORGE_CONTROL_COMMAND_KINDS` equals the union of forge's `CONTROL_CONTRACT_KINDS` and `BOARD_COMMAND_CONTRACT_KINDS`
(`apps/forge/src/shared/constants/OverseerApiContracts.ts`), and each of its members is mutually assignable with
`OverseerApiCommandOf<kind>`, held by `OverseerApiContracts.parity.spec.ts`. Gaia's relay forwards a body whose `kind`
it names and no other.

`talos-restart`: runtime only; the Overseer quits Talos with reason `restart` and starts the right one; answers
`nothing-to-do` when no Talos runs; never relayed from a job.

`forge version --json` gains `talosProtocolVersion: number` (`answerVersion` raised by one). Stage 3's presence document
gains `talos: { protocolVersion: number; codeVersion: string; startNumber: number } | null`.

### Gaia's relay endpoints (Gaia system version: one minor up)

All under `session-or-token`, the Host, Origin and CSP guards, served at `/api/v1/...` and the unversioned path while
the registry keeps it. `{trackerId}` is percent-decoded once and must name a registered forge.

| Key in `GAIA_ENDPOINT_VERSIONS` | Version | Method and path | Body bound | Answer |
| --- | --- | --- | --- | --- |
| `forgeBoard` | 1 | `GET /api/v1/forges/{trackerId}/board` | 65,536 | the forge's `state` body, or `BoardRelayRefusalDocument` |
| `forgeBoardEvents` | 1 | `GET /api/v1/forges/{trackerId}/board/events` | 65,536 | stream: Gaia's `handshake`, then the forge's events by name, id and data unchanged |
| `forgeJobStream` | 1 | `GET /api/v1/forges/{trackerId}/jobs/{jobId}/stream?after=` | 65,536 | stream: Gaia's `handshake`, then `history` and `message` |
| `forgeProfileStream` | 1 | `GET /api/v1/forges/{trackerId}/profiles/{profileRunId}/stream?after=` | 65,536 | stream: Gaia's `handshake`, then `line` |
| `forgePictureUpload` | 1 | `POST /api/v1/forges/{trackerId}/pictures`, raw bytes | `BOARD_PICTURE_UPLOAD_LIMIT_BYTES` | `PictureUploadAnswerDocument` |
| `forgePicture` | 1 | `GET /api/v1/forges/{trackerId}/pictures/{pictureId}` | 65,536 | the bytes, with the forge's content type, `nosniff`, `sandbox`, `no-store` |
| `forgeCommands` | 1 | `POST /api/v1/forges/{trackerId}/commands`, a body whose `kind` is in `FORGE_CONTROL_COMMAND_KINDS` | 65,536 | `BoardCommandAnswerDocument` |

Statuses: 200 answered; 400 a body that is no JSON object or names an unknown kind; 404 an unregistered forge or an
unknown path; 409 a forge's refusal; 413 a body over its bound; 423 a forge's install hold; 501 a forge version Gaia
cannot talk to; 502 a forge that does not answer, an unreadable token file or a refused token.

```ts
// apps/gaia/src/shared/constants/Limits.ts, added
/** At least the forge's PICTURE_SIZE_LIMIT_BYTES (3,932,160), so the forge's refusal is the one shown. */
export const BOARD_PICTURE_UPLOAD_LIMIT_BYTES = 4_194_304;

// apps/gaia/page/@types/BoardRelayDocuments.ts
export type BoardRelayRefusal =
  | 'forge-not-registered' | 'forge-unreachable' | 'forge-version-unsupported' | 'token-unreadable' | 'token-rejected'
  | 'not-found' | 'too-large' | 'malformed-body' | 'unknown-kind';

export interface BoardRelayRefusalDocument {
  readonly refusal:   BoardRelayRefusal;
  readonly refusedBy: 'gaia';
}

/** The first event of every relayed stream, `event: handshake`, no id. */
export interface BoardStreamHandshakeDocument {
  readonly boardStreamVersion: typeof CONTRACT_VERSIONS.gaiaBoardStream;   // 1
  readonly systemVersion:      { readonly major: number; readonly minor: number }; // Gaia's
  readonly forgeSystemVersion: { readonly major: number; readonly minor: number };
}

export type BoardCommandOutcome = 'applied' | 'refused' | 'install-held' | 'unreachable' | 'outcome-unknown';

export interface BoardCommandAnswerDocument {
  readonly boardCommandAnswerVersion: typeof CONTRACT_VERSIONS.gaiaBoardCommandAnswer; // 1
  readonly outcome:                   BoardCommandOutcome;
  /** The forge's `outcome` and `result` when applied: `done` or `nothing-to-do`, and the command's result. */
  readonly applied:                   { readonly outcome: string; readonly result: unknown } | null;
  /** The sentence to show, in Gaia's words where the forge's names a command; `null` when applied. */
  readonly refusal:                   { readonly refusedBy: 'forge' | 'gaia'; readonly code: string | null; readonly text: string | null } | null;
}

export interface PictureUploadAnswerDocument {
  readonly pictureUploadAnswerVersion: typeof CONTRACT_VERSIONS.gaiaPictureUploadAnswer; // 1
  readonly outcome:                    'uploaded' | 'refused';
  readonly picture:                    { readonly pictureId: string; readonly bytes: number; readonly mediaType: string } | null;
  readonly refusal:                    { readonly refusedBy: 'forge' | 'gaia'; readonly code: string | null; readonly text: string | null } | null;
}
```

`CONTRACT_VERSIONS` gains `gaiaBoardStream: 1`, `gaiaBoardCommandAnswer: 1`, `gaiaPictureUploadAnswer: 1`.

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
boardStateOf:        (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;
followEvents:        (access: OverseerAccess, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
followJobStream:     (access: OverseerAccess, jobId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
followProfileStream: (access: OverseerAccess, profileRunId: string, after: string | null, lastEventId: string | null, onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
uploadPicture:       (access: OverseerAccess, bytes: Uint8Array, mediaType: string) => Promise<ForgePictureUploadAnswer>;
pictureOf:           (access: OverseerAccess, pictureId: string) => Promise<ForgePictureAnswer>;
sendBoardCommand:    (access: OverseerAccess, body: JsonObject) => Promise<ForgeBoardCommandAnswer>;
presenceOf:          (access: OverseerAccess) => Promise<ForgeDocumentAnswer>;   // WP6.21, stage 3's endpoint

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
// written: #forge/<encoded trackerId>[/<tab>[/<encoded item segments>]]
// read also: #forge/<trackerId>/#<tab>/<item> (the old form)

// apps/gaia/page/board/@types/BoardServices.ts
export interface BoardServices {
  readonly trackerId:            string;
  readonly commandClient:        BoardCommandClient;      // send(command: ForgeControlCommand | ForgeBoardCommand) => Promise<CommandOutcome>
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
`EventStreamClient.ts:14-22`).

Board preferences in browser storage: `gaia:board:<trackerId>:<choice name>`, the choice names the Bridge uses
(`tab`, `seen-incident-defaults`, the Kanban's filter choices, Flint's habitat).

### Fleet document (WP6.21, WP6.22)

```ts
// apps/gaia/page/@types/FleetDocument.ts, added to FleetDocumentForge
presence:        FleetDocumentPresence;
interruptedWork: FleetDocumentInterruptedJob[];          // empty for a forge not answering
runningVersions: FleetDocumentRunningVersions | null;    // null for a forge not answering

export type FleetDocumentPresenceState = 'serving' | 'stopped' | 'handed-over' | 'crashed' | 'down' | 'unknown';
export interface FleetDocumentPresence {
  state:              FleetDocumentPresenceState;
  generation:         number | null;
  at:                 string | null;          // shown only
  crashLogGeneration: number | null;
}
export interface FleetDocumentInterruptedJob {
  jobId:     string;
  kind:      string;
  ticketIds: string[];
  cause:     string;                          // stage 2/3's cause, e.g. 'network-outage', 'reboot', 'forge-crashed'
  waitsFor:  'instruction' | 'answer' | 'decision' | 'nothing' | 'never';
}
export interface FleetDocumentRunningVersions {
  overseerRunning: string;                    // codeVersion of the identity
  overseerNewest:  string | null;             // codeVersion of `forge version --json`
  talosRunning:    { protocolVersion: number; codeVersion: string } | null;
  talosNewest:     number | null;             // talosProtocolVersion of `forge version --json`
}

// FleetDocumentAttentionKind gains 'forge-crashed' | 'forge-down'; FleetDocumentActionLabel gains 'Start'.
```

`fleetVersion` and the `fleet` and `events` endpoints are raised as Gaia's rules require for a changed document.

### Gaia commands (page to Gaia's server)

```ts
// apps/gaia/page/@types/CommandDocument.ts
| { kind: 'forge-interrupted-work-resume'; trackerId: string; target: { jobId: string } | { ticketReference: string } | 'all' }
| { kind: 'forge-talos-restart'; trackerId: string }
// removed in WP6.23: 'forge-open-in-browser'
```

Forwarded as the forge's `interrupted-work-resume` (stage 3) and `talos-restart`.

### Forge installed surface (WP7.2)

- A third skill, source folder `skills/agent-pipeline/`, installed as `PRODUCT_NAMES.PIPELINE_SETUP_SKILL`
  (`forge-pipeline`; `agent-pipeline` under the other product names) into the repository's `.claude/skills/`.
- `INSTALL_VERSION` raised once.
- `open` and the `progress.html` stub are unchanged here; stage 8 retires both (WP8.4).

## Traps

- **Gaia may not import forge's code.** A Bridge file imports `../../src/...` in 114 shipping files. Copying it into
  Gaia with a rewritten relative path to `apps/forge/` compiles and breaks the release rule (forge and Gaia are
  released apart, `apps/gaia/CLAUDE.md:26-28`). Import only by package name (N1, N2); `PageImportDirection.spec.ts`
  and `WorkspaceDependencies.spec.ts` catch a bare path only if they scan for it, so
  `grep -rn "apps/forge\|\.\./\.\./\.\./src" apps/gaia/page/board` must print nothing.
- **Forge constants in views.** `WORKER_MODEL`, `WORKER_EFFORT` and the rework threshold reach the pipeline view as code
  today (`AgentStepDialogModel.ts:9`, `PipelineFlowModel.ts:19`, `RereviewSettingsModel.ts:8`), and `PRODUCT_NAMES`
  (`PreferenceStore.ts:6`). Copied as code, Gaia would show the defaults of the forge Gaia was built with, not of the
  forge it reads. Serve them as facts (WP6.1); key preferences with Gaia's own names.
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
  (`CommandClient.ts:46`); `ForgeClient.send` collapses every non-200 to a refusal (`ForgeClient.ts:96-102`). Use
  `sendBoardCommand`, which keeps the status.
- **Tokens stay in the server.** A relay that forwards the forge's headers or error bodies verbatim can leak the bearer
  token into the page or a log. Build the answer from the parsed body; never copy request headers back
  (`apps/gaia/CLAUDE.md:51`).
- **Refusal sentences may name a command.** Gaia's rule 4 forbids a screen telling User to run a command. The forge's
  API wording already avoids commands (`apps/forge/CLAUDE.md:90-92`), but pass every forge sentence through
  `ForgeSentenceUtil` anyway.
- **The Bridge's DOM specs need a document; Gaia's page specs have none.** Put every `.dom.tsx` under `page/board/` and
  run them only through `page/testing/RunDomSpecs.ts`, each in a fresh global; a DOM spec picked up by `bun test`
  pollutes Gaia's main run. The runner must use Gaia's preload (`src/testing/TestRunPreload.ts`), which moves `HOME`
  and `TMPDIR` into `.scratch/`, and the leak check then judges the DOM run too.
- **Style contracts disagree.** Gaia's contract forbids Gaia's own keyframes and styles exactly `gaia.css`'s classes
  (`page/StyleContract.spec.ts:1-11`); the Bridge's CSS has 22 keyframes and 638 classes. Moving them into `gaia.css`
  fails the contract. Keep them in `page/styles/board/` under the board section (WP6.4).
- **Class renames must be complete.** `StyleContract` scans literal `className` values. A `bridge-` class left in a
  component and renamed in its stylesheet fails late and by surprise; rename both in the same step and grep for
  `bridge-` afterwards. Also rename the `data-*` and custom properties a stylesheet reads by the old prefix.
- **One Flint per document.** `createFlint` refuses a second Flint on a document (`.claude/rules/flint.md:25`). Two
  boards mounted at once, or a board mounted before the previous one unmounted, break Flint silently. Key the board
  root by tracker id so React unmounts before it mounts.
- **The Notification API needs a boundary.** `QuestionAlerts.browserQuestionNotifier()` reaches `Notification` directly
  in the Bridge; Gaia's boundaries table reserves `page/notifications/NotificationBoundary.ts` for it
  (`apps/gaia/CLAUDE.md:125`). No other page module may name `Notification`.
- **A forge may not name its client.** Every forge change here (WP6.1, WP6.22, WP7.2) passes
  `src/ClientNames.spec.ts`: no "Gaia" and no "fleet" in forge code, docs or installed text. The neutral words are "the
  board", "a monitor", "a host".
- **Retired names.** `HostRecord`, `HostFleet`, `agent-host` and others are retired (`ComponentNames.spec.ts:28-63`); a
  new name such as `BoardHostRecord` contains one. Check every new identifier and file name.
- **Overseer stays Overseer in words.** The rename is stage 9's. A Gaia word "Hephaestus" now is a second rename later.
  Talos is Talos from its first line.
- **The frame header hide changes the Bridge.** It is the only Bridge change in stage 6 (WP6.9). Keep the Bridge's own
  style guards green (`apps/forge/bridge/StyleContract.spec.ts` and the three others) and do not hide the head outside
  frame mode: `forge open` still opens the full Bridge until stage 8 (WP8.4).
- **The views read the contract's documents, never a copy.** Stage 4 turned the Bridge's field-exact mirrors
  (`.claude/rules/bridge.md:19`) into `forge-contracts` documents held against the served state by
  `BoardState.documents.spec.ts`. Import them by name in `page/board/`; a local copy would drift from the server
  unseen, and a document change must show as a type error in exactly the views that read the field.
- **An unmoved tab in the frame and a moved tab natively hold two event streams** to the same forge while the
  migration runs: the frame's own and the relay's. That is expected until WP6.23; do not share them.
- **Version raises collide.** Stages 2, 3 and 4 each raised the forge's minor; WP6.1 and WP6.22 each raise it again;
  Gaia's `SUPPORTED_FORGE_VERSION` must follow each time with fresh recordings, or `bun run check` warns and the
  recordings go stale. Raise by one over the value found, never to a number written here.
- **`bun install --frozen-lockfile` fails after a dependency change** until `bun.lock` is committed. Run `bun install`
  in the package that adds a dependency and commit the lock with it; never edit `package.json` to make a check pass.
- **Stage 3's start gate.** A start from the login item refuses after a crash; a user's start does not. Gaia's Start of
  a crashed forge is the user's start (`forge start --json`), never `oversee --detach` (`apps/gaia/CLAUDE.md:49`).
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
- `apps/gaia/`: `bun test src/lib/forge-client src/features/page-server src/WholeFlow.spec.ts page`, then
  `bun run test:dom` (every DOM spec of `page/board/`, at least the 67 the Bridge had minus the brain's cases, plus the
  new ones), then `bun run check`.

The end-to-end check on a scratch forge, as Gaia's rules name it (`apps/gaia/CLAUDE.md:18-20`, `:140-152`):

1. In `apps/gaia/`, record every forge recording from the forge of the same worktree, never the main checkout's:

   ```
   GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record overseer-fetch-supported-forge
   ```

   then the same for `overseer-fetch-flint-brain`, `overseer-fetch-versions`, `overseer-fetch-board` and
   `forge-registry`. Each starts the forge under a scratch home with `FORGE_ROOT` pinned, drives it with the fake agent
   and leaves nothing behind (the leak check names what is left).
2. `src/WholeFlow.spec.ts` drives the server over those recordings: open the board, follow its events, send a command,
   upload a picture and send `job-message` naming it, follow the job stream.
3. The by-eye pass: paint the artboards of `page/Screens.visual.spec.ts` (B1 now Gaia's bar, the board header and a
   moved view), in light and dark, and compare with the owner's designs.
4. In `apps/forge/`: `bun run record src/services/overseer/OverseerServer.ts` and
   `bun run record src/services/overseer/InstallChangeWatch.ts` are fresh.
5. `grep -rn "<iframe\|frame-session\|sessionCodeOf" apps/gaia/src apps/gaia/page` prints only the sandboxed HTML
   frame of `page/board/sandboxed-html/`.

## Out of scope

- Deleting `apps/forge/bridge/`, the bundle build, `BrowserSessions`, the session routes, the frame-ancestor reading
  (`cli/overseer/routes/FrameOrigins.ts`), the embed channel's forge side and Flint's ask route: stage 8.
- Retiring `forge open` and the `progress.html` stub: stage 8 (WP8.4).
- Raising the forge's major, and what happens to the unversioned API paths: stage 8 (its "Needs the owner", item 7;
  recommended there: they stay as the current contract).
- Taking the Assistant off by default: stage 8. Its view moves here unchanged.
- Moving Markdown rendering (`bodyHtml`, `descriptionHtml`) out of the forge: stage 8 decides; the views keep reading
  the forge's HTML through the sandboxed frame.
- Renaming Overseer to Hephaestus in words, identifiers, the registry's `overseer` and `progressHtml` keys and the
  login item: stage 9.
- Any change to what the forge does after an ending on a network outage, or to an install line's time bound: stage 0
  decides, stages 2 and 3 build; this stage only shows what the forge reports.
- Redesigning Gaia's own fleet views (Attention, Agents, Activity, Forges) or merging Gaia's selected-agent panel with
  the board's job panel; making a design-system component of a board part. Propose either as a follow-up.
- Notifications (Gaia backlog W5.6) beyond routing the existing question alerts through the boundary.
- Stage 4's packages: none is created or renamed here.
- Showing a forge on another machine (decision 18 leaves it for later).

## Needs the owner

1. **Specs of the moved views.** Gaia's rule 10 says the page's specs have no document; the Bridge's views are held by
   67 DOM specs. Recommended default: keep the DOM specs for `page/board/` under a `test:dom` task and amend rule 10
   for that folder; Gaia's own views keep the no-document rule.
2. **The board's stylesheets under Gaia's style contract.** Gaia defines no keyframe and styles only `gaia.css`; the
   Bridge has 22 keyframes, 638 classes and 73 tokens of its own. Recommended default: `page/styles/board/*.css` with
   `board-` names, held by the Bridge's four guards plus Gaia's class and contrast checks in a board section;
   unify with `gaia.css` later as design work.
3. **Flint in Gaia.** Gaia's rule 12 and the owner's 2026-11-13 decision say Gaia draws no Flint and Flint shows only
   inside a forge's framed Bridge; with no frame, Flint either moves into the forge route or goes. Recommended default:
   Flint shows in the forge route only, one per forge, with no brain; Gaia's fleet pages show none.
4. **Mapping the board document in Gaia's server.** Gaia's rule maps every forge document into its own model at the
   boundary; the board document is large and its types come from `forge-contracts` (N3). Recommended default: relay it
   unchanged and let the page read the contract's types, as a recorded deviation in `apps/gaia/CLAUDE.md`; Gaia checks
   the forge's system version, not each field.
5. **`forge open` and the `progress.html` stub.** A forge may not name its interface, and opening Gaia needs Gaia's own
   session code. This stage leaves both as they are, since the Bridge they open is served until stage 8, and Gaia no
   longer runs `forge open` (WP6.9, WP6.23). Recommended default: stage 8 retires both (WP8.4, its "Needs the owner"
   item 1). The alternative is a host-neutral record in the monitor folder naming a program the forge runs to show a
   board, which adds a contract and a program-launch path.
6. **What follows an ending on a network outage** (design section 12, item 1). This stage builds what both answers
   share: the cause shown in its own words, and a Resume control only where the forge reports
   `waitsFor: 'instruction'`. If the owner chooses "resume by itself", the forge reports `nothing` and Gaia shows
   "resumes when the vendor answers" with no control; nothing in Gaia changes. Recommended default: stage 3's
   (`waits-for-instruction`).
7. **A question's recommendation as a field.** Decision 11 says the forge keeps a recommendation; agent questions carry
   it only as a mark on an option's label (`QuestionPanelModel.ts:228`). Recommended default: Gaia shows the mark as
   today; a field in the decision document, set by `question-options`, is a forge change for a later stage.
8. **The forge route's header.** Gaia's forge bar and the Bridge's header both offer Overseer controls. Recommended
   default: Gaia's bar keeps the forge's controls, versions and alerts; the board header keeps figures, tabs, the setup
   stepper and the waiting-on-user pill, without its own stop and restart. The design canvas is the owner's to update.
9. **When `apps/forge/bridge/` is deleted.** Recommended default: stage 8, with the bundle build and the session
   routes, so stage 6 never leaves the forge with an HTML import of a missing page.
10. **Rule files a person changes.** `.claude/rules/bridge.md`, `skills.md`, `flint.md`, `design-system.md` and the
    root `CLAUDE.md` are the owner's (`apps/forge/CLAUDE.md:281-284`, root `CLAUDE.md`). WP6.4 and WP7.2 need them
    changed. Recommended default: the orchestrated session writes the change in the same commit and the owner
    approves it before it lands.
11. **The install line's time bound** (design section 12, item 2): untouched here; Gaia shows a line's state as the
    forge reports it.

## Not established

1. Whether Gaia's CSP with no `frame-src` source still lets the sandboxed `srcdoc` frame load its stylesheets and
   follow the theme. Not run; prove it in WP6.23's spec or keep `frame-src 'self'`.
2. Whether Gaia's launcher counts a second tab or window opened with `window.open` as a window of Gaia's
   (`src/features/launcher/BrowserWindowWatch.ts`); not read beyond the launcher's header.
3. The exact HTTP statuses of the forge's picture refusals (`OverseerRoutes.ts:173-175` builds them through
   `pictureUploadAnswerOf`, not read).
4. Whether every Bridge DOM spec passes under Gaia's preload and leak check unchanged; none was run.
5. The names stages 0, 2, 3 and 4 will have given each need N1 to N8: the defaults come from the plans in this folder,
   not from code, since none of those stages is built.
6. Whether the scratch forge can be brought into an install-change hold for the `423` recording.
7. Whether `Bun.build` of Gaia's page resolves the board stylesheets' `url(...)` references the same way the Overseer's
   build of the Bridge does.
8. Whether `presence` of a forge that is down is readable anywhere but the registry: stage 3 writes it there; Gaia
   reads nothing of the store.
9. The design of the unified forge route beyond the current artboard B1; no design board for it was read.
