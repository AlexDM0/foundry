/**
 * The getters must follow a move of the environment at once, and the copy a child process is handed must hold the moved values, or a
 * spec reaches the real home. That a child receives the copy is proven by process-run's real-system spec, the one place a child starts.
 * A port setting is read strictly: text that is no whole port is refused, never cut down to one.
 */
import { describe, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../testing/ScratchRoot.ts';

import {
  environmentCopy,
  homeDirectory,
  moveHomeDirectoryTo,
  portOfSetting,
} from './Environment.ts';

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

describe('the port setting', () => {
  test('names the default port when it is unset or empty', () => {
    expect([portOfSetting(undefined), portOfSetting('')]).toEqual([4790, 4790]);
  });

  test('names the port it holds, 0 for any free port included', () => {
    expect([portOfSetting('4791'), portOfSetting('0'), portOfSetting('65535')]).toEqual([4791, 0, 65_535]);
  });

  test('names no port for text that is no whole port in range', () => {
    expect(['65536', '-1', '47.9', ' 4790', '4790a', '0x12ae'].map(portOfSetting)).toEqual([null, null, null, null, null, null]);
  });
});
