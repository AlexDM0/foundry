/**
 * `start.json` both ways. What matters: what the writer stores reads back as the same start, optional fields left out stay out; a missing
 * file is absent, since a job reads its start before its first launch kept one; and a file that is not JSON, of another version or none, or
 * with any field of the wrong shape is unreadable, never a start with a hole in it, and never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import { JOB_START_FORMAT_VERSION, JobStartIngestion, type JobStart } from './JobStartIngestion.ts';
import { createJobStartWriter }                                       from './JobStartWriter.ts';

let scratchDirectory = '';

const startFilePath = (): string => join(scratchDirectory, 'start.json');

const reading = (): ReturnType<JobStartIngestion['read']> => new JobStartIngestion(startFilePath()).read();

const PACKAGE_BUILD_START: JobStart = {
  startCommit:              'a1b2c3',
  contentHashAtLaunch:      'content-hash',
  documentVersionsAtLaunch: 'spec:hash-1',
  launchSnapshot:           { refs: { 'refs/heads/main': 'a1b2c3' }, hooksFolderDigest: null },
  homeEntity:               'app',
  dependentsFixedInGroup:   ['tool'],
};

function storeDocument(document: Record<string, unknown>): void {
  writeFileSync(startFilePath(), `${JSON.stringify(document)}\n`);
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('job-start-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same start, with its version', () => {
  createJobStartWriter(startFilePath()).write(PACKAGE_BUILD_START);
  expect(reading()).toEqual({ verdict: 'readable', start: PACKAGE_BUILD_START });
});

test('a start without its optional fields reads back without them', () => {
  const plainStart: JobStart = { startCommit: 'a1b2c3', contentHashAtLaunch: '', launchSnapshot: { refs: {}, hooksFolderDigest: 'digest' } };
  createJobStartWriter(startFilePath()).write(plainStart);
  expect(reading()).toEqual({ verdict: 'readable', start: plainStart });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(startFilePath(), '{"startCommit": ');
  expect(reading()).toMatchObject({ verdict: 'unreadable' });
});

test('a start of another version, or of none, is unreadable', () => {
  storeDocument({ ...PACKAGE_BUILD_START, version: JOB_START_FORMAT_VERSION + 1 });
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${JOB_START_FORMAT_VERSION}` });
  storeDocument({ ...PACKAGE_BUILD_START });
  expect(reading()).toEqual({ verdict: 'unreadable', reason: `its version is not ${JOB_START_FORMAT_VERSION}` });
});

test.each([
  ['startCommit', { startCommit: 7 }, 'its "startCommit" is not text'],
  ['contentHashAtLaunch', { contentHashAtLaunch: null }, 'its "contentHashAtLaunch" is not text'],
  ['documentVersionsAtLaunch', { documentVersionsAtLaunch: [] }, 'its "documentVersionsAtLaunch" is not text'],
  ['homeEntity', { homeEntity: 1 }, 'its "homeEntity" is not an entity key'],
  ['dependentsFixedInGroup', { dependentsFixedInGroup: ['tool', 2] }, 'its "dependentsFixedInGroup" is not a list of entity keys'],
  ['launchSnapshot', { launchSnapshot: [] }, 'its "launchSnapshot" is not an object'],
  ['launchSnapshot.refs', { launchSnapshot: { refs: { main: 1 }, hooksFolderDigest: null } }, 'its "launchSnapshot.refs" is not a record of commits'],
  ['launchSnapshot.hooksFolderDigest', { launchSnapshot: { refs: {} } }, 'its "launchSnapshot.hooksFolderDigest" is not text or null'],
])('a wrong %s is unreadable', (_field, change, reason) => {
  storeDocument({ version: JOB_START_FORMAT_VERSION, ...PACKAGE_BUILD_START, ...change });
  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});

test('a folder where the file belongs is unreadable, not absent, and does not throw', () => {
  const ingestion = new JobStartIngestion(scratchDirectory);
  expect(() => ingestion.read()).not.toThrow();
  expect(ingestion.read()).toMatchObject({ verdict: 'unreadable' });
});
