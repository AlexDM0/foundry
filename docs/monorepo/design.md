# Forge and Gaia in one monorepo, and forge in a part of a repository

Status: design of 2026-11-13, revised on 2026-11-15 against forge `db64ed0a` and Gaia `1418f76` and to the owner's decisions of that
day. Part A is being built; Part B is designed and not built. The steps, their owners and their status are the migration checklist,
`docs/monorepo/migration.md`; where the two differ, the checklist holds.

Decisions taken by the owner on 2026-11-13:

1. Several forge trackers must be able to live side by side in one git repository.
2. A tracker's agents may change their home folder plus folders the tracker declares; nothing else.
3. Forge's repository becomes the monorepo; Gaia's history is imported into it.

Decisions taken on 2026-11-14 and 2026-11-15:

4. Gaia uses forge's design-system package. Gaia's contributions, its fourteen patches and its requirements list merge into that
   package.
5. Turborepo runs the repository's tasks and caches them, tests included, in one cache folder for the whole repository.
6. Two trackers run in the repository: forge's at `apps/forge`, Gaia's at `apps/gaia`. So Part B is required.
7. The installed forge runs from a second clone outside the monorepo, updated by pulling. Forge's network guard is unchanged.
8. Forge and Gaia are released apart and meet only through system versions (below).
9. Monorepo concerns are monorepo infrastructure. A forge change leaves forge's behaviour in every other project unchanged (a tracker
   at a git root behaves exactly as today), or is a deliberate, opt-in feature.

## Part A. The monorepo

### Layout

```
<forge repository, git root>
  package.json            workspaces apps/*, packages/*, scripts;
                          scripts typecheck, lint, verify, verify:<app>, gate:<app>, cache:audit, each through turbo
  turbo.json              the tasks typecheck, lint, test, test:dom (cached) and check (uncached)
  bun.lock  .bun-version  bunfig.toml  .githooks/  .gitattributes  scripts/CacheAudit.ts
  CLAUDE.md  README.md    which rules govern what; how to set up and verify
  docs/monorepo/          this design and the migration checklist
  apps/forge/             forge's former root, moved as is (cli, src, bridge, skills, resources, setup.*, launcher.ts,
                          bunfig.toml, tsconfig.json, eslint.config.js, turbo.json, CLAUDE.md, README.md, docs/)
  apps/gaia/              Gaia (src, page, resources, docs, bunfig.toml, tsconfigs, eslint.config.js, CLAUDE.md)
  packages/design-system/ the design system both apps draw with, under its CONSTITUTION.md
  packages/flint/         forge's Flint
  packages/forge-contracts/  forge's contract with any client: documents, system versions, compatibility registry
  packages/brand/         forge's mark, its tokens and the geometry a host's mark may draw alike
  packages/system-versions/  the version model and the compatibility registry's logic, naming no server
```

### Tooling: Bun workspaces and Turborepo

Turborepo 2.11.10, pinned at the root, runs each workspace's own scripts in its own folder. No Nx, no build step: packages export
TypeScript source directly.

- One `bun.lock` at the root and the hoisted linker. A consumer declares each package it imports at `workspace:^`, never `workspace:*`,
  so Turborepo reruns it when the package changes and a release names a version range. There is no `catalog:` and no
  `tsconfig.base.json`.
- Every workspace has the task names `typecheck`, `lint`, `test`, `test:dom` and `check`. `check` reads the machine (installed versions,
  recording stamps), so it is never cached.
- `bun test` from the root does not apply a workspace's `bunfig.toml` preload, and every app depends on its own (`HOME` moved to
  scratch, the leak check). The root never runs `bun test`; root `verify` is `turbo run typecheck lint test test:dom check`.
- `Bun.build` on an HTML entrypoint inlines a stylesheet from a workspace package, so forge's Bridge bundle and Gaia's page build keep
  working.
- **One cache folder,** turbo's default `.turbo/cache` in the main checkout. Every linked worktree, a person's
  `.claude/worktrees/<name>` and a tracker's ticket worktree alike, finds it through git's common directory. No `cacheDir`,
  `--cache-dir` or `TURBO_CACHE_DIR`, any of which turns that off. A task's key is its inputs' content, so a change to `apps/gaia` leaves
  forge's entries valid and the reverse: the isolation per project is in the hashes, not in folders. Strict environment mode hashes
  `BUN_RUNTIME_VERSION`; files a task reads outside its package are declared as `$TURBO_ROOT$` inputs.
