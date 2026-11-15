/**
 * The forge system versions a reader built against this package knows, and the version of each forge endpoint it calls once a forge
 * publishes `GET /api/versions`. Forge 1.0 is the first forge that serves `/api/versions`, with the contracts released forges serve;
 * forge 1.1 adds Flint's brain (G1 to G3) to the monitor and the commands.
 */
import type { SystemVersion } from '../@types/VersionsDocument.ts';

/**
 * The forge system version the documents in `@types/` describe: Gaia's `supportedForgeVersion`. Raised, with the types, when a forge
 * release that Gaia reads adds to an endpoint (the minor) or breaks one (the major).
 */
export const SUPPORTED_FORGE_VERSION: SystemVersion = { major: 1, minor: 1 };

/**
 * The oldest forge system version a reader still talks to, through the older majors and migrations it keeps: Gaia's `minimumForgeVersion`.
 * Raised only when a reader drops the migration or the endpoint version that oldest forge needs.
 */
export const MINIMUM_FORGE_VERSION: SystemVersion = { major: 1, minor: 0 };

/**
 * The version of each forge endpoint at its versioned path, `/api/v<n>/<endpoint>`: v1, except where the endpoint already had a breaking
 * change, the monitor's warnings becoming objects (monitor contract 2). A forge that publishes no versions is called at its unversioned paths.
 */
export const OVERSEER_ENDPOINT_VERSIONS = {
  identity:      1,
  summary:       1,
  monitor:       2,
  monitorEvents: 2,
  commands:      1,
  sessionCodes:  1,
} as const;
