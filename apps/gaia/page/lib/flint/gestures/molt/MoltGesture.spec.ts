/**
 * Molt. What matters: 0 to 900 the body strains (width × (1 + 0.05 × sin(t / 60))), the eyes are
 * 5, the sweat drop shows and five pages spill from the top, one each 150 ms, on their curve and side; at 900 the husk is left and the
 * bright tint 0.7 is set at once; the hop of 10 runs to 1400 and the husk moves down by it, so it stays on the screen; the husk falls to
 * (-14, 8), -25 degrees and opacity 0 by 2100; 1300 to 2000 the tint and the glow (0.5) go out in a straight line and the eyes are 10,
 * then 8; the glints show 1400 to 2200 with their spring; happy eyes from 1500, the still moment. The part does not depend on the facing.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { MOLT_GESTURE }      from './MoltGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number) => MOLT_GESTURE.targetPose(inputAt(elapsedMilliseconds));

describe('the strain, 0 to 900', () => {
  test('the body strains in width, the eyes are 5, and the sweat drop grows in from 60% and slides down', () => {
    const part = partAt(50);
    expect(part.body?.widthFactor).toBeCloseTo(1 + (0.05 * Math.sin(50 / 60)), 9);
    expect(part.eyes).toEqual({ height: 5 });
    expect(part.emoteMark).toMatchObject({
      name: 'sweat-drop', innerScaleX: 0.8, innerScaleY: 0.8, opacity: 1
    });
    expect(partAt(650).emoteMark?.anchorY).toBeCloseTo(-48 + 4.5, 9);
  });

  test('the sweat drop fades in its last 160 ms', () => {
    expect(partAt(820).emoteMark?.opacity).toBeCloseTo(0.5, 9);
    expect(partAt(900).emoteMark).toBeNull();
  });

  test('page n leaves the top at 150n, its side +1, -1 in turn, on its curve, opaque until 0.7 of its flight', () => {
    const pages = partAt(400).props?.spilledPages?.pages ?? [];
    expect(pages[0]?.x).toBeCloseTo(4 + (14 * (4 / 7)), 9);
    expect(pages[0]?.y).toBeCloseTo(-50 - (16 * (4 / 7)) + (34 * (4 / 7) ** 2), 9);
    expect(pages[0]?.turnDegrees).toBeCloseTo(200 * (4 / 7), 9);
    expect(pages[0]?.opacity).toBe(1);
    expect(pages[1]?.x).toBeCloseTo(-(4 + (14 * (5 / 14))), 9);
    expect(pages[4]?.opacity).toBe(0);
    expect(partAt(1150).props?.spilledPages?.pages[4]?.opacity).toBeCloseTo(1 - ((0.785714 - 0.7) / 0.3), 4);
    expect(partAt(1300).props?.spilledPages).toBeUndefined();
  });
});

describe('the shed, from 900', () => {
  test('at 900 the husk is where the body is, and the bright tint of 0.7 is set at once', () => {
    const part = partAt(900);
    expect(part.props?.moltHusk).toEqual({
      shown: 1, offsetX: -0, offsetY: 0, turnDegrees: -0, opacity: 0.9,
    });
    expect(part.body?.tint).toEqual({ role: 'emberLight', amount: 0.7 });
    expect(part.exactFields).toEqual(['tint']);
    expect(part.body?.widthFactor).toBeUndefined();
  });

  test('the hop of 10 peaks at 1150, and the husk moves down by it so that only Flint hops', () => {
    const part = partAt(1150);
    expect(part.body?.addedLift).toBeCloseTo(10, 9);
    const fallen = 250 / 1200;
    expect(part.props?.moltHusk?.offsetY).toBeCloseTo((8 * fallen) + 10, 9);
    expect(partAt(1400).body?.addedLift).toBe(0);
  });

  test('the husk falls behind to (-14, 8), turns to -25 degrees and fades out by 2100', () => {
    expect(partAt(1500).props?.moltHusk).toMatchObject({ offsetX: -7, offsetY: 4, turnDegrees: -12.5 });
    expect(partAt(1500).props?.moltHusk?.opacity).toBeCloseTo(0.45, 9);
    expect(partAt(2100).props?.moltHusk).toBeUndefined();
  });

  test('1300 to 2000 the tint and the inner glow go out in a straight line; the eyes are 10, then 8', () => {
    expect(partAt(1650).body?.tint?.amount).toBeCloseTo(0.35, 9);
    expect(partAt(1650).sleep?.glowOpacity).toBeCloseTo(0.25, 9);
    expect(partAt(1300).sleep?.glowOpacity).toBe(0.5);
    expect(partAt(1200).sleep).toBeUndefined();
    expect(partAt(2000).body?.tint).toBeUndefined();
    expect(partAt(1400).eyes).toEqual({ height: 10 });
    expect(partAt(1700).eyes).toEqual({ height: 8, happiness: 1 });
  });

  test('the glints show from 1400 to 2200 with their spring on the width; happy eyes from 1500', () => {
    expect(partAt(1350).emoteMark).toBeNull();
    expect(partAt(1500).emoteMark).toMatchObject({ name: 'happy-glints', opacity: 1 });
    expect(partAt(1400).emoteMark?.innerScaleX).toBe(0);
    expect(partAt(2120).emoteMark?.opacity).toBeCloseTo(0.5, 9);
    expect(partAt(2200).emoteMark).toBeNull();
    expect(partAt(1499).eyes?.happiness).toBeUndefined();
  });
});

test('one action of 3000 ms; reduced motion holds 1500; the part does not depend on the facing', () => {
  expect(MOLT_GESTURE.intents.molt).toEqual({ variant: 'normal', durationMilliseconds: 3000, stillMomentMilliseconds: 1500 });
  expect(MOLT_GESTURE.targetPose(inputAt(1500, -1))).toEqual(partAt(1500));
});
