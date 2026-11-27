/**
 * Gaia's compatibility registry toward its page and launcher: one entry per route kept for clients of its versions, with the Gaia version that
 * introduced it and the last whose clients need it. `bun run versions:raise-minimum <major.minor>` lists what a raise makes removable; `GET
 * /api/versions` is in no entry, since it is never removed.
 */
import type { CompatibilityEntry } from 'system-versions/CompatibilityEntry';
import type { SystemVersion }      from 'system-versions/VersionsDocument';

import { GAIA_ENDPOINT_VERSIONS } from './GaiaSystemVersions.ts';

const FIRST_VERSIONED_GAIA: SystemVersion = { major: 1, minor: 0 };
const BOARD_RELAY_ADDED_IN: SystemVersion = { major: 1, minor: 2 };
const CRASH_LOG_ADDED_IN: SystemVersion = { major: 1, minor: 3 };
/** Gaia 2.0 took Flint's brain out of the commands. */
const COMMANDS_WITHOUT_FLINT_BRAIN_IN: SystemVersion = { major: 2, minor: 0 };
/** Gaia 4.0 names a restarting forge's condition `restarting` and the look of a failed restart `restart-failed` in the fleet document. */
const FLEET_NAMING_THE_RESTART_IN: SystemVersion = { major: 4, minor: 0 };
/** Gaia 4.2 relays a ticket's spec and plan. */
const TICKET_DOCUMENTS_ADDED_IN: SystemVersion = { major: 4, minor: 2 };

/** Each route below `/api/`, without its version; a tracker id and an item id are placeholders. */
export const GAIA_ENDPOINTS = {
  health:               'health',
  sessionCodes:         'session-codes',
  session:              'session',
  fleet:                'fleet',
  events:               'events',
  commands:             'commands',
  forgeBoard:           'forges/<trackerId>/board',
  forgeBoardEvents:     'forges/<trackerId>/board/events',
  forgeJobStream:       'forges/<trackerId>/jobs/<jobId>/stream',
  forgeProfileStream:   'forges/<trackerId>/profiles/<profileRunId>/stream',
  forgePictureUpload:   'forges/<trackerId>/pictures',
  forgePicture:         'forges/<trackerId>/pictures/<pictureId>',
  forgeCommands:        'forges/<trackerId>/commands',
  forgeCrashLog:        'forges/<trackerId>/crash-logs/<number>',
  forgeTicketDocuments: 'forges/<trackerId>/tickets/<ticketId>/documents',
} as const satisfies Readonly<Record<keyof typeof GAIA_ENDPOINT_VERSIONS, string>>;

function currentEndpointOf(endpointName: keyof typeof GAIA_ENDPOINT_VERSIONS, introducedIn: SystemVersion = FIRST_VERSIONED_GAIA): CompatibilityEntry {
  return {
    kind:         'endpoint',
    endpoint:     GAIA_ENDPOINTS[endpointName],
    version:      GAIA_ENDPOINT_VERSIONS[endpointName],
    introducedIn,
    lastNeededBy: null,
  };
}

export const GAIA_COMPATIBILITY_REGISTRY: readonly CompatibilityEntry[] = [
  currentEndpointOf('health'),
  currentEndpointOf('sessionCodes'),
  currentEndpointOf('session'),
  currentEndpointOf('fleet', FLEET_NAMING_THE_RESTART_IN),
  currentEndpointOf('events', FLEET_NAMING_THE_RESTART_IN),
  currentEndpointOf('commands', COMMANDS_WITHOUT_FLINT_BRAIN_IN),
  currentEndpointOf('forgeBoard', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeBoardEvents', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeJobStream', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeProfileStream', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgePictureUpload', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgePicture', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeCommands', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeCrashLog', CRASH_LOG_ADDED_IN),
  currentEndpointOf('forgeTicketDocuments', TICKET_DOCUMENTS_ADDED_IN),
];
