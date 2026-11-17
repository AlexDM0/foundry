/**
 * The entities step's fixture, as MonoEntities draws it: the pipeline agent proposed two apps and three packages of Example Agency. web
 * whitelists and depends on ui, which has a review step; admin depends on ui; ui depends on config; docs is a package with no build.
 * The board is the monorepo design board moved back to the entities step, with this draft and no edit yet.
 */
import type { EntityKey, Pipeline, PipelineEntity } from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }                       from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { BoardStateDocument }                  from '../@types/BoardStateDocument.ts';
import { pipelineBoardStateOf }                     from './PipelineFixture.ts';

function entityOf(kind: PipelineEntity['kind'], home: string[], extra: Partial<PipelineEntity> = {}): PipelineEntity {
  return {
    kind, home, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, ...extra,
  };
}

export const ENTITIES_STEP_ENTITIES: Readonly<Record<EntityKey, PipelineEntity>> = Object.freeze({
  web: entityOf('app', ['/apps/web'], {
    summary: 'Next.js storefront', constitution: { path: 'apps/web/CONSTITUTION.md' }, whitelist: ['ui'], reach: ['/package.json', '/bun.lock'], dependsOn: ['ui'],
  }),
  admin:  entityOf('app', ['/apps/admin'], { summary: 'Vite back office', dependsOn: ['ui'] }),
  ui:     entityOf('package', ['/packages/ui'], { summary: 'React components', review: { name: 'review' }, dependsOn: ['config'] }),
  config: entityOf('package', ['/packages/config'], { summary: 'Shared tsconfig and lint presets' }),
  docs:   entityOf('package', ['/docs'], { summary: 'The handbook, in Markdown' }),
});

/** A draft holding the given entities, or the fixture's. */
export function entitiesStepDraftOf(entities: Readonly<Record<EntityKey, PipelineEntity>> = ENTITIES_STEP_ENTITIES): Pipeline {
  return {
    version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, entities: structuredClone(entities) as Record<EntityKey, PipelineEntity>,
  };
}

/** The setup board at the entities step; `changes` replace keys of its record, such as the edits or the draft. */
export function entitiesStepBoardOf(changes: Partial<PipelineSetup> = {}): BoardStateDocument {
  const board = pipelineBoardStateOf('mono-design');
  const setup = board.pipelineSetup;
  if (setup === null || setup === undefined) throw new Error('the fixture mono-design holds a setup');
  const { entities: _entityParts, ...recordWithoutParts } = setup.record;
  const record: PipelineSetup = {
    ...recordWithoutParts,
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
  const { entities: _entityFacts, ...setupWithoutEntities } = setup;
  return { ...board, pipelineSetup: { ...setupWithoutEntities, record, openQuestionCount: 0 }, pipelineFlow: null };
}
