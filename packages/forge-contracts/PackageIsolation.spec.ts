/**
 * The guard that keeps forge's contracts free of any client: forge never knows who calls it, so no file of the package, its README and
 * manifest included, names a client's word, and nothing imports from outside the package but the version model it is built on. The scan
 * first proves it read the package, and each form is planted.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize }  from 'node:path';
import { describe, expect, test }    from 'bun:test';
import typescript                    from 'typescript';

interface PackageFile {
  readonly path: string;
  readonly text: string;
}

const PACKAGE_FOLDER = import.meta.dir;
const THIS_SPEC_PATH = 'PackageIsolation.spec.ts';
const MODULE_PACKAGE_PREFIX = 'system-versions/';
const SPEC_PACKAGES: readonly string[] = ['bun:test', 'node:fs', 'node:path', 'typescript'];
/** The words of a client that sits on top of forge: its name and its own domain. This spec is the one file that names them. */
const CLIENT_WORDS = /\b(gaia|fleet)\b/gi;

function packageFilesMatching(pattern: RegExp): PackageFile[] {
  return readdirSync(PACKAGE_FOLDER, { recursive: true, encoding: 'utf8' })
    .filter((path) => !path.startsWith('node_modules') && pattern.test(path))
    .sort()
    .map((path) => ({ path, text: readFileSync(join(PACKAGE_FOLDER, path), 'utf8') }));
}

function importSentencesOf(sources: readonly PackageFile[]): string[] {
  return sources.flatMap((source) => typescript.preProcessFile(source.text, true, true).importedFiles.map((importedFile) => importedFile.fileName)
    .flatMap((specifier): string[] => {
      if (specifier.startsWith('.')) {
        return normalize(join(dirname(source.path), specifier)).startsWith('..') ? [`${source.path} imports ${specifier}, outside the package`] : [];
      }
      if (specifier.startsWith(MODULE_PACKAGE_PREFIX)) return [];
      if (source.path.endsWith('.spec.ts')) return SPEC_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which no spec may import`];
      return [`${source.path} imports ${specifier}, which no module may import`];
    }));
}

function clientWordSentencesOf(files: readonly PackageFile[]): string[] {
  return files.filter((file) => file.path !== THIS_SPEC_PATH)
    .flatMap((file) => [...file.text.matchAll(CLIENT_WORDS)].map((match) => `${file.path} names the client word "${match[0]}"`));
}

const SOURCES = packageFilesMatching(/\.ts$/);
const EVERY_TEXT_FILE = packageFilesMatching(/\.(?:ts|md|json|js)$/);

describe('forge\'s contracts know no client', () => {
  test('the scan reads the package\'s sources, its README and its manifest', () => {
    expect(SOURCES.map((source) => source.path)).toContain(join('constants', 'ForgeCompatibilityRegistry.ts'));
    expect(EVERY_TEXT_FILE.map((file) => file.path)).toEqual(expect.arrayContaining(['README.md', 'package.json']));
  });

  test('every planted form is caught', () => {
    expect(importSentencesOf([
      { path: 'constants/Planted.ts', text: 'import { x } from \'../../../apps/elsewhere/Planted.ts\';' },
      { path: 'constants/Planted.ts', text: 'import { readFileSync } from \'node:fs\';' },
      { path: 'constants/Planted.spec.ts', text: 'import { x } from \'react\';' },
    ])).toHaveLength(3);
    expect(clientWordSentencesOf([
      { path: 'README.md', text: 'Gaia reads the monitor.' },
      { path: '@types/Planted.ts', text: 'export type StartedBy = \'gaia\';' },
      { path: 'package.json', text: '"description": "the fleet\'s forges"' },
    ])).toEqual([
      'README.md names the client word "Gaia"',
      '@types/Planted.ts names the client word "gaia"',
      'package.json names the client word "fleet"',
    ]);
  });

  test('nothing imports from outside the package but the version model', () => {
    expect(importSentencesOf(SOURCES)).toEqual([]);
  });

  test('no file names a client\'s word', () => {
    expect(clientWordSentencesOf(EVERY_TEXT_FILE)).toEqual([]);
  });
});
