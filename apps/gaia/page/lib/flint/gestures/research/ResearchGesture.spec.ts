/**
 * The research gesture. What matters: the four
 * studies of 2.6 s each run in order and repeat; each shows only its own prop, so the last fades out as the next fades in; each phase of
 * each study (the book's rest and page turn, the notes' three lines, the stepped query, the hologram's scan); research shows no
 * lightbulb; and facing left, the page still turns from right to left on the screen and the notes still grow from left to right.
 */
import { describe, expect, test } from 'bun:test';
import type { Facing }            from '../../SpriteGeometry.ts';

import type { PosePart }                   from '../../SpritePose.ts';
import type { GestureInput }               from '../GestureDefinition.ts';
import { BookGeometryUtil }                from './BookGeometryUtil.ts';
import { RESEARCH_GESTURE, studyMomentOf } from './ResearchGesture.ts';

const STUDY_MILLISECONDS = 2600;
const BOOK_START = 0;
const NOTES_START = STUDY_MILLISECONDS;
const SEARCH_START = 2 * STUDY_MILLISECONDS;
const HOLOGRAM_START = 3 * STUDY_MILLISECONDS;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

function partAt(elapsedMilliseconds: number, facing: Facing = 1): PosePart {
  return RESEARCH_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing));
}

function shownProps(part: PosePart): string[] {
  return Object.entries(part.props ?? {}).filter(([, prop]) => prop.shown > 0).map(([name]) => name).sort();
}

describe('the studies', () => {
  test('run in order, 2.6 s each, and repeat every 10.4 s', () => {
    expect([BOOK_START, NOTES_START, SEARCH_START, HOLOGRAM_START, 4 * STUDY_MILLISECONDS].map((moment) => studyMomentOf(moment).study))
      .toEqual(['book', 'notes', 'search', 'hologram', 'book']);
    expect(studyMomentOf(NOTES_START + 1300)).toEqual({ study: 'notes', studyMilliseconds: 1300, part: 0.5 });
  });

  test('each study shows only its own prop and hides the other studies\' props, so they fade out', () => {
    expect(shownProps(partAt(BOOK_START + 100))).toEqual(['book']);
    expect(shownProps(partAt(NOTES_START + 100))).toEqual(['notepad']);
    expect(shownProps(partAt(SEARCH_START + 100))).toEqual(['keyboard', 'searchBar']);
    expect(shownProps(partAt(HOLOGRAM_START + 100))).toEqual(['hologram']);
    for (const moment of [BOOK_START, NOTES_START, SEARCH_START, HOLOGRAM_START]) {
      expect(Object.keys(partAt(moment + 100).props ?? {})).toEqual(expect.arrayContaining(['book', 'notepad', 'searchBar', 'hologram']));
    }
  });

  test('research shows no lightbulb and no other mark, and Flint leans 5 into the work throughout', () => {
    for (let elapsed = 0; elapsed < 4 * STUDY_MILLISECONDS; elapsed += 130) {
      expect(partAt(elapsed).emoteMark).toBeUndefined();
      expect(partAt(elapsed).body).toEqual({ leanDegrees: 5 });
    }
  });
});

describe('1. the book', () => {
  test('before the page turns, one pentagon rests at book point (51, -17), and no page turns', () => {
    const part = partAt(BOOK_START + (0.3 * STUDY_MILLISECONDS));
    const rest = BookGeometryUtil.pointOnBook({ x: 51, y: -17 });
    expect(part.nearHand).toEqual({
      cornerCount: 5, centreX: rest.x, centreY: rest.y, radius: 5, turnDegrees: 0, placement: 'eased',
    });
    expect(part.farHand).toBeNull();
    expect(part.props?.book).toEqual({ shown: 1, turningPageSpread: null });
  });

  test('while part goes from 0.45 to 0.65 the page turns, its spread cos(π × progress), and the hand holds its outer edge', () => {
    const part = partAt(BOOK_START + (0.5 * STUDY_MILLISECONDS));
    const pageSpread = Math.cos(Math.PI * 0.25);
    expect(part.props?.book?.turningPageSpread).toBeCloseTo(pageSpread);
    const edge = BookGeometryUtil.turningPageEdgeOf(pageSpread);
    const grip = BookGeometryUtil.pointOnBook({ x: edge.x + 1, y: edge.topY + 13 });
    expect(part.nearHand?.centreX).toBeCloseTo(grip.x);
    expect(part.nearHand?.centreY).toBeCloseTo(grip.y);
    expect(partAt(BOOK_START + (0.7 * STUDY_MILLISECONDS)).props?.book?.turningPageSpread).toBeNull();
  });

  test('Flint looks down at the book: height 6, lift 2.5, the eye shift swinging 6 ± 1.5', () => {
    expect(partAt(BOOK_START + (STUDY_MILLISECONDS / 8)).eyes).toEqual({ height: 6, lift: 2.5, shift: 7.5 });
  });

  test('facing left, the page still turns from the right page to the left page on the screen', () => {
    for (const facing of [1, -1] as const) {
      const pageSpreadAt = (part: number): number => partAt(BOOK_START + (part * STUDY_MILLISECONDS), facing).props?.book?.turningPageSpread ?? 0;
      const screenEdges = [0.47, 0.55, 0.63].map((part) => facing * BookGeometryUtil.turningPageEdgeOf(pageSpreadAt(part)).x);
      expect(screenEdges[0] ?? 0).toBeGreaterThan(screenEdges[1] ?? 0);
      expect(screenEdges[1] ?? 0).toBeGreaterThan(screenEdges[2] ?? 0);
    }
  });

  test('facing left, the hand rests at the lower corner that is right on the screen: book point (27, -17)', () => {
    const rest = BookGeometryUtil.pointOnBook({ x: 27, y: -17 });
    expect(partAt(BOOK_START + 300, -1).nearHand).toMatchObject({ centreX: rest.x, centreY: rest.y });
  });
});

