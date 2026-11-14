/**
 * Cursor play after a click. What matters: Flint walks to the pointer along its floor, jumps when the pointer is high above it, grabs when
 * the pointer is near, and aims the grab at the pointer; it shows the Doubt emote and stops when the pointer leaves the component or
 * stands still for three seconds; under reduced motion it neither walks nor jumps.
 */
import { describe, expect, test } from 'bun:test';

import type { PerceivedPointer }       from '../mind/Perception.ts';
import { createMindRun, perceptionOf } from '../testing/MindRun.ts';
import { JumpMotionUtil }              from '../utils/JumpMotionUtil.ts';

function playingWith(pointer: PerceivedPointer, reducedMotion = false): ReturnType<typeof createMindRun> {
  const run = createMindRun(undefined, perceptionOf({ pointer, reducedMotion }));
  run.frame();
  run.frame({ happenings: [{ kind: 'clicked' }] });
  return run;
}

describe('the play', () => {
  test('Flint walks to the pointer along its floor and stops near it', () => {
    const run = playingWith({ x: 1080, y: 660, hasMoved: true });
    expect([run.state().behaviour.name, run.frame().motion.walkDirection]).toEqual(['cursor-play', 1]);
    run.runFor(1000);
    expect(run.state().motion.positionX).toBeGreaterThanOrEqual(1080 - 24);
  });

  test('a near pointer is grabbed, with the grab aimed at it', () => {
    const run = playingWith({ x: 1010, y: 660, hasMoved: true });
    const grab = run.frame().gesture;
    expect(grab?.name).toBe('grab');
    expect(grab?.target?.x).toBeCloseTo(10, 5);
  });

  test('a pointer high above Flint makes it jump', () => {
    const run = playingWith({ x: 1000, y: 610, hasMoved: true });
    expect(JumpMotionUtil.isAirborne(run.frame().motion.jump)).toBe(true);
  });
});

describe('the end of the play', () => {
  test('a pointer that leaves the component ends the play with the Doubt emote', () => {
    const run = playingWith({ x: 1010, y: 660, hasMoved: true });
    run.frame({ pointer: { x: 400, y: 300, hasMoved: true } });
    expect([run.state().behaviour.name, run.state().emote?.name]).toEqual(['wander', 'doubt']);
  });

  test('a pointer that stands still for three seconds ends the play with the Doubt emote', () => {
    const run = playingWith({ x: 1060, y: 610, hasMoved: false });
    run.runFor(2900);
    expect(run.state().behaviour.name).toBe('cursor-play');
    run.runFor(200);
    expect([run.state().behaviour.name, run.state().emote?.name]).toEqual(['wander', 'doubt']);
  });
});

test('under reduced motion Flint only turns to the pointer: it neither walks nor jumps', () => {
  const run = playingWith({ x: 1080, y: 610, hasMoved: true }, true);
  run.runFor(500);
  expect([run.state().motion.positionX, run.state().motion.facing, JumpMotionUtil.isAirborne(run.state().motion.jump)]).toEqual([1000, 1, false]);
});
