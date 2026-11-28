/**
 * The pipeline as a job sees it: an entity's steps and gates rooted at its first home, the gates its session is told, and the scope
 * Customs judges it by.
 */
import type { GatePhase, GateRunStamp } from '../../domain/tracker-model/@types/GatePhase.ts';
import type { Job }                     from '../../domain/tracker-model/@types/Job.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineGate,
  PipelineStep
} from '../../domain/tracker-model/@types/Pipeline.ts';
import { EntityOwnershipUtil, type PipelineEntities } from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { PipelineUtil }                               from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { TicketStageUtil }                            from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { EntityFoldersUtil }                          from '../../shared/utils/EntityFoldersUtil.ts';
import { ProjectPathsUtil }                           from '../../shared/utils/ProjectPathsUtil.ts';
import type { ProjectScope, WritableFolders }         from '../lifecycle/@types/CustomsSubject.ts';
import { CrossingStages }                             from './CrossingStages.ts';
import { InstructionFiles }                           from './InstructionFiles.ts';

export const REPOSITORY_ROOT_FOLDER = '/';

/** Every entity's home; none on a pipeline without entities. */
function entityHomesOf(pipeline: Readonly<Pipeline> | null): string[] {
  return Object.values(pipeline?.entities ?? {}).flatMap((entity) => entity.home);
}

/**
 * What a job of `entityKey` may change: its homes, with the repository root for the root entity, and its `reach`; in stage 1 also a
 * proposal in the homes of the packages its entity whitelists.
 */
function writableFoldersOf(entities: PipelineEntities, entityKey: EntityKey, proposalHomes: readonly string[]): WritableFolders {
  const entity = Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
  const rootFolders = entityKey === EntityOwnershipUtil.rootEntityKeyOf(entities) ? [REPOSITORY_ROOT_FOLDER] : [];
  return {
    homes:      [...rootFolders, ...entity?.home ?? []],
    reach:      entity?.reach ?? [],
    otherHomes: Object.entries(entities).flatMap(([otherKey, other]) => (otherKey === entityKey ? [] : other.home)),
    ...(proposalHomes.length === 0 ? {} : { proposalHomes }),
  };
}

/**
 * Absent for a tracker at its repository's root whose pipeline has no entities, so its subject, and every git call Customs makes for it,
 * stays as it always was. On a pipeline with entities it names every entity home, for a job of an entity what the job may change, and for a
 * job of a ticket of an entity which constitutions the job may change (E8).
 */
function projectScopeOf(
  projectPrefix: string, pipeline: Readonly<Pipeline> | null, job?: Readonly<Pick<Job, 'entity' | 'stage'>>, ticketEntity?: string, refusedPackages: readonly EntityKey[] = []
): ProjectScope | null {
  const entities = pipeline?.entities;
  if (entities === undefined) return projectPrefix === '' ? null : { projectPrefix, reach: pipeline?.reach ?? [] };
  const constitutions = InstructionFiles.entityConstitutionsOf(pipeline, projectPrefix);
  return {
    projectPrefix,
    reach:       pipeline?.reach ?? [],
    entityHomes: entityHomesOf(pipeline),
    ...(job?.entity === undefined ? {} : { writableFolders: writableFoldersOf(entities, job.entity, CrossingStages.proposalHomesOf(pipeline, job, refusedPackages)) }),
    ...(job?.entity === undefined || ticketEntity === undefined ? {} : { constitutions: { ticketEntity, constitutions } }),
  };
}

/**
 * A `definedBy` pattern of an entity gate from the repository root: one read from the project's folder is read from the entity's first home,
 * and one without an inner `/` still names its file at any depth below that home.
 */
function rootedDefinitionPatternOf(firstHome: string, pattern: string): string {
  const homeFolder = EntityOwnershipUtil.homeFolderOf(firstHome).replace(/^\/+/u, '');
  if (homeFolder === '' || pattern.startsWith(REPOSITORY_ROOT_FOLDER)) return pattern;
  const namesAnyDepth = !pattern.replace(/\/+$/u, '').includes(REPOSITORY_ROOT_FOLDER);
  return `${REPOSITORY_ROOT_FOLDER}${homeFolder}${REPOSITORY_ROOT_FOLDER}${namesAnyDepth ? '**/' : ''}${pattern}`;
}

