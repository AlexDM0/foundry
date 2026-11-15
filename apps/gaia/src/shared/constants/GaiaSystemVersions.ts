/**
 * Gaia's own system version toward its own clients, its page and its launcher, as `GET /api/versions` answers it, and the version of each
 * route at its versioned path, `/api/v<n>/<endpoint>`. The forge system versions Gaia knows are `forge-contracts`' (`ForgeSystemVersions`).
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

/**
 * Raised in its minor when a route, the fleet stream or a message to the Bridge only adds, so every page and launcher of this major keeps
 * working; in its major when one changes in a way a client built for the older major cannot read.
 */
export const GAIA_SYSTEM_VERSION: SystemVersion = { major: 1, minor: 0 };

/**
 * The oldest Gaia a page or a launcher may have been built for and still be served. Raised only when Gaia removes an endpoint version, or
 * an unversioned path, that a client of that version still calls.
 */
export const MINIMUM_SUPPORTED_GAIA_VERSION: SystemVersion = { major: 1, minor: 0 };

/**
 * Each route's version: v1, except where the route already had a breaking change. The fleet document and its stream: monitor contract 2's
 * warning kinds (2), Flint's brain (3), a forge too old to talk to (4). The commands: Gaia's sentences for forge refusals (2), and the brain's
 * commands with `brain-not-served` (3).
 */
export const GAIA_ENDPOINT_VERSIONS = {
  health:       1,
  sessionCodes: 1,
  session:      1,
  fleet:        4,
  events:       4,
  commands:     3,
  frameSession: 1,
} as const;
