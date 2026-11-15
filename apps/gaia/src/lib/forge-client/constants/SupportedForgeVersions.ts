/** The forge system versions this client is built for, in forge's own version space. */
import type { SystemVersion } from 'system-versions/VersionsDocument';

/**
 * The forge version the client is built for: the endpoint versions it calls are those forge's compatibility registry serves this version.
 * Raised to forge's current version whenever the client takes up what forge added (the minor) or changed (the major).
 */
export const SUPPORTED_FORGE_VERSION: SystemVersion = { major: 1, minor: 1 };

/** The oldest forge version the client still talks to, through the older documents it still reads. Raised only when it drops one. */
export const MINIMUM_FORGE_VERSION: SystemVersion = { major: 1, minor: 0 };
