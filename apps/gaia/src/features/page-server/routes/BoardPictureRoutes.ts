/**
 * A forge's pictures, relayed: `POST /api/v1/forges/<trackerId>/pictures` forwards the page's raw body with its content type, read to
 * `BOARD_PICTURE_UPLOAD_LIMIT_BYTES`, and answers the page's `PictureUploadAnswerDocument`; `GET .../pictures/<pictureId>` answers the
 * picture's bytes under the forge's content type, never sniffed, sandboxed and never stored.
 */
import { PictureUploadAnswerIngestion }                   from '../../../adapters/forge-api/PictureUploadAnswerIngestion.ts';
import { BoundedBody }                                    from '../../../lib/local-http-guards/BoundedBody.ts';
import type { PictureUploadRelayVerdict }                 from '../../../shared/@types/board/BoardRelayVerdict.ts';
import { BoardRelayAnswers }                              from '../BoardRelayAnswers.ts';
import { forgeAccessVerdictFor, type ForgeAccessSources } from '../ForgeAccess.ts';

const CONTENT_TYPE_HEADER = 'content-type';

/** A body sent with no type of its own: the forge tells a picture by its first bytes, never by the type it was sent with. */
const UNTYPED_BODY_MEDIA_TYPE = 'application/octet-stream';

const PICTURE_SERVED_STATUS = 200;

const PICTURE_HEADERS = {
  'x-content-type-options':  'nosniff',
  'content-security-policy': 'sandbox',
  ...BoardRelayAnswers.NO_STORE,
} as const;

async function pictureUploadVerdictOf(request: Request, trackerId: string, sources: ForgeAccessSources, maximumBodyBytes: number): Promise<PictureUploadRelayVerdict> {
  const body = await BoundedBody.boundedBodyOf(request, maximumBodyBytes);
  if (body.verdict === 'too-large') return { verdict: 'refused-by-gaia', refusal: 'too-large' };
  const accessVerdict = await forgeAccessVerdictFor(trackerId, sources);
  if (accessVerdict.verdict === 'refused') return { verdict: 'refused-by-gaia', refusal: BoardRelayAnswers.relayRefusalOfAccess(accessVerdict.refusal) };
  const mediaType = request.headers.get(CONTENT_TYPE_HEADER) ?? UNTYPED_BODY_MEDIA_TYPE;
  const answer = await sources.forgeClient.uploadPicture(accessVerdict.access, body.bytes, mediaType);
  switch (answer.verdict) {
    case 'answered':
      return { verdict: 'answered', answer: new PictureUploadAnswerIngestion().answerOf(answer.status, answer.body) };
    case 'unreachable':
      return { verdict: 'refused-by-gaia', refusal: 'forge-unreachable' };
    case 'unauthorized':
      return { verdict: 'refused-by-gaia', refusal: 'token-rejected' };
    case 'refused':
    case 'malformed':
      return { verdict: 'refused-by-gaia', refusal: 'forge-document-unreadable' };
  }
}

/** A body over the bound is refused before the forge is asked for anything. */
export async function pictureUploadAnswerFor(request: Request, trackerId: string, sources: ForgeAccessSources, maximumBodyBytes: number): Promise<Response> {
  return BoardRelayAnswers.pictureUploadAnswerOf(await pictureUploadVerdictOf(request, trackerId, sources, maximumBodyBytes));
}

/** A picture the forge does not serve, under any status of its own, is one Gaia has nothing at. */
export async function pictureAnswerFor(trackerId: string, pictureId: string, sources: ForgeAccessSources): Promise<Response> {
  const accessVerdict = await forgeAccessVerdictFor(trackerId, sources);
  if (accessVerdict.verdict === 'refused') return BoardRelayAnswers.relayRefusalAnswerOf(BoardRelayAnswers.relayRefusalOfAccess(accessVerdict.refusal));
  const answer = await sources.forgeClient.pictureOf(accessVerdict.access, pictureId);
  switch (answer.verdict) {
    case 'answered':
      if (answer.status !== PICTURE_SERVED_STATUS) return BoardRelayAnswers.relayRefusalAnswerOf('not-found');
      return new Response(answer.bytes, { headers: { [CONTENT_TYPE_HEADER]: answer.contentType ?? UNTYPED_BODY_MEDIA_TYPE, ...PICTURE_HEADERS } });
    case 'unreachable':
      return BoardRelayAnswers.relayRefusalAnswerOf('forge-unreachable');
    case 'unauthorized':
      return BoardRelayAnswers.relayRefusalAnswerOf('token-rejected');
    case 'refused':
    case 'malformed':
      return BoardRelayAnswers.relayRefusalAnswerOf('forge-document-unreadable');
  }
}
