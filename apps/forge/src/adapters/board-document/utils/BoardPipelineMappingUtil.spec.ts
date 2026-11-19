/**
 * The board's pipeline facts against the contract's pipeline documents. What matters: a pipeline maps field by field, its optional fields
 * absent where the model leaves them absent, its entities and their agents included; the stored pipeline as read maps for each verdict; a
 * setup record with no check reads `null` and keeps no stored bookkeeping (next numbers, extra keys); each pipeline record the contract
 * declares maps to its history entry and a record of any other kind to none; no open setup, flow or entity assignment reads `null`.
 */
import { describe, expect, test } from 'bun:test';

import type { LogRecord }           from '../../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }            from '../../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetupFacts }  from '../../../lib/tracker-model/@types/PipelineFacts.ts';
import { BoardPipelineMappingUtil } from './BoardPipelineMappingUtil.ts';

const AT = '2026-11-19T10:00:00+01:00';

const PIPELINE: Pipeline = {
  version: 3,
  prepare: [{ name: 'install', run: 'bun install', in: 'apps/web' }],
  gates:   [{ name: 'test', run: 'bun test' }, {
    name: 'lint', run: 'bun run lint', fix: 'bun run lint:fix', overseerOnly: true, network: ['registry.example.com']
  }],
  phases:    { build: ['test', 'lint'], review: ['test'], merge: [] },
  review:    { name: 'review' },
  airlock:   { reReview: { thresholdLines: 30 } },
  agents:    { reviewer: { effort: 'max' }, builder: { model: 'opus', instructions: [{ kind: 'default-brief', role: 'builder' }, { kind: 'file', path: 'docs/brief.md' }] } },
  approvals: { merge: true },
  billing:   { mode: 'api' },
  entities:  {
    web: {
      kind:      'app',
      home:      ['/apps/web'],
      prepare:   [],
      gates:     [],
      phases:    { build: [], review: [], merge: [] },
      agents:    { builder: { effort: 'low' } },
      whitelist: ['design-system'],
    },
  },
};

describe('BoardPipelineMappingUtil.pipelineDefinitionOf', () => {
  test('maps a pipeline field by field, its absent fields absent and its entities with their agents', () => {
    expect(BoardPipelineMappingUtil.pipelineDefinitionOf(PIPELINE)).toEqual(PIPELINE);
  });

  test('names no field the pipeline leaves absent', () => {
    const minimal: Pipeline = {
      version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    };
    expect(Object.keys(BoardPipelineMappingUtil.pipelineDefinitionOf(minimal))).toEqual(['version', 'prepare', 'gates', 'phases']);
  });
});

describe('BoardPipelineMappingUtil.appliedPipelineOf', () => {
  test('maps each reading verdict with the fields it carries', () => {
    expect(BoardPipelineMappingUtil.appliedPipelineOf({ readingVerdict: 'absent' })).toEqual({ readingVerdict: 'absent' });
    expect(BoardPipelineMappingUtil.appliedPipelineOf({ readingVerdict: 'malformed', reason: 'Not JSON.', fileText: '{' }))
      .toEqual({ readingVerdict: 'malformed', reason: 'Not JSON.', fileText: '{' });
    const application = {
      appliedRevision: 2, appliedAt: AT, appliedBy: 'user', constitutionCommit: null
    } as const;
    expect(BoardPipelineMappingUtil.appliedPipelineOf({
      readingVerdict: 'readable', pipeline: PIPELINE, contentHash: 'example-hash', fileText: '{}', application
    })).toEqual({
      readingVerdict: 'readable', pipeline: PIPELINE, contentHash: 'example-hash', fileText: '{}', application
    });
  });
});

