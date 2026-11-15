/**
 * One entry of a server's compatibility registry: something the server keeps so clients built for some of its versions keep working, tied
 * to the server version that introduced it and the last server version whose clients still need it.
 */
import type { SystemVersion, VersionsDocument } from './VersionsDocument.ts';

interface CompatibilityEntryLifetime {
  readonly introducedIn: SystemVersion;
  /** The newest server version whose clients still need the entry; `null` while clients of the current version need it. */
  readonly lastNeededBy: SystemVersion | null;
}

/** An endpoint at its versioned path, `/api/v<version>/<endpoint>`, served side by side with its other versions. */
export interface EndpointEntry extends CompatibilityEntryLifetime {
  readonly kind:     'endpoint';
  /** The path below the version, such as `monitor/events`. */
  readonly endpoint: string;
  readonly version:  number;
}

/** Anything else kept for older clients: an unversioned alias, a payload migration, an older message form. */
export interface CompatibilityPathEntry extends CompatibilityEntryLifetime {
  readonly kind: 'compatibility-path';
  readonly name: string;
}

export type CompatibilityEntry = EndpointEntry | CompatibilityPathEntry;

/** What raising the minimum supported version to `minimum` would let the server remove, and what it must keep. */
export interface RaiseMinimumReport<Entry extends CompatibilityEntry> {
  readonly versions:  VersionsDocument;
  readonly minimum:   SystemVersion;
  readonly removable: readonly Entry[];
  readonly kept:      readonly Entry[];
}
