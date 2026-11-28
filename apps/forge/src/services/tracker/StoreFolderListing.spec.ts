/**
 * The store folder listing the ticket, epic and draft stores share. What matters: a missing folder is an empty store, only files of the
 * extension count, never a folder named like one, and come in file-name order, and a file whose stored key differs from its name is
 * unreadable, never listed, while a malformed reading keeps its own reason and line; each unreadable file is keyed by its name.
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
const EXAMPLE_PROBLEM = { code: 'example-refusal' } as const;

function readingOf(filePath: string): KeyedFileReading<string, typeof EXAMPLE_PROBLEM> {
  const text = readFileSync(filePath, 'utf8');
  return text === 'broken' ? { verdict: 'malformed', problem: EXAMPLE_PROBLEM, line: 3 } : { verdict: 'read', item: `item ${text}`, key: text };
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
  })).toEqual({ items: [], unreadable: [] });
});

test('only files of the extension are listed, in file-name order', () => {
  mkdirSync(directory, { recursive: true });
  for (const fileName of ['b.md', 'a.md', 'c.json', 'notes.txt']) writeFileSync(join(directory, fileName), '');
  expect(storeFolderFileNamesIn(directory, '.md')).toEqual(['a.md', 'b.md']);
});

// `clear --all` journals a removal of every listed entry; a folder named like a stored file would fail every later replay of that journal.
test('a folder named with the extension is not listed', () => {
  mkdirSync(join(directory, 'notes.md'), { recursive: true });
  writeFileSync(join(directory, 'a.md'), '');
  expect(storeFolderFileNamesIn(directory, '.md')).toEqual(['a.md']);
});

test('a file whose key differs from its name is unreadable, and a refused reading keeps its problem and line, each keyed by its file name', () => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'alpha.md'), 'alpha');
  writeFileSync(join(directory, 'beta.md'), 'gamma');
  writeFileSync(join(directory, 'delta.md'), 'broken');

  expect(listStoreFolder({
    directory, extension: '.md', keyField: 'key', readingOf
  })).toEqual({
    items:      ['item alpha'],
    unreadable: [
      {
        key:      'beta',
        location: join(directory, 'beta.md'),
        problem:  {
          code: 'file-name-names-another-key', field: 'key', keyInFileName: 'beta', storedKey: 'gamma'
        },
        line: 0,
      },
      {
        key: 'delta', location: join(directory, 'delta.md'), problem: EXAMPLE_PROBLEM, line: 3
      },
    ],
  });
});
