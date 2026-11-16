/** The one forge system version this client is built for, in forge's own version space. */
import type { SystemVersion } from 'system-versions/VersionsDocument';

/**
 * The endpoint versions the client calls are those forge's compatibility registry serves this version, and it reads only the documents
 * this version serves: no older forge is read. Raised to forge's current version whenever the client takes up what forge added (the minor)
 * or changed (the major).
 */
export const SUPPORTED_FORGE_VERSION: SystemVersion = { major: 1, minor: 1 };
