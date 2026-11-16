/**
 * The shared read of the checkout. What matters: every guard of a run gets the same read, frozen, so no guard can plant into another's
 * input; the walk leaves out the folders git ignores, a tracker's data and ticket worktrees and turbo's cache at any depth; the program's
 * read holds every package it declares under the package's name, each with files; and a per-source answer is computed once for a shared
 * source and anew for a planted one.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { repositoryRootOfThisCheckout } from './ImportGraph.ts';
import {
  declaredWorkspacePackagesOf,
  memoisedPerSource,
  programFiles,
  programTypeScriptSources,
  repositoryFilePaths,
  repositoryTypeScriptSources,
  workspaceRootOfProgram
} from './RepositorySources.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();

describe('the shared read', () => {
  test('a second read of the sources is the first one, frozen down to each source', () => {
    const sources = repositoryTypeScriptSources(REPOSITORY_ROOT);
    expect(repositoryTypeScriptSources(REPOSITORY_ROOT)).toBe(sources);
    expect(Object.isFrozen(sources)).toBe(true);
    expect(sources.every((source) => Object.isFrozen(source))).toBe(true);
    expect(sources.map(({ path }) => path)).toContain('src/testing/RepositorySources.ts');
  });

  test('a second read of the file paths is the first one, frozen', () => {
    const filePaths = repositoryFilePaths(REPOSITORY_ROOT);
    expect(repositoryFilePaths(REPOSITORY_ROOT)).toBe(filePaths);
    expect(Object.isFrozen(filePaths)).toBe(true);
    expect(filePaths).toContain('package.json');
  });

  test('neither read reaches a dependency or a git-ignored folder', () => {
    const paths = [...repositoryTypeScriptSources(REPOSITORY_ROOT).map(({ path }) => path), ...repositoryFilePaths(REPOSITORY_ROOT)];
    expect(paths.filter((path) => ['node_modules/', '.git/', '.agent-progress/', '.claude/worktrees/'].some((folder) => path.startsWith(folder)))).toEqual([]);
  });
});

describe('the walk past what no checkout tracks', () => {
  let scratchFolder = '';

  afterEach(() => {
    if (scratchFolder !== '') removeScratchDirectory(scratchFolder);
    scratchFolder = '';
  });

  test('leaves out a tracker\'s data, its ticket worktrees, turbo\'s cache and a build at any depth, and keeps the source beside them', () => {
    scratchFolder = createScratchDirectory('repository-sources-walk');
    const plantedPaths = [
      'src/Kept.ts',
      '.forge/tickets/Planted.ts',
      '.forge-worktrees/T1/src/Planted.ts',
      'apps/example/.forge-worktrees/T2/src/Planted.ts',
      '.turbo/cache/Planted.ts',
      'packages/example/.turbo/Planted.ts',
      'packages/example/storybook-static/Planted.ts',
      'packages/example/node_modules/dependency/Planted.ts',
      'packages/example/tsconfig.tsbuildinfo',
    ];
    for (const path of plantedPaths) {
      mkdirSync(join(scratchFolder, path, '..'), { recursive: true });
      writeFileSync(join(scratchFolder, path), 'export {};\n');
    }
    expect(repositoryTypeScriptSources(scratchFolder).map(({ path }) => path)).toEqual(['src/Kept.ts']);
    expect(repositoryFilePaths(scratchFolder)).toEqual(['src/Kept.ts']);
  });
});

describe('the program and the packages it declares', () => {
  const packageNames = declaredWorkspacePackagesOf(REPOSITORY_ROOT).map(({ name }) => name);

  test('the program declares the brand, design-system, Flint, forge-contracts and system-versions packages, each found in its own folder', () => {
    expect(packageNames).toEqual(['brand', 'design-system', 'flint', 'forge-contracts', 'system-versions']);
    const workspaceRoot = workspaceRootOfProgram(REPOSITORY_ROOT);
    expect(declaredWorkspacePackagesOf(REPOSITORY_ROOT).map(({ folder }) => folder))
      .toEqual(packageNames.map((name) => join(workspaceRoot, 'packages', name)));
  });

  test('the sources hold the program\'s own and each package\'s, under the package\'s name', () => {
    const paths = programTypeScriptSources(REPOSITORY_ROOT).map(({ path }) => path);
    expect(paths).toContain('src/testing/RepositorySources.ts');
    for (const name of packageNames) expect(paths.filter((path) => path.startsWith(`${name}/`)).length, name).toBeGreaterThan(0);
    expect(paths).toEqual(expect.arrayContaining(['design-system/atoms/Button.tsx', 'flint/SpriteMind.ts']));
  });

  test('the files hold each package\'s, read from the package\'s real folder', () => {
    const files = programFiles(REPOSITORY_ROOT);
    for (const name of packageNames) expect(files.filter(({ path }) => path.startsWith(`${name}/`)).length, name).toBeGreaterThan(0);
    const constitution = files.find(({ path }) => path === 'design-system/CONSTITUTION.md');
    expect(constitution?.location.endsWith('/packages/design-system/CONSTITUTION.md')).toBe(true);
  });

  test('both reads are frozen and answered once', () => {
    expect(programTypeScriptSources(REPOSITORY_ROOT)).toBe(programTypeScriptSources(REPOSITORY_ROOT));
    expect(programFiles(REPOSITORY_ROOT)).toBe(programFiles(REPOSITORY_ROOT));
    expect(Object.isFrozen(programFiles(REPOSITORY_ROOT))).toBe(true);
  });
});

describe('memoisedPerSource', () => {
  test('answers a source once, and a planted source with the same text on its own', () => {
    const asked: string[] = [];
    const lengthOf = memoisedPerSource(({ path, text }) => {
      asked.push(path);
      return text.length;
    });
    const shared = { path: 'src/Shared.ts', text: 'export {};\n' };
    expect([lengthOf(shared), lengthOf(shared)]).toEqual([11, 11]);
    expect(lengthOf({ ...shared, path: 'src/Planted.ts' })).toBe(11);
    expect(asked).toEqual(['src/Shared.ts', 'src/Planted.ts']);
  });
});
