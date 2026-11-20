/**
 * Every workspace package Gaia's code names by a bare specifier is declared in Gaia's `package.json`, or neither the workspace install nor
 * turbo knows Gaia depends on it, and a change to that package would leave Gaia's cached checks green. What matters: the scan reads the
 * imports, re-exports and dynamic imports of `src/` and `page/` and the stylesheets `page/index.html` links, sees the workspace's packages
 * from its manifest, and each form is planted to prove the guard names it.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

const GAIA_FOLDER = join(import.meta.dir, '..');
const WORKSPACE_ROOT = join(GAIA_FOLDER, '..', '..');
const SCANNED_SOURCE_GLOBS = ['src/**/*.{ts,tsx}', 'page/**/*.{ts,tsx}'];
const PAGE_INDEX_PATH = 'page/index.html';
const LINKED_ADDRESS = /(?:href|src)="(?<address>[^"]+)"/g;
const RELATIVE_OR_ABSOLUTE_ADDRESS = /^(?:\.|\/|[a-z]+:)/;
const MINIMUM_SCANNED_SOURCE_COUNT = 100;

interface PackageManifest {
  readonly name?:            string;
  readonly workspaces?:      readonly string[];
  readonly dependencies?:    Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

interface ScannedFile {
  readonly path:           string;
  readonly bareSpecifiers: readonly string[];
}

function manifestAt(folder: string): PackageManifest {
  return JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as PackageManifest;
}

function workspacePackageNames(): Set<string> {
  const memberManifestPaths = (manifestAt(WORKSPACE_ROOT).workspaces ?? [])
    .flatMap((memberPattern) => [...new Bun.Glob(`${memberPattern}/package.json`).scanSync({ cwd: WORKSPACE_ROOT })]);
  const memberNames = memberManifestPaths.map((manifestPath) => manifestAt(join(WORKSPACE_ROOT, manifestPath, '..')).name ?? '');
  return new Set(memberNames.filter((memberName) => memberName !== '' && memberName !== manifestAt(GAIA_FOLDER).name));
}

function declaredPackageNames(): Set<string> {
  const gaiaManifest = manifestAt(GAIA_FOLDER);
  return new Set([...Object.keys(gaiaManifest.dependencies ?? {}), ...Object.keys(gaiaManifest.devDependencies ?? {})]);
}

/** The package a bare specifier names: its first segment, or its first two when scoped. */
function packageNameOf(specifier: string): string {
  const segments = specifier.split('/');
  return (specifier.startsWith('@') ? segments.slice(0, 2) : segments.slice(0, 1)).join('/');
}

function bareSpecifiersInSource(sourceText: string): string[] {
  return typescript.preProcessFile(sourceText, true, true).importedFiles
    .map((importedFile) => importedFile.fileName)
    .filter((specifier) => !RELATIVE_OR_ABSOLUTE_ADDRESS.test(specifier));
}

function bareSpecifiersInPage(pageText: string): string[] {
  return [...pageText.matchAll(LINKED_ADDRESS)]
    .map((match) => match.groups?.['address'] ?? '')
    .filter((address) => address !== '' && !RELATIVE_OR_ABSOLUTE_ADDRESS.test(address));
}

function scannedFiles(): ScannedFile[] {
  const sourceFiles = SCANNED_SOURCE_GLOBS
    .flatMap((sourceGlob) => [...new Bun.Glob(sourceGlob).scanSync({ cwd: GAIA_FOLDER })])
    .map((path) => ({ path, bareSpecifiers: bareSpecifiersInSource(readFileSync(join(GAIA_FOLDER, path), 'utf8')) }));
  const pageFile = { path: PAGE_INDEX_PATH, bareSpecifiers: bareSpecifiersInPage(readFileSync(join(GAIA_FOLDER, PAGE_INDEX_PATH), 'utf8')) };
  return [...sourceFiles, pageFile];
}

function undeclaredWorkspaceReachesOf(files: readonly ScannedFile[], workspaceNames: ReadonlySet<string>, declaredNames: ReadonlySet<string>): string[] {
  return files.flatMap(({ path, bareSpecifiers }) => [...new Set(bareSpecifiers.map(packageNameOf))]
    .filter((packageName) => workspaceNames.has(packageName) && !declaredNames.has(packageName))
    .map((packageName) => `${path} imports the workspace package ${packageName}, which Gaia's package.json does not declare`));
}

describe('the workspace packages Gaia reaches', () => {
  test('the scan sees Gaia\'s sources, its page and the workspace\'s packages', () => {
    const scannedPaths = scannedFiles().map(({ path }) => path);
    expect(scannedPaths).toContain('src/WorkspaceDependencies.spec.ts');
    expect(scannedPaths).toContain('page/Main.tsx');
    expect(scannedPaths).toContain(PAGE_INDEX_PATH);
    expect(scannedPaths.length).toBeGreaterThanOrEqual(MINIMUM_SCANNED_SOURCE_COUNT);
    expect([...workspacePackageNames()]).toEqual(expect.arrayContaining(['design-system', 'brand', 'flint', 'forge-contracts']));
    expect(declaredPackageNames().has('flint')).toBe(true);
    expect(workspacePackageNames().has('gaia')).toBe(false);
  });

  test('every workspace package a file names is declared in Gaia\'s package.json', () => {
    expect(undeclaredWorkspaceReachesOf(scannedFiles(), workspacePackageNames(), declaredPackageNames())).toEqual([]);
  });
});

describe('the guard on undeclared workspace packages', () => {
  const plantedWorkspaceNames = new Set(['example-package', '@example-scope/example-package']);
  const plantedDeclaredNames = new Set(['react']);
  const plantedForms: readonly (readonly [string, string])[] = [
    ['import { Button } from \'example-package/Button\';', 'example-package'],
    ['import type { Tone } from \'example-package\';', 'example-package'],
    ['export { Button } from \'example-package/Button\';', 'example-package'],
    ['const loaded = await import(\'example-package/Button\');', 'example-package'],
    ['import \'example-package/example-package.css\';', 'example-package'],
    ['import { Part } from \'@example-scope/example-package/Part\';', '@example-scope/example-package'],
  ];

  for (const [plantedSource, packageName] of plantedForms) {
    test(`names ${plantedSource}`, () => {
      const plantedFile = { path: 'src/Planted.ts', bareSpecifiers: bareSpecifiersInSource(plantedSource) };
      expect(undeclaredWorkspaceReachesOf([plantedFile], plantedWorkspaceNames, plantedDeclaredNames))
        .toEqual([`src/Planted.ts imports the workspace package ${packageName}, which Gaia's package.json does not declare`]);
    });
  }

  test('names a stylesheet the page links from an undeclared package, and passes over its own files', () => {
    const plantedPage = '<link rel="stylesheet" href="example-package/example-package.css"><link rel="stylesheet" href="./styles/gaia.css">';
    const plantedFile = { path: PAGE_INDEX_PATH, bareSpecifiers: bareSpecifiersInPage(plantedPage) };
    expect(undeclaredWorkspaceReachesOf([plantedFile], plantedWorkspaceNames, plantedDeclaredNames))
      .toEqual([`${PAGE_INDEX_PATH} imports the workspace package example-package, which Gaia's package.json does not declare`]);
  });

  test('passes over a declared package, an outside package and a relative import', () => {
    const plantedSource = 'import { useState } from \'react\';\nimport { join } from \'node:path\';\nimport { Local } from \'./Local.ts\';';
    const plantedFile = { path: 'src/Planted.ts', bareSpecifiers: bareSpecifiersInSource(plantedSource) };
    expect(undeclaredWorkspaceReachesOf([plantedFile], new Set([...plantedWorkspaceNames, 'react']), plantedDeclaredNames)).toEqual([]);
  });
});
