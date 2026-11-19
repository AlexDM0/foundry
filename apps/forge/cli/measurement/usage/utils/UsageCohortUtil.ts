/**
 * What a group of subagents cost, as one row of figures, and the split that makes two groups comparable across a briefing change.
 * **Calls and end context are medians; the token figures are means, deliberately.** One runaway agent must
 * not move what a typical agent did, and must not be hidden in what the cohort cost, since a bill is a sum.
 */
import type { SubagentUsage } from '../../../../src/lib/agent-launch/AgentTranscripts.ts';
import { LocalTimeUtil }      from '../../../../src/lib/local-time/LocalTimeUtil.ts';

/** `transcriptCount` is on the summary rather than left to the caller, so a printed line can say how many agents it is speaking for. */
export interface CohortSummary {
  transcriptCount:                 number;
  medianApiCallCount:              number;
  medianEndContextTokens:          number;
  meanTotalInputTokens:            number;
  meanOutputTokens:                number;
  meanBrowserCallCount:            number;
  meanOversizedContextShare:       number;
  meanBashEditScriptCount:         number;
  meanVerificationRunCount:        number;
  meanNestedInstructionCharacters: number;
}

export interface CohortSplit {
  before: SubagentUsage[];
  after:  SubagentUsage[];
}

/** A fraction of the agent's own input, so one enormous agent does not decide the cohort's share on its own; an agent that sent nothing reads as 0. */
function oversizedContextShareOf(usage: SubagentUsage): number {
  return usage.totalInputTokens === 0 ? 0 : usage.oversizedContextTokens / usage.totalInputTokens;
}

/** An even count averages the two middle values, so a cohort of two agents reports a figure between them rather than the later one. */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted     = [...values].sort((a, b) => a - b);
  const middle     = Math.floor(sorted.length / 2);
  const lowerValue = sorted[middle - 1] ?? 0;
  const upperValue = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upperValue : (lowerValue + upperValue) / 2;
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((running, value) => running + value, 0) / values.length;
}

/** Token figures are whole counts; means and shares are not rounded, so 1 in 10 reads as 0.1; an empty cohort is all zeros, not null. */
function cohortSummaryOf(usages: readonly SubagentUsage[]): CohortSummary {
  return {
    transcriptCount:                 usages.length,
    medianApiCallCount:              medianOf(usages.map((usage) => usage.apiCallCount)),
    medianEndContextTokens:          Math.round(medianOf(usages.map((usage) => usage.endContextTokens))),
    meanTotalInputTokens:            Math.round(meanOf(usages.map((usage) => usage.totalInputTokens))),
    meanOutputTokens:                Math.round(meanOf(usages.map((usage) => usage.outputTokens))),
    meanBrowserCallCount:            meanOf(usages.map((usage) => usage.browserCallCount)),
    meanOversizedContextShare:       meanOf(usages.map(oversizedContextShareOf)),
    meanBashEditScriptCount:         meanOf(usages.map((usage) => usage.shellEditScriptCount)),
    meanVerificationRunCount:        meanOf(usages.map((usage) => usage.verificationRunCount)),
    meanNestedInstructionCharacters: Math.round(meanOf(usages.map((usage) => usage.nestedInstructionCharacters))),
  };
}

/**
 * Splits a cohort on an instant, a stated clock exception that decides only which cohort a transcript is summarised in: `before`
 * started strictly earlier, `after` at the instant or later. **A subagent whose transcript carries no readable stamp goes into `before`**,
 * which is the closed answer: an agent that cannot be shown to have run after the change must not be counted as evidence that the change helped.
 */
function cohortSplitAt(usages: readonly SubagentUsage[], instant: Date): CohortSplit {
  const split: CohortSplit = { before: [], after: [] };
  for (const usage of usages) {
    const startedAt = usage.startedAt === null ? null : LocalTimeUtil.parseIso(usage.startedAt);
    if (startedAt !== null && startedAt.getTime() >= instant.getTime()) split.after.push(usage);
    else split.before.push(usage);
  }
  return split;
}

export const UsageCohortUtil = {
  cohortSplitAt,
  cohortSummaryOf,
} as const;
