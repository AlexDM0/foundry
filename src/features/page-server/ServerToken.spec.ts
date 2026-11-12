/**
 * Gaia's token under a scratch home: 32 random bytes as hex, owner-only in an owner-only folder, fresh at every write and written over the
 * one before; a home where the folder cannot be made answers unwritable instead of throwing.
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
import { serverTokenPathIn, writeFreshServerToken }  from './ServerToken.ts';

const PERMISSION_BITS = 0o777;

let homeDirectory = '';

beforeEach(() => {
  homeDirectory = createScratchDirectory('server-token-home');
});

afterEach(() => {
  removeScratchPath(homeDirectory);
});

describe('the server token', () => {
  test('is 32 random bytes as hex in ~/.gaia/token, the token the write answers', async () => {
    const tokenWrite = await writeFreshServerToken(homeDirectory);
    expect(serverTokenPathIn(homeDirectory)).toBe(join(homeDirectory, '.gaia', 'token'));
    expect(tokenWrite).toEqual({ verdict: 'written', token: readFileSync(serverTokenPathIn(homeDirectory), 'utf8') });
    expect(readFileSync(serverTokenPathIn(homeDirectory), 'utf8')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is owner-only, in an owner-only folder', async () => {
    await writeFreshServerToken(homeDirectory);
    expect(statSync(serverTokenPathIn(homeDirectory)).mode & PERMISSION_BITS).toBe(0o600);
    expect(statSync(dirname(serverTokenPathIn(homeDirectory))).mode & PERMISSION_BITS).toBe(0o700);
  });

  test('is fresh at every write, written over the one before', async () => {
    const firstWrite  = await writeFreshServerToken(homeDirectory);
    const secondWrite = await writeFreshServerToken(homeDirectory);
    expect(firstWrite).not.toEqual(secondWrite);
    expect(secondWrite).toEqual({ verdict: 'written', token: readFileSync(serverTokenPathIn(homeDirectory), 'utf8') });
  });

  test('answers unwritable where a file stands in place of its folder', async () => {
    writeFileSync(join(homeDirectory, '.gaia'), 'a file where the folder belongs');
    expect((await writeFreshServerToken(homeDirectory)).verdict).toBe('unwritable');
  });
});
