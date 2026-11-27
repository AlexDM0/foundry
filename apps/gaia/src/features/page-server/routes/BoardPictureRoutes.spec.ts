/**
 * A forge's pictures relayed over Example Storefront's recorded pictures: an upload forwards the page's bytes and type, a refusal keeps the forge's
 * sentence, an oversized body is refused unread, a picture reads back under the forge's type, sandboxed and never sniffed, and each unreachable
 * forge is its own refusal with the token in no answer.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { recordedBoardDocumentOf }                                                       from '../../../adapters/forge-api/testing/BoardDocuments.ts';
import { BOARD_PICTURE_UPLOAD_LIMIT_BYTES }                                              from '../../../shared/constants/Limits.ts';
import { recordedBoardAnswersOf, recordedHephaestusFetch, type RecordedHephaestusFetch } from '../../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath }                                     from '../../../testing/ScratchRoot.ts';
import {
  EXAMPLE_FORGE_TOKEN,
  STOREFRONT_TRACKER_ID,
  boardAnswering,
  exampleRelayForgeOf,
  exampleTokenFileIn,
  relaySourcesOver,
  stoppedForgeAnswering,
  type ExampleRelayForgeOptions,
} from '../testing/ExampleRelayForge.ts';
import { pictureAnswerFor, pictureUploadAnswerFor } from './BoardPictureRoutes.ts';

const UPLOAD_CALL_SHAPE = 'POST /api/v1/pictures with bearer';
const EXAMPLE_BOUND_BYTES = 1_024;
const RECORDED_PICTURE_ID = '6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0';

/** The picture the recording uploaded and read back, as the bytes the forge served. */
function recordedPictureBytes(): Uint8Array {
  const answer = recordedBoardAnswersOf('picture-accepted').find(({ callShape }) => callShape.startsWith('GET '))?.answer;
  if (answer?.verdict !== 'answered' || answer.bodyBytes === null) throw new Error('The picture-accepted situation holds no picture read as bytes.');
  return new Uint8Array(Buffer.from(answer.bodyBytes, 'base64'));
}

let scratchFolder = '';
let tokenPath = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('board-picture-routes');
  tokenPath     = exampleTokenFileIn(scratchFolder);
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

function sourcesOver(hephaestusFetch: RecordedHephaestusFetch, options: ExampleRelayForgeOptions = {}) {
  return relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath, options), hephaestusFetch);
}

/** As a browser sends it: with the body's declared length. */
function uploadRequest(bytes: Uint8Array): Request {
  const headers = { 'content-type': 'image/png', 'content-length': String(bytes.length) };
  return new Request('http://127.0.0.1:4790/api/v1/forges/example-storefront-7c41/pictures', { method: 'POST', body: bytes, headers });
}

