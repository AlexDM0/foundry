/**
 * The guard that keeps `flint/` a package that can move to its own repository unchanged: no import leaves the folder, nothing that ships
 * imports a `bun:` or `node:` module, only the React layer imports React, and a spec imports only its listed test packages. It reads the
 * folder itself, with no import of its own beyond the test runner, and lexes each file so that a comment or a string that names an import
 * is not one, while `import type` and a type's `import('…')` are. The scan first proves it read the package, and each form is planted.
 */
import { describe, expect, test } from 'bun:test';

const PACKAGE_FOLDER = import.meta.dir;
const REACT_LAYER_FOLDER = 'react/';
/** What a file that ships may import from outside the package, by the folder it is in. */
const SHIPPING_PACKAGES_BY_FOLDER: Readonly<Record<string, readonly string[]>> = { [REACT_LAYER_FOLDER]: ['react'] };
/** What a spec, a DOM spec or a testing helper may import from outside the package. */
const SPEC_PACKAGES: readonly string[] = ['bun:test', 'react', '@testing-library/react', 'eslint'];
const RUNTIME_PREFIXES = ['bun:', 'node:'];
const MINIMUM_PACKAGE_FILE_COUNT = 30;

interface PackageSource {
  /** Relative to the package folder, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

/** The tokens after which a slash starts a regular expression rather than a division. */
const REGEX_MAY_FOLLOW = new Set([
  ...'(,=:[!&|?{};+-*%<>~^'.split(''),
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
]);

function stringEnd(source: string, start: number): { readonly text: string; readonly end: number } {
  const quote = source[start];
  let text = '';
  for (let i = start + 1; i < source.length; i++) {
    const character = source[i];
    if (character === '\\') {
      text += source[i + 1] ?? '';
      i++;
    } else if (character === quote || character === '\n') {
      return { text, end: i + 1 };
    } else {
      text += character;
    }
  }
  return { text, end: source.length };
}

function templateEnd(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
    } else if (source[i] === '`') {
      return i + 1;
    } else if (source[i] === '$' && source[i + 1] === '{') {
      i = expressionEnd(source, i + 2);
    } else {
      i++;
    }
  }
  return i;
}

function expressionEnd(source: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const character = source[i];
    if (character === '\'' || character === '"') {
      i = stringEnd(source, i).end;
    } else if (character === '`') {
      i = templateEnd(source, i);
    } else {
      if (character === '{') depth++;
      if (character === '}') depth--;
      i++;
    }
  }
  return i;
}

/** The end of a regular expression literal, or null when the slash closes nothing on its line and so is no literal. */
function regularExpressionEnd(source: string, start: number): number | null {
  let insideClass = false;
  for (let i = start + 1; i < source.length; i++) {
    const character = source[i];
    if (character === '\n') return null;
    if (character === '\\') {
      i++;
    } else if (character === '[') {
      insideClass = true;
    } else if (character === ']') {
      insideClass = false;
    } else if (character === '/' && !insideClass) {
      let end = i + 1;
      while (/[a-z]/.test(source[end] ?? '')) end++;
      return end;
    }
  }
  return null;
}

/**
 * Every module specifier of a source: after `from`, after `import`, and inside `import(…)` or `require(…)`. A string elsewhere, a comment,
 * a template literal and a regular expression are skipped. JSX text that holds a quote is not read; the package's JSX holds none.
 */
function moduleSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  const tokens: string[] = [];
  const precedes = (...expected: readonly string[]): boolean => expected.every((token, index) => tokens[tokens.length - expected.length + index] === token);
  let i = 0;
  while (i < source.length) {
    const character = source[i] ?? '';
    const following = source[i + 1];
    if (character === '/' && following === '/') {
      const lineEnd = source.indexOf('\n', i);
      i = lineEnd === -1 ? source.length : lineEnd;
    } else if (character === '/' && following === '*') {
      const commentEnd = source.indexOf('*/', i + 2);
      i = commentEnd === -1 ? source.length : commentEnd + 2;
    } else if (character === '\'' || character === '"') {
      const literal = stringEnd(source, i);
      if (precedes('from') || precedes('import') || precedes('import', '(') || precedes('require', '(')) specifiers.push(literal.text);
      tokens.push('string');
      i = literal.end;
    } else if (character === '`') {
      tokens.push('string');
      i = templateEnd(source, i);
    } else if (/[A-Za-z_$]/.test(character)) {
      const word = /^[A-Za-z0-9_$]+/.exec(source.slice(i))?.[0] ?? character;
      tokens.push(word);
      i += word.length;
    } else if (/\s/.test(character)) {
      i++;
    } else if (character === '/' && (tokens.length === 0 || REGEX_MAY_FOLLOW.has(tokens.at(-1) ?? ''))) {
      const literalEnd = regularExpressionEnd(source, i);
      tokens.push(literalEnd === null ? character : 'regex');
      i = literalEnd ?? i + 1;
    } else {
      tokens.push(character);
      i++;
    }
  }
  return specifiers;
}

