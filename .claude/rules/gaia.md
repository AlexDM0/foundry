---
paths:
  - "apps/gaia/**"
---

# Gaia

Gaia is one window over every forge on this machine: what waits on User, every running agent, and every forge's state
and controls. A Bun server (`apps/gaia/src/`) and a React page (`apps/gaia/page/`) in TypeScript, opened as a macOS app.
Gaia runs no agent and talks only to forges.

Gaia lives in `apps/gaia/` of the forge monorepo, a Bun workspace. A path in this file names a file from the repository
root, but in the Map, whose folders are under `apps/gaia/`. Forge lives beside it in `apps/forge/`, the shared packages
in `packages/`: `forge-contracts` and `system-versions`. The repository root holds only the workspace: its manifest, the
one `bun.lock`, the hoisted `node_modules`, `turbo.json` and the scripts that run every workspace's tasks through
Turborepo (`README.md` there says how to set up and verify). Gaia's `package.json` names Gaia's own dependencies and is
released on its own; the dev tools every workspace shares are the root's.

## Gaia's own rules

The owner's coding conventions (`~/coding-conventions-new.md`) hold for Gaia. This file holds only Gaia's own rules and
its Deviations from them, each with why.

1. **Change Gaia and, under its own rules, the package Gaia shares.** Claude and agents working on Gaia change
   `apps/gaia/`, its libraries under `apps/gaia/page/lib/` among them (`apps/gaia/page/lib/design-system` under its
   `CONSTITUTION.md` and `.claude/rules/design-system.md`, `apps/gaia/page/lib/flint` under `.claude/rules/flint.md`),
   `packages/system-versions` under its `README.md`, and the root's `package.json`, `bun.lock` and `turbo.json` only for
   Gaia's own dependencies and tasks. `apps/forge/` and `packages/forge-contracts` are forge's: what Gaia needs there is
   a forge requirement (`apps/gaia/docs/forge-requirements.md`). Agent-dashboard and books-explorer are read-only
   references outside this repository. They never run a forge verb in this repository or talk to a running forge, but
   for the recordings' scratch forge: `apps/forge/agent-progress.ts` run through `apps/gaia/src/testing/ScratchForge.ts`
   with `FORGE_ROOT` pinned to a scratch repository.
2. **Never touch the real home.** No spec reads or writes `~/.forge-monitor` or `~/.gaia` or talks to a running forge.
   The test preload moves `HOME` and `TMPDIR` into the run's scratch folder under `apps/gaia/.scratch/`; the leak check
   fails the run on what a spec leaves behind in Gaia's folder, and judges no other app's or package's files, so a forge
   run beside a Gaia run fails neither. A child process starts through `realProcessRun(environmentCopy)`, and a spec
   that starts one directly passes `env: environmentCopy()`: without `env`, Bun hands a child the environment the run
   started with, the real home.
