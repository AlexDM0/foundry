/**
 * The model and effort each role's session launches on. What matters: every role reads its own pipeline step and falls back field by field
 * to its default, the pipeline agent defaulting to opus and high; every value of both vocabularies reaches the launch unchanged; and an
 * Airlock agent takes the pair its last worker recorded, its own role's only when none was recorded, while a conflict re-reviewer reads
 * its own step. The spec and plan agents read their own steps, sonnet and medium and opus and high by default; the effect reader is no
 * pipeline role and launches on haiku and low. A job of an entity reads its entity's step, and the forge's for the roles a forge sets
 * once; a job of an entity the pipeline no longer holds takes its role's default. That a resume keeps the recorded pair is held by
 * `cli/hephaestus/HephaestusBuildJob.spec.ts`.
 */
import { describe, expect, test } from 'bun:test';

import type { JobKind, JobRole }                      from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineAgentRole }           from '../../domain/tracker-model/@types/Pipeline.ts';
import type { AgentEffort, AgentModel }               from '../../domain/tracker-model/@types/Ticket.ts';
import { AGENT_EFFORTS, AGENT_MODELS }                from '../../domain/tracker-model/constants/AgentSettings.ts';
import { PipelineUtil }                               from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { LaunchSettings, type SessionLaunchSettings } from './LaunchSettings.ts';

const LAST_WORKER_SETTINGS: SessionLaunchSettings = { model: 'haiku', effort: 'low' };

function pipelineWith(agents: NonNullable<Pipeline['agents']>): Pipeline {
  return { ...PipelineUtil.minimalPipelineOf(), agents };
}

/** Each role's own step names a pair no other row shares, so a row that reads the wrong step fails. */
const PIPELINE_WITH_EVERY_STEP = pipelineWith({
  productOwner:       { model: 'sonnet', effort: 'low' },
  builder:            { model: 'fable', effort: 'max' },
  reviewer:           { model: 'sonnet', effort: 'xhigh' },
  reReviewer:         { model: 'haiku', effort: 'high' },
  conflictReReviewer: { model: 'haiku', effort: 'xhigh' },
  pipelineAgent:      { model: 'fable', effort: 'medium' },
  assistant:          { model: 'opus', effort: 'low' },
  specAgent:          { model: 'opus', effort: 'max' },
  planAgent:          { model: 'sonnet', effort: 'high' },
});

describe('one row per role', () => {
  const rows: readonly [JobKind, JobRole, AgentModel, AgentEffort, AgentModel, AgentEffort][] = [
    // kind, role, default model, default effort, model and effort from the role's own step
    ['build', 'builder', 'opus', 'medium', 'fable', 'max'],
    ['review', 'reviewer', 'opus', 'medium', 'sonnet', 'xhigh'],
    ['review', 're-reviewer', 'opus', 'medium', 'haiku', 'high'],
    ['merge-agent', 'conflict-re-reviewer', 'opus', 'medium', 'haiku', 'xhigh'],
    ['product-owner', 'product-owner', 'opus', 'medium', 'sonnet', 'low'],
    ['pipeline-agent', 'pipeline-agent', 'opus', 'high', 'fable', 'medium'],
    ['assistant', 'assistant', 'sonnet', 'medium', 'opus', 'low'],
    ['document-agent', 'spec-agent', 'sonnet', 'medium', 'opus', 'max'],
    ['document-agent', 'plan-agent', 'opus', 'high', 'sonnet', 'high'],
  ];

  test.each(rows)('a %s job as %s launches on %s %s with no pipeline', (kind, role, model, effort) => {
    expect(LaunchSettings.launchSettingsOf(null, { kind, role }, null)).toEqual({ model, effort });
  });

  test.each(rows)('a %s job as %s launches on its default where its step names nothing', (kind, role, model, effort) => {
    expect(LaunchSettings.launchSettingsOf(pipelineWith({}), { kind, role }, null)).toEqual({ model, effort });
  });

  test.each(rows)('a %s job as %s launches on its own step, never another role\'s', (kind, role, _model, _effort, stepModel, stepEffort) => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_EVERY_STEP, { kind, role }, null)).toEqual({ model: stepModel, effort: stepEffort });
  });

  test('a step that names only one of the two takes the other from the default', () => {
    const pipeline = pipelineWith({ reviewer: { effort: 'max' }, pipelineAgent: { model: 'sonnet' } });

    expect(LaunchSettings.launchSettingsOf(pipeline, { kind: 'review', role: 'reviewer' }, null)).toEqual({ model: 'opus', effort: 'max' });
    expect(LaunchSettings.launchSettingsOf(pipeline, { kind: 'pipeline-agent', role: 'pipeline-agent' }, null)).toEqual({ model: 'sonnet', effort: 'high' });
  });

  test('the effect reader launches on haiku and low whatever the pipeline names, being no pipeline role', () => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_EVERY_STEP, { kind: 'effect-reading', role: 'effect-reader' }, null)).toEqual({ model: 'haiku', effort: 'low' });
    expect(LaunchSettings.pipelineRoleOf({ role: 'effect-reader' })).toBeNull();
  });

  test('every role the pipeline names has a default, and the pipeline agent\'s is opus and high', () => {
    const roles: readonly PipelineAgentRole[] = ['productOwner', 'builder', 'reviewer', 'reReviewer', 'conflictReReviewer', 'pipelineAgent', 'assistant'];

    expect(roles.map((role) => LaunchSettings.defaultLaunchSettingsOf(role).model)).not.toContain(undefined);
    expect(LaunchSettings.defaultLaunchSettingsOf('pipelineAgent')).toEqual({ model: 'opus', effort: 'high' });
  });
});

