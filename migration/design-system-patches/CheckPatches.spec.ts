/**
 * The patch check. What matters: it reads every patch of this folder, numbered in apply order, with the full hashes of each file it
 * touches; a blob hash is git's own; the replay tells a patch that applies (also one that follows another on the same file), one already
 * applied (also when a later patch changed its files again), one made stale by a change outside the series and one blocked by an earlier
 * patch, and treats a new file as absent before it; a patch without full hashes is unreadable; it hashes a folder's files from the disk;
 * and the README lists each patch with the hash each touched file has before it, so the README cannot drift from the patches.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  describe,
  expect,
  test
} from 'bun:test';

import {
  ABSENT_FILE_HASH,
  gitBlobHashOf,
  patchReadingOf,
  patchReadingsIn,
  patchVerdictsFor,
  seriesVerdictsFor,
  type PatchedFile
} from './CheckPatches.ts';

const SCRATCH_ROOT = join(import.meta.dir, '.scratch');

/** Taken from git: `printf '' | git hash-object --stdin` and `printf 'hello\n' | git hash-object --stdin`. */
const EMPTY_FILE_HASH = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
const HELLO_LINE_HASH = 'ce013625030ba8dba906f756967f9e9ca394464a';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const HASH_C = 'c'.repeat(40);
const HASH_D = 'd'.repeat(40);

afterAll(() => {
  rmSync(SCRATCH_ROOT, { recursive: true, force: true });
});

function plantedPatchText(files: readonly PatchedFile[]): string {
  const lines = ['Subject: An example change', '---', ''];
  for (const file of files) {
    lines.push(`diff --git a/${file.path} b/${file.path}`, `index ${file.hashBefore}..${file.hashAfter} 100644`, `--- a/${file.path}`, `+++ b/${file.path}`);
  }
  return lines.join('\n');
}

function plantedReading(name: string, files: readonly PatchedFile[]) {
  return patchReadingOf(name, plantedPatchText(files));
}

function folderHashes(hashByPath: Readonly<Record<string, string>>): (path: string) => string {
  return (path) => (Object.hasOwn(hashByPath, path) ? hashByPath[path] ?? ABSENT_FILE_HASH : ABSENT_FILE_HASH);
}

describe('reading the series', () => {
  test('it reads every patch of this folder, numbered in apply order, each with the full hashes of the files it touches', () => {
    const readings = patchReadingsIn(import.meta.dir);
    expect(readings.length).toBeGreaterThanOrEqual(1);
    expect(readings.map(({ name }) => name.slice(0, 2))).toEqual(readings.map((_reading, i) => String(i + 1).padStart(2, '0')));
    for (const reading of readings) {
      expect(reading.files?.length ?? 0).toBeGreaterThanOrEqual(1);
      for (const file of reading.files ?? []) expect([file.hashBefore, file.hashAfter].every((hash) => /^[0-9a-f]{40}$/.test(hash))).toBe(true);
    }
  });

  test('a patch reads each file it touches with its hash before and after, a new file as absent before', () => {
    const reading = plantedReading('01-example.patch', [
      { path: 'atoms/Example.tsx', hashBefore: HASH_A, hashAfter: HASH_B },
      { path: 'atoms/Example.css', hashBefore: ABSENT_FILE_HASH, hashAfter: HASH_C },
    ]);
    expect(reading.files).toEqual([
      { path: 'atoms/Example.tsx', hashBefore: HASH_A, hashAfter: HASH_B },
      { path: 'atoms/Example.css', hashBefore: ABSENT_FILE_HASH, hashAfter: HASH_C },
    ]);
  });

  test('a patch with an abbreviated hash, or with none, is unreadable', () => {
    const abbreviated = patchReadingOf('01-example.patch', 'diff --git a/atoms/Example.tsx b/atoms/Example.tsx\nindex aaaaaaa..bbbbbbb 100644\n');
    const empty = patchReadingOf('02-example.patch', 'Subject: nothing\n');
    expect([abbreviated.files, empty.files]).toEqual([null, null]);
    expect(seriesVerdictsFor([abbreviated], folderHashes({}))).toEqual([{ patch: '01-example.patch', verdict: 'unreadable' }]);
  });

  test('a blob hash is the one git computes', () => {
    expect([gitBlobHashOf(new Uint8Array()), gitBlobHashOf(new TextEncoder().encode('hello\n'))]).toEqual([EMPTY_FILE_HASH, HELLO_LINE_HASH]);
  });
});