function entityGateOf(gate: Readonly<PipelineGate>, firstHome: string): PipelineGate {
  const rootedGate = EntityFoldersUtil.rootedGateOf(gate, firstHome);
  if (gate.definedBy === undefined) return rootedGate;
  return { ...rootedGate, definedBy: gate.definedBy.map((pattern) => rootedDefinitionPatternOf(firstHome, pattern)) };
}

/**
 * The prepare steps and gates a job runs: its entity's on a pipeline with entities, each folder and `definedBy` pattern read from the entity's
 * first home; the pipeline's own for a job without an entity. `null` when the pipeline no longer holds the job's entity, so none of its gates
 * can run.
 */
function stepsPipelineOf(pipeline: Readonly<Pipeline>, job: Readonly<Pick<Job, 'entity'>>): Readonly<Pipeline> | null {
  if (job.entity === undefined || pipeline.entities === undefined) return pipeline;
  const entityPipeline = PipelineUtil.pipelineOfEntity(pipeline, job.entity);
  if (entityPipeline === null) return null;
  const firstHome = (Object.hasOwn(pipeline.entities, job.entity) ? pipeline.entities[job.entity]?.home[0] : undefined) ?? REPOSITORY_ROOT_FOLDER;
  return {
    ...entityPipeline,
    prepare: EntityFoldersUtil.rootedStepsOf(entityPipeline.prepare, firstHome),
    gates:   entityPipeline.gates.map((gate) => entityGateOf(gate, firstHome)),
  };
}

/**
 * The gates a job's session is told, the ones Customs judges it by; none once the pipeline no longer holds the job's entity. An entity gate's
 * folder is given back from the project's folder, the repository root of a forge with entities, as a session reads it.
 */
function sessionGatesOf(pipeline: Readonly<Pipeline>, job: Readonly<Pick<Job, 'entity'>>): readonly Readonly<PipelineGate>[] {
  if (job.entity === undefined || pipeline.entities === undefined) return pipeline.gates;
  return (stepsPipelineOf(pipeline, job)?.gates ?? []).map((gate) => {
    const projectFolder = ProjectPathsUtil.toRepositoryPath('', gate.in ?? '');
    const sessionGate: PipelineGate = { ...gate };
    delete sessionGate.in;
    return projectFolder === '' ? sessionGate : { ...sessionGate, in: projectFolder };
  });
}

/** The prepare steps that install the job's worktree; none without a pipeline or once the pipeline no longer holds the job's entity. */
function installStepsOf(pipeline: Readonly<Pipeline> | null, job: Readonly<Pick<Job, 'entity'>>): readonly PipelineStep[] {
  return pipeline === null ? [] : stepsPipelineOf(pipeline, job)?.prepare ?? [];
}

/** What a run of the job's gates records: on a pipeline with entities, the phase hash of the job's entity beside the forge's own. */
function jobGateRunStampOf(pipeline: Readonly<Pipeline>, job: Readonly<Pick<Job, 'entity'>>, phase: GatePhase): GateRunStamp {
  if (job.entity === undefined || pipeline.entities === undefined) return PipelineUtil.gateRunStampOf(pipeline, phase);
  return PipelineUtil.entitiesGateRunStampOf(pipeline, phase, [job.entity]);
}

/** The entity whose pipeline a job's install steps are: none for a job without one, or on a forge without entities. */
function installEntityOf(pipeline: Readonly<Pipeline> | null, job: Readonly<Pick<Job, 'entity'>>): EntityKey | undefined {
  return pipeline?.entities === undefined ? undefined : job.entity;
}

/** The dependents of the package of a package build: every other job has none. */
function dependentsOfThePackageOf(pipeline: Readonly<Pipeline> | null, job: Readonly<Job>): EntityKey[] {
  if (pipeline?.entities === undefined || job.entity === undefined || TicketStageUtil.stageOfJob(job)?.name !== 'package-build') return [];
  return EntityOwnershipUtil.dependentsOf(pipeline.entities, [job.entity]);
}

export const JobPipelines = Object.freeze({
  entityHomesOf,
  projectScopeOf,
  stepsPipelineOf,
  sessionGatesOf,
  installStepsOf,
  jobGateRunStampOf,
  installEntityOf,
  dependentsOfThePackageOf,
});
