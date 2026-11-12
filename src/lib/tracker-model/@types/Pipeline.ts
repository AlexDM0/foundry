/** The board's pipeline, stored in `pipeline.json` beside the progress file: absent until a `gate` verb first writes it. */
import type { AgentEffort, AgentModel } from './Ticket.ts';

export const PIPELINE_FORMAT_VERSION = 2;

/** Build is what a builder passes to be reviewed, review what a reviewer keeps green, merge what runs after main is merged in. */
export type GatePhase = 'build' | 'review' | 'merge';

/** The phases in the order a ticket meets them. */
export const GATE_PHASES: readonly GatePhase[] = Object.freeze(['build', 'review', 'merge']);

export interface PipelineStep {
  name: string;
  run:  string;
}

export interface PipelineGate {
  name:          string;
  run:           string;
  /** The shell line that repairs what the gate reports, such as a formatter; absent when the gate has none. */
  fix?:          string;
  /** The folder, relative to the worktree, the gate runs in; absent runs it at the worktree's root. */
  in?:           string;
  /** The git pathspec-style patterns of the files that define the gate. */
  definedBy?:    string[];
  /** The domains the gate may reach. */
  network?:      string[];
  /** The folders the gate may write besides the worktree and temp, absolute or `~/`. */
  writes?:       string[];
  /** Run by the Overseer alone, never by an agent in its worktree. */
  overseerOnly?: true;
}

/** The gate names of each phase, in run order. A gate is defined once and may run in several phases. */
export type PipelinePhaseOrders = Record<GatePhase, string[]>;

export type PipelineAgentRole =
  | 'productOwner'
  | 'builder'
  | 'reviewer'
  | 'reReviewer'
  | 'conflictReReviewer'
  | 'pipelineAgent'
  | 'assistant';

/** The roles in the order the flow draws their steps. */
export const PIPELINE_AGENT_ROLES: readonly PipelineAgentRole[] = Object.freeze([
  'productOwner', 'builder', 'reviewer', 'reReviewer', 'conflictReReviewer', 'pipelineAgent', 'assistant',
]);

export type InstructionEntry =
  | { kind: 'constitution' }
  | { kind: 'default-brief'; role: PipelineAgentRole }
  /** A tracked path, or a path under the data folder. */
  | { kind: 'file'; path: string };

export interface AgentStepSettings {
  model?:        AgentModel;
  effort?:       AgentEffort;
  /** Read top to bottom; absent is the role's default list. */
  instructions?: InstructionEntry[];
}

/** Present means on: a re-review runs when the fixes change at least `thresholdLines` lines. */
export interface ConditionalReReview {
  thresholdLines: number;
}

export interface PipelineReview {
  name:      string;
  reReview?: ConditionalReReview;
}

export interface PipelineAirlock {
  reReview?: ConditionalReReview;
}

export interface PipelineConstitution {
  path: string;
}

/**
 * A human gate User may switch on or off: `tickets` is the ticket review before an agent can pick a ticket up; `merge` is User's accept
 * of a reviewed ticket before its Airlock, on every target.
 */
export type PipelineApproval = 'tickets' | 'merge';

/**
 * How the agents the Overseer starts are billed: `subscription` by the login, `api` by the Console account of the API key the Overseer's
 * environment holds. `maxBudgetUsd` caps each launch of a session. No key or command is ever stored here.
 */
export type PipelineBilling =
  | { mode: 'subscription' }
  | { mode: 'api'; maxBudgetUsd?: number };

export interface Pipeline {
  version:       typeof PIPELINE_FORMAT_VERSION;
  prepare:       PipelineStep[];
  /** Every gate, defined once; an empty list is no gates on purpose, which counts as set. */
  gates:         PipelineGate[];
  phases:        PipelinePhaseOrders;
  /** Present: the review phase is on. */
  review?:       PipelineReview;
  /** The merge train. */
  airlock?:      PipelineAirlock;
  constitution?: PipelineConstitution;
  agents?:       Partial<Record<PipelineAgentRole, AgentStepSettings>>;
  /** An absent `tickets` approval is on; an absent `merge` approval is off. */
  approvals?:    Partial<Record<PipelineApproval, boolean>>;
  /** Absent bills by subscription; not part of the pipeline hash, as `approvals` is not. */
  billing?:      PipelineBilling;
}

/**
 * One field of a pipeline that an edit addresses and a change list names: a gate's definition, a phase's run order, a prepare step, the
 * prepare steps' order, a role's settings, the review, the merge train, an approval or the constitution.
 */
export type PipelineDraftField =
  | `gate:${string}`
  | `phase-order:${GatePhase}`
  | `prepare:${string}`
  | 'prepare-order'
  | `role:${PipelineAgentRole}`
  | 'review'
  | 'airlock'
  | `approval:${PipelineApproval}`
  | 'constitution';
