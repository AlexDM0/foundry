/**
 * The page's files, built from the repository's real `page/index.html`: the page is served at `/`, every file it names is served beside
 * it, and nothing it loads is inline, which the page's CSP would block. One build serves every request; a build that fails answers its
 * refusal, and the next request builds again, so a page fixed on disk is served without a restart.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchPath }              from '../../../testing/ScratchRoot.ts';
import { builtPageFilesOf, pageFileAnswerFor, pageIndexFilePath } from './PageFilesRoute.ts';

const BUILT_FILE_REFERENCE = /(?:src|href)="\.\/([^"]+)"/g;

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>/;

let scratchFolders: string[] = [];

afterEach(() => {
  for (const scratchFolder of scratchFolders) removeScratchPath(scratchFolder);
  scratchFolders = [];
});

describe('the real page', () => {
  test('is served at / with every file it names beside it, and loads nothing inline', async () => {
    const pageFiles = builtPageFilesOf(pageIndexFilePath());
    const page = await pageFileAnswerFor(pageFiles, '/');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toStartWith('text/html');
    const pageText = await page.text();
    expect(pageText).toContain('id="gaia-root"');
    expect(pageText).not.toMatch(INLINE_SCRIPT);

    const namedFiles = [...pageText.matchAll(BUILT_FILE_REFERENCE)].map((reference) => reference[1] ?? '');
    expect(namedFiles.some((fileName) => fileName.endsWith('.js'))).toBe(true);
    expect(namedFiles.some((fileName) => fileName.endsWith('.css'))).toBe(true);
    const namedFileTypes = await Promise.all(namedFiles.map(async (fileName) => {
      const answer = await pageFileAnswerFor(pageFiles, `/${fileName}`);
      return [answer.status, (answer.headers.get('content-type') ?? '').split(';')[0]];
    }));
    expect(namedFileTypes.every(([status]) => status === 200)).toBe(true);
    expect(namedFileTypes.map(([, contentType]) => contentType).sort()).toEqual(['text/css', 'text/javascript']);
  });

  test('answers a file the build did not make as not found', async () => {
    expect((await pageFileAnswerFor(builtPageFilesOf(pageIndexFilePath()), '/absent.js')).status).toBe(404);
  });
});

describe('the build', () => {
  test('is made once for every request that shares it', async () => {
    const pageFiles = builtPageFilesOf(pageIndexFilePath());
    const [firstBuild, secondBuild] = await Promise.all([pageFiles(), pageFiles()]);
    expect(firstBuild).toBe(secondBuild);
    expect(await pageFiles()).toBe(firstBuild);
  });

  test('answers a failed build as unbuildable, and builds again at the next request', async () => {
    const pageFolder = createScratchDirectory('page-build');
    scratchFolders.push(pageFolder);
    const indexFilePath = join(pageFolder, 'index.html');
    const pageFiles = builtPageFilesOf(indexFilePath);

    expect((await pageFiles()).verdict).toBe('unbuildable');
    expect((await pageFileAnswerFor(pageFiles, '/')).status).toBe(500);

    writeFileSync(indexFilePath, '<!doctype html><title>Example</title>');
    expect((await pageFiles()).verdict).toBe('built');
    expect((await pageFileAnswerFor(pageFiles, '/')).status).toBe(200);
  });
});
