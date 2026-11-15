/**
 * Writing on paper against `02-animations.md`, "Reading and writing direction", "Ticket and notes". What matters: lines fill one after
 * the other; a line grows from its left end on the screen whichever way Flint faces, going down 0.2 for each unit; the pen is a triangle
 * just right of the growing end on the screen, turned -35 × facing; and the eyes look down at the line being written.
 */
import { describe, expect, test } from 'bun:test';
import type { Facing }            from '../SpriteGeometry.ts';

import type { WritingPaper } from './PenWritingUtil.ts';
import { PenWritingUtil }    from './PenWritingUtil.ts';

const PAPER: WritingPaper = {
  lineStartX: 31, lineYs: [-34, -28, -22], fullLineUnits: 12, lineMilliseconds: 500,
};
const NO_WOBBLE_MILLISECONDS = 0;

function screenX(spriteX: number, facing: Facing): number {
  return spriteX * facing;
}

describe('the written lines', () => {
  test('nothing is written before the writing starts, and the pen waits at the start of the first line', () => {
    const moment = PenWritingUtil.writingMomentOf(PAPER, -200, NO_WOBBLE_MILLISECONDS, 1);
    expect(moment.writtenLengths).toEqual([0, 0, 0]);
    expect(moment.pen).toMatchObject({ centreX: 34, centreY: -29 });
  });

  test('the lines fill one after the other and stay full', () => {
    expect(PenWritingUtil.writingMomentOf(PAPER, 250, NO_WOBBLE_MILLISECONDS, 1).writtenLengths).toEqual([6, 0, 0]);
    expect(PenWritingUtil.writingMomentOf(PAPER, 750, NO_WOBBLE_MILLISECONDS, 1).writtenLengths).toEqual([12, 6, 0]);
    expect(PenWritingUtil.writingMomentOf(PAPER, 4000, NO_WOBBLE_MILLISECONDS, 1).writtenLengths).toEqual([12, 12, 12]);
  });

  test('a line goes down 0.2 for each unit of its length, parallel to the paper\'s top edge', () => {
    expect(PenWritingUtil.writtenEndOf(PAPER, -34, 10, 1)).toEqual({ x: 41, y: -32 });
  });

  test('facing left, a line grows from the far end of the paper, which is its left end on the screen', () => {
    const shortEnd = PenWritingUtil.writtenEndOf(PAPER, -34, 2, -1);
    const longEnd = PenWritingUtil.writtenEndOf(PAPER, -34, 8, -1);
    expect(PenWritingUtil.writtenEndOf(PAPER, -34, 0, -1)).toEqual({ x: 43, y: -31.6 });
    expect(screenX(longEnd.x, -1)).toBeGreaterThan(screenX(shortEnd.x, -1));
  });
});

describe('the pen', () => {
  test('is a triangle of radius 5.5 at (end + 3, end + 5 + 0.6 × sin(t / 40)), turned -35 degrees', () => {
    const wobbleMilliseconds = 20 * Math.PI;
    const { pen } = PenWritingUtil.writingMomentOf(PAPER, 250, wobbleMilliseconds, 1);
    expect(pen).toMatchObject({
      cornerCount: 3, radius: 5.5, turnDegrees: -35, centreX: 40, placement: 'eased',
    });
    expect(pen.centreY).toBeCloseTo(-34 + 1.2 + 5 + 0.6);
  });

  test('facing left, it stays right of the growing end on the screen, turned 35 degrees', () => {
    const moment = PenWritingUtil.writingMomentOf(PAPER, 250, NO_WOBBLE_MILLISECONDS, -1);
    const end = PenWritingUtil.writtenEndOf(PAPER, -34, 6, -1);
    expect(moment.pen.turnDegrees).toBe(35);
    expect(screenX(moment.pen.centreX, -1) - screenX(end.x, -1)).toBe(3);
  });

  test('the eyes look down at the line being written: height 6, lift (line y + 28) / 5', () => {
    expect(PenWritingUtil.writingMomentOf(PAPER, 250, NO_WOBBLE_MILLISECONDS, 1).eyes).toEqual({ height: 6, lift: -1.2 });
    expect(PenWritingUtil.writingMomentOf(PAPER, 1250, NO_WOBBLE_MILLISECONDS, 1).eyes.lift).toBeCloseTo(1.2);
  });
});
