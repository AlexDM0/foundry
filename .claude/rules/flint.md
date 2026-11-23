---
paths:
  - "apps/gaia/page/lib/flint/**"
---

# The Flint library

- `apps/gaia/page/lib/flint/` is Flint, the sprite of the forge agents, as a library of Gaia's page: a folder with no
  manifest, with its own `tsconfig.json`, `tsconfig.spec.json`, `eslint.config.js` and `README.md`. The folder can go
  to its own repository with no change to a source file.
- No file in `apps/gaia/page/lib/flint/` imports a file outside `apps/gaia/page/lib/flint/`. A file that ships does
  not import a `bun:` module or a `node:` module. Only `apps/gaia/page/lib/flint/react/` imports React.
  `apps/gaia/page/lib/flint/PackageIsolation.spec.ts` holds this.
- Gaia's page reaches Flint only through `FlintInterface.ts`. `apps/gaia/page/LibraryBoundaries.spec.ts` holds this,
  and that inside the library no file imports the interface file and no other file re-exports. Only
  `apps/gaia/page/board/` imports it: `apps/gaia/page/PageImportDirection.spec.ts` holds that.
- Gaia's `bun run typecheck` compiles the library's `tsconfig.json` and its `tsconfig.spec.json`. The project uses only
  the DOM library and no Bun or Node types. `apps/gaia/page/lib/flint/ProjectIncludeList.spec.ts` holds that each
  `include` list names only its own folder.
- Flint makes no network call, calls no model, and reads no clock and no browser storage. The time comes from a frame
  source that the host can replace. The host gives a storage port. `apps/gaia/page/lib/flint/eslint.config.js` holds
  the clock, the markup, the network and the storage.
- Flint adds no global CSS. The renderer makes each element with `createElementNS` and sets only attributes. Each
  colour is a `--flint-*` custom property with its default.
- There is one Flint on a document. A second `createFlint` on the same document is refused.
- Flint knows no component of the host. It knows only the cue names that the host sends and its own list of intents.
  The host gives the home element, the habitats and the policy that selects the habitat to visit.
- A behaviour, a gesture, an emote, sleep and the attendants each give only a part of the target pose.
  `apps/gaia/page/lib/flint/PoseComposition.ts` puts the parts together in one order: behaviour, gesture, emote, sleep,
  attendants, reduced motion. Only `apps/gaia/page/lib/flint/PoseEasing.ts` eases. The renderer knows nothing about
  behaviour.
- The core names no animation and no behaviour: it reaches each through its catalog. One more animation or behaviour is
  one more folder and one more catalog line. `apps/gaia/page/lib/flint/AnimationModules.spec.ts` holds this.
- The mind and the pose are pure, with plain `.spec.ts` specs. The renderer and `createFlint` have `.dom.tsx` specs,
  which Gaia's `test:dom` task runs through `testing/RunDomSpecs.ts`. A spec gives a manual frame source
  (`apps/gaia/page/lib/flint/testing/ManualFrameSource.ts`) and never waits for real time.
- Each design value is a named constant with its unit in its name: a value of the core in
  `apps/gaia/page/lib/flint/constants/`, a value of one animation or behaviour in `constants/<Name>Values.ts` in its
  own folder.
- `apps/gaia/page/lib/flint/demo/index.html` shows each animation through `createFlint`,
  `perform`, `attend` and `steer`. The command in `apps/gaia/page/lib/flint/README.md` builds it into one file in
  `apps/gaia/page/lib/flint/demo/build/`. Git ignores this folder.
