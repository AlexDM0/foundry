/**
 * The scratch forge's clean-up after a recording: one repository whose Hephaestus will not stop must not leave every later repository's
 * Hephaestus running, and the one that failed stays listed so a second clean-up can retry it. The stop is stood in for, so no forge runs.
 * Its short home link goes with it, and the link root too once no other scratch forge's link is left there, so nothing stays outside the
 * scratch root; a scratch folder stands in for the link root.
 */
import { existsSync, mkdirSync }  from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { removeEachRepository, removeShortHomeLink } from './ScratchForge.ts';
import { createScratchDirectory, removeScratchPath } from './ScratchRoot.ts';

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

describe('removing the short home link', () => {
  test('removes the link root once the last scratch forge\'s link is gone', () => {
    const linkRoot = createScratchDirectory('link-root');
    try {
      const linkFolder = join(linkRoot, 'forge-only');
      mkdirSync(linkFolder);
      removeShortHomeLink(linkFolder, linkRoot);
      expect(existsSync(linkRoot)).toBe(false);
    } finally {
      removeScratchPath(linkRoot);
    }
  });

  test('keeps the link root while another scratch forge\'s link is in it', () => {
    const linkRoot = createScratchDirectory('link-root');
    try {
      const linkFolder = join(linkRoot, 'forge-ending');
      const otherLinkFolder = join(linkRoot, 'forge-still-running');
      mkdirSync(linkFolder);
      mkdirSync(otherLinkFolder);
      removeShortHomeLink(linkFolder, linkRoot);
      expect(existsSync(linkFolder)).toBe(false);
      expect(existsSync(otherLinkFolder)).toBe(true);
    } finally {
      removeScratchPath(linkRoot);
    }
  });
});
