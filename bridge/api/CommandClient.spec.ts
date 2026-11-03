/**
 * The command client against the recorded Overseer API. What matters: the token comes from `/api/session-token` once and rides every post as
 * a bearer header; a 401 (a rotated token) fetches it again and retries once; 200, 409, 423 and an unreachable Overseer each map to their
 * verdict, the refusal kept verbatim; a session token answered 401 is `no-session`, which the Bridge words as a lost session.
 */
import { describe, expect, test } from 'bun:test';

// Renamed, since the React hook rule in `bridge/` reads every `use` call as a hook.
import { recordedOverseerAnswerOf, useRecordedOverseerFetch as recordedOverseerOfThisSpecFile } from '../../src/testing/RecordedOverseerAnswers.ts';
import { OVERSEER_CALL_SHAPES, type OverseerCallShape, type RecordedHttpResponse }              from '../../src/testing/RecordedOverseerFetch.ts';
import { CommandClient }                                                                        from './CommandClient.ts';

const recordedOverseer = recordedOverseerOfThisSpecFile();

function recordedRefusalOf(callShape: OverseerCallShape): string {
  return ((recordedOverseerAnswerOf(callShape) as RecordedHttpResponse).body as { refusal: string }).refusal;
}

function exchangesOf(overseer: ReturnType<typeof recordedOverseer>): { path: string; authorization: string | null }[] {
  return overseer.requests.map(({ path, authorization }) => ({ path, authorization }));
}

describe('the command client', () => {
  test('fetches the token once and sends it as a bearer header with every command', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const client = CommandClient.create(overseer.fetch);
    const applied = recordedOverseerAnswerOf(OVERSEER_CALL_SHAPES.COMMAND_APPLIED) as RecordedHttpResponse;
    const { outcome } = applied.body as { outcome: unknown };
    expect(await client.send({ kind: 'overseer-pause' })).toMatchObject({ verdict: 'applied', outcome, result: { previousState: 'paused' } });
    await client.send({ kind: 'overseer-pause' });
    expect(exchangesOf(overseer)).toEqual([
      { path: '/api/session-token', authorization: null },
      { path: '/api/commands', authorization: 'Bearer token-1' },
      { path: '/api/commands', authorization: 'Bearer token-1' },
    ]);
  });

  test('a 401 fetches the rotated token and retries once', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const client = CommandClient.create(overseer.fetch);
    await client.send({ kind: 'overseer-pause' });
    overseer.rotateToken('token-2');
    expect((await client.send({ kind: 'overseer-resume' })).verdict).toBe('applied');
    expect(overseer.requests.map((request) => request.authorization)).toEqual([null, 'Bearer token-1', 'Bearer token-1', null, 'Bearer token-2']);
  });

  test('a 409 is refused with the Overseer\'s sentence verbatim, a 423 is install-held, and an Overseer gone is unreachable', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true });
    const client = CommandClient.create(overseer.fetch);
    overseer.answerCommandsWith('refused');
    expect(await client.send({ kind: 'ticket-ready' })).toEqual({ verdict: 'refused', refusal: recordedRefusalOf(OVERSEER_CALL_SHAPES.COMMAND_REFUSED) });
    overseer.answerCommandsWith('install-held');
    expect(await client.send({ kind: 'ticket-ready' })).toEqual({ verdict: 'install-held', refusal: recordedRefusalOf(OVERSEER_CALL_SHAPES.COMMAND_INSTALL_HELD) });
    overseer.stop();
    expect(await CommandClient.create(overseer.fetch).send({ kind: 'overseer-pause' })).toEqual({ verdict: 'unreachable' });
  });

  test('a session token refused 403 (a page of another origin) leaves the command unsent as unreachable', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true });
    const fromAnotherOrigin = (input: string, init?: RequestInit) => overseer.fetch(input, { ...init, headers: { origin: 'http://example.com' } });
    expect(await CommandClient.create(fromAnotherOrigin).send({ kind: 'overseer-pause' })).toEqual({ verdict: 'unreachable' });
    expect(exchangesOf(overseer).map((exchange) => exchange.path)).toEqual(['/api/session-token']);
  });

  test('A4: a session token answered 401 leaves the command unsent as no-session', async () => {
    const overseer = recordedOverseer();
    expect(await CommandClient.create(overseer.fetch).send({ kind: 'overseer-pause' })).toEqual({ verdict: 'no-session' });
    expect(exchangesOf(overseer).map((exchange) => exchange.path)).toEqual(['/api/session-token']);
  });

  test('A4: a command 401 whose token refetch answers 401 is no-session', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const client = CommandClient.create(overseer.fetch);
    await client.send({ kind: 'overseer-pause' });
    overseer.rotateToken('token-2');
    overseer.forgetSessionCookie();
    expect(await client.send({ kind: 'overseer-pause' })).toEqual({ verdict: 'no-session' });
  });
});
