/**
 * A job's live facts as the Overseer's API shows them, read from its Watcher event logs through the adapter's mapper: API turns against
 * the budget, tokens so far, and tool calls, the job's own and each subagent's by `parentToolUseId`, a subagent the log lost rebuilt from
 * the session's transcripts; whether a turn is under way, User's messages not yet sent, and a session's last line. The stamps are only
 * recorded and shown: no Overseer decision reads them.
 */

import type { AgentAdapter }                    from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentSessionEvent }               from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { Job, JobKind }                    from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                           from '../../lib/tracker-model/Board.ts';
import type { EventLogEntry }                   from '../../lib/watcher/EventLog.ts';
import { clientFrameOf }                        from '../../lib/watcher/WatcherFrames.ts';
import type { TranscriptEntry, TranscriptRole } from '../../shared/@types/TranscriptEntry.ts';
import { AssistantBoot }                        from './AssistantBoot.ts';
import { AssistantSession }                     from './AssistantSession.ts';
import { ClaudeTranscripts }                    from './ClaudeTranscripts.ts';
import { JobControlDelivery }                   from './JobControlDelivery.ts';
import { JobLaunch }                            from './JobLaunch.ts';
import { JobTranscript }                        from './JobTranscript.ts';
import { LegacyWatcherReader }                  from './LegacyWatcherReader.ts';
import { WatcherFleet }                         from './WatcherFleet.ts';

export interface LastToolCall {
  toolName:  string;
  /** The Watcher log entry's stamp; `null` for an entry written before stamps. */
  startedAt: string | null;
  /** True until the call's result arrives. */
  running:   boolean;
}

export interface SubagentLiveFacts {
  parentToolUseId: string;
  toolCalls:       number;
  lastToolCall:    LastToolCall | null;
  tokens:          number;
  /** `running` while the parent call that spawned it has no result; a subagent whose parent call the log does not hold reads `ended`. */
  state:           SubagentState;
  /** The parent call's `description` input, or the one its `.meta.json` names; `null` without one. */
  description:     string | null;
}

export type SubagentState = 'running' | 'ended';

/** Whether a message sent now reaches the session between turns or waits behind the turn under way. */
export type JobTurn = 'between-turns' | 'mid-turn';

/** The newest line of a session's own words, or of User's chat to it, so a list of sessions shows it with no stream per row. */
export interface SessionLastLine {
  role: Extract<TranscriptRole, 'assistant' | 'user'>;
  text: string;
  /** The Watcher log entry's stamp; `null` for an entry written before stamps. */
  at:   string | null;
}

export interface WatcherFacts {
  /** The protocol the newest instance's Watcher record names; `null` before it wrote one. */
  watcherProtocol: number | null;
  /** A Watcher below the supported window: watched through its files alone. */
  watchOnly:       boolean;
}

export interface JobLiveFacts {
  jobId:                  string;
  /** API turns of the job's own session, the count its call budget is held against. */
  calls:                  number;
  /** `null` for a job no budget holds. */
  callBudget:             number | null;
  tokens:                 number;
  toolCalls:              number;
  lastToolCall:           LastToolCall | null;
  subagents:              SubagentLiveFacts[];
  toolCallsWithSubagents: number;
  watcherProtocol:        number | null;
  watchOnly:              boolean;
  /**
   * The newest Watcher instance's: `mid-turn` while it took more chats than its session printed results. The Assistant's is the idle rule its
   * deliveries wait on. `null` for a job with no agent session, and before its first Watcher logged a line.
   */
  turn:                   JobTurn | null;
  /** User's `job message` records its session has not taken yet. */
  messagesWaiting:        number;
  /** For an Assistant or product-owner job only; `null` for every other job, and before the session said anything. */
  lastLine:               SessionLastLine | null;
}

/** What every job's live facts are read through: its Watcher logs, the adapter that reads their lines, and the board's log and incidents. */
export interface JobLiveFactsSource {
  trackerDirectory: string;
  adapter:          Pick<AgentAdapter, 'eventsOf' | 'sentLineOf'>;
  board:            Pick<Board, 'logRecordsSoFar' | 'incidents'>;
}

export interface StampedEvents {
  at:     string | null;
  events: readonly AgentSessionEvent[];
}

/** Where the job's session keeps its transcripts: the Claude Code config folder from the command context, and the session id its adapter derived. */
export interface JobSession {
  claudeConfigFolder: string;
  sessionId:          string;
}

type JobLiveCounts = Omit<JobLiveFacts, 'jobId' | 'callBudget' | 'turn' | 'messagesWaiting' | 'lastLine' | keyof WatcherFacts>;

const BUDGETED_JOB_KINDS: readonly string[] = ['build', 'review'];

const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner'];

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

/** Pure over the mapped events in log order, so a spec drives it without a Watcher. */
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

function liveCountsOf(stampedEvents: readonly StampedEvents[]): JobLiveCounts {
  return eventLogTallyOf(stampedEvents).counts;
}

