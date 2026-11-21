/**
 * The one `EventSource` on Gaia's relay of a forge's board events. Every event is a change signal under the forge's event name: `board`
 * carries `board-changed`, after which the page reads the board again, and a part's event names the part. The browser reconnects by itself
 * and sends the last event's id as `Last-Event-ID`, which the relay hands the forge; a stream the browser gave up on is opened again here.
 * A handshake or an event of another contract version closes the stream for good as `down`. `EventSource` hides the status that closed it,
 * so a closed stream asks whether Gaia still holds this window's session, as the fleet stream does; once it does not, the stream is
 * `no-session`, tells the page its session was lost, and opens no more.
 */
import { PAGE_CONTRACT_VERSIONS }                     from '../../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }                        from '../../../src/shared/utils/ContractVersionUtil.ts';
import { BOARD_PART_NAMES, BOARD_STREAM_EVENT_NAMES } from '../../@types/board/BoardEventDocument.ts';
import type { BoardEventDocument }                    from '../../@types/board/BoardEventDocument.ts';
import { FleetStreamClient, type SessionReading }     from '../../api/FleetStreamClient.ts';
import { BoardApiPaths }                              from './BoardApiPaths.ts';
import {
  BROWSER_RELAY_STREAM_SURROUNDINGS,
  parsedDataOf,
  type RelayEventSource,
  type RelayStreamSurroundings
} from './RelayStreamSource.ts';
import { EVENT_SOURCE_CLOSED_READY_STATE, STREAM_REOPEN_DELAY_MILLISECONDS } from './constants/StreamReopening.ts';

/** `no-session`: Gaia's server answers, but no longer knows this window's session, as after it restarted. */
export type ConnectionState = 'connecting' | 'live' | 'down' | 'no-session';

export interface EventStreamHandlers {
  readonly onEvent:      (event: BoardEventDocument) => void;
  readonly onConnection: (state: ConnectionState) => void;
}

export interface BoardEventStreamSurroundings extends RelayStreamSurroundings {
  readonly readSession:    () => Promise<SessionReading>;
  /** The one session loss the whole page shows, which the fleet stream's command sender also calls. */
  readonly sessionWasLost: () => void;
}

export interface BoardEventStream {
  readonly close:       () => void;
  /** The id of the last event received, which the browser sends back as `Last-Event-ID` on its own reconnect. */
  readonly lastEventId: () => string | null;
}

const HANDSHAKE_EVENT_NAME = 'handshake';

const HANDSHAKE_VERSION_KEYS = { majorKey: 'boardStreamVersion' } as const;

const EVENT_VERSION_KEYS = { majorKey: 'boardVersion' } as const;

const PART_NAMES: ReadonlySet<unknown> = new Set(BOARD_PART_NAMES);

type EventReading = { readonly verdict: 'event'; readonly event: BoardEventDocument } | { readonly verdict: 'other-version' } | { readonly verdict: 'malformed' };

function eventReadingOf(data: unknown): EventReading {
  const versionReading = ContractVersionUtil.versionOf(data, EVENT_VERSION_KEYS);
  if (versionReading.verdict !== 'versioned') return { verdict: 'malformed' };
  if (ContractVersionUtil.majorVerdictOf(versionReading.version.major, PAGE_CONTRACT_VERSIONS.gaiaBoard) !== 'known') return { verdict: 'other-version' };
  const { kind, part } = data as Readonly<Record<string, unknown>>;
  if (kind === 'board-changed' || (kind === 'part-changed' && PART_NAMES.has(part))) return { verdict: 'event', event: data as BoardEventDocument };
  return { verdict: 'malformed' };
}

function handshakeIsOfThisPage(data: unknown): boolean {
  return ContractVersionUtil.readMajorOf(data, HANDSHAKE_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaBoardStream) !== null;
}

function open(trackerId: string, handlers: EventStreamHandlers, surroundings: BoardEventStreamSurroundings): BoardEventStream {
  const {
    openEventSource, schedule, readSession, sessionWasLost
  } = surroundings;
  let source: RelayEventSource | null = null;
  let cancelReopen: (() => void) | null = null;
  let ended = false;
  let lastEventId: string | null = null;

  const end = (): void => {
    ended = true;
    cancelReopen?.();
    cancelReopen = null;
    source?.close();
    source = null;
  };

  const refuseContract = (): void => {
    end();
    handlers.onConnection('down');
  };

  const readSessionAnswer = (opened: RelayEventSource, reading: SessionReading): void => {
    if (ended || source !== opened) return;
    if (reading !== 'lost') {
      handlers.onConnection('down');
      return;
    }
    end();
    handlers.onConnection('no-session');
    sessionWasLost();
  };

  const readEvent = (event: Event): void => {
    const reading = eventReadingOf(parsedDataOf(event));
    if (reading.verdict === 'other-version') {
      refuseContract();
      return;
    }
    if (reading.verdict === 'malformed') return;
    const { lastEventId: eventId } = event as MessageEvent<string>;
    if (typeof eventId === 'string' && eventId !== '') lastEventId = eventId;
    handlers.onEvent(reading.event);
  };

  const connect = (): void => {
    cancelReopen = null;
    if (ended) return;
    handlers.onConnection('connecting');
    const opened = openEventSource(BoardApiPaths.boardEventsPathOf(trackerId));
    source = opened;
    opened.addEventListener('open', () => {
      if (source === opened) handlers.onConnection('live');
    });
    opened.addEventListener(HANDSHAKE_EVENT_NAME, (event) => {
      if (source === opened && !handshakeIsOfThisPage(parsedDataOf(event))) refuseContract();
    });
    for (const eventName of BOARD_STREAM_EVENT_NAMES) {
      opened.addEventListener(eventName, (event) => {
        if (source === opened) readEvent(event);
      });
    }
    opened.addEventListener('error', () => {
      if (ended || source !== opened) return;
      if (opened.readyState !== EVENT_SOURCE_CLOSED_READY_STATE) {
        handlers.onConnection('down');
        return;
      }
      cancelReopen = schedule(connect, STREAM_REOPEN_DELAY_MILLISECONDS);
      void readSession().then((reading) => readSessionAnswer(opened, reading));
    });
  };

  connect();
  return { close: end, lastEventId: () => lastEventId };
}

/** The browser's surroundings, asking Gaia's session standing exactly as the fleet stream asks it. */
function browserSurroundings(sessionWasLost: () => void): BoardEventStreamSurroundings {
  return { ...BROWSER_RELAY_STREAM_SURROUNDINGS, readSession: FleetStreamClient.browserSurroundings().readSession, sessionWasLost };
}

export const BoardEventStreamClient = Object.freeze({ open, browserSurroundings, HANDSHAKE_EVENT_NAME });
