/**
 * A session's transcript read as a chat: the Overseer's and Talos's lines as system lines, User's messages as bubbles, and the
 * session's own entries as agent turns, each with its prose and its top-level tool calls. A turn ends at its `turn-end`; a call is paired
 * with its result by `toolUseId`; a subagent's entries stay out, since the Agents view shows them. Text is carried as text, never parsed.
 */
import type { TranscriptEntryDocument } from '../api/TranscriptStreamClient.ts';

/** What a system line says, worded by its view: a chat the Overseer wrote, a Talos standing reply, or what a client line did. */
export type SystemLineFacts =
  | { readonly form: 'boot'; readonly chatSequence: number | null }
  | { readonly form: 'incident-delivery'; readonly chatSequence: number | null; readonly incidentIds: readonly string[] }
  | { readonly form: 'overseer-chat' }
  | { readonly form: 'standing-reply' }
  | { readonly form: 'client-act'; readonly act: SystemClientAct; readonly sender: 'overseer' | 'assistant' };

export type SystemClientAct = 'answer' | 'interrupt' | 'close-input' | 'stop';

/** `unanswered`: the turn ended with no result for the call. */
export type ToolCallState = 'ok' | 'error' | 'running' | 'unanswered';

export interface ToolCall {
  readonly key:       string;
  readonly toolName:  string;
  readonly inputText: string;
  readonly state:     ToolCallState;
  readonly startedAt: string | null;
}

export interface ToolCount {
  readonly toolName: string;
  readonly count:    number;
}

export interface ToolFold {
  readonly calls:      readonly ToolCall[];
  /** Most used first, a tie in the order the tools first ran. */
  readonly toolCounts: readonly ToolCount[];
  readonly errorCount: number;
}

export interface SystemThreadItem {
  readonly kind:       'system';
  readonly key:        string;
  readonly at:         string | null;
  readonly facts:      SystemLineFacts;
  /** The text a chat from the Overseer said, shown on User's ask; `null` for a line with nothing to show. */
  readonly revealText: string | null;
}

export interface UserMessageThreadItem {
  readonly kind:   'user-message';
  readonly key:    string;
  readonly at:     string | null;
  readonly text:   string;
  readonly queued: boolean;
}

export interface AgentTurnThreadItem {
  readonly kind:     'agent-turn';
  readonly key:      string;
  /** The stamp of the turn's last entry; `null` while it works and when the entry has none. */
  readonly at:       string | null;
  readonly working:  boolean;
  readonly prose:    string;
  readonly toolFold: ToolFold | null;
}

export type ChatThreadItem = SystemThreadItem | UserMessageThreadItem | AgentTurnThreadItem;

/** A message User sent that the session has not taken yet, from its `job-messaged` record. */
export interface QueuedMessage {
  readonly at:   string;
  readonly text: string;
}

/** The text of a `tool-result` or `turn-end` entry that failed. */
const ERROR_TEXT = 'error';

const CLIENT_ACTS: ReadonlySet<string> = new Set<SystemClientAct>(['answer', 'interrupt', 'close-input', 'stop']);

const AGENT_ROLES: ReadonlySet<string> = new Set(['assistant', 'tool-call', 'tool-result']);

function isSubagentEntry(entry: TranscriptEntryDocument): boolean {
  return entry.parentToolUseId !== undefined;
}

function isClientAct(clientAct: string | undefined): clientAct is SystemClientAct {
  return clientAct !== undefined && CLIENT_ACTS.has(clientAct);
}

/** Every entry the thread reads: the session's own, never a subagent's. */
function threadEntriesOf(entries: readonly TranscriptEntryDocument[]): TranscriptEntryDocument[] {
  return entries.filter((entry) => !isSubagentEntry(entry));
}

function toolCountsOf(calls: readonly ToolCall[]): ToolCount[] {
  const countByTool = new Map<string, number>();
  for (const call of calls) countByTool.set(call.toolName, (countByTool.get(call.toolName) ?? 0) + 1);
  // A Map keeps first appearance, and the sort is stable, so a tie stays in that order.
  return [...countByTool].map(([toolName, count]) => ({ toolName, count })).sort((a, b) => b.count - a.count);
}

interface CallReading {
  readonly resultTextByToolUseId: ReadonlyMap<string, string>;
  /** The position of the last `turn-end` among the thread entries; -1 while none came. */
  readonly lastTurnEndPosition:   number;
}

function callStateOf(entry: TranscriptEntryDocument, position: number, reading: CallReading): ToolCallState {
  const resultText = entry.toolUseId === undefined ? undefined : reading.resultTextByToolUseId.get(entry.toolUseId);
  if (resultText !== undefined) return resultText === ERROR_TEXT ? 'error' : 'ok';
  return reading.lastTurnEndPosition > position ? 'unanswered' : 'running';
}

function toolFoldOf(segment: readonly (readonly [TranscriptEntryDocument, number])[], reading: CallReading): ToolFold | null {
  const calls = segment
    .filter(([entry]) => entry.role === 'tool-call')
    .map(([entry, position]): ToolCall => ({
      key:       entry.entryKey,
      toolName:  entry.toolName ?? '',
      inputText: entry.text,
      state:     callStateOf(entry, position, reading),
      startedAt: entry.at,
    }));
  if (calls.length === 0) return null;
  return { calls, toolCounts: toolCountsOf(calls), errorCount: calls.filter((call) => call.state === 'error' || call.state === 'unanswered').length };
}

