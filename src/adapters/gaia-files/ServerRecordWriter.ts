/**
 * Writes and removes `<monitor>/gaia/server.json`, the record a forge reads to let Gaia's origin frame its Bridge (FORGE_REQUIREMENTS F5).
 * Only `remove()` removes it: a record left by a crash names a dead process and is overwritten by the next start.
 */
import { join } from 'node:path';

import type { AtomicWriteVerdict }                   from '../../lib/atomic-file/AtomicFile.ts';
import { CONTRACT_VERSIONS }                         from '../../shared/constants/ContractVersions.ts';
import { FORGE_PLACES }                              from '../../shared/constants/ForgePlaces.ts';
import { GaiaFileWriteUtil, type FileRemoveVerdict } from './utils/GaiaFileWriteUtil.ts';

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

export interface ServerRecordWriter {
  write(record: ServerRecord): Promise<AtomicWriteVerdict>;
  remove(): Promise<FileRemoveVerdict>;
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

export function createServerRecordWriter(homeDirectory: string): ServerRecordWriter {
  return {
    write:  async (record) => GaiaFileWriteUtil.writeJson(serverRecordPathIn(homeDirectory), storedFormOf(record)),
    remove: async () => GaiaFileWriteUtil.remove(serverRecordPathIn(homeDirectory)),
  };
}
