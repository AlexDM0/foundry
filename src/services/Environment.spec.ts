/** The getters must follow a move of the environment at once, and a child process must see the moved values, or a spec reaches the real home. */
import { describe, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../testing/ScratchRoot.ts';

import { environmentCopy, homeDirectory, moveHomeDirectoryTo } from './Environment.ts';

describe('the environment', () => {
  test('answers a moved home at the next call, and hands it to a child process', () => {
    const runHome   = homeDirectory();
    const movedHome = createScratchDirectory('moved-home');
    try {
      moveHomeDirectoryTo(movedHome);
      expect(homeDirectory()).toBe(movedHome);
      const child = Bun.spawnSync(['sh', '-c', 'printf %s "$HOME"'], { env: environmentCopy(), stdout: 'pipe' });
      expect(child.stdout.toString()).toBe(movedHome);
    } finally {
      moveHomeDirectoryTo(runHome);
      removeScratchPath(movedHome);
    }
  });
});
