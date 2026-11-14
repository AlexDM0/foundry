# Flint

Flint is a small orange diamond with eyes. It personifies the agents of a host page: it types while an agent writes,
reviews through a looking glass, files tickets, merges blocks, sleeps with embers in its corner, and shows short
emotes. It draws itself in an SVG overlay over the host's page, and it never blocks a click on the page below it.

The package stands alone. It has no runtime dependency, uses only browser APIs, makes no network call, calls no model,
reads no clock and no browser storage, and adds no global CSS. React is an optional peer, for the React layer only.

## Use it in a page

```ts
import { createFlint } from 'flint';

const flint = createFlint({
  root: document.body,                        // Flint draws its overlay here
  home: cornerElement,                        // the corner where Flint lives and sleeps
  pixelsForOneUnit: 0.5,                       // the size: Flint is 40 by 50 units
});

const removeHabitat = flint.registerHabitat(chatElement, {
  kind: 'chat',
  description: 'The conversation with the agent.',
  suggestions: [
    { when: 'arrived', respond: 'wave' },
    { when: 'agent-is-writing', respond: 'type-busy', note: 'The agent writes fast.' },
  ],
});

flint.cue(chatElement, 'agent-is-writing');   // a cue name of the host's own
flint.perform('happy');                        // carry out one intent of the fixed list now
flint.perform('grab', ticketElement);          // a grab turns to an element and reaches for its centre
flint.steer('walk-left');                      // a held walk, as an arrow key; then 'stop-walking'
flint.destroy();
```

There is one Flint on a document: a second `createFlint` throws a `FlintRefusal`.

## Use it in React

```tsx
import { Flint } from 'flint/react';
import { useFlintHabitat } from 'flint/react/UseFlintHabitat';

<Flint home={homeReference} storage={storage} theme={theme} onHandle={setFlintHandle}>
  <App />
</Flint>;

// In a component below <Flint>; keep the habitat a module constant.
const sendCue = useFlintHabitat(elementReference, CHAT_SPRITE_HABITAT);
```

`<Flint>` reads its options once. A new `home`, `root` or `storage` makes Flint again, and the habitats below stay
registered, so a host whose storage comes later (once it knows whose page it shows) gives it then. The cue sender of
`useFlintHabitat` stays the same function while the Flint above and the element reference stay.

## What the host decides

| Subject | The host gives |
| --- | --- |
| Home | The element whose bottom edge is Flint's floor. |
| Habitats | Each large component registers its element with a `SpriteHabitat`: its kind, a description, its suggestions, and optionally `contentFor`. Flint ignores a habitat smaller than 100 by 100 pixels. |
| Cues | The host's own cue names, sent with `cue` while Flint lives in that habitat. |
| Visit target | Which habitat is "the component the user works in": `last-focused-or-clicked` (the default), `under-pointer`, `content-changed-last`, or a function of the host. |
| Storage | A `FlintStorage` port that remembers the habitat Flint lives in. By default nothing is stored. |
| Time | A `FrameSource`. By default, the browser's animation frames. A spec gives a manual one. |
| Reduced motion | A function. By default, the browser's `prefers-reduced-motion` query. Flint then holds still poses. |
| Colours | The `--flint-*` custom properties on any ancestor, or the `theme` option. Each has a default. |
| A brain | An optional `Director` and its maximum time, through `startBrain` and `stopBrain`. The package never calls a model. |

`steer` takes one of `FLINT_STEERINGS` in `SpriteHabitat.ts`: `walk-left`, `walk-right`, `stop-walking`, `jump`,
`face-left`, `face-right`, and `rest`, which ends the gesture. A visit, a drag or a landing ignores it.

A suggestion's `respond` and a director's answer are intents of the fixed list `SPRITE_INTENTS` in
`SpriteHabitat.ts`; anything else is refused. Each contract carries its version in `FLINT_CONTRACT_VERSIONS`.

## How it is built

Each frame runs four stages: the sensors read the page, the mind decides, the pose stage stacks the target pose and
eases the drawn pose towards it, and the renderer writes the drawn pose as SVG attributes.

| Path | Holds |
| --- | --- |
| `CreateFlint.ts` | The core entry: `createFlint` and the frame loop. |
| `SpriteHabitat.ts` | The contracts with the host: habitats, suggestions, content, intents, directors. |
| `mind/`, `behaviours/` | The mind's state, reflexes, intents, steering, directors, and one file for each behaviour. |
| `sensors/` | The pointer and the habitat registry that `SpriteSensors.ts` reads. |
| `SpriteMind.ts` | The mind: the state, how an intent, a walk, a jump and a frame change it, and the target pose it asks for. |
| `SpritePose.ts` | The pose type, the pose part a layer gives, and the neutral pose. |
| `PoseComposition.ts` | The order of the layers: behaviour, gesture, emote, sleep, reduced motion. |
| `PoseEasing.ts` | The one easing step. |
| `MotionPose.ts` | The base pose from the hover, the walk, the jump and the blink. |
| `SpriteRenderer.ts` | Writes a pose to the SVG overlay. |
| `SpriteSensors.ts` | Reads the page. |
| `FrameSource.ts` | The frame source type and the default on animation frames. |
| `gestures/`, `emotes/`, `sleep/` | One file for each gesture and emote, with a catalog, and the sleep sequence. |
| `constants/` | Every value of the design, with its unit in its name, and the palette. |
| `react/` | The React layer: `<Flint>` and `useFlintHabitat`. |
| `testing/` | The manual frame source and the mind run the specs drive. |
| `demo/` | The demo page: the playground of the design handoff, rebuilt on the package. |

The package's own guard, `PackageIsolation.spec.ts`, holds that no file imports outside the folder and that nothing
that ships imports a `bun:` or `node:` module.

## The demo page

`demo/index.html` shows every animation through `createFlint`, `perform` and `steer`, at 1 and 0.5 pixels for one unit,
facing left or right, with reduced motion and on a light or a dark ground. Build it into one file that opens in a
browser with no server; `demo/build/` is git-ignored:

```sh
bun build --compile --target=browser ./flint/demo/index.html --outdir=./flint/demo/build
```

Then open `flint/demo/build/index.html`.
