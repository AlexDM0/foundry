/**
 * Posts a picture's raw bytes to Gaia's relay of a forge (`POST /api/v1/forges/<trackerId>/pictures`) with the page's session, before the
 * command that names it. The forge decides the type from the bytes and keeps the picture by their hash; a refusal (too large, a type it does
 * not take) is its sentence, shown verbatim.
 */
import { PAGE_CONTRACT_VERSIONS }           from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }              from '../../../src/shared/utils/ContractVersionUtil.ts';
import type { PictureUploadAnswerDocument } from '../../@types/board/BoardRelayDocuments.ts';
import { BoardApiPaths }                    from './BoardApiPaths.ts';
import { refusalTextOf }                    from './RefusalOf.ts';
import {
  BROWSER_RELAY_REQUEST_SENDER,
  jsonBodyOf,
  relayResponseOf,
  type RelayRequestSender
} from './RelayRequest.ts';
import { HTTP_STATUS } from './constants/HttpStatus.ts';

export type PictureUpload =
  | { readonly verdict: 'uploaded'; readonly pictureId: string; readonly bytes: number; readonly mediaType: string }
  | { readonly verdict: 'refused'; readonly refusal: string }
  | { readonly verdict: 'unreachable' }
  /** Gaia's server answered 401: it no longer knows this window's session. */
  | { readonly verdict: 'no-session' };

export interface PictureUploadClient {
  readonly upload: (file: Blob) => Promise<PictureUpload>;
}

const ANSWER_VERSION_KEYS = { majorKey: 'pictureUploadAnswerVersion' } as const;

/** A file the browser names no type for is sent as plain bytes; the forge reads the type from them. */
const UNNAMED_MEDIA_TYPE = 'application/octet-stream';

function uploadOfAnswer(body: unknown): PictureUpload | null {
  if (ContractVersionUtil.readMajorOf(body, ANSWER_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaPictureUploadAnswer) === null) return null;
  const answer = body as PictureUploadAnswerDocument;
  if (answer.outcome === 'refused') {
    const refusal = refusalTextOf(answer.refusal);
    return refusal === null ? null : { verdict: 'refused', refusal };
  }
  const { picture } = answer;
  if (answer.outcome !== 'uploaded' || typeof picture !== 'object' || picture === null) return null;
  const { pictureId, bytes, mediaType } = picture;
  return typeof pictureId === 'string' && typeof bytes === 'number' && typeof mediaType === 'string'
    ? {
      verdict: 'uploaded', pictureId, bytes, mediaType
    }
    : null;
}

function create(trackerId: string, sendRequest: RelayRequestSender = BROWSER_RELAY_REQUEST_SENDER): PictureUploadClient {
  const upload = async (file: Blob): Promise<PictureUpload> => {
    const answered = await relayResponseOf(sendRequest, BoardApiPaths.picturesPathOf(trackerId), {
      method:  'POST',
      headers: { 'content-type': file.type === '' ? UNNAMED_MEDIA_TYPE : file.type },
      body:    file,
    });
    if (answered.verdict === 'unreachable') return { verdict: 'unreachable' };
    if (answered.response.status === HTTP_STATUS.UNAUTHORIZED) return { verdict: 'no-session' };
    return uploadOfAnswer(await jsonBodyOf(answered.response)) ?? { verdict: 'unreachable' };
  };

  return { upload };
}

export const PictureUploadClient = Object.freeze({ create });
