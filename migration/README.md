# The forge monorepo merge

The one checklist for moving forge and Gaia into forge's repository: every step in order, who does it and where it stands, the
decisions still open, and how forge and Gaia release apart afterwards. The reasoning behind the layout and Part B (forge in a part of
a repository) is the monorepo design (`docs/monorepo-design.md`, 2026-11-13); where the two differ, this checklist holds, and the last
section lists where the design is out of date.

Status as checked on 2026-11-15 against forge `main` at `d47ea0e7` and Gaia `main` at `9b04d10`.

## What Gaia prepared

| Path | What it is | Its README |
| --- | --- | --- |
| `apps/gaia/` | Gaia's whole app, moved as is: `src/`, `page/`, `resources/`, `docs/`, its `bunfig.toml`, tsconfigs, lint config and `CLAUDE.md` | `apps/gaia/README.md` |
| `packages/design-system-contributions/` | The eight components Gaia built that belong in the design system (`TextField`, `Checkbox`, `Figure`, `PageHead`, `FailedAction`, `PendingStep`, `ThemeCycleButton`, `DataTable`, with `ThemeChoice` and `ThemeCycleUtil`), under the design-system package's constitution, importing its components by export name | its `README.md` and `CONSTITUTION.md` |
| `packages/brand/` | Forge's mark as a React component, its tokens in both themes, and the geometry a host's mark may draw alike; it names no Gaia | its `README.md` |
| `packages/forge-contracts/` | Forge's contract with any client: the Overseer's documents as types, forge's system versions, its compatibility registry with the raise-the-minimum report and guard, and the embed mode; it names no Gaia | its `README.md`; what Gaia asks of forge is `apps/gaia/docs/forge-requirements.md` |
| `packages/system-versions/` | The version model any server and client share (`SystemVersion`, `VersionsDocument`) and the compatibility registry's logic, naming no server; used by `forge-contracts` and, for its own clients, by Gaia | its `README.md` |
| `migration/design-system-patches/` | Fourteen numbered patches against forge's design-system package for what Gaia needs of forge's own components, and `CheckPatches.ts`, which says per patch whether it applies, is applied, is stale or waits on an earlier one | its `README.md` |

The root holds the workspace (`package.json` with `apps/*`, `packages/*` and `migration/*`, one `bun.lock`, `.bun-version`) and a
`verify` that runs each workspace's own `verify` in its own folder. Until the merge, forge's design-system package is linked in at the
root with `bun link design-system`.

## Checklist

Numbered as the design's migration order. Part A (steps 0 to 6) does not wait on Part B (step 7): forge's own tracker stays at the git
root, with prefix `''` and its gates `in: apps/forge`, until Part B exists.

### Step 0. Settle both repositories (forge, Gaia)

- [x] Forge: Flint and the design-system package are committed on `main`.
- [x] Forge: the graphite-and-orange and plugin-enable branches are merged.
- [ ] Forge: land or drop `claude/project-thread-dw1bcu` (worktree `gaia-read`, 5 commits ahead of `main`, 117 behind).
- [ ] Forge: land the work uncommitted in the main checkout.
- [x] Gaia: the `apps/` and `packages/` layout, the contributions, `brand`, `forge-contracts`, `system-versions` and the patches are on
      `main`, verify green.
- [x] Gaia: no worktree or branch besides `main`.
- [ ] Gaia: decide what becomes of the folders the merge does not carry, since they are gitignored or untracked: `design_handoff_gaia/`,
      `design_handoff_gaia_v2/`, `.claude/.evidence/` and the root `docs/` (the monorepo design, `gaia-strategy.html`).

### Step 1. Quiesce (forge)

- [ ] No live jobs, the Overseer stopped, the agent worktrees removed.

### Step 2. Restructure forge's repository (forge)

- [ ] `git mv` forge's tree to `apps/forge`, and its `design-system/` to `packages/design-system`. The tracker's `.forge/` stays at the
      git root: it is gitignored, so `git mv` leaves it anyway.
- [ ] Root workspace files: `package.json` (workspaces `apps/*`, `packages/*`), `bun.lock`, `.bun-version`, `.githooks/`,
      `.gitattributes`, `tsconfig.base.json`, and the `typecheck`, `lint` and `verify` scripts that fan out per workspace, which the
      pre-commit hook runs at the git root. The root never runs `bun test`: a workspace's `bunfig.toml` preload applies only in its folder.
- [ ] The installed forge (open decision 1): clone it outside the monorepo's working tree, run its `setup.sh` again (it re-points
      `LAUNCHER_TOOL_DIRECTORY` and `bun link`) and create the login item again, which stores the repository path.
- [ ] `HooksPathStep` sets `core.hooksPath` from the git toplevel.
- [ ] `CodeVersion` hashes the workspace packages forge depends on and the root `bun.lock`.
- [ ] `BunVersionPin` and `LineEndingPolicy` read the workspace root; the guards whose files move along (`ProseWrap`,
      `DocumentSpecCitations`, `ProductNames`) stay as they are.
