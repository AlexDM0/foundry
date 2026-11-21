# The forge monorepo

Two apps share this Bun workspace, each under its own rules. Read the rules of what you change before you change it.

| Folder | What it is | Its rules |
| --- | --- | --- |
| `apps/forge/` | forge: the tracker, Hephaestus, the CLI | `apps/forge/CLAUDE.md` and the path-scoped `.claude/rules/*.md` |
| `apps/gaia/` | Gaia: one window over every forge on the machine | `apps/gaia/CLAUDE.md` |
| `packages/<name>/` | a shared package: `forge-contracts` and `system-versions` | its own `README.md`, plus the rules named below |
| `docs/monorepo/` | the monorepo's design (`design.md`) and the migration checklist (`migration.md`) | this file |

Whose rules a package follows beside its own `README.md`:

- `packages/forge-contracts` is forge's. Nothing in a package forge depends on names Gaia.
- `packages/system-versions` is both apps'; it names no server.

The design system, Flint and forge's mark are libraries of Gaia's page, under `apps/gaia/page/lib/`, each reached through its interface
file (`apps/gaia/CLAUDE.md`). The design system's `CONSTITUTION.md` is the one constitution here and governs
`apps/gaia/page/lib/design-system/`, with `.claude/rules/design-system.md`; `.claude/rules/flint.md` governs `apps/gaia/page/lib/flint/`.

## Rules for the whole repository

- **Verify at the root:** `bun install --frozen-lockfile`, then `bun run verify`. Turborepo is how everything here verifies: `verify`
  runs every workspace's `typecheck`, `lint`, `test`, `test:dom` and `check`, each in its own folder. The root never runs `bun test`: a
  workspace's `bunfig.toml` preload, which moves `HOME` into scratch, applies only in its own folder. `verify:forge` and `verify:gaia`
  run one app and the packages it depends on.
- **A workspace that imports another declares it** in its `package.json` at `workspace:^`, so Turborepo reruns it when the package
  changes. A package imports nothing from `apps/`.
- **The turbo cache is one folder,** turbo's default `.turbo/cache` in the main checkout, which every linked worktree uses; no
  `cacheDir`, `--cache-dir` or `TURBO_CACHE_DIR`. A check that reads the machine (installed versions, recording stamps) belongs in the
  uncached `check` task.
- **Worktrees** live in `.claude/worktrees/<name>`, evidence in `.claude/.evidence/`; both are ignored.
- **Never touch the real home:** no spec or script reads or writes `~/.forge-monitor` or `~/.gaia`, and nobody runs a forge verb in this
  checkout or talks to a running forge, but where an app's rules name a scratch forge. The installed forge runs
  from a second clone outside this repository, updated by pulling; nobody runs this checkout's forge.
- **Commits:** one plain subject line, written as a person would. No AI attribution of any kind. Never `--no-verify`.
