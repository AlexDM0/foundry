/**
 * User's gate profile kinds, applied as a hold applies them. What matters: a start queues the gate as the open setup's draft or, with no
 * setup named, the stored pipeline defines it, never with its `writes`, and with that pipeline's prepare steps; a gate the source does not
 * define is `unknown-gate`, another setup `no-setup-open`, an unreadable stored pipeline its own refusal and a misshapen body
 * `malformed-setup-command`; a second start of a gate and phase not ended is `gate-profile-running`; and no role relays a start. On a forge
 * over entities a start names the entity: its gate and prepare steps come from the entity's single pipeline, each folder taken from the
 * repository's root through the entity's first home, the run is kept by entity, gate and phase, and an entity the source lacks is
 * `unknown-gate`.
 */
import { describe, expect, test } from 'bun:test';

import type { UnreadablePipelineReading }                       from '../../adapters/pipeline/PipelineFile.ts';
import type { Pipeline, PipelineEntity }                        from '../../lib/tracker-model/@types/Pipeline.ts';
import { BoardRefusal }                                         from '../../lib/tracker-model/BoardRefusal.ts';
import type { ControlCommand }                                  from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                                     from '../../shared/OperationRefusal.ts';
import { boardFixture, type BoardFixture }                      from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                    from '../tracker/Workspace.ts';
import { Bouncer }                                              from './Bouncer.ts';
import { ControlService }                                       from './ControlService.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';

const REPOSITORY_ROOT = '/example-agency/storefront';

const STORED_PIPELINE: Pipeline = {
  version: 3,
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }],
  gates:   [{
    name: 'browser-tests', run: 'bun run test:browser', in: 'web', network: ['registry.npmjs.org'], writes: ['~/.cache/ms-playwright'], fix: 'bun run fix'
  }],
  phases: { build: [], review: [], merge: ['browser-tests'] },
};

function changeOf(fixture: BoardFixture, unreadablePipeline: UnreadablePipelineReading | null = null): BoardTransaction {
  return {
    board:                          fixture.board,
    workspace:                      workspacePathsFor(REPOSITORY_ROOT),
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(fixture.board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function apply(fixture: BoardFixture, command: ControlCommand, unreadablePipeline: UnreadablePipelineReading | null = null): unknown {
  return ControlService.apply(command, changeOf(fixture, unreadablePipeline), ECHOED_CONTROL_CONTEXT).result;
}

function refusalDetailOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BoardRefusal || error instanceof OperationRefusal) return error.detail;
    throw error;
  }
  throw new Error('the command was not refused');
}

/** A stored pipeline and an open update record S1 whose draft is that pipeline with one more gate. */
function boardWithAnUpdate(): BoardFixture {
  const fixture = boardFixture({ pipeline: structuredClone(STORED_PIPELINE) });
  apply(fixture, { kind: 'pipeline-update-start' });
  apply(fixture, {
    kind:          'pipeline-draft-edit',
    setupId:       'S1',
    draftRevision: 0,
    edits:         [
      { target: 'gate', name: 'typecheck', value: { name: 'typecheck', run: 'bun run typecheck' } },
      { target: 'phase-order', phase: 'build', names: ['typecheck'] },
    ],
  });
  return fixture;
}

function start(setupId: string | null, gateName: string, phase: 'build' | 'merge' = 'merge'): ControlCommand {
  return {
    kind: 'gate-profile-start', setupId, gateName, phase
  };
}

