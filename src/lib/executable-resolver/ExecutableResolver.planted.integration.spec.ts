/**
 * A program planted in a worktree never answers for its name. On this machine each case is a child process with its own PATH, so nothing is
 * remembered from one PATH to the next, and its working directory in the worktree. The Windows cases run over a fake filesystem table whose
 * lookup has Bun's extension order and PATH-only reach; the `spawn's own lookup` mutant shows what the table would answer with the worktree first.
 */
import {
  chmodSync,
  mkdirSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import { jsonPrintedByAChildProcess }                              from '../../testing/JsonPrintedByAChildProcess.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { createWindowsExecutableResolver }                         from './WindowsExecutableResolver.ts';

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function plantedProgramAt(folder: string, name: string): string {
  mkdirSync(folder, { recursive: true });
  const path = join(folder, name);
  writeFileSync(path, '#!/bin/sh\n');
  chmodSync(path, 0o755);
  return path;
}

interface ScratchMachine {
  worktree:    string;
  installedIn: string;
}

function scratchMachine(): ScratchMachine {
  const scratch = createCanonicalScratchDirectory('executable-resolver-planted');
  scratchDirectories.push(scratch);
  const worktree = join(scratch, 'repository', '.claude', 'worktrees', 'ticket-1');
  const installedIn = join(scratch, 'installed', 'bin');
  for (const name of ['git', 'claude']) {
    plantedProgramAt(worktree, name);
    plantedProgramAt(installedIn, name);
  }
  return { worktree, installedIn };
}

function nativeAnswer(searchPath: string, workingDirectory: string, name: string, forbiddenRoot: string): unknown {
  const resolverModule = JSON.stringify(join(import.meta.dir, 'ExecutableResolverFor.ts'));
  return jsonPrintedByAChildProcess({ PATH: searchPath }, [
    `process.chdir(${JSON.stringify(workingDirectory)});`,
    `const { executableResolverFor } = await import(${resolverModule});`,
    `console.log(JSON.stringify(executableResolverFor(process.platform).absolutePathOf(${JSON.stringify(name)}, [${JSON.stringify(forbiddenRoot)}])));`,
  ].join('\n'));
}

describe('on this machine, with a program planted in the worktree', () => {
  test('git and claude answer their PATH location, not the working directory', () => {
    const { worktree, installedIn } = scratchMachine();
    for (const name of ['git', 'claude']) {
      expect(nativeAnswer(installedIn, worktree, name, worktree)).toEqual({ verdict: 'found', path: join(installedIn, name) });
    }
  });

  test('a program only in the working directory is not found', () => {
    const { worktree } = scratchMachine();
    expect(nativeAnswer('/nonexistent-example-folder', worktree, 'git', worktree)).toMatchObject({ verdict: 'refused', cause: 'not-on-search-path' });
  });

  test('a relative search folder reaches nothing in the working directory', () => {
    const { worktree } = scratchMachine();
    plantedProgramAt(join(worktree, 'tools'), 'git');
    for (const relativeFolder of ['.', './', '', 'tools']) {
      expect(nativeAnswer(relativeFolder, worktree, 'git', '/nonexistent-example-root')).toMatchObject({ verdict: 'refused' });
    }
  });

  test('a PATH folder inside the repository root is refused, and so is a link on PATH into it', () => {
    const { worktree, installedIn } = scratchMachine();
    expect(nativeAnswer(worktree, worktree, 'claude', worktree)).toMatchObject({ verdict: 'refused', cause: 'inside-forbidden-root' });
    const linkFolder = join(installedIn, 'links');
    mkdirSync(linkFolder);
    symlinkSync(join(worktree, 'claude'), join(linkFolder, 'claude'));
    expect(nativeAnswer(linkFolder, worktree, 'claude', worktree)).toMatchObject({ verdict: 'refused', cause: 'inside-forbidden-root' });
  });
});

const WINDOWS_WORKTREE = 'C:\\repository\\.claude\\worktrees\\ticket-1';
const WINDOWS_GIT_FOLDER = 'C:\\Program Files\\Git\\cmd';
const WINDOWS_NATIVE_FOLDER = 'C:\\Users\\example\\.local\\bin';
const WINDOWS_NPM_FOLDER = 'C:\\Users\\example\\AppData\\Roaming\\npm';
const WINDOWS_EXTENSIONS = ['.exe', '.cmd', '.bat', '.com'];

const WINDOWS_FILES: ReadonlySet<string> = new Set([
  `${WINDOWS_WORKTREE}\\git.cmd`,
  `${WINDOWS_WORKTREE}\\git.exe`,
  `${WINDOWS_WORKTREE}\\claude.cmd`,
  `${WINDOWS_WORKTREE}\\claude.exe`,
  `${WINDOWS_GIT_FOLDER}\\git.exe`,
  `${WINDOWS_NATIVE_FOLDER}\\claude.exe`,
  `${WINDOWS_NPM_FOLDER}\\claude.cmd`,
  `${WINDOWS_NPM_FOLDER}\\CLAUDE-UPPER.CMD`,
]);

function windowsResolverOn(searchFolders: readonly string[]): ReturnType<typeof createWindowsExecutableResolver> {
  const lookUp = (name: string): string | null => {
    for (const folder of searchFolders) {
      for (const extension of WINDOWS_EXTENSIONS) {
        const candidates = [`${folder}\\${name}${extension}`, `${folder}\\${name.toUpperCase()}${extension.toUpperCase()}`];
        const hit = candidates.find((candidate) => WINDOWS_FILES.has(candidate));
        if (hit !== undefined) return hit;
      }
    }
    return null;
  };
  return createWindowsExecutableResolver({ lookUp, realPathOf: (path) => path });
}

describe('the Windows adapter over a fake filesystem table', () => {
  test('git and claude answer their PATH location past the copies planted in the worktree', () => {
    const resolver = windowsResolverOn([WINDOWS_GIT_FOLDER, WINDOWS_NATIVE_FOLDER]);
    expect(resolver.absolutePathOf('git', [WINDOWS_WORKTREE])).toEqual({ verdict: 'found', path: `${WINDOWS_GIT_FOLDER}\\git.exe` });
    expect(resolver.absolutePathOf('claude', [WINDOWS_WORKTREE])).toEqual({ verdict: 'found', path: `${WINDOWS_NATIVE_FOLDER}\\claude.exe` });
  });

  test('the spawn\'s own lookup, the worktree searched first, is what the forbidden root refuses', () => {
    const resolver = windowsResolverOn([WINDOWS_WORKTREE, WINDOWS_GIT_FOLDER]);
    expect(resolver.absolutePathOf('git', ['C:\\REPOSITORY'])).toMatchObject({ verdict: 'refused', cause: 'inside-forbidden-root' });
  });

  test('a .cmd or .bat target is refused as a batch target in any case of its suffix, and a planted one as inside the root', () => {
    const resolver = windowsResolverOn([WINDOWS_NPM_FOLDER, WINDOWS_NATIVE_FOLDER]);
    expect(resolver.absolutePathOf('claude', [WINDOWS_WORKTREE])).toMatchObject({ verdict: 'refused', cause: 'batch-target' });
    expect(resolver.absolutePathOf('claude-upper', [WINDOWS_WORKTREE])).toMatchObject({ verdict: 'refused', cause: 'batch-target' });
    expect(windowsResolverOn([WINDOWS_WORKTREE]).absolutePathOf('claude', [WINDOWS_WORKTREE])).toMatchObject({ verdict: 'refused', cause: 'inside-forbidden-root' });
  });
});
