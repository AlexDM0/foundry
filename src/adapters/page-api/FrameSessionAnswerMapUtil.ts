/** Maps the internal `FrameSessionVerdict` out to the page contract's frame session answer, every key named one by one. */
import type { FrameSessionAnswerDocument } from '../../../page/@types/FrameSessionDocument.ts';
import type { FrameSessionVerdict }        from '../../shared/@types/FrameSessionVerdict.ts';
import { CONTRACT_VERSIONS }               from '../../shared/constants/ContractVersions.ts';

type AnswerContent = Omit<FrameSessionAnswerDocument, 'frameSessionVersion'>;

function answerContentOf(verdict: FrameSessionVerdict): AnswerContent {
  switch (verdict.verdict) {
    case 'opened':
      return {
        outcome: 'done', frameUrl: verdict.frameUrl, refusal: null, text: null,
      };
    case 'refused':
      return {
        outcome: 'refused', frameUrl: null, refusal: verdict.refusal, text: verdict.refusedBy === 'forge' ? verdict.text : null,
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
