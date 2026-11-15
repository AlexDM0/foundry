/**
 * The frame session request. What matters (PLAN 8.3, SCREENS B1 acceptance 4): the page asks at the forge's own path with nothing but its
 * session cookie, no token and no code; every outcome of the answer reaches the view, the forge's refusal unchanged; an answer at another
 * `frameSessionVersion`, of another shape, or whose frame address the page may not frame, is not understood; no answer is the server's.
 * Gaia's server is stood in for by answers authored from PLAN 6.3 and 8.3, since the page's specs run without a server.
 */
import { describe, expect, test } from 'bun:test';

import { FRAME_SESSION_ANSWERS, frameUrlOf } from '../../testing/AuthoredBridge.ts';
import { answerResponse, type SentRequest }  from '../../testing/CommandServer.ts';
import { FrameSessionRequest }               from './FrameSessionRequest.ts';

const TRACKER_ID = 'example-storefront-7c41';

const HTTP_CONFLICT = 409;
const HTTP_BAD_GATEWAY = 502;
const HTTP_NOT_IMPLEMENTED = 501;

function serverAnswering(response: () => Promise<Response>, sent: SentRequest[] = []) {
  return (path: string, requestOptions: RequestInit): Promise<Response> => {
    sent.push({ path, requestOptions });
    return response();
  };
}

async function resultOfAnswer(answer: unknown, status?: number) {
  return FrameSessionRequest.requestFrameSession(serverAnswering(async () => answerResponse(answer, status)), TRACKER_ID);
}

describe('the request', () => {
  test('posts to the forge\'s own frame session path with the page\'s cookie and nothing else', async () => {
    const sent: SentRequest[] = [];
    await FrameSessionRequest.requestFrameSession(serverAnswering(async () => answerResponse(FRAME_SESSION_ANSWERS.opened(1)), sent), TRACKER_ID);
    expect(sent).toEqual([{ path: '/api/forges/example-storefront-7c41/frame-session', requestOptions: { method: 'POST', credentials: 'same-origin' } }]);
  });

  test('encodes a tracker id that would leave its path segment', () => {
    expect(FrameSessionRequest.frameSessionPathOf('odd/id?x')).toBe('/api/forges/odd%2Fid%3Fx/frame-session');
  });
});

describe('the answer', () => {
  test('a session gives the frame\'s address and the origin its messages must come from', async () => {
    expect(await resultOfAnswer(FRAME_SESSION_ANSWERS.opened(1)))
      .toEqual({ verdict: 'opened', frameUrl: frameUrlOf(1), frameOrigin: 'http://127.0.0.1:4951' });
  });

  test('every other outcome reaches the view whatever its status, the forge\'s refusal unchanged', async () => {
    expect(await resultOfAnswer(FRAME_SESSION_ANSWERS.notSupported, HTTP_NOT_IMPLEMENTED)).toEqual({ verdict: 'not-supported' });
    expect(await resultOfAnswer(FRAME_SESSION_ANSWERS.unreachable, HTTP_BAD_GATEWAY)).toEqual({ verdict: 'unreachable' });
    expect(await resultOfAnswer(FRAME_SESSION_ANSWERS.tokenRejected, HTTP_CONFLICT)).toEqual({ verdict: 'refused', refusal: 'token-rejected', text: null });
    expect(await resultOfAnswer(FRAME_SESSION_ANSWERS.forgeRefused, HTTP_CONFLICT))
      .toEqual({ verdict: 'refused', refusal: 'sessions-full', text: 'The Overseer holds as many sessions as it allows.' });
  });

  test('is not understood at another version, of another shape, or with a frame address the page may not frame', async () => {
    const opened = FRAME_SESSION_ANSWERS.opened(1);
    const notUnderstood = { verdict: 'answer-not-understood' } as const;
    expect(await resultOfAnswer({ ...opened, frameSessionVersion: 2 })).toEqual(notUnderstood);
    expect(await resultOfAnswer({ ...opened, outcome: 'opened' })).toEqual(notUnderstood);
    expect(await resultOfAnswer({ ...opened, frameUrl: 7 })).toEqual(notUnderstood);
    expect(await resultOfAnswer({ ...opened, frameUrl: null })).toEqual(notUnderstood);
    expect(await resultOfAnswer({ ...opened, frameUrl: 'not an address' })).toEqual(notUnderstood);
    expect(await resultOfAnswer({ ...opened, frameUrl: 'javascript:alert(1)' })).toEqual(notUnderstood);
    expect(await resultOfAnswer([opened])).toEqual(notUnderstood);
    const notJson = await FrameSessionRequest.requestFrameSession(serverAnswering(async () => new Response('<html>')), TRACKER_ID);
    expect(notJson).toEqual(notUnderstood);
  });

  test('no answer at all is the server\'s, not the forge\'s', async () => {
    const result = await FrameSessionRequest.requestFrameSession(() => Promise.reject(new TypeError('Failed to fetch')), TRACKER_ID);
    expect(result).toEqual({ verdict: 'server-unreachable' });
  });
});
