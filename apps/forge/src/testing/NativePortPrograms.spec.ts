/**
 * What matters: a default spec that starts a program of the native process-identity or gate-confinement adapter is caught in both
 * `Bun.spawn` forms, an argv and a `cmd` option, by the path the adapter names or, for one it looks up, by the name of the resolved path;
 * any other program, a program of another platform and a real-system spec are not judged. Each form is planted here.
 */
import { describe, expect, test } from 'bun:test';

import { SANDBOX_EXEC_PATH }                                      from '../lib/gate-confinement/DarwinSeatbelt.ts';
import { BUBBLEWRAP_EXECUTABLE_NAME }                             from '../lib/gate-confinement/LinuxBubblewrap.ts';
import { PROCESS_STATUS_PATH, SYSTEM_CONTROL_PATH }               from '../lib/process-identity/DarwinProcessIdentity.ts';
import { nativePortProgramOf, specIsJudgedForNativePortPrograms } from './NativePortPrograms.ts';

const RESOLVED_BUBBLEWRAP_PATH = `/usr/bin/${BUBBLEWRAP_EXECUTABLE_NAME}`;

describe('the native port programs of a platform', () => {
  test.each([PROCESS_STATUS_PATH, SYSTEM_CONTROL_PATH, SANDBOX_EXEC_PATH])('on darwin, %s is caught as an argv and as a cmd option', (program) => {
    expect(nativePortProgramOf([[program, '-example']], 'darwin')).toBe(program);
    expect(nativePortProgramOf([{ cmd: [program, '-example'], stdout: 'pipe' }], 'darwin')).toBe(program);
  });

  test('on linux, bubblewrap is caught by the name of the path it resolved to', () => {
    expect(nativePortProgramOf([[RESOLVED_BUBBLEWRAP_PATH, '--version']], 'linux')).toBe(BUBBLEWRAP_EXECUTABLE_NAME);
  });

  test('a program no native port starts, a program of another platform and a platform with no list are not caught', () => {
    expect(nativePortProgramOf([['/usr/bin/pgrep', '-a']], 'darwin')).toBeNull();
    expect(nativePortProgramOf([[RESOLVED_BUBBLEWRAP_PATH, '--version']], 'darwin')).toBeNull();
    expect(nativePortProgramOf([[PROCESS_STATUS_PATH, '-o', 'lstart=']], 'linux')).toBeNull();
    expect(nativePortProgramOf([[PROCESS_STATUS_PATH]], 'example-platform')).toBeNull();
  });

  test('a spawn whose command is no list of strings is not caught', () => {
    expect(nativePortProgramOf([], 'darwin')).toBeNull();
    expect(nativePortProgramOf([{ stdout: 'pipe' }], 'darwin')).toBeNull();
    expect(nativePortProgramOf([[1, PROCESS_STATUS_PATH]], 'darwin')).toBeNull();
  });
});

describe('the specs judged', () => {
  test('a default spec is judged, and a real-system spec, which records these programs, is not', () => {
    expect(specIsJudgedForNativePortPrograms('/example/cli/Example.spec.ts')).toBe(true);
    expect(specIsJudgedForNativePortPrograms('/example/src/lib/process-identity/ProcessIdentity.integration.spec.ts')).toBe(false);
  });
});
