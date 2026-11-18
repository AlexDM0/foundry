# Stages 8 and 9: Shrink the HTTP surface, then rename

## Goal

After stage 8, the Overseer's HTTP server serves only what Gaia's server needs: the open reads (versions, identity,
summary), the board document, presence, the event, monitor, job and gate-profile streams, job files, pictures and their
upload, the nudge and the command endpoint, every one but the open three behind the bearer token. The Bridge program,
browser sessions, session codes, the embed machinery on both sides, Flint's brain and the HTML rendering of Markdown are
gone; the Assistant boots only on a board that switched it on, and while it is off every incident takes its default at
once. After stage 9, in one commit, no tracked file outside the named historical records says Overseer, `overseer` or
`oversee`: code, paths, stored and installed names, wire values, documents, rules, prompts and skills say Hephaestus,
forge and Gaia meet at the next major system version with recordings taken again, and the guards forbid the old names.

## Depends on

Stages that must be finished before stage 8: 0, 1, 2, 3, 4, 5, 6 and 7. Stage 9 starts only once every work package
of stage 8 is committed. Stage 9 is the last stage; it hands nothing on.

This file cites today's code (`3e6cb660`). Stages 2 to 7 move and change much of it. Before WP8.1, open the code as it
is then and find each item of the table below by its export name (`git grep -n "<export name>"`), not by its path:
stage 4 moves the tracker model and the board documents into packages named in stage 0, and stage 5 puts the store
behind a port. Where an item that this stage needs is missing, stop and report it; do not build it here.

