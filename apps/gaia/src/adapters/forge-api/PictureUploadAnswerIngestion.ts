/**
 * The ingestion of a forge's answer to a picture upload (`POST /api/v1/pictures`) into Gaia's `BoardPictureUploadAnswer`: 200 the stored
 * picture, any other status a refusal with its code, fields and sentence unchanged. The answer carries no version key: its version is the
 * `pictures` endpoint's. A body that is no such answer is `unreadable` and names its keys.
 */
import { DocumentShapeUtil, type ShapeOf }                            from '../../lib/json-value/DocumentShapeUtil.ts';
import type { BoardPictureUploadAnswer }                              from '../../shared/@types/board/BoardRelayVerdict.ts';
import type { ForgePictureRefusalAnswer, ForgePictureUploadedAnswer } from './@types/ForgeStreamDocuments.ts';

const UPLOADED_STATUS = 200;

const UPLOADED_ANSWER_SHAPE = {
  pictureId: 'text',
  bytes:     'whole-number',
  mediaType: 'text',
} as const satisfies ShapeOf<ForgePictureUploadedAnswer>;

const REFUSAL_ANSWER_SHAPE = {
  refusal: 'text',
  fields:  { recordOf: 'json' },
  text:    'text',
} as const satisfies ShapeOf<ForgePictureRefusalAnswer>;

export class PictureUploadAnswerIngestion {
  public answerOf(status: number, body: unknown): BoardPictureUploadAnswer {
    if (status === UPLOADED_STATUS) {
      const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, UPLOADED_ANSWER_SHAPE);
      if (invalidKeys.length > 0) return { outcome: 'unreadable', status, invalidKeys };
      const uploaded = body as ForgePictureUploadedAnswer;
      return { outcome: 'uploaded', picture: { pictureId: uploaded.pictureId, bytes: uploaded.bytes, mediaType: uploaded.mediaType } };
    }
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, REFUSAL_ANSWER_SHAPE);
    if (invalidKeys.length > 0) return { outcome: 'unreadable', status, invalidKeys };
    const refused = body as ForgePictureRefusalAnswer;
    return { outcome: 'refused', status, refusal: { code: refused.refusal, fields: refused.fields, sentence: refused.text } };
  }
}
