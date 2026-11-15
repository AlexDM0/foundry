# Gaia's workspace

A Bun workspace laid out as the forge monorepo will be: each app in `apps/`, each shared package in `packages/`. Gaia is `apps/gaia/`;
its `CLAUDE.md` holds Gaia's rules, map and boundaries, and its `README.md` how to run it. `packages/overseer-contracts/` is the
contract between a forge's Overseer and Gaia, released with its own version; its `README.md` says how that version differs from the forge's system version and the endpoint versions.
`migration/` holds what the merge into forge applies once and then deletes: `migration/design-system-patches/`, ready patches against
forge's design-system package, with their check.

`packages/brand/` holds Gaia's and Forge's marks, their colour tokens and the logo's drawings: a package with its own version, published
on its own, which an app names as `workspace:^`. Its `README.md` says how to use it.

## Set up

```bash
bun install --frozen-lockfile
```

installs every workspace into one hoisted `node_modules` at this root.

```bash
bun link design-system
```

links forge's design-system package into that `node_modules`, here at the root and nowhere else. The package must have been registered
once with `bun link` in its own folder. An install may remove the link; link it again after one.

## Verify

```bash
bun run verify
```

runs each workspace's own `verify` in its own folder: typecheck, lint, specs and, for Gaia, the recording-stamp check. The root never runs
`bun test` itself, since a workspace's `bunfig.toml` preload applies only in its own folder. `bun run typecheck` and `bun run lint` fan
out the same way.
