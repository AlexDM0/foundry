# Stages 8 and 9: Shrink the HTTP surface, fold the libraries into Gaia, then rename

## Goal

After stage 8, the Overseer's HTTP server serves only what Gaia's server needs: the open reads (versions, identity,
summary), the board document, presence, the event, monitor, job and gate-profile streams, job files, pictures and their
upload, the nudge and the command endpoint, every one but the open three behind the bearer token. The Bridge program,
browser sessions, session codes, the embed machinery on both sides, Flint's brain, `forge open`, the `progress.html`
stub and the HTML rendering of Markdown are gone from forge; forge serves Markdown and Gaia's server renders it. The
Assistant is a switch per board, off by default. `pipeline.json` has one format. `design-system`, `flint` and `brand`
are libraries of Gaia's page under `apps/gaia/page/lib/`, each behind its interface file and held by an architecture test, and
`packages/` holds only `forge-contracts` and `system-versions`.

After stage 9, in one commit, the component is Hephaestus. The `oversee` verb is gone: `forge start` starts
Hephaestus, and `stop`, `restart`, `status`, `pause`, `unpause` and `crash-log` sit beside it at the top level; no
verb or flag a user types names Hephaestus. No tracked file outside the named records says Overseer, `overseer` or
`oversee`: code, paths, stored and installed names, wire values, documents, rules, prompts and skills say Hephaestus.
Forge and Gaia meet at the next major system version with recordings taken again, and the architecture tests forbid the old names.

## Depends on

Stages that must be finished before stage 8: 0 to 7, all but stage 6's WP6.27, which offers the Assistant's switch in
Gaia and runs right after WP8.9 has built it in forge. What stage 8 relies on from them is the table below: stage 3's
lifecycle verbs and crash log, stage 4's standing contract and served facts, stage 5's store port, stage 6's views in
Gaia with no frame, stage 7's conversations through Gaia. Stage 9 starts only once every work package of stage 8 is
committed and the owner has done the first half of gate G6. Stage 9 is the last stage; it hands nothing on.

This file cites today's code at `b4174bd9`. Stages 2 to 7 move and change some of it. Before WP8.1, open the code as it
is then and find each item by its export name (`git grep -n "<export name>"`), not only by its path: stage 5 puts the
store behind a port, and stage 6 moves the Bridge's views into Gaia. The tracker model stays at
`apps/forge/src/lib/tracker-model/` and the readings at `apps/forge/src/shared/monitor/` (decision 49). Where an item
that this stage needs is missing, stop and report it; do not build it here.

