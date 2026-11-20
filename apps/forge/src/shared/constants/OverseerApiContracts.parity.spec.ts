/**
 * The contract's list of every kind a client may send against forge's own pins. What matters: the list is exactly the union of
 * `CONTROL_CONTRACT_KINDS` and `BOARD_COMMAND_CONTRACT_KINDS`, each kind once, so forge and its clients read one list; and every listed kind
 * is a kind of forge's `OverseerApiCommand`, which the typecheck holds. That the command route ingests each listed kind, and refuses no
 * listed kind as one forge takes only by hand, is `cli/overseer/routes/CommandRoute.clientKinds.spec.ts`'s, beside the route.
 */
import { describe, expect, test } from 'bun:test';

import { FORGE_CONTROL_COMMAND_KINDS } from 'forge-contracts/ForgeControlCommandKinds';

import type { OverseerApiCommand }                              from '../@types/ControlCommand.ts';
import { BOARD_COMMAND_CONTRACT_KINDS, CONTROL_CONTRACT_KINDS } from './OverseerApiContracts.ts';

/** A listed kind that is no kind of forge's API command fails the typecheck here. */
const LISTED_KINDS_AS_FORGE_KINDS: readonly OverseerApiCommand['kind'][] = FORGE_CONTROL_COMMAND_KINDS;

describe('the contract\'s list of every kind a client may send', () => {
  test('is exactly the union of forge\'s control and board pins, each kind once', () => {
    expect(new Set(FORGE_CONTROL_COMMAND_KINDS).size).toBe(FORGE_CONTROL_COMMAND_KINDS.length);
    expect([...FORGE_CONTROL_COMMAND_KINDS].sort()).toEqual([...CONTROL_CONTRACT_KINDS, ...BOARD_COMMAND_CONTRACT_KINDS].sort());
  });

  test('names only kinds of forge\'s API command', () => {
    expect(LISTED_KINDS_AS_FORGE_KINDS).toBe(FORGE_CONTROL_COMMAND_KINDS);
  });
});
