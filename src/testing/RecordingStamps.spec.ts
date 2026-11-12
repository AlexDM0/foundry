/**
 * The stamp check fails only on a stale recording: one stamped with another version than the installed one, one stamped for another
 * boundary, OS or system, one that cannot be read, and one that records no listed boundary. A boundary with no recording for the OS is
 * listed as not finished, an authored recording as a warning, and a recording of a system whose installed version only a run reads as
 * unchecked; none of those fails the check. Each stale and unchecked line names the command to record again.
 */
import { describe, expect, test } from 'bun:test';

import type { RecordedBoundary, RecordingStamp } from './BoundaryRecordings.ts';
import { recordingStampReportOf }                from './RecordingStamps.ts';

const EXAMPLE_BOUNDARY: RecordedBoundary = {
  recordingName:  'example-boundary',
  boundaryModule: 'src/lib/example/ExampleBoundary.ts',
  recordingSpec:  'src/lib/example/ExampleBoundary.recording.spec.ts',
  system:         'bun',
};

const INSTALLED_BUN_VERSION = '1.4.2';

function recordingText(stamp: RecordingStamp, recordingVersion = 1): string {
  return JSON.stringify({ recordingVersion, stamp, answers: [] });
}

function recordedStamp(overrides: Partial<Extract<RecordingStamp, { source: 'recorded' }>> = {}): RecordingStamp {
  return {
    recordingName:   'example-boundary',
    operatingSystem: 'darwin',
    system:          'bun',
    source:          'recorded',
    systemVersion:   INSTALLED_BUN_VERSION,
    ...overrides,
  };
}

function reportFor(recordingTexts: ReadonlyMap<string, string>, installedVersion: string | null = INSTALLED_BUN_VERSION) {
  return recordingStampReportOf({
    recordedBoundaries: [EXAMPLE_BOUNDARY],
    operatingSystem:    'darwin',
    recordingTexts,
    installedVersionOf: () => installedVersion,
  });
}

describe('the recording-stamp check', () => {
  test('passes a recording stamped with the installed version', () => {
    expect(reportFor(new Map([['example-boundary.json', recordingText(recordedStamp())]]))).toEqual({
      staleLines: [], unfinishedLines: [], authoredLines: [], uncheckedLines: []
    });
  });

  test('names a recording stamped with another version as stale, with the command that records it again', () => {
    const report = reportFor(new Map([['example-boundary.json', recordingText(recordedStamp({ systemVersion: '1.4.1' }))]]));
    expect(report.staleLines).toEqual([
      'The recording of example-boundary on darwin is stale: it is stamped bun 1.4.1, and bun 1.4.2 is installed. Record it again with `bun run record example-boundary`.',
    ]);
  });

  test('names a recording stamped for another OS as stale', () => {
    const report = reportFor(new Map([['example-boundary.json', recordingText(recordedStamp({ operatingSystem: 'linux' }))]]));
    expect(report.staleLines).toEqual([expect.stringContaining('is stamped for example-boundary on linux with bun, not for example-boundary on darwin with bun.')]);
  });

  test('names a recording that cannot be read as stale, with the reason', () => {
    const report = reportFor(new Map([['example-boundary.json', recordingText(recordedStamp(), 2)]]));
    expect(report.staleLines).toEqual([
      expect.stringContaining('is unreadable: its recordingVersion is 2, and Gaia reads 1. Record it again with `bun run record example-boundary`.'),
    ]);
  });

  test('names a recording file of no listed boundary as stale', () => {
    const report = reportFor(new Map([
      ['example-boundary.json', recordingText(recordedStamp())],
      ['retired-boundary.json', recordingText(recordedStamp({ recordingName: 'retired-boundary' }))],
    ]));
    expect(report.staleLines).toEqual(['retired-boundary.json of darwin records no boundary of RECORDED_BOUNDARIES: remove it.']);
  });

  test('lists a boundary with no recording for the OS as not finished, and fails nothing', () => {
    expect(reportFor(new Map())).toEqual({
      staleLines:      [],
      unfinishedLines: ['example-boundary is not finished for darwin: it has no recording. Record it with `bun run record example-boundary`.'],
      authoredLines:   [],
      uncheckedLines:  [],
    });
  });

  test('lists an authored recording as a warning, and fails nothing', () => {
    const authoredStamp: RecordingStamp = {
      recordingName: 'example-boundary', operatingSystem: 'darwin', system: 'bun', source: 'authored'
    };
    expect(reportFor(new Map([['example-boundary.json', recordingText(authoredStamp)]]))).toEqual({
      staleLines:      [],
      unfinishedLines: [],
      authoredLines:   [expect.stringContaining('example-boundary.json is authored by hand and waits to be recorded from a real bun.')],
      uncheckedLines:  [],
    });
  });

  test('lists a recording of a system whose installed version only a run reads as unchecked, and fails nothing', () => {
    expect(reportFor(new Map([['example-boundary.json', recordingText(recordedStamp({ systemVersion: 'install version 7' }))]]), null)).toEqual({
      staleLines:      [],
      unfinishedLines: [],
      authoredLines:   [],
      uncheckedLines:  [
        'The recording of example-boundary on darwin is stamped bun install version 7; verify cannot read the installed bun without running it. '
          + 'After a change of bun, record it again with `bun run record example-boundary`.',
      ],
    });
  });
});
