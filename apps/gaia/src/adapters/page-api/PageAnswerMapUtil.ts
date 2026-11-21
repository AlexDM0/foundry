/**
 * Maps the answers of the page's requests out to the page contract: how a command ended (PLAN 6.3), a verdict of a command Gaia carried or
 * the reason it could not read the command at all. A forge's refusal code and its sentence pass through
 * unchanged, even a sentence that names a command (decision 45), and a chosen path is a command answer's text.
 */
import type { CommandAnswerDocument, CommandAnswerForgeDocument } from '../../../page/@types/CommandDocument.ts';
import type { CommandVerdict, OutageResumeForgeAnswer }           from '../../shared/@types/CommandVerdict.ts';
import { PAGE_CONTRACT_VERSIONS }                                 from '../../shared/constants/PageContractVersions.ts';
import type { GaiaCommandReading }                                from './GaiaCommandIngestion.ts';

export type UnreadableCommandReading = Exclude<GaiaCommandReading, { readonly verdict: 'readable' }>;

function answerOf(outcome: CommandAnswerDocument['outcome'], refusal: string | null = null, text: string | null = null): CommandAnswerDocument {
  return {
    answerVersion: PAGE_CONTRACT_VERSIONS.gaiaCommandAnswer,
    outcome,
    refusal,
    text,
    forges:        [],
  };
}

/** A forge's sentence passes through unchanged, as every forge refusal does (decision 45). */
function outageResumeAnswerOf(forges: readonly OutageResumeForgeAnswer[]): CommandAnswerDocument {
  const forgeAnswers = forges.map((forge): CommandAnswerForgeDocument => ({
    trackerId:    forge.trackerId,
    outcome:      forge.outcome,
    resumedCount: forge.resumedCount,
    refusalText:  forge.refusalText,
  }));
  const everyForgeHeldNothing = forges.every((forge) => forge.outcome === 'nothing-to-do');
  return { ...answerOf(everyForgeHeldNothing ? 'nothing-to-do' : 'done'), forges: forgeAnswers };
}

export const PageAnswerMapUtil = {
  commandAnswerOf(verdict: CommandVerdict): CommandAnswerDocument {
    if (verdict.verdict === 'path-chosen') return answerOf('done', null, verdict.path);
    if (verdict.verdict === 'outage-resume-answered') return outageResumeAnswerOf(verdict.forges);
    if (verdict.verdict !== 'refused') return answerOf(verdict.verdict);
    if (verdict.refusedBy === 'gaia') return answerOf('refused', verdict.refusal);
    return answerOf('refused', verdict.refusal, verdict.text);
  },

  /** A command Gaia cannot read is one it cannot carry: a stale page's, or no command at all. The reason is the code. */
  unreadableCommandAnswerOf(reading: UnreadableCommandReading): CommandAnswerDocument {
    return answerOf('not-supported', reading.verdict);
  },
} as const;
