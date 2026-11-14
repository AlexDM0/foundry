/**
 * Copy in the agent panel. What matters: Flint walks below the agent's row and then shows that agent's state with the gesture of its
 * intent; a new intent changes the gesture; a target that is gone, or an intent that is no gesture, ends the copy; under reduced motion
 * Flint stands below the row at once.
 */
import { describe, expect, test } from 'bun:test';

import type { PerceivedCopyTarget } from '../../mind/Perception.ts';
import {
  AGENTS,
  CHAT,
  createMindRun,
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
