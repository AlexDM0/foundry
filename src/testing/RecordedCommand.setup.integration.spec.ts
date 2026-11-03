/**
 * The real programs that machine setup runs on this OS, recorded for `cli/setup/Setup.spec.ts`: Bun's `--version`, and git's
 * `core.hooksPath` key read unset, written and read again in a scratch repository. What matters: each answer is what the process host of
 * setup reads, and a missing program fails to start with `ENOENT`. `bun install`, `link`, `build` and `upgrade` are not run, since they
 * change the user's Bun; macOS writes a LaunchAgent and runs no autostart tool.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { processSetupHostOf }                                         from '../../cli/setup/ProcessSetupHost.ts';
import { SETUP_RECORDING }                                            from './RecordedBoundaryCommands.ts';
import { type CommandCall, realCommandAnswerOf, recordCommandAnswer } from './RecordedCommand.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory }    from './ScratchWorkspace.ts';

const HOOKS_PATH = '.githooks';

let checkoutDirectory = '';

beforeEach(() => {
  checkoutDirectory = createCanonicalScratchDirectory('setup-commands');
  expect(realCommandAnswerOf(['git', 'init', '--quiet', checkoutDirectory])).toMatchObject({ kind: 'finished', exitCode: 0 });
});

afterEach(() => {
  removeScratchDirectory(checkoutDirectory);
});

test('Bun answers its version, git reads core.hooksPath unset, writes it and reads it set, and a missing program fails with ENOENT', () => {
  const placeholders = { [SETUP_RECORDING.BUN_PLACEHOLDER]: process.execPath, [SETUP_RECORDING.CHECKOUT_PLACEHOLDER]: checkoutDirectory };
  const host = processSetupHostOf({
    platform: process.platform, checkoutDirectory, homeDirectory: checkoutDirectory, runningBun: process.execPath
  });
  const recordedRun = (call: CommandCall): void => {
    const answer = realCommandAnswerOf(call.argv, { cwd: checkoutDirectory });
    if (answer.kind === 'finished') expect(host.run(call.argv, checkoutDirectory)).toEqual({ exitCode: answer.exitCode, output: `${answer.stdout}${answer.stderr}` });
    recordCommandAnswer(call, placeholders, answer);
  };
  const readHooksPath = ['git', '-C', checkoutDirectory, 'config', '--get', 'core.hooksPath'];

  recordedRun({ argv: [process.execPath, '--version'] });
  recordedRun({ argv: readHooksPath, situation: SETUP_RECORDING.KEY_UNSET_SITUATION });
  recordedRun({ argv: ['git', '-C', checkoutDirectory, 'config', 'core.hooksPath', HOOKS_PATH] });
  recordedRun({ argv: readHooksPath, situation: SETUP_RECORDING.KEY_SET_SITUATION });

  const missingBun = [join(checkoutDirectory, 'missing-bun'), '--version'];
  const missingAnswer = realCommandAnswerOf(missingBun, { cwd: checkoutDirectory });
  expect(missingAnswer).toEqual({ kind: 'spawn-failed', code: 'ENOENT' });
  recordCommandAnswer({ argv: missingBun, situation: SETUP_RECORDING.MISSING_SITUATION }, placeholders, missingAnswer);
});
