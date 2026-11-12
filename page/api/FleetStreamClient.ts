/**
 * Follows `GET /api/events` and publishes the document of each `fleet` event. A stream that errs is closed and opened again after
 * `FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS` by this client, not by the browser, so every wait is a schedule a spec controls; the stream
 * reads `lost` from the error until the next open. Gaia's server sends its current document first on every open, so a reopened stream
 * needs no separate read of `/api/fleet`. A document of another `fleetVersion` means a stale page: it reloads once, and a mark in the
 * session's storage keeps a second mismatch from reloading again.
 */
import { CONTRACT_VERSIONS }  from '../../src/shared/constants/ContractVersions.ts';
import type { FleetDocument } from '../@types/FleetDocument.ts';

/** `connecting` only before the first open; `page-out-of-date` once a reload did not bring a page of the server's `fleetVersion`. */
export type FleetStreamState = 'connecting' | 'live' | 'lost' | 'page-out-of-date';

/** The part of the browser's `EventSource` the client uses, so a spec can drive it. */
export interface FleetEventSource {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

/** Where the page notes the `fleetVersion` it reloaded for; `write` answers whether the mark was kept. */
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
}

export interface FleetStreamClient {
  readonly follow:    () => void;
  /** Closes the stream and cancels a reopen; nothing is published after it. */
  readonly stop:      () => void;
  readonly state:     () => FleetStreamState;
  readonly subscribe: (listener: () => void) => () => void;
}

const EVENTS_PATH = '/api/events';

const FLEET_EVENT_NAME = 'fleet';

const FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS = 2_000;

const RELOAD_MARK_STORAGE_KEY = 'gaia-reloaded-for-fleet-version';

interface FleetEventReading {
  readonly fleetVersion:  number;
  readonly fleetDocument: unknown;
}

/** The parsed data of a `fleet` event with its `fleetVersion`, or `null` for data that is no fleet document at all. */
function fleetEventReadingOf(eventData: unknown): FleetEventReading | null {
  if (typeof eventData !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventData);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, 'fleetVersion')) return null;
  const { fleetVersion } = parsed as { readonly fleetVersion: unknown };
  return typeof fleetVersion === 'number' ? { fleetVersion, fleetDocument: parsed } : null;
}

function controlsMayActIn(state: FleetStreamState): boolean {
  return state === 'connecting' || state === 'live';
}

function create(publish: (fleetDocument: FleetDocument) => void, surroundings: FleetStreamSurroundings): FleetStreamClient {
  const {
    openEventSource, schedule, reloadPage, reloadMark
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

  const readFleetEvent = (event: Event): void => {
    const read = fleetEventReadingOf('data' in event ? event.data : null);
    if (read === null) return;
    if (read.fleetVersion === CONTRACT_VERSIONS.gaiaFleetDocument) {
      if (reloadMark.read() !== null) reloadMark.write(null);
      // The page and the server ship together: the version is the whole contract between them.
      publish(read.fleetDocument as FleetDocument);
      return;
    }
    stop();
    const serverVersion = String(read.fleetVersion);
    // A mark that cannot be kept could not stop a second reload, so the page then stays out of date rather than reload without end.
    if (reloadMark.read() !== serverVersion && reloadMark.write(serverVersion)) reloadPage();
    else changeState('page-out-of-date');
  };

  const open = (): void => {
    cancelReopen = null;
    if (!following) return;
    const opened = openEventSource(EVENTS_PATH);
    source = opened;
    opened.addEventListener('open', () => {
      if (source === opened) changeState('live');
    });
    opened.addEventListener(FLEET_EVENT_NAME, (event) => {
      if (source === opened) readFleetEvent(event);
    });
    opened.addEventListener('error', () => {
      if (source !== opened) return;
      opened.close();
      source = null;
      changeState('lost');
      cancelReopen = schedule(open, FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS);
    });
  };

  return {
    follow: () => {
      if (following || state === 'page-out-of-date') return;
      following = true;
      open();
    },
    stop,
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
    reloadPage: () => window.location.reload(),
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
  FLEET_EVENT_NAME,
  FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS,
  create,
  controlsMayActIn,
  browserSurroundings,
} as const;
