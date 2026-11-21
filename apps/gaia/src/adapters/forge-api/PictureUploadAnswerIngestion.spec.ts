/**
 * The forge's answers to a picture upload, as a scratch forge recorded them. What matters: an accepted picture keeps its id, size and media
 * type; a picture too large and one that is no picture keep the forge's code, fields and sentence unchanged; and a body that is no such
 * answer is unreadable and names its keys.
 */
import { describe, expect, test } from 'bun:test';

import { PictureUploadAnswerIngestion }  from './PictureUploadAnswerIngestion.ts';
import { recordedPictureUploadAnswerOf } from './testing/BoardDocuments.ts';

const INGESTION = new PictureUploadAnswerIngestion();

describe('answerOf, on the recorded answers', () => {
  test('reads the picture the forge stored', async () => {
    const { status, body } = await recordedPictureUploadAnswerOf('picture-accepted');
    expect(INGESTION.answerOf(status, body)).toEqual({
      outcome: 'uploaded',
      picture: { pictureId: '6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0', bytes: 70, mediaType: 'image/png' },
    });
  });

  test('keeps the refusal of a picture too large: its code, its fields and the forge\'s sentence unchanged', async () => {
    const { status, body } = await recordedPictureUploadAnswerOf('picture-too-large');
    const sentence = (body as { readonly text: string }).text;
    expect(INGESTION.answerOf(status, body)).toEqual({
      outcome: 'refused',
      status:  413,
      refusal: { code: 'picture-too-large', fields: { bytes: 3_932_161, sizeLimitBytes: 3_932_160 }, sentence },
    });
  });

  test('keeps the refusal of a body that is no picture the forge takes', async () => {
    const { status, body } = await recordedPictureUploadAnswerOf('picture-not-a-picture');
    expect(INGESTION.answerOf(status, body)).toMatchObject({ outcome: 'refused', status: 415, refusal: { code: 'picture-type-unsupported' } });
  });
});

describe('answerOf, on a body that is no answer', () => {
  test('names the keys of a stored picture that lacks them', () => {
    expect(INGESTION.answerOf(200, { pictureId: 'example' })).toEqual({ outcome: 'unreadable', status: 200, invalidKeys: ['bytes', 'mediaType'] });
  });

  test('names the keys of a refusal that lacks them', () => {
    expect(INGESTION.answerOf(413, { refusal: 'picture-too-large' })).toEqual({ outcome: 'unreadable', status: 413, invalidKeys: ['fields', 'text'] });
  });
});
