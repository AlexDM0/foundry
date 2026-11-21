/**
 * Creating a tracker on real files: a fresh workspace gets its tickets directory, a version 3 progress file holding what the caller handed
 * in and an empty log.jsonl; an existing progress file is never replaced, and then nothing else
 * is written.
 */
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { LIVE_HOLDERS_LOCK_TAKER }                        from '../../testing/LockTakers.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { NewTracker }                                from './@types/BoardRecords.ts';
import { localStoreLayoutOf }                             from './LocalStoreLayout.ts';
import { createTracker }                                  from './TrackerCreation.ts';
import { workspacePathsFor, type Workspace }              from './Workspace.ts';

const NEW_TRACKER: NewTracker = {
  project:   'Example Agency',
  startedAt: '2026-09-18T09:00:00+02:00',
  trackerId: 'example-tracker-id',
};

const EXISTING_PROGRESS_TEXT = '{"version":3,"project":"Kept by hand"}\n';

const EXISTING_LOG_TEXT = '{"at":"2026-09-18T20:05:00+02:00","kind":"note","fields":{"text":"Kept by hand"}}\n';

const now = (): Date => new Date('2026-09-18T07:00:00Z');

let workspace: Workspace;

beforeEach(() => {
  workspace = workspacePathsFor(createScratchDirectory('tracker-creation'));
});

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

test('a fresh workspace gets its tickets directory, a version 3 progress file and an empty log, renders no page, and answers created', async () => {
  const creation = await createTracker(workspace, NEW_TRACKER, now, LIVE_HOLDERS_LOCK_TAKER);

  expect(creation).toEqual({ verdict: 'created' });
  expect(statSync(localStoreLayoutOf(workspace).ticketRecordsFolder).isDirectory()).toBe(true);
  expect(JSON.parse(readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8'))).toMatchObject({ version: 3, ...NEW_TRACKER, tasks: [] });
  expect(readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8')).toBe('');
});

test('a log.jsonl left from a removed tracker is emptied, never adopted', async () => {
  mkdirSync(workspace.trackerDirectory, { recursive: true });
  writeFileSync(localStoreLayoutOf(workspace).logRecordPath, EXISTING_LOG_TEXT);

  await createTracker(workspace, NEW_TRACKER, now, LIVE_HOLDERS_LOCK_TAKER);

  expect(readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8')).toBe('');
});

test('an existing progress file answers already-exists, leaves progress.json and log.jsonl byte for byte, and writes no page', async () => {
  mkdirSync(workspace.trackerDirectory, { recursive: true });
  writeFileSync(localStoreLayoutOf(workspace).progressRecordPath, EXISTING_PROGRESS_TEXT);
  writeFileSync(localStoreLayoutOf(workspace).logRecordPath, EXISTING_LOG_TEXT);

  expect(await createTracker(workspace, NEW_TRACKER, now, LIVE_HOLDERS_LOCK_TAKER)).toEqual({ verdict: 'already-exists' });
  expect(readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8')).toBe(EXISTING_PROGRESS_TEXT);
  expect(readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8')).toBe(EXISTING_LOG_TEXT);
});
