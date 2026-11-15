---
paths:
  - "packages/design-system/**"
  - "apps/forge/bridge/**"
---

# The design-system package

- `packages/design-system/` is the design system of the Bridge, as a portable package with its own `package.json`,
  `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js` and `README.md`. Its rules are in
  `packages/design-system/CONSTITUTION.md`: read it before you change the package.
- The root `package.json` makes each folder of `packages/` a workspace package, and `apps/forge/package.json` declares
  the dependency `"design-system": "workspace:^"`. `bun install` at the repository root links
  `node_modules/design-system` to the folder, and the root `bunfig.toml` keeps the hoisted linker. Bun, `Bun.build` and
  TypeScript resolve `design-system/<entry>` through the `exports` of `packages/design-system/package.json`.
- `src/ImportDirection.spec.ts` holds that the package imports no file of an app, and that forge imports it only by its
  name, as `design-system/<entry>`, with an entry that `packages/design-system/package.json` exports, and only while
  `apps/forge/package.json` declares it. A relative or absolute path into the folder, and an entry that the exports do
  not list, are findings.
- The package's `bun run typecheck` checks its `tsconfig.json` (only the DOM library, no Bun or Node types) and its
  `tsconfig.spec.json` (the specs, the stories and `.storybook/`). `apps/forge/src/ProjectIncludeLists.spec.ts`
  holds that its `include` list names only its own folder.
- `bun run storybook` in `packages/design-system/` runs the package's Storybook 10;
  `packages/design-system/StoryCoverage.spec.ts` holds a story per export.
- `packages/design-system/testing/RunDomSpecs.ts`, the package's `test:dom` task, runs the DOM specs of the package.
- The package knows no state of the board: a component takes a `StateTone` and shape flags.
  `bridge/utils/StateToneUtil.ts` maps each `DisplayState` and job state to its tone and flags, over a `Record` of every
  `DisplayState`, and every state-coloured element of the Bridge takes its look from it.
