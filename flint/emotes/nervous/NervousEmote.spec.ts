/**
 * The Nervous emote. What matters: narrow eyes whose shift darts between 5 and -1 each 170 ms; the shiver of 1.1 × sin(age / 22); bead k
 * starts 230 × k ms in and flies its 690 ms arc on its side (-1, 1, -0.4) with no spring; and under reduced motion the eyes still dart
 * while the body and the beads hold still.
 */
import { describe, expect, test } from 'bun:test';

import type { PosePart }      from '../../SpritePose.ts';
import type { SweatBeadPose } from '../../marks/sweat-beads/SweatBeadsMark.ts';
import { NERVOUS_EMOTE }      from './NervousEmote.ts';


function beadsOf(part: PosePart): readonly SweatBeadPose[] {
  const mark = part.emoteMark;
  return mark?.name === 'sweat-beads' ? mark.details.beads : [];
}

const partAt = (ageMilliseconds: number, reducedMotion = false) => NERVOUS_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion });

describe('the Nervous emote', () => {
  test('narrows its eyes and darts them between 5 and -1 each 170 ms', () => {
    expect([0, 169, 170, 340].map((ageMilliseconds) => partAt(ageMilliseconds).eyes)).toEqual([
      { height: 5, shift: 5 }, { height: 5, shift: 5 }, { height: 5, shift: -1 }, { height: 5, shift: 5 },
    ]);
  });

  test('shivers sideways', () => {
    expect(partAt(100).body?.addedShake).toBeCloseTo(1.1 * Math.sin(100 / 22), 9);
  });

  test('shows the sweat beads at their anchor, with no spring', () => {
    expect(partAt(0).emoteMark).toMatchObject({
      name: 'sweat-beads', anchorX: 0, anchorY: -48, scale: 1.5, innerScaleX: 1, innerScaleY: 1,
    });
  });

  test('a bead shows only from its start', () => {
    expect(beadsOf(partAt(200)).map((bead) => bead.opacity > 0)).toEqual([true, false, false]);
    expect(beadsOf(partAt(461)).map((bead) => bead.opacity > 0)).toEqual([true, true, true]);
  });

  test('a bead flies its arc on its own side', () => {
    const [first, second, third] = beadsOf(partAt(575));
    expect(first?.x).toBeCloseTo(-(6 + (11 * (575 / 690))), 9);
    expect(second).toMatchObject({ turnDegrees: 40 });
    expect(second?.x).toBeCloseTo(6 + 5.5, 9);
    expect(second?.y).toBeCloseTo(-2 - 5.5 + 2.25, 9);
    expect(second?.opacity).toBeCloseTo(0.5, 9);
    expect(third?.turnDegrees).toBeCloseTo(-0.4 * 40, 9);
  });

  test('under reduced motion it does not shiver and the beads hold still', () => {
    const early = partAt(500, true);
    const late = partAt(600, true);
    expect(early.body?.addedShake).toBe(0);
    expect(beadsOf(late)).toEqual(beadsOf(early));
  });
});