- **The cache is monorepo infrastructure only; it changes no forge or Gaia code.** Each tracker's gate is configuration with forge's
  existing flags: `gate add verify --writes <repository>/.turbo/cache --defined-by /turbo.json --defined-by /package.json --defined-by
  /bun.lock -- bun run gate:<app>`. `gate:<app>` runs every workspace's `typecheck lint test test:dom`, then `check` for that app only,
  so one app's stale recording stamp never turns the other tracker's gate red. Forge copies a gate's `--writes` into its agents'
  sandboxes, which is the intended shared read-write cache.
- **Trust:** agents can write the cache, so a planted pass is possible. An Overseer-only merge gate audits it:
  `gate add cache-audit --overseer-only --phases merge --writes <repository>/.turbo/cache -- bun run cache:audit`. `cache:audit` re-runs,
  past the cache, the tasks of every package changed since the target and of their dependents; on red it removes those tasks' entries
  and exits non-zero, so forge refuses the landing.
- A cached indicator for gate runs is a forge feature, stack-neutral and opt-in: forge hands every gate run a report path, a gate may
  write whether its run was a cache hit, partial or a miss, and the Bridge's pipeline view marks it. The `gate:*` and `cache:audit`
  scripts write it from turbo's run summary.

### What changes in forge because it is no longer at the git root

- **Install:** the installed forge runs from a second clone outside the monorepo, updated by pulling. Its `setup.sh` re-points the
  compiled launcher (`LAUNCHER_TOOL_DIRECTORY`) and `bun link`, and the login items are created again from there, since a login item
  stores the repository path. So no program a job can write guards it, and the network guard stays as it is.
- **Hooks:** setup's `HooksPathStep` needs no change: it writes the relative `.githooks`, which git resolves from each worktree's root.
  `.githooks/pre-commit` runs the root's `bun run lint` and `typecheck`. Agents' forced hooks path is another matter (Part B rule 10).
- **`CodeVersion`** hashes the program folders, each workspace package forge depends on, and the root `bun.lock`. A landing into a
  shared package therefore shows both trackers' Overseers newer code on disk; the restart notice says so.
- **Guards:** those that read the program root keep working because their files moved along (`ProseWrap`, `DocumentSpecCitations`,
  `ProductNames`). `BunVersionPin`, `LineEndingPolicy` and the `.claude/rules/` readers read the workspace root. The guards that walk the
  program root also walk each workspace package forge declares, each asserting it found files. The source walk skips `.forge/` and
  `.forge-worktrees/` at any depth, since a project tracker's ticket worktrees sit under its program root.
- **Package boundaries:** `ImportGraph` already resolved workspace packages from the program root's `package.json`; it now reads each
  package forge declares, under a folder named after it. Rules: a package imports nothing from `apps/`; an app imports a package only by
  its name and only while its `package.json` declares it.
- **DOM specs:** each package has its own DOM spec runner and preload; one spec suffix, forge's `.dom.tsx`.
- **Lint:** `eslint.config.js` per workspace; no root config.

### packages/flint

Pure UI, committed and a workspace package that only forge declares. The Bridge imports it by name (`flint`, `flint/react`, ...). Gaia
draws no Flint, and the brain stays in the forge's Overseer: the package buys a boundary, not reuse by Gaia.

### packages/design-system

Forge's design-system package, with its own README and constitution, is the design system both apps draw with. This reverses Gaia's
decisions D8/V8 ("own copy, drift accepted") and D12 ("the build writes only in the Gaia repository"); Gaia's own copies of shared
components are gone. Gaia's additions arrived through the design-system merge: the parts Gaia contributed moved into the package beside
the layer they belong to, each of Gaia's fourteen patches was implemented in the package with the patch as its specification, Gaia's
call sites switched over, and the contributions package and `migration/` were deleted. The design
of 2026-11-13's "nine shared names, forge's version as base", the `board.css` split and the neutral prefix are done or moot.

