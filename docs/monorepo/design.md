# Forge and Gaia in one monorepo, and forge in a part of a repository

Status: design, 2026-11-13, revised after an independent review against the code. Nothing is built.

Decisions taken by Alex on 2026-11-13:

1. Several forge trackers must be able to live side by side in one git repository.
2. A tracker's agents may change their home folder plus folders the tracker declares; nothing else.
3. Forge's repository becomes the monorepo; Gaia's history is imported into it.

Open decisions are listed at the end.

## Part A. The monorepo

### Layout

```
<forge repository, git root>
  package.json            workspaces apps/*, packages/*; catalog for shared versions;
                          scripts lint, typecheck, verify that fan out per package
  bun.lock  .bun-version  .githooks/  .gitattributes  tsconfig.base.json
  apps/forge/             today's forge root, moved as is (cli, src, bridge, skills, resources,
                          setup.*, launcher.ts, bunfig.toml, tsconfig.json, eslint.config.js,
                          CLAUDE.md, README.md, docs/)
  apps/gaia/              today's gaia main (src, page, bunfig.toml, tsconfig.json)
  packages/design-system/ tokens, shared components, their CSS, style contract spec
  packages/flint/         forge's flint/ folder
  packages/overseer-contracts/   (proposed) contract types and recorded fixtures
```

### Tooling: Bun workspaces, nothing else

No Turborepo or Nx: two apps, three packages, no build step. Checked on Bun 1.4.2 in a scratch
repository, by the design and again by the review:

- One `bun.lock` at the root; `workspace:*` resolves; each package gets its own `node_modules`
  with links. `catalog:` resolved in the design's check only.
- Packages export TypeScript source directly; no build step.
- `Bun.build` on an HTML entrypoint inlines `@import "@forge/design-system/tokens.css"` from a
  workspace package, so forge's runtime bundle on first `GET /` keeps working.
- `bun test` from the monorepo root does NOT apply a package's `bunfig.toml` preload, and both
  apps depend on theirs (HOME moved to scratch, leak check). The root never runs `bun test`; root
  `verify` is `bun run --filter '*' verify`.

Forge's `@types/bun ^1.3.14` is aligned to Gaia's exact `1.4.2` pin.

### What changes in forge because it is no longer at the git root

- Install: `setup.ts` passes `import.meta.dir`, so re-running `apps/forge/setup.sh` re-points the
  compiled launcher (`LAUNCHER_TOOL_DIRECTORY`) and `bun link`. The login item stores the
  repository path (`cli/setup/LoginOverseer.ts:72-79`) and must be re-created too.
- `HooksPathStep` must set `core.hooksPath` from the git toplevel. `.githooks/pre-commit` runs
  `bun run lint` and `typecheck` at the toplevel, so the root `package.json` needs those scripts.
- `CodeVersion` hashes `cli, src, bridge, resources, skills` under the program root and drops
  `bun.lock`. It must hash the workspace packages forge depends on and the root lockfile.
- Guards that read the program root keep working after the move because their files move along
  (`ProseWrap`, `DocumentSpecCitations`, `ProductNames`). Guards that need the workspace root:
  `BunVersionPin` (`bun.lock`, `.bun-version`), `LineEndingPolicy` (`.gitattributes`).
- `eslint.config.js` stays per app (its `allowedIn` paths and ignores are relative to it).
- Package boundary rules are new work, not a rename: `ImportGraph.ts:59-63` treats package
  specifiers as opaque, so `ImportDirection` and the Bridge's DOM-safety proof stop at a package.
  The graph must follow workspace packages; rules added: packages import nothing from `apps/`,
  apps import a package only by name.
- DOM specs: `bridge/testing/RunDomSpecs.ts` globs `bridge/**/*.dom.tsx` with forge preloads, and
  `TestFileConventions` allows `.dom.tsx` only under `bridge/`. Packages get their own DOM spec
  runner and one spec suffix (forge's `.dom.tsx`; Gaia's `.spec.tsx` component specs are renamed
  when they move).
