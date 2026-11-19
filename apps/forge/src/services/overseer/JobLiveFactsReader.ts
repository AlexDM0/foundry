/**
 * A job's live facts as the Overseer's API shows them, read from its Talos event logs through the adapter's mapper: API turns against
 * the budget, tokens so far, and tool calls, the job's own and each subagent's by `parentToolUseId`, a subagent the log lost rebuilt by the
 * adapter from the session's transcripts; whether a turn is under way, User's messages not yet sent, a session's last line, and the newest usage window
 * the session reported. The stamps are only recorded and shown: no Overseer decision reads them.
 */

import type {
  JobLiveFacts,
  JobTurn,
  LastToolCall,
  SessionLastLine,
  SubagentLiveFacts,
  SubagentState,
  UsageWindowReport
} from '../../adapters/@types/BoardStateParts.ts';
import type { AgentAdapter }      from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentSessionEvent } from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { EventLogEntry }     from '../../lib/talos/EventLog.ts';
import { clientEntryOf }          from '../../lib/talos/TalosFrames.ts';
import type { Job, JobKind }      from '../../lib/tracker-model/@types/Job.ts';
import type { Board }             from '../../lib/tracker-model/Board.ts';
import type { TranscriptEntry }   from '../../shared/@types/TranscriptEntry.ts';
import { AssistantBoot }          from './AssistantBoot.ts';
import { AssistantSession }       from './AssistantSession.ts';
import type { BoardChildren }     from './BoardChildren.ts';
import { JobControlDelivery }     from './JobControlDelivery.ts';
import { JobLaunch }              from './JobLaunch.ts';
import { JobTranscript }          from './JobTranscript.ts';

/** What every job's live facts are read through: its Talos event logs, the adapter that reads their lines, and the board's log and incidents. */
export interface JobLiveFactsSource {
  boardChildren:    BoardChildren;
  trackerDirectory: string;
  adapter:          Pick<AgentAdapter, 'eventsOf' | 'sentLineOf' | 'sessionSubagentsOf'>;
  board:            Pick<Board, 'logRecordsSoFar' | 'incidents'>;
}

export interface StampedEvents {
  at:     string | null;
  events: readonly AgentSessionEvent[];
}

/** Whose transcripts the adapter reads for the job's session: the home folder from the command context, and the session id its adapter derived. */
export interface JobSession {
  homeDirectory: string;
  sessionId:     string;
}

type JobLiveCounts = Omit<JobLiveFacts, 'jobId' | 'callBudget' | 'turn' | 'messagesWaiting' | 'lastLine' | 'usageWindow'>;

const BUDGETED_JOB_KINDS: readonly string[] = ['build', 'review'];

const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner', 'pipeline-agent'];

const TRANSCRIPT_START = { instance: 1, sequence: 0 };

interface ToolCallTally {
  toolCalls:         number;
  last:              { toolUseId: string; toolName: string; startedAt: string | null } | null;
  tokensByMessageId: Map<string, number>;
}

function emptyTally(): ToolCallTally {
  return { toolCalls: 0, last: null, tokensByMessageId: new Map() };
}

function summedTokensOf(tokensByMessageId: ReadonlyMap<string, number>): number {
  return [...tokensByMessageId.values()].reduce((sum, tokens) => sum + tokens, 0);
}

function lastToolCallOf(tally: ToolCallTally, answeredToolUseIds: ReadonlySet<string>): LastToolCall | null {
  if (tally.last === null) return null;
  return { toolName: tally.last.toolName, startedAt: tally.last.startedAt, running: !answeredToolUseIds.has(tally.last.toolUseId) };
}

function tokensOf(usage: Extract<AgentSessionEvent, { kind: 'assistant-turn' }>['usage']): number {
  if (usage === null) return 0;
  return usage.inputTokens + usage.outputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens;
}

/** One rule for a subagent the log tallied and one rebuilt from its transcript: it runs while the log holds its parent call unanswered. */
function subagentStateOf(parentToolUseId: string, calledToolUseIds: ReadonlySet<string>, answeredToolUseIds: ReadonlySet<string>): SubagentState {
  return calledToolUseIds.has(parentToolUseId) && !answeredToolUseIds.has(parentToolUseId) ? 'running' : 'ended';
}

/** The counts, and the calls the log holds with those answered, which a subagent rebuilt from its transcript is judged by. */
interface EventLogTally {
  counts:             JobLiveCounts;
  calledToolUseIds:   ReadonlySet<string>;
  answeredToolUseIds: ReadonlySet<string>;
}

