# forge

A Bun + TypeScript CLI that tracks an AI orchestrator's work per repository (Gantt rows, stateful markdown tickets,
a log, and the API its Overseer serves), and installs into each tracked repository
the skills and briefs its sessions run on.

forge is the app in `apps/forge/` of a Bun workspace. The repository root holds the workspace: its `package.json`,
the one `bun.lock`, `.bun-version`, `bunfig.toml`, `.gitattributes`, `.githooks/`, `turbo.json` and `.claude/`.
`bun install` runs at the root. The packages forge uses are in `packages/`. In this file, in `.claude/rules/` and in
`docs/`, a path names a file of forge from `apps/forge/`, and a file of the root or of a package from the
repository root (`packages/forge-contracts/…`).

## Verify

`bun run verify` (typecheck and lint at the same time, then the default suite and the recording stamp check) after
any TypeScript change, before calling it done. It makes no real call: it runs no real-system spec.
When you build or change a boundary of `src/testing/BoundarySpecs.ts`, run `bun run record <boundary>`. It runs the
real-system specs of that boundary and writes their recorded answers to `src/testing/recordings/<os>/`, stamped with
the system version and the OS. Commit the recording.
`bun run verify:integration` runs every `*.integration.spec.ts` file. Run it only when a person asks for it. To run
one spec, use `bun test --path-ignore-patterns='.claude/**' ./<path>`: a plain `bun test` finds no
`*.integration.spec.ts` file, also when its path is given.
Never ad-hoc `tsc` flags; never edit `package.json` to make a check pass.
At the repository root, `bun run verify` runs these tasks for every workspace through Turborepo.
`.githooks/pre-commit` (wired by `setup.ts`) refuses a commit failing the root's lint or typecheck; never bypass it
with `--no-verify`.

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
- The lifecycle components carry the names the owner decided: Overseer, Talos, Pass, Playbook, Hatch, Customs,
  Airlock, Assistant, Baton, Regrouping and Bouncer, in code, stored values, wording and docs alike;
  `src/ComponentNames.spec.ts` holds that no tracked file names one by its retired name.
- The role that designs a board's pipeline is the pipeline agent: `pipeline-agent` as a job kind and role,
  `pipelineAgent` as a `pipeline.json` role key.
- `eslint.config.js` holds one-letter names (`id-length`: only `i`, `a`, `b`) and inline magic numbers
  (`@typescript-eslint/no-magic-numbers`, its ignore list the arithmetic identities, off in specs, `testing/` and
  `constants/` folders); `src/LintRules.spec.ts` plants each mechanised rule's forms and exceptions.
- Everything is English. Example data is obviously synthetic: `Alex Example`, `Example Agency`.

### Imports

```
src/lib/  →  src/shared/  →  src/adapters/  →  src/services/ (render → tracker → lifecycle → control → store → overseer)  →  cli/
packages/forge-contracts/, packages/system-versions/  →  src/shared/ and every layer above it (by name)
packages/forge-contracts/  →  src/adapters/board-document/ (the board document's mappers), src/adapters/board-commands/ (the commands')
```

- `src/ImportDirection.spec.ts` holds the direction, cycles, barrels, sibling-command and command-set isolation, the bin
  shim, the `testing/` allowlist (`TESTING_FOLDER_IMPORTERS`), a lib package's declared "depends on" packages and
  the tracker model's isolation. What two commands share is hoisted to the level above both, or passed as a
  structurally typed parameter.
- A `src/lib/` package knows nothing about its callers: no forge names, file names, wording or exit codes.
  App values arrive as parameters; a refusal leaves as a verdict (except the `Board`, see Deviations).
- A package in `packages/` imports no file of an app. forge imports a package only by its name and only when
  `package.json` declares it as a `workspace:^` dependency, never by a file path. Every declared package is one
  workspace-package layer, and it imports another package only when its own `package.json` declares it.
  `src/ImportDirection.spec.ts` holds this.

### Values and wording

- Internal values are string-literal unions, never display text. A display map exists only where the word differs
  from the value.
- All command-line text (confirmations, usage, argument errors, help prose) lives in `cli/`, beside the command that
  prints it; command verbs are literals, so they grep.
