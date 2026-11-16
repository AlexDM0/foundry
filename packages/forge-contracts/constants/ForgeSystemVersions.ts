/**
 * What a forge answers at `GET /api/versions`, unversioned and never removed: its own system version and the oldest forge version a
 * client may have been built for and still be served. Forge alone decides that minimum, whoever calls it.
 */
import type { VersionsDocument } from 'system-versions/VersionsDocument';

/**
 * Forge 1.0 is the first forge that serves `/api/versions` and the versioned paths; 1.1 adds Flint's brain to the monitor and the commands,
 * which only adds. Version 0.0 stands for every forge released before system versions: a client built for one calls the unversioned
 * paths, which forge keeps until the minimum is raised past it (`ForgeCompatibilityRegistry.ts`). The current version is raised with every
 * change to a route, a document, a command or a message, in its minor when the change only adds; the minimum only to retire what the
 * registry keeps.
 */
export const FORGE_SYSTEM_VERSIONS: VersionsDocument = {
  // 1.0 until forge runs Flint's brain: answering 1.1 would promise a brain this forge lacks.
  current:          { major: 1, minor: 0 },
  minimumSupported: { major: 0, minor: 0 },
};
