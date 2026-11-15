/**
 * The one mock of an outside command, held on the recording of `cli/setup/`. What matters: it gives only a recorded answer, with each
 * placeholder filled in; an argv or a situation with no recorded answer fails rather than answering; and a recorded failed start throws
 * as Bun throws, with the code, so a default spec sees the missing program the real system showed.
 */
import { expect, test } from 'bun:test';

import { SETUP_RECORDING }   from './RecordedBoundaryCommands.ts';
import { recordedCommandOf } from './RecordedCommand.ts';

const EXAMPLE_CHECKOUT = '/home/alex-example/agent-progress';
const PLACEHOLDERS = { [SETUP_RECORDING.CHECKOUT_PLACEHOLDER]: EXAMPLE_CHECKOUT, [SETUP_RECORDING.BUN_PLACEHOLDER]: '/opt/example/bin/bun' };
const READ_HOOKS_PATH = ['git', '-C', EXAMPLE_CHECKOUT, 'config', '--get', 'core.hooksPath'];

test('a recorded argv in its situation gets the recorded answer', () => {
  const recorded = recordedCommandOf(SETUP_RECORDING.BOUNDARY, PLACEHOLDERS);
  expect(recorded.answerTo({ argv: READ_HOOKS_PATH, situation: SETUP_RECORDING.KEY_UNSET_SITUATION })).toMatchObject({ kind: 'finished', exitCode: 1 });
  expect(recorded.answerTo({ argv: READ_HOOKS_PATH, situation: SETUP_RECORDING.KEY_SET_SITUATION })).toMatchObject({ kind: 'finished', exitCode: 0 });
});

test('an argv or a situation with no recorded answer fails', () => {
  const recorded = recordedCommandOf(SETUP_RECORDING.BOUNDARY, PLACEHOLDERS);
  expect(() => recorded.answerTo({ argv: READ_HOOKS_PATH })).toThrow('has no recorded answer');
  expect(() => recorded.answerTo({ argv: ['git', '-C', EXAMPLE_CHECKOUT, 'config', '--get', 'user.name'], situation: SETUP_RECORDING.KEY_SET_SITUATION }))
    .toThrow('has no recorded answer');
  expect(() => recorded.spawnSync(['/opt/example/bin/bun', 'upgrade'])).toThrow('has no recorded answer');
});

test('a recorded failed start throws with its code, as Bun throws for a missing program', () => {
  const recorded = recordedCommandOf(SETUP_RECORDING.BOUNDARY, PLACEHOLDERS, SETUP_RECORDING.MISSING_SITUATION);
  expect(() => recorded.spawnSync([`${EXAMPLE_CHECKOUT}/missing-bun`, '--version'])).toThrow(expect.objectContaining({ code: 'ENOENT' }));
});
