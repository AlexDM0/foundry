/**
 * The page's folders import one way: the shell draws the views, so no view and nothing shared imports the shell, and nothing shared
 * imports a view; the board, which a view may draw, imports neither the shell nor a view. And the page reaches no forge: no module the page
 * project compiles, the shared files its tsconfig names among them, imports `forge-contracts` or a path under `apps/forge/`, and no page
 * module or shared file reaches a file outside `page/` but those shared files; read through the compiler, the page program compiles no
 * Gaia file the tsconfig leaves out, nothing under `apps/forge/` and no `forge-contracts` file. Gaia's own components under
 * `page/components/` import no shell, view or board. The Flint library is imported only from `page/board/`; that every import of a library
 * names its interface file is `LibraryBoundaries.spec.ts`'s to hold. What matters: the rules read every shipping module, specs aside,
 * since a spec may render the whole shell; and each guard is first proved on a planted case, in memory.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative }               from 'node:path';

import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

const PAGE_FOLDER = import.meta.dir;
const GAIA_FOLDER = join(PAGE_FOLDER, '..');
const WORKSPACE_ROOT = join(GAIA_FOLDER, '..', '..');
const PAGE_PROJECT_PATH = join(PAGE_FOLDER, 'tsconfig.json');
const FORGE_APP_PATH_PREFIX = 'apps/forge/';
const FORGE_CONTRACTS_PACKAGE = 'forge-contracts';
const FLINT_LIBRARY_FOLDER_PREFIX = 'page/lib/flint/';
const BOARD_FOLDER_PREFIX = 'page/board/';

/** Each folder that must not reach another, with the folders it must not import. */
const FORBIDDEN_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  views:      ['shell'],
  shared:     ['shell', 'views'],
  board:      ['shell', 'views'],
  components: ['shell', 'views', 'board'],
};

const FORGE_CONTRACTS_FOLDER_PREFIX = 'packages/forge-contracts/';

function shippingModulesUnder(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.(?:spec|dom)\.tsx?$/.test(path))
    .map((path) => join(folder, path));
}

function importSpecifiersOf(source: string): string[] {
  return typescript.preProcessFile(source, true, true).importedFiles.map((importedFile) => importedFile.fileName);
}

/** The page folder each relative import of a module lands in, by its first segment under `page/`. */
function importedPageFoldersOf(modulePath: string, source: string): string[] {
  return importSpecifiersOf(source)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => relative(PAGE_FOLDER, join(dirname(modulePath), specifier)).split('/')[0] ?? '');
}

function forbiddenImportsOf(folder: string, modulePath: string, source: string): string[] {
  const forbidden = FORBIDDEN_IMPORTS[folder] ?? [];
  return importedPageFoldersOf(modulePath, source)
    .filter((importedFolder) => forbidden.includes(importedFolder))
    .map((importedFolder) => `${relative(PAGE_FOLDER, modulePath)} imports page/${importedFolder}`);
}

function pageProject(): typescript.ParsedCommandLine {
  const { config } = typescript.readConfigFile(PAGE_PROJECT_PATH, (path) => typescript.sys.readFile(path)) as { config: unknown };
  return typescript.parseJsonConfigFileContent(config, typescript.sys, PAGE_FOLDER);
}

/** Every module the page project names, as the compiler lists them from the tsconfig: the page's own and the shared files it names. */
function pageProjectModules(): string[] {
  return pageProject().fileNames;
}

/** Every file the page program compiles outside `node_modules`: the named modules and each file they reach, through any import. */
function pageProgramFiles(): string[] {
  const project = pageProject();
  return typescript.createProgram(project.fileNames, project.options).getSourceFiles()
    .map((sourceFile) => sourceFile.fileName)
    .filter((path) => !path.split('/').includes('node_modules'));
}

/**
 * A compiled file the page may not hold: a Gaia file the tsconfig does not name (reached through a named one), a file under `apps/forge/`,
 * or a `forge-contracts` file.
 */
function compiledFileSentencesOf(compiledFiles: readonly string[], namedFiles: readonly string[]): string[] {
  return compiledFiles.flatMap((path) => {
    const workspaceName = relative(WORKSPACE_ROOT, path);
    const gaiaName = relative(GAIA_FOLDER, path);
    if (workspaceName.startsWith(FORGE_APP_PATH_PREFIX)) return [`${workspaceName} is under ${FORGE_APP_PATH_PREFIX} and the page program compiles it`];
    if (workspaceName.startsWith(FORGE_CONTRACTS_FOLDER_PREFIX)) {
      return [`${workspaceName} is a forge-contracts file the page program compiles`];
    }
    const isGaiaFile = !gaiaName.startsWith('..');
    if (isGaiaFile && !gaiaName.startsWith('page/') && !namedFiles.includes(path)) return [`${gaiaName} is compiled by the page program but page/tsconfig.json does not name it`];
    return [];
  });
}

