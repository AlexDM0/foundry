/**
 * The prop catalog. What matters: no two props share a name; the props part of the pose holds every prop by its name, hidden at the
 * start; the props of the first build keep the draw order of `01-character.md`, and of them only the looking glass has a grip.
 */
import { expect, test } from 'bun:test';

import {
  HIDDEN_PROPS,
  PROP_CATALOG,
  PROP_NAMES,
  propDefinitionOf,
  propsPoseFrom
} from './PropCatalog.ts';

test('no two props share a name, and each is found by its name', () => {
  expect(new Set(PROP_NAMES).size).toBe(PROP_CATALOG.length);
  for (const name of PROP_NAMES) expect(propDefinitionOf(name).name).toBe(name);
});

test('every prop starts hidden, in its own hidden state', () => {
  expect(Object.keys(HIDDEN_PROPS)).toEqual([...PROP_NAMES]);
  for (const name of PROP_NAMES) expect(HIDDEN_PROPS[name]).toBe(propDefinitionOf(name).hidden);
  expect(PROP_NAMES.every((name) => HIDDEN_PROPS[name].shown === 0)).toBe(true);
});

test('the props behind the body keep the draw order of the character sheet', () => {
  const behindBody = PROP_CATALOG.filter((definition) => definition.layer === 'behind-body').map((definition) => definition.name);
  expect(behindBody.slice(0, 9)).toEqual(['keyboard', 'bolt', 'sheet', 'mergeBlocks', 'book', 'notepad', 'searchBar', 'hologram', 'ticket']);
});

/** The props of the first build come first in the catalog; a prop added later joins after them. */
const FIRST_BUILD_PROP_COUNT = 10;

test('the looking glass is in front of the body and is the one prop of the first build with a grip', () => {
  expect(PROP_CATALOG.slice(0, FIRST_BUILD_PROP_COUNT).filter((definition) => definition.gripOf !== undefined).map((definition) => [definition.name, definition.layer])).toEqual([
    ['lookingGlass', 'in-front-of-body'],
  ]);
});

test('a props part is built one prop at a time, by name', () => {
  expect(Object.keys(propsPoseFrom((name) => propDefinitionOf(name).hidden))).toEqual([...PROP_NAMES]);
});
