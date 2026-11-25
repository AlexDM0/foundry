/**
 * Maps what Gaia's relay of a forge's board answers beside the board out to the page's contract: a refusal of Gaia's own, in Gaia's words; a
 * relayed stream's handshake; a board command's answer; and a picture upload's answer. A forge's refusal keeps the forge's code, fields
 * and sentence, byte for byte, even one that names a command (decision 45).
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

import type {
  BoardCommandAnswerDocument,
  BoardRefusalDocument,
  BoardRelayRefusal as BoardRelayRefusalOfPage,
  BoardRelayRefusalDocument,
  BoardStreamHandshakeDocument,
  PictureUploadAnswerDocument,
} from '../../../page/@types/board/BoardRelayDocuments.ts';
import type { BoardCommandAnswer } from '../../shared/@types/board/BoardCommandAnswer.ts';
import type {
  BoardCommandRelayVerdict,
  BoardPictureUploadAnswer,
  BoardRelayRefusal,
  PictureUploadRelayVerdict,
} from '../../shared/@types/board/BoardRelayVerdict.ts';
import { GAIA_SYSTEM_VERSION }    from '../../shared/constants/GaiaSystemVersions.ts';
import { PAGE_CONTRACT_VERSIONS } from '../../shared/constants/PageContractVersions.ts';
import { BoardDocumentMapUtil }   from './BoardDocumentMapUtil.ts';

const PAGE_REFUSAL_OF_RELAY_REFUSAL: Readonly<Record<BoardRelayRefusal, BoardRelayRefusalOfPage>> = {
  'forge-not-registered':      'forge-not-registered',
  'forge-unreachable':         'forge-unreachable',
  'forge-version-unsupported': 'forge-version-unsupported',
  'forge-document-unreadable': 'forge-document-unreadable',
  'token-unreadable':          'token-unreadable',
  'token-rejected':            'token-rejected',
  'not-found':                 'not-found',
  'too-large':                 'too-large',
  'malformed-body':            'malformed-body',
  'unknown-kind':              'unknown-kind',
};

const RELAY_REFUSAL_SENTENCES: Readonly<Record<BoardRelayRefusal, string>> = {
  'forge-not-registered':      'Gaia finds no such forge in the registry.',
  'forge-unreachable':         'This forge does not answer.',
  'forge-version-unsupported': 'This forge runs a version Gaia cannot talk to.',
  'forge-document-unreadable': 'This forge answered with something Gaia cannot read.',
  'token-unreadable':          'Gaia cannot read this forge\'s token.',
  'token-rejected':            'This forge did not accept Gaia\'s token. It may have restarted.',
  'not-found':                 'This forge has nothing at this address.',
  'too-large':                 'This is larger than Gaia takes for this request.',
  'malformed-body':            'Gaia did not understand this command.',
  'unknown-kind':              'Gaia does not know this kind of command.',
};

function relayRefusalDocumentOf(refusal: BoardRelayRefusal): BoardRelayRefusalDocument {
  return { refusal: PAGE_REFUSAL_OF_RELAY_REFUSAL[refusal], refusedBy: 'gaia' };
}

function gaiaRefusalDocumentOf(refusal: BoardRelayRefusal): BoardRefusalDocument {
  return { refusedBy: 'gaia', code: PAGE_REFUSAL_OF_RELAY_REFUSAL[refusal], text: RELAY_REFUSAL_SENTENCES[refusal] };
}

function handshakeDocumentOf(forgeSystemVersion: SystemVersion): BoardStreamHandshakeDocument {
  return {
    boardStreamVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardStream,
    systemVersion:      { major: GAIA_SYSTEM_VERSION.major, minor: GAIA_SYSTEM_VERSION.minor },
    forgeSystemVersion: { major: forgeSystemVersion.major, minor: forgeSystemVersion.minor },
  };
}

type CommandAnswerContent = Omit<BoardCommandAnswerDocument, 'boardCommandAnswerVersion'>;

function forgeCommandAnswerContentOf(answer: BoardCommandAnswer): CommandAnswerContent {
  switch (answer.outcome) {
    case 'applied':
      return { outcome: 'applied', applied: { outcome: answer.applied, startedJobId: answer.startedJobId, writtenVersionNumber: answer.writtenVersionNumber }, refusal: null, };
    case 'refused':
    case 'install-held':
      return { outcome: answer.outcome, applied: null, refusal: BoardDocumentMapUtil.refusalDocumentOf(answer.refusal) };
    case 'unreadable':
      return { outcome: 'outcome-unknown', applied: null, refusal: gaiaRefusalDocumentOf('forge-document-unreadable') };
  }
}

function commandAnswerDocumentOf(verdict: BoardCommandRelayVerdict): BoardCommandAnswerDocument {
  const content = verdict.verdict === 'answered'
    ? forgeCommandAnswerContentOf(verdict.answer)
    : { outcome: verdict.outcome, applied: null, refusal: gaiaRefusalDocumentOf(verdict.refusal) };
  return { boardCommandAnswerVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommandAnswer, ...content };
}

type PictureUploadAnswerContent = Omit<PictureUploadAnswerDocument, 'pictureUploadAnswerVersion'>;

function forgePictureUploadContentOf(answer: BoardPictureUploadAnswer): PictureUploadAnswerContent {
  switch (answer.outcome) {
    case 'uploaded':
      return { outcome: 'uploaded', picture: { pictureId: answer.picture.pictureId, bytes: answer.picture.bytes, mediaType: answer.picture.mediaType }, refusal: null };
    case 'refused':
      return { outcome: 'refused', picture: null, refusal: BoardDocumentMapUtil.refusalDocumentOf(answer.refusal) };
    case 'unreadable':
      return { outcome: 'refused', picture: null, refusal: gaiaRefusalDocumentOf('forge-document-unreadable') };
  }
}

function pictureUploadAnswerDocumentOf(verdict: PictureUploadRelayVerdict): PictureUploadAnswerDocument {
  const content = verdict.verdict === 'answered'
    ? forgePictureUploadContentOf(verdict.answer)
    : { outcome: 'refused' as const, picture: null, refusal: gaiaRefusalDocumentOf(verdict.refusal) };
  return { pictureUploadAnswerVersion: PAGE_CONTRACT_VERSIONS.gaiaPictureUploadAnswer, ...content };
}

export const BoardRelayAnswerMapUtil = {
  relayRefusalDocumentOf,
  gaiaRefusalDocumentOf,
  handshakeDocumentOf,
  commandAnswerDocumentOf,
  pictureUploadAnswerDocumentOf,
} as const;
