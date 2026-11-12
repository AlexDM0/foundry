/**
 * Follows one gate profile's output on `/api/profiles/<P>/stream?after=<line number>`: a `line` event per output line, its id the line's
 * number and its data `{ text }`. The board's event stream carries no output line, so this route is the profile log's only source. The run
 * ending does not end the stream; the caller closes it when the facts say the run is over and the log is no longer shown.
 */
import type { EventStreamSource }                                            from './EventStreamClient.ts';
import { EVENT_SOURCE_CLOSED_READY_STATE, STREAM_REOPEN_DELAY_MILLISECONDS } from './constants/StreamReopening.ts';

export interface ProfileOutputLine {
  /** Counted from 1 over the run's whole output, so it is also the cursor a reopened stream asks after. */
  readonly lineNumber: number;
  readonly text:       string;
}

export interface ProfileStreamHandlers {
  readonly onLines: (lines: readonly ProfileOutputLine[]) => void;
}

export interface ProfileStream {
  readonly close:          () => void;
  /** The number of the last line received, `0` before the first. */
  readonly lastLineNumber: () => number;
}

export interface ProfileStreamOptions {
  readonly eventSourceOf?:           (url: string) => EventStreamSource;
  readonly reopenDelayMilliseconds?: number;
}

function streamUrlOf(profileRunId: string, afterLineNumber: number): string {
  const path = `/api/profiles/${encodeURIComponent(profileRunId)}/stream`;
  return afterLineNumber === 0 ? path : `${path}?after=${afterLineNumber}`;
}

function outputLineOf(event: Event): ProfileOutputLine | null {
  const message = event as MessageEvent<string>;
  const lineNumber = Number(message.lastEventId);
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return null;
  try {
    const data = JSON.parse(message.data) as unknown;
    const text = typeof data === 'object' && data !== null ? (data as { text?: unknown }).text : undefined;
    return typeof text === 'string' ? { lineNumber, text } : null;
  } catch {
    return null;
  }
}

/**
 * The browser's own reconnect sends the last line's number as `Last-Event-ID`; a stream it gave up on is opened again here after the last
 * line received. Either way a line at or before that number is dropped, so a replay never shows a line twice.
 */
function follow(profileRunId: string, handlers: ProfileStreamHandlers, options: ProfileStreamOptions = {}): ProfileStream {
  const eventSourceOf = options.eventSourceOf ?? ((url: string): EventStreamSource => new EventSource(url));
  const reopenDelay = options.reopenDelayMilliseconds ?? STREAM_REOPEN_DELAY_MILLISECONDS;
  let lastLineNumber = 0;
  let source: EventStreamSource | null = null;
  let reopenTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = (): void => {
    const opened = eventSourceOf(streamUrlOf(profileRunId, lastLineNumber));
    source = opened;
    opened.addEventListener('line', (event) => {
      const line = outputLineOf(event);
      if (line === null || line.lineNumber <= lastLineNumber) return;
      lastLineNumber = line.lineNumber;
      handlers.onLines([line]);
    });
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
    lastLineNumber: () => lastLineNumber,
  };
}

export const ProfileStreamClient = Object.freeze({ follow });
