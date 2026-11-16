# The forge monorepo

Two apps share this Bun workspace, each under its own rules. Read the rules of what you change before you change it.

| Folder | What it is | Its rules |
| --- | --- | --- |
| `apps/forge/` | forge: the tracker, the Overseer, the Bridge, the CLI | `apps/forge/CLAUDE.md` and the path-scoped `.claude/rules/*.md` |
| `apps/gaia/` | Gaia: one window over every forge on the machine | `apps/gaia/CLAUDE.md` |
| `packages/<name>/` | a shared package | its own `README.md` and, where it has one, `CONSTITUTION.md`, plus the rules of the app that owns it |
| `docs/monorepo/` | the monorepo's design (`design.md`) and the migration checklist (`migration.md`) | this file |
| `scripts/` | the root's own scripts (`cache:audit`), a workspace member so turbo checks them | this file |

Whose rules a package follows beside its own:

- `packages/design-system` is reached by both apps: whichever app's change it is, its `CONSTITUTION.md` and
  `.claude/rules/design-system.md`.
- `packages/flint`, `packages/forge-contracts` and `packages/brand` are forge's (`.claude/rules/flint.md` for Flint). Nothing in a
  package forge depends on names Gaia.
- `packages/system-versions` is both apps'; it names no server.

## Rules for the whole repository

- **Verify at the root:** `bun install --frozen-lockfile`, then `bun run verify`, which runs every workspace's `typecheck`, `lint`,
  `test`, `test:dom` and `check` through Turborepo, each in its own folder. The root never runs `bun test`: a workspace's `bunfig.toml`
  preload, which moves `HOME` into scratch, applies only in its own folder. `verify:forge` and `verify:gaia` run one app and the packages
  it depends on; `gate:forge` and `gate:gaia` are a tracker's gate: every workspace's tasks, then only that app's `check`.
- **A workspace that imports another declares it** in its `package.json` at `workspace:^`, so Turborepo reruns it when the package
  changes. A package imports nothing from `apps/`.
- **The turbo cache is one folder,** turbo's default `.turbo/cache` in the main checkout, which every linked worktree uses; no
  `cacheDir`, `--cache-dir` or `TURBO_CACHE_DIR`. A check that reads the machine (installed versions, recording stamps) belongs in the
  uncached `check` task.
- **Worktrees** live in `.claude/worktrees/<name>`, evidence in `.claude/.evidence/`; both are ignored.
- **Never touch the real home:** no spec or script reads or writes `~/.forge-monitor` or `~/.gaia`, and nobody runs a forge verb in this
  checkout or talks to a running forge, but where an app's rules name a scratch forge.
- **Commits:** one plain subject line, written as a person would. No AI attribution of any kind. Never `--no-verify`.
