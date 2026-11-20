# The forge monorepo

Two apps share this Bun workspace, each under its own rules. Read the rules of what you change before you change it.

| Folder | What it is | Its rules |
| --- | --- | --- |
| `apps/forge/` | forge: the tracker, the Overseer, the Bridge, the CLI | `apps/forge/CLAUDE.md` and the path-scoped `.claude/rules/*.md` |
| `apps/gaia/` | Gaia: one window over every forge on the machine | `apps/gaia/CLAUDE.md` |
| `packages/<name>/` | a shared package | its own `README.md` and, where it has one, `CONSTITUTION.md`, plus the rules named below |
| `docs/monorepo/` | the monorepo's design (`design.md`) and the migration checklist (`migration.md`) | this file |
| `scripts/` | the root's own scripts (`gate:<app>`, `cache:audit`), a workspace member so turbo checks them | this file |

Whose rules a package follows beside its own `README.md`:

- `packages/design-system` is reached by both apps: whichever app's change it is, its `CONSTITUTION.md`, the one constitution of a
  package here, and `.claude/rules/design-system.md`.
- `packages/forge-contracts` and `packages/brand` are forge's. Nothing in a package forge depends on names Gaia.
- `packages/flint` is both apps' (`.claude/rules/flint.md`) until stage 8 folds it into Gaia's page (decision 52).
- `packages/system-versions` is both apps'; it names no server.

## The two trackers

From the landing on, each app has its own forge tracker in its own folder, and no tracker sits at the repository root:

| Tracker | Home | Branch namespace | Reach beyond its home |
| --- | --- | --- | --- |
| forge's | `apps/forge/` | `forge` | every package forge depends on (`/packages/design-system`, `/packages/flint`, `/packages/forge-contracts`, `/packages/brand`, `/packages/system-versions`), `/package.json`, `/bun.lock`, `/turbo.json` |
| Gaia's | `apps/gaia/` | `gaia` | `/packages/design-system`, `/packages/flint`, `/packages/system-versions`, `/package.json`, `/bun.lock`, `/turbo.json` |

- A tracker's agents change only its home and its reach; Customs refuses the rest. `scripts/`, `docs/monorepo/`, this file and
  `.claude/` are in neither tracker's reach: a person changes them.
- Each tracker's gate runs at the repository root (`--in /`) through `bun run gate:<app>`, and an Overseer-only merge gate runs
  `bun run cache:audit`; `docs/monorepo/design.md` holds the exact gate lines. So a ticket of one app cannot turn the other red through
  a shared package, and turbo replays what the ticket did not touch.
- The installed forge runs from a second clone outside this repository, updated by pulling; nobody runs this checkout's forge.

## Rules for the whole repository

- **Verify at the root:** `bun install --frozen-lockfile`, then `bun run verify`. Turborepo is how everything here verifies: `verify`
  runs every workspace's `typecheck`, `lint`, `test`, `test:dom` and `check`, each in its own folder. The root never runs `bun test`: a
  workspace's `bunfig.toml` preload, which moves `HOME` into scratch, applies only in its own folder. `verify:forge` and `verify:gaia`
  run one app and the packages it depends on; `gate:forge` and `gate:gaia` are a tracker's gate: every workspace's tasks, then only
  that app's `check`. `gate:<app>` and `cache:audit` write forge's gate report from turbo's run summary where forge hands a path in
  `FORGE_GATE_REPORT`; forge knows no turbo.
- **A workspace that imports another declares it** in its `package.json` at `workspace:^`, so Turborepo reruns it when the package
  changes. A package imports nothing from `apps/`.
- **The turbo cache is one folder,** turbo's default `.turbo/cache` in the main checkout, which every linked worktree uses; no
  `cacheDir`, `--cache-dir` or `TURBO_CACHE_DIR`. A check that reads the machine (installed versions, recording stamps) belongs in the
  uncached `check` task.
- **Worktrees** live in `.claude/worktrees/<name>`, evidence in `.claude/.evidence/`; both are ignored.
- **Never touch the real home:** no spec or script reads or writes `~/.forge-monitor` or `~/.gaia`, and nobody runs a forge verb in this
  checkout or talks to a running forge, but where an app's rules name a scratch forge. Only the owner runs `init`, `update` or `clear`
  on a live tracker.
- **Commits:** one plain subject line, written as a person would. No AI attribution of any kind. Never `--no-verify`.
