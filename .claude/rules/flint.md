---
paths:
  - "packages/flint/**"
---

# The flint package

- `packages/flint/` is Flint, the sprite of the forge agents, as a portable package. It has its own `package.json`,
  `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js` and `README.md`. The folder can go to its own repository
  with no change to a source file.
- No file in `packages/flint/` imports a file outside `packages/flint/`. A file that ships does not import a `bun:`
  module or a `node:` module. Only `packages/flint/react/` imports React. `packages/flint/PackageIsolation.spec.ts`
  holds this.
- `apps/forge/package.json` declares the dependency `"flint": "workspace:^"`, and the Bridge imports Flint only by its
  name, through the entries that `packages/flint/package.json` exports. `apps/forge/src/ImportDirection.spec.ts`
  holds this, and that the package imports no file of an app, by a path or by an app's name.
- The package's `bun run typecheck` checks its `tsconfig.json` and its `tsconfig.spec.json`. The project uses only the
  DOM library and no Bun or Node types. `packages/flint/ProjectIncludeList.spec.ts` holds that each `include` list names
  only its own folder.
- Flint makes no network call, calls no model, and reads no clock and no browser storage. The time comes from a frame
  source that the host can replace. The host gives a storage port. `packages/flint/eslint.config.js` holds the clock,
  the markup, the network and the storage.
- Flint adds no global CSS. The renderer makes each element with `createElementNS` and sets only attributes. Each
  colour is a `--flint-*` custom property with its default.
- There is one Flint on a document. A second `createFlint` on the same document is refused.
- Flint knows no component of the host. It knows only the cue names that the host sends and its own list of intents.
  The host gives the home element, the habitats and the policy that selects the habitat to visit.
- A behaviour, a gesture, an emote, sleep and the attendants each give only a part of the target pose.
  `packages/flint/PoseComposition.ts` puts the parts together in one order: behaviour, gesture, emote, sleep,
  attendants, reduced motion. Only `packages/flint/PoseEasing.ts` eases. The renderer knows nothing about behaviour.
- The core names no animation and no behaviour: it reaches each through its catalog. One more animation or behaviour is
  one more folder and one more catalog line. `packages/flint/AnimationModules.spec.ts` holds this.
- The mind and the pose are pure, with plain `.spec.ts` specs. The renderer and `createFlint` have `.dom.tsx` specs,
  which the package's `test:dom` task runs. A spec gives a manual frame source
  (`packages/flint/testing/ManualFrameSource.ts`) and never waits for real time.
- Each value of the design handoff is a named constant with its unit in its name: a value of the core in
  `packages/flint/constants/`, a value of one animation or behaviour in `constants/<Name>Values.ts` in its own folder.
- `packages/flint/demo/index.html` shows each animation of the design handoff through `createFlint`, `perform`,
  `attend` and `steer`. The command in `packages/flint/README.md` builds it into one file in
  `packages/flint/demo/build/`. Git ignores this folder.