### The shared contracts

`packages/forge-contracts` (the design's proposed `overseer-contracts`) exists: forge's documents as types, forge's system versions and
its compatibility registry, with the raise-the-minimum report and guard. `packages/system-versions` holds the version model any server
and client share. `packages/brand` holds forge's mark. None names Gaia. The recorded fixtures stay with Gaia, the reader, because a
recording is of a released forge, never of the source beside it.

Not shared: `ProductNames`, `Limits`, `AtomicFile`, the recording harness. Small and diverged; sharing them adds coupling for little gain.

### How forge and Gaia release apart

- Each app and each shared package carries its own semantic version. The shared packages are publishable, not private.
- `workspace:^` becomes a version range such as `^0.1.0` on release, so an app's release names the oldest package version it builds
  with, not the repository's commit.
- At runtime a forge and a Gaia meet only on the wire, through system versions:
  - Forge never knows Gaia. Nothing forge serves, and nothing in a package forge depends on, names Gaia; `forge-contracts` and `brand`
    each hold this with a guard spec.
  - Each system has one system version, major.minor by interoperability, never its package version: a minor only adds; a major may break
    a client of an older major.
  - A server answers its current system version and its minimum supported, which it alone decides, at `GET /api/versions`, unversioned
    and never removed. REST endpoints are versioned by path, `/api/v<n>/<endpoint>`, side by side, with no per-endpoint version in their
    answers. A message protocol carries the system version in its handshake and every message. Stored files keep their own format
    version.
  - A server's compatibility registry names everything it keeps for clients of older versions, each with the version that introduced it
    and the last that still needs it; a raise-the-minimum dry run (`bun run versions:raise-minimum <major.minor>`, in its own folder)
    lists what becomes removable, and a guard spec fails after a raise until it is removed. Forge's is
    `forge-contracts/ForgeCompatibilityRegistry`; Gaia's own, toward its page and launcher, is
    `apps/gaia/src/shared/constants/GaiaCompatibilityRegistry.ts`.
  - Gaia supports exactly one forge version, `SUPPORTED_FORGE_VERSION`, and keeps no backward compatibility for any other. In the
    monorepo it strives for the latest: its `check` warns while it is behind forge's current version. Per forge, from its
    `/api/versions`: current, ahead (Gaia still talks), newer (Gaia needs an update) or older (the forge needs one: Update forge).
- A forge system minor bump is a package minor bump of `forge-contracts`; a system major bump, or a removed or changed type, a package
  major bump.
- Gaia tests what it does with a forge's answers against recordings of forges at the versions it meets, each stamped with the forge's
  version, or authored from the forge requirements until a released forge serves them, never against the forge source beside it.

## Part B. Forge in a part of a repository

Line numbers below are forge's at `db64ed0a`, under `apps/forge/` since the move.

### Finding

Forge can already put a tracker in a subdirectory (`init --root`; `findWorkspace` walks up to the nearest `.forge/progress.json`). What
fails is that the single `Workspace.rootDirectory` is then used as several different things: the git directory, the main checkout, the
project folder, the session's working directory and the instructions root, about 250 uses in 43 non-spec files. Agent worktrees are
whole-repository checkouts and git reports paths relative to the toplevel, so with a subdirectory tracker these silently stop matching:
the `.claude/`, `.mcp.json` and `.forge/` patterns in Customs (`Customs.ts:288-294,475`), `definedBy` globs (`Customs.ts:366-382`),
`git show <rev>:path` (`InstructionFiles.ts:97,156,160`, `DrivePass.ts:383-386`), the sandbox's `.claude` deny
(`WorkerProfiles.ts:142,157`) and the CLAUDE.md exclusion (`ClaudeCodeAdapter.ts:120-128`).

Three things the first design missed are load-bearing:

- **The git ceiling.** `GitWorktrees.ceilingOf(path)` is `dirname(path)` (`GitWorktrees.ts:44-46`), passed as `GIT_CEILING_DIRECTORIES`
  (`GitProcess.ts:42`) at 36 call sites. Git run in a project folder with its parent as the ceiling is "not a git repository", so, for
  one, a held target's cleanliness check fails and the target never clears.
- **Root-anchored paths:** the constitution (`InstructionFiles.ts:32`, committed by `ConstitutionCommits.ts:90-103`, landed by
  `Airlocks.ts:1099`), the managed block's `${target}:CLAUDE.md` (`DrivePass.ts:383-386`) and agents' forced hooks path
  `join(rootDirectory, '.githooks')` (`WorkerProfiles.ts:356`, `DrivePass.ts:654`): with a project tracker the last points at a folder
  that does not exist, and agent commits silently skip the pre-commit hook.
- **The foreign-ref check fails with one tracker already.** `refsOf` reads every ref and every detached worktree HEAD
  (`Customs.ts:561-578`), and the main line is not exempt, so a person's commit in `.claude/worktrees`, a new branch, a `git stash`, a tag
  or a fetch during a job fails it with `foreign-ref-moved`.

### Five names instead of one

| Name | Meaning | Root tracker | Tracker in `apps/forge` |
|---|---|---|---|
| `repositoryRoot` | the main checkout's root | `/r` | `/r` |
| `projectDirectory` | folder that holds `.forge/` | `/r` | `/r/apps/forge` |
| `projectPrefix` | project relative to repository | `''` | `apps/forge` |
| `worktreeRoot` | toplevel of one agent checkout | `…/ticket-7` | `…/ticket-7` |
| `projectDirectoryInWorktree` | `worktreeRoot` + `projectPrefix` | `…/ticket-7` | `…/ticket-7/apps/forge` |

`projectPrefix` is computed at start, never stored, so moving a package needs no migration. With prefix `''` every rule reduces to
today's behaviour.

### Rules

1. Tracker and worktrees stay with the project: `<projectDirectory>/.forge/` and `<projectDirectory>/.forge-worktrees/`. The nested
   `.gitignore` forge writes already works.
2. Tracker lookup: the walk-up stays (it reaches the owning tracker from inside an agent worktree, because `.forge` is ignored and so
   absent from worktrees). The git fallback (`Workspace.ts:88-90`) takes the current directory's path relative to its own toplevel,
   applies it to the main checkout's root, and walks up from there. Without this, `.claude/worktrees/<name>/apps/forge` finds no
   tracker. `init` without `--root` chooses the main checkout's root (`RepositoryRoot.ts:43-50`), not the current worktree's toplevel, and
   says so. A session at the root of a repository whose trackers all sit in projects gets no tracker's instructions.
3. An agent session starts in `projectDirectoryInWorktree`, and gate `in` resolves from it (`GateRun.ts:211-213`, `JobLaunch.ts:1634`).
   Prepare steps get an `in`, and a leading `/` in `in` means the repository root, needed for `bun install` at the workspace root. Both
   change the pipeline file's format, a version bump: a forge refuses a pipeline file of another version (`older-pipeline`), and nothing
   migrates. The pipeline agent's snapshot, gate profiling and pipeline checking each add a detached worktree of the whole repository and
   run there at `projectDirectoryInWorktree` too; tree portability findings are scoped to the project. The transcript slug needs no
   change: a job's transcripts are found by session id.
4. The agent's write root and Edit/Write scope is `worktreeRoot`, not its working directory (today both are the same value:
   `WorkerProfiles.ts:237-249`, `ClaudeCodeAdapter.ts:100-101`). Otherwise reach folders and a root install are not writable. The sandbox
   denies `.claude` at the worktree root and at the prefix.
