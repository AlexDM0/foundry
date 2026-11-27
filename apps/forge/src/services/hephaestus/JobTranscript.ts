/**
 * A job's transcript as vendor-neutral entries, read from its `events-<instance>.ndjson` files through the adapter's mapper, so a running,
 * finished or childless job reads alike. The cursor is `(instance, sequence)`. Who sent a client line is derived from records the board
 * keeps, never from the line, and a chat's pictures read as their sha256 ids with User's names for them, never their bytes.
 */
import { createHash } from 'node:crypto';

import type { AssistantChat }                                           from '../../adapters/assistant-chats/AssistantChatsIngestion.ts';
import type { AgentPicture, SentLine }                                  from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentSessionEvent }                                       from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { EventLogEntry }                                           from '../../lib/talos/EventLog.ts';
import { clientEntryOf }                                                from '../../lib/talos/TalosFrames.ts';
import type { LogRecord }                                               from '../../lib/tracker-model/@types/LogRecord.ts';
import type { TranscriptClientAct, TranscriptEntry, TranscriptPicture } from '../../shared/@types/TranscriptEntry.ts';
import { AssistantBoot, FIRST_CHAT_SEQUENCE }                           from './AssistantBoot.ts';
import { AssistantSession }                                             from './AssistantSession.ts';
import type { BoardChildren }                                           from './BoardChildren.ts';

export interface TranscriptCursor {
  instance: number;
  sequence: number;
}

/** What the board says about a job's client lines, which tells who sent each. */
export interface TranscriptSenderFacts {
  /** User's texts to the job in log order: its `job-messaged` and `job-reopened` records, but those `byHephaestus`. */
  userMessageTexts:              readonly string[];
  /** The Assistant's chats past the first, from its chats file, none while it cannot be read; `null` for every other job. */
  assistantChats:                readonly AssistantChat[] | null;
  /** The requests the Assistant answered under an incident; every other answer is User's. */
  requestIdsAnsweredByAssistant: readonly string[];
  /** The name each picture of the job's records was sent with, by picture id. */
  pictureNamesById:              ReadonlyMap<string, string>;
}

export interface TranscriptReading {
  eventsAfter:        BoardChildren['eventsAfter'];
  eventsOf:           (line: string) => readonly AgentSessionEvent[];
  sentLineOf:         (line: string) => SentLine | null;
  /** Called only when a client line is among the entries read. */
  senderFactsOf:      () => TranscriptSenderFacts;
  /** The entries carry no pictures, so a reader that needs only the words decodes and hashes none. */
  leavesPicturesOut?: boolean;
}

type ClientLine = SentLine | { readonly act: Extract<TranscriptClientAct, 'close-input' | 'stop'> };

type ClientLineSender = Pick<TranscriptEntry, 'role' | 'sentBy' | 'chatSequence' | 'incidentIds'>;

type EntryOfLine = Omit<TranscriptEntry, 'cursor' | 'entryKey' | 'at'>;

const CURSOR_PATTERN = /^(\d+)\.(\d+)$/;

const SENT_BY_HEPHAESTUS: ClientLineSender = { role: 'hephaestus', sentBy: 'hephaestus' };
const SENT_BY_USER: ClientLineSender = { role: 'user', sentBy: 'user' };

/** `null` for text that is no `<instance>.<sequence>`; an absent cursor reads as the start. */
function cursorOf(text: string | null): TranscriptCursor | null {
  if (text === null || text === '') return { instance: 1, sequence: 0 };
  const match = CURSOR_PATTERN.exec(text);
  if (match === null) return null;
  return { instance: Number(match[1]), sequence: Number(match[2]) };
}

function subagentOf(parentToolUseId: string | null): Pick<TranscriptEntry, 'parentToolUseId'> {
  return parentToolUseId === null ? {} : { parentToolUseId };
}

function entryOfEvent(event: AgentSessionEvent): EntryOfLine | null {
  switch (event.kind) {
    case 'assistant-turn':
      return {
        role: 'assistant', text: event.text, model: event.model, ...event.usage === null ? {} : { tokens: event.usage.outputTokens }, ...subagentOf(event.parentToolUseId)
      };
    case 'tool-call':
      return {
        role:      'tool-call',
        text:      event.inputSummary,
        toolName:  event.toolName,
        toolUseId: event.toolUseId,
        asksUser:  event.asksUser,
        ...subagentOf(event.parentToolUseId),
      };
    case 'tool-result':
      return {
        role: 'tool-result', text: event.isError ? 'error' : '', toolUseId: event.toolUseId, ...subagentOf(event.parentToolUseId)
      };
    case 'result':
      return { role: 'turn-end', text: event.isError ? 'error' : '' };
    default:
      return null;
  }
}

