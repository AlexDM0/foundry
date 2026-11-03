/**
 * The pin of the Watcher bundle on the answers the real `Bun.build` gave, recorded by `src/testing/RecordedBunBuild.integration.spec.ts`.
 * What matters: the bundle file holds what the build gave, a bundle already pinned for the code version is kept without a build, and a
 * build that throws (a syntax error, a missing entry) leaves no bundle behind.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';

import { BUN_BUILD_RECORDING, recordedBunBuildOf }                 from '../../testing/RecordedBunBuild.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { WatcherBundle }                                           from './WatcherBundle.ts';

const CODE_VERSION = 'code-example';

let scratchDirectory = '';
let builtEntry = '';
let syntaxErrorEntry = '';
let missingEntry = '';
let build: ReturnType<typeof spyOn<typeof Bun, 'build'>> | null = null;

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('watcher-bundle');
  builtEntry = join(scratchDirectory, 'example-watcher.ts');
  syntaxErrorEntry = join(scratchDirectory, 'broken-watcher.ts');
  missingEntry = join(scratchDirectory, 'missing-watcher.ts');
  const recordedBuild = recordedBunBuildOf({
    [builtEntry]:       BUN_BUILD_RECORDING.BUILT_ENTRY,
    [syntaxErrorEntry]: BUN_BUILD_RECORDING.SYNTAX_ERROR_ENTRY,
    [missingEntry]:     BUN_BUILD_RECORDING.MISSING_ENTRY,
  });
  build = spyOn(Bun, 'build').mockImplementation(recordedBuild as unknown as typeof Bun.build);
});

afterEach(() => {
  build?.mockRestore();
  removeScratchDirectory(scratchDirectory);
});

test('the bundle file holds what the build gave', async () => {
  const bundlePath = await WatcherBundle.pinWatcherBundle({ overseerDirectory: scratchDirectory, codeVersion: CODE_VERSION, entryPath: builtEntry });
  expect(bundlePath).toBe(WatcherBundle.bundlePathOf(scratchDirectory, CODE_VERSION));
  expect(readFileSync(bundlePath, 'utf8')).toContain('console.log("bundled at the start");');
});

test('a bundle already pinned for the code version is kept without a build', async () => {
  const bundlePath = WatcherBundle.bundlePathOf(scratchDirectory, CODE_VERSION);
  writeFileSync(bundlePath, 'pinned before\n');
  expect(await WatcherBundle.pinWatcherBundle({ overseerDirectory: scratchDirectory, codeVersion: CODE_VERSION, entryPath: syntaxErrorEntry })).toBe(bundlePath);
  expect(readFileSync(bundlePath, 'utf8')).toBe('pinned before\n');
  expect(build?.mock.calls.length).toBe(0);
});

test.each([['a syntax error', () => syntaxErrorEntry], ['a missing entry', () => missingEntry]])('a build that throws on %s leaves no bundle', async (_case, entryOf) => {
  await expect(WatcherBundle.pinWatcherBundle({ overseerDirectory: scratchDirectory, codeVersion: CODE_VERSION, entryPath: entryOf() }))
    .rejects.toThrow('Bun.build failed');
  expect(existsSync(WatcherBundle.bundlePathOf(scratchDirectory, CODE_VERSION))).toBe(false);
});

test('an entry with no recorded answer fails rather than building', async () => {
  const unrecordedEntry = join(scratchDirectory, 'unrecorded-watcher.ts');
  await expect(WatcherBundle.pinWatcherBundle({ overseerDirectory: scratchDirectory, codeVersion: CODE_VERSION, entryPath: unrecordedEntry }))
    .rejects.toThrow('has no recorded answer');
});
