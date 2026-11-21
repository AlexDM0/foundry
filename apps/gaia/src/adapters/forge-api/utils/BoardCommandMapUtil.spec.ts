/**
 * Gaia's board commands mapped to the forge's contract commands. What matters: each kind maps to the contract's command of the same kind,
 * every kind is one the forge takes from a client (`FORGE_CONTROL_COMMAND_KINDS`) and no kind only its command line runs; Gaia's names
 * reach the contract's (`ticketId` as `ticketReference`, `runsIn` as `in`); a key Gaia holds as `null` is absent from the contract; and
 * every typed draft edit maps to the contract's typed edit.
 */
import { describe, expect, test }      from 'bun:test';
import { FORGE_CONTROL_COMMAND_KINDS } from 'forge-contracts/ForgeControlCommandKinds';

import type { BoardCommand }                                      from '../../../shared/@types/board/BoardCommand.ts';
import { EXAMPLE_BOARD_COMMAND_DOCUMENTS, exampleBoardCommandOf } from '../../page-api/testing/ExampleBoardCommandDocuments.ts';
import { BoardCommandMapUtil }                                    from './BoardCommandMapUtil.ts';

const EXAMPLE_COMMANDS: BoardCommand[] = Object.values(EXAMPLE_BOARD_COMMAND_DOCUMENTS).map(exampleBoardCommandOf);

const BY_HAND_KINDS = ['ticket-unready', 'ticket-reopen', 'ticket-status-set', 'log-note', 'namespace-set'];

function exampleCommandOf<Kind extends BoardCommand['kind']>(kind: Kind): Extract<BoardCommand, { readonly kind: Kind }> {
  return exampleBoardCommandOf(EXAMPLE_BOARD_COMMAND_DOCUMENTS[kind]) as Extract<BoardCommand, { readonly kind: Kind }>;
}

describe('the kinds Gaia sends', () => {
  test('are each a kind the forge takes from a client', () => {
    const contractKinds: readonly string[] = FORGE_CONTROL_COMMAND_KINDS;
    expect(BoardCommandMapUtil.kinds.filter((kind) => !contractKinds.includes(kind))).toEqual([]);
  });

  test('hold no kind only the forge\'s command line runs', () => {
    const kindsGaiaSends = new Set<string>(BoardCommandMapUtil.kinds);
    expect(BY_HAND_KINDS.filter((kind) => kindsGaiaSends.has(kind))).toEqual([]);
  });
});

