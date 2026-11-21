/**
 * The entities step's fixture, as MonoEntities draws it: the pipeline agent proposed two apps and three packages of Example Agency. web
 * whitelists and depends on ui, which has a review step; admin depends on ui; ui depends on config; docs is a package with no build.
 * The board is the monorepo design board moved back to the entities step, with this draft and no edit yet. Test-only.
 */
import type { BoardDocument }                                                                          from '../../@types/board/BoardDocument.ts';
import type { BoardPipelineDefinitionDocument, BoardPipelineEntityDocument, BoardSetupRecordDocument } from '../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }                                                                        from './PipelineFixture.ts';

function entityOf(kind: BoardPipelineEntityDocument['kind'], home: string[], changes: Partial<BoardPipelineEntityDocument> = {}): BoardPipelineEntityDocument {
  return {
    kind,
    home,
    summary:          null,
    constitutionPath: null,
    prepare:          [],
    gates:            [],
    phases:           { build: [], review: [], merge: [] },
    review:           null,
    agents:           {},
    whitelist:        [],
    reach:            [],
    dependsOn:        [],
    concurrency:      null,
    ...changes,
  };
}

export const ENTITIES_STEP_ENTITIES: Readonly<Record<string, BoardPipelineEntityDocument>> = Object.freeze({
  web: entityOf('app', ['/apps/web'], {
    summary: 'Next.js storefront', constitutionPath: 'apps/web/CONSTITUTION.md', whitelist: ['ui'], reach: ['/package.json', '/bun.lock'], dependsOn: ['ui'],
  }),
  admin:  entityOf('app', ['/apps/admin'], { summary: 'Vite back office', dependsOn: ['ui'] }),
  ui:     entityOf('package', ['/packages/ui'], { summary: 'React components', review: { name: 'review', reReview: null }, dependsOn: ['config'] }),
  config: entityOf('package', ['/packages/config'], { summary: 'Shared tsconfig and lint presets' }),
  docs:   entityOf('package', ['/docs'], { summary: 'The handbook, in Markdown' }),
});

/** A draft holding the given entities, or the fixture's. */
export function entitiesStepDraftOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>> = ENTITIES_STEP_ENTITIES): BoardPipelineDefinitionDocument {
  return {
    version:          3,
    prepare:          [],
    gates:            [],
    phases:           { build: [], review: [], merge: [] },
    review:           null,
    airlock:          null,
    constitutionPath: null,
    agents:           {},
    approvals:        {},
    billing:          null,
    reach:            [],
    entities:         structuredClone(entities) as Record<string, BoardPipelineEntityDocument>,
  };
}

/** The setup board at the entities step; `changes` replace keys of its record, such as the edits or the draft. */
export function entitiesStepBoardOf(changes: Partial<BoardSetupRecordDocument> = {}): BoardDocument {
  const board = pipelineBoardStateOf('mono-design');
  const { setup } = board.pipeline;
  if (setup === null) throw new Error('the fixture mono-design holds a setup');
  const record: BoardSetupRecordDocument = {
    ...setup.record,
    entities:    null,
    currentStep: 'entities',
    stepStates:  {
      billing: 'done', research: 'done', entities: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started'
    },
    draft:           entitiesStepDraftOf(),
    edits:           [],
    questions:       [],
    readyToContinue: [],
    ...changes,
  };
  return {
    ...board,
    pipeline: {
      ...board.pipeline,
      setup: {
        ...setup, record, entities: null, openQuestionCount: 0
      },
      flow: null
    },
  };
}
