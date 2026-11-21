/**
 * The read of the GnuPG folders on the answers the real gpgconf gave, recorded by `GpgDirectories.integration.spec.ts`. What matters:
 * the folders are the ones gpgconf named for the home it was given, and a gpgconf that cannot start answers `null`, from which the home
 * falls back to `.gnupg` in the user's home.
 */
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { GPGCONF_RECORDING }                   from '../../testing/RecordedBoundaryCommands.ts';
import { type CommandCall, recordedCommandOf } from '../../testing/RecordedCommand.ts';
import { type GpgconfRun, GpgDirectories }     from './GpgDirectories.ts';

const EXAMPLE_HOME = '/home/alex-example';
const GPGCONF_PROGRAM = '/usr/local/bin/gpgconf';
const SUCCESS_EXIT_CODE = 0;

/** As the real run reads it: the output of a gpgconf that ended with exit 0, and `null` for any other end or a failed start. */
function recordedGpgconfRun(call: (userHomeDirectory: string) => CommandCall, programPath: string): GpgconfRun {
  return (userHomeDirectory) => {
    const recorded = recordedCommandOf(GPGCONF_RECORDING.BOUNDARY, {
      [GPGCONF_RECORDING.HOME_PLACEHOLDER]:    userHomeDirectory,
      [GPGCONF_RECORDING.PROGRAM_PLACEHOLDER]: programPath,
    });
    const answer = recorded.answerTo(call(userHomeDirectory));
    return answer.kind === 'finished' && answer.exitCode === SUCCESS_EXIT_CODE ? answer.stdout : null;
  };
}

test('the folders are the ones the recorded gpgconf named for the home it was given', () => {
  const directories = GpgDirectories.read(EXAMPLE_HOME, recordedGpgconfRun(() => ({ argv: [GPGCONF_PROGRAM, '--list-dirs'] }), GPGCONF_PROGRAM));
  expect(directories?.homeDirectory).toBe(join(EXAMPLE_HOME, '.gnupg'));
  expect(directories?.agentSocket?.startsWith(EXAMPLE_HOME)).toBe(true);
  expect(GpgDirectories.homeDirectoryOf(directories, EXAMPLE_HOME)).toBe(join(EXAMPLE_HOME, '.gnupg'));
});

test('a gpgconf that cannot start answers null, and the home falls back to .gnupg in the user\'s home', () => {
  const missingRun = recordedGpgconfRun(
    (userHomeDirectory) => ({ argv: [join(userHomeDirectory, 'missing', 'gpgconf'), '--list-dirs'], situation: GPGCONF_RECORDING.MISSING_SITUATION }),
    GPGCONF_PROGRAM,
  );
  const directories = GpgDirectories.read(EXAMPLE_HOME, missingRun);
  expect(directories).toBeNull();
  expect(GpgDirectories.homeDirectoryOf(directories, EXAMPLE_HOME)).toBe(join(EXAMPLE_HOME, '.gnupg'));
});

test('an argv with no recorded answer fails rather than answering', () => {
  expect(() => GpgDirectories.read(EXAMPLE_HOME, recordedGpgconfRun(() => ({ argv: [GPGCONF_PROGRAM, '--list-components'] }), GPGCONF_PROGRAM)))
    .toThrow('has no recorded answer');
});
