/**
 * A session's subagents as Claude Code wrote them under `<config>/projects/<any project>/<sessionId>/subagents/`, found by the session
 * id, tallied as the live facts tally the event log, so a session whose event log lost them after a crash or reboot still lists them. Each
 * subagent is keyed by the `toolUseId` its `.meta.json` names, the parent call the event log groups it under.
 */

import type { SubagentFacts }                                                       from '../agent-launch/AgentTranscripts.ts';
import { JsonRecordUtil }                                                           from '../json-record/JsonRecordUtil.ts';
import { agentDescriptionBeside, findSessionSubagentTranscripts, transcriptTextAt } from './ClaudeTranscripts.ts';
import { TranscriptUsageUtil }                                                      from './utils/TranscriptUsageUtil.ts';

const AGENT_METADATA_FILE_SUFFIX = '.meta.json';

const TRANSCRIPT_FILE_SUFFIX = '.jsonl';

function parsedRecordOf(text: string): Record<string, unknown> | undefined {
  try {
    return JsonRecordUtil.recordOf(JSON.parse(text));
  } catch {
    // A transcript is appended to while it is read, so its last line is routinely half-written.
    return undefined;
  }
}

/** The parent call from the `.meta.json` beside the transcript; `null` when the file, its JSON or the field is missing. */
function parentToolUseIdBeside(transcriptPath: string): string | null {
  const metadataText = transcriptTextAt(`${transcriptPath.slice(0, -TRANSCRIPT_FILE_SUFFIX.length)}${AGENT_METADATA_FILE_SUFFIX}`);
  const toolUseId    = metadataText === undefined ? undefined : parsedRecordOf(metadataText)?.['toolUseId'];
  return typeof toolUseId === 'string' && toolUseId.length > 0 ? toolUseId : null;
}

function contentBlocksOf(entry: Record<string, unknown>): Record<string, unknown>[] {
  const content = JsonRecordUtil.recordOf(entry['message'])?.['content'];
  if (!Array.isArray(content)) return [];
  return content.map((block) => JsonRecordUtil.recordOf(block)).filter((block): block is Record<string, unknown> => block !== undefined);
}

function summedTokensOf(transcriptText: string): number {
  const totals = TranscriptUsageUtil.usageTotalsOf(transcriptText, Number.POSITIVE_INFINITY);
  return totals.inputTokens + totals.outputTokens + totals.cacheCreationInputTokens + totals.cacheReadInputTokens;
}

/** Pure over the transcript text and its description: a call is counted once by its `tool_use` id, and runs until a `tool_result` names that id. */
function subagentFactsOfTranscript(parentToolUseId: string, transcriptText: string, description: string | null): SubagentFacts {
  const calledToolUseIds   = new Set<string>();
  const answeredToolUseIds = new Set<string>();
  let last: { toolUseId: string; toolName: string; startedAt: string | null } | null = null;
  for (const line of transcriptText.split('\n')) {
    const entry = line.trim() === '' ? undefined : parsedRecordOf(line);
    if (entry === undefined) continue;
    const { timestamp } = entry;
    for (const block of contentBlocksOf(entry)) {
      const {
        type: blockType, id: toolUseId, name: toolName, tool_use_id: answeredToolUseId
      } = block;
      if (blockType === 'tool_result' && typeof answeredToolUseId === 'string') answeredToolUseIds.add(answeredToolUseId);
      if (entry['type'] !== 'assistant' || blockType !== 'tool_use' || typeof toolUseId !== 'string' || calledToolUseIds.has(toolUseId)) continue;
      calledToolUseIds.add(toolUseId);
      last = { toolUseId, toolName: typeof toolName === 'string' ? toolName : '', startedAt: typeof timestamp === 'string' ? timestamp : null };
    }
  }
  return {
    parentToolUseId,
    toolCalls:    calledToolUseIds.size,
    lastToolCall: last === null ? null : { toolName: last.toolName, startedAt: last.startedAt, running: !answeredToolUseIds.has(last.toolUseId) },
    tokens:       summedTokensOf(transcriptText),
    description,
  };
}

/**
 * The session's subagents, its workflow runs' among them, except those whose parent call `skippedParentToolUseIds` holds, so a caller
 * reads no transcript its event log already tallied. A subagent with no `.meta.json` is keyed by its agent id; an absent folder is none.
 * A subagent that two project folders of the session hold is read once.
 */
function subagentFactsOf(configFolder: string, sessionId: string, skippedParentToolUseIds: ReadonlySet<string>): SubagentFacts[] {
  const facts: SubagentFacts[] = [];
  const readParentToolUseIds = new Set<string>();
  for (const transcript of findSessionSubagentTranscripts(configFolder, sessionId)) {
    const parentToolUseId = parentToolUseIdBeside(transcript.path) ?? transcript.agentIdentifier;
    if (skippedParentToolUseIds.has(parentToolUseId) || readParentToolUseIds.has(parentToolUseId)) continue;
    const transcriptText = transcriptTextAt(transcript.path);
    if (transcriptText === undefined) continue;
    readParentToolUseIds.add(parentToolUseId);
    facts.push(subagentFactsOfTranscript(parentToolUseId, transcriptText, agentDescriptionBeside(transcript.path) ?? null));
  }
  return facts;
}

export const ClaudeSessionSubagents = Object.freeze({ subagentFactsOf, subagentFactsOfTranscript });
