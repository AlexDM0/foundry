/**
 * The guard that keeps `design-system/` a package that can move to its own repository unchanged: no import leaves the folder, no
 * stylesheet `@import` or `url()` leaves it, nothing that ships imports a `bun:` or `node:` module or a package other than React, a spec
 * imports only its listed test packages, a story only React and Storybook, and no file, the constitution and the README among them, names
 * a word of the host from `HOST_WORDS`. The scan first proves it read the package, and each form is planted.
 */
import { describe, expect, test } from 'bun:test';

import {
  isStory,
  isTestCode,
  moduleSpecifiersOf,
  packageFilesMatching,
  targetPathOf,
  type PackageFile
} from './testing/PackageFiles.ts';

/** What a file that ships may import from outside the package. */
const SHIPPING_PACKAGES: readonly string[] = ['react'];
/** What a spec, a DOM spec or a testing helper may import from outside the package. */
const SPEC_PACKAGES: readonly string[] = ['bun:test', 'react', '@testing-library/react', 'typescript', 'node:fs', 'node:path', 'eslint'];
/** What a story may import from outside the package. */
const STORY_PACKAGES: readonly string[] = ['react', '@storybook/react-vite', 'storybook/test'];
const RUNTIME_PREFIXES = ['bun:', 'node:'];
const MINIMUM_PACKAGE_FILE_COUNT = 100;
const STYLESHEET_REFERENCE = /@import\s+(?:url\()?["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g;
/**
 * The first host's words: its names and its views, its items, their states, its steps and its panels. This spec is the one file that names
 * them. The design's own names (`FlintSlot`, the decision card, the tokens such as `--lane-bg`) are no host words.
 */
const HOST_WORDS: readonly string[] = [
  'forge',
  'bridge',
  'pipeline',
  'pipelines',
  'kanban',
  'board',
  'boards',
  'ticket',
  'tickets',
  'epic',
  'epics',
  'overseer',
  'in-review',
  're-review',
  'ready-for-review',
  'delivered',
  'abandoned',
  'phase-review',
  'phase-merge',
  'awaiting-review',
  'human-review',
  'question-panel',
  'detail-w',
];
const HOST_WORD = new RegExp(`\\b(${HOST_WORDS.join('|')})\\b`, 'gi');
const THIS_SPEC_PATH = 'PackageIsolation.spec.ts';

function leavesThePackage(fromPath: string, reference: string): boolean {
  const target = targetPathOf(fromPath, reference);
  return target === '..' || target.startsWith('../');
}

function sourceSentencesOf(sources: readonly PackageFile[]): readonly string[] {
  return sources.flatMap((source) => moduleSpecifiersOf(source).flatMap((specifier): string[] => {
    if (specifier.startsWith('.')) return leavesThePackage(source.path, specifier) ? [`${source.path} imports ${specifier}, outside the package`] : [];
    if (isTestCode(source.path)) return SPEC_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which no spec of the package may import`];
    if (isStory(source.path)) return STORY_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which no story of the package may import`];
    if (RUNTIME_PREFIXES.some((prefix) => specifier.startsWith(prefix))) return [`${source.path} imports ${specifier}, a runtime module the browser does not have`];
    return SHIPPING_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, a package the package does not name as a peer`];
  }));
}

function stylesheetReferencesOf(stylesheet: PackageFile): readonly string[] {
  const withoutComments = stylesheet.text.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(STYLESHEET_REFERENCE)].map((match) => match[1] ?? match[2] ?? '').filter((reference) => !reference.startsWith('data:'));
}

function stylesheetSentencesOf(stylesheets: readonly PackageFile[]): readonly string[] {
  return stylesheets.flatMap((stylesheet) => stylesheetReferencesOf(stylesheet)
    .filter((reference) => /^[a-z]+:/i.test(reference) || reference.startsWith('/') || leavesThePackage(stylesheet.path, reference))
    .map((reference) => `${stylesheet.path} references ${reference}, outside the package`));
}

function hostWordSentencesOf(files: readonly PackageFile[]): readonly string[] {
  return files.filter((file) => file.path !== THIS_SPEC_PATH).flatMap((file) => [...file.text.matchAll(HOST_WORD)]
    .map((match) => `${file.path} names the host word ${match[1] ?? ''}`));
}

const SOURCES = packageFilesMatching('**/*.{ts,tsx}');
const STYLESHEETS = packageFilesMatching('**/*.css');
const DOCUMENTS = packageFilesMatching('**/*.md');

describe('the scan itself', () => {
  test('it reads the whole package, its components, its stylesheets and its specs among them', () => {
    const paths = SOURCES.map((source) => source.path);
    expect(paths.length).toBeGreaterThanOrEqual(MINIMUM_PACKAGE_FILE_COUNT);
    expect(paths).toContain('atoms/Button.tsx');
    expect(paths).toContain('PackageIsolation.spec.ts');
    expect(STYLESHEETS.map((stylesheet) => stylesheet.path)).toContain('styles/design-system.css');
    expect(DOCUMENTS.map((document) => document.path)).toEqual(expect.arrayContaining(['CONSTITUTION.md', 'README.md']));
  });

  test('it finds the imports of every kind of file, and the imports of the entry stylesheet', () => {
    const specifiersOf = (path: string): readonly string[] => moduleSpecifiersOf(SOURCES.find((source) => source.path === path) ?? { path, text: '' });
    expect(specifiersOf('molecules/Tag.tsx')).toContain('../atoms/StateDot.tsx');
    expect(specifiersOf('atoms/Button.tsx')).toContain('react');
    expect(specifiersOf('PackageIsolation.spec.ts')).toEqual(['bun:test', './testing/PackageFiles.ts']);
    expect(stylesheetReferencesOf(STYLESHEETS.find((stylesheet) => stylesheet.path === 'styles/design-system.css') ?? { path: '', text: '' }))
      .toContain('../atoms/Button.css');
  });

  test('every package an allowlist names is imported where it is allowed', () => {
    const importedBySpecs = new Set(SOURCES.filter((source) => isTestCode(source.path)).flatMap((source) => moduleSpecifiersOf(source)));
    const importedByStories = new Set(SOURCES.filter((source) => isStory(source.path)).flatMap((source) => moduleSpecifiersOf(source)));
    const importedByShipping = new Set(SOURCES.filter((source) => !isTestCode(source.path) && !isStory(source.path)).flatMap((source) => moduleSpecifiersOf(source)));
    expect(SPEC_PACKAGES.filter((specifier) => !importedBySpecs.has(specifier))).toEqual([]);
    expect(STORY_PACKAGES.filter((specifier) => !importedByStories.has(specifier))).toEqual([]);
    expect(SHIPPING_PACKAGES.filter((specifier) => !importedByShipping.has(specifier))).toEqual([]);
  });
});

test('no file of the package imports outside it, and what ships imports only React', () => {
  expect(sourceSentencesOf(SOURCES)).toEqual([]);
});

test('no stylesheet of the package imports or references a file outside it', () => {
  expect(stylesheetSentencesOf(STYLESHEETS)).toEqual([]);
});

test('no source, stylesheet or document of the package names a word of the host', () => {
  expect(hostWordSentencesOf([...SOURCES, ...STYLESHEETS, ...DOCUMENTS])).toEqual([]);
});

describe('the guard still names each form, planted in memory', () => {
  test.each([
    ['an import leaving the folder', 'import { PRODUCT_NAMES } from \'../../src/shared/ProductNames.ts\';', 'imports ../../src/shared/ProductNames.ts, outside the package'],
    ['a type import leaving the folder', 'import type { DisplayState } from \'../../src/lib/Task.ts\';', 'imports ../../src/lib/Task.ts, outside the package'],
    ['a dynamic import leaving the folder', 'const loaded = await import(\'../../cli/Main.ts\');', 'imports ../../cli/Main.ts, outside the package'],
    ['a type position import leaving the folder', 'type Planted = import(\'../../bridge/Main.tsx\').Planted;', 'imports ../../bridge/Main.tsx, outside the package'],
    ['a re-export leaving the folder', 'export { planted } from \'../../planted.ts\';', 'imports ../../planted.ts, outside the package'],
    ['a require leaving the folder', 'const planted = require(\'../../planted.ts\');', 'imports ../../planted.ts, outside the package'],
    ['a node: import', 'import { readFileSync } from \'node:fs\';', 'imports node:fs, a runtime module the browser does not have'],
    ['a bun: import', 'import { Database } from \'bun:sqlite\';', 'imports bun:sqlite, a runtime module the browser does not have'],
    ['a package that is not a peer', 'import { marked } from \'marked\';', 'imports marked, a package the package does not name as a peer'],
  ])('%s', (_form, plantedLine, expectedEnding) => {
    expect(sourceSentencesOf([{ path: 'atoms/PlantedPart.tsx', text: `${plantedLine}\n` }])).toEqual([`atoms/PlantedPart.tsx ${expectedEnding}`]);
  });

  test('a spec importing a test package that is not listed', () => {
    expect(sourceSentencesOf([{ path: 'atoms/Planted.dom.tsx', text: 'import { Window } from \'happy-dom\';\n' }]))
      .toEqual(['atoms/Planted.dom.tsx imports happy-dom, which no spec of the package may import']);
  });

  test('a story importing a package that is not listed, and a story importing Storybook and React', () => {
    expect(sourceSentencesOf([
      { path: 'atoms/Planted.stories.tsx', text: 'import { render } from \'@testing-library/react\';\n' },
      { path: 'atoms/PlantedPart.stories.tsx', text: 'import type { Meta } from \'@storybook/react-vite\';\nimport { fn } from \'storybook/test\';\n' },
    ])).toEqual(['atoms/Planted.stories.tsx imports @testing-library/react, which no story of the package may import']);
  });

  test('an import inside the folder, React, and an import named in a comment, a string or JSX text pass', () => {
    expect(sourceSentencesOf([
      { path: 'molecules/Planted.tsx', text: 'import { useState } from \'react\';\nimport { Button } from \'../atoms/Button.tsx\';\n' },
      { path: 'utils/PlantedUtil.ts', text: '// import x from \'../../outside.ts\'\n/* import y from \'node:fs\' */\nconst note = "import z from \'../../outside.ts\'";\n' },
      { path: 'atoms/Planted.tsx', text: 'export const view = <p>import x from \'../../outside.ts\'</p>;\n' },
    ])).toEqual([]);
  });

  test('a host word in code, a class, a token, a comment, a link and prose, in any case, and not a longer word holding one', () => {
    expect(hostWordSentencesOf([
      { path: 'atoms/Planted.tsx', text: 'export type Planted = \'in-review\' | \'pending\';\n// Draws a Ticket on the Kanban.\n' },
      { path: 'atoms/Planted.css', text: '.design-system-planted[data-state-tone="abandoned"] { --badge-delivered-ink: var(--ink); }\n' },
      { path: 'styles/planted.css', text: ':root { --phase-merge: #000000; --detail-w: 480px; --detail-width: 480px; --pipeline-ink: var(--ink); }\n' },
      { path: 'atoms/Planted.dom.tsx', text: 'render(<Toast title="Pipelines applied" href="#pipeline/setup" />);\n// the bridge-draft-mark of the board\n' },
      { path: 'atoms/Planted.stories.tsx', text: 'const views = [\'list\', \'boards\'];\n' },
      { path: 'README.md', text: 'The Overseer starts it, and Forge ships it. A ticketing desk, a keyboard, a dashboard, a forged and an epically re-reviewed page pass.\n' },
      { path: 'CONSTITUTION.md', text: 'Portable out of the Bridge.\n' },
      { path: THIS_SPEC_PATH, text: 'ticket forge\n' },
    ])).toEqual([
      'atoms/Planted.tsx names the host word in-review',
      'atoms/Planted.tsx names the host word Ticket',
      'atoms/Planted.tsx names the host word Kanban',
      'atoms/Planted.css names the host word abandoned',
      'atoms/Planted.css names the host word delivered',
      'styles/planted.css names the host word phase-merge',
      'styles/planted.css names the host word detail-w',
      'styles/planted.css names the host word pipeline',
      'atoms/Planted.dom.tsx names the host word Pipelines',
      'atoms/Planted.dom.tsx names the host word pipeline',
      'atoms/Planted.dom.tsx names the host word bridge',
      'atoms/Planted.dom.tsx names the host word board',
      'atoms/Planted.stories.tsx names the host word boards',
      'README.md names the host word Overseer',
      'README.md names the host word Forge',
      'CONSTITUTION.md names the host word Bridge',
    ]);
  });

  test('a stylesheet importing or referencing a file outside the package, and not one inside it or a data address', () => {
    expect(stylesheetSentencesOf([{
      path: 'styles/planted.css',
      text: '@import "../../bridge/styles/board.css";\n@import "./tokens.css";\n'
        + '@font-face { src: url("../fonts/inter/planted.woff2"); }\n.planted { background: url(/planted.png); mask: url("data:image/svg+xml,x"); }\n',
    }])).toEqual(['styles/planted.css references ../../bridge/styles/board.css, outside the package', 'styles/planted.css references /planted.png, outside the package']);
  });
});
