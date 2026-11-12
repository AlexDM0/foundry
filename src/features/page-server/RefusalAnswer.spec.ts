/**
 * The one table of the page server's refusals: each answers its status, written down here as the page and the launcher read it, with its
 * sentence as plain text on one line. A status changed in the table changes what a caller sees, so the expected table is frozen here and
 * retaken only by a deliberate change of a refusal.
 */
import { describe, expect, test } from 'bun:test';

import { refusalAnswerOf, type PageServerRefusal } from './RefusalAnswer.ts';

const EXPECTED_STATUS_OF_REFUSAL: Readonly<Record<PageServerRefusal, number>> = {
  'foreign-host':        403,
  'foreign-origin':      403,
  'opaque-origin':       403,
  'preflight':           403,
  'not-holder-of-token': 401,
  'no-session':          401,
  'code-refused':        401,
  'body-not-understood': 400,
  'not-found':           404,
  'method-not-allowed':  405,
  'page-unbuildable':    500,
  'answer-failed':       500,
};

describe('a refusal of the page server', () => {
  test('answers the status of its kind', () => {
    const refusals = Object.keys(EXPECTED_STATUS_OF_REFUSAL) as PageServerRefusal[];
    expect(Object.fromEntries(refusals.map((refusal) => [refusal, refusalAnswerOf(refusal).status]))).toEqual(EXPECTED_STATUS_OF_REFUSAL);
  });

  test('answers its sentence as one line of plain text', async () => {
    const answer = refusalAnswerOf('no-session');
    expect(answer.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await answer.text()).toBe('This route needs a session of Gaia\'s page.\n');
  });
});
