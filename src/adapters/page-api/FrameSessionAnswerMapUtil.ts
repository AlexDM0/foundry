/**
 * Maps the internal `FrameSessionVerdict` out to the page contract's frame session answer, every key named one by one. A forge's refusal
 * sentence leaves in Gaia's words when it names a command (D10).
 */
import type { FrameSessionAnswerDocument } from '../../../page/@types/FrameSessionDocument.ts';
import type { FrameSessionVerdict }        from '../../shared/@types/FrameSessionVerdict.ts';
import { CONTRACT_VERSIONS }               from '../../shared/constants/ContractVersions.ts';
import { ForgeSentenceUtil }               from './ForgeSentenceUtil.ts';

type AnswerContent = Omit<FrameSessionAnswerDocument, 'frameSessionVersion'>;

function answerContentOf(verdict: FrameSessionVerdict): AnswerContent {
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

export const FrameSessionAnswerMapUtil = {
  answerDocumentOf(verdict: FrameSessionVerdict): FrameSessionAnswerDocument {
    return { frameSessionVersion: CONTRACT_VERSIONS.gaiaFrameSession, ...answerContentOf(verdict) };
  },
} as const;
