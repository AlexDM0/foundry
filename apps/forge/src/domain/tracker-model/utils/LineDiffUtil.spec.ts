/**
 * The line diff a ticket document's comments move with. What matters: equal versions have no hunk; an insert, a deletion and a replace
 * each come out as one hunk with its lines and its place on both sides; a comment outside every hunk shifts by the lines before it; a
 * comment on replaced lines moves to the replacement, so a changed line keeps its comment; it is orphaned only when all its lines were
 * deleted or its quote is gone from its new lines; and past the cell limit the changed middle is one hunk, never a slow search.
 */
import { describe, expect, test } from 'bun:test';

import { LineDiffUtil } from './LineDiffUtil.ts';

const {
  hunksOf, linesOf, lineRangeAfter, placementAfter
} = LineDiffUtil;

const ORIGINAL = ['# Example spec', '', 'Alex Example opens the basket.', 'The basket shows two items.', '', '## Acceptance', '1. It shows.'];

describe('linesOf', () => {
  test('splits on line feeds and keeps the empty line after a final one, so the lines join back to the text', () => {
    expect(linesOf('first\nsecond\n')).toEqual(['first', 'second', '']);
    expect(linesOf('first\nsecond\n').join('\n')).toBe('first\nsecond\n');
  });
});

describe('hunksOf', () => {
  test('finds no hunk between equal versions', () => {
    expect(hunksOf(ORIGINAL, [...ORIGINAL])).toEqual([]);
  });

  test('gives an insert an empty original side that starts at the line it goes before', () => {
    const replacement = [...ORIGINAL.slice(0, 4), 'The total reads 12 euro.', ...ORIGINAL.slice(4)];
    expect(hunksOf(ORIGINAL, replacement)).toEqual([{
      originalFromLine: 5, originalLines: [], replacementFromLine: 5, replacementLines: ['The total reads 12 euro.']
    }]);
  });

  test('gives a deletion an empty replacement side', () => {
    const replacement = [...ORIGINAL.slice(0, 3), ...ORIGINAL.slice(4)];
    expect(hunksOf(ORIGINAL, replacement)).toEqual([{
      originalFromLine: 4, originalLines: ['The basket shows two items.'], replacementFromLine: 4, replacementLines: []
    }]);
  });

  test('gives a replace of one line by two its lines on both sides', () => {
    const replacement = [...ORIGINAL.slice(0, 3), 'The basket shows three items.', 'Each has a price.', ...ORIGINAL.slice(4)];
    expect(hunksOf(ORIGINAL, replacement)).toEqual([{
      originalFromLine:    4,
      originalLines:       ['The basket shows two items.'],
      replacementFromLine: 4,
      replacementLines:    ['The basket shows three items.', 'Each has a price.'],
    }]);
  });

  test('keeps the equal lines between two changes out of either hunk', () => {
    const replacement = ['# Example spec v2', ...ORIGINAL.slice(1, 6), '1. It shows the total.'];
    expect(hunksOf(ORIGINAL, replacement)).toEqual([
      {
        originalFromLine: 1, originalLines: ['# Example spec'], replacementFromLine: 1, replacementLines: ['# Example spec v2']
      },
      {
        originalFromLine: 7, originalLines: ['1. It shows.'], replacementFromLine: 7, replacementLines: ['1. It shows the total.']
      },
    ]);
  });

  test('past the cell limit makes the changed middle one hunk between the common head and tail', () => {
    const lineCount   = 2001;
    const original    = ['head', ...[...Array(lineCount).keys()].map((i) => `original ${i}`), 'tail'];
    const replacement = ['head', ...[...Array(lineCount).keys()].map((i) => `replacement ${i}`), 'tail'];
    const hunks       = hunksOf(original, replacement);
    expect(hunks.map((hunk) => [hunk.originalFromLine, hunk.originalLines.length, hunk.replacementFromLine, hunk.replacementLines.length]))
      .toEqual([[2, lineCount, 2, lineCount]]);
  });
});

