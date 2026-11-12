/** The scratch helpers are the guard that keeps every spec off live data, so they must refuse any path outside the scratch root. */
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { homeDirectory } from '../services/Environment.ts';
import {
  createScratchDirectory,
  pathLiesInsideScratchRoot,
  removeScratchPath,
  scratchRoot,
} from './ScratchRoot.ts';

describe('the scratch root', () => {
  test('refuses to remove a path outside the scratch root', () => {
    expect(() => removeScratchPath(join(scratchRoot(), '..', 'gaia-not-scratch'))).toThrow('is not inside the scratch root');
  });

  test('refuses the scratch root itself and a path that climbs out of it', () => {
    expect(pathLiesInsideScratchRoot(scratchRoot())).toBe(false);
    expect(pathLiesInsideScratchRoot(join(scratchRoot(), '..', 'src'))).toBe(false);
  });

  test('accepts a directory it made and removes it', () => {
    const made = createScratchDirectory('accepted');
    expect(pathLiesInsideScratchRoot(made)).toBe(true);
    removeScratchPath(made);
    expect(pathLiesInsideScratchRoot(made)).toBe(true);
  });

  test('runs every spec under a scratch home inside the scratch root', () => {
    expect(pathLiesInsideScratchRoot(homeDirectory())).toBe(true);
  });
});
