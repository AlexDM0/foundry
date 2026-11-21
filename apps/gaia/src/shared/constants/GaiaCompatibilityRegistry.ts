/**
 * Gaia's compatibility registry toward its own clients, its page and its launcher: one entry per thing Gaia's server keeps for clients of
 * its versions, each route at its versioned path and each compatibility path that is no route, with the Gaia version that introduced it
 * and the last Gaia version whose clients still need it. `bun run versions:raise-minimum <major.minor>` lists what a raise of
 * `MINIMUM_SUPPORTED_GAIA_VERSION` makes removable, and `GaiaCompatibilityRegistry.spec.ts` fails while an entry is kept below that
 * minimum. `GET /api/versions` is in no entry: it is never removed.
 */
import type { CompatibilityEntry } from 'system-versions/CompatibilityEntry';
import type { SystemVersion }      from 'system-versions/VersionsDocument';

import { GAIA_ENDPOINT_VERSIONS } from './GaiaSystemVersions.ts';

const BEFORE_SYSTEM_VERSIONS: SystemVersion = { major: 0, minor: 0 };
const FIRST_VERSIONED_GAIA: SystemVersion = { major: 1, minor: 0 };
const BOARD_RELAY_ADDED_IN: SystemVersion = { major: 1, minor: 2 };

/** Each route below `/api/`, without its version; a tracker id and an item id are placeholders. */
export const GAIA_ENDPOINTS = {
  health:             'health',
  sessionCodes:       'session-codes',
  session:            'session',
  fleet:              'fleet',
  events:             'events',
  commands:           'commands',
  frameSession:       'forges/<trackerId>/frame-session',
  forgeBoard:         'forges/<trackerId>/board',
  forgeBoardEvents:   'forges/<trackerId>/board/events',
  forgeJobStream:     'forges/<trackerId>/jobs/<jobId>/stream',
  forgeProfileStream: 'forges/<trackerId>/profiles/<profileRunId>/stream',
  forgePictureUpload: 'forges/<trackerId>/pictures',
  forgePicture:       'forges/<trackerId>/pictures/<pictureId>',
  forgeCommands:      'forges/<trackerId>/commands',
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
  currentEndpointOf('fleet'),
  currentEndpointOf('events'),
  currentEndpointOf('commands'),
  currentEndpointOf('frameSession'),
  currentEndpointOf('forgeBoard', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeBoardEvents', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeJobStream', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeProfileStream', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgePictureUpload', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgePicture', BOARD_RELAY_ADDED_IN),
  currentEndpointOf('forgeCommands', BOARD_RELAY_ADDED_IN),
  {
    kind:         'compatibility-path',
    name:         'the unversioned routes, /api/<endpoint> beside each /api/v<n>/<endpoint>, for a page or a launcher from before system versions',
    introducedIn: BEFORE_SYSTEM_VERSIONS,
    lastNeededBy: BEFORE_SYSTEM_VERSIONS,
  },
];
