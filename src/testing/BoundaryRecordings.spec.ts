/**
 * A recording is read only at the format version Gaia knows and only with a whole stamp; anything else is unreadable and maps nothing.
 * The list of recorded boundaries names exactly the recording specs in the repository, so no real-system spec runs unrecorded and no
 * listed one is missing. A recording spec run outside `bun run record` refuses to record.
 */
import { existsSync }             from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  answersInProgressPathOf,
  boundaryRecordingReadingOf,
  RECORDED_BOUNDARIES,
  recordAnswer,
  RECORDING_SPEC_SUFFIX,
  repositoryRoot,
  type RecordingStamp,
} from './BoundaryRecordings.ts';

const RECORDED_STAMP: RecordingStamp = {
  recordingName: 'example-boundary', operatingSystem: 'darwin', system: 'bun', source: 'recorded', systemVersion: '1.4.2'
};

describe('reading a recording', () => {
  test('reads the stamp and the answers of a recording at version 1', () => {
    const answers = [{ callShape: 'run ["bun","--version"]', answer: { verdict: 'timed-out' } }];
    expect(boundaryRecordingReadingOf(JSON.stringify({ recordingVersion: 1, stamp: RECORDED_STAMP, answers }))).toEqual({
      verdict:   'readable',
      recording: { recordingVersion: 1, stamp: RECORDED_STAMP, answers },
    });
  });

  test('answers unreadable for another recording version, and maps nothing', () => {
    expect(boundaryRecordingReadingOf(JSON.stringify({ recordingVersion: 2, stamp: RECORDED_STAMP, answers: [] })))
      .toEqual({ verdict: 'unreadable', reason: 'its recordingVersion is 2, and Gaia reads 1' });
  });

  test('answers unreadable for a recorded stamp without the system version', () => {
    const stampWithoutVersion = {
      recordingName: 'example-boundary', operatingSystem: 'darwin', system: 'bun', source: 'recorded'
    };
    expect(boundaryRecordingReadingOf(JSON.stringify({ recordingVersion: 1, stamp: stampWithoutVersion, answers: [] })))
      .toEqual({ verdict: 'unreadable', reason: 'it has no readable stamp' });
  });

  test('answers unreadable for an answer without a call shape, and for text that is no JSON', () => {
    expect(boundaryRecordingReadingOf(JSON.stringify({ recordingVersion: 1, stamp: RECORDED_STAMP, answers: [{ answer: {} }] })))
      .toEqual({ verdict: 'unreadable', reason: 'an answer has no call shape or no answer' });
    expect(boundaryRecordingReadingOf('{ half')).toEqual({ verdict: 'unreadable', reason: 'it is no JSON' });
  });
});

describe('the recorded boundaries', () => {
  test('list exactly the recording specs in the repository, each beside a boundary module that exists', () => {
    const recordingSpecsOnDisk = ['src', 'page'].flatMap((folder) => [...new Bun.Glob(`${folder}/**/*${RECORDING_SPEC_SUFFIX}`).scanSync({ cwd: repositoryRoot() })]);
    expect(recordingSpecsOnDisk.sort()).toEqual(RECORDED_BOUNDARIES.map(({ recordingSpec }) => recordingSpec).sort());
    for (const boundary of RECORDED_BOUNDARIES) expect(existsSync(join(repositoryRoot(), boundary.boundaryModule))).toBe(true);
  });

  test('refuse to collect an answer outside the record command, naming it', () => {
    expect(existsSync(answersInProgressPathOf('process-run'))).toBe(false);
    expect(() => recordAnswer('process-run', 'run ["bun","--version"]', { verdict: 'timed-out' })).toThrow('run it with `bun run record process-run`');
  });
});
