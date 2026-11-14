# Gaia

Gaia is one window over every forge on this machine: what waits on User, every running agent, and every forge's state and controls. A Bun
server (`src/`) and a React page (`page/`) in TypeScript, opened as a macOS app. Gaia runs no agent and talks only to forges.

## Gaia's own rules

1. **Write only in this repository.** The forge (`~/development/forge`), agent-dashboard, agent-progress and books-explorer are read-only
   references. Never run a forge verb in the forge checkout.
2. **Never touch the real home.** No spec reads or writes `~/.forge-monitor` or `~/.gaia` or talks to a running forge. The test preload
   moves `HOME` and `TMPDIR` into the run's scratch folder under `.scratch/`; the leak check fails the run on what a spec leaves behind. A
   child process starts through `realProcessRun(environmentCopy)`, and a spec that starts one directly passes `env: environmentCopy()`:
   without `env`, Bun hands a child the environment the run started with, the real home.
3. **Every data model carries a version.** A stored file or JSON contract without a version key is a defect. The known numbers are
   `CONTRACT_VERSIONS` in `src/shared/constants/ContractVersions.ts`; a reading at another number never reaches a mapper, except at an older
   number `OLDER_CONTRACT_VERSIONS_READ` names, which its ingestion migrates to the current shape first (monitor 1, for a forge not yet
   updated).
4. **No screen tells User to run a command.** Gaia starts, stops, updates and adds forges itself. A forge sentence that names a command
   leaves the server in Gaia's words (`src/adapters/page-api/ForgeSentenceUtil.ts`), by its refusal code or notice kind, and otherwise for
   a neutral sentence.
5. **Gaia starts a dormant forge with `forge start --json`, never `oversee --detach`.**
6. **Tokens stay in the server.** No forge token reaches the page, an answer or a log line.
7. **The server binds `127.0.0.1` only** and keeps the Host, Origin, CSP and session guards on every route.
8. **Commits:** one plain, human-written subject line. No AI attribution of any kind: no `Co-Authored-By`, no "generated with" footer.
   Never `--no-verify`.
9. **Verify** with `bun run verify` (typecheck of `src/` and `page/`, lint, specs, the recording-stamp check), never with ad-hoc compiler
   flags.
10. **Colour lives only in tokens:** the design-system package's `tokens.css` and, for Gaia's own parts only (the marks, a fill the
    package keeps to a state tone), `page/styles/tokens.css`, in a light and a dark value, redefining no package token.
    `page/styles/gaia.css` reads only tokens, styles exactly the classes Gaia's components emit (never a package class), and lets a hover
    or press change no size or place; `page/StyleContract.spec.ts` holds this, 4.5:1 on every text pair of COMPONENT_LIBRARY section 4 in
    both themes, and 3:1 on the primary button, the one exception (PLAN V9). A variant is a `data-*` attribute, never a class.
    `page/design-system/` holds only the parts the package does not have (the marks, the brand bar, the page title, the brain chip, the
    refusal, the callout, the data table and the like), composed from the package's components; a state reaches a package component as a
    state tone mapped in one place, `ConditionDot` and `RoleDot`. Gaia's parts take no hooks, so their specs unfold them with
    `page/testing/ReactElementTree.ts`. The page's specs have no document at all: a component that needs hooks keeps its layout in a
    hook-free part, and a spec renders a hooked root, or a package component, which may hold hooks, with `react-dom/server`, which runs the
    hooks but no effect, as `page/shell/GaiaApp.spec.tsx` and `page/DesignSystemPackage.spec.tsx` do, or keeps the hooked package
    component folded with `ReactElementTree.unfoldedKeeping` to read and call the props a view hands it.
11. **The design system is Forge's `design-system` package, used as it is.** It is linked with `bun link design-system`, never named in
    `package.json`; link it again when an install removed it. Import each entry by its export name (`design-system/Button`,
    `design-system/design-system.css`), never by a file path; the splash, a file page that resolves no export, is the one exception.
    `page/index.html` links the package's stylesheet before Gaia's, and `page/Main.tsx` registers its fonts, which the page build emits and
    Gaia's server serves under their hashed names. Bun follows the link to the package's real folder, so `page/tsconfig.json` preserves
    symlinks, `page/testing/DesignSystemPeerPreload.ts` gives the package Gaia's own React in a test run, and the page build's
    `SingleReactPlugin` (`src/features/page-server/routes/`) resolves every React import to Gaia's own copy.

