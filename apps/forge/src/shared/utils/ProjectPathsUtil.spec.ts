/**
 * The mapping between project and repository paths. What matters: the prefix `''` hands back every path without a leading `/` unchanged,
 * so a tracker at its repository's root names exactly today's paths; a leading `/` is repository-relative under any prefix; a sibling
 * project sharing the prefix's first letters is outside the project; and every repository path maps to a project path and back to itself.
 */
import { describe, expect, test } from 'bun:test';

import { ProjectPathsUtil } from './ProjectPathsUtil.ts';

const PROJECT_PREFIX = 'apps/forge';

const REPOSITORY_PATHS: string[] = [
  'apps/forge/src/Example.ts',
  'apps/forge',
  'apps/forge-other/Example.ts',
  'apps/gaia/package.json',
  'bun.lock',
  'packages/design-system/Button.tsx',
];

describe('with the prefix of a tracker at the repository root', () => {
  test.each(['src/Example.ts', 'CLAUDE.md', 'src/./Example.ts', ''])('the project path "%s" is its own repository path', (path) => {
    expect(ProjectPathsUtil.toRepositoryPath('', path)).toBe(path);
  });

  test.each(REPOSITORY_PATHS)('the repository path %s is its own project path', (path) => {
    expect(ProjectPathsUtil.toProjectPath('', path)).toBe(path);
  });

  test('a leading / still names the repository path without it', () => {
    expect(ProjectPathsUtil.toRepositoryPath('', '/bun.lock')).toBe('bun.lock');
  });
});

describe('with the prefix of a tracker in a project folder', () => {
  test.each([
    ['src/Example.ts', 'apps/forge/src/Example.ts'],
    ['CONSTITUTION.md', 'apps/forge/CONSTITUTION.md'],
    ['', 'apps/forge'],
    ['/bun.lock', 'bun.lock'],
    ['/packages/design-system', 'packages/design-system'],
  ])('the project path "%s" is the repository path %s', (projectPath, repositoryPath) => {
    expect(ProjectPathsUtil.toRepositoryPath(PROJECT_PREFIX, projectPath)).toBe(repositoryPath);
  });

  test.each([
    ['apps/forge/src/Example.ts', 'src/Example.ts'],
    ['apps/forge', ''],
    ['apps/forge-other/Example.ts', '/apps/forge-other/Example.ts'],
    ['apps/gaia/package.json', '/apps/gaia/package.json'],
    ['bun.lock', '/bun.lock'],
  ])('the repository path %s is the project path "%s"', (repositoryPath, projectPath) => {
    expect(ProjectPathsUtil.toProjectPath(PROJECT_PREFIX, repositoryPath)).toBe(projectPath);
  });

  test.each(REPOSITORY_PATHS)('the repository path %s maps to a project path and back to itself', (path) => {
    expect(ProjectPathsUtil.toRepositoryPath(PROJECT_PREFIX, ProjectPathsUtil.toProjectPath(PROJECT_PREFIX, path))).toBe(path);
  });
});
