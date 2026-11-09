/**
 * The documentation cites specs as evidence, so a cited spec must be where the citation says. Every repository-rooted `.spec.ts` path
 * in `README.md`, `CLAUDE.md` and the files under `docs/` (but `docs/development/documentation-pass/` and the untracked
 * `docs/design/`) exists, and each failure lab entry names a file that holds its spec `title` or its code `find` text: a spec
 * rename or split corrects its citations in the same change. A bare file name, a glob and a relative link are no citation. The
 * scan first proves it read citations and failure lab entries, and each form is planted to prove the guard names it and passes what it skips.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import { createScratchDirectory }       from './testing/ScratchWorkspace.ts';

const SPEC_CITATION = /(?<![\w./*@-])((?:[\w@][\w.@-]*\/)+[\w.-]+\.spec\.ts)(?!\w)/g;
const OUT_OF_SCOPE_FOLDERS = ['docs/development/documentation-pass/', 'docs/design/'];
const FAILURE_LAB_PATH = 'docs/interactive/failure-lab.html';
const MODEL_START = 'const MODEL = ';
const MODEL_END = '\n}';

const CITES = ' cites ';

const CONFINED_REACH_TABLE_CITATION = 'docs/development/guards-and-testing.md cites src/lib/claude-code/WorkflowScriptBundle.spec.ts';

/** A citation of a missing file that the document makes on purpose, keyed as the guard names it, each with its reason. */
const DELIBERATELY_ABSENT_CITATIONS: Readonly<Record<string, string>> = { [CONFINED_REACH_TABLE_CITATION]: 'its confined-reach table says "(no such file)"' };

interface CitingDocument {
  readonly path: string;
  readonly text: string;
}

interface SpecEntry {
  readonly key:   string;
  readonly path:  string;
  readonly title: string;
}

interface CodeEntry {
  readonly key:  string;
  readonly path: string;
  readonly find: string;
}

interface FailureLabEntries {
  readonly specs: readonly SpecEntry[];
  readonly code:  readonly CodeEntry[];
}

type FileTextReader = (path: string) => string | null;

function citedSpecPathsOf(text: string): string[] {
  return [...text.matchAll(SPEC_CITATION)].map((match) => match[1] ?? '');
}

function missingCitationsOf(document: CitingDocument, pathExists: (path: string) => boolean): string[] {
  return [...new Set(citedSpecPathsOf(document.text))]
    .filter((path) => !pathExists(path))
    .map((path) => `${document.path}${CITES}${path}`);
}

