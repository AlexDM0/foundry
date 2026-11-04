/**
 * The opener answers for `cli/OpenInTheDefaultBrowser.spec.ts`, recorded under `bun run record cli/OpenInTheDefaultBrowser.ts`. What
 * matters: a missing opener fails to start with `ENOENT`, which the open command reports instead of throwing. That answer is taken from a
 * real spawn, because it starts nothing. The answer of the real opener is written from its documentation, because a real call opens a page.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { nativePlatformPorts }                                     from '../src/testing/NativePlatformPorts.ts';
import { OPENER_RECORDING }                                        from '../src/testing/RecordedBoundaryCommands.ts';
import type { CommandAnswer }                                      from '../src/testing/RecordedCommand.ts';
import { realCommandAnswerOf, recordCommandAnswer }                from '../src/testing/RecordedCommand.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { openerFor }                                               from './OpenerFor.ts';

const EXAMPLE_URL = 'http://127.0.0.1:4173/progress.html';

/**
 * Never taken from a run: the real opener opens a page in the default browser, and a spec never does. Sources: xdg-open(1), "Exit Codes",
 * exit 0 on success; open(1) of macOS and `rundll32.exe url.dll,FileProtocolHandler` hand the URL on, print nothing and end at once.
 */
const DOCUMENTED_OPENER_ANSWER: CommandAnswer = Object.freeze({
  kind: 'finished', exitCode: 0, stdout: '', stderr: ''
});

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('opener');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('the documented opener answer is recorded without a run, and a missing opener fails to start with ENOENT', () => {
  const placeholders = { [OPENER_RECORDING.URL_PLACEHOLDER]: EXAMPLE_URL };
  const ports = nativePlatformPorts();
  const opener = openerFor(process.platform, () => ports.dataFolders.systemFolder());
  recordCommandAnswer({ argv: [...opener.argv, EXAMPLE_URL] }, placeholders, DOCUMENTED_OPENER_ANSWER);

  const missingOpener = join(scratchDirectory, 'missing-opener');
  const missingAnswer = realCommandAnswerOf([missingOpener, EXAMPLE_URL]);
  expect(missingAnswer).toEqual({ kind: 'spawn-failed', code: 'ENOENT' });
  recordCommandAnswer(
    { argv: [missingOpener, EXAMPLE_URL], situation: OPENER_RECORDING.MISSING_SITUATION },
    { ...placeholders, [OPENER_RECORDING.SCRATCH_PLACEHOLDER]: scratchDirectory },
    missingAnswer,
  );
});
