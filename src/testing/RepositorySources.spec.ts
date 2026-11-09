/**
 * The shared read of the checkout. What matters: every guard of a run gets the same read, frozen, so no guard can plant into another's
 * input; the walk leaves out the folders git ignores; and a per-source answer is computed once for a shared source and anew for a planted one.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                                        from './ImportGraph.ts';
import { memoisedPerSource, repositoryFilePaths, repositoryTypeScriptSources } from './RepositorySources.ts';

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
