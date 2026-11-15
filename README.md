# The forge monorepo

A Bun workspace: each app in `apps/` (`apps/forge/`, `apps/gaia/`), each shared package in `packages/`. Each app's `README.md` says how
to run it and its `CLAUDE.md` holds its rules; this root's `CLAUDE.md` says whose rules each package follows. `migration/` holds what
the design-system merge applies once and then deletes: `migration/design-system-patches/`, patches against `packages/design-system`
with their check. `docs/monorepo/` holds the monorepo's design and the migration checklist.

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
| `gate:forge`, `gate:gaia` | a tracker's gate: every workspace's `typecheck`, `lint`, `test` and `test:dom`, then that app's `check` alone |
| `cache:audit` | the merge gate's audit: re-runs past the cache the tasks of what changed since `main`, and removes a failing task's entry |
