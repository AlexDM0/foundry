/**
 * `open` on a board no Overseer serves: refused `overseer-down` at exit 1 with the advice to start one, rather than opening the stub
 * `progress.html`, which only says the Overseer is down. The live path is not driven here, since it launches a browser.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { PRODUCT_NAMES }                          from '../../../src/shared/constants/ProductNames.ts';
import { useRecordedGit }                         from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../../src/testing/ScratchWorkspace.ts';
import { runCommandLine }                         from '../../Main.ts';
import { createCapturedCommandContext }           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const recordedGit = useRecordedGit();

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('open-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

test('A3: with no live Baton, open is refused overseer-down at exit 1, advising oversee --detach, and prints no path', async () => {
  const context = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  expect(await runCommandLine(['open'], context)).toBe(1);

  expect(context.errorText()).toContain('No Overseer serves this board');
  expect(context.errorText()).toContain(`\`${PRODUCT_NAMES.PROGRAM} oversee --detach\``);
  expect(context.outputText()).toBe('');
});
