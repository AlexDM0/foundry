/**
 * The libraries of Gaia's page, each a folder of `page/lib/`. What matters: every library has exactly one interface file at its root,
 * named after its folder, a `README.md`, at least one spec and no `package.json`; code outside a library that imports a file of it imports
 * exactly its interface file, and a page or stylesheet outside it links only the files the library offers for linking; a file inside a
 * library reaches nothing outside its folder, no other library and no Gaia file; and inside a library only the interface file re-exports,
 * one name at a time, and no file imports its own interface file. The scan first proves it read every library, and each form is planted in
 * memory.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative }   from 'node:path';

import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

const PAGE_FOLDER = join(import.meta.dir, '..', 'page');
const GAIA_FOLDER = join(PAGE_FOLDER, '..');
const LIBRARY_ROOT = 'page/lib';
const SCANNED_FOLDERS = ['page', 'src', 'resources', 'architecture'];
const MODULE_PATH = /\.tsx?$/u;
const LINKING_FILE_PATH = /\.(?:html|css)$/u;
const SPEC_PATH = /\.spec\.tsx?$|\.dom\.tsx$/u;
const README_NAME = 'README.md';
const MANIFEST_NAME = 'package.json';
const INTERFACE_FILE_NAME = /^[A-Z]\w*Interface\.ts$/u;
const LINKED_ADDRESS = /(?:href|src)="(?<attributeAddress>[^"]+)"|url\(\s*["']?(?<urlAddress>[^"')]+)["']?\s*\)|@import\s+["'](?<importAddress>[^"']+)["']/gu;
const MINIMUM_LIBRARY_MODULE_COUNT = 5;

/** The files of each library that a page or a stylesheet outside it may link by path; a name ending in `/` offers every file under it. */
const LINKABLE_FILES: Readonly<Record<string, readonly string[]>> = {
  'design-system': ['styles/design-system.css', 'styles/tokens.css', 'fonts/'],
  'brand':         ['styles/brand.css'],
  'flint':         [],
};

interface ScannedFile {
  /** From Gaia's folder, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

/** The library a path sits in, or null outside `page/lib/`. */
function libraryNameOf(path: string): string | null {
  const [firstSegment, secondSegment, libraryName, ...rest] = path.split('/');
  return firstSegment === 'page' && secondSegment === 'lib' && libraryName !== undefined && rest.length > 0 ? libraryName : null;
}

/** `design-system` has `DesignSystemInterface.ts`: its folder's words, each capitalised, then `Interface`. */
function interfaceFileNameOf(libraryName: string): string {
  const words = libraryName.split('-').map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  return `${words.join('')}Interface.ts`;
}

function interfaceFilePathOf(libraryName: string): string {
  return `${LIBRARY_ROOT}/${libraryName}/${interfaceFileNameOf(libraryName)}`;
}

function pathWithinLibrary(path: string, libraryName: string): string {
  return path.slice(`${LIBRARY_ROOT}/${libraryName}/`.length);
}

/** The Gaia-relative path a relative address names from a file; one that climbs out of Gaia's folder starts with `../`. */
function targetPathOf(fromPath: string, address: string): string {
  return relative(GAIA_FOLDER, join(GAIA_FOLDER, dirname(fromPath), address)).split('\\').join('/');
}

function relativeImportTargetsOf(file: ScannedFile): string[] {
  return typescript.preProcessFile(file.text, true, true).importedFiles
    .map((importedFile) => importedFile.fileName)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => targetPathOf(file.path, specifier));
}

