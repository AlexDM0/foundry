/**
 * The recording guards of `src/testing/ToolGuard.ts` against the stamp check. What matters: for each OS, the guard of a recorded boundary
 * skips exactly when the stamp check lists that boundary as not finished, with the same words; and each guarded boundary is one that
 * `BOUNDARY_SPECS` lists, so the check can name it at all.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join }                                  from 'node:path';
import { describe, expect, test }                from 'bun:test';

import {
  boundaryIsRecordedFor,
  RECORDING_SUFFIX,
  RECORDINGS_FOLDER,
  SYSTEM_OF_BOUNDARY,
  unfinishedBoundaryWordingOf
} from './BoundaryRecordings.ts';
import { BOUNDARY_SPECS }                    from './BoundarySpecs.ts';
import { recordingStampReportOf }            from './RecordingStamps.ts';
import { BOUNDARY_OF_RECORDING_REQUIREMENT } from './ToolGuard.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const OPERATING_SYSTEMS = ['darwin', 'linux', 'win32'];
const GUARDED_BOUNDARIES = Object.values(BOUNDARY_OF_RECORDING_REQUIREMENT);

function recordingTextsOf(os: string): Map<string, string> {
  const folder = join(REPOSITORY_ROOT, RECORDINGS_FOLDER, os);
  if (!existsSync(folder)) return new Map();
  return new Map(readdirSync(folder)
    .filter((fileName) => fileName.endsWith(RECORDING_SUFFIX))
    .map((fileName) => [fileName, readFileSync(join(folder, fileName), 'utf8')]));
}

function unfinishedLinesOf(os: string): readonly string[] {
  return recordingStampReportOf({
    boundaries:         BOUNDARY_SPECS.map(({ boundary }) => boundary),
    systemOf:           SYSTEM_OF_BOUNDARY,
    os,
    recordingTexts:     recordingTextsOf(os),
    installedVersionOf: () => 'not asked',
  }).unfinishedLines;
}

test('each guarded boundary is a boundary of BOUNDARY_SPECS', () => {
  const listed = BOUNDARY_SPECS.map(({ boundary }) => boundary);
  expect(GUARDED_BOUNDARIES.filter((boundary) => !listed.includes(boundary))).toEqual([]);
});

describe.each(OPERATING_SYSTEMS)('on %s', (os) => {
  test.each(GUARDED_BOUNDARIES)('the guard of %s skips exactly when the stamp check lists it as not finished, in the same words', (boundary) => {
    const listedAsNotFinished = unfinishedLinesOf(os).some((line) => line.startsWith(`${unfinishedBoundaryWordingOf(boundary, os)}:`));
    expect(listedAsNotFinished).toBe(!boundaryIsRecordedFor(boundary, os));
  });
});

test('the git, process table and local endpoint recordings of darwin exist, so their specs run there', () => {
  expect(GUARDED_BOUNDARIES.filter((boundary) => !boundaryIsRecordedFor(boundary, 'darwin'))).toEqual([]);
});
