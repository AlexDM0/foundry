/**
 * The carried pose. What matters: while the drag goes on, Flint shows the eyes, the shiver and the sweat beads of the Nervous emote, and
 * the beads go on flying and never fade out, also long after the Nervous emote would have ended.
 */
import { describe, expect, test } from 'bun:test';

import { carriedPartOf } from './CarriedPose.ts';
import { NERVOUS_EMOTE } from './NervousEmote.ts';

describe('the carried pose', () => {
  test('shows the eyes and the shiver of the Nervous emote', () => {
    const carried = carriedPartOf({ carriedMilliseconds: 400, facing: -1, reducedMotion: false });
    const nervous = NERVOUS_EMOTE.targetPose({ ageMilliseconds: 400, facing: -1, reducedMotion: false });
    expect(carried.eyes).toEqual(nervous.eyes ?? {});
    expect(carried.body).toEqual(nervous.body ?? {});
    expect(carried.emoteMark?.sweatBeads).toEqual(nervous.emoteMark?.sweatBeads ?? []);
  });

  test('its beads never fade out while the drag goes on', () => {
    const mark = carriedPartOf({ carriedMilliseconds: 9000, facing: 1, reducedMotion: false }).emoteMark;
    expect(mark).toMatchObject({ name: 'sweat-beads', opacity: 1, scale: 1.5 });
    expect(mark?.sweatBeads.some((bead) => bead.opacity > 0)).toBe(true);
  });
});
