/** The Happy emote. What matters: the happy eyes; two bounces of 4 units in the first 600 ms; two glints that spring in on the width. */
import { describe, expect, test } from 'bun:test';

import { HAPPY_EMOTE } from './HappyEmote.ts';

const partAt = (ageMilliseconds: number, reducedMotion = false) => HAPPY_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion });

describe('the Happy emote', () => {
  test('shows the happy eyes', () => {
    expect(partAt(500).eyes).toEqual({ happiness: 1 });
  });

  test('bounces twice in the first 600 ms', () => {
    expect([150, 450].map((ageMilliseconds) => partAt(ageMilliseconds).body?.addedLift)).toEqual([4, 4]);
    expect(partAt(300).body?.addedLift).toBeCloseTo(0, 9);
    expect(partAt(600).body?.addedLift).toBe(0);
    expect(partAt(150, true).body?.addedLift).toBe(0);
  });

  test('shows the glints, springing in on the width only', () => {
    expect(partAt(200).emoteMark).toMatchObject({ name: 'happy-glints', innerScaleX: 1, innerScaleY: 1 });
    expect(partAt(0).emoteMark).toMatchObject({ innerScaleX: 0, innerScaleY: 1 });
  });
});
