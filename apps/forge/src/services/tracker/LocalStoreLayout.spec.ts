/**
 * The local store's layout: every record path inside the tracker directory and none shared, and a board counted as stored only where its
 * progress record is a file, since a half-finished `init` leaves the directory behind.
 */
import { mkdirSync, writeFileSync }  from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { boardIsStoredAt, localStoreLayoutOf }            from './LocalStoreLayout.ts';
import { workspacePathsFor }                              from './Workspace.ts';

const scratchDirectories: string[] = [];

function scratchRoot(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

describe('localStoreLayoutOf', () => {
  const workspace = workspacePathsFor('/example/repository');
  const recordPaths = Object.values(localStoreLayoutOf(workspace));

  test('every path is absolute and directly inside the data folder', () => {
    expect(recordPaths.length).toBe(12);
    for (const recordPath of recordPaths) {
      expect(isAbsolute(recordPath)).toBe(true);
      expect(dirname(recordPath)).toBe(workspace.trackerDirectory);
    }
  });

  test('every path is distinct, and none is the board page', () => {
    expect(new Set(recordPaths).size).toBe(recordPaths.length);
    expect(recordPaths).not.toContain(workspace.htmlFilePath);
  });

  test('the records keep the names a tracker has always stored them under', () => {
    expect(localStoreLayoutOf(workspace)).toEqual({
      progressRecordPath:            `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/progress.json`,
      pipelineRecordPath:            `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/pipeline.json`,
      pipelineSetupRecordPath:       `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/pipeline-setup.json`,
      gateProfilesRecordPath:        `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/gate-profiles.json`,
      constitutionSourcesRecordPath: `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/constitution-sources.json`,
      logRecordPath:                 `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/log.jsonl`,
      ticketRecordsFolder:           `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/tickets`,
      epicRecordsFolder:             `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/epics`,
      draftRecordsFolder:            `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/filing-cabinet`,
      committedContentFolder:        `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/committed-content`,
      storeLockFolder:               `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/.lock`,
      holdJournalPath:               `/example/repository/${PRODUCT_NAMES.DATA_FOLDER}/hold-journal.json`,
    });
  });
});

describe('boardIsStoredAt', () => {
  test('a root whose progress record is a file holds a board', () => {
    const rootDirectory = scratchRoot('layout-stored');
    const { progressRecordPath } = localStoreLayoutOf(workspacePathsFor(rootDirectory));
    mkdirSync(join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
    writeFileSync(progressRecordPath, '{"version":1}');
    expect(boardIsStoredAt(rootDirectory)).toBe(true);
  });

  test('a root with no data folder, or with the folder alone, holds none', () => {
    const rootDirectory = scratchRoot('layout-half-made');
    expect(boardIsStoredAt(rootDirectory)).toBe(false);
    mkdirSync(join(rootDirectory, PRODUCT_NAMES.DATA_FOLDER), { recursive: true });
    expect(boardIsStoredAt(rootDirectory)).toBe(false);
  });

  test('a progress record that is a folder holds none', () => {
    const rootDirectory = scratchRoot('layout-folder-record');
    mkdirSync(localStoreLayoutOf(workspacePathsFor(rootDirectory)).progressRecordPath, { recursive: true });
    expect(boardIsStoredAt(rootDirectory)).toBe(false);
  });

  test('a root that does not exist holds none', () => {
    expect(boardIsStoredAt(join(scratchRoot('layout-missing'), 'never-created'))).toBe(false);
  });
});
