/**
 * The page's folders import one way: the shell draws the views, so no view and nothing shared imports the shell, and nothing shared
 * imports a view. What matters: the rule reads every shipping module of `page/views/` and `page/shared/`, specs aside, since a spec may
 * render the whole shell; and the guard is first proved on a planted case, in memory.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative }   from 'node:path';

import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

const PAGE_FOLDER = import.meta.dir;

/** Each folder that must not reach another, with the folders it must not import. */
const FORBIDDEN_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  views:  ['shell'],
  shared: ['shell', 'views'],
};

function shippingModulesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.spec\.tsx?$/.test(path))
    .map((path) => join(folder, path));
}

/** The page folder each relative import of a module lands in, by its first segment under `page/`. */
function importedPageFoldersOf(modulePath: string, source: string): string[] {
  return typescript.preProcessFile(source, true, true).importedFiles
    .map((importedFile) => importedFile.fileName)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => relative(PAGE_FOLDER, join(dirname(modulePath), specifier)).split('/')[0] ?? '');
}

function forbiddenImportsOf(folder: string, modulePath: string, source: string): string[] {
  const forbidden = FORBIDDEN_IMPORTS[folder] ?? [];
  return importedPageFoldersOf(modulePath, source)
    .filter((importedFolder) => forbidden.includes(importedFolder))
    .map((importedFolder) => `${relative(PAGE_FOLDER, modulePath)} imports page/${importedFolder}`);
}

describe('the page\'s import direction', () => {
  test('the guard catches a view that imports the shell and a shared module that imports a view', () => {
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'agents', 'Planted.ts'), 'import { RailModel } from \'../../shell/RailModel.ts\';'))
      .toEqual(['views/agents/Planted.ts imports page/shell']);
    expect(forbiddenImportsOf('shared', join(PAGE_FOLDER, 'shared', 'utils', 'Planted.ts'), 'import type { AgentsContent } from \'../../views/agents/AgentsModel.ts\';'))
      .toEqual(['shared/utils/Planted.ts imports page/views']);
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'agents', 'Planted.ts'), 'import { HashRouter } from \'../../shared/HashRouter.ts\';')).toEqual([]);
  });

  test('no view and nothing shared imports the shell, and nothing shared imports a view', () => {
    const forbidden = Object.keys(FORBIDDEN_IMPORTS).flatMap((folder) => shippingModulesUnder(join(PAGE_FOLDER, folder))
      .flatMap((modulePath) => forbiddenImportsOf(folder, modulePath, readFileSync(modulePath, 'utf8'))));
    expect(forbidden).toEqual([]);
  });
});
