/**
 * The token writer under a scratch home: the token it is handed lands in ~/.gaia/token exactly, owner-only in an owner-only folder, written
 * over the one before; a home where the folder cannot be made answers unwritable instead of throwing.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join }                         from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';
import { serverTokenPathIn }                         from './ServerTokenFile.ts';
import { writeServerToken }                          from './ServerTokenWriter.ts';

const PERMISSION_BITS = 0o777;
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';
const LATER_EXAMPLE_TOKEN = 'example-token-fedcba9876543210';

let homeDirectory = '';

beforeEach(() => {
  homeDirectory = createScratchDirectory('server-token-writer-home');
});

afterEach(() => {
  removeScratchPath(homeDirectory);
});

describe('writeServerToken', () => {
  test('writes the token it is handed, owner-only, in an owner-only folder', async () => {
    expect(await writeServerToken(homeDirectory, EXAMPLE_TOKEN)).toEqual({ verdict: 'written' });
    expect(readFileSync(serverTokenPathIn(homeDirectory), 'utf8')).toBe(EXAMPLE_TOKEN);
    expect(statSync(serverTokenPathIn(homeDirectory)).mode & PERMISSION_BITS).toBe(0o600);
    expect(statSync(dirname(serverTokenPathIn(homeDirectory))).mode & PERMISSION_BITS).toBe(0o700);
  });

  test('writes over the token before', async () => {
    await writeServerToken(homeDirectory, EXAMPLE_TOKEN);
    await writeServerToken(homeDirectory, LATER_EXAMPLE_TOKEN);
    expect(readFileSync(serverTokenPathIn(homeDirectory), 'utf8')).toBe(LATER_EXAMPLE_TOKEN);
  });

  test('answers unwritable where a file stands in place of its folder', async () => {
    writeFileSync(join(homeDirectory, '.gaia'), 'a file where the folder belongs');
    expect((await writeServerToken(homeDirectory, EXAMPLE_TOKEN)).verdict).toBe('unwritable');
  });
});
