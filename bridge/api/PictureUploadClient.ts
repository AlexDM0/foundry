/**
 * Posts a picture's raw bytes to `/api/pictures` with the session token, before the command that names it: the one control that is no
 * `ControlCommand`. The Overseer decides the type from the bytes and keeps the picture by their hash; a refusal (too large, a type it does
 * not take) is its worded sentence, shown verbatim. No target is named: a picture is the board's until a command sends it.
 */
import { refusalOf }                              from './RefusalOfResponse.ts';
import { SessionTokenSource, type FetchFunction } from './SessionTokenSource.ts';
import { HTTP_STATUS }                            from './constants/HttpStatus.ts';

export type PictureUpload =
  | { readonly verdict: 'uploaded'; readonly pictureId: string; readonly bytes: number; readonly mediaType: string }
  | { readonly verdict: 'refused'; readonly refusal: string }
  | { readonly verdict: 'unreachable' }
  /** `/api/session-token` answered 401: the page's session cookie is unknown to the Overseer. */
  | { readonly verdict: 'no-session' };

export interface PictureUploadClient {
  readonly upload: (file: Blob) => Promise<PictureUpload>;
}

const PICTURES_PATH = '/api/pictures';

function isUploaded(body: unknown): body is { pictureId: string; bytes: number; mediaType: string } {
  if (typeof body !== 'object' || body === null) return false;
  const { pictureId, bytes, mediaType } = body as Record<string, unknown>;
  return typeof pictureId === 'string' && typeof bytes === 'number' && typeof mediaType === 'string';
}

/** Give it the command client's token source, so both carry one token. */
function create(
  fetchOf: FetchFunction = (input, init) => fetch(input, init),
  tokenSource: SessionTokenSource = SessionTokenSource.create(fetchOf),
): PictureUploadClient {
  const upload = async (file: Blob): Promise<PictureUpload> => {
    const posted = await tokenSource.post(PICTURES_PATH, { 'content-type': file.type === '' ? 'application/octet-stream' : file.type }, file);
    if (posted.verdict !== 'answered') return { verdict: posted.verdict };
    const { response } = posted;
    if (response.status !== HTTP_STATUS.OK) return { verdict: 'refused', refusal: await refusalOf(response) };
    try {
      const body: unknown = await response.json();
      return isUploaded(body)
        ? {
          verdict: 'uploaded', pictureId: body.pictureId, bytes: body.bytes, mediaType: body.mediaType
        }
        : { verdict: 'unreachable' };
    } catch {
      return { verdict: 'unreachable' };
    }
  };

  return { upload };
}

export const PictureUploadClient = Object.freeze({ create });
