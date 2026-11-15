/**
 * The browser Gaia opens in: Chrome before Edge, the system's Applications folder before the user's, and none when neither can run. A
 * program that exists but cannot run is no browser. The places are checked under a scratch home with planted programs.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }                       from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';

import { browserCandidatesIn, foundBrowserIn, programIsRunnable } from './BrowserFinder.ts';

const EXAMPLE_HOME = '/Users/example';
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_CHROME = '/Users/example/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SYSTEM_EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const USER_EDGE = '/Users/example/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const RUNNABLE_MODE = 0o755;
const UNRUNNABLE_MODE = 0o644;

let scratchFolder = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('browser-finder');
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

function plantedProgram(relativePath: string, mode: number): string {
  const programPath = join(scratchFolder, relativePath);
  mkdirSync(dirname(programPath), { recursive: true });
  writeFileSync(programPath, '#!/bin/sh\n');
  chmodSync(programPath, mode);
  return programPath;
}

describe('the browser candidates', () => {
  test('list Chrome before Edge, each in the system\'s Applications folder before the user\'s', () => {
    expect(browserCandidatesIn(EXAMPLE_HOME)).toEqual([
      { browser: 'chrome', program: SYSTEM_CHROME },
      { browser: 'chrome', program: USER_CHROME },
      { browser: 'edge', program: SYSTEM_EDGE },
      { browser: 'edge', program: USER_EDGE },
    ]);
  });
});

describe('the found browser', () => {
  test('is Chrome when both browsers are there', () => {
    expect(foundBrowserIn(EXAMPLE_HOME, (programPath) => [SYSTEM_EDGE, USER_CHROME].includes(programPath))).toEqual({ browser: 'chrome', program: USER_CHROME });
  });

  test('is Edge when Chrome is not there', () => {
    expect(foundBrowserIn(EXAMPLE_HOME, (programPath) => programPath === USER_EDGE)).toEqual({ browser: 'edge', program: USER_EDGE });
  });

  test('is none when neither browser is there', () => {
    expect(foundBrowserIn(EXAMPLE_HOME, () => false)).toBeNull();
  });
});

describe('a runnable program', () => {
  test('is a file that may be run, not one that may not, and not one that is absent', () => {
    expect([
      programIsRunnable(plantedProgram('runnable', RUNNABLE_MODE)),
      programIsRunnable(plantedProgram('unrunnable', UNRUNNABLE_MODE)),
      programIsRunnable(join(scratchFolder, 'absent')),
    ]).toEqual([true, false, false]);
  });
});
