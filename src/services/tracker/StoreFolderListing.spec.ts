/**
 * The store folder listing the ticket, epic and draft stores share. What matters: a missing folder is an empty store, only files of the
 * extension count and come in file-name order, and a file whose stored key differs from its name is malformed, never listed, while a
 * malformed reading keeps its own reason and line.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                 from '../../testing/ScratchWorkspace.ts';
import { type KeyedFileReading, listStoreFolder, storeFolderFileNamesIn } from './StoreFolderListing.ts';

let directory = '';

/** Each file holds its key, or `broken` for a file the reading refuses. */
function readingOf(filePath: string): KeyedFileReading<string> {
  const text = readFileSync(filePath, 'utf8');
  return text === 'broken' ? { verdict: 'malformed', reason: 'example refusal', line: 3 } : { verdict: 'read', item: `item ${text}`, key: text };
}

beforeEach(() => {
  directory = join(createScratchDirectory('store-folder-listing'), 'store');
});

afterEach(() => {
  removeScratchDirectory(join(directory, '..'));
});

test('a missing folder lists no file and no item', () => {
  expect(storeFolderFileNamesIn(directory, '.md')).toEqual([]);
  expect(listStoreFolder({
    directory, extension: '.md', keyField: 'key', readingOf
  })).toEqual({ items: [], malformed: [] });
});

test('only files of the extension are listed, in file-name order', () => {
  mkdirSync(directory, { recursive: true });
  for (const fileName of ['b.md', 'a.md', 'c.json', 'notes.txt']) writeFileSync(join(directory, fileName), '');
  expect(storeFolderFileNamesIn(directory, '.md')).toEqual(['a.md', 'b.md']);
});

test('a file whose key differs from its name is malformed, and a refused reading keeps its reason and line', () => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'alpha.md'), 'alpha');
  writeFileSync(join(directory, 'beta.md'), 'gamma');
  writeFileSync(join(directory, 'delta.md'), 'broken');

  expect(listStoreFolder({
    directory, extension: '.md', keyField: 'key', readingOf
  })).toEqual({
    items:     ['item alpha'],
    malformed: [
      { filePath: join(directory, 'beta.md'), reason: 'the file name says beta but its `key` is gamma', line: 0 },
      { filePath: join(directory, 'delta.md'), reason: 'example refusal', line: 3 },
    ],
  });
});
