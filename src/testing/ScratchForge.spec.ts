/**
 * The scratch forge's clean-up after a recording: one repository whose Overseer will not stop must not leave every later repository's
 * Overseer running, and the one that failed stays listed so a second clean-up can retry it. The stop is stood in for, so no forge runs.
 */
import { describe, expect, test } from 'bun:test';

import { removeEachRepository } from './ScratchForge.ts';

describe('removing the scratch repositories', () => {
  test('tries every repository past a failed one, rethrows the first failure and keeps only the failed one listed', async () => {
    const repositories = ['/scratch/first', '/scratch/stuck', '/scratch/last'];
    const tried: string[] = [];
    const removal = removeEachRepository(repositories, (repository) => {
      tried.push(repository);
      return repository === '/scratch/stuck' ? Promise.reject(new Error('forge stop answered a timeout')) : Promise.resolve();
    });

    await expect(removal).rejects.toThrow('forge stop answered a timeout');
    expect(tried).toEqual(['/scratch/first', '/scratch/stuck', '/scratch/last']);
    expect(repositories).toEqual(['/scratch/stuck']);
  });

  test('empties the list when every repository is removed', async () => {
    const repositories = ['/scratch/first', '/scratch/last'];
    await removeEachRepository(repositories, () => Promise.resolve());
    expect(repositories).toEqual([]);
  });
});
