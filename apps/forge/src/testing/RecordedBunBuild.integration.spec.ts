/**
 * The real `Bun.build` of a Watcher entry, recorded for `src/services/overseer/WatcherBundle.spec.ts`. What matters: an entry that builds
 * gives one output, and an entry with a syntax error and a missing entry make the build throw rather than answer `success: false`.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { BUN_BUILD_RECORDING, realBunBuildAnswerOf, recordBunBuildAnswer } from './RecordedBunBuild.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory }         from './ScratchWorkspace.ts';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('bun-build');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('an entry that builds gives one output, and a syntax error or a missing entry makes the build throw', async () => {
  const builtEntry = join(scratchDirectory, 'example-watcher.ts');
  writeFileSync(builtEntry, 'console.log(\'bundled at the start\');\n');
  const built = await realBunBuildAnswerOf(builtEntry);
  expect(built).toMatchObject({ kind: 'built', success: true });
  expect(built.kind === 'built' ? built.outputTexts.length : 0).toBe(1);
  recordBunBuildAnswer(BUN_BUILD_RECORDING.BUILT_ENTRY, scratchDirectory, built);

  const syntaxErrorEntry = join(scratchDirectory, 'broken-watcher.ts');
  writeFileSync(syntaxErrorEntry, 'console.log(\n');
  const rejectedSyntax = await realBunBuildAnswerOf(syntaxErrorEntry);
  expect(rejectedSyntax.kind).toBe('rejected');
  recordBunBuildAnswer(BUN_BUILD_RECORDING.SYNTAX_ERROR_ENTRY, scratchDirectory, rejectedSyntax);

  const rejectedMissing = await realBunBuildAnswerOf(join(scratchDirectory, 'missing-watcher.ts'));
  expect(rejectedMissing.kind).toBe('rejected');
  recordBunBuildAnswer(BUN_BUILD_RECORDING.MISSING_ENTRY, scratchDirectory, rejectedMissing);
});
