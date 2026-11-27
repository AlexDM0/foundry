/**
 * A job file its ingestion found unreadable, carried as a reading's verdict until a hold opens the `system-file-unreadable` incident on the
 * job that needed it, so no step is taken on what could not be read.
 */
import type { LogRecord }                                    from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Board }                                        from '../../domain/tracker-model/Board.ts';
import { dataFolderPathOf }                                  from './HephaestusFiles.ts';
import { UnreadableJobFileIncident, type UnreadableJobFile } from './UnreadableJobFileIncident.ts';

/** `file` is the file's path inside the board's data folder, with `/` separators, as the incident names it. */
export interface StoredFileUnreadable {
  readonly verdict: 'unreadable-file';
  readonly file:    string;
  readonly reason:  string;
}

function unreadableFileOf(trackerDirectory: string, filePath: string, reason: string): StoredFileUnreadable {
  return { verdict: 'unreadable-file', file: dataFolderPathOf(trackerDirectory, filePath), reason };
}

function isUnreadableFile(value: unknown): value is StoredFileUnreadable {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, 'verdict') && (value as { verdict: unknown }).verdict === 'unreadable-file';
}

/** The file as the incident on `readingJobId` names it: the job whose step needed the file, which may be another job's. */
function unreadableJobFileOn(readingJobId: string, unreadable: StoredFileUnreadable): UnreadableJobFile {
  return { jobId: readingJobId, file: unreadable.file, reason: unreadable.reason };
}

/** In a hold: the incident on `readingJobId`. */
function openIncidentOn(board: Board, readingJobId: string, unreadable: StoredFileUnreadable, at: string): readonly LogRecord[] {
  return UnreadableJobFileIncident.openOnce(board, unreadableJobFileOn(readingJobId, unreadable), at);
}

export const StoredFileUnreadable = Object.freeze({
  unreadableFileOf, isUnreadableFile, unreadableJobFileOn, openIncidentOn
});
