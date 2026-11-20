/**
 * Follows `GET /api/v4/events` and publishes the document of each `fleet` event. A stream that errs is closed and opened again after
 * `FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS` by this client, not by the browser, so every wait is a schedule a spec controls; the stream
 * reads `lost` from the error until the next open. Gaia's server sends its current document first on every open, so a reopened stream
 * needs no separate read of `/api/fleet`. The stream opens on a handshake naming the server's system version, and every `fleet` event
 * carries it too: a handshake of another system major, or a document of another `fleetVersion`, means a stale page: it reloads once, and a
 * mark in the session's storage keeps a second mismatch from reloading again. Page sessions live in the server's memory, so a stream that errs asks
 * whether the window still holds one; once it does not, as after the server restarted, no reopen could succeed and the client stops. When
 * nothing answers that check, the server and the session it held are gone: the client reads `server-ended` and keeps reopening, so a server
 * that answers again moves it on.
 */
import { ApiPathUtil }                                 from '../../src/lib/api-paths/ApiPathUtil.ts';
import { GAIA_ENDPOINT_VERSIONS, GAIA_SYSTEM_VERSION } from '../../src/shared/constants/GaiaSystemVersions.ts';
import { PAGE_CONTRACT_VERSIONS }                      from '../../src/shared/constants/PageContractVersions.ts';
import { ContractVersionUtil }                         from '../../src/shared/utils/ContractVersionUtil.ts';
import { SystemVersionUtil }                           from '../../src/shared/utils/SystemVersionUtil.ts';
import type { FleetDocument }                          from '../@types/FleetDocument.ts';

/**
 * `connecting` only before the first open; `page-out-of-date` once a reload did not bring a page of the server's `fleetVersion`;
 * `session-lost` once the server no longer knows this window's session; `server-ended` while nothing answers the session check.
 */
export type FleetStreamState = 'connecting' | 'live' | 'lost' | 'server-ended' | 'page-out-of-date' | 'session-lost';

/** Whether the server still knows this window's session: `unknown` when nothing answered, as while the server is down. */
export type SessionReading = 'held' | 'lost' | 'unknown';

/** The part of the browser's `EventSource` the client uses, so a spec can drive it. */
export interface FleetEventSource {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

/** Where the page notes the server version it reloaded for, a `fleetVersion` or a system major; `write` answers whether the mark was kept. */
export interface ReloadMark {
  readonly read:  () => string | null;
  readonly write: (fleetVersion: string | null) => boolean;
}

/** The browser around the client, so a spec can stand in for each part. */
export interface FleetStreamSurroundings {
  readonly openEventSource: (path: string) => FleetEventSource;
  /** Runs the task once after the delay; the answer cancels it. */
  readonly schedule:        (task: () => void, delayMilliseconds: number) => () => void;
  readonly reloadPage:      () => void;
  readonly reloadMark:      ReloadMark;
  readonly readSession:     () => Promise<SessionReading>;
}

export interface FleetStreamClient {
  readonly follow:      () => void;
  /** Closes the stream and cancels a reopen; nothing is published after it. */
  readonly stop:        () => void;
  /** Stops for good: the server answered that it no longer knows this window's session. */
  readonly loseSession: () => void;
  readonly state:       () => FleetStreamState;
  readonly subscribe:   (listener: () => void) => () => void;
}

const EVENTS_PATH = ApiPathUtil.versionedPathOf('events', GAIA_ENDPOINT_VERSIONS.events);

/** A route that needs the session, read only to learn whether the window still holds one. */
const SESSION_CHECK_PATH = ApiPathUtil.versionedPathOf('fleet', GAIA_ENDPOINT_VERSIONS.fleet);

const NO_SESSION_STATUS = 401;

const FLEET_EVENT_NAME = 'fleet';

const HANDSHAKE_EVENT_NAME = 'handshake';

/** The reload mark of a server of another system major, kept apart from a `fleetVersion`'s. */
const SYSTEM_MAJOR_MARK_PREFIX = 'system ';

const FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS = 2_000;

const RELOAD_MARK_STORAGE_KEY = 'gaia-reloaded-for-fleet-version';

interface FleetEventReading {
  readonly fleetVersion:  number;
  readonly fleetDocument: unknown;
}

/** The parsed data of a `fleet` event with its `fleetVersion`, or `null` for data that is no fleet document at all. */
const FLEET_VERSION_KEYS = { majorKey: 'fleetVersion' } as const;

function fleetEventReadingOf(eventData: unknown): FleetEventReading | null {
  if (typeof eventData !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventData);
  } catch {
    return null;
  }
  const versionReading = ContractVersionUtil.versionOf(parsed, FLEET_VERSION_KEYS);
  return versionReading.verdict === 'versioned' ? { fleetVersion: versionReading.version.major, fleetDocument: withoutSystemVersion(parsed) } : null;
}

/** The event's system version is the stream's, not the document's, so the page is handed the document alone. */
function withoutSystemVersion(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, 'systemVersion')) return parsed;
  const { systemVersion: _systemVersion, ...fleetDocument } = parsed as Readonly<Record<string, unknown>>;
  return fleetDocument;
}

