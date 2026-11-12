/**
 * The ingestion of the forges' machine-wide registry `<monitor>/projects.json`: read, check the version, map the entries to
 * `RegisteredForge`s. A file at a version Gaia does not know maps nothing; a malformed entry is left out and named, the rest still map.
 */
import { AtomicFile }                                 from '../../lib/atomic-file/AtomicFile.ts';
import { CONTRACT_VERSIONS }                          from '../../shared/constants/ContractVersions.ts';
import type { LeftOutRegistryEntry, RegisteredForge } from './@types/RegisteredForge.ts';
import { RegistryMapUtil }                            from './utils/RegistryMapUtil.ts';

export type RegistryUnreadableReason =
  | 'read-failed'
  | 'not-json'
  | 'not-a-json-object'
  | 'version-unknown'
  | 'projects-not-an-object';

export type RegistryReading =
  | { readonly verdict: 'readable'; readonly forges: readonly RegisteredForge[]; readonly leftOutEntries: readonly LeftOutRegistryEntry[] }
  | { readonly verdict: 'absent' }
  /** `failure` is the system's error code of a read that failed, `null` for a file that was read and is not a registry. */
  | { readonly verdict: 'unreadable'; readonly reason: RegistryUnreadableReason; readonly failure: string | null }
  | { readonly verdict: 'newer-version'; readonly version: number };

const VERSION_KEY = 'version';
const ENTRIES_KEY = 'projects';

function parsedValueOf(contents: string): { readonly parsed: unknown } | null {
  try {
    return { parsed: JSON.parse(contents) as unknown };
  } catch {
    return null;
  }
}

function unreadable(reason: RegistryUnreadableReason): RegistryReading {
  return { verdict: 'unreadable', reason, failure: null };
}

function readingOf(contents: string): RegistryReading {
  const parsing = parsedValueOf(contents);
  if (parsing === null) return unreadable('not-json');
  const document = RegistryMapUtil.jsonObjectOf(parsing.parsed);
  if (document === null) return unreadable('not-a-json-object');

  const version = RegistryMapUtil.ownValueOf(document, VERSION_KEY);
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) return unreadable('version-unknown');
  if (version > CONTRACT_VERSIONS.forgeRegistry) return { verdict: 'newer-version', version };
  if (version !== CONTRACT_VERSIONS.forgeRegistry) return unreadable('version-unknown');

  // The forge writes `projects` from its first registration on; a registry without it holds no forge yet.
  const entriesValue = RegistryMapUtil.ownValueOf(document, ENTRIES_KEY);
  if (entriesValue === undefined) return { verdict: 'readable', forges: [], leftOutEntries: [] };
  const entries = RegistryMapUtil.jsonObjectOf(entriesValue);
  if (entries === null) return unreadable('projects-not-an-object');
  return { verdict: 'readable', ...RegistryMapUtil.registeredForgesOf(entries) };
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
