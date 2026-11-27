/**
 * The guard that keeps this a package any server can use, unchanged in any repository. What matters: no module imports anything outside
 * the package, and no file, its README included, names a system that uses it. The scan first proves it read the package, and each form is
 * planted.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize }  from 'node:path';
import { describe, expect, test }    from 'bun:test';
import typescript                    from 'typescript';

interface PackageFile {
  readonly path: string;
  readonly text: string;
}

const PACKAGE_FOLDER = join(import.meta.dir, '..');
const THIS_SPEC_PATH = join('architecture', 'architecture/PackageIsolation.spec.ts');
const SPEC_PACKAGES: readonly string[] = ['bun:test', 'node:fs', 'node:path', 'typescript'];
/** The systems that use the package. This spec is the one file that names them. */
const USER_WORDS = /\b(forge|forges|gaia|hephaestus|bridge)\b/gi;

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
      if (source.path.endsWith('.spec.ts')) return SPEC_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which no spec may import`];
      return [`${source.path} imports ${specifier}, which no module may import`];
    }));
}

function userWordSentencesOf(files: readonly PackageFile[]): string[] {
  return files.filter((file) => file.path !== THIS_SPEC_PATH)
    .flatMap((file) => [...file.text.matchAll(USER_WORDS)].map((match) => `${file.path} names "${match[0]}"`));
}

const SOURCES = packageFilesMatching(/\.ts$/);
const EVERY_TEXT_FILE = packageFilesMatching(/\.(?:ts|md|json|js)$/);

describe('the package\'s isolation', () => {
  test('the scan reads the package\'s sources and its README', () => {
    expect(SOURCES.map((source) => source.path)).toContain(join('utils', 'CompatibilityRegistryUtil.ts'));
    expect(EVERY_TEXT_FILE.map((file) => file.path)).toContain('README.md');
  });

  test('every planted form is caught', () => {
    expect(importSentencesOf([
      { path: 'utils/Planted.ts', text: 'import { x } from \'../../elsewhere/Planted.ts\';' },
      { path: 'utils/Planted.ts', text: 'import { readFileSync } from \'node:fs\';' },
      { path: 'utils/Planted.spec.ts', text: 'import { x } from \'react\';' },
    ])).toHaveLength(3);
    expect(userWordSentencesOf([{ path: 'README.md', text: 'Each Forge keeps one, and so does Gaia.' }])).toEqual(['README.md names "Forge"', 'README.md names "Gaia"']);
  });

  test('nothing imports outside the package, and a module imports nothing at all', () => {
    expect(importSentencesOf(SOURCES)).toEqual([]);
  });

  test('no file names a system that uses the package', () => {
    expect(userWordSentencesOf(EVERY_TEXT_FILE)).toEqual([]);
  });
});
