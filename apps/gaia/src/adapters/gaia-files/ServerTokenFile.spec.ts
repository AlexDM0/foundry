/**
 * Gaia's token is read from the data folder of the home it is handed, trimmed; a token that is absent or empty reads as none, so the
 * launcher asks for no session with it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';

import { serverTokenPathIn, ServerTokenFile } from './ServerTokenFile.ts';

const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';

let homeDirectory = '';

beforeEach(() => {
  homeDirectory = createScratchDirectory('server-token-file-home');
});

afterEach(() => {
  removeScratchPath(homeDirectory);
});

function writeToken(contents: string): void {
  mkdirSync(dirname(serverTokenPathIn(homeDirectory)), { recursive: true });
  writeFileSync(serverTokenPathIn(homeDirectory), contents);
}

describe('the server token file', () => {
  test('lives in Gaia\'s data folder of the home', () => {
    expect(serverTokenPathIn(homeDirectory)).toBe(join(homeDirectory, '.gaia', 'token'));
  });

  test('reads the token without its surrounding white space', async () => {
    writeToken(`${EXAMPLE_TOKEN}\n`);
    expect(await new ServerTokenFile(homeDirectory).read()).toBe(EXAMPLE_TOKEN);
  });

  test('reads no token from a file that is absent or empty', async () => {
    expect(await new ServerTokenFile(homeDirectory).read()).toBeNull();
    writeToken('  \n');
    expect(await new ServerTokenFile(homeDirectory).read()).toBeNull();
  });
});
