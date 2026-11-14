/**
 * The page build's one React. What matters: the real page, which imports the linked design-system package, bundles React and React DOM
 * from Gaia's own `node_modules` only, so the package's hooks run on Gaia's renderer; without the plugin the same build bundles the copy
 * beside the package's real folder, which proves the check can see a second copy.
 */
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { pageIndexFilePath } from './PageFilesRoute.ts';
import { singleReactPlugin } from './SingleReactPlugin.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..', '..', '..');

/** An unminified bundle names each module it holds in a comment line of its path, relative to the build's working folder. */
const REACT_MODULE_COMMENT = /^\/\/ (?<modulePath>\S*node_modules\/react(?:-dom)?\/\S+)$/gm;

async function reactModulePathsOf(plugins: Bun.BunPlugin[]): Promise<string[]> {
  const built = await Bun.build({
    entrypoints: [pageIndexFilePath()], target: 'browser', minify: false, throw: false, plugins
  });
  if (!built.success) throw new Error(built.logs.map((log) => log.message).join('\n'));
  const scriptTexts = await Promise.all(built.outputs.filter((output) => output.path.endsWith('.js')).map((output) => output.text()));
  return [...new Set(scriptTexts.flatMap((scriptText) => [...scriptText.matchAll(REACT_MODULE_COMMENT)].map((match) => match.groups?.['modulePath'] ?? '')))].sort();
}

describe('the page build', () => {
  test('bundles React only from Gaia\'s own node_modules', async () => {
    const reactModulePaths = await reactModulePathsOf([singleReactPlugin(REPOSITORY_ROOT)]);
    expect(reactModulePaths.length).toBeGreaterThan(0);
    expect(reactModulePaths.filter((modulePath) => !modulePath.startsWith('node_modules/'))).toEqual([]);
  });

  test('without the plugin it would bundle the second copy beside the linked package', async () => {
    const reactModulePaths = await reactModulePathsOf([]);
    expect(reactModulePaths.some((modulePath) => !modulePath.startsWith('node_modules/'))).toBe(true);
  });
});
