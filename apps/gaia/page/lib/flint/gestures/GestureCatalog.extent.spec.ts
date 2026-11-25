/**
 * The extent each gesture form declares against what it draws. What matters: over its whole timeline (a loop for 16 seconds) and its still
 * moment, in both facings, Flint with the form draws nowhere beyond its declared extent, and the declaration is no more than half a unit
 * larger on any side, so a host that keeps the declared room keeps all of it and no more. The mind stands Flint in a small box by it.
 */
import { expect, test } from 'bun:test';

import { extentMisdeclarationsOf } from '../testing/DeclaredExtentCheck.ts';
import { extentOfSubject }         from '../testing/IntentExtentRun.ts';
import { GESTURE_CATALOG }         from './GestureCatalog.ts';

const FORMS = GESTURE_CATALOG.flatMap((definition) => Object.entries(definition.intents).map(([intent, form]) => ({ intent, extent: form.extent })));

test.each(FORMS)('$intent draws within its declared extent, and the declaration is tight', ({ intent, extent }) => {
  expect(extentMisdeclarationsOf(extent, extentOfSubject({ intent: intent as never }))).toEqual([]);
});
