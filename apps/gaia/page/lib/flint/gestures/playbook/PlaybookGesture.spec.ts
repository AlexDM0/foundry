/**
 * Playbook. What matters: the 4-second loop observes (looks behind, then ahead), shows the
 * closed book, opens it to its spine, points down the four lines with a triangle at (44, line y) for 300 ms each with the read line lit and
 * the eyes following, closes it at once with a hop, acts with the hand of Point while the book fades, and lets the hand go; reduced motion
 * holds the reading of the second line; the part does not depend on the facing, since the book itself is never mirrored.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { PLAYBOOK_GESTURE }  from './PlaybookGesture.ts';

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

const partAt = (elapsedMilliseconds: number, facing: Facing = 1) => PLAYBOOK_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));

test('playbook is one loop that reduced motion holds at 2000', () => {
  expect(PLAYBOOK_GESTURE.intents.playbook).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2000 });
});

describe('the loop', () => {
  test('0 to 500 Flint looks behind, 500 to 1000 ahead, with no hand and no book yet', () => {
    expect(partAt(250).eyes).toEqual({ shift: -4, height: 7 });
    expect(partAt(750).eyes).toEqual({ shift: 7 });
    expect(partAt(750).nearHand).toBeNull();
    expect(partAt(750).props?.playbookBook?.cycleOpacity).toBe(0);
  });

  test('1000 to 1300 the book fades in closed; 1300 to 1500 the cover narrows to its spine', () => {
    expect(partAt(1150).props?.playbookBook).toEqual({
      shown: 1, cycleOpacity: 0.5, coverWidth: 1, readLineIndex: null,
    });
    expect(partAt(1400).props?.playbookBook?.coverWidth).toBeCloseTo(0.5);
    expect(partAt(1500).props?.playbookBook?.coverWidth).toBe(0);
  });

  test('1500 to 2700 a triangle of radius 5, turned 270 degrees, points at each line in turn, 300 ms each; the line is lit', () => {
    const lineYs = [-35, -31, -27, -23];
    lineYs.forEach((lineY, i) => {
      const part = partAt(1500 + (300 * i) + 150);
      expect(part.nearHand).toEqual({
        cornerCount: 3, centreX: 44, centreY: lineY, radius: 5, turnDegrees: 270, placement: 'eased',
      });
      expect(part.props?.playbookBook?.readLineIndex).toBe(i);
      expect(part.eyes).toEqual({ shift: 6, height: 6, lift: -2 + (1.2 * i) });
      expect(part.body).toEqual({ leanDegrees: 5 });
    });
  });

  test('2700 to 2900 the book closes at once and Flint hops by 2 × sin(π × p)', () => {
    const part = partAt(2800);
    expect(part.props?.playbookBook).toMatchObject({ coverWidth: 1, readLineIndex: null, cycleOpacity: 1 });
    expect(part.body?.addedLift).toBeCloseTo(2);
  });

  test('2900 to 3500 Flint acts with the hand of Point while the book fades out; the eyes are 8 high', () => {
    const part = partAt(3200);
    expect(part.nearHand).toMatchObject({
      cornerCount: 3, centreY: -25, radius: 7, turnDegrees: 90,
    });
    expect(part.nearHand?.centreX).toBeCloseTo(29 + (4 * Math.sin(3200 / 220)));
    expect(part.eyes).toMatchObject({ height: 8 });
    expect(part.props?.playbookBook?.cycleOpacity).toBeCloseTo(0.5);
  });

  test('3500 to 4000 the hand goes away', () => {
    expect(partAt(3700).nearHand).toBeNull();
    expect(partAt(3700).props?.playbookBook?.cycleOpacity).toBe(0);
  });

  test('the loop repeats every 4 seconds', () => {
    for (const moment of [250, 1400, 2000, 2800]) expect(partAt(4000 + moment)).toEqual(partAt(moment));
  });
});

test('reduced motion holds the open book with its second line read', () => {
  const part = partAt(PLAYBOOK_GESTURE.intents.playbook.stillMomentMilliseconds);
  expect(part.props?.playbookBook).toMatchObject({ coverWidth: 0, readLineIndex: 1, cycleOpacity: 1 });
});

test('facing left gives the same part: the renderer mirrors the pose and mirrors the book back', () => {
  for (const moment of [250, 2000, 3200]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});