- `src/adapters/` holds only translations: a refusal's detail and exit code to output, the domain model to an output
  format.
- A served contract document is built only by a typed mapper that names each field, never by spreading a model record
  into it, so a field the model gains reaches no client until a mapper names it. The model, the readings and the
  refusal wording stay in forge; `packages/forge-contracts/README.md` says what the contract holds.
- JSON output, stored files, a reason naming stored values, and a command the output suggests carry the values
  themselves, since the parser reads them back.
- User runs no command. A sentence that the API, a monitor or an agent shows names no command line, no flag and no
  client. It names a neutral action, such as "update the board". `OperationRefusalWordingUtil.apiMessageOf` words a
  refusal for the API; `messageOf` words it for the command line, which keeps its commands.
- The Overseer API has one system version, `FORGE_SYSTEM_VERSIONS` in `packages/forge-contracts`. A review of a change
  to a route, a document, a command or a message asks two questions. Does the change only add? Then increase the
  minor. Does it remove or change a thing that a supported client needs? Then increase the major, and serve the
  endpoint at its next version beside the old one, with an entry in `FORGE_COMPATIBILITY_REGISTRY`.
  `docs/reference/overseer-api.md`, "System versions", has the rule.

### Stored files

- Only the current stored format and command surface are read or answered. An older file is refused with
  `OLDER_FORMAT_ADVICE` (`src/adapters/constants/OlderFormatAdvice.ts`), held by `cli/OlderTrackerRefusal.spec.ts`.
  Nothing migrates; a retired verb, word or flag is unknown.
- A malformed stored file is a verdict and a report, never a throw that takes down `status`.
- `progress.json` keeps unknown keys, top level and on rows, in order; a write moves an integer-named key to the front
  (`docs/cli.md`). An optional key is written only once set, and a read never adds or rewrites one, so a file stays
  byte-identical.
- An epic is `.forge/epics/<key>.md`, known by its file name, its description kept byte for byte like a
  ticket body; the folder exists only once an epic was added. Its colour `slot` is stored at `epic add`, never derived.
- The Board logs ids and values through one `log(record)` over a typed record union (the vocabulary, no method per
  record); an adapter util words the records, the collector gathers them, the writer stores
  `.forge/log.jsonl`.
- The core reaches a stored record only through the store port, `BoardStore` in `src/services/store/BoardStore.ts`:
  commands through its command face, the Overseer's pass through its transaction face, every read through its read
  side. Its one adapter, `LocalFilesBoardStore`, is the only code that names a record's path or judges a stored
  pipeline; `src/StoreBoundary.spec.ts` holds it, and `src/services/store/BoardStore.contract.spec.ts` is what any
  adapter must pass.
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
  throw. An adapter maps them, `cli/Main.ts` applies the mapping, `agent-progress.ts` exits. Five deliberate exit-0
  failures are under Deviations.

### Runtime

- The core names a port for each OS-dependent capability and never a platform. A port and its adapters live in the
  `src/lib/` package of their capability; `platformPortsFor` in `src/lib/platform-ports/PlatformPortsFor.ts` builds
  the one frozen record, `CommandContext.platformPorts`, which services take as a parameter. Talos has no context,
  so `talos.ts` passes `process.platform` to `runTalos`. A platform with no adapter gets a port that
  refuses through its own values, so a command that needs no process still runs.
- Machine setup runs before a command context exists. `setup.sh` and `setup.ps1` only make sure that Bun exists, then
  start `setup.ts`. `setup.ts` gives `process.platform` to the `SetupPlatform` port in `cli/setup/`, and
  `cli/setup/BootstrapScripts.spec.ts` holds that no setup step is in a bootstrap script.
- Three selectors sit outside that record. `FileReplaceFor.ts` reads `process.platform` at call time, since lib writes
  have no context, and keeps its moves on a platform with no adapter, since every tracker write rests on them;
  `claudeCodeAdapterFor` selects `AgentHostFacts`, since the vendor stays in `src/lib/claude-code/`.
  `src/services/overseer/HeldSlotCreateFor.ts` reads `process.platform` at call time. The gate slots have no context,
  and they create through the `FileReplace` port. What lib may not read for itself reaches the record as
  `PLATFORM_HOST_FACTS` (`src/shared/PlatformHostFacts.ts`).
