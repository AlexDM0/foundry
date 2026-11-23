/**
 * Ribbon. What matters: the wrapping hexagon is 4.5 on the side by the body, so it never touches it; the
 * sheets fade in apart; two pentagons (near radius 6, far 5.4) push them together by 900 and end at (50, -30) and (26, -30); the far hand
 * goes and a hexagon goes once around the ellipse of 13 by 9 around (38, -30) while the ribbon grows to its full width by 1700; the bow
 * springs in from 1700; no hand and happy eyes from 2000; the bundle leaves by (14, -6) from 2800 to 3400; reduced motion holds the tied
 * bundle.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { PosePart }     from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { RIBBON_GESTURE }    from './RibbonGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): PosePart {
  const input: GestureInput = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return RIBBON_GESTURE.targetPose(input);
}

describe('the loop of 4000 ms', () => {
  test('0 to 300: the sheets fade in apart, with no hands', () => {
    expect(partAt(150).props?.ribbonBundle).toMatchObject({
      shown: 1, cycleOpacity: 0.5, gathered: 0, wrapped: 0, bowScale: 0, offsetX: 0,
    });
    expect([partAt(150).nearHand, partAt(150).farHand]).toEqual([null, null]);
  });

  test('300 to 900: two pentagons push the sheets together, coming in with the outer sheets to (50, -30) and (26, -30)', () => {
    const part = partAt(600);
    expect(part.props?.ribbonBundle?.gathered).toBe(0.5);
    expect(part.nearHand).toEqual({
      cornerCount: 5, centreX: 52, centreY: -30, radius: 6, turnDegrees: 0, placement: 'eased',
    });
    expect(part.farHand).toMatchObject({
      cornerCount: 5, centreX: 24, centreY: -30, radius: 5.4
    });
    expect(partAt(899).nearHand?.centreX).toBeCloseTo(50, 1);
  });

  test('900 to 1700: the far hand goes, and a hexagon goes once around the bundle, over the top first, as the ribbon grows', () => {
    expect(partAt(900).farHand).toBeNull();
    expect(partAt(900).nearHand).toMatchObject({
      cornerCount: 6, radius: 5.5, centreX: 51, centreY: -30
    });
    const quarter = partAt(1100);
    expect(quarter.nearHand?.centreX).toBeCloseTo(38);
    expect(quarter.nearHand?.centreY).toBeCloseTo(-39);
    expect(partAt(1300).nearHand?.centreX).toBeCloseTo(25);
    expect(partAt(1300).nearHand?.radius).toBeCloseTo(4.5);
    expect(quarter.nearHand?.radius).toBeCloseTo(5.5);
    expect(quarter.props?.ribbonBundle?.wrapped).toBe(0.25);
  });

  test('1700 to 2000: the bow shows with the spring of an emote mark, the ribbon full', () => {
    expect(partAt(1700).props?.ribbonBundle).toMatchObject({ wrapped: 1, bowScale: 0 });
    expect(partAt(1740).props?.ribbonBundle?.bowScale).toBeGreaterThan(1);
    expect(partAt(1950).props?.ribbonBundle?.bowScale).toBe(1);
  });

  test('2000 to 2800: the hand goes away, and the happy eyes show', () => {
    expect(partAt(2000).nearHand).toBeNull();
    expect(partAt(2000).eyes).toEqual({ shift: 6, height: 6, happiness: 1 });
    expect(partAt(1999).eyes?.happiness).toBeUndefined();
  });

  test('2800 to 3400: the bundle moves by (14, -6) and fades out, then nothing shows until the loop starts again', () => {
    expect(partAt(3100).props?.ribbonBundle).toMatchObject({ offsetX: 7, offsetY: -3, cycleOpacity: 0.5 });
    expect(partAt(3700).props?.ribbonBundle?.cycleOpacity).toBe(0);
    expect(partAt(3100).eyes?.happiness).toBeUndefined();
  });

  test('the loop repeats', () => {
    expect(partAt(4000 + 1100)).toEqual(partAt(1100));
  });
});

test('reduced motion holds the tied bundle with its bow and the happy eyes', () => {
  expect(RIBBON_GESTURE.intents.ribbon).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2300 });
  expect(partAt(2300).props?.ribbonBundle).toMatchObject({
    gathered: 1, wrapped: 1, bowScale: 1, offsetX: 0
  });
  expect(partAt(2300).eyes?.happiness).toBe(1);
});

test('facing left the part is the same: the bundle mirrors with Flint', () => {
  expect(partAt(1100, -1)).toEqual(partAt(1100, 1));
});