- [ ] `ImportGraph` follows workspace packages, with two new rules: a package imports nothing from `apps/`, and an app imports a package
      only by its name.
- [ ] A DOM spec runner for packages, and `TestFileConventions` allows `.dom.tsx` in them.
- [ ] `eslint.config.js` stays per app; `@types/bun` at `1.4.2` in both apps.

### Step 3. Import Gaia (forge's repository, both)

- [ ] `git fetch` Gaia's `main` and `git merge --allow-unrelated-histories`, signatures intact. Gaia's `main` is already in the
      `apps/` and `packages/` layout, so only root files conflict:
  - `package.json`: forge's, with `migration/*` in `workspaces` while the patches wait, and Gaia's dev dependencies merged in at one
    version each.
  - `bun.lock`: taken again with `bun install`.
  - `README.md`, `CLAUDE.md`, `.gitignore`, `.bun-version`: forge's, keeping Gaia's lines where they still say something. Gaia's root
    `CLAUDE.md` only points at `apps/gaia/CLAUDE.md`; it goes, and the monorepo's root `CLAUDE.md` names each app's own.
- [ ] The root `README.md` loses Gaia's `bun link design-system` step; the package is now a workspace member.
- [ ] `apps/gaia/CLAUDE.md` rule 1 (write only in this repository, forge read-only) is restated for one repository: what Gaia may change,
      and that it still never runs a forge verb in the checkout or talks to a running forge.
- [ ] `apps/gaia/CLAUDE.md` rule 11 drops the link. Remove what only the link needed, where verify stays green without it: the
      `DesignSystemPeerPreload` in `bunfig.toml`, `preserveSymlinks` in `page/tsconfig.json`, and the page build's `SingleReactPlugin`.
- [ ] `packages/brand`, `packages/forge-contracts` and `packages/system-versions` join as they are.
- [ ] `bun run verify` at the root is green.

### Step 4. The design system (both)

- [ ] Move every file of `packages/design-system-contributions` into `packages/design-system`, beside the layer it belongs to, and make
      its `design-system/<Export>` imports relative. Add its exports to the package's `package.json` and its stylesheet's rules to the
      package's entry stylesheet; its guard specs are the package's own and go.
- [ ] Run `bun migration/design-system-patches/CheckPatches.ts packages/design-system`, make again against the landed source each
      patch it names stale, then apply the series in order:
      `git am --directory=packages/design-system migration/design-system-patches/*.patch`. On forge `d47ea0e7` only patch 01 applies;
      the other thirteen are stale. Remake them right before this step, once the package has stopped moving, not earlier.
- [ ] Switch Gaia's call sites: each `design-system-contributions/<Export>` import becomes `design-system/<Export>`; the
      `design-system-contributions` dependency leaves `apps/gaia/package.json`; its stylesheet link leaves `page/index.html` and
      `page/testing/DesignSystemStylesheet.ts`; its paragraph in `apps/gaia/CLAUDE.md` goes. Then each patch's "Gaia switches over"
      list in `migration/design-system-patches/README.md`.
- [ ] Delete each patch's "Gaia deletes after" list, then `packages/design-system-contributions`, `migration/`, and `migration/*` from
      the workspaces. This checklist moves to the monorepo's docs first if Part B is still ahead.

### Step 5. Flint (forge)

- [ ] `git mv` `flint/` to `packages/flint`, run by the package DOM spec runner of step 2. Nothing from Gaia: Gaia draws no Flint.

### Step 6. The shared contracts (forge)

- [ ] Forge takes its documents from `forge-contracts` or merges its own types into the package (requirement V9).
- [ ] Forge draws its mark from `brand/ForgeMark`, or merges its own drawing into the package.
- [ ] Gaia: drop what `forge-contracts` still holds only for older forges, `OLDER_OVERSEER_CONTRACT_VERSIONS` and the monitor 1 and 2
      keys in `MonitorSnapshotDocument`, unless forge keeps them for its own registry.

### Step 7. Part B: forge in a part of a repository (forge)

- [ ] Build Part B of the design: the five path names, its rules 1 to 11, and several trackers in one repository (branch namespaces,
      the scoped foreign-ref check, the shared landing journal and lock), with its fixture-repository specs. Prompts that say "the
      repository root" (`SessionInstructions.md`, `OnboarderPrompt.md`) get new wording.
- [ ] Move forge's tracker to `apps/forge/.forge` by hand (ignored files).
- [ ] A tracker for Gaia, if wanted (open decision 2).

## Forge requirements, apart from the merge

`apps/gaia/docs/forge-requirements.md` asks forge for the version model, naming no client. None is on forge `main` at `d47ea0e7`: it
serves no `/api/versions` and its Bridge still enters the embed mode on `?embedded=gaia`. Until V1 to V3 land, Gaia reads every released
forge as older and offers Update forge.

- [ ] V1 to V4 and V6, as forge 1.0: `GET /api/versions`, the system version by interoperability, endpoints versioned by path, the
      compatibility registry, the host-neutral embed mode.
