/**
 * The commands route over a command port that answers a verdict set by the spec: a readable command reaches the port as the internal
 * command and its verdict is answered in the page contract under its own status; a command Gaia cannot read reaches nothing and is
 * answered as not supported, with the reason as its code; a body over its bound reaches nothing and is answered as too large.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandVerdict }                   from '../../../shared/@types/CommandVerdict.ts';
import type { GaiaCommand }                      from '../../../shared/@types/GaiaCommand.ts';
import { commandAnswerFor, type CommandCarrier } from './CommandsRoute.ts';

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
  return new Request('http://127.0.0.1:4790/api/v4/commands', { method: 'POST', body });
}

const LOOK_AGAIN_BODY = JSON.stringify({ commandVersion: 3, kind: 'fleet-look-again' });

const EXAMPLE_BODY_BOUND_BYTES = 256;

describe('a command Gaia can read', () => {
  test('reaches the command port as the internal command, and is answered with its verdict', async () => {
    const carrier = carrierAnswering({ verdict: 'done' });
    const answer = await commandAnswerFor(commandRequestOf(LOOK_AGAIN_BODY), carrier.carryCommand, EXAMPLE_BODY_BOUND_BYTES);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      answerVersion: 3, outcome: 'done', refusal: null, text: null
    });
    expect(carrier.carriedCommands).toEqual([{ kind: 'fleet-look-again' }]);
  });

  test('of Flint\'s brain reaches the command port with its tracker id, and a refusal is answered with the forge\'s code and sentence', async () => {
    const text = 'Flint\'s brain cannot start while the usage limit holds. It resets at 14:00.';
    const carrier = carrierAnswering({
      verdict: 'refused', refusedBy: 'forge', refusal: 'usage-limit-holds', text,
    });
    const body = JSON.stringify({ commandVersion: 3, kind: 'forge-brain-start', trackerId: 'example-storefront-7c41' });
    const answer = await commandAnswerFor(commandRequestOf(body), carrier.carryCommand, EXAMPLE_BODY_BOUND_BYTES);
    expect([answer.status, await answer.json()]).toEqual([409, {
      answerVersion: 3, outcome: 'refused', refusal: 'usage-limit-holds', text,
    }]);
    expect(carrier.carriedCommands).toEqual([{ kind: 'forge-brain-start', trackerId: 'example-storefront-7c41' }]);
  });

  test('is answered under the status of its verdict', async () => {
    const verdicts: readonly CommandVerdict[] = [
      { verdict: 'done' },
      { verdict: 'path-chosen', path: '/Users/example/Development/example-storefront' },
      { verdict: 'nothing-to-do' },
      { verdict: 'refused', refusedBy: 'gaia', refusal: 'command-in-flight' },
      {
        verdict: 'refused', refusedBy: 'forge', refusal: 'overseer-held', text: 'The Overseer is held by an install change.'
      },
      { verdict: 'unreachable' },
      { verdict: 'not-supported' },
    ];
    const statuses = await Promise.all(verdicts.map(async (verdict) => {
      return (await commandAnswerFor(commandRequestOf(LOOK_AGAIN_BODY), carrierAnswering(verdict).carryCommand, EXAMPLE_BODY_BOUND_BYTES)).status;
    }));
    expect(statuses).toEqual([200, 200, 200, 409, 409, 502, 501]);
  });
});

describe('a command Gaia cannot read', () => {
  test('reaches nothing, and is answered as not supported with the reason as its code', async () => {
    const carrier = carrierAnswering({ verdict: 'done' });
    const bodies = ['look again', JSON.stringify({ commandVersion: 1, kind: 'fleet-look-again' }), JSON.stringify({ commandVersion: 3, kind: 'forge-start' })];
    const answers = await Promise.all(bodies.map(async (body) => {
      const answer = await commandAnswerFor(commandRequestOf(body), carrier.carryCommand, EXAMPLE_BODY_BOUND_BYTES);
      return [answer.status, await answer.json()] as const;
    }));
    expect(answers).toEqual([
      [400, {
        answerVersion: 3, outcome: 'not-supported', refusal: 'not-json', text: null
      }],
      [400, {
        answerVersion: 3, outcome: 'not-supported', refusal: 'other-version', text: null
      }],
      [400, {
        answerVersion: 3, outcome: 'not-supported', refusal: 'malformed', text: null
      }],
    ]);
    expect(carrier.carriedCommands).toEqual([]);
  });
});

describe('a command body over its bound', () => {
  test('reaches nothing and is answered as too large', async () => {
    const carrier = carrierAnswering({ verdict: 'done' });
    const oversized = JSON.stringify({ commandVersion: 3, kind: 'fleet-look-again', padding: 'x'.repeat(EXAMPLE_BODY_BOUND_BYTES) });
    expect((await commandAnswerFor(commandRequestOf(oversized), carrier.carryCommand, EXAMPLE_BODY_BOUND_BYTES)).status).toBe(413);
    expect(carrier.carriedCommands).toEqual([]);
  });
});
