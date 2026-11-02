/**
 * `init` and `oversee` below the git floor, through the real binary with a fake git first on its PATH, since no spec may set the environment
 * in-process. What matters: each refuses with exit 1 and words the floor and the version found, before it writes anything, and a git at the
 * floor lets `init` through.
 */
import {
  chmodSync,
  existsSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { PRODUCT_NAMES }                                                              from '../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                                    from '../src/testing/ChildProcessCaseTimeout.ts';
import { createScratchDirectory, createScratchGitRepository, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent }                                                   from '../src/testing/ToolGuard.ts';
import { runAgentProgress }                                                           from './testing/CliProcess.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

/** A PATH whose `git` prints `printedVersion` for `git version` and hands every other call to the real git. */
function searchPathWithAGitPrinting(printedVersion: string): string {
  const folder = createScratchDirectory('git-version-floor-fake');
  scratchDirectories.push(folder);
  const realGit = Bun.which('git') ?? 'git';
  const fakeGit = join(folder, 'git');
  // The tool's own `-c` pairs come first, so the verb is the last argument.
  const script = [
    '#!/bin/sh',
    'for argument; do last="$argument"; done',
    `if [ "$last" = version ]; then echo "${printedVersion}"; exit 0; fi`,
    `exec "${realGit}" "$@"`,
  ];
  writeFileSync(fakeGit, `${script.join('\n')}\n`);
  chmodSync(fakeGit, 0o755);
  return [folder, dirname(process.execPath)].join(delimiter);
}

function scratchRepository(): string {
  const repositoryDirectory = realpathSync(createScratchGitRepository('git-version-floor'));
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

describeWhenGitIsPresent('the git floor', () => {
  test.each([[['init']], [['oversee', '--port', '0']]])('`%p` below git 2.38 refuses with the floor and the version found, and writes no tracker', async (commandLine) => {
    const repositoryDirectory = scratchRepository();
    const result = await runAgentProgress(commandLine, { currentDirectory: repositoryDirectory, environment: { PATH: searchPathWithAGitPrinting('git version 2.37.1') } });

    expect(result.exitCode).toBe(1);
    expect(result.standardError).toContain('needs git 2.38 or newer');
    expect(result.standardError).toContain('2.37.1');
    expect(existsSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER))).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('`init` at git 2.38.0 is let through', async () => {
    const repositoryDirectory = scratchRepository();
    const result = await runAgentProgress(['init'], { currentDirectory: repositoryDirectory, environment: { PATH: searchPathWithAGitPrinting('git version 2.38.0') } });

    expect(result.standardError).toBe('');
    expect(result.exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
