# forge

A Bun + TypeScript CLI that tracks an AI orchestrator's work per repository (Gantt rows, stateful markdown tickets,
a log, and the live Bridge its Overseer serves), and installs into each tracked repository
the skills and briefs its sessions run on.

## Verify

`bun run verify` (typecheck and lint at the same time, then the default suite, the recording stamp check and the DOM
specs) after any TypeScript change, before calling it done. It makes no real call: it runs no real-system spec.
When you build or change a boundary of `src/testing/BoundarySpecs.ts`, run `bun run record <boundary>`. It runs the
real-system specs of that boundary and writes their recorded answers to `src/testing/recordings/<os>/`, stamped with
the system version and the OS. Commit the recording.
`bun run verify:integration` runs every `*.integration.spec.ts` file. Run it only when a person asks for it. To run
one spec, use `bun test --path-ignore-patterns='.claude/**' ./<path>`: a plain `bun test` finds no
`*.integration.spec.ts` file, also when its path is given.
Never ad-hoc `tsc` flags; never edit `package.json` to make a check pass.
`.githooks/pre-commit` (wired by `setup.ts`) refuses a commit failing lint or typecheck; never bypass it with
`--no-verify`.

## Rules

The owner's coding conventions; where this repository deliberately differs, Deviations says so and why. A rule a
guard spec holds is one line naming the guard: the spec is the full statement.

### Files and naming

- One purpose per file, explainable from its path and exports. A file is `PascalCase.ts`, named after its main
  export; folders are lower case. No barrel files.
- A util is one pure, frozen object grouping a domain (`LocalTimeUtil.formatLocalIso(…)`), tested against its own
  contract. A one-line type or constant lives in its consumer's folder file. An app-wide list is one global object,
  such as `LIMITS`.
- `src/UtilShape.spec.ts` holds that no exported `*Util` has fewer than two members.
- Code starts beside its only consumer and moves, generalised, on a second one; never in anticipation.
- Full, descriptive names, no abbreviations. Name a thing for what it is or does, never its layer or history, never
  shadowing a global (`CorpusMap.ts`, not `Map.ts`): a question as the question (`sourceIsReachable`), a producer
  for its product (`fullTextOf`), a boolean as a predicate phrase.
- Design constants are `SCREAMING_CASE`, named for what they bound, with the unit.
- The lifecycle components carry the names the owner decided: Overseer, Watcher, Pass, Playbook, Hatch, Customs,
  Airlock, Assistant, Baton, Regrouping, Bouncer and Bridge, in code, stored values, wording and docs alike;
  `src/ComponentNames.spec.ts` holds that no tracked file names one by its retired name.
- `eslint.config.js` holds one-letter names (`id-length`: only `i`, `a`, `b`) and inline magic numbers
  (`@typescript-eslint/no-magic-numbers`, its ignore list the arithmetic identities, off in specs, `testing/` and
  `constants/` folders); `src/LintRules.spec.ts` plants each mechanised rule's forms and exceptions.
- Everything is English. Example data is obviously synthetic: `Alex Example`, `Example Agency`.

### Imports

```
src/lib/  →  src/shared/  →  src/adapters/  →  src/services/ (render → tracker → lifecycle → control → overseer)  →  features (cli/, bridge/)
flint/  →  bridge/ (only through the entry files of flint/package.json)
```

- `src/ImportDirection.spec.ts` holds the direction, cycles, barrels, feature and sibling-command isolation, the bin
  shim, the `testing/` allowlist (`TESTING_FOLDER_IMPORTERS`), a lib package's declared "depends on" packages and
  the tracker model's isolation. What two commands share is hoisted to the level above both, or passed as a
  structurally typed parameter.
- A `src/lib/` package knows nothing about its callers: no forge names, file names, wording or exit codes.
  App values arrive as parameters; a refusal leaves as a verdict (except the `Board`, see Deviations).
- `src/lib/tracker-model/` stays DOM-safe: the Bridge project compiles it.
- `flint/` imports no file of the forge. The Bridge imports only the files that `flint/package.json` exports.
  `src/ImportDirection.spec.ts` holds this (see The flint/ package).

### Values and wording

- Internal values are string-literal unions, never display text. A display map exists only where the word differs
  from the value.
- All command-line text (confirmations, usage, argument errors, help prose) lives in `cli/`, beside the command that
  prints it; command verbs are literals, so they grep.
- `src/adapters/` holds only translations: a refusal's detail and exit code to output, the domain model to an output
  format.
- JSON output, stored files, a reason naming stored values, and a command the output suggests carry the values
  themselves, since the parser reads them back.

### Stored files

- Only the current stored format and command surface are read or answered. An older file is refused with
  `OLDER_FORMAT_ADVICE` (`src/adapters/constants/OlderFormatAdvice.ts`), held by `cli/OlderTrackerRefusal.spec.ts`.
  Nothing migrates; a retired verb, word or flag is unknown.
