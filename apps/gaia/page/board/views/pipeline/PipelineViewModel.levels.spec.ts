/**
 * The Pipeline view's level in monorepo mode. What matters: monorepo mode is a fact of the record or of the stored pipeline, never of the
 * route; a monorepo screen shows the route's level, else the forge, and single mode shows none whatever the route names; the screen reads
 * the item under the level, so every screen opens at the level the owner was on; a setup route left once the setup is applied goes to the
 * live flow at its level, and to `#pipeline` in single mode; the step and constitution routes keep a level when given
 * one and stay as they are without; the entities shown are the draft's while a record holds one, else the stored pipeline's.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardRoute }                 from '../../../shared/BoardRouter.ts';
import { pipelineBoardStateOf }            from '../../testing/PipelineFixture.ts';
import { PipelineViewModel }               from './PipelineViewModel.ts';
import { FORGE_LEVEL, PipelineLevelModel } from './entities/PipelineLevelModel.ts';

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

function pipelineRoute(item: string | null): BoardRoute {
  return { tab: 'pipeline', item };
}

describe('monorepo mode and its level', () => {
  test('is a fact of the record or the stored pipeline, and single mode stays single whatever the route names', () => {
    expect(PipelineViewModel.monorepoModeOf(pipelineBoardStateOf('mono-design'))).toBe(true);
    expect(PipelineViewModel.monorepoModeOf(pipelineBoardStateOf('mono-live'))).toBe(true);
    expect(PipelineViewModel.monorepoModeOf(pipelineBoardStateOf('A2'))).toBe(false);
    expect(PipelineViewModel.monorepoModeOf(pipelineBoardStateOf('A5'))).toBe(false);
    expect(PipelineViewModel.levelShownOf(pipelineBoardStateOf('A2'), pipelineRoute('entity/web/setup/design'))).toBeNull();
  });

  test('a monorepo screen shows the route\'s level, else the forge', () => {
    const state = pipelineBoardStateOf('mono-design');
    expect(PipelineViewModel.levelShownOf(state, pipelineRoute('entity/web/setup/design'))).toEqual(WEB_LEVEL);
    expect(PipelineViewModel.levelShownOf(state, pipelineRoute('setup/design'))).toEqual(FORGE_LEVEL);
    expect(PipelineViewModel.levelShownOf(state, pipelineRoute(null))).toEqual(FORGE_LEVEL);
  });

  test('the screen reads the item under the level', () => {
    const state = pipelineBoardStateOf('mono-design');
    expect(PipelineViewModel.screenOf(state, pipelineRoute('entity/web/setup/design'))).toEqual({ screen: 'setup-step', step: 'design' });
    expect(PipelineViewModel.screenOf(state, pipelineRoute('forge/setup/entities'))).toEqual({ screen: 'setup-step', step: 'entities' });
    expect(PipelineViewModel.screenOf(state, pipelineRoute('forge'))).toEqual({ screen: 'setup-resume' });
    expect(PipelineViewModel.screenOf(pipelineBoardStateOf('mono-live'), pipelineRoute('entity/web'))).toEqual({ screen: 'flow', stage: 'live' });
  });

  test('a setup route under a level is left for the live flow at that level once the setup is applied', () => {
    const state = pipelineBoardStateOf('mono-live');
    const route = pipelineRoute('entity/web/setup/design');
    expect(PipelineViewModel.setupRouteIsLeftOf(PipelineViewModel.screenOf(state, route), route)).toBe(true);
    expect(PipelineViewModel.liveRouteOf(route)).toEqual(pipelineRoute('entity/web'));
    expect(PipelineViewModel.liveRouteOf(pipelineRoute('forge/setup/design'))).toEqual(pipelineRoute('forge'));
    expect(PipelineViewModel.liveRouteOf(pipelineRoute('setup/design'))).toEqual(pipelineRoute(null));
  });

  test('a step and the constitution keep a level when given one, and stay as they are without', () => {
    expect(PipelineViewModel.setupStepRouteOf('design')).toEqual(pipelineRoute('setup/design'));
    expect(PipelineViewModel.setupStepRouteOf('design', WEB_LEVEL)).toEqual(pipelineRoute('entity/web/setup/design'));
    expect(PipelineViewModel.constitutionRouteOf('update')).toEqual(pipelineRoute('edit/constitution'));
    expect(PipelineViewModel.constitutionRouteOf('update', WEB_LEVEL)).toEqual(pipelineRoute('entity/web/edit/constitution'));
    expect(PipelineViewModel.constitutionRouteOf('setup', FORGE_LEVEL)).toEqual(pipelineRoute('forge/setup/constitution'));
  });

  test('the entities shown are the draft\'s while a record holds one, else the stored pipeline\'s, and none in single mode', () => {
    expect(Object.keys(PipelineViewModel.entitiesShownOf(pipelineBoardStateOf('mono-design')))).toEqual(['web', 'design-system', 'root']);
    expect(Object.keys(PipelineViewModel.entitiesShownOf(pipelineBoardStateOf('mono-live')))).toEqual(['web', 'design-system', 'root']);
    expect(PipelineViewModel.entitiesShownOf(pipelineBoardStateOf('A5'))).toEqual({});
  });
});
