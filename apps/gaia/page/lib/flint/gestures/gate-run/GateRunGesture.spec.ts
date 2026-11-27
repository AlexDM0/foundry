/**
 * Gate run. What matters: the rail fades in over 300 ms with all lamps off; lamp n runs from 300 + 650n to 950 + 650n and is passed after
 * it, while the eyes follow it (shift 4 + n, height 6); at 2900 all are passed, the tick shows and the eyes are happy until 3700; from 3700
 * the rail and the tick fade out, in a cycle of 4200; no hands, lean 5. Reduced motion holds 3200.
 */
import { describe, expect, test } from 'bun:test';

import type { GestureInput } from '../GestureDefinition.ts';
import { GATE_RUN_GESTURE }  from './GateRunGesture.ts';

function inputAt(elapsedMilliseconds: number): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing: 1, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => GATE_RUN_GESTURE.targetPose(inputAt(elapsedMilliseconds));

test('no hands, and the body leans 5', () => {
  const part = partAt(1000);
  expect([part.nearHand, part.farHand, part.body?.leanDegrees]).toEqual([null, null, 5]);
});

test('the rail fades in over 300 ms with all lamps off', () => {
  expect(partAt(150).props?.gateRail).toMatchObject({ opacity: 0.5, lampStates: ['off', 'off', 'off', 'off'], tickOpacity: 0, });
});

describe('the lamps', () => {
  test('lamp n runs from 300 + 650n for 650 ms and is passed after it', () => {
    expect(partAt(400).props?.gateRail?.lampStates).toEqual(['running', 'off', 'off', 'off']);
    expect(partAt(1000).props?.gateRail?.lampStates).toEqual(['passed', 'running', 'off', 'off']);
    expect(partAt(1700).props?.gateRail?.lampStates).toEqual(['passed', 'passed', 'running', 'off']);
    expect(partAt(2300).props?.gateRail?.lampStates).toEqual(['passed', 'passed', 'passed', 'running']);
    expect(partAt(2900).props?.gateRail?.lampStates).toEqual(['passed', 'passed', 'passed', 'passed']);
  });

  test('the eyes follow the lamp that runs: shift 4 + n, height 6', () => {
    expect([400, 1000, 1700, 2300].map((elapsedMilliseconds) => partAt(elapsedMilliseconds).eyes)).toEqual([
      { shift: 4, height: 6 },
      { shift: 5, height: 6 },
      { shift: 6, height: 6 },
      { shift: 7, height: 6 },
    ]);
  });

  test('a running lamp pulses with the gesture time', () => {
    expect(partAt(1234).props?.gateRail?.pulseMilliseconds).toBe(1234);
  });
});

describe('the pass', () => {
  test('from 2900 the tick shows and the eyes are happy until 3700', () => {
    expect(partAt(2899).props?.gateRail?.tickOpacity).toBe(0);
    expect(partAt(3200).props?.gateRail?.tickOpacity).toBe(1);
    expect(partAt(3200).eyes?.happiness).toBe(1);
    expect(partAt(3800).eyes?.happiness).toBeUndefined();
  });

  test('from 3700 the rail and the tick fade out; the next cycle starts with all lamps off', () => {
    expect(partAt(3950).props?.gateRail?.opacity).toBeCloseTo(0.5);
    expect(partAt(4200 + 100).props?.gateRail?.lampStates).toEqual(['off', 'off', 'off', 'off']);
  });
});

test('it loops, and reduced motion holds the passed lamps, the tick and the happy eyes', () => {
  const form = GATE_RUN_GESTURE.intents['gate-run'];
  expect([form.variant, form.durationMilliseconds, form.stillMomentMilliseconds]).toEqual(['normal', null, 3200]);
});
