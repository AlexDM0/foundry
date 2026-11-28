/**
 * The stale-green session owner both ways. What matters: both recorded answers, an ended job's id and `null`, read back as written; a
 * missing file is absent, since the first instance has not launched yet; anything else is unreadable, never a throw.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test,
} from 'bun:test';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { StaleGreenSessionOwnerProblem }             from './@types/StaleGreenSessionOwnerProblem.ts';
import { StaleGreenSessionOwnerIngestion }                from './StaleGreenSessionOwnerIngestion.ts';
import { createStaleGreenSessionOwnerWriter }             from './StaleGreenSessionOwnerWriter.ts';

let scratchDirectory: string | null = null;

let ownerFilePath = '';

const reading = (): ReturnType<StaleGreenSessionOwnerIngestion['read']> => new StaleGreenSessionOwnerIngestion(ownerFilePath).read();

beforeEach(() => {
  scratchDirectory = createScratchDirectory('stale-green-session-owner');
  ownerFilePath = join(scratchDirectory, 'stale-green-session-owner.json');
});

afterEach(() => {
  if (scratchDirectory !== null) removeScratchDirectory(scratchDirectory);
  scratchDirectory = null;
});

test('no file is absent', () => {
  expect(reading()).toEqual({ verdict: 'absent' });
});

test.each([['an ended job', 'J1'], ['no ended session', null]])('what the writer stores for %s reads back the same', (_case, sessionOwnerJobId) => {
  createStaleGreenSessionOwnerWriter(ownerFilePath).write(sessionOwnerJobId);

  expect(reading()).toEqual({ verdict: 'readable', sessionOwnerJobId });
});

test.each<[string, string, Partial<StaleGreenSessionOwnerProblem>]>([
  ['not JSON', '{', { code: 'not-json' }],
  ['no version', '{"sessionOwnerJobId":"J1"}', { code: 'version-differs', field: 'version', expectedVersion: 1 }],
  ['another version', '{"version":2,"sessionOwnerJobId":"J1"}', { code: 'version-differs', field: 'version', expectedVersion: 1 }],
  ['no owner', '{"version":1}', { code: 'neither-a-job-id-nor-null', field: 'sessionOwnerJobId' }],
  ['an owner that is no string', '{"version":1,"sessionOwnerJobId":7}', { code: 'neither-a-job-id-nor-null', field: 'sessionOwnerJobId' }],
  ['an empty owner', '{"version":1,"sessionOwnerJobId":""}', { code: 'neither-a-job-id-nor-null', field: 'sessionOwnerJobId' }],
])('%s is unreadable, never a throw', (_case, storedText, problem) => {
  writeFileSync(ownerFilePath, storedText);

  const ownerReading = reading();

  expect(ownerReading.verdict).toBe('unreadable');
  expect(ownerReading.verdict === 'unreadable' ? ownerReading.problem : null).toMatchObject(problem);
});
