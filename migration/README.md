# Gaia's side of the forge monorepo merge

What Gaia prepared for its import into forge's repository, the steps from Gaia's side in the order of the monorepo design's migration
(`docs/monorepo-design.md`, Part A), how forge and Gaia release independently, and what that design must still be updated with.

## What was prepared

| Path | What it is | Its README |
| --- | --- | --- |
| `apps/gaia/` | Gaia's whole app, moved as is: `src/`, `page/`, `resources/`, `docs/`, its `bunfig.toml`, tsconfigs, lint config and `CLAUDE.md` | `apps/gaia/README.md` |
| `packages/design-system-contributions/` | The eight components Gaia built that belong in the design system (`TextField`, `Checkbox`, `Figure`, `PageHead`, `FailedAction`, `PendingStep`, `ThemeCycleButton`, `DataTable`, with `ThemeChoice` and `ThemeCycleUtil`), under the design-system package's constitution, importing its components by export name | its `README.md` and `CONSTITUTION.md` |
| `packages/brand/` | Gaia's and Forge's marks as React components, their tokens in both themes, and the logo's source drawings | its `README.md` |
| `packages/overseer-contracts/` | The Overseer's documents as types, the versions document, the forge system versions Gaia knows and each forge endpoint's path version; types and versions only | its `README.md` and `FORGE_REQUIREMENTS.md` |
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

`packages/brand` and `packages/overseer-contracts` join here as they are.

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
`FORGE_REQUIREMENTS.md` V5 and V6 say.

`packages/brand` likewise: forge draws its mark from `brand/ForgeMark`, or merges its own drawing into the package.

## How forge and Gaia release independently

- Each app and each shared package carries its own semantic version. The shared packages (`brand`, `overseer-contracts`, and
  `design-system-contributions` until it moves) are publishable, not private.
- An app depends on a shared package with `workspace:^`, never `workspace:*`; `workspace:^` becomes a version range such as `^0.1.0` on
  release, so an app's release names the oldest package version it builds with, not the repository's commit.
- At runtime a forge and a Gaia meet only on the wire, through system versions (the owner's model of 2026-11-15, which replaced the
  per-endpoint version triple and the per-contract minor keys):
  - Each system, forge and Gaia, has one system version, major.minor by interoperability, never its package version: a minor change only
    adds, and every client of that major keeps working; a major change may break a client of an older major.
  - A server publishes, at `GET /api/versions`, unversioned and never removed, its current system version and its minimum supported, the
    oldest version of its own system a client may have been built for and still be served. Raising the minimum is what lets it remove an
    old endpoint version, since no supported client calls it any more.
  - A client knows the server version it was built for: Gaia knows `SUPPORTED_FORGE_VERSION` and `MINIMUM_FORGE_VERSION`
    (`overseer-contracts/ForgeSystemVersions`), and Gaia's own page and launcher know `GAIA_SYSTEM_VERSION`
    (`apps/gaia/src/shared/constants/GaiaSystemVersions.ts`).
  - REST endpoints are versioned by path, `/api/v<n>/<endpoint>`, served side by side; an answer carries no per-endpoint version, only
    the integer key it has always carried, which released readers still check. Message protocols (the fleet stream, the monitor stream,
    the embed channel) carry the system version in their handshake and every message. Stored files keep their own format version.
  - Gaia decides one verdict per forge from the forge's `/api/versions` and its two numbers: newer and older (they cannot talk; Gaia or
    the forge needs an update), ahead and behind (they talk; the other side has more), current, and not reported (every released forge
    today, read exactly as before). `apps/gaia/docs/contracts.md` holds the model and the table.
- A forge system minor bump is a package minor bump of `overseer-contracts`; a system major bump, or a removed or changed type, a package
  major bump.
- Gaia tests what it does with a forge's answers against recordings of released forges (`apps/gaia/src/testing/recordings/`), stamped
  with each forge's version, never against the forge source beside it in the repository.
- Forge's design-system package is `"private": true` today. Since Gaia depends on it, it must either become publishable, with its own
  semantic version and a `workspace:^` range in both apps, or be bundled into each app's release. That is a decision for the owner.

## What forge must do

`packages/overseer-contracts/FORGE_REQUIREMENTS.md`, written as tickets for forge's board: serve `GET /api/versions`, unversioned and never
removed (V1); keep a system version by interoperability and raise the minimum only to retire an endpoint version (V2); version each
endpoint by its path and serve old versions side by side until the minimum is raised (V3); carry the system version in the monitor
stream's handshake and events (V4) and in every embed message of the Bridge (V5); take the Overseer's documents from the package at the
merge (V6); release the package on its own version (V7).

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
- `packages/brand` is not in its layout.
- `packages/overseer-contracts` is no longer only proposed, and holds types and versions only; the recorded fixtures stay with Gaia, as
  the reader.
