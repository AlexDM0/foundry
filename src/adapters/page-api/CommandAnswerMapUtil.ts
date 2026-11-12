/**
 * Maps how a command ended out to the page contract's command answer (PLAN 6.3): a verdict of a command Gaia carried, or the reason it
 * could not read the command at all. A forge's refusal code and sentence pass through unchanged, and a chosen path is the answer's text.
 */
import type { CommandAnswerDocument } from '../../../page/@types/CommandDocument.ts';
import type { CommandVerdict }        from '../../shared/@types/CommandVerdict.ts';
import { CONTRACT_VERSIONS }          from '../../shared/constants/ContractVersions.ts';
import type { GaiaCommandReading }    from './GaiaCommandIngestion.ts';

export type UnreadableCommandReading = Exclude<GaiaCommandReading, { readonly verdict: 'readable' }>;

function answerOf(outcome: CommandAnswerDocument['outcome'], refusal: string | null = null, text: string | null = null): CommandAnswerDocument {
  return {
    answerVersion: CONTRACT_VERSIONS.gaiaCommandAnswer,
    outcome,
    refusal,
    text,
  };
}

export const CommandAnswerMapUtil = {
  commandAnswerOf(verdict: CommandVerdict): CommandAnswerDocument {
    if (verdict.verdict === 'path-chosen') return answerOf('done', null, verdict.path);
    if (verdict.verdict !== 'refused') return answerOf(verdict.verdict);
    return verdict.refusedBy === 'forge' ? answerOf('refused', verdict.refusal, verdict.text) : answerOf('refused', verdict.refusal);
  },

  /** A command Gaia cannot read is one it cannot carry: a stale page's, or no command at all. The reason is the code. */
  unreadableCommandAnswerOf(reading: UnreadableCommandReading): CommandAnswerDocument {
    return answerOf('not-supported', reading.verdict);
  },
} as const;
