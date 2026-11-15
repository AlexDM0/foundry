/**
 * The tree findings from git's list of entries, with no file system. What matters: every path part is read, not only the last; a reserved
 * device name counts with any extension and in any case, but a name that only starts with one does not; each unstorable form is one finding;
 * and a case collision is one finding that names every path of the set.
 */
import { expect, test } from 'bun:test';

import { TreePortability } from './TreePortability.ts';

const FILE_MODE = '100644';

function entriesOf(paths: readonly string[]): { mode: string; path: string }[] {
  return paths.map((path) => ({ mode: FILE_MODE, path }));
}

test('a reserved device name in any path part, case or extension is one finding, and a name only starting with one is none', () => {
  expect(TreePortability.findingsOf(entriesOf(['src/AUX.c', 'nul/example.txt', 'lpt¹', 'console.ts', 'auxiliary.md', 'com10.txt']))).toEqual([
    { kind: 'reserved-name', paths: ['src/AUX.c'] },
    { kind: 'reserved-name', paths: ['nul/example.txt'] },
    { kind: 'reserved-name', paths: ['lpt¹'] },
  ]);
});

test('a character Windows cannot store, a control character or a trailing dot or space is one finding per path', () => {
  const unstorable = ['a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b', 'a\\b', 'a\u0001b', 'notes./example.md', 'example '];
  expect(TreePortability.findingsOf(entriesOf([...unstorable, 'example.md', '.gitignore']))).toEqual(unstorable.map((path) => ({ kind: 'unstorable-name', paths: [path] })));
});

test('paths equal under case folding are one finding naming all of them, and a symbolic link is one finding', () => {
  expect(TreePortability.findingsOf([
    ...entriesOf(['README.md', 'docs/Example.md', 'readme.md', 'Readme.MD']),
    { mode: '120000', path: 'example-link' },
  ])).toEqual([
    { kind: 'symbolic-link', paths: ['example-link'] },
    { kind: 'case-collision', paths: ['README.md', 'readme.md', 'Readme.MD'] },
  ]);
});