function sharedFilesOf(projectModules: readonly string[]): ReadonlySet<string> {
  return new Set(projectModules
    .filter((modulePath) => relative(PAGE_FOLDER, modulePath).startsWith('..'))
    .map((modulePath) => relative(GAIA_FOLDER, modulePath)));
}

/**
 * A module's reaches past the page's boundary: an import of `forge-contracts`, of a path under
 * `apps/forge/`, and, for a page module or a shared file, of a file outside `page/` that the project does not name as a shared file.
 */
function forgeReachesOf(modulePath: string, source: string, sharedFiles: ReadonlySet<string>): string[] {
  const moduleName = relative(GAIA_FOLDER, modulePath);
  return importSpecifiersOf(source).flatMap((specifier) => {
    if (specifier === FORGE_CONTRACTS_PACKAGE || specifier.startsWith(`${FORGE_CONTRACTS_PACKAGE}/`)) {
      return [`${moduleName} imports ${specifier}`];
    }
    if (!specifier.startsWith('.')) return specifier.includes(FORGE_APP_PATH_PREFIX) ? [`${moduleName} imports ${specifier}`] : [];
    const importedPath = join(dirname(modulePath), specifier);
    if (relative(WORKSPACE_ROOT, importedPath).startsWith(FORGE_APP_PATH_PREFIX)) return [`${moduleName} imports ${specifier}, under ${FORGE_APP_PATH_PREFIX}`];
    const importedName = relative(GAIA_FOLDER, importedPath);
    const landsOutsideThePage = !importedName.startsWith('page/');
    if (landsOutsideThePage && !sharedFiles.has(importedName)) return [`${moduleName} imports ${importedName}, which page/tsconfig.json does not name`];
    return [];
  });
}

/** A page module's imports of the Flint library: only a module under `page/board/` reaches it. */
function flintReachesOf(modulePath: string, source: string): string[] {
  const moduleName = relative(GAIA_FOLDER, modulePath);
  if (moduleName.startsWith(BOARD_FOLDER_PREFIX) || moduleName.startsWith(FLINT_LIBRARY_FOLDER_PREFIX)) return [];
  return importSpecifiersOf(source)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => relative(GAIA_FOLDER, join(dirname(modulePath), specifier)))
    .filter((importedName) => importedName.startsWith(FLINT_LIBRARY_FOLDER_PREFIX))
    .map((importedName) => `${moduleName} imports ${importedName} outside ${BOARD_FOLDER_PREFIX}`);
}

describe('the page\'s import direction', () => {
  test('the guard catches a view that imports the shell and a shared module that imports a view', () => {
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'agents', 'Planted.ts'), 'import { RailModel } from \'../../shell/RailModel.ts\';'))
      .toEqual(['views/agents/Planted.ts imports page/shell']);
    expect(forbiddenImportsOf('shared', join(PAGE_FOLDER, 'shared', 'utils', 'Planted.ts'), 'import type { AgentsContent } from \'../../views/agents/AgentsModel.ts\';'))
      .toEqual(['shared/utils/Planted.ts imports page/views']);
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'agents', 'Planted.ts'), 'import { HashRouter } from \'../../shared/HashRouter.ts\';')).toEqual([]);
  });

  test('the guard catches a board module that imports the shell or a view, and passes a view that imports the board', () => {
    expect(forbiddenImportsOf('board', join(PAGE_FOLDER, 'board', 'shell', 'Planted.ts'), 'import { RailModel } from \'../../shell/RailModel.ts\';'))
      .toEqual(['board/shell/Planted.ts imports page/shell']);
    expect(forbiddenImportsOf('board', join(PAGE_FOLDER, 'board', 'Planted.tsx'), 'import { AgentsView } from \'../views/agents/AgentsView.tsx\';'))
      .toEqual(['board/Planted.tsx imports page/views']);
    expect(forbiddenImportsOf('views', join(PAGE_FOLDER, 'views', 'forge', 'Planted.tsx'), 'import { BoardRoot } from \'../../board/shell/BoardRoot.tsx\';')).toEqual([]);
  });

  test('the guard catches a component of Gaia that imports the shell, a view or the board, and passes one that imports a library', () => {
    const plantedComponent = join(PAGE_FOLDER, 'components', 'Planted.tsx');
    expect(forbiddenImportsOf('components', plantedComponent, 'import { RailModel } from \'../shell/RailModel.ts\';')).toEqual(['components/Planted.tsx imports page/shell']);
    expect(forbiddenImportsOf('components', plantedComponent, 'import { BoardRoot } from \'../board/shell/BoardRoot.tsx\';'))
      .toEqual(['components/Planted.tsx imports page/board']);
    expect(forbiddenImportsOf('components', plantedComponent, 'import { Button } from \'../lib/design-system/DesignSystemInterface.ts\';')).toEqual([]);
  });

  test('no view and nothing shared imports the shell, nothing shared imports a view, the board imports neither, and no component imports any', () => {
    expect(shippingModulesUnder(join(PAGE_FOLDER, 'components')).length).toBeGreaterThan(0);
    const forbidden = Object.keys(FORBIDDEN_IMPORTS).flatMap((folder) => shippingModulesUnder(join(PAGE_FOLDER, folder))
      .flatMap((modulePath) => forbiddenImportsOf(folder, modulePath, readFileSync(modulePath, 'utf8'))));
    expect(forbidden).toEqual([]);
  });
});

