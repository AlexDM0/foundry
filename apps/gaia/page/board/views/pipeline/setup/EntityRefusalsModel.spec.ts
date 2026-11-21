/**
 * The entities step's refusals. What matters: they are the refusals the forge serves for its stored draft, nothing checked here, so a draft
 * the forge serves none for shows none; each shows the forge's sentence unchanged, on the row the forge names, with the forge's fix where
 * it serves one, whose edits are sent as they are.
 */
import { describe, expect, test }                                      from 'bun:test';
import type { BoardEntityRefusalDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { entitiesStepBoardOf }                                         from '../../../testing/EntitiesStepFixture.ts';
import { EntityRefusalsModel }                                         from './EntityRefusalsModel.ts';

const REACH_REFUSAL: BoardEntityRefusalDocument = {
  reason:     'reach-inside-another-home',
  entityKeys: ['admin', 'ui'],
  shownOn:    'admin',
  text:       'Example: admin\'s reach names /packages/ui/generated/, inside the home of ui. Continue and Apply wait until it is fixed.',
  fix:        {
    label: 'Take /packages/ui/generated/ off admin\'s reach',
    edits: [{ target: 'within-entity', entityKey: 'admin', edit: { target: 'reach', value: ['/bun.lock'] } }],
  },
};

const CIRCLE_REFUSAL: BoardEntityRefusalDocument = {
  reason:     'dependency-circle',
  entityKeys: ['ui', 'config'],
  shownOn:    'ui',
  text:       'Example: ui and config depend on each other. Continue and Apply wait until it is fixed.',
  fix:        null,
};

function setupWith(entityRefusals: readonly BoardEntityRefusalDocument[]): BoardPipelineSetupDocument {
  const { setup } = entitiesStepBoardOf({}, { entityRefusals }).pipeline;
  if (setup === null) throw new Error('the entities step board holds a setup');
  return setup;
}

describe('the refusals', () => {
  test('a draft the forge serves no refusal for shows none', () => {
    expect(EntityRefusalsModel.refusalsOf(setupWith([]))).toEqual([]);
  });

  test('each shows the forge\'s sentence unchanged, on the row the forge names, with the fix the forge serves', () => {
    expect(EntityRefusalsModel.refusalsOf(setupWith([REACH_REFUSAL, CIRCLE_REFUSAL]))).toEqual([
      { text: REACH_REFUSAL.text, entityKey: 'admin', fix: REACH_REFUSAL.fix },
      { text: CIRCLE_REFUSAL.text, entityKey: 'ui', fix: null },
    ]);
  });
});