/** `null` for a line that is no client entry, and for a written line the adapter does not read back; a closed input keeps its act's name. */
function clientLineOf(line: string, sentLineOf: TranscriptReading['sentLineOf']): ClientLine | null {
  const entry = clientEntryOf(line);
  if (entry === null) return null;
  if (entry.act === 'write-line') return sentLineOf(entry.line);
  return { act: entry.act === 'close' ? 'close-input' : 'stop' };
}

/**
 * Asked in log order from the job's first line. The Assistant's k-th chat is chat k: chat 1 its first message, and its chats file says
 * which later one carried User's message. For every other job a chat equal to User's next unmatched text is User's, since User's messages
 * are sent verbatim and in log order; every other chat (first message, wind-down, resume line, answer as a chat) is Hephaestus's.
 */
function createSenderOf(facts: TranscriptSenderFacts): (clientLine: ClientLine) => ClientLineSender {
  let chatCount = 0;
  let matchedUserMessages = 0;
  const assistantChatSenderOf = (chats: readonly AssistantChat[], chatSequence: number): ClientLineSender => {
    if (chatSequence === FIRST_CHAT_SEQUENCE) return { ...SENT_BY_HEPHAESTUS, chatSequence };
    const chat = chats.find((candidate) => candidate.sequence === chatSequence);
    if (chat === undefined) return SENT_BY_HEPHAESTUS;
    return chat.messageNumber === null ? { ...SENT_BY_HEPHAESTUS, chatSequence, incidentIds: [...chat.incidentIds] } : SENT_BY_USER;
  };
  return (clientLine) => {
    if (clientLine.act === 'answer') {
      return facts.requestIdsAnsweredByAssistant.includes(clientLine.requestId) ? { role: 'hephaestus', sentBy: 'assistant' } : SENT_BY_USER;
    }
    if (clientLine.act !== 'chat') return SENT_BY_HEPHAESTUS;
    chatCount += 1;
    if (facts.assistantChats !== null) return assistantChatSenderOf(facts.assistantChats, chatCount);
    if (facts.userMessageTexts[matchedUserMessages] !== clientLine.text) return SENT_BY_HEPHAESTUS;
    matchedUserMessages += 1;
    return SENT_BY_USER;
  };
}

function transcriptPictureOf(picture: AgentPicture, pictureNamesById: ReadonlyMap<string, string>): TranscriptPicture {
  const bytes = Buffer.from(picture.base64Data, 'base64');
  const pictureId = createHash('sha256').update(bytes).digest('hex');
  return {
    pictureId, name: pictureNamesById.get(pictureId) ?? null, mediaType: picture.mediaType, bytes: bytes.length
  };
}

function picturesOf(clientLine: ClientLine, pictureNamesById: () => ReadonlyMap<string, string>): Pick<TranscriptEntry, 'pictures'> {
  if (clientLine.act !== 'chat' || clientLine.pictures.length === 0) return {};
  const namesById = pictureNamesById();
  return { pictures: clientLine.pictures.map((picture) => transcriptPictureOf(picture, namesById)) };
}

function clientTextOf(clientLine: ClientLine): string {
  if (clientLine.act === 'chat') return clientLine.text;
  if (clientLine.act === 'answer') return Object.values(clientLine.answers).join('\n');
  return '';
}

function entriesOfLogEntry(
  entry: EventLogEntry,
  reading: TranscriptReading,
  senderOf: () => (clientLine: ClientLine) => ClientLineSender,
  pictureNamesById: () => ReadonlyMap<string, string>,
): EntryOfLine[] {
  if (entry.origin === 'talos') return [{ role: 'talos', text: entry.line }];
  if (entry.origin === 'agent') return reading.eventsOf(entry.line).map(entryOfEvent).filter((mapped) => mapped !== null);
  const clientLine = clientLineOf(entry.line, reading.sentLineOf);
  if (clientLine === null) return [];
  return [{
    ...senderOf()(clientLine), text: clientTextOf(clientLine), clientAct: clientLine.act, ...reading.leavesPicturesOut === true ? {} : picturesOf(clientLine, pictureNamesById)
  }];
}

function isAfter(instance: number, sequence: number, cursor: TranscriptCursor): boolean {
  return instance > cursor.instance || (instance === cursor.instance && sequence > cursor.sequence);
}

