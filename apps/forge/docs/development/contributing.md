# Changing the code

> **Question:** How do I get this running, try a change safely and get it past every check?
> **Time:** 15 minutes.
> **Read first:** [README](../../README.md).
> **Next:** [Guards and testing](guards-and-testing.md), [CLI reference](../cli.md), [Rule book](../../../../.claude/rules/forge.md).

## In one screen

Bun runs the TypeScript directly, so an edit reaches the next CLI command. A running
[Hephaestus](../glossary.md#hephaestus) keeps the code it started with until you restart it.

`apps/forge/setup.sh` installs the dependencies, links `forge` and turns on the commit hook. After that, four things
matter:

1. **Exercise the CLI only in a scratch repository.** A fresh clone has no [tracker](../glossary.md#tracker), so a bare
   command is refused `no-tracker-found`, and `init` here would adopt this repository. A checkout where a tracker exists
   is a live [board](../glossary.md#board), and a bare command acts on it. Never aim `init`, `update` or `clear` at this
   repository.
2. **Run `bun run verify` before you call a change done.** The commit and edit hooks are a fast partial check. Only
   `verify` runs the tests.
3. **Find the home of your change** in the table under [Where does my change go](#where-does-my-change-go). A guard is
   a spec or lint rule that fails when a repository rule is broken. Each row names the guards for that change. They do
   not catch everything: docs and other follow-ups are on you.
4. **Commit one plain subject line**, with no AI attribution.

![Two lanes over time. A person's change meets the edit hook, then pre-commit running lint and typecheck, then bun run verify with its four stages. An agent's change meets the same two hooks where the repository has them, then Customs, then gates, then a review job when the pipeline has one, and the Airlock gates the merged tree and merges the branch with hooks off. Hooks can stop a commit; only the later steps decide.](../figures/contributing/checks-pipeline.png)

*Notice that a hook can stop an agent's commit but never clears it: [Customs](../glossary.md#customs) and the
[gates](../glossary.md#gate) decide.*

## Getting the code running

forge runs beside the released `agent-progress` under its own names
([Reading names](../glossary.md#reading-names)). You need Bun and git. Clone and run the setup script:

```sh
git clone git@github.com:AlexDM0/foundry.git
cd foundry
apps/forge/setup.sh
```

The repository is a Bun workspace: forge is the app in `apps/forge/`, and the packages it uses, `forge-contracts` and
`system-versions`, are in `packages/`. The root holds the workspace's `package.json`, its one `bun.lock`, `.bun-version` and
`turbo.json`. Run the commands below in `apps/forge/` unless a step names the root.

On Windows, run `powershell -ExecutionPolicy Bypass -File .\apps\forge\setup.ps1` instead; it needs no administrator rights and
no bash. Both scripts are bootstraps: each puts Bun's `bin` folder on the `PATH` for its own run, offers Bun's official
installer when Bun is missing (and exits if you decline), then hands every argument to `setup.ts`. `setup.ts` runs the
steps below the same way on every system; with Bun installed, `bun run setup` starts it directly.

Setup touches nothing in any tracked repository: adopting one is `forge init`'s job.

| Step | What it does |
| --- | --- |
| 1/3 Bun | Refuses a Bun older than the root's `.bun-version`, offering `bun upgrade` first. |
| 2/3 Dependencies and the command | Runs `bun install` for the whole workspace on every run, then `bun link`, then compiles the launcher as the installed command. When `forge` is not on the `PATH`, offers to add Bun's `bin` folder: to your shell rc file on macOS and Linux, unless the file already mentions it, and to your User `PATH` on Windows. |
| 3/3 The commit hook | Sets `core.hooksPath` to `.githooks` unless it already is. The path is relative, so it resolves in every worktree of this repository. |

`apps/forge/setup.sh --instruct-only` changes nothing and reports what it would do. `cli/setup/Setup.spec.ts` and
`cli/SetupScript.integration.spec.ts` hold that.

> **Careful.** `bun link` repoints the machine-wide `forge` at the checkout you run it from. Run the
> setup from a long-lived checkout of `main`, not from a [ticket](../glossary.md#ticket)
> [worktree](../glossary.md#worktree) that a merge removes later.

**Running from source.** The linked command runs this checkout's `agent-progress.ts`. Without the link, run the entry
point with Bun. Both forms take the same arguments:

```sh
bun agent-progress.ts help
bun /path/to/agent-progress/agent-progress.ts version
```

## Trying a change in a scratch repository

**Run your change against a throwaway repository, with `FORGE_ROOT` pointing at it.** This override replaces
the walk up from the current directory, so no command reaches a tracker by accident. The rule is under Command surface
in the [rule book](../../../../.claude/rules/forge.md).

![The program runs from this checkout. HOME sends the monitor folder, with the Talos socket and secret, and the transcripts to a scratch home. FORGE_ROOT sends tracker writes to the scratch repository. FORGE_FAKE_AGENT swaps every session for a scripted fake that spends no subscription. No arrow reaches a real tracker, the real monitor folder or the real transcripts.](../figures/contributing/scratch-isolation.png)

*Notice that each setting moves one thing: drop `HOME` or the root and the commands reach your real files; drop the
fake and a real session runs.*

The program runs from this checkout and acts only on the scratch repository; `--root` and the exports below choose the
target. Run the commands from the root of this checkout, in one scratch shell, and keep that shell open until you end
the board. They were run as written on commit 70ce56de.

**Start the scratch board:**

```sh
USER_HOME="$HOME"
SCRATCH="$(mktemp -d /tmp/ap-scratch.XXXXXX)"
REPOSITORY="$SCRATCH/example-agency"
mkdir -p "$REPOSITORY" "$SCRATCH/home"
git -C "$REPOSITORY" init -q -b main
export HOME="$SCRATCH/home"

bun agent-progress.ts init --root "$REPOSITORY" --project "Example Agency"
git -C "$REPOSITORY" add -A
git -C "$REPOSITORY" -c user.name="Alex Example" -c user.email=alex@example.com commit -q -m "Adopt the tracker"

export FORGE_ROOT="$REPOSITORY"
export FORGE_FAKE_AGENT=1
export FORGE_FAKE_AGENT_KEEPS_WORKING=1

bun agent-progress.ts ticket add "Double-click a role to edit it" --type ticket
bun agent-progress.ts log "Scratch board started"
bun agent-progress.ts status

bun agent-progress.ts start --port 0
bun agent-progress.ts status
```

![Ten steps along a time axis, from mktemp to rm -rf. The scratch folder's bar spans all ten. The HOME export and the other exports sit inside it. Hephaestus runs from start to stop --now, and agent sessions run on to pkill, both ending before rm -rf. Skipping stop --now leaves Hephaestus running; skipping pkill leaves the agents running.](../figures/contributing/scratch-board-spans.png)

*Notice that Hephaestus and the agents end in separate steps, and both end before the folder does.*

Six lines are easy to get wrong:

| Line | Why |
| --- | --- |
| `mktemp -d /tmp/ap-scratch.XXXXXX` | The scratch `HOME` holds the board's [Talos](../glossary.md#talos) socket, and a socket path stays under `MACOS_SOCKET_PATH_LIMIT_BYTES` (104). On macOS a bare `mktemp -d` lands too deep, and Hephaestus refuses to start, as its Talos cannot bind its socket. |
| `init --root "$REPOSITORY"` | `init` does not choose its directory by the override. It takes the current directory or `--root`, and [refuses](../glossary.md#refusal) when the override names another directory. |
| `FORGE_ROOT` | The line that matters most: every later command acts on this tracker, with no walk. [Only this name works](#why-only-the-forge_-variables-work). |
| `FORGE_FAKE_AGENT` | Every [session](../glossary.md#session) Hephaestus launches is the scripted fake agent, so nothing spends a subscription. |
| `FORGE_FAKE_AGENT_KEEPS_WORKING` | Each fake session works until its stdin closes. Sessions that end unreported count as crashes, and crashes on `CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING` (2) different tickets back to back open an outage that pauses the board. Keep it set once tickets run. |
| `start --port 0` | Port 0 asks for any free port instead of the one derived from the tracker id. |

The full table of variables is in the [CLI reference](../cli.md). On a healthy start, `status` prints two
matching hashes on a paused board:

```text
hephaestus: serving at http://127.0.0.1:<port>/, process <id>, Hephaestus lock 1; paused
code on disk: <hash>; in memory: <hash>
```

A fresh board starts paused, and its Hephaestus launches the [Assistant](../glossary.md#assistant). New work waits until
the board has gates: `unpause` alone launches the [pipeline agent](../glossary.md#pipeline-agent) and no ticket. To get a
ticket running, declare no gates, give the ticket a [Brief](../glossary.md#brief), ready it and resume. In the same
shell, run:

```sh
bun agent-progress.ts gate none
bun agent-progress.ts ticket edit 001 --append --body "## Brief

Try a change on this ticket."
bun agent-progress.ts ticket ready 001
bun agent-progress.ts unpause
bun agent-progress.ts jobs
```

Within seconds `jobs` lists a `build/builder` [job](../glossary.md#job) on `#001`, so run it again if the job is not
there yet. A client of the API shows the same job. The fake agent never reports, so
the job runs until you end the board. [Getting started](../operations/getting-started.md) settles real gates, and the
[Runbook](../operations/runbook.md) has a scratch board where the job fails instead.

To run a ticket on to its landing, also `export FORGE_FAKE_AGENT_REPORTS=1` before `start`: each fake builder then
commits a line in each folder its stage may change and reports, and each fake reviewer reports every Acceptance item as
holding. When the ticket's Brief has a `Work belongs in:` line, the builder writes only in the folders it names, so a
ticket of an app crosses only into the packages it names. It claims no gate, so give the board only gates with
`forgeOnly: true`. Unset it with the other variables when you end the board.

**End the scratch board:**

```sh
bun agent-progress.ts stop --now
pkill -f "$REPOSITORY/.forge"
unset FORGE_ROOT FORGE_FAKE_AGENT FORGE_FAKE_AGENT_KEEPS_WORKING
export HOME="$USER_HOME"
rm -rf "$SCRATCH"
```

`--now` also has Talos stop its lines (gates, installs). Talos and its agents keep running, so `pkill` ends them; its
pattern matches both command lines. Deleting the scratch folder stops nothing, because these are detached processes.
The `stop` row of the [CLI reference](../cli.md#hephaestus) has the full stop matrix.

### Why only the `FORGE_` variables work

![A decision ladder for choosing a tracker. If the build's override variable names a tracker the command uses the scratch tracker with no walk, and if it names a folder with no tracker it is refused no-tracker-at-override at exit 1. Any other name counts as unset, so the command walks up from the current directory, then asks git for the main checkout, and exits 0 against the wrong board when it finds a tracker. With none it is refused no-tracker-found at exit 1.](../figures/contributing/why-the-variable-name-matters.png)

*Notice that the failure is not a refusal: if a tracker exists up the tree, the command exits 0, against the wrong
board.*

A habit from the released program sets `AGENT_PROGRESS_ROOT`, which this build ignores. `src/shared/Environment.ts`
builds each variable's name from `ENVIRONMENT_PREFIX` in `PRODUCT_NAMES`, so nothing here reads that name and nothing
here can warn about it. `cli/ProductNameIsolation.integration.spec.ts` holds that the binary ignores it. A typo in the value is
loud; a typo in the name is not.

## The checks

**`bun run verify` is the only check that runs the tests. Run it after any TypeScript change.** It runs three stages from
`apps/forge/package.json`, in order, and stops at the first failure. The first stage runs the type-check and lint side by side;
the test files themselves never run in parallel. forge has no page, so it has no DOM spec.

| Stage | Command | What it proves | Time |
| --- | --- | --- | --- |
| 1 Type-check and lint | `bun run typecheck`, `bun run lint` | `tsc` over `tsconfig.json`; ESLint over the app. | 14 s |
| 2 Tests | `bun test` | Every `.spec.ts`, under the preloads in `bunfig.toml`. | 15 min |
| 3 Stamp check | `bun src/testing/CheckRecordingStamps.ts` | No recording is stale for the installed system versions. | 1 s |

At the repository root, `bun run verify` runs these stages, and those of each package, for every workspace through
Turborepo, which replays a task whose inputs have not changed from its cache.

`tsc` keeps its build info in the git-ignored `node_modules/.cache/typecheck/`, so a later type-check reads again only
what changed. ESLint keeps no cache: `import/no-extraneous-dependencies` reads `package.json`, which a cache never
watches.

Times are one run at commit 70ce56de on a Mac at a load near 10, with Bun 1.4.2: 3875 tests in 348 files, before the
browser client left the app; the stamp check's time is from a later run. `bun test` is slow because it waits on processes, not on
CPU: it used about six minutes of CPU. It writes nothing into the checkout.

The type-check matters more here than in a compiled project. Bun runs the TypeScript without checking it, so a type
error is a runtime surprise on a path nobody exercised.

A spec that needs a tool the machine lacks, such as Chrome, skips and is counted in the run's report. Set
`FORGE_REQUIRE_EVERY_TOOL=1` to turn each skip into a failure.

**The two hooks are a quick net, not a verdict.**

| Hook | Runs | When | Blocks | Blind spot |
| --- | --- | --- | --- | --- |
| `.claude/hooks/fix-lint-on-edit.sh` | `eslint --fix` on the edited file, with the ESLint of the checkout holding it | After each Edit or Write in a Claude Code session, from `.claude/settings.json` | Never | A `.ts` file only: a `.tsx` edit is skipped. What `--fix` cannot settle waits for lint. Does nothing without `jq`, or in a checkout with no `node_modules`. |
| `.githooks/pre-commit` | `bun run lint`, then `bun run typecheck`, at the repository root | Every `git commit` | Yes | No tests, so a commit stays quick when several agents commit at once. A clone without `setup.sh` has no hook. |

An agent can write hooks, so a passing hook proves nothing about an agent's commit. The verdict comes from Customs, the
gates and the [Airlock](../glossary.md#airlock): see Confinement.

When a guard fails and you do not know why, open the spec: its header says what it holds, and
[Guards and testing](guards-and-testing.md) says how to fix each one.

## Where does my change go

**Find your change below. A green run proves only the part in Held by; Also touch is yours to do.** The rules behind
each row are in the [rule book](../../../../.claude/rules/forge.md).

Most kinds of change stay in one code layer and touch at most one document. Wording a refusal, changing what an
installed file names and adding a board change reach two or three parts of the repository, and a rename reaches every
tracked file.

| I want to | Go to | Also touch | Held by |
| --- | --- | --- | --- |
| Add a command | An entry in `cli/CommandTable.ts`, a block in `cli/HelpText.ts`, a folder in its set under `cli/` | A row in `docs/cli.md`, the one documentation entry a spec checks (`cli/HelpText.flags.spec.ts`); the verb's place in the lists in `cli/ControlContract.spec.ts` | `cli/CommandTable.spec.ts`, `cli/HelpText.spec.ts`, `cli/HelpText.flags.spec.ts`, `cli/ControlContract.spec.ts` |
| Word a refusal | `src/adapters/utils/OperationRefusalWordingUtil.ts` | A new detail kind in `src/shared/OperationRefusal.ts`; [Refusals](../reference/refusals.md) | `src/adapters/utils/OperationRefusalWordingUtil.spec.ts` |
| Add a change to the board that a job or a client can ask for | A kind in `src/shared/@types/ControlCommand.ts`, a function in `src/services/control/` that applies it | Its verb in `cli/constants/JobVerbs.ts` | `cli/ControlContract.spec.ts`, `cli/HatchUnderJob.spec.ts` |
| Change a domain rule | A module in `src/lib/tracker-model/` that the `Board` class delegates to | Nothing outside the package | `src/lib/tracker-model/Board.*.spec.ts`, `architecture/ImportDirection.spec.ts` |
| Change what runs next | The [Playbook](../glossary.md#playbook), `src/lib/tracker-model/Playbook.ts` | A test in its spec, and a source mutant that proves the test fails without your change: see [Guards and testing](guards-and-testing.md) | `src/lib/tracker-model/Playbook.spec.ts`, `src/lib/tracker-model/Playbook.interleavings.spec.ts` |
| Change a stored format | `src/adapters/<store>/`: its reader, writer and `utils/` mapping (`*Ingestion` and `*Writer` for most stores, `PipelineFile.ts` for the [pipeline](../glossary.md#pipeline)) | The format in `docs/cli.md` | The adapter's specs, `cli/OlderTrackerRefusal.spec.ts` |
| Share a tunable | A named constant in `src/shared/constants/`; a constant with one consumer stays beside it | Nothing | `@typescript-eslint/no-magic-numbers` in `eslint.config.js` forces a name, not a home; `src/shared/constants/Limits.spec.ts` holds relations between constants, not their presence |
| Change what an installed file names | `resources/templates/`, `resources/prompts/` or `skills/` | Bump the [install version](../glossary.md#install-version), `INSTALL_VERSION` in `cli/constants/InstallVersion.ts`, by hand, in the same commit | `cli/InstalledSurface.spec.ts` against `cli/FrozenInstalledSurface.json` |
| Add a package dependency inside `src/lib/` | The "depends on" sentence in the main module's header | The import | `architecture/ImportDirection.spec.ts` |
| Rename a component | Every tracked file | The old name in `RETIRED_NAMES` | `architecture/ComponentNames.spec.ts` |

## Seeing a change in a running Hephaestus

**A running Hephaestus keeps the code it started with: restart it to see an edit.**

The CLI runs your edit from its next command. Hephaestus holds the code it started with across the edit, until
`stop --now`, and runs your edit after the next `start`. Between the edit and the stop Hephaestus
lags your checkout, and `status` shows it as two hashes.

Hephaestus watches no files. Stop and start it in the scratch shell:

```sh
bun agent-progress.ts stop --now
bun agent-progress.ts start --port 0
```

`status` prints the hash of the code on disk and of the code in memory. Two different hashes mean Hephaestus
runs older code than your checkout: restart it. See [code version](../glossary.md#code-version).

## Changing the documentation

**Each fact has one home.** State it there and link it elsewhere. [The documentation map](../README.md) lists each
document and the question it answers. [CLI reference](../cli.md) rows and three of its sections are held by specs; read
[Guards and testing](guards-and-testing.md) before you restructure it.

**A figure** is a rendered PNG in `docs/figures/<doc-slug>/`, a folder named after the document, such as
`contributing`. `docs/figures/` holds rendered PNGs only; no SVG source is kept.

Embed the PNG, followed by one italic line saying what to notice. The alt text states the content and
the conclusion. A figure teaches one idea, and its card title states that idea. Colour means who, across every figure:

| Colour | Means |
| --- | --- |
| Blue | Code that decides or acts |
| Coral | Agent sessions, reports, anything untrusted |
| Gray | Stored state and inert things |
| Amber | A person, or anything waiting on one |
| Green | A good outcome |
| Red | Failure or refusal |

The README's diagrams are the exception: they stay in `docs/images/` and render with
`.readme-graphics/render-diagrams.py`.

**Update a [glossary](../glossary.md) term** under its level-3 heading, whose text is exactly the term, because other
documents link that anchor. An entry defines the word and links its home. It never states a bound.

**Check the wrap.** Paragraph lines stop at 120 columns; table rows, fences and a line holding one code span are exempt.
`architecture/ProseWrap.spec.ts` holds this for the files it lists, which are the rule files under
`.claude/rules/`, `docs/cli.md`, `docs/backlog.md`, the skills, and the templates and prompts under `resources/`. For any other document, this prints what is too long, and a
printed line that holds one code span is fine. It skips image lines, whose alt text stays on one line:

```sh
awk '/^```/{fence=!fence} !fence && length > 120 && !/^\|/ && !/^!\[/' <file>.md
```

**Never write a retired component name.** `architecture/ComponentNames.spec.ts` matches `RETIRED_NAMES` by substring over every
tracked file, `.svg` and `.html` included. It reads
`git ls-files`, so an unstaged new file passes until it is added. Run it after `git add`:

```sh
bun test architecture/ComponentNames.spec.ts
```

## Committing

**A commit is one plain subject line, with no AI attribution of any kind.** The root [`CLAUDE.md`](../../../../CLAUDE.md) holds the
commit rule; the [rule book](../../../../.claude/rules/forge.md)'s sections "Verify" and "Documentation and commits" hold the rest.

## In the code

| Concept | Path | Symbol | Spec that holds it |
| --- | --- | --- | --- |
| Setup steps | `setup.ts`, `cli/setup/`; bootstraps `setup.sh`, `setup.ps1` | `runSetup`, `--instruct-only` | `cli/setup/Setup.spec.ts`, `cli/SetupScript.integration.spec.ts`, `cli/setup/BootstrapScripts.spec.ts` |
| The checks | `package.json` | `scripts.verify`, `scripts.typecheck` | None; `architecture/LintRules.spec.ts` holds lint's own rules |
| Test preloads | `bunfig.toml` | `preload` | None; `src/testing/ProgramTrapGuard.ts`, `src/testing/TestRunReport.ts` and `src/testing/SharedCaseDeadlinePreload.ts` are the preloads |
| Commit hook | `.githooks/pre-commit` | None | `cli/setup/Setup.spec.ts` for `core.hooksPath` |
| Edit hook | `.claude/hooks/fix-lint-on-edit.sh` | None | None |
| Hook policy of Hephaestus's git | `src/lib/git/GitProcess.ts` | `HOOKS_OFF_OVERRIDES`, `GitHookPolicy` | `src/lib/git/GitProcess.integration.spec.ts` |
| A session's hooks | `src/lib/claude-code/ClaudeCodeAdapter.ts` | `gitConfigurationOf` | `src/lib/claude-code/ClaudeCodeAdapter.spec.ts` |
| Scratch path bound | `src/lib/talos/PosixSocketEndpoint.ts` | `MACOS_SOCKET_PATH_LIMIT_BYTES` | `src/lib/talos/PosixSocketEndpoint.spec.ts` |
| Outage from crashes | `src/lib/tracker-model/Playbook.ts` | `outageIsDue` | `src/lib/tracker-model/Playbook.spec.ts` |
| Reading the variables | `src/shared/Environment.ts` | `ROOT_OVERRIDE_VARIABLE`, `FAKE_AGENT_VARIABLE`, `FAKE_AGENT_KEEPS_WORKING_VARIABLE` | `cli/ProductNameIsolation.integration.spec.ts` |
| Finding a tracker | `src/services/tracker/Workspace.ts` | `findWorkspace`, `requireWorkspace` | `src/services/tracker/Workspace.integration.spec.ts` |
| Code on disk | `src/services/hephaestus/CodeVersion.ts` | `CodeVersion.onDisk` | `src/services/hephaestus/CodeVersion.spec.ts` |
