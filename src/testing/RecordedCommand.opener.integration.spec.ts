/**
 * The real opener of this OS, recorded for `cli/OpenInTheDefaultBrowser.spec.ts`. It opens one scratch page in the default
 * browser, so it runs only under `bun run record cli/OpenInTheDefaultBrowser.ts`. What matters: the opener takes the URL and ends at
 * once, and a missing opener fails to start with `ENOENT`, which the open command reports instead of throwing.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { openerFor }                                               from '../../cli/OpenerFor.ts';
import { nativePlatformPorts }                                     from './NativePlatformPorts.ts';
import { OPENER_RECORDING }                                        from './RecordedBoundaryCommands.ts';
import { realCommandAnswerOf, recordCommandAnswer }                from './RecordedCommand.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('opener');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('the opener takes the URL and ends with exit 0, and a missing opener fails to start with ENOENT', () => {
  const pagePath = join(scratchDirectory, 'opened-by-the-record-run.html');
  writeFileSync(pagePath, '<p>Opened by bun run record cli/OpenInTheDefaultBrowser.ts. Close this page.</p>\n');
  const url = pathToFileURL(pagePath).href;
  const placeholders = { [OPENER_RECORDING.URL_PLACEHOLDER]: url };
  const ports = nativePlatformPorts();
  const opener = openerFor(process.platform, () => ports.dataFolders.systemFolder());

  const answer = realCommandAnswerOf([...opener.argv, url]);
  expect(answer).toEqual({
    kind: 'finished', exitCode: 0, stdout: '', stderr: ''
  });
  recordCommandAnswer({ argv: [...opener.argv, url] }, placeholders, answer);

  const missingOpener = join(scratchDirectory, 'missing-opener');
  const missingAnswer = realCommandAnswerOf([missingOpener, url]);
  expect(missingAnswer).toEqual({ kind: 'spawn-failed', code: 'ENOENT' });
  recordCommandAnswer(
    { argv: [missingOpener, url], situation: OPENER_RECORDING.MISSING_SITUATION },
    { ...placeholders, [OPENER_RECORDING.SCRATCH_PLACEHOLDER]: scratchDirectory },
    missingAnswer,
  );
});