| Need | What must be true at the start of stage 8 | Check | Used by |
| --- | --- | --- | --- |
| N1. Every view in Gaia | Stage 6 moved every Bridge view into Gaia, and no Gaia screen needs a forge's Bridge to show a board | `git grep -n -i "bridge" -- apps/gaia/page apps/gaia/src ':!*.spec.*'` names no frame, no embed channel and no frame session: stage 6 removed them (WP6.23) | WP8.1, WP8.2, WP8.3 |
| N2. The maximized forge is a Gaia route | Decision 27: one forge at full size is a route of Gaia, in the window or a tab of its own, never an iframe | Open the route stage 6 added (`#forge/<trackerId>/<tab>`, `apps/gaia/page/views/forge/`, WP6.9); `apps/gaia/page/views/forge-frame/` does not exist (renamed in WP6.9, its frame parts deleted in WP6.23) | WP8.3 |
| N3. Where Gaia shows forge's HTML | Stage 6 moved the views unchanged, so Gaia's page still shows ticket bodies and epic descriptions from the board document's `bodyHtml` and `descriptionHtml` (stage 6, "Out of scope"); WP8.8 switches the forge and Gaia together | `git grep -n "bodyHtml\|descriptionHtml" -- apps/gaia packages` lists the readers WP8.8 changes | WP8.8 |
| N4. The board documents are contracts | The board, ticket and job documents the views read are in `packages/forge-contracts` (stage 4, WP4.6), each endpoint in `FORGE_COMPATIBILITY_REGISTRY` (`state` from stage 4, the streams and pictures from stage 6's WP6.1, `presence` from stage 3) | `git grep -n "currentEndpointOf\|endpointAddedIn\|kind: *'endpoint'" -- packages/forge-contracts` | WP8.6, WP8.8, WP8.10 |
| N5. Conversations go through Gaia | Stage 7: intake and pipeline setup are reached through `job-message`, the job stream and the picture upload, from Gaia | Gaia's conversation view posts `job-message` through its server | WP8.6 |
| N6. Flint's brain under Talos | Flint's brain ran on a Watcher of its own (`apps/forge/src/services/overseer/FlintBrainSessionHost.ts:1-4`); stage 2 moved its session host under Talos, as an agent child in the child folder `flint-brain/` (stage 2, WP2.13 item 11) | `git grep -ln "FlintBrain" -- apps/forge` | WP8.7 |
| N7. The Watcher's names | Stage 2 retired the Watcher's names in code, files and stored values, so Talos is Talos, except the stored interruption cause `watcher-lost`, which stage 2 keeps for stage 9 (stage 2, WP2.16) | `git grep -n -i "watcher" -- apps packages` lists `watcher-lost` and the vendor's `setup_file_watcher_ms` in recorded Claude Code output, nothing else | WP9.1, WP9.5 |
| N8. The store port | Stage 5: `pipeline.json` is read and written only through the local store adapter | `git grep -n "pipeline.json" -- apps/forge/src apps/forge/cli ':!*.spec.ts'` names only the adapter | WP8.9 |

If N1 or N2 does not hold, stage 6 is not finished: report it and stop.

## Decisions this stage carries out

- 1. The Overseer becomes Hephaestus without the interface: stage 8 removes the interface, stage 9 the name.
- 2. Hephaestus has no interface: the page, its bundle, its sessions and its HTML rendering leave forge.
- 18. One interface server, in Gaia: forge stops serving a page and a frame.
- 19. A small, versioned read API and the command endpoint beside it, met through system versions: what stays is
  exactly that, at forge system version 2.0 and then 3.0.
- 22. Outside Hephaestus, state changes through a command: the Assistant's switch is a command kind and a CLI verb.
- 24. The Assistant does not start by default: the boot rule and the new default trigger.
- 25. Flint's brain is left out of the core: its engine, route, commands and monitor field go.
- 27. Nothing is embedded by iframe: the forge's side of the embed channel, session codes for frames and the
  frame-ancestor records go; Gaia's frame went in stage 6 (WP6.23), which WP8.3 confirms.
- 28. The Bridge's code moves into Gaia: what stage 6 left of `apps/forge/bridge/` is deleted.
- 32. Nothing that exists has to be kept: stored names, formats, installed surfaces and the system version change
  outright, and existing boards are set up anew.
- 33. A new package is decided before work starts: these stages create no package.
- 34. Orchestrated Opus sessions in this repository do the work, outside both trackers.

## Today's code

Paths are from the repository root. "Stage 8" and "Stage 9" name the stage that acts on the row.

| What exists | Where (path:line) | What happens to it |
| --- | --- | --- |
| The server's contract: routes, refusals, the token, the page and the frame origins | `apps/forge/src/services/overseer/OverseerServer.ts:1-10`, `:54-55`, `:80-118` | Stage 8: changed. `askFlintBrain`, `frameOrigins`, `page` and `page-build-failed` go |
| `CommandCaller.carriesBridgeSession` | `OverseerServer.ts:71-75`, `:250` | Stage 8: deleted |
| Browser sessions held in memory | `apps/forge/src/services/overseer/BrowserSessions.ts:1-58`, created at `OverseerServer.ts:629` | Stage 8: deleted |
| The session cookie, the code issue and exchange, `GET /api/session-token` | `OverseerServer.ts:143-153`, `:297-318`, `:335-358`, `:538`, `:574-575` | Stage 8: deleted |
| Readers authorized by a session cookie or the token | `OverseerServer.ts:315-318`, `:567` | Stage 8: changed to the bearer token only |
| The Bridge bundle build and the page files | `OverseerServer.ts:485-532`, `:583`, `:630` | Stage 8: deleted |
| The page CSP with `frame-ancestors` on every answer | `OverseerServer.ts:184-188`, `:587-591`, `:641-651` | Stage 8: replaced by one fixed deny-all policy; the sandbox policy of pictures and job files stays |
| Flint's ask route | `OverseerServer.ts:87-88`, `:181-182`, `:320-333`, `:577`; `apps/forge/cli/overseer/routes/OverseerRoutes.ts:125-129` | Stage 8: deleted |
| The Bridge's HTML import, the one feature reach | `OverseerRoutes.ts:11`, `:178`; `apps/forge/src/ImportDirection.spec.ts:135-136` | Stage 8: deleted |
| Frame origins read from the frame-ancestor records | `apps/forge/cli/overseer/routes/FrameOrigins.ts:1-49`, `OverseerRoutes.ts:39`, `:177` | Stage 8: deleted |
| Refusal sentences of the server | `OverseerRoutes.ts:51-57` | Stage 8: changed: no page, no session, no page build |
| The command route with Flint's brain's kinds | `apps/forge/cli/overseer/routes/CommandRoute.ts:1-8`, `:41-42`, `:54-55`, `:126-144` | Stage 8: changed: the brain's kinds go |
| Flint's brain, the engine and its launch | `apps/forge/src/services/overseer/FlintBrain.ts:1-433`, `FlintBrainProfile.ts:1-92`, `FlintBrainSessionHost.ts:1-172`, `@types/FlintBrainRun.ts`, `utils/FlintBrainDigestUtil.ts`, `utils/FlintBrainWordingUtil.ts`; `apps/forge/cli/overseer/OverseerFlintBrain.ts:1-120` | Stage 8: deleted |
| The brain in the Overseer's serving period | `apps/forge/cli/overseer/OverseerForeground.ts:81`, `:109`, `:404-417`, `:475-476`, `:518-523`, `:540`, `:551`, `:620`, `:640`, `:653`, `:778` | Stage 8: changed |
| The brain's constants and test settings | `apps/forge/src/shared/constants/OverseerLimits.ts:143-170`; `apps/forge/src/shared/Environment.ts:92-118` | Stage 8: deleted |
| The brain's command kinds | `apps/forge/src/shared/@types/ControlCommand.ts:233-239`; `apps/forge/src/services/control/ControlService.ts:58-59`; `apps/forge/src/shared/constants/OverseerApiContracts.ts:34-35` | Stage 8: deleted |
| The brain in the monitor snapshot, the board state and today's figures | `apps/forge/src/shared/monitor/@types/MonitorSnapshot.ts:99-100`, `:159-160`; `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts:62-63`, `:158`, `:197-219`, `:318-321`; `apps/forge/cli/overseer/routes/BoardStateReader.ts:49-59`, `:194-201`; `apps/forge/src/shared/monitor/TodayFigures.ts:26-59` | Stage 8: changed |
| The `flint-brain-ended` record: its writer | `apps/forge/src/lib/tracker-model/Board.ts:452-454`; `apps/forge/src/lib/tracker-model/Jobs.ts:313-317` | Stage 8: deleted |
| The `flint-brain-ended` record: its reader and wording | `apps/forge/src/lib/tracker-model/@types/LogRecord.ts:38-41`, `:104-105`; `constants/LogRecordSchema.ts:77-78`, `:279-283`; `constants/FlintBrainVocabulary.ts`; `apps/forge/src/adapters/log/LogRecordProblem.ts:207-208`; `utils/LogRecordMappingUtil.ts:111-112`; `apps/forge/src/adapters/utils/LogUtil.ts:274-275`, `:343-353` | Stage 8: kept, so an old log stays readable (design section 3.5) |
| The fake agent's brain turns | `apps/forge/src/testing/FakeAgentAdapter.ts:84-125` | Stage 8: deleted |
| `forge open` and its session code | `apps/forge/cli/tracking/open/OpenCommand.ts:1-80`, `OpenThroughARedirectFile.ts`; `apps/forge/cli/CommandTable.ts:40`; `apps/forge/cli/overseer/OverseerRemote.ts:214-232` | Stage 8: deleted |
| The default-browser opener, whose only consumer is `open` | `apps/forge/cli/OpenInTheDefaultBrowser.ts`, `apps/forge/cli/OpenerFor.ts`; `apps/forge/src/testing/BoundarySpecs.ts:141` | Stage 8: deleted |
| The `progress.html` stub | `apps/forge/src/adapters/progress-page/ProgressPageStubWriter.ts`; `apps/forge/cli/adoption/WriteProgressPageStub.ts:1-10`; `init/InitCommand.ts:103`, `:173`; `update/UpdateCommand.ts:69`; `OverseerForeground.ts:174`; `apps/forge/src/services/tracker/constants/TrackerFiles.ts:11` | Stage 8: deleted |
| `SESSION_CODE_LIFETIME_SECONDS` | `OverseerLimits.ts:120` | Stage 8: deleted |
| Markdown rendered to HTML for the page | `apps/forge/src/services/render/MarkdownRenderer.ts`, `RenderState.ts`; `PagePayloadAssembly.ts:58-66`, `:88`; `apps/forge/src/shared/@types/PagePayload.ts:76-79`, `:106-108`; `apps/forge/cli/CommandContext.ts:13`, `:55`, `:131`; `BoardStateReader.ts:167` | Stage 8: deleted; the board document carries Markdown source |
| The Bridge | `apps/forge/bridge/` (525 tracked files today) | Stage 8: whatever stage 6 left is deleted |
| What exists only for the Bridge | `apps/forge/package.json:10-20`, `:26-32`; `apps/forge/eslint.config.js:11-12`, `:92-93`, `:127`; `ImportDirection.spec.ts:117-123`, `:136`, `:172`, `:284`, `:609-802`; `apps/forge/src/testing/BoundarySpecs.ts:22`, `:138`, `:145-150`; `apps/forge/src/testing/recordings/darwin/bridge__*.json`; `apps/forge/.readme-graphics/` | Stage 8: deleted or changed |
| The client-name guard's scan proof | `apps/forge/src/ClientNames.spec.ts:26`, `:44-45` | Stage 8: changed (fewer than 1,000 shipped files remain); stage 9: changed (renamed paths) |
| The Bridge's rules | `.claude/rules/bridge.md`; `.claude/rules/flint.md:9-11`; `.claude/rules/design-system.md`; `CLAUDE.md` (root); `apps/forge/CLAUDE.md:59-61`, `:76-78`, `:221-224`, `:268-273`, `:318`, `:334`, `:341-343` | Stage 8: deleted or changed |
| The Assistant's boot rule | `apps/forge/src/lib/tracker-model/Playbook.ts:534-546` | Stage 8: changed: it boots only while the board's switch is on |
| The `no-assistant` default | `Playbook.ts:493-501`; `apps/forge/src/lib/tracker-model/@types/Incident.ts:34-35`; `constants/DecisionAndIncidentVocabulary.ts:52`; `LogUtil.ts:340`; `apps/forge/src/shared/monitor/utils/NoticeWordingUtil.ts:24-27` | Stage 8: kept, beside a new cause `assistant-off` |
| The Playbook's facts | `Playbook.ts:39-52`; `Board.ts:675-690` | Stage 8: changed: `assistantIsOn` |
| The board's pipeline | `apps/forge/src/lib/tracker-model/@types/Pipeline.ts:95-120` | Stage 8: changed: key `assistant` |
| The approval switch, the pattern to mirror | `apps/forge/src/services/control/SettingControls.ts:50-52`; `LogRecordSchema.ts:256-257`; `apps/forge/cli/gates/GatePipelineVerbs.ts:40`, `:175-181`, `:212-213`, `:238` | Kept; copied for the Assistant's switch |
| Forge's system versions | `packages/forge-contracts/constants/ForgeSystemVersions.ts:14-17` (current 1.1, minimum 0.0) | Stage 8: 2.0 and 2.0; stage 9: 3.0 and 3.0 |
| Forge's compatibility registry and its spec | `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:38-49`; `ForgeCompatibilityRegistry.spec.ts:17-56` | Stages 8 and 9: changed |
| Contract integers | `packages/forge-contracts/constants/OverseerContractVersions.ts:9-15`; `apps/forge/src/shared/constants/OverseerApiContracts.ts:10-36` | Stage 8: `embed` goes, monitor and control rise; stage 9: renamed |
| The embed contracts | `packages/forge-contracts/constants/EmbedMode.ts`, `@types/EmbedChannelMessage.ts`, `@types/FrameAncestorRecord.ts`; `packages/forge-contracts/package.json:13-15` | Stage 8: deleted |
| The identity's contracts | `packages/forge-contracts/@types/IdentityDocument.ts:4` | Stage 8: `embed` goes |
| The registry logic and the guard both systems use | `packages/system-versions/utils/CompatibilityRegistryUtil.ts:32-34`, `:65-80` | Kept |
| Gaia's frame session route | `apps/gaia/src/features/page-server/routes/FrameSessionRoute.ts:1-105`; `apps/gaia/src/features/page-server/PageServer.ts:24-28`, `:43-44`, `:125-128`, `:187-195`; `apps/gaia/src/Main.ts:187` | Deleted in stage 6 (WP6.23); stage 8 checks it is gone (WP8.3) |
| Gaia's call for a session code | `apps/gaia/src/lib/forge-client/ForgeClient.ts:46`, `:59`, `:116`, `:155-157`; `@types/ForgeClientAnswer.ts` | Deleted in stage 6 (WP6.23); stage 8 checks (WP8.3) |
| Gaia's frame-ancestor record | `apps/gaia/src/adapters/gaia-files/ServerRecordWriter.ts:1-85`; `PageServer.ts:296-310` | Deleted in stage 6 (WP6.23); nothing else reads the record; stage 8 checks (WP8.3) |
| Gaia's page CSP that allows frames | `apps/gaia/src/lib/local-http-guards/ContentSecurityPolicy.ts:11`, `:29-30`; `PageServer.ts:240` | Changed in stage 6 (WP6.23): no frame source; stage 8 checks (WP8.3) |
| Gaia's frame view and embed channel | `apps/gaia/page/views/forge-frame/` (EmbedChannel, FrameSessionRequest, ForgeFrameSession and the view); `apps/gaia/page/shell/GaiaApp.tsx:30-33`, `:64-70`, `:230-232`; `apps/gaia/page/@types/FrameSessionDocument.ts`; `apps/gaia/page/testing/AuthoredBridge.ts` | Renamed to `page/views/forge/` in stage 6 (WP6.9); the frame parts deleted there (WP6.23); stage 8 checks (WP8.3) |
| Gaia reading the embed contract | `apps/gaia/page/shared/utils/ForgeContractUtil.ts:11`; `apps/gaia/src/adapters/forge-api/IdentityIngestion.ts:38`; `utils/ForgeReadingMapUtil.ts:33`, `:48`; `apps/gaia/src/adapters/page-api/FleetDocumentMapUtil.ts:150`, `:220`; `apps/gaia/page/@types/FleetDocument.ts:17`, `:273`; `apps/gaia/src/shared/constants/ContractVersions.ts:8`, `:19`, `:22`, `:27`; `apps/gaia/src/Main.ts:154` | Changed in stage 6 (WP6.23): Gaia reads no `embed` contract; stage 8 checks (WP8.3) |
| Gaia's own system version and registry | `apps/gaia/src/shared/constants/GaiaSystemVersions.ts:12`, `:18`, `:25-33`; `GaiaCompatibilityRegistry.ts:16-52` | Stages 8 and 9: changed |
| Gaia's view of Flint's brain | `apps/gaia/src/shared/@types/ForgeBrain.ts`; `apps/gaia/src/features/fleet/FleetAssembly.ts:52-87`; `apps/gaia/src/adapters/forge-api/MonitorSnapshotIngestion.ts:117-157`; `apps/gaia/src/features/forge-control/ForgeControl.ts:313-316`; `apps/gaia/page/views/agents/BrainModel.ts`, `BrainPanel.tsx`; `apps/gaia/CLAUDE.md:66`, `:88-90`, `:140-141`, `:150` | Stage 8: deleted or changed |
| Gaia's recording of the brain | `apps/gaia/src/lib/forge-client/OverseerFetch.flintBrain.recording.spec.ts`; `apps/gaia/src/testing/BoundaryRecordings.ts:100-105`; `apps/gaia/src/testing/recordings/darwin/overseer-fetch-flint-brain.json` | Stage 8: deleted |
| The forge version Gaia supports | `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9` (1.1); `apps/gaia/src/testing/CheckSupportedForgeVersion.ts:11-16` | Stage 8: 2.0; stage 9: 3.0 |
| How Gaia records a forge's answers | `apps/gaia/src/testing/SupportedForgeRecording.ts:1-12`; `BoundaryRecordings.ts:83-111`; `ScratchForge.ts`; `apps/gaia/CLAUDE.md:134-153` | Kept; run again in both stages |
| The Overseer's service and CLI folders | `apps/forge/src/services/overseer/` (179 tracked files), `apps/forge/cli/overseer/` (44) | Stage 9: renamed |
| Product names: login label, first port | `apps/forge/src/shared/constants/ProductNames.ts:17`, `:30-31`, `:44-45` | Stage 9: changed, but for the released program's label at `:30` |
| The data folder and the log | `apps/forge/src/services/overseer/OverseerFiles.ts:6-16` | Stage 9: `<data>/hephaestus/`, `hephaestus.log` |
| The poll-interval setting | `Environment.ts:46-62` | Stage 9: renamed |
| `progress.json` keys and format | `apps/forge/src/adapters/progress/utils/ProgressFileMappingUtil.ts:45`, `:54`; `apps/forge/src/adapters/progress/constants/ProgressFileVersions.ts:5` | Stage 9: renamed, version raised |
| `pipeline.json` gate key and format | `Pipeline.ts:6`, `:9`, `:36-37`; `apps/forge/src/adapters/pipeline/PipelineFile.ts:54`, `:162-179` | Stage 9: renamed, version raised |
| Log record kinds and field vocabulary | `LogRecordSchema.ts:33`, `:49`, `:248`, `:277-278` | Stage 9: renamed |
| Command kinds, Playbook step, decision asker | `ControlCommand.ts:128-133`; `packages/forge-contracts/@types/ForgeControlCommand.ts:10-13`; `OverseerApiContracts.ts:27-30`; `apps/forge/src/lib/tracker-model/@types/PlaybookStep.ts:42`; `apps/forge/src/lib/tracker-model/@types/Decision.ts:41` | Stage 9: renamed |
| The registry entry key Gaia reads | `apps/forge/src/services/tracker/MonitorRegistration.ts:37-38`, `:62`, `:114-117`; `apps/forge/src/services/tracker/constants/MonitorRegistryFiles.ts:6`; `apps/gaia/src/adapters/forge-registry/utils/RegistryMapUtil.ts:32-59`; `ContractVersions.ts:14` | Stage 9: renamed, registry version raised |
| The `oversee` verb | `apps/forge/cli/CommandTable.ts:42`; `apps/forge/cli/Main.ts:29`, `:38`; `apps/forge/cli/HelpText.ts:576-631`; `OverseerForeground.ts:320`; `OverseerRemote.ts:175`; `apps/forge/cli/setup/DarwinAutostart.ts:18`, `LinuxAutostart.ts:21`, `WindowsAutostart.ts:59` | Stage 9: renamed |
| Document keys and types naming the Overseer | `packages/forge-contracts/@types/BoardSummaryDocument.ts:7-29`; `MonitorSnapshotDocument.ts:27-30`, `:156`; `apps/gaia/page/@types/FleetDocument.ts:176` | Stage 9: renamed |
| The installed surface | `apps/forge/cli/constants/InstallVersion.ts:1` (29); `apps/forge/cli/FrozenInstalledSurface.json` (keys 1 to 29); `apps/forge/cli/adoption/FrozenClaudeInstall.json`; `apps/forge/resources/templates/`, `apps/forge/skills/` | Stages 8 and 9: version raised; a new frozen key; the older keys kept |
| The retired-name guard | `apps/forge/src/ComponentNames.spec.ts:21-27`, `:27-60`, `:62`, `:75-82`, `:89-94` | Stage 9: changed |
| Gaia's Overseer names | `apps/gaia/src/lib/forge-client/OverseerFetch*.ts`; `apps/gaia/src/adapters/forge-api/OverseerTokenFile.ts`; `apps/gaia/src/testing/recordings/darwin/overseer-fetch-*.json`; `BoundaryRecordings.ts:89-111`; `apps/gaia/src/testing/RecordedAnswers.ts:107-113`; `apps/gaia/CLAUDE.md:49` | Stage 9: renamed |
| Historical records that keep the old name | `docs/monorepo/` (design, migration, research); `FrozenInstalledSurface.json` keys up to the last install version; `apps/forge/src/lib/claude-code/testing/fixtures/*.jsonl` (recorded vendor output); `ProductNames.ts:30` | Stage 9: kept, named in the checks |

## Work packages

Each work package is one commit with a plain one-line subject and no AI attribution, made in a worktree under
`.claude/worktrees/<name>`. Stage 9's packages are the exception: they accumulate in one worktree and become one
commit at the end of WP9.5. Each package ends with the root green: `bun install --frozen-lockfile`, then
`bun run verify`, both exit 0. After any TypeScript change run the workspace's own `bun run typecheck`, never ad-hoc
`tsc` flags. Never edit a `package.json` to make a check pass; the manifest changes named below are deliberate removals.

Order and parallelism. Stage 8: WP8.1, then WP8.2. WP8.3 (Gaia only) may run in parallel with WP8.1 and WP8.2.
WP8.4 runs after WP8.2. WP8.5 (Gaia only) runs after WP8.3 and may run in parallel with WP8.4. WP8.6 runs after
WP8.3 and WP8.4. WP8.7 runs after WP8.5 and WP8.6. WP8.8, WP8.9 and WP8.10 run alone, in this order. WP8.11 runs
after WP8.10, and WP8.12 may run in parallel with WP8.11. Stage 9: WP9.1 to WP9.5 run alone, in order, in one
worktree. Two packages that both edit `docs/cli.md`, `docs/reference/overseer-api.md`, a `CLAUDE.md` or a rules file
never run in parallel; the order above already keeps them apart.

### WP8.1 Stop serving the Bridge page

Purpose: the Overseer builds and serves no page. `GET /` and every other path outside `/api/` answer 404.

Files to change:
- `apps/forge/src/services/overseer/OverseerServer.ts`: delete `page` from `OverseerRoutes` (`:113-117`),
  `BuiltPageFiles`, `BuiltPageOutcome`, `buildPage`, `pageFilesOf`, `pageFileResponse`, `PageFiles` (`:485-532`),
  the page branch of `routeOf` (`:583`), `pageFiles` in `requestHandlerOf` (`:630`), `PAGE_INDEX_PATH`,
  `BUILT_PAGE_INDEX_NAME` (`:166-167`), `page-build-failed` from `ServerRefusal` (`:55`) and from
  `STATUS_OF_SERVER_REFUSAL` (`:198`), and the `HTMLBundle` import (`:13`).
- `apps/forge/cli/overseer/routes/OverseerRoutes.ts`: delete the `bridgePage` import (`:11`), `page: bridgePage`
  (`:178`) and the `page-build-failed` sentence (`:55`); reword the file header (`:1-7`).
- `apps/forge/src/ImportDirection.spec.ts`: `FEATURE_REACHES_BY_PATH` (`:135-136`) becomes empty, and the planted
  cases at `:716-722` that depend on the allowed reach change to prove that any import of `bridge/index.html` from
  `cli/` is refused. If the exact-both-ways allowlist must not be empty, delete the constant and its check.
- `apps/forge/CLAUDE.md`: delete the Deviations row "A feature never reaches another" (`:334`).
- `apps/forge/src/services/overseer/OverseerServer.spec.ts` and `OverseerServer.integration.spec.ts`: delete the
  cases that build or fetch the page; add the case below.

What to do:
1. Delete the code above. `routeOf` ends with the API routes and `notFoundResponse()`.
2. Keep `bridge/` compiling on its own: nothing in `bridge/` imports the server, so it stays green until WP8.2.
3. Run `bun run record src/services/overseer/OverseerServer.ts` in `apps/forge`: the boundary changed.

Specs: `OverseerServer.spec.ts` proves that `GET /`, `GET /index.html` and `GET /chunk-abc.js` answer 404
`{refusal: 'not-found'}` with a loopback Host, and that no answer's refusal is `page-build-failed`.

Done when: in `apps/forge`, `bun run typecheck` and the two specs pass:

```bash
bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/OverseerServer.spec.ts ./src/ImportDirection.spec.ts
```

`git grep -n "bridge/index.html\|page-build-failed" -- apps/forge ':!apps/forge/bridge' ':!*.md'` prints nothing; the
root is green.

### WP8.2 Delete the Bridge program from forge

Purpose: no Bridge code, scaffolding, rule or recording is left in forge, and forge declares only the packages it
imports. Runs alone: it changes guards that every other forge package relies on.

Files to delete: `apps/forge/bridge/` (all of it); `apps/forge/src/testing/recordings/*/bridge__*.json`;
`.claude/rules/bridge.md`; `apps/forge/.readme-graphics/` and the Bridge screenshots under `apps/forge/docs/images/`
named `bridge-*.png`, if the owner confirms (see Needs the owner); `apps/forge/src/ProjectIncludeLists.spec.ts` once
it holds only the Bridge's include list (read it first: if it holds another project, change it instead).

Files to change:
- `apps/forge/package.json`: scripts `typecheck` becomes `tsc -p tsconfig.json` (drop `typecheck:root`,
  `typecheck:bridge`, `typecheck:bridge-specs`), `verify` drops `&& bun run test:dom`, delete `test:dom`;
  dependencies drop `brand`, `design-system`, `flint`, `react`, `react-dom` (no file outside `bridge/` imports them:
  `git grep -l "from 'brand\|from 'design-system\|from 'flint\|from 'react" -- apps/forge ':!apps/forge/bridge'`
  prints nothing today). Keep `marked` until WP8.8. Update the `description` (`:4`) so it names no Bridge.
- Run `bun install` at the root once, so `bun.lock` drops the removed links, then `bun install --frozen-lockfile`.
- `apps/forge/eslint.config.js`: delete the browser-storage rule (`:11-12`), the Bridge test globs (`:92-93`) and the
  `bridge/**` block (`:127` onward); keep every other rule.
- `apps/forge/src/ImportDirection.spec.ts`: delete the `bridge/` entries of the testing allowlist (`:117`, `:122-123`),
  the feature list's `bridge/`, the DOM-suite note (`:172`), the view-folder rule and its planted cases (`:284`,
  `:645`, `:656`, `:710-794`), and the `design-system` and `flint` package cases (`:609`, `:772-802`) that forge no
  longer declares. The scan's proof that it read the tree keeps a lower bound that still holds.
- `apps/forge/src/TestFileConventions.spec.ts`: a DOM spec is allowed under `packages/design-system/` and
  `packages/flint/` only.
