/**
 * One contract for the `ShellLine` port: a line stays one argument, an exit reads the same however it was made, and a line that never ran
 * never reads as passed. The POSIX adapter also runs a real line, joined output included; the platform without an adapter refuses. The
 * display line, which an agent reads and nothing spawns, is each grammar's own: POSIX joins with `&&`, no grammar puts a step on each line.
 */
import { expect, test } from 'bun:test';

import { type PortClause, runPortContract } from '../../testing/PortContract.ts';
import { createPosixShellLine }             from './PosixShellLine.ts';
import type { ShellLine }                   from './ShellLine.ts';
import { shellLineFor }                     from './ShellLineFor.ts';

const CLAUSES: readonly PortClause<ShellLine>[] = [
  {
    claim: 'hands the line over as its last argument, whatever it holds',
    check: (shellLine) => {
      const line = 'it\'s "quoted" && $HOME';
      expect(shellLine.spawnRequestOf(line).argv.at(-1)).toBe(line);
    },
  },
  {
    claim: 'reads exit 0 as passed, another exit as failed, and a signal or a shell that could not run the line as cannot-run',
    check: (shellLine) => {
      expect(shellLine.exitMeaningOf({ exitCode: 0, signalCode: null })).toBe('passed');
      expect(shellLine.exitMeaningOf({ exitCode: 1, signalCode: null })).toBe('failed');
      expect(shellLine.exitMeaningOf({ exitCode: 126, signalCode: null })).toBe('cannot-run');
      expect(shellLine.exitMeaningOf({ exitCode: 127, signalCode: null })).toBe('cannot-run');
      expect(shellLine.exitMeaningOf({ exitCode: null, signalCode: 'SIGTERM' })).toBe('cannot-run');
    },
  },
  {
    claim: 'names its grammar, and leaves the working directory to the spawn',
    check: (shellLine) => {
      expect(shellLine.lineGrammar).toBe('posix-shell');
      expect(shellLine.spawnRequestOf('true').workingDirectory).toBe('spawn-option');
    },
  },
];

runPortContract('ShellLine', [
  { name: 'PosixShellLine on an injected shell', build: () => createPosixShellLine({ userShell: () => '/bin/example-shell' }) },
  { name: 'the native adapter', build: () => shellLineFor('darwin', { userShell: () => undefined }) },
], CLAUSES);

test('a real line runs, standard error joined onto standard output in order', () => {
  const { argv } = shellLineFor('darwin', { userShell: () => undefined }).spawnRequestOf('echo first; echo second >&2; echo third');
  expect(Bun.spawnSync({ cmd: [...argv] }).stdout.toString()).toBe('first\nsecond\nthird\n');
});

test('the POSIX display line: no steps always passes, one step reads as written, a folder is a quoted cd, and steps join to stop at the first failure', () => {
  const posixShellLine = shellLineFor('darwin', { userShell: () => undefined });

  expect(posixShellLine.displayLineOf([])).toBe('true');
  expect(posixShellLine.displayLineOf([{ line: 'bun test', workingDirectory: null }])).toBe('bun test');
  expect(posixShellLine.displayLineOf([{ line: 'bun test', workingDirectory: 'it\'s here' }])).toBe('cd \'it\'\\\'\'s here\' && (bun test)');
  expect(posixShellLine.displayLineOf([
    { line: 'bun test', workingDirectory: 'service' },
    { line: 'bun run lint', workingDirectory: null },
  ])).toBe('(cd \'service\' && (bun test)) && (bun run lint)');
});

test('a platform with no adapter displays each step on its own line, its folder named beside it', () => {
  const shellLine = shellLineFor('win32', { userShell: () => undefined });

  expect(shellLine.displayLineOf([
    { line: 'bun test', workingDirectory: 'service' },
    { line: 'bun run lint', workingDirectory: null },
  ])).toBe('bun test    (in service)\nbun run lint');
});

test('a platform with no adapter refuses a spawn and never reads a line as passed', () => {
  const shellLine = shellLineFor('win32', { userShell: () => undefined });
  expect(() => shellLine.spawnRequestOf('true')).toThrow('win32');
  expect(shellLine.exitMeaningOf({ exitCode: 0, signalCode: null })).toBe('cannot-run');
});