describe('every value of both vocabularies reaches the launch', () => {
  test.each([...AGENT_MODELS])('the model %s', (model) => {
    expect(LaunchSettings.launchSettingsOf(pipelineWith({ builder: { model } }), { kind: 'build', role: 'builder' }, null).model).toBe(model);
  });

  test.each([...AGENT_EFFORTS])('the effort %s', (effort) => {
    expect(LaunchSettings.launchSettingsOf(pipelineWith({ builder: { effort } }), { kind: 'build', role: 'builder' }, null).effort).toBe(effort);
  });
});

describe('an Airlock agent', () => {
  test.each(['builder', 'reviewer'] as const)('as %s takes the pair its last worker recorded, whatever the pipeline says now', (role) => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_EVERY_STEP, { kind: 'merge-agent', role }, LAST_WORKER_SETTINGS)).toEqual(LAST_WORKER_SETTINGS);
  });

  test('takes its own role\'s step only when its last worker recorded no pair', () => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_EVERY_STEP, { kind: 'merge-agent', role: 'reviewer' }, null)).toEqual({ model: 'sonnet', effort: 'xhigh' });
  });

  test('as a conflict re-reviewer reads its own step, never its last worker\'s pair', () => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_EVERY_STEP, { kind: 'merge-agent', role: 'conflict-re-reviewer' }, LAST_WORKER_SETTINGS))
      .toEqual({ model: 'haiku', effort: 'xhigh' });
  });
});

describe('a job of an entity', () => {
  const PIPELINE_WITH_ENTITIES: Pipeline = {
    ...pipelineWith({ productOwner: { model: 'sonnet', effort: 'low' }, builder: { model: 'fable', effort: 'max' } }),
    entities: {
      'example-app': {
        kind: 'app', home: ['/apps/example'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, agents: { builder: { model: 'haiku', effort: 'high' } }
      },
    },
  };

  test('launches on its entity\'s step, not the forge\'s', () => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_ENTITIES, { kind: 'build', role: 'builder', entity: 'example-app' }, null)).toEqual({ model: 'haiku', effort: 'high' });
  });

  test('reads the forge\'s step for a role the forge sets once', () => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_ENTITIES, { kind: 'product-owner', role: 'product-owner', entity: 'example-app' }, null))
      .toEqual({ model: 'sonnet', effort: 'low' });
  });

  test('of an entity the pipeline no longer holds takes its role\'s default', () => {
    expect(LaunchSettings.launchSettingsOf(PIPELINE_WITH_ENTITIES, { kind: 'build', role: 'builder', entity: 'retired' }, null)).toEqual({ model: 'opus', effort: 'medium' });
  });
});
