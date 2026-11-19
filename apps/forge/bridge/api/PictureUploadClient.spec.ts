/**
 * The picture client against the recorded Overseer API. What matters: it posts the picture's raw bytes with its type and the session token;
 * a stored picture answers its id, size and the type the Overseer read from its bytes; a picture too large or of a type the Overseer does
 * not take is refused with the Overseer's sentence verbatim; and a lost session or a gone Overseer reads as the command client reads it.
 */
import { describe, expect, test } from 'bun:test';

// Renamed, since the React hook rule in `bridge/` reads every `use` call as a hook.
import { recordedOverseerAnswerOf, useRecordedOverseerFetch as recordedOverseerOfThisSpecFile } from '../../src/testing/RecordedOverseerAnswers.ts';
import { OVERSEER_CALL_SHAPES, type OverseerCallShape, type RecordedHttpResponse }              from '../../src/testing/RecordedOverseerFetch.ts';
import { PictureUploadClient }                                                                  from './PictureUploadClient.ts';

const recordedOverseer = recordedOverseerOfThisSpecFile();

const EXAMPLE_PICTURE = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });

function recordedBodyOf(callShape: OverseerCallShape): unknown {
  return (recordedOverseerAnswerOf(callShape) as RecordedHttpResponse).body;
}

describe('the picture client', () => {
  test('posts the raw bytes with their type and the token, and a stored picture answers its id, size and type', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true, token: 'token-1' });
    const uploaded = recordedBodyOf(OVERSEER_CALL_SHAPES.PICTURE_UPLOADED) as { pictureId: string; bytes: number; mediaType: string };
    expect(await PictureUploadClient.create(overseer.fetch).upload(EXAMPLE_PICTURE)).toEqual({ verdict: 'uploaded', ...uploaded });
    const [, uploadRequest] = overseer.requests;
    expect(uploadRequest?.authorization).toBe('Bearer token-1');
    expect(uploadRequest?.init?.body).toBe(EXAMPLE_PICTURE);
    expect(new Headers(uploadRequest?.init?.headers).get('content-type')).toBe('image/png');
  });

  test('a picture too large or of a type the Overseer does not take is refused with its sentence verbatim', async () => {
    const overseer = recordedOverseer({ holdsSessionCookie: true });
    const client = PictureUploadClient.create(overseer.fetch);
    for (const [verdict, callShape] of [
      ['too-large', OVERSEER_CALL_SHAPES.PICTURE_TOO_LARGE],
      ['type-unsupported', OVERSEER_CALL_SHAPES.PICTURE_TYPE_UNSUPPORTED],
    ] as const) {
      overseer.answerPicturesWith(verdict);
      expect(await client.upload(EXAMPLE_PICTURE)).toEqual({ verdict: 'refused', refusal: (recordedBodyOf(callShape) as { text: string }).text });
    }
  });

  test('a session token answered 401 is no-session, and an Overseer gone is unreachable', async () => {
    const overseer = recordedOverseer();
    expect(await PictureUploadClient.create(overseer.fetch).upload(EXAMPLE_PICTURE)).toEqual({ verdict: 'no-session' });
    overseer.stop();
    expect(await PictureUploadClient.create(overseer.fetch).upload(EXAMPLE_PICTURE)).toEqual({ verdict: 'unreachable' });
  });
});
