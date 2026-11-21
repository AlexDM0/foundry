import type { SystemVersion } from 'system-versions/VersionsDocument';

/**
 * What Gaia's relay of a forge's board logs: an event of a forge's stream that did not ingest and was dropped, never forwarded raw; a
 * stream whose forge named another system version in its handshake than the watch read; a board document that did not ingest, a presence
 * document that did not, and a crash log that did not. No entry holds a token.
 */
export type BoardRelayLogEntry =
  | {
    readonly kind:        'event-dropped';
    readonly trackerId:   string;
    readonly stream:      string;
    readonly eventName:   string;
    readonly invalidKeys: readonly string[];
  }
  | {
    readonly kind:                  'handshake-version-differs';
    readonly trackerId:             string;
    readonly stream:                string;
    readonly versionWatchRead:      SystemVersion;
    readonly versionHandshakeNamed: SystemVersion | null;
  }
  | { readonly kind: 'board-unreadable'; readonly trackerId: string; readonly invalidKeys: readonly string[] }
  | { readonly kind: 'presence-unreadable'; readonly trackerId: string; readonly invalidKeys: readonly string[] }
  | { readonly kind: 'crash-log-unreadable'; readonly trackerId: string; readonly invalidKeys: readonly string[] };

export type BoardRelayLog = (entry: BoardRelayLogEntry) => void;
