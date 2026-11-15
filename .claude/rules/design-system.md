---
paths:
  - "design-system/**"
  - "bridge/**"
---

# The design-system/ package

- `design-system/` is the design system of the Bridge, as a portable package with its own `package.json`,
  `tsconfig.json`, `tsconfig.spec.json` and `README.md`. Its rules are in `design-system/CONSTITUTION.md`: read it
  before you change `design-system/`.
- The root `package.json` makes `design-system/` a workspace package: `"workspaces": ["design-system"]` and the
  dependency `"design-system": "workspace:*"`. `bun install` links `node_modules/design-system` to the folder, and
  `bunfig.toml` keeps the hoisted linker. Bun, `Bun.build` and TypeScript resolve `design-system/<entry>` through the
  `exports` of `design-system/package.json`.
- `src/ImportDirection.spec.ts` holds that `design-system/` imports no file of the forge, and that a file outside it
  imports it only as `design-system/<entry>`, with an entry that `design-system/package.json` exports. A relative or
  absolute path into the folder, and an entry that the exports do not list, are findings.
- `bun run typecheck` checks `design-system/tsconfig.json` (only the DOM library, no Bun or Node types) and
  `design-system/tsconfig.spec.json` (the specs, the stories and `.storybook/`). `src/ProjectIncludeLists.spec.ts` holds
  that its `include` list names only its own folder.
- `bun run storybook` runs the package's Storybook 10; `design-system/StoryCoverage.spec.ts` holds a story per export.
- `bridge/testing/RunDomSpecs.ts` runs the DOM specs of `design-system/` with those of the Bridge.
- The package knows no state of the board: a component takes a `StateTone` and shape flags.
  `bridge/utils/StateToneUtil.ts` maps each `DisplayState` and job state to its tone and flags, over a `Record` of every
  `DisplayState`, and every state-coloured element of the Bridge takes its look from it.
