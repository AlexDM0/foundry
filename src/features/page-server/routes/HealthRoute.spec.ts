/**
 * The health route's contract: the document names Gaia at the known health and install versions with the forge counts it is handed, the
 * answer is never cached, and an answer is Gaia's only when its own `application` key says so, at whatever health version.
 */
import { describe, expect, test } from 'bun:test';

import { answerIsGaiaHealth, healthAnswerOf, healthDocumentOf } from './HealthRoute.ts';

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

  test('is answered as JSON that no cache keeps', async () => {
    const answer = healthAnswerOf(FORGE_COUNTS);
    expect([answer.status, answer.headers.get('cache-control')]).toEqual([200, 'no-store']);
    expect(await answer.json()).toEqual(healthDocumentOf(FORGE_COUNTS));
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
