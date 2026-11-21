/**
 * The HTTP side of every answer Gaia's relay of a forge's board gives the page, in this one place: each refusal of Gaia's to its status,
 * each relayed command and picture upload to the status of how it ended, and the refusal of a forge Gaia cannot reach, from the reason
 * `ForgeAccess` gives.
 */
import { BoardRelayAnswerMapUtil }                                                     from '../../adapters/page-api/BoardRelayAnswerMapUtil.ts';
import type { BoardCommandRelayVerdict, BoardRelayRefusal, PictureUploadRelayVerdict } from '../../shared/@types/board/BoardRelayVerdict.ts';
import type { ForgeAccessRefusal }                                                     from './ForgeAccess.ts';

const HTTP_STATUS = {
  ok:              200,
  badRequest:      400,
  notFound:        404,
  conflict:        409,
  contentTooLarge: 413,
  locked:          423,
  notImplemented:  501,
  badGateway:      502,
} as const;

const HTTP_STATUS_OF_RELAY_REFUSAL: Readonly<Record<BoardRelayRefusal, number>> = {
  'forge-not-registered':      HTTP_STATUS.notFound,
  'forge-unreachable':         HTTP_STATUS.badGateway,
  'forge-version-unsupported': HTTP_STATUS.notImplemented,
  'forge-document-unreadable': HTTP_STATUS.badGateway,
  'token-unreadable':          HTTP_STATUS.badGateway,
  'token-rejected':            HTTP_STATUS.badGateway,
  'not-found':                 HTTP_STATUS.notFound,
  'too-large':                 HTTP_STATUS.contentTooLarge,
  'malformed-body':            HTTP_STATUS.badRequest,
  'unknown-kind':              HTTP_STATUS.badRequest,
};

/** Every relay answer is read once, for the forge as it is now. */
const NO_STORE = { 'cache-control': 'no-store' } as const;

/** A registry Gaia cannot read names no forge the relay could reach, so it reads as the forge not registered. */
function relayRefusalOfAccess(refusal: ForgeAccessRefusal): BoardRelayRefusal {
  return refusal === 'registry-unreadable' || refusal === 'registry-newer-version' ? 'forge-not-registered' : refusal;
}

function relayRefusalAnswerOf(refusal: BoardRelayRefusal): Response {
  return Response.json(BoardRelayAnswerMapUtil.relayRefusalDocumentOf(refusal), { status: HTTP_STATUS_OF_RELAY_REFUSAL[refusal], headers: NO_STORE });
}

function commandStatusOf(verdict: BoardCommandRelayVerdict): number {
  if (verdict.verdict === 'refused-by-gaia') return HTTP_STATUS_OF_RELAY_REFUSAL[verdict.refusal];
  switch (verdict.answer.outcome) {
    case 'applied':
      return HTTP_STATUS.ok;
    case 'refused':
      return HTTP_STATUS.conflict;
    case 'install-held':
      return HTTP_STATUS.locked;
    case 'unreadable':
      return HTTP_STATUS.badGateway;
  }
}

function commandAnswerOf(verdict: BoardCommandRelayVerdict): Response {
  return Response.json(BoardRelayAnswerMapUtil.commandAnswerDocumentOf(verdict), { status: commandStatusOf(verdict), headers: NO_STORE });
}

function pictureUploadStatusOf(verdict: PictureUploadRelayVerdict): number {
  if (verdict.verdict === 'refused-by-gaia') return HTTP_STATUS_OF_RELAY_REFUSAL[verdict.refusal];
  switch (verdict.answer.outcome) {
    case 'uploaded':
      return HTTP_STATUS.ok;
    case 'refused':
      return HTTP_STATUS.conflict;
    case 'unreadable':
      return HTTP_STATUS.badGateway;
  }
}

function pictureUploadAnswerOf(verdict: PictureUploadRelayVerdict): Response {
  return Response.json(BoardRelayAnswerMapUtil.pictureUploadAnswerDocumentOf(verdict), { status: pictureUploadStatusOf(verdict), headers: NO_STORE });
}

export const BoardRelayAnswers = {
  NO_STORE,
  relayRefusalOfAccess,
  relayRefusalAnswerOf,
  commandAnswerOf,
  pictureUploadAnswerOf,
} as const;
