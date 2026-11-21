/**
 * The code version over a planted program root. What matters: an edit to any shipping file moves the version, `resources/` and
 * `talos.ts` included, since the new-code check hands a live Overseer to the code on disk only when it moves; a spec edit
 * leaves it unchanged, so a test-only change never reads as new code. Inside a Bun workspace, an edit to a workspace package the program
 * depends on, or to its own part of the root `bun.lock`, moves it too, while a package, tool folder or lockfile entry that only another
 * member uses does not: another app's dependency must not read as new forge code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { CodeVersion }                                    from './CodeVersion.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

const PLANTED_FILES = [
  'agent-progress.ts',
  'talos.ts',
  'package.json',
  'resources/prompts/BuildPrompt.md',
  'cli/Main.ts',
  'cli/Main.spec.ts',
  'src/services/overseer/CodeVersion.ts',
];

function plantFile(programRoot: string, relativePath: string, contents: string): void {
  const filePath = join(programRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function plantedProgramRoot(): string {
  const programRoot = createScratchDirectory('code-version');
  scratchDirectories.push(programRoot);
  for (const relativePath of PLANTED_FILES) plantFile(programRoot, relativePath, `original ${relativePath}\n`);
  return programRoot;
}

const PLANTED_WORKSPACE_MANIFEST = JSON.stringify({ name: 'example-workspace', workspaces: ['apps/*', 'packages/*'] });

function plantedLockfile(exampleLibraryVersion: string, otherAppLibraryVersion: string): string {
  return JSON.stringify({
    lockfileVersion: 1,
    workspaces:      {
      '':                         { name: 'example-workspace' },
      'apps/forge':               { name: 'forge', dependencies: { 'example-package': 'workspace:^', 'example-library': exampleLibraryVersion } },
      'apps/other-app':           { name: 'other-app', dependencies: { 'other-app-library': otherAppLibraryVersion } },
      'packages/example-package': { name: 'example-package' },
    },
    packages: {
      'example-package':   ['example-package@workspace:packages/example-package'],
      'example-library':   [`example-library@${exampleLibraryVersion}`, '', {}, 'sha512-example'],
      'other-app-library': [`other-app-library@${otherAppLibraryVersion}`, '', {}, 'sha512-example'],
    },
  });
}

/** A workspace with forge at `apps/forge`, a package it depends on, and another app with a package and a dependency of its own. */
function plantedWorkspace(): { readonly workspaceRoot: string; readonly programRoot: string } {
  const workspaceRoot = createScratchDirectory('code-version-workspace');
  scratchDirectories.push(workspaceRoot);
  const programRoot = join(workspaceRoot, 'apps', 'forge');
  for (const relativePath of PLANTED_FILES) plantFile(programRoot, relativePath, `original ${relativePath}\n`);
  plantFile(workspaceRoot, 'package.json', PLANTED_WORKSPACE_MANIFEST);
  plantFile(workspaceRoot, 'bun.lock', plantedLockfile('1.0.0', '1.0.0'));
  plantFile(workspaceRoot, 'packages/example-package/atoms/Button.tsx', 'original button\n');
  plantFile(workspaceRoot, 'packages/example-package/atoms/Button.spec.ts', 'original button spec\n');
  plantFile(workspaceRoot, 'packages/example-package/atoms/Button.stories.tsx', 'original button stories\n');
  plantFile(workspaceRoot, 'packages/example-package/.storybook/main.ts', 'original storybook configuration\n');
  plantFile(workspaceRoot, 'packages/other-package/Other.ts', 'original other package\n');
  return { workspaceRoot, programRoot };
}

describe('CodeVersion.codeVersionOf', () => {
  test('an unchanged program root reads the same version twice', () => {
    const programRoot = plantedProgramRoot();
    expect(CodeVersion.codeVersionOf(programRoot)).toBe(CodeVersion.codeVersionOf(programRoot));
  });

  test.each([
    ['a resources/ edit', 'resources/prompts/BuildPrompt.md'],
    ['a new cli/ file', 'cli/overseer/NewCommand.ts'],
    ['a talos.ts edit', 'talos.ts'],
    ['an agent-progress.ts edit', 'agent-progress.ts'],
    ['a cli/ edit', 'cli/Main.ts'],
  ])('%s moves the version', (_editName, relativePath) => {
    const programRoot   = plantedProgramRoot();
    const versionBefore = CodeVersion.codeVersionOf(programRoot);
    plantFile(programRoot, relativePath, 'edited\n');
    expect(CodeVersion.codeVersionOf(programRoot)).not.toBe(versionBefore);
  });

  test('a spec edit under cli/ leaves the version unchanged', () => {
    const programRoot   = plantedProgramRoot();
    const versionBefore = CodeVersion.codeVersionOf(programRoot);
    plantFile(programRoot, 'cli/Main.spec.ts', 'edited\n');
    expect(CodeVersion.codeVersionOf(programRoot)).toBe(versionBefore);
  });
});

describe('CodeVersion.codeVersionOf inside a Bun workspace', () => {
  test.each([
    ['an edit to a workspace package the program depends on', 'packages/example-package/atoms/Button.tsx', 'edited\n'],
    ['a change to a lockfile entry the program reaches', 'bun.lock', plantedLockfile('2.0.0', '1.0.0')],
  ])('%s moves the version', (_editName, relativePath, contents) => {
    const { workspaceRoot, programRoot } = plantedWorkspace();
    const versionBefore = CodeVersion.codeVersionOf(programRoot);
    plantFile(workspaceRoot, relativePath, contents);
    expect(CodeVersion.codeVersionOf(programRoot)).not.toBe(versionBefore);
  });

  test.each([
    ['a spec edit in a package the program depends on', 'packages/example-package/atoms/Button.spec.ts', 'edited\n'],
    ['a story edit in a package the program depends on', 'packages/example-package/atoms/Button.stories.tsx', 'edited\n'],
    ['an edit to a package\'s tool folder', 'packages/example-package/.storybook/main.ts', 'edited\n'],
    ['an edit to a package the program does not depend on', 'packages/other-package/Other.ts', 'edited\n'],
    ['a change to a lockfile entry only another app reaches', 'bun.lock', plantedLockfile('1.0.0', '2.0.0')],
  ])('%s leaves the version unchanged', (_editName, relativePath, contents) => {
    const { workspaceRoot, programRoot } = plantedWorkspace();
    const versionBefore = CodeVersion.codeVersionOf(programRoot);
    plantFile(workspaceRoot, relativePath, contents);
    expect(CodeVersion.codeVersionOf(programRoot)).toBe(versionBefore);
  });
});
