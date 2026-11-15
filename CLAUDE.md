# The forge monorepo

Two apps share this Bun workspace, each governed by its own rules:

- `apps/forge/`: forge, governed by `apps/forge/CLAUDE.md` and `.claude/rules/*.md`.
- `apps/gaia/`: Gaia, governed by `apps/gaia/CLAUDE.md`.

The packages in `packages/` follow their own `README.md` and, where they have one, `CONSTITUTION.md`. `migration/` holds what the
design-system merge applies once and then deletes.