describe('lineRangeAfter', () => {
  const replacement = [...ORIGINAL.slice(0, 1), 'Inserted line.', ...ORIGINAL.slice(1, 3), 'Replaced line one.', 'Replaced line two.', ...ORIGINAL.slice(4)];
  const hunks       = hunksOf(ORIGINAL, replacement);

  test('shifts a line outside every hunk by the lines the hunks before it added', () => {
    expect(lineRangeAfter(1, hunks)).toEqual({ from: 1, to: 1 });
    expect(lineRangeAfter(3, hunks)).toEqual({ from: 4, to: 4 });
    expect(lineRangeAfter(7, hunks)).toEqual({ from: 9, to: 9 });
  });

  test('carries a replaced line to the whole replacement', () => {
    expect(lineRangeAfter(4, hunks)).toEqual({ from: 5, to: 6 });
  });

  test('answers null for a deleted line', () => {
    const deleted = hunksOf(ORIGINAL, [...ORIGINAL.slice(0, 3), ...ORIGINAL.slice(4)]);
    expect(lineRangeAfter(4, deleted)).toBeNull();
  });
});

describe('placementAfter', () => {
  test('moves a comment above an insert not at all and one below it by the inserted lines', () => {
    const replacement = ['Inserted line.', ...ORIGINAL];
    const hunks       = hunksOf(ORIGINAL, replacement);
    expect(placementAfter({ from: 3, to: 4 }, 'opens the basket', hunks, replacement)).toEqual({ from: 4, to: 5 });
  });

  test('keeps a comment on a changed line on its replacement while the quote still stands there', () => {
    const replacement = [...ORIGINAL.slice(0, 3), 'The basket shows two items and a total.', ...ORIGINAL.slice(4)];
    const hunks       = hunksOf(ORIGINAL, replacement);
    expect(placementAfter({ from: 4, to: 4 }, 'shows two items', hunks, replacement)).toEqual({ from: 4, to: 4 });
  });

  test('orphans a comment whose quote no longer occurs in its replacement', () => {
    const replacement = [...ORIGINAL.slice(0, 3), 'The basket is empty.', ...ORIGINAL.slice(4)];
    const hunks       = hunksOf(ORIGINAL, replacement);
    expect(placementAfter({ from: 4, to: 4 }, 'shows two items', hunks, replacement)).toBeNull();
  });

  test('keeps a changed comment without a quote on its replacement', () => {
    const replacement = [...ORIGINAL.slice(0, 3), 'The basket is empty.', ...ORIGINAL.slice(4)];
    const hunks       = hunksOf(ORIGINAL, replacement);
    expect(placementAfter({ from: 4, to: 4 }, null, hunks, replacement)).toEqual({ from: 4, to: 4 });
  });

  test('orphans a comment only when every one of its lines is in a pure deletion', () => {
    const replacement = [...ORIGINAL.slice(0, 2), ...ORIGINAL.slice(4)];
    const hunks       = hunksOf(ORIGINAL, replacement);
    expect(placementAfter({ from: 3, to: 4 }, null, hunks, replacement)).toBeNull();
    expect(placementAfter({ from: 2, to: 4 }, null, hunks, replacement)).toEqual({ from: 2, to: 2 });
  });

  test('reads whitespace runs as one space when it looks for the quote', () => {
    const replacement = [...ORIGINAL.slice(0, 3), 'The basket   shows', 'two items.', ...ORIGINAL.slice(4)];
    const hunks       = hunksOf(ORIGINAL, replacement);
    expect(placementAfter({ from: 4, to: 4 }, 'shows two items', hunks, replacement)).toEqual({ from: 4, to: 5 });
  });

  test('widens a comment over lines inserted inside it', () => {
    const replacement = [...ORIGINAL.slice(0, 3), 'Inserted line.', ...ORIGINAL.slice(3)];
    const hunks       = hunksOf(ORIGINAL, replacement);
    expect(placementAfter({ from: 3, to: 4 }, 'opens the basket', hunks, replacement)).toEqual({ from: 3, to: 5 });
  });
});
