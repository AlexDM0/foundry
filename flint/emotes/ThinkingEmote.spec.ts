/** The Thinking emote. What matters: the eyes look up (lift -3, shift 4); the dots show at 150, 650 and 1150 ms with no spring. */
import { describe, expect, test } from 'bun:test';

import { THINKING_EMOTE } from './ThinkingEmote.ts';

const partAt = (ageMilliseconds: number) => THINKING_EMOTE.targetPose({ ageMilliseconds, facing: 1, reducedMotion: false });

describe('the Thinking emote', () => {
  test('looks up', () => {
    expect(partAt(500).eyes).toEqual({ lift: -3, shift: 4 });
  });

  test('shows the dots one after another at 150, 650 and 1150 ms', () => {
    const dotsAt = (ageMilliseconds: number) => partAt(ageMilliseconds).emoteMark?.thinkingDotsShown;
    expect([0, 150, 151, 650, 651, 1150, 1151, 2300].map(dotsAt)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  test('the dots do not spring', () => {
    expect(partAt(0).emoteMark).toMatchObject({ name: 'thinking-dots', innerScaleX: 1, innerScaleY: 1 });
  });
});
