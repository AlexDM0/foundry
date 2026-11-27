/**
 * The host's steering, as the playground's keys. What matters: a held walk moves Flint along its floor and turns it until `stop-walking`,
 * and stops at the end of the floor; a walk ends a gesture that does not go on while walking; a jump leaves the floor, except under reduced
 * motion; a turn changes only the facing; `rest` ends the gesture; steering wakes a sleeping Flint; and a visit or a drag ignores it.
 */
import { describe, expect, test } from 'bun:test';

import type { FlintSteering }      from '../SpriteHabitat.ts';
import { createMindRun, HOME_BOX } from '../testing/MindRun.ts';
import { JumpMotionUtil }          from '../utils/JumpMotionUtil.ts';
import type { SpriteMindState }    from './MindState.ts';
import { mindStateSteered }        from './Steering.ts';

function steered(run: ReturnType<typeof createMindRun>, steering: FlintSteering, reducedMotion = false): void {
  run.change((state: SpriteMindState) => mindStateSteered(state, steering, run.elapsedMilliseconds(), reducedMotion));
}

describe('walking', () => {
  test('a held walk moves Flint left along its floor, facing left, until it stops walking', () => {
    const run = createMindRun();
    run.frame();
    steered(run, 'walk-left');
    run.runFor(200);
    expect(run.state().motion).toMatchObject({ facing: -1, walkDirection: -1 });
    expect(run.state().motion.positionX).toBeLessThan(1000);
    steered(run, 'stop-walking');
    const stoppedX = run.frame().motion.positionX;
    expect(run.frame().motion.positionX).toBe(stoppedX);
    expect(run.state().motion.walkDirection).toBe(0);
  });

  test('a held walk stops at the end of the floor, half a body inside it', () => {
    const run = createMindRun();
    run.frame();
    steered(run, 'walk-right');
    run.runFor(3000);
    expect(run.state().motion.positionX).toBe(HOME_BOX.rightX - 20);
  });

  test('a walk ends the typing gesture and keeps the pointing one', () => {
    const typing = createMindRun();
    typing.frame();
    typing.give('type');
    typing.frame();
    steered(typing, 'walk-right');
    expect(typing.frame().gesture).toBeNull();
    const pointing = createMindRun();
    pointing.frame();
    pointing.give('point');
    pointing.frame();
    steered(pointing, 'walk-right');
    expect(pointing.frame().gesture?.intent).toBe('point');
  });
});

describe('jump, turn and rest', () => {
  test('a jump leaves the floor', () => {
    const run = createMindRun();
    run.frame();
    steered(run, 'jump');
    expect(JumpMotionUtil.isAirborne(run.frame().motion.jump)).toBe(true);
  });

  test('under reduced motion, a jump is ignored and Flint stays on its floor', () => {
    const run = createMindRun();
    run.frame();
    steered(run, 'jump', true);
    expect(JumpMotionUtil.isAirborne(run.frame().motion.jump)).toBe(false);
  });

  test('a turn changes the facing and not the place', () => {
    const run = createMindRun();
    const placedX = run.frame().motion.positionX;
    steered(run, 'face-left');
    expect(run.frame().motion).toMatchObject({ facing: -1, positionX: placedX, walkDirection: 0 });
  });

  test('rest ends the gesture', () => {
    const run = createMindRun();
    run.frame();
    run.give('review-angry');
    run.frame();
    steered(run, 'rest');
    expect(run.frame().gesture).toBeNull();
  });

  test('steering wakes a sleeping Flint, which wanders again', () => {
    const run = createMindRun();
    run.frame();
    run.give('sleep');
    run.runFor(3000);
    steered(run, 'face-left');
    expect([run.frame().behaviour.name, run.state().sleep.phase]).toEqual(['wander', 'waking']);
  });

  test('a drag ignores steering', () => {
    const run = createMindRun();
    run.frame({ pointer: { x: 1000, y: 650, hasMoved: true } });
    run.frame({ happenings: [{ kind: 'drag-started' }], pointer: { x: 1000, y: 650, hasMoved: true } });
    const carried = run.state();
    steered(run, 'walk-left');
    expect(run.state()).toBe(carried);
  });
});