describe('BoardPipelineMappingUtil.pipelineSetupOf', () => {
  const setup: PipelineSetupFacts = {
    record: {
      formatVersion:   1,
      setupId:         'S2',
      mode:            'advise',
      baseContentHash: 'example-hash',
      stepStates:      {
        billing: 'done', research: 'done', entities: 'needs-recheck', constitution: 'done', design: 'done', apply: 'in-progress'
      },
      currentStep:                'apply',
      billing:                    { mode: 'subscription' },
      agentJobId:                 null,
      snapshotCommit:             null,
      readyToContinue:            [],
      findings:                   [],
      questions:                  [],
      constitution:               null,
      draft:                      null,
      draftRevision:              0,
      edits:                      [],
      replacesUnreadablePipeline: true,
      applyRequest:               {
        draftRevision: 0, resumesBoard: true, commitJobId: 'J5', state: 'held', reason: 'dirty-checkout'
      },
      entities: {
        web: {
          agentJobId: 'J6', findings: [], questions: [], constitution: null
        }
      },
      openedAtEntity: 'web',
      nextNumbers:    { finding: 1, question: 1, edit: 1 },
      extra:          [['unknown-key', 1]],
    },
    summary: {
      stackItemCount: 1, scriptCount: 2, answeredResearchQuestionCount: 0, prepareStepCount: 1, gateCountByPhase: { build: 2, review: 1, merge: 0 }, userEditsKeptCount: 3
    },
    openQuestionCount:   0,
    agentJobState:       null,
    mainMovedByCommits:  4,
    constitutionHtml:    null,
    constitutionOutline: null,
    annotations:         [],
    readByRoles:         ['builder'],
    applyState:          {
      draftRevision: 0, resumesBoard: true, commitJobId: 'J5', state: 'held', reason: 'dirty-checkout', blockingFiles: ['README.md'], ticketIdHoldingMain: null
    },
  };

  test('maps the record with no check as null, its entities\' parts, and none of its stored bookkeeping', () => {
    const document = BoardPipelineMappingUtil.pipelineSetupOf(setup);
    expect(document?.record.check).toBeNull();
    expect(document?.record.entities).toEqual({
      web: {
        agentJobId: 'J6', findings: [], questions: [], constitution: null, check: null
      }
    });
    expect(document?.record.stepStates).toEqual(setup.record.stepStates);
    expect(document?.record.openedAtEntity).toBe('web');
    expect(document === null ? [] : ['formatVersion', 'nextNumbers', 'extra'].filter((field) => Object.hasOwn(document.record, field))).toEqual([]);
  });

  test('maps the facts around the record field by field', () => {
    const document = BoardPipelineMappingUtil.pipelineSetupOf(setup);
    expect(document?.summary).toEqual(setup.summary);
    expect(document?.applyState).toEqual(setup.applyState);
    expect([document?.mainMovedByCommits, document?.readByRoles]).toEqual([4, ['builder']]);
    expect(document !== null && Object.hasOwn(document, 'entities')).toBe(false);
  });

  test('reads no open setup as null', () => {
    expect(BoardPipelineMappingUtil.pipelineSetupOf(null)).toBeNull();
  });
});

describe('BoardPipelineMappingUtil.pipelineHistoryOf', () => {
  test('maps each record the contract declares to its entry and drops a record of any other kind', () => {
    const records: LogRecord[] = [
      { kind: 'overseer-set', at: AT, fields: { state: 'running' } },
      {
        kind: 'pipeline-apply-cancelled', at: AT, setupId: 'S1', fields: { revision: 2, state: 'held' }
      },
      { kind: 'pipeline-gates-none', at: AT, fields: {} },
      { kind: 'pipeline-gates-ordered', at: AT, fields: { phase: 'review', names: ['test'] } },
      {
        kind: 'pipeline-setup-discarded', at: AT, setupId: 'S1', fields: {}
      },
    ];
    expect(BoardPipelineMappingUtil.pipelineHistoryOf(records)).toEqual([
      { kind: 'overseer-set', at: AT, fields: { state: 'running' } },
      { kind: 'pipeline-gates-none', at: AT },
      { kind: 'pipeline-gates-ordered', at: AT, fields: { phase: 'review', names: ['test'] } },
      { kind: 'pipeline-setup-discarded', at: AT, setupId: 'S1' },
    ]);
  });
});

describe('the pipeline facts beside the setup', () => {
  test('a profile run, a cache mark and a step run time keep their entity only where they name one', () => {
    expect(BoardPipelineMappingUtil.profileRunOf({
      profileRunId: 'P1', gateName: 'test', phase: 'build', state: 'running', elapsedMilliseconds: null, cacheReport: null
    })).toEqual({
      profileRunId: 'P1', gateName: 'test', phase: 'build', state: 'running', elapsedMilliseconds: null, cacheReport: null
    });
    expect(BoardPipelineMappingUtil.gateCacheMarkOf({
      entity: 'web', gateName: 'test', phase: 'merge', cacheReport: 'hit'
    })).toEqual({
      entity: 'web', gateName: 'test', phase: 'merge', cacheReport: 'hit'
    });
    expect(BoardPipelineMappingUtil.stepRunTimeOf({
      stepKind: 'prepare', stepName: 'install', runMilliseconds: 1200, ending: 'time-bound', at: AT
    })).toEqual({
      stepKind: 'prepare', stepName: 'install', runMilliseconds: 1200, ending: 'time-bound', at: AT
    });
  });

  test('no flow and no entity assignment read null', () => {
    expect(BoardPipelineMappingUtil.pipelineFlowOf(null)).toBeNull();
    expect(BoardPipelineMappingUtil.entityAssignmentOf(undefined)).toBeNull();
  });

  test('an entity assignment maps field by field', () => {
    const assignment = {
      jobId:    'J7',
      jobState: 'running',
      tickets:  [{
        ticketId: '001', title: null, entity: 'web', reason: 'It changes the storefront.', assignedBy: 'product-owner'
      }],
    } as const;
    expect(BoardPipelineMappingUtil.entityAssignmentOf({ ...assignment, tickets: [...assignment.tickets] })).toEqual(assignment);
  });
});
