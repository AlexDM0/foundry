/**
 * The package's door. What matters: every entry of the `exports` map names a file that exists, every mark is exported by its own name,
 * and each exported mark has its DOM spec and its story beside it.
 */
import { existsSync }             from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { PACKAGE_FOLDER, PackageFiles } from './testing/PackageFiles.ts';

const MANIFEST: { readonly exports: Readonly<Record<string, string>> } = JSON.parse(PackageFiles.text('package.json'));
const MARK_SOURCE = /^marks\/(\w+)\.tsx$/;

const MARK_NAMES = PackageFiles.matching(MARK_SOURCE).map((file) => MARK_SOURCE.exec(file.path)?.[1] ?? '');

describe('the package\'s exports', () => {
  test('every export names a file that exists', () => {
    const exportedFiles = Object.values(MANIFEST.exports).map((target) => target.replace('*', 'icon.svg'));
    expect(exportedFiles.filter((target) => !existsSync(join(PACKAGE_FOLDER, target)))).toEqual([]);
  });

  test('every mark is exported by its name, with its DOM spec and its story beside it', () => {
    expect(MARK_NAMES).toEqual(['ForgeMark', 'GaiaMark']);
    for (const markName of MARK_NAMES) {
      expect(MANIFEST.exports[`./${markName}`]).toBe(`./marks/${markName}.tsx`);
      expect([`marks/${markName}.dom.tsx`, `marks/${markName}.stories.tsx`].filter((path) => !existsSync(join(PACKAGE_FOLDER, path)))).toEqual([]);
    }
  });
});
