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
export const GAIA_SYSTEM_VERSION: SystemVersion = { major: 4, minor: 4 };

/**
 * The oldest Gaia a page or a launcher may have been built for and still be served: Gaia 4.0 serves no client of Gaia 3.
 * Raised only to retire what `GAIA_COMPATIBILITY_REGISTRY` keeps, by its report: `bun run versions:raise-minimum <major.minor>`.
 */
export const MINIMUM_SUPPORTED_GAIA_VERSION: SystemVersion = { major: 4, minor: 0 };

/**
 * Each route's version: v1, except where the route already had a breaking change. The fleet document and its stream: monitor contract 2's
 * warning kinds (2), a part since removed (3), a forge too old to talk to (4), board routes in place of the Bridge's fragments (5), a forge's
 * presence, crash and waiting work (6), the fleet's alert of the agents a network outage stopped (7), the running and newest Hephaestus and
 * Talos (8), no forge's embed contract (9), in Gaia 2.0, no Flint's brain on a forge or among its agents and activity (10), in Gaia 3.0,
 * a forge's serving process named Hephaestus in its keys (`hephaestusStartedAt`, `hephaestusRunning`, `hephaestusNewest`) (11), and, in
 * Gaia 4.0, a restarting forge's condition `restarting` and the look of a failed restart `restart-failed` (12). The
 * commands: Gaia's sentences for forge refusals (2), commands since removed (3), Unpause in place of Resume beside the resume of
 * interrupted work (4), no Open in new tab of a forge's own Bridge (5), and, in Gaia 2.0, no start or stop of Flint's brain (6).
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
