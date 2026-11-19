/**
 * `POST /api/commands`' answers that need no running Overseer. What matters: while launches are held for an install change a board command
 * is refused 423 before the tracker is opened, while `overseer-stop` and `overseer-restart` still reach the Overseer; a body with no known
 * kind, or a runtime command whose `now` is no boolean, is 400 and reaches nothing; and a `range`, `clear` or by-hand delivery of the wrong
 * shape is 400 before the hold, since a clear of an unknown scope would otherwise clear. The 423's sentence names no command line: the Bridge
 * and a monitor show it to User, who runs no command. Flint's brain's commands reach the brain also while launches are held, and a start
 * names the Bridge as its starter only when the request carries a Bridge session, the API otherwise, whatever the body says.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { MonitorFlintBrainStartedBy } from 'forge-contracts/MonitorSnapshotDocument';

import type { CommandCaller }                                                     from '../../../src/services/overseer/OverseerServer.ts';
import { createScratchDirectory, removeScratchDirectory }                         from '../../../src/testing/ScratchWorkspace.ts';
import { createArgumentParser }                                                   from '../../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                                           from '../../testing/CapturedCommandContext.ts';
import { MALFORMED_BODY_TEXT, answerControlCommand, type RuntimeOverseerCommand } from './CommandRoute.ts';

const scratchDirectories: string[] = [];

const API_CALLER: CommandCaller = { carriesBridgeSession: false };

const BRIDGE_CALLER: CommandCaller = { carriesBridgeSession: true };

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function heldRoute(launchesHeld: boolean) {
  const directory = createScratchDirectory('command-route');
  scratchDirectories.push(directory);
  const runtimeCommands: RuntimeOverseerCommand[] = [];
  const wakes: string[] = [];
  const brainStarters: MonitorFlintBrainStartedBy[] = [];
  const request = {
    commandArguments: createArgumentParser([]),
    context:          createCapturedCommandContext({ currentDirectory: directory }),
    launchesHeld:     () => launchesHeld,
    onRuntimeCommand: (command: RuntimeOverseerCommand) => runtimeCommands.push(command),
    wake:             () => wakes.push('wake'),
    flintBrain:       {
      start: async (startedBy: MonitorFlintBrainStartedBy) => {
        brainStarters.push(startedBy);
        return await Promise.resolve({ verdict: 'done' } as const);
      },
      stop: async () => await Promise.resolve({ verdict: 'done' } as const),
    },
  };
  return {
    request, runtimeCommands, wakes, brainStarters
  };
}

describe('answerControlCommand', () => {
  test('a board command while launches are held for an install change is 423; overseer-stop still reaches the Overseer', async () => {
    const { request, runtimeCommands, wakes } = heldRoute(true);
    const held = await answerControlCommand({ kind: 'overseer-pause' }, request, API_CALLER);
    expect(held.status).toBe(423);
    const heldText = 'The install version changed, so launches are held until the board is updated.';
    expect(held.body).toEqual({
      controlVersion: 1, refusal: 'launches-held-by-install-change', fields: {}, text: heldText
    });
    const stopAnswer = { controlVersion: 1, outcome: 'done', result: { kind: 'overseer-stop' } };
    expect(await answerControlCommand({ kind: 'overseer-stop', now: true }, request, API_CALLER)).toEqual({ status: 200, body: stopAnswer });
    expect(runtimeCommands).toEqual([{ kind: 'overseer-stop', now: true }]);
    expect(wakes).toEqual([]);
  });

  test('an unknown kind, a body that is no object and a runtime command whose now is no boolean are 400 and reach nothing', async () => {
    const { request, runtimeCommands } = heldRoute(false);
    for (const body of [{ kind: 'no-such-command' }, ['overseer-stop'], null, { kind: 'overseer-stop', now: 'yes' }]) {
      expect((await answerControlCommand(body, request, API_CALLER)).status).toBe(400);
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
        controlVersion: 1, refusal: 'malformed-body', fields: {}, text: MALFORMED_BODY_TEXT
      }
    };
    for (const body of wellShaped) expect((await answerControlCommand(body, request, API_CALLER)).status, JSON.stringify(body)).toBe(423);
    for (const body of malformed) expect(await answerControlCommand(body, request, API_CALLER), JSON.stringify(body)).toEqual(malformedAnswer);
  });

  test('Flint\'s brain\'s commands reach the brain while launches are held, and wake no pass', async () => {
    const { request, wakes, brainStarters } = heldRoute(true);
    const startAnswer = { controlVersion: 1, outcome: 'done', result: { kind: 'flint-brain-start' } };
    expect(await answerControlCommand({ kind: 'flint-brain-start' }, request, API_CALLER)).toEqual({ status: 200, body: startAnswer });
    const stopAnswer = { controlVersion: 1, outcome: 'done', result: { kind: 'flint-brain-stop' } };
    expect(await answerControlCommand({ kind: 'flint-brain-stop' }, request, API_CALLER)).toEqual({ status: 200, body: stopAnswer });
    expect([brainStarters, wakes]).toEqual([['api'], []]);
  });

  test('a start names the API by the token alone and the Bridge by its session, whatever the body names', async () => {
    const { request, brainStarters } = heldRoute(false);
    await answerControlCommand({ kind: 'flint-brain-start' }, request, API_CALLER);
    await answerControlCommand({ kind: 'flint-brain-start', startedBy: 'bridge' }, request, API_CALLER);
    await answerControlCommand({ kind: 'flint-brain-start' }, request, BRIDGE_CALLER);
    await answerControlCommand({ kind: 'flint-brain-start', startedBy: 'api' }, request, BRIDGE_CALLER);
    expect(brainStarters).toEqual(['api', 'api', 'bridge', 'bridge']);
  });
});
