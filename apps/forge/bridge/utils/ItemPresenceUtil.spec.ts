/**
 * The comings and goings of a shown list. What matters: a key the list gains arrives and stays arriving while it stays, a key it held
 * never arrives; a lost item leaves from the place it held, after the items before it; an item that came back is current, never also
 * leaving; and no arrival answers the one empty set.
 */
import { describe, expect, test } from 'bun:test';

import { ItemPresenceUtil, type KeyedItem } from './ItemPresenceUtil.ts';

function keyedItemsOf(...keys: string[]): KeyedItem<string>[] {
  return keys.map((key) => ({ key, item: `item ${key}` }));
}

describe('arrivedKeysAfter', () => {
  test('a gained key arrives and stays arriving, a held key never arrives, and a key that went is dropped', () => {
    const firstArrivals = ItemPresenceUtil.arrivedKeysAfter(ItemPresenceUtil.NO_KEYS, keyedItemsOf('a', 'b'), new Set(['a', 'b', 'c']));
    expect([...firstArrivals]).toEqual(['c']);
    expect([...ItemPresenceUtil.arrivedKeysAfter(firstArrivals, keyedItemsOf('a', 'b', 'c'), new Set(['b', 'c', 'd']))]).toEqual(['c', 'd']);
  });

  test('a list that gained nothing answers the one empty set', () => {
    expect(ItemPresenceUtil.arrivedKeysAfter(ItemPresenceUtil.NO_KEYS, keyedItemsOf('a', 'b'), new Set(['a']))).toBe(ItemPresenceUtil.NO_KEYS);
  });
});

describe('departedItemsOf', () => {
  test('answers each lost item with the place it held', () => {
    expect(ItemPresenceUtil.departedItemsOf(keyedItemsOf('a', 'b', 'c'), new Set(['a', 'c']))).toEqual([{ key: 'b', item: 'item b', position: 1 }]);
  });
});

describe('presentItemsOf', () => {
  test('marks the arrivals, and puts each leaving item back at its old place', () => {
    const presentItems = ItemPresenceUtil.presentItemsOf(keyedItemsOf('a', 'd'), new Set(['d']), [
      { key: 'c', item: 'item c', position: 2 },
      { key: 'b', item: 'item b', position: 1 },
    ]);
    expect(presentItems.map(({ key, presence }) => `${key} ${presence}`)).toEqual(['a settled', 'b leaving', 'c leaving', 'd arriving']);
  });

  test('a leaving item past the end goes last, and one that came back is only current', () => {
    const presentItems = ItemPresenceUtil.presentItemsOf(keyedItemsOf('a', 'b'), ItemPresenceUtil.NO_KEYS, [
      { key: 'b', item: 'item b', position: 0 },
      { key: 'z', item: 'item z', position: 9 },
    ]);
    expect(presentItems.map(({ key, presence }) => `${key} ${presence}`)).toEqual(['a settled', 'b settled', 'z leaving']);
  });
});
