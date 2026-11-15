# Gaia's workspace

A Bun workspace laid out as the forge monorepo will be: each app in `apps/`, each shared package in `packages/`. Gaia is `apps/gaia/`;
its `CLAUDE.md` holds Gaia's rules, map and boundaries, and its `README.md` how to run it. `packages/forge-contracts/` is forge's own
contract with any client: its documents as types, its system versions and its compatibility registry, naming no client. Its version
model and the registry's logic are `packages/system-versions/`, which names no server either. Each package is released with its own
version, and its `README.md` says how that version differs from a system version. `migration/` holds what the merge into forge applies
once and then deletes: `migration/design-system-patches/`, ready patches against forge's design-system package, with their check.

`packages/brand/` holds Forge's mark, its colour tokens and the geometry a host's mark may draw alike: a package with its own version,
published on its own, which an app names as `workspace:^`. Its `README.md` says how to use it. Gaia's own mark is Gaia's.

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