describe('a start', () => {
  test('from the open setup queues the draft\'s gate in the phase, with the draft\'s prepare steps and never its writes', () => {
    const fixture = boardWithAnUpdate();

    apply(fixture, start('S1', 'typecheck', 'build'));
    apply(fixture, start('S1', 'browser-tests'));

    expect(fixture.board.gateProfileRuns()).toMatchObject([
      {
        profileRunId: 'P1', setupId: 'S1', phase: 'build', gate: { name: 'typecheck', run: 'bun run typecheck' }, prepare: STORED_PIPELINE.prepare
      },
      {
        profileRunId: 'P2',
        setupId:      'S1',
        phase:        'merge',
        gate:         {
          name: 'browser-tests', run: 'bun run test:browser', in: 'web', network: ['registry.npmjs.org']
        },
      },
    ]);
    expect(Object.keys(fixture.board.gateProfileRuns()[1]?.gate ?? {})).toEqual(['name', 'run', 'in', 'network']);
  });

  test('with no setup named queues the stored pipeline\'s gate', () => {
    const fixture = boardFixture({ pipeline: structuredClone(STORED_PIPELINE) });

    apply(fixture, start(null, 'browser-tests'));

    expect(fixture.board.gateProfileRuns()).toMatchObject([{ profileRunId: 'P1', setupId: null, gate: { name: 'browser-tests' } }]);
  });

  test('of a gate and phase with a run not ended refuses gate-profile-running', () => {
    const fixture = boardWithAnUpdate();
    apply(fixture, start('S1', 'browser-tests'));

    expect(refusalDetailOf(() => apply(fixture, start('S1', 'browser-tests')))).toEqual({
      reason: 'gate-profile-running', gateName: 'browser-tests', phase: 'merge', profileRunId: 'P1'
    });
  });

  const unknownGateOfTheDraft = { reason: 'unknown-gate', gateName: 'lint', gateNames: ['browser-tests', 'typecheck'] };
  const olderPipelineRefusal = { kind: 'older-pipeline', filePath: createFixtureRecordAllocation(boardFixture().board).locationOf({ record: 'pipeline' }) };
  const malformedFieldOf = (field: string): object => ({ kind: 'malformed-setup-command', commandKind: 'gate-profile-start', field });
  const misshapen = (change: Record<string, unknown>): ControlCommand => ({ ...start('S1', 'browser-tests'), ...change }) as unknown as ControlCommand;

  test.each([
    ['a gate the draft does not define', () => apply(boardWithAnUpdate(), start('S1', 'lint')), unknownGateOfTheDraft],
    ['a gate with no pipeline stored', () => apply(boardFixture(), start(null, 'lint')), { reason: 'unknown-gate', gateName: 'lint', gateNames: [] }],
    ['another setup than the open one', () => apply(boardWithAnUpdate(), start('S4', 'browser-tests')), { reason: 'no-setup-open', setupId: 'S4' }],
    ['a stored pipeline that is older', () => apply(boardFixture(), start(null, 'lint'), { verdict: 'older' }), olderPipelineRefusal],
    ['a phase that is none', () => apply(boardWithAnUpdate(), misshapen({ phase: 'deploy' })), malformedFieldOf('phase')],
    ['a setup id that is no text', () => apply(boardWithAnUpdate(), misshapen({ setupId: 3 })), malformedFieldOf('setupId')],
  ])('refuses %s', (_case, attempt, detail) => {
    expect(refusalDetailOf(attempt)).toEqual(detail);
  });
});

