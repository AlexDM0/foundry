/**
 * What matters: a default spec that starts git, or a program of the native process-identity or gate-confinement adapter, is caught in
 * both `Bun.spawn` forms, an argv and a `cmd` option, by the path the adapter names or by the name of a resolved path, and is told what
 * to reach the answers through instead; any other program, a program of another platform and a real-system spec are not judged. Each
 * form is planted here.
 */
import { describe, expect, test } from 'bun:test';

import { SANDBOX_EXEC_PATH }                                                  from '../lib/gate-confinement/DarwinSeatbelt.ts';
import { BUBBLEWRAP_EXECUTABLE_NAME }                                         from '../lib/gate-confinement/LinuxBubblewrap.ts';
import { PROCESS_STATUS_PATH, SYSTEM_CONTROL_PATH }                           from '../lib/process-identity/DarwinProcessIdentity.ts';
import { recordedBoundaryProgramOf, specIsJudgedForRecordedBoundaryPrograms } from './RecordedBoundaryPrograms.ts';

const RESOLVED_BUBBLEWRAP_PATH = `/usr/bin/${BUBBLEWRAP_EXECUTABLE_NAME}`;
const NATIVE_PORTS_RECORDING = 'src/testing/DefaultSpecPlatformPorts.ts';

describe('git', () => {
  test('is caught by name and by a resolved path, in both call forms, on every platform, and names the recorded git', () => {
    const caught = { program: 'git', recordedThrough: '`useRecordedGit` of src/testing/RecordedGit.ts' };

    expect(recordedBoundaryProgramOf([['git', 'rev-parse', '--git-common-dir']], 'darwin')).toEqual(caught);
    expect(recordedBoundaryProgramOf([{ cmd: ['/opt/homebrew/bin/git', 'version'], stdout: 'pipe' }], 'linux')).toEqual(caught);
    expect(recordedBoundaryProgramOf([['/usr/bin/git', 'status']], 'example-platform')).toEqual(caught);
  });

  test('a program whose name only contains git is not caught', () => {
    expect(recordedBoundaryProgramOf([['/usr/bin/gitk']], 'darwin')).toBeNull();
  });
});

describe('the native port programs of a platform', () => {
  test.each([PROCESS_STATUS_PATH, SYSTEM_CONTROL_PATH, SANDBOX_EXEC_PATH])('on darwin, %s is caught as an argv and as a cmd option', (program) => {
    const caught = { program, recordedThrough: NATIVE_PORTS_RECORDING };

    expect(recordedBoundaryProgramOf([[program, '-example']], 'darwin')).toEqual(caught);
    expect(recordedBoundaryProgramOf([{ cmd: [program, '-example'], stdout: 'pipe' }], 'darwin')).toEqual(caught);
  });

  test('on linux, bubblewrap is caught by the name of the path it resolved to', () => {
    const caught = { program: BUBBLEWRAP_EXECUTABLE_NAME, recordedThrough: NATIVE_PORTS_RECORDING };

    expect(recordedBoundaryProgramOf([[RESOLVED_BUBBLEWRAP_PATH, '--version']], 'linux')).toEqual(caught);
  });

  test('a program no recorded boundary starts, a program of another platform and a platform with no list are not caught', () => {
    expect(recordedBoundaryProgramOf([['/usr/bin/pgrep', '-a']], 'darwin')).toBeNull();
    expect(recordedBoundaryProgramOf([[RESOLVED_BUBBLEWRAP_PATH, '--version']], 'darwin')).toBeNull();
    expect(recordedBoundaryProgramOf([[PROCESS_STATUS_PATH, '-o', 'lstart=']], 'linux')).toBeNull();
    expect(recordedBoundaryProgramOf([[PROCESS_STATUS_PATH]], 'example-platform')).toBeNull();
  });

  test('a spawn whose command is no list of strings is not caught', () => {
    expect(recordedBoundaryProgramOf([], 'darwin')).toBeNull();
    expect(recordedBoundaryProgramOf([{ stdout: 'pipe' }], 'darwin')).toBeNull();
    expect(recordedBoundaryProgramOf([[1, PROCESS_STATUS_PATH]], 'darwin')).toBeNull();
  });
});

describe('the specs judged', () => {
  test('a default spec is judged, and a real-system spec, which records these programs, is not', () => {
    expect(specIsJudgedForRecordedBoundaryPrograms('/example/cli/Example.spec.ts')).toBe(true);
    expect(specIsJudgedForRecordedBoundaryPrograms('/example/src/lib/git/GitProcess.integration.spec.ts')).toBe(false);
  });
});