- `apps/forge/src/ClientNames.spec.ts:26`: lower `SMALLEST_SHIPPED_FILE_COUNT` to a bound under the new count (about
  800 shipped files remain today; measure with the spec's own `isShipped`), and drop paths that no longer exist from
  `:45` (`cli/overseer/routes/FrameOrigins.ts` stays until WP8.6).
- `apps/forge/src/ComponentNames.spec.ts:75-82`: `design-system/CONSTITUTION.md` and `flint/package.json` are no longer
  scanned once forge declares neither package; replace them with files of packages forge still declares
  (`forge-contracts/package.json`).
- Every other guard that names `bridge/`: `src/LintRules.spec.ts`, `src/PlatformBoundary.spec.ts`,
  `src/ProductNameLiterals.spec.ts`, `src/RealSystemSpecs.spec.ts`, `src/SpecSkips.spec.ts`, `src/SpecSleeps.spec.ts`,
  `src/SpecsOpenNoPage.spec.ts`, `src/UtilShape.spec.ts`, `src/services/overseer/CodeVersion.spec.ts`,
  `src/testing/ImportGraph.ts`, `src/testing/ImportGraph.spec.ts`, `src/testing/BoundaryRecordings.ts`,
  `src/testing/CheckRecordingStamps.integration.spec.ts`, `cli/tracking/range/RangeCommand.spec.ts`,
  `src/services/control/BoardLifetimeControls.ts`. Remove each `bridge/` entry; every allowlist stays exact both ways.
- `apps/forge/src/testing/BoundarySpecs.ts`: delete `HEADLESS_BRIDGE_SPEC` (`:22`) and the six `bridge/` boundaries
  (`:145-150`); `OverseerServer.ts`'s boundary keeps its other two specs (`:138`).
- Rules: `apps/forge/CLAUDE.md` loses every rule that holds only for `bridge/` (`:59-61` import lines for the design
  system and Flint, `:76-78`, `:221-224`, `:268-273`, the Deviations rows naming `bridge/Main.tsx`,
  `bridge/testing/RunDomSpecs.ts`, `bridge/testing/HappyDom.ts` at `:318`, and `:341-343`); the root `CLAUDE.md`
  package table and tracker table move `packages/design-system`, `packages/flint` and `packages/brand` out of forge's
  reach (owner's call, see Needs the owner); `.claude/rules/flint.md:9-11` names the app that declares Flint after
  stage 6; `.claude/rules/design-system.md` names Gaia as the package's consumer.

What to do:
1. `git rm -r apps/forge/bridge` and the files above.
2. Fix every red guard by deleting the Bridge's entries, never by loosening a rule for other folders.
3. Search: `git grep -n -i "bridge" -- apps/forge ':!apps/forge/docs' ':!*.md'` prints only the word in wording that
   WP8.12 rewrites (refusal sentences, comments), and no path.

Specs: no new spec. Each changed guard still proves its scan found files and still fails on a planted case of each
form it keeps.

Done when: in `apps/forge`, `bun run typecheck`, `bun run lint` and `bun test` pass, and `bun run verify` runs no DOM
step; the root is green; `git ls-files apps/forge/bridge` prints nothing.

### WP8.3 Confirm that Gaia holds no embed machinery

Purpose: before forge drops its sessions, session codes, frame origins and the `embed` contract (WP8.6, WP8.10), prove
that Gaia no longer uses any of them. Stage 6 removed Gaia's side (WP6.23): the frame session route, the frame view's
frame parts and embed channel, `sessionCodeOf`, the frame-ancestor record writer, the page's frame source, the
contracts `forgeEmbedChannel`, `forgeFrameAncestorRecord` and `gaiaFrameSession`, the endpoint `frameSession`, the
command `forge-open-in-browser`, and Gaia's reading of the forge's `embed` contract. Gaia only; may run in parallel
with WP8.1 and WP8.2.

Files to change: only what the check below finds left; for each finding, delete it as WP6.23 lists, and follow the
compiler (`cd apps/gaia && bun run typecheck`). Gaia's own page session (`page/shell/SessionCodeExchange.ts`,
`src/lib/local-http-guards/SessionCodes.ts`, `src/features/page-server/routes/SessionRoutes.ts`) is Gaia's and stays.

What to do: run the check; fix what it finds; run it again.

Specs: `PageServer.spec.ts` (from WP6.23) still proves `POST /api/v1/forges/<id>/frame-session` answers 404 and the
page's policy names no frame source; `ForgeClient.spec.ts` records no `session-codes` call.

Done when: `cd apps/gaia && bun run typecheck && bun run lint && bun test` pass; this prints nothing:

```bash
git grep -n -i "frame-session\|frameSession\|EmbedChannel\|FrameAncestor\|frame-ancestor\|sessionCodeOf\|forgeEmbedChannel\|contracts.embed" \
  -- apps/gaia ':!*.md'
```

and the root is green.

### WP8.4 Remove `forge open` and the `progress.html` stub

Purpose: no forge command opens a page or writes a pointer to one, since the page is gone and forge may not name Gaia
(`apps/forge/src/ClientNames.spec.ts:1-5`). Runs after WP8.2; may run in parallel with WP8.5.

Files to delete: `apps/forge/cli/tracking/open/` (OpenCommand, OpenThroughARedirectFile and their specs);
`apps/forge/cli/OpenInTheDefaultBrowser.ts`, `OpenInTheDefaultBrowser.spec.ts`,
`OpenInTheDefaultBrowser.integration.spec.ts`, `OpenerFor.ts`, `OpenerFor.spec.ts`, `Opener.contract.spec.ts` and
every opener adapter only they reach (`git grep -ln "openerFor\|OpenerFor\|Opener\b" -- apps/forge`);
`apps/forge/src/testing/recordings/*/cli__OpenInTheDefaultBrowser.ts.json`;
`apps/forge/src/adapters/progress-page/` (the stub writer and its spec);
`apps/forge/cli/adoption/WriteProgressPageStub.ts`; `apps/forge/src/SpecsOpenNoPage.spec.ts` if it guards only
the opener (read it; if it also guards other page openers, keep it and drop the opener's planted cases).

Files to change:
- `apps/forge/cli/CommandTable.ts:40` and the `open` block of `apps/forge/cli/HelpText.ts` (`:570-580`).
- `apps/forge/cli/overseer/OverseerRemote.ts`: delete `sessionCodeOf` (`:214-230`) and its export (`:232`).
- `apps/forge/cli/adoption/init/InitCommand.ts:35`, `:103`, `:173`; `update/UpdateCommand.ts:27`, `:69`;
  `apps/forge/cli/overseer/OverseerForeground.ts:15`, `:174`: no stub.
- `htmlFilePath` of `Workspace` and the `progress.html` name stage 5 kept private to
  `apps/forge/src/services/tracker/Workspace.ts` (stage 5, WP5.11; `TrackerFiles.ts:11` today), and every
  `htmlFilePath` reader, `MonitorRegistrationRequest.htmlFilePath` (stage 5, WP5.9) among them: the board has no
  `progress.html`. `init` and `update` remove an existing `progress.html` once, as they remove a retired install's
  files.
- The registry entry's `progressHtml` (`apps/forge/src/services/tracker/MonitorRegistration.ts:151`) is no longer
  written, and `progressJson` goes with it when no code in `apps/` or `packages/` reads it (stage 5's "Needs the
  owner", item 4; `git grep -n "progressHtml\|progressJson" -- apps packages ':!*.spec.ts'`). If a reader of either
  key is found, keep writing that key until stage 9 raises the registry's version (WP9.2), and say so in the commit.
- `apps/forge/src/shared/constants/OverseerLimits.ts:120`: delete `SESSION_CODE_LIFETIME_SECONDS` once WP8.6 no longer
  reads it (it is read by `BrowserSessions.ts:8`; leave it until WP8.6).
- `apps/forge/src/testing/BoundarySpecs.ts:141`, `src/testing/RecordedBoundaryCommands.ts`, `BoundaryRecordings.ts`:
  the opener's boundary goes.
- `apps/forge/src/testing/RecordedOverseerFetch.ts:226-236`: the `session-codes` and `session` call shapes stay until
  WP8.6, which deletes them with the routes.
- `apps/forge/CLAUDE.md`: the Runtime sentence on `openerFor` (`:142-143`), and the Tests rule "A spec never opens a
  page" (`:265-267`) if its guard went.
- `apps/forge/cli/constants/InstallVersion.ts:1`: raise `INSTALL_VERSION` by one: `open` is in the frozen surface of
  install version 29 (`apps/forge/cli/FrozenInstalledSurface.json:431-534`). Add the new version's key to
  `FrozenInstalledSurface.json` as `cli/InstalledSurface.spec.ts:1-9` describes, never deleting a name from an older
  key; retake `apps/forge/cli/adoption/FrozenClaudeInstall.json` through its spec's
  `frozenTableFromTheCurrentImplementation`; run `bun run record src/services/overseer/InstallChangeWatch.ts`.
- Installed text that names `open` or the Bridge's page: `resources/templates/SessionInstructions.md:26` ("Run
  `{{program}} open` once per session", deleted), and the rest of `resources/templates/` and `skills/` (search
  `git grep -n -w "open\|progress.html" -- apps/forge/resources apps/forge/skills`).
- `apps/forge/docs/cli.md`: delete the `open` and `progress.html` entries; `docs/backlog.md` entries about them go.

What to do: delete, then follow `bun run typecheck`. Later work packages of stage 8 that change an installed file
change only its text and the new frozen key; they do not raise `INSTALL_VERSION` again.

Specs: `cli/RetiredVerbs.spec.ts` gains `['open']` and `['open', '--no-browser']` in `RETIRED_COMMAND_LINES`: each is
refused at exit 1 as unknown and writes nothing; `cli/adoption/init/InitCommand.spec.ts` proves `init` writes no
`progress.html`; `cli/CommandTable.spec.ts` and `cli/HelpText.spec.ts` agree without `open`.

Done when: in `apps/forge`, `bun run typecheck`, `bun run lint` and `bun test` pass; `bun run check` reports no stale
stamp; `git grep -n -w "openCommand\|sessionCodeOf\|ProgressPageStub\|HTML_FILE_NAME" -- apps/forge` prints nothing;
the root is green.

### WP8.5 Remove Flint's brain from Gaia

Purpose: Gaia neither reads nor shows nor commands Flint's brain, so forge can drop it. Gaia only; after WP8.3; may
run in parallel with WP8.4.

Files to delete: `apps/gaia/src/shared/@types/ForgeBrain.ts`; `apps/gaia/page/views/agents/BrainModel.ts`,
`BrainPanel.tsx`, `AgentsModel.brain.spec.ts`; `apps/gaia/page/testing/fixtures/fleet-brain-states.ts` and its spec;
`apps/gaia/src/lib/forge-client/OverseerFetch.flintBrain.recording.spec.ts`;
`apps/gaia/src/testing/recordings/darwin/overseer-fetch-flint-brain.json`; the brain chip of `page/design-system/`.

Files to change:
- `apps/gaia/src/adapters/forge-api/MonitorSnapshotIngestion.ts:10-12`, `:117-139`, `:157`: the monitor shape no longer
  names `flintBrain`; a document that still carries it reads, its key passed over as any unknown key
  (`apps/gaia/CLAUDE.md:43-45`).
- `apps/gaia/src/features/fleet/FleetAssembly.ts:8`, `:52-87`: no brain row.
- `apps/gaia/src/features/forge-control/ForgeControl.ts:313-316` and Gaia's command kinds `forge-brain-start` and
  `forge-brain-stop` in the page contract (`page/@types/CommandDocument.ts`).
- Everything else `git grep -ln -i "brain" -- apps/gaia` lists: `ActivityModel.ts`, `AttentionModel.ts`,
  `AgentsView.tsx`, `SelectedAgentPanel.tsx`, `ForgeReadingMapUtil.ts`, `ActivityEntry.ts`, the fixtures and
  `ArtboardScreens.tsx`, `ExampleForgeDocuments.ts`.
- `apps/gaia/src/testing/BoundaryRecordings.ts:100-105`, `RecordedAnswers.ts` (`FlintBrainSituation`, the brain's
  answer set), `SupportedForgeRecording.ts:1-12` and the brain suite.
- `apps/gaia/CLAUDE.md`: rule 10 drops "the brain chip" (`:66`); rule 12 drops the brain sentence (`:88-90`); the
  recordings paragraph drops `overseer-fetch-flint-brain` and the brain's session (`:140-141`, `:150`).
- `apps/gaia/docs/architecture.md`, `docs/contracts.md`, `docs/forge-requirements.md`: the brain leaves the text.

What to do: delete, follow the compiler. Gaia's fleet document and command document lose the brain's keys and kinds;
their versions change in WP8.10.

Specs: `MonitorSnapshotIngestion.spec.ts` proves a monitor snapshot with a `flintBrain` key and one without both read
the same; `FleetAssembly.spec.ts` proves no row has the role `brain`; `ForgeControl.spec.ts` drops the brain cases.

Done when: `cd apps/gaia && bun run typecheck && bun run lint && bun test && bun run check` pass;
`git grep -n -i "brain" -- apps/gaia` prints nothing; the root is green.

### WP8.6 Remove browser sessions, session codes, frame origins and the page policy

Purpose: the server's only reader credential is the bearer token, and no answer carries a frame policy. Runs after
WP8.2, WP8.3 and WP8.4.

Files to delete: `apps/forge/src/services/overseer/BrowserSessions.ts`, `BrowserSessions.spec.ts`;
`apps/forge/cli/overseer/routes/FrameOrigins.ts`, `FrameOrigins.spec.ts`.

Files to change:
- `apps/forge/src/services/overseer/OverseerServer.ts`: delete `SESSION_COOKIE_INFIX`, `COOKIE_PAIR_SEPARATOR`,
  `RouteAccess.sessions` and `sessionCookieName` (`:143-153`), `sessionCookieNameOf`, `sessionSecretIn`,
  `sessionIsHeld` (`:297-313`), `sessionTokenResponse`, `sessionCodeResponse`, `sessionExchangeResponse` (`:335-358`),
  the `/api/session-token` route (`:538`), the `/api/session-codes` and `/api/session` routes (`:574-575`),
  `CommandCaller` (`:71-75`) and its argument at `:250`, `frameOrigins` (`:111-112`), `contentSecurityPolicyOf`
  (`:184-188`), `withPagePolicy` (`:587-591`) and `now` on `OverseerServerRequest` (`:124-125`) if nothing else reads
  it. `readerIsAuthorized` becomes `bearerTokenMatches(request, routes.token())`; rename the remaining `RouteAccess`
  to what it then holds or pass `routes` directly. Every answer that has no `content-security-policy` of its own gets
  `API_CONTENT_SECURITY_POLICY` (Interfaces introduced); pictures and job files keep `sandbox`.
- Rewrite the header (`:1-10`): the reads, the open three, the token, the guards; no page, session or brain.
- `apps/forge/cli/overseer/routes/OverseerRoutes.ts`: delete the `FrameOrigins` import (`:39`) and `frameOrigins`
  (`:177`); reword `unauthorized` and `forbidden` (`:52-53`) so they name no page and no session, and name no command
  line (`apps/forge/CLAUDE.md:90-92`).
- `apps/forge/cli/overseer/routes/CommandRoute.ts`: `answerControlCommand(body, request)` takes no caller; the brain's
  start, which read the caller (`:126-128`), goes in WP8.7, so here pass a fixed `'api'` until then.
- `apps/forge/cli/overseer/OverseerForeground.ts:466-470`: the server request has no `now` if it was removed.
- `apps/forge/src/testing/RecordedOverseerFetch.ts:222-240`: delete the `session-token`, `session-codes` and `session`
  call shapes and the session-cookie branch of `readerIsAuthorized`.
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:45` and `ForgeCompatibilityRegistry.spec.ts:29`,
  `:53-55`: `session-codes` leaves the registry and the spec's lists.
- `apps/forge/src/ClientNames.spec.ts:45`: drop `cli/overseer/routes/FrameOrigins.ts`.
- `apps/forge/src/shared/constants/OverseerLimits.ts:120`: delete `SESSION_CODE_LIFETIME_SECONDS`.
- `apps/forge/docs/reference/overseer-api.md`: the route table rows for `session-codes`, `session`, `session-token`
  and "Any other GET outside /api/" (`:44-46`, `:64`), and the sections "Browser sessions" (`:112-136`) and "Serving
  the page" (`:137-164`); `apps/forge/docs/cli.md:1235-1238`.

What to do:
1. Delete in the order above, then `bun run typecheck` in `apps/forge`.
2. Run `bun run record src/services/overseer/OverseerServer.ts` and `bun run record cli/overseer/routes/` in
   `apps/forge`: both boundaries changed.

Specs:
- `OverseerServer.spec.ts`: `POST /api/session-codes`, `POST /api/session` and `GET /api/session-token` answer 404;
  every data route answers 401 `unauthorized` to a request with a cookie and no token, and its document to the
  token; a JSON answer carries `API_CONTENT_SECURITY_POLICY` and no `frame-ancestors` source but `'none'`; a picture
  and a job file still carry `sandbox`.
- `OverseerServer.integration.spec.ts` (`:44`, `:146-153`, `:237`): the same against a real server.
- `CommandRoute.spec.ts`: the route answers as before without a caller.

Done when: in `apps/forge`, `bun run typecheck`, `bun run lint`, `bun test` and `bun run check` pass; this prints
nothing:

```bash
git grep -n "session-codes\|session-token\|BrowserSessions\|frameOrigins\|FrameOrigins\|carriesBridgeSession" \
  -- apps packages ':!*.md'
```

and the root is green.

### WP8.7 Remove Flint's brain from forge and from the contracts

Purpose: no forge code runs, serves or commands Flint's brain; the contract package names no brain. Runs after
WP8.5 and WP8.6.

Files to delete: `apps/forge/src/services/overseer/FlintBrain.ts`, `FlintBrain.spec.ts`, `FlintBrainProfile.ts`,
`FlintBrainProfile.spec.ts`, `FlintBrainSessionHost.ts`, `@types/FlintBrainRun.ts`,
`utils/FlintBrainDigestUtil.ts` and spec, `utils/FlintBrainWordingUtil.ts` and spec;
`apps/forge/cli/overseer/OverseerFlintBrain.ts`; `apps/forge/cli/overseer/routes/CommandRoute.flintBrain.spec.ts`;
`apps/forge/src/services/overseer/testing/fixtures/monitor-v3-flint-brain.json`; the brain's child folder handling
that stage 2 added to `FlintBrainSessionHost.ts` and `cli/overseer/OverseerFlintBrain.ts` goes with them (N6), and a
board's `flint-brain/` child folder is no longer launched.

Files to change:
- `OverseerServer.ts`: delete `askFlintBrain` (`:87-88`), `FLINT_BRAIN_ASK_PATH` (`:181-182`),
  `answerFlintBrainAsk` (`:320-333`), the route at `:577`, the `FLINT_BRAIN_DIGEST_SIZE_LIMIT_BYTES` import.
- `OverseerRoutes.ts`: delete `flintBrain` from `OverseerRouteRequest` (`:42`), `askFlintBrain` (`:125-129`),
  `FLINT_BRAIN_ASK_STATUS` (`:59-62`), the `FlintBrain` and `FlintBrainDigestUtil` imports (`:20`, `:32`).
- `CommandRoute.ts`: delete `flintBrain` (`:41-42`), `flintBrainAnswerOf`, `isFlintBrainKind` (`:126-138`), the
  branch at `:144`; `COMMAND_ROUTE_KINDS` (`:55`) loses the brain's kinds and keeps leaving out
  `BY_HAND_COMMAND_KINDS` (stage 5, WP5.6), so the endpoint still refuses the by-hand kinds; reword the header
  (`:1-8`).
- `apps/forge/cli/overseer/OverseerForeground.ts`: delete every line of the table row "The brain in the Overseer's
  serving period"; `publishFlintBrainChange` goes, and nothing else publishes on a brain change.
- `apps/forge/cli/overseer/routes/BoardStateReader.ts:5`, `:31`, `:49-59`, `:141-146`, `:194-201`: the board state
  has no `flintBrain`; `BoardStateWithFlintBrain` and `FlintBrainBoardFacts` go.
- `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts:7`, `:26`, `:62-63`, `:158`, `:197-219`, `:318-321`:
  no brain in the snapshot, no `flint-brain` activity kind, today's tokens count no brain run.
- `packages/board-readings/TodayFigures.ts:6`, `:26-59`: delete `TodayFlintBrainRun` and `flintBrainRunsOf`;
  `todayFiguresOf` takes no runs.
- `packages/board-readings/@types/MonitorSnapshot.ts:13`, `:99-100`, `:159-160`.
- `apps/forge/src/shared/@types/ControlCommand.ts:233-239` (`FlintBrainCommand`, `OverseerApiCommand`);
  `apps/forge/src/services/control/ControlService.ts:9`, `:58-59`;
  `apps/forge/src/shared/constants/OverseerApiContracts.ts:34-35`.
- `apps/forge/src/shared/constants/OverseerLimits.ts:143-170`; `apps/forge/src/shared/Environment.ts:92-118`.
- The writer of the brain's log record: `Board.ts:452-454`, `Jobs.ts:313-317`. The reader stays (`LogRecord.ts`,
  `LogRecordSchema.ts`, `FlintBrainVocabulary.ts`, `LogRecordProblem.ts`, `LogRecordMappingUtil.ts`, `LogUtil.ts`).
  `EveryBoardLogRecord.ts` (`apps/forge/src/testing/EveryBoardLogRecord.ts:250-252` today; in
  `packages/tracker-model/testing/` after stage 4) builds that one record from a literal, with a one-line
  comment that no Board change logs it any more.
- `apps/forge/src/testing/FakeAgentAdapter.ts:84-125`: delete `FAKE_FLINT_BRAIN_ANSWER`,
  `FLINT_BRAIN_FAKE_AGENT_STEPS` and the tool-less branch at `:125`, unless another tool-less session exists
  (`git grep -n "availableTools === 'none'\|availableTools: 'none'" -- apps/forge`).
- The vendor records of a brain turn stay: `apps/forge/src/lib/claude-code/ClaudeStreamFixtures.spec.ts:165-167`,
  `src/testing/fake-agent/RecordedClaudeLines.ts:23`, `ClaudeWireRecorder.ts:19-25`, `src/PlatformProbes.spec.ts:74`,
  `.platform-probes/claude-p22-flint-brain-turn.js` and the `flint-brain-turn` scenario in
  `src/testing/recordings/darwin/src__testing__fake-agent.json`. They record the vendor's answer to a tool-less,
  structured-output turn; removing them forces a recording with a real model call (Needs the owner).
- `packages/forge-contracts/@types/MonitorSnapshotDocument.ts`: delete `MonitorFlintBrainState`,
  `MonitorFlintBrainStartedBy`, `MonitorFlintBrainEndedReason` (`:20-25`), `MonitorFlintBrainMoveDocument`,
  `MonitorFlintBrainRefusalDocument`, `MonitorFlintBrainDocument` (`:122-150`), the `flintBrain` key and the
  `flint-brain` activity kind; `packages/forge-contracts/@types/ForgeControlCommand.ts`: the two brain kinds;
  `packages/forge-contracts/README.md`: the brain leaves the export table.
- `packages/forge-contracts/constants/OverseerContractVersions.ts:8` comment; the version numbers change in WP8.10.
- `apps/forge/src/services/overseer/testing/fixtures/monitor-v3.json` and the specs that read it.
- Docs: `apps/forge/docs/reference/overseer-api.md` "Flint's brain" (`:236-280`) and its route row (`:51`);
  `apps/forge/docs/cli.md`, `docs/operations/runbook.md`, `docs/backlog.md` lines naming the brain.

What to do: delete, follow the compiler in `apps/forge`, then in `packages/forge-contracts` and `apps/gaia`
(WP8.5 already made Gaia independent of the brain's types). Run `bun run record src/services/overseer/OverseerServer.ts`
and `bun run record cli/overseer/routes/` in `apps/forge`.

Specs:
- `OverseerServer.spec.ts`: `POST /api/flint-brain/ask` answers 404.
- `CommandRoute.controlContract.spec.ts`: `flint-brain-start` and `flint-brain-stop` answer 400 `malformed-body`.
- `MonitorSnapshotAssembly.spec.ts`: the snapshot has no `flintBrain` key, and a log holding a `flint-brain-ended`
  record yields no activity entry of kind `flint-brain` and adds no tokens to today's figures.
- `Board.logRecords.spec.ts`: a stored `flint-brain-ended` record still reads and words as before.

Done when: in `apps/forge`, `bun run typecheck`, `bun run lint`, `bun test` and `bun run check` pass;
`git grep -n -i "flintBrain\|flint-brain\|FLINT_BRAIN" -- apps/forge packages ':!*.md'` lists only the kept reader
files, the vendor records listed above and `EveryBoardLogRecord.ts`; the root is green.

### WP8.8 Markdown leaves forge as Markdown

Purpose: forge renders no HTML. The board document carries the Markdown source of a ticket body and an epic
description, and Gaia shows it (N3). Runs alone, after WP8.7.

Files to delete: `apps/forge/src/services/render/MarkdownRenderer.ts`, `MarkdownRenderer.spec.ts`,
`RenderState.ts`.

Files to change:
- `apps/forge/src/services/render/PagePayloadAssembly.ts:17`, `:58-66`, `:88`: `bodyHtml` becomes `bodyMarkdown`
  (the ticket body as stored, with no blank line added before Acceptance items), `descriptionHtml` becomes
  `descriptionMarkdown`; the `renderMarkdown` input goes. Keep `withAcceptanceItemsSeparated` only if Gaia needs the
  separation, moved to Gaia; otherwise delete it with the renderer.
- `apps/forge/src/shared/@types/PagePayload.ts:76-79`, `:106-108`, and the board documents stage 4 put in
  `packages/forge-contracts` (N4, `forge-contracts/BoardStateDocument` and the documents that name the fields): the same
  two keys; `BoardState.documents.spec.ts` (stage 4, WP4.8) keeps holding.
- `apps/forge/cli/CommandContext.ts:13`, `:55`, `:131`; `apps/forge/cli/testing/CapturedCommandContext.ts:10`, `:102`;
  `BoardStateReader.ts:167`: no render state.
- `apps/forge/package.json`: drop `marked`; run `bun install` once at the root, then `--frozen-lockfile`.
- `apps/forge/CLAUDE.md:167-168`: "The render service keeps no module state: the configured Marked lives in the render
  state the command context carries" goes.
- Gaia: the page renders the Markdown it shows (N3). The views stage 6 moved read `bodyMarkdown` and
  `descriptionMarkdown` and render them to HTML in the page, shown where they showed `bodyHtml` and `descriptionHtml`;
  the renderer is a dependency of Gaia's page (`marked` at the version forge drops, unless the owner picks another,
  "Needs the owner", item 17), with its specs under `page/board/`.
- `apps/forge/docs/reference/overseer-api.md:410-416`; `apps/forge/docs/glossary.md:90`;
  `apps/forge/docs/development/guards-and-testing.md:55`.

What to do: rename the fields in the contract first, then follow the compiler in `apps/forge` and `apps/gaia`.

Specs: `PagePayloadAssembly.spec.ts` proves a ticket entry's `bodyMarkdown` equals the stored body byte for byte, an
epic's `descriptionMarkdown` its stored description, and that no key of the document ends in `Html`.

Done when: `git grep -n "bodyHtml\|descriptionHtml\|renderMarkdown\|from 'marked'" -- apps packages` prints nothing;
the root is green.

### WP8.9 The Assistant does not start unless the board turns it on

Purpose: decision 24. A pass boots an Assistant only while the board's switch is on; while it is off, every open
incident takes its default at once with the cause `assistant-off`. Runs alone, after WP8.8.

Files to change (mirror every file that names `pipeline-approval-set`: `git grep -ln "pipeline-approval-set"`). The
tracker model lives in `packages/tracker-model/` since stage 4, at the same path inside the package; the line numbers
are today's, read at `apps/forge/src/lib/tracker-model/`:
- `packages/tracker-model/@types/Pipeline.ts:95-120`: `Pipeline` gains `assistant?: true`, present means on.
- `packages/tracker-model/utils/PipelineUtil.ts:62-83`, `:114-120`: `formatVersionOf` answers
  `PIPELINE_FORMAT_VERSION` when `assistant` is present, as it does for `reach`; the key stays out of the gating
  hash, like `approvals`, and is in the apply-conflict hash, like `approvals`.
- `apps/forge/src/adapters/pipeline/PipelineFile.ts`: read and validate `assistant` (present and not `true` is a
  problem, as `overseerOnly` is at `:162-164`); write it only when on. Stage 5's store adapter carries it (N8).
- `apps/forge/src/shared/@types/ControlCommand.ts`: `{ kind: 'pipeline-assistant-set'; on: boolean }`.
- `apps/forge/src/services/control/SettingControls.ts`: its applier, `inReadablePipeline` like `:50-52`, calling
  `transaction.board.setAssistant(command.on, transaction.at)` on stage 5's `BoardTransaction`. Switching off while an
  Assistant job is live stops that job in the same hold with the existing `job-stop` move, mode `stop` (Needs the
  owner).
- `packages/tracker-model/Board.ts`: `setAssistant(on: boolean, at: string): Logged`, which writes the
  pipeline and logs `pipeline-assistant-set`; `assistantIsOn(): boolean`; `playbookFactsOf` (`:675-690`) adds
  `assistantIsOn: this.records.pipeline?.assistant === true`.
- `packages/tracker-model/TrackerChanges.ts`: the change kind, as for the approval.
- `packages/tracker-model/constants/LogRecordSchema.ts`: `'pipeline-assistant-set': { subject: 'board',
  fields: { state: 'text' } }`, beside `:256-257`; `apps/forge/src/adapters/utils/LogUtil.ts`: its sentence.
- `packages/tracker-model/Playbook.ts`: `PlaybookFacts.assistantIsOn: boolean` (`:39-52`);
  `noAssistantCanComeUp` and `assistantMayBoot` (`:535-536`) unchanged; a new `const assistantIsOff =
  !facts.assistantIsOn`; the boot at `:546` also requires `!assistantIsOff`; `incidentDefaultStepsOf` (`:493-501`)
  answers `{ kind: 'default-incident', incidentId, cause: 'assistant-off' }` for every incident while the Assistant is
  off, checked before the `no-assistant` branch.
- `packages/tracker-model/@types/Incident.ts:34-35` and
  `constants/DecisionAndIncidentVocabulary.ts:52`: `IncidentDefaultCause` adds `'assistant-off'`.
- `LogUtil.ts:340` adds `'assistant-off': 'while the Assistant was off'`; `NoticeWordingUtil.ts:24` adds
  `'assistant-off': 'the Assistant is off'`.
- `apps/forge/src/services/control/Bouncer.ts` (and `Bouncer.spec.ts`): no job role may send the new kind, as for the
  approval.
- `apps/forge/cli/gates/GatePipelineVerbs.ts`: the verb `gate assistant on|off [--json]`, a usage line beside `:40`, a
  parser beside `:175-181`, `Assistant: on|off` in `gate list` beside `:212-213`, the key in the JSON of `:238`.
- `apps/forge/cli/constants/JobVerbs.ts`, `apps/forge/cli/HatchUnderJob.spec.ts`: refused under a job.
- `apps/forge/cli/HelpText.ts`: the block for the verb; `apps/forge/docs/cli.md`: the verb, the key and the record.
- `apps/forge/src/services/render/PipelineFactsAssembly.ts`, `MonitorSnapshotAssembly.ts`: where the approval is read
  for the documents, read the switch too.
- Installed text: `resources/templates/Reference.md:183-197` and `skills/agent-progress-orchestrate/SKILL.md:19`, `:80`
  say an Assistant settles incidents; reword so they hold whether the Assistant is on or off (the incident takes its
  default while it is off). Add the new frozen key's names in `FrozenInstalledSurface.json` only if the verb is named
  in an installed file; `INSTALL_VERSION` was raised in WP8.4.
- `packages/tracker-model/testing/LifecycleFixtures.ts:79`: the default facts have `assistantIsOn: true`, so
  the specs that test the Assistant keep testing it; add fixtures with it off.

What to do: build the model first (types, Board, Playbook), then the control, then the CLI, following the approval at
each step.

Specs:
- `Playbook.spec.ts`: with the switch off and no Assistant live, no `boot-assistant` step; with it on, the step as
  today; with it off, every open incident gets `default-incident` with cause `assistant-off` in the same pass, also one
  delivered to a turn; with it on, the `no-assistant` cases hold as today (`:501`).
- `SettingControls.spec.ts`: `pipeline-assistant-set` on writes `assistant: true` and logs `state: 'on'`; off removes
  the key, logs `state: 'off'` and stops a live Assistant job; on an unreadable pipeline it refuses as the approval
  does.
- `PipelineFile.spec.ts`: a pipeline with `assistant: true` round-trips byte for byte; `assistant: false` is a problem.
- `GatePipelineVerbs.spec.ts`: the verb, its usage refusal and its JSON answer.
- `Bouncer.spec.ts`, `HatchUnderJob.spec.ts`, `ControlService.spec.ts`: the new kind in their exact lists.

Done when: in `apps/forge` and in `packages/tracker-model`, `bun run typecheck`, `bun run lint` and `bun test` pass;
in `packages/tracker-model`, `bun test ./Playbook.spec.ts` names the cases above; the root is green.

### WP8.10 Forge 2.0 and Gaia's next major

Purpose: the system versions say what stages 8's removals did. Runs alone, after WP8.9.

Files to change:
- `packages/forge-contracts/constants/ForgeSystemVersions.ts:14-17`: `current: { major: 2, minor: 0 }`,
  `minimumSupported: { major: 2, minor: 0 }`; rewrite the docblock (`:7-13`) for 2.0.
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts`: the entries listed under Interfaces introduced;
  the three `keptForReleasedClientsOf` entries (`:46-48`) go, since the minimum passed 0.0 (Needs the owner).
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.spec.ts:1-61`: rewrite the lists and claims for 2.0:
  the guard holds, every entry is shipped, a 2.0 client calls each endpoint at the listed version, nothing is
  removable at 2.0.
- `packages/forge-contracts/constants/OverseerContractVersions.ts:9-15` and its spec: delete `embed`; `monitor` one
  higher (today 3, so 4, unless stage 3 or 6 raised it: `flintBrain` and the `flint-brain` activity kind left the
  document), `control` one higher (today 1, so 2: two kinds left); `identity` and `summary` stay.
  `packages/forge-contracts/@types/IdentityDocument.ts:4`: `ServedContractName` loses `'embed'`.
  `apps/forge/src/shared/constants/OverseerApiContracts.ts:12-17` loses `embed`.
- `packages/forge-contracts`: delete `constants/EmbedMode.ts`, `@types/EmbedChannelMessage.ts`,
  `@types/FrameAncestorRecord.ts` and their `exports` (`package.json:13-15`); `version` becomes `2.0.0`; the
  `description` (`:4`) and `README.md` drop the embed channel and the framing record. Run `bun install` once at the
  root, then `--frozen-lockfile`.
- `apps/forge/src/services/overseer/OverseerServer.ts:600-606`: unchanged code; check that `servedEndpointsOf` serves
  each new entry.
- Gaia: `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9` becomes `{ major: 2, minor: 0 }`; the
  endpoint versions Gaia calls follow from the registry by themselves (`apps/gaia/CLAUDE.md:38-40`).
- Gaia's own: `GAIA_SYSTEM_VERSION` (`apps/gaia/src/shared/constants/GaiaSystemVersions.ts:12`) to its next major, minor
  0, and `MINIMUM_SUPPORTED_GAIA_VERSION` (`:18`) to the same (today 1.1 and 0.0, so 2.0 and 2.0, unless stage 6 raised
  Gaia's major; then one above it); in `GAIA_ENDPOINT_VERSIONS` (`:25-33`), `fleet`, `events` and `commands` one higher
  (the fleet document lost the brain, the command document the brain's kinds; `embed` and the frame left them in stage
  6, WP6.23); the docblock (`:20-24`) says why; `GaiaCompatibilityRegistry.ts`: each changed route introduced in the new
  version, the unversioned-routes entry (`:46-51`) gone; `apps/gaia/src/shared/constants/ContractVersions.ts`:
  `gaiaFleetDocument` and `gaiaCommand` one higher; Gaia's `docs/contracts.md` in the same change. If Gaia's server
  answers unversioned routes only for that entry, remove them; if a caller in this repository uses one
  (`git grep -n "'/api/[a-z]" -- apps/gaia ':!*.spec.*'`), keep them and say why in `docs/contracts.md` (Needs the
  owner).
- `apps/forge/CLAUDE.md:93-97` and `apps/gaia/CLAUDE.md:26-45`: name the versions only where they already do.
- `apps/forge/docs/reference/overseer-api.md` "Contracts", "System versions", "Versioned paths", "Contract versions",
  "The embed contract" (`:627-829`).

What to do:
1. Run `cd packages/forge-contracts && bun run versions:raise-minimum 2.0` after setting the current version to 2.0 and
   before raising the minimum: it lists what becomes removable. Remove exactly that, and the code it keeps.
2. Raise the minimum; `ForgeCompatibilityRegistry.spec.ts` must pass with no inconsistency.
3. Do the same for Gaia with `cd apps/gaia && bun run versions:raise-minimum 2.0`.

Specs: the two registry specs as above; `apps/gaia/src/testing/CheckSupportedForgeVersion.spec.ts` unchanged;
`CommandRoute.controlContract.spec.ts` pins `controlVersion: 2` in every answer.

Done when: `cd apps/gaia && bun run check` prints "Gaia supports forge's current version, 2.0."; the root is green.

### WP8.11 Gaia records again

Purpose: every forge answer Gaia mocks is recorded from this repository's forge at 2.0. Runs after WP8.10; may run in
parallel with WP8.12.

Files to change: the recordings under `apps/gaia/src/testing/recordings/darwin/` whose system is `forge`
(`apps/gaia/src/testing/BoundaryRecordings.ts:34-111`): `forge-program`, `forge-program-done`,
`forge-program-refused`, `forge-registry`, `overseer-fetch-supported-forge`, `overseer-fetch-versions`; and every
spec whose recorded answer changed.

What to do:
1. In `apps/gaia`, with the forge of this checkout:
   `GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record <name>` for each name above.
   The recording runs a scratch forge under a scratch home with the fake agent (`apps/gaia/CLAUDE.md:139-150`); it
   makes no model call and touches no real home.
2. For `overseer-fetch-versions`, also name a forge from before system versions in
   `GAIA_RECORDING_UNVERSIONED_FORGE_PROGRAM`: a scratch clone of this repository at the parent of `6f521908` (the
   commit that gave forge its system versions), placed under the scratch root `ScratchForge.ts` uses, and removed
   afterwards (see Not established).
3. Read each new recording: `GET /api/versions` answers `{current: {major: 2, minor: 0}, minimumSupported: {major: 2,
   minor: 0}}`; the identity's `contracts` has no `embed`; the monitor has no `flintBrain`; `POST /api/v1/session-codes`
   is not called; every endpoint path is at the version the registry serves 2.0.
4. In `apps/forge`, run `bun run record cli/overseer/routes/` and
   `bun run record src/services/overseer/OverseerServer.ts` if WP8.10 changed what they record.

Specs: `apps/gaia/src/testing/RecordedAnswers.spec.ts` and every spec that plays a forge recording pass on the new
answers; fix a spec only where the forge's answer changed for a reason of this stage.

Done when: `cd apps/gaia && bun run check` lists no forge recording as stamped `authored` and no stale stamp; the
root is green.

### WP8.12 The documents describe a headless forge

Purpose: no human-facing document of forge or Gaia describes the Bridge as a program, the embed machinery, session
codes, `open`, `progress.html` or Flint's brain as present. Runs after WP8.10; may run in parallel with WP8.11.

Files to change: `apps/forge/README.md` (screenshots, architecture paragraph `:33`, the images table `:220`);
`apps/forge/docs/reference/overseer-api.md` (whatever earlier packages left), `docs/cli.md`, `docs/glossary.md`,
`docs/operations/running-a-board.md`, `docs/operations/getting-started.md`, `docs/operations/runbook.md`,
`docs/development/contributing.md`, `docs/development/guards-and-testing.md`, `docs/reference/refusals.md`,
`docs/concepts/overview.md`, `docs/concepts/ticket-lifecycle.md`, `docs/README.md`, `docs/backlog.md`;
`apps/forge/resources/prompts/PipelineAgentPrompt.md` and `PipelineAgentDesign.md` (stage 6's WP7.2 already reworded
them; check), `resources/templates/PipelineAgentBrief.md:6`, `Reference.md:245`, `skills/agent-po/SKILL.md:142`,
`skills/agent-progress-orchestrate/SKILL.md:75`, which tell User to act "in the Bridge"; wording in `apps/forge/src`
and `apps/forge/cli` that names the Bridge (`git grep -n -w "Bridge" -- apps/forge/src apps/forge/cli ':!*.spec.ts'`);
`apps/forge/CLAUDE.md:4` (the opening line), `:46-48` (the component list), `:71` (the tracker model is DOM-safe for
the Bridge's project), `:90-92` (a sentence names "the Bridge control"), `:389` (the Bridge reads rows as bars);
Gaia's `docs/architecture.md`, `docs/forge-requirements.md`, `docs/backlog.md`.

What to do:
1. A sentence an API, a monitor or an agent shows names a neutral action and no surface, since forge names no client:
   replace "the Bridge control" and "in the Bridge" by the action ("answer the question", "ready the ticket"). The rule
   in `apps/forge/CLAUDE.md:90-92` becomes: "It names a neutral action, such as 'update the board'."
2. New system text (the rule, the installed texts) is written in ASD-STE100 (`apps/forge/CLAUDE.md:293-294`); human
   documentation is not.
3. Keep `docs/research/` as written: it records findings at a date.
4. Wrap prose at 120 columns; `src/ProseWrap.spec.ts` holds the files it lists.
5. If the owner accepts "Needs the owner", item 9, add `'Bridge'` to `RETIRED_NAMES` in
   `apps/forge/src/ComponentNames.spec.ts` with a planted case. The guard matches substrings and scans the packages
   forge declares, so first rename every identifier that holds the word, among them `BridgeFragmentUtil` in
   `packages/board-readings` (stage 4) and its importers in `apps/gaia/page/board/` (stage 6), checked against the
   retired names before it is chosen.

Specs: `cli/ReferenceCopies.spec.ts`, `src/ProseWrap.spec.ts`, `cli/HelpText.spec.ts` pass.

Done when: `git grep -n -w "Bridge" -- apps/forge ':!apps/forge/docs/research'` prints only lines that the owner
accepts as history (see Needs the owner); this prints nothing:

```bash
git grep -n -i "flint.brain\|session code\|frame-ancestor\|progress\.html\|forge open" \
  -- apps/forge/docs apps/forge/README.md apps/gaia/docs
```

and the root is green.

### WP9.1 Measure the rename and prepare the scripts

Purpose: know exactly what stage 9 changes, and have the rename and the check as scripts, before any file changes.
Changes no tracked file. Runs alone.

What to do:
1. Create the worktree `.claude/worktrees/stage-9-rename` from the commit that ends stage 8.
2. Measure with the commands below and write the numbers into the session's notes (not into the repository). Today's
   numbers, before stages 2 to 8, are given for comparison:

   | Kind | Command (from the repository root) | Today |
   | --- | --- | --- |
   | Files naming it in content | `git grep -il "oversee" \| wc -l` | 844 (forge 686, Gaia 134, packages 16, `docs/` 4, `.claude/rules/` 2, root `CLAUDE.md` and `README.md` 1 each) |
   | Occurrences of the substring | `git grep -oi "oversee" \| wc -l` | 8,934 (forge 6,851, Gaia 1,961, packages 39, `docs/` 51, `.claude/` 22, root 10) |
   | By case | `git grep -o "Overseer"`, `"overseer"`, `"OVERSEER"`, `git grep -ow "oversee"` | 4,773; 3,300; 394; 454 |
   | Paths naming it | `git ls-files \| grep -i oversee` | 269 paths: folders `apps/forge/src/services/overseer/` (179 files), `apps/forge/cli/overseer/` (44), `apps/forge/docs/figures/overseer-api/` (12); 68 file names |
   | Code (`.ts`, `.tsx`, `.js`) | `git grep -ohE '[A-Za-z0-9_$-]*([Oo]versee\|OVERSEE)[A-Za-z0-9_$-]*' -- '*.ts' '*.tsx' '*.js'` | 741 files, 6,974 tokens: bare words 3,167; compound identifiers 2,988 (213 distinct); SCREAMING_CASE 377 (56 distinct); kebab-case wire values 442 (53 distinct) |
   | JSON | `git grep -il oversee -- '*.json'` | 26 files, 273 occurrences (recordings, frozen tables, fixtures, two `package.json`) |
   | Stored keys | `git grep -ow "overseerState\|overseerFirstStartedAt\|overseerOnly"` | `overseerState` 118, `overseerFirstStartedAt` 23, `overseerOnly` 39 (and `--overseer-only` 6) |
   | Log record kinds | `git grep -o "overseer-started\|overseer-stopped\|overseer-set\|overseer-state\|overseer-stop-reason"` | 20, 14, 23, 5, 5 |
   | Data folder names | `git grep -o "overseer\.log"`; `git grep -o "<data>/overseer"` | 31 in 17 files; 14 in 9 files |
   | Command kinds | `git grep -o "overseer-pause\|overseer-resume\|overseer-stop\|overseer-restart\|pause-overseer"` | 50, 28, 44, 38, 9 |
   | Decision asker | `git grep -o "askedBy: 'overseer'"` | 17 in 14 files |
   | Registry key Gaia reads | written at `apps/forge/src/services/tracker/MonitorRegistration.ts:62`, read at `apps/gaia/src/adapters/forge-registry/utils/RegistryMapUtil.ts:34`; `git grep -n "lastCommand"` | 1 writer, 1 reader; `lastCommand` values in 35 files |
   | Login item label | `git grep -o "com\.forge\.overseer"`; `git grep -o -- "--login-overseer"` | 12 in 6 files; 22 |
   | The verb | `git grep -ow "oversee"` | 454 |
   | Gaia's names | `git grep -o "overseer-fetch"`; `git grep -o "RegisteredOverseer"` | 52 in 20 files; 10 in 5 files |
   | Installed surface | `git grep -c -i oversee -- apps/forge/resources/templates apps/forge/skills apps/forge/cli/FrozenInstalledSurface.json apps/forge/cli/adoption/FrozenClaudeInstall.json` | templates 5 files (45), skills 2 (20), frozen surface 32 lines, frozen install 12 lines |
   | Documents | `git grep -c -i oversee -- 'apps/forge/docs' 'apps/forge/README.md' 'apps/gaia/docs'` | forge Markdown 18 files (1,276), forge HTML and SVG 4 (93), Gaia 4 (31) |
   | Rules | `git grep -c -i oversee -- CLAUDE.md apps/forge/CLAUDE.md apps/gaia/CLAUDE.md .claude/rules` | 5 files, 65 |
   | Prompts | `git grep -c -i oversee -- apps/forge/resources/prompts` | 17 files, 42 |
   | Other kinds | `git grep -il oversee \| grep -vE '\.(ts\|tsx\|js\|json\|md)$'` | css 3, html 2, jsonl 6, ps1 1, sh 4, svg 3 |
   | Articles and plurals | `git grep -o "[Aa]n Overseer"`, `"[Tt]he Overseer"`, `" Overseers"`, `"TheOverseer"`, `"THE_OVERSEER"`, `"the-overseer"` | 288; 1,729; 18; 33; 22; 5 |

3. Also run `git grep -n -i "watcher"` (N7). Any Watcher name that survived stage 2 is renamed in this stage to its
   Talos form, and listed in the same retired-name change (WP9.5).
4. Write two scripts in the session's scratchpad, never in the repository:
   - `rename.ts`: takes the replacement table of Interfaces introduced, in its order; moves paths with `git mv`
     (folders first, then file names), then rewrites the content of every tracked text file outside the exclusions,
     applying the rules in order; prints each file it changed and the count per rule.
   - `check.ts`: prints every remaining line of `git grep -n -i -E "oversee"` outside the exclusions, every tracked or
     untracked path naming it (`git ls-files` and `git ls-files --others --exclude-standard`), and exits 1 when it
     prints anything.
5. Exclusions, by exact path: `docs/monorepo/**`; `apps/forge/cli/FrozenInstalledSurface.json` (its older keys are
   history; WP9.5 adds the new key); `apps/forge/src/lib/claude-code/testing/fixtures/*.jsonl` (vendor output); the one
   line of `apps/forge/src/shared/constants/ProductNames.ts` holding `com.agent-progress.overseer` (the released
   program's label); `apps/forge/src/ComponentNames.spec.ts` (WP9.5 edits it by hand); binary files.

Done when: the scripts run in dry mode in the worktree and list counts within a few percent of the measured ones;
`git status` in the worktree shows no change.

### WP9.2 Rename paths and code

Purpose: every path, identifier and wire value says Hephaestus, and the code is green. Runs alone, after WP9.1, in the
same worktree.

Files: every tracked file outside the exclusions whose path or code content names it: `apps/forge`, `apps/gaia`,
`packages/forge-contracts` (and any other package that names it), root `package.json` and `turbo.json` (none today).
New file names: `apps/forge/src/services/hephaestus/`, `apps/forge/cli/hephaestus/`, `Hephaestus*.ts` in place of
`Overseer*.ts`, `apps/forge/cli/setup/LoginHephaestus.ts`, `apps/forge/cli/testing/HephaestusTicketMoves.ts`,
`apps/forge/src/testing/RecordedHephaestusFetch.ts` and its siblings,
`apps/forge/src/testing/recordings/darwin/src__services__hephaestus__*.json`, `cli__hephaestus__routes.json`,
`packages/forge-contracts/constants/HephaestusContractVersions.ts` (export
`forge-contracts/HephaestusContractVersions`), `apps/gaia/src/lib/forge-client/HephaestusFetch*.ts`,
`apps/gaia/src/adapters/forge-api/HephaestusTokenFile.ts`,
`apps/gaia/src/testing/recordings/darwin/hephaestus-fetch-*.json`; a name follows its main export, as before.

What to do:
1. Run `rename.ts` on code only: `*.ts`, `*.tsx`, `*.js`, `*.json` (outside the exclusions), `*.css`, `*.html`, `*.sh`,
   `*.ps1`, `*.svg` inside `apps/` and `packages/`, `tsconfig*.json`, `eslint.config.js`, `package.json` exports.
2. Raise each stored format whose key or value changed (Interfaces introduced): `CURRENT_PROGRESS_FILE_VERSION`
   (`apps/forge/src/adapters/progress/constants/ProgressFileVersions.ts:5`), the pipeline format (`Pipeline.ts:6`,
   `:9`), `MONITOR_REGISTRY_FILES.SUPPORTED_VERSION` (`MonitorRegistryFiles.ts:6`) with Gaia's
   `CONTRACT_VERSIONS.forgeRegistry` (`ContractVersions.ts:14`), each to the next unused number. An older file is then
   refused with `OLDER_FORMAT_ADVICE` (`apps/forge/CLAUDE.md:101-103`); the frozen fixture
   `apps/forge/src/adapters/pipeline/FrozenVersionTwoPipeline.json` and its spec follow the owner's pipeline decision.
3. At the root: `bun run lint:fix`, then `bun run typecheck`, then `bun run lint`. Fix by hand what lint:fix leaves:
   code lines over 180 columns and comment lines over 155 (each rename adds two or three characters), and any aligned
   column the fixer does not move.
4. Fix the guards whose expectations name paths, without adding the retired names yet:
   `apps/forge/src/ComponentNames.spec.ts:75-82` expects `src/services/hephaestus/` and keeps `CLAUDE.md` containing
   `Overseer` until WP9.3 (then `Hephaestus`); the planted case at `:93` uses `src/services/hephaestus/Example.ts`;
   `src/ClientNames.spec.ts:45` the renamed reference path; `src/ImportDirection.spec.ts:51`, `:80`, `:97`, `:121`
   the layer `hephaestus-service`; `src/PlatformBoundary.spec.ts`, `src/RealSystemSpecs.spec.ts`,
   `src/TestFileConventions.spec.ts:130-146` (the planted start uses the new verb); `src/testing/BoundarySpecs.ts`;
   `cli/HatchUnderJob.spec.ts`, `cli/ControlContract.spec.ts`, `cli/CommandTable.spec.ts`, `cli/HelpText.flags.spec.ts`.
5. Retake each frozen table whose subject was renamed, by the retake procedure its spec states, never by hand:
   `apps/forge/cli/hephaestus/FrozenPosixChildSpawn.json` (its key `overseer`), `FrozenRootTrackerGitCalls.json`,
   `apps/forge/src/services/hephaestus/FrozenDarwinWorkerProfiles.json` (if it holds a data path),
   `apps/forge/cli/adoption/FrozenClaudeInstall.json` after WP9.3.
6. Recordings: rename the files with the module paths, and rename forge's own values inside them (paths, log kinds,
   refusal codes, document keys) with the script so the default suite stays green; WP9.4 records them again and the
   diff proves the script.

Specs: every changed spec passes; no spec is deleted to make the rename pass.

Done when: `bun run typecheck` and `bun run lint` pass at the root and in each workspace;
`check.ts` lists only Markdown, prose comments the script was told to leave for WP9.3, and the exclusions;
`bun run verify` at the root is green.

### WP9.3 Rename prose

Purpose: documents, rules, prompts, templates, skills and comments say Hephaestus in readable English. Runs alone,
after WP9.2, in the same worktree.

Files: `CLAUDE.md`, `apps/forge/CLAUDE.md` (component list `:46-48` reads "Hephaestus, Talos, Pass, Playbook, Hatch,
Customs, Airlock, Assistant, Baton, Regrouping, Bouncer"; `:59` the service chain ends in `hephaestus`), 
`apps/gaia/CLAUDE.md` (rule 5 at `:49`: "Gaia starts a dormant forge with `forge start --json`, never
`hephaestus --detach`"), `.claude/rules/*.md`, `apps/forge/README.md`, `apps/forge/docs/**` (with
`docs/reference/hephaestus-api.md` renamed in WP9.2), `apps/gaia/docs/**`, `apps/forge/resources/prompts/**`,
`resources/templates/**`, `skills/**`, `packages/*/README.md`, and every comment in code.

What to do:
1. Run `rename.ts` on prose with its phrase rules first (articles, plurals, "the Overseer"), then the word rules.
2. Read every changed sentence of the rules files and the installed texts; read a sample of 50 changed sentences
   across the documents. Fix grammar the rules could not see ("a Hephaestus", "Hephaestus's").
3. Rewrap every changed Markdown paragraph at 120 columns; `src/ProseWrap.spec.ts` holds the files it lists, and the
   rename lengthens lines.
4. Rename figures: `apps/forge/docs/figures/hephaestus-api/` was moved in WP9.2. Images whose pixels say "Overseer"
   are regenerated where a generator exists (`.readme-graphics/render-diagrams.py`, if WP8.2 kept it), and otherwise
   listed for the owner (Not established).

Specs: `src/ProseWrap.spec.ts`, `cli/ReferenceCopies.spec.ts`, `cli/HelpText.spec.ts` pass.

Done when: `check.ts` lists only the exclusions; the root is green.

### WP9.4 Versions, the installed surface and the recordings

Purpose: the renamed wire values are a major change, so forge and Gaia meet at 3.0, the install version rises, and
every recording is taken again from the renamed forge. Runs alone, after WP9.3, in the same worktree.

What to do:
1. Forge 3.0: `ForgeSystemVersions.ts` `current` and `minimumSupported` `{ major: 3, minor: 0 }`; in the registry,
   every endpoint whose document or body names a renamed key or kind (`summary`: key `hephaestus`; `monitor` and
   `monitor/events`: key `hephaestus`; `commands`: the four kinds; the board state and event documents of stage 6 if
   they carry the Overseer's facts) gets its next version, introduced in 3.0; the entries below 3.0 go
   (`bun run versions:raise-minimum 3.0` lists them). `forge-contracts` `version` 3.0.0. Contract integers:
   `summary`, `monitor` and `control` each rise by one.
2. Gaia: `SUPPORTED_FORGE_VERSION` `{ major: 3, minor: 0 }`; `GAIA_SYSTEM_VERSION` and the minimum to Gaia's next
   major, minor 0, since the fleet document's `overseerStartedAt` (`apps/gaia/page/@types/FleetDocument.ts:176`) became
   `hephaestusStartedAt`; `fleet` and `events` endpoint versions and `gaiaFleetDocument` rise by one; Gaia's
   `docs/contracts.md` follows.
3. Install: raise `INSTALL_VERSION` (`apps/forge/cli/constants/InstallVersion.ts:1`) by one; add its key to
   `FrozenInstalledSurface.json` with the new verb and flags, never changing an older key; retake
   `FrozenClaudeInstall.json`; `bun run record src/services/hephaestus/InstallChangeWatch.ts`.
4. Record forge again: `bun run record <boundary>` in `apps/forge` for each boundary whose recording file was renamed
   (`src/services/overseer/OverseerServer.ts` is now `src/services/hephaestus/HephaestusServer.ts`,
   `cli/hephaestus/routes/`, `GpgDirectories.ts`, `InstallChangeWatch.ts`). `git diff` of each recording against the
   script's version must show only drawn values and the new versions; any other difference is a value the script
   missed or changed wrongly: fix the code, not the recording.
5. Record Gaia again, as in WP8.11, under the new recording names (`hephaestus-fetch-supported-forge`,
   `hephaestus-fetch-versions`, `hephaestus-fetch-other-programs`) and `forge-registry`, `forge-program*`.

Specs: the registry specs of both systems; `CommandRoute.controlContract.spec.ts` pins the renamed kinds and
`controlVersion` 3; `apps/gaia/src/adapters/forge-registry/RegistryFile.spec.ts` reads the registry at its new version
with the key `hephaestus` and refuses version 1 as older.

Done when: in `apps/gaia`, `bun run check` prints "Gaia supports forge's current version, 3.0." and lists no stale
stamp; in `apps/forge`, `bun run check` lists no stale stamp; the root is green.

### WP9.5 Forbid the old names, check, commit

Purpose: the guards keep the old names out, the check proves none is left, and the stage lands as one commit. Runs
alone, after WP9.4.

What to do:
1. `apps/forge/src/ComponentNames.spec.ts`: add `'Oversee'`, `'oversee'` and `'OVERSEE'` to `RETIRED_NAMES` (`:27-60`);
   each substring also covers `Overseer`, `overseer` and `OVERSEER`. Add `'watcher-lost'`, which the rename turned into
   `talos-lost` (N7), and change the planted case that holds `watcher-lost` as allowed (`ComponentNames.spec.ts:97`) to
   plant it as caught. `ALLOWED_RETIRED_NAMES` (`:62`) gets exactly these entries, each a file the guard scans:
   `cli/FrozenInstalledSurface.json: oversee`, `src/shared/constants/ProductNames.ts: oversee`, and one entry per vendor
   fixture `src/lib/claude-code/testing/fixtures/<name>.jsonl: oversee` that names it. The scan proof (`:75-82`) expects
   `CLAUDE.md` to contain `Hephaestus`. Planted cases (`:89-94`): a path `src/services/overseer/Example.ts`, an
   identifier `OverseerServer`, a wire value `'overseer-stop'`, a constant `OVERSEER_PORT_FIRST` and a verb
   `['oversee', 'stop']` are each caught; the same text with `hephaestus` passes.
2. The guard scans forge and the packages it declares, not Gaia and not the root. `check.ts` covers them; run it.
3. Run the whole-stage verification below.
4. Commit once: one plain subject line such as "Rename the Overseer to Hephaestus", no body unless the owner wants the
   measurements in it, no AI attribution.

Done when: `check.ts` exits 0; `bun install --frozen-lockfile` and `bun run verify` at the root exit 0; `git log -1
--stat` shows one commit holding every renamed path.

## Interfaces introduced

### Stage 8: what Hephaestus's API serves

Unversioned, open: `GET /api/versions` (never removed). Open: `GET /api/identity`, `GET /api/summary`,
`POST /api/nudge`. Behind `Authorization: Bearer <token>`: `GET /api/state` (served at `/api/v1/state` from stage 4),
`GET /api/presence` (stage 3), `GET /api/events`, `GET /api/monitor`, `GET /api/monitor/events`,
`GET /api/jobs/<J>/stream`, `GET /api/jobs/<J>/files/<name>`, `GET /api/profiles/<P>/stream`, `POST /api/pictures`,
`GET /api/pictures/<id>`, `POST /api/commands`. Each endpoint the registry serves also answers at
`/api/v<n>/<endpoint>`. The Host and Origin guards and the refusal of `OPTIONS` stay (`OverseerServer.ts:641-646`).

Removed: `POST /api/session-codes`, `POST /api/session`, `GET /api/session-token`, `POST /api/flint-brain/ask`,
`GET /` and every path outside `/api/`.

`API_CONTENT_SECURITY_POLICY`, a constant in `OverseerServer.ts`, on every answer that sets no policy of its own:
`default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. Pictures and job files keep
`sandbox`.

`ServerRefusal` (`OverseerServer.ts:55`): `'unauthorized' | 'forbidden' | 'read-failed' | 'malformed-body'`.

### Stage 8: the Assistant's switch

- `pipeline.json` key `assistant`: `true` when the board turned the Assistant on; absent when off. Never `false`. A
  pipeline holding it is written in `PIPELINE_FORMAT_VERSION`. Out of the gating hash, in the apply-conflict hash.
- `Pipeline.assistant?: true` (`Pipeline.ts`).
- Control command `{ kind: 'pipeline-assistant-set'; on: boolean }`. Applied in a hold on a readable pipeline; refused
  as `pipeline-approval-set` is on an unreadable one; under a job, refused for every role. `on: false` while an
  Assistant job is live also stops that job, mode `stop`.
- CLI verb `forge gate assistant on|off [--json]`: the same answer `gate approval` prints, with the switch's state.
  `gate list` prints `Assistant: on` or `Assistant: off`.
- Log record `pipeline-assistant-set`: `{ subject: 'board', fields: { state: 'text' } }`, `state` `'on'` or `'off'`.
- `Board.setAssistant(on: boolean, at: string): Logged` and `Board.assistantIsOn(): boolean`.
- `PlaybookFacts.assistantIsOn: boolean`.
- `IncidentDefaultCause`: `'turn-closed' | 'turn-budget' | 'no-assistant' | 'assistant-off'`. While the switch is off,
  every open incident takes its default in the pass, cause `assistant-off`, before any other cause is considered; no
  `boot-assistant` step is emitted.

### Stage 8: versions and contracts

- `FORGE_SYSTEM_VERSIONS`: `{ current: { major: 2, minor: 0 }, minimumSupported: { major: 2, minor: 0 } }`.
- `FORGE_COMPATIBILITY_REGISTRY`, all `source: 'shipped'`, `lastNeededBy: null`, no `compatibility-path` entry:
  `identity` and `summary` at their versions (v1 today, introduced 1.0); `monitor`, `monitor/events` and `commands`
  each at its next version (today v2, v2 and v1, so v3, v3 and v2), introduced in 2.0; each endpoint stages 3, 4 and 6
  added, at its version, raised by one and introduced in 2.0 where this stage changed its document (the board document
  lost `flintBrain`, `bodyHtml` and `descriptionHtml`). No `session-codes`.
- `OVERSEER_CONTRACT_VERSIONS`: `identity` and `summary` as before, `monitor` and `control` one higher, no `embed`;
  `ServedContractName`: `'summary' | 'monitor' | 'control'` and whatever stages 3 and 6 added.
- `forge-contracts` 2.0.0 exports: `IdentityDocument`, `BoardSummaryDocument`, `MonitorSnapshotDocument`,
  `ForgeControlCommand`, `OverseerContractVersions`, `ForgeSystemVersions`, `ForgeCompatibilityRegistry`, and the
  board documents and `BoardCommand` of stage 4, `ForgeControlCommandKinds` and `BoardStreamHandshake` of stage 6, and
  `ForgePresenceDocument` of stage 3. Gone: `EmbedChannelMessage`, `EmbedMode`, `FrameAncestorRecord`.
- `MonitorSnapshotDocument`: no `flintBrain`, no activity kind `flint-brain`. `ForgeControlCommand`: no
  `flint-brain-start`, `flint-brain-stop`.
- Board document ticket entry: `bodyMarkdown: string` in place of `bodyHtml`; epic description entry:
  `descriptionMarkdown: string` in place of `descriptionHtml`.
- Gaia: `SUPPORTED_FORGE_VERSION` 2.0; `GAIA_SYSTEM_VERSION` at its next major and the minimum equal to it;
  `GAIA_ENDPOINT_VERSIONS` with `fleet`, `events` and `commands` one higher, `health`, `sessionCodes` and `session`
  unchanged; `CONTRACT_VERSIONS` with `gaiaFleetDocument` and `gaiaCommand` one higher. `frameSession`,
  `forgeEmbedChannel`, `forgeFrameAncestorRecord` and `gaiaFrameSession` left in stage 6 (WP6.23).
- `INSTALL_VERSION` one higher than at the start of stage 8 (29 today), with its key added to
  `FrozenInstalledSurface.json`.
- The board's data folder has no `progress.html`; `forge open` is unknown.

### Stage 9: the replacement table

Applied in this order by `rename.ts`. Phrase rules apply to all text; the word rules then apply everywhere outside
the exclusions of WP9.1.

| # | Kind | Today | After |
| --- | --- | --- | --- |
| 1 | Prose article | `an Overseer`, `An Overseer` | `a Hephaestus`, `A Hephaestus` |
| 2 | Prose definite | `the Overseer`, `The Overseer` | `Hephaestus` |
| 3 | Prose plural | ` Overseers` | ` Hephaestus processes` |
| 4 | Identifier with article | `TheOverseer`, `THE_OVERSEER`, `the-overseer` | `Hephaestus`, `HEPHAESTUS`, `hephaestus` |
| 5 | Plural identifier | `Overseers`, `overseers` (inside identifiers) | `HephaestusProcesses`, `hephaestusProcesses` |
| 6 | PascalCase | `Overseer` | `Hephaestus` |
| 7 | camelCase, kebab-case, paths | `overseer` | `hephaestus` |
| 8 | SCREAMING_CASE | `OVERSEER` | `HEPHAESTUS` |
| 9 | The verb | `oversee`, `Oversee`, `OVERSEE` | `hephaestus`, `Hephaestus`, `HEPHAESTUS` |

What the rules produce for the named stored and installed names:

| Kind | Today | After |
| --- | --- | --- |
| Folders | `apps/forge/src/services/overseer/`, `apps/forge/cli/overseer/`, `apps/forge/docs/figures/overseer-api/` | `.../hephaestus/`, `.../hephaestus/`, `.../hephaestus-api/` |
| Reference document | `apps/forge/docs/reference/overseer-api.md` | `apps/forge/docs/reference/hephaestus-api.md` |
| Data folder | `<data>/overseer/`, `<data>/overseer.log` | `<data>/hephaestus/`, `<data>/hephaestus.log` |
| `progress.json` | `overseerState`, `overseerFirstStartedAt`; `version` 2 | `hephaestusState`, `hephaestusFirstStartedAt`; `version` 3 |
| `pipeline.json` | gate key `overseerOnly`; flag `--overseer-only` | `hephaestusOnly`; `--hephaestus-only`; next format version |
| Log records | `overseer-started`, `overseer-stopped`, `overseer-set`; field vocabularies `overseer-state`, `overseer-stop-reason` | `hephaestus-started`, `hephaestus-stopped`, `hephaestus-set`; `hephaestus-state`, `hephaestus-stop-reason` |
| Interruption cause kept by stage 2 for this stage | `watcher-lost` | `talos-lost` |
| Command kinds | `overseer-pause`, `overseer-resume`, `overseer-stop`, `overseer-restart` | `hephaestus-pause`, `hephaestus-resume`, `hephaestus-stop`, `hephaestus-restart` |
| Playbook step, decision asker | `pause-overseer`; `askedBy: 'overseer'` | `pause-hephaestus`; `askedBy: 'hephaestus'` |
| Refusal codes | `overseer-down`, `overseer-not-answering`, `overseer-already-running`, `overseer-contended`, `overseer-port-in-use`, `overseer-still-live`, `overseer-identity-unreadable`, `overseer-did-not-start`, `overseer-control-is-runtime-only`, `overseer-owns-the-lifecycle`, `malformed-overseer-poll-interval`, and the rest `git grep -o "'[a-z-]*overseer[a-z-]*'"` lists | the same with `hephaestus` |
| Registry entry | key `overseer`, `lastCommand: 'oversee'`; registry version 1 | key `hephaestus`, `lastCommand: 'hephaestus'`; version 2 |
| Login item | `com.forge.overseer`, per board `com.forge.overseer.<trackerId>`; setup flag `--login-overseer` | `com.forge.hephaestus`, `com.forge.hephaestus.<trackerId>`; `--login-hephaestus`; `com.agent-progress.overseer` unchanged |
| The verb | `forge oversee [--port <n>] [--detach] [--repository <path>] [--json]`, `oversee stop`, `oversee restart`, `oversee pause`, `oversee resume`, `oversee status`, `oversee crash [<generation>]` and `oversee --started-by user\|login-item` (stage 3), `oversee --successor-of <generation>` | `forge hephaestus …` with the same subcommands and flags; the login item's line becomes `hephaestus --detach --started-by login-item`; the top-level `resume` of stage 3 keeps its name |
| Environment | `FORGE_OVERSEER_POLL_INTERVAL_MILLISECONDS` | `FORGE_HEPHAESTUS_POLL_INTERVAL_MILLISECONDS` |
| Product names | `OVERSEER_PORT_FIRST` (4730, 4930) | `HEPHAESTUS_PORT_FIRST` (values unchanged) |
| Documents | summary `overseer`, monitor `overseer`; `SummaryOverseerState`, `SummaryOverseerDocument`, `MonitorOverseerState`, `MonitorOverseerDocument` | `hephaestus`; `SummaryHephaestusState`, `SummaryHephaestusDocument`, `MonitorHephaestusState`, `MonitorHephaestusDocument` |
| Contract package | `forge-contracts/OverseerContractVersions`, `OVERSEER_CONTRACT_VERSIONS` | `forge-contracts/HephaestusContractVersions`, `HEPHAESTUS_CONTRACT_VERSIONS` |
| Gaia | `OverseerFetch`, `overseer-fetch-*`, `RegisteredOverseer`, `OverseerTokenFile`, fleet `overseerStartedAt` | `HephaestusFetch`, `hephaestus-fetch-*`, `RegisteredHephaestus`, `HephaestusTokenFile`, `hephaestusStartedAt` |
| Forge recordings | `src__services__overseer__*.json`, `cli__overseer__routes.json` | `src__services__hephaestus__*.json`, `cli__hephaestus__routes.json` |

### Stage 9: versions

`FORGE_SYSTEM_VERSIONS` 3.0, minimum 3.0; `forge-contracts` 3.0.0; `summary`, `monitor` and `control` contract
integers each one higher than after stage 8; `SUPPORTED_FORGE_VERSION` 3.0; `GAIA_SYSTEM_VERSION` at its next major
and the minimum equal to it; `INSTALL_VERSION` one higher than after stage 8; `progress.json`, the pipeline format and
the registry file each at their next unused version (today 2, 3 and 1, so 3, 4 and 2 unless an earlier stage raised
them).

## Traps

- **The ClientNames scan proof breaks when the Bridge goes.** `SMALLEST_SHIPPED_FILE_COUNT` is 1,000
  (`apps/forge/src/ClientNames.spec.ts:26`); forge ships 1,120 such files today, 312 of them in `bridge/`. Lower the
  bound in WP8.2 to one the new count passes with margin, not to zero.
- **Packages lose their guards with the Bridge.** `ImportDirection.spec.ts` and `ComponentNames.spec.ts` scan
  `design-system` and `flint` because forge declares them (`apps/forge/src/testing/RepositorySources.ts:206-214`).
  Once forge stops declaring them, their isolation is held only by each package's own `PackageIsolation.spec.ts` and by
  Gaia. Check those specs still hold what forge's guard held about them; report a gap, do not move forge's guard.
- **A Gaia ingestion that requires a key fails when forge drops it.** Gaia's monitor shape names `flintBrain` as a
  required nullable key (`MonitorSnapshotIngestion.ts:157`). Gaia stops requiring it (WP8.5) before forge stops sending
  it (WP8.7); the reverse order turns every forge read into a malformed document.
- **The command route's contract spec pins the package's kinds.** `CommandRoute.controlContract.spec.ts` checks every
  kind of `ForgeControlCommand`. Remove the brain's kinds from the package and from the route in the same package
  (WP8.7), never one alone.
- **Removing a registry entry is not the version change.** The registry guard accepts an entry removed while its
  `lastNeededBy` is `null`, so the specs stay green between WP8.6 and WP8.10 although the versions understate the
  change. Push stage 8 only as a whole: the installed forge is a clone updated by pulling, and a pull in between would
  run a 1.1 that serves no session codes.
- **Raising the minimum makes the guard demand removals.** With `minimumSupported` 2.0, the three
  `compatibility-path` entries (`ForgeCompatibilityRegistry.ts:46-48`) are below it and the guard fails until they are
  removed "and what it keeps" (`CompatibilityRegistryUtil.ts:55-57`). The unversioned routes are also how forge's own
  CLI reaches its Overseer (`apps/forge/cli/overseer/OverseerRemote.ts:48`, `:57`, `:81`, `:203`;
  the nudge of `apps/forge/cli/ApplyCommandOfVerb.ts`, which replaced `cli/OpenTrackerForWriting.ts:45` in stage 5),
  and the integer version keys are what Gaia's reading rule checks
  (`apps/gaia/CLAUDE.md:43-45`). Remove the entries, keep both, and say in `overseer-api.md` why they stay: they are the
  current contract, not compatibility (Needs the owner).
- **`bun.lock` changes with every manifest and package version change.** After removing dependencies or raising
  `forge-contracts`'s version, run `bun install` once at the root, then `bun install --frozen-lockfile`. A frozen
  install that fails is a lock out of date, never a reason to edit a `package.json` back.
- **The Assistant off by default changes many specs' premises.** 55 spec files name the Assistant or its boot today
  (`git grep -l "boot-assistant\|'assistant'" -- '*.spec.ts'`). Set `assistantIsOn: true` in the lifecycle fixtures
  (`LifecycleFixtures.ts:79`) so those specs keep testing the Assistant; the new behaviour gets its own cases.
  `CrashMatrix.integration.spec.ts:812` expects `no-assistant`: its board must turn the Assistant on, or the cause
  becomes `assistant-off`.
- **The switch off must not leave incidents open.** `noAssistantCanComeUp` (`Playbook.ts:535`) is not the place: it
  also holds `assistantMayBoot` and the retry. Add the off check first in `incidentDefaultStepsOf`, so an incident
  delivered to a turn of a live Assistant also defaults once the switch is off.
- **A Bun build that ran on the first request hid failures.** Today a page build failure was retried per request
  (`OverseerServer.ts:510-519`). Nothing replaces it; do not leave `page-build-failed` in a union no route returns.
- **The brain's log record stays readable but nothing writes it.** `EveryBoardLogRecord.ts:1-3` promises every kind
  "as the Board's own changes log them". After WP8.7, build the `flint-brain-ended` record from a literal there with a
  one-line why; do not keep a dead Board method to satisfy the helper.
- **The fake agent's tool-less branch.** `FakeAgentAdapter.ts:125` plays the brain's turns for any session with no
  tool. Check that no other session runs tool-less before deleting it; otherwise such a session would play the
  ordinary scenario.
- **Gaia's own session is not the forge's.** Gaia keeps its page session (`page/shell/SessionCodeExchange.ts`,
  `src/lib/local-http-guards/SessionCodes.ts`, `src/features/page-server/routes/SessionRoutes.ts`) and its
  `sessionCodes` and `session` routes. Delete only what reaches a forge's session codes.
- **Gaia's frame-ancestor record looks like Gaia's server record.** `ServerRecordWriter.ts` writes Gaia's URL, process
  and start beside the origin (`:19-33`), but no Gaia code reads it (`git grep -n "serverRecordPathIn"` names only
  the writer). Delete it; do not move it to `~/.gaia` without a reader.
- **Recordings never run against the real home.** Gaia's and forge's recordings start a scratch forge under a scratch
  home (`apps/gaia/src/testing/ScratchForge.ts:1-4`). Never point `GAIA_RECORDING_FORGE_PROGRAM` at the installed
  forge in `~/.forge-program`, and never run a forge verb in this checkout outside those scripts.
- **The rename lengthens lines.** "Hephaestus" is two characters longer than "Overseer" and three longer than
  "oversee". Lint's 180 and 155 limits and `ProseWrap.spec.ts`'s 120 columns fail on lines that were near the limit;
  aligned `from` columns and object values move. Run `lint:fix`, then fix the rest by hand.
- **Plain substitution breaks English and identifiers.** "an Overseer" (288 today) becomes "an Hephaestus" and "the
  Overseer" (1,729) becomes "the Hephaestus" unless the phrase rules run first; `stopTheOverseer` becomes
  `stopTheHephaestus`. Keep the rule order of the replacement table.
- **Historical frozen data must keep the old names.** `FrozenInstalledSurface.json` keeps every older install
  version's names ("never delete a name from a version already frozen", `cli/InstalledSurface.spec.ts:7-8`); the vendor
  fixtures record what Claude Code printed for a probe folder named `overseer-claude-probe-repo`; the released
  program's label `com.agent-progress.overseer` names another program's item. The script excludes them, the guard
  allowlists them by exact file.
- **The retired-name guard is per file and substring.** An allowlist entry `<file>: oversee` hides any other mention in
  that file. Keep the allowlisted files few, and rely on `check.ts`, which reports lines, for the final proof.
- **The guard does not scan Gaia or the root.** `ComponentNames.spec.ts` scans forge and its declared packages only
  (`RepositorySources.ts:206-214`). The 134 Gaia files and the root's rules are proven only by `check.ts`.
- **Recording file names follow module paths.** Renaming `src/services/overseer/OverseerServer.ts` renames its boundary
  in `BoundarySpecs.ts` and its recording file; a recording left under the old name reads as a boundary with no
  recording, and verify lists it as not finished.
- **Every refusal code Gaia words changes.** Gaia picks its sentence by a forge refusal code
  (`apps/gaia/src/adapters/page-api/ForgeSentenceUtil.ts`). The script renames both sides; check that each renamed code
  still has its Gaia sentence (`ForgeSentenceUtil.recordedSentences.spec.ts`).
- **Running forges and login items on the owner's machine outlive the rename.** A Baton under `<data>/overseer/`, a
  LaunchAgent labelled `com.forge.overseer.<trackerId>` that runs `oversee --detach`, and a registry at version 1 are
  all left behind by stage 9. The owner stops every forge and removes its login items with the old program before
  pulling stage 9 into the installed clone, then sets the boards up anew (Needs the owner).
- **The rename touches the stored versions that other stages may have raised.** Stage 3 and stage 5 may already have
  raised `progress.json` or the pipeline format. Raise each to the next unused number at the time of stage 9; never
  reuse a number a commit of this refactoring already wrote.

## Verification of the whole stage

At the root, after each stage:

```bash
bun install --frozen-lockfile
bun run verify
```

Both exit 0. `bun run verify` runs every workspace's `typecheck`, `lint`, `test`, `test:dom` and `check`; forge has no
`test:dom` after WP8.2.

The specs that matter most, each in its workspace folder:

- `apps/forge`: `bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/OverseerServer.spec.ts
  ./cli/overseer/routes/CommandRoute.controlContract.spec.ts ./src/services/control/SettingControls.spec.ts
  ./src/ImportDirection.spec.ts ./src/ClientNames.spec.ts ./src/ComponentNames.spec.ts ./cli/InstalledSurface.spec.ts
  ./cli/RetiredVerbs.spec.ts` (paths of stage 9 under `hephaestus/`).
- `packages/tracker-model`: `bun test ./Playbook.spec.ts`.
- `packages/forge-contracts`: `bun test` (the registry and the contract integers).
- `apps/gaia`: `bun test src/features/page-server/PageServer.spec.ts
  src/adapters/forge-api/MonitorSnapshotIngestion.spec.ts src/shared/constants/ContractVersions.reference.spec.ts
  src/testing/RecordedAnswers.spec.ts`, then `bun run check`.

The end-to-end check on a scratch forge, which Gaia's rules name (`apps/gaia/CLAUDE.md:18-20`, `:139-150`):

1. In `apps/gaia`: `GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record
   overseer-fetch-supported-forge` (stage 9: `hephaestus-fetch-supported-forge`). It runs this checkout's forge in
   scratch repositories under a scratch home with the fake agent: init, start, every situation, Baton pass, stop.
2. Read the recording: `/api/versions` answers the stage's version and minimum; identity names no `embed`; no session
   route is called; the monitor has no `flintBrain`; a command answers with the stage's `controlVersion`; after stage
   9 every key and kind says `hephaestus`.
3. In `apps/forge`: `bun run record cli/overseer/routes/` (stage 9: `cli/hephaestus/routes/`), which runs
   `cli/overseer/OverseerApi.integration.spec.ts` against a real Overseer on a scratch board: the removed routes answer
   404, the reads answer 401 without the token.
4. Stage 8 only: on the scratch board of a spec or the recording, an incident opened with the switch off is defaulted
   in the next pass with cause `assistant-off`, and no `assistant` job is launched
   (`Playbook.spec.ts` and the crash matrix's board cover it without a real session).

Stage 9 only, at the root: `bun <scratchpad>/check.ts`, the script WP9.1 wrote in the session's scratchpad outside the
repository, exits 0, and
`git grep -n -i "oversee" -- . ':!docs/monorepo'` prints only the allowlisted files.

## Out of scope

- What forge does after an agent ended on a network outage, and whether an install line gets a time bound (design
  section 12): neither stage touches them; stage 9 renames whatever names their code carries.
- New Gaia controls: the Assistant's switch in a Gaia view, a Gaia view of `gate list`. Stage 8 adds the command and
  the verb only.
- Rewriting the Assistant or deciding what it owns (decision 24: later, from accumulated data).
- Flint the sprite: it is interface and moved with the views in stage 6; only the brain leaves here.
- Moving `design-system`, `flint` or `brand` into another folder or package; only their declared consumer changes.
- Removing the integer version keys from the documents, the unversioned routes of forge's own CLI, or Gaia's own page
  session.
- Changing the store port, the Talos protocol, presence, recovery or the board documents' shapes beyond the removals
  named here.
- A guard against retired names inside Gaia (propose it as a follow-up).
- Renaming the product (`forge`, `.forge`, `.forge-monitor`, `FORGE_`) or Talos, or reserving Zeus.
- Converting existing boards; they are set up anew by the owner.

## Needs the owner

1. **`forge open` and `progress.html`.** They lose their target and may not name Gaia. Recommended: delete both; the
   CLI's `start --json` already gives the API's URL to a program that asks.
2. **The Assistant's switch: where and how.** Recommended: `pipeline.json` key `assistant: true`, command
   `pipeline-assistant-set`, verb `gate assistant on|off`, mirroring the approvals. Alternative: a `progress.json` key
   set by its own verb.
3. **A live Assistant when the switch goes off.** Recommended: stop it in the same hold (`job-stop`, mode `stop`).
   Alternative: let it finish its turn and boot no new one.
4. **The cause name.** Recommended: a new cause `assistant-off`, so the log says why. Alternative: reuse `no-assistant`.
5. **Flint's brain's log records.** The design keeps them readable (section 3.5). Recommended: keep the reader and
   delete the writer, as planned. Alternative, since boards are set up anew: delete the kind and its reader too.
6. **The vendor records of a brain turn.** Recommended: keep the stream fixture, the probe and the `flint-brain-turn`
   scenario of the fake-agent recording; they record the vendor, and removing them needs a recording with a real
   model call. Alternative: remove them and record `src/testing/fake-agent` again with a real call.
7. **Raising forge's and Gaia's minimum to 2.0.** Recommended: raise both, delete the `compatibility-path` entries,
   keep the unversioned routes and the integer keys as the current contract and document why. Alternative: keep the
   minimum at 1.0 and keep `session-codes` answering 404 behind an entry, which promises what is not served.
8. **Endpoint versions at 2.0 and 3.0.** Recommended: raise the version of each endpoint whose document changed, so a
   path in a recording or a log says which shape it carried. Alternative: keep every endpoint at its number, since no
   older client is supported.
9. **The word "Bridge" after stage 8.** Recommended: forge's wording names a neutral action, the Bridge leaves the
   component list in `apps/forge/CLAUDE.md:46-48`, and `Bridge` joins `RETIRED_NAMES` with `docs/research/` left
   unscanned (WP8.12 step 5, which first renames `board-readings`' `BridgeFragmentUtil`). Alternative: keep the word in
   history documents and add no guard.
10. **`.readme-graphics/` and the Bridge screenshots.** Recommended: delete both; forge has nothing to shoot, and Gaia
    gets its own if wanted. Alternative: keep the scripts for diagrams only (`render-diagrams.py`).
11. **Which tracker reaches `design-system`, `flint` and `brand`.** Recommended: they leave forge's reach and join
    Gaia's in the root `CLAUDE.md`, since only Gaia imports them after stage 8.
12. **The verb's new name.** Recommended: `hephaestus` (`forge hephaestus --detach`, `forge hephaestus stop`): it
    names what it runs and greps alone. Alternative: `run`.
13. **The login item's label.** Recommended: `com.forge.hephaestus`; the released program's
    `com.agent-progress.overseer` stays, as a fact about another program.
14. **Stored format versions at stage 9.** Recommended: raise `progress.json`, the pipeline format and the registry, so
    an old board or registry is refused rather than misread. For the pipeline, recommended: one format, the new number,
    read and written alone, and the Deviations row on versions 2 and 3 deleted. Alternative: rename keys without a
    version change.
15. **A major version for forge (3.0) and for Gaia in stage 9.** Recommended: yes; the command kinds and document
    keys Gaia uses change, and a forge of stage 8 may already run from the installed clone.
16. **Historical documents.** Recommended: leave `docs/monorepo/` unchanged, as the record of this change, and rename
    everything under `apps/` and `packages/`, `docs/research/` included.
17. **Where Markdown is rendered after stage 8.** Design section 3.1 moves the rendering out of Hephaestus. Recommended:
    Gaia's page renders `bodyMarkdown` and `descriptionMarkdown` with `marked`, the library forge drops, at the same
    version, so a body reads as it did. Alternative: Gaia's server renders and hands the page HTML, which keeps the
    page free of a Markdown library but adds a mapped document field Gaia owns.
18. **Steps on the owner's machine around stage 9.** Recommended order: stop every forge, remove every login item with
    the old program (`forge login-item` before pulling), pull stage 9 into the installed clone, run `setup`, set each
    board up anew with `init` (only the owner runs `init`, `update` or `clear`), add the login items again.
19. **Rule files a person changes.** WP8.2 deletes `.claude/rules/bridge.md` and changes `.claude/rules/flint.md`,
    `.claude/rules/design-system.md` and the root `CLAUDE.md`; WP9.3 renames the Overseer in every `.claude/rules/*.md`
    and the root `CLAUDE.md`. These files are the owner's (`apps/forge/CLAUDE.md:281-284`, root `CLAUDE.md`).
    Recommended default, as for stage 6: the orchestrated session writes the change in the same commit and the owner
    approves it before it lands.

## Not established

- The state of the code after stages 2 to 7: the plans in this folder say which paths move (stage 4's packages, stage
  5's store port), that stage 2 runs Flint's brain as an agent child of Talos and keeps only `watcher-lost` of the
  Watcher's names, that stage 6 deletes none of `apps/forge/bridge/` and matches a templated endpoint such as
  `jobs/{jobId}/stream` through `endpointEntryForPath` (stage 6, WP6.1). None of it is built, so each is confirmed in
  the code before WP8.1.
- Whether `bun run lint:fix` moves the aligned `from` columns and object values; the shared lint configuration claims
  the rules (`~/coding-conventions-new.md` section 12), but whether they fix themselves was not run.
- Whether a forge from before system versions can be built from a scratch clone at the parent of `6f521908` in this
  repository's layout, which the `overseer-fetch-versions` recording needs; `apps/gaia/src/testing/` names the
  setting, but the recipe of the clone was not found.
- Which PNG figures (`apps/forge/docs/figures/overseer-api/*.png`, `docs/figures/runbook/overseer-down.png`,
  `apps/forge/docs/images/*.png`) show the word in their pixels; `git grep` does not read images.
- Whether an old board's `log.jsonl`, with renamed record kinds, is read before the `progress.json` version check on
  `status`, so the refusal names the progress file and not a malformed log.
- Whether `apps/forge/src/ProjectIncludeLists.spec.ts` and `src/SpecsOpenNoPage.spec.ts` hold anything besides the
  Bridge and the opener; both were seen named, not read in full.
- Whether a Gaia view of stage 6 shows agent-written HTML in a sandboxed frame, which the page's `frame-src 'none'`
  would block for a URL source (a `srcdoc` frame inherits the policy and was not checked).
- Whether the opener adapters under `apps/forge/cli/` have a consumer besides `open`; only `OpenerFor.ts` and
  `OpenInTheDefaultBrowser.ts` were found by name.
- The exact JSON answer of `gate approval --json`, which the new verb copies; it was not read.
