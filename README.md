# The forge monorepo

A Bun workspace: each app in `apps/` (`apps/forge/`, `apps/gaia/`), each shared package in `packages/`. Each app's `README.md` says how
to run it and its `CLAUDE.md` holds its rules. `migration/` holds what the design-system merge applies once and then deletes:
`migration/design-system-patches/`, patches against `packages/design-system` with their check.

## Set up

```bash
bun install --frozen-lockfile
```

installs every workspace into one hoisted `node_modules` at this root.

## Verify

```bash
bun run verify
```

runs every workspace's `typecheck`, `lint`, `test`, `test:dom` and `check` through Turborepo, each in its own folder, replaying a task
whose inputs have not changed from the cache in `.turbo/cache`. `bun run typecheck` and `bun run lint` run those tasks alone.
