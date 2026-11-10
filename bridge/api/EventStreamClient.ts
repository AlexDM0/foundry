/**
 * The one `EventSource` on `/api/events`. The browser reconnects by itself and sends the last event's id as `Last-Event-ID`, which the
 * Overseer answers with what was missed, or with a fresh `board` for an id of another Baton generation. A stream the browser gave up on
 * (closed rather than reconnecting) is opened again here, and starts from a fresh `board`. `EventSource` hides the status that closed it,
 * so a closed stream asks `/api/session-token` whether the page still has a session: a 401 there is `no-session`, not `down`.
 */
import { SessionCodeExchange }                                               from './SessionCodeExchange.ts';
import type { FetchFunction }                                                from './SessionTokenSource.ts';
import { EVENT_SOURCE_CLOSED_READY_STATE, STREAM_REOPEN_DELAY_MILLISECONDS } from './constants/StreamReopening.ts';

export const OVERSEER_EVENT_KINDS = ['board', 'job', 'decision', 'incident', 'overseer', 'usage'] as const;

export type OverseerEventKind = typeof OVERSEER_EVENT_KINDS[number];

/** `no-session`: the Overseer answers, but refuses this page's session cookie, as after a restart or with no cookie at all. */
export type ConnectionState = 'connecting' | 'live' | 'down' | 'no-session';

export interface EventStreamHandlers {
  readonly onEvent:      (kind: OverseerEventKind, data: unknown) => void;
  readonly onConnection: (state: ConnectionState) => void;
}

/** The part of `EventSource` the client uses, so a spec can drive it. */
export type EventStreamSource = Pick<EventSource, 'addEventListener' | 'close' | 'readyState'>;

export interface EventStreamClientOptions {
  readonly url?:                     string;
  readonly eventSourceOf?:           (url: string) => EventStreamSource;
  readonly reopenDelayMilliseconds?: number;
  /** Asks the session probe; the browser's `fetch` when absent. */
  readonly fetchOf?:                 FetchFunction;
}

const EVENTS_PATH = '/api/events';

/** `no-session` when the probe answers 401; `down` when it answers otherwise or not at all. */
async function closedStreamStateOf(fetchOf: FetchFunction | undefined): Promise<ConnectionState> {
  return await SessionCodeExchange.sessionStandingOf(fetchOf) === 'refused' ? 'no-session' : 'down';
}

export interface EventStreamClient {
  readonly close:       () => void;
  /** The id of the last event received, which the browser sends back as `Last-Event-ID` on its own reconnect. */
  readonly lastEventId: () => string | null;
}

function open(handlers: EventStreamHandlers, options: EventStreamClientOptions = {}): EventStreamClient {
  const url = options.url ?? EVENTS_PATH;
  const eventSourceOf = options.eventSourceOf ?? ((sourceUrl: string): EventStreamSource => new EventSource(sourceUrl));
  const reopenDelay = options.reopenDelayMilliseconds ?? STREAM_REOPEN_DELAY_MILLISECONDS;
  const { fetchOf } = options;
  let source: EventStreamSource | null = null;
  let reopenTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let lastEventId: string | null = null;

  const connect = (): void => {
    handlers.onConnection('connecting');
    const opened = eventSourceOf(url);
    source = opened;
    opened.addEventListener('open', () => handlers.onConnection('live'));
    opened.addEventListener('error', () => {
      if (opened.readyState !== EVENT_SOURCE_CLOSED_READY_STATE) {
        handlers.onConnection('down');
        return;
      }
      if (closed) return;
      void closedStreamStateOf(fetchOf).then((state) => {
        if (!closed && source === opened) handlers.onConnection(state);
      });
      reopenTimer = setTimeout(connect, reopenDelay);
    });
    for (const kind of OVERSEER_EVENT_KINDS) {
      opened.addEventListener(kind, (event) => {
        const message = event as MessageEvent<string>;
        lastEventId = message.lastEventId === '' ? lastEventId : message.lastEventId;
        try {
          handlers.onEvent(kind, JSON.parse(message.data) as unknown);
        } catch {
          // A malformed event is dropped; the next `board` carries the whole state again.
        }
      });
    }
  };

  connect();
  return {
    close: () => {
      closed = true;
      if (reopenTimer !== null) clearTimeout(reopenTimer);
      source?.close();
    },
    lastEventId: () => lastEventId,
  };
}

export const EventStreamClient = Object.freeze({ open });
