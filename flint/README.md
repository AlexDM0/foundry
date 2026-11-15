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
flint.perform('chase-bug', deliveredRow);      // a bug leaves the row, Flint chases and catches it; 'already-running' during a chase
flint.perform('lay-bar-along', barElement);    // Flint lays the bar along; 'needs-an-element' without one
flint.steer('walk-left');                      // a held walk, as an arrow key; then 'stop-walking'
flint.attend('watcher-spark', 2);              // two sparks stay with Flint through everything, until a count of 0
flint.livesIn();                               // the kind of the habitat Flint lives in: 'chat', or null at home
flint.destroy();
```

There is one Flint on a document: a second `createFlint` throws a `FlintRefusal`.

`perform` answers a `PerformVerdict`: `performed`, `unknown-intent` for a value off the fixed list, `needs-an-element` for a behaviour
that must have one given none (`lay-bar-along`), `already-running` for a behaviour that runs one at a time while it runs or its intent
waits (`chase-bug`), and `destroyed`. A refused intent changes nothing. A behaviour given an element reads its box on each frame and ends
once the element leaves the page. `livesIn` answers the kind of the habitat Flint lives in, null at home, before its first frame and after
`destroy`: a host starts a behaviour on the floor of its own habitat only while Flint lives there.

## Use it in React

```tsx
import { Flint } from 'flint/react';
import { useFlintHabitat } from 'flint/react/UseFlintHabitat';
import { useFlintPerform } from 'flint/react/UseFlintPerform';

<Flint home={homeReference} storage={storage} theme={theme} onHandle={setFlintHandle}>
  <App />
</Flint>;