- A malformed stored file is a verdict and a report, never a throw that takes down `status`.
- `progress.json` keeps unknown keys, top level and on rows, in order. An optional key is written only once set, and
  a read never adds or rewrites one, so a file stays byte-identical.
- An epic is `.forge/epics/<key>.md`, known by its file name, its description kept byte for byte like a
  ticket body; the folder exists only once an epic was added. Its colour `slot` is stored at `epic add`, never derived.
- The Board logs ids and values through one `log(record)` over a typed record union (the vocabulary, no method per
  record); an adapter util words the records, the collector gathers them, the writer stores
  `.forge/log.jsonl`.
- Every name the product goes by on a machine (program, data, worktrees and monitor folders, skills, storage and
  environment prefixes, login item, Overseer port) is `PRODUCT_NAMES` in `src/shared/constants/ProductNames.ts`; every
  folder, marker, key and removal derives from it. The build is `forge` beside the released program, and
  `init` and `update` refuse `older-program-present` where the released program's data folder exists.

### Errors and exit codes

- A decider returns a verdict and fails closed.
- Library code throws `OperationRefusal` (`refused` or `unrepaired`), never writes to the terminal, never exits. A
  Board rule throws `BoardRefusal` (a reason code and facts), which the tracker pipeline wraps as `refused`.
- A refusal thrown from `src/` carries a wordless `detail`; only `cli/` builds one from words (the install-version
  mismatch is its one detail). Every printed refusal is worded by the one refusal-wording util in `src/adapters/`,
  which no service imports.
- Exit codes: 0 done or nothing to do; 1 an actionable refusal or unknown command; 2 `unrepaired` or any other
  throw. An adapter maps them, `cli/Main.ts` applies the mapping, `agent-progress.ts` exits. Four deliberate exit-0
  failures are under Deviations.

### Runtime

- The core names a port for each OS-dependent capability and never a platform. A port and its adapters live in the
  `src/lib/` package of their capability; `platformPortsFor` in `src/lib/platform-ports/PlatformPortsFor.ts` builds
  the one frozen record, `CommandContext.platformPorts`, which services take as a parameter. The Watcher has no
  context, so `watcher.ts` passes `process.platform` to `runWatcher`. A platform with no adapter gets a port that
  refuses through its own values, so a command that needs no process still runs.
- Machine setup runs before a command context exists. `setup.sh` and `setup.ps1` only make sure that Bun exists, then
  start `setup.ts`. `setup.ts` gives `process.platform` to the `SetupPlatform` port in `cli/setup/`, and
  `cli/setup/BootstrapScripts.spec.ts` holds that no setup step is in a bootstrap script.
- Four selectors sit outside that record. `FileReplaceFor.ts` reads `process.platform` at call time, since lib writes
  have no context, and keeps its moves on a platform with no adapter, since every tracker write rests on them;
  `claudeCodeAdapterFor` selects `AgentHostFacts`, since the vendor stays in `src/lib/claude-code/`; `openerFor` stays
  in `cli/`, beside its only consumer. `src/services/overseer/HeldSlotCreateFor.ts` reads `process.platform` at call
  time. The gate slots have no context, and they create through the `FileReplace` port. What lib may not read for
  itself reaches the record as `PLATFORM_HOST_FACTS` (`src/shared/PlatformHostFacts.ts`).
- `src/PlatformBoundary.spec.ts` holds that no shipping code outside the adapters reads the platform or names a
  platform primitive.
- Keep the adapter layer thin. A portable Bun or Node call stays in the core. Make an adapter only for code that is
  truly specific to a platform.
- `src/lib/platform-ports/PlatformPortsFor.spec.ts` holds that on darwin, linux and win32 each port is an adapter, and
  that an unknown platform gets the ports that refuse. `src/PlatformBoundary.spec.ts` also holds that a contract spec
  (`*.contract.spec.ts`) names each Linux, Windows and POSIX adapter and runs it on fakes; its list of exceptions is
  exact.
- Confinement: on macOS and Linux, no gate and no session runs unconfined, and `oversee` refuses where confinement is
  unavailable. On Windows, gates and sessions run unconfined by design, and no text says that a sandbox refuses
  something there.
- A document never says that a behaviour works on an OS where it never ran. `docs/development/platform-status.md`
  lists, per OS and per port, what never ran.
- The repository tooling is for the owner only, on macOS and Linux. `.claude/hooks/` is bash. `.readme-graphics/` is
  bash, with Python and JavaScript helpers. It is not part of the product, and it needs no Windows form.
- `eslint.config.js` (`CONFINED_REACHES`, the clock selectors) holds `process.env` to `src/shared/Environment.ts`,
  `process.exit` to `agent-progress.ts`, `watcher.ts` and `setup.ts` (Deviations), `process.cwd`, `homedir()` and
  the clock in `src/` and `cli/` to `cli/CommandContext.ts` (`homedir()` also to `setup.ts`), `process.platform`
  and `chmodSync` in shipping code to the sites it names, and `process.chdir` to nowhere. The environment is read
  through documented getters; specs set it in a child process (one exception, Deviations). The product's own
  variables are named from `PRODUCT_NAMES.ENVIRONMENT_PREFIX`, never as literals.
