/**
 * The recorded Overseer `fetch` against this OS's recording. What matters: it answers only with a recorded response, its run values filled
 * in; a request with no recorded answer fails; and it refuses what the real server refuses, a data route with no session cookie above all,
 * then a foreign Host, a foreign Origin, a spent code, another token, a taken port, and any request once nothing listens. A picture upload
 * answers the verdict the spec chose with the token, as a command does.
 */
import { describe, expect, test } from 'bun:test';

import { recordedOverseerAnswerOf, recordedOverseerAnswersOfThisOs }                    from './RecordedOverseerAnswers.ts';
import { createRecordedOverseerFetch, OVERSEER_CALL_SHAPES, type RecordedHttpResponse } from './RecordedOverseerFetch.ts';

const TOKEN_HEADERS = { authorization: 'Bearer example-token' };

function recordedOverseer(options: Parameters<typeof createRecordedOverseerFetch>[1] = {}) {
  return createRecordedOverseerFetch(recordedOverseerAnswersOfThisOs(), options);
}

describe('the recorded Overseer fetch', () => {
  test('a data route with no session cookie and no token is refused 401, as the real server refuses it', async () => {
    const overseer = recordedOverseer();
    for (const path of ['/api/session-token', '/api/state']) {
      const response = await overseer.fetch(path, { credentials: 'same-origin' });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ refusal: 'unauthorized', text: expect.any(String) });
    }
    expect(overseer.requests.map((request) => request.callShape)).toEqual([
      OVERSEER_CALL_SHAPES.SESSION_TOKEN_NO_SESSION, OVERSEER_CALL_SHAPES.STATE_NO_SESSION,
    ]);
  });

  test('a code it issued buys the session cookie once; the page then reads its token, and a second exchange is refused', async () => {
    const overseer = recordedOverseer();
    const codeResponse = await overseer.fetch(new URL('api/session-codes', overseer.url), { method: 'POST', headers: TOKEN_HEADERS });
    const { code } = await codeResponse.json() as { code: string };
    const exchange = () => overseer.fetch('/api/session', { method: 'POST', body: JSON.stringify({ code }) });
    const exchanged = await exchange();
    expect(exchanged.status).toBe(200);
    expect(exchanged.headers.get('set-cookie')).toContain(`-session-${overseer.port}=`);
    expect((await exchange()).status).toBe(401);
    expect(await (await overseer.fetch('/api/session-token', { credentials: 'same-origin' })).json()).toEqual({ token: 'example-token' });
    expect((await overseer.fetch('/api/session-token', { credentials: 'omit' })).status).toBe(401);
  });

  test('a command answers as the spec chose with the token, and 401 with another one', async () => {
    const overseer = recordedOverseer();
    const post = (authorization: string) => overseer.fetch('/api/commands', { method: 'POST', headers: { authorization }, body: '{"kind":"overseer-pause"}' });
    expect((await post(TOKEN_HEADERS.authorization)).status).toBe(200);
    overseer.answerCommandsWith('refused');
    const refused = await post(TOKEN_HEADERS.authorization);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual((recordedOverseerAnswerOf(OVERSEER_CALL_SHAPES.COMMAND_REFUSED) as RecordedHttpResponse).body);
    overseer.answerCommandsWith('install-held');
    expect((await post(TOKEN_HEADERS.authorization)).status).toBe(423);
    overseer.rotateToken('token-2');
    expect((await post(TOKEN_HEADERS.authorization)).status).toBe(401);
  });

  test('a picture upload answers as the spec chose with the token, and 401 with another one', async () => {
    const overseer = recordedOverseer();
    const upload = (authorization: string) => overseer.fetch('/api/pictures', { method: 'POST', headers: { authorization }, body: new Uint8Array([0x89]) });
    expect((await upload(TOKEN_HEADERS.authorization)).status).toBe(200);
    overseer.answerPicturesWith('too-large');
    expect((await upload(TOKEN_HEADERS.authorization)).status).toBe(413);
    overseer.answerPicturesWith('type-unsupported');
    expect((await upload(TOKEN_HEADERS.authorization)).status).toBe(415);
    expect((await upload('Bearer another-token')).status).toBe(401);
  });

  test('a foreign Host and a foreign Origin are refused 403', async () => {
    const overseer = recordedOverseer();
    expect((await overseer.fetch('/api/identity', { headers: { host: `example.com:${overseer.port}` } })).status).toBe(403);
    expect((await overseer.fetch('/api/identity', { headers: { origin: 'http://example.com' } })).status).toBe(403);
    expect((await overseer.fetch('/api/identity', { headers: { origin: `http://localhost:${overseer.port}` } })).status).toBe(200);
  });

  test('a taken port is refused overseer-port-in-use, and once nothing listens a request fails as fetch fails', async () => {
    const overseer = recordedOverseer();
    expect(() => overseer.startOnGivenPort(overseer.port)).toThrow('overseer-port-in-use');
    overseer.stop();
    await expect(overseer.fetch('/api/identity')).rejects.toMatchObject({ name: 'TypeError', code: 'ConnectionRefused' });
    await expect(recordedOverseer().fetch('http://127.0.0.1:1/api/identity')).rejects.toMatchObject({ code: 'ConnectionRefused' });
  });

  test('a request with no recorded answer fails, and is kept for the case to fail on', async () => {
    const overseer = recordedOverseer();
    await expect(overseer.fetch('/api/summary')).rejects.toThrow('GET /api/summary has no recorded answer');
    const withoutIdentity = createRecordedOverseerFetch(new Map());
    await expect(withoutIdentity.fetch('/api/identity')).rejects.toThrow(`${OVERSEER_CALL_SHAPES.IDENTITY} has no recorded answer`);
    expect(overseer.takeUnansweredCalls()).toHaveLength(1);
    expect(withoutIdentity.takeUnansweredCalls()).toHaveLength(1);
    expect(overseer.takeUnansweredCalls()).toEqual([]);
  });
});
