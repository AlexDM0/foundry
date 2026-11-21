/**
 * Follows one gate profile's output through Gaia's relay (`.../forges/<trackerId>/profiles/<profileRunId>/stream?after=<line number>`): a
 * `line` event per output line, its id the line's number. The board's event stream carries no output line, so this route is the profile
 * log's only source. The run ending does not end the stream; the caller closes it when the board says the run is over.
 */
import { PAGE_CONTRACT_VERSIONS } from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }    from '../../../src/shared/utils/ContractVersionUtil.ts';
import { BoardApiPaths }          from './BoardApiPaths.ts';
import {
  BROWSER_RELAY_STREAM_SURROUNDINGS,
  parsedDataOf,
  type RelayEventSource,
  type RelayStreamSurroundings
} from './RelayStreamSource.ts';
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

const CONVERSATION_VERSION_KEYS = { majorKey: 'boardVersion' } as const;

function outputLineOf(event: Event): ProfileOutputLine | null {
  const message = event as MessageEvent<string>;
  const lineNumber = Number(message.lastEventId);
  if (!Number.isInteger(lineNumber) || lineNumber < 1) return null;
  const data = parsedDataOf(event);
  if (ContractVersionUtil.readMajorOf(data, CONVERSATION_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaBoard) === null) return null;
  const { kind, line } = data as Readonly<Record<string, unknown>>;
  if (kind !== 'line' || typeof line !== 'object' || line === null) return null;
  const { text } = line as Readonly<Record<string, unknown>>;
  return typeof text === 'string' ? { lineNumber, text } : null;
}

/**
 * The browser's own reconnect sends the last line's number as `Last-Event-ID`; a stream it gave up on is opened again here after the last
 * line received. Either way a line at or before that number is dropped, so a replay never shows a line twice.
 */
function follow(
  trackerId: string,
  profileRunId: string,
  handlers: ProfileStreamHandlers,
  surroundings: RelayStreamSurroundings = BROWSER_RELAY_STREAM_SURROUNDINGS,
): ProfileStream {
  const { openEventSource, schedule } = surroundings;
  let lastLineNumber = 0;
  let source: RelayEventSource | null = null;
  let cancelReopen: (() => void) | null = null;
  let closed = false;

  const connect = (): void => {
    cancelReopen = null;
    if (closed) return;
    const opened = openEventSource(BoardApiPaths.profileStreamPathOf(trackerId, profileRunId, lastLineNumber));
    source = opened;
    opened.addEventListener('line', (event) => {
      const line = outputLineOf(event);
      if (line === null || line.lineNumber <= lastLineNumber) return;
      lastLineNumber = line.lineNumber;
      handlers.onLines([line]);
    });
    opened.addEventListener('error', () => {
      if (opened.readyState !== EVENT_SOURCE_CLOSED_READY_STATE || closed) return;
      cancelReopen = schedule(connect, STREAM_REOPEN_DELAY_MILLISECONDS);
    });
  };

  connect();
  return {
    close: () => {
      closed = true;
      cancelReopen?.();
      source?.close();
    },
    lastLineNumber: () => lastLineNumber,
  };
}

export const ProfileStreamClient = Object.freeze({ follow });
