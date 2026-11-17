/**
 * What the stored pipeline means beside its steps: the hashes that say what judged a row and whether the file moved, the gates of each
 * phase, the instruction list a role reads, the folders its gates write, and the single pipeline of an entity. The steps stay structured:
 * each runs as its own process, and a display line is the shell grammar's to render.
 */
import { GATE_PHASES, type GatePhase, type GateRunStamp } from '../@types/GatePhase.ts';
import type {
  AgentStepSettings,
  EntityKey,
  ForgeLevelAgentRole,
  InstructionEntry,
  Pipeline,
  PipelineAgentRole,
  PipelineEntity,
  PipelineFormatVersion,
  PipelineGate,
  PipelineReview,
  PipelineStep
} from '../@types/Pipeline.ts';
import {
  EARLIEST_PIPELINE_FORMAT_VERSION,
  ENTITIES_PIPELINE_FORMAT_VERSION,
  FORGE_LEVEL_AGENT_ROLES,
  PIPELINE_AGENT_ROLES,
  PIPELINE_FORMAT_VERSION
} from '../@types/Pipeline.ts';
import { DEFAULT_INSTRUCTIONS_OF_ROLE } from '../constants/PipelineDefaults.ts';
import { TicketBodyHashUtil }           from './TicketBodyHashUtil.ts';

/** A gate defined once, with the phases that run it, in the phases' order. */
export interface CataloguedGate {
  gate:   PipelineGate;
  phases: GatePhase[];
}

/** A step with no `in` hashes as it did before steps had one, so adding the key moves no green of a pipeline that never sets it. */
function canonicalStepOf(step: Readonly<PipelineStep>): object {
  return step.in === undefined ? { name: step.name, run: step.run } : { name: step.name, run: step.run, in: step.in };
}

function canonicalGateOf(gate: Readonly<PipelineGate>): object {
  return {
    name:         gate.name,
    run:          gate.run,
    fix:          gate.fix ?? null,
    in:           gate.in ?? null,
    definedBy:    gate.definedBy ?? [],
    network:      gate.network ?? [],
    writes:       gate.writes ?? [],
    overseerOnly: gate.overseerOnly ?? false,
  };
}

function canonicalInstructionOf(entry: Readonly<InstructionEntry>): object {
  if (entry.kind === 'constitution') return { kind: entry.kind };
  if (entry.kind === 'default-brief') return { kind: entry.kind, role: entry.role };
  return { kind: entry.kind, path: entry.path };
}

function canonicalAgentSettingsOf(settings: Readonly<AgentStepSettings>): object {
  return {
    model:        settings.model ?? null,
    effort:       settings.effort ?? null,
    instructions: settings.instructions?.map(canonicalInstructionOf) ?? null,
  };
}

function canonicalReviewOf(review: Readonly<PipelineReview> | undefined): object | null {
  return review === undefined ? null : { name: review.name, reReview: review.reReview?.thresholdLines ?? null };
}

function canonicalAgentsOf(agents: Readonly<Partial<Record<PipelineAgentRole, AgentStepSettings>>> | undefined): object {
  return Object.entries(agents ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([role, settings]) => [role, canonicalAgentSettingsOf(settings)]);
}

/** Every key of an entity, each option filled, so a hand edit that only reorders keys or writes out a default keeps the hash. */
function canonicalEntityOf(entity: Readonly<PipelineEntity>): object {
  return {
    kind:         entity.kind,
    home:         entity.home,
    summary:      entity.summary ?? null,
    constitution: entity.constitution?.path ?? null,
    prepare:      entity.prepare.map(canonicalStepOf),
    gates:        entity.gates.map(canonicalGateOf),
    phases:       { build: entity.phases.build, review: entity.phases.review, merge: entity.phases.merge },
    review:       canonicalReviewOf(entity.review),
    agents:       canonicalAgentsOf(entity.agents),
    whitelist:    entity.whitelist ?? [],
    reach:        entity.reach ?? [],
    dependsOn:    entity.dependsOn ?? [],
    concurrency:  entity.concurrency ?? null,
  };
}

/** Sorted by key in code-unit order, which no locale changes, so the order of the file moves no hash. */
function canonicalEntitiesOf(entities: Readonly<Record<EntityKey, PipelineEntity>>): object {
  return Object.entries(entities).sort(([a], [b]) => (a < b ? -1 : 1)).map(([entityKey, entity]) => [entityKey, canonicalEntityOf(entity)]);
}

