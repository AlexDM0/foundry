/**
 * The board's preference store over an in-memory storage. What matters: a board's choices are keyed per tracker id under Gaia's prefix,
 * `gaia:board:<trackerId>:<choice>`, and the range under the bare `gaia:board:<trackerId>`, so two forges never share a choice and no Bridge
 * key is read; a default choice removes its key; blocked storage reads nothing and never throws.
 */
import { describe, expect, test } from 'bun:test';

import { boardPreferenceStoreOf, type PreferenceStorage } from './PreferenceStore.ts';

function memoryStorage(): { storage: PreferenceStorage; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    storage: {
      getItem:    (key) => entries.get(key) ?? null,
      setItem:    (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  };
}

describe('the board\'s preference store', () => {
  test('choices are keyed per tracker id under Gaia\'s prefix, and a default choice removes its key', () => {
    const { storage, entries } = memoryStorage();
    boardPreferenceStoreOf('example-tracker', () => storage).writeChoice('tab', 'agents', 'kanban');
    boardPreferenceStoreOf('other-tracker', () => storage).writeChoice('tab', 'questions', 'kanban');
    expect([...entries]).toEqual([['gaia:board:example-tracker:tab', 'agents'], ['gaia:board:other-tracker:tab', 'questions']]);
    expect(boardPreferenceStoreOf('example-tracker', () => storage).readChoice('tab')).toBe('agents');
    boardPreferenceStoreOf('example-tracker', () => storage).writeChoice('tab', 'kanban', 'kanban');
    expect([...entries.keys()]).toEqual(['gaia:board:other-tracker:tab']);
  });

  test('a key the Bridge wrote is never read', () => {
    const { storage, entries } = memoryStorage();
    entries.set('forge-monitor:example-tracker:tab', 'agents');
    entries.set('forge:example-tracker:tab', 'agents');
    expect(boardPreferenceStoreOf('example-tracker', () => storage).readChoice('tab')).toBeNull();
  });

  test('a text list is stored as a JSON list under its own key, an empty one removes it, and a stored non-list reads as empty', () => {
    const { storage, entries } = memoryStorage();
    const store = boardPreferenceStoreOf('example-tracker', () => storage);
    store.writeTextList('kanban-epics', ['checkout', 'no epic']);
    expect([...entries]).toEqual([['gaia:board:example-tracker:kanban-epics', '["checkout","no epic"]']]);
    expect(store.readTextList('kanban-epics')).toEqual(['checkout', 'no epic']);
    store.writeTextList('kanban-epics', []);
    expect(entries.size).toBe(0);
    entries.set('gaia:board:example-tracker:kanban-epics', '{not json');
    expect(store.readTextList('kanban-epics')).toEqual([]);
    entries.set('gaia:board:example-tracker:kanban-epics', '["checkout",4]');
    expect(store.readTextList('kanban-epics')).toEqual(['checkout']);
  });

  test('the text under the bare board prefix is where the range is stored, and null removes it', () => {
    const { storage, entries } = memoryStorage();
    const store = boardPreferenceStoreOf('example-tracker', () => storage);
    store.writeText('{"presetKey":"4h"}');
    expect([...entries]).toEqual([['gaia:board:example-tracker', '{"presetKey":"4h"}']]);
    expect(store.readText()).toBe('{"presetKey":"4h"}');
    store.writeText(null);
    expect(entries.size).toBe(0);
  });

  test('blocked storage reads nothing and drops a write without throwing', () => {
    const blocked = (): PreferenceStorage => {
      throw new Error('storage is blocked');
    };
    const store = boardPreferenceStoreOf('example-tracker', blocked);
    expect(store.readChoice('tab')).toBeNull();
    expect(() => store.writeChoice('tab', 'agents', 'kanban')).not.toThrow();
    expect(store.readText()).toBeNull();
    expect(() => store.writeText('{}')).not.toThrow();
  });
});