function relativeLinkTargetsOf(file: ScannedFile): string[] {
  return [...file.text.matchAll(LINKED_ADDRESS)]
    .map((match) => match.groups?.['attributeAddress'] ?? match.groups?.['urlAddress'] ?? match.groups?.['importAddress'] ?? '')
    .filter((address) => address.startsWith('.'))
    .map((address) => targetPathOf(file.path, address.replace(/[?#].*$/u, '')));
}

function libraryNamesIn(paths: readonly string[]): string[] {
  return [...new Set(paths.flatMap((path) => libraryNameOf(path) ?? []))].sort();
}

/** Rule 1: what every folder of `page/lib/` holds, read from the paths of all its files. */
function librarySetSentencesOf(libraryFilePaths: readonly string[]): string[] {
  return libraryNamesIn(libraryFilePaths).flatMap((libraryName) => {
    const ownPaths = libraryFilePaths.filter((path) => libraryNameOf(path) === libraryName).map((path) => pathWithinLibrary(path, libraryName));
    const rootInterfaceFiles = ownPaths.filter((path) => INTERFACE_FILE_NAME.test(path));
    const expectedInterfaceFile = interfaceFileNameOf(libraryName);
    const interfaceSentences = rootInterfaceFiles.length === 1 && rootInterfaceFiles[0] === expectedInterfaceFile
      ? []
      : [`${LIBRARY_ROOT}/${libraryName} has the interface files [${rootInterfaceFiles.join(', ')}] at its root; it has exactly one, ${expectedInterfaceFile}`];
    return [
      ...interfaceSentences,
      ...(ownPaths.includes(README_NAME) ? [] : [`${LIBRARY_ROOT}/${libraryName} has no ${README_NAME}`]),
      ...(ownPaths.some((path) => SPEC_PATH.test(path)) ? [] : [`${LIBRARY_ROOT}/${libraryName} has no spec`]),
      ...ownPaths.filter((path) => path.split('/').at(-1) === MANIFEST_NAME).map((path) => `${LIBRARY_ROOT}/${libraryName}/${path} is a manifest; a library has none`),
    ];
  });
}

/** Rule 2 for a module: outside a library, an import of one of its files names exactly its interface file. */
function outsideImportSentencesOf(file: ScannedFile): string[] {
  const ownLibraryName = libraryNameOf(file.path);
  return relativeImportTargetsOf(file).flatMap((targetPath) => {
    const targetLibraryName = libraryNameOf(targetPath);
    if (targetLibraryName === null || targetLibraryName === ownLibraryName || targetPath === interfaceFilePathOf(targetLibraryName)) return [];
    if (ownLibraryName !== null) return [];
    return [`${file.path} imports ${targetPath}; outside the library, import only ${interfaceFilePathOf(targetLibraryName)}`];
  });
}

function isLinkable(targetPath: string, libraryName: string): boolean {
  const pathInLibrary = pathWithinLibrary(targetPath, libraryName);
  return (LINKABLE_FILES[libraryName] ?? []).some((linkable) => (linkable.endsWith('/') ? pathInLibrary.startsWith(linkable) : pathInLibrary === linkable));
}

/** Rule 2 for a page or a stylesheet: outside a library, a link into it names only a file the library offers for linking. */
function outsideLinkSentencesOf(file: ScannedFile): string[] {
  if (libraryNameOf(file.path) !== null) return [];
  return relativeLinkTargetsOf(file).flatMap((targetPath) => {
    const targetLibraryName = libraryNameOf(targetPath);
    if (targetLibraryName === null || isLinkable(targetPath, targetLibraryName)) return [];
    return [`${file.path} links ${targetPath}, which the library ${targetLibraryName} does not offer for linking`];
  });
}

/** Rule 3: inside a library, a module imports nothing outside its folder. */
function insideImportSentencesOf(file: ScannedFile): string[] {
  const ownLibraryName = libraryNameOf(file.path);
  if (ownLibraryName === null) return [];
  return relativeImportTargetsOf(file)
    .filter((targetPath) => libraryNameOf(targetPath) !== ownLibraryName)
    .map((targetPath) => `${file.path} imports ${targetPath}, outside the library ${ownLibraryName}`);
}

/** Rule 4: inside a library only the interface file re-exports, one name at a time, and no file imports its own interface file. */
function facadeSentencesOf(file: ScannedFile): string[] {
  const ownLibraryName = libraryNameOf(file.path);
  if (ownLibraryName === null) return [];
  const interfaceFilePath = interfaceFilePathOf(ownLibraryName);
  const scriptKind = file.path.endsWith('.tsx') ? typescript.ScriptKind.TSX : typescript.ScriptKind.TS;
  const sourceFile = typescript.createSourceFile(file.path, file.text, typescript.ScriptTarget.Latest, true, scriptKind);
  const reExports = sourceFile.statements.filter(typescript.isExportDeclaration).filter((statement) => statement.moduleSpecifier !== undefined);
  if (file.path === interfaceFilePath) {
    return reExports
      .filter((reExport) => reExport.exportClause === undefined || !typescript.isNamedExports(reExport.exportClause))
      .map((reExport) => `${file.path} re-exports with ${reExport.getText(sourceFile)}; an interface file names each export one by one`);
  }
  return [
    ...reExports.map((reExport) => `${file.path} re-exports with ${reExport.getText(sourceFile)}; only ${interfaceFilePath} re-exports`),
    ...relativeImportTargetsOf(file).filter((targetPath) => targetPath === interfaceFilePath)
      .map(() => `${file.path} imports its own library's interface file; inside a library a file imports exactly the module it needs`),
  ];
}

function boundarySentencesOf(files: readonly ScannedFile[]): string[] {
  const modules = files.filter((file) => MODULE_PATH.test(file.path));
  const linkingFiles = files.filter((file) => LINKING_FILE_PATH.test(file.path));
  return [
    ...modules.flatMap(outsideImportSentencesOf),
    ...linkingFiles.flatMap(outsideLinkSentencesOf),
    ...modules.flatMap(insideImportSentencesOf),
    ...modules.flatMap(facadeSentencesOf),
  ];
}

function pathsUnder(folder: string): string[] {
  return readdirSync(join(GAIA_FOLDER, folder), { recursive: true, encoding: 'utf8' })
    .map((path) => `${folder}/${path.split('\\').join('/')}`)
    .filter((path) => !path.split('/').includes('node_modules'));
}

const LIBRARY_FILE_PATHS = pathsUnder(LIBRARY_ROOT).filter((path) => /\.[\w-]+$/u.test(path));
const SCANNED_FILES: readonly ScannedFile[] = SCANNED_FOLDERS.flatMap(pathsUnder)
  .filter((path) => MODULE_PATH.test(path) || LINKING_FILE_PATH.test(path))
  .sort()
  .map((path) => ({ path, text: readFileSync(join(GAIA_FOLDER, path), 'utf8') }));

describe('the scan itself', () => {
  test('it reads every library, its interface file and its modules, and Gaia\'s own modules and pages', () => {
    const libraryNames = libraryNamesIn(LIBRARY_FILE_PATHS);
    expect(libraryNames).toEqual(['brand', 'design-system', 'flint']);
    expect(Object.keys(LINKABLE_FILES).sort()).toEqual(libraryNames);
    const scannedPaths = SCANNED_FILES.map(({ path }) => path);
    for (const libraryName of Object.keys(LINKABLE_FILES)) {
      expect(scannedPaths).toContain(interfaceFilePathOf(libraryName));
      expect(scannedPaths.filter((path) => libraryNameOf(path) === libraryName && MODULE_PATH.test(path)).length).toBeGreaterThanOrEqual(MINIMUM_LIBRARY_MODULE_COUNT);
    }
    expect(scannedPaths).toContain('page/Main.tsx');
    expect(scannedPaths).toContain('page/index.html');
    expect(scannedPaths).toContain('page/styles/gaia.css');
    expect(scannedPaths).toContain('resources/page/loading.html');
    expect(scannedPaths).toContain('src/Main.ts');
  });

  test('it finds the imports of an interface file and the links into a library that the page makes', () => {
    const mainModule = SCANNED_FILES.find(({ path }) => path === 'page/Main.tsx') ?? { path: '', text: '' };
    expect(relativeImportTargetsOf(mainModule)).toContain('page/lib/design-system/DesignSystemInterface.ts');
    const pageIndex = SCANNED_FILES.find(({ path }) => path === 'page/index.html') ?? { path: '', text: '' };
    expect(relativeLinkTargetsOf(pageIndex)).toEqual(expect.arrayContaining(['page/lib/design-system/styles/design-system.css', 'page/lib/brand/styles/brand.css']));
    const splash = SCANNED_FILES.find(({ path }) => path === 'resources/page/loading.html') ?? { path: '', text: '' };
    expect(relativeLinkTargetsOf(splash)).toEqual(expect.arrayContaining([
      'page/lib/design-system/styles/tokens.css',
      'page/lib/design-system/fonts/inter/inter-latin-wght-normal.woff2',
    ]));
  });

  test('every linkable file a library offers exists', () => {
    const offered = Object.entries(LINKABLE_FILES).flatMap(([libraryName, linkables]) => linkables.map((linkable) => `${LIBRARY_ROOT}/${libraryName}/${linkable}`));
    expect(offered.filter((offeredPath) => !LIBRARY_FILE_PATHS.some((path) => (offeredPath.endsWith('/') ? path.startsWith(offeredPath) : path === offeredPath)))).toEqual([]);
  });
});

describe('the libraries of the page', () => {
  test('each has exactly one interface file at its root, a README, a spec and no manifest', () => {
    expect(librarySetSentencesOf(LIBRARY_FILE_PATHS)).toEqual([]);
  });

  test('code outside a library reaches only its interface file and linkable files, and a library reaches nothing outside itself and keeps one facade', () => {
    expect(boundarySentencesOf(SCANNED_FILES)).toEqual([]);
  });
});

describe('the guard still names each form, planted in memory', () => {
  const plantedModule = (path: string, text: string): ScannedFile => ({ path, text });

  test('a library with no interface file, a second one, a wrongly named one, no README, no spec, and a manifest', () => {
    expect(librarySetSentencesOf([
      'page/lib/planted-empty/Part.ts',
      'page/lib/planted-two/PlantedTwoInterface.ts',
      'page/lib/planted-two/OtherInterface.ts',
      'page/lib/planted-two/README.md',
      'page/lib/planted-two/Part.spec.ts',
      'page/lib/planted-named/WrongInterface.ts',
      'page/lib/planted-named/README.md',
      'page/lib/planted-named/parts/Part.dom.tsx',
      'page/lib/planted-named/package.json',
      'page/lib/planted-whole/PlantedWholeInterface.ts',
      'page/lib/planted-whole/README.md',
      'page/lib/planted-whole/parts/PartInterface.ts',
      'page/lib/planted-whole/parts/Part.spec.ts',
    ])).toEqual([
      'page/lib/planted-empty has the interface files [] at its root; it has exactly one, PlantedEmptyInterface.ts',
      'page/lib/planted-empty has no README.md',
      'page/lib/planted-empty has no spec',
      'page/lib/planted-named has the interface files [WrongInterface.ts] at its root; it has exactly one, PlantedNamedInterface.ts',
      'page/lib/planted-named/package.json is a manifest; a library has none',
      'page/lib/planted-two has the interface files [PlantedTwoInterface.ts, OtherInterface.ts] at its root; it has exactly one, PlantedTwoInterface.ts',
    ]);
  });

  test('a Gaia module of the page, the server or a spec that imports a library file other than its interface file', () => {
    expect(boundarySentencesOf([
      plantedModule('page/views/Planted.tsx', 'import { Button } from \'../lib/design-system/atoms/Button.tsx\';'),
      plantedModule('src/features/Planted.ts', 'export type { SpriteIntent } from \'../../page/lib/flint/SpriteHabitat.ts\';'),
      plantedModule('page/testing/Planted.spec.tsx', 'const loaded = await import(\'../lib/brand/marks/ForgeMark.tsx\');'),
      plantedModule('page/Planted.tsx', 'import \'./lib/design-system/styles/design-system.css\';'),
      plantedModule('page/views/Passing.tsx', 'import { Button } from \'../lib/design-system/DesignSystemInterface.ts\';'),
      plantedModule('page/board/Passing.tsx', 'import { Flint } from \'../lib/flint/FlintInterface.ts\';'),
    ])).toEqual([
      'page/views/Planted.tsx imports page/lib/design-system/atoms/Button.tsx; outside the library, import only page/lib/design-system/DesignSystemInterface.ts',
      'src/features/Planted.ts imports page/lib/flint/SpriteHabitat.ts; outside the library, import only page/lib/flint/FlintInterface.ts',
      'page/testing/Planted.spec.tsx imports page/lib/brand/marks/ForgeMark.tsx; outside the library, import only page/lib/brand/BrandInterface.ts',
      'page/Planted.tsx imports page/lib/design-system/styles/design-system.css; outside the library, import only page/lib/design-system/DesignSystemInterface.ts',
    ]);
  });

  test('a page or a stylesheet that links a library file the library does not offer, and the offered ones pass', () => {
    expect(boundarySentencesOf([
      plantedModule('page/planted.html', [
        '<link rel="stylesheet" href="./lib/design-system/styles/design-system.css">',
        '<link rel="stylesheet" href="./lib/design-system/atoms/Button.css">',
        '<link rel="stylesheet" href="./lib/brand/styles/brand.css">',
        '<script type="module" src="./lib/flint/CreateFlint.ts"></script>',
      ].join('\n')),
      plantedModule('resources/page/planted.html', '<style>@font-face { src: url("../../page/lib/design-system/fonts/inter/planted.woff2") format("woff2"); }</style>'),
      plantedModule('page/styles/planted.css', '@import "../lib/brand/marks/ForgeMark.css";\n.planted { background: url(../lib/design-system/styles/tokens.css); }'),
    ])).toEqual([
      'page/planted.html links page/lib/design-system/atoms/Button.css, which the library design-system does not offer for linking',
      'page/planted.html links page/lib/flint/CreateFlint.ts, which the library flint does not offer for linking',
      'page/styles/planted.css links page/lib/brand/marks/ForgeMark.css, which the library brand does not offer for linking',
    ]);
  });

  test('a library module that imports another library, even by its interface file, or a Gaia file', () => {
    expect(boundarySentencesOf([
      plantedModule('page/lib/design-system/atoms/Planted.tsx', 'import { Flint } from \'../../flint/FlintInterface.ts\';'),
      plantedModule('page/lib/flint/react/Planted.tsx', 'import { HashRouter } from \'../../../shared/HashRouter.ts\';'),
      plantedModule('page/lib/brand/marks/Planted.spec.ts', 'import { Limits } from \'../../../../src/shared/constants/Limits.ts\';'),
      plantedModule('page/lib/brand/marks/Passing.tsx', 'import { MARK_GEOMETRY } from \'../constants/MarkGeometry.ts\';\nimport { useState } from \'react\';'),
    ])).toEqual([
      'page/lib/design-system/atoms/Planted.tsx imports page/lib/flint/FlintInterface.ts, outside the library design-system',
      'page/lib/flint/react/Planted.tsx imports page/shared/HashRouter.ts, outside the library flint',
      'page/lib/brand/marks/Planted.spec.ts imports src/shared/constants/Limits.ts, outside the library brand',
    ]);
  });

  test('a barrel inside a library, an interface file that re-exports a whole module, and a file that imports its own interface file', () => {
    expect(boundarySentencesOf([
      plantedModule('page/lib/design-system/atoms/Index.ts', 'export { Button } from \'./Button.tsx\';'),
      plantedModule('page/lib/flint/react/Index.ts', 'export * from \'./Flint.tsx\';'),
      plantedModule('page/lib/brand/BrandInterface.ts', 'export { ForgeMark } from \'./marks/ForgeMark.tsx\';\nexport * from \'./constants/MarkGeometry.ts\';'),
      plantedModule('page/lib/design-system/molecules/Planted.tsx', 'import { Button } from \'../DesignSystemInterface.ts\';'),
      plantedModule('page/lib/flint/SpritePassing.ts', 'import type { Intent } from \'./Intent.ts\';\n\nexport type { Intent };'),
    ])).toEqual([
      'page/lib/design-system/atoms/Index.ts re-exports with export { Button } from \'./Button.tsx\';; only page/lib/design-system/DesignSystemInterface.ts re-exports',
      'page/lib/flint/react/Index.ts re-exports with export * from \'./Flint.tsx\';; only page/lib/flint/FlintInterface.ts re-exports',
      'page/lib/brand/BrandInterface.ts re-exports with export * from \'./constants/MarkGeometry.ts\';; an interface file names each export one by one',
      'page/lib/design-system/molecules/Planted.tsx imports its own library\'s interface file; inside a library a file imports exactly the module it needs',
    ]);
  });
});
