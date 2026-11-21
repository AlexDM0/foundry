/**
 * A Flint slot as its screen's habitat, under the board's host of Flint on manual frames. What matters: the slot's box is the habitat of
 * its screen, and the cue it mounts with sends nothing; a change of the screen's data reaches Flint as the slot's new cue; a lasting cue
 * offers Flint its answer to keep up in the slot, a moment none; the open screen's slot is the visit target, a press in another
 * habitat of the screen sends Flint there, and the slot of the next screen is the target again; and Flint goes to the slot at once when
 * it is made and when the next screen's slot shows, so it never waits at its home corner for its director's next turn, every few seconds.
 */
import {
  act,
  cleanup,
  fireEvent,
  screen
} from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import { useRef }                              from 'react';
import { type SpriteHabitat, useFlintHabitat } from '../../lib/flint/FlintInterface.ts';
import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../testing/FlintHabitatScene.ts';
import { FLINT_SLOT_CUES, type FlintSlotCue } from './FlintSlotCues.ts';
import { FlintSlotHabitat }                   from './FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }                from './FlintSlotHabitats.ts';

afterEach(cleanup);

const SLOT_LABEL = 'Flint, the example agent';

const EXAMPLE_LIST_HABITAT: SpriteHabitat = Object.freeze({ kind: 'example-list', description: 'An example list.', suggestions: [] });

interface ScreenProps {
  readonly habitat: SpriteHabitat;
  readonly cue:     FlintSlotCue;
}

function ExampleScreen({ habitat, cue }: ScreenProps) {
  const listElement = useRef<HTMLDivElement>(null);
  useFlintHabitat(listElement, EXAMPLE_LIST_HABITAT);
  return (
    <main>
      <FlintSlotHabitat key={habitat.kind} habitat={habitat} cue={cue} label={SLOT_LABEL} ground="page" />
      <div className="example-list" ref={listElement} />
    </main>
  );
}

function placeSlot(): void {
  placeAt(screen.getByRole('img', { name: SLOT_LABEL }), 100, 100, 100, 100);
}

function sceneOfScreen(storedHabitatKind: string | null, firstProps: ScreenProps): FlintHabitatScene<ScreenProps> {
  return flintHabitatSceneOf<ScreenProps>({
    storedHabitatKind,
    viewOf:    (props) => <ExampleScreen {...props} />,
    firstProps,
    placeView: () => {
      placeSlot();
      placeAt(elementOf('.example-list'), 300, 100, 600, 400);
    },
  });
}

const BUILDING: ScreenProps = { habitat: FLINT_SLOT_HABITATS.agents, cue: FLINT_SLOT_CUES.AGENT_WRITES };

test('the slot\'s box is the habitat of its screen, and the cue it mounts with sends nothing', () => {
  const scene = sceneOfScreen('agent-job-slot', BUILDING);
  expect(screen.getByRole('img', { name: SLOT_LABEL }).getAttribute('data-sprite-habitat')).toBe('agent-job-slot');
  expect(scene.cuesReceived(() => scene.show({ ...BUILDING }))).toEqual([]);
});

test('a change of the screen\'s data reaches Flint as the slot\'s new cue', () => {
  const scene = sceneOfScreen('agent-job-slot', BUILDING);
  expect(scene.cuesReceived(() => scene.show({ ...BUILDING, cue: FLINT_SLOT_CUES.AGENT_REVIEWS }))).toEqual(['agent-reviews']);
  expect(scene.cuesReceived(() => scene.show({ ...BUILDING, cue: FLINT_SLOT_CUES.AGENT_IS_IDLE }))).toEqual(['agent-is-idle']);
});

test('a lasting cue offers Flint its answer to keep up in the slot, and a moment offers none', () => {
  const scene = sceneOfScreen('agent-job-slot', BUILDING);
  expect(scene.perceived(() => undefined).map((digest) => digest.copyIsOffered)).toContain(true);
  const idle = scene.perceived(() => scene.show({ ...BUILDING, cue: FLINT_SLOT_CUES.AGENT_IS_IDLE }));
  expect(idle.length).toBeGreaterThan(0);
  expect(idle.map((digest) => digest.copyIsOffered)).not.toContain(true);
});

test('the open screen\'s slot is the visit target, a press in another habitat sends Flint there, and the next screen\'s slot takes it back', () => {
  const scene = sceneOfScreen(null, BUILDING);
  expect(scene.perceived(() => undefined).map((digest) => digest.visitTargetKind)).toContain('agent-job-slot');
  const afterPress = scene.perceived(() => fireEvent.pointerDown(elementOf('.example-list')));
  expect(afterPress.at(-1)?.visitTargetKind).toBe('example-list');
  const nextScreen = scene.perceived(() => {
    scene.show({ habitat: FLINT_SLOT_HABITATS.questions, cue: FLINT_SLOT_CUES.AGENT_WAITS_ON_USER });
    placeSlot();
  });
  expect(nextScreen.at(-1)?.visitTargetKind).toBe('question-slot');
});

/** A Flint slot measures at its place from the moment it mounts, as in a browser, so Flint can go there before a spec places it. */
function slotsMeasuredOnMount(): () => void {
  const measure = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function measured(this: HTMLElement): DOMRect {
    if (!this.classList.contains('design-system-flint-slot')) return measure.call(this);
    const slotBox = {
      left: 100, top: 100, width: 100, height: 100, right: 200, bottom: 200, x: 100, y: 100, toJSON: () => ({}),
    };
    return slotBox as DOMRect;
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = measure;
  };
}

/** The pop-in takes about 5.9 seconds; Flint's director turns every 3 seconds, so a Flint that waits for it is not there yet. */
const POP_IN_AND_A_LITTLE_MILLISECONDS = 6500;
const FRAME_MILLISECONDS = 16;
const ARRIVAL_LIMIT_MILLISECONDS = 20000;

function advanceFor(scene: FlintHabitatScene<ScreenProps>, milliseconds: number): void {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += FRAME_MILLISECONDS) act(() => scene.frames.advance(FRAME_MILLISECONDS));
}

function advanceUntilFlintLivesIn(scene: FlintHabitatScene<ScreenProps>, kind: string): void {
  for (let elapsed = 0; scene.handle.livesIn() !== kind; elapsed += FRAME_MILLISECONDS) {
    if (elapsed > ARRIVAL_LIMIT_MILLISECONDS) throw new Error(`Flint never arrived in ${kind}`);
    act(() => scene.frames.advance(FRAME_MILLISECONDS));
  }
}

test('Flint goes to the slot at once when it is made, and when the next screen\'s slot shows, never waiting at home for its director', () => {
  const restoreMeasure = slotsMeasuredOnMount();
  try {
    const scene = sceneOfScreen(null, BUILDING);
    advanceFor(scene, POP_IN_AND_A_LITTLE_MILLISECONDS);
    expect(scene.handle.livesIn()).toBe('agent-job-slot');
    advanceUntilFlintLivesIn(scene, 'agent-job-slot');
    scene.show({ habitat: FLINT_SLOT_HABITATS.questions, cue: FLINT_SLOT_CUES.AGENT_WAITS_ON_USER });
    advanceFor(scene, POP_IN_AND_A_LITTLE_MILLISECONDS);
    expect(scene.handle.livesIn()).toBe('question-slot');
  } finally {
    restoreMeasure();
  }
});
