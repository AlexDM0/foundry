/**
 * The getters must follow a move of the environment at once, and the copy a child process is handed must hold the moved values, or a
 * spec reaches the real home. That a child receives the copy is proven by process-run's real-system spec, the one place a child starts.
 */
import { describe, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../testing/ScratchRoot.ts';

import { environmentCopy, homeDirectory, moveHomeDirectoryTo } from './Environment.ts';

describe('the environment', () => {
  test('answers a moved home at the next call, and holds it in the copy a child is handed', () => {
    const runHome   = homeDirectory();
    const movedHome = createScratchDirectory('moved-home');
    try {
      moveHomeDirectoryTo(movedHome);
      expect(homeDirectory()).toBe(movedHome);
      expect(environmentCopy()['HOME']).toBe(movedHome);
    } finally {
      moveHomeDirectoryTo(runHome);
      removeScratchPath(movedHome);
    }
  });
});
