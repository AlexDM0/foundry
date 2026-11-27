/**
 * The Windows adapter, held on this machine by its tables, since no cmd.exe runs here. What matters: the interpreter is an absolute path or
 * no spawn at all; the line reaches cmd.exe unquoted inside one `/s /c` argument with the status trailer; every status the trailer could
 * write reads truthfully, and a status it never wrote never passes; and a cmd line grants the executables cmd would run, no more.
 */
import { describe, expect, test } from 'bun:test';

import { spawningShellRequestOf }                                                               from '../../testing/SpawningShellRequest.ts';
import type { ShellExitReport }                                                                 from './ShellLine.ts';
import { shellLineFor }                                                                         from './ShellLineFor.ts';
import { COMMAND_LINE_LIMIT_CHARACTERS, createWindowsCommandLine, WINDOWS_LINE_STATUS_TRAILER } from './WindowsCommandLine.ts';

const COMMAND_INTERPRETER = 'C:\\Windows\\system32\\cmd.exe';
const STATUS_FILE = 'C:\\Example\\repository\\.example-data\\jobs\\J1\\gate-1-line-status';

function windowsShellLine(commandInterpreter: string | undefined = COMMAND_INTERPRETER, systemRoot: string | undefined = 'C:\\Windows') {
  return createWindowsCommandLine({ commandInterpreter: () => commandInterpreter, systemRoot: () => systemRoot });
}

describe('the spawn request', () => {
  test('runs the line in cmd.exe at the absolute ComSpec, verbatim, standard error joined, the status trailer after it, in the spawn\'s folder', () => {
    expect(windowsShellLine().spawnRequestOf('npm test', STATUS_FILE)).toEqual({
      verdict:           'spawns',
      argv:              [COMMAND_INTERPRETER, '/d', '/s', '/c', `"(npm test) 2>&1 & ${WINDOWS_LINE_STATUS_TRAILER}"${STATUS_FILE}""`],
      workingDirectory:  'spawn-option',
      verbatimArguments: true,
    });
    expect(WINDOWS_LINE_STATUS_TRAILER).toBe('call echo %^errorlevel%>');
  });

  test.each([
    ['a bare ComSpec name falls back to SystemRoot', 'cmd.exe', 'C:\\Windows', 'C:\\Windows\\System32\\cmd.exe'],
    ['a ComSpec with no drive falls back to SystemRoot', '\\Windows\\cmd.exe', 'D:\\Windows', 'D:\\Windows\\System32\\cmd.exe'],
    ['an unset ComSpec falls back to SystemRoot', undefined, 'C:\\Windows', 'C:\\Windows\\System32\\cmd.exe'],
  ])('%s', (_case, commandInterpreter, systemRoot, interpreter) => {
    const shellLine = createWindowsCommandLine({ commandInterpreter: () => commandInterpreter, systemRoot: () => systemRoot });
    expect(spawningShellRequestOf(shellLine, 'npm test', STATUS_FILE).argv[0]).toBe(interpreter);
  });

  test('with no absolute interpreter every folder and spawn is refused', () => {
    const shellLine = windowsShellLine('cmd.exe', 'Windows');
    expect(shellLine.runRefusalOf('C:\\Example\\repository')).toBe('no-absolute-interpreter');
    expect(shellLine.spawnRequestOf('npm test', STATUS_FILE)).toEqual({ verdict: 'refused', refusal: 'no-absolute-interpreter' });
  });

  test('refuses a network share folder, in either slash, since cmd.exe runs a line there in the Windows folder', () => {
    expect(windowsShellLine().runRefusalOf('\\\\example-server\\share\\repository')).toBe('network-share-folder');
    expect(windowsShellLine().runRefusalOf('//example-server/share/repository')).toBe('network-share-folder');
    expect(windowsShellLine().runRefusalOf('C:\\Example\\repository')).toBeNull();
  });

  test('names its grammar, limits a stored line to cmd.exe\'s 8191 characters, and is the win32 adapter', () => {
    const shellLine = shellLineFor('win32', { userShell: () => undefined, commandInterpreter: () => COMMAND_INTERPRETER, systemRoot: () => undefined });
    expect(shellLine.lineGrammar).toBe('windows-cmd');
    expect(shellLine.lineLimitCharacters).toBe(COMMAND_LINE_LIMIT_CHARACTERS);
    expect(COMMAND_LINE_LIMIT_CHARACTERS).toBe(8191);
  });
});