## Map

```
docs/              the architecture, the contracts reference (held to CONTRACT_VERSIONS by a spec), the backlog, the spikes' findings
resources/         the app bundle templates and the splash page
src/Main.ts        the one entry point: reads the verb, runs it, maps the app-level error to an exit code
src/features/      fleet, forge-control, page-server, launcher, app-install
src/adapters/      every boundary: the registry, the forge's API and program, Gaia's own files, Gaia's own server as the launcher asks it, the page contract,
                   the installed app bundle's Info.plist
src/services/      ForgeWatch, FleetStore, SettingsStore, Environment, the one reader of the environment, and Clock, the one reader of the clock
src/lib/           building blocks: forge-client, event-stream, process-run, atomic-file, local-http-guards
src/shared/        the internal model's types, app-wide constants, GaiaError
src/testing/       the scratch root, the test run preload, the leak check, the recordings and their mocks; test-only
page/              the browser runtime, with its own tsconfig listing exactly the shared files it may reach; drawn with the design-system package (rule 11)
page/design-system/ Gaia's own parts that the design-system package does not have, composed from the package (rule 10)
page/shared/       what several parts of the page word, show or offer alike, hoisted from a view once a second part needs it
page/@types/       the page contract (`FleetDocument`, `CommandDocument`, `FrameSessionDocument`); the server maps across it in src/adapters/page-api/, and only there
```

## Boundaries

| Outside system | Boundary util |
| --- | --- |
| Other programs: `forge`, `osascript`, `clang`, `lipo`, `codesign`, the browser | `src/lib/process-run/ProcessRun.ts` |
| HTTP to an Overseer | `src/lib/forge-client/OverseerFetch.ts` |
| The browser's debugging port | `src/features/launcher/BrowserWindowWatch.ts` |
| The file system's odd corners | `src/lib/atomic-file/AtomicFile.ts` |
| The Notification API | `page/notifications/NotificationBoundary.ts` |
| A forge's Bridge in Gaia's frame (the embed channel) | `page/views/forge-frame/EmbedChannel.ts` |
| The clock | an injected `now` and injected timers; the clock, wall and monotonic, is read only in `src/services/Clock.ts` |

Only a boundary's own specs touch the real system; every other spec mocks it with recorded answers (`src/testing/RecordedRuns.ts` for
process-run, `src/testing/RecordedAnswers.ts` for overseer-fetch, one answer set per situation of the forge), and the clock's timers with
`src/testing/ManualTimers.ts`, which a spec fires by hand, so no spec waits a real interval. Every forge answer is recorded from a real
forge; a program that is no forge on an Overseer's port is recorded from a local Bun server and stamped with Bun's version.