- `src/PlatformBoundary.spec.ts` holds that no shipping code outside the adapters reads the platform or names a
  platform primitive.
- `src/AgentBoundary.spec.ts` holds that no shipping code outside the agent port's adapter (`src/lib/claude-code/` and
  the fake agent's files), comments included, names the vendor, and that no testing helper names it but on its listed
  lines; `src/ImportDirection.spec.ts` holds that only `cli/CommandContext.ts` and the fake agent import it.
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
  one Python script. It is not part of the product, and it needs no Windows form.
- `eslint.config.js` (`CONFINED_REACHES`, the clock selectors) holds `process.env` to `src/shared/Environment.ts`,
  `process.exit` to `agent-progress.ts`, `talos.ts` and `setup.ts` (Deviations), `process.cwd`, `homedir()` and
  the clock in `src/` and `cli/` to `cli/CommandContext.ts` (`homedir()` also to `setup.ts`), `process.platform`
  and `chmodSync` in shipping code to the sites it names, and `process.chdir` to nowhere. The environment is read
  through documented getters; specs set it in a child process (one exception, Deviations). The product's own
  variables are named from `PRODUCT_NAMES.ENVIRONMENT_PREFIX`, never as literals.
- No work at module load (entry points excepted, Deviations).
- Factories of closures over classes, except for state carried across calls, domain and ingestion classes. A
  constructor does no work.
- A record keyed by outside text is indexed through `Object.hasOwn`.
- A command takes everything (directory, now, streams, stdin, prompt, platform, home) from its `CommandContext`.
- Every write of a file a reader may hold open goes through the atomic-file package.
- A clock gives no fact. Identity is a content hash. Staleness of data is a set difference or a version. The order of
  work is a sequence number. A timestamp is recorded and shown, and it can order or select only what is shown.
- A clock measures real time: a connection, a heartbeat, a timeout, a grace time, a lifetime, a poll interval, a sync
  interval, an animation, and an instant that an outside system names. Use a clock where a thing that runs now must
  answer, report or end in an actual time.
- A limit that looks back on work is a count of calls, sessions, rounds, resumes, tries or failed passes, never an
  elapsed time. A project with no work for a week did nothing wrong: after that week each count reads the same.
- Where code does not obey these three clock rules, a comment at its site says so.

### Generated and installed files

- Generated files stay out of the repository; `init` and `update` install no generated file, only filled templates
  and the skills.
- One manifest, `.forge/version.json` holding `INSTALL_VERSION`, versions everything installed; no file
  carries a stamp. It is written last, so a cut-short run leaves the old version; a fresh `init` writes
  `session-instructions.md` first, so a cut-short one reads as unversioned.
- Bump `INSTALL_VERSION` by hand, in the same commit, when an installed file becomes wrong against the new CLI: a
  command, flag, JSON field, stored state or exit code it names changes meaning or goes, the agent's session-start
  entry's command changes, a placeholder the launch fills in an installed brief is renamed, or an installed file moves
  or is added; worker command lines are runtime and never installed. Wording and `DISPATCH_PROTOCOL` numbers do not bump
  it.
  In the same commit, run `bun run record src/services/overseer/InstallChangeWatch.ts`: its recording has the
  install version as its stamp, and `bun run verify` fails on a stale stamp.
  `cli/InstalledSurface.spec.ts` holds the surface side against `cli/FrozenInstalledSurface.json`.
- The version check reads only the manifest; `update` and `init` refuse a newer one. `cli/InstallVersionVerdict.spec.ts`
  holds the verdicts: equal is current; anything else, a missing manifest beside `session-instructions.md`, or an
  unreadable one is a mismatch; missing with neither is current.
- `init` and `update` never write a repository's own instruction file: it holds a repository's conventions only. What
  an older install left there or beside it, they leave; its owner removes it by hand.

### Comments

- The code explains itself. A file header (one to three sentences) only when path and export do not; a docblock only
  for a non-obvious contract edge; an inline comment only for a why.