describe('a start of an entity\'s gate', () => {
  const webEntity: PipelineEntity = {
    kind:    'app',
    home:    ['/apps/web/'],
    prepare: [{ name: 'install', run: 'bun install', in: '/' }, { name: 'generate', run: 'bun run generate' }],
    gates:   [
      { name: 'tests', run: 'bun test', writes: ['~/.cache'] },
      { name: 'browser-tests', run: 'bun run test:browser', in: 'e2e' },
      { name: 'audit', run: 'bun run audit', in: '/' },
    ],
    phases: { build: ['tests'], review: [], merge: ['browser-tests', 'audit'] },
  };
  const rootEntity: PipelineEntity = {
    kind: 'root', home: ['/'], prepare: [], gates: [{ name: 'tests', run: 'bun run check' }], phases: { build: ['tests'], review: [], merge: [] },
  };
  const entityPipeline: Pipeline = {
    version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, entities: { web: webEntity, root: rootEntity },
  };
  const startOf = (entity: string, gateName: string, phase: 'build' | 'merge'): ControlCommand => ({
    kind: 'gate-profile-start', setupId: null, gateName, phase, entity
  }) as unknown as ControlCommand;

  test('queues the entity\'s gate with its prepare steps, each folder from the repository\'s root through its first home', () => {
    const fixture = boardFixture({ pipeline: structuredClone(entityPipeline) });

    apply(fixture, startOf('web', 'tests', 'build'));
    apply(fixture, startOf('web', 'browser-tests', 'merge'));
    apply(fixture, startOf('web', 'audit', 'merge'));

    const runs = fixture.board.gateProfileRuns();
    expect(runs.map((run) => [run.entity, run.gate])).toEqual([
      ['web', { name: 'tests', run: 'bun test', in: '/apps/web' }],
      ['web', { name: 'browser-tests', run: 'bun run test:browser', in: '/apps/web/e2e' }],
      ['web', { name: 'audit', run: 'bun run audit', in: '/' }],
    ]);
    expect(runs[0]?.prepare).toEqual([{ name: 'install', run: 'bun install', in: '/' }, { name: 'generate', run: 'bun run generate', in: '/apps/web' }]);
  });

  test('keeps a run by entity, gate and phase: the same gate and phase of another entity queues beside it', () => {
    const fixture = boardFixture({ pipeline: structuredClone(entityPipeline) });

    apply(fixture, startOf('web', 'tests', 'build'));
    apply(fixture, startOf('root', 'tests', 'build'));

    expect(fixture.board.gateProfileRuns().map((run) => [run.profileRunId, run.entity, run.gate.in])).toEqual([['P1', 'web', '/apps/web'], ['P2', 'root', '/']]);
    expect(refusalDetailOf(() => apply(fixture, startOf('web', 'tests', 'build')))).toEqual({
      reason: 'gate-profile-running', gateName: 'tests', phase: 'build', profileRunId: 'P1'
    });
  });

  const appliedToEntities = (command: ControlCommand) => () => apply(boardFixture({ pipeline: structuredClone(entityPipeline) }), command);

  test.each([
    ['an entity the pipeline lacks', appliedToEntities(startOf('api', 'tests', 'build')), { reason: 'unknown-gate', gateName: 'tests', gateNames: [] }],
    ['a gate the entity lacks', appliedToEntities(startOf('root', 'audit', 'merge')), { reason: 'unknown-gate', gateName: 'audit', gateNames: ['tests'] }],
    ['no entity on a pipeline over entities', appliedToEntities(start(null, 'tests', 'build')), { reason: 'unknown-gate', gateName: 'tests', gateNames: [] }],
    ['an entity that is no text', appliedToEntities(startOf('', 'tests', 'build')), { kind: 'malformed-setup-command', commandKind: 'gate-profile-start', field: 'entity' }],
  ])('refuses %s', (_case, attempt, detail) => {
    expect(refusalDetailOf(attempt)).toEqual(detail);
  });

  test('a start without an entity stores no entity key', () => {
    const fixture = boardFixture({ pipeline: structuredClone(STORED_PIPELINE) });

    apply(fixture, start(null, 'browser-tests'));

    expect(Object.hasOwn(fixture.board.gateProfileRuns()[0] ?? {}, 'entity')).toBe(false);
  });
});

test('a stop of a queued run stops it; an unknown run refuses unknown-profile-run', () => {
  const fixture = boardWithAnUpdate();
  apply(fixture, start('S1', 'browser-tests'));

  apply(fixture, { kind: 'gate-profile-stop', profileRunId: 'P1' });

  expect(fixture.board.gateProfileRuns()[0]?.state).toBe('stopped');
  expect(refusalDetailOf(() => apply(fixture, { kind: 'gate-profile-stop', profileRunId: 'P7' }))).toEqual({ reason: 'unknown-profile-run', profileRunId: 'P7' });
});

test('no role relays a start or a stop: only User\'s press sends them', () => {
  const roles = ['builder', 'reviewer', 'product-owner', 'assistant', 'pipeline-agent'] as const;
  for (const role of roles) {
    for (const command of [start(null, 'browser-tests'), { kind: 'gate-profile-stop', profileRunId: 'P1' } as const]) {
      const job = {
        id: 'J12', role, ticketIds: [], filedTickets: [], deliveredIncidents: [], ticketIdsReadyForReviewOrPending: [], setupId: 'S1'
      };
      expect(Bouncer.verdictOf(job, command).verdict, `${role} ${command.kind}`).toBe('refused');
    }
  }
});