function systemItemOf(entry: TranscriptEntryDocument, isFirstOverseerChat: boolean): SystemThreadItem {
  const base = { kind: 'system', key: entry.entryKey, at: entry.at } as const;
  if (entry.role === 'talos') return { ...base, facts: { form: 'standing-reply' }, revealText: null };
  if (isClientAct(entry.clientAct)) {
    return { ...base, facts: { form: 'client-act', act: entry.clientAct, sender: entry.sentBy === 'assistant' ? 'assistant' : 'overseer' }, revealText: null };
  }
  const revealText = entry.text === '' ? null : entry.text;
  const chatSequence = entry.chatSequence ?? null;
  if (isFirstOverseerChat) return { ...base, facts: { form: 'boot', chatSequence }, revealText };
  const incidentIds = entry.incidentIds ?? [];
  if (incidentIds.length > 0) return { ...base, facts: { form: 'incident-delivery', chatSequence, incidentIds }, revealText };
  return { ...base, facts: { form: 'overseer-chat' }, revealText };
}

/**
 * The thread in the order the entries came, then the queued messages. The session's entries between two other items are one agent turn;
 * a `turn-end` closes it. A standing reply or a message that comes in the middle of a turn parts it, and only the newest part with no
 * `turn-end` after it is working.
 */
function threadItemsOf(entries: readonly TranscriptEntryDocument[], queuedMessages: readonly QueuedMessage[]): ChatThreadItem[] {
  const threadEntries = threadEntriesOf(entries);
  const resultTextByToolUseId = new Map(threadEntries.flatMap((entry) => (
    entry.role === 'tool-result' && entry.toolUseId !== undefined ? [[entry.toolUseId, entry.text] as const] : []
  )));
  const reading: CallReading = { resultTextByToolUseId, lastTurnEndPosition: threadEntries.findLastIndex((entry) => entry.role === 'turn-end') };
  const items: ChatThreadItem[] = [];
  let segment: (readonly [TranscriptEntryDocument, number])[] = [];
  const agentTurnPlaces: { readonly itemPosition: number; readonly startPosition: number }[] = [];
  let overseerChatSeen = false;

  const closeSegment = (turnEnd: TranscriptEntryDocument | null): void => {
    const closed = segment;
    segment = [];
    const [first] = closed;
    if (first === undefined) return;
    const turnEntries = closed.map(([entry]) => entry);
    const prose = turnEntries.filter((entry) => entry.role === 'assistant' && entry.text !== '').map((entry) => entry.text).join('\n\n');
    const toolFold = toolFoldOf(closed, reading);
    // Results alone, after a standing reply, belong to calls already shown.
    if (prose === '' && toolFold === null) return;
    agentTurnPlaces.push({ itemPosition: items.length, startPosition: first[1] });
    items.push({
      kind: 'agent-turn', key: first[0].entryKey, at: (turnEnd ?? turnEntries.at(-1))?.at ?? null, working: false, prose, toolFold
    });
  };

  threadEntries.forEach((entry, position) => {
    if (AGENT_ROLES.has(entry.role)) {
      segment.push([entry, position]);
      return;
    }
    if (entry.role === 'turn-end') {
      closeSegment(entry);
      return;
    }
    closeSegment(null);
    if (entry.role === 'user') {
      items.push({
        kind: 'user-message', key: entry.entryKey, at: entry.at, text: entry.text, queued: false
      });
      return;
    }
    if (entry.role !== 'overseer' && entry.role !== 'talos') return;
    const isChat = entry.role === 'overseer' && !isClientAct(entry.clientAct);
    items.push(systemItemOf(entry, isChat && !overseerChatSeen));
    overseerChatSeen ||= isChat;
  });
  closeSegment(null);

  const lastAgentTurnPlace = agentTurnPlaces.at(-1);
  const lastAgentTurn = lastAgentTurnPlace === undefined ? undefined : items[lastAgentTurnPlace.itemPosition];
  if (lastAgentTurnPlace !== undefined && lastAgentTurn?.kind === 'agent-turn' && reading.lastTurnEndPosition < lastAgentTurnPlace.startPosition) {
    items[lastAgentTurnPlace.itemPosition] = { ...lastAgentTurn, at: null, working: true };
  }

  return [
    ...items,
    ...queuedMessages.map((message, position): UserMessageThreadItem => ({
      kind: 'user-message', key: `queued.${position}`, at: message.at, text: message.text, queued: true
    })),
  ];
}

/** The session's turns, a turn counted once it holds an entry of its own, however many items a standing reply or a message parts it into. */
function turnCountOf(entries: readonly TranscriptEntryDocument[]): number {
  let turns = 0;
  let turnHasEntries = false;
  for (const entry of threadEntriesOf(entries)) {
    if (AGENT_ROLES.has(entry.role)) turnHasEntries = true;
    if (entry.role === 'turn-end') {
      if (turnHasEntries) turns += 1;
      turnHasEntries = false;
    }
  }
  return turnHasEntries ? turns + 1 : turns;
}

export const ChatThreadModelUtil = Object.freeze({ threadItemsOf, turnCountOf });
