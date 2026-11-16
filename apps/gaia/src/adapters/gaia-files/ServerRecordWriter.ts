/**
 * Writes and removes Gaia's frame-ancestor record, `<monitor>/frame-ancestors/gaia.json`, which every forge reads to let Gaia's origin frame its Bridge.
 * Only `remove()` removes it, and only while it names the process that asks: a record left by a crash names a dead process and is
 * overwritten by the next start, and a newer Gaia's record outlives an older Gaia's slow stop.
 */
import { join } from 'node:path';

import { FRAME_ANCESTOR_RECORD_FORMAT, type FrameAncestorRecord } from 'forge-contracts/FrameAncestorRecord';

import { AtomicFile, type AtomicWriteVerdict } from '../../lib/atomic-file/AtomicFile.ts';
import { CONTRACT_VERSIONS }                   from '../../shared/constants/ContractVersions.ts';
import { FORGE_PLACES }                        from '../../shared/constants/ForgePlaces.ts';
import { ContractVersionUtil }                 from '../../shared/utils/ContractVersionUtil.ts';
import { GaiaFile, type FileRemoveVerdict }    from './GaiaFile.ts';

/** The folder is the forge's; the file's name is Gaia's own, so it follows none of Gaia's product names either. */
const SERVER_RECORD_FILE_NAME = `gaia${FRAME_ANCESTOR_RECORD_FORMAT.extension}`;

export interface ServerRecord {
  readonly url:       URL;
  readonly processId: number;
  /** Recorded for a reader to show; never compared. */
  readonly startedAt: string;
}

const SERVER_RECORD_VERSION_KEYS = { majorKey: 'version', minorKey: 'minor' } as const;

/** The forge's frame-ancestor record, with the keys Gaia adds for itself, which a forge passes over. */
interface StoredServerRecord extends FrameAncestorRecord {
  readonly url:       string;
  readonly processId: number;
  readonly startedAt: string;
}

/** `held-by-another-process`: the record names another process, or cannot be read as one of this version, so it is left standing. */
export type ServerRecordRemoveVerdict = FileRemoveVerdict | { readonly verdict: 'held-by-another-process' };

export interface ServerRecordWriter {
  write(record: ServerRecord): Promise<AtomicWriteVerdict>;
  remove(processId: number): Promise<ServerRecordRemoveVerdict>;
}

export function serverRecordPathIn(homeDirectory: string): string {
  return join(homeDirectory, FORGE_PLACES.monitorFolderName, FRAME_ANCESTOR_RECORD_FORMAT.folderName, SERVER_RECORD_FILE_NAME);
}

function storedFormOf(record: ServerRecord): StoredServerRecord {
  return {
    version:   CONTRACT_VERSIONS.forgeFrameAncestorRecord.major,
    minor:     CONTRACT_VERSIONS.forgeFrameAncestorRecord.minor,
    url:       record.url.href,
    origin:    record.url.origin,
    processId: record.processId,
    startedAt: record.startedAt,
  };
}

function storedRecordNamesProcess(contents: string, processId: number): boolean {
  let stored: unknown;
  try {
    stored = JSON.parse(contents);
  } catch {
    return false;
  }
  if (typeof stored !== 'object' || stored === null) return false;
  const storedFields = stored as Readonly<Record<string, unknown>>;
  const storedMajor = ContractVersionUtil.readMajorOf(storedFields, SERVER_RECORD_VERSION_KEYS, CONTRACT_VERSIONS.forgeFrameAncestorRecord.major);
  return storedMajor !== null && storedFields['processId'] === processId;
}

export function createServerRecordWriter(homeDirectory: string): ServerRecordWriter {
  async function remove(processId: number): Promise<ServerRecordRemoveVerdict> {
    const recordPath = serverRecordPathIn(homeDirectory);
    const stored = await AtomicFile.read(recordPath);
    if (stored.verdict === 'absent') return stored;
    if (stored.verdict === 'unreadable') return { verdict: 'unremovable', failure: stored.failure };
    if (!storedRecordNamesProcess(stored.contents, processId)) return { verdict: 'held-by-another-process' };
    return GaiaFile.remove(recordPath);
  }

  return {
    write: async (record) => GaiaFile.writeJson(serverRecordPathIn(homeDirectory), storedFormOf(record)),
    remove,
  };
}