/** Pure over the mapped events in log order, so a spec drives it without a Talos. */
function eventLogTallyOf(stampedEvents: readonly StampedEvents[]): EventLogTally {
  const topLevelMessageIds = new Set<string>();
  const tokensByMessageId  = new Map<string, number>();
  const answeredToolUseIds = new Set<string>();
  const descriptionByToolUseId = new Map<string, string | null>();
  const ownTally = emptyTally();
  const subagentTallies = new Map<string, ToolCallTally>();
  const tallyOf = (parentToolUseId: string | null): ToolCallTally => {
    if (parentToolUseId === null) return ownTally;
    const tally = subagentTallies.get(parentToolUseId) ?? emptyTally();
    subagentTallies.set(parentToolUseId, tally);
    return tally;
  };
  for (const { at, events } of stampedEvents) {
    for (const event of events) {
      if (event.kind === 'assistant-turn') {
        if (event.parentToolUseId === null) topLevelMessageIds.add(event.messageId);
        tokensByMessageId.set(event.messageId, tokensOf(event.usage));
        tallyOf(event.parentToolUseId).tokensByMessageId.set(event.messageId, tokensOf(event.usage));
      }
      if (event.kind === 'tool-result') answeredToolUseIds.add(event.toolUseId);
      if (event.kind !== 'tool-call') continue;
      descriptionByToolUseId.set(event.toolUseId, event.description);
      const tally = tallyOf(event.parentToolUseId);
      tally.toolCalls += 1;
      tally.last = { toolUseId: event.toolUseId, toolName: event.toolName, startedAt: at };
    }
  }
  const calledToolUseIds = new Set(descriptionByToolUseId.keys());
  const subagents = [...subagentTallies].map(([parentToolUseId, tally]): SubagentLiveFacts => ({
    parentToolUseId,
    toolCalls:    tally.toolCalls,
    lastToolCall: lastToolCallOf(tally, answeredToolUseIds),
    tokens:       summedTokensOf(tally.tokensByMessageId),
    state:        subagentStateOf(parentToolUseId, calledToolUseIds, answeredToolUseIds),
    description:  descriptionByToolUseId.get(parentToolUseId) ?? null,
  }));
  const counts: JobLiveCounts = {
    calls:                  topLevelMessageIds.size,
    tokens:                 summedTokensOf(tokensByMessageId),
    toolCalls:              ownTally.toolCalls,
    lastToolCall:           lastToolCallOf(ownTally, answeredToolUseIds),
    subagents,
    toolCallsWithSubagents: subagents.reduce((sum, subagent) => sum + subagent.toolCalls, ownTally.toolCalls),
  };
  return { counts, calledToolUseIds, answeredToolUseIds };
}

/** Pure over the mapped events in log order: the last usage window reported is the newest. */
function newestUsageWindowOf(stampedEvents: readonly StampedEvents[]): UsageWindowReport | null {
  let newest: UsageWindowReport | null = null;
  for (const { at, events } of stampedEvents) {
    for (const event of events) {
      if (event.kind === 'usage-window') {
        newest = {
          window: event.window, lengthHours: event.lengthHours, resetsAt: event.resetsAt, reportedAt: at
        };
      }
    }
  }
  return newest;
}

function liveCountsOf(stampedEvents: readonly StampedEvents[]): JobLiveCounts {
  return eventLogTallyOf(stampedEvents).counts;
}

/** Every line of every instance, one list per instance from the first; a malformed log contributes nothing rather than failing the state. */
function entriesByInstanceOf(children: BoardChildren, job: Readonly<Job>): (readonly EventLogEntry[])[] {
  const jobFolder = children.jobFolderOf(job.id);
  const entriesByInstance: (readonly EventLogEntry[])[] = [];
  for (let instance = 1; instance <= job.childInstance; instance += 1) {
    const read = children.eventsAfter(jobFolder, instance, 0);
    entriesByInstance.push(read === 'malformed' ? [] : read);
  }
  return entriesByInstance;
}

/** Pure over the newest instance's lines: the chats its Talos took against the results its session printed. */
function turnOfEntries(newestInstanceEntries: readonly EventLogEntry[], adapter: JobLiveFactsSource['adapter']): JobTurn | null {
  if (newestInstanceEntries.length === 0) return null;
  let chats = 0;
  let results = 0;
  for (const entry of newestInstanceEntries) {
    if (entry.origin === 'agent') results += adapter.eventsOf(entry.line).filter((event) => event.kind === 'result').length;
    if (entry.origin !== 'client') continue;
    const clientEntry = clientEntryOf(entry.line);
    if (clientEntry?.act === 'write-line' && adapter.sentLineOf(clientEntry.line)?.act === 'chat') chats += 1;
  }
  return chats > results ? 'mid-turn' : 'between-turns';
}

