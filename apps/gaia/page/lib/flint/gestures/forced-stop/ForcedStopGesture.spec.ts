/**
 * Forced stop. What matters: the props fade in by 300 and out from 1500; the spark bobs by
 * 2 × sin(t / 300); 300 to 600 a pentagon of 6 eases to the plug at (38, -12), eye lift 3; 600 to 750 the hand and the plug move in a
 * straight line to the plug's place (28, -14), set exactly, the cable goes slack and two small sparks fly from the socket for 200 ms;
 * 750 to 1200 the spark dies (grey, scale 0, 6 down), eyes 5 and lift -2; 1200 on Flint looks at the plug, lift 2; never happy eyes.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }         from '../../SpriteGeometry.ts';
import type { GestureInput }   from '../GestureDefinition.ts';
import { FORCED_STOP_GESTURE } from './ForcedStopGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => FORCED_STOP_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('the pull', () => {
  test('0 to 300 the props fade in with the plug in its socket; no hand; the spark bobs', () => {
    const part = partAt(150);
    expect(part.nearHand).toBeNull();
    expect(part.props?.forcedStopPlug).toEqual({
      shown: 1, plugX: 40, plugY: -14, cableSlack: 0, socketSparkFlight: -2.25, fade: 0.5,
    });
    expect(part.props?.dyingSpark?.offsetY).toBeCloseTo(2 * Math.sin(150 / 300), 9);
  });

  test('300 to 600 a pentagon of 6 eases to the plug at (38, -12); eye lift 3', () => {
    const part = partAt(450);
    expect(part.nearHand).toEqual({
      cornerCount: 5, centreX: 38, centreY: -12, radius: 6, turnDegrees: 0, placement: 'eased',
    });
    expect(part.eyes).toEqual({ shift: 6, lift: 3 });
  });

  test('600 to 750 the hand and the plug move as one to (28, -14), set exactly; the cable goes slack', () => {
    const halfway = partAt(675);
    expect(halfway.props?.forcedStopPlug).toMatchObject({ plugX: 34, plugY: -14, cableSlack: 0.5 });
    expect(halfway.nearHand).toMatchObject({ centreX: 32, centreY: -12, placement: 'exact-position' });
    expect(partAt(1000).props?.forcedStopPlug).toMatchObject({ plugX: 28, cableSlack: 1 });
    expect(partAt(1000).nearHand).toMatchObject({ centreX: 26, centreY: -12 });
  });

  test('two small sparks fly from the socket for 200 ms from the pull', () => {
    expect(partAt(700).props?.forcedStopPlug?.socketSparkFlight).toBeCloseTo(0.5, 9);
    expect(partAt(800).props?.forcedStopPlug?.socketSparkFlight).toBe(1);
  });
});

describe('the spark dies', () => {
  test('750 to 1200 it goes grey and small and falls 6; the eyes are 5 and look up', () => {
    const part = partAt(975);
    expect(part.props?.dyingSpark?.death).toBeCloseTo(0.5, 9);
    expect(part.props?.dyingSpark?.offsetY).toBeCloseTo((2 * Math.sin(975 / 300)) + 3, 9);
    expect(part.eyes).toEqual({ shift: 6, height: 5, lift: -2 });
  });

  test('1200 on Flint looks at the plug; from 1500 the props fade and the hand goes; never happy eyes', () => {
    expect(partAt(1300).eyes).toEqual({ shift: 6, height: 5, lift: 2 });
    expect(partAt(1650).props?.forcedStopPlug?.fade).toBeCloseTo(0.5, 9);
    expect(partAt(1650).nearHand).toBeNull();
    expect([0, 450, 900, 1300, 1700].every((moment) => partAt(moment).eyes?.happiness === undefined)).toBe(true);
  });
});

test('one action of 1800 ms; reduced motion holds 900; the part does not depend on the facing', () => {
  expect(FORCED_STOP_GESTURE.intents['forced-stop']).toEqual({ variant: 'normal', durationMilliseconds: 1800, stillMomentMilliseconds: 900 });
  expect(FORCED_STOP_GESTURE.targetPose(inputAt(900, -1))).toEqual(partAt(900));
});