/**
 * The earliest format that holds the pipeline. Entities are version 4's alone. Without them, a gate folder from the repository's root, a
 * prepare step's folder or a reach are the keys version 2 lacks: a pipeline holding none is stored as version 2, so a release that reads
 * only version 2 still reads it, and one holding any as version 3, which that release refuses.
 */
function formatVersionOf(pipeline: Readonly<Pipeline>): PipelineFormatVersion {
  if (pipeline.entities !== undefined) return ENTITIES_PIPELINE_FORMAT_VERSION;
  const holdsANewerKey = pipeline.reach !== undefined
    || pipeline.prepare.some((step) => step.in !== undefined)
    || pipeline.gates.some((gate) => gate.in?.startsWith('/') === true);
  return holdsANewerKey ? PIPELINE_FORMAT_VERSION : EARLIEST_PIPELINE_FORMAT_VERSION;
}

/**
 * Every key but the version, the approvals and the billing, in a fixed order, `agents` sorted by role; `reach` from version 3 and
 * `entities` only in version 4, so a version 2 or 3 pipeline hashes as it did before the next version existed.
 */
function canonicalShapeOf(pipeline: Readonly<Pipeline>, formatVersion: PipelineFormatVersion): object {
  return {
    prepare:      pipeline.prepare.map(canonicalStepOf),
    gates:        pipeline.gates.map(canonicalGateOf),
    phases:       { build: pipeline.phases.build, review: pipeline.phases.review, merge: pipeline.phases.merge },
    review:       canonicalReviewOf(pipeline.review),
    airlock:      pipeline.airlock === undefined ? null : { reReview: pipeline.airlock.reReview?.thresholdLines ?? null },
    constitution: pipeline.constitution?.path ?? null,
    agents:       canonicalAgentsOf(pipeline.agents),
    ...(formatVersion === EARLIEST_PIPELINE_FORMAT_VERSION ? {} : { reach: pipeline.reach ?? [] }),
    ...(formatVersion === ENTITIES_PIPELINE_FORMAT_VERSION ? { entities: canonicalEntitiesOf(pipeline.entities ?? {}) } : {}),
  };
}

/** The gates a phase runs, in its order; a name with no definition is left out, which a readable file never holds. */
function gatesOfPhase(pipeline: Readonly<Pipeline>, phase: GatePhase): PipelineGate[] {
  return pipeline.phases[phase].flatMap((name) => pipeline.gates.filter((gate) => gate.name === name));
}

/** Every gate in definition order, each once, whatever phases run it. */
function gateCatalogueOf(pipeline: Readonly<Pipeline>): CataloguedGate[] {
  return pipeline.gates.map((gate) => ({ gate, phases: GATE_PHASES.filter((phase) => pipeline.phases[phase].includes(gate.name)) }));
}

/**
 * The green hash of a phase: the prepare steps and that phase's gates in run order, every option filled. Agent settings, instructions,
 * the constitution, re-review, approvals and billing stay out of it, so editing them never makes a green stale.
 */
function phaseHashOf(pipeline: Readonly<Pipeline>, phase: GatePhase): string {
  const canonical = {
    prepare: pipeline.prepare.map(canonicalStepOf),
    gates:   gatesOfPhase(pipeline, phase).map(canonicalGateOf),
  };
  return TicketBodyHashUtil.bodyHashOf(JSON.stringify(canonical));
}

/** The stamp a gate run of `phase` under this pipeline records on a row: the phase and its hash now. */
function gateRunStampOf(pipeline: Readonly<Pipeline>, phase: GatePhase): GateRunStamp {
  return { phase, phaseHash: phaseHashOf(pipeline, phase) };
}

/** The green hash of an entity's phase, as its single pipeline hashes it; `null` when the pipeline has no entity of that key. */
function entityPhaseHashOf(pipeline: Readonly<Pipeline>, entityKey: EntityKey, phase: GatePhase): string | null {
  const entityPipeline = pipelineOfEntity(pipeline, entityKey);
  return entityPipeline === null ? null : phaseHashOf(entityPipeline, phase);
}

/**
 * The stamp a gate run of some entities' gates in `phase` records: the forge's own phase hash, as a run without entities records it, and
 * the phase hash of each of those entities the pipeline holds.
 */