describe('the exit meaning', () => {
  const meaningOf = (report: Partial<ShellExitReport>) => windowsShellLine().exitMeaningOf({
    exitCode: 0, signalCode: null, recordedStatus: null, ...report
  });

  test.each([
    ['0 passes', '0\r\n', 0, 'passed'],
    ['1 fails', '1\r\n', 1, 'failed'],
    ['256 fails, though Bun keeps only its low byte 0', '256\r\n', 0, 'failed'],
    ['9009, cmd\'s command not found, cannot run, though its low byte is 49', '9009\r\n', 49, 'cannot-run'],
    ['3221225477, an access violation, cannot run', '3221225477\r\n', 5, 'cannot-run'],
    ['-1073741819, the same access violation as cmd prints it signed, cannot run', '-1073741819\r\n', 5, 'cannot-run'],
    ['a status that is no number reads as missing: with exit 0 it cannot run', 'ECHO is on.\r\n', 0, 'cannot-run'],
  ] as const)('a recorded status of %s', (_case, recordedStatus, exitCode, meaning) => {
    expect(meaningOf({ recordedStatus, exitCode })).toBe(meaning);
  });

  test('a missing status never passes: process exit 0 cannot run, another exit fails, and no exit cannot run', () => {
    expect(meaningOf({ recordedStatus: null, exitCode: 0 })).toBe('cannot-run');
    expect(meaningOf({ recordedStatus: null, exitCode: 1 })).toBe('failed');
    expect(meaningOf({ recordedStatus: '0', exitCode: null })).toBe('cannot-run');
  });
});

describe('the executables a cmd line grants', () => {
  const executablesOf = (line: string) => windowsShellLine().executablesOf(line);

  test('a & b grants both, as do &&, || and |', () => {
    expect(executablesOf('npm test & npx tsc')).toEqual(['npm', 'npx']);
    expect(executablesOf('npm ci && npm test || type log.txt | findstr error')).toEqual(['npm', 'npm', 'type', 'findstr']);
  });

  test('grants neither word after a caret-escaped or quoted &, nor after a redirection\'s &', () => {
    expect(executablesOf('echo a ^& b')).toEqual(['echo']);
    expect(executablesOf('echo "a & b"')).toEqual(['echo']);
    expect(executablesOf('npm test 2>&1')).toEqual(['npm']);
  });

  test('reads a single quote as text and grants no assignment skip, as cmd does', () => {
    expect(executablesOf('echo \'a & b\'')).toEqual(['echo', 'b\'']);
    expect(executablesOf('CI=1 npm test')).toEqual(['CI=1']);
  });

  test('reads a parenthesis as a group only where a command starts, so echo a) b grants echo alone', () => {
    expect(executablesOf('echo a) b')).toEqual(['echo']);
    expect(executablesOf('(cd service && npm test)')).toEqual(['cd', 'npm']);
  });
});

test('the display line: one step as written, a folder pushed and popped, steps joined to stop at the first failure, no steps a no-op', () => {
  const shellLine = windowsShellLine();
  expect(shellLine.displayLineOf([])).toBe('cd .');
  expect(shellLine.displayLineOf([{ line: 'npm test', workingDirectory: null }])).toBe('npm test');
  expect(shellLine.displayLineOf([
    { line: 'npm test', workingDirectory: 'service' },
    { line: 'npm run lint', workingDirectory: null },
  ])).toBe('(pushd "service" && (npm test) && popd) && (npm run lint)');
});
