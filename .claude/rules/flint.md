---
paths:
  - "flint/**"
---

# The flint/ package

- `flint/` is Flint, the sprite of the forge agents, as a portable package. It has its own `package.json`,
  `tsconfig.json`, `tsconfig.spec.json` and `README.md`. The folder can go to its own repository with no change to a
  source file.
- No file in `flint/` imports a file outside `flint/`. A file that ships does not import a `bun:` module or a `node:`
  module. Only `flint/react/` imports React. `flint/PackageIsolation.spec.ts` holds this.
- `bun run typecheck` checks `flint/tsconfig.json` and `flint/tsconfig.spec.json`. The project uses only the DOM
  library and no Bun or Node types. `src/ProjectIncludeLists.spec.ts` holds that its `include` list names only its own
  folder.
- Flint makes no network call, calls no model, and reads no clock and no browser storage. The time comes from a frame
  source that the host can replace. The host gives a storage port. `eslint.config.js` holds the clock, the markup, the
  network and the storage in `flint/`.
- Flint adds no global CSS. The renderer makes each element with `createElementNS` and sets only attributes. Each
  colour is a `--flint-*` custom property with its default.
- There is one Flint on a document. A second `createFlint` on the same document is refused.
- Flint knows no component of the host. It knows only the cue names that the host sends and its own list of intents.
  The host gives the home element, the habitats and the policy that selects the habitat to visit.
- A behaviour, a gesture, an emote, sleep and the attendants each give only a part of the target pose.
  `flint/PoseComposition.ts` puts the parts together in one order: behaviour, gesture, emote, sleep, attendants, reduced
  motion. Only `flint/PoseEasing.ts` eases. The renderer knows nothing about behaviour.
- The core names no animation and no behaviour: it reaches each through its catalog. One more animation or behaviour is
  one more folder and one more catalog line. `flint/AnimationModules.spec.ts` holds this.
- The mind and the pose are pure, with plain `.spec.ts` specs. The renderer and `createFlint` have `.dom.tsx` specs. A
  spec gives a manual frame source (`flint/testing/ManualFrameSource.ts`) and never waits for real time.
- Each value of the design handoff is a named constant with its unit in its name: a value of the core in
  `flint/constants/`, a value of one animation or behaviour in `constants/<Name>Values.ts` in its own folder.
- `flint/demo/index.html` shows each animation of the design handoff through `createFlint`, `perform`, `attend` and
  `steer`. The command in `flint/README.md` builds it into one file in `flint/demo/build/`. Git ignores this folder.
