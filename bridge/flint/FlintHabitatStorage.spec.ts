/**
 * The Bridge's storage port for Flint. What matters: the value the package gives is kept as it is under the board's `flint-habitat`
 * choice, so each board remembers its own habitat, and read back unchanged; a board that stored nothing reads as nothing.
 */
import { expect, test } from 'bun:test';

import { PRODUCT_NAMES }                                    from '../../src/shared/constants/ProductNames.ts';
import { boardPreferenceStoreOf, type PreferenceStorage }   from '../preferences/PreferenceStore.ts';
import { FLINT_HABITAT_CHOICE_NAME, flintHabitatStorageOf } from './FlintHabitatStorage.ts';

function memoryStorage(entries: Map<string, string>): () => PreferenceStorage {
  return () => ({
    getItem:    (key) => entries.get(key) ?? null,
    setItem:    (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  });
}

test('the package\'s value is stored as it is under the board\'s own key, and read back unchanged', () => {
  const entries = new Map<string, string>();
  const storage = flintHabitatStorageOf(boardPreferenceStoreOf('example-tracker', memoryStorage(entries)));
  storage.writeHabitatKind('1:chat');
  expect([...entries]).toEqual([[`${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:${FLINT_HABITAT_CHOICE_NAME}`, '1:chat']]);
  expect(storage.readHabitatKind()).toBe('1:chat');
  storage.writeHabitatKind('1:');
  expect(storage.readHabitatKind()).toBe('1:');
});

test('each board keeps its own habitat, and a board that stored nothing reads as nothing', () => {
  const entries = new Map<string, string>();
  flintHabitatStorageOf(boardPreferenceStoreOf('example-tracker', memoryStorage(entries))).writeHabitatKind('1:agent-panel');
  expect(flintHabitatStorageOf(boardPreferenceStoreOf('other-example-tracker', memoryStorage(entries))).readHabitatKind()).toBeNull();
});
