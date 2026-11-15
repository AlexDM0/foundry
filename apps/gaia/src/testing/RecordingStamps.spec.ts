/**
 * The stamp check fails only on a stale recording: one stamped with another version than the installed one, one stamped for another
 * boundary, OS or system, one that cannot be read, one that records no listed boundary, a forge recording authored by hand whose boundary
 * awaits no forge requirement, and a recorded one whose boundary still names requirements it awaits. A boundary with no recording for the
 * OS is listed as not finished, an authored recording of another system or of awaited forge requirements as a warning, and a recording of
 * a system whose installed version only a run reads as unchecked; none of those fails the check. Each stale and unchecked line names the
 * command to record again.
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

  test('lists an authored recording of a system other than the forge as a warning, and fails nothing', () => {
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

  test('names an authored forge recording as stale, since every forge recording must be recorded', () => {
    const forgeBoundary: RecordedBoundary = { ...EXAMPLE_BOUNDARY, system: 'forge' };
    const authoredStamp: RecordingStamp = {
      recordingName: 'example-boundary', operatingSystem: 'darwin', system: 'forge', source: 'authored'
    };
    expect(recordingStampReportOf({
      recordedBoundaries: [forgeBoundary],
      operatingSystem:    'darwin',
      recordingTexts:     new Map([['example-boundary.json', recordingText(authoredStamp)]]),
      installedVersionOf: () => null,
    })).toEqual({
      staleLines: [
        'src/testing/recordings/darwin/example-boundary.json is authored by hand, and a forge recording must be recorded. '
          + 'Record it again with `bun run record example-boundary`.',
      ],
      unfinishedLines: [],
      authoredLines:   [],
      uncheckedLines:  [],
    });
  });

  test('lists an authored forge recording whose boundary awaits forge requirements as a warning naming them, and fails nothing', () => {
    const awaitingBoundary: RecordedBoundary = { ...EXAMPLE_BOUNDARY, system: 'forge', forgeRequirementsAwaited: ['G1', 'G3'] };
    const authoredStamp: RecordingStamp = {
      recordingName: 'example-boundary', operatingSystem: 'darwin', system: 'forge', source: 'authored'
    };
    expect(recordingStampReportOf({
      recordedBoundaries: [awaitingBoundary],
      operatingSystem:    'darwin',
      recordingTexts:     new Map([['example-boundary.json', recordingText(authoredStamp)]]),
      installedVersionOf: () => null,
    })).toEqual({
      staleLines:      [],
      unfinishedLines: [],
      authoredLines:   ['src/testing/recordings/darwin/example-boundary.json is authored from the forge requirements G1, G3 and waits for a forge that serves them.'],
      uncheckedLines:  [],
    });
  });

  test('names a recorded forge recording whose boundary still awaits forge requirements as stale, so the mark is left out once recorded', () => {
    const awaitingBoundary: RecordedBoundary = { ...EXAMPLE_BOUNDARY, system: 'forge', forgeRequirementsAwaited: ['G1'] };
    expect(recordingStampReportOf({
      recordedBoundaries: [awaitingBoundary],
      operatingSystem:    'darwin',
      recordingTexts:     new Map([['example-boundary.json', recordingText(recordedStamp({ system: 'forge', systemVersion: 'install version 28' }))]]),
      installedVersionOf: () => null,
    }).staleLines).toEqual([
      'src/testing/recordings/darwin/example-boundary.json is recorded, and its boundary still awaits the forge requirements G1: '
        + 'leave forgeRequirementsAwaited out of example-boundary in RECORDED_BOUNDARIES.',
    ]);
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