A boundary's real-system spec is `<Module>.recording.spec.ts`, listed in `RECORDED_BOUNDARIES` (`src/testing/BoundaryRecordings.ts`).
`bunfig.toml` keeps it out of `bun test`; `bun run record <name>` runs it and writes `src/testing/recordings/<os>/<name>.json`, stamped
with the system's version. Verify fails on a stale stamp and on a forge recording stamped `authored`, and lists a boundary with no recording
for the OS as not finished. Two recordings are stamped `authored`, and verify lists each as a warning. One is a dialog only a person can
answer: `bun run record path-chooser` asks the person at a Mac's screen to choose a folder and cancel a file, and until someone has, its
recording stays authored beside its spec. The other is `overseer-fetch-monitor-3`, the forge contracts of Flint's brain that no forge serves
yet (monitor 3 and control 2): its entry in `RECORDED_BOUNDARIES` names the forge requirements it awaits (`forgeRequirementsAwaited`),
which alone lets a forge recording be authored, and verify fails while a recorded one still names them. macOS's programs are stamped
with the Darwin release. The forge's version is read only by running it:
`GAIA_RECORDING_FORGE_PROGRAM=<a forge checkout's agent-progress.ts> bun run record <name>` runs that forge through
`src/testing/ScratchForge.ts`, under a scratch home in scratch repositories with `FORGE_ROOT` pinned to each one, so its walk up for a
tracker never reaches a board above the scratch root (an Overseer it starts launches the forge's fake agent). It records the paths, tracker
ids, ports and process ids a run draws as fixed example values, stamps the recording with the forge's install and code versions, and
verify lists it as not checked against an installed forge. `src/RealProgramRuns.spec.ts` holds the exact list of
files that may start a program another way.

The browser's recordings (`browser-window-watch`, `launcher-programs`) are taken from the Chrome or Edge in `/Applications`, which opens
visible windows and dismisses its own dialogs, and are stamped with that browser's version; verify lists them as not checked, since the
browser updates itself. A recording spec that starts the browser under the scratch home passes `--use-mock-keychain`: without it the
browser waits on the account's keychain and its windows answer no navigation.

`gaia install-app` generates `~/Applications/Gaia.app` from `resources/app-bundle/`; nothing it generates lives in the repository. Its launch
script names the bundle (`gaia launch --app-bundle <path>`), and the launcher refuses in a dialog, before it starts anything, when the
bundle's `GaiaInstallVersion` is not `GAIA_INSTALL_VERSION`. That dialog is the one place Gaia names a command for User: `gaia install-app`
is the only way the bundle is installed.

The launcher's splash (`resources/page/loading.html`) is a file page, and Gaia's server answers no cross-origin read and refuses a file
page's origin, so the splash cannot read the health route itself: the launcher follows it and moves the splash on through the browser's
debugging port, and navigates the window to Gaia's page with the session code. When Gaia already runs, no splash shows: the window opens
on the page with the code at once (PLAN 9.2).

# Coding conventions

These are rules, not preferences. Where a linter or type checker can hold a rule, it does; everything else is checked in review.

## 1. Principles

- Code explains itself. Names carry the meaning; comments are the exception.
- Every file has one clear purpose, explainable in two or three lines.
- Features never reach into each other. What two of them need is hoisted and generalized.
- Inside the application there is one internal model. Everything external is mapped in at the
  boundary and mapped back out on the way out.
- Fail closed: when the machine cannot answer, take the safe verdict.

## 2. Project layout

```
resources/            files the application reads at runtime (templates, static assets)
src/
  features/           one folder per feature; features may be grouped into sets for readability
  adapters/           every boundary: ingestion, writers, input and output mappers
  services/           shared stores, API clients and singletons that live for the app's lifecycle
  lib/                building blocks: package-grade parts of the application
  shared/             app-specific code used by several parts that is not package-grade
```

- **Features** are the implementation: what the application does for its users.
- **`lib/`** is the catalogue of building blocks. Reading it folder by folder tells a new developer
  what the application is made of. Each entry would be its own package in a monorepo.
- **`shared/`** holds code several parts need that is too app-specific to be a building block.
- **`services/`** holds stateful, app-wide things any caller may use.
- **`adapters/`** is the one home for crossing between the outside world and the internal model.

## 3. Import direction

- A feature imports its own folder, `services`, `adapters`, `lib` and `shared`. **Never another
  feature.**
- A service imports `lib`, `shared`, `adapters` and, one way only, another service.
- `shared` imports `lib` and itself.
- A `lib` package imports only the packages it declares, plus external dependencies. It never
  imports `shared`, `services`, `adapters` or a feature.
- No import cycles, at any level.
- No barrel files: a caller imports the one thing it needs from the file named after it.

## 4. Hoisting

- Code starts beside its only consumer.
- It moves only when a second consumer needs it:
  - to `lib/` if it is a generic building block (package-grade);
  - to `shared/` if it is app-specific.
- Hoisted code is generalized first: no knowledge of either original caller.
- This applies equally to utils, `@types`, constants and components.
- Nothing is hoisted in anticipation of a second consumer.

### The package test for `lib/`

1. A newcomer recognises it by name as a part of the application.
2. It depends only on other packages and external dependencies.
3. It knows nothing about its callers: no feature names, no user-facing wording, no output codes.
4. It carries its own specs and a short description, and could move to `packages/<name>/` unchanged.

## 5. Files

- **One purpose per file**, explainable in two or three lines from its path and the name of what it
  exports. A file may do several things in service of that purpose.
- **Several exports serving that one purpose are fine**; the file is named after its main export. A
  file that needs many types moves them to an `@types/` folder, as close to their use as the import
  rules allow.
- **A file earns its place.** A util object groups a domain, never holds one function; a one-line
  type or constant goes in its consumer's folder file, not in a file of its own.
- **Self-documenting.** From the purpose and the exported name, a reader can predict what is inside
  and roughly how it works.
- Files are named after their main export, in the language's usual file-name case. Folders
  are lower case, kebab-case only when two words are unavoidable.

### Folders inside a feature, service or package

| Folder | Holds |
|---|---|
| `utils/` | Pure functions, one frozen object per file: `export const DateUtil = { … } as const;` |
| `@types/` | Types, grouped by domain |
| `constants/` | Constants, grouped by domain |

- Split by domain once a file collects unrelated helpers (`HtmlUtil`, `DateUtil`), never one file
  per function.
- Callers write `DateUtil.formatDuration(…)`, so a util is greppable as one name.
- A file whose purpose is an app-wide list exports one object named as a global:
  `export const LIMITS = { … } as const;`.

## 6. The internal model and its boundaries

- **Boundaries** are every place the application meets the outside: user input, output (screens,
  terminal, rendered pages, API responses) and stored data (files, databases, caches).
- **Map in at the edge, map out at the edge.** Inside, only internal values exist. Wording, labels
  and external formats appear only at the boundary.
- **A user-facing surface may own its own text.** Its prose, messages and usage lines live beside the
  code that prints them; the boundary adapters own only the translations: internal values and error
  codes to their output, and the model to an output format. A display map exists only where the
  displayed word differs from the value.
- **Internal values are string-literal unions**, not enums, and never display text.
- **Stored data is external.** A stored format is read through an ingestion class and written
  through a separate writer, so the format can change and migrate without touching the model.
- **Ingestion is a class per stored format.** It orchestrates read → validate → migrate → map; the
  small steps are utils. A caller hands it a location and gets the domain model back.
- **A plain A → B mapping** is a util of pure mapper functions.
- **Old formats migrate on ingestion** and are stored in the current format on the next write; an
  explicit migration step may also rewrite them.

### Plain data or a domain class

- **Records that are passed around** and changed by small updates are plain typed data: interfaces
  and unions.
- **When the same compound changes recur across callers** (several records changed together,
  relationships kept in step, a log entry per change), that aggregate becomes a domain class. Its
  methods are those changes and its queries. It does no I/O.
- Decide by looking at how the data is actually used, not in advance.

### Logging from the domain

- The domain logs through one call over a typed record union (`log({ kind: 'orderShipped', orderId })`);
  the union is the vocabulary, and the domain never composes sentences.
- The logger stores structured entries; a util words them on output.
- The logger is a class only if it writes to storage itself.
- A log that no other data is derived from gets its own storage.

## 7. Errors

- **A function that decides for its caller returns a verdict**, not a throw:
  `'readable' | 'absent' | 'unreadable'`, or a result with the reason on it.
- **A domain class throws a typed domain error** carrying an internal reason code when a rule
  refuses.
- **Services wrap domain errors into one app-level error**: refused (the caller can act) versus
  unrepaired (the application will not repair it).
- **The boundary words the error and maps it to its output** (an exit code, an HTTP status, a
  message on screen), in exactly one place.
- Library code never terminates the process. Only the entry point does.

## 8. Runtime rules

- **Environment variables are read in exactly one module**, through getters (never a snapshot), each
  saying what it overrides and why.
- **No work at module load.** Importing a module resolves no paths, reads no environment and opens
  no connections or files.
- **Prefer factories of closures over classes**, except for:
  - state carried across a sequence of calls;
  - domain classes (§6);
  - ingestion classes (§6).
  A constructor does no work.
- **Every write of a file a reader may hold open is atomic**: temporary file beside the target,
  flush, rename. Never truncate then write.
- **A clock decides nothing.** Identity is a content hash; staleness is a set difference or a version
  number. Timestamps are recorded and displayed, never compared, except where an exception is
  stated in the code it applies to.
- **Index a record keyed by outside text through an own-property check**, never a bare lookup.

## 9. Generated and installed artifacts

- **Generated files never live in the source repository.** They are generated into their target
  (the build output, or the environment they are installed into).
- **Everything the application installs elsewhere carries one install version.** It changes only
  when the contract between the application and the installed artifacts changes.
- **On a version mismatch the application refuses and asks for an update.** Only what is needed to
  fix or inspect the mismatch still works.

## 10. Naming

- **Every identifier gets a full, descriptive name. No abbreviations, ever.** Write `temporaryPath`,
  not `tmp`; `remainingArguments`, not `args`. Only loop iterators (`i`) and sort comparators
  (`(a, b)`) may be one letter. Callbacks, destructured bindings and throwaway scripts are not
  exempt.
- **Name a thing for what it is or does**, never for its layer or its history, and never with a
  name that shadows a global.
- **A function that answers a question is named as the question:** `sourceIsReachable`.
- **A function that produces something is named for the product:** `invoiceTotalFor`.
- **A boolean is a predicate phrase:** `cleanupHandlersAreInstalled`.
- **Constants that are design decisions are `SCREAMING_CASE`,** named for what they bound, with the
  unit in the name: `REQUEST_TIMEOUT_MILLISECONDS`. No magic number appears inline. Arithmetic
  identities are not design decisions and stay inline: a percent of a whole (`100`), a radix, a
  division by two.
- **Everything is English:** identifiers, flags, messages, file names and comments, whatever the
  domain language.
- **Example data is obviously synthetic:** `Alex Example`, `Example Agency`.

## 11. Comments

- **No walls of text.** The code explains itself.
- **A file header** (one to three sentences) only when a file's place or purpose is not obvious from
  its path and export name.
- **A docblock** only for a non-obvious edge in a contract: a stated limit, a deliberate refusal, a
  load-bearing direction. One or two sentences.
- **An inline comment** only for a *why* the code cannot show: why this order, why this fallback,
  what was rejected. One sentence.
- **Never** restate the code, narrate history, or carry a measurement. Those belong in the commit
  message.
- **No TODOs.** Agreed-but-not-done work lives in the backlog document, with the reason it waits.

## 12. TypeScript and lint

- **Verify with the project's own typecheck, lint and test scripts**, never with ad-hoc compiler
  flags.
- **Strict compiler options:** `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`,
  `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`,
  `forceConsistentCasingInFileNames`.
- **Consequences to write for directly:**
  - read the environment with bracket access;
  - write the fallback for an indexed lookup instead of a non-null assertion;
  - build objects conditionally rather than spreading `undefined` into an optional property;
  - use `import type` for type-only imports.
- **Code that compiles for another runtime** gets its own tsconfig, listing exactly the shared files
  it may reach, plus a spec tsconfig so its specs can sit beside it.
- **Style held by the shared lint config:**
  - 2-space indent, single quotes, always semicolons;
  - line length 180 for code, 155 for comments;
  - object values aligned in one column;
  - the `from` keywords of consecutive imports aligned;
  - imports ordered builtin → external → internal, alphabetized within each group;
  - more than three named imports, or four or more object properties, go one per line;
  - arrow functions always parenthesize their parameters;
  - no `any`;
  - builtins imported with the `node:` protocol, with one style for local specifiers.

## 13. Tests

- **A spec sits beside its module:** `<Module>.spec.ts`. A second suite on the same module is
  `<Module>.<aspect>.spec.ts`.
- **A spec opens with a short docblock** saying which cases matter and why.
- **Test names are claims written as sentences:** `'leaves an unknown variable standing verbatim'`.
- **Pure functions are tested against their own contract**, not through a caller.
- **A frozen table of expected outputs** is taken from the previous implementation, never from the
  current run, and says how to retake it.
- **A test that needs a tool the machine may lack skips** through one shared guard and says what is
  missing. An environment variable can turn the skip into a failure. Skips are counted, never
  silent.
- **End-to-end suites** that run the real application sit at the layer root, named for what they
  pin.
- **Tests never touch live data.** Every test works in a scratch location, and the test helpers
  refuse to run anywhere else.

### External dependencies: gather, then mock

- **We do not unit test external dependencies.** A test checks what our code does with a system's
  answer, never what the system itself does.
- **Every interaction with an outside system sits in one util at its boundary** (git, processes and
  signals, the sandbox, sockets, the file system's odd corners, the clock). The rest of the code
  reaches that system only through the util, so a test can replace it.
- **The boundary's own specs are the only ones that touch the real system, and they gather its
  behaviour:** they record the real answer for each call shape the code makes into a frozen table,
  with a command to take it again. Example: real git runs only in the git util's specs; everything
  else never makes a real repository, branch or worktree.
- **Every other test mocks the boundary util with those recorded answers.** A call with no recorded
  answer fails the test. A test that drives a whole flow uses one answer set per stage of the flow,
  not one per call.
- **No emulators.** A mock returns recorded answers; it never imitates the system's behaviour, so
  it cannot drift from it.
- **A mock keeps the real contract, also its demands on the caller.** A mock socket that closed
  without being read hid a real two-second stall in production; the mock must fail where the real
  system fails.
- **A guard holds which specs may use a real system**, with an allowlist that is exact both ways and
  a planted case for each form it claims to catch.

### Tests and recordings

- **The test suite touches no real system, ever.** It runs on every change and before a release.
- **A boundary's real-system specs are a recording command, not tests.** They run while the boundary
  is built or changed, as its feedback loop, and write the recorded answers. Nothing runs them in
  verification or before a release: an outside system is not expected to change under us.
- **Each recording is stamped with the system's version and the OS** it came from. A check in
  verification, with no real calls, compares the installed versions with the stamps and names the
  boundary to record again.
- **A platform with no recording for a boundary is not finished** for that boundary, and the release
  says so.
- **Matrices that prove a boundary under failure** (crashes, kills, reboots) are recorded once with
  the boundary layer, and again only when that boundary changes.

### Speed

- **Tests are as fast as they can be, and this is measured.** After each round of gains, measure the
  suites per file again and take the next gains. There is no target number.
- **Speed comes from the code and the tests, not from running test files in parallel.**
- **No test waits out a production bound.** Timeouts, grace periods and poll intervals are
  injectable, and the tests set them short; a bound a child process needs reaches it through a
  documented environment getter. No fixed sleep: a wait is bounded by a setting the test controls.
- **A slow real-system test is a lead, not a fact of life.** A wait that runs out every time often
  hides a production bug.

### Isolation and leaks

- **Scratch locations live under a short root of the project's own,** never directly in a shared
  temporary folder. A crowded temporary folder slows every process started in it, and socket paths
  have a length limit.
- **A test removes everything it makes:** folders, processes, sockets, branches and worktrees.
- **A check after each suite fails the run on a leak** and names it: an entry left in the scratch
  root or the temporary folder, a process still running, a worktree or branch outside the scratch
  root, a new file in the repository, a change in the home folder.

## 14. Documentation

- **One CLAUDE.md, at the repository root.** It holds the rules and a short map of the top-level
  folders. No CLAUDE.md files inside the code: a file's path and export name are its documentation.
- **The root CLAUDE.md stays small.** It carries only what the code cannot show: rules, boundaries and
  decisions. It never carries per-file descriptions or anything a reader can learn by opening the
  folder.
- **A change that invalidates a stated rule updates the root CLAUDE.md in the same change.**
- **A backlog document** holds what is agreed and not started, with the reason it waits. It is not a
  status page.
- **One reference per fact.** A second copy of a command list, format or threshold is either
  generated from the first or deleted.

## 15. Commits

- **One plain, human-written subject line**, with the history and measurements in the body only when
  they matter.
- **No AI attribution of any kind:** no `Co-Authored-By`, no "generated with" footer.

## 16. Review checklist

- [ ] Every new file passes the purpose test: two or three lines, one main export.
- [ ] No feature imports another feature; no cycles; `lib` and `shared` import only downwards.
- [ ] Nothing hoisted without a second consumer; everything hoisted is generalized.
- [ ] External values are mapped at the boundary; no wording or external format inside.
- [ ] Names are full and self-documenting; no abbreviations; constants carry their unit.
- [ ] Comments only where a *why* would otherwise be lost.
- [ ] Errors: verdicts from deciders, typed domain errors from domain classes, one app-level error,
      output mapped once at the boundary.
- [ ] Writes are atomic; nothing reads the environment outside its one module; no work at load.
- [ ] Specs beside their modules, named as claims, working in scratch locations only.
- [ ] Outside systems reached through one boundary util; only its specs touch the real system and
      record its answers; every other test mocks those answers; no emulators.
- [ ] No test waits out a production bound or sleeps a fixed time; nothing leaks after a suite.
- [ ] The root CLAUDE.md is updated in the same change when a rule changes; no CLAUDE.md files
      anywhere else.
