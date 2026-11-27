/**
 * The documentation cites specs as evidence, so a cited spec must be where the citation says. Every repository-rooted `.spec.ts` path
 * in `README.md`, the rule files under the workspace root's `.claude/rules/` and the files under `docs/` (but the untracked
 * `docs/design/`) exists, read from the program root, the workspace root or a declared package's folder (`forge-contracts/…`): a spec
 * rename or split corrects its citations in the same change. A bare file name, a glob and a relative link are no
 * citation. The scan first proves it read citations, and each form is planted to prove the guard names it and passes what it skips.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                        from '../src/testing/ImportGraph.ts';
import { declaredWorkspacePackagesOf, workspaceRootOfProgram } from '../src/testing/RepositorySources.ts';
import { createScratchDirectory }                              from '../src/testing/ScratchWorkspace.ts';

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

function documentsInScope(programRoot: string, workspaceRoot: string): CitingDocument[] {
  const underDocs = [...new Bun.Glob('docs/**/*.{md,html,json}').scanSync({ cwd: programRoot })]
    .filter((path) => !OUT_OF_SCOPE_FOLDERS.some((folder) => path.startsWith(folder)))
    .sort();
  const pathScopedRules = [...new Bun.Glob('.claude/rules/*.md').scanSync({ cwd: workspaceRoot, dot: true })].sort();
  const readIn = (root: string) => (path: string): CitingDocument => ({ path, text: readFileSync(join(root, path), 'utf8') });
  return [...['README.md'].map(readIn(programRoot)), ...pathScopedRules.map(readIn(workspaceRoot)), ...underDocs.map(readIn(programRoot))];
}

const PROGRAM_ROOT = repositoryRootOfThisCheckout();
const WORKSPACE_ROOT = workspaceRootOfProgram(PROGRAM_ROOT);
const DOCUMENTS = documentsInScope(PROGRAM_ROOT, WORKSPACE_ROOT);
const PACKAGE_FOLDERS_BY_PREFIX = new Map(declaredWorkspacePackagesOf(PROGRAM_ROOT).map(({ name, folder }) => [`${name}/`, folder]));

function existsInPackage(path: string): boolean {
  const prefix = `${path.split('/')[0] ?? ''}/`;
  const folder = PACKAGE_FOLDERS_BY_PREFIX.get(prefix);
  return folder !== undefined && existsSync(join(folder, path.slice(prefix.length)));
}

function existsInCheckout(path: string): boolean {
  return existsSync(join(PROGRAM_ROOT, path)) || existsSync(join(WORKSPACE_ROOT, path)) || existsInPackage(path);
}

describe('the spec citations of the documentation resolve', () => {
  test('the scan reads spec citations in the docs and in the path-scoped rule files', () => {
    expect(DOCUMENTS.flatMap((document) => citedSpecPathsOf(document.text)).length).toBeGreaterThan(0);
    for (const rulePath of ['.claude/rules/forge.md', '.claude/rules/skills.md']) {
      expect(citedSpecPathsOf(DOCUMENTS.find((document) => document.path === rulePath)?.text ?? '').length, rulePath).toBeGreaterThan(0);
    }
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
    mkdirSync(join(plantedRoot, '.claude/rules'), { recursive: true });
    for (const path of ['README.md', '.claude/rules/Planted.md', 'docs/design/Planted.md', 'docs/Kept.md']) {
      writeFileSync(join(plantedRoot, path), 'See `src/Gone.spec.ts`.\n');
    }
    const missing = documentsInScope(plantedRoot, plantedRoot).flatMap((document) => missingCitationsOf(document, () => false));
    expect(missing).toEqual([
      'README.md cites src/Gone.spec.ts',
      '.claude/rules/Planted.md cites src/Gone.spec.ts',
      'docs/Kept.md cites src/Gone.spec.ts',
    ]);
  });

  test('a bare file name, a glob and a relative link are no citation', () => {
    expect(citedSpecPathsOf('`Environment.spec.ts`, `*.integration.spec.ts`, `src/**/Board.*.spec.ts`, [x](../../src/Relative.spec.ts)')).toEqual([]);
  });
});
