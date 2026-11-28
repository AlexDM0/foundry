/**
 * The board's pipeline facts against the contract's pipeline documents: the pipeline, the stored pipeline, the setup record, its history,
 * its entities and their refusals map field by field, an absent optional field stays absent, and stored bookkeeping stays out.
 */
import { describe, expect, test } from 'bun:test';

import type { LogRecord }                from '../../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                 from '../../../domain/tracker-model/@types/Pipeline.ts';
import type { PipelineSetupFacts }       from '../../../domain/tracker-model/@types/PipelineFacts.ts';
import { PipelineUtil }                  from '../../../domain/tracker-model/utils/PipelineUtil.ts';
import { BoardEntityRefusalMappingUtil } from './BoardEntityRefusalMappingUtil.ts';
import { BoardPipelineMappingUtil }      from './BoardPipelineMappingUtil.ts';

const AT = '2026-11-19T10:00:00+01:00';

const PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install', in: 'apps/web' }],
  gates:   [{ name: 'test', run: 'bun test' }, {
    name: 'lint', run: 'bun run lint', fix: 'bun run lint:fix', forgeOnly: true, network: ['registry.example.com']
  }],
  phases:    { build: ['test', 'lint'], review: ['test'], merge: [] },
  review:    { name: 'review' },
  airlock:   { reReview: { thresholdLines: 30 } },
  agents:    { reviewer: { effort: 'max' }, builder: { model: 'opus', instructions: [{ kind: 'default-brief', role: 'builder' }, { kind: 'file', path: 'docs/brief.md' }] } },
  approvals: { merge: true },
  billing:   { mode: 'api' },
  agent:     { vendor: 'example-agent', program: { follows: 'machine' } },
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

const MINIMAL_PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

/** The entity's own pipeline as the model joins it, which the mapper serves field for field. */
function effectivePipelineOf(pipeline: Pipeline, entityKey: string): ReturnType<typeof BoardPipelineMappingUtil.pipelineDefinitionOf> {
  const entityPipeline = PipelineUtil.pipelineOfEntity(pipeline, entityKey);
  if (entityPipeline === null) throw new Error(`the pipeline holds no entity ${entityKey}`);
  return BoardPipelineMappingUtil.pipelineDefinitionOf(entityPipeline);
}

describe('BoardPipelineMappingUtil.pipelineDefinitionOf', () => {
  test('maps a pipeline field by field, its absent fields absent and its entities with their agents', () => {
    expect(BoardPipelineMappingUtil.pipelineDefinitionOf(PIPELINE)).toEqual(PIPELINE);
  });

  test('maps the ticket writing route, the spec and plan approvals, the document agents and the documents each role reads', () => {
    const specThenPlan: Pipeline = {
      ...PIPELINE,
      agents: {
        specAgent: { model: 'sonnet', effort: 'medium' },
        planAgent: { instructions: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'planAgent' }] },
        builder:   { documents: { plan: 'never' } },
        reviewer:  { documents: { spec: 'always', plan: 'if-person-approved' } },
      },
      approvals: {
        tickets: true, merge: true, spec: false, plan: true
      },
      ticketWriting: 'spec-then-plan',
    };

    const entityReviewer: Pipeline = {
      ...MINIMAL_PIPELINE,
      entities: {
        web: {
          kind: 'app', home: ['/apps/web'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, agents: { reviewer: { documents: { plan: 'never' } } },
        },
      },
    };

    expect(BoardPipelineMappingUtil.pipelineDefinitionOf(specThenPlan)).toEqual(specThenPlan);
    expect(BoardPipelineMappingUtil.pipelineDefinitionOf(entityReviewer)).toEqual(entityReviewer);
  });

  test('names no field the pipeline leaves absent', () => {
    const minimal: Pipeline = {
      version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    };
    expect(Object.keys(BoardPipelineMappingUtil.pipelineDefinitionOf(minimal))).toEqual(['version', 'prepare', 'gates', 'phases']);
  });
});

describe('BoardPipelineMappingUtil.appliedPipelineOf', () => {
  test('maps each reading verdict with the fields it carries', () => {
    expect(BoardPipelineMappingUtil.appliedPipelineOf({ readingVerdict: 'absent' })).toEqual({ readingVerdict: 'absent' });
    const notJson = { code: 'not-json', parserError: 'Unexpected end' } as const;
    expect(BoardPipelineMappingUtil.appliedPipelineOf({ readingVerdict: 'malformed', problem: notJson, fileText: '{' }))
      .toEqual({ readingVerdict: 'malformed', reason: 'it is not valid JSON (Unexpected end)', fileText: '{' });
    const application = {
      appliedRevision: 2, appliedAt: AT, appliedBy: 'user', constitutionCommit: null
    } as const;
    expect(BoardPipelineMappingUtil.appliedPipelineOf({
      readingVerdict: 'readable', pipeline: PIPELINE, contentHash: 'example-hash', fileText: '{}', application
    })).toEqual({
      readingVerdict: 'readable', pipeline: PIPELINE, contentHash: 'example-hash', fileText: '{}', application, entityPipelines: { web: effectivePipelineOf(PIPELINE, 'web') }
    });
  });

  test('serves each entity\'s pipeline with the forge\'s approvals and billing joined to its own, and none without entities', () => {
    const readable = {
      readingVerdict: 'readable', contentHash: 'example-hash', fileText: '{}', application: null
    } as const;
    const document = BoardPipelineMappingUtil.appliedPipelineOf({ ...readable, pipeline: PIPELINE });
    const web = document.readingVerdict === 'readable' ? document.entityPipelines['web'] : undefined;
    expect([web?.approvals, web?.billing, web?.agents?.builder?.effort]).toEqual([{ merge: true }, { mode: 'api' }, 'low']);
    const { entities: _entities, ...withoutEntities } = PIPELINE;
    const without = BoardPipelineMappingUtil.appliedPipelineOf({ ...readable, pipeline: withoutEntities });
    expect(without.readingVerdict === 'readable' ? without.entityPipelines : null).toEqual({});
  });
});

