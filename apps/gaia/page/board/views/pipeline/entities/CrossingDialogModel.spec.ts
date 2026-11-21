/**
 * How a crossing runs. What matters: six stages in the strategy's order, each naming the entity whose agent, constitution and gates apply,
 * taken from the two entities' own settings; the package's build also runs the gates of the entities that depend on it, the app aside;
 * only Adapt may be skipped; the landing gates every entity the change reaches; and a crossing goes only into a package on the whitelist.
 */
import { describe, expect, test }                 from 'bun:test';
import type { BoardPipelineEntityDocument }       from '../../../../@types/board/BoardPipelineDocuments.ts';
import { ENTITIES_STEP_ENTITIES }                 from '../../../testing/EntitiesStepFixture.ts';
import { examplePipeline, servedDraftEntitiesOf } from '../../../testing/PipelineFixture.ts';
import { CrossingDialogModel }                    from './CrossingDialogModel.ts';

const WEB_REVIEW = { name: 'review', reReview: null };

const entities: Record<string, BoardPipelineEntityDocument> = {
  ...ENTITIES_STEP_ENTITIES,
  web: { ...ENTITIES_STEP_ENTITIES['web'], phases: { build: ['lint', 'typecheck'], review: [], merge: [] }, review: WEB_REVIEW } as BoardPipelineEntityDocument,
  ui:  { ...ENTITIES_STEP_ENTITIES['ui'], phases: { build: ['test'], review: [], merge: [] } } as BoardPipelineEntityDocument,
};

/** Each entity's dependents as the forge serves them with the draft. */
const draftEntities = servedDraftEntitiesOf(examplePipeline({ entities }));

describe('the crossing', () => {
  test('six stages run in order, each with its entity, agent, constitution and gates', () => {
    const { stages } = CrossingDialogModel.crossingOf(entities, draftEntities, 'web', 'ui');
    expect(stages.map((stage) => [stage.name, stage.entityText, stage.owner])).toEqual([
      ['Build', 'web', 'home'],
      ['Package build', 'ui', 'package'],
      ['Package review', 'ui', 'package'],
      ['Adapt', 'web', 'home'],
      ['Review', 'web', 'home'],
      ['Landing', 'web + ui', 'both'],
    ]);
    expect(stages[0]?.what).toBe('Changes apps/web and proposes the change it needs in packages/ui.');
    expect(stages[0]?.gates).toBe('web\'s gates: lint, typecheck');
    expect(stages[2]?.agent).toBe('ui\'s reviewer');
  });

  test('the package build also runs the gates of what the forge serves as depending on the package, the app aside, and the landing gates every one', () => {
    const { stages } = CrossingDialogModel.crossingOf(entities, draftEntities, 'web', 'ui');
    expect(stages[1]?.gates).toBe('ui\'s gates: test; then admin\'s, which depends on ui');
    expect(stages[5]?.gates).toBe('Gates of web, ui and admin on the merged tree');
  });

  test('only Adapt may be skipped', () => {
    expect(CrossingDialogModel.crossingOf(entities, draftEntities, 'web', 'ui').stages.filter((stage) => stage.skippable).map((stage) => stage.name)).toEqual(['Adapt']);
  });

  test('a package with a review step may be whitelisted; one without needs one first', () => {
    expect(CrossingDialogModel.crossingOf(entities, draftEntities, 'web', 'ui').reviewNote).toBe('ui has a review step, so it may be whitelisted.');
    expect(CrossingDialogModel.crossingOf(entities, draftEntities, 'web', 'config').reviewNote).toBe('config has no review step yet. It needs one before it may be whitelisted.');
  });

  test('a crossing goes only into a package the whitelist names', () => {
    const withApp = { ...entities, web: { ...entities['web'], whitelist: ['ui', 'admin', 'shared'] } } as Record<string, BoardPipelineEntityDocument>;
    expect(CrossingDialogModel.crossablePackagesOf(withApp, 'web')).toEqual(['ui']);
    expect(CrossingDialogModel.crossablePackagesOf(entities, 'admin')).toEqual([]);
  });
});
