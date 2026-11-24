/**
 * Copy in the agent panel. What matters: Flint walks below the agent's row and then shows that agent's state with the gesture of its
 * intent; a new intent changes the gesture; a target that is gone, or an intent that is no gesture, ends the copy; under reduced motion
 * Flint stands below the row at once. In a slot that keeps Flint inside, the card of Needs an answer fits: in a slot of 50 by 50 pixels
 * at three quarters of a pixel to a unit Flint stands at the slot's back end facing into it, and in one of 100 pixels in its middle.
 */
import { describe, expect, test } from 'bun:test';

import { BODY_SHAPE }               from '../../constants/BodyShape.ts';
import { ASK_CARD_SHAPE }           from '../../gestures/ask/constants/AskValues.ts';
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
  const HALF_BODY_WIDTH_UNITS = BODY_SHAPE.WIDTH_UNITS / 2;
  const CARD_REACH_UNITS = ASK_CARD_SHAPE.X_UNITS + ASK_CARD_SHAPE.WIDTH_UNITS;

  function askingIn(sidePixels: number) {
    const sideUnits = sidePixels / PIXELS_FOR_ONE_UNIT;
    const box = {
      leftX: 700, rightX: 700 + sideUnits, topY: 500 - sideUnits, floorY: 500
    };
    const slot = habitatOf('slot', box, { keepsFlintInside: true, copyTarget: { centreX: 700 + (sideUnits / 2), intent: 'ask' } });
    const run = createMindRun(undefined, perceptionOf({ habitats: [CHAT, slot] }));
    run.frame({ storedHabitatId: 'slot' });
    run.give('copy');
    const state = run.runUntil((candidate) => candidate.gesture?.intent === 'ask');
    const { positionX, facing } = state.motion;
    const back = positionX - (facing * HALF_BODY_WIDTH_UNITS);
    const cardEdge = positionX + (facing * CARD_REACH_UNITS);
    return { box, positionX, inside: [back, cardEdge].every((edgeX) => edgeX >= box.leftX && edgeX <= box.rightX), };
  }

  test('in a 50px slot the card of Needs an answer fits: Flint stands at the back end and faces into the slot', () => {
    const { box, positionX, inside } = askingIn(50);
    expect(inside).toBe(true);
    expect(Math.min(positionX - box.leftX, box.rightX - positionX)).toBeLessThan(HALF_BODY_WIDTH_UNITS + 1);
  });

  test('in a 100px slot the card fits with Flint in the middle, as before', () => {
    const { box, positionX, inside } = askingIn(100);
    expect(inside).toBe(true);
    expect(Math.abs(positionX - ((box.leftX + box.rightX) / 2))).toBeLessThanOrEqual(4);
  });
});
