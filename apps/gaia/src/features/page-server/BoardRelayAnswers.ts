/**
 * Every answer Gaia's relay of a forge's board gives the page, its status from `HTTP_STATUS_OF_ANSWER`: each refusal of Gaia's, each
 * relayed command and picture upload by how it ended, a forge's refusal of a read with its sentence unchanged, and the
 * refusal of a forge Gaia cannot reach, from the reason `ForgeAccess` gives.
 */
import { BoardDocumentMapUtil }                                                        from '../../adapters/page-api/BoardDocumentMapUtil.ts';
import { BoardRelayAnswerMapUtil }                                                     from '../../adapters/page-api/BoardRelayAnswerMapUtil.ts';
import type { BoardRefusal }                                                           from '../../shared/@types/board/BoardRefusal.ts';
import type { BoardCommandRelayVerdict, BoardRelayRefusal, PictureUploadRelayVerdict } from '../../shared/@types/board/BoardRelayVerdict.ts';
import type { PageServerAnswer }                                                       from './@types/PageServerAnswer.ts';
import type { ForgeAccessRefusal }                                                     from './ForgeAccess.ts';
import { HTTP_STATUS_OF_ANSWER }                                                       from './HttpStatusOfAnswer.ts';

/** Every relay answer is read once, for the forge as it is now. */
const NO_STORE = { 'cache-control': 'no-store' } as const;

/** A registry Gaia cannot read names no forge the relay could reach, so it reads as the forge not registered. */
function relayRefusalOfAccess(refusal: ForgeAccessRefusal): BoardRelayRefusal {
  return refusal === 'registry-unreadable' || refusal === 'registry-newer-version' ? 'forge-not-registered' : refusal;
}

function relayRefusalAnswerOf(refusal: BoardRelayRefusal): Response {
  return Response.json(BoardRelayAnswerMapUtil.relayRefusalDocumentOf(refusal), { status: HTTP_STATUS_OF_ANSWER[refusal], headers: NO_STORE });
}

/** A refusal of Gaia's for a page that shows it as it shows a forge's: its code and Gaia's sentence. */
function gaiaRefusalAnswerOf(refusal: BoardRelayRefusal): Response {
  return Response.json(BoardRelayAnswerMapUtil.gaiaRefusalDocumentOf(refusal), { status: HTTP_STATUS_OF_ANSWER[refusal], headers: NO_STORE });
}

/** A forge that refused a read, such as a ticket with no documents, answered for the page as the forge worded it. */
function forgeRefusalAnswerOf(refusal: BoardRefusal): Response {
  return Response.json(BoardDocumentMapUtil.refusalDocumentOf(refusal), { status: HTTP_STATUS_OF_ANSWER['refused-by-forge'], headers: NO_STORE });
}

function commandAnswerKindOf(verdict: BoardCommandRelayVerdict): PageServerAnswer {
  if (verdict.verdict === 'refused-by-gaia') return verdict.refusal;
  switch (verdict.answer.outcome) {
    case 'applied':
      return 'answered';
    case 'refused':
      return 'refused-by-forge';
    case 'install-held':
      return 'install-held';
    case 'unreadable':
      return 'forge-document-unreadable';
  }
}

function commandAnswerOf(verdict: BoardCommandRelayVerdict): Response {
  return Response.json(BoardRelayAnswerMapUtil.commandAnswerDocumentOf(verdict), { status: HTTP_STATUS_OF_ANSWER[commandAnswerKindOf(verdict)], headers: NO_STORE });
}

function pictureUploadAnswerKindOf(verdict: PictureUploadRelayVerdict): PageServerAnswer {
  if (verdict.verdict === 'refused-by-gaia') return verdict.refusal;
  switch (verdict.answer.outcome) {
    case 'uploaded':
      return 'answered';
    case 'refused':
      return 'refused-by-forge';
    case 'unreadable':
      return 'forge-document-unreadable';
  }
}

function pictureUploadAnswerOf(verdict: PictureUploadRelayVerdict): Response {
  return Response.json(BoardRelayAnswerMapUtil.pictureUploadAnswerDocumentOf(verdict), { status: HTTP_STATUS_OF_ANSWER[pictureUploadAnswerKindOf(verdict)], headers: NO_STORE });
}

export const BoardRelayAnswers = {
  NO_STORE,
  relayRefusalOfAccess,
  relayRefusalAnswerOf,
  gaiaRefusalAnswerOf,
  forgeRefusalAnswerOf,
  commandAnswerOf,
  pictureUploadAnswerOf,
} as const;
