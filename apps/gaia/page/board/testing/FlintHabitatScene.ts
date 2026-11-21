/**
 * A view under the board's host of Flint, in a happy-dom document on manual frames: Flint starts in the stored habitat, or at home, and has
 * lived a frame there; a recording brain reads what Flint perceived, such as the cues it received and its visit target; and every intent
 * performed through the handle is recorded with its element before Flint carries it out. Test-only.
 */
import { act, render } from '@testing-library/react';

import type { FlintHandle }                                from 'flint';
import type { Director, PerceptionDigest }                 from 'flint/SpriteHabitat';
import { createElement, type ReactElement }                from 'react';
import { PRODUCT_NAMES }                                   from '../../../src/shared/constants/ProductNames.ts';
import { BoardFlint }                                      from '../flint/BoardFlint.tsx';
import { FLINT_HABITAT_CHOICE_NAME }                       from '../flint/FlintHabitatStorage.ts';
import { boardPreferenceStoreOf }                          from '../preferences/PreferenceStore.ts';
import { createManualFlintFrames, type ManualFlintFrames } from './ManualFlintFrames.ts';

const FRAME_MILLISECONDS = 16;
/** A little over the time between two asks of the director, so it is asked once more. */
const DIRECTOR_ASK_MILLISECONDS = 3100;
const BRAIN_MAXIMUM_MILLISECONDS = 60000;
const TRACKER_ID = 'example-tracker';
const STORED_HABITAT_KEY = `${PRODUCT_NAMES.programName}:board:${TRACKER_ID}:${FLINT_HABITAT_CHOICE_NAME}`;

export interface FlintHabitatScene<Props> {
  /** Renders the view with new props; the boxes stay as placed. */
  readonly show:         (props: Props) => void;
  readonly frames:       ManualFlintFrames;
  readonly handle:       FlintHandle;
  /** Each intent performed through the handle, with the element it was given. */
  readonly performed:    readonly (readonly [intent: string, toward: Element | undefined])[];
  /** Starts a brain that answers `wander` and gives the cues of every ask after a director's interval. */
  readonly cuesReceived: (whileShowing: () => void) => readonly string[];
  /** Starts a brain that answers `wander` and gives what Flint perceived at every ask after a director's interval. */
  readonly perceived:    (whileShowing: () => void) => readonly PerceptionDigest[];
}

export interface FlintHabitatSceneOptions<Props> {
  /** The kind Flint starts in, or null for home. */
  readonly storedHabitatKind: string | null;
  readonly viewOf:            (props: Props) => ReactElement;
  readonly firstProps:        Props;
  /** Gives the view's elements their boxes; the page and the home corner are placed already. */
  readonly placeView:         () => void;
}

export function placeAt(element: Element, left: number, top: number, width: number, height: number): void {
  const rectangle = {
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
  };
  element.getBoundingClientRect = () => rectangle as DOMRect;
}

export function elementOf(selector: string): Element {
  const found = document.querySelector(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

function advanceFor(frames: ManualFlintFrames, milliseconds: number): void {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += FRAME_MILLISECONDS) act(() => frames.advance(FRAME_MILLISECONDS));
}

export function flintHabitatSceneOf<Props>({
  storedHabitatKind, viewOf, firstProps, placeView
}: FlintHabitatSceneOptions<Props>): FlintHabitatScene<Props> {
  const entries = new Map<string, string>(storedHabitatKind === null ? [] : [[STORED_HABITAT_KEY, `1:${storedHabitatKind}`]]);
  const boardStore = boardPreferenceStoreOf(TRACKER_ID, () => ({
    getItem:    (key) => entries.get(key) ?? null,
    setItem:    (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  }));
  const frames = createManualFlintFrames();
  const handles: FlintHandle[] = [];
  const performed: (readonly [string, Element | undefined])[] = [];
  const recordingPerforms = (made: FlintHandle): FlintHandle => {
    const carryOut = made.perform;
    return Object.assign(made, {
      perform: (intent: string, toward?: Element) => {
        performed.push([intent, toward]);
        return toward === undefined ? carryOut(intent) : carryOut(intent, toward);
      },
    });
  };
  const hostOf = (props: Props): ReactElement => createElement(BoardFlint, {
    boardStore,
    frameSource: frames.frameSource,
    onHandle:    (made: FlintHandle | null) => {
      if (made !== null) handles.push(recordingPerforms(made));
    },
    children: viewOf(props),
  });
  const page = render(hostOf(firstProps));
  placeAt(elementOf('svg[data-flint]'), 0, 0, 1200, 800);
  placeAt(elementOf('.board-flint-home'), 1064, 732, 112, 56);
  placeView();
  advanceFor(frames, FRAME_MILLISECONDS);
  const handle = handles.at(-1);
  if (handle === undefined) throw new Error('Flint was not made');
  const perceived = (whileShowing: () => void): readonly PerceptionDigest[] => {
    const digests: PerceptionDigest[] = [];
    const brain: Director = {
      nextIntent: (digest) => {
        digests.push(digest);
        return 'wander';
      },
    };
    handle.startBrain(brain, BRAIN_MAXIMUM_MILLISECONDS);
    whileShowing();
    advanceFor(frames, DIRECTOR_ASK_MILLISECONDS);
    handle.stopBrain();
    return digests;
  };
  return {
    show:         (props) => page.rerender(hostOf(props)),
    frames,
    handle,
    performed,
    cuesReceived: (whileShowing) => perceived(whileShowing).flatMap((digest) => digest.newCues),
    perceived,
  };
}