- Network guard: `GuardCommand` refuses an entry script inside the repository, and such a job's
  Bash and WebFetch are denied (`ClaudeCodeAdapter.ts:111`). With forge's program living in
  `apps/forge`, every tracker in the monorepo would inherit that restriction, which today only
  forge-on-forge has. Therefore: the installed forge runs from a second clone outside the
  monorepo's working tree (the tool is not the development checkout). See open decision 1.

### packages/flint

`flint/` is pure UI (its only outside imports are `react`, `bun:test` and
`@testing-library/react`), 75 files on disk. It exists only as untracked files in forge worktree
`flint-design-handoff-build-5122bd`, with zero commits: commit it before anything else. Moving it
needs a package manifest and the package DOM runner above; the sources move unchanged.

Only forge consumes it. Gaia v2 decision V2 (Gaia draws no Flint) stands and the brain stays in
the forge's Overseer. The package buys a boundary, not reuse by Gaia.

### packages/design-system

This reverses Gaia decisions D8/V8 ("own copy, drift accepted") and D12 ("the build writes only in
the Gaia repository"). Contents:

- `tokens.css`: graphite-and-orange lands here once, for both apps.
- Fonts: the files live in the package; each app serves that folder at `/fonts/<file>` as Gaia
  v2 section 8 specifies, and `@font-face` uses those absolute URLs. Not bundled: `Bun.build`
  turns bundled fonts into hashed chunks.
- Components: only nine names exist in both apps (Button, Meter, ChoiceOption, Tag,
  SegmentedControl, Callout, Banner, MicroCapsLabel, FactList), each diverged by 30 to 118 lines.
  Those nine move first, forge's version as the base, each Gaia difference kept or dropped
  deliberately. The other forge and Gaia components move when the second app needs them.
- `design-system.css` with only those components' classes, split out of forge's `board.css`
  (2,688 lines) and Gaia's `gaia.css`. Forge's classes are prefixed `bridge-`; the package needs
  one neutral prefix.
- The style contract spec, split: the package pins its components against its CSS; each app pins
  its own classes.
- Seven forge components import `DisplayState` from the tracker model. The package owns its own
  state-tone type; forge asserts at type level that `DisplayState` fits.

### packages/overseer-contracts (proposed, not asked for)

Gaia's largest recurring cost so far was contract drift (W7.2 re-record, D5 monitor contract 2),
not styling. A package with the summary, monitor, control and embed types, version constants and
recorded fixtures, produced by forge and consumed by Gaia, removes the copy. Recorded fixtures
stay, because Gaia must talk to forges of other versions.

Not proposed: sharing `ProductNames`, `Limits`, `AtomicFile`, the recording harness. Small and
diverged; sharing them adds coupling for little gain.

### Migration order

Part A does not need Part B: forge's own tracker can stay at the git root (prefix `''`, gates with
`in: apps/forge`) until Part B exists. That keeps Gaia v2's look work from waiting on Part B.

0. Commit Flint in its worktree. Land or rebase the open forge branches; three are 104 to 107
   commits ahead of main in files this work touches.
1. Quiesce: no live jobs, Overseer stopped, agent worktrees removed.
2. Restructure forge's repository: `git mv` to `apps/forge`, root workspace files; tracker
   `.forge/` stays at the git root (it is gitignored, so `git mv` would not move it anyway).
   Clone the install checkout (open decision 1), re-run setup and the login item.
3. Import Gaia with signatures intact: in Gaia, one commit that moves everything under
   `apps/gaia`; in forge, fetch Gaia's `main` and `git merge --allow-unrelated-histories`. No
   history rewrite, no extra tool. Land or drop Gaia's D5 worktree first.
4. `packages/design-system` (tokens and the nine components), then graphite-and-orange in it. This
   is Gaia v2's "design-system section lands first".
