/**
 * The identity client against the recorded Overseer API. What matters: `GET /api/identity` needs no token and gives the board's tracker
 * id, project and code version; an Overseer gone, or an answer that is no identity, such as a foreign Host's 403, is `null`. A 503
 * `starting`, an Overseer whose folder watch has not started, is asked again a bounded number of times, so a page opened during the start
 * still gets its identity; any other 503 is not.
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

  test('a 503 starting is asked again after the retry delay, and the identity of the started Overseer is read', async () => {
    const overseer = recordedOverseer();
    const { trackerId, project, codeVersion } = (recordedOverseerAnswerOf(OVERSEER_CALL_SHAPES.IDENTITY) as RecordedHttpResponse).body as OverseerIdentity;
    const startingAnswerCount = 2;
    const waits: number[] = [];
    let identityRequestCount = 0;
    const startingThenStarted = (input: string) => {
      identityRequestCount += 1;
      return identityRequestCount <= startingAnswerCount ? Promise.resolve(startingResponse()) : overseer.fetch(input);
    };
    const identity = await IdentityClient.fetchIdentity(startingThenStarted, { waitMilliseconds: (milliseconds) => recordWait(waits, milliseconds) });
    expect(identity).toEqual({ trackerId, project, codeVersion });
    expect(waits).toEqual([IdentityClient.STARTING_RETRY_DELAY_MILLISECONDS, IdentityClient.STARTING_RETRY_DELAY_MILLISECONDS]);
  });

  test('an Overseer that stays starting is null after the bounded retries, with no further request', async () => {
    const waits: number[] = [];
    let identityRequestCount = 0;
    const alwaysStarting = () => {
      identityRequestCount += 1;
      return Promise.resolve(startingResponse());
    };
    expect(await IdentityClient.fetchIdentity(alwaysStarting, { waitMilliseconds: (milliseconds) => recordWait(waits, milliseconds) })).toBeNull();
    expect(identityRequestCount).toBe(IdentityClient.STARTING_RETRY_LIMIT + 1);
    expect(waits).toHaveLength(IdentityClient.STARTING_RETRY_LIMIT);
  });

  test('a 503 that is not starting is null at once, with no retry', async () => {
    let identityRequestCount = 0;
    const unavailableForAnotherReason = () => {
      identityRequestCount += 1;
      return Promise.resolve(Response.json({ refusal: 'stopping' }, { status: 503 }));
    };
    expect(await IdentityClient.fetchIdentity(unavailableForAnotherReason, { waitMilliseconds: () => Promise.resolve() })).toBeNull();
    expect(identityRequestCount).toBe(1);
  });
});

/** The answer `docs/reference/overseer-api.md` documents for `GET /api/identity` before the folder watch has started. */
function startingResponse(): Response {
  return Response.json({ refusal: 'starting' }, { status: 503 });
}

function recordWait(waits: number[], milliseconds: number): Promise<void> {
  waits.push(milliseconds);
  return Promise.resolve();
}
