/**
 * The removal guard of the scratch workspace. What matters: a teardown whose setup threw hands over `''`, `..` or a path built from them, and
 * none of those, nor the scratch root itself, a sibling of it or a path that leaves it through `..`, may remove anything. Each refused form is
 * planted beside a real folder that must still exist after the refusal; one path strictly inside the root shows the removal still works.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, sep }    from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';

let outerDirectory: string | null = null;

const outerDirectoryOrThrow = (): string => {
  if (outerDirectory === null) throw new Error('The setup did not create the outer scratch directory.');
  return outerDirectory;
};

const scratchRoot = (): string => join(outerDirectoryOrThrow(), 'root');

const siblingOfTheScratchRoot = (): string => join(outerDirectoryOrThrow(), 'sibling');

const folderInsideTheScratchRoot = (): string => join(scratchRoot(), 'inside');

beforeEach(() => {
  outerDirectory = createScratchDirectory('scratch-removal');
  mkdirSync(folderInsideTheScratchRoot(), { recursive: true });
  mkdirSync(siblingOfTheScratchRoot(), { recursive: true });
});

afterEach(() => {
  if (outerDirectory !== null) removeScratchDirectory(outerDirectory);
  outerDirectory = null;
});

describe('removing a scratch directory refuses, and removes nothing, when the path', () => {
  test('is empty', () => {
    expect(() => removeScratchDirectory('', scratchRoot())).toThrow('Refused to remove');
    expect(existsSync(resolve(''))).toBe(true);
  });

  test('is `..`, the parent of the working directory', () => {
    expect(() => removeScratchDirectory('..', scratchRoot())).toThrow('Refused to remove');
    expect(existsSync(resolve('..'))).toBe(true);
  });

  test('is relative, even when it would resolve inside the scratch root', () => {
    expect(() => removeScratchDirectory(join('relative', 'folder'), scratchRoot())).toThrow('Refused to remove');
    expect(() => removeScratchDirectory(folderInsideTheScratchRoot().slice(1), '/')).toThrow('Refused to remove');
  });

  test('is the scratch root itself', () => {
    expect(() => removeScratchDirectory(scratchRoot(), scratchRoot())).toThrow('Refused to remove');
    expect(existsSync(folderInsideTheScratchRoot())).toBe(true);
  });

  test('is a sibling of the scratch root', () => {
    expect(() => removeScratchDirectory(siblingOfTheScratchRoot(), scratchRoot())).toThrow('Refused to remove');
    expect(existsSync(siblingOfTheScratchRoot())).toBe(true);
  });

  test('starts inside the scratch root and leaves it through `..`', () => {
    const leavingPath = [folderInsideTheScratchRoot(), '..', '..', 'sibling'].join(sep);
    expect(() => removeScratchDirectory(leavingPath, scratchRoot())).toThrow('Refused to remove');
    expect(existsSync(siblingOfTheScratchRoot())).toBe(true);
  });
});

test('removing a folder strictly inside the scratch root removes it and leaves the root', () => {
  removeScratchDirectory(folderInsideTheScratchRoot(), scratchRoot());
  expect(existsSync(folderInsideTheScratchRoot())).toBe(false);
  expect(existsSync(scratchRoot())).toBe(true);
});

test('the default scratch roots are the shared root and the temporary folder, so a folder outside both is refused', () => {
  expect(() => removeScratchDirectory(resolve('..'))).toThrow('Refused to remove');
  expect(existsSync(resolve('..'))).toBe(true);
});
