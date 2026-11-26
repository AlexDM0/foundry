# The forge monorepo

Two apps share this Bun workspace. The owner's coding conventions, `~/coding-conventions-new.md`, are the rules of all
code here: read them before you change code. This is the one `CLAUDE.md`. The rules of each area are in a path-scoped
file under `.claude/rules/`, which holds only that area's own rules and its deviations from the conventions, each with
why. Read the rule file of what you change before you change it.

| Folder | What it is | Its rules |
| --- | --- | --- |
| `apps/forge/` | forge: the tracker, Hephaestus, the CLI | `.claude/rules/forge.md`, and `.claude/rules/skills.md` for the skills, prompts and templates |
| `apps/gaia/` | Gaia: one window over every forge on the machine | `.claude/rules/gaia.md` |
| `apps/gaia/page/lib/` | the page's libraries: the design system, Flint and forge's mark | `.claude/rules/design-system.md` with the design system's `CONSTITUTION.md`, `.claude/rules/flint.md` |
| `packages/<name>/` | a shared package: `forge-contracts` and `system-versions` | its own `README.md`, plus the rules named below |
| `docs/monorepo/` | the monorepo's design (`design.md`) and the migration checklist (`migration.md`) | this file |

Whose rules a package follows beside its own `README.md`:

- `packages/forge-contracts` is forge's. Nothing in a package forge depends on names Gaia.
- `packages/system-versions` is both apps'; it names no server.

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
- **Stored formats before 1.0:** until forge and Gaia reach 1.0, a stored file of an older format is refused and set up
  again, not migrated (conventions section 6). From 1.0 on, ingestion migrates an older format where it can.
- **Commits:** one plain subject line, written as a person would. No AI attribution of any kind. Never `--no-verify`.
