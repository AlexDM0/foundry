/**
 * `POST /api/commands`' answers that need no running Hephaestus. What matters: while launches are held for an install change a board command
 * is refused 423 before the tracker is opened, while `hephaestus-stop`, `hephaestus-restart` and `talos-restart` still reach Hephaestus,
 * whose outcome the answer carries, `nothing-to-do` for a Talos restart with no Talos; a body with no known kind, or a runtime command
 * whose `now` is no boolean, is 400 and reaches nothing; and a `range`, `clear` or by-hand delivery of the wrong shape is 400 before the
 * hold, since a clear of an unknown scope would otherwise clear. The 423's sentence names no command line: a client shows it
 * to User, who runs no command.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { workspacePathsFor }                              from '../../../src/services/tracker/Workspace.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../../src/testing/ScratchWorkspace.ts';
import { boardStoreIn }                                   from '../../BoardStoreOf.ts';
import { createArgumentParser }                           from '../../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                   from '../../testing/CapturedCommandContext.ts';
import {
  MALFORMED_BODY_TEXT,
  type RuntimeCommandOutcome,
  type RuntimeHephaestusCommand,
  answerControlCommand
} from './CommandRoute.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function heldRoute(launchesHeld: boolean, runtimeOutcome: RuntimeCommandOutcome = 'done') {
  const directory = createScratchDirectory('command-route');
  scratchDirectories.push(directory);
  const runtimeCommands: RuntimeHephaestusCommand[] = [];
  const wakes: string[] = [];
  const context   = createCapturedCommandContext({ currentDirectory: directory });
  const workspace = workspacePathsFor(directory);
  const request = {
    commandArguments: createArgumentParser([]),
    context,
    workspace,
    boardStore:       boardStoreIn(context, workspace),
    launchesHeld:     () => launchesHeld,
    onRuntimeCommand: (command: RuntimeHephaestusCommand) => {
      runtimeCommands.push(command);
      return Promise.resolve(runtimeOutcome);
    },
    wake: () => wakes.push('wake'),
  };
  return { request, runtimeCommands, wakes };
}

describe('answerControlCommand', () => {
  test('a board command while launches are held for an install change is 423; hephaestus-stop still reaches Hephaestus', async () => {
    const { request, runtimeCommands, wakes } = heldRoute(true);
    const held = await answerControlCommand({ kind: 'hephaestus-pause' }, request);
    expect(held.status).toBe(423);
    const heldText = 'The install version changed, so launches are held until the board is updated.';
    expect(held.body).toEqual({
      controlVersion: 3, refusal: 'launches-held-by-install-change', fields: {}, text: heldText
    });
    const stopAnswer = { controlVersion: 3, outcome: 'done', result: { kind: 'hephaestus-stop' } };
    expect(await answerControlCommand({ kind: 'hephaestus-stop', now: true }, request)).toEqual({ status: 200, body: stopAnswer });
    expect(runtimeCommands).toEqual([{ kind: 'hephaestus-stop', now: true }]);
    expect(wakes).toEqual([]);
  });

  test('talos-restart reaches Hephaestus while launches are held, carries no now, and answers the outcome Hephaestus gave', async () => {
    const { request, runtimeCommands, wakes } = heldRoute(true);
    const doneAnswer = { controlVersion: 3, outcome: 'done', result: { kind: 'talos-restart' } };
    expect(await answerControlCommand({ kind: 'talos-restart', now: true }, request)).toEqual({ status: 200, body: doneAnswer });
    expect([runtimeCommands, wakes]).toEqual([[{ kind: 'talos-restart' }], []]);

    const withoutTalos = heldRoute(false, 'nothing-to-do');
    const nothingAnswer = { controlVersion: 3, outcome: 'nothing-to-do', result: { kind: 'talos-restart' } };
    expect(await answerControlCommand({ kind: 'talos-restart' }, withoutTalos.request)).toEqual({ status: 200, body: nothingAnswer });
  });

  test('an unknown kind, a body that is no object and a runtime command whose now is no boolean are 400 and reach nothing', async () => {
    const { request, runtimeCommands } = heldRoute(false);
    for (const body of [{ kind: 'no-such-command' }, ['hephaestus-stop'], null, { kind: 'hephaestus-stop', now: 'yes' }]) {
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
    const malformedAnswer = {
      status: 400,
      body:   {
        controlVersion: 3, refusal: 'malformed-body', fields: {}, text: MALFORMED_BODY_TEXT
      }
    };
    for (const body of wellShaped) expect((await answerControlCommand(body, request)).status, JSON.stringify(body)).toBe(423);
    for (const body of malformed) expect(await answerControlCommand(body, request), JSON.stringify(body)).toEqual(malformedAnswer);
  });

});