3. **Every data model carries a version.** A stored file or JSON contract without a version key is a defect. Forge and
   Gaia are released apart and meet only through system versions; `apps/gaia/docs/contracts.md` holds the model, the
   tables and the verdicts. Forge never knows Gaia: nothing forge serves, and nothing in a package forge depends on
   (`forge-contracts`, `system-versions`), names Gaia, and Gaia sends forge client-neutral values only
   (`apps/gaia/docs/forge-requirements.md`). Gaia frames no forge's page: every board tab is Gaia's own view, it runs no
   `forge open`, and it writes no frame-ancestor record. Each system has one system version, major.minor by
   interoperability (a minor only adds; a major may break a client of an older major), never its package version. A
   server answers its current version and its minimum supported, which it alone decides, at `GET /api/versions`,
   unversioned and never removed; serves each REST route at `/api/v<n>/<endpoint>`, side by side, with no per-endpoint
   version in its answers; carries the system version in a message protocol's handshake and every message; and keeps a
   compatibility registry of what it serves for older clients, through `system-versions`' logic, with a
   raise-the-minimum dry run (`bun run versions:raise-minimum <major.minor>`). Forge's is
   `forge-contracts/ForgeCompatibilityRegistry`; Gaia's own, toward its page and launcher, is
   `apps/gaia/src/shared/constants/GaiaCompatibilityRegistry.ts`, beside `GAIA_SYSTEM_VERSION` and the routes' versions
   in `apps/gaia/src/shared/constants/GaiaSystemVersions.ts`. **Gaia supports exactly one forge version**,
   `SUPPORTED_FORGE_VERSION` (`apps/gaia/src/shared/constants/SupportedForgeVersions.ts`), and keeps no
   backward compatibility for any other: no migration of an older forge document, no unversioned forge path, no
   recording of an older forge read. The forge endpoint versions it calls are derived from forge's registry at that
   version, never listed by Gaia; verify warns while it is behind forge's current version in `forge-contracts`. Gaia
   asks every forge's `/api/versions` first and decides one verdict per forge
   (`apps/gaia/src/shared/utils/ForgeVersionsUtil.ts`): `current` and `ahead` it reads; `newer` (Gaia needs an update)
   and `older` (the forge needs one, as does a forge from before system versions, which serves no `/api/versions`) it
   cannot talk to. A document's integer key (`monitorVersion`, `fleetVersion`) and a stored file's format version
   (`version` and an optional `minor`) stay: `CONTRACT_VERSIONS` (`apps/gaia/src/shared/constants/ContractVersions.ts`)
   holds the one version Gaia knows of each forge contract and stored file, and `PAGE_CONTRACT_VERSIONS`
   (`apps/gaia/src/shared/constants/PageContractVersions.ts`, importing nothing) of each contract Gaia serves its page
   and launcher, the board's included, and `apps/gaia/src/shared/utils/ContractVersionUtil.ts` is the one reading rule:
   the known version reads with its unknown keys passed over; an older or a newer one never reaches a mapper.
4. **No screen tells User to run a command, but a forge's refusal.** Gaia starts, stops, updates and adds forges itself.
   A forge refusal reads as the forge's own sentence, the one its command line prints, shown verbatim (decision 45). A
   notice, a warning or another forge sentence that names a command still leaves the server in Gaia's words
   (`apps/gaia/src/adapters/page-api/ForgeSentenceUtil.ts`), by its notice kind, and otherwise for a neutral sentence.
5. **Gaia starts a dormant forge with `forge start --json`.**
6. **Tokens stay in the server.** No forge token reaches the page, an answer or a log line.
7. **The server binds `127.0.0.1` only** and keeps the Host, Origin, CSP and session guards on every route. The diagram
   frame's files alone carry a policy of their own, a sandbox with scripts and no origin of its own
   (`apps/gaia/docs/architecture.md`, "The diagram frame").
8. **Commits and the repository's verify** follow the root's `CLAUDE.md`.
9. **Gaia's verify tasks** (`bun run verify:gaia` at the root runs them and the packages Gaia depends on) are the
   typecheck of `apps/gaia/src/`, `apps/gaia/page/`, `apps/gaia/architecture/` and each library, lint, specs, the
   architecture tests, and `check`: the recording-stamp check and the supported-forge check, which warns while
   `SUPPORTED_FORGE_VERSION` is behind forge's current version in `forge-contracts`. The architecture tests, the specs
   that hold the code's and the repository's structure, live in `apps/gaia/architecture/` and in each library's
   `architecture/`; `bun run test:architecture` runs them, and plain `bun test` leaves them out
   (`apps/gaia/bunfig.toml`). Never verify with ad-hoc compiler flags.
