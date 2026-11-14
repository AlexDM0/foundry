/**
 * The fleet as the page reads it: the latest snapshot mapped out as a `FleetDocument` in JSON on request, and every open event stream sent the
 * current document first and then each one the store publishes, as a `fleet` event. A heartbeat runs only while a stream is open.
 */
import { FleetDocumentMapUtil }                        from '../../adapters/page-api/FleetDocumentMapUtil.ts';
import { servedEventStreamOf, type ServedEventStream } from '../../lib/event-stream/ServedEventStream.ts';
import type { ClockTimer, ClockTimers }                from '../../services/Clock.ts';
import type { FleetStore }                             from '../../services/FleetStore.ts';
import type { FleetSnapshot }                          from '../../shared/@types/FleetSnapshot.ts';

export interface FleetBrokerOptions {
  readonly fleetStore:                     FleetStore;
  readonly timers:                         ClockTimers;
  readonly heartbeatIntervalMilliseconds?: number;
}

export interface FleetBroker {
  /** The latest snapshot as the page contract's `FleetDocument`, in JSON: the same text a `fleet` event carries. */
  readonly fleetDocumentJson: () => string;
  /** An event stream that holds the current document as its first `fleet` event. */
  readonly openEventStream:   () => Response;
  readonly openStreamCount:   () => number;
  /** Ends every open stream, cancels the heartbeat and hears the store no more. */
  readonly stop:              () => void;
}

export const FLEET_EVENT_NAME = 'fleet';

/** Well inside the idle time after which a browser or a proxy may take a quiet connection for a dead one. */
const FLEET_HEARTBEAT_INTERVAL_MILLISECONDS = 5_000;

const HEARTBEAT_COMMENT = 'heartbeat';

function fleetDocumentJsonOf(snapshot: FleetSnapshot): string {
  return JSON.stringify(FleetDocumentMapUtil.fleetDocumentOf(snapshot));
}

export function createFleetBroker(options: FleetBrokerOptions): FleetBroker {
  const { fleetStore, timers } = options;
  const heartbeatIntervalMilliseconds = options.heartbeatIntervalMilliseconds ?? FLEET_HEARTBEAT_INTERVAL_MILLISECONDS;
  const openStreams = new Set<ServedEventStream>();
  let heartbeatTimer: ClockTimer | null = null;
  let isStopped = false;

  function cancelHeartbeat(): void {
    heartbeatTimer?.cancel();
    heartbeatTimer = null;
  }

  function scheduleHeartbeat(): void {
    if (heartbeatTimer !== null || openStreams.size === 0) return;
    heartbeatTimer = timers.start(() => {
      heartbeatTimer = null;
      for (const stream of [...openStreams]) stream.sendComment(HEARTBEAT_COMMENT);
      scheduleHeartbeat();
    }, heartbeatIntervalMilliseconds);
  }

  const unsubscribe = fleetStore.subscribe((snapshot) => {
    const eventData = fleetDocumentJsonOf(snapshot);
    for (const stream of [...openStreams]) stream.sendEvent(FLEET_EVENT_NAME, eventData);
  });

  function openEventStream(): Response {
    const stream = servedEventStreamOf({
      onEnded: () => {
        openStreams.delete(stream);
        if (openStreams.size === 0) cancelHeartbeat();
      },
    });
    if (isStopped) {
      stream.close();
      return stream.response;
    }
    openStreams.add(stream);
    stream.sendEvent(FLEET_EVENT_NAME, fleetDocumentJsonOf(fleetStore.latest()));
    scheduleHeartbeat();
    return stream.response;
  }

  function stop(): void {
    isStopped = true;
    unsubscribe();
    for (const stream of [...openStreams]) stream.close();
    cancelHeartbeat();
  }

  return {
    fleetDocumentJson: () => fleetDocumentJsonOf(fleetStore.latest()),
    openEventStream,
    openStreamCount:   () => openStreams.size,
    stop,
  };
}
