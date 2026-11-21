/**
 * The library's door. What matters: every module the interface file exports from exists, every mark is exported from it by its own name,
 * each exported mark has its DOM spec and its story beside it, and the stylesheet a page links by its path is there.
 */
import { existsSync }             from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { PACKAGE_FOLDER, PackageFiles } from './testing/PackageFiles.ts';

const INTERFACE_FILE_PATH = 'BrandInterface.ts';
const LINKED_STYLESHEET_PATH = 'styles/brand.css';
const EXPORT_STATEMENT = /^export (?<typeOnly>type )?\{(?<names>[^}]*)\} from '\.\/(?<modulePath>[^']+)';$/gmu;
const MARK_SOURCE = /^marks\/(\w+)\.tsx$/;

interface InterfaceExport {
  readonly name:       string;
  readonly modulePath: string;
  readonly typeOnly:   boolean;
}

function interfaceExportsOf(interfaceText: string): InterfaceExport[] {
  return [...interfaceText.matchAll(EXPORT_STATEMENT)].flatMap((statement) => (statement.groups?.['names'] ?? '').split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .map((name) => ({ name, modulePath: statement.groups?.['modulePath'] ?? '', typeOnly: statement.groups?.['typeOnly'] !== undefined })));
}

const INTERFACE_EXPORTS = interfaceExportsOf(PackageFiles.text(INTERFACE_FILE_PATH));
const MARK_NAMES = PackageFiles.matching(MARK_SOURCE).map((file) => MARK_SOURCE.exec(file.path)?.[1] ?? '');

describe('the library\'s exports', () => {
  test('the interface file exports the mark, its props and the mark geometry, each from a module that exists', () => {
    expect(INTERFACE_EXPORTS.map(({ name }) => name).sort()).toEqual(['ForgeMark', 'ForgeMarkProps', 'MARK_GEOMETRY']);
    expect(INTERFACE_EXPORTS.filter(({ modulePath }) => !existsSync(join(PACKAGE_FOLDER, modulePath)))).toEqual([]);
  });

  test('every mark is exported by its name, with its DOM spec and its story beside it', () => {
    expect(MARK_NAMES).toEqual(['ForgeMark']);
    for (const markName of MARK_NAMES) {
      expect(INTERFACE_EXPORTS).toContainEqual({ name: markName, modulePath: `marks/${markName}.tsx`, typeOnly: false });
      expect([`marks/${markName}.dom.tsx`, `marks/${markName}.stories.tsx`].filter((path) => !existsSync(join(PACKAGE_FOLDER, path)))).toEqual([]);
    }
  });

  test('the stylesheet a page links by its path exists', () => {
    expect(existsSync(join(PACKAGE_FOLDER, LINKED_STYLESHEET_PATH))).toBe(true);
  });

  test('the reading of the interface file names a planted export with its module and whether it is a type', () => {
    const planted = 'export { PlantedMark } from \'./marks/PlantedMark.tsx\';\nexport type { PlantedProps, OtherProps } from \'./marks/PlantedMark.tsx\';\n';
    expect(interfaceExportsOf(planted)).toEqual([
      { name: 'PlantedMark', modulePath: 'marks/PlantedMark.tsx', typeOnly: false },
      { name: 'PlantedProps', modulePath: 'marks/PlantedMark.tsx', typeOnly: true },
      { name: 'OtherProps', modulePath: 'marks/PlantedMark.tsx', typeOnly: true },
    ]);
  });
});
