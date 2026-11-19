/** Every subagent transcript of a project read into the figures the agent port's `subagentUsagesOf` answers; one that cannot be read is left out. */
import type { SubagentUsage, SubagentUsageAnswer, SubagentUsageRequest }  from '../agent-launch/AgentTranscripts.ts';
import type { SubagentTranscript }                                        from './ClaudeTranscripts.ts';
import { listSubagentTranscripts, transcriptFolderFor, transcriptTextAt } from './ClaudeTranscripts.ts';
import { TranscriptUsageUtil }                                            from './utils/TranscriptUsageUtil.ts';

function subagentUsageOf(transcript: SubagentTranscript, transcriptText: string, request: SubagentUsageRequest): SubagentUsage {
  const profile = TranscriptUsageUtil.transcriptProfileOf(transcriptText, request.oversizedContextThresholdTokens, request.briefExcerptCharacters);
  return {
    sessionIdentifier:           transcript.sessionIdentifier,
    agentIdentifier:             transcript.agentIdentifier,
    transcriptPath:              transcript.path,
    startedAt:                   profile.startedAt,
    model:                       profile.model,
    apiCallCount:                profile.apiCallCount,
    inputTokens:                 profile.inputTokens,
    cacheReadInputTokens:        profile.cacheReadInputTokens,
    cacheCreationInputTokens:    profile.cacheCreationInputTokens,
    outputTokens:                profile.outputTokens,
    totalInputTokens:            TranscriptUsageUtil.totalInputTokensOf(profile),
    endContextTokens:            profile.endContextTokens,
    oversizedContextTokens:      profile.oversizedContextTokens,
    browserCallCount:            profile.browserCallCount,
    shellEditScriptCount:        profile.bashEditScriptCount,
    verificationRunCount:        profile.verificationRunCount,
    nestedInstructionCharacters: profile.nestedInstructionCharacters,
    briefExcerpt:                profile.briefExcerpt,
  };
}

/** `configFolder` is the one the adapter answers for the request's home; the request's own folder, when it names one, is read instead. */
function subagentUsagesOf(configFolder: string, request: SubagentUsageRequest): SubagentUsageAnswer {
  const transcriptFolder = request.transcriptFolder ?? transcriptFolderFor(request.projectRoot, configFolder);
  const usages: SubagentUsage[] = [];
  for (const transcript of listSubagentTranscripts(transcriptFolder)) {
    const transcriptText = transcriptTextAt(transcript.path);
    if (transcriptText === undefined) request.onUnreadableTranscript(transcript.path);
    else usages.push(subagentUsageOf(transcript, transcriptText, request));
  }
  return { transcriptFolder, usages };
}

export const ClaudeSubagentUsages = Object.freeze({ subagentUsagesOf });
