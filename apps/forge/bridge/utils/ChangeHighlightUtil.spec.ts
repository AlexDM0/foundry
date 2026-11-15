/**
 * The change highlight's comparison of two boards. What matters: the first board marks nothing; a new item and an item whose signature moved
 * are marked, an unchanged one and one that went are not; a review round is part of the signature; a played mark leaves the others.
 */
import { describe, expect, test } from 'bun:test';

import { ChangeHighlightUtil } from './ChangeHighlightUtil.ts';

describe('changedKeysBetween', () => {
  test('marks nothing on the first board', () => {
    expect([...ChangeHighlightUtil.changedKeysBetween(null, new Map([['1', 'pending']]))]).toEqual([]);
  });

  test('marks the new items and the items whose signature moved, never an unchanged one or one that went', () => {
    const previous = new Map([['1', 'pending'], ['2', 'in-progress'], ['3', 'delivered']]);
    const current = new Map([['1', 'in-progress'], ['2', 'in-progress'], ['4', 'pending']]);

    expect([...ChangeHighlightUtil.changedKeysBetween(previous, current)]).toEqual(['1', '4']);
  });
});

describe('signatureOf', () => {
  test('tells a second review pass from the first', () => {
    expect(ChangeHighlightUtil.signatureOf('reviewing', null)).toBe('reviewing');
    expect(ChangeHighlightUtil.signatureOf('reviewing', 2)).not.toBe(ChangeHighlightUtil.signatureOf('reviewing', 1));
  });
});

describe('withoutKey', () => {
  test('drops the played mark and keeps the others, and keeps the same set when the key was not marked', () => {
    const marked = new Set(['1', '2']);

    expect([...ChangeHighlightUtil.withoutKey(marked, '1')]).toEqual(['2']);
    expect(ChangeHighlightUtil.withoutKey(marked, '9')).toBe(marked);
  });
});