5. Reach: the tracker declares repository paths besides its home, for example
   `"reach": ["/packages/design-system", "/bun.lock", "/package.json", "/turbo.json"]`. Customs rejects a change outside home plus
   reach. The sandbox cannot enforce this (installs write `node_modules` across the workspace), so Customs is the enforcement point and
   rule 4's denies are the early guard.
6. Every tracker's gate is a whole-repository gate (`bun run gate:<app>`, at `in: /`), so a forge ticket cannot turn Gaia red through a
   shared package, and Turborepo makes the untouched workspaces a cache replay. No separate repository gate is needed.
7. Git runs at a toplevel only: `repositoryRoot` for the main checkout, `worktreeRoot` for a job. The project prefix is applied to
   paths, never to the directory git runs in, which also keeps cwd-relative forms (`git checkout -- .`, `git ls-files`) honest. Path
   mapping lives in one place: `toRepositoryPath(projectPath)`, `toProjectPath(repositoryPath)`. Everything git hands back is mapped
   before comparison; everything handed to git is mapped on the way in. Paths in tickets, `definedBy` and the pipeline are
   project-relative; a leading `/` is repository-relative. That covers the constitution (`<prefix>/CONSTITUTION.md`), the managed block
   (`<target>:<prefix>/CLAUDE.md`), `definedBy` (a pattern with an inner `/` anchors at the project, a bare name matches within the
   project only, a `/` pattern at the repository) and the ticket body's naming of a path (`Customs.ts:414`).
