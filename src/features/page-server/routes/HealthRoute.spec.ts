/**
 * The health route answers the health document of the forge counts it is handed as JSON that no cache keeps; the document itself is held
 * by the health contract's own spec.
 */
import { describe, expect, test } from 'bun:test';

import { healthDocumentOf } from '../../../adapters/gaia-server/HealthDocument.ts';

import { healthAnswerOf } from './HealthRoute.ts';

const FORGE_COUNTS = { forgesRegistered: 5, forgesAnswered: 3 } as const;

describe('the health route', () => {
  test('answers the health document as JSON that no cache keeps', async () => {
    const answer = healthAnswerOf(FORGE_COUNTS);
    expect([answer.status, answer.headers.get('cache-control')]).toEqual([200, 'no-store']);
    expect(await answer.json()).toEqual(healthDocumentOf(FORGE_COUNTS));
  });
});