/** The repository-free normal form of a relative path; a path that climbs out of the package starts with `../`. */
function normalPathOf(fromFolder: string, specifier: string): string {
  const segments: string[] = [];
  for (const segment of `${fromFolder}${specifier}`.split('/')) {
    if (segment === '..') {
      if (segments.length === 0 || segments.at(-1) === '..') segments.push('..');
      else segments.pop();
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function isTestCode(path: string): boolean {
  return path.endsWith('.spec.ts') || path.endsWith('.dom.tsx') || path.startsWith('testing/');
}

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

function isolationSentencesOf(sources: readonly PackageSource[]): readonly string[] {
  return sources.flatMap((source) => moduleSpecifiersOf(source.text).flatMap((specifier): string[] => {
    if (specifier.startsWith('.')) {
      const target = normalPathOf(folderOf(source.path), specifier);
      return target.startsWith('../') || target === '..' ? [`${source.path} imports ${specifier}, outside the package`] : [];
    }
    if (isTestCode(source.path)) return SPEC_PACKAGES.includes(specifier) ? [] : [`${source.path} imports ${specifier}, which no spec of the package may import`];
    if (RUNTIME_PREFIXES.some((prefix) => specifier.startsWith(prefix))) return [`${source.path} imports ${specifier}, a runtime module the browser does not have`];
    const allowed = Object.entries(SHIPPING_PACKAGES_BY_FOLDER).some(([folder, packages]) => source.path.startsWith(folder) && packages.includes(specifier));
    return allowed ? [] : [`${source.path} imports ${specifier}, a package only ${REACT_LAYER_FOLDER} may import, if any`];
  })).sort();
}

const SOURCES: readonly PackageSource[] = await Promise.all([...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: PACKAGE_FOLDER })]
  .filter((path) => !path.split('/').includes('node_modules'))
  .sort()
  .map(async (path) => ({ path, text: await Bun.file(`${PACKAGE_FOLDER}/${path}`).text() })));

describe('the scan itself', () => {
  test('it reads the whole package, its entry files and its specs among them', () => {
    const paths = SOURCES.map((source) => source.path);
    expect(paths.length).toBeGreaterThanOrEqual(MINIMUM_PACKAGE_FILE_COUNT);
    expect(paths).toContain('CreateFlint.ts');
    expect(paths).toContain('react/Flint.tsx');
    expect(paths).toContain('PackageIsolation.spec.ts');
  });

  test('it finds the imports of every kind of file: shipping, React layer and spec', () => {
    const specifiersOf = (path: string): readonly string[] => moduleSpecifiersOf(SOURCES.find((source) => source.path === path)?.text ?? '');
    expect(specifiersOf('CreateFlint.ts')).toContain('./SpriteRenderer.ts');
    expect(specifiersOf('react/Flint.tsx')).toContain('react');
    expect(specifiersOf('PackageIsolation.spec.ts')).toEqual(['bun:test']);
  });

  test('every package an allowlist names is imported where it is allowed', () => {
    const importedBySpecs = new Set(SOURCES.filter((source) => isTestCode(source.path)).flatMap((source) => moduleSpecifiersOf(source.text)));
    expect(SPEC_PACKAGES.filter((specifier) => !importedBySpecs.has(specifier))).toEqual([]);
    for (const [folder, packages] of Object.entries(SHIPPING_PACKAGES_BY_FOLDER)) {
      const importedThere = new Set(SOURCES.filter((source) => source.path.startsWith(folder) && !isTestCode(source.path)).flatMap((source) => moduleSpecifiersOf(source.text)));
      expect(packages.filter((specifier) => !importedThere.has(specifier))).toEqual([]);
    }
  });
});

test('no file of the package imports outside it, and only the React layer and the specs import a package', () => {
  expect(isolationSentencesOf(SOURCES)).toEqual([]);
});

describe('the guard still names each form, planted in memory', () => {
  test.each([
    ['an import leaving the folder', 'import { PRODUCT_NAMES } from \'../src/shared/ProductNames.ts\';', 'imports ../src/shared/ProductNames.ts, outside the package'],
    ['a type import leaving the folder', 'import type { Board } from \'../src/lib/Board.ts\';', 'imports ../src/lib/Board.ts, outside the package'],
    ['a dynamic import leaving the folder', 'const loaded = await import(\'../cli/Main.ts\');', 'imports ../cli/Main.ts, outside the package'],
    ['a type position import leaving the folder', 'type Planted = import(\'../bridge/Main.tsx\').Planted;', 'imports ../bridge/Main.tsx, outside the package'],
    ['a re-export leaving the folder', 'export { planted } from \'../planted.ts\';', 'imports ../planted.ts, outside the package'],
    ['a require leaving the folder', 'const planted = require(\'../planted.ts\');', 'imports ../planted.ts, outside the package'],
    ['a node: import', 'import { readFileSync } from \'node:fs\';', 'imports node:fs, a runtime module the browser does not have'],
    ['a bun: import', 'import { Database } from \'bun:sqlite\';', 'imports bun:sqlite, a runtime module the browser does not have'],
    ['React outside the React layer', 'import { useState } from \'react\';', 'imports react, a package only react/ may import, if any'],
  ])('%s', (_form, plantedLine, expectedEnding) => {
    expect(isolationSentencesOf([{ path: 'PlantedModule.ts', text: `${plantedLine}\n` }])).toEqual([`PlantedModule.ts ${expectedEnding}`]);
  });

  test('a spec importing a test package that is not listed', () => {
    expect(isolationSentencesOf([{ path: 'Planted.spec.ts', text: 'import { Window } from \'happy-dom\';\n' }]))
      .toEqual(['Planted.spec.ts imports happy-dom, which no spec of the package may import']);
  });

  test('an import inside the folder, React in the React layer, and an import named in a comment, a string or a template pass', () => {
    expect(isolationSentencesOf([
      { path: 'react/Planted.tsx', text: 'import { useState } from \'react\';\nimport { createFlint } from \'../CreateFlint.ts\';\n' },
      { path: 'utils/PlantedUtil.ts', text: '// import x from \'../outside.ts\'\n/* import y from \'node:fs\' */\nconst note = "import z from \'../outside.ts\'";\n' },
      { path: 'Planted.spec.ts', text: 'const planted = `${from(\'../outside.ts\')} import \'node:fs\'`;\nconst pattern = /from \'..\\/outside\'/;\n' },
    ])).toEqual([]);
  });
});