8. Protected paths match at any depth: `(^|/)\.claude/`, `(^|/)\.mcp\.json$`, any `.forge/`.
9. Instruction files: exclude CLAUDE.md above `repositoryRoot`, not above the project, so the monorepo's root CLAUDE.md applies. Nested
   worktrees sit under the main checkout's CLAUDE.md files; those main-line copies are excluded so only the branch's own load. An
   ancestor's unscoped `.claude/rules/*.md` load in a subfolder session too, and `claudeMdExcludes` excludes them by an absolute path or
   a glob, never by a bare folder path (probe P20 in `apps/forge/docs/development/overseer-claude-probe.md`).
10. `core.hooksPath` is resolved from `repositoryRoot`, for setup and for agents' forced hooks path alike, ideally by reading the main
    checkout's configured `core.hooksPath`.
11. Installed files (`.claude/skills`, settings hooks, briefs) go under `projectDirectory`, and the orchestrator session starts there.
    Probed (P18, P19): a session started in a subfolder loads that subfolder's `.claude/settings.json` hooks and its own and every
    ancestor's skills, but not the root's `.claude/settings.json`; `$CLAUDE_PROJECT_DIR` is the folder the session started in, so a hook
    script that must run from both finds itself by its own path.
12. Gate sandboxes may reach localhost in every project; the outside network stays denied (Gaia's specs fetch `127.0.0.1`).

### Several trackers in one repository

A lock and separate branch names are not enough: today each tracker treats any ref it did not move itself as foreign. A moved main tip
is `target-moved`, a decision per tip, parked after two moves (`Landing.ts:84-93`, `Airlocks.ts:899-915`).

- **Branch namespace:** each tracker gets a `branchNamespace` in `progress.json`, set by `init --namespace` or `namespace`:
  `forge/<namespace>/ticket-<id>`,
  `…/group-<name>`. A tracker without the field keeps today's bare names; a tracker whose prefix is not `''` must have one. The names are
  spelled in the sandbox's ref denies (`WorkerProfiles.ts:336,351`), the wording, merge forecasting and the installed prompts and briefs,
  so the change raises forge's install version and every tracker runs `update`. No namespace may equal an existing branch name.
- **Foreign-ref check:** scoped to the tracker's own namespace (or `ticket-*` and `group-*` for a bare-name tracker), its group branches,
  the main line, the job's own worktree HEAD and the detached HEADs under its own worktrees root. Every other branch, `refs/stash`,
  `refs/tags`, `refs/remotes`, and detached HEADs elsewhere are ignored. This is needed with one tracker, since people work beside it.
- **Shared landing journal** in the git common directory, `<common>/forge/landings.jsonl`, versioned, appended atomically by each
  landing. Forge already refuses `target-moved-by-a-recorded-landing` and requeues from the branch tip without counting it toward parking
  (`Landing.ts:60,91`); today its recorded landings are the tracker's own. The journal's entries for the target are added to them, for
  the landing and for Customs. A move not in the journal stays what it is today.
- **Lock:** a lock folder beside the journal, `landings.lock`, held only for the journal read, the tip check, the fast-forward and the
  journal line, not across gates and agent fixes. A landing never waits on it: one that finds it held is refused `landing-lock-held`,
  keeps its slot and lands on a later sweep. A tracker at the root takes no lock and writes no journal, as before.
- **Held targets:** a held target clears when the paths the fast-forward changes are clean in the main checkout, judged at
  `repositoryRoot` (`Airlocks.ts:799-805`), not when the whole checkout is clean.
- **`init`** refuses a tracker above (today) and below a new one. Forge's tracker therefore leaves the git root for `apps/forge/.forge`
  before Gaia's tracker exists. For "below", `init` keeps a tracker list beside the journal, `<common>/forge/trackers.json` (tracker id,
  prefix, namespace), which also gives namespace uniqueness without the machine registry.
