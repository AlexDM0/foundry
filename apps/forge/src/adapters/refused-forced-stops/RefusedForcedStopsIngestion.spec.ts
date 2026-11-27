/**
 * `child-<instance>.refused-forced-stops` both ways. What matters: the writer's file reads back as the same refusals under its `version`; a
 * child never refused has no file, which is absent; not JSON, another or no version, and each wrong field are unreadable; nothing throws.
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
import { RefusedForcedStopsIngestion }                    from './RefusedForcedStopsIngestion.ts';
import { RefusedForcedStopsProblemWording }               from './RefusedForcedStopsProblemWording.ts';
import { createRefusedForcedStopsWriter }                 from './RefusedForcedStopsWriter.ts';

const REFUSALS = { refusals: 2, treeProcessIds: [4242, 4243] };

let scratchDirectory = '';

const refusedForcedStopsFilePath = (): string => join(scratchDirectory, 'child-1.refused-forced-stops');

const reading = (): ReturnType<RefusedForcedStopsIngestion['read']> => new RefusedForcedStopsIngestion(refusedForcedStopsFilePath()).read();

/** The reading with its problem worded, as User reads it. */
function wordedReadingOf(read: ReturnType<RefusedForcedStopsIngestion['read']>): object {
  return read.verdict === 'unreadable' ? { verdict: read.verdict, reason: RefusedForcedStopsProblemWording.sentenceOf(read.problem) } : read;
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('refused-forced-stops-ingestion');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('what the writer stores reads back as the same refusals, under its version', () => {
  createRefusedForcedStopsWriter(refusedForcedStopsFilePath()).write(REFUSALS);

  expect(reading()).toEqual({ verdict: 'readable', forcedStopRefusals: REFUSALS });
  expect(JSON.parse(readFileSync(refusedForcedStopsFilePath(), 'utf8'))).toEqual({ version: 1, ...REFUSALS });
});

test('a child never refused has no file, which is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test('a file that is not JSON is unreadable', () => {
  writeFileSync(refusedForcedStopsFilePath(), '{"version":1,');

  expect(reading()).toMatchObject({ verdict: 'unreadable', problem: { code: 'not-json' } });
});

test.each([
  ['the format before its version', { version: undefined }, 'its version is not 1'],
  ['another version', { version: 2 }, 'its version is not 1'],
  ['no refusal counted', { refusals: 0 }, 'refusals is not a whole number from 1'],
  ['a process id that is no number', { treeProcessIds: ['4242'] }, 'treeProcessIds is not a list of process ids'],
  ['no tree', { treeProcessIds: undefined }, 'treeProcessIds is not a list of process ids'],
])('%s is unreadable', (_case, changes, reason) => {
  writeFileSync(refusedForcedStopsFilePath(), JSON.stringify({ version: 1, ...REFUSALS, ...changes }));

  expect(wordedReadingOf(reading())).toEqual({ verdict: 'unreadable', reason });
});
