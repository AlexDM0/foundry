/**
 * The page server's one status table: each answer, a refusal of the page server's, a refusal of the board relay's or how a request ended,
 * answers the status written down here as the page and the launcher read it, so the expected table is retaken only by a deliberate change.
 */
import { expect, test } from 'bun:test';

import type { PageServerAnswer } from './@types/PageServerAnswer.ts';
import { HTTP_STATUS_OF_ANSWER } from './HttpStatusOfAnswer.ts';

const EXPECTED_STATUS_OF_ANSWER: Readonly<Record<PageServerAnswer, number>> = {
  'answered':                  200,
  'answered-without-content':  204,
  'body-not-understood':       400,
  'malformed-body':            400,
  'unknown-kind':              400,
  'not-holder-of-token':       401,
  'no-session':                401,
  'code-refused':              401,
  'foreign-host':              403,
  'foreign-origin':            403,
  'opaque-origin':             403,
  'preflight':                 403,
  'not-found':                 404,
  'forge-not-registered':      404,
  'method-not-allowed':        405,
  'refused-by-forge':          409,
  'body-too-large':            413,
  'too-large':                 413,
  'install-held':              423,
  'page-unbuildable':          500,
  'answer-failed':             500,
  'command-not-supported':     501,
  'forge-version-unsupported': 501,
  'forge-unreachable':         502,
  'forge-document-unreadable': 502,
  'token-unreadable':          502,
  'token-rejected':            502,
};

test('every answer of the page server takes the status of its kind', () => {
  expect(HTTP_STATUS_OF_ANSWER).toEqual(EXPECTED_STATUS_OF_ANSWER);
});
