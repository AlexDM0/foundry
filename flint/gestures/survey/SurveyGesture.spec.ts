/**
 * Survey against `06-more-animations.md`, "Survey". What matters: the blueprint fades in; a triangle runs along the top edge while the top
 * measure grows, then down the side while the side measure grows, with eye height 5; the thinking dots show one after another with the
 * eyes up; a hexagon sets three posts, 600 ms each, going 5 down above each; the lamps pass 120 ms apart with happy eyes; the props fade
 * from 5 s; the top measure, the posts and the lamps go from left to right on the screen whatever the facing; the cycle repeats every
 * 5.6 s; and reduced motion holds the three posts with their lamps passed.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { SURVEY_GESTURE }    from './SurveyGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): ReturnType<typeof SURVEY_GESTURE.targetPose> {
  const input: GestureInput<'normal'> = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return SURVEY_GESTURE.targetPose(input);
}

describe('the cycle', () => {
  test('0 to 0.3 s the blueprint fades in, with nothing measured or set and no hand', () => {
    const part = partAt(150);
    expect(part.props?.surveyBlueprint).toMatchObject({ sceneOpacity: 0.5, topMeasure: 0, sideMeasure: 0 });
    expect(part.props?.surveyBlueprint?.posts.map((post) => post.growth)).toEqual([0, 0, 0]);
    expect(part.nearHand).toBeNull();
    expect(part.body).toEqual({ leanDegrees: 5 });
  });

  test('0.3 to 0.9 s a triangle of 6 runs along the top edge from (31, -49) to (45, -46) as the top measure grows; eye height 5', () => {
    const part = partAt(600);
    expect(part.nearHand).toEqual({
      cornerCount: 3, radius: 6, placement: 'eased', centreX: 38, centreY: -47.5, turnDegrees: 180,
    });
    expect(part.props?.surveyBlueprint?.topMeasure).toBe(0.5);
    expect(part.eyes).toEqual({ shift: 6, height: 5, lift: -3 });
  });

  test('0.9 to 1.5 s the triangle, now of radius 5 to stay off the body, goes down the side from (25, -34) to (25, -18) as the side measure grows', () => {
    const part = partAt(1200);
    expect(part.nearHand).toMatchObject({
      centreX: 25, centreY: -26, radius: 5, turnDegrees: 90,
    });
    expect(part.props?.surveyBlueprint).toMatchObject({ topMeasure: 1, sideMeasure: 0.5 });
    expect(part.eyes).toEqual({ shift: 6, height: 5, lift: 0.4 });
  });

  test('1.5 to 2.1 s the thinking dots show one after another with the eyes up, and fade before the posts start', () => {
    expect(partAt(1550).emoteMark).toMatchObject({ name: 'thinking-dots', details: { dotsShown: 1 }, opacity: 1 });
    expect(partAt(1800).emoteMark).toMatchObject({ details: { dotsShown: 3 }, opacity: 1 });
    expect(partAt(2020).emoteMark?.opacity).toBe(0.5);
    expect(partAt(2100).emoteMark).toBeUndefined();
    expect(partAt(1800).eyes).toMatchObject({ height: 6, lift: -3 });
  });

  test('2.1 to 3.9 s a hexagon of 5.5 sets a post each 600 ms: it goes 5 down above the post as the post grows, then back up', () => {
    const above = partAt(2100).nearHand;
    expect(above).toMatchObject({ cornerCount: 6, radius: 5.5, centreX: 33 });
    expect(above?.centreY).toBeCloseTo(-19.6 - 5 - 4.4 - 5.5 - 5);
    expect(partAt(2400).nearHand?.centreY).toBeCloseTo(-19.6 - 5 - 4.4 - 5.5);
    expect(partAt(2250).props?.surveyBlueprint?.posts[0]).toEqual({ growth: 0.5, lampOpacity: 0, lamp: 'off' });
    expect(partAt(2400).props?.surveyBlueprint?.posts[0]).toEqual({ growth: 1, lampOpacity: 1, lamp: 'off' });
    expect(partAt(2800).nearHand).toMatchObject({ centreX: 38 });
    expect(partAt(3400).nearHand).toMatchObject({ centreX: 43 });
  });

  test('3.9 to 4.5 s the lamps pass 120 ms after each other with happy eyes, and the hand goes', () => {
    expect(partAt(3950).props?.surveyBlueprint?.posts.map((post) => post.lamp)).toEqual(['passed', 'off', 'off']);
    expect(partAt(4140).props?.surveyBlueprint?.posts.map((post) => post.lamp)).toEqual(['passed', 'passed', 'passed']);
    expect(partAt(3950).eyes?.happiness).toBe(1);
    expect(partAt(3950).nearHand).toBeNull();
  });

  test('5 to 5.6 s the props fade out', () => {
    expect(partAt(5300).props?.surveyBlueprint?.sceneOpacity).toBeCloseTo(0.5);
    expect(partAt(5300).props?.surveyBlueprint?.posts[2]?.lampOpacity).toBeCloseTo(0.5);
  });

  test('the cycle repeats every 5.6 s', () => {
    for (const moment of [600, 1800, 2400, 4140]) expect(partAt(5600 + moment)).toEqual(partAt(moment));
  });
});

describe('facing left, the measure along the top, the posts and the lamps go from left to right on the screen', () => {
  test('the triangle starts at the end of the top edge that is left on the screen', () => {
    expect(partAt(300, -1).nearHand).toMatchObject({ centreX: 45, centreY: -46 });
    expect(partAt(450, -1).nearHand).toMatchObject({ centreX: 41.5, centreY: -46.75 });
    expect(partAt(450, 1).nearHand).toMatchObject({ centreX: 34.5, centreY: -48.25 });
  });

  test('the hexagon sets the post at x 43 first, and its lamp passes first', () => {
    expect(partAt(2100, -1).nearHand).toMatchObject({ centreX: 43 });
    expect(partAt(2400, -1).props?.surveyBlueprint?.posts.map((post) => post.growth)).toEqual([0, 0, 1]);
    expect(partAt(3950, -1).props?.surveyBlueprint?.posts.map((post) => post.lamp)).toEqual(['off', 'off', 'passed']);
  });
});

test('one intent, a loop; reduced motion holds the three posts with their lamps passed', () => {
  expect(SURVEY_GESTURE.intents).toEqual({ survey: { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 4200 } });
  const still = partAt(SURVEY_GESTURE.intents.survey.stillMomentMilliseconds);
  expect(still.props?.surveyBlueprint?.posts).toEqual([1, 1, 1].map(() => ({ growth: 1, lampOpacity: 1, lamp: 'passed' })));
  expect(still.eyes?.happiness).toBe(1);
});
