/**
 * Maps the answers of the page's requests out to the page contract: how a command ended (PLAN 6.3), a verdict of a command Gaia carried or
 * the reason it could not read the command at all, and how a frame session ended. A forge's refusal code passes through unchanged and its
 * sentence too, unless it names a command (D10), and a chosen path is a command answer's text.
 */
import type { CommandAnswerDocument }      from '../../../page/@types/CommandDocument.ts';
import type { FrameSessionAnswerDocument } from '../../../page/@types/FrameSessionDocument.ts';
import type { CommandVerdict }             from '../../shared/@types/CommandVerdict.ts';
import type { FrameSessionVerdict }        from '../../shared/@types/FrameSessionVerdict.ts';
import { CONTRACT_VERSIONS }               from '../../shared/constants/ContractVersions.ts';
import { ForgeSentenceUtil }               from './ForgeSentenceUtil.ts';
import type { GaiaCommandReading }         from './GaiaCommandIngestion.ts';

export type UnreadableCommandReading = Exclude<GaiaCommandReading, { readonly verdict: 'readable' }>;

function answerOf(outcome: CommandAnswerDocument['outcome'], refusal: string | null = null, text: string | null = null): CommandAnswerDocument {
  return {
    answerVersion: CONTRACT_VERSIONS.gaiaCommandAnswer,
    outcome,
    refusal,
    text,
  };
}

type FrameSessionAnswerContent = Omit<FrameSessionAnswerDocument, 'frameSessionVersion'>;

function frameSessionAnswerContentOf(verdict: FrameSessionVerdict): FrameSessionAnswerContent {
  switch (verdict.verdict) {
    case 'opened':
      return {
        outcome: 'done', frameUrl: verdict.frameUrl, refusal: null, text: null,
      };
    case 'refused':
      return {
        outcome:  'refused',
        frameUrl: null,
        refusal:  verdict.refusal,
        text:     verdict.refusedBy === 'forge' ? ForgeSentenceUtil.refusalSentenceOf(verdict.refusal, verdict.text) : null,
      };
    case 'unreachable':
    case 'not-supported':
      return {
        outcome: verdict.verdict, frameUrl: null, refusal: null, text: null,
      };
  }
}

export const PageAnswerMapUtil = {
  commandAnswerOf(verdict: CommandVerdict): CommandAnswerDocument {
    if (verdict.verdict === 'path-chosen') return answerOf('done', null, verdict.path);
    if (verdict.verdict !== 'refused') return answerOf(verdict.verdict);
    if (verdict.refusedBy === 'gaia') return answerOf('refused', verdict.refusal);
    return answerOf('refused', verdict.refusal, ForgeSentenceUtil.refusalSentenceOf(verdict.refusal, verdict.text));
  },

  /** A command Gaia cannot read is one it cannot carry: a stale page's, or no command at all. The reason is the code. */
  unreadableCommandAnswerOf(reading: UnreadableCommandReading): CommandAnswerDocument {
    return answerOf('not-supported', reading.verdict);
  },

  frameSessionAnswerOf(verdict: FrameSessionVerdict): FrameSessionAnswerDocument {
    return {
      frameSessionVersion: CONTRACT_VERSIONS.gaiaFrameSession,
      ...frameSessionAnswerContentOf(verdict),
    };
  },
} as const;