/** The client lines at or before the cursor, so the count of chats goes on from where the cursor left it. */
function clientLinesUpTo(jobFolder: string, cursor: TranscriptCursor, reading: Pick<TranscriptReading, 'eventsAfter' | 'sentLineOf'>): ClientLine[] {
  const clientLines: ClientLine[] = [];
  for (let instance = 1; instance <= cursor.instance; instance += 1) {
    const read = reading.eventsAfter(jobFolder, instance, 0);
    if (read === 'malformed') continue;
    for (const entry of read) {
      if (isAfter(instance, entry.sequence, cursor) || entry.origin !== 'client') continue;
      const clientLine = clientLineOf(entry.line, reading.sentLineOf);
      if (clientLine !== null) clientLines.push(clientLine);
    }
  }
  return clientLines;
}

/** Every entry after the cursor, across instances in order, and the cursor of the last log entry read. */
function entriesAfter(
  jobFolder: string,
  newestInstance: number,
  after: TranscriptCursor,
  reading: TranscriptReading,
): { entries: TranscriptEntry[]; cursor: TranscriptCursor } {
  let facts: TranscriptSenderFacts | null = null;
  const factsOf = (): TranscriptSenderFacts => {
    facts ??= reading.senderFactsOf();
    return facts;
  };
  let sender: ((clientLine: ClientLine) => ClientLineSender) | null = null;
  const senderOf = (): ((clientLine: ClientLine) => ClientLineSender) => {
    if (sender !== null) return sender;
    const created = createSenderOf(factsOf());
    for (const clientLine of clientLinesUpTo(jobFolder, after, reading)) created(clientLine);
    sender = created;
    return created;
  };
  const entries: TranscriptEntry[] = [];
  let cursor = after;
  for (let { instance } = after; instance <= newestInstance; instance += 1) {
    const read = reading.eventsAfter(jobFolder, instance, instance === after.instance ? after.sequence : 0);
    if (read === 'malformed') continue;
    for (const logEntry of read) {
      const base = { cursor: `${instance}.${logEntry.sequence}`, at: logEntry.at ?? null };
      const entriesOfLine = entriesOfLogEntry(logEntry, reading, senderOf, () => factsOf().pictureNamesById);
      entries.push(...entriesOfLine.map((entry, part) => ({ ...base, entryKey: `${base.cursor}.${part}`, ...entry })));
      cursor = { instance, sequence: logEntry.sequence };
    }
  }
  return { entries, cursor };
}

/** The facts `entriesAfter` derives senders and picture names from, read from the board's log and the Assistant's chats file. */
function senderFactsOf(logRecords: readonly LogRecord[], trackerDirectory: string, jobId: string): TranscriptSenderFacts {
  const userMessageTexts: string[] = [];
  const requestIdsAnsweredByAssistant: string[] = [];
  const pictureNamesById = new Map<string, string>();
  let isAssistant = false;
  for (const record of logRecords) {
    if (record.kind === 'incident-answered' && record.fields.requestId !== undefined) requestIdsAnsweredByAssistant.push(record.fields.requestId);
    if (!('jobId' in record) || record.jobId !== jobId) continue;
    if (record.kind === 'job-messaged' || record.kind === 'job-reopened') {
      // Hephaestus's wording of a setup move is sent like User's message, yet it is Hephaestus's chat.
      if (record.fields.byHephaestus !== true) userMessageTexts.push(record.fields.text);
      for (const picture of record.fields.pictures ?? []) pictureNamesById.set(picture.pictureId, picture.name);
    }
    if (record.kind === 'job-launched') {
      isAssistant = AssistantBoot.isAssistantJob({ kind: record.fields.kind });
      for (const picture of record.fields.intakePictures ?? []) pictureNamesById.set(picture.pictureId, picture.name);
    }
  }
  return {
    userMessageTexts,
    assistantChats: isAssistant ? assistantChatsOf(trackerDirectory, jobId) : null,
    requestIdsAnsweredByAssistant,
    pictureNamesById,
  };
}

/** A read-only reader opens no incident: a chats file that cannot be read shows each later chat as Hephaestus's. */
function assistantChatsOf(trackerDirectory: string, jobId: string): readonly AssistantChat[] {
  const reading = AssistantSession.chatsOf(trackerDirectory, jobId);
  return reading.verdict === 'readable' ? reading.chats : [];
}

export const JobTranscript = Object.freeze({ cursorOf, entriesAfter, senderFactsOf });
