/**
 * The stamp check without a real call: the recordings are texts and the installed versions a function, so each verdict is planted.
 * What matters: a stamp that agrees passes, a claude stamp on its major and minor version alone; a stale version, a stamp of another
 * boundary, OS or system, an unreadable recording and a recording of no boundary each fail with the boundary and its record command;
 * a boundary with no recording for this OS is listed as not finished and fails nothing; and every boundary of `BOUNDARY_SPECS` names
 * the system that stamps it, both lists exact.
 */
import { describe, expect, test } from 'bun:test';

import type { RecordedSystem, RecordingStamp }     from './BoundaryRecordings.ts';
import { recordingFileNameOf, SYSTEM_OF_BOUNDARY } from './BoundaryRecordings.ts';
import { BOUNDARY_SPECS }                          from './BoundarySpecs.ts';
import type { RecordingStampInput }                from './RecordingStamps.ts';
import { recordingStampReportOf }                  from './RecordingStamps.ts';

const GIT_BOUNDARY = 'src/lib/git/GitProcess.ts';
const OS_BOUNDARY = 'src/lib/process-identity/';
const RECORD_GIT = '`bun run record src/lib/git/GitProcess.ts`';
const INSTALLED: Readonly<Record<RecordedSystem, string>> = {
  'agent-progress':   'install version 23',
  'bun':              '1.3.0',
  'claude':           '2.1.311',
  'eslint':           '9.39.1',
  'git':              '2.50.1',
  'gpg':              '2.5.21',
  'opener':           'Darwin 25.6.0',
  'operating system': 'Darwin 25.6.0',
  'sandbox':          'Darwin 25.6.0',
  'setup tools':      'bun 1.3.0, git 2.50.1',
};

function recordingText(stamp: Partial<RecordingStamp>): string {
  return JSON.stringify({
    stamp: {
      boundary: GIT_BOUNDARY, system: 'git', version: '2.50.1', os: 'darwin', ...stamp
    },
    answers: []
  });
}

function reportOf(recordings: Readonly<Record<string, string>>): ReturnType<typeof recordingStampReportOf> {
  const input: RecordingStampInput = {
    boundaries:         [GIT_BOUNDARY, OS_BOUNDARY],
    systemOf:           { [GIT_BOUNDARY]: 'git', [OS_BOUNDARY]: 'operating system' },
    os:                 'darwin',
    recordingTexts:     new Map(Object.entries(recordings)),
    installedVersionOf: (system) => INSTALLED[system],
  };
  return recordingStampReportOf(input);
}

const GIT_FILE = recordingFileNameOf(GIT_BOUNDARY);
const CLAUDE_BOUNDARY = 'src/testing/fake-agent/';
const CLAUDE_FILE = recordingFileNameOf(CLAUDE_BOUNDARY);

function claudeStaleLinesOf(stampedVersion: string, installedClaudeVersion = INSTALLED.claude): readonly string[] {
  const stampedText = recordingText({ boundary: CLAUDE_BOUNDARY, system: 'claude', version: stampedVersion });
  return recordingStampReportOf({
    boundaries:         [CLAUDE_BOUNDARY],
    systemOf:           { [CLAUDE_BOUNDARY]: 'claude' },
    os:                 'darwin',
    recordingTexts:     new Map([[CLAUDE_FILE, stampedText]]),
    installedVersionOf: () => installedClaudeVersion,
  }).staleLines;
}