- No work at module load (entry points excepted, Deviations). The render service keeps no module state: the
  configured Marked lives in the render state the command context carries.
- Factories of closures over classes, except for state carried across calls, domain and ingestion classes. A
  constructor does no work.
- A record keyed by outside text is indexed through `Object.hasOwn`.
- A command takes everything (directory, now, streams, stdin, prompt, platform, home) from its `CommandContext`.
- Every write of a file a reader may hold open goes through the atomic-file package.
- A clock decides nothing: identity is a content hash, staleness a set difference or version; timestamps are only
  recorded and shown. Each exception says so in a comment at its site.

### Generated and installed files

- Generated files stay out of the repository; `init` and `update` install no generated file, only filled templates
  and the skills.
- One manifest, `.forge/version.json` holding `INSTALL_VERSION`, versions everything installed; no file
  carries a stamp. It is written last, so a cut-short run leaves the old version; a fresh `init` writes
  `session-instructions.md` first, so a cut-short one reads as unversioned.
- Bump `INSTALL_VERSION` by hand, in the same commit, when an installed file becomes wrong against the new CLI: a
  command, flag, JSON field, stored state or exit code it names changes meaning or goes, the SessionStart hook's
  command changes, or an installed file moves or is added; worker command lines are runtime and never installed.
  Wording and `DISPATCH_PROTOCOL` numbers do not bump it.
  In the same commit, run `bun run record src/services/overseer/InstallChangeWatch.ts`: its recording has the
  install version as its stamp, and `bun run verify` fails on a stale stamp.
  `cli/InstalledSurface.spec.ts` holds the surface side against `cli/FrozenInstalledSurface.json`.
- The version check reads only the manifest; `update` and `init` refuse a newer one. `cli/InstallVersionVerdict.spec.ts`
  holds the verdicts: equal is current; anything else, a missing manifest beside `session-instructions.md` or a version
  16 board's `agent-brief.md`, or an unreadable one is a mismatch; missing with neither is current.
- `init` and `update` never write CLAUDE.md: it holds a repository's conventions only. They remove install version 16's
  managed block once, through `removeManagedBlock`, and the hook entries, files and briefs it installed, whose names
  live in the unscanned `cli/adoption/constants/RetiredClaudeInstall.ts`.

### Comments

- The code explains itself. A file header (one to three sentences) only when path and export do not; a docblock only
  for a non-obvious contract edge; an inline comment only for a why.
- `src/CommentRuns.spec.ts` holds that no inline comment outside a docblock runs past two lines.
- Never restate code, narrate history or carry a measurement: those go in the commit message. Name files
  repo-rooted in backticks. Agreed-and-not-done work lives in `docs/backlog.md`; `no-warning-comments` in
  `eslint.config.js` holds that no TODO does.

### TypeScript and lint

- Bun runs the TypeScript; `tsc` only type-checks, under `tsconfig.json`'s strict options. Write for them:
  `process.env['NAME']`, a written fallback, conditional objects instead of spreading `undefined`.
- `eslint.config.js` holds no `!` non-null assertion, type-only imports as `type` and LF on every platform.
- `.gitattributes` keeps every text file LF on every checkout, held by `src/LineEndingPolicy.spec.ts`;
  `.bun-version` pins Bun to the locked `@types/bun` version, held by `src/BunVersionPin.spec.ts`.
- `bridge/` is its own DOM-only React project (`bridge/tsconfig.json` with `jsx: react-jsx` and `types: []`, specs
  under `bridge/tsconfig.spec.json`). Its `include` list, the whole tracker model among it, is held both ways by
  `src/ProjectIncludeLists.spec.ts`; everything the Bridge reaches stays DOM-safe.
- ESLint 9 through `@reliquary/eslint-config`, extended in `eslint.config.js`; `bun run lint` is its statement. The
  testing folders may import devDependencies.

### Tests

- There are two suites. The default suite is every `*.spec.ts` and `*.dom.tsx` file, and `bun run verify` runs it. The
  real-system suite is every `<Module>.integration.spec.ts` file; `bunfig.toml` keeps it out of `bun test`.
- `bun run verify` and the release run no real-system spec. `BOUNDARY_SPECS` in `src/testing/BoundarySpecs.ts`
  lists the real-system specs of each boundary, and `bun run record <boundary>` runs them (with the integration specs
  beside the boundary module) and writes the recording.
- The stamp check in `bun run verify` (`src/testing/CheckRecordingStamps.ts`) reads only the stamps and the installed
  versions. A stale stamp fails `verify`, and the check names the boundary and its record command.
  `SYSTEM_OF_BOUNDARY` in `src/testing/BoundaryRecordings.ts` gives the system of each boundary.
