/**
 * The setting kinds of the control contract, applied to a Board in a change. What matters: an older or malformed `pipeline.json` refuses
 * every pipeline write with its own reason before the Board is touched, so nothing overwrites it, while the concurrency limit, which is not
 * stored there, is still set; and the gate kinds carry their phases and phase orders to the Board as sent.
 */
import { describe, expect, test } from 'bun:test';

import type { UnreadablePipelineReading }                       from '../../adapters/pipeline/PipelineFile.ts';
import type { Pipeline }                                        from '../../lib/tracker-model/@types/Pipeline.ts';
import type { ControlCommand }                                  from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal, type OperationRefusalDetail }        from '../../shared/OperationRefusal.ts';
import { boardFixture, type BoardFixture }                      from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                    from '../tracker/Workspace.ts';
import { ControlService }                                       from './ControlService.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';

const WORKSPACE = workspacePathsFor('/example-agency/storefront');
/** A pipeline refusal names where the transaction's records keep the pipeline. */
const PIPELINE_LOCATION = createFixtureRecordAllocation(boardFixture().board).locationOf({ record: 'pipeline' });

const STORED_PIPELINE: Pipeline = {
  version: 3,
  prepare: [],
  gates:   [{ name: 'types', run: 'bun run typecheck' }, { name: 'test', run: 'bun test' }],
  phases:  { build: ['types', 'test'], review: ['types'], merge: ['types', 'test'] },
};

const PIPELINE_WRITES: readonly ControlCommand[] = [
  { kind: 'pipeline-prepare-step-set', step: { name: 'install', run: 'bun install' } },
  { kind: 'pipeline-gate-add', gate: { name: 'lint', run: 'bun run lint' } },
  { kind: 'pipeline-gate-add', gate: { name: 'lint', run: 'bun run lint' }, phases: ['merge'] },
  { kind: 'pipeline-gate-order', phase: 'merge', names: ['test', 'types'] },
  { kind: 'pipeline-gates-none' },
  { kind: 'pipeline-gate-remove', name: 'test' },
  { kind: 'pipeline-approval-set', approval: 'merge', on: true },
];

function changeOf(fixture: BoardFixture, unreadablePipeline: UnreadablePipelineReading | null): BoardTransaction {
  return {
    board:                          fixture.board,
    workspace:                      WORKSPACE,
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(fixture.board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function refusalOf(attempt: () => unknown): OperationRefusal {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('the command was not refused');
}

describe('an unreadable pipeline.json', () => {
  test.each<[string, UnreadablePipelineReading, OperationRefusalDetail]>([
    ['older', { verdict: 'older' }, { kind: 'older-pipeline', filePath: PIPELINE_LOCATION }],
    [
      'malformed',
      { verdict: 'malformed', reason: 'gates[0] has no name' },
      { kind: 'malformed-pipeline', filePath: PIPELINE_LOCATION, reason: 'gates[0] has no name' },
    ],
  ])('an %s file refuses every pipeline write before the Board changes', (_case, reading, detail) => {
    for (const command of PIPELINE_WRITES) {
      const fixture = boardFixture();

      const refusal = refusalOf(() => ControlService.apply(command, changeOf(fixture, reading), ECHOED_CONTROL_CONTEXT));

      expect(refusal.status, command.kind).toBe('refused');
      expect(refusal.detail, command.kind).toEqual(detail);
      expect(fixture.board.pipelineChanged(), command.kind).toBe(false);
      expect(fixture.records, command.kind).toEqual([]);
    }
  });

  test('the concurrency limit, which pipeline.json does not hold, is still set', () => {
    const fixture = boardFixture();

    ControlService.apply({ kind: 'concurrency-set', limit: 3 }, changeOf(fixture, { verdict: 'older' }), ECHOED_CONTROL_CONTEXT);

    expect(fixture.board.concurrency().limit).toBe(3);
  });
});

describe('the gate kinds on a readable pipeline', () => {
  test('a gate added with phases runs in those phases, and one added without runs in every phase', () => {
    const fixture = boardFixture({ pipeline: structuredClone(STORED_PIPELINE) });
    const change  = changeOf(fixture, null);

    ControlService.apply({ kind: 'pipeline-gate-add', gate: { name: 'lint', run: 'bun run lint' }, phases: ['review', 'merge'] }, change, ECHOED_CONTROL_CONTEXT);
    ControlService.apply({ kind: 'pipeline-gate-add', gate: { name: 'e2e', run: 'bun run e2e' } }, change, ECHOED_CONTROL_CONTEXT);

    expect(fixture.board.pipeline()?.phases).toEqual({ build: ['types', 'test', 'e2e'], review: ['types', 'lint', 'e2e'], merge: ['types', 'test', 'lint', 'e2e'] });
  });

  test('an order sets the run order of that phase and hands back the changed pipeline', () => {
    const fixture = boardFixture({ pipeline: structuredClone(STORED_PIPELINE) });

    const applied = ControlService.apply({ kind: 'pipeline-gate-order', phase: 'merge', names: ['test', 'types'] }, changeOf(fixture, null), ECHOED_CONTROL_CONTEXT);

    expect(applied.outcome).toBe('done');
    expect(applied.result.pipeline.phases).toEqual({ build: ['types', 'test'], review: ['types'], merge: ['test', 'types'] });
  });
});
