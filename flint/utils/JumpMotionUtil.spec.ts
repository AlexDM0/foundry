/**
 * The jump against `02-animations.md`: 520 units per second up against a gravity of 1400 tops out near 97 units; the body stretches to
 * 0.94 by 1.07 with eyes 9 high in the air, and lands squashed to 1.14 by 0.82, back to normal in 180 ms. A jump starts only from the floor.
 */
import { describe, expect, test } from 'bun:test';

import type { JumpState }           from './JumpMotionUtil.ts';
import { GROUNDED, JumpMotionUtil } from './JumpMotionUtil.ts';

function flightOf(stepMilliseconds: number): JumpState[] {
  const states: JumpState[] = [];
  let state = JumpMotionUtil.launched(GROUNDED);
  for (let i = 0; i < 2000 && (i === 0 || JumpMotionUtil.isAirborne(state)); i++) {
    state = JumpMotionUtil.advanced(state, stepMilliseconds);
    states.push(state);
  }
  return states;
}

describe('the flight', () => {
  test('tops out at about 97 units and lands with the squash running', () => {
    const flight = flightOf(1);
    expect(Math.max(...flight.map((state) => state.height))).toBeCloseTo(97, 0);
    expect(flight.at(-1)).toEqual({ height: 0, upwardSpeed: 0, landingRemainingMilliseconds: 180 });
  });

  test('a jump asked for in the air changes nothing', () => {
    const airborne = JumpMotionUtil.advanced(JumpMotionUtil.launched(GROUNDED), 100);
    expect(JumpMotionUtil.launched(airborne)).toBe(airborne);
  });
});

describe('the body', () => {
  test('in the air it stretches to 0.94 by 1.07 with the eyes 9 high', () => {
    const airborne = JumpMotionUtil.advanced(JumpMotionUtil.launched(GROUNDED), 100);
    expect(JumpMotionUtil.bodyPartOf(airborne)).toEqual({ body: { widthFactor: 0.94, heightFactor: 1.07 }, eyes: { height: 9 } });
  });

  test('on landing it squashes to 1.14 by 0.82 and is back to normal 180 ms later', () => {
    const landed: JumpState = { height: 0, upwardSpeed: 0, landingRemainingMilliseconds: 180 };
    expect(JumpMotionUtil.bodyPartOf(landed)).toEqual({ body: { widthFactor: 1.14, heightFactor: 0.82 } });
    const halfway = JumpMotionUtil.bodyPartOf(JumpMotionUtil.advanced(landed, 90));
    expect(halfway?.body?.widthFactor).toBeCloseTo(1.07);
    expect(halfway?.body?.heightFactor).toBeCloseTo(0.91);
    expect(JumpMotionUtil.bodyPartOf(JumpMotionUtil.advanced(landed, 180))).toBeNull();
  });
});