describe('BoardPipelineMappingUtil.pipelineSetupOf', () => {
  const setup: PipelineSetupFacts = {
    record: {
      formatVersion:   4,
      setupId:         'S2',
      mode:            'advise',
      baseContentHash: 'example-hash',
      stepStates:      {
        agent: 'done', billing: 'done', research: 'done', entities: 'needs-recheck', constitution: 'done', design: 'done', apply: 'in-progress'
      },
      currentStep:                'apply',
      billing:                    { mode: 'subscription' },
      agent:                      { vendor: 'example-agent', program: { follows: 'machine' } },
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
    openQuestionCount:    0,
    agentJobState:        null,
    mainMovedByCommits:   4,
    constitutionMarkdown: null,
    constitutionOutline:  null,
    annotations:          [],
    readByRoles:          ['builder'],
    applyState:           {
      draftRevision: 0, resumesBoard: true, commitJobId: 'J5', state: 'held', reason: 'dirty-checkout', blockingFiles: ['README.md'], ticketIdHoldingMain: null
    },
    applyRefusal: null,
  };

  const entityOf = (kind: 'root' | 'package' | 'app', home: string, dependsOn?: string[]) => ({
    kind, home: [home], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, ...(dependsOn === undefined ? {} : { dependsOn })
  });

  const draftOverEntities: Pipeline = {
    ...PIPELINE,
    entities: { root: entityOf('root', '/'), design: entityOf('package', '/packages/design'), web: entityOf('app', '/apps/web', ['design']) },
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

  test('names each draft entity\'s effective pipeline and every entity that consumes it, and none without a draft over entities', () => {
    const document = BoardPipelineMappingUtil.pipelineSetupOf({ ...setup, record: { ...setup.record, draft: draftOverEntities } });
    expect(Object.entries(document?.draftEntities ?? {}).map(([entityKey, facts]) => [entityKey, facts.dependentEntityKeys]))
      .toEqual([['root', ['design', 'web']], ['design', ['web']], ['web', []]]);
    expect(document?.draftEntities['web']?.effectivePipeline).toEqual(effectivePipelineOf(draftOverEntities, 'web'));
    expect(BoardPipelineMappingUtil.pipelineSetupOf(setup)?.draftEntities).toEqual({});
  });

  test('serves the Apply refusal as the command words it: the Board\'s, main\'s unreadable constitution, or null', () => {
    const boardRefusal = {
      reason: 'pipeline-moved', setupId: 'S2', baseContentHash: 'example-hash', contentHash: 'other-hash'
    } as const;
    const refused = BoardPipelineMappingUtil.pipelineSetupOf({ ...setup, applyRefusal: { kind: 'board-refusal', boardRefusal } });
    expect([refused?.applyRefusal?.code, refused?.applyRefusal?.fields]).toEqual(['pipeline-moved', { setupId: 'S2', baseContentHash: 'example-hash', contentHash: 'other-hash' }]);
    expect(refused?.applyRefusal?.sentence).not.toBe('');
    const problem = { code: 'main-line-unresolved', mainLine: 'main' } as const;
    const unreadable = BoardPipelineMappingUtil.pipelineSetupOf({ ...setup, applyRefusal: { kind: 'main-constitution-unreadable', problem } });
    expect([unreadable?.applyRefusal?.code, unreadable?.applyRefusal?.fields])
      .toEqual(['main-constitution-unreadable', { reason: 'the main line main does not resolve to a commit' }]);
    expect(BoardPipelineMappingUtil.pipelineSetupOf(setup)?.applyRefusal).toBeNull();
  });

  test('serves each refusal the draft\'s entities hold, in the validator\'s order, and none for entities it takes or no draft', () => {
    const appOn = (home: string): NonNullable<Pipeline['entities']>[string] => ({
      kind: 'app', home: [home], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    });
    const refusedDraft: Pipeline = { ...PipelineUtil.minimalPipelineOf(), entities: { web: appOn('/apps/web'), shop: appOn('/apps/web') } };
    const document = BoardPipelineMappingUtil.pipelineSetupOf({ ...setup, record: { ...setup.record, draft: refusedDraft } });
    expect(document?.entityRefusals).toEqual(BoardEntityRefusalMappingUtil.entityRefusalsOf('S2', refusedDraft));
    expect(document?.entityRefusals.map((refusal) => [refusal.reason, refusal.shownOn])).toEqual([['equal-homes', 'shop']]);
    expect(BoardPipelineMappingUtil.pipelineSetupOf({ ...setup, record: { ...setup.record, draft: draftOverEntities } })?.entityRefusals).toEqual([]);
    expect(BoardPipelineMappingUtil.pipelineSetupOf(setup)?.entityRefusals).toEqual([]);
  });

  test('reads no open setup as null', () => {
    expect(BoardPipelineMappingUtil.pipelineSetupOf(null)).toBeNull();
  });
});

describe('BoardPipelineMappingUtil.pipelineHistoryOf', () => {
  test('maps each record the contract declares to its entry and drops a record of any other kind', () => {
    const records: LogRecord[] = [
      { kind: 'hephaestus-set', at: AT, fields: { state: 'running' } },
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
      { kind: 'hephaestus-set', at: AT, fields: { state: 'running' } },
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
