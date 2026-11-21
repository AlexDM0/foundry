/**
 * Gaia's own system version toward its own clients, its page and its launcher, as `GET /api/versions` answers it, and the version of each
 * route at its versioned path, `/api/v<n>/<endpoint>`, whose lifetime `GaiaCompatibilityRegistry.ts` keeps. The one forge system version
 * Gaia supports is the forge client's (`src/lib/forge-client/constants/SupportedForgeVersions.ts`).
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

/**
 * Raised in its minor when a route, the fleet stream or a message to the Bridge only adds, so every page and launcher of this major keeps
 * working; in its major when one changes in a way a client built for the older major cannot read.
 */
export const GAIA_SYSTEM_VERSION: SystemVersion = { major: 1, minor: 2 };

/**
 * The oldest Gaia a page or a launcher may have been built for and still be served; 0.0 stands for every Gaia before system versions.
 * Raised only to retire what `GAIA_COMPATIBILITY_REGISTRY` keeps, by its report: `bun run versions:raise-minimum <major.minor>`.
 */
export const MINIMUM_SUPPORTED_GAIA_VERSION: SystemVersion = { major: 0, minor: 0 };

/**
 * Each route's version: v1, except where the route already had a breaking change. The fleet document and its stream: monitor contract 2's
 * warning kinds (2), Flint's brain (3), a forge too old to talk to (4). The commands: Gaia's sentences for forge refusals (2), and the brain's
 * commands (3).
 */
export const GAIA_ENDPOINT_VERSIONS = {
  health:             1,
  sessionCodes:       1,
  session:            1,
  fleet:              4,
  events:             4,
  commands:           3,
  frameSession:       1,
  forgeBoard:         1,
  forgeBoardEvents:   1,
  forgeJobStream:     1,
  forgeProfileStream: 1,
  forgePictureUpload: 1,
  forgePicture:       1,
  forgeCommands:      1,
} as const;