// In a component below <Flint>; keep the habitat a module constant.
const sendCue = useFlintHabitat(elementReference, CHAT_SPRITE_HABITAT);
// In a component below <Flint> that starts an intent with one of its own elements:
const perform = useFlintPerform();
perform('lay-bar-along', barReference.current);   // a PerformVerdict, or 'no-flint' while no Flint is made
```

`useFlintPerform` reaches the handle below `<Flint>` through the same connection as the habitats: its function carries out `perform` on
the Flint there is now, and answers `no-flint` without a `<Flint>` above or while Flint is not made; an intent then is not kept.
`onHandle` gives the handle itself to the host that renders `<Flint>`. `<Flint>` reads its options once. A new `home`, `root` or `storage` makes Flint again, and the habitats below stay
registered, so a host whose storage comes later (once it knows whose page it shows) gives it then. The cue sender of
`useFlintHabitat` stays the same function while the Flint above and the element reference stay.

## What the host decides

| Subject | The host gives |
| --- | --- |
| Home | The element whose bottom edge is Flint's floor. |
| Habitats | Each large component registers its element with a `SpriteHabitat`: its kind, a description, its suggestions, and optionally `contentFor`. Flint ignores a habitat smaller than 100 by 100 pixels. A box with content around it, such as a slot, sets `keepsFlintInside`: Flint never shows outside it, and a visit pops in through its edge in place of around its corner. |
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
`SpriteHabitat.ts`; anything else is refused. The list is the intents of every behaviour in the behaviour catalog (`wander`, `visit`,
`copy`, `sleep`, `chase-bug` and `lay-bar-along`), then the intents of every gesture and emote in the catalogs; `SpriteIntent` is its
union type. A suggestion cannot carry an element, so a host starts `chase-bug` and `lay-bar-along` with `perform`. `attend` takes one of
`SPRITE_ATTENDANTS`, from the attendant catalog. Each contract carries its version in `FLINT_CONTRACT_VERSIONS`.

## How it is built

Each frame runs four stages: the sensors read the page, the mind decides, the pose stage stacks the target pose and
eases the drawn pose towards it, and the renderer writes the drawn pose as SVG attributes.

The core knows no animation and no behaviour. A gesture, an emote, a prop, a mark, an attendant and a behaviour are each a module of
pure data and pure functions in a folder of its own, listed in a catalog; the core reads the catalogs, and the pose type, the prop
names, the hidden props, the intent list and the attendant list are derived from them. One more animation or behaviour is one more
folder and one more line in its catalog, and one in the prop catalog for each prop of its own. `AnimationModules.spec.ts` holds this.

A behaviour can draw shapes at a place on the page, in overlay units: its page shapes (`page` of `PagePose` in `SpritePose.ts`). They
are written by the one shape writer, from the same shape builders as the props, behind all of Flint; they do not move with Flint, are
never mirrored and never eased. Once the behaviour gives none, the last ones fade out over its `fadeOutMilliseconds`.

| Path | Holds |
| --- | --- |
| `CreateFlint.ts` | The core entry: `createFlint`, the frame loop and the handle (`perform`, `attend`, `steer`). |
| `SpriteHabitat.ts` | The contracts with the host: habitats, suggestions, content, the intent and attendant lists, directors. |
| `IntentMeaning.ts` | What an intent asks for: a gesture in the form its intent names, an emote, or else a behaviour. |
| `SpriteMind.ts`, `mind/` | The mind: its state, reflexes, intents, steering and directors; it reaches each behaviour through its catalog. |
| `behaviours/` | `BehaviourDefinition.ts`, `BehaviourCatalog.ts`, the arrival two behaviours share, and one folder for each behaviour. |
| `SpritePose.ts` | The pose type, the part a layer gives, the neutral pose and `emoteMarkAtRest`. |
| `PoseComposition.ts` | The order of the layers: behaviour, gesture, emote, sleep, attendants, reduced motion. |
| `PoseEasing.ts` | The one easing step; each prop eases by its own definition. |
| `MotionPose.ts` | The base pose from the hover, the walk, the jump and the blink. |
| `SpriteRenderer.ts` | Draws the body, eyes, hands, glow and embers, and asks each catalog for its shapes. |
| `drawing/` | The shape kinds (`Shape.ts`), the one writer with its pool of elements (`ShapeWriter.ts`), and how values are written. |
| `SpriteSensors.ts`, `sensors/` | Reads the page: the pointer and the habitat registry. |
| `gestures/` | `GestureDefinition.ts`, `GestureCatalog.ts`, the helpers two gestures share, and one folder for each gesture. |
| `emotes/` | `EmoteDefinition.ts`, `EmoteCatalog.ts`, `EmoteMarkUtil.ts`, and one folder for each emote. |
| `props/` | `PropDefinition.ts`, `PropCatalog.ts`, the shared shape builders in `shapes/`, and one folder for each shared prop. |
| `marks/` | `MarkDefinition.ts`, `MarkCatalog.ts`, and one folder for each mark an emote or a gesture shows ("!", "?", the vein, …). |
| `attendants/` | `AttendantDefinition.ts`, `AttendantCatalog.ts`, the roster `attend` keeps, and one folder for each attendant. |
| `sleep/` | The sleep sequence and its embers. |
| `constants/` | The values the core uses, with their unit in their name, and the palette. |
| `react/` | The React layer: `<Flint>`, `useFlintHabitat` and `useFlintPerform`. |
| `testing/` | The manual frame source, the mind run, and the frame capture. |
| `demo/` | The demo page: the playground of the design handoff, rebuilt on the package. |

The package's own guard, `PackageIsolation.spec.ts`, holds that no file imports outside the folder and that nothing
that ships imports a `bun:` or `node:` module.

## Add an animation

These are the only steps, for a behaviour too. Change no core file: `AnimationModules.spec.ts` fails when a core file (the core of
`07-animation-modules.md`, the mind, sleep and `MotionPose.ts`) names an animation or a behaviour, as a string, a property or a piece
of a built string, or imports from an animation or behaviour folder anything but a catalog or a contract; when a folder is not in its
catalog, a catalog entry has no folder, a folder's module has no spec, or a folder has no `constants/<Name>Values.ts` (a behaviour
needs one only when it has values); and when a prop is not in the prop catalog.

1. Make the folder. A gesture is `flint/gestures/<name>/`, an emote `flint/emotes/<name>/`, a mark `flint/marks/<name>/`, an
   attendant `flint/attendants/<name>/`, a behaviour `flint/behaviours/<name>/`. The folder's name is the definition's `name`, in kebab
   case.
2. Put every value in `constants/<Name>Values.ts` in that folder, `<Name>` the folder's name in Pascal case:
   `SCREAMING_CASE`, the unit in the name (`_UNITS`, `_MILLISECONDS`, `_DEGREES`), no number outside a `constants/`
   folder. A colour is a role of `flint/constants/Palette.ts`, never a hex value.
3. Make each prop that only this animation uses in the same folder, as `<Name>Prop.ts` exporting `<NAME>_PROP`, built from
   the builders in `flint/props/shapes/`. A prop that two animations use goes in `flint/props/<name>/`. A prop's name is
   camel case, since it is a key of the pose.
4. Make the module: `<Name>Gesture.ts` exporting `<NAME>_GESTURE = gestureDefinition({ … })`, `<Name>Emote.ts` exporting
   `<NAME>_EMOTE = emoteDefinition({ … })`, `<Name>Mark.ts` exporting `<NAME>_MARK = markDefinition({ … })`,
   `<Name>Attendant.ts` exporting `<NAME>_ATTENDANT = attendantDefinition({ … })`, or `<Name>Behaviour.ts` exporting
   `<NAME>_BEHAVIOUR = behaviourDefinition({ … })`.
5. Put a spec beside each module, `<Module>.spec.ts`, that opens with a docblock of what matters and why.
6. Register it: one import and one line at the end of the list in `flint/gestures/GestureCatalog.ts`,
   `flint/emotes/EmoteCatalog.ts`, `flint/marks/MarkCatalog.ts`, `flint/attendants/AttendantCatalog.ts` or
   `flint/behaviours/BehaviourCatalog.ts`. Keep the list's
   last line `] as const);`. For each prop of step 3, add one import and one line at the end of the list in
   `flint/props/PropCatalog.ts`. A prop is a key of the pose type, which the pose module derives from that list, and a
   gesture's module depends on the pose type, so the prop catalog cannot be derived from the gestures without an import
   cycle.
7. Look at it with the frame capture ("Look at an animation"), then run `bun run typecheck`, `bun run lint`,
   `bun test --path-ignore-patterns='.claude/**' ./flint/gestures/<name>` and `bun run verify`.

### What a behaviour gives

A behaviour (`BehaviourDefinition.ts`) is the mind's state machine for one thing Flint does: `started(state, start)`, `afterFrame(state,
own, perception, time)` and `partOf(own, input)`, all pure, on the mind's state and its own state, whose `name` is the behaviour's.
`partOf` gives a `BehaviourPart`: a pose part, occlusion, the position easing, whether Flint may blink, and `page`, its page shapes. It
also says what the mind must know of it: its `intents`; its `role` (`rest`, the one behaviour every other ends in, which also gives
`atRest`; `drag`; `click`; or null); `intentWhileRunning` (`dropped`, `laid-over-it`, `gesture-ends-it` or `ends-it`);
`refusesItsOwnIntent`, `intentKeepsTheQuiet`, `asksDirector`, `takesClicks`, `takesSteering`, `aimsItsOwnGestures`; `element`
(`none`, `optional` or `required`: what `perform(intent, element)` gives it, as `perception.target`); `chosenWhenNothingIsNew`, the rule
director's pick when no cue is new; `standingPlaceOf`, where Flint stands while it runs when that is not where it lives; and
`droppedOn` for the drag. A behaviour may start the gestures and emotes it needs by their intents, and another behaviour through that
behaviour's own exported function; it ends in the rest, through `wanderAtRest` of `behaviours/wander/`. `behaviours/chase-bug/` and
`behaviours/lay-bar-along/` are the examples with an element and page shapes; `behaviours/chase-bug/` also has a prop of its own, the
held bug, which moves with Flint where a page shape cannot. A behaviour that takes Flint back to its floor lowers it at the body rate,
through `MovementUtil.loweredLiftOf`, so the floor still follows its box at once.

### What a gesture gives

- `intents`: each intent on the fixed list that starts the gesture, with its form: `variant`, `durationMilliseconds`
  (`null` for a loop or a steady pose, a number for one action that ends by itself) and `stillMomentMilliseconds`, the
  moment reduced motion holds. A gesture with one form names its one intent after itself, with the variant `normal`
  (`singleFormOf(duration, stillMoment)` writes that form). An intent is unique across every catalog.
- `targetPose(input)`: a pure function of `input.elapsedMilliseconds` (the `t` of the handoff), `input.variant`,
  `input.facing`, `input.sidewaysWidth`, `input.target` and `input.verdict`. It returns a `PosePart`: a field left out keeps
  what the layers below gave; `nearHand` or `farHand` as `null` takes that hand away.
- `continuesWhileWalking`, `continuesWhileJumping`, `aimsAtElement` (only a gesture `perform(intent, element)` aims at,
  as the grab) and `verdict` (a decision taken once at a moment, as the grab's catch), usually `false`, `false`, `false`,
  `null`.

The parts of a `PosePart`:

| Field | What it does |
| --- | --- |
| `body` | `leanDegrees`, `addedLift`, `addedShake`, `widthFactor`, `heightFactor`, `hover`; `tint: { role, amount, ratePerSecond? }` draws the body again in that colour (the eye rate by default); `fillOpacity` below 1 shows the dashed outline. |
| `eyes` | `shift`, `height`, `rightHeightOverride`, `lift`, `slantDegrees`, `happiness` (1 is the happy eyes). |
| `nearHand`, `farHand` | `{ cornerCount, centreX, centreY, radius, turnDegrees, placement }`; `placement` is `'eased'`, `'exact-position'`, or `{ heldTo: '<propName>' }`, which puts the hand on that prop's drawn grip on every frame. |
| `props` | `{ <propName>: state }`; a gesture gives its props on every frame, and they fade out when it stops or no longer gives them. |
| `emoteMark` | A mark: `{ ...emoteMarkAtRest('question'), innerScaleX: spring }`; the spring is `AnimationCurveUtil.springScaleAt(t / SPRING.DURATION_MILLISECONDS)`. An emote's mark hides it. |
| `sleep` | `{ glowOpacity }` is the inner glow; it eases at the eye rate, so it fades when the gesture stops. |
| `exactFields` | Values set on this frame, not eased: `'eye-height'`, `'happy-eyes'`, `'tint'`, `'fill-opacity'`, `'inner-glow'`, … |

A prop gives `name`, `hidden` (its state before it shows, with `shown: 0`), `layer` (`'behind-body'`,
`'in-front-of-body'` behind the near hand, or `'in-front-of-all'`), `shapesOf(state, { facing, holdingHand })` returning
`{ opacity?, transform?, shapes }`, and optionally `gripOf(state)` for a hand held to it, `easedOf(drawn, target,
handFraction)` for its own easing (by default only `shown` eases), and `gradients`. The renderer draws each prop's
`hidden` state once, out of sight, when Flint starts, so `hidden` must be a state `shapesOf` can draw. A shape is a
`polygon`, `rectangle`, `line`, `circle`, `path` or `text`, with a `key` unique in its drawing, a `fill` (give `'none'`
to a stroked path), a `stroke`, `opacity`, `dash` and `transform`; a shape that is never mirrored (a tick, text) gives
`unmirroredAboutX`, its own centre. Writing goes from left to right on the screen whatever the facing: use
`context.facing`, as `writtenLineShapeOf` does.

The shared vocabulary of `06-more-animations.md` is in `flint/props/shapes/`: `PaperShapeUtil` (the paper, a draft, the
header in any colour, the mini sheet and a ticket at any scale), `blockShapeOf` (any size), `SparkShapeUtil` (the spark of
a Watcher, live, dim or dead, at any scale; the small spark in any side and colour; a small spark's flight),
`LampShapeUtil` (any radius), `envelopeShapesOf` (an open flap, a turn, a scale), `BugShapeUtil`, `gaugeShapesOf`,
`VerdictShapeUtil` (the tick and the cross in any colour, small ones at `VERDICT_SHAPE.SMALL_SCALE`),
`writtenLineShapeOf`, `sheetLineShapesOf`, `notepadShapesOf`, `plugShapesOf`, `snapShapesOf` (two pressed blocks snapped
into one) and `TracedPathUtil` (a path that grows along its length). The shared props are `keyboard`, `sheet` and
`lookingGlass`; the sheet keeps its values in `flint/props/shapes/constants/SheetShape.ts`, since the shared builder
`sheetLineShapesOf` draws from them. The helpers of `flint/gestures/` and `flint/utils/` are `GestureTimelineUtil` (where
a time is in a cycle, how far a phase has run), `AnimationCurveUtil` (`clamp`, `cycleProgressOf`, `springScaleAt`,
`radiansOf`, `easingFractionOf`, `interpolated` and `interpolatedPoint`), `PenWritingUtil`, `workingVariantPartOf`,
`GestureMarkUtil` (a mark a gesture shows during one step, entering and leaving as an emote's mark does), `TypingUtil`
(the hands of Type and the part of normal typing), `pointingHandAt`, `stampingHandAt`, `ReadingLensUtil`, `BlockPressUtil`
(two hexagons that press two blocks into one) and `snapSparksAt`. Each prop, mark and attendant draws in a group whose
`data-flint-part` attribute is its name.

### A worked example

Hand over: one action, in a normal and a fast variant, in which one pentagon holds a parcel of its own and moves it out.

`flint/gestures/hand-over/constants/HandOverValues.ts`:

```ts
/** Hand over: Flint holds out a parcel and lets it go, in one action; in sprite units, for Flint facing right. */
export const HAND_OVER = {
  DURATION_MILLISECONDS:      1200,
  FAST_DURATION_MILLISECONDS: 600,
  STILL_MOMENT_MILLISECONDS:  600,
  HAND_RADIUS_UNITS:          6,
  PARCEL_START_X_UNITS:       24,
  PARCEL_REACH_UNITS:         10,
  PARCEL_Y_UNITS:             -30,
  EYE_HEIGHT_UNITS:           9,
} as const;

