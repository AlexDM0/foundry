/**
 * The session token against the recorded Overseer API. What matters: the token comes from `/api/session-token` once and rides every post
 * as a bearer header; a 401 (a rotated token) fetches it again and retries once; a session token refused 403 (a page of another origin) or
 * an Overseer gone is `unreachable`; a session token answered 401 is `no-session`, which the Bridge words as a lost session, also when the
 * refetch after a rotation is refused.
 */
import { describe, expect, test } from 'bun:test';

// Renamed, since the React hook rule in `bridge/` reads every `use` call as a hook.
import { useRecordedOverseerFetch as recordedOverseerOfThisSpecFile } from '../../src/testing/RecordedOverseerAnswers.ts';
import { SessionTokenSource }                                         from './SessionTokenSource.ts';

const recordedOverseer = recordedOverseerOfThisSpecFile();

const COMMAND_BODY = JSON.stringify({ kind: 'overseer-pause' });

function exchangesOf(overseer: ReturnType<typeof recordedOverseer>): { path: string; authorization: string | null }[] {
  return overseer.requests.map(({ path, authorization }) => ({ path, authorization }));
}

describe('the session token source', () => {
  test('fetches the token once and sends it as a bearer header with every post', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const source = SessionTokenSource.create(overseer.fetch);
    expect((await source.post('/api/commands', {}, COMMAND_BODY)).verdict).toBe('answered');
    await source.post('/api/commands', {}, COMMAND_BODY);
    expect(exchangesOf(overseer)).toEqual([
      { path: '/api/session-token', authorization: null },
      { path: '/api/commands', authorization: 'Bearer token-1' },
      { path: '/api/commands', authorization: 'Bearer token-1' },
    ]);
  });

  test('a 401 fetches the rotated token and retries once', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const source = SessionTokenSource.create(overseer.fetch);
    await source.post('/api/commands', {}, COMMAND_BODY);
    overseer.rotateToken('token-2');
    const posted = await source.post('/api/commands', {}, COMMAND_BODY);
    expect(posted.verdict === 'answered' ? posted.response.status : null).toBe(200);
    expect(overseer.requests.map((request) => request.authorization)).toEqual([null, 'Bearer token-1', 'Bearer token-1', null, 'Bearer token-2']);
  });

  test('a session token refused 403 (a page of another origin) leaves the post unsent as unreachable, and so does an Overseer gone', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true });
    const fromAnotherOrigin = (input: string, init?: RequestInit) => overseer.fetch(input, { ...init, headers: { origin: 'http://example.com' } });
    expect(await SessionTokenSource.create(fromAnotherOrigin).post('/api/commands', {}, COMMAND_BODY)).toEqual({ verdict: 'unreachable' });
    expect(exchangesOf(overseer).map((exchange) => exchange.path)).toEqual(['/api/session-token']);
    overseer.stop();
    expect(await SessionTokenSource.create(overseer.fetch).post('/api/commands', {}, COMMAND_BODY)).toEqual({ verdict: 'unreachable' });
  });

  test('A4: a session token answered 401 leaves the post unsent as no-session', async () => {
    const overseer = recordedOverseer();
    expect(await SessionTokenSource.create(overseer.fetch).post('/api/commands', {}, COMMAND_BODY)).toEqual({ verdict: 'no-session' });
    expect(exchangesOf(overseer).map((exchange) => exchange.path)).toEqual(['/api/session-token']);
  });

  test('A4: a post answered 401 whose token refetch answers 401 is no-session', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const source = SessionTokenSource.create(overseer.fetch);
    await source.post('/api/commands', {}, COMMAND_BODY);
    overseer.rotateToken('token-2');
    overseer.forgetSessionCookie();
    expect(await source.post('/api/commands', {}, COMMAND_BODY)).toEqual({ verdict: 'no-session' });
  });
});
