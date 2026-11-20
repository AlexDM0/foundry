/** Where the local store keeps each record of one tracker: the local adapter's own, so nothing outside the adapter imports it. */
import { statSync }      from 'node:fs';
import { join, resolve } from 'node:path';

import { PRODUCT_NAMES }     from '../../shared/constants/ProductNames.ts';
import { LOCAL_STORE_FILES } from './constants/LocalStoreFiles.ts';

/** Every path absolute: a relative one would resolve against a subagent's working directory. */
export interface LocalStoreLayout {
  progressRecordPath:            string;
  pipelineRecordPath:            string;
  pipelineSetupRecordPath:       string;
  gateProfilesRecordPath:        string;
  constitutionSourcesRecordPath: string;
  logRecordPath:                 string;
  ticketRecordsFolder:           string;
  epicRecordsFolder:             string;
  draftRecordsFolder:            string;
  /** One `<hash>.json` per committed content, written before the ticket naming it and never rewritten. */
  committedContentFolder:        string;
  storeLockFolder:               string;
  holdJournalPath:               string;
}

function localStoreLayoutIn(trackerDirectory: string): LocalStoreLayout {
  return {
    progressRecordPath:            join(trackerDirectory, LOCAL_STORE_FILES.PROGRESS_FILE_NAME),
    pipelineRecordPath:            join(trackerDirectory, LOCAL_STORE_FILES.PIPELINE_FILE_NAME),
    pipelineSetupRecordPath:       join(trackerDirectory, LOCAL_STORE_FILES.PIPELINE_SETUP_FILE_NAME),
    gateProfilesRecordPath:        join(trackerDirectory, LOCAL_STORE_FILES.GATE_PROFILES_FILE_NAME),
    constitutionSourcesRecordPath: join(trackerDirectory, LOCAL_STORE_FILES.CONSTITUTION_SOURCES_FILE_NAME),
    logRecordPath:                 join(trackerDirectory, LOCAL_STORE_FILES.LOG_FILE_NAME),
    ticketRecordsFolder:           join(trackerDirectory, LOCAL_STORE_FILES.TICKETS_DIRECTORY_NAME),
    epicRecordsFolder:             join(trackerDirectory, LOCAL_STORE_FILES.EPICS_DIRECTORY_NAME),
    draftRecordsFolder:            join(trackerDirectory, LOCAL_STORE_FILES.DRAFTS_DIRECTORY_NAME),
    committedContentFolder:        join(trackerDirectory, LOCAL_STORE_FILES.COMMITTED_CONTENT_DIRECTORY_NAME),
    storeLockFolder:               join(trackerDirectory, LOCAL_STORE_FILES.LOCK_DIRECTORY_NAME),
    holdJournalPath:               join(trackerDirectory, LOCAL_STORE_FILES.HOLD_JOURNAL_FILE_NAME),
  };
}

/**
 * Touches no filesystem, because `init` needs the paths of a tracker it is creating. It takes a workspace's tracker directory alone, since
 * `Workspace.ts` asks `boardIsStoredAt` and an import of its type here would close a loop.
 */
export function localStoreLayoutOf(workspace: { readonly trackerDirectory: string }): LocalStoreLayout {
  return localStoreLayoutIn(workspace.trackerDirectory);
}

/** A board means its progress record, not merely the directory, which a half-finished `init` also leaves behind. */
export function boardIsStoredAt(rootDirectory: string): boolean {
  const { progressRecordPath } = localStoreLayoutIn(join(resolve(rootDirectory), PRODUCT_NAMES.DATA_FOLDER));
  try {
    return statSync(progressRecordPath).isFile();
  } catch {
    // Fail closed: a `stat` that errors reads as "no board here" rather than as a reason to stop walking.
    return false;
  }
}