describe('a picture upload', () => {
  test('forwards the page\'s bytes and content type, and answers the picture the forge stored', async () => {
    const hephaestusFetch = boardAnswering('picture-accepted', (callShape) => callShape === UPLOAD_CALL_SHAPE);
    const picture = recordedPictureBytes();
    const answer = await pictureUploadAnswerFor(uploadRequest(picture), STOREFRONT_TRACKER_ID, sourcesOver(hephaestusFetch), EXAMPLE_BOUND_BYTES);
    expect([answer.status, answer.headers.get('cache-control'), await answer.json()]).toEqual([200, 'no-store', {
      pictureUploadAnswerVersion: 1,
      outcome:                    'uploaded',
      picture:                    { pictureId: RECORDED_PICTURE_ID, bytes: 70, mediaType: 'image/png' },
      refusal:                    null,
    }]);
    const [call] = hephaestusFetch.callsAnswered();
    expect([call?.bearerToken, call?.byteBody?.mediaType, [...call?.byteBody?.bytes ?? []]]).toEqual([EXAMPLE_FORGE_TOKEN, 'image/png', [...picture]]);
  });

  test('answers a forge\'s refusal with the forge\'s code, fields and sentence unchanged, under a conflict status', async () => {
    const hephaestusFetch = boardAnswering('picture-too-large');
    const [recorded] = recordedBoardAnswersOf('picture-too-large');
    const sentence = recorded?.answer.verdict === 'answered' ? (JSON.parse(recorded.answer.bodyText) as { readonly text: string }).text : '';
    const answer = await pictureUploadAnswerFor(uploadRequest(recordedPictureBytes()), STOREFRONT_TRACKER_ID, sourcesOver(hephaestusFetch), EXAMPLE_BOUND_BYTES);
    expect([answer.status, await answer.json()]).toEqual([409, {
      pictureUploadAnswerVersion: 1,
      outcome:                    'refused',
      picture:                    null,
      refusal:                    {
        refusedBy: 'forge', code: 'picture-too-large', fields: { bytes: 3_932_161, sizeLimitBytes: 3_932_160 }, text: sentence
      },
    }]);
  });

  test('refuses a body over its bound unread, and asks the forge nothing', async () => {
    const hephaestusFetch = recordedHephaestusFetch([]);
    const request = uploadRequest(new Uint8Array(EXAMPLE_BOUND_BYTES + 1));
    const answer = await pictureUploadAnswerFor(request, STOREFRONT_TRACKER_ID, sourcesOver(hephaestusFetch), EXAMPLE_BOUND_BYTES);
    expect([answer.status, await answer.json()]).toEqual([413, {
      pictureUploadAnswerVersion: 1,
      outcome:                    'refused',
      picture:                    null,
      refusal:                    { refusedBy: 'gaia', code: 'too-large', text: 'This is larger than Gaia takes for this request.' },
    }]);
    expect([request.bodyUsed, hephaestusFetch.callsAnswered()]).toEqual([false, []]);
  });

  test('is refused as forge-unreachable when Hephaestus does not answer, and as forge-not-registered for a forge the registry does not name', async () => {
    const stoppedForge = sourcesOver(stoppedForgeAnswering([UPLOAD_CALL_SHAPE]));
    const unreachable = await pictureUploadAnswerFor(uploadRequest(recordedPictureBytes()), STOREFRONT_TRACKER_ID, stoppedForge, EXAMPLE_BOUND_BYTES);
    const unreachableRefusal = ((await unreachable.json()) as { readonly refusal: unknown }).refusal;
    expect([unreachable.status, unreachableRefusal]).toEqual([502, { refusedBy: 'gaia', code: 'forge-unreachable', text: 'This forge does not answer.' }]);
    const forgeAccess = relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath), recordedHephaestusFetch([]), { verdict: 'readable', forges: [] });
    const unregistered = await pictureUploadAnswerFor(uploadRequest(recordedPictureBytes()), STOREFRONT_TRACKER_ID, forgeAccess, EXAMPLE_BOUND_BYTES);
    expect(unregistered.status).toBe(404);
  });
});

describe('a picture read back', () => {
  test('answers the forge\'s bytes under its content type, never sniffed, sandboxed and never stored', async () => {
    const hephaestusFetch = boardAnswering('picture-accepted', (callShape) => callShape.startsWith('GET '));
    const answer = await pictureAnswerFor(STOREFRONT_TRACKER_ID, RECORDED_PICTURE_ID, sourcesOver(hephaestusFetch));
    expect([
      answer.status,
      answer.headers.get('content-type'),
      answer.headers.get('x-content-type-options'),
      answer.headers.get('content-security-policy'),
      answer.headers.get('cache-control'),
    ]).toEqual([200, 'image/png', 'nosniff', 'sandbox', 'no-store']);
    expect([...new Uint8Array(await answer.arrayBuffer())]).toEqual([...recordedPictureBytes()]);
  });

  test('is forge-unreachable when Hephaestus does not answer, and token-unreadable when the registry names no token file', async () => {
    const pictureCallShape = `GET /api/v1/pictures/${RECORDED_PICTURE_ID} with bearer`;
    const unreachable = await pictureAnswerFor(STOREFRONT_TRACKER_ID, RECORDED_PICTURE_ID, sourcesOver(stoppedForgeAnswering([pictureCallShape])));
    expect([unreachable.status, await unreachable.json()]).toEqual([502, { refusal: 'forge-unreachable', refusedBy: 'gaia' }]);
    const noToken = await pictureAnswerFor(STOREFRONT_TRACKER_ID, RECORDED_PICTURE_ID, sourcesOver(recordedHephaestusFetch([]), { tokenPath: null }));
    expect([noToken.status, await noToken.json()]).toEqual([502, { refusal: 'token-unreadable', refusedBy: 'gaia' }]);
  });
});

describe('Gaia\'s bound on an upload', () => {
  test('takes every picture the recorded forge\'s served limits admit, so a picture too large is refused in the forge\'s sentence', async () => {
    const board = await recordedBoardDocumentOf('board-at-work') as { readonly pictureLimits?: { readonly sizeLimitBytes?: unknown } | null };
    const forgeSizeLimitBytes = board.pictureLimits?.sizeLimitBytes;
    expect(typeof forgeSizeLimitBytes).toBe('number');
    expect(BOARD_PICTURE_UPLOAD_LIMIT_BYTES).toBeGreaterThanOrEqual(forgeSizeLimitBytes as number);
  });
});