describe('contractCommandOf', () => {
  test.each(EXAMPLE_COMMANDS)('maps $kind to the contract\'s command of the same kind', (command) => {
    expect(BoardCommandMapUtil.contractCommandOf(command).kind).toBe(command.kind);
  });

  test('maps the Assistant\'s switch to the contract\'s command, on and off', () => {
    expect(BoardCommandMapUtil.contractCommandOf({ kind: 'pipeline-assistant-set', on: true })).toEqual({ kind: 'pipeline-assistant-set', on: true });
    expect(BoardCommandMapUtil.contractCommandOf({ kind: 'pipeline-assistant-set', on: false })).toEqual({ kind: 'pipeline-assistant-set', on: false });
  });

  test('names a ticket by its reference, and leaves out a key Gaia holds as null', () => {
    const hold = BoardCommandMapUtil.contractCommandOf(exampleCommandOf('ticket-hold'));
    expect(hold).toEqual({ kind: 'ticket-hold', ticketReference: '001', reason: 'Waits for the example provider.' });
    const deliveryByHand = BoardCommandMapUtil.contractCommandOf(exampleCommandOf('ticket-deliver-by-hand'));
    expect(deliveryByHand).toEqual({ kind: 'ticket-deliver-by-hand', ticketReference: '002', commit: '0123abc' });
    expect(BoardCommandMapUtil.contractCommandOf(exampleCommandOf('ticket-ready'))).toEqual({ kind: 'ticket-ready', ticketReferences: ['001', '002'] });
    expect(BoardCommandMapUtil.contractCommandOf(exampleCommandOf('job-message'))).toEqual({ kind: 'job-message', jobId: 'J4', text: 'Use the example provider.' });
    expect(BoardCommandMapUtil.contractCommandOf(exampleCommandOf('intake-close'))).toEqual({ kind: 'intake-close', proposedDraftSets: [['D1', 'D2'], []] });
  });

  test('maps an answer\'s choices, a budget in dollars, a resume\'s target and a chart window', () => {
    const answer = BoardCommandMapUtil.contractCommandOf(exampleCommandOf('decision-answer'));
    expect(answer).toEqual({ kind: 'decision-answer', decisionId: 'E2', answer: { form: 'letters', choices: ['a', 'bc'] } });
    const billing = BoardCommandMapUtil.contractCommandOf(exampleCommandOf('pipeline-setup-billing'));
    expect(billing).toEqual({ kind: 'pipeline-setup-billing', setupId: 'S2', billing: { mode: 'api', maxBudgetUsd: 12.5 } });
    expect(BoardCommandMapUtil.contractCommandOf(exampleCommandOf('interrupted-work-resume'))).toEqual({ kind: 'interrupted-work-resume', target: { ticketReference: '002' } });
    expect(BoardCommandMapUtil.contractCommandOf({ kind: 'interrupted-work-resume', target: 'all' })).toEqual({ kind: 'interrupted-work-resume', target: 'all' });
    expect(BoardCommandMapUtil.contractCommandOf(exampleCommandOf('chart-range-set'))).toEqual({
      kind:  'chart-range-set',
      range: {
        kind: 'window', from: 'start', to: 'now', tickMinutes: null
      }
    });
  });

  test('sends a flag the contract marks only when true as present or absent', () => {
    expect(BoardCommandMapUtil.contractCommandOf(exampleCommandOf('pipeline-draft-undo'))).toEqual({
      kind: 'pipeline-draft-undo', setupId: 'S2', editId: 'X3', wholeBatch: true
    });
    expect(BoardCommandMapUtil.contractCommandOf(exampleCommandOf('pipeline-draft-edit'))).not.toHaveProperty('isACopy');
  });

  test('maps every typed draft edit to the contract\'s typed edit', () => {
    const contractCommand = BoardCommandMapUtil.contractCommandOf(exampleCommandOf('pipeline-draft-edit'));
    expect(contractCommand).toEqual({
      kind:          'pipeline-draft-edit',
      setupId:       'S2',
      draftRevision: 4,
      edits:         [
        {
          target: 'gate',
          name:   'unit',
          value:  {
            name: 'unit', run: 'bun test', fix: 'bun run lint:fix', in: '/apps/web', network: ['registry.example.com'], writes: []
          },
        },
        { target: 'gate', name: 'retired', value: null },
        { target: 'phase-order', phase: 'review', names: ['unit', 'lint'] },
        { target: 'prepare', name: 'install', value: { name: 'install', run: 'bun install' } },
        { target: 'prepare-order', names: ['install'] },
        { target: 'review', value: { name: 'review', reReview: { thresholdLines: 40 } } },
        { target: 'constitution', value: { path: 'docs/constitution.md' } },
        {
          target: 'role',
          role:   'builder',
          value:  { model: 'opus', effort: 'high', instructions: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }, { kind: 'file', path: 'docs/brief.md' }] },
        },
        { target: 'role', role: 'assistant', value: {} },
        { target: 'airlock', value: {} },
        { target: 'approval', approval: 'merge', value: true },
        { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'] } },
        { target: 'entity', entityKey: 'retired', value: null },
        { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'reviewer', value: { model: 'sonnet' } } },
        { target: 'within-entity', entityKey: 'web', edit: { target: 'reach', value: ['/packages/design-system'] } },
        { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: null } },
        { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: ['api'] } },
        { target: 'within-entity', entityKey: 'web', edit: { target: 'concurrency', value: 2 } },
        { target: 'within-entity', entityKey: 'web', edit: { target: 'constitution', value: null } },
      ],
    });
  });
});