/** The system major a handshake names, or `null` for data that is no handshake. */
function handshakeSystemMajorOf(eventData: unknown): number | null {
  if (typeof eventData !== 'string') return null;
  try {
    const parsed = JSON.parse(eventData) as unknown;
    const systemVersion = typeof parsed === 'object' && parsed !== null && Object.hasOwn(parsed, 'systemVersion')
      ? SystemVersionUtil.systemVersionOf((parsed as Readonly<Record<string, unknown>>)['systemVersion'])
      : null;
    return systemVersion?.major ?? null;
  } catch {
    return null;
  }
}

function controlsMayActIn(state: FleetStreamState): boolean {
  return state === 'connecting' || state === 'live';
}

function create(publish: (fleetDocument: FleetDocument) => void, surroundings: FleetStreamSurroundings): FleetStreamClient {
  const {
    openEventSource, schedule, reloadPage, reloadMark, readSession
  } = surroundings;
  const listeners = new Set<() => void>();
  let state: FleetStreamState = 'connecting';
  let source: FleetEventSource | null = null;
  let cancelReopen: (() => void) | null = null;
  let following = false;

  const changeState = (nextState: FleetStreamState): void => {
    if (nextState === state) return;
    state = nextState;
    [...listeners].forEach((listener) => listener());
  };

  const stop = (): void => {
    following = false;
    cancelReopen?.();
    cancelReopen = null;
    source?.close();
    source = null;
  };

  const loseSession = (): void => {
    if (state === 'page-out-of-date') return;
    stop();
    changeState('session-lost');
  };

  const readSessionAnswer = (reading: SessionReading): void => {
    if (!following) return;
    if (reading === 'lost') loseSession();
    else if (state === 'lost' || state === 'server-ended') changeState(reading === 'unknown' ? 'server-ended' : 'lost');
  };

  const readFleetEvent = (event: Event): void => {
    const fleetEventReading = fleetEventReadingOf('data' in event ? event.data : null);
    if (fleetEventReading === null) return;
    if (ContractVersionUtil.majorVerdictOf(fleetEventReading.fleetVersion, PAGE_CONTRACT_VERSIONS.gaiaFleetDocument) === 'known') {
      if (reloadMark.read() !== null) reloadMark.write(null);
      publish(fleetEventReading.fleetDocument as FleetDocument);
      return;
    }
    reloadForServerVersion(String(fleetEventReading.fleetVersion));
  };

  const reloadForServerVersion = (serverVersion: string): void => {
    stop();
    // A mark that cannot be kept could not stop a second reload, so the page then stays out of date rather than reload without end.
    if (reloadMark.read() !== serverVersion && reloadMark.write(serverVersion)) reloadPage();
    else changeState('page-out-of-date');
  };

  /** A handshake that cannot be read is passed over: each `fleet` event still names its `fleetVersion`. */
  const readHandshake = (event: Event): void => {
    const serverSystemMajor = handshakeSystemMajorOf('data' in event ? event.data : null);
    if (serverSystemMajor === null || serverSystemMajor === GAIA_SYSTEM_VERSION.major) return;
    reloadForServerVersion(`${SYSTEM_MAJOR_MARK_PREFIX}${serverSystemMajor}`);
  };

  const open = (): void => {
    cancelReopen = null;
    if (!following) return;
    const opened = openEventSource(EVENTS_PATH);
    source = opened;
    opened.addEventListener('open', () => {
      if (source === opened) changeState('live');
    });
    opened.addEventListener(HANDSHAKE_EVENT_NAME, (event) => {
      if (source === opened) readHandshake(event);
    });
    opened.addEventListener(FLEET_EVENT_NAME, (event) => {
      if (source === opened) readFleetEvent(event);
    });
    opened.addEventListener('error', () => {
      if (source !== opened) return;
      opened.close();
      source = null;
      if (state !== 'server-ended') changeState('lost');
      cancelReopen = schedule(open, FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS);
      void readSession().then(readSessionAnswer);
    });
  };

  return {
    follow: () => {
      if (following || state === 'page-out-of-date' || state === 'session-lost') return;
      following = true;
      open();
    },
    stop,
    loseSession,
    state:     () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function browserSurroundings(): FleetStreamSurroundings {
  return {
    openEventSource: (path) => new EventSource(path),
    schedule:        (task, delayMilliseconds) => {
      const timer = setTimeout(task, delayMilliseconds);
      return () => clearTimeout(timer);
    },
    reloadPage:  () => window.location.reload(),
    readSession: async () => {
      try {
        const response = await fetch(SESSION_CHECK_PATH, { credentials: 'same-origin' });
        void response.body?.cancel();
        return response.status === NO_SESSION_STATUS ? 'lost' : 'held';
      } catch {
        return 'unknown';
      }
    },
    reloadMark: {
      read: () => {
        try {
          return window.sessionStorage.getItem(RELOAD_MARK_STORAGE_KEY);
        } catch {
          return null;
        }
      },
      write: (fleetVersion) => {
        try {
          if (fleetVersion === null) window.sessionStorage.removeItem(RELOAD_MARK_STORAGE_KEY);
          else window.sessionStorage.setItem(RELOAD_MARK_STORAGE_KEY, fleetVersion);
          return window.sessionStorage.getItem(RELOAD_MARK_STORAGE_KEY) === fleetVersion;
        } catch {
          return false;
        }
      },
    },
  };
}

export const FleetStreamClient = {
  EVENTS_PATH,
  SESSION_CHECK_PATH,
  FLEET_EVENT_NAME,
  HANDSHAKE_EVENT_NAME,
  FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS,
  create,
  controlsMayActIn,
  browserSurroundings,
} as const;
