# Guards and testing

> **Question:** Which spec holds which rule, and how is this codebase tested without ever touching live data?
> **Time:** 20 minutes; the catalogue is lookup.
> **Read first:** [CLAUDE.md](../../CLAUDE.md) for the rules themselves.
> **Next:** [Changing the code](contributing.md),
> [Overseer and Claude probe](overseer-claude-probe.md).

## In one screen

Rules here are code. Many rules in [CLAUDE.md](../../CLAUDE.md) name a spec or a lint rule that fails the build, and
that guard states the rule in full. If a spec failed, find it in the [guard catalogue](#guard-catalogue): the
last column says what to change.

![A four-row diagram of src/ImportDirection.spec.ts. Three blue rows, the floor, the planted violations and the exact-both-ways check, are bracketed together, and each rules out a false green: green on nothing, a blind finder, a stale exception. Only after all three does the green row, every violation list empty, count as a finding.](../figures/guards-and-testing/guard-anatomy.png)

*Three parts make an empty list mean something; read any guard by finding them.*

A guard reads the real tree, so a green result could mean the tree obeys or that the guard stopped looking. Each guard
rules out the second reading first. All guards share this shape.

Tests follow one law: no spec reaches live data, meaning a real [tracker](../glossary.md#tracker), the real home
folder, a real [board](../glossary.md#board) port or a real `claude` session. Every door to it that a spec helper
controls has a lock, and a bare `claude` on the run's `PATH` is a stub that fails the test. A
[session](../glossary.md#session) under test is a scripted fake agent.

`bun run verify` runs `tsc` and ESLint side by side, then `bun test` and the recording stamp check; the Bridge's DOM specs
run only by hand, through `bun run test:dom:bridge`. [Changing the code](contributing.md) says when to run what.

## How to read a guard

A guard has three parts before its real assertion. `src/ImportDirection.spec.ts` shows each, and its `describe` titles
are the map.

**The floor proves the scan read the tree.** `describe('the scan itself')` requires at least 1500 repository edges, at
least five files and five imports under each top folder, at least ten command folders, ten
[Bridge](../glossary.md#bridge) view folders and
four `src/lib/` packages. It also fails while any scanned file is `unplaced`, so a folder no rule covers cannot escape
judgement. The floors are round numbers well under the real counts, so a guard pointed at the wrong tree fails.

**The planted violation proves the finder still fires.** The block
`describe('the guard still names each violation, planted in memory')`
hands `graphWithPlantedFiles` a source text, and no file is written. `plantedFindingsOf` keeps only findings
that touch the planted file, so a real violation elsewhere cannot sway a self-test. Each case asserts the exact
sentence, and most also plant the legal neighbour and expect an empty list.

**Exact both ways proves no exception is stale.** `unusedAllowancesOf` fails when a `TESTING_FOLDER_IMPORTERS` entry
imports nothing, a `FEATURE_REACHES_BY_PATH` entry is unused, a testing folder has no entry, or a `depends on` header
names a package the code does not import. A stale allowance fails as loudly as a missing one.

**Then the real assertion.** `describe('the imports of the tree')` asserts one empty list per violation. A failure
prints a sentence naming the file, the line, the target and the rule, for example:

```text
src/adapters/log/PlantedWording.ts:1 imports src/services/render/RenderState.ts: adapters reaches only lib, shared, adapters, not render-service
```

The sentence is the fix: move the code down, pass the value as a parameter, or hoist what two siblings share above both.
`LAYER_REACH` holds the layer table as data.

When any spec fails, read its opening docblock first: [CLAUDE.md](../../CLAUDE.md) requires one.

> **Careful.** A file counts as inside a command folder only at `cli/<set>/<command>/<file>`, and the
> `CLI_SET_SHARED_FOLDERS` never count. A file directly in a flat set such as `cli/tickets/` may import its neighbours.

## Guard catalogue

Find the failing spec by its path; the group tells where it sits, and the last column tells what to change.

### Repository guards, `src/*.spec.ts`

A spec directly in `src/` is the `repository-guard` layer: it imports nothing of the tree but a `testing/` folder. That
is why `src/ProductNames.spec.ts` and `src/ProductNameLiterals.spec.ts` read the constant from source text.

Two programs can share a machine: the released `agent-progress` and this build, `forge`. Each reads its own
root override variable, which names the repository to use; [cli.md](../cli.md) holds the variables.

| spec | holds | how to fix a failure |
| --- | --- | --- |
| `src/ImportDirection.spec.ts` | Layer direction, feature, command and view isolation, the workspace packages' isolation (a package in `packages/` imports nothing of an app, and forge imports a package only by its name and only when `package.json` declares it: the design system as `design-system/<entry>`, an entry of the `exports` of `packages/design-system/package.json`, never by a file path), the CLI and Talos binaries (Talos imports only `src/lib/talos/` and its declared packages), `TESTING_FOLDER_IMPORTERS`, declared lib dependencies, tracker model isolation, the vendor seam (only `cli/CommandContext.ts` chooses the Claude Code adapter), cycles, barrels. | Follow the printed sentence. For a lib dependency, name the package in the main module's header. |
| `src/LintRules.spec.ts` | Each mechanised `eslint.config.js` rule reports each planted form, and each exact exception passes. | A rule stopped firing or an exception widened: restore it, or change the plant with the rule. |
| `src/CommentRuns.spec.ts` | No inline comment outside a docblock runs past `LONGEST_INLINE_COMMENT_LINES`. | Rename until the comment goes, or make it the docblock of a declaration or a `test`, `describe` or `it` call. |
| `src/UtilShape.spec.ts` | An exported `*Util` has at least `MINIMUM_UTIL_MEMBER_COUNT` members; an initializer it cannot count fails. | Make it a plain function beside its consumer, or group a second member in. |
| `src/TestFileConventions.spec.ts` | No `.test.ts` or `.spec.tsx`, `.dom.tsx` only under `bridge/`, no test code names `createProcessContext`, no spec starts an [Overseer](../glossary.md#overseer) without `--port 0`. | Rename the file, use `createCapturedCommandContext` or `runAgentProgress`, add `--port 0`. |
| `src/RealSystemSpecs.spec.ts` | No default spec makes a real process, git or socket call; the allowlist and `BOUNDARY_SPECS` are exact; see [The two suites](#the-two-suites). | Rename the spec to `*.integration.spec.ts` and list it under its boundary. |
| `src/SpecSleeps.spec.ts` | No spec or test helper sleeps a fixed time or counts tries before an assertion, beyond an exact allowlist, each entry with its reason. | Wait on the state through `src/testing/WaitUntil.ts`, or inject the clock or the event. See the [timing audit](#timing-audit). |
| `src/ProseWrap.spec.ts` | Wrapped files stay wrapped; see [What specs require of docs](#what-specs-require-of-docs). | Rewrap the line it names. |
| `src/DocumentSpecCitations.spec.ts` | Each repository-rooted `.spec.ts` path that `README.md`, `CLAUDE.md`, a rule file under `.claude/rules/` or a file under `docs/` (except the untracked `docs/design/`) cites exists, except an exact list of citations that are absent on purpose. | Write the path of the file that holds the case now, in the same change as the rename or split. |
| `src/ComponentNames.spec.ts` | No tracked file holds a retired name; see [What specs require of docs](#what-specs-require-of-docs). | Write the decided component name. |
| `src/ProductNameLiterals.spec.ts` | No string or template literal in shipping code names the program alone. | Build the text from `PRODUCT_NAMES.PROGRAM`. |
| `src/ProductNames.spec.ts` | `package.json`'s `name` and sole `bin` key equal the constants; the setup in `setup.ts` and `cli/setup/` imports them itself. | Align the file with `PRODUCT_NAMES`. |
| `src/LineEndingPolicy.spec.ts` | The root's `.gitattributes` holds the LF policy, git applies it to every tracked file, and no tracked text file holds a carriage return. | Restore the policy, or rewrite the named file with LF. |
| `src/BunVersionPin.spec.ts` | The root's `.bun-version` equals the `@types/bun` version the root's `bun.lock` locks. | Change the pin with the lock. |

### Surface and behaviour guards, `cli/*.spec.ts`

These specs hold what the CLI prints and accepts.

<details>
<summary>The 24 surface and behaviour guards</summary>

| spec | holds | how to fix a failure |
| --- | --- | --- |
| `cli/CommandTable.spec.ts` | Every `COMMAND_TABLE` entry reaches a handler; a word that is no command, an inherited property included, is refused. | Add the entry or its handler. |
| `cli/HelpText.spec.ts` | Help and table agree both ways; skills carry no command table; `FILING_SKILL_LIMIT_CHARACTERS`. | Edit the block in `cli/HelpText.ts`, or cut the skill. |
| `cli/HelpText.flags.spec.ts` | Help and `docs/cli.md` name every flag; see [What specs require of docs](#what-specs-require-of-docs). Every option either text shows with a `<value>` is in `OPTION_NAMES_WITH_VALUES`, so its value is never read as an extra positional. | Add the flag to both texts, or remove it from both; add a value option to `cli/arguments/constants/OptionNamesWithValues.ts`. |
| `cli/ControlContract.spec.ts` | Every `ControlCommand` kind has a verb, every mutating verb is a kind's or on `NOT_RELAYABLE_MUTATING_VERBS`, every verb is placed once. | Place the verb on the list that is true for it. |
| `cli/HatchUnderJob.spec.ts` | Relayed, read-only and refused verbs under a [job](../glossary.md#job) are exact both ways. | Move the verb between the lists in `cli/constants/JobVerbs.ts`. |
| `cli/InstalledSurface.spec.ts` | Commands, flags and status fields the installed files name, against `cli/FrozenInstalledSurface.json`; a version's surface only grows. | Add the listed names under the current version; after an `INSTALL_VERSION` bump, add a key. Never delete a frozen name. |
| `cli/InstalledFiles.spec.ts` | Where installed files live; every path absolute. | Correct `installedFilePathsIn` in `cli/InstalledFiles.ts`. |
| `cli/InstallVersionCheck.spec.ts`, `cli/InstallVersionVerdict.spec.ts` | The [install version](../glossary.md#install-version) manifest verdicts, on real directories and against the decider's contract. | Correct `installVersionVerdictOf` in `cli/InstallVersionVerdict.ts`. |
| `cli/Main.spec.ts` | What a command line does to the exit code, and that the install check runs first. | Restore the mapping or the `requireCurrentInstall` call in `cli/Main.ts`. [cli.md](../cli.md) holds the exit codes. |
| `cli/OlderTrackerRefusal.spec.ts` | A file in an older format is refused and left byte for byte. | Add the refusal with `OLDER_FORMAT_ADVICE`; never add a migration. |
| `cli/RetiredVerbs.spec.ts` | Each retired verb is unknown at exit 1 and writes nothing. | Remove the verb from `COMMAND_TABLE`. |
| `cli/ReferenceCopies.spec.ts` | `resources/templates/Reference.md` holds three `docs/cli.md` sections; see [What specs require of docs](#what-specs-require-of-docs). | Make the same edit on both sides. |
| `cli/SetupScript.integration.spec.ts` | `setup.ts --instruct-only` changes nothing; `--login-overseer` writes one login item per label. `cli/setup/Setup.spec.ts` holds the four steps; `cli/setup/BootstrapScripts.spec.ts` holds that the bootstraps `setup.sh` (macOS, Linux) and `setup.ps1` (Windows) only find Bun and start `setup.ts`. | Fix the step in `cli/setup/`; the spec uses a fake `bun` and a scratch `HOME`. |
| `cli/MonitorRegistryIsolation.integration.spec.ts` | No spec reaches the real home's [`<monitor>`](../glossary.md#reading-names) folder; no test code calls `homedir`. | Take the home from the context or `CliProcess`. |
| `cli/ProductNameIsolation.integration.spec.ts` | Each program ignores the other's root override variable and leaves its files byte for byte, proved under each program's names. | Derive the name from `PRODUCT_NAMES`. |
| `cli/UnreadableTrackerWording.spec.ts` | The exact bytes printed for an unreadable tracker. | Update the expected bytes in the spec together with the wording. |
| `cli/OutOfRangeOffsetRefusal.spec.ts` | An offset no stamp can hold is refused at exit 1, files untouched. | Refuse the offset at the reader that accepted it, before it writes. |
| `cli/NextLine.spec.ts` | The [Next line](../glossary.md#next-line) describes the board after the move, and no `--json` carries it. | Build the line from the board read after the move, and keep it out of `--json` output. |
| `cli/OpenerFor.spec.ts` | The browser opener (`open`, `rundll32.exe` by absolute path, or `xdg-open`) comes from the context's platform. | Pass the platform from `CommandContext`; never read `process.platform`. |
| `cli/BinarySmoke.integration.spec.ts` | The real binary: shebang, argument slice, exit status. | Restore the shebang, the argument slice or the exit call in `agent-progress.ts`. |
| `cli/InitRootOverride.integration.spec.ts` | `init` beside the root override leaves both store files byte for byte. | Restore the refusal in `init`: it must leave `progress.json` and `log.jsonl` alone when the root override names another folder. |
| `cli/HoldJournalCrash.integration.spec.ts` | A holder killed mid-write is finished from the [hold journal](../glossary.md#hold-journal) by the next holder; a malformed journal stops writes at exit 2. | Run `replayHoldJournal` before the next holder reads. |
| `cli/RegisterWrittenTracker.integration.spec.ts` | The monitor registry as commands write it, under a scratch home. | Correct `src/services/tracker/MonitorRegistration.ts`. [cli.md](../cli.md) holds the format. |

</details>

### Guards beside their subject

These sit next to the code they guard.

<details>
<summary>The 18 guards beside their subject</summary>

| spec | holds | how to fix a failure |
| --- | --- | --- |
| `packages/design-system/StyleContract.spec.ts` | Every class a package component emits is styled in the stylesheet of the component that owns it (the lowest layer that emits it); every rule of a component's stylesheet names a class of that component and otherwise only classes of a lower layer; `styles/` names no class; every class and keyframe is `design-system-…`; `styles/design-system.css` imports every stylesheet once, in layer order. | Move the rule into the owner's stylesheet, drop the dead one, or fix the entry's imports. |
| `packages/design-system/CompositionLayers.spec.ts` | Every package component sits in `atoms/`, `molecules/` or `organisms/` and imports only components of a lower layer; `utils/` imports no component. | Move the component up a layer, or move the shared part down. |
| `packages/design-system/PackageIsolation.spec.ts` | No package file imports or references a file outside `packages/design-system/`; shipping files import no `bun:` or `node:` module and no package but React; specs import only their listed test packages. | Pass the value in as a prop, or move the file into the package. |
| `cli/overseer/OverseerBuildJob.spec.ts` (the root tracker's git) | A tracker at its repository's root, with no gate and with one gate in every phase, asks git from the launch to the landing exactly the distinct calls of `cli/overseer/FrozenRootTrackerGitCalls.json`, taken from forge before a tracker could sit in a folder. | Make the root tracker's calls what they were. Retake the table only from the commit before a change meant to move them; see the test's docblock. |
| `cli/adoption/TrackerRefresh.claudeInstall.spec.ts` | A Claude `init` and the `update` after it write exactly the files and report lines of `cli/adoption/FrozenClaudeInstall.json`, per opt-out flag. | Retake only in a commit meant to change an installed text; see its header. Otherwise restore the text. |
| `src/lib/talos/TalosClosure.spec.ts` | `talos.ts`'s import closure, its synchronous-calls thread's included, stays in its package and declared packages, with no product or vendor name. | Remove the import or the name. |
| `src/lib/claude-code/ClaudeStreamFixtures.spec.ts` | Each recorded stream fixture still shows what it was recorded to show. | Re-record per [the probe](overseer-claude-probe.md). |
| `src/lib/tracker-model/Playbook.spec.ts` | Every [Playbook](../glossary.md#playbook) rule holds as written and fails under the mutant of its line. | Fix the rule, or update the claim's mutant text. |
| `src/lib/tracker-model/Playbook.interleavings.spec.ts` | No seeded order of events breaks a lifecycle invariant. | The failure lists each `{ seed, violations }`. Reproduce with `new LifecycleWorld(seed + 1).run(TURNS_PER_SEED)`. |
| `src/testing/TrackerIsolation.integration.spec.ts` | Every way out of the scratch root is refused. | Restore the refusal in `trackerIsolationVerdictFor`. A spec tripping that check needs a directory from `src/testing/ScratchWorkspace.ts`. |
| `src/services/overseer/CrashMatrix.spec.ts`, `src/services/overseer/CrashMatrix.integration.spec.ts` | The crash, reboot and update matrix, one row per scenario: the rows that need no process, and the rows on real processes. | Fix the mechanism the failing row names. |

</details>

## What ESLint holds

A reach is one use of a process-wide API such as `process.env` or `localStorage`. ESLint confines reaches, which the
type system cannot see. `bun run lint` proves the tree obeys, and `src/LintRules.spec.ts` proves the configuration: it
runs the real `ESLint` over planted texts at governed paths, one for each violation form and each exact exception,
without writing a file.

`CONFINED_REACHES` lists the reaches, each with the exact files allowed to make it. `confinedReachRules` turns the list
into config blocks that bind the same rule ids, so a later block replaces an earlier block's list.

![A grid of two ESLint config blocks against three reaches. Block one forbids process.env, process.cwd and homedir for every file. Block two, for one site, lists process.env alone. cli/tickets/TicketCommand.ts matches block one and ends with all three forbidden. cli/CommandContext.ts matches both, block two wins, and it may reach process.cwd and homedir while process.env stays forbidden.](../figures/guards-and-testing/confined-reach-blocks.png)

*Read a row of the lower pair: a change to `allowedIn` or to block order changes exactly these cells.*

| reach | allowed in |
| --- | --- |
| `process.env` | `src/shared/Environment.ts`, `src/shared/Environment.integration.spec.ts`, `talos.ts` |
| `process.exit` | `agent-progress.ts`, `talos.ts`, `setup.ts` |
| `process.chdir` | nowhere |
| `process.cwd` | `cli/CommandContext.ts`, `src/lib/claude-code/WorkflowScriptBundle.spec.ts` (no such file) |
| `homedir` from `node:os` | `cli/CommandContext.ts` |
| `localStorage`, `sessionStorage`, as a global or on `window` | `bridge/preferences/PreferenceStore.ts` |

| other rule | scope |
| --- | --- |
| Clock selectors: no `Date.now()`, no zero-argument `new Date()`, under `CLOCK_MESSAGE` | Shipping `src/` and `cli/`. Specs, testing folders, `cli/CommandContext.ts` and `talos.ts` are out; the Bridge may read the clock. |
| Bridge bans: no `dangerouslySetInnerHTML`, no assignment to `innerHTML` or `outerHTML`; react-hooks recommended, `exhaustive-deps` as an error | `bridge/**` |
| `@typescript-eslint/no-magic-numbers`, ignoring -1, 0, 1, 2, 16 and 100 | Off in specs, testing folders and `constants/` folders |
| `id-length`: only `i`, `a`, `b`, properties exempt | All TypeScript |
| No `!` assertion; inline `type` imports; no `todo`, `fixme`, `xxx` or `hack` anywhere | All TypeScript |
| `node:` protocol, full file extension | All TypeScript |

`MECHANISED_RULE_IDS` lists the rules `src/LintRules.spec.ts` plants. The import-style rules and `exhaustive-deps` are
outside it, so `bun run lint` alone holds those.

> **As built.** An ESLint allowlist is not exact both ways. `src/LintRules.spec.ts` plants forms and exceptions, and
> never checks that an `allowedIn` site exists, so the stale `process.cwd` entry above survives: see
> stale prose in code.

## Rules that are prose as data

Some text is a build input: rewording it can fail a spec. Check this table before editing a comment or a reference row.

| text | read by | what breaks it |
| --- | --- | --- |
| The `depends on` sentence in a `src/lib/` package's main module header | `declaredLibDependenciesOf` in `src/ImportDirection.spec.ts`, also `src/lib/talos/TalosClosure.spec.ts` | Dropping a `` `src/lib/<package>` `` the code imports, naming one it does not, or saying it in two modules of one package. |
| Command rows in `docs/cli.md`, under `REFERENCE_COMMAND_TABLE_HEADER` | `cli/HelpText.flags.spec.ts` | Renaming the header, or a flag missing from a row. |
| Signature lines in `cli/HelpText.ts`, by column | `cli/HelpText.flags.spec.ts` | Prose starting short of `HELP_DESCRIPTION_COLUMN`. |
| Command words in `cli/HelpText.ts`, by indentation | `cli/HelpText.spec.ts` | Changing the indent. |
| Commands and flags named in installed templates and skills | `cli/InstalledSurface.spec.ts` | Naming something outside the frozen surface of the current version. |
| `name` and `bin` in `package.json` | `src/ProductNames.spec.ts` | Editing either without `PRODUCT_NAMES`. |

## What specs require of docs

Four specs read documentation, so a docs change can fail `bun test`, or `bun run verify:integration` for the first.

| spec | what it requires |
| --- | --- |
| `src/ComponentNames.spec.ts` | No file of the folder walk in `src/testing/RepositorySources.ts` holds a name in `RETIRED_NAMES`, as a substring of its path or text. Only binary suffixes, the spec itself, `.agent-progress/` and `docs/design/` are skipped, so `.svg` and `.html` count. `ALLOWED_RETIRED_NAMES` is empty. |
| `src/ProseWrap.spec.ts` | Paragraph lines wrap at `PROSE_WIDTH_COLUMNS` in `CLAUDE.md`, the rule files under `.claude/rules/`, `docs/cli.md`, `docs/backlog.md`, and the Markdown under the skills, `resources/templates/` and `resources/prompts/`. Table rows, fences, frontmatter and a lone code span are exempt. |
| `cli/HelpText.flags.spec.ts` | Every option a handler accepts is in its help entry and its `docs/cli.md` row, and neither names one it refuses. `ENTRIES_DOCUMENTED_AS_ANOTHER` lists the one entry documented by reference. |
| `cli/ReferenceCopies.spec.ts` | Each copy in `resources/templates/Reference.md` holds its `docs/cli.md` section byte for byte, and may add lines around it, never inside it. The sections are the ticket file, the ticket moves and the exit codes. Moving a heading breaks the match. |

## The two suites

The tests split in two, so that an ordinary change does not pay for every real process, git call and socket.

| suite | files | command | when it runs |
| --- | --- | --- | --- |
| Default | every `*.spec.ts` and `*.dom.tsx`, but no `*.integration.spec.ts` | `bun run verify` | On every change. |
| Real-system | every `*.integration.spec.ts` | `bun run record <boundary>`, per boundary | While somebody builds or changes that boundary; never in `verify` or at a release. |

`bunfig.toml`'s `pathIgnorePatterns` keeps the real-system specs out of a plain `bun test`. A later
`--path-ignore-patterns` replaces that value, which is how `verify:integration` and the record command reach them.

### Recordings and their stamps

`bun run verify` and the release make no real call. A boundary's real system is asked while somebody builds or changes
that boundary, by its record command:

```
bun run record <boundary>        # e.g. bun run record src/lib/git/GitProcess.ts
```

`src/testing/RecordBoundary.ts` runs the specs `BOUNDARY_SPECS` in `src/testing/BoundarySpecs.ts` lists under the
boundary, with the integration specs beside the boundary's module (`Module.ts` runs `Module.integration.spec.ts` and
`Module.<aspect>.integration.spec.ts`). A spec records the real answer to a call shape with `recordAnswer` from
`src/testing/RecordedAnswers.ts`, which writes only during a record run. When every spec passes, the command writes
the answers to `src/testing/recordings/<os>/<boundary>.json` (each `/` of the boundary as `__`), under a stamp of the
boundary, its system, that system's installed version and the OS (`process.platform`). When a spec fails, nothing is
written. Commit the recording with the change.

`SYSTEM_OF_BOUNDARY` in `src/testing/BoundaryRecordings.ts` names the system whose version stamps each boundary: `git`
(`git --version`), `bun` (`Bun.version`) or `operating system` (the kernel type and release).

`bun run verify` runs the stamp check, `src/testing/CheckRecordingStamps.ts`. It reads the recordings of the OS it runs
on and the installed versions, and nothing else:

- a recording whose stamp does not agree (another version, boundary, OS or system, or no readable stamp), or a
  recording of no boundary, fails `verify`; the line names the boundary and the command that records it again; a
  `claude` stamp agrees on the major and minor version alone, as `claude` updates itself to a new patch release
  often;
- a boundary with no recording for this OS is **not finished** for that OS; `verify` lists each one and does not fail.

A platform the boundary has never run on is not finished for it, so a boundary is finished on an OS only once somebody
records it there. `bun run verify:integration` still runs every real-system spec at once, for a person who asks for it.

A plain `bun test` refuses an integration spec even by path, so run one with
`bun test --path-ignore-patterns='.claude/**' ./<path>`.

A boundary ending in `/` is a package whose files all sit behind one port, recorded as one.

`src/RealSystemSpecs.spec.ts` holds the split. A default spec may not call `Bun.spawn`, `Bun.spawnSync`, `Bun.serve`,
`Bun.connect`, `Bun.listen`, `Bun.udpSocket`, `fetch`, `WebSocket`, `GitProcess.run` or the Bun shell (`Bun.$` or `$`), may not load a
process or socket module, and may not import a helper export that does, such as `runAgentProgress` or `gitOutputIn`.
Its `REAL_SYSTEM_ALLOWLIST` is empty, and a case holds it empty. An integration spec that
makes no real call, a real-system spec under no boundary and a shipping call site that is no boundary all fail it.

The guard reads what a spec names, not where its calls end up. A command run in-process still reaches git through
`GitProcess`, and `InitializedScratchRepository` still runs git to build its template. Those default specs pass: a real
call inside the code under test is not a call in the spec.

A default spec of the DrivePass stands on `useRecordedTalosStages` (`src/testing/RecordedTalosStages.ts`), reached
through `src/testing/DrivePassHarness.ts`. It replaces the process starts in `src/services/overseer/ProcessStarts.ts`,
and the process and socket ports with the recorded process table and local endpoint. A session and a gate line are played
in the spec's own process, and each frame of the Overseer's connection leaves what the real Talos left in that stage of a
child. `src/lib/talos/Talos.stages.integration.spec.ts` walks the real Talos through the stages and records them under
`bun run record src/lib/talos/Talos.ts`; a stage with no recorded answer fails the case.

Those specs answer git from recordings, never from an emulator. `useRecordedGit` (`src/testing/RecordedGit.ts`) mocks
`GitProcess.run` and `resolvedCommitOf` for a spec file, and `createInitializedRecordedGitRepository` builds the
initialized template on recorded answers. A spec of a ticket's flow enters a stage of `src/testing/RecordedGitFlow.ts`
(tracker ready, worktree made, tree changed, branch merged and a few variants); each stage is one answer set, answered in
any order and as often as asked, and the call that moves the repository on, such as `worktree add`, enters the next
stage. A call the stage does not hold fails the case, so a new git call in production fails a default spec until it is
added to its stage and recorded again with `bun run record src/lib/git/GitProcess.ts`.
`src/lib/git/RecordedGitAnswers.integration.spec.ts` walks a real repository through the stages to take the answers.

## The test pyramid

Add a test at the lowest tier that can prove the claim. At commit 70ce56de the repository holds 348 `.spec.ts` files,
17 `.dom.tsx` files and 58 helper files.

![Horizontal bars to scale, one per tier, from a common left edge, with an axis rising on the left: a higher tier costs more and proves more of the real system. From the bottom: static guards 158 tests in 13 files, pure logic 2,024 in 176, mutants and seeds 118 in 2, scratch disk 768 in 85, in-process commands 551 in 49, spawned processes 255 in 22, DOM specs 123 in 17, headless Chrome 1 in 1, and a manual smoke that is no spec. So a test goes at the lowest tier that can prove its claim.](../figures/guards-and-testing/test-pyramid.png)

*The tiers stack by cost, not by count: pure logic carries the most tests, and few claims need a real browser.*

| tier | tests | how a spec works there | example |
| --- | --- | --- | --- |
| Static guards | 158 | Read the tree or the repository's own files, usually through `ImportGraph` or `RepositorySources` | `src/ImportDirection.spec.ts` |
| Pure logic | 2,024 | Model, util or decider, no disk | `src/lib/tracker-model/Board.spec.ts` |
| Mutants and seeds | 118 | `SourceMutant`, `LifecycleWorld` | `src/lib/tracker-model/Playbook.spec.ts` |
| Scratch disk | 768 | Real directories and real git under the scratch root | `src/lib/git/Worktrees.integration.spec.ts` |
| In-process commands | 551 | `runCommandLine` with `createCapturedCommandContext` | `cli/tickets/TicketCommand.spec.ts` |
| Spawned processes | 255 | `CliProcess`, the Talos binary, the fake agent | `src/services/overseer/CrashMatrix.integration.spec.ts` |
| DOM specs | 123 | Components under happy-dom | `bridge/shell/BridgeApp.dom.tsx` |
| Manual smoke | none | A script with real sessions | `cli/testing/CutoverSmoke.ts` |

`bun test` at that commit, on Bun 1.4.2: 3,875 tests, 13,570 `expect()` calls, no failure and no skip, about 15 minutes
on a loaded machine. `RunDomSpecs` adds 123 tests. A spec file counts once, at the highest tier whose helpers it uses,
counted by a scratch script; the numbers are a snapshot, not a rule.

All process reach goes through one seam, `CommandContext`, which is why the in-process tier is so large: a spec drives a
whole command against a frozen clock and reads back its output, with no process to spawn.

Specs spawn the CLI through `cli/testing/CliProcess.ts`, with one exception:
`src/services/overseer/InstallChangeWatch.spec.ts` runs `version --json` through the shipping `versionsFromTheBinary`,
under the spawn wrap only. [The two routes](#the-fake-agent-the-dom-and-chrome) show when to spawn.

## Named techniques

Seven techniques recur across the specs; each row of the catalogue uses one or more.

**Planted in memory.** Each finder has its own way in: `graphWithPlantedFiles` for imports, `lintText` for ESLint, a
planted source object for the others.

**Scan floors.** Other scans name their floor as a constant: `MINIMUM_SPEC_FILE_COUNT`,
`SMALLEST_SCANNED_LITERAL_COUNT`, `SMALLEST_COPIED_SECTION_CHARACTERS`. `bridge/testing/RunDomSpecs.ts` treats finding
no DOM spec as a failure.

**Source mutants.** `src/testing/SourceMutant.ts` rewrites one text in one module as Bun bundles it, so a claim can be
watched failing without the line it pins.

![Two independent tests for one Playbook claim. Test one runs the claim on the source: if it fails, the rule is wrong. Test two builds the mutant, whose text must occur exactly once or the build throws, and runs the claim on it: if the claim still holds, it pins nothing. A rule is watched failing only when the claim holds on the source and fails on the mutant.](../figures/guards-and-testing/source-mutant.png)

*The build's exit is the point: a mutant whose text went stale cannot pass by changing nothing.*

`src/lib/tracker-model/Playbook.spec.ts` gives every claim a `mutant` and runs each claim twice. After editing a line a
claim pins, update that claim's `find` text. `mutatedModuleOf` bundles into a scratch folder and imports the bundle.

**Seeded interleavings.** `src/lib/tracker-model/Playbook.interleavings.spec.ts` runs `LifecycleWorld` for `SEEDS` (200)
seeds of `TURNS_PER_SEED` (60) turns.

![A loop inside a loop. For each seed, and for each turn, the world follows the Playbook on one in-memory Board, checks the invariants, then a fake agent or User acts at random, and the next turn starts. Any violation is listed under its seed, which replays exactly. A second row runs the same world on a mutated policy and requires violations above zero, proving the world notices a broken policy.](../figures/guards-and-testing/seeded-interleavings.png)

*The lower row tests the test: a world that never saw a violation under a broken policy would prove nothing.*

Violations include two live jobs on a [ticket](../glossary.md#ticket), a launch past the
[concurrency limit](../glossary.md#concurrency-limit), a second answer to a question, two live child instances on a job and
two git operations on a [worktree](../glossary.md#worktree). The generator is Mulberry32, which is why a seed replays.
A last test proves the turns do real work.

**`TupleCoversTheUnion`.** `src/lib/tracker-model/testing/TupleCoversTheUnion.ts` is a type: annotating `true` with it
fails the type check when a constant tuple misses a union member. The `JobStates`, `OverseerStates`, `Statuses` and
`TicketFields` specs in `src/lib/tracker-model/constants/` use it, because a stored value the tuple lacks makes a file
unreadable.

**Frozen tables.** `cli/FrozenInstalledSurface.json` holds one key per `INSTALL_VERSION` and only grows; the header of
`cli/InstalledSurface.spec.ts` says how to retake it. `cli/adoption/FrozenClaudeInstall.json` holds the files and report
lines of a Claude install; the header of `cli/adoption/TrackerRefresh.claudeInstall.spec.ts` says how to retake it.

**Recorded fixtures.** `src/lib/claude-code/testing/fixtures/` holds real Claude Code stream recordings, data only and
outside the import graph. `src/services/overseer/testing/fixtures/` holds the frozen monitor and summary documents.

## Timing audit

Every spec and test helper judged by concept: does its verdict depend on elapsed time, scheduling or machine load? A
wait goes through `src/testing/WaitUntil.ts`, on the state itself, and every spec file runs on the one deadline in
`src/testing/ChildProcessCaseTimeout.ts`, which `src/testing/SharedCaseDeadlinePreload.ts` applies, since a child is
often reached through a helper. A deadline only ends a case that hangs; the verdict is the child's result or the
state. `src/SpecSleeps.spec.ts` refuses a new fixed wait. Lines are those of the audit, a pointer rather than a contract.

| file | line | concept | outcome |
| --- | --- | --- | --- |
| `bridge/views/waves/WavesView.dom.tsx` | 94 | fixed sleep before an assertion | Redesigned: `waitFor` on the lineage clearing. |
| `bridge/views/detail-panel/DetailPanel.dom.tsx` | 165 | fixed sleep before an assertion | Kept: a negative, a planted payload never runs; no state exists to wait on, and load only shortens the window. |
| `bridge/testing/HeadlessBridgeCheck.ts` | 48 | try-count loop, settle sleep per tab | Redesigned: waits on the page target, the heading and each tab's panel. |
| `bridge/testing/HeadlessBridgeCheck.ts` | 149 | process signalled | Kept: cleanup of a Chrome the check owns, no verdict. |
| `cli/HatchUnderJob.spec.ts` | 271 | unbounded poll loop | Redesigned: `firstValueOf` on the written request. |
| `cli/decisions/DecisionCommands.spec.ts` | 126 | sleep assumed to let a command start | Redesigned: the wait is seen beginning at its `onStopSignal`, an injected event. |
| `cli/RegisterWrittenTracker.integration.spec.ts` | 360 | fixed hold before an assertion, across processes | Kept: a negative across processes; a hold ending on the children's state could outlast their lock retry budget, and a slow start only shortens the window. |
| `cli/RegisterWrittenTracker.integration.spec.ts` | 362 | clock read | Kept: the lock's stamp, recorded and never compared. |
| `cli/MonitorRegistryIsolation.integration.spec.ts` | 70 | private deadline | Redesigned: the shared deadline. |
| `cli/ProductNameIsolation.integration.spec.ts` | 43 | private deadline | Redesigned: the shared deadline. |
| `cli/HoldJournalCrash.integration.spec.ts` | 47 | process signalled and awaited | Kept: the crash is the subject; the child kills itself at the injected write, and the spec awaits its exit. |
| `cli/Main.spec.ts` | 343 | module mock outliving a case | Kept: a `beforeAll` installs it and its `afterAll` mocks the real exports back, so no case outside that `describe` sees it. |
| `cli/overseer/OverseerApi.integration.spec.ts` | 165 | try-count loop | Redesigned: `waitUntil`, and the shared deadline. |
| `cli/overseer/OverseerBuildJob.integration.spec.ts`, `cli/overseer/OverseerBuildJob.spec.ts` | 161 | try-count loops | Redesigned: `waitUntil` over passes, and the shared deadline. |
| `cli/overseer/OverseerBuildJob.integration.spec.ts` | 261 | process signalled | Kept: the kill is the case's injected crash, awaited by state. |
| `cli/overseer/OverseerCommand.integration.spec.ts` | 224 | try-count loops, one assertion re-reading a passing state | Redesigned: `waitUntil` ends on the state; `ready` is no longer read a second time after the old Overseer may have moved on. |
| `cli/overseer/OverseerCommand.integration.spec.ts` | 498 | try-count loop on a file that may never exist | Redesigned: `waitUntil` on the board's Talos record serving under a held lease; `src/testing/ScratchTalos.ts` gives the monitor folder a short scratch name, so Talos's endpoint stays inside the bytes macOS allows. |
| `cli/overseer/OverseerDrivePass.spec.ts` | 464 | try-count loop on text that never appears | Redesigned: `waitUntil` on the second line's window; the event log stores a line JSON-escaped, so the quoted word never matched. |
| `cli/overseer/OverseerDrivePass.integration.spec.ts` | 203 | teardown wait for every wake | Kept: cleanup, no verdict; it then stops the board's Talos and every child it ran by what reaches into the repository. |
| `cli/overseer/OverseerDrivePass.integration.spec.ts`, `cli/overseer/OverseerDrivePass.spec.ts` | 124 | try-count loops, an unbounded loop in teardown | Redesigned: `waitUntil` over passes, and the shared deadline. |
| `cli/overseer/OverseerDrivePass.integration.spec.ts` | 166 | wait for a child of Talos ending | Kept: `waitUntil` on the child's liveness as `src/testing/TalosChildReadings.ts` reads it, awaited by state. |
| `cli/overseer/OverseerDrivePass.integration.spec.ts` | 477 | port served | Kept: port 0, assigned by the kernel, reachable by this case alone. |
| `cli/testing/CutoverSmoke.ts` | 68 | sleeps, deadlines, signals, the clock | Kept: the owner's live smoke run, which no `bun test` runs; its deadlines and stamps are its report. |
| `cli/tickets/TicketCommand.review.spec.ts` | 88 | fixed hold while commands queue | Redesigned: the lock is held until both commands parked a retry. |
| `cli/tickets/TicketCommand.spec.ts` | 166 | fixed hold while adds queue | Redesigned: the lock is held until both adds parked a retry. |
| `src/lib/process-identity/ProcessIdentity.integration.spec.ts` | 38 | try-count loop | Redesigned: `waitUntil`. |
| `src/lib/process-identity/ProcessIdentity.integration.spec.ts` | 73 | clock read against a tolerance | Redesigned: the start lies between the clock read either side of the spawn. |
| `src/lib/process-identity/ProcessIdentity.integration.spec.ts` | 81 | processes signalled | Kept: real process groups are the subject; each is awaited or waited on by state. |
| `src/services/lifecycle/GateRun.integration.spec.ts` | 189 | process signalled | Kept: the gate signals itself, and its run is awaited. |
| `src/services/overseer/BatonPass.integration.spec.ts` | 134 | timer killing a process while tries run out | Redesigned: the kill lands at the rebind's first wait, an injected event. |
| `src/services/overseer/BatonPass.integration.spec.ts` | 120 | port re-bound after its holder exits | Kept: the real port held and freed is the subject; the kernel's rotation makes a rival in that gap negligible. |
| `src/services/overseer/BatonPass.spec.ts` | 234 | fixed sleep before the event | Redesigned: the predecessor reads gone on its fourth liveness read. |
| `src/services/overseer/BatonPass.spec.ts` | 37 | try budgets | Kept: `tries` is the contract under test; both sides run on one event loop, so sleeps keep their order. |
| `src/services/overseer/CrashMatrix.integration.spec.ts`, `src/services/overseer/CrashMatrix.spec.ts` | 256 | try-count loops, a blocking one | Redesigned: `waitUntil` and `blockUntil`, and the shared deadline. |
| `src/services/overseer/CrashMatrix.integration.spec.ts` | 282 | processes signalled | Kept: the crashes are the subject, and each is observed by state. |
| `src/services/overseer/DataFolderWatch.spec.ts` | 125 | settle sleeps around a platform watch | Redesigned: fake watches and fake timers for the debounce, the sweep and the stop; the recursive watch plays the folder watch recording (`src/testing/RecordedFolderWatch.ts`), which `src/lib/quiet-watch/QuietWatch.integration.spec.ts` records. `platformWatch` is the injected seam in `src/services/overseer/DataFolderWatch.ts`. |
| `src/services/overseer/GateRunSlots.integration.spec.ts` | 59 | fixed sleep before a negative | Redesigned: the assertion follows three counted retries against the full slots. |
| `src/services/overseer/GateRunSlots.integration.spec.ts` | 119 | process signalled | Kept: a sleeper standing in for a holder, awaited. |
| `src/services/overseer/OverseerServer.integration.spec.ts` | 241 | fixed sleep assumed to let a client subscribe | Redesigned: the publish follows the stream's first chunk. |
| `src/services/overseer/OverseerServer.integration.spec.ts` | 268 | real heartbeat interval, private deadline | Kept: the five-second heartbeat runs in the server under test; the verdict is the `: ping` read, and only the deadline became the shared one. |
| `src/services/overseer/Regrouping.integration.spec.ts` | 70 | try-count loop | Redesigned: `waitUntil`. |
| `src/services/overseer/Regrouping.integration.spec.ts` | 28 | processes signalled | Kept: real process groups are the subject. |
| `src/services/store/LocalFilesBoardStore.integration.spec.ts` | 46 | clock read | Kept: a clock an hour ahead shows that a record's age frees nothing; no verdict reads the time. |
| `src/services/store/LocalFilesBoardStore.integration.spec.ts` | 109 | process signalled | Kept: a holder killed inside its hold is the subject, and its exit is awaited. |
| `src/services/store/LocalFilesBoardStore.integration.spec.ts` | 74 | blocking wait in a child's script | Kept: the holder must stay inside its hold until the case kills it; the case waits on the line it prints. |
| `src/services/tracker/TrackerLock.integration.spec.ts` | 104 | fixed hold while a call queues | Redesigned: the holder leaves once the second call parked a retry. |
| `src/services/tracker/TrackerLock.integration.spec.ts` | 151 | elapsed time against the retry budget | Redesigned: the recorded lock waits are empty, under `lockRetryWaitsDuring`. |
| `src/services/tracker/TrackerLock.integration.spec.ts` | 56 | clock read | Kept: a clock an hour ahead shows that a record's age frees nothing; no verdict reads the time. |
| `src/testing/FakeAgentAdapter.integration.spec.ts` | 103 | process signalled | Kept: the fake agent's crash is the claim, and its exit is awaited. |
| `src/LintRules.spec.ts` | 54 | clock read | Kept: planted text linted in memory, never run. |
| `src/testing/fake-agent/FakeAgentChild.ts` | 27 | process signalled | Kept: the fake agent crashing itself is its scenario; a spec awaits its exit. |
| `src/testing/LockRetryWaits.ts` | 36 | clock read | Kept: turns a `Date` sleep into its length for the record; no verdict reads it. |
| `src/testing/ScratchWorkspace.ts` | 34 | a file another spec can reach | Kept: `mkdtemp`, unique per call under parallel verifies; `src/testing/ScratchTalos.ts` puts each Talos board and monitor folder under such a folder. |
| `src/testing/SharedCaseDeadlinePreload.integration.spec.ts` | 10 | fixed sleep inside a case | Kept: outliving the default deadline is the claim, and Bun exposes no reading of it. |
| `src/testing/WaitUntil.ts` | 36 | fixed poll interval | Kept: the shared wait's own poll; a slow machine only polls longer. |
| `src/testing/WaitUntil.ts` | 23 | clock read | Kept: the wait budget ends only a wait that already failed; a passing verdict never reads it. |
| `src/services/overseer/Baton.spec.ts` | 29 | fixed port | Kept: a value in a stored record, never bound; likewise `port: 1` in the DrivePass, build job, command and crash matrix fixtures. |
| `src/services/overseer/OverseerServer.integration.spec.ts` | 74 | port served | Kept: port 0, assigned by the kernel. |
| `src/lib/process-identity/ProcessIdentity.integration.spec.ts`, `src/services/overseer/Regrouping.integration.spec.ts`, `src/services/overseer/BatonPass.integration.spec.ts` | 47, 49, 113 | one read assumed to hold a whole line | Kept: a single short write to a pipe is atomic. |
| every other spawning spec | - | deadline | Redesigned: the shared deadline, by the preload. |

## Scratch isolation

Every door a spec helper controls has a lock that forbids, refuses or replaces the reach; a direct library call has
none, as the Careful note below says. The helpers refuse before a command runs, because a throw inside a command
becomes an exit code a spec cannot tell from the command's own.

![Three nested bands around live data, sorted by when each lock acts. Before the run, a lint rule or guard forbids changing directory, the real process context, a board's real port and setting the root override in-process. At the helper, a command's directory, discovery walking up and the root override's value are refused. In the context or child, the real home, the monitor registry, a real agent session and a worktree's placement are replaced by scratch. Each door a helper controls is locked before the centre.](../figures/guards-and-testing/isolation-doors.png)

*Each door a helper controls is locked at the moment its band names; the three helper doors share
`trackerIsolationVerdictFor`, so one defect there opens all three.*

| door | acts | lock | proved by |
| --- | --- | --- | --- |
| Changing directory | forbidden | `process.chdir` is allowed nowhere | `src/LintRules.spec.ts` |
| The real process context | forbidden | Test code never names `createProcessContext` | `src/TestFileConventions.spec.ts` |
| A board's real port | forbidden | A spec starting an Overseer passes `--port 0` | `src/TestFileConventions.spec.ts` |
| The root override, set in-process | forbidden | No spec sets it in-process (`CONFINED_REACHES`) | `src/LintRules.spec.ts` |
| A command's directory | refused | `requireTrackerIsolation` in `createCapturedCommandContext`, `runAgentProgress` and `startAgentProgress`; also the `cwd` of a piped hook input | `cli/testing/CapturedCommandContext.spec.ts`, `cli/testing/CliProcess.integration.spec.ts` |
| Discovery walking up, or the git common directory | refused | `trackerIsolationVerdictFor` runs `findWorkspace` and checks what it resolves | `src/testing/TrackerIsolation.integration.spec.ts` |
| The root override's value | refused | `runAgentProgress` checks both programs' variables through `ROOT_OVERRIDE_VARIABLES`; `startAgentProgress` does not check them | `src/testing/TrackerIsolation.integration.spec.ts` |
| The real home | replaced | A child spawned through `CliProcess` always gets a scratch `HOME`, and a `HOME` in its `environment` never wins; the captured context defaults to `spec-home` | `cli/MonitorRegistryIsolation.integration.spec.ts` |
| The monitor registry | replaced | The context's `temporaryDirectories` default covers every scratch directory, so nothing registers | `cli/RegisterWrittenTracker.integration.spec.ts` |
| A real agent session | replaced | The trap below, and the fake adapter | `cli/testing/CliProcess.integration.spec.ts` |
| The host's GnuPG | replaced | The trap below, and recorded git answering gpgconf as missing | `src/testing/ProgramTraps.spec.ts`, `src/testing/RecordedGit.spec.ts` |
| A scratch worktree | replaced | `addWorktree` creates it beside the repository, never inside, so a walk up finds no other tracker | the helper itself, `src/testing/ScratchWorkspace.ts` |

> **Why.** The isolation check runs before the command, because a throw inside a command becomes an exit code a spec
> cannot tell from the command's own.

> **Careful.** Every helper a spec drives a command through has a lock. A spec calling a library or service directly
> relies on using `src/testing/ScratchWorkspace.ts`, which no guard enforces.

The scratch root is `/tmp/agent-progress-tests` (`SHARED_SCRATCH_ROOT`), short so a Unix socket path under it fits,
and away from macOS's crowded `tmpdir()`, which slows every process started in it. Each run makes its own `run-…` folder
there, directories are named `<prefix>-…` in it, and `removeRunScratchFolder` removes the folder after the whole run,
taking whatever a spec forgot. The two specs needing a tracker outside `/tmp` and `/var/tmp` take a folder from
`createScratchDirectoryOutsideTheFixedTemporaryFolders` under `tmpdir()`, which the isolation check also accepts.
`canonicalPathOf` resolves a path that does not exist yet through its nearest ancestor, because macOS keeps `/tmp` and
`tmpdir()` behind a symlink.

Scratch is cheap by design. `createScratchGitRepository` copies a once-per-run template, and
`createInitializedScratchRepository` copies one per set of `init` arguments and clock reading. The templates live in the
run folder.

### The program traps

No spec reaches the vendor by accident through the adapter or a bare `claude`, and no spec reaches the host's GnuPG
through `gpgconf`. The `claude` trap catches what the fake adapter does not; the `gpgconf` trap catches a recorded-git
player that forgot to answer gpgconf as missing. Both are one guard over `TRAPPED_PROGRAMS`, each program in a folder of
its own; the figure shows `claude`, and `gpgconf` takes the same routes.

![A three-lane sequence. In the test run, the bunfig preload writes a stub claude into the trap folder and puts that folder first on PATH. CliProcess then builds a child environment with the trap and the fake switch, so the binary picks the fake adapter. Separately, the spawn wrap gives a spawn with no env the trap alone. If either child still runs claude, the stub records one line in attempts.log and exits at TRAPPED_EXIT_CODE, and afterEach reads the log and fails the test.](../figures/guards-and-testing/claude-trap.png)

*The green box is the normal path; the coral box exists so that a mistake fails loudly instead of spending a session.*

`bunfig.toml` preloads `src/testing/ProgramTrapGuard.ts`, whose `prependToExecutableSearchPath` call is the one write
to the process environment outside a spec (a Deviation in [CLAUDE.md](../../CLAUDE.md)). The spawn wrap exists because
`Bun.spawn` without `env` uses the environment from process start, before the trap. The `Bun.which` wrap exists for the
same reason: without a `PATH` option it searches the start's `PATH`, so the executable resolver, which `GpgDirectories`
and the Claude Code adapter use in the spec's own process, would find the real program. `childEnvironmentOf` in
`cli/testing/CliProcess.ts` applies the trap and both programs' fake-agent switches last, so no spec's environment turns
them off.

The stub records where it ran and exits at `TRAPPED_EXIT_CODE` (97). `afterEach` throws naming each attempt, and
`afterAll` catches one landing after the last test. The recording stub lives in the run folder and goes with it; a
second stub, which records nothing, stays in `/tmp/agent-progress-tests/claude-launch-trap/bin` behind it on `PATH`, so a
process that outlives the run still finds a stub. Both live in a `program-traps/<program>/` folder.

The real-system spec of the `gpgconf` boundary needs the real program. It calls
`releaseTrappedProgramForThisSpecFile('gpgconf', import.meta.path)`, which takes that program's two folders off `PATH`
for the file's cases and puts them back after. The release is derived, not listed: `trapReleaseVerdictOf` allows only a
`*.integration.spec.ts` that `BOUNDARY_SPECS` lists under a boundary whose `SYSTEM_OF_BOUNDARY` is the program's
`releasingSystem` (`gpg`), and `claude` has none. `src/testing/ProgramTraps.spec.ts` holds that the callers are exactly
the released specs, both ways.

> **Careful.** The trap catches a bare program name on a `PATH` it leads. A `Bun.spawn` with its own `env`, or an
> absolute path to the program, passes it by. The Claude Code adapter and `GpgDirectories` resolve the bare name, so the
> real routes are caught.

### Skips

A test needing a tool the machine may lack goes through `src/testing/ToolGuard.ts`. An unmet requirement skips the
suite with the requirement in its title, and `src/testing/TestRunReport.ts` prints every skip with a count.

| `SpecRequirement` | how it is probed | guard function |
| --- | --- | --- |
| `git` | `Bun.which` | `describeWhenGitIsPresent`, `testWhenGitIsPresent` |
| `bash` | `Bun.which` | `testWhenBashIsPresent` |
| `git-merge-tree-stdin` | Merges a planted pair, never reads a version | `describeWhenGitMergeTreeStdinIsPresent` |
| `sandbox-exec` | Applies a permissive profile; a process already sandboxed may not apply another | `testWhenSandboxExecApplies` |
| `scratch-root-outside-tmp` | Compares `tmpdir()` with `/tmp` and `/var/tmp` | `testWhenTheScratchRootIsOutsideTmp` |
| `chrome` | `chromeExecutablePath` | `testWhenChromeIsPresent` |
| `git-recording` | The git recording of this OS exists | `describeWhenGitIsRecorded`, `testWhenGitIsRecorded` |
| `process-table-recording` | The process table recording of this OS exists | `describeWhenRecorded`, `testWhenRecorded` |
| `local-endpoint-recording` | The local endpoint recording of this OS exists | `describeWhenRecorded`, `testWhenRecorded` |
| `folder-watch-recording` | The folder watch recording of this OS exists | `describeWhenRecorded`, `testWhenRecorded` |
| `fake-agent-outage-recording` | The fake agent's wire scenarios list `network-outage`, which the owner records (gate G1) | `testWhenTheFakeAgentOutageIsRecorded` |

A default spec that plays a recording, and starts no real process for it, takes a recording guard rather than the `git`
guard: on an OS where the boundary is not finished it skips with the stamp check's own words,
`<boundary> is not finished for <os>`. `src/testing/ToolGuard.recordings.spec.ts` holds the two in step.

`FORGE_REQUIRE_EVERY_TOOL=1` registers a failing test instead of each skip. The constant
`EVERY_TOOL_REQUIRED_VARIABLE` builds that name from the program's prefix; [cli.md](../cli.md) holds the table of
variables.

## The fake agent, the DOM and Chrome

Four harnesses cover what a plain spec cannot: a scripted agent, a fake DOM, a real browser and real sessions.

**The fake agent.** `fakeAgentAdapter` in `src/testing/FakeAgentAdapter.ts` is an `AgentAdapter`, the same interface
`CLAUDE_CODE_ADAPTER` implements, and its session is `src/testing/fake-agent/FakeAgentChild.ts`.

![Two routes from a spec to a command. In-process, runCommandLine with the captured context always carries fakeAgentAdapter. Spawned, CliProcess starts the binary, and agentAdapterOfThisProcess picks fakeAgentAdapter under the fake-agent switch. Both end at FakeAgentChild. The CLAUDE_CODE_ADAPTER branch is dashed, unreachable under test. Only the spawned route shows the shebang, the exit status, a child's environment or a command running beside another.](../figures/guards-and-testing/two-routes-to-a-command.png)

*Spawn only for what the bottom line names; everything else is cheaper in-process, with the same fake agent.*

The child plays a scenario file of `FakeAgentStep` values: `print` a Claude-shaped stream-json line, run a `shell`
command, `await-line` on stdin, `exit`, or `crash` by SIGKILL. Overseer, Talos and crash specs drive real processes
this way with no vendor involved. The switch is `FAKE_AGENT_VARIABLE`.

> **Careful.** This test helper is part of the shipped program, so it must not pull in the Claude Code adapter.
> `cli/CommandContext.ts` imports `src/testing/FakeAgentAdapter.ts`, the one file entry in `TESTING_FOLDER_IMPORTERS`.
> `FakeAgentAdapter.ts` imports `ClaudeStreamLines.ts` rather than the vendor adapter, so the
> vendor seam holds.

**DOM specs.** `bun test` never runs a `.dom.tsx`: its pattern does not match the name, and
`src/TestFileConventions.spec.ts` bans a `.spec.tsx`, which it would match and run without a DOM.

![The two test runs: bun run verify runs typecheck and lint side by side, then bun test; RunDomSpecs runs by hand. Below bun test, the main run finds spec files in one process with the program traps and the skip report preloaded. Below RunDomSpecs, the DOM run finds bridge dom files and runs them in one isolated process, a fresh global per file, with HappyDom added, and fails on finding none.](../figures/guards-and-testing/two-test-runs.png)

*`HappyDom` replaces `fetch` and other globals for a whole run, so it is never a preload of the main run.*

`bridge/testing/RunDomSpecs.ts` passes its preloads with `--preload`. That adds to `bunfig.toml`'s list rather than
replacing it, so a DOM run carries the program traps as well.

**Manual smoke.** `cli/testing/CutoverSmoke.ts` is a script, never a spec, and it runs real `claude` sessions. Only
its judgement, `cli/testing/CutoverSmokeUtil.ts`, has a spec.

## Test helper folders

A test helper is reachable only from where `TESTING_FOLDER_IMPORTERS` says. A folder entry admits only specs and helpers
there; a file entry admits that one shipping module.

![A thin strip of layers, lib to features. A src/lib/ spec importing src/shared/ directly is refused by LAYER_REACH. The permitted route runs from that spec through TESTING_FOLDER_IMPORTERS to src/testing/ToolGuard.ts, which may import src/shared/Environment.ts because src/testing/ reaches every source layer, never a feature.](../figures/guards-and-testing/testing-side-door.png)

*The route runs against the import direction, which is why the gate is an exact list. Only `src/testing/` has a reach
of its own; every other testing folder keeps the layer of its parent.*

<details>
<summary>The seven helper folders and who may import them</summary>

| folder | admits specs of | what lives there |
| --- | --- | --- |
| `src/testing/` | `src/`, `cli/`, `bridge/`, and the file `cli/CommandContext.ts` | `ScratchWorkspace`, `TrackerIsolation`, `ToolGuard`, `TestRunReport`, the program traps, the fake agent, `ImportGraph`, `RepositorySources`, `SourceMutant`, Talos protocol clients, planted children, Board and tracker fixtures |
| `src/lib/tracker-model/testing/` | `src/lib/tracker-model/` | `LifecycleFixtures`, `LifecycleWorld`, `TupleCoversTheUnion` |
| `src/adapters/progress/testing/` | `src/adapters/` | `ProgressFileFixtures` |
| `src/services/tracker/testing/` | `src/services/tracker/` | `ThrownFailure` |
| `src/services/overseer/testing/` | `src/services/overseer/` | `AirlocksHarness`, `LiveJobFixture`, the frozen monitor and summary documents |
| `cli/testing/` | `cli/`, `bridge/` | `CliProcess`, `CapturedCommandContext`, `InitializedScratchRepository`, `OtherProductNamesPreload`, `CutoverSmoke`, stored-file readers |
| `bridge/testing/` | `bridge/` | `RunDomSpecs`, `HappyDom`, `HeadlessBridgeCheck`, `FakeControls`, board fixtures |

</details>

`src/lib/claude-code/testing/fixtures/` holds data only, so it is outside the graph and has no entry.

## Invariants

1. A guard's green result counts only after its floor holds and each form it claims has been watched failing.
2. An allowlist in a spec is exact both ways. ESLint's are not, as the [As built note](#what-eslint-holds) says.
3. A command run through `createCapturedCommandContext`, `runAgentProgress` or `startAgentProgress` starts in a scratch
   directory with a scratch home, and a spec starting an Overseer passes `--port 0`.
4. A bare `claude` or `gpgconf` on a `PATH` the traps lead never reaches the real program; a spec that executes one
   fails, and only the `gpg` boundary's real-system spec takes the `gpgconf` trap off, for its own file.
5. Every binary spawned through `CliProcess` runs with the fake-agent switches on and the trap first on `PATH`,
   whatever the spec's environment says.
6. A skip is printed by name, and `EVERY_TOOL_REQUIRED_VARIABLE` turns it into a failure.
7. `bun test` runs no DOM, and each DOM spec runs in a process of its own.
8. Every Playbook claim holds on the source and fails on its mutant, whose text occurs exactly once.

## In the code

| concept | path | symbol | held by |
| --- | --- | --- | --- |
| Import scan | `src/testing/ImportGraph.ts` | `createImportGraphScanner`, `graphWithPlantedFiles` | `src/testing/ImportGraph.spec.ts` |
| Source scan | `src/testing/RepositorySources.ts` | `repositoryTypeScriptSources` | the guards using it |
| Layer table | `src/ImportDirection.spec.ts` | `LAYER_REACH`, `TESTING_FOLDER_IMPORTERS` | itself |
| Confined reaches | `eslint.config.js` | `CONFINED_REACHES`, `confinedReachRules` | `src/LintRules.spec.ts` |
| Scratch directories | `src/testing/ScratchWorkspace.ts` | `createScratchDirectory`, `createScratchGitRepository`, `addWorktree` | used by every disk spec |
| Isolation check | `src/testing/TrackerIsolation.ts` | `trackerIsolationVerdictFor`, `requireTrackerIsolation` | `src/testing/TrackerIsolation.integration.spec.ts` |
| In-process commands | `cli/testing/CapturedCommandContext.ts` | `createCapturedCommandContext` | `cli/testing/CapturedCommandContext.spec.ts` |
| Spawned binary | `cli/testing/CliProcess.ts` | `runAgentProgress`, `startAgentProgress`, `childEnvironmentOf` | `cli/testing/CliProcess.integration.spec.ts` |
| Program traps | `src/testing/ProgramTrapGuard.ts`, `src/testing/ProgramTraps.ts` | `failOnAnyTrappedProgramAttempt`, `releaseTrappedProgramForThisSpecFile`, `TRAPPED_EXIT_CODE` | `src/testing/ProgramTraps.spec.ts`, `cli/testing/CliProcess.integration.spec.ts` |
| Skips | `src/testing/ToolGuard.ts`, `src/testing/TestRunReport.ts` | `SpecRequirement` | `src/testing/ToolGuard.integration.spec.ts` |
| Fake agent | `src/testing/FakeAgentAdapter.ts`, `src/testing/fake-agent/FakeAgentChild.ts` | `fakeAgentAdapter`, `FakeAgentStep` | `src/testing/FakeAgentAdapter.integration.spec.ts` |
| Source mutants | `src/testing/SourceMutant.ts` | `mutantPluginFor`, `mutatedModuleOf` | `src/lib/tracker-model/Playbook.spec.ts` |
| Seeded world | `src/lib/tracker-model/testing/LifecycleWorld.ts` | `LifecycleWorld` | `src/lib/tracker-model/Playbook.interleavings.spec.ts` |
| DOM specs | `bridge/testing/RunDomSpecs.ts`, `bridge/testing/HappyDom.ts` | `PRELOADS` | `src/TestFileConventions.spec.ts` |
