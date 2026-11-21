/**
 * The relay's answers mapped out to the page's board contract. What matters: each refusal of Gaia's keeps its code and reads in Gaia's own
 * words, none naming a command; the handshake names its contract version, Gaia's system version and the forge's; a forge's answer keeps the
 * forge's refusal byte for byte and one Gaia cannot read leaves the outcome unknown; and an upload answers its picture or its refusal.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardRelayRefusal }  from '../../shared/@types/board/BoardRelayVerdict.ts';
import { GAIA_SYSTEM_VERSION }     from '../../shared/constants/GaiaSystemVersions.ts';
import { BoardRelayAnswerMapUtil } from './BoardRelayAnswerMapUtil.ts';
import { ForgeSentenceUtil }       from './ForgeSentenceUtil.ts';

/** Keyed by the refusal union, so a refusal added to it fails the typecheck here until it is listed. */
const EVERY_RELAY_REFUSAL: Readonly<Record<BoardRelayRefusal, true>> = {
  'forge-not-registered':      true,
  'forge-unreachable':         true,
  'forge-version-unsupported': true,
  'forge-document-unreadable': true,
  'token-unreadable':          true,
  'token-rejected':            true,
  'not-found':                 true,
  'too-large':                 true,
  'malformed-body':            true,
  'unknown-kind':              true,
};

const FORGE_REFUSAL = { code: 'no-readable-ticket', fields: { reference: '999' }, sentence: 'There is no readable ticket 999. Run `forge ticket list` to see it.' };

describe('a refusal of Gaia\'s', () => {
  test('keeps its code and reads in Gaia\'s own words, none naming a command', () => {
    for (const refusal of Object.keys(EVERY_RELAY_REFUSAL) as BoardRelayRefusal[]) {
      expect(BoardRelayAnswerMapUtil.relayRefusalDocumentOf(refusal)).toEqual({ refusal, refusedBy: 'gaia' });
      const document = BoardRelayAnswerMapUtil.gaiaRefusalDocumentOf(refusal);
      expect([document.refusedBy, document.code]).toEqual(['gaia', refusal]);
      expect(ForgeSentenceUtil.sentenceNamesACommand(document.text)).toBe(false);
    }
  });
});

describe('a relayed stream\'s handshake', () => {
  test('names its contract version, Gaia\'s system version and the forge\'s', () => {
    expect(BoardRelayAnswerMapUtil.handshakeDocumentOf({ major: 1, minor: 22 })).toEqual({
      boardStreamVersion: 1,
      systemVersion:      { major: GAIA_SYSTEM_VERSION.major, minor: GAIA_SYSTEM_VERSION.minor },
      forgeSystemVersion: { major: 1, minor: 22 },
    });
  });
});

describe('a board command\'s answer', () => {
  test('keeps a forge\'s refusal byte for byte, and leaves the outcome unknown for an answer Gaia cannot read', () => {
    expect(BoardRelayAnswerMapUtil.commandAnswerDocumentOf({ verdict: 'answered', answer: { outcome: 'refused', status: 409, refusal: FORGE_REFUSAL } })).toEqual({
      boardCommandAnswerVersion: 1,
      outcome:                   'refused',
      applied:                   null,
      refusal:                   {
        refusedBy: 'forge', code: FORGE_REFUSAL.code, fields: FORGE_REFUSAL.fields, text: FORGE_REFUSAL.sentence
      },
    });
    const unreadable = BoardRelayAnswerMapUtil.commandAnswerDocumentOf({ verdict: 'answered', answer: { outcome: 'unreadable', status: 200, invalidKeys: ['outcome'] } });
    expect([unreadable.outcome, unreadable.applied, unreadable.refusal?.code]).toEqual(['outcome-unknown', null, 'forge-document-unreadable']);
  });
});

describe('a picture upload\'s answer', () => {
  test('answers the stored picture, or the refusal with the forge\'s sentence', () => {
    const picture = { pictureId: 'a'.repeat(64), bytes: 70, mediaType: 'image/png' };
    expect(BoardRelayAnswerMapUtil.pictureUploadAnswerDocumentOf({ verdict: 'answered', answer: { outcome: 'uploaded', picture } })).toEqual({
      pictureUploadAnswerVersion: 1, outcome: 'uploaded', picture, refusal: null,
    });
    const refused = BoardRelayAnswerMapUtil.pictureUploadAnswerDocumentOf({ verdict: 'answered', answer: { outcome: 'refused', status: 413, refusal: FORGE_REFUSAL } });
    expect([refused.outcome, refused.picture, refused.refusal?.text]).toEqual(['refused', null, FORGE_REFUSAL.sentence]);
  });
});
