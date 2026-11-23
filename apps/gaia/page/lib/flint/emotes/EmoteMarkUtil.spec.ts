/**
 * What every emote shares. What matters: in its last 160 ms a mark fades out and goes to 60% of its scale, and under reduced motion it
 * only fades; the entrance spring is the spring formula over 200 ms, and a still mark under reduced motion; the hop rises to 6 units
 * at 150 ms and is over at 300 ms.
 */
import { describe, expect, test } from 'bun:test';

import type { EmoteInput } from './EmoteDefinition.ts';
import { EmoteMarkUtil }   from './EmoteMarkUtil.ts';

function inputAt(ageMilliseconds: number, reducedMotion = false): EmoteInput {
  return { ageMilliseconds, facing: 1, reducedMotion };
}

/** The spring formula, written out apart from the implementation. */
function writtenOutSpringAt(progress: number): number {
  return (2 ** (-10 * progress)) * Math.sin(((10 * progress) - 0.75) * 2.094) + 1;
}

describe('the mark\'s exit', () => {
  test('a mark shows whole until the last 160 ms of its emote', () => {
    expect(EmoteMarkUtil.leavingMarkOf('question', inputAt(1340), 1500)).toMatchObject({ opacity: 1, scale: 1.5 });
  });

  test('in the last 160 ms the mark fades out and shrinks towards 60% of its scale', () => {
    const halfway = EmoteMarkUtil.leavingMarkOf('question', inputAt(1420), 1500);
    expect(halfway.opacity).toBeCloseTo(0.5, 6);
    expect(halfway.scale).toBeCloseTo(1.5 * 0.8, 6);
    const ended = EmoteMarkUtil.leavingMarkOf('anger-vein', inputAt(1500), 1500);
    expect(ended.opacity).toBe(0);
    expect(ended.scale).toBeCloseTo(1.05 * 0.6, 6);
  });

  test('under reduced motion the mark fades but keeps its scale', () => {
    expect(EmoteMarkUtil.leavingMarkOf('question', inputAt(1420, true), 1500)).toMatchObject({ opacity: 0.5, scale: 1.5 });
  });
});

describe('the entrance spring', () => {
  test('follows the spring formula over 200 ms', () => {
    for (const ageMilliseconds of [20, 50, 100, 150, 190]) {
      expect(EmoteMarkUtil.entranceSpringOf(inputAt(ageMilliseconds))).toBeCloseTo(writtenOutSpringAt(ageMilliseconds / 200), 9);
    }
  });

  test('starts at nothing and rests at full size', () => {
    expect(EmoteMarkUtil.entranceSpringOf(inputAt(0))).toBe(0);
    expect(EmoteMarkUtil.entranceSpringOf(inputAt(200))).toBe(1);
    expect(EmoteMarkUtil.entranceSpringOf(inputAt(900))).toBe(1);
  });

  test('under reduced motion the mark shows at full size at once', () => {
    expect(EmoteMarkUtil.entranceSpringOf(inputAt(0, true))).toBe(1);
  });
});

describe('the hop', () => {
  test('rises to 6 units halfway through its 300 ms and is over after them', () => {
    expect(EmoteMarkUtil.hopLiftOf(inputAt(150))).toBeCloseTo(6, 9);
    expect(EmoteMarkUtil.hopLiftOf(inputAt(75))).toBeCloseTo(6 * Math.sin(Math.PI / 4), 9);
    expect(EmoteMarkUtil.hopLiftOf(inputAt(300))).toBe(0);
  });

  test('does not happen under reduced motion', () => {
    expect(EmoteMarkUtil.hopLiftOf(inputAt(150, true))).toBe(0);
  });
});
