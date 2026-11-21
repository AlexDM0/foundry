/**
 * The `gate` writes on a pipeline with entities. What matters: each write of the forge's own prepare steps, gates, phases or reach is
 * refused with the entity keys, before anything is changed or logged, since beside `entities` those stay empty and each entity's are set in
 * the pipeline builder; an approval and the Assistant's switch, which stay the forge's own, are still set; a pipeline without entities takes
 * every write as before; and a board with no pipeline refuses the Assistant's switch.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, entityPipelineFixture }   from '../../testing/BoardFixtures.ts';
import type { Board }                            from './Board.ts';
import { BoardRefusal, type BoardRefusalDetail } from './BoardRefusal.ts';
import { PipelineUtil }                          from './utils/PipelineUtil.ts';

const CHANGED_AT = '2026-11-17T10:00:00+01:00';

const ENTITY_KEYS_REFUSAL: BoardRefusalDetail = { reason: 'pipeline-set-per-entity', entityKeys: ['root', 'web', 'design-system'] };

const TOP_LEVEL_WRITES: readonly [string, (board: Board) => unknown][] = [
  ['a prepare step', (board) => board.setPrepareStep({ name: 'install', run: 'bun install' }, CHANGED_AT)],
  ['a gate', (board) => board.addGate({ name: 'test', run: 'bun test' }, CHANGED_AT)],
  ['a gate in some phases', (board) => board.addGate({ name: 'test', run: 'bun test' }, CHANGED_AT, ['build'])],
  ['a phase order', (board) => board.orderPhaseGates('build', ['test'], CHANGED_AT)],
  ['no gates on purpose', (board) => board.setNoGates(CHANGED_AT)],
  ['a gate removed', (board) => board.removeGate('test', CHANGED_AT)],
  ['the reach', (board) => board.setReach(['/bun.lock'], CHANGED_AT)],
];

function refusalDetailOf(attempt: () => unknown): BoardRefusalDetail {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BoardRefusal) return error.detail;
    throw error;
  }
  throw new Error('the call was not refused');
}

describe('a pipeline with entities', () => {
  test.each(TOP_LEVEL_WRITES)('%s is refused with the entity keys, with nothing changed or logged', (_case, write) => {
    const pipeline = entityPipelineFixture();
    const { board, records } = boardFixture({ pipeline: structuredClone(pipeline) });

    expect(refusalDetailOf(() => write(board))).toEqual(ENTITY_KEYS_REFUSAL);
    expect(board.pipeline()).toEqual(pipeline);
    expect(board.pipelineChanged()).toBe(false);
    expect(records).toEqual([]);
  });

  test('an approval, which stays the forge\'s own, is still set', () => {
    const { board } = boardFixture({ pipeline: entityPipelineFixture() });

    board.setApproval('merge', true, CHANGED_AT);

    expect(board.pipeline()?.approvals).toEqual({ merge: true });
    expect(board.pipelineChanged()).toBe(true);
  });

  test('the Assistant\'s switch, which is the board\'s own, is still set, and off again leaves no key', () => {
    const { board, records } = boardFixture({ pipeline: entityPipelineFixture() });

    board.setAssistant(true, CHANGED_AT);
    expect(board.pipeline()?.assistant).toBe(true);
    expect(board.assistantIsOn()).toBe(true);

    board.setAssistant(false, CHANGED_AT);
    expect(board.pipeline()).not.toHaveProperty('assistant');
    expect(board.assistantIsOn()).toBe(false);
    expect(records.map((record) => (record.kind === 'pipeline-assistant-set' ? record.fields.state : record.kind))).toEqual(['on', 'off']);
  });
});

describe('a pipeline without entities', () => {
  test.each(TOP_LEVEL_WRITES.filter(([writeCase]) => writeCase !== 'a phase order' && writeCase !== 'a gate removed'))(
    '%s is written as before',
    (_case, write) => {
      const { board } = boardFixture({ pipeline: PipelineUtil.minimalPipelineOf() });

      write(board);

      expect(board.pipelineChanged()).toBe(true);
      expect(board.pipeline()?.entities).toBeUndefined();
    },
  );
});

describe('a board with no pipeline', () => {
  test('has the Assistant off and refuses the switch assistant-without-pipeline', () => {
    const { board, records } = boardFixture();

    expect(board.assistantIsOn()).toBe(false);
    expect(refusalDetailOf(() => board.setAssistant(true, CHANGED_AT))).toEqual({ reason: 'assistant-without-pipeline' });
    expect(board.pipelineChanged()).toBe(false);
    expect(records).toEqual([]);
  });
});