/** The parcel: a block with a label; the hand holds it at its lower left corner. */
export const PARCEL_SHAPE = {
  GRIP_OFFSET_X_UNITS: 0,
  GRIP_OFFSET_Y_UNITS: 8,
  LABEL_INSET_UNITS:   2,
  LABEL_DROP_UNITS:    3,
  LABEL_LENGTH_UNITS:  8,
} as const;
```

`flint/gestures/hand-over/ParcelProp.ts`, a prop of its own built from shapes, with a grip:

```ts
/** The parcel of Hand over: a block of the shared vocabulary with a label line on it. A hand can be held at its lower left corner. */
import { propDefinition }      from '../../props/PropDefinition.ts';
import { blockShapeOf }        from '../../props/shapes/BlockShape.ts';
import { writtenLineShapeOf }  from '../../props/shapes/WrittenLineShape.ts';
import { PARCEL_SHAPE }        from './constants/HandOverValues.ts';

export interface ParcelState {
  readonly shown: number;
  /** The top left corner. */
  readonly x:     number;
  readonly y:     number;
}

export const PARCEL_PROP = propDefinition({
  name:     'parcel',
  hidden:   Object.freeze<ParcelState>({ shown: 0, x: 0, y: 0 }),
  layer:    'in-front-of-body',
  gripOf:   (state: ParcelState) => ({ x: state.x + PARCEL_SHAPE.GRIP_OFFSET_X_UNITS, y: state.y + PARCEL_SHAPE.GRIP_OFFSET_Y_UNITS }),
  shapesOf: (state: ParcelState, context) => ({
    opacity: state.shown,
    shapes:  [
      blockShapeOf({
        key: 'box', state: 'work-in-progress', x: state.x, y: state.y,
      }),
      writtenLineShapeOf({
        key:           'label',
        startX:        state.x + PARCEL_SHAPE.LABEL_INSET_UNITS,
        startY:        state.y + PARCEL_SHAPE.LABEL_DROP_UNITS,
        fullLength:    PARCEL_SHAPE.LABEL_LENGTH_UNITS,
        writtenLength: PARCEL_SHAPE.LABEL_LENGTH_UNITS,
        facing:        context.facing,
        slope:         0,
        stroke:        'graphite',
      }),
    ],
  }),
});
```

`flint/gestures/hand-over/HandOverGesture.ts`, with a variant, a one-action duration, a still moment and a hand held to
the prop:

```ts
/** Hand over: Flint holds out a parcel and lets it go, in one action, in a normal and a fast variant. The hand is held to the parcel. */
import { BODY_SHAPE, EYE_SHAPE } from '../../constants/BodyShape.ts';
import { HAND_SHAPE }            from '../../constants/HandShape.ts';
import type { PosePart }         from '../../SpritePose.ts';
import { AnimationCurveUtil }    from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }     from '../GestureDefinition.ts';
import { gestureDefinition }     from '../GestureDefinition.ts';
import { HAND_OVER }             from './constants/HandOverValues.ts';