5. `packages/flint`.
6. `packages/overseer-contracts`.
7. When Part B is built: move forge's tracker to `apps/forge/.forge` by hand (ignored files),
   add a tracker for Gaia if wanted.

## Part B. Forge in a part of a repository

### Finding

Forge can already put a tracker in a subdirectory (`init --root`; `findWorkspace` walks up to the
nearest `.forge/progress.json`). What fails is that the single `Workspace.rootDirectory` is then
used as several different things. Agent worktrees are whole-repository checkouts and git reports
paths relative to the git toplevel, so with a subdirectory tracker these silently stop matching:
the `.claude/` and `.forge/` patterns in Customs (`Customs.ts:266-268,284`), `definedBy` globs,
`git show <rev>:path` (`InstructionFiles.ts:74`, `DrivePass.ts:350`), the sandbox's `.claude` deny
(`WorkerProfiles.ts:141,156`) and the CLAUDE.md exclusion (`ClaudeCodeAdapter.ts:121-128`).

### Five names instead of one

| Name | Meaning | Root tracker | Tracker in `apps/forge` |
|---|---|---|---|
| `repositoryRoot` | git toplevel of the main checkout | `/r` | `/r` |
| `projectDirectory` | folder that holds `.forge/` | `/r` | `/r/apps/forge` |
| `projectPrefix` | project relative to repository | `''` | `apps/forge` |
| `worktreeRoot` | toplevel of one agent checkout | `…/ticket-7` | `…/ticket-7` |
| `projectDirectoryInWorktree` | `worktreeRoot` + `projectPrefix` | `…/ticket-7` | `…/ticket-7/apps/forge` |

`projectPrefix` is computed at start, never stored, so moving a package needs no migration. With
prefix `''` every rule reduces to today's behaviour.

### Rules

1. Tracker and worktrees stay with the project: `<projectDirectory>/.forge/` and
   `<projectDirectory>/.forge-worktrees/`. The nested `.gitignore` forge writes already works.
2. Tracker lookup: the walk-up stays (it reaches the owning tracker from inside an agent
   worktree, because `.forge` is ignored and so absent from worktrees). The git fallback
   (`Workspace.ts:82-84`) only tests the main toplevel today; it must take the current directory's
   path relative to its own toplevel, apply it to the main checkout, and walk up from there.
   Without this, `.claude/worktrees/<name>/apps/forge` finds no tracker.
3. An agent session starts in `projectDirectoryInWorktree`; gate `in` and the transcript slug use
   it too. Prepare steps get an `in`. A leading `/` in `in` means the repository root, needed for
   `bun install` at the workspace root.
4. The agent's write root and Edit/Write scope is `worktreeRoot`, not its working directory
   (today both are the same value: `WorkerProfiles.ts:236-247`, `ClaudeCodeAdapter.ts:100-101`).
   Otherwise reach folders and a root install are not writable. The sandbox denies `.claude` at
   the worktree root and at the prefix.
5. Reach: the tracker declares repository paths besides its home, for example
   `"reach": ["/packages/design-system", "/bun.lock", "/package.json"]`. Customs rejects a change
   outside home plus reach. The sandbox cannot enforce this (installs write `node_modules` across
   the workspace), so Customs is the enforcement point and rule 4's denies are the early guard.
6. A landing that changes anything in reach outside home also runs a repository gate (`in: /`,
   the workspace `verify`), so a forge ticket cannot turn Gaia red through a shared package.
7. Git path mapping in one place: `toRepositoryPath(projectPath)`, `toProjectPath(repositoryPath)`.
   Everything git hands back is mapped before comparison; everything handed to git is mapped on
   the way in. Paths in tickets, `definedBy` and the pipeline are project-relative; a leading `/`
   is repository-relative.
8. Protected paths match at any depth: `(^|/)\.claude/`, `(^|/)\.mcp\.json$`, any `.forge/`.
9. Instruction files: exclude CLAUDE.md above `repositoryRoot`, not above the project, so the
   monorepo's root CLAUDE.md applies. Nested worktrees sit under the main checkout's CLAUDE.md
   files; those main-line copies must be excluded so only the branch's own load.
