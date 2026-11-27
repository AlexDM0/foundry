/**
 * The board's picture client against answers in the page's contract: the bytes posted with the file's type, the stored picture back, the
 * forge's refusal verbatim, a 401 `no-session`, and nothing answering or an answer of another version `unreachable`.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_ENDPOINT_VERSIONS }           from '../../../src/shared/constants/GaiaSystemVersions.ts';
import type { PictureUploadAnswerDocument } from '../../@types/board/BoardRelayDocuments.ts';
import { fakeRelayRequests, headersOf }     from '../testing/FakeRelay.ts';
import { PictureUploadClient }              from './PictureUploadClient.ts';

const PICTURE_ID = 'c'.repeat(64);

const PNG_FILE = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });

function relayAnswerOf(status: number, content: Omit<PictureUploadAnswerDocument, 'pictureUploadAnswerVersion'>): Response {
  return Response.json({ pictureUploadAnswerVersion: 1, ...content } satisfies PictureUploadAnswerDocument, { status });
}

describe('the board\'s picture client', () => {
  test('posts the bytes with the file\'s type to the relay\'s pictures route, with the session cookie and no Authorization header', async () => {
    const relay = fakeRelayRequests();
    relay.answerWith(relayAnswerOf(200, { outcome: 'uploaded', picture: { pictureId: PICTURE_ID, bytes: 2, mediaType: 'image/png' }, refusal: null }));
    relay.answerWith(Response.json({}));
    const client = PictureUploadClient.create('example-tracker', relay.sendRequest);
    expect(await client.upload(PNG_FILE)).toEqual({
      verdict: 'uploaded', pictureId: PICTURE_ID, bytes: 2, mediaType: 'image/png'
    });
    await client.upload(new Blob([new Uint8Array([0x01])]));
    const [pictureRequest, untypedRequest] = relay.sent;
    expect(pictureRequest?.path).toBe(`/api/v${GAIA_ENDPOINT_VERSIONS.forgePictureUpload}/forges/example-tracker/pictures`);
    expect([pictureRequest?.requestOptions.method, pictureRequest?.requestOptions.credentials, pictureRequest?.requestOptions.body]).toEqual(['POST', 'same-origin', PNG_FILE]);
    expect([headersOf(pictureRequest).get('content-type'), headersOf(pictureRequest).has('authorization')]).toEqual(['image/png', false]);
    expect(headersOf(untypedRequest).get('content-type')).toBe('application/octet-stream');
  });

  test('a forge refusal keeps its sentence verbatim', async () => {
    const relay = fakeRelayRequests();
    const sentence = 'The picture is larger than this board takes (3.8 MB).';
    relay.answerWith(relayAnswerOf(409, {
      outcome: 'refused',
      picture: null,
      refusal: {
        refusedBy: 'forge', code: 'picture-too-large', fields: {}, text: sentence
      }
    }));
    expect(await PictureUploadClient.create('example-tracker', relay.sendRequest).upload(PNG_FILE)).toEqual({ verdict: 'refused', refusal: sentence });
  });

  test('a 401 is no-session; nothing answering, or an answer of another version, is unreachable', async () => {
    const relay = fakeRelayRequests();
    const client = PictureUploadClient.create('example-tracker', relay.sendRequest);
    relay.answerWith(new Response(null, { status: 401 }));
    expect(await client.upload(PNG_FILE)).toEqual({ verdict: 'no-session' });
    expect(await client.upload(PNG_FILE)).toEqual({ verdict: 'unreachable' });
    relay.answerWith(Response.json({
      pictureUploadAnswerVersion: 2, outcome: 'uploaded', picture: { pictureId: PICTURE_ID, bytes: 2, mediaType: 'image/png' }, refusal: null
    }));
    expect(await client.upload(PNG_FILE)).toEqual({ verdict: 'unreachable' });
  });
});
