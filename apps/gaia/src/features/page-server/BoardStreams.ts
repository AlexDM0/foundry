/**
 * The open relayed streams of every forge's board, keyed by tracker id: each page stream with the one forge stream it follows, opened with
 * Gaia's handshake once the forge's own names the version the watch read, then each forge event mapped once per forge and sent to every
 * page stream that follows it, under the forge's event name and id. A page stream that closes stops its forge stream, a forge stream that
 * ends closes its page stream, and a stop closes them all. A heartbeat runs only while a stream is open.
 */
import { createHash } from 'node:crypto';

import type { SystemVersion } from 'system-versions/VersionsDocument';

import { BoardRelayAnswerMapUtil }                                    from '../../adapters/page-api/BoardRelayAnswerMapUtil.ts';
import { servedEventStreamOf, type ServedEventStream }                from '../../lib/event-stream/ServedEventStream.ts';
import type { ForgeStreamEvent, ForgeStreamFollow, MonitorFollowEnd } from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import { JsonValueUtil }                                              from '../../lib/json-value/JsonValueUtil.ts';
import type { ClockTimer, ClockTimers }                               from '../../services/Clock.ts';
import type { BoardRelayRefusal }                                     from '../../shared/@types/board/BoardRelayVerdict.ts';
import { SystemVersionUtil }                                          from '../../shared/utils/SystemVersionUtil.ts';
import type { BoardRelayLog }                                         from './@types/BoardRelayLogEntry.ts';

/** An event as the page receives it: the forge's event name and the mapped document's JSON; the forge's id goes with it unchanged. */
export interface RelayedEvent {
  readonly eventName: string;
  readonly data:      string;
}

/** `dropped` names the keys of an event that did not ingest, or none for one whose name or data is no event Gaia reads. */
export type RelayedEventMapping = { readonly verdict: 'relayed'; readonly event: RelayedEvent } | { readonly verdict: 'dropped'; readonly invalidKeys: readonly string[] };

export interface RelayStreamRequest {
  readonly trackerId:          string;
  /** The version the forge watch read; the forge's handshake must name the same. */
  readonly forgeSystemVersion: SystemVersion;
  /** The forge stream's path with its query: page streams of one forge that follow the same forge stream share each event's map. */
  readonly forgeStreamPath:    string;
  readonly follow:             (onEvent: (event: ForgeStreamEvent) => void) => ForgeStreamFollow;
  readonly mapEvent:           (event: ForgeStreamEvent) => RelayedEventMapping;
}

export type RelayStreamRefusal = Extract<BoardRelayRefusal, 'forge-unreachable' | 'forge-version-unsupported' | 'forge-document-unreadable' | 'token-rejected' | 'not-found'>;

export type RelayStreamOpening =
  | { readonly verdict: 'streaming'; readonly response: Response }
  | { readonly verdict: 'refused'; readonly refusal: RelayStreamRefusal };

export interface BoardStreamsOptions {
  readonly timers:                         ClockTimers;
  readonly log:                            BoardRelayLog;
  readonly heartbeatIntervalMilliseconds?: number;
}

export interface BoardStreams {
  readonly openStream:        (request: RelayStreamRequest) => Promise<RelayStreamOpening>;
  readonly openStreamCount:   () => number;
  /** Every event dropped because it did not ingest, since the start. */
  readonly droppedEventCount: () => number;
  /** Closes every open stream and stops each forge stream it followed. */
  readonly stop:              () => void;
}

export const RELAY_HANDSHAKE_EVENT_NAME = 'handshake';

/** As the fleet stream's: well inside the idle time after which a browser or a proxy may take a quiet connection for a dead one. */
const RELAY_HEARTBEAT_INTERVAL_MILLISECONDS = 5_000;

const HEARTBEAT_COMMENT = 'heartbeat';

/** Enough for each page stream of a forge to catch up on the events another one mapped, without holding a forge's history. */
const MAPPED_EVENTS_KEPT_PER_FORGE = 256;

interface OpenRelayStream {
  readonly trackerId: string;
  readonly served:    ServedEventStream;
}

/** The version a forge's handshake names, `null` for data that names none. */
function handshakeVersionOf(data: string): SystemVersion | null {
  const parsed = JsonValueUtil.parsedValueOf(data);
  const handshake = parsed === null ? null : JsonValueUtil.jsonObjectOf(parsed.parsed);
  return handshake === null ? null : SystemVersionUtil.systemVersionOf(JsonValueUtil.ownValueOf(handshake, 'systemVersion'));
}