describe('the page\'s reach past its boundary', () => {
  const plantedSharedFiles: ReadonlySet<string> = new Set(['src/shared/constants/PageContractVersions.ts']);
  const plantedBoardModule = join(PAGE_FOLDER, 'board', 'Planted.ts');

  test('the guard names a page module that imports forge-contracts, by its package or by one of its exports', () => {
    expect(forgeReachesOf(plantedBoardModule, 'import type { ForgeBoardDocument } from \'forge-contracts/ForgeBoardDocument\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports forge-contracts/ForgeBoardDocument']);
    expect(forgeReachesOf(plantedBoardModule, 'export * from \'forge-contracts\';', plantedSharedFiles)).toEqual(['page/board/Planted.ts imports forge-contracts']);
  });

  test('the guard names a module that imports a path under apps/forge/, relative or by a package path', () => {
    expect(forgeReachesOf(plantedBoardModule, 'import { Board } from \'../../../forge/src/shared/model/Board.ts\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports ../../../forge/src/shared/model/Board.ts, under apps/forge/']);
    expect(forgeReachesOf(plantedBoardModule, 'import { Board } from \'forge-monorepo/apps/forge/src/shared/model/Board.ts\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports forge-monorepo/apps/forge/src/shared/model/Board.ts']);
  });

  test('the guard names a shared file the page includes that imports forge-contracts', () => {
    const plantedSharedModule = join(GAIA_FOLDER, 'src', 'shared', 'constants', 'PageContractVersions.ts');
    expect(forgeReachesOf(plantedSharedModule, 'import { OVERSEER_CONTRACT_VERSIONS } from \'forge-contracts/OverseerContractVersions\';', plantedSharedFiles))
      .toEqual(['src/shared/constants/PageContractVersions.ts imports forge-contracts/OverseerContractVersions']);
  });

  test('the guard names a page module that reaches a file outside page/ the tsconfig does not name, and passes one it names', () => {
    expect(forgeReachesOf(plantedBoardModule, 'import { CONTRACT_VERSIONS } from \'../../src/shared/constants/ContractVersions.ts\';', plantedSharedFiles))
      .toEqual(['page/board/Planted.ts imports src/shared/constants/ContractVersions.ts, which page/tsconfig.json does not name']);
    expect(forgeReachesOf(plantedBoardModule, 'import { PAGE_CONTRACT_VERSIONS } from \'../../src/shared/constants/PageContractVersions.ts\';', plantedSharedFiles)).toEqual([]);
  });

  test('the guard names a shared file the page includes that imports a file outside page/ the tsconfig does not name', () => {
    const plantedSharedModule = join(GAIA_FOLDER, 'src', 'shared', 'constants', 'PageContractVersions.ts');
    expect(forgeReachesOf(plantedSharedModule, 'import { CONTRACT_VERSIONS } from \'./ContractVersions.ts\';', plantedSharedFiles))
      .toEqual(['src/shared/constants/PageContractVersions.ts imports src/shared/constants/ContractVersions.ts, which page/tsconfig.json does not name']);
    expect(forgeReachesOf(plantedSharedModule, 'import { PAGE_CONTRACT_VERSIONS } from \'./PageContractVersions.ts\';', plantedSharedFiles)).toEqual([]);
  });

  test('the compiled-file guard names an unnamed Gaia file, a file under apps/forge/ and every forge-contracts file', () => {
    const namedSharedFile = join(GAIA_FOLDER, 'src', 'shared', 'constants', 'PageContractVersions.ts');
    const plantedCompiledFiles = [
      join(PAGE_FOLDER, 'Main.tsx'),
      namedSharedFile,
      join(GAIA_FOLDER, 'src', 'shared', 'constants', 'ContractVersions.ts'),
      join(WORKSPACE_ROOT, 'apps', 'forge', 'src', 'shared', 'model', 'Board.ts'),
      join(WORKSPACE_ROOT, 'packages', 'forge-contracts', '@types', 'ForgeBoardDocument.ts'),
      join(WORKSPACE_ROOT, 'packages', 'forge-contracts', '@types', 'IdentityDocument.ts'),
      join(PAGE_FOLDER, 'lib', 'design-system', 'atoms', 'Button.tsx'),
    ];
    expect(compiledFileSentencesOf(plantedCompiledFiles, [namedSharedFile])).toEqual([
      'src/shared/constants/ContractVersions.ts is compiled by the page program but page/tsconfig.json does not name it',
      'apps/forge/src/shared/model/Board.ts is under apps/forge/ and the page program compiles it',
      'packages/forge-contracts/@types/ForgeBoardDocument.ts is a forge-contracts file the page program compiles',
      'packages/forge-contracts/@types/IdentityDocument.ts is a forge-contracts file the page program compiles',
    ]);
  });

  test('the guard names any page module that imports forge-contracts, none excepted', () => {
    const plantedForgeViewPath = join(PAGE_FOLDER, 'views', 'forge', 'ForgeView.tsx');
    expect(forgeReachesOf(plantedForgeViewPath, 'import type { ForgeBoardDocument } from \'forge-contracts/ForgeBoardDocument\';', plantedSharedFiles))
      .toEqual(['page/views/forge/ForgeView.tsx imports forge-contracts/ForgeBoardDocument']);
  });

  test('the scan reads the page\'s modules and the shared files its tsconfig names, and no spec', () => {
    const projectModuleNames = pageProjectModules().map((modulePath) => relative(GAIA_FOLDER, modulePath));
    expect(projectModuleNames).toContain('page/Main.tsx');
    expect(projectModuleNames).toContain('page/views/forge/ForgeView.tsx');
    expect(projectModuleNames).toContain('src/shared/constants/PageContractVersions.ts');
    expect(projectModuleNames).not.toContain('src/shared/constants/ContractVersions.ts');
    expect(projectModuleNames.filter((moduleName) => /\.(?:spec|dom)\.tsx?$/.test(moduleName))).toEqual([]);
  });

  test('no module the page project compiles reaches forge-contracts or apps/forge/', () => {
    const projectModules = pageProjectModules();
    const sharedFiles = sharedFilesOf(projectModules);
    expect(projectModules.flatMap((modulePath) => forgeReachesOf(modulePath, readFileSync(modulePath, 'utf8'), sharedFiles))).toEqual([]);
  });

  test('the page program, read through the compiler, compiles the library files it reaches and no file it may not hold', () => {
    const compiledFiles = pageProgramFiles();
    expect(compiledFiles.map((path) => relative(GAIA_FOLDER, path))).toContain('page/lib/design-system/atoms/Button.tsx');
    expect(compiledFileSentencesOf(compiledFiles, pageProjectModules())).toEqual([]);
  });
});

