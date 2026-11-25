/**
 * Copy in the agent panel. What matters: Flint walks below the agent's row and then shows that agent's state with the gesture of its
 * intent; a new intent changes the gesture; a target that is gone, or an intent that is no gesture, ends the copy; under reduced motion
 * Flint stands below the row at once. In a slot that keeps Flint inside, Flint stands where the declared extent of the copied gesture
 * fits: in a strip's slot of 60 by 50 pixels at three quarters of a pixel to a unit, all of Needs an answer and of research stays in, and in
 * one of 100 pixels Flint stands in its middle.
 */
import { describe, expect, test } from 'bun:test';

import { intendedGestureOf }        from '../../IntentMeaning.ts';
import type { GestureIntent }       from '../../gestures/GestureCatalog.ts';
import type { PerceivedCopyTarget } from '../../mind/Perception.ts';
import {
  AGENTS,
  CHAT,
  createMindRun,
  habitatOf,
  perceptionOf
} from '../../testing/MindRun.ts';

function agentsCopying(copyTarget: PerceivedCopyTarget | null): ReturnType<typeof perceptionOf> {
  return perceptionOf({ habitats: [CHAT, { ...AGENTS, copyTarget }] });
}

function copyingRun(copyTarget: PerceivedCopyTarget | null, reducedMotion = false): ReturnType<typeof createMindRun> {
  const run = createMindRun(undefined, { ...agentsCopying(copyTarget), reducedMotion });
  run.frame({ storedHabitatId: 'agents' });
  run.give('copy');
  run.frame();
  return run;
}

describe('the copy', () => {
  test('Flint walks below the row with no gesture, then copies the state with its gesture', () => {
    const run = copyingRun({ centreX: 700, intent: 'review-busy' });
    expect([run.state().behaviour.name, run.state().gesture, run.state().motion.walkDirection]).toEqual(['copy', null, -1]);
    run.runUntil((state) => state.gesture !== null);
    expect(run.state().gesture?.intent).toBe('review-busy');
    expect(Math.abs(run.state().motion.positionX - 700)).toBeLessThanOrEqual(4);
  });

  test('a new intent of the agent changes the gesture', () => {
    const run = copyingRun({ centreX: 750, intent: 'type' });
    run.runUntil((state) => state.gesture !== null);
    run.perceive(agentsCopying({ centreX: 750, intent: 'merge' }));
    expect(run.frame().gesture?.intent).toBe('merge');
  });

  test('a target that is gone, or an intent that is no gesture, ends the copy', () => {
    const run = copyingRun({ centreX: 750, intent: 'type' });
    run.runUntil((state) => state.gesture !== null);
    run.perceive(agentsCopying(null));
    expect([run.frame().behaviour.name, run.state().gesture]).toEqual(['wander', null]);
    const emoting = copyingRun({ centreX: 750, intent: 'happy' });
    expect(emoting.frame().behaviour.name).toBe('wander');
  });
});

test('under reduced motion Flint stands below the row at once', () => {
  const run = copyingRun({ centreX: 700, intent: 'research' }, true);
  expect([run.frame().motion.positionX, run.state().gesture?.intent]).toEqual([700, 'research']);
});

describe('a slot that keeps Flint inside', () => {
  const PIXELS_FOR_ONE_UNIT = 0.75;

  function copyingIn(widthPixels: number, heightPixels: number, intent: GestureIntent) {
    const box = {
      leftX: 700, rightX: 700 + (widthPixels / PIXELS_FOR_ONE_UNIT), topY: 500 - (heightPixels / PIXELS_FOR_ONE_UNIT), floorY: 500
    };
    const slot = habitatOf('slot', box, { keepsFlintInside: true, copyTarget: { centreX: (box.leftX + box.rightX) / 2, intent } });
    const run = createMindRun(undefined, perceptionOf({ habitats: [CHAT, slot] }));
    run.frame({ storedHabitatId: 'slot' });
    run.give('copy');
    const state = run.runUntil((candidate) => candidate.gesture?.intent === intent);
    const { positionX, facing } = state.motion;
    const { extent } = intendedGestureOf(intent).form;
    const drawnEdges = [positionX - (facing * extent.backUnits), positionX + (facing * extent.frontUnits)];
    return { box, positionX, inside: drawnEdges.every((edgeX) => edgeX >= box.leftX && edgeX <= box.rightX) };
  }

  test.each(['ask', 'research', 'type'] as const)('in a strip\'s slot of 60 by 50 pixels all that %s draws stays in', (intent) => {
    expect(copyingIn(60, 50, intent).inside).toBe(true);
  });

  test('in a 100px slot the card fits with Flint in the middle, as before', () => {
    const { box, positionX, inside } = copyingIn(100, 100, 'ask');
    expect(inside).toBe(true);
    expect(Math.abs(positionX - ((box.leftX + box.rightX) / 2))).toBeLessThanOrEqual(4);
  });
});
