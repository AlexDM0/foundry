/**
 * The guard that keeps the brand a package that can move to any repository unchanged. What matters: no import leaves the folder; what ships
 * imports React and nothing else; a spec, a DOM spec, a story or a test helper only its listed tools; no stylesheet reference leaves the
 * folder; no colour is written outside `styles/tokens.css`; and no file names a word of a host, its name, its views or its domain, since
 * Forge's brand alone is the package's subject. The scan first proves it read the package, and each form is planted.
 */
import { dirname, join, normalize } from 'node:path';
import { describe, expect, test }   from 'bun:test';
import typescript                   from 'typescript';

import { type PackageFile, PackageFiles } from './testing/PackageFiles.ts';

const SHIPPING_PACKAGES: readonly string[] = ['react'];
const SPEC_PACKAGES: readonly string[] = ['bun:test', 'react', 'react-dom/server', '@testing-library/react', '@happy-dom/global-registrator', 'typescript', 'node:fs', 'node:path'];
const STORY_PACKAGES: readonly string[] = ['react', '@storybook/react-vite'];
const MINIMUM_SOURCE_COUNT = 10;
const COLOUR_VALUE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i;
const STYLESHEET_REFERENCE = /@import\s+(?:url\()?["']([^"']+)["']|url\(\s*["']?([^"')#]+)["']?\s*\)/g;
const COLOURED_PATHS = /^styles\/tokens\.css$/;
/** Words of the hosts that draw the marks: their views, their parts and their domain. This spec is the one file that names them. */
const HOST_WORDS: readonly string[] = [
  'gaia',
  'attention',
  'fleet',
  'splash',
  'rail',
  'artboard',
  'screens',
  'hephaestus',
  'tracker',
  'ticket',
  'tickets',
  'agent',
  'agents',
  'brain',
  'flint',
  'bridge',
  'board',
  'launcher',
];
const HOST_WORD = new RegExp(`\\b(${HOST_WORDS.join('|')})\\b`, 'gi');
const THIS_SPEC_PATH = 'PackageIsolation.spec.ts';

function isTestCode(path: string): boolean {
  return /\.spec\.ts$|\.dom\.tsx$/.test(path) || path.startsWith('testing/');
}

function isStory(path: string): boolean {
  return path.endsWith('.stories.tsx') || path.startsWith('.storybook/');
}

function leavesThePackage(fromPath: string, reference: string): boolean {
  return normalize(join(dirname(fromPath), reference)).startsWith('..');
}

function importSentencesOf(sources: readonly PackageFile[]): string[] {
  return sources.flatMap((source) => typescript.preProcessFile(source.text, true, true).importedFiles.map((importedFile) => importedFile.fileName)
    .flatMap((specifier): string[] => {
      if (specifier.startsWith('.')) return leavesThePackage(source.path, specifier) ? [`${source.path} imports ${specifier}, outside the package`] : [];
      if (isTestCode(source.path)) return SPEC_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which no spec may import`];
      if (isStory(source.path)) return STORY_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which no story may import`];
      return SHIPPING_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which nothing that ships may import`];
    }));
}

function stylesheetSentencesOf(stylesheets: readonly PackageFile[]): string[] {
  return stylesheets.flatMap((stylesheet) => [...stylesheet.text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(STYLESHEET_REFERENCE)]
    .map((match) => match[1] ?? match[2] ?? '')
    .filter((reference) => leavesThePackage(stylesheet.path, reference))
    .map((reference) => `${stylesheet.path} references ${reference}, outside the package`));
}

function colourSentencesOf(files: readonly PackageFile[]): string[] {
  return files.filter((file) => !COLOURED_PATHS.test(file.path) && file.path !== THIS_SPEC_PATH && COLOUR_VALUE.test(file.text))
    .map((file) => `${file.path} writes a colour outside the tokens`);
}

function hostWordSentencesOf(files: readonly PackageFile[]): string[] {
  return files.filter((file) => file.path !== THIS_SPEC_PATH)
    .flatMap((file) => [...file.text.matchAll(HOST_WORD)].map((match) => `${file.path} names the host word "${match[0]}"`));
}

const SOURCES = PackageFiles.matching(/\.tsx?$/);
const STYLESHEETS = PackageFiles.matching(/\.css$/);
const EVERY_TEXT_FILE = PackageFiles.matching(/\.(?:tsx?|css|md|json|svg|js)$/);

describe('the package\'s isolation', () => {
  test('the scan reads the package\'s sources, stylesheets and documents', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(MINIMUM_SOURCE_COUNT);
    expect(STYLESHEETS.map((stylesheet) => stylesheet.path)).toContain('styles/brand.css');
    expect(EVERY_TEXT_FILE.map((file) => file.path)).toContain('README.md');
  });

  test('every planted form is caught', () => {
    expect(importSentencesOf([
      { path: 'marks/Planted.tsx', text: 'import { x } from \'../../apps/elsewhere.ts\';' },
      { path: 'marks/Planted.tsx', text: 'import { readFileSync } from \'node:fs\';' },
      { path: 'marks/Planted.dom.tsx', text: 'import { x } from \'vite\';' },
      { path: 'marks/Planted.stories.tsx', text: 'import { x } from \'design-system/Button\';' },
    ])).toHaveLength(4);
    expect(stylesheetSentencesOf([{ path: 'marks/Planted.css', text: '@import "../../elsewhere.css";' }])).toHaveLength(1);
    expect(colourSentencesOf([{ path: 'marks/Planted.css', text: '.planted { fill: #fff; }' }])).toHaveLength(1);
    expect(hostWordSentencesOf([{ path: 'README.md', text: 'Draw it on the splash.' }, { path: 'README.md', text: 'Gaia draws it too.' }])).toHaveLength(2);
  });

  test('nothing imports outside the package, and each kind of file imports only what it may', () => {
    expect(importSentencesOf(SOURCES)).toEqual([]);
  });

  test('no stylesheet references a file outside the package', () => {
    expect(stylesheetSentencesOf(STYLESHEETS)).toEqual([]);
  });

  test('no colour is written outside the tokens', () => {
    expect(colourSentencesOf(EVERY_TEXT_FILE)).toEqual([]);
  });

  test('no file names a word of a host', () => {
    expect(hostWordSentencesOf(EVERY_TEXT_FILE)).toEqual([]);
  });
});
