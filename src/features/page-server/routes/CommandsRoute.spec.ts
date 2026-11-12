/**
 * The commands route over a command port that answers a verdict set by the spec: a readable command reaches the port as the internal
 * command and its verdict is answered in the page contract under its own status; a command Gaia cannot read reaches nothing and is
 * answered as not supported, with the reason as its code.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandVerdict }                                  from '../../../shared/@types/CommandVerdict.ts';
import type { GaiaCommand }                                     from '../../../shared/@types/GaiaCommand.ts';
import { COMMANDS_PATH, commandAnswerFor, type CommandCarrier } from './CommandsRoute.ts';

interface RecordingCarrier {
  readonly carryCommand:    CommandCarrier;
  readonly carriedCommands: GaiaCommand[];
}

function carrierAnswering(verdict: CommandVerdict): RecordingCarrier {
  const carriedCommands: GaiaCommand[] = [];
  return {
    carryCommand: (command) => {
      carriedCommands.push(command);
      return Promise.resolve(verdict);
    },
    carriedCommands,
  };
}

function commandRequestOf(body: string): Request {
  return new Request(`http://127.0.0.1:4790${COMMANDS_PATH}`, { method: 'POST', body });
}

const LOOK_AGAIN_BODY = JSON.stringify({ commandVersion: 1, kind: 'fleet-look-again' });

describe('a command Gaia can read', () => {
  test('reaches the command port as the internal command, and is answered with its verdict', async () => {
    const carrier = carrierAnswering({ verdict: 'done' });
    const answer = await commandAnswerFor(commandRequestOf(LOOK_AGAIN_BODY), carrier.carryCommand);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      answerVersion: 1, outcome: 'done', refusal: null, text: null
    });
    expect(carrier.carriedCommands).toEqual([{ kind: 'fleet-look-again' }]);
  });

  test('is answered under the status of its verdict', async () => {
    const verdicts: readonly CommandVerdict[] = [
      { verdict: 'done' },
      { verdict: 'nothing-to-do' },
      { verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' },
      {
        verdict: 'refused', refusedBy: 'forge', refusal: 'overseer-held', text: 'The Overseer is held by an install change.'
      },
      { verdict: 'unreachable' },
      { verdict: 'not-supported' },
    ];
    const statuses = await Promise.all(verdicts.map(async (verdict) => {
      return (await commandAnswerFor(commandRequestOf(LOOK_AGAIN_BODY), carrierAnswering(verdict).carryCommand)).status;
    }));
    expect(statuses).toEqual([200, 200, 409, 409, 502, 501]);
  });
});

describe('a command Gaia cannot read', () => {
  test('reaches nothing, and is answered as not supported with the reason as its code', async () => {
    const carrier = carrierAnswering({ verdict: 'done' });
    const bodies = ['look again', JSON.stringify({ commandVersion: 2, kind: 'fleet-look-again' }), JSON.stringify({ commandVersion: 1, kind: 'forge-start' })];
    const answers = await Promise.all(bodies.map(async (body) => {
      const answer = await commandAnswerFor(commandRequestOf(body), carrier.carryCommand);
      return [answer.status, await answer.json()] as const;
    }));
    expect(answers).toEqual([
      [400, {
        answerVersion: 1, outcome: 'not-supported', refusal: 'not-json', text: null
      }],
      [400, {
        answerVersion: 1, outcome: 'not-supported', refusal: 'other-version', text: null
      }],
      [400, {
        answerVersion: 1, outcome: 'not-supported', refusal: 'malformed', text: null
      }],
    ]);
    expect(carrier.carriedCommands).toEqual([]);
  });
});