- `src/CommentRuns.spec.ts` holds that no inline comment outside a docblock runs past two lines.
- Never restate code, narrate history or carry a measurement: those go in the commit message. Name files in
  backticks, by the path the head of this file sets. Agreed-and-not-done work lives in `docs/backlog.md`;
  `no-warning-comments` in `eslint.config.js` holds that no TODO does.

### TypeScript and lint

- Bun runs the TypeScript; `tsc` only type-checks, under `tsconfig.json`'s strict options. Write for them:
  `process.env['NAME']`, a written fallback, conditional objects instead of spreading `undefined`.
- `eslint.config.js` holds no `!` non-null assertion, type-only imports as `type` and LF on every platform.
- The root's `.gitattributes` keeps every text file LF on every checkout, held by `src/LineEndingPolicy.spec.ts`; the
  root's `.bun-version` pins Bun to the `@types/bun` version that `bun.lock` locks, held by
  `src/BunVersionPin.spec.ts`.
- ESLint 9 through `@reliquary/eslint-config`, extended in `eslint.config.js`; `bun run lint` is its statement. The
  testing folders may import devDependencies.

### Tests

- There are two suites. The default suite is every `*.spec.ts` file, and `bun run verify` runs it. The
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
  comment. `src/SpecsOpenNoPage.spec.ts` holds that no spec or spec helper starts a program that opens the default
  browser (`open`, `xdg-open`, the Windows handler).
- `src/TestFileConventions.spec.ts` holds that no `.test.ts`, `.spec.tsx` or `.dom.tsx` file exists, since forge has
  no page and runs no DOM spec, and that no spec or test helper creates the real process context.

### Documentation and commits

- `CLAUDE.md` holds the rules that apply to all work on forge. A file in the root's `.claude/rules/` holds the rules
  of one area, and its `paths` list names the folders where it applies, from the repository root. A rule is in one
  file only. These files hold only rules, boundaries and decisions; a change that invalidates a rule updates it in the
  same change.
- Changes to the files in the root's `.claude/rules/` are the owner's. The agent of a ticket cannot make them: the
  folder is outside forge's project folder and its reach, and Customs protects `.claude/` at any depth for a tracker
  in a folder. When a ticket makes a rule there wrong, its handoff names the rule, and the owner changes the file
  outside a ticket. `CLAUDE.md` is not protected: a ticket changes it in the same change.
- forge's instructions are not in these files: they are `.forge/session-instructions.md`, installed from
  `resources/templates/SessionInstructions.md` and printed by the agent's session-start entry.
- `docs/backlog.md` is agreed and not started, with why it waits. `docs/cli.md` is the one reference for commands,
  flags, exit codes and file formats.
- `docs/README.md` is the documentation map.
- `src/ProseWrap.spec.ts` holds the 120-column wrap of this file, the files in `.claude/rules/`, `docs/cli.md`,
  `docs/backlog.md`, the skills, the templates under `resources/templates/` and the prompts under
  `resources/prompts/`.
- Write new tickets, new agent prompts and new system md text (`CLAUDE.md`, skills, briefs, templates) in ASD-STE100.
  Do not use this rule for human-facing documentation. Do not rewrite existing text: the rule applies only to new text.
- A commit is one plain, human-written subject line, with no AI attribution.

### Trackers in a repository

- A change to forge keeps forge's behaviour in every other project, or it is an opt-in feature or a versioned change.
  A need of this repository alone goes in the root's files, not in forge.
- A tracker at its repository's root with no branch namespace and no entities asks git exactly what it asked before a
  tracker could sit in a folder or hold entities. `cli/overseer/OverseerBuildJob.spec.ts` holds this against
  `cli/overseer/FrozenRootTrackerGitCalls.json`.
- Only a tracker at its repository's root holds entities. Each git call that entities add runs only when the pipeline
  has entities. A job of an entity changes only the homes and the `reach` of its entity. In stage 1 it can also write a
  proposal in a package that its entity whitelists. A later stage of the ticket does not change a sealed package
  change. Customs V17 sends its session back one time for a change outside its entity or to a sealed change, and a
  second such refusal fails the job.
- `src/services/tracker/ProjectLocation.ts` gives the five names of a tracker's place: `repositoryRoot`,
  `projectDirectory`, `projectPrefix`, `worktreeRoot` and `projectDirectoryInWorktree`. Use these names in code and
  docs. `src/shared/utils/ProjectPathsUtil.ts` maps a project path to a repository path, which starts with `/`.
