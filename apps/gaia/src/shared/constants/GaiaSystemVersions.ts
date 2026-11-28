/**
 * Gaia's own system version toward its own clients, its page and its launcher, as `GET /api/versions` answers it, and the version of each
 * route at its versioned path, `/api/v<n>/<endpoint>`, whose lifetime `GaiaCompatibilityRegistry.ts` keeps. The one forge system version
 * Gaia supports is `SUPPORTED_FORGE_VERSION` (`src/shared/constants/SupportedForgeVersions.ts`).
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

/**
 * Raised in its minor when a route or the fleet stream only adds, so every page and launcher of this major keeps
 * working; in its major when one changes in a way a client built for the older major cannot read.
 */
export const GAIA_SYSTEM_VERSION: SystemVersion = { major: 4, minor: 5 };

/**
 * The oldest Gaia a page or a launcher may have been built for and still be served: Gaia 4.0 serves no client of Gaia 3.
 * Raised only to retire what `GAIA_COMPATIBILITY_REGISTRY` keeps, by its report: `bun run versions:raise-minimum <major.minor>`.
 */
export const MINIMUM_SUPPORTED_GAIA_VERSION: SystemVersion = { major: 4, minor: 0 };

/**
 * Each route's version: v1, except where the route had a breaking change since. The fleet and its stream reached 12 in Gaia 4.0 with a restarting
 * forge's `restarting` condition and `restart-failed` look; the commands reached 6 in Gaia 2.0 with no start or stop of Flint's brain.
 */
export const GAIA_ENDPOINT_VERSIONS = {
  health:               1,
  sessionCodes:         1,
  session:              1,
  fleet:                12,
  events:               12,
  commands:             6,
  forgeBoard:           1,
  forgeBoardEvents:     1,
  forgeJobStream:       1,
  forgeProfileStream:   1,
  forgePictureUpload:   1,
  forgePicture:         1,
  forgeCommands:        1,
  forgeCrashLog:        1,
  forgeTicketDocuments: 1,
} as const;
