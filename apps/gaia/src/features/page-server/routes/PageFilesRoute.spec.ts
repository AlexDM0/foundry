/**
 * The page's files, built from the repository's real `page/index.html`: the page is served at `/`, every file it names is served beside
 * it, and nothing it loads is inline, which the page's CSP would block. One build serves every request; a build that fails answers its
 * refusal, and the next request builds again, so a page fixed on disk is served without a restart. The design system's font files come from
 * the package through the page's script and are served from Gaia's own origin, each with its content hash in its name, so a browser may
 * keep it for a year.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join }     from 'node:path';
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

const FONT_FILE_ADDRESS = /"\.\/([\w-]+\.woff2)"/g;

const HASHED_FONT_FILE_NAME = /^(?<packageName>[\w-]+)-(?<contentHash>[a-z0-9]{8})\.woff2$/;

const FONT_FILE_CACHE_CONTROL = 'max-age=31536000, immutable';

function packageFontFilePaths(): string[] {
  const fontFolder = dirname(Bun.resolveSync('design-system/FontLoader', import.meta.dir));
  return [...new Bun.Glob('**/*.woff2').scanSync({ cwd: fontFolder })].map((relativePath) => join(fontFolder, relativePath)).sort();
}

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

  test('serves every font file of the design system that its script names, as woff2 under a hashed name that a browser keeps for a year', async () => {
    const pageFiles = builtPageFilesOf(pageIndexFilePath());
    const buildVerdict = await pageFiles();
    if (buildVerdict.verdict !== 'built') throw new Error(buildVerdict.failure);
    const scriptTexts = await Promise.all([...buildVerdict.files].filter(([path]) => path.endsWith('.js')).map(([, file]) => file.text()));
    const fontFileNames = [...new Set(scriptTexts.flatMap((scriptText) => [...scriptText.matchAll(FONT_FILE_ADDRESS)].map((address) => address[1] ?? '')))].sort();

    const packageFontFiles = packageFontFilePaths();
    expect(packageFontFiles).toHaveLength(4);
    expect(fontFileNames.map((fileName) => HASHED_FONT_FILE_NAME.exec(fileName)?.groups?.['packageName'])).toEqual(
      packageFontFiles.map((fontFilePath) => basename(fontFilePath, '.woff2')).sort(),
    );
    for (const fileName of fontFileNames) {
      const answer = await pageFileAnswerFor(pageFiles, `/${fileName}`);
      const packageName = HASHED_FONT_FILE_NAME.exec(fileName)?.groups?.['packageName'] ?? '';
      const packageFile = packageFontFiles.find((fontFilePath) => basename(fontFilePath, '.woff2') === packageName) ?? '';
      expect([answer.status, answer.headers.get('content-type'), answer.headers.get('cache-control')]).toEqual([200, 'font/woff2', FONT_FILE_CACHE_CONTROL]);
      expect(new Uint8Array(await answer.arrayBuffer())).toEqual(new Uint8Array(readFileSync(packageFile)));
    }
  });

  test('gives no other file of the page the font files\' lasting cache', async () => {
    const pageFiles = builtPageFilesOf(pageIndexFilePath());
    expect((await pageFileAnswerFor(pageFiles, '/')).headers.get('cache-control')).toBeNull();
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
