/**
 * The carried pose. What matters: while the drag goes on, Flint shows the eyes, the shiver and the sweat beads of the Nervous emote, and
 * the beads go on flying and never fade out, also long after the Nervous emote would have ended.
 */
import { describe, expect, test } from 'bun:test';

import type { PosePart }      from '../../SpritePose.ts';
import type { SweatBeadPose } from '../../marks/sweat-beads/SweatBeadsMark.ts';
import { carriedPartOf }      from './CarriedPose.ts';
import { NERVOUS_EMOTE }      from './NervousEmote.ts';


function beadsOf(part: PosePart): readonly SweatBeadPose[] {
  const mark = part.emoteMark;
  return mark?.name === 'sweat-beads' ? mark.details.beads : [];
}

describe('the carried pose', () => {
  test('shows the eyes and the shiver of the Nervous emote', () => {
    const carried = carriedPartOf({ carriedMilliseconds: 400, facing: -1, reducedMotion: false });
    const nervous = NERVOUS_EMOTE.targetPose({ ageMilliseconds: 400, facing: -1, reducedMotion: false });
    expect(carried.eyes).toEqual(nervous.eyes ?? {});
    expect(carried.body).toEqual(nervous.body ?? {});
    expect(beadsOf(carried)).toEqual(beadsOf(nervous));
  });

  test('its beads never fade out while the drag goes on', () => {
    const mark = carriedPartOf({ carriedMilliseconds: 9000, facing: 1, reducedMotion: false }).emoteMark;
    expect(mark).toMatchObject({ name: 'sweat-beads', opacity: 1, scale: 1.5 });
    expect(mark?.name === 'sweat-beads' && mark.details.beads.some((bead) => bead.opacity > 0)).toBe(true);
  });
});
