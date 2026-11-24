/**
 * Forge's compatibility registry: one entry per thing forge keeps for clients of its versions, each versioned endpoint and each
 * compatibility path that is no endpoint (none today), with the forge version that introduced it and the last forge version whose clients
 * still need it. `bun run versions:raise-minimum <major.minor>` lists what a raise of `FORGE_SYSTEM_VERSIONS.minimumSupported` makes removable, and
 * `ForgeCompatibilityRegistry.spec.ts` fails while an entry is kept below that minimum. `GET /api/versions` is in no entry: it is never removed.
 * An endpoint segment `{<name>}` is a template a concrete path fills (`CompatibilityRegistryUtil.endpointEntryForPath`).
 */
import type { CompatibilityEntry } from 'system-versions/CompatibilityEntry';
import type { SystemVersion }      from 'system-versions/VersionsDocument';

/** `authored` for what forge has not shipped yet and the registry describes ahead of it; `shipped` for what forge serves. */
export type ForgeCompatibilityEntry = CompatibilityEntry & { readonly source: 'authored' | 'shipped' };

const FIRST_VERSIONED_FORGE: SystemVersion = { major: 1, minor: 0 };

/** The forge version that first served the endpoint at this version: `versions:raise-minimum` dates it by this, and it gates nothing. */
const PRESENCE_ADDED_IN: SystemVersion = { major: 1, minor: 20 };
const VERSIONED_STREAMS_AND_PICTURES_ADDED_IN: SystemVersion = { major: 1, minor: 22 };
/** The forge whose serving process is Hephaestus: the key `hephaestus` of the summary, the monitor and the board, and the four lifecycle command kinds. */
const HEPHAESTUS_FORGE: SystemVersion = { major: 3, minor: 0 };
/** The forge that restarts Hephaestus through a preflight: the state `restarting`, the warning kind restart-failed and the board's `restartWarning`. */
const RESTARTING_FORGE: SystemVersion = { major: 4, minor: 0 };
/** The forge that serves a ticket's spec and plan in the spec-then-plan route. */
const TICKET_DOCUMENTS_FORGE: SystemVersion = { major: 4, minor: 1 };

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

export const FORGE_COMPATIBILITY_REGISTRY: readonly ForgeCompatibilityEntry[] = [
  currentEndpointOf('identity', 1),
  endpointAddedIn('summary', 3, RESTARTING_FORGE),
  endpointAddedIn('monitor', 5, RESTARTING_FORGE),
  endpointAddedIn('monitor/events', 5, RESTARTING_FORGE),
  endpointAddedIn('commands', 3, HEPHAESTUS_FORGE),
  endpointAddedIn('presence', 1, PRESENCE_ADDED_IN),
  endpointAddedIn('crash-log', 1, PRESENCE_ADDED_IN),
  endpointAddedIn('board', 4, RESTARTING_FORGE),
  endpointAddedIn('events', 4, RESTARTING_FORGE),
  endpointAddedIn('jobs/{jobId}/stream', 1, VERSIONED_STREAMS_AND_PICTURES_ADDED_IN),
  endpointAddedIn('profiles/{profileRunId}/stream', 1, VERSIONED_STREAMS_AND_PICTURES_ADDED_IN),
  endpointAddedIn('pictures', 1, VERSIONED_STREAMS_AND_PICTURES_ADDED_IN),
  endpointAddedIn('pictures/{pictureId}', 1, VERSIONED_STREAMS_AND_PICTURES_ADDED_IN),
  endpointAddedIn('tickets/{ticketId}/documents', 1, TICKET_DOCUMENTS_FORGE),
];