- A boundary with no recording for an OS is not finished for that OS. `bun run verify` lists each of them.
- `src/RealSystemSpecs.spec.ts` holds that a default spec makes no real process, git or socket call, that its allowlist
  is exact, and that `BOUNDARY_SPECS` lists every real-system spec and every shipping call site.
- Real git runs only in the git boundary specs (`src/lib/git/*.integration.spec.ts`); every other spec and spec
  helper uses mocks of recorded git responses. `src/RealSystemSpecs.spec.ts` holds it, with an exact allowlist.
- A spec sits beside its module as `<Module>.spec.ts` (a second suite `<Module>.<aspect>.spec.ts`), opening with a
  docblock of which cases matter and why; test names are claims. A frozen expected-output table comes from the
  previous implementation (one exception, Deviations) and says how to retake it.
- A wait in a spec is on the state itself, through `src/testing/WaitUntil.ts` or an injected clock or event, never a
  fixed sleep before an assertion; `src/SpecSleeps.spec.ts` holds it, its allowlist exact. Every spec file runs on the
  one case deadline, through the preload `src/testing/SharedCaseDeadlinePreload.ts`.
  `docs/development/guards-and-testing.md` holds the audit.
- A test needing a tool the machine may lack skips through `src/testing/ToolGuard.ts`, its title saying what is
  missing; the preload `src/testing/TestRunReport.ts` counts and names every skip, and
  `EVERY_TOOL_REQUIRED_VARIABLE` (`src/shared/Environment.ts`, built from `ENVIRONMENT_PREFIX`) set to 1 fails them.
  End-to-end suites spawning the binary sit at the layer root.
- `src/SpecSkips.spec.ts` holds that no spec skips a test other than through `src/testing/ToolGuard.ts`, and holds the
  exact list of the specs that skip when the run is root.
- A guard proves its scan found something and is watched failing on each form it claims; an allowlist is exact both
  ways.
- Tests never touch live data: every spec works under the scratch root, checked by `src/testing/TrackerIsolation.ts`;
  the binary is spawned only through `cli/testing/CliProcess.ts`.
- No spec starts a real agent session or reaches the host GnuPG: the preload `src/testing/ProgramTrapGuard.ts` puts a
  recording `claude` and a recording `gpgconf` first on the run's and every spawned binary's `PATH`, gives `Bun.which`
  and a spawn without `env` the current `PATH`, and fails the run naming the spec that reached one. Only a real-system
  spec that `BOUNDARY_SPECS` lists under a boundary of the `gpg` system removes the `gpgconf` trap, for its own file,
  through `releaseTrappedProgramForThisSpecFile` (`src/testing/ProgramTraps.ts`, held by its spec).
- A spec never opens a page, a tab or a window, and never makes the operating system act. When a run cannot get an
  answer without this action, write the answer from the documentation of that system and name the source in a
  comment. `src/SpecsOpenNoPage.spec.ts` holds that no spec or spec helper starts the default browser opener.
- `src/TestFileConventions.spec.ts` holds that no `.test.ts` or `.spec.tsx` file exists, a DOM spec is a
  `<Module>.dom.tsx` under `bridge/` or `flint/` alone, and no spec or test helper creates the real process context.
- `bun test` never runs a DOM spec: `bridge/testing/RunDomSpecs.ts` runs each `.dom.tsx` of `bridge/` and `flint/` with
  the skip report and the happy-dom preload, `bun run verify` runs it after `bun test`, and it fails when it finds none
  in either folder.

### Documentation and commits

- One CLAUDE.md, holding only rules, boundaries and decisions; a change that invalidates a rule updates it in the
  same change. forge's instructions are not in it: they are `.forge/session-instructions.md`,
  installed from `resources/templates/SessionInstructions.md` and printed by the SessionStart hook.
- `docs/backlog.md` is agreed and not started, with why it waits. `docs/cli.md` is the one reference for commands,
  flags, exit codes and file formats.
- `docs/README.md` is the documentation map.
- `src/ProseWrap.spec.ts` holds the 120-column wrap of this file, `docs/cli.md`, `docs/backlog.md`, the skills, the
  templates under `resources/templates/` and the prompts under `resources/prompts/`.
- Write new tickets, new agent prompts and new system md text (`CLAUDE.md`, skills, briefs, templates) in ASD-STE100.
  Do not use this rule for human-facing documentation. Do not rewrite existing text: the rule applies only to new text.
- A commit is one plain, human-written subject line, with no AI attribution.

### Deviations