| Need | What must be true at the start of stage 8 | Check | Used by |
| --- | --- | --- | --- |
| N1. Every view in Gaia | Stage 6 moved every Bridge view into Gaia, and no Gaia screen needs a forge's Bridge to show a board | `git grep -n -i "bridge" -- apps/gaia/page apps/gaia/src ':!*.spec.*'` names no frame, no embed channel and no frame session (stage 6, WP6.23) | WP8.1, WP8.2, WP8.3 |
| N2. The maximized forge is a Gaia route | Decision 27: one forge at full size is a route of Gaia, in the window or a tab of its own, never an iframe | The route stage 6 added (`#forge/<trackerId>/<tab>`, `apps/gaia/page/views/forge/`, WP6.9) exists; `apps/gaia/page/views/forge-frame/` does not | WP8.3 |
| N3. Where Gaia shows forge's HTML | Gaia's server maps the board document's `bodyHtml` and `descriptionHtml` and the pipeline setup's `constitutionHtml` (the board's and each entity's) into its own model and its page contract (decision 51); the page reads no forge field | `git grep -n "bodyHtml\|descriptionHtml\|constitutionHtml" -- apps/gaia/src packages` lists the readers WP8.8 changes; `git grep -n "from 'forge-contracts" -- apps/gaia/page` prints nothing | WP8.8 |
| N4. The board documents are contracts | The board, ticket and job documents and the board's command kinds are types of `packages/forge-contracts` that import nothing from forge's model (stage 4, decision 50), each endpoint in `FORGE_COMPATIBILITY_REGISTRY` (`board` from stage 4, the streams and pictures from stage 6, `presence` from stage 3); forge maps its model into them in its own adapters | `git grep -n "apps/forge\|tracker-model" -- packages/forge-contracts ':!*.md'` prints nothing; `git grep -n "currentEndpointOf\|endpointAddedIn\|kind: *'endpoint'" -- packages/forge-contracts` | WP8.6, WP8.8, WP8.9, WP8.10 |
| N5. Conversations go through Gaia | Stage 7: intake and pipeline setup are reached through `job-message`, the job stream and the picture upload, from Gaia | Gaia's conversation view posts `job-message` through its server | WP8.6 |
| N6. Flint's brain still runs | Flint's brain runs as an agent child of Talos in the child folder `flint-brain/` (stage 2, WP2.13 item 11), or on whatever host stage 2 left it | `git grep -ln "FlintBrain" -- apps/forge` lists the files WP8.7 deletes | WP8.7 |
| N7. The Watcher's names | Stage 2 retired the Watcher's names in code, files and stored values, except the stored interruption cause `watcher-lost`, which stage 2 keeps for stage 9 (WP2.16) | `git grep -n -i "watcher" -- apps packages` lists `watcher-lost` and the vendor's `setup_file_watcher_ms` in recorded Claude Code output, nothing else | WP9.1, WP9.5 |
| N8. The store port | Stage 5: `pipeline.json` is read and written only through the local store adapter | `git grep -n "pipeline.json" -- apps/forge/src apps/forge/cli ':!*.spec.ts'` names only the adapter | WP8.9 |
| N9. Gaia reaches the three packages by name | Only `apps/gaia/` and `apps/forge/bridge/` import `design-system`, `flint` or `brand`, each by its package name (`design-system/<entry>`, `flint`, `flint/react`, `brand/<entry>`) | `git grep -l -E "from '(design-system\|flint\|brand)(/\|')" -- apps ':!apps/forge/bridge'` names only files under `apps/gaia/` | WP8.2, WP8.13 |
| N10. The typed target beside the Bridge route | The board document names a subject by a typed target (stage 4's WP4.10, decision 50), and stage 4's attention entries carry it beside the monitor document's `route`, which `MonitorSnapshotAssembly.ts:212-215` still writes through `BridgeFragmentUtil` until the Bridge goes; Gaia maps those fragments into board routes (stage 6, WP6.9) | `git grep -n "BridgeFragmentUtil" -- apps/forge ':!apps/forge/bridge'` names only the util, its spec and `MonitorSnapshotAssembly.ts` | WP8.2 |
| N11. Refusals carry their sentence | Forge serves each refusal as its reason code, its structured fields and the CLI's sentence (stage 4, decision 45) | `CommandRoute.controlContract.spec.ts` pins a refusal answer with its code, fields and sentence | WP8.9 |
| N12. Stage 3's lifecycle surface | `oversee` has the subcommands of `apps/forge/cli/HelpText.ts:619-650` and stage 3's `--started-by user\|login-item`; the top-level `resume` restarts interrupted work and the top-level `crash-log [<number>]` prints a crash log (stage 3, WP3.3, WP3.8, WP3.13); the macOS and Windows login items run `start --started-by login-item`, the Linux one `oversee --started-by login-item` | `git grep -n "started-by" -- apps/forge/cli/overseer/OverseerCommand.ts apps/forge/cli/setup`; `resume` and `crash-log` are in `apps/forge/cli/CommandTable.ts` | WP9.6 |

If N1, N2 or N9 does not hold, stage 6 is not finished; if N4, N10 or N11 does not hold, stage 4 is not: report it and
stop.

## Decisions this stage carries out

- 1. The Overseer becomes Hephaestus without the interface: stage 8 removes the interface, stage 9 the name.
- 2. Hephaestus has no interface: the page, its bundle, its sessions and its HTML rendering leave forge.
- 18. One interface server, in Gaia: forge stops serving a page and a frame.
- 19. A small, versioned read API and the command endpoint beside it, met through system versions: what stays is
  exactly that, at forge system version 2.0 and then 3.0.
- 22. Outside Hephaestus, state changes through a command: the Assistant's switch is a command kind and a CLI verb.
- 24. The Assistant is a switch per board, off by default. Switching it off stops a running Assistant at the end of its
  turn, and an incident it has not settled takes its default, with the reason recorded and shown.
- 25. Flint's brain is left out of the core: its engine, route, commands and monitor field go; its log records stay
  readable (design section 3.5).
- 27. Nothing is embedded by iframe: the forge's side of the embed channel, session codes for frames and the
  frame-ancestor records go; Gaia's frame went in stage 6 (WP6.23), which WP8.3 confirms.
- 28. The Bridge's code moves into Gaia: what stage 6 left of `apps/forge/bridge/` is deleted.
- 32. Nothing that exists has to be kept: stored names, formats, installed surfaces and the system version change
  outright, each stored format is raised once, and existing boards are set up anew.
- 33. A new package is decided before work starts: these stages create no package and remove three.
- 34. Orchestrated Opus sessions in this repository do the work, outside both trackers; a package changes the rule files
  it needs to, with no approval gate.
- 41. `resume` restarts interrupted work; undoing a pause is `unpause` (WP9.6).
- 42. No `hephaestus` verb and no `oversee` verb: `forge start` starts Hephaestus, and the other lifecycle verbs sit
  beside it at the top level; WP9.6 settles the set.
- 43. No forge command opens the board: `forge open` and the `progress.html` stub go, and forge's help and its agents'
  instructions name no board page (WP8.4, WP8.12).
- 45. A refusal reads as the forge's own sentence: the Assistant switch's new refusal is served with its code, fields
  and sentence, as every refusal is (WP8.9).
- 49. Forge and Gaia share only `forge-contracts` and `system-versions`: after WP8.2 and WP8.13 no other package exists.
- 51. Gaia maps each forge document into its own model and serves its page its own contract: Gaia's server renders the
  Markdown forge serves into its page contract (WP8.8).
- 52. `design-system`, `flint` and `brand` leave `packages/` once the Bridge is deleted and become libraries in Gaia's
  page `lib/`, each behind its interface file and held by an architecture test (WP8.13).

The run's own calls for these stages, settled here and carried out in the package named:

- **The Assistant's switch** (WP8.9): `pipeline.json` key `assistant: true`, control command `pipeline-assistant-set`,
  verb `gate assistant on|off`, mirroring the approvals. Switching it off winds a live Assistant down (`job-stop`, mode
  `wind-down`, in the same hold). The default it causes has the new cause `assistant-off`, so the log says why.
- **One pipeline format** (WP8.9): `pipeline.json` is read and written in one format, raised once, in stage 8, since
  stage 8 adds `assistant` and renames the gate key `overseerOnly` to `forgeOnly` (flag `--forge-only`): a flag the user
  types names no component. Stage 9 does not raise it again. `progress.json` and the registry are raised once, in
  stage 9 (WP9.2).
- **Flint's brain's records** (WP8.7): the writer of `flint-brain-ended` goes and its reader stays (design section
  3.5). The vendor records of a brain turn stay: they record what Claude Code printed, and taking them out needs a
  recording with a real model call.
- **Versions** (WP8.10, WP9.4): forge's minimum rises to its current version in each stage, and Gaia's minimum to its
  own; the `compatibility-path` entries go; the unversioned routes of forge's own CLI and the integer version keys stay
  as the current contract, and the API reference says why. Each endpoint whose document or body changed gets its next
  version. Stage 9 is a major change of both systems, since command kinds and document keys Gaia uses change.
- **Markdown** (WP8.8): forge serves a ticket body, an epic description and a constitution as Markdown, the acceptance
  items of a body already separated (forge's rule). Gaia's server renders it with `marked` 17.0.6, the version forge
  drops, through a renderer that escapes raw HTML and allows only `http:`, `https:` and `mailto:` links, as forge's
  does; the page receives HTML in its own contract, as it does from stage 6.
- **The libraries** (WP8.13): `apps/gaia/page/lib/design-system/`, `lib/flint/`, `lib/brand/`, each with one interface
  file at its root, `DesignSystemInterface.ts`, `FlintInterface.ts`, `BrandInterface.ts`. Gaia's own components leave
  `page/design-system/` for `page/components/`, so `design-system` names the library alone. Each library keeps its own
  `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js`, specs, DOM runner, stories and description; Gaia's
  scripts run them.
- **The word "Bridge"** (WP8.12): forge's wording names a neutral action; `Bridge` and `bridge/` join forge's retired
  names. `apps/forge/docs/research/` is a dated record of findings: both stages leave it as written, and the architecture test and
  the rename skip it.
- **`.readme-graphics/`** (WP8.2): deleted with the Bridge screenshots in `apps/forge/docs/images/`, except
  `render-diagrams.py` and its README section, which render the hand-drawn diagrams of `docs/images/` from their SVG
  sources.
- **The verb set, the login item and the command kinds** (WP9.6, WP9.2): the table in WP9.6; the login item's label
  `com.forge.hephaestus.<trackerId>`, the setup flag `--login-item`; the command kinds `hephaestus-pause`,
  `hephaestus-unpause`, `hephaestus-stop`, `hephaestus-restart`.
- **Records that keep the old name** (WP9.1): `docs/monorepo/`, the older keys of `FrozenInstalledSurface.json`, the
  vendor fixtures, `apps/forge/docs/research/`, and the released program's label `com.agent-progress.overseer`.
- **Figures** (WP9.3): a figure whose pixels say "Overseer" is drawn again from a new SVG source kept beside it; one
  that cannot be drawn again faithfully is deleted with its reference, and its document says in text what it showed.

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
| The Bridge's HTML import, the one feature reach | `OverseerRoutes.ts:11`, `:178`; `apps/forge/architecture/ImportDirection.spec.ts:135-136` | Stage 8: deleted |
| Frame origins read from the frame-ancestor records | `apps/forge/cli/overseer/routes/FrameOrigins.ts:1-49`, `OverseerRoutes.ts:39`, `:177` | Stage 8: deleted |
| Refusal sentences of the server | `OverseerRoutes.ts:51-57` | Stage 8: changed: no page, no session, no page build |
| The command route with Flint's brain's kinds | `apps/forge/cli/overseer/routes/CommandRoute.ts:1-8`, `:41-42`, `:54-55`, `:126-144` | Stage 8: changed: the brain's kinds go |
| Flint's brain, the engine and its launch | `apps/forge/src/services/overseer/FlintBrain.ts:1-433`, `FlintBrainProfile.ts:1-92`, `FlintBrainSessionHost.ts:1-172`, `@types/FlintBrainRun.ts`, `utils/FlintBrainDigestUtil.ts`, `utils/FlintBrainWordingUtil.ts`; `apps/forge/cli/overseer/OverseerFlintBrain.ts:1-120` | Stage 8: deleted |
| The brain in the Overseer's serving period | `apps/forge/cli/overseer/OverseerForeground.ts:81`, `:109`, `:405-417`, `:475-476`, `:518-523`, `:540`, `:551`, `:622`, `:642`, `:655`, `:780` | Stage 8: changed |
| The brain's constants and test settings | `apps/forge/src/shared/constants/OverseerLimits.ts:143-170`; `apps/forge/src/shared/Environment.ts:96-123` | Stage 8: deleted |
| The brain's command kinds | `apps/forge/src/shared/@types/ControlCommand.ts:264-273`; `apps/forge/src/services/control/ControlService.ts:58-59`; `apps/forge/src/shared/constants/OverseerApiContracts.ts:34-35` | Stage 8: deleted |
| The brain in the monitor snapshot, the board state and today's figures | `apps/forge/src/shared/monitor/@types/MonitorSnapshot.ts:13`, `:108-109`, `:168-169`; `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts:65-66`, `:169`, `:208-232`, `:356-359`; `apps/forge/cli/overseer/routes/BoardStateReader.ts:49-59`, `:194-201`; `apps/forge/src/shared/monitor/TodayFigures.ts:26-59` | Stage 8: changed |
| The `flint-brain-ended` record: its writer | `apps/forge/src/lib/tracker-model/Board.ts:501-504`; `apps/forge/src/lib/tracker-model/Jobs.ts:334-339` | Stage 8: deleted |
| The `flint-brain-ended` record: its reader and wording | `apps/forge/src/lib/tracker-model/@types/LogRecord.ts:43-46`, `:110-111`; `constants/LogRecordSchema.ts:78-79`, `:295-300`; `constants/FlintBrainVocabulary.ts`; `apps/forge/src/adapters/log/LogRecordProblem.ts:212-213`; `utils/LogRecordMappingUtil.ts:112-113`; `apps/forge/src/adapters/utils/LogUtil.ts:291-292`, `:360-371` | Stage 8: kept, so a log holding it stays readable (design section 3.5) |
| The fake agent's brain turns | `apps/forge/src/testing/FakeAgentAdapter.ts:84-130` | Stage 8: deleted |
| `forge open` and its session code | `apps/forge/cli/tracking/open/OpenCommand.ts:1-92`, `OpenThroughARedirectFile.ts`; `apps/forge/cli/CommandTable.ts:41`; `apps/forge/cli/overseer/OverseerRemote.ts:214-232` | Stage 8: deleted |
| The default-browser opener, whose only consumer is `open` | `apps/forge/cli/OpenInTheDefaultBrowser.ts`, `apps/forge/cli/OpenerFor.ts` (the platform adapters are inside it), `apps/forge/cli/Opener.ts` (the port); `apps/forge/src/testing/BoundarySpecs.ts:142` | Stage 8: deleted |
| The `progress.html` stub | `apps/forge/src/adapters/progress-page/ProgressPageStubWriter.ts`; `apps/forge/cli/adoption/WriteProgressPageStub.ts:1-11`; `init/InitCommand.ts:103`, `:173`; `update/UpdateCommand.ts:69`; `OverseerForeground.ts:174`, `:632`; `apps/forge/src/services/tracker/constants/TrackerFiles.ts:11` | Stage 8: deleted |
| The registry entry's page and progress paths | `apps/forge/src/services/tracker/MonitorRegistration.ts:151-152` (`progressHtml`, `progressJson`); no code in `apps/` or `packages/` reads either | Stage 5: `progressJson` is not written (WP5.9). Stage 8: `progressHtml` is not written (WP8.4) |
| `SESSION_CODE_LIFETIME_SECONDS` | `OverseerLimits.ts:120` | Stage 8: deleted |
| Markdown rendered to HTML for the page | `apps/forge/src/services/render/MarkdownRenderer.ts` (with `withAcceptanceItemsSeparated` at `:103-121`), `RenderState.ts`; `PagePayloadAssembly.ts:17`, `:58-66`, `:88`; `apps/forge/src/shared/@types/PagePayload.ts:78-82`, `:110-112`; the constitution preview: `apps/forge/src/lib/tracker-model/@types/PipelineFacts.ts:110`, `:126`, `apps/forge/src/services/render/PipelineFactsAssembly.ts:101`, `:236-240`; `apps/forge/src/services/overseer/BoardState.ts:145`, `:354`, `:362`; `apps/forge/cli/CommandContext.ts:13`, `:56-57`, `:134`; `BoardStateReader.ts:167` | Stage 8: the renderer moves to Gaia's server; the board document carries Markdown |
| The HTML escape, read only by the renderer and the stub | `apps/forge/src/lib/html-escape/HtmlEscapeUtil.ts` | Stage 8: moves to Gaia's server with the renderer |
| The Bridge route writer | `apps/forge/src/shared/monitor/utils/BridgeFragmentUtil.ts`, read at `MonitorSnapshotAssembly.ts:212-215` and in `apps/forge/bridge/` | Stage 8: the monitor document carries the typed target, and the util is deleted (WP8.2) |
| The Bridge | `apps/forge/bridge/` (607 tracked files today) | Stage 8: whatever stage 6 left is deleted |
| What exists only for the Bridge | `apps/forge/package.json:10-20`, `:26-32`; `apps/forge/eslint.config.js:11-12`, `:92-93`, `:127`; `ImportDirection.spec.ts:117-123`, `:136`, `:172`, `:284`, `:609-802`; `apps/forge/src/testing/BoundarySpecs.ts:22`, `:139`, `:146-151`; `apps/forge/src/testing/recordings/darwin/bridge__*.json`; `apps/forge/.readme-graphics/` | Stage 8: deleted or changed |
| The client-name architecture test's scan proof | `apps/forge/architecture/ClientNames.spec.ts:26`, `:44-45` | Stage 8: changed (fewer than 1,000 shipped files remain); stage 9: changed (renamed paths) |
| The Bridge's rules | `.claude/rules/bridge.md`; `apps/forge/CLAUDE.md:59-62`, `:76-78`, `:221-224`, `:268-273`, `:326`, `:342`, `:350-352` | Stage 8: deleted or changed (WP8.2) |
| The three UI packages | `packages/design-system/` (305 tracked files, 80 entries in its `exports`, `CONSTITUTION.md`, Storybook), `packages/flint/` (537, 5 entries), `packages/brand/` (20, 3 entries); each with `package.json`, `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js`, `architecture/PackageIsolation.spec.ts`, a DOM runner and `README.md` | Stage 8: moved to `apps/gaia/page/lib/` (WP8.13) |
| Gaia's own components | `apps/gaia/page/design-system/` (19 files: `GaiaMark`, `BrandBar`, `BrainChip`, `ListCard`, `Refusal` and others) | Stage 8: `BrainChip` deleted (WP8.5); the folder becomes `page/components/` (WP8.13) |
| How Gaia reaches the packages | `apps/gaia/package.json` dependencies; `apps/gaia/page/index.html:8-9` (the two stylesheets by package name); `apps/gaia/resources/page/loading.html:8`, `:21`, `:29` (tokens and fonts through `node_modules/design-system/`); `apps/gaia/page/Main.tsx:6`; `apps/gaia/page/testing/ReactElementTree.ts:27-44` (reads the package's `exports`); `apps/gaia/page/DesignSystemPackage.spec.tsx`; `apps/gaia/architecture/WorkspaceDependencies.spec.ts` | Stage 8: changed (WP8.13) |
| The rules of the packages | `.claude/rules/design-system.md`, `.claude/rules/flint.md` (each scoped to `packages/<name>/**`); root `CLAUDE.md:13-28` (the package and tracker tables); `apps/gaia/CLAUDE.md:15-17`, `:60-91`, `:95-96`, `:111-112`; root `README.md:127-129`; `docs/monorepo/design.md:39-42`, `:98-116` | Stage 8: changed (WP8.13) |
| The Assistant's boot rule | `apps/forge/src/lib/tracker-model/Playbook.ts:773-784` | Stage 8: changed: it boots only while the board's switch is on |
| The `no-assistant` default | `Playbook.ts:731-740`; `apps/forge/src/lib/tracker-model/@types/Incident.ts:34-35`; `constants/DecisionAndIncidentVocabulary.ts:60`; `LogUtil.ts:357`; `apps/forge/src/shared/monitor/utils/NoticeWordingUtil.ts:24-27` | Stage 8: kept, beside a new cause `assistant-off` |
| The Playbook's facts | `Playbook.ts:55-78`; `Board.ts:796-815` | Stage 8: changed: `assistantIsOn` |
| The board's pipeline and its formats | `apps/forge/src/lib/tracker-model/@types/Pipeline.ts:5-20` (versions 2, 3 and 4), `:45-46` (`overseerOnly`), `:153-178`; `apps/forge/src/lib/tracker-model/utils/PipelineUtil.ts:105-127`; `apps/forge/src/adapters/pipeline/PipelineFile.ts:53-63`, `:93`, `:201-218`; `FrozenVersionTwoPipeline.json`, `FrozenVersionThreePipeline.json` and their specs; `--overseer-only` at `apps/forge/cli/HelpText.ts:553`; the Deviations row at `apps/forge/CLAUDE.md:335` | Stage 8: one format, with `assistant` and `forgeOnly` (WP8.9) |
| The approval switch, the pattern to mirror | `apps/forge/src/services/control/SettingControls.ts:51-54`; `Board.ts:928-930`; `apps/forge/src/lib/tracker-model/TrackerChanges.ts:176-184`; `LogRecordSchema.ts:272-273`; `apps/forge/cli/gates/GatePipelineVerbs.ts:41`, `:175-183`, `:213-214`, `:242` | Kept; copied for the Assistant's switch |
| Forge's system versions | `packages/forge-contracts/constants/ForgeSystemVersions.ts:40-43` (current 1.18, minimum 0.0), its docblock naming each minor `:7-39` | Stage 8: 2.0 and 2.0; stage 9: 3.0 and 3.0 (one major above whatever earlier stages set) |
| Forge's compatibility registry and its spec | `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:38-49`; `ForgeCompatibilityRegistry.spec.ts:17-56` | Stages 8 and 9: changed |
| Contract integers | `packages/forge-contracts/constants/OverseerContractVersions.ts:9-15`; `apps/forge/src/shared/constants/OverseerApiContracts.ts:10-36` | Stage 8: `embed` goes, monitor and control rise; stage 9: renamed |
| The embed contracts | `packages/forge-contracts/constants/EmbedMode.ts`, `@types/EmbedChannelMessage.ts`, `@types/FrameAncestorRecord.ts`; `packages/forge-contracts/package.json:13-15` | Stage 8: deleted |
| The identity's contracts | `packages/forge-contracts/@types/IdentityDocument.ts:4` | Stage 8: `embed` goes |
| The registry logic and the guard both systems use | `packages/system-versions/utils/CompatibilityRegistryUtil.ts:32-34`, `:65-80` | Kept |
| Gaia's frame session route, session-code call, frame-ancestor record, frame policy, frame view and embed reading | `apps/gaia/src/features/page-server/routes/FrameSessionRoute.ts`; `apps/gaia/src/lib/forge-client/ForgeClient.ts:46`, `:59`, `:116`, `:155-157`; `apps/gaia/src/adapters/gaia-files/ServerRecordWriter.ts`; `apps/gaia/src/lib/local-http-guards/ContentSecurityPolicy.ts:11`, `:29-30`; `apps/gaia/page/views/forge-frame/`; `apps/gaia/page/shared/utils/ForgeContractUtil.ts:11` and the readers WP6.23 lists | Deleted or changed in stage 6 (WP6.23); stage 8 checks (WP8.3) |
| Gaia's own system version and registry | `apps/gaia/src/shared/constants/GaiaSystemVersions.ts:12`, `:18`, `:25-33`; `GaiaCompatibilityRegistry.ts:16-52` | Stages 8 and 9: changed |
| Gaia's view of Flint's brain | `apps/gaia/src/shared/@types/ForgeBrain.ts`; `apps/gaia/src/features/fleet/FleetAssembly.ts:52-87`; `apps/gaia/src/adapters/forge-api/MonitorSnapshotIngestion.ts:117-157`; `apps/gaia/src/features/forge-control/ForgeControl.ts:313-316`; `apps/gaia/page/views/agents/BrainModel.ts`, `BrainPanel.tsx`; `apps/gaia/page/design-system/BrainChip.tsx`; `apps/gaia/CLAUDE.md:66`, `:88-90`, `:140-141`, `:150` | Stage 8: deleted or changed |
| Gaia's recording of the brain | `apps/gaia/src/lib/forge-client/OverseerFetch.flintBrain.recording.spec.ts`; `apps/gaia/src/testing/BoundaryRecordings.ts:100-105`; `apps/gaia/src/testing/recordings/darwin/overseer-fetch-flint-brain.json` | Stage 8: deleted |
| The forge version Gaia supports | `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9` (1.1, behind forge's 1.18, which `bun run check` only warns about); `apps/gaia/src/testing/CheckSupportedForgeVersion.ts:11-16` | Stage 8: 2.0; stage 9: 3.0 |
| How Gaia records a forge's answers | `apps/gaia/src/testing/SupportedForgeRecording.ts:1-12`; `BoundaryRecordings.ts:83-111`; `ScratchForge.ts`; `apps/gaia/CLAUDE.md:134-153` | Kept; run again in both stages |
| The lifecycle verbs | `apps/forge/cli/CommandTable.ts:12` (`status`, the board's), `:43-46` (`oversee`, `version`, `start`, `stop`); `apps/forge/cli/overseer/OverseerCommand.ts:1-60` and the rest of the file; `StartCommand.ts`, `StopCommand.ts`; `apps/forge/cli/HelpText.ts:98-110`, `:619-664`; `apps/forge/cli/Main.ts:29`, `:38`; `apps/forge/cli/constants/JobVerbs.ts:22`, `:89-92` | Stage 9: `oversee` goes; its subcommands become top-level verbs (WP9.6) |
| What starts the serving process | `apps/forge/cli/overseer/OverseerRemote.ts:175` (the detached child runs `oversee`); `apps/forge/cli/setup/DarwinAutostart.ts:18` (`oversee --detach`), `LinuxAutostart.ts:21` (`oversee`, in the foreground under systemd), `WindowsAutostart.ts:59` (`oversee --detach --repository <path>`); `apps/forge/cli/setup/Setup.ts:16`, `:34-39` (`--login-overseer`) | Stage 3: macOS and Windows run `start --started-by login-item` (WP3.8). Stage 9: the Linux line, the detached child and the setup flag (WP9.6) |
| Gaia's words for a forge command | `apps/gaia/src/adapters/page-api/ForgeSentenceUtil.ts:45-47` (`'oversee'`); `apps/gaia/CLAUDE.md:49` (rule 5) | Stage 9: changed (WP9.6) |
| The Overseer's service and CLI folders | `apps/forge/src/services/overseer/` (204 tracked files), `apps/forge/cli/overseer/` (48) | Stage 9: renamed |
| Product names: login label, first port | `apps/forge/src/shared/constants/ProductNames.ts:17`, `:30-31`, `:44-45` | Stage 9: changed, but for the released program's label at `:30` |
| The data folder and the log | `apps/forge/src/services/overseer/OverseerFiles.ts:6-16` | Stage 9: `<data>/hephaestus/`, `hephaestus.log` |
| The poll-interval setting | `Environment.ts:50-69` | Stage 9: renamed |
| `progress.json` keys and format | `apps/forge/src/adapters/progress/utils/ProgressFileMappingUtil.ts:48`, `:57`; `apps/forge/src/adapters/progress/constants/ProgressFileVersions.ts:5` | Stage 9: renamed, version raised once |
| Log record kinds and field vocabulary | `LogRecordSchema.ts:33`, `:50`, `:264`, `:293-294` | Stage 9: renamed |
| Command kinds, Playbook step, decision asker | `ControlCommand.ts:138-143`; `packages/forge-contracts/@types/ForgeControlCommand.ts:10-13`; `OverseerApiContracts.ts:27-30`; `apps/forge/src/lib/tracker-model/@types/PlaybookStep.ts:65`; `apps/forge/src/lib/tracker-model/@types/Decision.ts:49` | Stage 9: `overseer-resume` becomes `overseer-unpause` (WP9.6), then all renamed (WP9.2) |
| The registry entry key Gaia reads | `apps/forge/src/services/tracker/MonitorRegistration.ts:38`, `:62`, `:114-117`; `apps/forge/src/services/tracker/constants/MonitorRegistryFiles.ts:6`; `apps/gaia/src/adapters/forge-registry/utils/RegistryMapUtil.ts:32-59`; `ContractVersions.ts:14` | Stage 9: renamed, registry version raised once |
| Document keys and types naming the Overseer | `packages/forge-contracts/@types/BoardSummaryDocument.ts:7-29`; `MonitorSnapshotDocument.ts:27-30`, `:156`; `apps/gaia/page/@types/FleetDocument.ts:176` | Stage 9: renamed |
| The installed surface | `apps/forge/cli/constants/InstallVersion.ts:1` (36); `apps/forge/cli/FrozenInstalledSurface.json` (keys 1 to 36); `apps/forge/cli/adoption/FrozenClaudeInstall.json`; `apps/forge/resources/templates/`, `apps/forge/skills/` | Stages 8 and 9: version raised once each; a new frozen key; the older keys kept |
| The retired-name architecture test | `apps/forge/architecture/ComponentNames.spec.ts:21` (`UNSCANNED_FOLDERS`), `:28-63`, `:66`, `:77-86`, `:93-98` | Stages 8 and 9: changed |
| Gaia's Overseer names | `apps/gaia/src/lib/forge-client/OverseerFetch*.ts`; `apps/gaia/src/adapters/forge-api/OverseerTokenFile.ts`; `apps/gaia/src/testing/recordings/darwin/overseer-fetch-*.json`; `BoundaryRecordings.ts:89-111`; `apps/gaia/src/testing/RecordedAnswers.ts:107-113`; `apps/gaia/CLAUDE.md:49` | Stage 9: renamed |
| Records that keep the old name | `docs/monorepo/` (design, migration, research); `FrozenInstalledSurface.json` keys up to the last install version; `apps/forge/src/lib/claude-code/testing/fixtures/*.jsonl` (recorded vendor output); `apps/forge/docs/research/` (3 files); `ProductNames.ts:30` | Stage 9: kept, named in the checks |

## Work packages

Each work package is one commit with a plain one-line subject and no AI attribution, made in a worktree under
`.claude/worktrees/<name>`. Stage 9's packages are the exception: they accumulate in one worktree and become one
commit at the end of WP9.5. Each package ends with the root green: `bun install --frozen-lockfile`, then
`bun run verify`, both exit 0. After any TypeScript change run the workspace's own `bun run typecheck`, never ad-hoc
`tsc` flags. Never edit a `package.json` to make a check pass; the manifest changes named below are deliberate. A
package changes the rule files (`CLAUDE.md` files, `.claude/rules/*.md`) it names in the same commit, with no approval
gate.

Order and parallelism. Stage 8: WP8.1 and WP8.3 side by side (WP8.3 changes only Gaia). WP8.2 alone, after WP8.1.
WP8.4 and WP8.5 side by side, after WP8.2 and WP8.3. WP8.6 and WP8.13 side by side, after WP8.4 and WP8.5 (WP8.6
changes forge and `forge-contracts`, WP8.13 Gaia, the three packages and the rules of the libraries). WP8.7, WP8.8,
WP8.9 and WP8.10 run alone, in this order. WP8.11 and WP8.12 side by side, after WP8.10. Stage 9, in one worktree and
in this order: WP9.1, WP9.6, WP9.2, WP9.3, WP9.4, WP9.5. Two packages that both edit `docs/cli.md`,
`docs/reference/overseer-api.md`, a `CLAUDE.md` or a rules file never run side by side; the order above keeps them
apart.

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
- `apps/forge/architecture/ImportDirection.spec.ts`: `FEATURE_REACHES_BY_PATH` (`:135-136`) becomes empty, and the planted
  cases at `:716-722` that depend on the allowed reach change to prove that any import of `bridge/index.html` from
  `cli/` is refused. If the exact-both-ways allowlist must not be empty, delete the constant and its check.
- `apps/forge/CLAUDE.md`: delete the Deviations row "A feature never reaches another" (`:342`).
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
bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/OverseerServer.spec.ts ./architecture/ImportDirection.spec.ts
```

`git grep -n "bridge/index.html\|page-build-failed" -- apps/forge ':!apps/forge/bridge' ':!*.md'` prints nothing; the
root is green.

### WP8.2 Delete the Bridge program from forge

Purpose: no Bridge code, scaffolding, rule or recording is left in forge, and forge declares only the packages it
imports: `forge-contracts` and `system-versions`. Runs alone: it changes architecture tests that every other forge package relies
on.

Files to delete: `apps/forge/bridge/` (all of it); `apps/forge/src/testing/recordings/*/bridge__*.json`;
`.claude/rules/bridge.md`; `apps/forge/.readme-graphics/` except `render-diagrams.py` and `README.md`; the Bridge
screenshots under `apps/forge/docs/images/` (`bridge-*.png`) and their rows in `apps/forge/README.md`;
`apps/forge/src/shared/monitor/utils/BridgeFragmentUtil.ts` and its spec.

Files to change:
- The monitor document's route: `packages/forge-contracts/@types/MonitorSnapshotDocument.ts` (`:60`, `:85`, `:100`)
  carries the typed target of stage 4's attention entries in place of `route`, and `MonitorSnapshotAssembly.ts:212-215`
  writes it; Gaia's `src/adapters/forge-api/MonitorSnapshotIngestion.ts` and
  `src/adapters/forge-api/utils/ForgeReadingMapUtil.ts` read the target and compose the board route from it, in the
  same commit (N10). The system version for the change is WP8.10's major.
- `apps/forge/package.json`: scripts `typecheck` is already `tsc -p tsconfig.json`; delete `typecheck:bridge`,
  `typecheck:bridge-specs` and `test:dom:bridge`;
  dependencies drop `brand`, `design-system`, `flint`, `react`, `react-dom` (no file outside `bridge/` imports them:
  `git grep -l "from 'brand\|from 'design-system\|from 'flint\|from 'react" -- apps/forge ':!apps/forge/bridge'`
  prints nothing today). Keep `marked` until WP8.8. Update the `description` (`:4`) so it names no Bridge.
- Run `bun install` at the root once, so `bun.lock` drops the removed links, then `bun install --frozen-lockfile`.
- `apps/forge/.readme-graphics/README.md`: only the diagrams section stays; the screenshot pipeline goes.
- `apps/forge/eslint.config.js`: delete the browser-storage rule (`:11-12`), the Bridge test globs (`:92-93`) and the
  `bridge/**` block (`:127` onward); keep every other rule.
- `apps/forge/architecture/ImportDirection.spec.ts`: delete the `bridge/` entries of the testing allowlist (`:117`, `:122-123`),
  the feature list's `bridge/`, the DOM-suite note (`:172`), the view-folder rule and its planted cases (`:284`,
  `:645`, `:656`, `:710-794`), and the `design-system` and `flint` package cases (`:609`, `:772-802`), which forge does
  not declare after this package. The scan's proof that it read the tree keeps a lower bound that still holds.
- `apps/forge/architecture/TestFileConventions.spec.ts`: `DOM_SPEC_FOLDERS` (`:19`) loses `bridge/`; forge has no DOM spec left,
  so the constant and its check go if nothing else is listed; the header (`:2-3`) and the note at `:87` follow.
- `apps/forge/architecture/ClientNames.spec.ts:26`: lower `SMALLEST_SHIPPED_FILE_COUNT` to a bound under the new count (about
  840 shipped files remain today, 1,199 less the 360 in `bridge/`; measure with the spec's own `isShipped`), and drop
  paths that do not exist from `:45` (`cli/overseer/routes/FrameOrigins.ts` stays until WP8.6).
- `apps/forge/architecture/ComponentNames.spec.ts:81`: forge scans `design-system/CONSTITUTION.md` and `flint/package.json`
  only while it declares the two packages; replace them with a file of a package forge still declares
  (`forge-contracts/package.json`).
- Every other architecture test that names `bridge/`: `architecture/LintRules.spec.ts`, `architecture/PlatformBoundary.spec.ts`,
  `architecture/ProductNameLiterals.spec.ts`, `architecture/RealSystemSpecs.spec.ts`, `architecture/SpecSkips.spec.ts`, `architecture/SpecSleeps.spec.ts`,
  `architecture/SpecsOpenNoPage.spec.ts`, `architecture/UtilShape.spec.ts`, `src/services/overseer/CodeVersion.spec.ts`,
  `src/testing/ImportGraph.ts`, `src/testing/ImportGraph.spec.ts`, `src/testing/BoundaryRecordings.ts`,
  `src/testing/CheckRecordingStamps.integration.spec.ts`, `cli/tracking/range/RangeCommand.spec.ts`,
  `src/services/control/BoardLifetimeControls.ts`. Remove each `bridge/` entry; every allowlist stays exact both ways.
- `apps/forge/src/testing/BoundarySpecs.ts`: delete `HEADLESS_BRIDGE_SPEC` (`:22`) and the six `bridge/` boundaries
  (`:146-151`); `OverseerServer.ts`'s boundary keeps its other two specs (`:139`).
- `apps/forge/src/shared/constants/ProductNames.ts:1-5`: the header sentence "so the Bridge's project compiles it"
  goes.
- Rules: `apps/forge/CLAUDE.md` loses every rule that holds only for `bridge/` (`:11` the `packages/flint/…` example,
  `:59-62` the import lines for the design system, Flint and `brand`, `:76-78`, `:221-224`, `:268-273`, the Bridge's
  three entries `bridge/Main.tsx`, `bridge/testing/RunDomSpecs.ts` and `bridge/testing/HappyDom.ts` in the Deviations
  row "No work at module load" (`:326`), and the rows at `:350-352`). The root `CLAUDE.md`, `.claude/rules/flint.md`
  and `.claude/rules/design-system.md` change in WP8.13, which moves the packages; this package leaves them alone.

What to do:
1. `git rm -r apps/forge/bridge` and the files above.
2. Fix every red architecture test by deleting the Bridge's entries, never by loosening a rule for other folders.
3. Search: `git grep -n -i "bridge" -- apps/forge ':!apps/forge/docs' ':!*.md'` prints only the word in wording that
   WP8.12 rewrites (refusal sentences, comments), and no path.
4. Between this package and WP8.13 the three packages are workspaces no app outside Gaia declares; each keeps its own
   `architecture/PackageIsolation.spec.ts`, run by its own workspace (Traps).

Specs: no new spec. Each changed architecture test still proves its scan found files and still fails on a planted case of each
form it keeps.

Done when: in `apps/forge`, `bun run typecheck`, `bun run lint` and `bun test` pass, and forge has no `test:dom:bridge`
script; the root is green; `git ls-files apps/forge/bridge` prints nothing.

### WP8.3 Confirm that Gaia holds no embed machinery

Purpose: before forge drops its sessions, session codes, frame origins and the `embed` contract (WP8.6, WP8.10), prove
that Gaia uses none of them. Stage 6 removed Gaia's side (WP6.23): the frame session route, the frame view's frame
parts and embed channel, `sessionCodeOf`, the frame-ancestor record writer, the page's frame source, the contracts
`forgeEmbedChannel`, `forgeFrameAncestorRecord` and `gaiaFrameSession`, the endpoint `frameSession`, the command
`forge-open-in-browser`, and Gaia's reading of the forge's `embed` contract. Gaia only; may run beside WP8.1.

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

Purpose: decision 43. No forge command opens a page or writes a pointer to one; the user opens Gaia and picks the
forge, and forge names no client (`apps/forge/architecture/ClientNames.spec.ts:1-5`). Forge's help and its agents'
instructions name no board page. Runs after WP8.2; beside WP8.5.

Files to delete: `apps/forge/cli/tracking/open/` (OpenCommand, OpenThroughARedirectFile and their specs);
`apps/forge/cli/OpenInTheDefaultBrowser.ts`, `OpenInTheDefaultBrowser.spec.ts`,
`OpenInTheDefaultBrowser.integration.spec.ts`, `OpenerFor.ts` (the platform adapters live inside it),
`OpenerFor.spec.ts`, `Opener.ts` (the port), `Opener.contract.spec.ts`; outside `bridge/`, nothing else names them but
the architecture tests below and `docs/development/`
(`git grep -ln "openerFor\|OpenerFor\|Opener\b" -- apps/forge`);
`apps/forge/src/testing/recordings/*/cli__OpenInTheDefaultBrowser.ts.json`;
`apps/forge/src/adapters/progress-page/` (the stub writer and its spec);
`apps/forge/cli/adoption/WriteProgressPageStub.ts`. `apps/forge/architecture/SpecsOpenNoPage.spec.ts` stays: it also refuses any
spec that starts an opener program (`open`, `xdg-open`, the Windows handler) through a process start or a shell tag
(`:17-30`); drop only its reaches through `openInTheDefaultBrowser`, `openCommand`, the `open` command line and
`openerFor`, with their planted cases and the header sentence (`:1-8`) that names them.

Files to change:
- `apps/forge/cli/CommandTable.ts:41` and the `open` block of `apps/forge/cli/HelpText.ts` (`:612-617`); the `start`
  block's "as `open` does" (`:657`).
- `apps/forge/cli/overseer/OverseerRemote.ts`: delete `sessionCodeOf` (`:214-230`) and its export (`:232`).
- `apps/forge/cli/overseer/DetachedOverseerStart.ts:1-3`: the header names `oversee` and `start` only.
- `apps/forge/cli/adoption/init/InitCommand.ts:35`, `:103`, `:173`; `update/UpdateCommand.ts:27`, `:69`;
  `apps/forge/cli/overseer/OverseerForeground.ts:15`, `:174`, `:632` (the stub with the URL once the server is up): no
  stub.
- `htmlFilePath` of `Workspace` and the `progress.html` name stage 5 kept private to
  `apps/forge/src/services/tracker/Workspace.ts` (stage 5, WP5.11; `TrackerFiles.ts:11` today), and every
  `htmlFilePath` reader, `MonitorRegistrationRequest.htmlFilePath` (stage 5, WP5.9) among them: the board has no
  `progress.html`. `init` and `update` remove an existing `progress.html` once, as they remove a retired install's
  files.
- The registry entry (`apps/forge/src/services/tracker/MonitorRegistration.ts:151-152`): `progressHtml` is not written
  (stage 5's WP5.9 already dropped `progressJson`); no code in `apps/` or `packages/` reads either
  (`git grep -n "progressHtml\|progressJson" -- apps packages ':!*.spec.ts' ':!*.json'` names only the writer). The
  registry's format version stays until stage 9 raises it once (WP9.2); Gaia's reader passes the missing keys by.
- `apps/forge/src/testing/BoundarySpecs.ts:142`, `src/testing/RecordedBoundaryCommands.ts`, `BoundaryRecordings.ts`,
  `architecture/PlatformBoundary.spec.ts`: the opener's boundary and its allowlisted platform reads go.
- `apps/forge/src/testing/RecordedOverseerFetch.ts:226-236`: the `session-codes` and `session` call shapes stay until
  WP8.6, which deletes them with the routes.
- `apps/forge/CLAUDE.md`: the Runtime sentence on `openerFor` (`:142-143`); the Tests rule "A spec never opens a
  page" (`:265-267`) stays with its test, and only its "the default browser opener" names the opener programs.
- `apps/forge/cli/constants/InstallVersion.ts:1`: raise `INSTALL_VERSION` by one (36 today, unless an earlier stage
  raised it): `open` is in the frozen surface of install version 36
  (`apps/forge/cli/FrozenInstalledSurface.json:609-619`). Add the new version's key to `FrozenInstalledSurface.json` as
  `cli/InstalledSurface.spec.ts:1-9` describes, never deleting a name from an older key; retake
  `apps/forge/cli/adoption/FrozenClaudeInstall.json` through its spec's `frozenTableFromTheCurrentImplementation`; run
  `bun run record src/services/overseer/InstallChangeWatch.ts`.
- Installed text that names `open`, `progress.html` or a board page: `resources/templates/SessionInstructions.md:26`
  ("Run `{{program}} open` once per session", deleted), the rest of `resources/templates/`, `resources/prompts/` and
  `skills/` (search `git grep -n -w "open\|progress.html\|page" -- apps/forge/resources apps/forge/skills`, and keep
  only the hits that mean something else).
- `apps/forge/docs/cli.md`: delete the `open` and `progress.html` entries (among them `:158`, `:240`, `:1370`,
  `:2134`, and `progressHtml` and `progressJson` in the registry example at `:2964`); `docs/backlog.md` entries about
  them go; `docs/development/platform-status.md` and `docs/development/architecture-tests-and-testing.md` drop the opener.

What to do: delete, then follow `bun run typecheck`. Later work packages of stage 8 that change an installed file
change only its text and the new frozen key; they do not raise `INSTALL_VERSION` again.

Specs: `cli/RetiredVerbs.spec.ts` gains `['open']` and `['open', '--no-browser']` in `RETIRED_COMMAND_LINES`: each is
refused at exit 1 as unknown and writes nothing; `cli/adoption/init/InitCommand.spec.ts` proves `init` writes no
`progress.html` and removes one that exists; `MonitorRegistration.spec.ts` proves the entry has no `progressHtml` and
no `progressJson`; `cli/CommandTable.spec.ts` and `cli/HelpText.spec.ts` agree without `open`.

Done when: in `apps/forge`, `bun run typecheck`, `bun run lint` and `bun test` pass; `bun run check` reports no stale
stamp; `git grep -n -w "openCommand\|sessionCodeOf\|ProgressPageStub\|HTML_FILE_NAME\|progressHtml" -- apps/forge`
prints nothing; the root is green.

### WP8.5 Remove Flint's brain from Gaia

Purpose: Gaia neither reads nor shows nor commands Flint's brain, so forge can drop it. Gaia only; after WP8.3; beside
WP8.4.

Files to delete: `apps/gaia/src/shared/@types/ForgeBrain.ts`; `apps/gaia/page/views/agents/BrainModel.ts`,
`BrainPanel.tsx`, `AgentsModel.brain.spec.ts`; `apps/gaia/page/testing/fixtures/fleet-brain-states.ts` and its spec;
`apps/gaia/src/lib/forge-client/OverseerFetch.flintBrain.recording.spec.ts`;
`apps/gaia/src/testing/recordings/darwin/overseer-fetch-flint-brain.json`; `apps/gaia/page/design-system/BrainChip.tsx`
and `BrainChip.spec.tsx`.

Files to change:
- `apps/gaia/src/adapters/forge-api/MonitorSnapshotIngestion.ts:10-12`, `:117-139`, `:157`: the monitor shape names no
  `flintBrain`; a document that still carries it reads, its key passed over as any unknown key
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
WP8.4 and WP8.5; beside WP8.13.

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
- `apps/forge/cli/overseer/OverseerForeground.ts:459-462`: the server request has no `now` once nothing reads it.
- `apps/forge/src/testing/RecordedOverseerFetch.ts:222-240`: delete the `session-token`, `session-codes` and `session`
  call shapes and the session-cookie branch of `readerIsAuthorized`.
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts:45` and `ForgeCompatibilityRegistry.spec.ts:29`,
  `:53-55`: `session-codes` leaves the registry and the spec's lists.
- `apps/forge/architecture/ClientNames.spec.ts:45`: drop `cli/overseer/routes/FrameOrigins.ts`.
- `apps/forge/src/shared/constants/OverseerLimits.ts:120`: delete `SESSION_CODE_LIFETIME_SECONDS` (read by
  `BrowserSessions.ts:8` until now).
- `apps/forge/docs/reference/overseer-api.md`: the route table rows for `session-codes`, `session`, `session-token`
  and "Any other GET outside /api/" (`:44-46`, `:61`), and the sections "Browser sessions" (`:112-136`) and "Serving
  the page" (`:137-164`); `apps/forge/docs/cli.md:1353-1360`.

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

Purpose: no forge code runs, serves or commands Flint's brain; the contract package names no brain. A log that holds
a `flint-brain-ended` record still reads (design section 3.5). Runs alone, after WP8.6 and WP8.13.

Files to delete: `apps/forge/src/services/overseer/FlintBrain.ts`, `FlintBrain.spec.ts`, `FlintBrainProfile.ts`,
`FlintBrainProfile.spec.ts`, `FlintBrainSessionHost.ts`, `@types/FlintBrainRun.ts`,
`utils/FlintBrainDigestUtil.ts` and spec, `utils/FlintBrainWordingUtil.ts` and spec;
`apps/forge/cli/overseer/OverseerFlintBrain.ts`; `apps/forge/cli/overseer/routes/CommandRoute.flintBrain.spec.ts`;
`apps/forge/src/services/overseer/testing/fixtures/monitor-v3-flint-brain.json`; the brain's child folder handling
that stage 2 added (N6) goes with them, and a board's `flint-brain/` child folder is not launched.

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
- `apps/forge/src/services/overseer/MonitorSnapshotAssembly.ts:7`, `:29`, `:65-66`, `:169`, `:208-232`, `:356-359`:
  no brain in the snapshot, no `flint-brain` activity kind, today's tokens count no brain run.
- `apps/forge/src/shared/monitor/TodayFigures.ts:6`, `:26-59`: delete `TodayFlintBrainRun` and `flintBrainRunsOf`;
  `todayFiguresOf` takes no runs.
- `apps/forge/src/shared/monitor/@types/MonitorSnapshot.ts:13`, `:108-109`, `:168-169`.
- `apps/forge/src/shared/@types/ControlCommand.ts:264-273` (`FlintBrainCommand`, `OverseerApiCommand`);
  `apps/forge/src/services/control/ControlService.ts:9`, `:58-59`;
  `apps/forge/src/shared/constants/OverseerApiContracts.ts:34-35`.
- `apps/forge/src/shared/constants/OverseerLimits.ts:143-170`; `apps/forge/src/shared/Environment.ts:96-123`.
- The writer of the brain's log record: `Board.ts:501-504`, `Jobs.ts:334-339`. The reader stays (`LogRecord.ts`,
  `LogRecordSchema.ts`, `FlintBrainVocabulary.ts`, `LogRecordProblem.ts`, `LogRecordMappingUtil.ts`, `LogUtil.ts`).
  `apps/forge/src/testing/EveryBoardLogRecord.ts:284-286` builds that one record from a literal, with a one-line
  comment that no Board change logs it.
- `apps/forge/src/testing/FakeAgentAdapter.ts:84-130`: delete `FAKE_FLINT_BRAIN_ANSWER`,
  `FLINT_BRAIN_FAKE_AGENT_STEPS` and the tool-less branch at `:130`, unless another tool-less session exists
  (`git grep -n "availableTools === 'none'\|availableTools: 'none'" -- apps/forge`).
- The vendor records of a brain turn stay as recorded:
  `apps/forge/src/lib/claude-code/ClaudeStreamFixtures.spec.ts:165-167`,
  `src/testing/fake-agent/RecordedClaudeLines.ts:23`, `ClaudeWireRecorder.ts:19-25`, `architecture/PlatformProbes.spec.ts:74`,
  `.platform-probes/claude-p22-flint-brain-turn.js` and the `flint-brain-turn` scenario in
  `src/testing/recordings/darwin/src__testing__fake-agent.json`. They record the vendor's answer to a tool-less,
  structured-output turn.
- `packages/forge-contracts/@types/MonitorSnapshotDocument.ts`: delete `MonitorFlintBrainState`,
  `MonitorFlintBrainStartedBy`, `MonitorFlintBrainEndedReason` (`:20-25`), `MonitorFlintBrainMoveDocument`,
  `MonitorFlintBrainRefusalDocument`, `MonitorFlintBrainDocument` (`:122-150`), the `flintBrain` key and the
  `flint-brain` activity kind; `packages/forge-contracts/@types/ForgeControlCommand.ts`: the two brain kinds;
  `packages/forge-contracts/README.md`: the brain leaves the export table. Forge's adapter that maps the monitor
  snapshot into the document follows.
- `packages/forge-contracts/constants/OverseerContractVersions.ts:8` comment; the version numbers change in WP8.10.
- `apps/forge/src/services/overseer/testing/fixtures/monitor-v3.json` and the specs that read it.
- Docs: `apps/forge/docs/reference/overseer-api.md` "Flint's brain" (`:236-280`) and its route row (`:53`);
  `apps/forge/docs/cli.md`, `docs/operations/runbook.md`, `docs/backlog.md` lines naming the brain.

What to do: delete, follow the compiler in `apps/forge`, then in `packages/forge-contracts` and `apps/gaia`
(WP8.5 made Gaia independent of the brain's types). Run `bun run record src/services/overseer/OverseerServer.ts`
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

### WP8.8 Markdown leaves forge as Markdown, and Gaia's server renders it

Purpose: forge renders no HTML. The board document carries the Markdown of a ticket body, an epic description and the
constitution preview of the pipeline setup, the board's and each entity's; Gaia's server maps it into its own model
and renders it into the HTML fields of its page contract (N3, decision 51). The page does not change. Runs alone,
after WP8.7.

Files to delete: `apps/forge/src/services/render/MarkdownRenderer.ts`, `MarkdownRenderer.spec.ts`,
`RenderState.ts`; `apps/forge/src/lib/html-escape/` (its other reader, the stub writer, went in WP8.4), moved as below.

Files to create (Gaia):
- `apps/gaia/src/lib/markdown-render/MarkdownRenderer.ts`: forge's renderer, moved and generalized: `marked` with
  `gfm: true`, raw HTML in the source escaped, a link kept only for `http:`, `https:` and `mailto:` after the same
  entity decoding, built once on the first render. It knows no ticket and no section.
- `apps/gaia/src/lib/markdown-render/HtmlEscapeUtil.ts`, moved from `apps/forge/src/lib/html-escape/`.
- Their specs, moved from `MarkdownRenderer.spec.ts` and `HtmlEscapeUtil.spec.ts`: every hostile-input case of
  forge's spec (raw HTML, `javascript:` and encoded schemes, entities without `;`) holds in Gaia; the
  `withAcceptanceItemsSeparated` cases stay in forge.

Files to change (forge):
- `withAcceptanceItemsSeparated` (`MarkdownRenderer.ts:103-121`) moves beside the acceptance rules, into
  `apps/forge/src/adapters/tickets/utils/TicketAcceptanceUtil.ts`, with its spec cases: the separation is forge's rule
  about a ticket body, and forge serves its result.
- `apps/forge/src/services/render/PagePayloadAssembly.ts:17`, `:58-66`, `:88`: `bodyHtml` becomes `bodyMarkdown`, the
  ticket body with its acceptance items separated; `descriptionHtml` becomes `descriptionMarkdown`, the stored
  description; the `renderMarkdown` input goes.
- `apps/forge/src/shared/@types/PagePayload.ts:78-82`, `:110-112`, and the board documents in `packages/forge-contracts`
  that name these fields (N4), with the adapter that maps the model into them: the same two keys.
- `apps/forge/src/lib/tracker-model/@types/PipelineFacts.ts:110` (`PipelineSetupEntityFacts`) and `:126`
  (`PipelineSetupFacts`, whose comment at `:125` says the server renders it), and the document that carries them:
  `constitutionHtml` becomes `constitutionMarkdown`, the constitution as stored, `null` with no constitution.
- `apps/forge/src/services/render/PipelineFactsAssembly.ts:101`, `:236-240`: the `renderMarkdown` input goes; the
  constitution facts carry `constitution.markdown`.
- `apps/forge/src/services/overseer/BoardState.ts:145`, `:354`, `:362`: the reading has no `renderMarkdown`.
- `apps/forge/cli/CommandContext.ts:13`, `:56-57`, `:134`; `apps/forge/cli/testing/CapturedCommandContext.ts:10`,
  `:102`; `BoardStateReader.ts:167`: no render state.
- `apps/forge/package.json`: drop `marked`; its other importer, `.readme-graphics/render-readme.js:6`, went in WP8.2.
- `apps/forge/CLAUDE.md:167-168`: "The render service keeps no module state: the configured Marked lives in the render
  state the command context carries" goes.
- `apps/forge/docs/reference/overseer-api.md:411-417`, `:459`, `:463`; `apps/forge/docs/glossary.md:90`;
  `apps/forge/docs/development/architecture-tests-and-testing.md:55`.

Files to change (Gaia):
- `apps/gaia/package.json`: `marked` 17.0.6 as a dependency. Run `bun install` at the root once, then
  `--frozen-lockfile`.
- `apps/gaia/src/adapters/forge-api/`: the ingestion of the board document reads `bodyMarkdown`, `descriptionMarkdown`
  and `constitutionMarkdown` into Gaia's model as Markdown.
- `apps/gaia/src/adapters/page-api/`: the mapping into the page contract renders each through
  `MarkdownRenderer` into the HTML fields the page reads today (the names stage 6 gave them; find them with
  `git grep -n "Html" -- apps/gaia/page/@types`).
- `apps/gaia/docs/contracts.md`: the board document's three fields; `apps/gaia/CLAUDE.md`, where it names the board
  document's HTML.

What to do: rename the fields in the contract first, then follow the compiler in `apps/forge` and `apps/gaia`.

Specs: `PagePayloadAssembly.spec.ts` proves a ticket entry's `bodyMarkdown` equals the stored body with its acceptance
items separated, an epic's `descriptionMarkdown` its stored description byte for byte, and that no key of the document
ends in `Html`; `PipelineFactsAssembly.spec.ts` proves `constitutionMarkdown` equals the stored constitution byte for
byte, for the board and for an entity; Gaia's mapping spec proves a body with raw HTML and a `javascript:` link reaches
the page contract escaped and without the link, and the page's view specs pass unchanged.

Done when: this prints nothing:

```bash
git grep -n "bodyHtml\|descriptionHtml\|constitutionHtml\|renderMarkdown\|from 'marked'" -- apps/forge packages
```

`git grep -ln "from 'marked'" -- apps/gaia` names only `src/lib/markdown-render/`; the root is green.

### WP8.9 The Assistant's switch, and one pipeline format

Purpose: decision 24. A pass boots an Assistant only while the board's switch is on, and a new board has it off.
Switching it off winds a live Assistant down at the end of its turn; every incident it has not settled takes its
default with the cause `assistant-off`. `pipeline.json` gets its one format here, raised once: it adds `assistant`,
and the gate key `overseerOnly` becomes `forgeOnly`. Runs alone, after WP8.8.

Files to change (mirror every file that names `pipeline-approval-set`: `git grep -ln "pipeline-approval-set"`). The
tracker model is at `apps/forge/src/lib/tracker-model/`:
- `@types/Pipeline.ts`: `Pipeline` gains `assistant?: true`, present means on. It is a key of the board, beside
  `approvals` and `billing`, never of an entity (`PipelineEntity`). The gate's `overseerOnly?: true` (`:45-46`) becomes
  `forgeOnly?: true`, "run by the forge alone, never by an agent in its worktree". `PIPELINE_FORMAT_VERSION` (`:9`)
  becomes the next unused number (5 unless an earlier stage of this run raised it); `EARLIEST_PIPELINE_FORMAT_VERSION`,
  `ENTITIES_PIPELINE_FORMAT_VERSION` and `PipelineFormatVersion` (`:5-20`) go.
- `utils/PipelineUtil.ts:105-127`: `formatVersionOf` goes; every pipeline is written in the one version, with `reach`
  and `entities` written as present. `assistant` stays out of the gating hash (`phaseHashOf`, `:145`), like
  `approvals`, and is in the apply-conflict hash (`contentHashOf`, `:178`, beside `approvals` in its canonical
  record).
- `apps/forge/src/adapters/pipeline/PipelineFile.ts`: `PIPELINE_KEYS_OF_VERSION` and `READABLE_FORMAT_VERSIONS`
  (`:53-63`) become one key list, today's keys of version 4 plus `assistant`; any other version is refused `older`
  with `OLDER_FORMAT_ADVICE` or `newer`, as today. `GATE_KEYS` (`:93`) and the gate reader (`:201-218`) say
  `forgeOnly`. `assistant` present and not `true` is a problem, as a gate's `forgeOnly` is. Stage 5's store adapter
  carries it (N8).
- Delete `FrozenVersionTwoPipeline.json`, `FrozenVersionThreePipeline.json`, `PipelineFile.versionTwo.spec.ts`,
  `PipelineFile.versionThree.spec.ts`; `PipelineFile.entities.spec.ts` and `PipelineFile.spec.ts` read and write the
  one version.
- The gate flag `--overseer-only` becomes `--forge-only`: the parser in `apps/forge/cli/gates/`, `HelpText.ts:553`,
  `gate list` and its JSON; every other reader of the key (`git grep -n "overseerOnly\|overseer-only" -- apps
  packages`), the documents of `packages/forge-contracts` and Gaia's mapping among them.
- `apps/forge/CLAUDE.md:335`: the Deviations row on reading `pipeline.json` in versions 2, 3 and 4 goes.
- `apps/forge/src/shared/@types/ControlCommand.ts`: `{ kind: 'pipeline-assistant-set'; on: boolean }`; the board's
  command kinds in `packages/forge-contracts` gain it wherever `pipeline-approval-set` is listed (N4), so the command
  endpoint takes it as it takes the approval.
- `apps/forge/src/services/control/SettingControls.ts`: its applier, `inReadablePipeline` like `:51-54`, calling
  `transaction.board.setAssistant(command.on, transaction.at)` on stage 5's `BoardTransaction`. Switching off while an
  Assistant job is live winds that job down in the same hold with the existing `job-stop` move, mode `wind-down`.
- `Board.ts`: `setAssistant(on: boolean, at: string): PipelineChanged`, beside `setApproval` (`:928-930`), which
  writes the pipeline and logs `pipeline-assistant-set`; `assistantIsOn(): boolean`; `playbookFactsOf` (`:796-815`)
  adds `assistantIsOn: this.records.pipeline?.assistant === true`.
- `TrackerChanges.ts`: `setAssistant`, as `setApproval` (`:176-184`): it refuses a pending Apply, refuses with no
  stored pipeline (a new refusal `assistant-without-pipeline`, as `approval-without-pipeline` in `BoardRefusal.ts:104`,
  its sentence in `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts:306`, served with its code, fields and
  sentence as every refusal is, N11), and does not refuse a pipeline with entities.
- `constants/LogRecordSchema.ts`: `'pipeline-assistant-set': { subject: 'board', fields: { state: 'text' } }`, beside
  `:272-273`; `apps/forge/src/adapters/utils/LogUtil.ts`: its sentence.
- `Playbook.ts`: `PlaybookFacts.assistantIsOn: boolean` (`:55-78`); `noAssistantCanComeUp` and `assistantMayBoot`
  (`:773-774`) unchanged; the boot at `:784` also requires `facts.assistantIsOn`. `incidentDefaultStepsOf`
  (`:731-740`) checks the switch first: while it is off, an incident delivered to a turn of a live Assistant that has
  not closed waits for that turn's end; every other open incident gets `{ kind: 'default-incident', incidentId, cause:
  'assistant-off' }` in the pass. The `no-assistant` branch and the rest follow unchanged.
- `@types/Incident.ts:34-35` and `constants/DecisionAndIncidentVocabulary.ts:60`: `IncidentDefaultCause` adds
  `'assistant-off'`.
- `LogUtil.ts:357` adds `'assistant-off': 'while the Assistant was off'`; `NoticeWordingUtil.ts:24` adds
  `'assistant-off': 'the Assistant is off'`.
- `apps/forge/src/services/control/Bouncer.ts` (and `Bouncer.spec.ts`): no job role may send the new kind, as for the
  approval.
- `apps/forge/cli/gates/GatePipelineVerbs.ts`: the verb `gate assistant on|off [--json]`, a usage line beside `:41`, a
  parser beside `:175-183`, `Assistant: on|off` in `gate list` beside `:213-214`, the key in the JSON of `:242`.
- `apps/forge/cli/constants/JobVerbs.ts`, `apps/forge/cli/HatchUnderJob.spec.ts`: refused under a job.
- `apps/forge/cli/HelpText.ts`: the block for the verb; `apps/forge/docs/cli.md`: the verb, the key, the record, the
  one pipeline version and `--forge-only`.
- `apps/forge/src/services/render/PipelineFactsAssembly.ts`, `MonitorSnapshotAssembly.ts`: where the approval is read
  for the documents, read the switch too.
- Installed text: `resources/templates/Reference.md:187-201` and `skills/agent-progress-orchestrate/SKILL.md:19`, `:80`
  say an Assistant settles incidents; reword so they hold whether the Assistant is on or off (the incident takes its
  default while it is off). Change the new frozen key's names in `FrozenInstalledSurface.json` for `--forge-only`,
  and for the verb if an installed file names it; `INSTALL_VERSION` rose in WP8.4.
- `apps/forge/src/lib/tracker-model/testing/LifecycleFixtures.ts:69-87` (`factsWith`): the default facts have
  `assistantIsOn: true`, so the specs that test the Assistant keep testing it; add fixtures with it off.

What to do: build the model first (types, Board, Playbook), then the file format, then the control, then the CLI,
following the approval at each step.

Specs:
- `Playbook.spec.ts`: with the switch off and no Assistant live, no `boot-assistant` step; with it on, the step as
  today; with it off, every open incident not delivered to an open turn gets `default-incident` with cause
  `assistant-off` in the same pass, and one delivered to the open turn of a winding-down Assistant gets it once that
  turn closes; with it on, the `no-assistant` cases hold as today (`:501`).
- `SettingControls.spec.ts`: `pipeline-assistant-set` on writes `assistant: true` and logs `state: 'on'`; off removes
  the key, logs `state: 'off'` and winds a live Assistant job down (mode `wind-down`); on an unreadable pipeline it
  refuses as the approval does.
- `PipelineFile.spec.ts`: a pipeline with `assistant: true` and a gate with `forgeOnly: true` round-trips byte for
  byte, with and without `entities`; `assistant: false` is a problem; a file of version 2, 3 or 4 is refused `older`
  with `OLDER_FORMAT_ADVICE`; a gate holding `overseerOnly` is malformed.
- `GatePipelineVerbs.spec.ts`: the verb, its usage refusal and its JSON answer; `gate add --forge-only`;
  `--overseer-only` refused as an unknown option.
- `CommandRoute.controlContract.spec.ts`: `pipeline-assistant-set` through the endpoint; its refusal with no pipeline
  answers `assistant-without-pipeline` with its sentence.
- `Bouncer.spec.ts`, `HatchUnderJob.spec.ts`, `ControlService.spec.ts`: the new kind in their exact lists.

Done when: in `apps/forge`, `bun run typecheck`, `bun run lint` and `bun test` pass; `bun test
./src/lib/tracker-model/Playbook.spec.ts` names the cases above; this prints nothing:

```bash
git grep -n "overseerOnly\|overseer-only\|EARLIEST_PIPELINE_FORMAT_VERSION\|ENTITIES_PIPELINE_FORMAT_VERSION" \
  -- apps packages
```

and the root is green.

### WP8.10 Forge 2.0 and Gaia's next major

Purpose: the system versions say what stage 8's removals did. Runs alone, after WP8.9.

Files to change:
- `packages/forge-contracts/constants/ForgeSystemVersions.ts:40-43`: `current` and `minimumSupported` at forge's next
  major, minor 0 (1.18 and 0.0 today, so 2.0 and 2.0, unless an earlier stage raised the major); rewrite the docblock
  (`:7-39`, which names every minor from 1.1 to 1.18) for the new version.
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.ts`: the entries listed under Interfaces introduced;
  the three `keptForReleasedClientsOf` entries (`:46-48`) go, since the minimum passes 0.0.
- `packages/forge-contracts/constants/ForgeCompatibilityRegistry.spec.ts:1-61`: rewrite the lists and claims for 2.0:
  the guard holds, every entry is shipped, a 2.0 client calls each endpoint at the listed version, nothing is
  removable at 2.0.
- `packages/forge-contracts/constants/OverseerContractVersions.ts:9-15` and its spec: delete `embed`; `monitor` one
  higher (today 3, so 4, unless stage 3 or 6 raised it: `flintBrain` and the `flint-brain` activity kind left the
  document), `control` one higher (today 1, so 2: two kinds left, one came); `identity` and `summary` stay.
  `packages/forge-contracts/@types/IdentityDocument.ts:4`: `ServedContractName` loses `'embed'`.
  `apps/forge/src/shared/constants/OverseerApiContracts.ts:12-17` loses `embed`.
- `packages/forge-contracts`: delete `constants/EmbedMode.ts`, `@types/EmbedChannelMessage.ts`,
  `@types/FrameAncestorRecord.ts` and their `exports` (`package.json:13-15`); `version` becomes `2.0.0`; the
  `description` (`:4`) and `README.md` drop the embed channel and the framing record. Run `bun install` once at the
  root, then `--frozen-lockfile`.
- `apps/forge/src/services/overseer/OverseerServer.ts:600-606`: unchanged code; check that `servedEndpointsOf` serves
  each new entry.
- Gaia: `apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts:9` becomes forge's new version; the
  endpoint versions Gaia calls follow from the registry by themselves (`apps/gaia/CLAUDE.md:38-40`).
- Gaia's own: `GAIA_SYSTEM_VERSION` (`apps/gaia/src/shared/constants/GaiaSystemVersions.ts:12`) to its next major, minor
  0, and `MINIMUM_SUPPORTED_GAIA_VERSION` (`:18`) to the same (today 1.1 and 0.0, so 2.0 and 2.0, unless stage 6 raised
  Gaia's major; then one above it); in `GAIA_ENDPOINT_VERSIONS` (`:25-33`), `fleet`, `events` and `commands` one higher
  (the fleet document lost the brain, the command document the brain's kinds; `embed` and the frame left them in stage
  6, WP6.23); the docblock (`:20-24`) says why; `GaiaCompatibilityRegistry.ts`: each changed route introduced in the new
  version, the unversioned-routes entry (`:46-51`) gone; `apps/gaia/src/shared/constants/ContractVersions.ts`:
  `gaiaFleetDocument` and `gaiaCommand` one higher; Gaia's `docs/contracts.md` in the same change. Gaia's server
  stops answering an unversioned route that only that entry kept, unless a caller in this repository uses it
  (`git grep -n "'/api/[a-z]" -- apps/gaia ':!*.spec.*'`); a route kept for such a caller is named in
  `docs/contracts.md` with the caller.
- `apps/forge/docs/reference/overseer-api.md` "Contracts", "System versions", "Versioned paths", "Contract versions",
  "The embed contract" (`:630-867`): the unversioned routes and the integer keys are the current contract, used by
  forge's own CLI (`apps/forge/cli/overseer/OverseerRemote.ts:48`, `:57`, `:81`, `:203`) and by Gaia's reading rule,
  not a compatibility path.
- `apps/forge/CLAUDE.md:93-97` and `apps/gaia/CLAUDE.md:26-45`: name the versions only where they already do.

What to do:
1. Run `cd packages/forge-contracts && bun run versions:raise-minimum 2.0` after setting the current version to 2.0 and
   before raising the minimum: it lists what becomes removable. Remove exactly that, and the code it keeps.
2. Raise the minimum; `ForgeCompatibilityRegistry.spec.ts` must pass with no inconsistency.
3. Do the same for Gaia with `cd apps/gaia && bun run versions:raise-minimum <its new version>`.

Specs: the two registry specs as above; `apps/gaia/src/testing/CheckSupportedForgeVersion.spec.ts` unchanged;
`CommandRoute.controlContract.spec.ts` pins the new `controlVersion` in every answer.

Done when: `cd apps/gaia && bun run check` prints "Gaia supports forge's current version, 2.0." (or the version step 1
set); the root is green.

### WP8.11 Gaia records again

Purpose: every forge answer Gaia mocks is recorded from this repository's forge at its new version. Runs after WP8.10;
beside WP8.12.

Files to change: the recordings under `apps/gaia/src/testing/recordings/darwin/` whose system is `forge`
(`apps/gaia/src/testing/BoundaryRecordings.ts:34-111`): `forge-program`, `forge-program-done`,
`forge-program-refused`, `forge-registry`, `overseer-fetch-supported-forge`, `overseer-fetch-versions`, and the board
recordings stage 6 added; and every spec whose recorded answer changed.

What to do:
1. In `apps/gaia`, with the forge of this checkout:
   `GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record <name>` for each name above.
   The recording runs a scratch forge under a scratch home with the fake agent (`apps/gaia/CLAUDE.md:139-150`); it
   makes no model call and touches no real home.
2. For `overseer-fetch-versions`, also name a forge from before system versions in
   `GAIA_RECORDING_UNVERSIONED_FORGE_PROGRAM`: a scratch clone of this repository at the parent of `6f521908` (the
   commit that gave forge its system versions), placed under the scratch root `ScratchForge.ts` uses, and removed
   afterwards (see Not established).
3. Read each new recording: `GET /api/versions` answers the new current and minimum; the identity's `contracts` has no
   `embed`; the monitor has no `flintBrain`; the registry entry has no `progressHtml`; `POST /api/v1/session-codes` is
   not called; every endpoint path is at the version the registry serves.
4. In `apps/forge`, run `bun run record cli/overseer/routes/` and
   `bun run record src/services/overseer/OverseerServer.ts` if WP8.10 changed what they record.

Specs: `apps/gaia/src/testing/RecordedAnswers.spec.ts` and every spec that plays a forge recording pass on the new
answers; fix a spec only where the forge's answer changed for a reason of this stage.

Done when: `cd apps/gaia && bun run check` lists no forge recording as stamped `authored` and no stale stamp; the
root is green.

### WP8.12 The documents describe a headless forge

Purpose: no human-facing document of forge or Gaia describes the Bridge as a program, the embed machinery, session
codes, `open`, `progress.html` or Flint's brain as present, and forge's wording names an action, not a surface. Runs
after WP8.10; beside WP8.11.

Files to change: `apps/forge/README.md` (screenshots, architecture paragraph `:33`, the images table `:220`);
`apps/forge/docs/reference/overseer-api.md` (whatever earlier packages left), `docs/cli.md`, `docs/glossary.md`,
`docs/operations/running-a-board.md`, `docs/operations/getting-started.md`, `docs/operations/runbook.md`,
`docs/development/contributing.md`, `docs/development/architecture-tests-and-testing.md`, `docs/reference/refusals.md`,
`docs/concepts/overview.md`, `docs/concepts/ticket-lifecycle.md`, `docs/README.md`, `docs/backlog.md`;
`apps/forge/resources/prompts/PipelineAgentPrompt.md` (`:3`, `:34`) and `PipelineAgentDesign.md` (`:7`) (stage 7's
WP7.2 rewords them; check), `resources/templates/PipelineAgentBrief.md:6`, `Reference.md:249`,
`skills/agent-po/SKILL.md:147`, `skills/agent-progress-orchestrate/SKILL.md:75`, which tell User to act "in the
Bridge"; wording in `apps/forge/src` and `apps/forge/cli` that names the Bridge
(`git grep -n -w "Bridge" -- apps/forge/src apps/forge/cli ':!*.spec.ts'`); `apps/forge/CLAUDE.md:4` (the opening
line), `:46-48` (the component list), `:71` (the tracker model is DOM-safe for the Bridge's project), `:90-92` (a
sentence names "the Bridge control"), `:404` (no Bridge control for an entity move), `:419` (the Bridge reads rows as
bars); Gaia's `docs/architecture.md`, `docs/forge-requirements.md`, `docs/backlog.md`;
`apps/forge/architecture/ComponentNames.spec.ts`.

What to do:
1. A sentence an API, a monitor or an agent shows names a neutral action and no surface, since forge names no client:
   replace "the Bridge control" and "in the Bridge" by the action ("answer the question", "ready the ticket"). The rule
   in `apps/forge/CLAUDE.md:90-92` becomes: "It names a neutral action, such as 'update the board'."
2. New system text (the rule, the installed texts) is written in ASD-STE100 (`apps/forge/CLAUDE.md:293-294`); human
   documentation is not.
3. Leave `apps/forge/docs/research/` as written: it records findings at a date.
4. Wrap prose at 120 columns; `architecture/ProseWrap.spec.ts` holds the files it lists.
5. `apps/forge/architecture/ComponentNames.spec.ts`: add `'Bridge'` and `'bridge/'` to `RETIRED_NAMES` (`:28-63`) with a planted
   case each, and `'docs/research/'` to `UNSCANNED_FOLDERS` (`:21`). The architecture test matches substrings and scans forge and
   the packages it declares; first rename every identifier that holds the word (`git grep -n "Bridge" -- apps/forge
   packages/forge-contracts packages/system-versions`), each new name checked against the retired names.

Specs: `cli/ReferenceCopies.spec.ts`, `architecture/ProseWrap.spec.ts`, `cli/HelpText.spec.ts` pass; `ComponentNames.spec.ts`
catches a planted `Bridge` and `bridge/` and passes without them.

Done when: `git grep -n -w "Bridge" -- apps/forge ':!apps/forge/docs/research'` prints nothing; this prints nothing:

```bash
git grep -n -i "flint.brain\|session code\|frame-ancestor\|progress\.html\|forge open" \
  -- apps/forge/docs apps/forge/README.md apps/gaia/docs ':!apps/forge/docs/research'
```

and the root is green.

### WP8.13 Fold `design-system`, `flint` and `brand` into Gaia's page as libraries

Purpose: decision 52. With the Bridge deleted, Gaia is the only consumer of the three packages (N9). Each becomes a
top-level folder of `apps/gaia/page/lib/`, with no `package.json`, behind one interface file at its root,
independent of the other two and of Gaia's features, with its own specs and description. Code outside a library
imports only its interface file; inside a library a file imports exactly what it needs, with no barrel. An architecture test holds
this. Gaia's own components leave `page/design-system/` for `page/components/`, so `design-system` names the library
alone. Runs after WP8.2 and WP8.5; beside WP8.6.

Before starting: `git grep -l -E "from '(design-system|flint|brand)(/|')" -- apps packages ':!packages/design-system'
':!packages/flint' ':!packages/brand'` names only files under `apps/gaia/`, and `apps/forge/package.json` declares
none of the three. Otherwise stop and report.

Files to move (`git mv`, in this order, so two folders never share a path):
- `apps/gaia/page/design-system/` to `apps/gaia/page/components/` (Gaia's mark, the brand bar, the list card, the
  refusal and the other parts the library does not have).
- `packages/design-system/` to `apps/gaia/page/lib/design-system/`; `packages/flint/` to `apps/gaia/page/lib/flint/`;
  `packages/brand/` to `apps/gaia/page/lib/brand/`.

Files to delete: each library's `package.json`.

Files to create:
- `apps/gaia/page/lib/design-system/DesignSystemInterface.ts`: names, one by one, every module export that today's
  `packages/design-system/package.json` `exports` map names (the components, `StateTone`, `ThemeChoice`, the font
  loader, `Spacing`, `Dismissal`, `ReorderIndexUtil`, `RovingFocusUtil`, `ThemeCycleUtil`), types as `export type`.
  The two stylesheets of the map, `styles/design-system.css` and `styles/tokens.css`, and the font files stay files
  that a page links by path.
- `apps/gaia/page/lib/flint/FlintInterface.ts`: what `packages/flint/package.json` exports: `createFlint` and its
  types (`CreateFlint.ts`), `SpriteHabitat.ts`, `react/Flint.tsx`, `react/UseFlintHabitat.ts`,
  `react/UseFlintPerform.ts`.
- `apps/gaia/page/lib/brand/BrandInterface.ts`: `ForgeMark` (`marks/ForgeMark.tsx`) and `constants/MarkGeometry.ts`;
  `styles/brand.css` stays a linked file.
- `apps/gaia/page/lib/brand/testing/RunDomSpecs.ts`, the runner the other two libraries have, in place of brand's
  inline `test:dom` line, so Gaia runs every library's DOM specs alike.
- `apps/gaia/architecture/LibraryBoundaries.spec.ts`, the architecture test: (1) each folder of `page/lib/` has exactly one interface file
  `<Name>Interface.ts` at its root, a `README.md`, at least one spec, and no `package.json`; (2) a module of Gaia
  outside `page/lib/<name>/` (`page/`, `src/`, `resources/`) that imports a file under it imports exactly its interface
  file, and an HTML or CSS link into a library names only the files that library lists as linkable (design-system's
  two stylesheets and its fonts, brand's stylesheet); (3) a module inside `page/lib/<name>/` imports nothing outside
  that folder: no other library, no Gaia file; (4) inside a library only the interface file re-exports
  (`export … from`), and no file of a library imports its own interface file. The scan proves it read every library,
  and each form is planted once and caught.

Files to change:
- `apps/gaia/package.json`: drop the dependencies `design-system`, `flint` and `brand`; `typecheck` adds
  `tsc -p page/lib/<name>/tsconfig.json && tsc -p page/lib/<name>/tsconfig.spec.json` for each library; `lint` and
  `lint:fix` run each library's ESLint from its own folder, with its own `eslint.config.js`; `test:dom` runs each
  library's `testing/RunDomSpecs.ts` beside the board's runner of stage 6; `storybook:design-system` and
  `storybook:brand` run Storybook with `--config-dir page/lib/<name>/.storybook`. Run `bun install` at the root once,
  then `--frozen-lockfile`.
- `apps/gaia/eslint.config.js`: ignores `page/lib/**`, which each library lints with its own rules.
- Each library's `eslint.config.js`: `MANIFEST_FOLDERS` names Gaia's folder and the repository root, since the library
  has no manifest; the cache locations point into Gaia's `node_modules/.cache/`.
- Each library's `tsconfig.json` and `tsconfig.spec.json`: `tsBuildInfoFile` under Gaia's
  `node_modules/.cache/typecheck/`; the include lists stay the library's own folder (`ProjectIncludeList.spec.ts`
  holds it).
- `apps/gaia/page/tsconfig.json` and `page/tsconfig.spec.json`: exclude `./lib/**`; each library compiles under its own
  two projects, and the page's program still checks every interface file it imports.
- Every Gaia importer of the packages (`page/board/`, `page/views/`, `page/shell/`, `page/components/`,
  `page/Main.tsx`): each `from 'design-system/<entry>'`, `from 'flint'`, `from 'flint/<entry>'` and
  `from 'brand/<entry>'` becomes one import per file from the library's interface file by its relative path. Do it
  with a script in the session's scratchpad, then `bun run lint:fix`.
- `apps/gaia/page/index.html:8-9`: link `./lib/design-system/styles/design-system.css` and
  `./lib/brand/styles/brand.css`; `apps/gaia/resources/page/loading.html:8`, `:21`, `:29`: the tokens and fonts by
  their path under `page/lib/design-system/`.
- Specs that read a package's `exports` map read the interface file's exports: `page/testing/ReactElementTree.ts:27-44`
  (every component the design-system library exports stays folded); `page/DesignSystemPackage.spec.tsx` becomes
  `page/DesignSystemLibrary.spec.tsx`; design-system's `StoryCoverage.spec.ts` (a story per export); brand's
  `PackageExports.spec.ts` becomes `InterfaceExports.spec.ts`; `architecture/WorkspaceDependencies.spec.ts` (the three are no
  workspace packages: a bare `design-system/…` specifier is a finding).
- Gaia's architecture tests that walk `page/` and would now read the libraries: `architecture/StyleContract.spec.ts` (Gaia's stylesheets
  style the classes of `page/components/` and Gaia's views, never a library class), `architecture/PageImportDirection.spec.ts`
  (`components` takes the place of `design-system` in `FORBIDDEN_IMPORTS`),
  `src/features/page-server/routes/PageFilesRoute.spec.ts` (the fonts come from `page/lib/design-system/fonts/`). A
  library's own rules govern its folder; a Gaia architecture test skips `page/lib/` only where a library spec holds the same
  concern.
- Each library's `README.md` and design-system's `CONSTITUTION.md`: a library of Gaia's page, reached through its
  interface file, its tooling run by Gaia's scripts; no `package.json`, `exports` map or workspace in the text. The
  libraries stay free of host words (`architecture/PackageIsolation.spec.ts`'s `HOST_WORDS`).
- `.claude/rules/design-system.md`: `paths` is `apps/gaia/page/lib/design-system/**`; the text says the library, its
  interface file, `LibraryBoundaries.spec.ts`, the two projects Gaia's typecheck runs, `bun run storybook:design-system`
  in `apps/gaia/`, the DOM runner, and the board's state-tone util at the path stage 6 gave it.
- `.claude/rules/flint.md`: `paths` is `apps/gaia/page/lib/flint/**`; every `packages/flint/` path follows; the
  dependency sentence becomes "Gaia's page reaches Flint only through `FlintInterface.ts`".
- Root `CLAUDE.md:13-28`: the folder table's `packages/<name>/` row names `forge-contracts` and `system-versions`;
  design-system's `CONSTITUTION.md` is the one constitution here and governs `apps/gaia/page/lib/design-system/`;
  forge's tracker reach is `/packages/forge-contracts`, `/packages/system-versions`, `/package.json`, `/bun.lock`,
  `/turbo.json`; Gaia's is `/packages/system-versions`, `/package.json`, `/bun.lock`, `/turbo.json`.
- `apps/gaia/CLAUDE.md`: rules 10 and 11 (`:60-91`) say the libraries under `page/lib/`, reached through their interface
  files, and `page/components/` for Gaia's own parts; `:15-17` and `:28` (what is forge's) and the dependency paragraph
  (`:95-96`) name only `forge-contracts` and `system-versions`; the map (`:111-112`) gains `page/lib/` and
  `page/components/`.
- Root `README.md:127-129`; `docs/monorepo/design.md`, the layout (`:39-42`) and the package sections (`:98-116`).

What to do:
1. Move, delete the manifests, write the interface files and the brand runner.
2. Change Gaia's manifest, configurations and links; `bun install`; `cd apps/gaia && bun run typecheck`.
3. Rewrite the importers by script; `bun run lint:fix`; `bun run lint`.
4. Write the architecture test with its planted cases, then change the specs that read an `exports` map.
5. Rules and descriptions last.

Specs: `LibraryBoundaries.spec.ts` with its planted cases; every library spec passes under Gaia's `bun test`
(`architecture/PackageIsolation.spec.ts`, `ProjectIncludeList.spec.ts`, `LintRules.spec.ts`, `CompositionLayers.spec.ts`,
`StoryCoverage.spec.ts`, `AnimationModules.spec.ts` and the rest) and every library DOM spec under Gaia's
`bun run test:dom`; `ReactElementTree`'s spec still folds every library component.

Done when: `git ls-files packages/design-system packages/flint packages/brand apps/gaia/page/design-system` prints
nothing; `git grep -n -E "from '(design-system|flint|brand)(/|')" -- apps` prints nothing; `ls packages` lists
`forge-contracts` and `system-versions`; in `apps/gaia`, `bun run typecheck`, `bun run lint`, `bun test`,
`bun run test:dom` and `bun run check` pass; the root is green.

### WP9.1 Measure the rename and prepare the scripts

Purpose: know exactly what stage 9 changes, and have the rename and the check as scripts, before any file changes.
Changes no tracked file. Runs alone.

What to do:
1. Create the worktree `.claude/worktrees/stage-9-rename` from the commit that ends stage 8.
2. Measure with the commands below and write the numbers into the session's notes (not into the repository). The
   numbers at `b4174bd9`, before stages 2 to 8, are given for comparison. The repository-wide counts include this
   refactoring's own plan under `docs/monorepo/` (most of the 17 `docs/` files), which the rename leaves unchanged:

   | Kind | Command (from the repository root) | At `b4174bd9` |
   | --- | --- | --- |
   | Files naming it in content | `git grep -il "oversee" \| wc -l` | 909 (forge 737, Gaia 134, packages 17, `docs/` 17, `.claude/rules/` 2, root `CLAUDE.md` and `README.md` 1 each) |
   | Occurrences of the substring | `git grep -oi "oversee" \| wc -l` | 10,468 (forge 7,071, Gaia 1,961, packages 41, `docs/` 1,363, `.claude/` 22, root 10) |
   | By case | `git grep -o "Overseer"`, `"overseer"`, `"OVERSEER"`, `git grep -ow "oversee"` | 5,539; 3,947; 410; 553 |
   | Paths naming it | `git ls-files \| grep -i oversee` | 298 paths: folders `apps/forge/src/services/overseer/` (204 files), `apps/forge/cli/overseer/` (48), `apps/forge/docs/figures/overseer-api/` (12); 34 other paths |
   | Code (`.ts`, `.tsx`, `.js`) | `git grep -ohE '[A-Za-z0-9_$-]*([Oo]versee\|OVERSEE)[A-Za-z0-9_$-]*' -- '*.ts' '*.tsx' '*.js'` | 789 files, 7,133 tokens: bare words 3,278; compound identifiers 3,028 (210 distinct); SCREAMING_CASE 385 (57 distinct); kebab-case wire values 442 (53 distinct) |
   | JSON | `git grep -il oversee -- '*.json'` | 27 files, 297 occurrences (recordings, frozen tables, fixtures, two `package.json`) |
   | Stored keys | `git grep -ow "overseerState\|overseerFirstStartedAt"` | `overseerState` 124, `overseerFirstStartedAt` 26 (`overseerOnly` goes in WP8.9) |
   | Log record kinds | `git grep -o "overseer-started\|overseer-stopped\|overseer-set\|overseer-state\|overseer-stop-reason"` | 28, 24, 25, 7, 8 |
   | Data folder names | `git grep -o "overseer\.log"`; `git grep -o "<data>/overseer"` | 38 in 19 files; 23 in 13 files |
   | Command kinds | `git grep -o "overseer-pause\|overseer-resume\|overseer-stop\|overseer-restart\|pause-overseer"` | 86, 32, 79, 42, 11 |
   | Decision asker | `git grep -o "askedBy: 'overseer'"` | 29 in 20 files |
   | Registry key Gaia reads | written at `apps/forge/src/services/tracker/MonitorRegistration.ts:62`, read at `apps/gaia/src/adapters/forge-registry/utils/RegistryMapUtil.ts:34`; `git grep -n "lastCommand"` | 1 writer, 1 reader; `lastCommand` values in 36 files |
   | Login item label | `git grep -o "com\.forge\.overseer"`; `git grep -o -- "--login-overseer"` | 17 in 8 files; 24 |
   | The verb | `git grep -ow "oversee"` | 553 |
   | Gaia's names | `git grep -o "overseer-fetch"`; `git grep -o "RegisteredOverseer"` | 79 in 22 files; 12 in 6 files |
   | Installed surface | `git grep -c -i oversee -- apps/forge/resources/templates apps/forge/skills apps/forge/cli/FrozenInstalledSurface.json apps/forge/cli/adoption/FrozenClaudeInstall.json` | templates 5 files (47), skills 2 (20), frozen surface 46 lines, frozen install 12 lines |
   | Documents | `git grep -c -i oversee -- 'apps/forge/docs' 'apps/forge/README.md' 'apps/gaia/docs'` | forge Markdown 18 files (1,307), forge HTML and SVG 4 (93), Gaia 4 (31) |
   | Rules | `git grep -c -i oversee -- CLAUDE.md apps/forge/CLAUDE.md apps/gaia/CLAUDE.md .claude/rules` | 5 files, 68 |
   | Prompts | `git grep -c -i oversee -- apps/forge/resources/prompts` | 20 files, 45 |
   | Other kinds | `git grep -il oversee \| grep -vE '\.(ts\|tsx\|js\|json\|md)$'` | css 3, html 4, jsonl 6, ps1 1, sh 4, svg 4 |
   | Articles and plurals | `git grep -o "[Aa]n Overseer"`, `"[Tt]he Overseer"`, `" Overseers"`, `"TheOverseer"`, `"THE_OVERSEER"`, `"the-overseer"` | 304; 2,003; 25; 42; 24; 7 |

3. Also run `git grep -n -i "watcher"` (N7). Any Watcher name that survived stage 2 is renamed in this stage to its
   Talos form, and listed in the same retired-name change (WP9.5).
4. Write two scripts in the session's scratchpad, never in the repository:
   - `rename.ts`: takes the replacement table of Interfaces introduced, in its order; moves paths with `git mv`
     (folders first, then file names), then rewrites the content of every tracked text file outside the exclusions,
     applying the rules in order; prints each file it changed and the count per rule.
   - `check.ts`: prints every remaining line of `git grep -n -i -E "oversee"` outside the exclusions, every tracked or
     untracked path naming it (`git ls-files` and `git ls-files --others --exclude-standard`), and exits 1 when it
     prints anything.
5. Exclusions, by exact path: `docs/monorepo/**`; `apps/forge/docs/research/**`;
   `apps/forge/cli/FrozenInstalledSurface.json` (its older keys are records; WP9.4 adds the new key);
   `apps/forge/src/lib/claude-code/testing/fixtures/*.jsonl` (vendor output); the one line of
   `apps/forge/src/shared/constants/ProductNames.ts` holding `com.agent-progress.overseer` (the released program's
   label); `apps/forge/architecture/ComponentNames.spec.ts` (WP9.5 edits it by hand); binary files.

Done when: the scripts run in dry mode in the worktree and list counts within a few percent of the measured ones;
`git status` in the worktree shows no change.

### WP9.6 The lifecycle verbs move to the top level

Purpose: decisions 41 and 42. The `oversee` verb and its subcommands go. `forge start` starts Hephaestus, and the other
lifecycle verbs sit beside it at the top level; no verb, flag or login-item line names the component. Runs after WP9.1
and before WP9.2, in the stage 9 worktree: it changes code under today's names (`cli/overseer/`), which WP9.2 then
renames, so the rename script finds no verb left to rename.

The verb set, decided from `apps/forge/cli/overseer/OverseerCommand.ts`, `StartCommand.ts`, `StopCommand.ts`,
`apps/forge/cli/tracking/status/StatusCommand.ts` and the three autostart adapters:

| Today | After | Why |
| --- | --- | --- |
| `oversee [--port <n>] [--detach] [--repository <path>] [--json]`, serving in the foreground | `start --foreground [--port <n>] [--repository <path>] [--started-by user\|login-item]` | The serving process: the detached child and the Linux login item run it. It refuses a live one (`overseer-already-running`) |
| `oversee --detach`, and `start [--repository <path>] [--port <n>] [--json]` | `start [--repository <path>] [--port <n>] [--started-by user\|login-item] [--json]` | `start` already starts detached, returns once the API answers and starts nothing with one live; `--detach` has nothing left to say |
| `oversee --successor-of <generation> [--port <n>]` | `start --successor-of <generation> [--port <n>]` | Serves in the foreground; only the live process starts it during a restart; it refuses `--started-by` |
| `oversee stop [--now] [--json]`, `stop [--now] [--json]` | `stop [--now] [--json]` | `stop` exists |
| `oversee restart [--now] [--json]` | `restart [--now] [--json]` | |
| `oversee pause [--json]` | `pause [--json]` | |
| `oversee resume [--json]` (stage 3 leaves it) | `unpause [--json]` | Decision 41; the control kind `overseer-resume` becomes `overseer-unpause` here, and WP9.2 makes it `hephaestus-unpause` |
| `oversee status [--json]` beside the board's `status [--json] [--full]` | `status [--json] [--full]` | One status: it prints the process facts of `oversee status` (the Baton, the URL, the runtime state, paused or not, the code version on disk against the live one, presence and a crash with its log's path) above the board; `--json` carries them under the key `overseer`, which WP9.2 renames |
| `crash-log [<number>] [--json]` (stage 3, `cli/crash-log/`) | unchanged | Already a top-level verb; `forge crash` would read as an order |
| `setup --login-overseer <repository> [--label <label>]` | `setup --login-item <repository> [--label <label>]` | A flag the user types names no component |
| macOS login item `start --started-by login-item` (stage 3) | unchanged | launchd runs it once at login |
| Linux login item `oversee [--started-by login-item]` | `start --foreground --started-by login-item` | systemd keeps the process (`Type=simple`) |
| Windows login item `start --repository <path> --started-by login-item` (stage 3) | unchanged | A Run value has no working directory |
| The detached child `<program> oversee <run arguments>` (`OverseerRemote.ts:175`) | `<program> start --foreground <run arguments>` | |
| Registry `lastCommand: 'oversee'` | `lastCommand: 'start'` | The serving process registers under the verb that runs it |

`start`, `restart`, `pause` and `unpause` check the install version, as `oversee` start, restart, pause and resume do
(`OverseerCommand.ts:1-3`); `status`, `stop` and `crash-log` do not, so a forge whose install changed can still be
inspected and stopped. Each verb keeps the rule under a job that its `oversee` form has
(`apps/forge/cli/constants/JobVerbs.ts:22`, `:89-92`).

Files to change:
- `apps/forge/cli/CommandTable.ts`: `oversee` goes; `restart`, `pause` and `unpause` join (`crash-log` is stage 3's).
- `apps/forge/cli/overseer/OverseerCommand.ts`: split by verb into `RestartCommand.ts`, `PauseCommand.ts` and
  `UnpauseCommand.ts`; the foreground and successor forms join `StartCommand.ts`; the reading of
  `oversee status` becomes `OverseerStatusReading.ts`, which `apps/forge/cli/tracking/status/StatusCommand.ts` and
  `StatusText.ts` print; then delete `OverseerCommand.ts`. Its specs (`OverseerCommand.spec.ts`,
  `OverseerCommand.integration.spec.ts`) split the same way.
- `apps/forge/cli/Main.ts:29`, `:38`; `apps/forge/cli/HelpText.ts` (`:98-110`, `:619-664`): one block per verb;
  `apps/forge/cli/constants/JobVerbs.ts`; `apps/forge/cli/HatchUnderJob.spec.ts`.
- `apps/forge/cli/overseer/OverseerRemote.ts:175`; `DetachedOverseerStart.ts` (header); the registration's command.
- `apps/forge/cli/setup/DarwinAutostart.ts:18`, `:48`, `LinuxAutostart.ts:21`, `WindowsAutostart.ts:59` and their
  specs (`Autostart.contract.spec.ts:75` expects `start`); `apps/forge/cli/setup/Setup.ts:16`, `:34-39`.
- The control kind `overseer-resume`: `apps/forge/src/shared/@types/ControlCommand.ts:139`,
  `packages/forge-contracts/@types/ForgeControlCommand.ts:11`,
  `apps/forge/src/shared/constants/OverseerApiContracts.ts`, `ControlService`, Gaia's
  `src/features/forge-control/ForgeControl.ts` and its page command document.
- Every sentence that names an `oversee` command line: `apps/forge/cli/overseer/OverseerWording.ts`,
  `apps/forge/src/adapters/utils/OperationRefusalWordingUtil.ts`, stage 3's crash notice
  (`git grep -n "oversee" -- apps/forge/src apps/forge/cli ':!*.spec.ts'`).
- Installed text: `resources/templates/Reference.md:307-308`, `SessionInstructions.md:5`, `:10`,
  `skills/agent-progress-orchestrate/SKILL.md:33`, `:40`, and every other line
  `git grep -n -w "oversee" -- apps/forge/resources apps/forge/skills` lists.
- Gaia: `apps/gaia/src/adapters/page-api/ForgeSentenceUtil.ts:46` (`'oversee'` goes); `apps/gaia/CLAUDE.md:49`, rule 5:
  "Gaia starts a dormant forge with `forge start --json`."
- `apps/forge/docs/cli.md` and the other documents: WP9.3 rewrites their command lines with the rules of the
  replacement table.

What to do:
1. Build `start`'s three forms and the new verbs on the code `OverseerCommand.ts` holds; delete the verb.
2. Merge the status reading into `status`.
3. Change the login-item lines, the setup flag, the detached child and the registration's command.
4. Rename the control kind, then follow the compiler in `apps/forge`, `packages/forge-contracts` and `apps/gaia`.
5. Change the sentences and the installed text; the frozen key of WP9.4 records the new verbs and flags.

Specs:
- `CommandTable.spec.ts` and `HelpText.spec.ts`: the table and the help agree on the new set; `oversee` is refused at
  exit 1 as an unknown command, by the table's generic case.
- `StartCommand.spec.ts`: `--foreground` serves on a scratch board and refuses a live one; `--successor-of` parses
  and refuses `--started-by`; `--detach` is refused as an unknown option; the detached start with one live starts
  nothing.
- `RestartCommand.spec.ts`, `PauseCommand.spec.ts`, `UnpauseCommand.spec.ts`: the cases of
  `OverseerCommand.spec.ts` for each subcommand, moved.
- `StatusCommand.spec.ts`: on a scratch board with a crashed presence, `status` prints the crash and its log's path
  above the board, and `--json` carries the process facts.
- The autostart specs: each platform's line as in the table; `Setup.spec.ts`: `--login-item` writes the item,
  `--login-overseer` is refused as an unknown option.
- `CommandRoute.controlContract.spec.ts`: `overseer-unpause` is a kind, `overseer-resume` answers 400
  `malformed-body`.

Done when: this prints nothing:

```bash
git grep -n -w "oversee" -- apps/forge/cli apps/forge/src apps/forge/resources apps/forge/skills apps/gaia/src \
  apps/gaia/page
```

In `apps/forge` and `apps/gaia`, `bun run typecheck`, `bun run lint` and `bun test` pass. Nothing is
committed: the stage lands in WP9.5.

### WP9.2 Rename paths and code

Purpose: every path, identifier and wire value says Hephaestus, and the code is green. Runs alone, after WP9.6, in the
same worktree.

Files: every tracked file outside the exclusions whose path or code content names it: `apps/forge`, `apps/gaia`,
`packages/forge-contracts` (and any other package that names it), root `package.json` and `turbo.json` (none today).
New file names: `apps/forge/src/services/hephaestus/`, `apps/forge/cli/hephaestus/`, `Hephaestus*.ts` in place of
`Overseer*.ts`, `apps/forge/cli/testing/HephaestusTicketMoves.ts`,
`apps/forge/src/testing/RecordedHephaestusFetch.ts` and its siblings,
`apps/forge/src/testing/recordings/darwin/src__services__hephaestus__*.json`, `cli__hephaestus__routes.json`,
`packages/forge-contracts/constants/HephaestusContractVersions.ts` (export
`forge-contracts/HephaestusContractVersions`), `apps/gaia/src/lib/forge-client/HephaestusFetch*.ts`,
`apps/gaia/src/adapters/forge-api/HephaestusTokenFile.ts`,
`apps/gaia/src/testing/recordings/darwin/hephaestus-fetch-*.json`; a name follows its main export.

What to do:
1. Run `rename.ts` on code only: `*.ts`, `*.tsx`, `*.js`, `*.json` (outside the exclusions), `*.css`, `*.html`, `*.sh`,
   `*.ps1`, `*.svg` inside `apps/` and `packages/`, `tsconfig*.json`, `eslint.config.js`, `package.json` exports.
2. Raise once each stored format whose key or value the rename changed, to its next unused number:
   `CURRENT_PROGRESS_FILE_VERSION` (`apps/forge/src/adapters/progress/constants/ProgressFileVersions.ts:5`),
   `MONITOR_REGISTRY_FILES.SUPPORTED_VERSION` (`MonitorRegistryFiles.ts:6`) with Gaia's
   `CONTRACT_VERSIONS.forgeRegistry` (`ContractVersions.ts:14`), and each format stages 2 and 3 introduced whose keys
   or values name the Overseer (`git grep -n "FORMAT_VERSION\|SUPPORTED_VERSION" -- apps/forge/src` lists them; read
   each). `pipeline.json` is not raised: it names no Overseer after WP8.9. An older file is refused with
   `OLDER_FORMAT_ADVICE` (`apps/forge/CLAUDE.md:101-103`).
3. At the root: `bun run lint:fix`, then `bun run typecheck`, then `bun run lint`. Fix by hand what lint:fix leaves:
   code lines over 180 columns and comment lines over 155 (each rename adds two or three characters), and any aligned
   column the fixer does not move.
4. Fix the architecture tests whose expectations name paths, without adding the retired names yet:
   `apps/forge/architecture/ComponentNames.spec.ts:77-86` expects `src/services/hephaestus/` and keeps `CLAUDE.md` containing
   `Overseer` until WP9.3 (then `Hephaestus`); the planted case at `:97` uses `src/services/hephaestus/Example.ts`;
   `architecture/ClientNames.spec.ts:45` the renamed reference path; `architecture/ImportDirection.spec.ts:51`, `:80`, `:97`, `:121`
   the layer `hephaestus-service`; `architecture/PlatformBoundary.spec.ts`, `architecture/RealSystemSpecs.spec.ts`,
   `architecture/TestFileConventions.spec.ts:130-146` (the planted start uses `start --foreground`);
   `src/testing/BoundarySpecs.ts`;
   `cli/HatchUnderJob.spec.ts`, `cli/ControlContract.spec.ts`, `cli/CommandTable.spec.ts`, `cli/HelpText.flags.spec.ts`.
5. Retake each frozen table whose subject the rename changed, by the retake procedure its spec states, never by hand:
   `apps/forge/cli/hephaestus/FrozenPosixChildSpawn.json` (its key `overseer`); `FrozenRootTrackerGitCalls.json` and
   `FrozenFolderTrackerGitCalls.json` (moved with their folder; neither names it today, so a retake shows no change
   unless a git call's path does); `apps/forge/src/services/hephaestus/FrozenDarwinWorkerProfiles.json` (it does not
   name it today); `apps/forge/cli/PlatformPorts.frozen.spec.ts` (names it twice) with `cli/FrozenPlatformPorts.json`;
   `apps/forge/cli/adoption/FrozenClaudeInstall.json` after WP9.3.
6. Recordings: rename the files with the module paths, and rename forge's own values inside them (paths, log kinds,
   refusal codes, document keys) with the script so the default suite stays green; WP9.4 records them again and the
   diff proves the script.

Specs: every changed spec passes; no spec is deleted to make the rename pass.

Done when: `bun run typecheck` and `bun run lint` pass at the root and in each workspace;
`check.ts` lists only Markdown, prose comments the script leaves for WP9.3, and the exclusions;
`bun run verify` at the root is green.

### WP9.3 Rename prose

Purpose: documents, rules, prompts, templates, skills and comments say Hephaestus in readable English, and every
command line in them names the verbs of WP9.6. Runs alone, after WP9.2, in the same worktree.

Files: `CLAUDE.md`, `apps/forge/CLAUDE.md` (component list `:46-48` reads "Hephaestus, Talos, Pass, Playbook, Hatch,
Customs, Airlock, Assistant, Baton, Regrouping, Bouncer"; `:59` the service chain ends in `hephaestus`),
`apps/gaia/CLAUDE.md`, `.claude/rules/*.md`, `apps/forge/README.md`, `apps/forge/docs/**` but `docs/research/` (with
`docs/reference/hephaestus-api.md` renamed in WP9.2), `apps/gaia/docs/**`, `apps/forge/resources/prompts/**`,
`resources/templates/**`, `skills/**`, the libraries' `README.md` and `CONSTITUTION.md` under `apps/gaia/page/lib/`,
`packages/*/README.md`, and every comment in code.

What to do:
1. Run `rename.ts` on prose with its command-line rules first, then its phrase rules (articles, plurals, "the
   Overseer"), then the word rules.
2. Read every changed sentence of the rules files and the installed texts; read a sample of 50 changed sentences
   across the documents. Fix grammar the rules could not see ("a Hephaestus", "Hephaestus's"), and any `oversees` or
   `overseeing` the word rules left.
3. Rewrap every changed Markdown paragraph at 120 columns; `architecture/ProseWrap.spec.ts` holds the files it lists, and the
   rename lengthens lines.
4. Figures: `apps/forge/docs/figures/hephaestus-api/` moved in WP9.2. Open every PNG under `apps/forge/docs/figures/`
   and `apps/forge/docs/images/` and read its pixels. A diagram of `docs/images/` with an SVG source is edited in its
   SVG and rendered again with `.readme-graphics/render-diagrams.py`. A figure with no source whose pixels say
   "Overseer" is drawn again as an SVG kept beside its PNG, rendered the same way; one that cannot be drawn again
   faithfully is deleted with its reference, and its document says in text what it showed.

Specs: `architecture/ProseWrap.spec.ts`, `cli/ReferenceCopies.spec.ts`, `cli/HelpText.spec.ts` pass.

Done when: `check.ts` lists only the exclusions; the root is green.

### WP9.4 Versions, the installed surface and the recordings

Purpose: the renamed wire values are a major change, so forge and Gaia meet at forge's next major, the install version
rises once, and every recording is taken again from the renamed forge. Runs alone, after WP9.3, in the same worktree.

What to do:
1. Forge 3.0 (one major above stage 8's): `ForgeSystemVersions.ts` `current` and `minimumSupported`; in the registry,
   every endpoint whose document or body names a renamed key or kind (`summary`: key `hephaestus`; `monitor` and
   `monitor/events`: key `hephaestus`; `commands`: the four kinds; the board state and event documents if they carry
   the Overseer's facts) gets its next version, introduced in 3.0; the entries below 3.0 go
   (`bun run versions:raise-minimum 3.0` lists them). `forge-contracts` `version` 3.0.0. Contract integers:
   `summary`, `monitor` and `control` each rise by one.
2. Gaia: `SUPPORTED_FORGE_VERSION` 3.0; `GAIA_SYSTEM_VERSION` and the minimum to Gaia's next major, minor 0, since the
   fleet document's `overseerStartedAt` (`apps/gaia/page/@types/FleetDocument.ts:176`) became `hephaestusStartedAt`;
   `fleet` and `events` endpoint versions and `gaiaFleetDocument` rise by one; Gaia's `docs/contracts.md` follows.
3. Install: raise `INSTALL_VERSION` (`apps/forge/cli/constants/InstallVersion.ts:1`) by one; add its key to
   `FrozenInstalledSurface.json` with the verbs and flags of WP9.6, never changing an older key; retake
   `FrozenClaudeInstall.json`; `bun run record src/services/hephaestus/InstallChangeWatch.ts`.
4. Record forge again: `bun run record <boundary>` in `apps/forge` for each boundary whose recording file the rename
   moved (`src/services/overseer/OverseerServer.ts` is now `src/services/hephaestus/HephaestusServer.ts`,
   `cli/hephaestus/routes/`, `GpgDirectories.ts`, `InstallChangeWatch.ts`). `git diff` of each recording against the
   script's version must show only drawn values and the new versions; any other difference is a value the script
   missed or changed wrongly: fix the code, not the recording.
5. Record Gaia again, as in WP8.11, under the new recording names (`hephaestus-fetch-supported-forge`,
   `hephaestus-fetch-versions`, `hephaestus-fetch-other-programs`) and `forge-registry`, `forge-program*`.

Specs: the registry specs of both systems; `CommandRoute.controlContract.spec.ts` pins the renamed kinds and the new
`controlVersion`; `apps/gaia/src/adapters/forge-registry/RegistryFile.spec.ts` reads the registry at its new version
with the key `hephaestus` and refuses the older version.

Done when: in `apps/gaia`, `bun run check` prints "Gaia supports forge's current version, 3.0." and lists no stale
stamp; in `apps/forge`, `bun run check` lists no stale stamp; the root is green.

### WP9.5 Forbid the old names, check, commit

Purpose: the architecture tests keep the old names out, the check proves none is left, and the stage lands as one commit. Runs
alone, after WP9.4.

What to do:
1. `apps/forge/architecture/ComponentNames.spec.ts`: add `'Oversee'`, `'oversee'` and `'OVERSEE'` to `RETIRED_NAMES` (`:28-63`);
   each substring also covers `Overseer`, `overseer` and `OVERSEER`. Add `'watcher-lost'`, which the rename turned into
   `talos-lost` (N7), and change the planted case that holds `watcher-lost` as allowed (`ComponentNames.spec.ts:97`) to
   plant it as caught. `ALLOWED_RETIRED_NAMES` (`:66`) gets exactly these entries, each a file the architecture test scans:
   `cli/FrozenInstalledSurface.json: oversee`, `src/shared/constants/ProductNames.ts: oversee`, and one entry per vendor
   fixture `src/lib/claude-code/testing/fixtures/<name>.jsonl: oversee` that names it. The scan proof (`:75-82`) expects
   `CLAUDE.md` to contain `Hephaestus`. Planted cases (`:89-94`): a path `src/services/overseer/Example.ts`, an
   identifier `OverseerServer`, a wire value `'overseer-stop'`, a constant `OVERSEER_PORT_FIRST` and a command line
   `['oversee', 'stop']` are each caught; the same text with `hephaestus` or `stop` passes.
2. The architecture test scans forge and the packages it declares, not Gaia and not the root. `check.ts` covers them; run it.
3. Run the whole-stage verification below.
4. Commit once: one plain subject line such as "Rename the Overseer to Hephaestus and move its verbs to the top
   level", no body, no AI attribution.

Done when: `check.ts` exits 0; `bun install --frozen-lockfile` and `bun run verify` at the root exit 0; `git log -1
--stat` shows one commit holding every renamed path.

## Interfaces introduced

### Stage 8: what Hephaestus's API serves

Unversioned, open: `GET /api/versions` (never removed). Open: `GET /api/identity`, `GET /api/summary`,
`POST /api/nudge`. Behind `Authorization: Bearer <token>`: `GET /api/board` (served at `/api/v1/board` from stage 4), `GET /api/state`
(unregistered: the CLI's own reading),
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

### Stage 8: the Assistant's switch and the pipeline format

- `pipeline.json`: one format, `version` at the next unused number (5 unless an earlier stage raised it), read and
  written alone; its keys `version`, `prepare`, `gates`, `phases`, `review`, `airlock`, `constitution`, `agents`,
  `approvals`, `billing`, `reach`, `entities`, `assistant`. A gate's keys `name`, `run`, `fix`, `in`, `definedBy`,
  `network`, `writes`, `forgeOnly`. Any other version is refused.
- `assistant`: `true` when the board turned the Assistant on; absent when off. Never `false`. Out of the gating hash,
  in the apply-conflict hash. `Pipeline.assistant?: true`: a board key, never an entity's.
- `forgeOnly?: true` on a gate, "run by the forge alone, never by an agent in its worktree"; flag `gate add
  --forge-only`.
- Control command `{ kind: 'pipeline-assistant-set'; on: boolean }`, in the contract's board command kinds beside
  `pipeline-approval-set`. Applied in a hold on a readable pipeline; refused as `pipeline-approval-set` is on an
  unreadable one; under a job, refused for every role. `on: false` while an Assistant job is live also winds that job
  down, mode `wind-down`.
- CLI verb `forge gate assistant on|off [--json]`: the same answer `gate approval` prints, with the switch's state.
  `gate list` prints `Assistant: on` or `Assistant: off`.
- Log record `pipeline-assistant-set`: `{ subject: 'board', fields: { state: 'text' } }`, `state` `'on'` or `'off'`.
- `Board.setAssistant(on: boolean, at: string): PipelineChanged` and `Board.assistantIsOn(): boolean`. Refused with no
  stored pipeline (`assistant-without-pipeline`, served with its code, fields and sentence) and while an Apply is
  pending, as `setApproval` is.
- `PlaybookFacts.assistantIsOn: boolean`.
- `IncidentDefaultCause`: `'turn-closed' | 'turn-budget' | 'no-assistant' | 'assistant-off'`. While the switch is off,
  every open incident takes its default in the pass with cause `assistant-off`, except one delivered to an open turn
  of a winding-down Assistant, which takes it when that turn closes; no `boot-assistant` step is emitted.

### Stage 8: Markdown

- Board document ticket entry: `bodyMarkdown: string` (the body with its acceptance items separated) in place of
  `bodyHtml`; epic description entry: `descriptionMarkdown: string` in place of `descriptionHtml`; pipeline setup facts
  and each entity's: `constitutionMarkdown: string | null` in place of `constitutionHtml`.
- `TicketAcceptanceUtil.withAcceptanceItemsSeparated(ticketBody: string): string` in forge.
- Gaia: `apps/gaia/src/lib/markdown-render/MarkdownRenderer.ts` (`createMarkdownRenderer(): MarkdownRenderer`,
  `renderMarkdown(markdown: string): string`) and `HtmlEscapeUtil.ts`; `marked` 17.0.6 a dependency of Gaia. Gaia's page
  contract keeps the HTML fields it has.

### Stage 8: Gaia's libraries

- `apps/gaia/page/lib/design-system/DesignSystemInterface.ts`, `apps/gaia/page/lib/flint/FlintInterface.ts`,
  `apps/gaia/page/lib/brand/BrandInterface.ts`: the only modules code outside a library imports from it. Linkable files:
  `page/lib/design-system/styles/design-system.css`, `styles/tokens.css`, `fonts/**`; `page/lib/brand/styles/brand.css`.
- `apps/gaia/page/components/`: Gaia's own components.
- `apps/gaia/architecture/LibraryBoundaries.spec.ts`: the architecture test of section 1 of the design.
- `apps/gaia/package.json` scripts: `typecheck`, `lint`, `lint:fix` and `test:dom` cover the libraries;
  `storybook:design-system`, `storybook:brand`.
- `packages/` holds `forge-contracts` and `system-versions`.

### Stage 8: versions and contracts

- `FORGE_SYSTEM_VERSIONS`: current and minimum at forge's next major, minor 0 (2.0 unless an earlier stage raised it).
- `FORGE_COMPATIBILITY_REGISTRY`, all `source: 'shipped'`, `lastNeededBy: null`, no `compatibility-path` entry:
  `identity` and `summary` at their versions (v1 today, introduced 1.0); `monitor`, `monitor/events` and `commands`
  each at its next version (today v2, v2 and v1, so v3, v3 and v2), introduced in 2.0; each endpoint stages 3, 4 and 6
  added, at its version, raised by one and introduced in 2.0 where this stage changed its document (the board document
  lost `flintBrain`, `bodyHtml`, `descriptionHtml` and `constitutionHtml`, and its pipeline facts changed). No
  `session-codes`.
- `OVERSEER_CONTRACT_VERSIONS`: `identity` and `summary` as before, `monitor` and `control` one higher, no `embed`;
  `ServedContractName`: `'summary' | 'monitor' | 'control'` and whatever stages 3 and 6 added.
- `forge-contracts` 2.0.0 exports: `IdentityDocument`, `BoardSummaryDocument`, `MonitorSnapshotDocument`,
  `ForgeControlCommand`, `OverseerContractVersions`, `ForgeSystemVersions`, `ForgeCompatibilityRegistry`, and the
  board documents and command kinds of stage 4, what stage 6 added, and `ForgePresenceDocument` of stage 3. Gone:
  `EmbedChannelMessage`, `EmbedMode`, `FrameAncestorRecord`.
- `MonitorSnapshotDocument`: no `flintBrain`, no activity kind `flint-brain`. `ForgeControlCommand`: no
  `flint-brain-start`, `flint-brain-stop`.
- Gaia: `SUPPORTED_FORGE_VERSION` at forge's new version; `GAIA_SYSTEM_VERSION` at its next major and the minimum
  equal to it; `GAIA_ENDPOINT_VERSIONS` with `fleet`, `events` and `commands` one higher, `health`, `sessionCodes` and
  `session` unchanged; `CONTRACT_VERSIONS` with `gaiaFleetDocument` and `gaiaCommand` one higher.
- `INSTALL_VERSION` one higher than at the start of stage 8 (36 today), with its key added to
  `FrozenInstalledSurface.json`.
- The board's data folder has no `progress.html`; the registry entry has no `progressHtml` and no `progressJson`;
  `forge open` is unknown.

### Stage 9: the verbs

`forge start [--repository <path>] [--port <n>] [--started-by user|login-item] [--json]`,
`forge start --foreground [--repository <path>] [--port <n>] [--started-by user|login-item]`,
`forge start --successor-of <generation> [--port <n>]`, `forge stop [--now] [--json]`,
`forge restart [--now] [--json]`, `forge pause [--json]`, `forge unpause [--json]`, `forge status [--json] [--full]`,
`forge crash-log [<number>] [--json]`; stage 3's `forge resume` unchanged. `forge setup --login-item <repository>
[--label <label>]`. The login item runs `start --started-by login-item` (macOS), `start --foreground --started-by
login-item` (Linux) or `start --repository <path> --started-by login-item` (Windows). `oversee` is an unknown command.

### Stage 9: the replacement table

Applied in this order by `rename.ts`. The command-line and phrase rules apply to all text; the word rules then apply
everywhere outside the exclusions of WP9.1.

| # | Kind | Today | After |
| --- | --- | --- | --- |
| 1 | Command line, in prose | `oversee --detach` | `start` |
| 2 | Command line, in prose | `oversee --successor-of` | `start --successor-of` |
| 3 | Command line, in prose | `oversee stop`, `oversee restart`, `oversee pause`, `oversee status` | `stop`, `restart`, `pause`, `status` |
| 4 | Command line, in prose | `oversee resume`, `oversee unpause` | `unpause` |
| 5 | Command line, in prose | `oversee crash` | `crash-log` |
| 6 | Command line, in prose | `oversee` as a command (after the program name or in backticks) | `start` |
| 7 | Prose article | `an Overseer`, `An Overseer` | `a Hephaestus`, `A Hephaestus` |
| 8 | Prose definite | `the Overseer`, `The Overseer` | `Hephaestus` |
| 9 | Prose plural | ` Overseers` | ` Hephaestus processes` |
| 10 | Identifier with article | `TheOverseer`, `THE_OVERSEER`, `the-overseer` | `Hephaestus`, `HEPHAESTUS`, `hephaestus` |
| 11 | Plural identifier | `Overseers`, `overseers` (inside identifiers) | `HephaestusProcesses`, `hephaestusProcesses` |
| 12 | PascalCase | `Overseer` | `Hephaestus` |
| 13 | camelCase, kebab-case, paths | `overseer` | `hephaestus` |
| 14 | SCREAMING_CASE | `OVERSEER` | `HEPHAESTUS` |

What the rules produce for the named stored and installed names:

| Kind | Today | After |
| --- | --- | --- |
| Folders | `apps/forge/src/services/overseer/`, `apps/forge/cli/overseer/`, `apps/forge/docs/figures/overseer-api/` | `.../hephaestus/`, `.../hephaestus/`, `.../hephaestus-api/` |
| Reference document | `apps/forge/docs/reference/overseer-api.md` | `apps/forge/docs/reference/hephaestus-api.md` |
| Data folder | `<data>/overseer/`, `<data>/overseer.log` | `<data>/hephaestus/`, `<data>/hephaestus.log` |
| `progress.json` | `overseerState`, `overseerFirstStartedAt`; `version` 2 | `hephaestusState`, `hephaestusFirstStartedAt`; the next unused version |
| Log records | `overseer-started`, `overseer-stopped`, `overseer-set`; field vocabularies `overseer-state`, `overseer-stop-reason` | `hephaestus-started`, `hephaestus-stopped`, `hephaestus-set`; `hephaestus-state`, `hephaestus-stop-reason` |
| Interruption cause kept by stage 2 for this stage | `watcher-lost` | `talos-lost` |
| Command kinds | `overseer-pause`, `overseer-unpause` (WP9.6), `overseer-stop`, `overseer-restart` | `hephaestus-pause`, `hephaestus-unpause`, `hephaestus-stop`, `hephaestus-restart` |
| Playbook step, decision asker | `pause-overseer`; `askedBy: 'overseer'` | `pause-hephaestus`; `askedBy: 'hephaestus'` |
| Refusal codes | `overseer-down`, `overseer-not-answering`, `overseer-already-running`, `overseer-contended`, `overseer-port-in-use`, `overseer-still-live`, `overseer-identity-unreadable`, `overseer-did-not-start`, `overseer-control-is-runtime-only`, `overseer-owns-the-lifecycle`, `malformed-overseer-poll-interval`, and the rest `git grep -o "'[a-z-]*overseer[a-z-]*'"` lists | the same with `hephaestus` |
| Registry entry | key `overseer`, `lastCommand: 'start'` (WP9.6); registry version 1 | key `hephaestus`; the next unused version |
| Login item | `com.forge.overseer`, per board `com.forge.overseer.<trackerId>` | `com.forge.hephaestus`, `com.forge.hephaestus.<trackerId>`; `com.agent-progress.overseer` unchanged |
| `status --json` | key `overseer` (WP9.6) | key `hephaestus` |
| Environment | `FORGE_OVERSEER_POLL_INTERVAL_MILLISECONDS` | `FORGE_HEPHAESTUS_POLL_INTERVAL_MILLISECONDS` |
| Product names | `OVERSEER_PORT_FIRST` (4730, 4930) | `HEPHAESTUS_PORT_FIRST` (values unchanged) |
| Documents | summary `overseer`, monitor `overseer`; `SummaryOverseerState`, `SummaryOverseerDocument`, `MonitorOverseerState`, `MonitorOverseerDocument` | `hephaestus`; `SummaryHephaestusState`, `SummaryHephaestusDocument`, `MonitorHephaestusState`, `MonitorHephaestusDocument` |
| Contract package | `forge-contracts/OverseerContractVersions`, `OVERSEER_CONTRACT_VERSIONS` | `forge-contracts/HephaestusContractVersions`, `HEPHAESTUS_CONTRACT_VERSIONS` |
| Gaia | `OverseerFetch`, `overseer-fetch-*`, `RegisteredOverseer`, `OverseerTokenFile`, fleet `overseerStartedAt` | `HephaestusFetch`, `hephaestus-fetch-*`, `RegisteredHephaestus`, `HephaestusTokenFile`, `hephaestusStartedAt` |
| Forge recordings | `src__services__overseer__*.json`, `cli__overseer__routes.json` | `src__services__hephaestus__*.json`, `cli__hephaestus__routes.json` |

### Stage 9: versions

`FORGE_SYSTEM_VERSIONS` one major above stage 8's (3.0), minimum equal; `forge-contracts` at the same major;
`summary`, `monitor` and `control` contract integers each one higher than after stage 8; `SUPPORTED_FORGE_VERSION`
equal to forge's; `GAIA_SYSTEM_VERSION` at its next major and the minimum equal to it; `INSTALL_VERSION` one higher
than after stage 8; `progress.json` and the registry file each at their next unused version (today 2 and 1, so 3 and 2
unless an earlier stage raised them), and each format of stages 2 and 3 that names the Overseer at its next.

## Traps

- **The ClientNames scan proof breaks when the Bridge goes.** `SMALLEST_SHIPPED_FILE_COUNT` is 1,000
  (`apps/forge/architecture/ClientNames.spec.ts:26`); forge ships 1,199 such files today, 360 of them in `bridge/`. Lower the
  bound in WP8.2 to one the new count passes with margin, not to zero.
- **The packages lose forge's architecture tests before they move.** `ImportDirection.spec.ts` and `ComponentNames.spec.ts` scan
  `design-system` and `flint` because forge declares them (`apps/forge/src/testing/RepositorySources.ts:206-214`).
  Between WP8.2 and WP8.13 their isolation is held only by each package's own `architecture/PackageIsolation.spec.ts`; keep the two
  packages close together in the schedule, and do not move forge's architecture test to cover them.
- **ESLint 9 reads one configuration per run.** Run from `apps/gaia/`, it reads Gaia's `eslint.config.js` and never a
  library's. Gaia's lint ignores `page/lib/**`, and each library is linted from its own folder, where its own file is
  the nearest; a library linted under Gaia's rules would lose its clock, markup and storage bans.
- **A library's tooling assumed a manifest beside it.** `MANIFEST_FOLDERS` in each library's `eslint.config.js`, the
  cache and build-info paths under `./node_modules/`, `StoryCoverage.spec.ts`, brand's `PackageExports.spec.ts`,
  `ReactElementTree.ts` and `WorkspaceDependencies.spec.ts` all read a `package.json` or its `exports`. Each must read
  Gaia's manifest or the interface file; a spec that finds no manifest may pass on nothing.
- **The page's project would compile what only specs may import.** `apps/gaia/page/tsconfig.json` includes
  `./**/*.ts` with no Bun types; a library's `.dom.tsx`, stories and `testing/` import `bun:test`, Storybook and Happy
  DOM. Exclude `./lib/**` from the page's projects and let each library's two projects compile it.
- **One interface file is a facade, not a barrel to grow.** It names each export one by one, and nothing inside its
  library imports it. A component that a second Gaia file needs from inside a library goes through the interface,
  never by a deep path.
- **`page/components/` must move before the library arrives.** Moving the library into `page/lib/design-system/` first
  is safe, but a script that rewrites `design-system/` specifiers would also catch `page/design-system/` paths; move
  Gaia's folder first and rewrite only bare specifiers.
- **A Gaia ingestion that requires a key fails when forge drops it.** Gaia's monitor shape names `flintBrain` as a
  required nullable key (`MonitorSnapshotIngestion.ts:157`). Gaia stops requiring it (WP8.5) before forge stops sending
  it (WP8.7); the reverse order turns every forge read into a malformed document.
- **The command route's contract spec pins the package's kinds.** `CommandRoute.controlContract.spec.ts` checks every
  kind of `ForgeControlCommand`. Remove the brain's kinds from the package and from the route in the same package
  (WP8.7), and rename `overseer-resume` in both in WP9.6, never one alone.
- **Removing a registry entry is not the version change.** The registry guard accepts an entry removed while its
  `lastNeededBy` is `null`, so the specs stay green between WP8.6 and WP8.10 although the versions understate the
  change. The installed forge is a clone the owner pulls only at gate G6, after stage 9; nothing between runs it.
- **Raising the minimum makes the guard demand removals.** With the minimum at 2.0, the three `compatibility-path`
  entries (`ForgeCompatibilityRegistry.ts:46-48`) are below it and the guard fails until they are removed "and what it
  keeps" (`CompatibilityRegistryUtil.ts:55-57`). The unversioned routes are also how forge's own CLI reaches its
  Overseer (`apps/forge/cli/overseer/OverseerRemote.ts:48`, `:57`, `:81`, `:203`; the nudge of
  `apps/forge/cli/ApplyCommandOfVerb.ts`, which stage 5 put in place of `cli/OpenTrackerForWriting.ts:45`), and the
  integer version keys are what Gaia's reading rule checks (`apps/gaia/CLAUDE.md:43-45`). Remove the entries, keep both,
  and say in the API reference why they stay.
- **`bun.lock` changes with every manifest and package change.** After removing dependencies, removing the three
  workspaces or raising `forge-contracts`'s version, run `bun install` once at the root, then
  `bun install --frozen-lockfile`. A frozen install that fails is a lock out of date, never a reason to edit a
  `package.json` back.
- **The Assistant off by default changes many specs' premises.** 56 spec files name the Assistant or its boot today
  (`git grep -l "boot-assistant\|'assistant'" -- '*.spec.ts'`). Set `assistantIsOn: true` in the lifecycle fixtures
  (`LifecycleFixtures.ts:69-87`) so those specs keep testing the Assistant; the new behaviour gets its own cases.
  `src/services/overseer/CrashMatrix.integration.spec.ts` expects `no-assistant` in one case: its board must turn the
  Assistant on, or the cause becomes `assistant-off`.
- **The switch off must not cut a turn short.** Decision 24 lets a running Assistant finish its turn. Defaulting an
  incident delivered to that open turn would let the Assistant settle an incident that is already closed. Check the
  switch first in `incidentDefaultStepsOf`, but hold the incidents of the open turn until it closes;
  `noAssistantCanComeUp` (`Playbook.ts:773`) is not the place, since it also holds `assistantMayBoot` and the retry.
- **One pipeline format refuses every board's file.** After WP8.9 a `pipeline.json` of version 2, 3 or 4 is refused.
  Every scratch board, fixture and recording that writes one must write the new version; the live trackers are stopped
  and set up anew (decision 46), so no real file needs reading.
- **A Bun build that ran on the first request hid failures.** Today a page build failure is retried per request
  (`OverseerServer.ts:510-519`). Nothing replaces it; do not leave `page-build-failed` in a union no route returns.
- **The brain's log record stays readable but nothing writes it.** `EveryBoardLogRecord.ts:1-3` promises every kind
  "as the Board's own changes log them". After WP8.7, build the `flint-brain-ended` record from a literal there with a
  one-line why; do not keep a dead Board method to satisfy the helper.
- **The fake agent's tool-less branch.** `FakeAgentAdapter.ts:130` plays the brain's turns for any session with no
  tool. Check that no other session runs tool-less before deleting it; otherwise such a session would play the
  ordinary scenario.
- **Moving the renderer moves its safety.** Forge's renderer escapes raw HTML and judges a link's scheme after decoding
  entities up to three times (`MarkdownRenderer.ts:12-60`). Gaia's copy must keep every hostile-input case of its spec;
  a renderer written fresh from `marked`'s defaults passes raw HTML through.
- **Gaia's own session is not the forge's.** Gaia keeps its page session (`page/shell/SessionCodeExchange.ts`,
  `src/lib/local-http-guards/SessionCodes.ts`, `src/features/page-server/routes/SessionRoutes.ts`) and its
  `sessionCodes` and `session` routes. Delete only what reaches a forge's session codes.
- **Recordings never run against the real home.** Gaia's and forge's recordings start a scratch forge under a scratch
  home (`apps/gaia/src/testing/ScratchForge.ts:1-4`). Never point `GAIA_RECORDING_FORGE_PROGRAM` at the installed
  forge in `~/.forge-program`, and never run a forge verb in this checkout outside those scripts.
- **`status` is two commands today.** The board's `status` (`cli/tracking/status/`) and `oversee status`
  (`cli/overseer/`) read different things with different install rules. WP9.6 merges the process facts into the board's
  `status` as a reading it prints, keeps `status` free of the install-version check, and keeps both read-only with no
  lock.
- **The Linux login item serves in the foreground.** systemd's `Type=simple` unit keeps the process it starts
  (`LinuxAutostart.ts:21`); a detached `start` there would exit at once and systemd would count the item as ended.
  Only Linux takes `start --foreground`.
- **The rename script has no rule for the verb.** Its word rules match `Overseer`, `overseer` and `OVERSEER`; a bare
  `oversee` survives them, and no rule may turn it into `hephaestus`, a verb decision 42 forbids. WP9.6 removes the
  verb from code and installed text before WP9.2, the command-line rules rewrite it in prose first, and `check.ts`
  reports any that is left.
- **The rename lengthens lines.** "Hephaestus" is two characters longer than "Overseer" and three longer than
  "oversee". Lint's 180 and 155 limits and `ProseWrap.spec.ts`'s 120 columns fail on lines near the limit;
  aligned `from` columns and object values move. Run `lint:fix`, then fix the rest by hand.
- **Plain substitution breaks English and identifiers.** "an Overseer" (304 today) becomes "an Hephaestus" and "the
  Overseer" (2,003) becomes "the Hephaestus" unless the phrase rules run first; `stopTheOverseer` becomes
  `stopTheHephaestus`. Keep the rule order of the replacement table.
- **Records must keep the old names.** `FrozenInstalledSurface.json` keeps every older install version's names ("never
  delete a name from a version already frozen", `cli/InstalledSurface.spec.ts:7-8`); the vendor fixtures record what
  Claude Code printed for a probe folder named `overseer-claude-probe-repo`; the released program's label
  `com.agent-progress.overseer` names another program's item; `apps/forge/docs/research/` records findings at a date.
  The script excludes them, the architecture test allowlists the scanned ones by exact file.
- **The retired-name architecture test is per file and substring.** An allowlist entry `<file>: oversee` hides any other mention in
  that file. Keep the allowlisted files few, and rely on `check.ts`, which reports lines, for the final proof.
- **The architecture test does not scan Gaia or the root.** `ComponentNames.spec.ts` scans forge and its declared packages only
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
  pulling stage 9 into the installed clone (gate G6).
- **The rename touches stored versions that other stages may have raised.** Stages 2, 3 and 5 may raise
  `progress.json` or add formats of their own. Raise each to the next unused number at the time of stage 9; never
  reuse a number a commit of this refactoring or an earlier one wrote.

## Verification of the whole stage

At the root, after each stage:

```bash
bun install --frozen-lockfile
bun run verify
```

Both exit 0. `bun run verify` runs every workspace's `typecheck`, `lint`, `test`, `test:dom` and `check`; forge has no
`test:dom`, and Gaia's runs the board's and the three libraries' DOM specs after WP8.13.

The specs that matter most, each in its workspace folder:

- `apps/forge`: `bun test --path-ignore-patterns='.claude/**' ./src/services/overseer/OverseerServer.spec.ts
  ./cli/overseer/routes/CommandRoute.controlContract.spec.ts ./src/services/control/SettingControls.spec.ts
  ./src/lib/tracker-model/Playbook.spec.ts ./src/adapters/pipeline/PipelineFile.spec.ts ./architecture/ImportDirection.spec.ts
  ./architecture/ClientNames.spec.ts ./architecture/ComponentNames.spec.ts ./cli/InstalledSurface.spec.ts ./cli/RetiredVerbs.spec.ts
  ./cli/CommandTable.spec.ts` (paths of stage 9 under `hephaestus/`).
- `packages/forge-contracts`: `bun test` (the registry and the contract integers).
- `apps/gaia`: `bun test src/features/page-server/PageServer.spec.ts
  src/adapters/forge-api/MonitorSnapshotIngestion.spec.ts src/shared/constants/ContractVersions.reference.spec.ts
  src/testing/RecordedAnswers.spec.ts architecture/LibraryBoundaries.spec.ts page/lib`, then `bun run test:dom` and
  `bun run check`.

The end-to-end check on a scratch forge, which Gaia's rules name (`apps/gaia/CLAUDE.md:18-20`, `:139-150`):

1. In `apps/gaia`: `GAIA_RECORDING_FORGE_PROGRAM="$(cd ../forge && pwd)/agent-progress.ts" bun run record
   overseer-fetch-supported-forge` (stage 9: `hephaestus-fetch-supported-forge`). It runs this checkout's forge in
   scratch repositories under a scratch home with the fake agent: init, start, every situation, Baton pass, stop.
2. Read the recording: `/api/versions` answers the stage's version and minimum; identity names no `embed`; no session
   route is called; the monitor has no `flintBrain`; a command answers with the stage's `controlVersion`; after stage
   9 every key and kind says `hephaestus`, and the recording starts the forge with `start`.
3. In `apps/forge`: `bun run record cli/overseer/routes/` (stage 9: `cli/hephaestus/routes/`), which runs
   `cli/overseer/OverseerApi.integration.spec.ts` against a real Overseer on a scratch board: the removed routes answer
   404, the reads answer 401 without the token.
4. Stage 8 only: on the scratch board of a spec or the recording, an incident opened with the switch off is defaulted
   in the next pass with cause `assistant-off`, and no `assistant` job is launched (`Playbook.spec.ts` and the crash
   matrix's board cover it without a real session); Gaia's page shows a ticket body rendered by Gaia's server, with raw
   HTML escaped.
5. Stage 9 only: on a scratch board, `start`, `status`, `pause`, `unpause`, `restart` and `stop` each answer as their
   specs say, and `oversee` is refused as an unknown command.

Stage 9 only, at the root: `bun <scratchpad>/check.ts`, the script WP9.1 wrote in the session's scratchpad outside the
repository, exits 0, and `git grep -n -i "oversee" -- . ':!docs/monorepo' ':!apps/forge/docs/research'` prints only the
allowlisted files.

## Out of scope

- What forge does after an agent ends on a network outage, the bound and the recorded run time of install and gate
  lines, the hung-Hephaestus rule and the crash before a reboot (decisions 35 to 40): stages 2, 3 and 6 build them;
  stage 9 renames whatever names their code carries.
- New Gaia controls: the Assistant's switch in a Gaia view, a Gaia view of `gate list`. Stage 8 adds the command, its
  contract kind and the verb only.
- Rewriting the Assistant or deciding what it owns (decision 24: later, from accumulated data).
- Flint the sprite's behaviour: it moved with the views in stage 6; stage 8 moves its library, and only the brain
  leaves forge.
- Changing what a library does while it moves: WP8.13 changes paths, tooling, imports and descriptions, never a
  component, a token or Flint's behaviour.
- Removing the integer version keys from the documents, the unversioned routes of forge's own CLI, or Gaia's own page
  session.
- Changing the store port, the Talos protocol, presence, recovery or the board documents' shapes beyond the changes
  named here.
- An architecture test against retired names inside Gaia (propose it as a follow-up).
- Renaming the product (`forge`, `.forge`, `.forge-monitor`, `FORGE_`) or Talos, or reserving Zeus.
- Converting existing boards; the owner sets them up anew (decision 46).
- The committed ticket (decision 48): stage 5's WP5.14 to WP5.17. Stage 9's rename leaves `committed` and
  `ticket unready` as they are; neither names the Overseer.

## Needs the owner

Only acts the owner alone may do; the answers settle every behaviour question these stages meet.

1. **Gate G6, before stage 9.** Stop every forge on the machine and remove each board's login item with the program as
   it is (`forge login-item remove --repository <path>`), since stage 9 changes the data folder, the login item's
   label and the line it runs.
2. **Gate G6, after stage 9.** Pull stage 9 into the installed clone, run `setup`, set each board up anew with `init`
   (its pipeline's `reach` names no `/packages/design-system`, which is gone after WP8.13), and add the login items
   again with `forge login-item add`.

## Not established

- The state of the code after stages 2 to 7: the plans in this folder say what stage 2 does with Flint's brain and the
  Watcher's names, what stage 4 serves, what stage 5 puts behind the port, and what stage 6 moves and names. None of
  it is built, so each is confirmed in the code before WP8.1 (the table of needs).
- Whether `bun run lint:fix` moves the aligned `from` columns and object values; the shared lint configuration claims
  the rules (`~/coding-conventions-new.md` section 12), but whether they fix themselves has not been run.
- Whether a forge from before system versions can be built from a scratch clone at the parent of `6f521908` in this
  repository's layout, which the `overseer-fetch-versions` recording needs; `apps/gaia/src/testing/` names the
  setting, but the recipe of the clone is not found.
- Which PNG figures (`apps/forge/docs/figures/overseer-api/*.png`, `docs/figures/runbook/overseer-down.png`,
  `docs/figures/glossary/component-map.png`, `apps/forge/docs/images/*.png`) show the word in their pixels;
  `git grep` does not read images. WP9.3 reads them.
- Whether an old board's `log.jsonl`, with renamed record kinds, is read before the `progress.json` version check on
  `status`, so the refusal names the progress file and not a malformed log.
- The exact JSON answer of `gate approval --json`, which the new verb copies; it has not been read.
- Whether Bun's HTML bundler resolves `page/index.html`'s relative links into `page/lib/` and the font files the
  library's loader imports exactly as it resolves the package links today; WP8.13's page-file spec settles it.
