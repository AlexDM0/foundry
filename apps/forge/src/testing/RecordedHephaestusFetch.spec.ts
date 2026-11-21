/**
 * The recorded Hephaestus `fetch` against this OS's recording. What matters: it answers only with a recorded response, its run values filled
 * in; a request with no recorded answer fails; and it refuses what the real server refuses, a data route with no token above all,
 * then a foreign Host, a foreign Origin, another token, a taken port, and any request once nothing listens. A picture upload
 * answers the verdict the spec chose with the token, as a command does.
 */
import { describe, expect, test } from 'bun:test';

import { recordedHephaestusAnswerOf, recordedHephaestusAnswersOfThisOs }                    from './RecordedHephaestusAnswers.ts';
import { createRecordedHephaestusFetch, HEPHAESTUS_CALL_SHAPES, type RecordedHttpResponse } from './RecordedHephaestusFetch.ts';

const TOKEN_HEADERS = { authorization: 'Bearer example-token' };

function recordedHephaestus(options: Parameters<typeof createRecordedHephaestusFetch>[1] = {}) {
  return createRecordedHephaestusFetch(recordedHephaestusAnswersOfThisOs(), options);
}

describe('the recorded Hephaestus fetch', () => {
  test('a data route with no token is refused 401, as the real server refuses it, and answers the token its document', async () => {
    const hephaestus = recordedHephaestus();
    const refused = await hephaestus.fetch('/api/state', { headers: { cookie: `forge-session-${hephaestus.port}=example-secret` } });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ refusal: 'unauthorized', text: expect.any(String) });
    expect((await hephaestus.fetch('/api/state', { headers: TOKEN_HEADERS })).status).toBe(200);
    expect(hephaestus.requests.map((request) => request.callShape)).toEqual([HEPHAESTUS_CALL_SHAPES.STATE_NO_TOKEN, HEPHAESTUS_CALL_SHAPES.STATE]);
  });

  test('a command answers as the spec chose with the token, and 401 with another one', async () => {
    const hephaestus = recordedHephaestus();
    const post = (authorization: string) => hephaestus.fetch('/api/commands', { method: 'POST', headers: { authorization }, body: '{"kind":"hephaestus-pause"}' });
    expect((await post(TOKEN_HEADERS.authorization)).status).toBe(200);
    hephaestus.answerCommandsWith('refused');
    const refused = await post(TOKEN_HEADERS.authorization);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual((recordedHephaestusAnswerOf(HEPHAESTUS_CALL_SHAPES.COMMAND_REFUSED) as RecordedHttpResponse).body);
    hephaestus.answerCommandsWith('install-held');
    expect((await post(TOKEN_HEADERS.authorization)).status).toBe(423);
    hephaestus.rotateToken('token-2');
    expect((await post(TOKEN_HEADERS.authorization)).status).toBe(401);
  });

  test('a picture upload answers as the spec chose with the token, and 401 with another one', async () => {
    const hephaestus = recordedHephaestus();
    const upload = (authorization: string) => hephaestus.fetch('/api/pictures', { method: 'POST', headers: { authorization }, body: new Uint8Array([0x89]) });
    expect((await upload(TOKEN_HEADERS.authorization)).status).toBe(200);
    hephaestus.answerPicturesWith('too-large');
    expect((await upload(TOKEN_HEADERS.authorization)).status).toBe(413);
    hephaestus.answerPicturesWith('type-unsupported');
    expect((await upload(TOKEN_HEADERS.authorization)).status).toBe(415);
    expect((await upload('Bearer another-token')).status).toBe(401);
  });

  test('a foreign Host and a foreign Origin are refused 403', async () => {
    const hephaestus = recordedHephaestus();
    expect((await hephaestus.fetch('/api/identity', { headers: { host: `example.com:${hephaestus.port}` } })).status).toBe(403);
    expect((await hephaestus.fetch('/api/identity', { headers: { origin: 'http://example.com' } })).status).toBe(403);
    expect((await hephaestus.fetch('/api/identity', { headers: { origin: `http://localhost:${hephaestus.port}` } })).status).toBe(200);
  });

  test('a taken port is refused hephaestus-port-in-use, and once nothing listens a request fails as fetch fails', async () => {
    const hephaestus = recordedHephaestus();
    expect(() => hephaestus.startOnGivenPort(hephaestus.port)).toThrow('hephaestus-port-in-use');
    hephaestus.stop();
    await expect(hephaestus.fetch('/api/identity')).rejects.toMatchObject({ name: 'TypeError', code: 'ConnectionRefused' });
    await expect(recordedHephaestus().fetch('http://127.0.0.1:1/api/identity')).rejects.toMatchObject({ code: 'ConnectionRefused' });
  });

  test('a request with no recorded answer fails, and is kept for the case to fail on', async () => {
    const hephaestus = recordedHephaestus();
    await expect(hephaestus.fetch('/api/summary')).rejects.toThrow('GET /api/summary has no recorded answer');
    const withoutIdentity = createRecordedHephaestusFetch(new Map());
    await expect(withoutIdentity.fetch('/api/identity')).rejects.toThrow(`${HEPHAESTUS_CALL_SHAPES.IDENTITY} has no recorded answer`);
    expect(hephaestus.takeUnansweredCalls()).toHaveLength(1);
    expect(withoutIdentity.takeUnansweredCalls()).toHaveLength(1);
    expect(hephaestus.takeUnansweredCalls()).toEqual([]);
  });
});
