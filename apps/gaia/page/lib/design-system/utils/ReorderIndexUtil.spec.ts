/**
 * The reorder index arithmetic: a move gives the shown order and the indices `onReorder` names; the pointer lands a row by the other rows'
 * middles; a move never leaves the row's band; only passed rows slide, toward the old place, by its height and gap; and the drop line sits at the
 * passed landing row's edge, with none for a row back in its place.
 */
import { describe, expect, test } from 'bun:test';

import { ReorderIndexUtil, type RowBox } from './ReorderIndexUtil.ts';

const ROW_HEIGHT = 28;
const ROW_GAP = 4;
const LIST_TOP = 100;

/** Four rows of 28 pixels, 4 pixels apart, the first at 100. */
const FOUR_ROW_BOXES: readonly RowBox[] = [0, 1, 2, 3].map((index) => ({ top: LIST_TOP + index * (ROW_HEIGHT + ROW_GAP), height: ROW_HEIGHT }));

describe('the order a move gives', () => {
  test('moving a row up or down takes it out and puts it in at the new index', () => {
    expect([
      ReorderIndexUtil.reorderedIndicesOf(4, 1, 0),
      ReorderIndexUtil.reorderedIndicesOf(4, 0, 3),
      ReorderIndexUtil.reorderedIndicesOf(4, 3, 1),
      ReorderIndexUtil.reorderedIndicesOf(4, 2, 2),
    ]).toEqual([[1, 0, 2, 3], [1, 2, 3, 0], [0, 3, 1, 2], [0, 1, 2, 3]]);
  });

  test('an index past the list leaves the order as it is', () => {
    expect(ReorderIndexUtil.reorderedIndicesOf(3, 5, 0)).toEqual([0, 1, 2]);
  });
});

describe('where the dragged row lands', () => {
  test('the pointer lands it one past every other row whose middle is above it', () => {
    const middleOf = (index: number): number => LIST_TOP + index * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;
    expect([
      ReorderIndexUtil.dropIndexAt(middleOf(0) - 1, FOUR_ROW_BOXES, 1),
      ReorderIndexUtil.dropIndexAt(middleOf(0) + 1, FOUR_ROW_BOXES, 1),
      ReorderIndexUtil.dropIndexAt(middleOf(2) + 1, FOUR_ROW_BOXES, 1),
      ReorderIndexUtil.dropIndexAt(middleOf(3) + 1, FOUR_ROW_BOXES, 1),
    ]).toEqual([0, 1, 2, 3]);
  });

  test('the dragged row\'s own middle never counts', () => {
    expect(ReorderIndexUtil.dropIndexAt(LIST_TOP + 1000, FOUR_ROW_BOXES, 0)).toBe(3);
  });
});

describe('the band a row stays in', () => {
  const BANDS = ['prepare', 'prepare', 'gate', 'gate', 'gate'];

  test('a move is held between the first and the last row of the row\'s band', () => {
    expect([
      ReorderIndexUtil.clampedToBand(BANDS, 2, 0),
      ReorderIndexUtil.clampedToBand(BANDS, 1, 4),
      ReorderIndexUtil.clampedToBand(BANDS, 3, 4),
      ReorderIndexUtil.clampedToBand(BANDS, 0, -1),
    ]).toEqual([2, 1, 4, 0]);
  });

  test('rows with no band are one band of their own', () => {
    expect(ReorderIndexUtil.clampedToBand([undefined, undefined, undefined], 0, 2)).toBe(2);
  });
});

describe('how the other rows slide', () => {
  test('a row dragged down passes rows that slide up; one dragged up passes rows that slide down; the others stay', () => {
    expect([0, 1, 2, 3].map((index) => ReorderIndexUtil.shiftOf(index, 1, 3))).toEqual([null, null, 'up', 'up']);
    expect([0, 1, 2, 3].map((index) => ReorderIndexUtil.shiftOf(index, 2, 0))).toEqual(['down', 'down', null, null]);
    expect([0, 1, 2, 3].map((index) => ReorderIndexUtil.shiftOf(index, 2, 2))).toEqual([null, null, null, null]);
  });

  test('they slide by the dragged row\'s height and the gap beside it', () => {
    expect([
      ReorderIndexUtil.slotSpanOf(FOUR_ROW_BOXES, 0),
      ReorderIndexUtil.slotSpanOf(FOUR_ROW_BOXES, 3),
      ReorderIndexUtil.slotSpanOf([{ top: 0, height: ROW_HEIGHT }], 0),
      ReorderIndexUtil.slotSpanOf([], 0),
    ]).toEqual([ROW_HEIGHT + ROW_GAP, ROW_HEIGHT + ROW_GAP, ROW_HEIGHT, 0]);
  });
});

describe('where the drop line sits', () => {
  test('at the top edge of the landing row going up, at its bottom edge going down, and nowhere for no move', () => {
    expect([
      ReorderIndexUtil.dropLineOffsetOf(FOUR_ROW_BOXES, 2, 0),
      ReorderIndexUtil.dropLineOffsetOf(FOUR_ROW_BOXES, 0, 1),
      ReorderIndexUtil.dropLineOffsetOf(FOUR_ROW_BOXES, 1, 1),
    ]).toEqual([0, ROW_HEIGHT + ROW_GAP + ROW_HEIGHT, null]);
  });
});