10. **Colour lives only in tokens:** the design-system library's `tokens.css`, the brand library's for Forge's mark,
    and, for Gaia's own parts only (its mark, a fill the library keeps to a state tone),
    `apps/gaia/page/styles/tokens.css`, in a light and a dark value, redefining no library token but `--press-scale`,
    which the library leaves to its host (set to 1: a press changes no size). `apps/gaia/page/styles/gaia.css` reads
    only tokens, styles exactly the classes Gaia's components emit (never a library class), and lets a hover or press
    change no size or place; `apps/gaia/architecture/StyleContract.spec.ts` holds this, 4.5:1 on every text pair of
    `apps/gaia/docs/design/components.md` section 4 in both themes, and 3:1 on the primary button, the one exception,
    which the owner accepts. A variant is a `data-*` attribute, never a class. `apps/gaia/page/components/` holds only
    Gaia's own parts, the ones no library has (Gaia's mark, the brand bar, the callout and the like) and Gaia's words
    around a library part (the refusal around the failed action), composed from the libraries' components; they import
    no shell, view or board (`apps/gaia/architecture/PageImportDirection.spec.ts`). A state reaches a library component
    as a state tone mapped in one place, `ConditionDot`, `RoleDot`, `VersionsVerdictMark` and `FigureLookUtil`. Gaia's
    parts take no hooks, so their specs unfold them with `apps/gaia/page/testing/ReactElementTree.ts`, which keeps every
    component the design-system library's interface file exports folded: a spec reads and calls the props Gaia hands a
    library part, never the markup the library draws, so a library's insides may change, hooks included, without a Gaia
    spec noticing. The page's specs have no document at all: a component that needs hooks keeps its layout in a
    hook-free part, and a spec renders a hooked root with `react-dom/server`, which runs the hooks but no effect, as
    `apps/gaia/page/shell/GaiaApp.spec.tsx` does, and reads Gaia's own markup there, a library part only whole, as drawn
    for the props Gaia hands it. The visual harness reads its screens through `apps/gaia/page/testing/MarkupTree.ts`: a
    control by its role and name, a text by what it reads, a part of Gaia's by its own class, and a library part whole
    or by the attributes a variant prop adds to its root, never by a library's class or nesting. The board's views under
    `apps/gaia/page/board/` are the exception to the document-free specs: they keep their behaviour in `.dom.tsx` specs,
    which `bun run test:dom` runs with a document and the page project leaves out. `apps/gaia/page/board/` is styled by
    `apps/gaia/page/styles/board/*.css`, never by `gaia.css`, under the board section of
    `apps/gaia/architecture/StyleContract.spec.ts`, which holds it with the board's own style checks
    (`apps/gaia/page/testing/BoardStyleChecks.ts`): its classes are `board-`, never `gaia-`, its keyframes `board-` and
    only there, its colour tokens in `apps/gaia/page/styles/board/tokens.css` in a light and a dark value (a colour the
    same in both themes set once, in the light block), its text pairs at 4.5:1, a hover or press that moves nothing, and
    a winning reduced-motion rule for each animation outside the no-preference query. Browser storage is reached only by
    `apps/gaia/page/board/preferences/PreferenceStore.ts`, `apps/gaia/page/shell/ThemeBootstrap.ts` and
    `apps/gaia/page/api/FleetStreamClient.ts` (`apps/gaia/eslint.config.js`).
