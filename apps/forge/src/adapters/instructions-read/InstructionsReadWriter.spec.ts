/**
 * The record of a launch's instruction files. What matters: the writer stores the current version with each file's path and content hash
 * and nothing else, in file order, and a launch given no instruction file stores an empty list; nothing reads it back, so no ingestion
 * class answers for it.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                 from '../../testing/ScratchWorkspace.ts';
import { createInstructionsReadWriter, INSTRUCTIONS_READ_FORMAT_VERSION } from './InstructionsReadWriter.ts';

let scratchDirectory = '';

const instructionsReadFilePath = (): string => join(scratchDirectory, 'instructions-2.json');

const stored = (): unknown => JSON.parse(readFileSync(instructionsReadFilePath(), 'utf8'));

beforeEach(() => {
  scratchDirectory = createScratchDirectory('instructions-read-writer');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('stores each instruction file\'s path and content hash, in order, under the current version', () => {
  const files = [{ path: 'CLAUDE.md', contentHash: '0123456789abcdef' }, { path: 'docs/brief.md', contentHash: 'fedcba9876543210', extra: true }];

  createInstructionsReadWriter(instructionsReadFilePath()).write(files);

  expect(stored()).toEqual({
    version: INSTRUCTIONS_READ_FORMAT_VERSION,
    files:   [{ path: 'CLAUDE.md', contentHash: '0123456789abcdef' }, { path: 'docs/brief.md', contentHash: 'fedcba9876543210' }],
  });
});

test('a launch given no instruction file stores an empty list', () => {
  createInstructionsReadWriter(instructionsReadFilePath()).write([]);
  expect(stored()).toEqual({ version: INSTRUCTIONS_READ_FORMAT_VERSION, files: [] });
});