/** Every line of every instance, one list per instance from the first; a malformed log contributes nothing rather than failing the state. */
function entriesByInstanceOf(trackerDirectory: string, job: Readonly<Job>): (readonly EventLogEntry[])[] {
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, job.id);
  const entriesByInstance: (readonly EventLogEntry[])[] = [];
  for (let instance = 1; instance <= job.watcherInstance; instance += 1) {
    const read = WatcherFleet.eventsAfter(jobFolder, instance, 0);
    entriesByInstance.push(read === 'malformed' ? [] : read);
  }
  return entriesByInstance;
}

/** Pure over the newest instance's lines: the chats its Watcher took against the results its session printed. */
function turnOfEntries(newestInstanceEntries: readonly EventLogEntry[], adapter: JobLiveFactsSource['adapter']): JobTurn | null {
  if (newestInstanceEntries.length === 0) return null;
  let chats = 0;
  let results = 0;
  for (const entry of newestInstanceEntries) {
    if (entry.origin === 'agent') results += adapter.eventsOf(entry.line).filter((event) => event.kind === 'result').length;
    if (entry.origin !== 'client') continue;
    const frame = clientFrameOf(entry.line);
    if (frame?.kind === 'write' && adapter.sentLineOf(frame.line)?.act === 'chat') chats += 1;
  }
  return chats > results ? 'mid-turn' : 'between-turns';
}

function turnOf(source: JobLiveFactsSource, job: Readonly<Job>, newestInstanceEntries: readonly EventLogEntry[]): JobTurn | null {
  if (job.role === null) return null;
  if (!AssistantBoot.isAssistantJob(job)) return turnOfEntries(newestInstanceEntries, source.adapter);
  if (newestInstanceEntries.length === 0) return null;
  const reading = AssistantSession.readingOf(source.trackerDirectory, source.adapter, job);
  return AssistantSession.assistantIsIdle(source.trackerDirectory, source.board, job, reading) ? 'between-turns' : 'mid-turn';
}

function isLastLineEntry(entry: TranscriptEntry): boolean {
  if (entry.role === 'assistant') return entry.text !== '' && entry.parentToolUseId === undefined;
  return entry.role === 'user' && entry.clientAct === 'chat';
}

/** Read as the transcript stream reads the session, so the line and its sender are the ones the session's chat shows. */
function lastLineOf(source: JobLiveFactsSource, job: Readonly<Job>): SessionLastLine | null {
  if (!SESSION_JOB_KINDS.includes(job.kind)) return null;
  const { entries } = JobTranscript.entriesAfter(WatcherFleet.jobFolderOf(source.trackerDirectory, job.id), job.watcherInstance, TRANSCRIPT_START, {
    eventsOf:      (line) => source.adapter.eventsOf(line),
    sentLineOf:    (line) => source.adapter.sentLineOf(line),
    senderFactsOf: () => JobTranscript.senderFactsOf(source.board.logRecordsSoFar(), source.trackerDirectory, job.id),
  });
  const newest = entries.findLast(isLastLineEntry);
  return newest === undefined ? null : { role: newest.role === 'user' ? 'user' : 'assistant', text: newest.text, at: newest.at };
}

function watcherFactsOf(trackerDirectory: string, job: Readonly<Job>): WatcherFacts {
  const record = WatcherFleet.watcherRecordOf(WatcherFleet.jobFolderOf(trackerDirectory, job.id), job.watcherInstance);
  return { watcherProtocol: record?.protocolVersion ?? null, watchOnly: LegacyWatcherReader.attachmentOf(record) === 'legacy-watcher' };
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
function lostSubagentsOf(session: JobSession, tally: EventLogTally): SubagentLiveFacts[] {
  const tallied = new Set(tally.counts.subagents.map((subagent) => subagent.parentToolUseId));
  const stateOf = (parentToolUseId: string): SubagentState => subagentStateOf(parentToolUseId, tally.calledToolUseIds, tally.answeredToolUseIds);
  return ClaudeTranscripts.subagentFactsOf(session, tallied).map((subagent) => ({ ...subagent, state: stateOf(subagent.parentToolUseId) }));
}

function liveFactsOf(source: JobLiveFactsSource, job: Readonly<Job>, session: JobSession): JobLiveFacts {
  const entriesByInstance = entriesByInstanceOf(source.trackerDirectory, job);
  const stampedEvents = entriesByInstance.flat()
    .filter((entry) => entry.origin === 'agent')
    .map((entry) => ({ at: entry.at ?? null, events: source.adapter.eventsOf(entry.line) }));
  const tally = eventLogTallyOf(stampedEvents);
  return {
    jobId:           job.id,
    callBudget:      BUDGETED_JOB_KINDS.includes(job.kind) ? JobLaunch.callBudgetOf(job) : null,
    ...withTranscriptSubagents(tally.counts, lostSubagentsOf(session, tally)),
    ...watcherFactsOf(source.trackerDirectory, job),
    turn:            turnOf(source, job, entriesByInstance.at(-1) ?? []),
    messagesWaiting: JobControlDelivery.unsentMessageCountOf(source.board, source.trackerDirectory, job),
    lastLine:        lastLineOf(source, job),
  };
}

export const JobLiveFactsReader = Object.freeze({ liveCountsOf, liveFactsOf });
