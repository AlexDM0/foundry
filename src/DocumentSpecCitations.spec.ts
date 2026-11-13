/**
 * The documentation cites specs as evidence, so a cited spec must be where the citation says. Every repository-rooted `.spec.ts` path
 * in `README.md`, `CLAUDE.md` and the files under `docs/` (but the untracked `docs/design/`) exists: a spec rename or split corrects
 * its citations in the same change. A bare file name, a glob and a relative link are no citation. The scan first proves it read
 * citations, and each form is planted to prove the guard names it and passes what it skips.
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
const OUT_OF_SCOPE_FOLDERS = ['docs/design/'];

const CITES = ' cites ';

const CONFINED_REACH_TABLE_CITATION = 'docs/development/guards-and-testing.md cites src/lib/claude-code/WorkflowScriptBundle.spec.ts';

/** A citation of a missing file that the document makes on purpose, keyed as the guard names it, each with its reason. */
const DELIBERATELY_ABSENT_CITATIONS: Readonly<Record<string, string>> = { [CONFINED_REACH_TABLE_CITATION]: 'its confined-reach table says "(no such file)"' };

interface CitingDocument {
  readonly path: string;
  readonly text: string;
}

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

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();
const DOCUMENTS = documentsInScope(REPOSITORY_ROOT);

function existsInCheckout(path: string): boolean {
  return existsSync(join(REPOSITORY_ROOT, path));
}

describe('the spec citations of the documentation resolve', () => {
  test('the scan reads spec citations in the docs and in CLAUDE.md', () => {
    expect(DOCUMENTS.flatMap((document) => citedSpecPathsOf(document.text)).length).toBeGreaterThan(0);
    expect(citedSpecPathsOf(DOCUMENTS.find((document) => document.path === 'CLAUDE.md')?.text ?? '').length).toBeGreaterThan(0);
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
});