| Rule | Done instead | Why |
| --- | --- | --- |
| Ingestion reads, validates and maps in separate steps. | The ticket parse is one line-oriented pass. | A second walk would risk the unowned lines kept byte for byte. |
| No work at module load. | `agent-progress.ts` runs the command on import, `watcher.ts` runs its Watcher, `launcher.ts` starts `agent-progress.ts`, `setup.ts` runs the machine setup, the preload `src/testing/TestRunReport.ts` registers its report, the preload `src/testing/ProgramTrapGuard.ts` installs its program traps, the preload `src/testing/SharedCaseDeadlinePreload.ts` registers its loader plugin, the preload `cli/testing/OtherProductNamesPreload.ts` registers its name swap, the fake agent `src/testing/fake-agent/FakeAgentChild.ts` plays its scenario, `bridge/Main.tsx` mounts the Bridge, `bridge/testing/RunDomSpecs.ts` runs the DOM specs, `src/testing/CheckRecordingStamps.ts` checks the recording stamps, `src/testing/RecordBoundary.ts` records a boundary, the preload `bridge/testing/HappyDom.ts` registers the DOM, `flint/demo/DemoEntry.ts` starts the demo page. | They are entry points. |
| Only `src/shared/Environment.ts` reads the environment. | `src/lib/git/GitProcess.ts` reads `Bun.env` to give the inherited environment, with the ceiling added, to git. | A `src/lib` package cannot import `src/shared/`. |
| Only `src/shared/Environment.ts` reads the environment. | `watcher.ts` reads `SystemRoot` and gives it to `runWatcher`, with a reader of any other variable, for the variables that a launch copies. | The Watcher bundle cannot reach `src/shared/`. |
| Specs never set the environment in-process. | `src/shared/Environment.integration.spec.ts` does, once; the preload `src/testing/ProgramTrapGuard.ts` prepends its traps to `PATH`; `src/services/overseer/GpgDirectories.integration.spec.ts` removes the `gpgconf` trap from `PATH` for its own file; the preload `src/testing/TestRunReport.ts` sets `TMPDIR` through `moveTemporaryFolderTo` (`src/shared/Environment.ts`, called from `src/testing/ScratchWorkspace.ts`). | It tests the getters themselves; the traps must lead every spawn's `PATH`; the real-system spec of gpgconf must reach the real gpgconf; the run and every child that it starts must use a temp folder of the run's own. |
| A frozen table comes from the previous implementation. | `cli/FrozenInstalledSurface.json` is taken from the installed files. | No previous implementation holds them. |
| Only the current stored format is read. | A ticket stored with `type` `change` or `feature` reads as `ticket` everywhere, and every write keeps its stored `type` line. | Stored tickets are never rewritten; both are older names for `ticket`. |
| Only the current stored format is read. | A stored `dispatcherState` `finished` reads as `stopped`. | Stored files are never rewritten; reading it as stopped fails closed. |
| Only the current stored format is read. | A Watcher's `watcher-<instance>.json` and event log are read in that Watcher's own `EVENT_LOG_FORMAT_VERSION` until it ends, one below `WATCHER_PROTOCOL_OLDEST_SUPPORTED` as a watch-only legacy Watcher (`src/services/overseer/LegacyWatcherReader.spec.ts`, a fixture per version). | An Overseer update must never kill or strand a running agent. |
| Only `agent-progress.ts` exits. | `watcher.ts`, the Watcher binary, exits with the code `runWatcher` in `src/lib/watcher/` returns, and imports nothing else, held by `src/ImportDirection.spec.ts` and `src/lib/watcher/WatcherBundleClosure.spec.ts`. `setup.ts` exits with the code `runSetup` in `cli/setup/` returns, and imports only `cli/`. | It is a second entry point: the Overseer bundles and spawns it, detached, once per job instance. |
| Every write of a file a reader may hold open goes through the atomic-file package. | A Watcher appends its `events-<instance>.ndjson` in place, fsynced before its `end` is written. | An append-only log is never replaced; a reader ignores an unterminated last line. |
| Every write of a file a reader may hold open goes through the atomic-file package. | The Overseer appends `overseer.log` in place, one line per write. | A log someone tails is never replaced; an atomic rewrite would break the tail. |
| A `src/lib/` package leaves a refusal as a verdict. | The tracker model's `Board` throws `BoardRefusal`. | A domain class throws a typed domain error. |
| A feature never reaches another. | `cli/overseer/routes/OverseerRoutes.ts` imports `bridge/index.html`, the one entry of `FEATURE_REACHES_BY_PATH` in `src/ImportDirection.spec.ts`. | Bundled, never imported: Bun bundles the HTML import. |
| One reference per fact. | `resources/templates/Reference.md`, installed as `.forge/reference.md`, copies three `docs/cli.md` sections verbatim (ticket format, ticket moves, exit codes); a change to either changes both, held by `cli/ReferenceCopies.spec.ts`. | Agents elsewhere cannot read `docs/cli.md`. |
| A failure exits non-zero. | `hook session-start` exits 0 whatever happens, printing nothing on failure and skipping the install check. | A failing SessionStart hook would reach every session in the repository. |
| A failure exits non-zero. | `hook bash-domains` exits 0 whatever happens, skipping the install check and answering deny through its JSON on any failure. | A hook that errors lets the call through; the deny is what keeps the network inside the ticket's line. |
| A clock decides nothing. | No launch, resume or Assistant delivery happens before the usage marker's `resetsAt`, and the Overseer wakes a DrivePass at it (`src/lib/tracker-model/Playbook.ts`, `src/services/overseer/DrivePass.ts`). | The vendor names its reset as a time, and only a clock can honour it. |
| A failure exits non-zero. | A verb relayed under a job whose reply does not come within `HATCH_REPLY_TRIES` × `HATCH_REPLY_INTERVAL_MILLISECONDS` prints `queued <requestId>` and exits 0. | The request is written; the Overseer applies it later, and the id is what a filed finding cites. |
| A clock decides nothing. | A session code that `open` issued buys no Bridge session after `SESSION_CODE_LIFETIME_MILLISECONDS` (`src/services/overseer/BrowserSessions.ts`). | A code read from a redirect file or a terminal must stop working soon after `open` issued it. |
| A clock decides nothing. | A running build or review whose event log stands still for `QUIET_JOB_SWEEPS` Overseer sweeps opens `quiet-job` (`src/services/overseer/IncidentRouter.ts`). | A hung session makes no calls, so no count of its own bounds it; sweeps come at an interval, and the incident only asks. |
| A failure exits non-zero. | A monitor registry (`~/.forge-monitor/projects.json`) that cannot be read or written, a newer version or a malformed one is reported on stderr and the command keeps its exit code. | The command's own work is done; the registry is only a pointer for a monitor. |
| Code starts beside its only consumer. | `bridge/design-system/`, and the chat parts and the ask item in `bridge/conversation/`, were built before their consumers, from the eight picked boards. | The owner ordered the design system first, so the views share one set of parts. |
| Code starts beside its only consumer. | `flint/` is a package at the root of the repository, not a folder of the Bridge. | The owner decided that Flint is a portable package. Gaia uses it after the package goes to its own repository. |
| A clock decides nothing. | Flint makes decisions from the elapsed time of its frame source: it falls asleep after a quiet time, it stops cursor play after some seconds with no pointer movement, and it stops the brain after the maximum time that the host gives to `startBrain`. | These times are animation times. The frame source gives them, and a spec gives its own frame source. Flint reads no clock. |
| `bridge/styles/tokens.css` holds every colour. | `flint/constants/Palette.ts` holds the default colour of each `--flint-*` custom property. The Bridge sets the `--flint-*` properties from its tokens in `bridge/styles/tokens.css`, with the same values in the light and the dark theme. | Flint is a portable package. It must show its colours on a page that sets no property. |