- Git runs at a toplevel only: `repositoryRoot` for the main line, `worktreeRoot` for a job. A session in a job's
  worktree starts at `worktreeRoot` and is told the project folder; any other session, a gate and a prepare step start
  in the project folder of their checkout. A resumed session starts where it first started when its agent finds it by
  that folder. `src/GitRunsAtAToplevel.spec.ts`, `src/services/overseer/SessionPlace.spec.ts` and
  `src/services/lifecycle/GateRun.projectFolder.spec.ts` hold this.
- A tracker in a folder has a branch namespace. It changes only its own folder and the paths of its `reach`, and it
  watches only its own refs; Customs holds both. The trackers of a repository meet in `<git common dir>/forge/`, and
  each file there carries a `version`. `docs/cli.md`, "Trackers in a repository", has the rule.

### Deviations

| Rule | Done instead | Why |
| --- | --- | --- |
| Ingestion reads, validates and maps in separate steps. | The ticket parse is one line-oriented pass. | A second walk would risk the unowned lines kept byte for byte. |
| No work at module load. | `agent-progress.ts` runs the command on import, `talos.ts` runs its Talos, `src/lib/talos/SynchronousCallsThread.ts` answers Talos's synchronous calls as its worker's entry module, `launcher.ts` starts `agent-progress.ts`, `setup.ts` runs the machine setup, the preload `src/testing/TestRunReport.ts` registers its report, the preload `src/testing/ProgramTrapGuard.ts` installs its program traps, the preload `src/testing/SharedCaseDeadlinePreload.ts` registers its loader plugin, the preload `src/testing/TalosOfTheNextProtocolPreload.ts` registers its loader plugin in a Talos a spec spawns, the preload `cli/testing/OtherProductNamesPreload.ts` registers its name swap, the fake agent `src/testing/fake-agent/FakeAgentChild.ts` plays its scenario, `src/testing/CheckRecordingStamps.ts` checks the recording stamps, `src/testing/RecordBoundary.ts` records a boundary. | They are entry points. |
| Only `src/shared/Environment.ts` reads the environment. | `src/lib/git/GitProcess.ts` reads `Bun.env` to give the inherited environment, with the ceiling added, to git. | A `src/lib` package cannot import `src/shared/`. |
| Only `src/shared/Environment.ts` reads the environment. | `talos.ts` reads `SystemRoot` and gives it to `runTalos`, with a reader of any other variable, for the variables that a launch copies. | Talos imports nothing outside `src/lib/talos/` and the packages it declares, so it cannot reach `src/shared/` (`src/lib/talos/TalosClosure.spec.ts`). |
| Specs never set the environment in-process. | `src/shared/Environment.integration.spec.ts` does, once; the preload `src/testing/ProgramTrapGuard.ts` prepends its traps to `PATH`; `src/services/overseer/GpgDirectories.integration.spec.ts` removes the `gpgconf` trap from `PATH` for its own file; the preload `src/testing/TestRunReport.ts` sets `TMPDIR` through `moveTemporaryFolderTo` (`src/shared/Environment.ts`, called from `src/testing/ScratchWorkspace.ts`). | It tests the getters themselves; the traps must lead every spawn's `PATH`; the real-system spec of gpgconf must reach the real gpgconf; the run and every child that it starts must use a temp folder of the run's own. |
| A frozen table comes from the previous implementation. | `cli/FrozenInstalledSurface.json` is taken from the installed files. | No previous implementation holds them. |
| A frozen table comes from the previous implementation and is retaken on a change. | `src/lib/talos/FrozenTalosHandshake.json` is never retaken: `src/lib/talos/TalosHandshake.frozen.spec.ts` holds that each frozen `hello` reads as itself, each frozen answer is written byte for byte, and the three frames' keys equal the table's. | The first frame of every Talos protocol is read by `helloFrameOf` alone and must never change, so an Overseer of any version can tell a Talos of another (design decision 6). |
| External values are mapped into their type at the boundary. | Talos's `clientFrameOf` maps a `launch` frame with its launch left `unknown` (`ReceivedClientFrame`); `childLaunchOf(value, boardFolder)` maps it at the launch, and a malformed launch is answered `done` with the frame's own `frameId`. A launch names no endpoint, so it is checked against none. | A launch's folders are read against the board folder, which the frame parser does not know, and a frame whose launch is malformed still gets its answer. |
| An older file is refused with `OLDER_FORMAT_ADVICE`. | A `pipeline.json` of an earlier format is refused with its own `older-pipeline` wording: set the pipeline up again (`cli/OlderPipelineRefusal.spec.ts`). | No release converts a pipeline, so `update` with an earlier program would not help. |
| Only the current stored format is read. | A ticket stored with `type` `change` or `feature` reads as `ticket` everywhere, and every write keeps its stored `type` line. | Stored tickets are never rewritten; both are older names for `ticket`. |
| Only the current stored format is read. | A stored `dispatcherState` `finished` reads as `stopped`. | Stored files are never rewritten; reading it as stopped fails closed. |
| Only the current stored format is read. | A stored open `pipeline-proposal` decision is read, and the Playbook withdraws it at the next pass. | Stored files are never rewritten. The one-shot proposal that the decision accepts is retired. |
| Only the current stored format is read. | A `log.jsonl` record with the job kind or role `onboarder` reads as `pipeline-agent`. | The log is append-only and is never rewritten. |
| Only `agent-progress.ts` exits. | `talos.ts`, the Talos binary, exits with the code `runTalos` in `src/lib/talos/` returns, and imports nothing else, held by `src/ImportDirection.spec.ts` and `src/lib/talos/TalosClosure.spec.ts`. `setup.ts` exits with the code `runSetup` in `cli/setup/` returns, and imports only `cli/`. | It is a second entry point: the Overseer spawns it, detached, once per board. |
| Every write of a file a reader may hold open goes through the atomic-file package. | Talos appends a child's `events-<instance>.ndjson` in place, fsynced before the child's `end` is written. | An append-only log is never replaced; a reader ignores an unterminated last line. |
| Every write of a file a reader may hold open goes through the atomic-file package. | The Overseer appends a gate profile's output to `<data>/gate-profile-runs/<P>.ndjson` in place, outside the hold, one line for each piece. | The output stream is append-only and is never replaced; a reader ignores an unterminated last line. |
| Every write of a file a reader may hold open goes through the atomic-file package. | The Overseer appends `overseer.log` in place, one line per write. | A log someone tails is never replaced; an atomic rewrite would break the tail. |
| A `src/lib/` package leaves a refusal as a verdict. | The tracker model's `Board` throws `BoardRefusal`. | A domain class throws a typed domain error. |
| One reference per fact. | `resources/templates/Reference.md`, installed as `.forge/reference.md`, copies three `docs/cli.md` sections verbatim (ticket format, ticket moves, exit codes); a change to either changes both, held by `cli/ReferenceCopies.spec.ts`. | Agents elsewhere cannot read `docs/cli.md`. |
| A failure exits non-zero. | `hook session-start` exits 0 whatever happens, printing nothing on failure and skipping the install check. | A failing session-start entry would reach every session in the repository. |
| A failure exits non-zero. | `hook bash-domains` exits 0 whatever happens, skipping the install check and answering deny through its JSON on any failure. | A hook that errors lets the call through; the deny is what keeps the network inside the ticket's line. |
| A failure exits non-zero. | `hook stage-edits` exits 0 whatever happens, skipping the install check and answering deny through its JSON on any failure. | A hook that errors lets the call through; the deny is what keeps the file edits of a job of an entity inside its stage's folders. |
| A failure exits non-zero. | A verb relayed under a job whose reply does not come within `HATCH_REPLY_TRIES` × `HATCH_REPLY_INTERVAL_MILLISECONDS` prints `queued <requestId>` and exits 0. | The request is written; the Overseer applies it later, and the id is what a filed finding cites. |
| A clock measures real time. | A running build or review whose event log stands still for `QUIET_JOB_SWEEPS` Overseer sweeps opens `quiet-job` (`src/services/overseer/IncidentRouter.ts`). An Assistant that is quiet in a turn for the same number of sweeps is ended (`src/services/overseer/AssistantSession.ts`). The two watches count sweeps and read no clock. | The two watches are older than this rule. A running session must report in an actual time, so each watch becomes a time bound; this change is not done. |
| A failure exits non-zero. | A monitor registry (`~/.forge-monitor/projects.json`) that cannot be read or written, a newer version or a malformed one is reported on stderr and the command keeps its exit code. | The command's own work is done; the registry is only a pointer for a monitor. |
| Code starts beside its only consumer; never in anticipation. | `src/services/overseer/SessionConfinement.ts` wraps a session in forge's `GateConfinement` when its agent adapter declares `ownConfinement: 'none'`, though Claude Code, the one adapter, confines its sessions itself. | The owner's rule of 2026-11-18 makes a session's confinement the port's declaration, not an assumption about the vendor; the path is held by specs over a planted adapter and by the contract integration spec. |
| Code starts beside its only consumer and moves, generalised, on a second one. | The store port `BoardStore` (`src/services/store/BoardStore.ts`) has one adapter, `LocalFilesBoardStore`, and a contract spec, `src/services/store/BoardStore.contract.spec.ts`, that any adapter must pass; `src/StoreBoundary.spec.ts` holds that no shipping code outside the adapter names a record's path. | The forge keeps a remote store possible (`docs/monorepo/hephaestus-talos.md`, sections 4 and 5): the seam is fixed before a second adapter exists, and the contract is what a second adapter must pass. |
| Code names no agent vendor (`src/AgentBoundary.spec.ts`). | The model tiers `haiku`, `sonnet`, `opus` and `fable` and the efforts up to `max` are forge's tier words in the model, the pipeline and the views. | A pipeline names a tier and an effort; the agent adapter maps them to its own models (`src/lib/tracker-model/constants/AgentSettings.ts:5-7`). |

