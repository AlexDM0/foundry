# The forge monorepo

A Bun workspace: each app in `apps/` (`apps/forge/`, `apps/gaia/`), each shared package in `packages/`. Each app's `README.md` says how
to run it and its `CLAUDE.md` holds its rules; this root's `CLAUDE.md` says whose rules each package follows.
`docs/monorepo/` holds the monorepo's design and the migration checklist. `scripts/` holds the root's own scripts, a workspace member
so turbo typechecks, lints and tests them like any other. Each app is run by its own forge tracker, in `apps/forge/` and
`apps/gaia/`; the root `CLAUDE.md` names their reach and gates.

## Set up

```bash
bun install --frozen-lockfile
```

installs every workspace into one hoisted `node_modules` at this root. Every package is a workspace member that its consumers declare
at `workspace:^`; nothing is linked by hand.

## Verify

```bash
bun run verify
```

runs every workspace's `typecheck`, `lint`, `test`, `test:dom` and `check` through Turborepo, each in its own folder, replaying a task
whose inputs have not changed from the cache in `.turbo/cache`. `bun run typecheck` and `bun run lint` run those tasks alone;
`bun run verify:forge` and `bun run verify:gaia` run one app and the packages it depends on. Never run `bun test` at the root: each
workspace's test preload applies only in its own folder.

| Script | Runs |
| --- | --- |
| `lint:fix` | every workspace's `lint:fix`: eslint with its fixes applied, never cached; the pre-commit hook names it when `lint` fails |
| `gate:forge`, `gate:gaia` | a tracker's gate: every workspace's `typecheck`, `lint`, `test` and `test:dom`, then that app's `check` alone; where forge hands a path in `FORGE_GATE_REPORT`, it writes the gate's cache report there: `hit` when turbo replayed every task with a script, `partial` some, `miss` none |
| `cache:audit [<target reference>]` | the merge gate's audit: re-runs past the cache the tasks of what changed since the target, `main` when none is named (forge hands a gate none), and removes a failing task's entry; it writes a `miss` report, as it runs past the cache |
