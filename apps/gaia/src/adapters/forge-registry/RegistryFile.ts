/**
 * The ingestion of the forges' machine-wide registry `<monitor>/projects.json`: read, check the version, map the entries to
 * `RegisteredForge`s. A file at a version Gaia does not know maps nothing; an entry without its project or root is left out, the rest
 * still map.
 */
import { join } from 'node:path';

import { AtomicFile }           from '../../lib/atomic-file/AtomicFile.ts';
import { JsonValueUtil }        from '../../lib/json-value/JsonValueUtil.ts';
import type { RegistryRefusal } from '../../shared/@types/CommandVerdict.ts';
import { CONTRACT_VERSIONS }    from '../../shared/constants/ContractVersions.ts';
import { FORGE_PLACES }         from '../../shared/constants/ForgePlaces.ts';
import type { RegisteredForge } from './@types/RegisteredForge.ts';
import { RegistryMapUtil }      from './utils/RegistryMapUtil.ts';

export type RegistryUnreadableReason =
  | 'read-failed'
  | 'not-json'
  | 'not-a-json-object'
  | 'version-unknown'
  | 'projects-not-an-object';

export type RegistryReading =
  | { readonly verdict: 'readable'; readonly forges: readonly RegisteredForge[] }
  | { readonly verdict: 'absent' }
  /** `failure` is the system's error code of a read that failed, `null` for a file that was read and is not a registry. */
  | { readonly verdict: 'unreadable'; readonly reason: RegistryUnreadableReason; readonly failure: string | null }
  | { readonly verdict: 'newer-version'; readonly version: number };

/** The forges a reading names, or why it names none Gaia may act on; a registry that is absent names no forge yet. */
export function registeredForgesOf(registryReading: RegistryReading): readonly RegisteredForge[] | RegistryRefusal {
  switch (registryReading.verdict) {
    case 'readable':
      return registryReading.forges;
    case 'absent':
      return [];
    case 'unreadable':
      return 'registry-unreadable';
    case 'newer-version':
      return 'registry-newer-version';
  }
}

/** The registry every forge of the account writes itself into: `<home>/.forge-monitor/projects.json`. */
export function registryFilePathIn(homeDirectory: string): string {
  return join(homeDirectory, FORGE_PLACES.monitorFolderName, FORGE_PLACES.registryFileName);
}

const VERSION_KEY = 'version';
const ENTRIES_KEY = 'projects';

function unreadableReadingFor(reason: RegistryUnreadableReason): RegistryReading {
  return { verdict: 'unreadable', reason, failure: null };
}

function readingOf(contents: string): RegistryReading {
  const parsing = JsonValueUtil.parsedValueOf(contents);
  if (parsing === null) return unreadableReadingFor('not-json');
  const document = JsonValueUtil.jsonObjectOf(parsing.parsed);
  if (document === null) return unreadableReadingFor('not-a-json-object');

  const version = JsonValueUtil.ownValueOf(document, VERSION_KEY);
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) return unreadableReadingFor('version-unknown');
  if (version > CONTRACT_VERSIONS.forgeRegistry) return { verdict: 'newer-version', version };
  if (version !== CONTRACT_VERSIONS.forgeRegistry) return unreadableReadingFor('version-unknown');

  // The forge writes `projects` from its first registration on; a registry without it holds no forge yet.
  const entriesValue = JsonValueUtil.ownValueOf(document, ENTRIES_KEY);
  if (entriesValue === undefined) return { verdict: 'readable', forges: [] };
  const entries = JsonValueUtil.jsonObjectOf(entriesValue);
  if (entries === null) return unreadableReadingFor('projects-not-an-object');
  return { verdict: 'readable', forges: RegistryMapUtil.registeredForgesOf(entries) };
}

export class RegistryFile {
  private readonly registryFilePath: string;

  public constructor(registryFilePath: string) {
    this.registryFilePath = registryFilePath;
  }

  public async read(): Promise<RegistryReading> {
    const stored = await AtomicFile.read(this.registryFilePath);
    if (stored.verdict === 'absent') return { verdict: 'absent' };
    if (stored.verdict === 'unreadable') return { verdict: 'unreadable', reason: 'read-failed', failure: stored.failure };
    return readingOf(stored.contents);
  }
}
