/**
 * The order of the layers and how a part lays over the pose below it. What matters: the order is behaviour, gesture, emote, sleep,
 * attendants, reduced motion; no part removes the attendants; an emote's mark hides a gesture's; a tint and a fill replace the body's;
 * added offsets add and factors multiply, so a hop rides on a busy bob; a hand given as null goes and an absent one stays; sleep reads
 * the eye height the emote left; reduced motion stops every bob, shake, squash and swing.
 */
import { describe, expect, test } from 'bun:test';

import {
  composedTargetPose,
  NO_LAYER,
  POSE_COMPOSITION_ORDER,
  poseWithPart
} from './PoseComposition.ts';
import type { HandPose, PosePart }       from './SpritePose.ts';
import { NEUTRAL_POSE, emoteMarkAtRest } from './SpritePose.ts';

const SQUARE_HAND: HandPose = {
  cornerCount: 4, centreX: 22, centreY: -10, radius: 6.4, turnDegrees: 45, placement: 'eased',
};

describe('the composition order', () => {
  test('is behaviour, gesture, emote, sleep, the attendants, then reduced motion', () => {
    expect(POSE_COMPOSITION_ORDER).toEqual(['behaviour', 'gesture', 'emote', 'sleep-sequence', 'attendants', 'reduced-motion']);
  });

  test('the attendants come after every part, so no gesture, emote or sleep removes them, also under reduced motion', () => {
    const member = {
      name: 'watcher-spark', index: 0, x: -26, y: -44, turnDegrees: 45, scale: 1,
    } as const;
    for (const reducedMotion of [false, true]) {
      const pose = composedTargetPose({
        base:       NEUTRAL_POSE,
        gesture:    () => ({ nearHand: null, emoteMark: null }),
        emote:      () => ({ eyes: { happiness: 1 } }),
        sleep:      () => ({ sleep: { glowOpacity: 1, embers: [] } }),
        attendants: [member],
        reducedMotion,
      });
      expect(pose.attendants).toEqual([member]);
    }
  });

  test('a tint and a fill opacity replace those of the layers below', () => {
    const tinted = poseWithPart(NEUTRAL_POSE, { body: { tint: { role: 'emberDark', amount: 0.85 }, fillOpacity: 0.4 } });
    expect([tinted.body.tint, tinted.body.fillOpacity]).toEqual([{ role: 'emberDark', amount: 0.85 }, 0.4]);
    expect(poseWithPart(tinted, { body: { addedLift: 1 } }).body.tint).toEqual({ role: 'emberDark', amount: 0.85 });
  });

  test('an emote\'s mark hides the gesture\'s greeting', () => {
    const pose = composedTargetPose({
      base:          NEUTRAL_POSE,
      gesture:       () => ({ emoteMark: emoteMarkAtRest('greeting') }),
      emote:         () => ({ emoteMark: emoteMarkAtRest('question') }),
      sleep:         NO_LAYER,
      attendants:    [],
      reducedMotion: false,
    });
    expect(pose.emoteMark?.name).toBe('question');
  });

  test('sleep reads the eye height the gesture and the emote left', () => {
    const seenEyeHeights: number[] = [];
    composedTargetPose({
      base:    NEUTRAL_POSE,
      gesture: () => ({ eyes: { height: 6 } }),
      emote:   () => ({ eyes: { height: 10 } }),
      sleep:   (incoming) => {
        seenEyeHeights.push(incoming.eyes.height);
        return null;
      },
      attendants:    [],
      reducedMotion: false,
    });
    expect(seenEyeHeights).toEqual([10]);
  });
});

describe('a part over the pose below', () => {
  test('a lean replaces, an added lean adds, lift and shake add, and the factors multiply', () => {
    const below = poseWithPart(NEUTRAL_POSE, { body: { leanDegrees: 9, addedLift: 0.8, widthFactor: 1.04 } });
    const pose = poseWithPart(below, {
      body: {
        addedLeanDegrees: 7, addedLift: 6, addedShake: 1.5, widthFactor: 0.5, heightFactor: 0.95,
      },
    });
    expect(pose.body).toMatchObject({
      leanDegrees: 16, lift: 6.8, shake: 1.5, widthFactor: 0.52, heightFactor: 0.95,
    });
  });

  test('a hand given as null goes, and a hand left out stays', () => {
    const withHands = poseWithPart(NEUTRAL_POSE, { nearHand: SQUARE_HAND, farHand: SQUARE_HAND });
    const pose = poseWithPart(withHands, { nearHand: null });
    expect(pose.nearHand).toBeNull();
    expect(pose.farHand).toEqual(SQUARE_HAND);
  });

  test('a prop given replaces only that prop, and exact fields add to the list', () => {
    const part: PosePart = { props: { bolt: { shown: 1 } }, exactFields: ['eye-height'] };
    const pose = poseWithPart(poseWithPart(NEUTRAL_POSE, { exactFields: ['lean'] }), part);
    expect(pose.props.bolt.shown).toBe(1);
    expect(pose.props.keyboard).toEqual(NEUTRAL_POSE.props.keyboard);
    expect(pose.exactFields).toEqual(['lean', 'eye-height']);
  });
});

describe('reduced motion', () => {
  test('holds the body still: no lift, shake or squash, and the hover at its rest height', () => {
    const pose = composedTargetPose({
      base:    { ...NEUTRAL_POSE, body: { ...NEUTRAL_POSE.body, hover: 8.4 } },
      gesture: () => ({
        body: {
          addedLift: 0.8, addedShake: 0.8, widthFactor: 1.04, heightFactor: 0.95
        }
      }),
      emote:         () => ({ eyes: { height: 10 } }),
      sleep:         NO_LAYER,
      attendants:    [],
      reducedMotion: true,
    });
    expect(pose.body).toMatchObject({
      lift: 0, shake: 0, widthFactor: 1, heightFactor: 1, hover: 6,
    });
    expect(pose.eyes.height).toBe(10);
  });

  test('keeps a hover that sleep has landed', () => {
    const pose = composedTargetPose({
      base: NEUTRAL_POSE, gesture: NO_LAYER, emote: NO_LAYER, sleep: () => ({ body: { hover: 0 } }), attendants: [], reducedMotion: true,
    });
    expect(pose.body.hover).toBe(0);
  });
});
