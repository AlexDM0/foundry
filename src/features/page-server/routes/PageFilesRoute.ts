/**
 * `GET /` and the page's files: the page is built by `Bun.build` on its first request, not at start, so the health route answers at once.
 * Every later request shares that one build; a failed build answers its refusal and the next request builds again. The built files stay
 * in memory, `index.html` at `/` and each chunk at its own name, so nothing generated lands in the repository.
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

/** The page's HTML entry in this repository. */
export function pageIndexFilePath(): string {
  return join(import.meta.dir, '..', '..', '..', '..', 'page', 'index.html');
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
    return { verdict: 'unbuildable', failure: error instanceof Error ? error.message : String(error) };
  }
  if (!built.success) return { verdict: 'unbuildable', failure: built.logs.map((log) => log.message).join('\n') };
  const files = new Map<string, Blob>();
  for (const output of built.outputs) {
    const fileName = output.path.replace(RELATIVE_OUTPUT_PREFIX, '');
    files.set(fileName === BUILT_INDEX_FILE_NAME ? PAGE_INDEX_PATH : `/${fileName}`, output);
  }
  return { verdict: 'built', files };
}

export function builtPageFilesOf(indexFilePath: string): PageFilesSource {
  let building: Promise<PageBuildVerdict> | null = null;
  return async () => {
    building ??= buildPage(indexFilePath);
    const buildVerdict = await building;
    if (buildVerdict.verdict === 'unbuildable') building = null;
    return buildVerdict;
  };
}

export async function pageFileAnswerFor(pageFiles: PageFilesSource, pathname: string): Promise<Response> {
  const buildVerdict = await pageFiles();
  if (buildVerdict.verdict === 'unbuildable') return refusalAnswerOf('page-unbuildable');
  const file = buildVerdict.files.get(pathname);
  return file === undefined ? refusalAnswerOf('not-found') : new Response(file, { headers: { 'content-type': file.type } });
}