11. **The design system, Flint and Forge's mark are libraries of the page, under `apps/gaia/page/lib/`: `design-system`,
    `flint` and `brand`.** A library is a folder with no manifest, independent of the other two and of Gaia's features,
    with its own specs, description, `eslint.config.js` and two TypeScript projects; the design system keeps its
    `CONSTITUTION.md`. Code outside a library imports only its interface file, by a relative path:
    `apps/gaia/page/lib/design-system/DesignSystemInterface.ts`, `apps/gaia/page/lib/flint/FlintInterface.ts`,
    `apps/gaia/page/lib/brand/BrandInterface.ts`. A page links only the files a library offers by path: the design
    system's `styles/design-system.css`, `styles/tokens.css` and fonts, and the brand's `styles/brand.css`. Inside a
    library a file imports exactly the module it needs, never the interface file, nothing of another library and no Gaia
    file, and only the interface file re-exports, one name at a time. `apps/gaia/architecture/LibraryBoundaries.spec.ts`
    holds all of it, and `apps/gaia/architecture/WorkspaceDependencies.spec.ts` that no file names a library by a bare
    specifier. A library names no Gaia (the `PackageIsolation.spec.ts` in its `architecture/` folder). Gaia's scripts
    run each library's tooling: `typecheck` its two projects, which the page's own projects leave out; `lint` its ESLint
    from its own folder, since Gaia's configuration ignores `apps/gaia/page/lib/`; `bun test` its specs;
    `test:architecture` its `architecture/` folder; `test:dom` its `testing/RunDomSpecs.ts`; `storybook:design-system`
    and `storybook:brand` its Storybook. `apps/gaia/page/index.html` links the design system's stylesheet, then the
    brand's, before Gaia's, and `apps/gaia/page/Main.tsx` registers the fonts, which the page build emits and Gaia's
    server serves under their hashed names; the splash links the tokens and fonts by their files. Gaia passes every word
    into a library part. Gaia's mark is Gaia's (`apps/gaia/page/components/GaiaMark.tsx`), drawn on the brand's
    `MARK_GEOMETRY`; the splash, which links no `gaia.css`, carries its rules. Flint is imported only from
    `apps/gaia/page/board/` (`apps/gaia/architecture/PageImportDirection.spec.ts`).
12. **The design rules hold in both themes, on every screen.** Orange is work, what waits on User and the one primary
    button of an area; crimson is a failure only and never a button; a dot, edge or tint stands beside its word; fill
    holds, a ring changes, dashed waits; no shadow at rest; mono for machine values. Gaia draws Flint only in the forge
    route, one per forge, and calls no model (a forge's own figure, such as its tokens today, is passed on as the forge
    reports it). `apps/gaia/page/Screens.visual.spec.ts` paints every artboard from
    `apps/gaia/page/testing/ArtboardScreens.tsx` in light and dark for the by-eye pass against the artboards
    (`apps/gaia/docs/design/README.md`).

## Map

Gaia's folders under `apps/gaia/`. Beside them Gaia depends on two workspace packages at `workspace:^`:
`forge-contracts` for forge's documents, system versions and compatibility registry, which only the server imports, and
`system-versions` for the version model both systems share (rule 3). The page imports no `forge-contracts` and reads its
own contract versions from `apps/gaia/src/shared/constants/PageContractVersions.ts`
(`apps/gaia/architecture/PageImportDirection.spec.ts`, with no exception); it reaches its own modules by relative path,
never by Gaia's package name `gaia`.

```
docs/              the architecture, the contracts reference (held to CONTRACT_VERSIONS and PAGE_CONTRACT_VERSIONS by a spec), what Gaia asks of forge, the backlog,
                   the spikes' findings, the design reference (docs/design/)
resources/         the app bundle templates and the splash page
src/Main.ts        the one entry point: reads the verb, runs it, maps the app-level error to an exit code
src/features/      fleet, forge-control, page-server, launcher, app-install
src/adapters/      every boundary: the registry, the forge's API and program, Gaia's own files, Gaia's own server as the launcher asks it, the page contract,
                   the installed app bundle's Info.plist
src/services/      ForgeWatch, FleetStore, SettingsStore, Environment, the one reader of the environment, and Clock, the one reader of the clock
src/lib/           building blocks: forge-client, event-stream, process-run, atomic-file, local-http-guards, json-value, api-paths,
                   markdown-render
src/shared/        the internal model's types, app-wide constants, the contract version rule, GaiaError
src/shared/@types/board/ Gaia's board model, which the server maps each forge's board into
src/testing/       the scratch root, the test run preload, the leak check, the recordings and their mocks; test-only
page/              the browser runtime, with its own tsconfig listing exactly the shared files it may reach; drawn with the design-system library (rule 11)
page/lib/          the page's libraries, each behind its interface file: design-system, flint, brand (rule 11)
page/components/   Gaia's own parts that no library has, composed from the libraries (rule 10)
page/shared/       what several parts of the page word, show or offer alike, hoisted from a view once a second part needs it, the board's hash
                   routes (`BoardRouter`) among them; it imports nothing of the board
page/@types/       the page contract (`FleetDocument`, `CommandDocument`); the server maps across it in src/adapters/page-api/, and only there
page/@types/board/ the page's board contract, Gaia's own, never the forge's
page/board/        the board's views, Gaia's own; a page view may draw the board, the board imports no page view (`page/views/`) and
                   not the page shell (`page/shell/`) (rule 10)
page/board/shell/  the board's frame, which composes every tab's view; only `page/board/Board.tsx` and `page/board/testing/` import it
page/board/views/  one folder per tab or panel; no view imports another
page/board/shared/ what the board's views and its shell read alike, hoisted once a second of them needs it; imports no view and no
                   shell
```

