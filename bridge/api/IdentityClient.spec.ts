/**
 * The identity client against the recorded Overseer API. What matters: `GET /api/identity` needs no token and gives the board's tracker
 * id, project and code version; an Overseer gone, or an answer that is no identity, such as a foreign Host's 403, is `null`.
 */
import { describe, expect, test } from 'bun:test';

// Renamed, since the React hook rule in `bridge/` reads every `use` call as a hook.
import { recordedOverseerAnswerOf, useRecordedOverseerFetch as recordedOverseerOfThisSpecFile } from '../../src/testing/RecordedOverseerAnswers.ts';
import { OVERSEER_CALL_SHAPES, type RecordedHttpResponse }                                      from '../../src/testing/RecordedOverseerFetch.ts';
import type { OverseerIdentity }                                                                from '../@types/BoardStateDocument.ts';
import { IdentityClient }                                                                       from './IdentityClient.ts';

const recordedOverseer = recordedOverseerOfThisSpecFile();

describe('the identity client', () => {
  test('reads the tracker id, project and code version of the recorded identity, with no token', async () => {
    const overseer = recordedOverseer();
    const { trackerId, project, codeVersion } = (recordedOverseerAnswerOf(OVERSEER_CALL_SHAPES.IDENTITY) as RecordedHttpResponse).body as OverseerIdentity;
    expect(await IdentityClient.fetchIdentity(overseer.fetch)).toEqual({ trackerId, project, codeVersion });
    expect(overseer.requests.map((request) => [request.path, request.authorization])).toEqual([[IdentityClient.IDENTITY_PATH, null]]);
  });

  test('an Overseer gone and a refused answer are null', async () => {
    const overseer = recordedOverseer();
    const fromAForeignHost = (input: string) => overseer.fetch(input, { headers: { host: `example.com:${overseer.port}` } });
    expect(await IdentityClient.fetchIdentity(fromAForeignHost)).toBeNull();
    overseer.stop();
    expect(await IdentityClient.fetchIdentity(overseer.fetch)).toBeNull();
  });
});
