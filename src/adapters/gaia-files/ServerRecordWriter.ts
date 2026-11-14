/**
 * Writes and removes `<monitor>/gaia/server.json`, the record a forge reads to let Gaia's origin frame its Bridge (FORGE_REQUIREMENTS F5).
 * Only `remove()` removes it, and only while it names the process that asks: a record left by a crash names a dead process and is
 * overwritten by the next start, and a newer Gaia's record outlives an older Gaia's slow stop.
 */
import { join } from 'node:path';

import { AtomicFile, type AtomicWriteVerdict } from '../../lib/atomic-file/AtomicFile.ts';
import { CONTRACT_VERSIONS }                   from '../../shared/constants/ContractVersions.ts';
import { FORGE_PLACES }                        from '../../shared/constants/ForgePlaces.ts';
import { GaiaFile, type FileRemoveVerdict }    from './GaiaFile.ts';

/** The record's place is part of the forge's contract (F5), so no name follows Gaia's own product names. */
const GAIA_FOLDER_IN_FORGE_MONITOR = 'gaia';
const SERVER_RECORD_FILE_NAME = 'server.json';

export interface ServerRecord {
  readonly url:       URL;
  readonly processId: number;
  /** Recorded for a reader to show; never compared. */
  readonly startedAt: string;
}

interface StoredServerRecordVersion1 {
  readonly version:   1;
  readonly url:       string;
  readonly origin:    string;
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
  return join(homeDirectory, FORGE_PLACES.monitorFolderName, GAIA_FOLDER_IN_FORGE_MONITOR, SERVER_RECORD_FILE_NAME);
}

function storedFormOf(record: ServerRecord): StoredServerRecordVersion1 {
  return {
    version:   CONTRACT_VERSIONS.gaiaServerRecord,
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
  return storedFields['version'] === CONTRACT_VERSIONS.gaiaServerRecord && storedFields['processId'] === processId;
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
