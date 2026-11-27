/**
 * `GET /` and the page's files, built in memory by `Bun.build` on the first request so health answers at once; a failed build is retried on the
 * next request. The diagram frame is built apart as one classic script with mermaid bundled in, since its sandbox has no origin and a module would
 * ask with `Origin: null`.
 */
import { join } from 'node:path';

import { refusalAnswerOf } from '../RefusalAnswer.ts';

/** Every built file by the path it is served at. */
export type PageFiles = ReadonlyMap<string, Blob>;

export type PageBuildVerdict =
  | { readonly verdict: 'built'; readonly files: PageFiles }
  | { readonly verdict: 'unbuildable'; readonly failure: string };

/** Answers the build, building it at the first call. */
export type PageFilesSource = () => Promise<PageBuildVerdict>;

const PAGE_INDEX_PATH = '/';

const BUILT_INDEX_FILE_NAME = 'index.html';

const RELATIVE_OUTPUT_PREFIX = /^\.\//;

const FONT_FILE_TYPE = 'font/woff2';

const FONT_FILE_LIFETIME_SECONDS = 31_536_000;

const FONT_FILE_CACHE_CONTROL = `max-age=${FONT_FILE_LIFETIME_SECONDS}, immutable`;

function repositoryRootFolder(): string {
  return join(import.meta.dir, '..', '..', '..', '..');
}

/** The page's HTML entry in this repository. */
export function pageIndexFilePath(): string {
  return join(repositoryRootFolder(), 'page', 'index.html');
}

export const DIAGRAM_FRAME_PATH = '/diagram-frame/';

const DIAGRAM_FRAME_SCRIPT_FILE_NAME = 'DiagramFrameScript.ts';

const HTML_FILE_TYPE = 'text/html;charset=utf-8';

/** The diagram frame's folder in this repository: its `index.html` and its script. */
export function diagramFrameFolderPath(): string {
  return join(repositoryRootFolder(), 'page', 'diagram-frame');
}

function failureOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function buildPage(indexFilePath: string): Promise<PageBuildVerdict> {
  let built: Bun.BuildOutput;
  try {
    built = await Bun.build({
      entrypoints: [indexFilePath],
      target:      'browser',
      minify:      true,
      define:      { 'process.env.NODE_ENV': '"production"' },
      throw:       false,
    });
  } catch (error) {
    return { verdict: 'unbuildable', failure: failureOf(error) };
  }
  if (!built.success) return { verdict: 'unbuildable', failure: built.logs.map((log) => log.message).join('\n') };
  const files = new Map<string, Blob>();
  for (const output of built.outputs) {
    const fileName = output.path.replace(RELATIVE_OUTPUT_PREFIX, '');
    files.set(fileName === BUILT_INDEX_FILE_NAME ? PAGE_INDEX_PATH : `/${fileName}`, output);
  }
  return { verdict: 'built', files };
}

/** One classic script, every module and every diagram kind mermaid loads lazily bundled in, so the frame loads no other file. */
async function buildDiagramFrame(frameFolderPath: string): Promise<PageBuildVerdict> {
  const indexFile = Bun.file(join(frameFolderPath, BUILT_INDEX_FILE_NAME));
  let built: Bun.BuildOutput;
  let indexText: string;
  try {
    indexText = await indexFile.text();
    built = await Bun.build({
      entrypoints: [join(frameFolderPath, DIAGRAM_FRAME_SCRIPT_FILE_NAME)],
      target:      'browser',
      format:      'iife',
      splitting:   false,
      minify:      true,
      define:      { 'process.env.NODE_ENV': '"production"' },
      throw:       false,
    });
  } catch (error) {
    return { verdict: 'unbuildable', failure: failureOf(error) };
  }
  if (!built.success) return { verdict: 'unbuildable', failure: built.logs.map((log) => log.message).join('\n') };
  const files = new Map<string, Blob>([[DIAGRAM_FRAME_PATH, new Blob([indexText], { type: HTML_FILE_TYPE })]]);
  for (const output of built.outputs) files.set(`${DIAGRAM_FRAME_PATH}${output.path.replace(RELATIVE_OUTPUT_PREFIX, '')}`, output);
  return { verdict: 'built', files };
}

function sharedBuildOf(build: () => Promise<PageBuildVerdict>): PageFilesSource {
  let building: Promise<PageBuildVerdict> | null = null;
  return async () => {
    building ??= build();
    const buildVerdict = await building;
    if (buildVerdict.verdict === 'unbuildable') building = null;
    return buildVerdict;
  };
}

export function builtPageFilesOf(indexFilePath: string): PageFilesSource {
  return sharedBuildOf(() => buildPage(indexFilePath));
}

export function builtDiagramFrameFilesOf(frameFolderPath: string): PageFilesSource {
  return sharedBuildOf(() => buildDiagramFrame(frameFolderPath));
}

export async function pageFileAnswerFor(pageFiles: PageFilesSource, pathname: string): Promise<Response> {
  const buildVerdict = await pageFiles();
  if (buildVerdict.verdict === 'unbuildable') return refusalAnswerOf('page-unbuildable');
  const file = buildVerdict.files.get(pathname);
  if (file === undefined) return refusalAnswerOf('not-found');
  const headers = new Headers({ 'content-type': file.type });
  if (file.type === FONT_FILE_TYPE) headers.set('cache-control', FONT_FILE_CACHE_CONTROL);
  return new Response(file, { headers });
}
