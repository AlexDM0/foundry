/**
 * `open` on a board no Overseer serves starts one detached, as `oversee --detach` does, and so first holds the same checks: where gates
 * cannot run confined it is refused before any process starts and opens nothing. The start and the live path are not driven here, since
 * they spawn an Overseer and launch a browser.
 */
import { existsSync, readdirSync }       from 'node:fs';
import { join }                          from 'node:path';
import { afterEach, beforeEach, expect } from 'bun:test';

import { PRODUCT_NAMES }                          from '../../../src/shared/constants/ProductNames.ts';
import { fakeGateConfinement }                    from '../../../src/testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                    from '../../../src/testing/NativePlatformPorts.ts';
import { useRecordedGit }                         from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                 from '../../../src/testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                  from '../../../src/testing/ToolGuard.ts';
import { runCommandLine }                         from '../../Main.ts';
import { createCapturedCommandContext }           from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';
import { GIT_VERSION }                            from '../../testing/RecordedGitStages.ts';

const FROZEN_NOW = new Date('2026-09-18T20:11:03Z');

const recordedGit = useRecordedGit();

function batonFileNamesIn(overseerDirectory: string): string[] {
  return existsSync(overseerDirectory) ? readdirSync(overseerDirectory).filter((fileName) => fileName.startsWith('baton-')) : [];
}

let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('open-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

testWhenGitIsRecorded('with no live Baton and no gate confinement, open is refused before it starts an Overseer, and opens nothing', async () => {
  const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement('unavailable') };
  const context       = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW, platformPorts });
  expect(await recordedGit.playStage([GIT_VERSION], async () => runCommandLine(['open'], context))).toBe(1);

  expect(context.errorText()).toContain('so the Overseer did not start');
  expect(context.errorText()).not.toContain('Started the Overseer');
  expect(context.outputText()).toBe('');
  expect(batonFileNamesIn(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'overseer'))).toEqual([]);
});

testWhenGitIsRecorded('open --no-browser is a known option: on a board it cannot start an Overseer for, it gets the same refusal', async () => {
  const platformPorts = { ...nativePlatformPorts(), gateConfinement: fakeGateConfinement('unavailable') };
  const context       = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW, platformPorts });
  expect(await recordedGit.playStage([GIT_VERSION], async () => runCommandLine(['open', '--no-browser'], context))).toBe(1);

  expect(context.errorText()).toContain('so the Overseer did not start');
  expect(context.outputText()).toBe('');
});
