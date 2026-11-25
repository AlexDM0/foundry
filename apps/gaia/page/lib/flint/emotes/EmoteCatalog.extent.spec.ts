/**
 * The extent each emote declares against what it draws. What matters: over the emote and its still form, in both facings, Flint with the
 * emote draws nowhere beyond its declared extent, and the declaration is no more than half a unit larger on any side.
 */
import { expect, test } from 'bun:test';

import { extentMisdeclarationsOf } from '../testing/DeclaredExtentCheck.ts';
import { extentOfSubject }         from '../testing/IntentExtentRun.ts';
import { EMOTE_CATALOG }           from './EmoteCatalog.ts';

test.each([...EMOTE_CATALOG])('$name draws within its declared extent, and the declaration is tight', (definition) => {
  expect(extentMisdeclarationsOf(definition.extent, extentOfSubject({ intent: definition.name }))).toEqual([]);
});
