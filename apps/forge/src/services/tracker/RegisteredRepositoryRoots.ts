/**
 * The repository roots of every forge the machine-wide registry names: an agent program inside any of them is code a job of that forge could
 * have written, so a program every forge of the machine runs may lie in none. A registry that cannot be read names no root.
 */
import { join } from 'node:path';

import { storedFileTextOf }       from '../../adapters/StoredFileText.ts';
import { JsonRecordUtil }         from '../../lib/json-record/JsonRecordUtil.ts';
import { VersionedRegistryUtil }  from '../../lib/versioned-registry/VersionedRegistryUtil.ts';
import { projectLocationOf }      from './ProjectLocation.ts';
import { MONITOR_REGISTRY_FILES } from './constants/MonitorRegistryFiles.ts';

const ROOT_KEY = 'root';

export function registeredRepositoryRootsIn(monitorFolder: string): string[] {
  const storedText = storedFileTextOf(join(monitorFolder, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME));
  if (storedText.verdict !== 'readable') return [];
  const reading = VersionedRegistryUtil.readingOf(storedText.text, {
    supportedVersion: MONITOR_REGISTRY_FILES.SUPPORTED_VERSION,
    entriesKey:       MONITOR_REGISTRY_FILES.ENTRIES_KEY,
  });
  if (reading.verdict === 'newer-version') return [];
  const entries = JsonRecordUtil.recordOf(reading.document[MONITOR_REGISTRY_FILES.ENTRIES_KEY]) ?? {};
  const roots = Object.values(entries).flatMap((entry) => {
    const root = JsonRecordUtil.recordOf(entry)?.[ROOT_KEY];
    return typeof root === 'string' && root !== '' ? [projectLocationOf(root).repositoryRoot] : [];
  });
  return [...new Set(roots)];
}