## Local rules

### Command surface

- This checkout's tracker is live, the board this repository's work runs on. Exercise the CLI under development only
  in a scratch repository: nobody runs the checkout's source here, and only the owner runs `init`, `update` or
  `clear`.
- The network guard (`hook bash-domains`) starts only from a program outside the tracked folder.
  `src/services/overseer/GuardCommand.ts` refuses a runtime or an entry script inside it, and the job's shell commands
  and web fetches are then denied. The stage edit guard (`hook stage-edits`) of a job of an entity starts from the same
  program; when it cannot, the job's file edits are denied. The owner keeps this
  guard as it is. Thus the installed forge
  that runs this repository's trackers is a second clone outside this repository, updated by pulling.
- Help is one screen, no per-command help; to stdout when asked, to stderr after an unknown command.
- Every command but `init`, `update`, `help`, `status` and `version` checks the install version first
  (`cli/Main.spec.ts`); `hook session-start`, `hook bash-domains` and `hook stage-edits` skip it; `oversee status`
  and `oversee stop` skip it, so an Overseer whose install changed can still be inspected and stopped.
  `stop` skips it for the same reason. `machine` and `login-item` skip it, because they write no file of
  the install. `start` checks the repository that it starts.
- The `--json` answers of `start`, `stop`, `init`, `update`, `version`, `machine` and `login-item` carry
  `answerVersion` (`cli/utils/ProgramAnswerUtil.ts`). With `--json`, a refusal of these commands is
  `{answerVersion, refusal, text}` on stdout at exit 1. A change of shape increases `answerVersion`.
