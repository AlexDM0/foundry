/**
 * One contract for the `ShellLine` port: a line stays one argument, an exit reads the same however it was made, and a line that never ran
 * never reads as passed. The POSIX adapter also runs real lines: a pass, a failure, one that cannot run, joined output and exactly the
 * environment it is handed. The platform without an adapter refuses. The display line, which an agent reads and nothing spawns, is each
 * grammar's own: POSIX joins with `&&`, no grammar puts a step on each line.
 */
import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import { spawningShellRequestOf }           from '../../testing/SpawningShellRequest.ts';
import { createPosixShellLine }             from './PosixShellLine.ts';
import type { ShellLine }                   from './ShellLine.ts';
import { shellLineFor }                     from './ShellLineFor.ts';
import { createWindowsCommandLine }         from './WindowsCommandLine.ts';

const STATUS_FILE = '/example/line-status';
const NO_HOST_SHELLS = { userShell: () => undefined, commandInterpreter: () => undefined, systemRoot: () => undefined };

const CLAUSES: readonly PortClause<ShellLine>[] = [
  {
    claim: 'hands the line over as its last argument, whatever it holds',
    check: (shellLine) => {
      const line = 'it\'s "quoted" && $HOME';
      expect(spawningShellRequestOf(shellLine, line, STATUS_FILE).argv.at(-1)).toBe(line);
    },
  },
  {
    claim: 'reads exit 0 as passed, another exit as failed, and a signal or a shell that could not run the line as cannot-run',
    check: (shellLine) => {
      const exitOf = (exitCode: number | null, signalCode: string | null = null) => shellLine.exitMeaningOf({ exitCode, signalCode, recordedStatus: null });
      expect(exitOf(0)).toBe('passed');
      expect(exitOf(1)).toBe('failed');
      expect(exitOf(126)).toBe('cannot-run');
      expect(exitOf(127)).toBe('cannot-run');
      expect(exitOf(null, 'SIGTERM')).toBe('cannot-run');
    },
  },
  {
    claim: 'names its grammar, leaves the working directory to the spawn, refuses no folder and limits no line',
    check: (shellLine) => {
      expect(shellLine.lineGrammar).toBe('posix-shell');
      expect(spawningShellRequestOf(shellLine, 'true', STATUS_FILE).workingDirectory).toBe('spawn-option');
      expect(shellLine.runRefusalOf('//example-server/share')).toBeNull();
      expect(shellLine.lineLimitCharacters).toBeNull();
    },
  },
];

runPortContract('ShellLine', [
  { name: 'PosixShellLine on an injected shell', build: () => createPosixShellLine({ userShell: () => '/bin/example-shell' }) },
  { name: 'the native adapter', build: () => shellLineFor('darwin', NO_HOST_SHELLS) },
], CLAUSES);

const EXAMPLE_SYSTEM_ROOT = 'C:\\Windows';

/** cmd hands its line inside a wrapper that records the status, so these claims read the wrapper, never a real cmd run. */
const WINDOWS_CLAUSES: readonly PortClause<ShellLine>[] = [
  {
    claim: 'wraps the line as one verbatim argument to an absolute cmd.exe, and names its grammar and its line limit',
    check: (shellLine) => {
      const request = spawningShellRequestOf(shellLine, 'bun test && bun run lint', STATUS_FILE);
      expect(request.argv[0]).toBe('C:\\Windows\\System32\\cmd.exe');
      expect(request.argv.at(-1)).toContain('(bun test && bun run lint)');
      expect(request.verbatimArguments).toBe(true);
      expect(request.workingDirectory).toBe('spawn-option');
      expect(shellLine.lineGrammar).toBe('windows-cmd');
      expect(shellLine.lineLimitCharacters).toBeGreaterThan(0);
    },
  },
  {
    claim: 'reads the recorded status, and a line that never recorded one never reads as passed',
    check: (shellLine) => {
      expect(shellLine.exitMeaningOf({ exitCode: 0, signalCode: null, recordedStatus: '0' })).toBe('passed');
      expect(shellLine.exitMeaningOf({ exitCode: 0, signalCode: null, recordedStatus: '1' })).toBe('failed');
      expect(shellLine.exitMeaningOf({ exitCode: 0, signalCode: null, recordedStatus: '9009' })).toBe('cannot-run');
      expect(shellLine.exitMeaningOf({ exitCode: 0, signalCode: null, recordedStatus: null })).toBe('cannot-run');
      expect(shellLine.exitMeaningOf({ exitCode: null, signalCode: 'SIGTERM', recordedStatus: '0' })).toBe('cannot-run');
    },
  },
  {
    claim: 'refuses a network share folder, which cmd cannot make its working directory',
    check: (shellLine) => {
      expect(shellLine.runRefusalOf('\\\\example-server\\share')).toBe('network-share-folder');
      expect(shellLine.runRefusalOf('C:\\code\\example')).toBeNull();
    },
  },
];