describe('replaying the series over a folder', () => {
  const series = [
    plantedReading('01-first.patch', [{ path: 'Shared.css', hashBefore: HASH_A, hashAfter: HASH_B }]),
    plantedReading('02-second.patch', [{ path: 'Shared.css', hashBefore: HASH_B, hashAfter: HASH_C }, { path: 'New.tsx', hashBefore: ABSENT_FILE_HASH, hashAfter: HASH_D }]),
  ];

  test('on the package it was made against every patch applies, the second after the first on the same file, a new file absent before', () => {
    expect(seriesVerdictsFor(series, folderHashes({ 'Shared.css': HASH_A })).map(({ verdict }) => verdict)).toEqual(['applies', 'applies']);
  });

  test('on a package that holds the whole series every patch is applied, the first also after the second changed its file again', () => {
    expect(seriesVerdictsFor(series, folderHashes({ 'Shared.css': HASH_C, 'New.tsx': HASH_D })).map(({ verdict }) => verdict)).toEqual(['applied', 'applied']);
  });

  test('after the first patch alone, the first is applied and the second applies', () => {
    expect(seriesVerdictsFor(series, folderHashes({ 'Shared.css': HASH_B })).map(({ verdict }) => verdict)).toEqual(['applied', 'applies']);
  });

  test('a file changed outside the series makes its patch stale, naming the file, and every later patch on that file', () => {
    expect(seriesVerdictsFor(series, folderHashes({ 'Shared.css': HASH_D }))).toEqual([
      { patch: '01-first.patch', verdict: 'stale', changedPaths: ['Shared.css'] },
      { patch: '02-second.patch', verdict: 'stale', changedPaths: ['Shared.css'] },
    ]);
  });

  test('a patch whose file still waits on an earlier patch that did not apply is blocked by it', () => {
    const blockedSeries = [
      plantedReading('01-first.patch', [{ path: 'Shared.css', hashBefore: HASH_A, hashAfter: HASH_B }, { path: 'Other.css', hashBefore: HASH_C, hashAfter: HASH_D }]),
      plantedReading('02-second.patch', [{ path: 'Shared.css', hashBefore: HASH_B, hashAfter: HASH_C }]),
    ];
    expect(seriesVerdictsFor(blockedSeries, folderHashes({ 'Shared.css': HASH_A, 'Other.css': HASH_A }))).toEqual([
      { patch: '01-first.patch', verdict: 'stale', changedPaths: ['Other.css'] },
      { patch: '02-second.patch', verdict: 'blocked', blockingPatch: '01-first.patch' },
    ]);
  });

  test('a patch applied in part is stale, naming the files it already changed', () => {
    const halfApplied = [
      plantedReading('01-first.patch', [{ path: 'One.css', hashBefore: HASH_A, hashAfter: HASH_B }, { path: 'Two.css', hashBefore: HASH_A, hashAfter: HASH_C }]),
    ];
    expect(seriesVerdictsFor(halfApplied, folderHashes({ 'One.css': HASH_B, 'Two.css': HASH_A })))
      .toEqual([{ patch: '01-first.patch', verdict: 'stale', changedPaths: ['One.css'] }]);
  });
});

describe('checking a folder on disk', () => {
  test('it hashes the package folder\'s files as git does, and a missing file as absent', () => {
    mkdirSync(SCRATCH_ROOT, { recursive: true });
    const scratchFolder = mkdtempSync(join(SCRATCH_ROOT, 'check-'));
    const patchFolder = join(scratchFolder, 'patches');
    const packageFolder = join(scratchFolder, 'package');
    mkdirSync(patchFolder);
    mkdirSync(join(packageFolder, 'atoms'), { recursive: true });
    writeFileSync(join(packageFolder, 'atoms', 'Example.css'), 'hello\n');
    writeFileSync(join(patchFolder, '01-example.patch'), plantedPatchText([
      { path: 'atoms/Example.css', hashBefore: HELLO_LINE_HASH, hashAfter: HASH_B },
      { path: 'atoms/Example.tsx', hashBefore: ABSENT_FILE_HASH, hashAfter: HASH_C },
    ]));
    writeFileSync(join(patchFolder, 'README.md'), 'Not a patch.');
    expect(patchVerdictsFor(patchFolder, packageFolder)).toEqual([{ patch: '01-example.patch', verdict: 'applies' }]);
  });
});

describe('the README', () => {
  test('it lists each patch with the hash each file it touches has before it', () => {
    // A listing may wrap across lines, so the README is read as one line.
    const readme = readFileSync(join(import.meta.dir, 'README.md'), 'utf8').replace(/\s+/g, ' ');
    const missing = patchReadingsIn(import.meta.dir).flatMap((reading) => [
      ...(readme.includes(reading.name) ? [] : [reading.name]),
      ...(reading.files ?? []).map((file) => `\`${file.path}\` \`${file.hashBefore.slice(0, 12)}\``).filter((listing) => !readme.includes(listing)),
    ]);
    expect(missing).toEqual([]);
  });
});
