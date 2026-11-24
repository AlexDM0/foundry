/**
 * The contract's vocabulary against the tracker model's. What matters: the contract's vocabulary is the model's, so a value added on either
 * side fails here before a reader meets it. A union that differs is a compile error in `UNION_AGREEMENTS`, which the typecheck watches; a
 * list in another order fails the runtime comparison.
 */
import { describe, expect, test } from 'bun:test';

import {
  AGENT_EFFORTS,
  FORGE_LEVEL_AGENT_ROLES,
  GATE_PHASES,
  ENTITY_KINDS,
  JOB_STATES,
  PIPELINE_AGENT_ROLES,
  TASK_STATUSES,
  TICKET_PRIORITIES,
  TICKET_SIZES,
  TICKET_STAGES,
  TICKET_DOCUMENT_KINDS,
  TICKET_STATUSES,
  TICKET_TYPES,
  TICKET_WRITING_ROUTES,
  type AgentEffort,
  type AgentModel,
  type DisplayState,
  type DocumentMessageState,
  type DocumentProposalState,
  type DocumentReadingRule,
  type DocumentStanding,
  type DraftState,
  type EffectChange,
  type EntityAgentRole,
  type EntityKind,
  type ForgeLevelAgentRole,
  type GatePhase,
  type JobState,
  type PipelineAgentRole,
  type ProposalMode,
  type TaskStatus,
  type TicketDocumentKind,
  type TicketPriority,
  type TicketSize,
  type TicketStageName,
  type TicketStatus,
  type TicketType,
  type TicketWritingRoute
} from 'forge-contracts/BoardVocabulary';

import type { DraftState as ModelDraftState }                                 from '../../lib/tracker-model/@types/Draft.ts';
import { GATE_PHASES as MODEL_GATE_PHASES, type GatePhase as ModelGatePhase } from '../../lib/tracker-model/@types/GatePhase.ts';
import type { JobState as ModelJobState }                                     from '../../lib/tracker-model/@types/Job.ts';
import {
  FORGE_LEVEL_AGENT_ROLES as MODEL_FORGE_LEVEL_AGENT_ROLES,
  PIPELINE_AGENT_ROLES as MODEL_PIPELINE_AGENT_ROLES,
  PIPELINE_ENTITY_KINDS as MODEL_ENTITY_KINDS,
  TICKET_WRITING_ROUTES as MODEL_TICKET_WRITING_ROUTES,
  type DocumentReadingRule as ModelDocumentReadingRule,
  type EntityAgentRole as ModelEntityAgentRole,
  type ForgeLevelAgentRole as ModelForgeLevelAgentRole,
  type PipelineAgentRole as ModelPipelineAgentRole,
  type PipelineEntityKind as ModelEntityKind,
  type TicketWritingRoute as ModelTicketWritingRoute
} from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DisplayState as ModelDisplayState, TaskStatus as ModelTaskStatus, TicketStageName as ModelTicketStageName } from '../../lib/tracker-model/@types/Task.ts';
import type {
  AgentEffort as ModelAgentEffort,
  AgentModel as ModelAgentModel,
  TicketPriority as ModelTicketPriority,
  TicketSize as ModelTicketSize,
  TicketStatus as ModelTicketStatus,
  TicketType as ModelTicketType
} from '../../lib/tracker-model/@types/Ticket.ts';
import {
  TICKET_DOCUMENT_KINDS as MODEL_TICKET_DOCUMENT_KINDS,
  type DocumentMessageState as ModelDocumentMessageState,
  type DocumentProposalState as ModelDocumentProposalState,
  type DocumentStanding as ModelDocumentStanding,
  type ProposalMode as ModelProposalMode,
  type TicketDocumentKind as ModelTicketDocumentKind
} from '../../lib/tracker-model/@types/TicketDocument.ts';
import { AGENT_EFFORTS as MODEL_AGENT_EFFORTS }                                           from '../../lib/tracker-model/constants/AgentSettings.ts';
import { JOB_STATES as MODEL_JOB_STATES }                                                 from '../../lib/tracker-model/constants/JobStates.ts';
import { TASK_STATUSES as MODEL_TASK_STATUSES, TICKET_STATUSES as MODEL_TICKET_STATUSES } from '../../lib/tracker-model/constants/Statuses.ts';
import {
  TICKET_PRIORITIES as MODEL_TICKET_PRIORITIES,
  TICKET_SIZES as MODEL_TICKET_SIZES,
  TICKET_TYPES as MODEL_TICKET_TYPES
} from '../../lib/tracker-model/constants/TicketFields.ts';
import { TICKET_STAGE_NAMES as MODEL_TICKET_STAGE_NAMES } from '../../lib/tracker-model/constants/TicketStages.ts';
import type { EffectChange as ModelEffectChange }         from '../../shared/@types/EffectReading.ts';

/** `true` only when each union is assignable to the other; the brackets keep a union from being compared member by member. */
type MutuallyAssignable<First, Second> = [First] extends [Second] ? ([Second] extends [First] ? true : false) : false;