function documentsInScope(repositoryRoot: string): CitingDocument[] {
  const underDocs = [...new Bun.Glob('docs/**/*.{md,html,json}').scanSync({ cwd: repositoryRoot })]
    .filter((path) => !OUT_OF_SCOPE_FOLDERS.some((folder) => path.startsWith(folder)))
    .sort();
  return ['README.md', 'CLAUDE.md', ...underDocs].map((path) => ({ path, text: readFileSync(join(repositoryRoot, path), 'utf8') }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An entry missing its path or its text is kept with an empty string, so the check names it rather than skipping it. */
function sectionEntriesOf(model: Record<string, unknown>, section: string): [string, Record<string, unknown>][] {
  const sectionValue = model[section];
  const entries = isRecord(sectionValue) && isRecord(sectionValue['entries']) ? sectionValue['entries'] : {};
  return Object.entries(entries).map(([key, entry]) => [key, isRecord(entry) ? entry : {}]);
}

function textField(entry: Record<string, unknown>, field: string): string {
  const value = entry[field];
  return typeof value === 'string' ? value : '';
}

function failureLabEntriesOf(html: string): FailureLabEntries {
  const start = html.indexOf(MODEL_START);
  const end = html.indexOf(MODEL_END, start);
  if (start < 0 || end < 0) return { specs: [], code: [] };
  const model: unknown = JSON.parse(html.slice(start + MODEL_START.length, end + MODEL_END.length));
  if (!isRecord(model)) return { specs: [], code: [] };
  return {
    specs: sectionEntriesOf(model, 'specs').map(([key, entry]) => ({ key, path: textField(entry, 'path'), title: textField(entry, 'title') })),
    code:  sectionEntriesOf(model, 'functions').map(([key, entry]) => ({ key, path: textField(entry, 'path'), find: textField(entry, 'find') })),
  };
}

/** A title quoted in a spec escapes its apostrophes, so the source is unescaped before the title is looked for. */
function failureLabProblemsOf(entries: FailureLabEntries, readFileText: FileTextReader): string[] {
  const specProblems = entries.specs.flatMap((entry) => {
    const text = readFileText(entry.path);
    if (text === null) return [`failure lab spec ${entry.key} names ${entry.path}, which does not exist`];
    return text.replaceAll('\\\'', '\'').includes(entry.title) ? [] : [`failure lab spec ${entry.key}: ${entry.path} holds no title "${entry.title}"`];
  });
  const codeProblems = entries.code.flatMap((entry) => {
    const text = readFileText(entry.path);
    if (text === null) return [`failure lab code ${entry.key} names ${entry.path}, which does not exist`];
    return text.includes(entry.find) ? [] : [`failure lab code ${entry.key}: ${entry.path} holds no "${entry.find}"`];
  });
  return [...specProblems, ...codeProblems];
}

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();
const DOCUMENTS = documentsInScope(REPOSITORY_ROOT);
const FAILURE_LAB_ENTRIES = failureLabEntriesOf(readFileSync(join(REPOSITORY_ROOT, FAILURE_LAB_PATH), 'utf8'));

function existsInCheckout(path: string): boolean {
  return existsSync(join(REPOSITORY_ROOT, path));
}

function checkoutFileText(path: string): string | null {
  return existsInCheckout(path) ? readFileSync(join(REPOSITORY_ROOT, path), 'utf8') : null;
}

describe('the spec citations of the documentation resolve', () => {
  test('the scan reads spec citations in the docs and in CLAUDE.md, and failure lab spec and code entries', () => {
    expect(DOCUMENTS.flatMap((document) => citedSpecPathsOf(document.text)).length).toBeGreaterThan(0);
    expect(citedSpecPathsOf(DOCUMENTS.find((document) => document.path === 'CLAUDE.md')?.text ?? '').length).toBeGreaterThan(0);
    expect(FAILURE_LAB_ENTRIES.specs.length).toBeGreaterThan(0);
    expect(FAILURE_LAB_ENTRIES.code.length).toBeGreaterThan(0);
  });

  test('every repository-rooted spec path a document in scope cites exists, but the deliberately absent ones', () => {
    const missing = DOCUMENTS.flatMap((document) => missingCitationsOf(document, existsInCheckout))
      .filter((citation) => !Object.hasOwn(DELIBERATELY_ABSENT_CITATIONS, citation));
    expect(missing).toEqual([]);
  });

  test('each deliberately absent citation is still cited and still absent', () => {
    for (const key of Object.keys(DELIBERATELY_ABSENT_CITATIONS)) {
      const [documentPath, citedPath] = key.split(CITES);
      const document = DOCUMENTS.find((candidate) => candidate.path === documentPath);
      expect(citedSpecPathsOf(document?.text ?? ''), key).toContain(citedPath ?? '');
      expect(existsInCheckout(citedPath ?? ''), key).toBe(false);
    }
  });

  test('every failure lab entry names a file that holds its title or its find text', () => {
    expect(failureLabProblemsOf(FAILURE_LAB_ENTRIES, checkoutFileText)).toEqual([]);
  });

  test('a planted citation of a missing spec is named with its document and path', () => {
    const planted = { path: 'docs/Planted.md', text: 'See `src/Gone.spec.ts` and [the spec](cli/Present.spec.ts).\n' };
    expect(missingCitationsOf(planted, (path) => path === 'cli/Present.spec.ts')).toEqual(['docs/Planted.md cites src/Gone.spec.ts']);
  });

  test('a planted file under docs/design/ citing a missing spec is not read, while one beside it is', () => {
    const plantedRoot = createScratchDirectory('document-spec-citations');
    mkdirSync(join(plantedRoot, 'docs/design'), { recursive: true });
    for (const path of ['README.md', 'CLAUDE.md', 'docs/design/Planted.md', 'docs/Kept.md']) {
      writeFileSync(join(plantedRoot, path), 'See `src/Gone.spec.ts`.\n');
    }
    const missing = documentsInScope(plantedRoot).flatMap((document) => missingCitationsOf(document, () => false));
    expect(missing).toEqual(['README.md cites src/Gone.spec.ts', 'CLAUDE.md cites src/Gone.spec.ts', 'docs/Kept.md cites src/Gone.spec.ts']);
  });

  test('a bare file name, a glob and a relative link are no citation', () => {
    expect(citedSpecPathsOf('`Environment.spec.ts`, `*.integration.spec.ts`, `src/**/Board.*.spec.ts`, [x](../../src/Relative.spec.ts)')).toEqual([]);
  });

  const presentFiles: Record<string, string> = { 'src/Present.spec.ts': 'test(\'a holder\\\'s case\', () => {});', 'src/Present.ts': 'function present(' };
  const readPlanted: FileTextReader = (path) => (Object.hasOwn(presentFiles, path) ? presentFiles[path] ?? null : null);

  const presentSpecEntry = { key: 'planted', path: 'src/Present.spec.ts', title: 'a holder\'s case' };
  const presentCodeEntry = { key: 'planted', path: 'src/Present.ts', find: 'function present(' };

  test.each([
    ['a spec entry naming a missing file', { specs: [{ ...presentSpecEntry, path: 'src/Gone.spec.ts' }], code: [] }, 'src/Gone.spec.ts, which does not exist'],
    ['a spec entry whose title its file does not hold', { specs: [{ ...presentSpecEntry, title: 'another case' }], code: [] }, 'holds no title "another case"'],
    ['a code entry naming a missing file', { specs: [], code: [{ ...presentCodeEntry, path: 'src/Gone.ts' }] }, 'src/Gone.ts, which does not exist'],
    ['a code entry whose find text its file does not hold', { specs: [], code: [{ ...presentCodeEntry, find: 'function absent(' }] }, 'holds no "function absent("'],
  ])('a planted failure lab %s is named', (_form, entries, expectedProblem) => {
    expect(failureLabProblemsOf(entries, readPlanted)).toEqual([expect.stringContaining(expectedProblem)]);
  });

  test('a failure lab entry whose file holds its escaped title or its find text passes', () => {
    expect(failureLabProblemsOf({ specs: [presentSpecEntry], code: [presentCodeEntry] }, readPlanted)).toEqual([]);
  });
});