## Local rules

### Command surface

- This checkout's tracker is live, the board this repository's work runs on. Exercise the CLI under development only
  in a scratch repository: nobody runs the checkout's source here, and only the owner runs `init`, `update` or
  `clear`.
- Help is one screen, no per-command help; to stdout when asked, to stderr after an unknown command.
- Every command but `init`, `update`, `help`, `status` and `version` checks the install version first
  (`cli/Main.spec.ts`); `hook session-start` and `hook bash-domains` skip it; `oversee status` and
  `oversee stop` skip it, so an Overseer whose install changed can still be inspected and stopped.
  `stop` skips it for the same reason. `machine` and `login-item` skip it, because they write no file of
  the install. `start` checks the repository that it starts.
- The `--json` answers of `start`, `stop`, `init`, `update`, `version`, `machine` and `login-item` carry
  `answerVersion` (`cli/utils/ProgramAnswerUtil.ts`). With `--json`, a refusal of these commands is
  `{answerVersion, refusal, text}` on stdout at exit 1. A change of shape increases `answerVersion`.
- `src/TestFileConventions.spec.ts` holds that no spec starts an Overseer without `--port 0`.
- A new command is an entry in `cli/CommandTable.ts`, a block in `cli/HelpText.ts` and a folder in its set, held by
  `cli/CommandTable.spec.ts` and `cli/HelpText.spec.ts`.
