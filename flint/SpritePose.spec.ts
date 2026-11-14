/**
 * The still pose every layer starts from, against `01-character.md` and `reference/flint-neutral.svg`: eyes shifted 2 to the facing side,
 * 8 high, the hover at its rest height, no hand, every prop hidden, no mark, no sleep. And each emote mark at its anchor and scale of the
 * character sheet, which the emotes build on.
 */
import { describe, expect, test } from 'bun:test';

import type { EmoteMarkName }                               from './SpritePose.ts';
import { emoteMarkAtRest, EMOTE_MARK_PLACES, NEUTRAL_POSE } from './SpritePose.ts';

describe('the neutral pose', () => {
  test('the eyes are 8 high, shifted 2 to the side Flint faces, level and not happy', () => {
    expect(NEUTRAL_POSE.eyes).toEqual({
      shift: 2, height: 8, rightHeightOverride: null, lift: 0, slantDegrees: 0, happiness: 0,
    });
  });

  test('Flint faces right, upright and face-on, hovering 6 units above its floor', () => {
    expect(NEUTRAL_POSE.body).toMatchObject({
      facing: 1, leanDegrees: 0, hover: 6, jumpHeight: 0, widthFactor: 1, heightFactor: 1, sidewaysWidth: 1,
    });
  });

  test('no hand, no shown prop, no mark, no glow and no ember', () => {
    expect(NEUTRAL_POSE.nearHand).toBeNull();
    expect(NEUTRAL_POSE.farHand).toBeNull();
    expect(Object.values(NEUTRAL_POSE.props).map((prop) => prop.shown)).toEqual(Array.from({ length: 10 }, () => 0));
    expect(NEUTRAL_POSE.emoteMark).toBeNull();
    expect(NEUTRAL_POSE.sleep).toEqual({ glowOpacity: 0, embers: [] });
  });
});

describe('the emote marks at rest', () => {
  test.each([
    ['anger-vein', 18, -52, 1.05],
    ['sweat-drop', 13, -48, 1.45],
    ['exclamation', 20, -54, 1.5],
    ['question', 20, -54, 1.5],
    ['thinking-dots', 20, -54, 1.5],
    ['lightbulb', 20, -54, 1.5],
    ['happy-glints', 20, -54, 1.5],
    ['sweat-beads', 0, -48, 1.5],
    ['greeting', 38, -58, 1.5],
  ] as const)('the %s mark sits at (%d, %d) at scale %d', (name, anchorX, anchorY, scale) => {
    expect(emoteMarkAtRest(name)).toMatchObject({
      name, anchorX, anchorY, scale, innerScaleX: 1, innerScaleY: 1, opacity: 1,
    });
  });

  test('every mark name has a place', () => {
    expect(Object.keys(EMOTE_MARK_PLACES).sort()).toEqual(([
      'anger-vein', 'sweat-drop', 'exclamation', 'question', 'thinking-dots', 'lightbulb', 'happy-glints', 'sweat-beads', 'greeting',
    ] satisfies EmoteMarkName[]).sort());
  });
});
