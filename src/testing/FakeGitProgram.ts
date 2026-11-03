/**
 * A `git` program that answers from the fake of `src/testing/FakeGit.ts`, for the processes a spec's Watchers start: a fake agent's shell
 * step, a gate, the target merge. Put first on their `PATH`, or named as the resolved git, no git process starts in them.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import type { ExecutableResolver }                               from '../lib/executable-resolver/ExecutableResolver.ts';
import type { PlatformPorts }                                    from '../lib/platform-ports/PlatformPortsFor.ts';
import { createScratchDirectory, keptAsTemplateUntilTheRunEnds } from './ScratchWorkspace.ts';

const FAKE_GIT_MODULE = join(import.meta.dir, 'FakeGit.ts');
const PROGRAM_NAME = 'git';
const EXECUTABLE_MODE = 0o755;

let programFolderOfThisRun: string | null = null;

/** One folder for the whole test run, since a Watcher child may still start git after the case that launched it ended. */
export function fakeGitProgramFolder(): string {
  if (programFolderOfThisRun !== null) return programFolderOfThisRun;
  const folder = keptAsTemplateUntilTheRunEnds(createScratchDirectory('fake-git-program'));
  const runnerPath = join(folder, 'FakeGitRunner.ts');
  writeFileSync(runnerPath, [
    `import { fakeGitProgramRun } from ${JSON.stringify(FAKE_GIT_MODULE)};`,
    'const answer = fakeGitProgramRun(process.cwd(), process.argv.slice(2), process.env);',
    'process.stdout.write(answer.standardOutput);',
    'process.stderr.write(answer.standardError);',
    'process.exitCode = answer.exitCode;',
  ].join('\n'));
  const programPath = join(folder, PROGRAM_NAME);
  writeFileSync(programPath, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(runnerPath)} "$@"\n`);
  chmodSync(programPath, EXECUTABLE_MODE);
  programFolderOfThisRun = folder;
  return folder;
}

/** `environment` with the fake `git` first on its `PATH`. */
export function withFakeGitFirstOnPath(environment: Readonly<Record<string, string>>): Record<string, string> {
  const searchPath = environment['PATH'];
  return { ...environment, PATH: searchPath === undefined || searchPath === '' ? fakeGitProgramFolder() : `${fakeGitProgramFolder()}:${searchPath}` };
}

/** `ports` whose resolver finds the fake `git`, so a git process the Overseer starts by its absolute path is the fake too. */
export function portsResolvingTheFakeGit(ports: PlatformPorts): PlatformPorts {
  const executableResolver: ExecutableResolver = {
    ...ports.executableResolver,
    absolutePathOf: (name, forbiddenRoots) => name === PROGRAM_NAME
      ? { verdict: 'found', path: join(fakeGitProgramFolder(), PROGRAM_NAME) }
      : ports.executableResolver.absolutePathOf(name, forbiddenRoots),
  };
  return { ...ports, executableResolver };
}
