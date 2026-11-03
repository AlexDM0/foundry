/**
 * The open command's hand-over to the opener of this OS, on the answers the real opener gave under
 * `bun run record cli/OpenInTheDefaultBrowser.ts`. What matters: an opener that starts takes the URL and nothing is reported, and an
 * opener that cannot start (`ENOENT`) is reported on stderr instead of thrown, so a machine with no desktop still prints the URL.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  spyOn,
  test
} from 'bun:test';

import { OPENER_RECORDING }                                        from '../src/testing/RecordedBoundaryCommands.ts';
import { recordedCommandOf }                                       from '../src/testing/RecordedCommand.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchWorkspace.ts';
import { openInTheDefaultBrowser }                                 from './OpenInTheDefaultBrowser.ts';
import { openerFor }                                               from './OpenerFor.ts';
import { createCapturedCommandContext }                            from './testing/CapturedCommandContext.ts';

const EXAMPLE_URL = 'http://127.0.0.1:4173/progress.html';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('opener');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

test('the opener takes the URL as its last argument, and nothing is reported', () => {
  const context = createCapturedCommandContext({ currentDirectory: scratchDirectory, platform: process.platform });
  const recorded = recordedCommandOf(OPENER_RECORDING.BOUNDARY, { [OPENER_RECORDING.URL_PLACEHOLDER]: EXAMPLE_URL });
  const spawn = spyOn(Bun, 'spawn').mockImplementation(((argv: readonly string[]) => recorded.spawn(argv)) as unknown as typeof Bun.spawn);
  try {
    openInTheDefaultBrowser(context, EXAMPLE_URL);
    const opener = openerFor(process.platform, () => context.platformPorts.dataFolders.systemFolder());
    expect(spawn.mock.calls[0]?.[0]).toEqual([...opener.argv, EXAMPLE_URL]);
    expect(context.errorText()).toBe('');
  } finally {
    spawn.mockRestore();
  }
});

test('an opener that cannot start is reported on stderr, not thrown', () => {
  const context = createCapturedCommandContext({ currentDirectory: scratchDirectory, platform: process.platform });
  const recorded = recordedCommandOf(OPENER_RECORDING.BOUNDARY, {
    [OPENER_RECORDING.URL_PLACEHOLDER]:     EXAMPLE_URL,
    [OPENER_RECORDING.SCRATCH_PLACEHOLDER]: scratchDirectory,
  }, OPENER_RECORDING.MISSING_SITUATION);
  const missingOpener = join(scratchDirectory, 'missing-opener');
  // The opener of this OS is not missing here, so the spawn is answered as the recorded missing opener was.
  const spawn = spyOn(Bun, 'spawn').mockImplementation((() => recorded.spawn([missingOpener, EXAMPLE_URL])) as unknown as typeof Bun.spawn);
  try {
    expect(() => openInTheDefaultBrowser(context, EXAMPLE_URL)).not.toThrow();
    expect(context.errorText()).toContain('could not be run (ENOENT');
  } finally {
    spawn.mockRestore();
  }
});
