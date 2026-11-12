/**
 * What the stored pipeline means beside its steps: the hashes that say what judged a row and whether the file moved, the gates of each
 * phase, the instruction list a role reads, and the folders its gates write. The steps stay structured: each runs as its own process,
 * and a display line is the shell grammar's to render.
 */
import type {
  AgentStepSettings,
  GatePhase,
  InstructionEntry,
  Pipeline,
  PipelineAgentRole,
  PipelineGate,
  PipelineStep,
} from '../@types/Pipeline.ts';
import { GATE_PHASES }                  from '../@types/Pipeline.ts';
import { DEFAULT_INSTRUCTIONS_OF_ROLE } from '../constants/PipelineDefaults.ts';
import { TicketBodyHashUtil }           from './TicketBodyHashUtil.ts';

/** A gate defined once, with the phases that run it, in the phases' order. */
export interface CataloguedGate {
  gate:   PipelineGate;
  phases: GatePhase[];
}

function canonicalStepOf(step: Readonly<PipelineStep>): object {
  return { name: step.name, run: step.run };
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

/** Every key but the version, the approvals and the billing, in a fixed order, `agents` sorted by role. */
function canonicalShapeOf(pipeline: Readonly<Pipeline>): object {
  return {
    prepare:      pipeline.prepare.map(canonicalStepOf),
    gates:        pipeline.gates.map(canonicalGateOf),
    phases:       { build: pipeline.phases.build, review: pipeline.phases.review, merge: pipeline.phases.merge },
    review:       pipeline.review === undefined ? null : { name: pipeline.review.name, reReview: pipeline.review.reReview?.thresholdLines ?? null },
    airlock:      pipeline.airlock === undefined ? null : { reReview: pipeline.airlock.reReview?.thresholdLines ?? null },
    constitution: pipeline.constitution?.path ?? null,
    agents:       Object.entries(pipeline.agents ?? {}).sort(([a], [b]) => a.localeCompare(b))
      .map(([role, settings]) => [role, canonicalAgentSettingsOf(settings)]),
  };
}

/** A hand edit that only reorders keys or reindents keeps the hash. */
function pipelineHashOf(pipeline: Readonly<Pipeline>): string {
  return TicketBodyHashUtil.bodyHashOf(JSON.stringify(canonicalShapeOf(pipeline)));
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

/** Every key but `billing`, in a fixed order: what tells Apply that someone changed the stored pipeline under it. */
function contentHashOf(pipeline: Readonly<Pipeline>): string {
  const canonical = {
    version:   pipeline.version,
    shape:     canonicalShapeOf(pipeline),
    approvals: { tickets: pipeline.approvals?.tickets ?? null, merge: pipeline.approvals?.merge ?? null },
  };
  return TicketBodyHashUtil.bodyHashOf(JSON.stringify(canonical));
}

/** The role's own list, or its default list where it names none; an explicit empty list stays empty, for the caller to replace. */
function resolvedInstructionsOf(pipeline: Readonly<Pipeline> | null, role: PipelineAgentRole): readonly InstructionEntry[] {
  return pipeline?.agents?.[role]?.instructions ?? DEFAULT_INSTRUCTIONS_OF_ROLE[role];
}

function writablePathsOf(pipeline: Readonly<Pipeline>): string[] {
  return [...new Set(gateCatalogueOf(pipeline).flatMap(({ gate }) => gate.writes ?? []))];
}

export const PipelineUtil = Object.freeze({
  contentHashOf,
  gateCatalogueOf,
  gatesOfPhase,
  phaseHashOf,
  pipelineHashOf,
  resolvedInstructionsOf,
  writablePathsOf,
});
