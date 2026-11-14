/**
 * The emote catalog. What matters: every emote is listed under its own name and shows for its time of `02-animations.md`, "Emotes"; every
 * emote gives a mark at every age, so its mark hides a gesture's anger vein or "Hi!"; and under reduced motion no emote moves the body.
 */
import { describe, expect, test } from 'bun:test';

import { composedTargetPose }            from '../PoseComposition.ts';
import { emoteMarkAtRest, NEUTRAL_POSE } from '../SpritePose.ts';
import { EMOTE_CATALOG }                 from './EmoteCatalog.ts';
import { EMOTE_NAMES }                   from './EmoteDefinition.ts';

const AGE_STEP_MILLISECONDS = 50;

function agesOf(durationMilliseconds: number): number[] {
  return Array.from({ length: Math.floor(durationMilliseconds / AGE_STEP_MILLISECONDS) }, (_unused, i) => i * AGE_STEP_MILLISECONDS);
}

describe('the catalog', () => {
  test('every emote is listed under its own name', () => {
    expect(Object.keys(EMOTE_CATALOG).sort()).toEqual([...EMOTE_NAMES].sort());
    for (const name of EMOTE_NAMES) expect(EMOTE_CATALOG[name].name).toBe(name);
  });

  test('each emote shows for its time of the handoff', () => {
    expect(Object.fromEntries(EMOTE_NAMES.map((name) => [name, EMOTE_CATALOG[name].durationMilliseconds]))).toEqual({
      annoyed: 1500, sweatdrop: 1500, surprised: 1100, doubt: 1500, thinking: 2400, idea: 1600, happy: 1300, nervous: 2100,
    });
  });
});

describe('every emote', () => {
  test('hides the anger vein and the "Hi!" of a gesture for as long as it shows', () => {
    for (const name of EMOTE_NAMES) {
      const emote = EMOTE_CATALOG[name];
      for (const gestureMark of [emoteMarkAtRest('anger-vein'), emoteMarkAtRest('greeting')]) {
        for (const ageMilliseconds of agesOf(emote.durationMilliseconds)) {
          const emotePart = emote.targetPose({ ageMilliseconds, facing: 1, reducedMotion: false });
          const pose = composedTargetPose({
            base: NEUTRAL_POSE, gesture: () => ({ emoteMark: gestureMark }), emote: () => emotePart, sleep: () => null, reducedMotion: false,
          });
          expect(emotePart.emoteMark).toBeObject();
          expect(pose.emoteMark).toBe(emotePart.emoteMark ?? null);
        }
      }
    }
  });

  test('under reduced motion moves the body no more than the layers below', () => {
    for (const name of EMOTE_NAMES) {
      const emote = EMOTE_CATALOG[name];
      for (const ageMilliseconds of agesOf(emote.durationMilliseconds)) {
        const body = emote.targetPose({ ageMilliseconds, facing: 1, reducedMotion: true }).body ?? {};
        expect({ name, lift: body.addedLift ?? 0, shake: body.addedShake ?? 0 }).toEqual({ name, lift: 0, shake: 0 });
      }
    }
  });
});