describe('Flint on the page', () => {
  const flintInterfaceImport = 'import { Flint } from \'../../lib/flint/FlintInterface.ts\';';

  test('the guard names Flint imported outside page/board/, and passes a board module and Flint\'s own', () => {
    expect(flintReachesOf(join(PAGE_FOLDER, 'views', 'agents', 'Planted.tsx'), flintInterfaceImport))
      .toEqual(['page/views/agents/Planted.tsx imports page/lib/flint/FlintInterface.ts outside page/board/']);
    expect(flintReachesOf(join(PAGE_FOLDER, 'Planted.tsx'), 'import { mindOf } from \'./lib/flint/mind/Mind.ts\';'))
      .toEqual(['page/Planted.tsx imports page/lib/flint/mind/Mind.ts outside page/board/']);
    expect(flintReachesOf(join(PAGE_FOLDER, 'board', 'flint', 'Planted.tsx'), flintInterfaceImport)).toEqual([]);
    expect(flintReachesOf(join(PAGE_FOLDER, 'lib', 'flint', 'react', 'Planted.tsx'), 'import { createFlint } from \'../CreateFlint.ts\';')).toEqual([]);
  });

  test('every page module that imports Flint sits under page/board/, and the board does import it', () => {
    const shippingPageModules = shippingModulesUnder(PAGE_FOLDER).filter((modulePath) => !relative(PAGE_FOLDER, modulePath).startsWith('lib/'));
    const flintImporters = shippingPageModules.filter((modulePath) => readFileSync(modulePath, 'utf8').includes('lib/flint/FlintInterface.ts'));
    expect(flintImporters.length).toBeGreaterThan(0);
    expect(shippingPageModules.flatMap((modulePath) => flintReachesOf(modulePath, readFileSync(modulePath, 'utf8')))).toEqual([]);
  });
});
