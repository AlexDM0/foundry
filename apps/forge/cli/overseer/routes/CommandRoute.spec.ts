/**
 * `POST /api/commands`' answers that need no running Overseer. What matters: while launches are held for an install change a board command
 * is refused 423 before the tracker is opened, while `overseer-stop` and `overseer-restart` still reach the Overseer; a body with no known
 * kind, or a runtime command whose `now` is no boolean, is 400 and reaches nothing; and a `range`, `clear` or by-hand delivery of the wrong
 * shape is 400 before the hold, since a clear of an unknown scope would otherwise clear. The 423's sentence names no command line: the Bridge
 * and a monitor show it to User, who runs no command.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }                         from '../../../src/testing/ScratchWorkspace.ts';
import { createArgumentParser }                                                   from '../../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                                           from '../../testing/CapturedCommandContext.ts';
import { MALFORMED_BODY_TEXT, answerControlCommand, type RuntimeOverseerCommand } from './CommandRoute.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function heldRoute(launchesHeld: boolean) {
  const directory = createScratchDirectory('command-route');
  scratchDirectories.push(directory);
  const runtimeCommands: RuntimeOverseerCommand[] = [];
  const wakes: string[] = [];
  const request = {
    commandArguments: createArgumentParser([]),
    context:          createCapturedCommandContext({ currentDirectory: directory }),
    launchesHeld:     () => launchesHeld,
    onRuntimeCommand: (command: RuntimeOverseerCommand) => runtimeCommands.push(command),
    wake:             () => wakes.push('wake'),
  };
  return { request, runtimeCommands, wakes };
}

describe('answerControlCommand', () => {
  test('a board command while launches are held for an install change is 423; overseer-stop still reaches the Overseer', async () => {
    const { request, runtimeCommands, wakes } = heldRoute(true);
    const held = await answerControlCommand({ kind: 'overseer-pause' }, request);
    expect(held.status).toBe(423);
    const heldText = 'The install version changed, so launches are held until the board is updated.';
    expect(held.body).toEqual({ controlVersion: 1, refusal: 'launches-held-by-install-change', text: heldText });
    const stopAnswer = { controlVersion: 1, outcome: 'done', result: { kind: 'overseer-stop' } };
    expect(await answerControlCommand({ kind: 'overseer-stop', now: true }, request)).toEqual({ status: 200, body: stopAnswer });
    expect(runtimeCommands).toEqual([{ kind: 'overseer-stop', now: true }]);
    expect(wakes).toEqual([]);
  });

  test('an unknown kind, a body that is no object and a runtime command whose now is no boolean are 400 and reach nothing', async () => {
    const { request, runtimeCommands } = heldRoute(false);
    for (const body of [{ kind: 'no-such-command' }, ['overseer-stop'], null, { kind: 'overseer-stop', now: 'yes' }]) {
      expect((await answerControlCommand(body, request)).status).toBe(400);
    }
    expect(runtimeCommands).toEqual([]);
  });

  test('range, clear and a by-hand delivery of the wrong shape are 400 before the hold, and of the right shape reach it', async () => {
    const { request } = heldRoute(true);
    const wellShaped = [
      { kind: 'chart-range-set', range: { kind: 'automatic' } },
      {
        kind:  'chart-range-set',
        range: {
          kind: 'window', from: '-4h', to: 'now', tickMinutes: null
        }
      },
      { kind: 'tracker-clear', scope: 'tasks-and-log' },
      { kind: 'tracker-clear', scope: 'everything' },
      { kind: 'ticket-deliver-by-hand', ticketReference: '7', branch: 'ticket-007' },
    ];
    const malformed = [
      { kind: 'chart-range-set' },
      { kind: 'chart-range-set', range: { kind: 'window', from: '-4h', to: 'now' } },
      { kind: 'chart-range-set', range: { kind: 'sideways' } },
      { kind: 'tracker-clear' },
      { kind: 'tracker-clear', scope: 'everything ' },
      { kind: 'ticket-deliver-by-hand' },
      { kind: 'ticket-deliver-by-hand', ticketReference: 7 },
      { kind: 'ticket-deliver-by-hand', ticketReference: '7', commit: 42 },
    ];
    const malformedAnswer = { status: 400, body: { controlVersion: 1, refusal: 'malformed-body', text: MALFORMED_BODY_TEXT } };
    for (const body of wellShaped) expect((await answerControlCommand(body, request)).status, JSON.stringify(body)).toBe(423);
    for (const body of malformed) expect(await answerControlCommand(body, request), JSON.stringify(body)).toEqual(malformedAnswer);
  });
});
