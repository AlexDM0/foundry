/**
 * `heartbeat.json` both ways. What matters: the writer's beat reads back as the same record; a missing file is absent, since a generation that
 * never beat leaves none; not JSON, another or no `heartbeatVersion`, and each wrong field are unreadable with a reason; nothing throws.
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
import type { HeartbeatRecord }                           from './@types/HeartbeatRecord.ts';
import { HeartbeatIngestion }                             from './HeartbeatIngestion.ts';
import { createHeartbeatWriter }                          from './HeartbeatWriter.ts';

const BEAT: HeartbeatRecord = {
  heartbeatVersion: 1, generation: 3, sequence: 12, at: '2026-11-19T09:00:00.000+01:00'
};

let scratchDirectory = '';

const heartbeatFilePath = (): string => join(scratchDirectory, 'heartbeat.json');

const reading = (): ReturnType<HeartbeatIngestion['read']> => new HeartbeatIngestion(heartbeatFilePath()).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('heartbeat-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('what the writer stores reads back as the same beat, under its heartbeatVersion', () => {
  createHeartbeatWriter(heartbeatFilePath()).write(BEAT);

  expect(reading()).toEqual({ verdict: 'readable', record: BEAT });
  expect(JSON.parse(readFileSync(heartbeatFilePath(), 'utf8'))).toEqual(BEAT);
});

test('a missing file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(heartbeatFilePath(), 'not json');

  expect(reading()).toMatchObject({ verdict: 'unreadable', reason: expect.stringContaining('not valid JSON') });
});

test.each([
  ['another version', { heartbeatVersion: 2 }, 'its heartbeatVersion is not 1'],
  ['no version', { heartbeatVersion: undefined }, 'its heartbeatVersion is not 1'],
  ['a generation below 1', { generation: 0 }, 'generation is not a whole number from 1'],
  ['a sequence that is no whole number', { sequence: 1.5 }, 'sequence is not a whole number from 1'],
  ['no time', { at: null }, 'at is not a string'],
])('%s is unreadable', (_case, changes, reason) => {
  writeFileSync(heartbeatFilePath(), JSON.stringify({ ...BEAT, ...changes }));

  expect(reading()).toEqual({ verdict: 'unreadable', reason });
});