`apps/gaia/architecture/PageImportDirection.spec.ts` holds the board's folders to these lines.

## Boundaries

| Outside system | Boundary util |
| --- | --- |
| Other programs: `forge`, `osascript`, `clang`, `lipo`, `codesign`, the browser | `apps/gaia/src/lib/process-run/ProcessRun.ts` |
| HTTP to a Hephaestus | `apps/gaia/src/lib/forge-client/HephaestusFetch.ts` |
| The browser's debugging pipe | `apps/gaia/src/features/launcher/BrowserWindowWatch.ts` |
| The file system's odd corners | `apps/gaia/src/lib/atomic-file/AtomicFile.ts` |
| The Notification API | `apps/gaia/page/notifications/NotificationBoundary.ts` (`eslint.config.js` holds it the one reach) |
| A forge's board, relayed by Gaia's server to the page | `apps/gaia/page/board/api/` |
| The clock | an injected `now` and injected timers; the clock, wall and monotonic, is read only in `apps/gaia/src/services/Clock.ts` |

Only a boundary's own specs touch the real system; every other spec mocks it with recorded answers
(`apps/gaia/src/testing/RecordedRuns.ts` for process-run, `apps/gaia/src/testing/RecordedAnswers.ts` for
hephaestus-fetch, one answer set per situation of the forge), and the clock's timers with
`apps/gaia/src/testing/ManualTimers.ts`, which a spec fires by hand, so no spec waits a real interval. Every forge
answer is recorded from a real forge; a program that is no forge on a Hephaestus's port is recorded from a local Bun
server and stamped with Bun's version.

