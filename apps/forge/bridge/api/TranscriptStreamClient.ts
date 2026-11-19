/**
 * Follows one job's transcript on `/api/jobs/<J>/stream?after=<instance>.<sequence>`: a `history` event with every entry after the cursor,
 * then a `message` per new entry. The client keeps the last cursor it received, so a panel reopened on the same job resumes after it. One
 * log line can give several entries with one cursor, so an entry is known by its `entryKey`.
 */
import type { EventStreamSource }                                            from './EventStreamClient.ts';
import { EVENT_SOURCE_CLOSED_READY_STATE, STREAM_REOPEN_DELAY_MILLISECONDS } from './constants/StreamReopening.ts';

/** A picture a chat carried; `name` is `null` when no record of the job names it. */
export interface TranscriptPictureDocument {
  readonly pictureId: string;
  readonly name:      string | null;
  readonly mediaType: string;
  readonly bytes:     number;
}

/**
 * The vendor-neutral entry the Overseer maps every stored line into; the Bridge never parses a vendor line. `at` is Talos's UTC stamp,
 * which a view shows in local time.
 */
export interface TranscriptEntryDocument {
  readonly cursor:           string;
  readonly entryKey:         string;
  readonly role:             string;
  readonly text:             string;
  readonly at:               string | null;
  readonly toolName?:        string;
  readonly parentToolUseId?: string;
  readonly toolUseId?:       string;
  /** On a tool call only: true for the call that asks User a question. */
  readonly asksUser?:        boolean;
  readonly model?:           string;
  readonly tokens?:          number;
  readonly clientAct?:       'chat' | 'answer' | 'interrupt' | 'close-input' | 'stop';
  readonly sentBy?:          'user' | 'overseer' | 'assistant';
  readonly chatSequence?:    number;
  readonly incidentIds?:     readonly string[];
  /** On a chat that carried pictures: each served at `/api/pictures/<pictureId>`; the entry never carries the bytes. */
  readonly pictures?:        readonly TranscriptPictureDocument[];
}

export interface TranscriptStreamHandlers {
  readonly onEntries:  (entries: readonly TranscriptEntryDocument[]) => void;
  /** The `history` event arrived, after its entries and also when it brought none. */
  readonly onHistory?: () => void;
}

export interface TranscriptStream {
  readonly close:      () => void;
  readonly lastCursor: () => string | null;
}

export interface TranscriptStreamOptions {
  readonly after?:                   string | null;
  readonly eventSourceOf?:           (url: string) => EventStreamSource;
  readonly reopenDelayMilliseconds?: number;
}

function isEntry(value: unknown): value is TranscriptEntryDocument {
  if (typeof value !== 'object' || value === null) return false;
  const {
    cursor, entryKey, role, text, at
  } = value as Partial<Record<keyof TranscriptEntryDocument, unknown>>;
  return typeof cursor === 'string' && typeof entryKey === 'string' && typeof role === 'string' && typeof text === 'string' && (typeof at === 'string' || at === null);
}

function streamUrlOf(jobId: string, after: string | null): string {
  const path = `/api/jobs/${encodeURIComponent(jobId)}/stream`;
  return after === null ? path : `${path}?after=${encodeURIComponent(after)}`;
}

function parsedDataOf(event: Event): unknown {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as unknown;
  } catch {
    return null;
  }
}

/**
 * The browser's own reconnect sends the last cursor as `Last-Event-ID`; a stream it gave up on is opened again here after the last cursor
 * received. Either way an entry already received is dropped, so a replay never shows a line twice.
 */
function follow(jobId: string, handlers: TranscriptStreamHandlers, options: TranscriptStreamOptions = {}): TranscriptStream {
  const eventSourceOf = options.eventSourceOf ?? ((url: string): EventStreamSource => new EventSource(url));
  const reopenDelay = options.reopenDelayMilliseconds ?? STREAM_REOPEN_DELAY_MILLISECONDS;
  let lastCursor = options.after ?? null;
  const receivedEntryKeys = new Set<string>();
  let source: EventStreamSource | null = null;
  let reopenTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const receive = (entries: readonly unknown[]): void => {
    const fresh = entries.filter(isEntry).filter((entry) => !receivedEntryKeys.has(entry.entryKey));
    if (fresh.length === 0) return;
    fresh.forEach((entry) => receivedEntryKeys.add(entry.entryKey));
    lastCursor = fresh.at(-1)?.cursor ?? lastCursor;
    handlers.onEntries(fresh);
  };

  const connect = (): void => {
    const opened = eventSourceOf(streamUrlOf(jobId, lastCursor));
    source = opened;
    opened.addEventListener('history', (event) => {
      const entries = parsedDataOf(event);
      receive(Array.isArray(entries) ? entries : []);
      handlers.onHistory?.();
    });
    opened.addEventListener('message', (event) => receive([parsedDataOf(event)]));
    opened.addEventListener('error', () => {
      if (opened.readyState !== EVENT_SOURCE_CLOSED_READY_STATE || closed) return;
      reopenTimer = setTimeout(connect, reopenDelay);
    });
  };

  connect();
  return {
    close: () => {
      closed = true;
      if (reopenTimer !== null) clearTimeout(reopenTimer);
      source?.close();
    },
    lastCursor: () => lastCursor,
  };
}

export const TranscriptStreamClient = Object.freeze({ follow, streamUrlOf });