- Every mutating command writes through `writeTracker` in `src/services/tracker/TrackerPipeline.ts` (lock, read into
  a Board, change, writes in `docs/cli.md`'s order, one lock hold; nothing renders), and `cli/RegisterWrittenTracker.ts`
  registers the tracker with the monitor after every write and at the Overseer's start. `init` creates a tracker;
  `update`, and `init` on an existing one, never touch its files but the `progress.html` stub. `status` takes no
  lock.

### Tickets

- Tickets are hand-edited between runs; the CLI owns a frontmatter subset (`docs/cli.md`) and writes back every
  other line.
- A ticket is its frontmatter `id`, never its file name. Ticket and task ids are never reused or gap-filled.
- Only a transition stamps `updated`. The named verbs enforce the legality matrix; `ticket status` skips it on purpose.
- `ticket add` files a draft ticket, `draft`, with no row at any priority; only `ticket ready`, after the readiness
  reading the landing shares (`TicketAcceptanceUtil`), moves it to `pending` and files its row, and no move returns a
  ticket to `draft`, not even `ticket status`. The filing cabinet's drafts are "filing drafts" in help and wording.
- A ticket's `epics` is an ordered list, the first its primary epic, written only when non-empty. An epic has no
  lifecycle: its progress is a Board roll-up over its tickets, and it never touches dispatch, claiming, concurrency or
  release, which stay `group`'s.
- A row's `history` holds only what the tool watched.
- An Overseer build job's `## Handoff` is code's: written from the builder's verified report only after its gate passes,
  replacing the section the filing template left; a builder never edits its ticket file (`docs/cli.md`, "A build job").
- A review row belongs to its ticket by `reviewOf` alone. The Bridge reads which rows are bars from the Board facts,
  and a bar's name only to order a ticket's bars.

### The Bridge

- The Bridge is the board's one page: the React live UI the Overseer serves at `GET /` from `bridge/index.html`, an
  HTML import in `cli/overseer/routes/OverseerRoutes.ts` that `src/services/overseer/OverseerServer.ts` builds with
  `Bun.build` for production and serves through `fetch`, never Bun's HTML route, which takes no headers: every file
  carries the page CSP's `frame-ancestors`. It reads the Overseer's API and nothing else, and keeps no copy of the
  rules: what it shows arrives as facts. Nothing renders a static page: `open` opens the live Overseer's URL, and
  starts the Overseer detached first when none is live, and `progress.html` is a stub that `init`, `update` and
  `oversee` write, naming that URL or saying the Overseer is down.
- The render service builds the payload from the same Board queries `status --json` prints (`BoardFacts`,
  `PagePayloadAssembly`, `MarkdownRenderer`); a ticket's `bodyHtml` and an epic's `descriptionHtml` are its only HTML.
- The detail panel claims a log line by its `taskIds` or `ticketIds`, never a number in free text; a note is matched
  by its sentence. Stamps are sliced, never re-parsed.
- A view model reads a structural type of exactly the fields it uses; tracker types satisfy it unchanged.
- A visual change leaves the README screenshots stale: once it lands, run `.readme-graphics/regenerate.sh` in the
  long-lived checkout holding that code: the script shoots its own checkout.
- `bridge/styles/tokens.css` holds every colour, state token and theme value; `bridge/styles/board.css` holds every
  class. Both are designer-owned. `bridge/StyleContract.spec.ts` holds both ways that every class a component emits is
  styled and every styled class is emitted; a `className` is a literal the scan can read.
- React's escaping is the one escape for a value: no value is escaped by hand, and a pre-escaped one would show its
  entities. `eslint.config.js` bans
  `dangerouslySetInnerHTML` and assigning `innerHTML` or `outerHTML` in `bridge/`; agent-written HTML reaches the DOM
  only as a sandboxed iframe's `srcdoc`, whose fixed markup is the one place `escapeHtml` is used, for its title, theme
  and stylesheet addresses.
- A view is `bridge/views/<view>/`: its component, and its logic in a pure `<View>Model.ts` beside it, specced as a
  plain `.spec.ts` in the main run; its behaviour is held by `.dom.tsx` specs, never a frozen markup table. A pure
  util several views use lives in `bridge/utils/` (chip parts in `bridge/chips/`), with its spec.
- `bridge/design-system/` holds the reusable components of the Bridge. A component in it knows nothing about the board,
  the routes, the API or the shell: a link comes as an `href`, an action as a callback and each word as a prop. It
  takes no `className` prop: a variant is a `data-*` attribute. `src/ImportDirection.spec.ts` holds its imports.
- `bridge/shell/` holds what the entry starts with: the hash router, the theme bootstrap, the embedded channel (theme in
  and Esc out by `postMessage`, only with the framing parent's origin), the banners and the error boundary.
  `bridge/api/` holds the clients of the Overseer's API. Every control sends its `ControlCommand` through
  `useControlCommand` (`bridge/shell/ControlCommandSender.ts`): a `CommandButton`, or the Send button and Enter of the
  composer, `bridge/conversation/Composer.tsx`. The control is disabled while the event stream is down or launches are
  held, and it shows its refusal verbatim. The one post that is not a `ControlCommand` is the picture upload:
  `bridge/api/PictureUploadClient.ts` posts the bytes of a picture to `/api/pictures` before the command that names the
  picture.
- `eslint.config.js` holds the Bridge's browser storage to `bridge/preferences/PreferenceStore.ts`, keys under
  `<STORAGE_PREFIX>:<trackerId>` and the theme under `<STORAGE_PREFIX>:theme`.
- `bridge/HeadlessBridge.integration.spec.ts` loads the Bridge from a real Overseer in headless Chrome and fails on a
  console error, an exception or a failed request; it skips through `src/testing/ToolGuard.ts` without Chrome.

### The flint/ package

- `flint/` is Flint, the sprite of the forge agents, as a portable package. It has its own `package.json`,
  `tsconfig.json`, `tsconfig.spec.json` and `README.md`. The folder can go to its own repository with no change to a
  source file.
- No file in `flint/` imports a file outside `flint/`. A file that ships does not import a `bun:` module or a `node:`
  module. Only `flint/react/` imports React. `flint/PackageIsolation.spec.ts` holds this.
- `bun run typecheck` checks `flint/tsconfig.json` and `flint/tsconfig.spec.json`. The project uses only the DOM
  library and no Bun or Node types. `src/ProjectIncludeLists.spec.ts` holds that its `include` list names only its own
  folder.
- Flint makes no network call, calls no model, and reads no clock and no browser storage. The time comes from a frame
  source that the host can replace. The host gives a storage port. `eslint.config.js` holds the clock, the markup, the
  network and the storage in `flint/`.
- Flint adds no global CSS. The renderer makes each element with `createElementNS` and sets only attributes. Each
  colour is a `--flint-*` custom property with its default.
- There is one Flint on a document. A second `createFlint` on the same document is refused.
- Flint knows no component of the host. It knows only the cue names that the host sends and its own list of intents.
  The host gives the home element, the habitats and the policy that selects the habitat to visit.
- A behaviour, a gesture, an emote and sleep each give only a part of the target pose. `flint/PoseComposition.ts` puts
  the parts together in one order: behaviour, gesture, emote, sleep, reduced motion. Only `flint/PoseEasing.ts` eases.
  The renderer knows nothing about behaviour.
- The mind and the pose are pure, with plain `.spec.ts` specs. The renderer and `createFlint` have `.dom.tsx` specs. A
  spec gives a manual frame source (`flint/testing/ManualFrameSource.ts`) and never waits for real time.
- Each value of the design handoff is a named constant in `flint/constants/`, with its unit in its name.
- `flint/demo/index.html` shows each animation of the design handoff through `createFlint`, `perform` and `steer`. The
  command in `flint/README.md` builds it into one file in `flint/demo/build/`. Git ignores this folder.
- `bridge/flint/` is the host of Flint in the Bridge. `bridge/flint/BridgeFlint.tsx` gives the home corner at the
  bottom right, the storage port on `bridge/preferences/PreferenceStore.ts` for each board, and the visit target. The
  visit target is the habitat that User last focused or clicked. An element with `data-flint-workplace` around a
  habitat, such as the chat card, counts as part of that habitat.
- The habitats of the Bridge are the chat thread (`bridge/conversation/ChatThread.tsx`) and the Agents view
  (`bridge/views/agents/`). A habitat makes its cues from the data that its component gets. It never reads text from
  the page and never calls a model. `bridge/flint/BridgeFlint.dom.tsx` holds the host.

### Skills

- Two skills, split by audience. `skills/agent-po/` is PO intake: it loads in any session asked to file a ticket and
  as an Overseer product-owner job's first line, holds the whole filing procedure, files every ticket as a draft with a
  numbered Acceptance and a `## Brief`, and readies drafts only on User's yes in User's own session (under the Overseer
  it closes intake instead); it loads no other skill. `skills/agent-progress-orchestrate/` is the interactive wrapper
  around a running Overseer (`oversee`): it reads its state, starts it on User's go, turns User's intent into verbs,
  loads `forge-po` for intake and may wait on `await`; it never drives the lifecycle or handles an incident, which
  are the Overseer's and its Assistant's.
- No agent preloads a skill, and nothing installs a worker definition. An Overseer's roles read the instruction files
  `pipeline.json` names, by default the ones `init` and `update` install in the data folder's `briefs/defaults/`, and
  fixed prompts under `resources/prompts/`.
- No skill file lists commands: `forge help` is the reference. Both skills name it and
  `.forge/reference.md`, installed from `resources/templates/Reference.md`, which holds only what help does
  not print and follows `docs/cli.md`.
- A `SKILL.md` `description` is its trigger, naming the words a user says. Skill files cite only commands, paths in
  a tracked repository, or files beside them; naming a skill the host may offer, such as `grill-me`, is no citation.
- `skills/agent-progress-orchestrate/` repeats nothing from `skills/agent-po/`, writes rules as instructions,
  and never restates what the Overseer decides. Call budgets and the rework threshold are `DISPATCH_PROTOCOL`
  (`src/shared/constants/DispatchProtocol.ts`), stated by the Overseer's job prompts and never by an installed file.
  Neither skill nor the installed guidance names a by-hand lifecycle verb but `ticket deliver --by-hand`, held by
  `cli/HelpText.spec.ts`.
- `init` and `update` copy both into the tracked repository's git-ignored `.claude/skills/`, never globally, and
  remove the files a retired skill folder installed there with its `.gitignore` entry; `setup.ts` only removes the
  `~/.claude/skills/` symlinks into this checkout that earlier versions made.
