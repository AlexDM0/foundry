/**
 * The health contract: the document names Gaia at the known health and install versions with the forge counts it is handed; an answer is
 * Gaia's only when its own `application` key says so, at whatever health version; and its forge counts are read only at the known health
 * version, so a reading at another number never reaches the launcher's splash.
 */
import { describe, expect, test } from 'bun:test';

import { answerIsGaiaHealth, forgeCountsOf, healthDocumentOf } from './HealthDocument.ts';

const FORGE_COUNTS = { forgesRegistered: 5, forgesAnswered: 3 } as const;

describe('the health document', () => {
  test('names Gaia at the known health and install versions, with the forge counts it is handed', () => {
    expect(healthDocumentOf(FORGE_COUNTS)).toEqual({
      application:      'gaia',
      healthVersion:    1,
      installVersion:   1,
      forgesRegistered: 5,
      forgesAnswered:   3,
    });
  });
});

describe('an answer that is Gaia\'s health', () => {
  test('says Gaia under its own application key, also at another health version', () => {
    expect([answerIsGaiaHealth(healthDocumentOf(FORGE_COUNTS)), answerIsGaiaHealth({ application: 'gaia', healthVersion: 2 })]).toEqual([true, true]);
  });

  test('is none of another application, no object, or an application key it only inherits', () => {
    const inheritedApplication: unknown = Object.create({ application: 'gaia' });
    expect([
      answerIsGaiaHealth({ application: 'example-application' }),
      answerIsGaiaHealth({ name: 'gaia' }),
      answerIsGaiaHealth(null),
      answerIsGaiaHealth('gaia'),
      answerIsGaiaHealth(inheritedApplication),
    ]).toEqual([false, false, false, false, false]);
  });
});

describe('the forge counts of a health answer', () => {
  test('are read from Gaia\'s health at the known version', () => {
    expect(forgeCountsOf(healthDocumentOf(FORGE_COUNTS))).toEqual(FORGE_COUNTS);
  });

  test('are not read at another health version, from another application, or when a count is no count', () => {
    expect([
      forgeCountsOf({ ...healthDocumentOf(FORGE_COUNTS), healthVersion: 2 }),
      forgeCountsOf({ ...healthDocumentOf(FORGE_COUNTS), application: 'example-application' }),
      forgeCountsOf({ ...healthDocumentOf(FORGE_COUNTS), forgesAnswered: -1 }),
      forgeCountsOf({ ...healthDocumentOf(FORGE_COUNTS), forgesRegistered: '5' }),
    ]).toEqual([null, null, null, null]);
  });
});