function contentHashOf(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function refusalOfEndBeforeOpening(end: MonitorFollowEnd): RelayStreamRefusal {
  switch (end.verdict) {
    case 'unauthorized':
      return 'token-rejected';
    case 'malformed':
      return 'forge-document-unreadable';
    case 'refused':
      return 'not-found';
    case 'unreachable':
    case 'ended':
      return 'forge-unreachable';
  }
}

export function createBoardStreams(options: BoardStreamsOptions): BoardStreams {
  const { timers, log } = options;
  const heartbeatIntervalMilliseconds = options.heartbeatIntervalMilliseconds ?? RELAY_HEARTBEAT_INTERVAL_MILLISECONDS;
  const openStreams = new Set<OpenRelayStream>();
  const mappedEventsByTrackerId = new Map<string, Map<string, RelayedEventMapping>>();
  let heartbeatTimer: ClockTimer | null = null;
  let droppedEvents = 0;
  let isStopped = false;

  function cancelHeartbeat(): void {
    heartbeatTimer?.cancel();
    heartbeatTimer = null;
  }

  function scheduleHeartbeat(): void {
    if (heartbeatTimer !== null || openStreams.size === 0) return;
    heartbeatTimer = timers.start(() => {
      heartbeatTimer = null;
      for (const stream of [...openStreams]) stream.served.sendComment(HEARTBEAT_COMMENT);
      scheduleHeartbeat();
    }, heartbeatIntervalMilliseconds);
  }

  function forgetForgeOnceUnfollowed(trackerId: string): void {
    if (![...openStreams].some((stream) => stream.trackerId === trackerId)) mappedEventsByTrackerId.delete(trackerId);
  }

  /**
   * An event the forge sent with an id is mapped once per forge stream, id and content, whichever page stream hears it first. The content
   * is in the key because a job's `history` carries the last cursor as its id whatever cursor the page resumed from.
   */
  function mappingOf(request: RelayStreamRequest, event: ForgeStreamEvent): RelayedEventMapping {
    if (event.id === null) return request.mapEvent(event);
    const mappedEvents = mappedEventsByTrackerId.get(request.trackerId) ?? new Map<string, RelayedEventMapping>();
    mappedEventsByTrackerId.set(request.trackerId, mappedEvents);
    const eventKey = JSON.stringify([request.forgeStreamPath, event.id, event.eventName, contentHashOf(event.data)]);
    const mapped = mappedEvents.get(eventKey);
    if (mapped !== undefined) return mapped;
    const mapping = request.mapEvent(event);
    mappedEvents.set(eventKey, mapping);
    if (mappedEvents.size > MAPPED_EVENTS_KEPT_PER_FORGE) {
      const oldestKey = mappedEvents.keys().next().value;
      if (oldestKey !== undefined) mappedEvents.delete(oldestKey);
    }
    return mapping;
  }

  function relay(request: RelayStreamRequest, served: ServedEventStream, event: ForgeStreamEvent): void {
    const mapping = mappingOf(request, event);
    if (mapping.verdict === 'relayed') {
      served.sendEvent(mapping.event.eventName, mapping.event.data, event.id);
      return;
    }
    droppedEvents += 1;
    log({
      kind: 'event-dropped', trackerId: request.trackerId, stream: request.forgeStreamPath, eventName: event.eventName, invalidKeys: mapping.invalidKeys,
    });
  }

  async function openStream(request: RelayStreamRequest): Promise<RelayStreamOpening> {
    if (isStopped) return { verdict: 'refused', refusal: 'forge-unreachable' };
    let follow: ForgeStreamFollow | null = null;
    const served = servedEventStreamOf({
      onEnded: () => {
        openStreams.delete(openStream);
        follow?.stop();
        forgetForgeOnceUnfollowed(request.trackerId);
        if (openStreams.size === 0) cancelHeartbeat();
      },
    });
    const openStream: OpenRelayStream = { trackerId: request.trackerId, served };
    openStreams.add(openStream);
    served.sendEvent(RELAY_HANDSHAKE_EVENT_NAME, JSON.stringify(BoardRelayAnswerMapUtil.handshakeDocumentOf(request.forgeSystemVersion)));

    let settleHandshake: (versionNamed: SystemVersion | null) => void = () => undefined;
    const handshakeHeard = new Promise<{ readonly heard: 'handshake'; readonly versionNamed: SystemVersion | null }>((resolve) => {
      settleHandshake = (versionNamed) => resolve({ heard: 'handshake', versionNamed });
    });
    let handshakeIsHeard = false;
    follow = request.follow((event) => {
      if (handshakeIsHeard) {
        relay(request, served, event);
        return;
      }
      handshakeIsHeard = true;
      settleHandshake(event.eventName === RELAY_HANDSHAKE_EVENT_NAME ? handshakeVersionOf(event.data) : null);
    });
    const ended = follow.ended.catch((): MonitorFollowEnd => ({ verdict: 'ended', ending: 'broken' }));
    void ended.then(() => served.close());

    const first = await Promise.race([handshakeHeard, ended.then((end) => ({ heard: 'end' as const, end }))]);
    if (first.heard === 'end') {
      served.close();
      return { verdict: 'refused', refusal: refusalOfEndBeforeOpening(first.end) };
    }
    if (first.versionNamed === null || SystemVersionUtil.comparisonOf(first.versionNamed, request.forgeSystemVersion) !== 0) {
      log({
        kind:                  'handshake-version-differs',
        trackerId:             request.trackerId,
        stream:                request.forgeStreamPath,
        versionWatchRead:      request.forgeSystemVersion,
        versionHandshakeNamed: first.versionNamed,
      });
      served.close();
      return { verdict: 'refused', refusal: 'forge-version-unsupported' };
    }
    if (!served.isOpen()) return { verdict: 'refused', refusal: 'forge-unreachable' };
    scheduleHeartbeat();
    return { verdict: 'streaming', response: served.response };
  }

  function stop(): void {
    isStopped = true;
    for (const stream of [...openStreams]) stream.served.close();
    cancelHeartbeat();
  }

  return {
    openStream,
    openStreamCount:   () => openStreams.size,
    droppedEventCount: () => droppedEvents,
    stop,
  };
}