10. `core.hooksPath` is resolved from `repositoryRoot`.
11. Installed files (`.claude/skills`, settings hooks, briefs) go under `projectDirectory`, and
    the orchestrator session starts there. Unverified: that Claude Code loads
    `<project>/.claude/settings.json` hooks when started in a subfolder of a repository.

### Several trackers in one repository

The review showed that a lock and separate branch names are not enough: today each tracker treats
any ref it did not move itself as foreign. Customs snapshots every ref and every detached worktree
HEAD and fails the job with `foreign-ref-moved` (`Customs.ts:489-538`, `JobLaunch.ts:617`); a moved
main tip is `target-moved`, a decision per tip, parked after two moves (`Landing.ts:83-92`,
`Airlocks.ts:801-816`). Two Overseers would fail and park each other's work continuously.

- Branch namespace: each tracker gets a `branchNamespace` in `progress.json`, set by `init`:
  `forge/<namespace>/ticket-<id>`, `…/group-<name>`. A tracker without the field keeps today's
  bare names. The sandbox's ref denies (`WorkerProfiles.ts:335,347`, hard-coded `ticket-` and group
  prefixes) become: deny `refs/heads/forge/` except the tracker's own namespace.
- Foreign-ref check: scoped to the tracker's own namespace, its own worktrees and the main line.
  Other namespaces and other trackers' detached HEADs (refresh worktree, onboarder snapshot) are
  ignored.
- Shared landing journal in the git common directory (shared by every worktree and tracker, no
  registry needed): each landing appends tracker id, old tip, new tip. A tracker that finds the
  main line moved looks the move up in the journal; a recorded sibling landing is a silent requeue
  that does not count toward parking. A move not in the journal stays what it is today.
- Lock: a lock file beside the journal, held only for the tip check plus the fast-forward, not
  across gates and agent fixes.
- A held target clears only when the whole main checkout is clean (`Airlocks.ts:705`); with
  siblings, "clean" is judged over the paths the fast-forward changes.
- `init` refuses a tracker above (today) and also below a new one: at a root above registered
  package trackers it fails. `init` without `--root` keeps choosing the git toplevel and says so.
- Identity: `trackerId` is random; the port and login-item label derive from it. The registry
  entry and `MonitorSnapshot` keep `root` as the project directory and gain `repositoryRoot` and
  `projectPrefix`, in monitor contract version 4 (version 3 is reserved for Flint's brain state),
  so Gaia can group forges by repository.

### Rejected

- One tracker at the git root with a package scope per ticket: no per-package Overseer or Bridge.
- Sparse-checkout worktrees limited to home plus reach: a workspace install needs every package
  manifest; revisit only if checkout time hurts.
- All worktrees in one folder at the repository root: possible once rule 2 exists, but a tracker
  owning its own folder needs no coordination between trackers.
- `git filter-repo` for the Gaia import: rewrites commits, dropping their signatures.

### Specs

A fixture repository with two sibling trackers and a shared package: path mapping both ways;
lookup from an agent worktree and from a `.claude/worktrees` checkout; Customs accepts home and
reach, rejects the sibling's files and any nested `.claude/`; a sibling's branch, refresh worktree
and landing fail no job and park no merge; two landings in a row both end on the main line; `init`
refuses above and below; a tracker with prefix `''` produces the same commands as today.

### Open decisions

1. Installed forge in a second clone outside the monorepo working tree (recommended), or scope the
   network-guard rule so a program inside the repository does not disable it.
2. Whether Gaia gets its own tracker after Part B, or stays built by workflows.
3. Skipping gate re-runs when a sibling's landing touched nothing in home or reach (first version
   always re-runs).

Unverified: rule 11's Claude Code behaviour; `catalog:` beyond one scratch check. Prompts and
skills that say "the repository root" (`SessionInstructions.md`, `OnboarderPrompt.md`) need new
wording.