type HandOverVariant = 'normal' | 'fast';

function handOverPartOf(input: GestureInput<HandOverVariant>): PosePart {
  const durationMilliseconds = input.variant === 'fast' ? HAND_OVER.FAST_DURATION_MILLISECONDS : HAND_OVER.DURATION_MILLISECONDS;
  const reach = AnimationCurveUtil.clamp(input.elapsedMilliseconds / durationMilliseconds);
  return {
    body:     { leanDegrees: BODY_SHAPE.WORKING_LEAN_DEGREES },
    eyes:     { shift: EYE_SHAPE.SHIFT_AT_WORK_UNITS, height: HAND_OVER.EYE_HEIGHT_UNITS },
    nearHand: {
      cornerCount: HAND_SHAPE.GRABBING_CORNER_COUNT,
      centreX:     0,
      centreY:     0,
      radius:      HAND_OVER.HAND_RADIUS_UNITS,
      turnDegrees: 0,
      placement:   { heldTo: 'parcel' },
    },
    farHand: null,
    props:   { parcel: { shown: 1, x: HAND_OVER.PARCEL_START_X_UNITS + (HAND_OVER.PARCEL_REACH_UNITS * reach), y: HAND_OVER.PARCEL_Y_UNITS } },
  };
}

export const HAND_OVER_GESTURE = gestureDefinition({
  name:    'hand-over',
  intents: {
    'hand-over':      { variant: 'normal', durationMilliseconds: HAND_OVER.DURATION_MILLISECONDS, stillMomentMilliseconds: HAND_OVER.STILL_MOMENT_MILLISECONDS },
    'hand-over-fast': { variant: 'fast', durationMilliseconds: HAND_OVER.FAST_DURATION_MILLISECONDS, stillMomentMilliseconds: HAND_OVER.STILL_MOMENT_MILLISECONDS },
  },
  continuesWhileWalking: false,
  continuesWhileJumping: false,
  aimsAtElement:         false,
  verdict:               null,
  targetPose:            handOverPartOf,
});
```

`flint/gestures/hand-over/HandOverGesture.spec.ts` (and `ParcelProp.spec.ts` beside the prop, alike):

```ts
/**
 * Hand over. What matters: the parcel goes out by 10 over the action, in half the time in the fast variant; the hand sits on the drawn
 * grip of the parcel on every frame; each intent is one action that ends by itself, and reduced motion holds the moment at 600 ms.
 */
