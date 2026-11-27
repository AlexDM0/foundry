/**
 * The line merge and edit mapping a ticket document's saves and proposals land through: changes on other lines both apply, a shared change
 * applies once, the person's text wins an overlap, an edit on an older version lands only where its lines still stand, and edits apply
 * from the bottom.
 */
import { describe, expect, test } from 'bun:test';

import { DocumentLineMergeUtil } from './DocumentLineMergeUtil.ts';

const {
  mergeOf, editsOnHeadOf, linesWithEditsApplied, replacementRangesOf
} = DocumentLineMergeUtil;

const BASE = ['one', 'two', 'three', 'four'];

describe('mergeOf', () => {
  test('applies the changes of both sides where they change other lines', () => {
    expect(mergeOf(BASE, ['one', 'two', 'three', 'FOUR'], ['ONE', 'two', 'three', 'four'])).toEqual({ mergedLines: ['ONE', 'two', 'three', 'FOUR'], overriddenHeadHunks: [] });
  });

  test('applies a change both sides made alike once', () => {
    expect(mergeOf(BASE, ['one', 'TWO', 'three', 'four'], ['one', 'TWO', 'three', 'four'])).toEqual({ mergedLines: ['one', 'TWO', 'three', 'four'], overriddenHeadHunks: [] });
  });

  test('keeps the person\'s text where the two overlap and returns the head\'s change as overridden', () => {
    const merge = mergeOf(BASE, ['one', 'head two', 'three', 'four'], ['one', 'person two', 'three', 'FOUR']);
    expect(merge.mergedLines).toEqual(['one', 'person two', 'three', 'FOUR']);
    expect(merge.overriddenHeadHunks).toEqual([{
      originalFromLine: 2, originalLines: ['two'], replacementFromLine: 2, replacementLines: ['head two']
    }]);
  });

  test('reads two inserts at one place as an overlap', () => {
    const merge = mergeOf(BASE, ['one', 'head', 'two', 'three', 'four'], ['one', 'person', 'two', 'three', 'four']);
    expect(merge.mergedLines).toEqual(['one', 'person', 'two', 'three', 'four']);
    expect(merge.overriddenHeadHunks).toHaveLength(1);
  });
});

describe('editsOnHeadOf', () => {
  test('moves an edit by the lines the head added before it', () => {
    expect(editsOnHeadOf(BASE, ['zero', ...BASE], [{
      fromLine: 3, toLine: 3, originalLines: ['three'], replacementLines: ['THREE']
    }])).toEqual([{
      fromLine: 4, toLine: 4, originalLines: ['three'], replacementLines: ['THREE']
    }]);
  });

  test('refuses an edit whose original lines the head changed', () => {
    expect(editsOnHeadOf(BASE, ['one', 'two', 'changed', 'four'], [{
      fromLine: 3, toLine: 3, originalLines: ['three'], replacementLines: ['THREE']
    }])).toBeNull();
  });

  test('refuses an edit whose original lines are not the base\'s, a malformed edit and two edits that meet', () => {
    expect(editsOnHeadOf(BASE, BASE, [{
      fromLine: 2, toLine: 2, originalLines: ['not two'], replacementLines: []
    }])).toBeNull();
    expect(editsOnHeadOf(BASE, BASE, [{
      fromLine: 2, toLine: 3, originalLines: ['two'], replacementLines: []
    }])).toBeNull();
    expect(editsOnHeadOf(BASE, BASE, [
      {
        fromLine: 2, toLine: 3, originalLines: ['two', 'three'], replacementLines: []
      },
      {
        fromLine: 3, toLine: 3, originalLines: ['three'], replacementLines: ['x']
      },
    ])).toBeNull();
  });

  test('takes an insert into an empty document as the first write', () => {
    expect(editsOnHeadOf([], [], [{
      fromLine: 1, toLine: 0, originalLines: [], replacementLines: ['first']
    }])).toEqual([{
      fromLine: 1, toLine: 0, originalLines: [], replacementLines: ['first']
    }]);
  });
});

describe('linesWithEditsApplied and replacementRangesOf', () => {
  const edits = [
    {
      fromLine: 1, toLine: 1, originalLines: ['one'], replacementLines: ['ONE', 'one and a half']
    },
    {
      fromLine: 3, toLine: 3, originalLines: ['three'], replacementLines: ['THREE']
    },
    {
      fromLine: 4, toLine: 4, originalLines: ['four'], replacementLines: []
    },
  ];

  test('applies every edit as made on the same lines', () => {
    expect(linesWithEditsApplied(BASE, edits)).toEqual(['ONE', 'one and a half', 'two', 'THREE']);
  });

  test('finds each replacement where it stands after all, and none for a deletion', () => {
    expect(replacementRangesOf(edits)).toEqual([{ from: 1, to: 2 }, { from: 4, to: 4 }]);
  });
});