describe('2. the notes', () => {
  test('Flint writes three lines of 10, 0.7 s each, from x 33, with the pen and its eyes on the line', () => {
    const part = partAt(NOTES_START + 350);
    expect(part.props?.notepad).toEqual({ shown: 1, writtenLengths: [5, 0, 0] });
    expect(part.nearHand).toMatchObject({
      cornerCount: 3, radius: 5.5, turnDegrees: -35, centreX: 41
    });
    expect(part.farHand).toBeNull();
    expect(part.eyes).toEqual({ height: 6, lift: -1, shift: 6 });
    expect(partAt(NOTES_START + 1750).props?.notepad?.writtenLengths).toEqual([10, 10, 5]);
    expect(partAt(NOTES_START + 2500).props?.notepad?.writtenLengths).toEqual([10, 10, 10]);
  });

  test('facing left, the line grows from its left end on the screen with the pen right of its end', () => {
    const early = partAt(NOTES_START + 200, -1).nearHand?.centreX ?? 0;
    const later = partAt(NOTES_START + 500, -1).nearHand?.centreX ?? 0;
    expect(-later).toBeGreaterThan(-early);
    expect(partAt(NOTES_START + 350, -1).nearHand).toMatchObject({ turnDegrees: 35, centreX: 33 + 10 - 5 - 3 });
  });
});

describe('3. the search', () => {
  test('two squares type as in normal typing, with sin(t / 40), at the keyboard', () => {
    const elapsed = SEARCH_START + (20 * Math.PI);
    const part = partAt(elapsed);
    const beat = Math.sin(elapsed / 40);
    expect(part.nearHand).toMatchObject({
      cornerCount: 4, centreX: 22, radius: 6.4, turnDegrees: 45
    });
    expect(part.nearHand?.centreY).toBeCloseTo(-10 - (4 * (0.5 + (0.5 * beat))));
    expect(part.farHand).toMatchObject({
      cornerCount: 4, centreX: 30, radius: 5.8, turnDegrees: 45
    });
    expect(part.farHand?.centreY).toBeCloseTo(-13 - (4 * (0.5 - (0.5 * beat))));
    expect(part.props?.keyboard).toEqual({ shown: 1, drop: 0 });
    expect(part.eyes).toEqual({ height: 6, lift: -3, shift: 6 });
  });

  test('the query grows to 14 in 8 steps, one each tenth of the study, then stays full', () => {
    const queryAt = (part: number): number => partAt(SEARCH_START + (part * STUDY_MILLISECONDS)).props?.searchBar?.queryLength ?? -1;
    expect(queryAt(0.05)).toBe(0);
    expect(queryAt(0.15)).toBeCloseTo(14 / 8);
    expect(queryAt(0.45)).toBeCloseTo(14 * (4 / 8));
    expect(queryAt(0.85)).toBe(14);
    expect(queryAt(0.95)).toBe(14);
  });
});

describe('4. the hologram', () => {
  test('no hands; the scan line runs from y -47 to y -23 each 1.2 s; the light flickers 0.85 + 0.15 × sin(t / 60)', () => {
    const elapsed = HOLOGRAM_START + 600;
    const part = partAt(elapsed);
    expect(part.nearHand).toBeNull();
    expect(part.farHand).toBeNull();
    expect(part.props?.hologram?.scanLineY).toBeCloseTo(-35);
    expect(partAt(HOLOGRAM_START + 1200 + 300).props?.hologram?.scanLineY).toBeCloseTo(-41);
    expect(part.props?.hologram?.flicker).toBeCloseTo(0.85 + (0.15 * Math.sin(elapsed / 60)));
  });

  test('the eyes are narrow and read down the panel: height 4.5, lift -4 + 3 × part, shift 5 + 2 × sin(6π × part)', () => {
    const part = partAt(HOLOGRAM_START + (STUDY_MILLISECONDS / 12));
    expect(part.eyes?.height).toBe(4.5);
    expect(part.eyes?.lift).toBeCloseTo(-4 + 0.25);
    expect(part.eyes?.shift).toBeCloseTo(7);
  });
});

test('reduced motion holds the book study before its page turns', () => {
  const part = partAt(RESEARCH_GESTURE.intents.research.stillMomentMilliseconds);
  expect(shownProps(part)).toEqual(['book']);
  expect(part.props?.book?.turningPageSpread).toBeNull();
});