runPortContract('ShellLine under cmd', [
  { name: 'WindowsCommandLine on an injected SystemRoot', build: () => createWindowsCommandLine({ commandInterpreter: () => undefined, systemRoot: () => EXAMPLE_SYSTEM_ROOT }) },
  { name: 'the win32 adapter through its selector', build: () => shellLineFor('win32', { ...NO_HOST_SHELLS, systemRoot: () => EXAMPLE_SYSTEM_ROOT }) },
], WINDOWS_CLAUSES);

const posixShellLine = shellLineFor('darwin', NO_HOST_SHELLS);

function runReal(line: string, environment: Record<string, string> = { PATH: '/usr/bin:/bin' }): { meaning: string; output: string } {
  const { argv } = spawningShellRequestOf(posixShellLine, line, STATUS_FILE);
  const run = Bun.spawnSync({ cmd: [...argv], env: environment });
  return { meaning: posixShellLine.exitMeaningOf({ exitCode: run.exitCode, signalCode: run.signalCode ?? null, recordedStatus: null }), output: run.stdout.toString() };
}

test('a real passing line reads passed, a real failing one failed, and one naming no command cannot-run', () => {
  expect(runReal('true').meaning).toBe('passed');
  expect(runReal('false').meaning).toBe('failed');
  expect(runReal('no-such-example-tool --check').meaning).toBe('cannot-run');
});

test('a real line runs, standard error joined onto standard output in order', () => {
  expect(runReal('echo first; echo second >&2; echo third').output).toBe('first\nsecond\nthird\n');
});

test('a real line sees exactly the environment the spawn is handed: the adapter adds no variable of this process', () => {
  const { output } = runReal('echo "${EXAMPLE_ONLY-unset} ${HOME-unset}"', { EXAMPLE_ONLY: 'kept', PATH: '/usr/bin:/bin' });
  expect(output).toBe('kept unset\n');
});

test('the POSIX grammar splits on its separators and grants an executable after & and a newline, never inside a redirection', () => {
  expect(posixShellLine.executablesOf('make check & ./watch.sh\nnpx tsc 2>&1 | tee log')).toEqual(['make', './watch.sh', 'npx', 'tee']);
  expect(posixShellLine.executablesOf('CI=1 make check &>log')).toEqual(['make']);
});

test('the POSIX display line: no steps always passes, one step reads as written, a folder is a quoted cd, and steps join to stop at the first failure', () => {
  expect(posixShellLine.displayLineOf([])).toBe('true');
  expect(posixShellLine.displayLineOf([{ line: 'bun test', workingDirectory: null }])).toBe('bun test');
  expect(posixShellLine.displayLineOf([{ line: 'bun test', workingDirectory: 'it\'s here' }])).toBe('cd \'it\'\\\'\'s here\' && (bun test)');
  expect(posixShellLine.displayLineOf([
    { line: 'bun test', workingDirectory: 'service' },
    { line: 'bun run lint', workingDirectory: null },
  ])).toBe('(cd \'service\' && (bun test)) && (bun run lint)');
});

test('a platform with no adapter displays each step on its own line, its folder named beside it', () => {
  const shellLine = shellLineFor('example-platform', NO_HOST_SHELLS);

  expect(shellLine.displayLineOf([
    { line: 'bun test', workingDirectory: 'service' },
    { line: 'bun run lint', workingDirectory: null },
  ])).toBe('bun test    (in service)\nbun run lint');
});

test('a platform with no adapter refuses every folder and spawn, grants no executable and never reads a line as passed', () => {
  const shellLine = shellLineFor('example-platform', NO_HOST_SHELLS);
  expect(shellLine.runRefusalOf('/example')).toBe('no-shell-grammar');
  expect(shellLine.spawnRequestOf('true', STATUS_FILE)).toEqual({ verdict: 'refused', refusal: 'no-shell-grammar' });
  expect(shellLine.executablesOf('make check')).toEqual([]);
  expect(shellLine.exitMeaningOf({ exitCode: 0, signalCode: null, recordedStatus: '0' })).toBe('cannot-run');
});
