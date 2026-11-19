/**
 * Forge's compatibility registry: one entry per thing forge keeps for clients of its versions, each versioned endpoint and each
 * compatibility path that is no endpoint, with the forge version that introduced it and the last forge version whose clients still need
 * it. `bun run versions:raise-minimum <major.minor>` lists what a raise of `FORGE_SYSTEM_VERSIONS.minimumSupported` makes removable, and
 * `ForgeCompatibilityRegistry.spec.ts` fails while an entry is kept below that minimum. `GET /api/versions` is in no entry: it is never removed.
 */
import type { CompatibilityEntry } from 'system-versions/CompatibilityEntry';
import type { SystemVersion }      from 'system-versions/VersionsDocument';

/** `authored` for what forge has not shipped yet and the registry describes ahead of it; `shipped` for what forge serves. */
export type ForgeCompatibilityEntry = CompatibilityEntry & { readonly source: 'authored' | 'shipped' };

const BEFORE_SYSTEM_VERSIONS: SystemVersion = { major: 0, minor: 0 };
const FIRST_VERSIONED_FORGE: SystemVersion = { major: 1, minor: 0 };

/** The forge version that first served the endpoint at this version: `versions:raise-minimum` dates it by this, and it gates nothing. */
const PRESENCE_ADDED_IN: SystemVersion = { major: 1, minor: 20 };

function endpointAddedIn(endpoint: string, version: number, introducedIn: SystemVersion): ForgeCompatibilityEntry {
  return {
    kind:         'endpoint',
    endpoint,
    version,
    introducedIn,
    lastNeededBy: null,
    source:       'shipped',
  };
}

function currentEndpointOf(endpoint: string, version: number): ForgeCompatibilityEntry {
  return endpointAddedIn(endpoint, version, FIRST_VERSIONED_FORGE);
}

/** Kept for a client built before system versions, which calls the unversioned paths and checks each document's integer version. */
function keptForReleasedClientsOf(name: string): ForgeCompatibilityEntry {
  return {
    kind:         'compatibility-path',
    name,
    introducedIn: BEFORE_SYSTEM_VERSIONS,
    lastNeededBy: BEFORE_SYSTEM_VERSIONS,
    source:       'shipped',
  };
}

export const FORGE_COMPATIBILITY_REGISTRY: readonly ForgeCompatibilityEntry[] = [
  currentEndpointOf('identity', 1),
  currentEndpointOf('summary', 1),
  // The monitor starts at v2: its warnings became objects before system versions, so v1 stands for the strings no versioned path serves.
  currentEndpointOf('monitor', 2),
  currentEndpointOf('monitor/events', 2),
  currentEndpointOf('commands', 1),
  currentEndpointOf('session-codes', 1),
  endpointAddedIn('presence', 1, PRESENCE_ADDED_IN),
  endpointAddedIn('crash-log', 1, PRESENCE_ADDED_IN),
  keptForReleasedClientsOf('the unversioned routes, /api/<endpoint> beside each /api/v<n>/<endpoint>'),
  keptForReleasedClientsOf('the integer version keys of the documents: identityVersion, contracts, summaryVersion, monitorVersion, controlVersion'),
  keptForReleasedClientsOf('channelVersion 1 on every embed message, which a released Bridge and host compare for equality'),
];