interface UnionAgreements {
  readonly TicketStatus:          MutuallyAssignable<TicketStatus, ModelTicketStatus>;
  readonly TaskStatus:            MutuallyAssignable<TaskStatus, ModelTaskStatus>;
  readonly DisplayState:          MutuallyAssignable<DisplayState, ModelDisplayState>;
  readonly TicketPriority:        MutuallyAssignable<TicketPriority, ModelTicketPriority>;
  readonly TicketType:            MutuallyAssignable<TicketType, ModelTicketType>;
  readonly TicketSize:            MutuallyAssignable<TicketSize, ModelTicketSize>;
  readonly TicketStageName:       MutuallyAssignable<TicketStageName, ModelTicketStageName>;
  readonly DraftState:            MutuallyAssignable<DraftState, ModelDraftState>;
  readonly JobState:              MutuallyAssignable<JobState, ModelJobState>;
  readonly GatePhase:             MutuallyAssignable<GatePhase, ModelGatePhase>;
  readonly PipelineAgentRole:     MutuallyAssignable<PipelineAgentRole, ModelPipelineAgentRole>;
  readonly ForgeLevelAgentRole:   MutuallyAssignable<ForgeLevelAgentRole, ModelForgeLevelAgentRole>;
  readonly EntityAgentRole:       MutuallyAssignable<EntityAgentRole, ModelEntityAgentRole>;
  readonly EntityKind:            MutuallyAssignable<EntityKind, ModelEntityKind>;
  readonly AgentEffort:           MutuallyAssignable<AgentEffort, ModelAgentEffort>;
  readonly AgentModel:            MutuallyAssignable<AgentModel, ModelAgentModel>;
  readonly TicketWritingRoute:    MutuallyAssignable<TicketWritingRoute, ModelTicketWritingRoute>;
  readonly TicketDocumentKind:    MutuallyAssignable<TicketDocumentKind, ModelTicketDocumentKind>;
  readonly DocumentReadingRule:   MutuallyAssignable<DocumentReadingRule, ModelDocumentReadingRule>;
  readonly ProposalMode:          MutuallyAssignable<ProposalMode, ModelProposalMode>;
  readonly DocumentStanding:      MutuallyAssignable<DocumentStanding, ModelDocumentStanding>;
  readonly DocumentMessageState:  MutuallyAssignable<DocumentMessageState, ModelDocumentMessageState>;
  readonly DocumentProposalState: MutuallyAssignable<DocumentProposalState, ModelDocumentProposalState>;
  readonly EffectChange:          MutuallyAssignable<EffectChange, ModelEffectChange>;
}

const UNION_AGREEMENTS: UnionAgreements = {
  TicketStatus:          true,
  TaskStatus:            true,
  DisplayState:          true,
  TicketPriority:        true,
  TicketType:            true,
  TicketSize:            true,
  TicketStageName:       true,
  DraftState:            true,
  JobState:              true,
  GatePhase:             true,
  PipelineAgentRole:     true,
  ForgeLevelAgentRole:   true,
  EntityAgentRole:       true,
  EntityKind:            true,
  AgentEffort:           true,
  AgentModel:            true,
  TicketWritingRoute:    true,
  TicketDocumentKind:    true,
  DocumentReadingRule:   true,
  ProposalMode:          true,
  DocumentStanding:      true,
  DocumentMessageState:  true,
  DocumentProposalState: true,
  EffectChange:          true,
};

function valuesOf(list: readonly string[]): string[] {
  return [...list];
}

describe('the contract\'s vocabulary is the tracker model\'s', () => {
  test('every union agrees with the model\'s, which the typecheck holds', () => {
    expect(Object.values(UNION_AGREEMENTS).every((agrees) => agrees)).toBe(true);
  });

  test('the helper catches a union with a value only one side has, either way round', () => {
    // @ts-expect-error A value only the contract has.
    const contractWider: MutuallyAssignable<'build' | 'review' | 'merge' | 'planted', ModelGatePhase> = true;
    // @ts-expect-error A value only the model has.
    const modelWider: MutuallyAssignable<'build' | 'review', ModelGatePhase> = true;
    const plantedAgreements: readonly boolean[] = [contractWider, modelWider];
    expect(plantedAgreements).toEqual([true, true]);
  });

  test('each status list is the model\'s, in its order, with no mapping between them', () => {
    expect(valuesOf(TICKET_STATUSES)).toEqual(valuesOf(MODEL_TICKET_STATUSES));
    expect(valuesOf(TASK_STATUSES)).toEqual(valuesOf(MODEL_TASK_STATUSES));
  });

  test('each other list the model keeps is the model\'s, in its order', () => {
    expect([...TICKET_PRIORITIES]).toEqual([...MODEL_TICKET_PRIORITIES]);
    expect([...TICKET_TYPES]).toEqual([...MODEL_TICKET_TYPES]);
    expect([...TICKET_SIZES]).toEqual([...MODEL_TICKET_SIZES]);
    expect([...TICKET_STAGES]).toEqual([...MODEL_TICKET_STAGE_NAMES]);
    expect([...JOB_STATES]).toEqual([...MODEL_JOB_STATES]);
    expect([...GATE_PHASES]).toEqual([...MODEL_GATE_PHASES]);
    expect([...PIPELINE_AGENT_ROLES]).toEqual([...MODEL_PIPELINE_AGENT_ROLES]);
    expect([...FORGE_LEVEL_AGENT_ROLES]).toEqual([...MODEL_FORGE_LEVEL_AGENT_ROLES]);
    expect([...ENTITY_KINDS]).toEqual([...MODEL_ENTITY_KINDS]);
    expect([...AGENT_EFFORTS]).toEqual([...MODEL_AGENT_EFFORTS]);
    expect([...TICKET_WRITING_ROUTES]).toEqual([...MODEL_TICKET_WRITING_ROUTES]);
    expect([...TICKET_DOCUMENT_KINDS]).toEqual([...MODEL_TICKET_DOCUMENT_KINDS]);
  });
});
