/**
 * `useHabitatHappenings` under the Bridge's host of Flint, in a happy-dom document on manual frames, with a recording brain to read the
 * cues Flint received. What matters: the facts a view mounts with send nothing; new facts send the model's cues with the first one last,
 * so it is the newest; a behaviour on an element is performed with the view's element while Flint lives in the view's habitat, and not
 * while Flint lives elsewhere; and with the element not on the page its fallback cue is sent in its place.
 */
import { cleanup } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useRef } from 'react';

import type { SpriteHabitat, SpriteSuggestion } from '../../flint/SpriteHabitat.ts';
import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../testing/FlintHabitatScene.ts';
import { useHabitatHappenings, type HabitatHappenings } from './UseHabitatHappenings.ts';

const EXAMPLE_HABITAT: SpriteHabitat = Object.freeze({
  kind:        'example-habitat',
  description: 'An example view of rows.',
  suggestions: Object.freeze<SpriteSuggestion[]>([
    { when: 'first-change', respond: 'happy' },
    { when: 'second-change', respond: 'wave' },
    { when: 'row-is-gone', respond: 'escaped-bug' },
  ]),
});

afterEach(cleanup);

/** The facts are the happenings themselves, so each render with new facts gives exactly these. */
const happeningsBetween = (_previous: HabitatHappenings, next: HabitatHappenings): HabitatHappenings => next;

const rowOf = (viewElement: HTMLElement, elementKey: string): Element | null => viewElement.querySelector(`[data-example-row="${elementKey}"]`);

function ExampleView({ facts }: { readonly facts: HabitatHappenings }) {
  const viewElement = useRef<HTMLDivElement>(null);
  useHabitatHappenings({
    viewElement, habitat: EXAMPLE_HABITAT, facts, happeningsBetween, elementOf: rowOf
  });
  return (
    <div className="example-view" ref={viewElement} data-flint-workplace="">
      <div data-example-row="R1" />
    </div>
  );
}

function sceneWithFlintIn(storedHabitatKind: string | null): FlintHabitatScene<HabitatHappenings> {
  return flintHabitatSceneOf<HabitatHappenings>({
    storedHabitatKind,
    viewOf:     (facts) => <ExampleView facts={facts} />,
    firstProps: { cueNames: [], elementHappenings: [] },
    placeView:  () => {
      placeAt(elementOf('.example-view'), 100, 100, 800, 400);
      placeAt(elementOf('[data-example-row="R1"]'), 120, 160, 300, 30);
    },
  });
}

const CHASE_ROW_ONE = { intent: 'chase-bug', elementKey: 'R1', fallbackCue: 'row-is-gone' } as const;

describe('the cues', () => {
  test('new facts send the model\'s cues, the first one last', () => {
    const scene = sceneWithFlintIn('example-habitat');
    const cues = scene.cuesReceived(() => scene.show({ cueNames: ['first-change', 'second-change'], elementHappenings: [] }));
    expect(cues).toEqual(['second-change', 'first-change']);
  });

  test('the facts the view mounts with send nothing', () => {
    const scene = sceneWithFlintIn('example-habitat');
    expect(scene.cuesReceived(() => undefined)).toEqual([]);
  });
});

describe('a behaviour on an element', () => {
  test('is performed with the view\'s element while Flint lives in the view\'s habitat', () => {
    const scene = sceneWithFlintIn('example-habitat');
    scene.show({ cueNames: [], elementHappenings: [CHASE_ROW_ONE] });
    expect(scene.performed).toEqual([['chase-bug', elementOf('[data-example-row="R1"]')]]);
  });

  test('is not performed while Flint lives elsewhere', () => {
    const scene = sceneWithFlintIn(null);
    scene.show({ cueNames: [], elementHappenings: [CHASE_ROW_ONE] });
    expect(scene.performed).toEqual([]);
  });

  test('with its element not on the page sends its fallback cue in its place', () => {
    const scene = sceneWithFlintIn('example-habitat');
    const cues = scene.cuesReceived(() => scene.show({ cueNames: [], elementHappenings: [{ ...CHASE_ROW_ONE, elementKey: 'R9' }] }));
    expect([cues, scene.performed]).toEqual([['row-is-gone'], []]);
  });
});
