/**
 * Test-only stand-ins for Gaia's relay as the board's clients meet it: a request sender that records every request and answers what the
 * spec queues, and stream surroundings whose sources the spec fires events on and whose waits it fires by hand.
 */
import type { RelayRequestSender }                        from '../api/RelayRequest.ts';
import type { RelayEventSource, RelayStreamSurroundings } from '../api/RelayStreamSource.ts';
import { EVENT_SOURCE_CLOSED_READY_STATE }                from '../api/constants/StreamReopening.ts';

export interface SentRelayRequest {
  readonly path:           string;
  readonly requestOptions: RequestInit;
}

export interface FakeRelayRequests {
  readonly sendRequest: RelayRequestSender;
  readonly sent:        SentRelayRequest[];
  /** The next request is answered with this; with nothing queued, a request finds nothing answering. */
  readonly answerWith:  (response: Response) => void;
}

export function fakeRelayRequests(): FakeRelayRequests {
  const sent: SentRelayRequest[] = [];
  const answers: Response[] = [];
  return {
    sent,
    answerWith:  (response) => answers.push(response),
    sendRequest: (path, requestOptions) => {
      sent.push({ path, requestOptions });
      const answer = answers.shift();
      return answer === undefined ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(answer);
    },
  };
}

/** The headers of a sent request, by lower-case name. */
export function headersOf(request: SentRelayRequest | undefined): Headers {
  return new Headers(request?.requestOptions.headers);
}

export interface FakeRelaySource extends RelayEventSource {
  readonly path:   string;
  readyState:      number;
  closed:          boolean;
  readonly fire:   (eventName: string, data?: unknown, lastEventId?: string) => void;
  /** The browser gives the stream up: closed, then its error. */
  readonly giveUp: () => void;
}

export interface FakeRelayStreams {
  readonly surroundings: RelayStreamSurroundings;
  readonly sources:      FakeRelaySource[];
  /** The delays of every wait scheduled and neither fired nor cancelled. */
  readonly pendingWaits: () => readonly number[];
  /** Fires every pending wait. */
  readonly fireWaits:    () => void;
}

export function fakeRelayStreams(): FakeRelayStreams {
  const sources: FakeRelaySource[] = [];
  const waits: { readonly task: () => void; readonly delayMilliseconds: number }[] = [];
  const openEventSource = (path: string): FakeRelaySource => {
    const listeners = new Map<string, ((event: Event) => void)[]>();
    const dispatch = (eventName: string, event: Event): void => listeners.get(eventName)?.forEach((listener) => listener(event));
    const source: FakeRelaySource = {
      path,
      readyState:       0,
      closed:           false,
      addEventListener: (eventName, listener) => listeners.set(eventName, [...listeners.get(eventName) ?? [], listener]),
      close:            () => {
        source.closed = true;
        source.readyState = EVENT_SOURCE_CLOSED_READY_STATE;
      },
      fire: (eventName, data, lastEventId = '') => {
        const event = data === undefined ? new Event(eventName) : new MessageEvent(eventName, { data: JSON.stringify(data), lastEventId });
        dispatch(eventName, event);
      },
      giveUp: () => {
        source.readyState = EVENT_SOURCE_CLOSED_READY_STATE;
        dispatch('error', new Event('error'));
      },
    };
    sources.push(source);
    return source;
  };
  return {
    sources,
    surroundings: {
      openEventSource,
      schedule: (task, delayMilliseconds) => {
        const wait = { task, delayMilliseconds };
        waits.push(wait);
        return () => {
          const index = waits.indexOf(wait);
          if (index !== -1) waits.splice(index, 1);
        };
      },
    },
    pendingWaits: () => waits.map((wait) => wait.delayMilliseconds),
    fireWaits:    () => waits.splice(0).forEach((wait) => wait.task()),
  };
}