- `src/TestFileConventions.spec.ts` holds that no spec starts an Overseer without `--port 0`.
- A new command is an entry in `cli/CommandTable.ts`, a block in `cli/HelpText.ts` and a folder in its set, held by
  `cli/CommandTable.spec.ts` and `cli/HelpText.spec.ts`.
- Every mutating command applies a `ControlCommand` through the store's command face (`cli/ApplyCommandOfVerb.ts`),
  whose local adapter runs `writeTracker` in `src/services/tracker/TrackerPipeline.ts` (lock, read into a Board, change,
  writes in `docs/cli.md`'s order, one lock hold; nothing renders), and `cli/RegisterWrittenTracker.ts` registers the
  tracker with the monitor after every write and at the Overseer's start. A verb that changes the board and is never
  relayed applies a by-hand kind, which the command endpoint refuses. `init` creates a tracker;
  `update`, and `init` on an existing one, never touch its files; each removes a `progress.html` an older version
  left. `status` takes no lock.

### Tickets

- Nobody hand-edits a ticket file: a ticket's title and body change through `ticket edit` (`ticket-edit`), each other
  field through its verb, and every change is a command the board accepts or refuses. The local store reads the
  frontmatter subset of `docs/cli.md` and keeps any other line it finds.
- A ticket is its frontmatter `id`, never its file name. Ticket and task ids are never reused or gap-filled.
- Only a transition stamps `updated`. The named verbs enforce the legality matrix; `ticket status` skips it on purpose.
- `ticket add` files a draft ticket, `draft`, with no row at any priority; only `ticket ready`, after the readiness
  reading the landing shares (`TicketAcceptanceUtil`), moves it to `committed` and files its row, and no move returns a
  ticket to `draft`, not even `ticket status`. The filing cabinet's drafts are "filing drafts" in help and wording.
- A ticket's `epics` is an ordered list, the first its primary epic, written only when non-empty. An epic has no
  lifecycle: its progress is a Board roll-up over its tickets, and it never touches dispatch, claiming, concurrency or
  release, which stay `group`'s.
- `ticket add --group` and `ticket group` set a ticket's `group`. `ticket group` puts a ticket that has no group into
  one, also a started ticket, and refuses what a filing's group refuses, a ticket in a group and a settled ticket. In a
  forge with entities, User's answer to `dependent-broken` (E26) can file a fix ticket of the dependent in the group of
  the crossing ticket. The package build of that ticket then does not run the gates of that dependent: the release of
  the group runs them.
- In a forge with entities, `ticket add --entity` and `ticket entity` set a ticket's `entity`. The product owner sets it
  on its own draft ticket or on a ticket in `ready-for-review` or `committed`, and User sets it on the command line. The
  Overseer sets it on a started ticket when User answers `work-in-other-entity` with a move (E15). No other
  command sets it. The reason goes on the `entity-assigned` log record, not on the ticket. A worker names no
  entity. The Overseer gives a worker's finding the entity that owns the paths of its Brief's `Work belongs in:` line.
  When the line names no path, or paths of more than one entity, the finding gets the entity of the job that found it
  (E83, E53). The Board refuses to move a ticket without an entity to `committed` (`ticket-without-entity`), so
  `ticket ready`, `ticket submit`, `intake close` and a worker's finding all refuse it, a finding before it is filed.
- In a forge with entities, these filer's moves also refuse a draft when its Brief's `Work belongs in:` line names a
  path outside its entity, the packages that it whitelists and its `reach` (`work-outside-entity`, E85). A need's ticket
  does not get this check. The Playbook launches no job for an entity that has its `concurrency` count of build and
  review jobs, and the board's limit stays above each entity's cap (E72).
- A row's `history` holds only what the tool watched.
- An Overseer build job's `## Handoff` is code's: written from the builder's verified report only after its gate passes,
  replacing the section the filing template left; a builder never edits its ticket file (`docs/cli.md`, "A build job").
  A crossing ticket's `## Handoff` has one part for each stage that built, and a stage replaces only its own part. The
  last home build stage writes the Acceptance evidence.
- A review row belongs to its ticket by `reviewOf` alone. A client reads which rows are bars from the Board facts,
  and a bar's name only to order a ticket's bars.
- Apply commits the constitutions to the main line through an Airlock job of kind `constitution-commit`, in one commit:
  `CONSTITUTION.md` on a forge without entities, and on a forge with entities each drafted constitution of an entity.
  It is the one tracked write of the product to a tracked repository's main line outside a ticket's landing. The commit
  runs no gates, because it changes only these documents. A commit that changes a path outside its list never lands; a
  forge without entities lists `CONSTITUTION.md` alone (`docs/cli.md`, "The constitution commit"). An entity with no
  draft keeps the file that main holds, byte for byte. Apply refuses to remove an entity that a ticket names (E91), and
  refuses to change a pipeline into entities while a ticket is in progress, in review or reviewed (E94). The first Apply
  that stores entities starts a `product-owner` job, which gives each committed ticket without an entity one.