function entitiesGateRunStampOf(pipeline: Readonly<Pipeline>, phase: GatePhase, entityKeys: readonly EntityKey[]): GateRunStamp {
  const entityPhaseHashes: Record<EntityKey, string> = {};
  for (const entityKey of entityKeys) {
    const entityPhaseHash = entityPhaseHashOf(pipeline, entityKey, phase);
    if (entityPhaseHash !== null) entityPhaseHashes[entityKey] = entityPhaseHash;
  }
  return { ...gateRunStampOf(pipeline, phase), entityPhaseHashes };
}

/** Every key but `billing`, in a fixed order: what tells Apply that someone changed the stored pipeline under it. */
function contentHashOf(pipeline: Readonly<Pipeline>): string {
  const formatVersion = formatVersionOf(pipeline);
  const canonical = {
    version:   formatVersion,
    shape:     canonicalShapeOf(pipeline, formatVersion),
    approvals: { tickets: pipeline.approvals?.tickets ?? null, merge: pipeline.approvals?.merge ?? null },
  };
  return TicketBodyHashUtil.bodyHashOf(JSON.stringify(canonical));
}

/** The role's own list, or its default list where it names none; an explicit empty list stays empty, for the caller to replace. */
function resolvedInstructionsOf(pipeline: Readonly<Pipeline> | null, role: PipelineAgentRole): readonly InstructionEntry[] {
  return pipeline?.agents?.[role]?.instructions ?? DEFAULT_INSTRUCTIONS_OF_ROLE[role];
}

/** No review, no re-review and no gates: valid, and it counts as set. */
function minimalPipelineOf(): Pipeline {
  return {
    version: PIPELINE_FORMAT_VERSION, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  };
}

function writablePathsOf(pipeline: Readonly<Pipeline>): string[] {
  return [...new Set(gateCatalogueOf(pipeline).flatMap(({ gate }) => gate.writes ?? []))];
}

function roleIsForgeLevel(role: PipelineAgentRole): role is ForgeLevelAgentRole {
  return (FORGE_LEVEL_AGENT_ROLES as readonly PipelineAgentRole[]).includes(role);
}

/** The forge's settings for the roles it sets once, the entity's for the rest, in the order the flow draws the roles. */
function agentsOfEntity(pipeline: Readonly<Pipeline>, entity: Readonly<PipelineEntity>): Partial<Record<PipelineAgentRole, AgentStepSettings>> {
  const agents: Partial<Record<PipelineAgentRole, AgentStepSettings>> = {};
  for (const role of PIPELINE_AGENT_ROLES) {
    const settings = roleIsForgeLevel(role) ? pipeline.agents?.[role] : entity.agents?.[role];
    if (settings !== undefined) agents[role] = settings;
  }
  return agents;
}

/**
 * The entity as an ordinary single pipeline: its own steps, gates, phases, review, constitution, reach and agents, with the forge's merge
 * train, approvals, billing and forge-level agents. Null when the pipeline has no entity of that key.
 */
function pipelineOfEntity(pipeline: Readonly<Pipeline>, entityKey: EntityKey): Pipeline | null {
  const { entities } = pipeline;
  const entity       = entities !== undefined && Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
  if (entity === undefined) return null;
  const agents = agentsOfEntity(pipeline, entity);
  return {
    version: PIPELINE_FORMAT_VERSION,
    prepare: entity.prepare,
    gates:   entity.gates,
    phases:  entity.phases,
    ...(entity.review === undefined ? {} : { review: entity.review }),
    ...(pipeline.airlock === undefined ? {} : { airlock: pipeline.airlock }),
    ...(entity.constitution === undefined ? {} : { constitution: entity.constitution }),
    ...(Object.keys(agents).length === 0 ? {} : { agents }),
    ...(pipeline.approvals === undefined ? {} : { approvals: pipeline.approvals }),
    ...(pipeline.billing === undefined ? {} : { billing: pipeline.billing }),
    ...(entity.reach === undefined ? {} : { reach: entity.reach }),
  };
}

export const PipelineUtil = Object.freeze({
  contentHashOf,
  entitiesGateRunStampOf,
  entityPhaseHashOf,
  formatVersionOf,
  gateCatalogueOf,
  gateRunStampOf,
  gatesOfPhase,
  minimalPipelineOf,
  phaseHashOf,
  pipelineOfEntity,
  resolvedInstructionsOf,
  writablePathsOf,
});