A boundary's real-system spec is `<Module>.recording.spec.ts`, listed in `RECORDED_BOUNDARIES`
(`apps/gaia/src/testing/BoundaryRecordings.ts`). `apps/gaia/bunfig.toml` keeps it out of `bun test`; `bun run record
<name>` runs it and writes `apps/gaia/src/testing/recordings/<os>/<name>.json`, stamped with the system's version.
Verify fails on a stale stamp and on a forge recording stamped `authored`, and lists a boundary with no recording for
the OS as not finished. One recording is stamped `authored`, and verify lists it as a warning: a dialog only a person
can answer. `bun run record path-chooser` asks the person at a Mac's screen to choose a folder and cancel a file, and
until someone has, its recording stays authored beside its spec. Every forge recording is recorded. From this
repository's forge, at `SUPPORTED_FORGE_VERSION` (4.5): `hephaestus-fetch-supported-forge`, the forge in each situation;
`hephaestus-fetch-ticket-documents`, a ticket's documents in the spec-then-plan route, opened by a save of its spec;
`hephaestus-fetch-presence`, a forge's presence while it serves and after User started it again after a kill, with the
crash log it wrote; and `hephaestus-fetch-versions`, older, ahead and newer through forge's test setting
`FORGE_VERSIONS_ANSWER`, and from a forge from before system versions that `GAIA_RECORDING_UNVERSIONED_FORGE_PROGRAM`
names (a scratch clone's `agent-progress.ts`). macOS's programs are stamped with the Darwin release. The forge's version
is read only by running it: `GAIA_RECORDING_FORGE_PROGRAM=<a forge's agent-progress.ts> bun run record <name>` runs that
forge, this repository's `apps/forge/agent-progress.ts` or a scratch clone's for an older forge, through
`apps/gaia/src/testing/ScratchForge.ts`, under a scratch home in scratch repositories with `FORGE_ROOT` pinned to each
one, so its walk up for a tracker never reaches a board above the scratch root. The forge is handed that home through a
short link under `/tmp/gaia-scratch-forges`, since its board's Talos socket path below it must fit (no folder below a
worktree's scratch root keeps it short enough); the link goes with the scratch forge, the folder once it is empty, and
the leak check names either left behind. Every agent it launches is the forge's fake agent, so a recording makes no
model call. It records the paths, tracker ids, ports and process ids a run draws as fixed example values, stamps the
recording with the forge's install and code versions, and verify lists it as not checked against an installed forge.
`apps/gaia/architecture/RealProgramRuns.spec.ts` holds the exact list of files that may start a program another way.

The browser's recordings (`browser-window-watch`, `launcher-programs`) are taken from the Chrome or Edge in
`/Applications`, which opens visible windows and dismisses its own dialogs, and are stamped with that browser's version;
verify lists them as not checked, since the browser updates itself. A recording spec that starts the browser under the
scratch home passes `--use-mock-keychain`: without it the browser waits on the account's keychain and its windows answer
no navigation.

`gaia install-app` generates `~/Applications/Gaia.app` from `apps/gaia/resources/app-bundle/`; nothing it generates
lives in the repository. Its launch script names the bundle (`gaia launch --app-bundle <path>`), and the launcher
refuses in a dialog, before it starts anything, when the bundle's `GaiaInstallVersion` is not `GAIA_INSTALL_VERSION`.
That dialog is the one place Gaia names a command for User: `gaia install-app` is the only way the bundle is installed.
The bundle's executable (`apps/gaia/resources/app-bundle/launch.m`) is the process macOS knows as Gaia: it starts the
launch script as its child only once macOS has registered it, since a browser that registers first takes Gaia's place
and macOS then cannot open `Gaia.app` again, and it answers a second open by bringing Gaia's window forward.

The launcher's splash (`apps/gaia/resources/page/loading.html`) is a file page, and Gaia's server answers no
cross-origin read and refuses a file page's origin, so the splash cannot read the health route itself: the launcher
follows it and moves the splash on through the browser's debugging pipe (`--remote-debugging-pipe`, never a port another
process could reach), and navigates the window to Gaia's page with the session code. No session code is ever in the
browser's arguments: when Gaia already runs, the window opens on the splash at its last step, and the launcher asks for
the code once the window is listed and moves the window to the page at once (`apps/gaia/docs/architecture.md`, "Guards
and sessions").

## Deviations

| Rule | Done instead | Why |
| --- | --- | --- |
| A spec is `<Module>.spec.ts` beside its module. | The board's views keep their behaviour in `.dom.tsx` specs beside the view (rule 10), which `bun run test:dom` runs with a document. | They need a document, and the page project leaves them out so the rest of the page's specs run without one. |
| Code is hoisted only when a second consumer needs it. | The design-system library holds a part with one consumer, or none yet, when the design defines it (its `CONSTITUTION.md`, section 5). | A design system is a catalogue drawn from the design boards: its parts exist as the design names them, before a screen uses them. |
| Scratch locations live under a short root of the project's own. | A recording's scratch forge is reached through a link under `/tmp/gaia-scratch-forges` (Boundaries). | The forge's Talos socket path below it must fit the socket path limit; no folder under a worktree's scratch root is short enough. |
