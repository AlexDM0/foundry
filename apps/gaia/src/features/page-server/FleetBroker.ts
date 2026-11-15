/**
 * The fleet as the page reads it: the latest snapshot mapped out as a `FleetDocument` in JSON on request, and every open event stream sent
 * its handshake first, then the current document and each one the store publishes, as a `fleet` event. The handshake and every `fleet`
 * event carry Gaia's system version. A heartbeat runs only while a stream is open.
 */
import type { FleetEventDocument, FleetStreamHandshake } from '../../../page/@types/FleetDocument.ts';
import { FleetDocumentMapUtil }                          from '../../adapters/page-api/FleetDocumentMapUtil.ts';
import { servedEventStreamOf, type ServedEventStream }   from '../../lib/event-stream/ServedEventStream.ts';
import type { ClockTimer, ClockTimers }                  from '../../services/Clock.ts';
import type { FleetStore }                               from '../../services/FleetStore.ts';
import type { FleetSnapshot }                            from '../../shared/@types/FleetSnapshot.ts';
import { GAIA_SYSTEM_VERSION }                           from '../../shared/constants/GaiaSystemVersions.ts';

export interface FleetBrokerOptions {
  readonly fleetStore:                     FleetStore;
  readonly timers:                         ClockTimers;
  readonly heartbeatIntervalMilliseconds?: number;
}

export interface FleetBroker {
  /** The latest snapshot as the page contract's `FleetDocument`, in JSON: what a `fleet` event carries, without the system version. */
  readonly fleetDocumentJson: () => string;
  /** An event stream that opens on its handshake, then holds the current document as its first `fleet` event. */
  readonly openEventStream:   () => Response;
  readonly openStreamCount:   () => number;
  /** Ends every open stream, cancels the heartbeat and hears the store no more. */
  readonly stop:              () => void;
}

export const FLEET_EVENT_NAME = 'fleet';

/** The stream's first event: the system version of the Gaia that serves it, before any document. */
export const HANDSHAKE_EVENT_NAME = 'handshake';

/** Well inside the idle time after which a browser or a proxy may take a quiet connection for a dead one. */
const FLEET_HEARTBEAT_INTERVAL_MILLISECONDS = 5_000;

const HEARTBEAT_COMMENT = 'heartbeat';

function fleetDocumentJsonOf(snapshot: FleetSnapshot): string {
  return JSON.stringify(FleetDocumentMapUtil.fleetDocumentOf(snapshot));
}

function fleetEventJsonOf(snapshot: FleetSnapshot): string {
  const fleetEventDocument: FleetEventDocument = { ...FleetDocumentMapUtil.fleetDocumentOf(snapshot), systemVersion: GAIA_SYSTEM_VERSION };
  return JSON.stringify(fleetEventDocument);
}

function handshakeJson(): string {
  const handshake: FleetStreamHandshake = { systemVersion: GAIA_SYSTEM_VERSION };
  return JSON.stringify(handshake);
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
    const eventData = fleetEventJsonOf(snapshot);
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
    stream.sendEvent(HANDSHAKE_EVENT_NAME, handshakeJson());
    stream.sendEvent(FLEET_EVENT_NAME, fleetEventJsonOf(fleetStore.latest()));
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
