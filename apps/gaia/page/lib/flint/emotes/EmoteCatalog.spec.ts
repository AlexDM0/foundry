/**
 * The emote catalog. What matters: every emote has a name of its own and shows for its time; every
 * emote gives a mark at every age, so its mark hides a gesture's anger vein or "Hi!"; and under reduced motion no emote moves the body.
 */
import { describe, expect, test } from 'bun:test';

import { composedTargetPose }            from '../PoseComposition.ts';
import { NEUTRAL_POSE, emoteMarkAtRest } from '../SpritePose.ts';
import { EMOTE_CATALOG, EMOTE_NAMES }    from './EmoteCatalog.ts';

const AGE_STEP_MILLISECONDS = 50;

function agesOf(durationMilliseconds: number): number[] {
  return Array.from({ length: Math.floor(durationMilliseconds / AGE_STEP_MILLISECONDS) }, (_unused, i) => i * AGE_STEP_MILLISECONDS);
}

describe('the catalog', () => {
  test('no two emotes share a name', () => {
    expect(new Set(EMOTE_NAMES).size).toBe(EMOTE_CATALOG.length);
  });

  test('each emote shows for its own time', () => {
    expect(Object.fromEntries(EMOTE_CATALOG.map((emote) => [emote.name, emote.durationMilliseconds]))).toMatchObject({
      annoyed: 1500, sweatdrop: 1500, surprised: 1100, doubt: 1500, thinking: 2400, idea: 1600, happy: 1300, nervous: 2100,
    });
  });
});

describe('every emote', () => {
  test('hides the anger vein and the "Hi!" of a gesture for as long as it shows', () => {
    for (const emote of EMOTE_CATALOG) {
      for (const gestureMark of [emoteMarkAtRest('anger-vein'), emoteMarkAtRest('greeting')]) {
        for (const ageMilliseconds of agesOf(emote.durationMilliseconds)) {
          const emotePart = emote.targetPose({ ageMilliseconds, facing: 1, reducedMotion: false });
          const pose = composedTargetPose({
            base: NEUTRAL_POSE, gesture: () => ({ emoteMark: gestureMark }), emote: () => emotePart, sleep: () => null, attendants: [], reducedMotion: false,
          });
          expect(emotePart.emoteMark).toBeObject();
          expect(pose.emoteMark).toBe(emotePart.emoteMark ?? null);
        }
      }
    }
  });

  test('under reduced motion moves the body no more than the layers below', () => {
    for (const emote of EMOTE_CATALOG) {
      const { name } = emote;
      for (const ageMilliseconds of agesOf(emote.durationMilliseconds)) {
        const body = emote.targetPose({ ageMilliseconds, facing: 1, reducedMotion: true }).body ?? {};
        expect({ name, lift: body.addedLift ?? 0, shake: body.addedShake ?? 0 }).toEqual({ name, lift: 0, shake: 0 });
      }
    }
  });
});