import { expect, test } from 'bun:test';

import { poseWithPart }      from '../../PoseComposition.ts';
import { easedPoseOf }       from '../../PoseEasing.ts';
import { NEUTRAL_POSE }      from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { HAND_OVER_GESTURE } from './HandOverGesture.ts';

const FRAME_MILLISECONDS = 16;

const inputAt = (elapsedMilliseconds: number, variant: 'normal' | 'fast'): GestureInput<'normal' | 'fast'> => ({
  elapsedMilliseconds, variant, facing: 1, sidewaysWidth: 1, target: null, verdict: null,
});

test('the parcel goes out by 10 over the action, in half the time when fast', () => {
  expect(HAND_OVER_GESTURE.targetPose(inputAt(600, 'normal')).props?.parcel?.x).toBe(29);
  expect(HAND_OVER_GESTURE.targetPose(inputAt(600, 'fast')).props?.parcel?.x).toBe(34);
});

test('the hand sits on the drawn grip of the parcel on every frame', () => {
  const target = poseWithPart(NEUTRAL_POSE, HAND_OVER_GESTURE.targetPose(inputAt(300, 'normal')));
  let drawn = NEUTRAL_POSE;
  for (let i = 0; i < 10; i++) {
    drawn = easedPoseOf(drawn, target, FRAME_MILLISECONDS);
    expect([drawn.nearHand?.centreX, drawn.nearHand?.centreY]).toEqual([drawn.props.parcel.x, drawn.props.parcel.y + 8]);
  }
});

