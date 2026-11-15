# Gaia's side of the forge monorepo merge

What Gaia prepared for its import into forge's repository, the steps from Gaia's side in the order of the monorepo design's migration
(`docs/monorepo-design.md`, Part A), how forge and Gaia release independently, and what that design must still be updated with.

## What was prepared

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

## Merge steps from Gaia's side

Numbered as the monorepo design's migration order.

**Before step 3, in Gaia.**

1. Merge the lanes `prep-lane/brand`, `prep-lane/contracts` and `prep-lane/patches` into `prep/monorepo`. Each conflicts with the
   contributions lane: brand in `apps/gaia/CLAUDE.md`, `apps/gaia/package.json`, `page/design-system/BrandBar.tsx`, `page/index.html`,
   `page/styles/gaia.css`, `page/testing/DesignSystemStylesheet.ts`; contracts in `apps/gaia/package.json` and
   `page/views/attention/AttentionLayout.spec.tsx`; all three in `bun.lock`, which is taken again with `bun install`.
2. Make `bun run verify` pass against forge's design-system package as it then stands. The linked package moves under Gaia: forge's
   `CountBadge` now holds a hook, so the specs that unfold it must keep it folded, as they already do for `NumberStepper`, and the rail's
   count reader must allow the badge's inner number span.
3. Land `prep/monorepo` on Gaia's `main`. Land or drop every other open Gaia worktree first.

**Step 2, in forge.** Forge's design-system package moves to `packages/design-system` with the rest of the restructure, so the link
above is no longer needed.

**Step 3: the import.** Gaia's `main` is already in the `apps/` and `packages/` layout, so the step is only `git fetch` of Gaia's `main`
and `git merge --allow-unrelated-histories`, signatures intact. Conflicts are limited to root files:

- `package.json`: forge's, with `migration/*` added to `workspaces` while the patches wait, and Gaia's dev dependencies merged in at one
  version each.
- `bun.lock`: taken again with `bun install`.
- `README.md`, `CLAUDE.md`, `.gitignore`, `.bun-version`: forge's, with Gaia's lines kept where they still say something. Gaia's root
  `CLAUDE.md` is one line pointing at `apps/gaia/CLAUDE.md`; it goes, and the monorepo's root `CLAUDE.md` names each app's own.
- Gaia's `README.md` loses its `bun link design-system` step.

`packages/brand`, `packages/forge-contracts` and `packages/system-versions` join here as they are.

**Step 4: the design system.**

1. Move every file of `packages/design-system-contributions` into `packages/design-system`, beside the layer it belongs to, and make its
   `design-system/<Export>` imports relative. Add its exports to the package's `package.json` and its stylesheet's rules to the package's
   entry stylesheet; its guard specs are the package's own and go.
2. Run `bun migration/design-system-patches/CheckPatches.ts packages/design-system`. Make again, against the landed source, each patch it
   names stale (expect `CountBadge`, `NumberStepper` and the motion tokens). Then apply the series in order:
   `git am --directory=packages/design-system migration/design-system-patches/*.patch`.
3. Switch Gaia's call sites: each `design-system-contributions/<Export>` import becomes `design-system/<Export>`; the
   `design-system-contributions` dependency leaves `apps/gaia/package.json`; its stylesheet link leaves `page/index.html` and
   `page/testing/DesignSystemStylesheet.ts`; its paragraph in `apps/gaia/CLAUDE.md` goes. Then each patch's "Gaia switches over" list in
   `migration/design-system-patches/README.md`.
4. Delete each patch's "Gaia deletes after" list, then `packages/design-system-contributions`, `migration/`, and `migration/*` from the
   workspaces. Check whether `SingleReactPlugin` in Gaia's page build is still needed once the package is a workspace member rather than a
   link.

**Step 5: Flint.** Nothing from Gaia.

**Step 6: the Overseer's contracts.** Already in place since step 3. Forge adopts the package or merges its own types into it, as
`apps/gaia/docs/forge-requirements.md` V4 and V9 say.

`packages/brand` likewise: forge draws its mark from `brand/ForgeMark`, or merges its own drawing into the package.

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
    it is removed. Forge's is `forge-contracts/ForgeCompatibilityRegistry` (`bun run versions:raise-minimum <major.minor>` in the
    package); the logic is `system-versions`', which Gaia's own server is to use for its own clients too.
  - Gaia supports exactly one forge version, `SUPPORTED_FORGE_VERSION`
    (`apps/gaia/src/lib/forge-client/constants/SupportedForgeVersions.ts`), and calls each forge endpoint at the version forge's registry
    serves it. In the monorepo it strives for the latest: Gaia's verify warns while it is behind forge's current version. Per forge,
    from its `/api/versions`: current, ahead (Gaia knows less, still talks), newer (Gaia needs an update) or older (the forge needs one,
    as does a forge that serves no `/api/versions`). Gaia's verdicts still follow the earlier model, with `MINIMUM_FORGE_VERSION`,
    `behind` and `not-reported`, until they move to this one; so do Gaia's own registry and the end of its older-forge migrations.
- A forge system minor bump is a package minor bump of `forge-contracts`; a system major bump, or a removed or changed type, a package
  major bump.
- Gaia tests what it does with a forge's answers against recordings of released forges (`apps/gaia/src/testing/recordings/`), stamped
  with each forge's version, never against the forge source beside it in the repository.
- Forge's design-system package is `"private": true` today. Since Gaia depends on it, it must either become publishable, with its own
  semantic version and a `workspace:^` range in both apps, or be bundled into each app's release. That is a decision for the owner.

## What forge must do

`apps/gaia/docs/forge-requirements.md`, written as tickets for forge's board and naming no client in any requirement: serve
`GET /api/versions` (V1); keep the system version by interoperability and raise the minimum only to retire (V2); version each endpoint
by its path (V3); keep the compatibility registry and raise the minimum by its report (V4); carry the system version in the monitor
stream and the embed channel (V5); enter the embed mode by the host-neutral `?embedded=frame` (V6); report a brain started through the
API as `startedBy: "api"` (V7); read the framing host's origin from a host-neutral record (V8); take the documents from
`forge-contracts`, released on its own version (V9).

## Notes for the monorepo design

- Its `packages/design-system` section predates the decision of 2026-11-14 that Gaia uses forge's design-system package. The package
  already exists in forge, with its own README and constitution; Gaia's own copies of shared components are gone, and Gaia's additions
  arrive through `packages/design-system-contributions` and the patches. The "nine shared names, forge's version as base" plan, the
  `board.css` split and the neutral prefix are done or moot.
- Its step 3 is now a merge of a repository already in the `apps/` and `packages/` layout; no move commit is left to make in Gaia.
- It does not yet state the versioning and release rules above: independent releases, a semantic version per app and package,
  publishable shared packages, `workspace:^` rather than `workspace:*`, and system versions with versioned paths as the only runtime
  coupling.
  Its tooling section still names `workspace:*`.
- `packages/brand` and `packages/system-versions` are not in its layout.
- `packages/forge-contracts` is no longer only proposed, and holds types, versions and the compatibility registry; the recorded fixtures
  stay with Gaia, as the reader.
