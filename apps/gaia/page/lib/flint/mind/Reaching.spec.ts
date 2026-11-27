/**
 * A grab the host aims at an element: Flint turns to it once, the grab target follows the element's centre relative to the bottom tip and
 * mirrored by the facing, an element that is gone gives none, and without a grab the target changes nothing.
 */
import { describe, expect, test } from 'bun:test';

import { HOVER }                       from '../constants/Motion.ts';
import { createMindRun, perceptionOf } from '../testing/MindRun.ts';
import type { PerceivedTarget }        from './Perception.ts';

/** An element of 10 by 10 whose centre is the point given. */
function targetAt(centreX: number, centreY: number): PerceivedTarget {
  return {
    kind: 'on-the-page',
    box:  {
      leftX: centreX - 5, rightX: centreX + 5, topY: centreY - 5, floorY: centreY + 5,
    },
  };
}

describe('the aimed grab', () => {
  test('Flint turns to a target on its left when the grab starts, and aims at it mirrored', () => {
    const run = createMindRun(undefined, perceptionOf({ target: targetAt(960, 640), reducedMotion: true }));
    run.frame();
    run.give('grab');
    const grabbing = run.frame();
    expect(grabbing.motion.facing).toBe(-1);
    expect(grabbing.gesture?.target).toEqual({ x: 40, y: 640 - (700 - HOVER.HEIGHT_UNITS) });
  });

  test('the aim follows a target that moves, and Flint does not turn again', () => {
    const run = createMindRun(undefined, perceptionOf({ target: targetAt(1030, 640), reducedMotion: true }));
    run.frame();
    run.give('grab');
    run.frame();
    const moved = run.frame({ target: targetAt(990, 650) });
    expect(moved.motion.facing).toBe(1);
    expect(moved.gesture?.target?.x).toBe(-10);
  });

  test('a near target is caught and a far one missed', () => {
    const near = createMindRun(undefined, perceptionOf({ target: targetAt(1030, 670) }));
    near.frame();
    near.give('grab');
    near.runFor(300);
    expect(near.state().gesture?.verdict).toBe(true);
    const far = createMindRun(undefined, perceptionOf({ target: targetAt(1090, 600) }));
    far.frame();
    far.give('grab');
    far.runFor(300);
    expect(far.state().gesture?.verdict).toBe(false);
  });

  test('an element that is gone gives the grab no aim', () => {
    const run = createMindRun(undefined, perceptionOf({ target: { kind: 'gone' }, reducedMotion: true }));
    run.frame();
    run.give('grab');
    expect(run.frame().gesture?.target).toBeNull();
  });

  test('without a grab, a target changes nothing', () => {
    const run = createMindRun(undefined, perceptionOf({ target: targetAt(960, 640) }));
    expect(run.frame().motion.facing).toBe(1);
  });
});
