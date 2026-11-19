/** The subagents the agent port answered, as the rows `usage` prints and `--json` carries, oldest first. */
import type { SubagentUsage } from '../../../src/lib/agent-launch/AgentTranscripts.ts';
import { LocalTimeUtil }      from '../../../src/lib/local-time/LocalTimeUtil.ts';

/** One agent as the report prints it and as `--json` carries it, with the figures a reader adds up by hand made explicit. */
export interface AgentUsage {
  apiCallCount:                number;
  inputTokens:                 number;
  cacheReadInputTokens:        number;
  cacheCreationInputTokens:    number;
  outputTokens:                number;
  endContextTokens:            number;
  oversizedContextTokens:      number;
  startedAt:                   string | null;
  model:                       string | null;
  browserCallCount:            number;
  bashEditScriptCount:         number;
  verificationRunCount:        number;
  nestedInstructionCharacters: number;
  briefExcerpt:                string;
  sessionIdentifier:           string;
  agentIdentifier:             string;
  transcriptPath:              string;
  totalInputTokens:            number;
}

/** In the order `--json` has always carried the keys, so its document reads as before. */
function agentUsageOf(usage: SubagentUsage): AgentUsage {
  return {
    apiCallCount:                usage.apiCallCount,
    inputTokens:                 usage.inputTokens,
    cacheReadInputTokens:        usage.cacheReadInputTokens,
    cacheCreationInputTokens:    usage.cacheCreationInputTokens,
    outputTokens:                usage.outputTokens,
    endContextTokens:            usage.endContextTokens,
    oversizedContextTokens:      usage.oversizedContextTokens,
    startedAt:                   usage.startedAt,
    model:                       usage.model,
    browserCallCount:            usage.browserCallCount,
    bashEditScriptCount:         usage.shellEditScriptCount,
    verificationRunCount:        usage.verificationRunCount,
    nestedInstructionCharacters: usage.nestedInstructionCharacters,
    briefExcerpt:                usage.briefExcerpt,
    sessionIdentifier:           usage.sessionIdentifier,
    agentIdentifier:             usage.agentIdentifier,
    transcriptPath:              usage.transcriptPath,
    totalInputTokens:            usage.totalInputTokens,
  };
}

function startInstantOf(usage: SubagentUsage): number {
  if (usage.startedAt === null) return Number.NEGATIVE_INFINITY;
  return LocalTimeUtil.parseIso(usage.startedAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

/**
 * Oldest first, which is the order the report is read in: a cohort is a story about what changed over
 * time. An agent with no stamp sorts to the front, beside the split's own closed answer for it.
 */
export function oldestFirst(usages: readonly SubagentUsage[]): SubagentUsage[] {
  return [...usages].sort((a, b) => startInstantOf(a) - startInstantOf(b) || a.transcriptPath.localeCompare(b.transcriptPath));
}

export function agentUsagesOf(usages: readonly SubagentUsage[]): AgentUsage[] {
  return usages.map(agentUsageOf);
}