- [ ] V5, with them or in the next minor: the system version in the monitor stream and the embed channel.
- [ ] V7, with Flint's brain (G1 to G3), as forge 1.1: `startedBy: "api"`.
- [ ] V8, when convenient: the framing host's origin from a host-neutral record.
- [ ] V9, at step 6.

## Open decisions

1. The installed forge runs from a second clone outside the monorepo's working tree (recommended), or the network-guard rule is scoped
   so that a program inside the repository does not turn it on for every tracker there.
2. Whether Gaia gets its own tracker after Part B, or stays built by workflows.
3. Whether a gate re-run is skipped when a sibling's landing touched nothing in a tracker's home or reach (the first version always
   re-runs).
4. Forge's design-system package is `"private": true`. Since Gaia depends on it, it either becomes publishable, with its own semantic
   version and a `workspace:^` range in both apps, or is bundled into each app's release.
5. Restart after Update forge, for an older forge, needs a program route forge does not have.
6. What becomes of Gaia's gitignored and untracked folders (step 0).

## How forge and Gaia release independently

- Each app and each shared package carries its own semantic version. The shared packages (`brand`, `forge-contracts`, `system-versions`, and
  `design-system-contributions` until it moves) are publishable, not private.
- An app depends on a shared package with `workspace:^`, never `workspace:*`; `workspace:^` becomes a version range such as `^0.1.0` on
  release, so an app's release names the oldest package version it builds with, not the repository's commit.
- At runtime a forge and a Gaia meet only on the wire, through system versions (the owner's model of 2026-11-15, which replaced the
  per-endpoint version triple, the "behind" verdict, Gaia's minimum forge version and every Gaia-side backward compatibility):
  - Forge never knows Gaia. Nothing forge serves, and nothing in a package forge depends on, names Gaia; `forge-contracts` and `brand`
    each hold this with a guard spec.
  - Each system, forge and Gaia, has one system version, major.minor by interoperability, never its package version: a minor change only
    adds; a major change may break a client of an older major.
  - A server publishes, at `GET /api/versions`, unversioned and never removed, its current system version and its minimum supported, the
    oldest version of its own system a client may have been built for and still be served. The server alone decides the minimum.
  - REST endpoints are versioned by path, `/api/v<n>/<endpoint>`, served side by side, with no per-endpoint version in their answers.
    Message protocols (the fleet stream, the monitor stream, the embed channel) carry the system version in their handshake and every
    message. Stored files keep their own format version.
  - A server's compatibility registry names everything it keeps for clients of older versions, each with the version that introduced it
    and the last that still needs it; a raise-the-minimum dry run lists what becomes removable, and a guard spec fails after a raise until
    it is removed. The logic is `system-versions`'. Forge's registry is `forge-contracts/ForgeCompatibilityRegistry`; Gaia's own, toward
    its page and launcher, is `apps/gaia/src/shared/constants/GaiaCompatibilityRegistry.ts`. Each has its dry run, `bun run
    versions:raise-minimum <major.minor>`, in its own folder.
  - Gaia supports exactly one forge version, `SUPPORTED_FORGE_VERSION`
    (`apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts`), and keeps no backward compatibility for any other: no
    migration of an older forge document, no unversioned forge path, no recording of an older forge read. It calls each forge endpoint
    at the version forge's registry serves its supported version. In the monorepo it strives for the latest: Gaia's verify warns, and
    does not fail, while it is behind forge's current version. Per forge, from its `/api/versions`: current, ahead (Gaia knows less, still
    talks; explains only), newer (Gaia cannot talk to it and needs an update; explains only, names no command) or older (Gaia cannot talk
    to it and the forge needs an update: Update forge).
- A forge system minor bump is a package minor bump of `forge-contracts`; a system major bump, or a removed or changed type, a package
  major bump.
- Gaia tests what it does with a forge's answers against recordings of forges at the versions it meets
  (`apps/gaia/src/testing/recordings/`), each stamped with the forge's version, or authored from the forge requirements until a released
  forge serves them, never against the forge source beside it in the repository.

## Where the monorepo design is out of date

- Its `packages/design-system` section predates the decision of 2026-11-14 that Gaia uses forge's design-system package. The package
  exists in forge with its own README and constitution; Gaia's own copies of shared components are gone, and Gaia's additions arrive
  through `packages/design-system-contributions` and the patches. The "nine shared names, forge's version as base" plan, the `board.css`
  split and the neutral prefix are done or moot.
- Its step 0 is largely done (Flint is committed), and its step 3 is a merge of a repository already in the `apps/` and `packages/`
  layout: no move commit is left to make in Gaia.
- It does not state the release rules above, and its tooling section still names `workspace:*`.
- Its layout lacks `packages/brand` and `packages/system-versions`, and names `packages/overseer-contracts`, which is now
  `packages/forge-contracts`: no longer only proposed, it holds types, versions and the compatibility registry, while the recorded
  fixtures stay with Gaia, as the reader.
