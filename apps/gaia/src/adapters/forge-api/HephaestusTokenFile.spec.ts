/**
 * The token file in the scratch root. What matters: the token comes back without the line end the forge writes after it, and a file
 * that is absent or empty answers no token rather than an empty bearer.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';

import { HephaestusTokenFile } from './HephaestusTokenFile.ts';

let scratchFolder = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('hephaestus-token');
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

test('reads the token without the line end after it', async () => {
  const tokenPath = join(scratchFolder, 'token');
  writeFileSync(tokenPath, 'example-token-0123456789abcdef\n');
  expect(await new HephaestusTokenFile(tokenPath).read()).toBe('example-token-0123456789abcdef');
});

test('answers no token for a file that is absent', async () => {
  expect(await new HephaestusTokenFile(join(scratchFolder, 'absent-token')).read()).toBeNull();
});

test('answers no token for a file that holds only white space', async () => {
  const tokenPath = join(scratchFolder, 'token');
  writeFileSync(tokenPath, '\n');
  expect(await new HephaestusTokenFile(tokenPath).read()).toBeNull();
});
