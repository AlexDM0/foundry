/**
 * The gate run of a merged tree or a stale green, on the pipeline Hephaestus read for it: a pipeline without entities runs once from the
 * tracker's project folder; a pipeline with entities runs each gated entity's part from its first home folder.
 */
import type { GatePhase, GateRunStamp } from '../../lib/tracker-model/@types/GatePhase.ts';
import type { EntityKey, Pipeline }     from '../../lib/tracker-model/@types/Pipeline.ts';
import { PipelineUtil }                 from '../../lib/tracker-model/utils/PipelineUtil.ts';
import {
  type EntityPipelinesRunRequest,
  type EntityPipelinesVerdict,
  GateRun,
  type PipelineRunRequest,
  type PipelineVerdict
} from '../lifecycle/GateRun.ts';
import type { MergedTreeGate } from './Airlocks.ts';

export interface MergedTreeGateRunRequest {
  /** The pipeline read as the run starts; `null` when none is stored, which runs no step. */
  pipeline:       Readonly<Pipeline> | null;
  phase:          GatePhase;
  /** On a pipeline with entities, the entities whose gates run; absent, every entity's. A pipeline without entities ignores it. */
  gatedEntities:  readonly EntityKey[] | undefined;
  runRequest:     EntityPipelinesRunRequest;
  /** The tracker's project folder below the repository's root, from which a pipeline without entities runs. */
  projectPrefix:  string;
  runOnePipeline: (pipelineRequest: PipelineRunRequest) => Promise<PipelineVerdict>;
}

/** A run's verdict as the Airlocks read it: the stamp of the pipeline it read, the entity a stopping step belongs to, and the steps that ran. */
function mergedTreeGateOf(verdict: EntityPipelinesVerdict, phase: GatePhase, stamp: GateRunStamp | null): MergedTreeGate {
  const cacheReports = verdict.cacheReports.length === 0 ? {} : { cacheReports: { phase, gates: verdict.cacheReports } };
  const stepRuns = verdict.stepRuns.length === 0 ? {} : { stepRuns: { phase, steps: verdict.stepRuns } };
  if (verdict.outcome === 'passed') return {
    outcome: 'passed', step: null, output: '', stamp, ...cacheReports, ...stepRuns
  };
  return {
    outcome: verdict.outcome,
    step:    'step' in verdict ? verdict.step : verdict.gate,
    ...(verdict.entity === undefined ? {} : { entity: verdict.entity }),
    output:  verdict.output,
    stamp,
    ...cacheReports,
    ...stepRuns,
  };
}

/** The forge's phase hash and, on a pipeline with entities, the phase hash of each gated entity and of no other; `null` with no pipeline. */
export function mergedTreeGateStampOf(pipeline: Readonly<Pipeline> | null, phase: GatePhase, gatedEntities: readonly EntityKey[] | undefined): GateRunStamp | null {
  if (pipeline === null) return null;
  const { entities } = pipeline;
  if (entities === undefined) return PipelineUtil.gateRunStampOf(pipeline, phase);
  return PipelineUtil.entitiesGateRunStampOf(pipeline, phase, gatedEntities ?? Object.keys(entities));
}

export async function runMergedTreeGates(request: MergedTreeGateRunRequest): Promise<MergedTreeGate> {
  const {
    pipeline, phase, gatedEntities, runRequest, projectPrefix, runOnePipeline
  } = request;
  const entities = pipeline?.entities;
  if (pipeline !== null && entities !== undefined) {
    const entityKeys = gatedEntities ?? Object.keys(entities);
    const verdict    = await GateRun.runEntityPipelines(runRequest, GateRun.entityPipelinesOf(pipeline, entityKeys, phase), runOnePipeline);
    return mergedTreeGateOf(verdict, phase, mergedTreeGateStampOf(pipeline, phase, gatedEntities));
  }
  const verdict = await runOnePipeline({
    ...runRequest,
    prepare: pipeline?.prepare ?? [],
    gates:   pipeline === null ? [] : PipelineUtil.gatesOfPhase(pipeline, phase),
    projectPrefix,
  });
  return mergedTreeGateOf(verdict, phase, mergedTreeGateStampOf(pipeline, phase, gatedEntities));
}
