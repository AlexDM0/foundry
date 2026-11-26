/**
 * A snapshot agent's start both ways. What matters: what the writer stores reads back as the same start; no file is absent, which a turn
 * end refuses as no start; and the start of before the version, another version and each wrong field are unreadable, never a throw, since a
 * turn end must not run Customs against a start it cannot trust.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { SnapshotStartIngestion, type SnapshotStart }     from './SnapshotStartIngestion.ts';
import { createSnapshotStartWriter }                      from './SnapshotStartWriter.ts';

const START: SnapshotStart = {
  startCommit:    '1'.repeat(40),
  launchSnapshot: { refs: { 'refs/heads/main': '1'.repeat(40), 'HEAD:/example/snapshot': '1'.repeat(40) }, hooksFolderDigest: null },
};

let scratchDirectory = '';

const startFilePath = (): string => join(scratchDirectory, 'pipeline-agent-start.json');

const reading = (): ReturnType<SnapshotStartIngestion['read']> => new SnapshotStartIngestion(startFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('snapshot-start-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('what the writer stores reads back as the same start, under version 1', () => {
  createSnapshotStartWriter(startFilePath()).write(START);

  expect(reading()).toEqual({ verdict: 'readable', snapshotStart: START });
  expect(JSON.parse(readFileSync(startFilePath(), 'utf8'))).toEqual({ version: 1, ...START });
});

test('a hooks folder digest reads back as written', () => {
  const start = { ...START, launchSnapshot: { ...START.launchSnapshot, hooksFolderDigest: 'a'.repeat(64) } };
  createSnapshotStartWriter(startFilePath()).write(start);

  expect(reading()).toEqual({ verdict: 'readable', snapshotStart: start });
});

const STORED_LAUNCH_SNAPSHOT = JSON.stringify(START.launchSnapshot);

const STORED_START_COMMIT = `"startCommit":"${START.startCommit}"`;

test.each([
  ['not JSON', '{', 'it is not valid JSON'],
  ['the start of before the version', `{"startCommit":"${START.startCommit}","launchSnapshot":${STORED_LAUNCH_SNAPSHOT}}`, 'its version is not 1'],
  ['another version', `{"version":2,"startCommit":"${START.startCommit}","launchSnapshot":${STORED_LAUNCH_SNAPSHOT}}`, 'its version is not 1'],
  ['no start commit', `{"version":1,"launchSnapshot":${STORED_LAUNCH_SNAPSHOT}}`, 'its startCommit is not a commit'],
  ['an empty start commit', `{"version":1,"startCommit":"","launchSnapshot":${STORED_LAUNCH_SNAPSHOT}}`, 'its startCommit is not a commit'],
  ['no launch snapshot', `{"version":1,"startCommit":"${START.startCommit}"}`, 'its launchSnapshot is not an object'],
  ['refs that are no commits', `{"version":1,${STORED_START_COMMIT},"launchSnapshot":{"refs":{"main":5},"hooksFolderDigest":null}}`, 'its launchSnapshot.refs is not'],
  ['a hooks digest that is no text', `{"version":1,${STORED_START_COMMIT},"launchSnapshot":{"refs":{},"hooksFolderDigest":5}}`, 'its launchSnapshot.hooksFolderDigest is neither'],
])('%s is unreadable, never a throw', (_case, storedText, reason) => {
  writeFileSync(startFilePath(), storedText);

  const startReading = reading();

  expect(startReading.verdict).toBe('unreadable');
  expect(startReading.verdict === 'unreadable' ? startReading.reason : '').toContain(reason);
});