describe('a recording of this OS', () => {
  test('whose stamp agrees with the installed version passes', () => {
    expect(reportOf({ [GIT_FILE]: recordingText({}) }).staleLines).toEqual([]);
  });

  test('stamped with another version is stale, and the line names the boundary, both versions and the record command', () => {
    expect(reportOf({ [GIT_FILE]: recordingText({ version: '2.49.0' }) }).staleLines).toEqual([
      `The recording of ${GIT_BOUNDARY} on darwin is stale: it is stamped git 2.49.0, and git 2.50.1 is installed. Record it again with ${RECORD_GIT}.`,
    ]);
  });

  test.each([
    ['claude 2.1.290 agrees with an installed claude 2.1.311: only the major and minor version count', '2.1.290', []],
    ['claude 2.0.311 is stale against an installed claude 2.1.311', '2.0.311', ['claude 2.0.311']],
    ['claude 2.1 with no patch agrees with an installed claude 2.1.311', '2.1', []],
    ['claude 2.10.0 is stale against an installed claude 2.1.311', '2.10.0', ['claude 2.10.0']],
  ])('stamped %s', (_claim, stampedVersion, staleVersions) => {
    const lines = claudeStaleLinesOf(stampedVersion);
    expect(lines.map((line) => /stamped (claude [^,]+),/u.exec(line)?.[1])).toEqual(staleVersions);
  });

  test('stamped with another git patch version is stale: only claude matches on the major and minor version', () => {
    expect(reportOf({ [GIT_FILE]: recordingText({ version: '2.50.0' }) }).staleLines).toHaveLength(1);
  });

  test('stamped claude is stale when claude is not installed', () => {
    expect(claudeStaleLinesOf('2.1.311', 'not installed')).toEqual([
      `The recording of ${CLAUDE_BOUNDARY} on darwin is stale: it is stamped claude 2.1.311, and claude not installed is installed. `
      + `Record it again with \`bun run record ${CLAUDE_BOUNDARY}\`.`,
    ]);
  });

  test.each([
    ['boundary', { boundary: OS_BOUNDARY }],
    ['OS', { os: 'linux' }],
    ['system', { system: 'bun' as const }],
  ])('stamped for another %s is stale', (_field, stamp) => {
    const [line] = reportOf({ [GIT_FILE]: recordingText(stamp) }).staleLines;
    expect(line).toContain(`not for ${GIT_BOUNDARY} on darwin with git.`);
    expect(line).toContain(`Record it again with ${RECORD_GIT}.`);
  });

  test.each(['not json', '{}', '{"stamp":{"boundary":"x"}}'])('with no readable stamp is stale: %s', (text) => {
    expect(reportOf({ [GIT_FILE]: text }).staleLines).toEqual([
      `src/testing/recordings/darwin/${GIT_FILE} has no readable stamp. Record it again with ${RECORD_GIT}.`,
    ]);
  });

  test('of no boundary is named', () => {
    expect(reportOf({ 'src__Gone.ts.json': recordingText({}) }).staleLines).toEqual([
      'src__Gone.ts.json of darwin records no boundary of BOUNDARY_SPECS: remove it.',
    ]);
  });
});

describe('a boundary with no recording for this OS', () => {
  test('is listed as not finished, with its record command, and is not stale', () => {
    const report = reportOf({ [GIT_FILE]: recordingText({}) });
    expect(report.unfinishedLines).toEqual([
      `${OS_BOUNDARY} is not finished for darwin: it has no recording. Record it with \`bun run record ${OS_BOUNDARY}\`.`,
    ]);
    expect(report.staleLines).toEqual([]);
  });

  test('is never asked for an installed version', () => {
    const input: RecordingStampInput = {
      boundaries:         [GIT_BOUNDARY],
      systemOf:           { [GIT_BOUNDARY]: 'git' },
      os:                 'darwin',
      recordingTexts:     new Map(),
      installedVersionOf: () => { throw new Error('asked for an installed version'); },
    };
    expect(recordingStampReportOf(input).unfinishedLines).toHaveLength(1);
  });
});

describe('the systems of the boundaries', () => {
  test('every boundary of BOUNDARY_SPECS names its system, and every named boundary is listed', () => {
    const listed = BOUNDARY_SPECS.map(({ boundary }) => boundary).sort();
    expect(Object.keys(SYSTEM_OF_BOUNDARY).sort()).toEqual(listed);
  });

  test('no two boundaries share a recording file', () => {
    const fileNames = BOUNDARY_SPECS.map(({ boundary }) => recordingFileNameOf(boundary));
    expect(new Set(fileNames).size).toBe(fileNames.length);
  });
});
