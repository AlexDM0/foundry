/**
 * What a forge answers at `GET /api/versions`, unversioned and never removed: its own system version and the oldest forge version a
 * client may have been built for and still be served. Forge alone decides that minimum, whoever calls it.
 */
import type { VersionsDocument } from 'system-versions/VersionsDocument';

/**
 * The current version rises with every change to a route, a document, a command or a message, in its minor when the change only adds; the
 * minimum only to retire what the registry keeps. What each version changed is `apps/forge/docs/reference/hephaestus-api.md`, "System versions".
 */
export const FORGE_SYSTEM_VERSIONS: VersionsDocument = {
  current:          { major: 4, minor: 5 },
  minimumSupported: { major: 4, minor: 0 },
};