- **Identity:** `trackerId` is random; the port and login-item label derive from it. The registry entry and the monitor snapshot keep
  `root` as the project directory and gain `repositoryRoot` and `projectPrefix`. The keys only add, so they ship as a forge system minor
  (after Flint's brain), at the same versioned path, and the registry file as format 1.1, never as a new integer contract version. They
  wait for `/api/versions` and the reconciled monitor contract.

### Rejected

- One tracker at the git root with a package scope per ticket: no per-package Overseer or Bridge.
- Sparse-checkout worktrees limited to home plus reach: a workspace install needs every package manifest; revisit only if checkout time
  hurts.
- All worktrees in one folder at the repository root: possible once rule 2 exists, but a tracker owning its own folder needs no
  coordination between trackers.
- `git filter-repo` for the Gaia import: rewrites commits, dropping their signatures.
- A turbo cache folder per tracker: the same correctness, but each tracker would re-run the other app's tasks once after each change
  to it, and people's own runs would share with neither.

### Specs

As built, in forge's default suite on recorded git (real git runs only in `src/lib/git`'s boundary specs, which record the fixture
repository of two sibling trackers and a shared package, `src/testing/TwoTrackerFixture.ts`):

| Claim | Held by |
|---|---|
| path mapping both ways, prefix `''` the identity | `src/shared/utils/ProjectPathsUtil.spec.ts`, `src/services/tracker/ProjectLocation.spec.ts` |
| lookup from an agent worktree and a `.claude/worktrees` checkout, none from the root | `src/services/tracker/Workspace.projectLookup.spec.ts` |
| git runs at a toplevel only | `src/GitRunsAtAToplevel.spec.ts` |
| Customs accepts home and reach, rejects the sibling's files and nested agent configuration | `src/services/lifecycle/Customs.projectScope.spec.ts` |
| a sibling's journaled landing requeues silently, the lock serialises only the landing, a held main line clears on its own paths | `src/services/overseer/Airlocks.siblingTrackers.spec.ts` |
| `init` refuses above and below and a held namespace | `cli/adoption/init/InitPlacement.spec.ts` |
| the pipeline's `in`, `/` paths and `reach` (version 3; an older one refused `older-pipeline`, nothing migrates) | `src/adapters/pipeline/PipelineFile.spec.ts`, `cli/OlderPipelineRefusal.spec.ts` |
| a tracker at the root with no namespace asks git exactly what it asked before (the golden replay) | `cli/overseer/OverseerBuildJob.spec.ts` against `cli/overseer/FrozenRootTrackerGitCalls.json`, taken from forge at `7210f3c1` |

Two Overseers landing in one real repository is not a spec: with real git it could only be a `src/lib/git` boundary spec, which may not
start an Overseer. It is the P7 rehearsal instead, in a scratch clone with the fake agent, recorded in the migration's gate notes. The
network guard spec of the first plan was dropped: the guard stays as it is (Decided, item 1).

### Decided

1. The installed forge runs from a second clone outside the monorepo, and the network guard is unchanged (decision 7).
2. Gaia gets its own tracker at `apps/gaia` (decision 6).
3. A gate always re-runs after a sibling's landing; Turborepo makes an unrelated landing a cache replay.

Found in the rehearsal: a gate's Seatbelt profile cannot start a setuid program, so `/bin/ps` fails with `EPERM` under any profile, and
both apps' default suites list processes with it (forge's spec helpers that look for processes, Gaia's leak check). No test suite of either
app passes in a gate until they list processes another way (`pgrep` runs under the profile), so `gate:<app>` cannot run the `test`
tasks yet.

Not yet probed: whether a path-scoped `.claude/rules` file loads once a subfolder session reads a file under its path, and whether
`sandbox.network.allowLocalBinding` lets a sandboxed Bash reach `127.0.0.1`. Both need a logged-in model turn.
