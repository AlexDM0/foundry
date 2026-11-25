/**
 * The extent each attendant declares against what it draws. What matters: at its most members, moving and still, in both facings, the
 * members with Flint's body draw nowhere beyond the declared extent, and the declaration is no more than half a unit larger on any side.
 */
import { expect, test } from 'bun:test';

import { extentMisdeclarationsOf } from '../testing/DeclaredExtentCheck.ts';
import { extentOfSubject }         from '../testing/IntentExtentRun.ts';
import { ATTENDANT_CATALOG }       from './AttendantCatalog.ts';

test.each([...ATTENDANT_CATALOG])('$name draws within its declared extent, and the declaration is tight', (definition) => {
  expect(extentMisdeclarationsOf(definition.extent, extentOfSubject({ attendant: definition.name, count: definition.maximumCount }))).toEqual([]);
});