test('each intent is one action, with its still moment', () => {
  expect(Object.values(HAND_OVER_GESTURE.intents).map((form) => [form.variant, form.durationMilliseconds, form.stillMomentMilliseconds])).toEqual([
    ['normal', 1200, 600],
    ['fast', 600, 600],
  ]);
});
```

The two catalog lines, each with its import, at the end of each list:

```ts
// flint/gestures/GestureCatalog.ts
import { HAND_OVER_GESTURE } from './hand-over/HandOverGesture.ts';
  HAND_OVER_GESTURE,

// flint/props/PropCatalog.ts
import { PARCEL_PROP } from '../gestures/hand-over/ParcelProp.ts';
  PARCEL_PROP,
```

The intents `hand-over` and `hand-over-fast` are then on `SPRITE_INTENTS`, `perform('hand-over')` runs it, the demo page
shows both buttons, and `props.parcel` is typed in every `PosePart`. An emote is alike, with `emoteDefinition({ name,
durationMilliseconds, targetPose(input) })`, `input.ageMilliseconds` as its time and `EmoteMarkUtil` for its mark; an
attendant gives `attendantDefinition({ name, maximumCount, memberPoseOf(input), shapesOf() })`, as
`attendants/watcher-spark/`.

## Look at an animation

The frame capture renders Flint in headless Chrome, through `createFlint` and the real renderer on a manual frame source,
to PNG files in `.claude/.evidence/flint-frames/<label>/`, which git ignores: each subject facing right and left, at its
still moment under reduced motion and at each moment given (by default 160, 640, 1296 and 2608 ms after the intent).

```sh
# Every intent, idle and every attendant:
bun flint/testing/CaptureFlintFrames.ts capture <label>
# Some intents and attendants, at some moments:
bun flint/testing/CaptureFlintFrames.ts capture <label> --intent hand-over --attendant watcher-spark --moments 300,900
# A gesture and its prop before they are registered: the bundle adds them to the catalogs, and the capture shows their intents:
bun flint/testing/CaptureFlintFrames.ts capture <label> --gesture-module flint/gestures/hand-over/HandOverGesture.ts \
  --prop-module flint/gestures/hand-over/ParcelProp.ts
# Compare two labels pixel by pixel; it exits 1 on a difference beyond anti-aliasing noise, or a missing picture:
bun flint/testing/CaptureFlintFrames.ts compare <first label> <second label>
```

`--emote-module`, `--attendant-module` and `--behaviour-module` add an emote, an attendant or a behaviour the same way; `--chrome <path>`
names the browser when none is found. A behaviour that takes an element is shown on a home as wide as the picture, at one pixel for one
unit, and given the host's element drawn as a grey bar; give it moments that cover its run, as `--intent chase-bug --moments
200,600,1000,1400,1900,2400`.

## The demo page

`demo/index.html` shows every animation through `createFlint`, `perform`, `attend` and `steer`, at 1 and 0.5 pixels for
one unit, facing left or right, with reduced motion and on a light or a dark ground. It makes one button for each intent
and one count for each attendant from the catalogs, so a new animation shows there with no change to the demo: a gesture that aims is
given the floating square, and a behaviour that takes an element the grey bar of a ticket. Build it
into one file that opens in a browser with no server; `demo/build/` is git-ignored:

```sh
bun build --compile --target=browser ./flint/demo/index.html --outdir=./flint/demo/build
```

Then open `flint/demo/build/index.html`.