function turnOf(source: JobLiveFactsSource, job: Readonly<Job>, newestInstanceEntries: readonly EventLogEntry[]): JobTurn | null {
  if (job.role === null) return null;
  if (!AssistantBoot.isAssistantJob(job)) return turnOfEntries(newestInstanceEntries, source.adapter);
  if (newestInstanceEntries.length === 0) return null;
  const reading = AssistantSession.readingOf(source.boardChildren, source.adapter, job);
  return AssistantSession.assistantIsIdle(source.trackerDirectory, source.board, job, reading) ? 'between-turns' : 'mid-turn';
}

function isLastLineEntry(entry: TranscriptEntry): boolean {
  if (entry.role === 'assistant') return entry.text !== '' && entry.parentToolUseId === undefined;
  return entry.role === 'user' && entry.clientAct === 'chat';
}

/** Read as the transcript stream reads the session, so the line and its sender are the ones the session's chat shows. */
function lastLineOf(source: JobLiveFactsSource, job: Readonly<Job>): SessionLastLine | null {
  if (!SESSION_JOB_KINDS.includes(job.kind)) return null;
  const { entries } = JobTranscript.entriesAfter(source.boardChildren.jobFolderOf(job.id), job.childInstance, TRANSCRIPT_START, {
    eventsAfter:       source.boardChildren.eventsAfter,
    eventsOf:          (line) => source.adapter.eventsOf(line),
    sentLineOf:        (line) => source.adapter.sentLineOf(line),
    senderFactsOf:     () => JobTranscript.senderFactsOf(source.board.logRecordsSoFar(), source.trackerDirectory, job.id),
    leavesPicturesOut: true,
  });
  const newest = entries.findLast(isLastLineEntry);
  return newest === undefined ? null : { role: newest.role === 'user' ? 'user' : 'assistant', text: newest.text, at: newest.at };
}

/** The event log's subagents stand; a subagent only the session's transcripts still hold is added, its tallies in the totals. */
function withTranscriptSubagents(counts: JobLiveCounts, transcriptSubagents: readonly SubagentLiveFacts[]): JobLiveCounts {
  if (transcriptSubagents.length === 0) return counts;
  return {
    ...counts,
    tokens:                 transcriptSubagents.reduce((sum, subagent) => sum + subagent.tokens, counts.tokens),
    subagents:              [...counts.subagents, ...transcriptSubagents],
    toolCallsWithSubagents: transcriptSubagents.reduce((sum, subagent) => sum + subagent.toolCalls, counts.toolCallsWithSubagents),
  };
}

/** Found by the session id, so every folder a resumed session worked in is covered, whatever spelling its working directory had. */
function lostSubagentsOf(source: JobLiveFactsSource, session: JobSession, tally: EventLogTally): SubagentLiveFacts[] {
  const tallied = new Set(tally.counts.subagents.map((subagent) => subagent.parentToolUseId));
  const stateOf = (parentToolUseId: string): SubagentState => subagentStateOf(parentToolUseId, tally.calledToolUseIds, tally.answeredToolUseIds);
  return source.adapter.sessionSubagentsOf(session.homeDirectory, session.sessionId, tallied)
    .map((subagent) => ({ ...subagent, state: stateOf(subagent.parentToolUseId) }));
}

function liveFactsOf(source: JobLiveFactsSource, job: Readonly<Job>, session: JobSession): JobLiveFacts {
  const entriesByInstance = entriesByInstanceOf(source.boardChildren, job);
  const stampedEvents = entriesByInstance.flat()
    .filter((entry) => entry.origin === 'agent')
    .map((entry) => ({ at: entry.at ?? null, events: source.adapter.eventsOf(entry.line) }));
  const tally = eventLogTallyOf(stampedEvents);
  return {
    jobId:           job.id,
    callBudget:      BUDGETED_JOB_KINDS.includes(job.kind) ? JobLaunch.callBudgetOf(job) : null,
    ...withTranscriptSubagents(tally.counts, lostSubagentsOf(source, session, tally)),
    turn:            turnOf(source, job, entriesByInstance.at(-1) ?? []),
    messagesWaiting: JobControlDelivery.unsentMessageCountOf(source.board, source.trackerDirectory, job),
    lastLine:        lastLineOf(source, job),
    usageWindow:     newestUsageWindowOf(stampedEvents),
  };
}

export const JobLiveFactsReader = Object.freeze({ liveCountsOf, liveFactsOf });
