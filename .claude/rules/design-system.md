---
paths:
  - "apps/gaia/page/lib/design-system/**"
---

# The design-system library

- `apps/gaia/page/lib/design-system/` is the design system of Gaia's page, as a library: a folder with no manifest,
  with its own `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js` and `README.md`. Its rules are in
  `apps/gaia/page/lib/design-system/CONSTITUTION.md`: read it before you change the library.
- Code outside the library imports only its interface file, `DesignSystemInterface.ts`, by a relative path. The
  interface file names each export one by one. A page links `styles/design-system.css`, `styles/tokens.css` and the
  font files by their path. Inside the library a file imports exactly the module it needs: no file imports the
  interface file, and no other file re-exports.
- `apps/gaia/architecture/LibraryBoundaries.spec.ts` holds this, and that the library imports nothing outside its folder: no
  other library and no Gaia file. `apps/gaia/page/lib/design-system/architecture/PackageIsolation.spec.ts` holds the same from the
  inside, and that no file names a word of the host.
- Gaia's `bun run typecheck` compiles the library's two projects: `tsconfig.json` (only the DOM library, no Bun or
  Node types) and `tsconfig.spec.json` (the specs, the stories and `.storybook/`). The page's own projects leave
  `page/lib/` out. `apps/gaia/page/lib/design-system/architecture/ProjectIncludeList.spec.ts` holds that each `include` list names
  only its own folder.
- Gaia's `bun run lint` runs ESLint from the library's folder, under the library's own `eslint.config.js`; Gaia's own
  configuration ignores `page/lib/`.
- `bun run storybook:design-system` in `apps/gaia/` runs the library's Storybook 10;
  `apps/gaia/page/lib/design-system/architecture/StoryCoverage.spec.ts` holds a story per component the interface file exports.
- `apps/gaia/page/lib/design-system/testing/RunDomSpecs.ts` runs the DOM specs of the library, as a part of Gaia's
  `bun run test:dom`.
- The library knows no state of the board: a component takes a `StateTone` and shape flags.
  `apps/gaia/page/board/utils/StateToneUtil.ts` maps each display state and job state of the board to its tone and
  flags, and every state-coloured element of the board takes its look from it.
