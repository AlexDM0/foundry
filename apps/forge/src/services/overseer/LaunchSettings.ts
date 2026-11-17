/**
 * The model and effort a session launches on: its pipeline step's settings where the pipeline names them, its entity's for a job of an
 * entity, else its role's default. An Airlock agent carries on the last worker's session, so it takes that worker's recorded pair.
 */

import type { AgentEffort }                 from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { Job, JobRole }                from '../../lib/tracker-model/@types/Job.ts';
import type { Pipeline, PipelineAgentRole } from '../../lib/tracker-model/@types/Pipeline.ts';
import type { AgentPair }                   from '../../lib/tracker-model/@types/Ticket.ts';
import { DEFAULT_AGENT_MODEL }              from '../../lib/tracker-model/constants/AgentSettings.ts';
import { PipelineUtil }                     from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { VocabularyUtil }                   from '../../lib/tracker-model/utils/VocabularyUtil.ts';
import {
  ASSISTANT_EFFORT,
  ASSISTANT_MODEL,
  PIPELINE_AGENT_EFFORT,
  PIPELINE_AGENT_MODEL,
  WORKER_EFFORT,
  WORKER_MODEL
} from '../../shared/constants/OverseerLimits.ts';

export interface SessionLaunchSettings {
  model:  string;
  effort: AgentEffort;
}

const PIPELINE_ROLE_OF_JOB_ROLE: Readonly<Record<JobRole, PipelineAgentRole>> = Object.freeze({
  'builder':              'builder',
  'reviewer':             'reviewer',
  're-reviewer':          'reReviewer',
  'conflict-re-reviewer': 'conflictReReviewer',
  'assistant':            'assistant',
  'product-owner':        'productOwner',
  'pipeline-agent':       'pipelineAgent',
});

const WORKER_SETTINGS: SessionLaunchSettings = Object.freeze({ model: WORKER_MODEL, effort: WORKER_EFFORT });

const DEFAULT_SETTINGS_OF_ROLE: Readonly<Record<PipelineAgentRole, SessionLaunchSettings>> = Object.freeze({
  productOwner:       WORKER_SETTINGS,
  builder:            WORKER_SETTINGS,
  reviewer:           WORKER_SETTINGS,
  reReviewer:         WORKER_SETTINGS,
  conflictReReviewer: WORKER_SETTINGS,
  pipelineAgent:      Object.freeze({ model: PIPELINE_AGENT_MODEL, effort: PIPELINE_AGENT_EFFORT }),
  assistant:          Object.freeze({ model: ASSISTANT_MODEL, effort: ASSISTANT_EFFORT }),
});

/** What a role launches on where the pipeline names no model or effort. */
function defaultLaunchSettingsOf(role: PipelineAgentRole): SessionLaunchSettings {
  return DEFAULT_SETTINGS_OF_ROLE[role];
}

/** A role's default in the facts' vocabulary, which the flow shows on a step whose pipeline names no model or effort. */
function defaultAgentPairOf(role: PipelineAgentRole): AgentPair {
  const { model, effort } = DEFAULT_SETTINGS_OF_ROLE[role];
  return { model: VocabularyUtil.agentModelIsKnown(model) ? model : DEFAULT_AGENT_MODEL, effort };
}

/** The pipeline step whose settings and instructions the job's sessions read; `null` for a merge or refresh job, which runs no agent. */
function pipelineRoleOf(job: Readonly<Pick<Job, 'role'>>): PipelineAgentRole | null {
  return job.role === null ? null : PIPELINE_ROLE_OF_JOB_ROLE[job.role];
}

/** The pipeline whose step settings a job reads: its entity's, with the forge's settings for the roles set once; the forge's own without one. */
function settingsPipelineOf(pipeline: Readonly<Pipeline> | null, job: Readonly<Pick<Job, 'entity'>>): Readonly<Pipeline> | null {
  if (pipeline === null || job.entity === undefined || pipeline.entities === undefined) return pipeline;
  return PipelineUtil.pipelineOfEntity(pipeline, job.entity);
}

/**
 * Resolved once, at a session's first launch: the caller records the pair and gives every resume of that session the recorded one. An
 * Airlock agent in a builder's or reviewer's place takes `lastWorkerSettings`, the pair that worker recorded, and its own role's pair only when
 * no worker recorded one. A job of an entity the pipeline no longer holds takes its role's default.
 */
function launchSettingsOf(
  pipeline: Readonly<Pipeline> | null, job: Readonly<Pick<Job, 'kind' | 'role' | 'entity'>>, lastWorkerSettings: SessionLaunchSettings | null
): SessionLaunchSettings {
  if (job.kind === 'merge-agent' && job.role !== 'conflict-re-reviewer' && lastWorkerSettings !== null) return lastWorkerSettings;
  const role = pipelineRoleOf(job);
  if (role === null) return WORKER_SETTINGS;
  const stored   = settingsPipelineOf(pipeline, job)?.agents?.[role];
  const fallback = defaultLaunchSettingsOf(role);
  return { model: stored?.model ?? fallback.model, effort: stored?.effort ?? fallback.effort };
}

export const LaunchSettings = Object.freeze({
  defaultLaunchSettingsOf,
  defaultAgentPairOf,
  launchSettingsOf,
  pipelineRoleOf,
});
