/** The board's pipeline, stored in `pipeline.json` beside the progress file: absent until a `gate` verb first writes it. */
import type { GatePhase }               from './GatePhase.ts';
import type { AgentEffort, AgentModel } from './Ticket.ts';
import type { TicketDocumentKind }      from './TicketDocument.ts';

/** The one `pipeline.json` format: every pipeline is read and written in it, and a file of any other version is refused. */
export const PIPELINE_FORMAT_VERSION = 5;

export interface PipelineStep {
  name: string;
  run:  string;
  /** The folder the step runs in, as a gate's `in` names one; absent runs it in the project's folder. */
  in?:  string;
}

export interface PipelineGate {
  name:       string;
  run:        string;
  /** The shell line that repairs what the gate reports, such as a formatter; absent when the gate has none. */
  fix?:       string;
  /**
   * The folder the gate runs in, relative to the project's folder in the worktree, or to the worktree's root when it leads with `/`;
   * absent runs it in the project's folder.
   */
  in?:        string;
  /** The git pathspec-style patterns of the files that define the gate. */
  definedBy?: string[];
  /** The domains the gate may reach. */
  network?:   string[];
  /** The folders the gate may write besides the worktree and temp, absolute or `~/`. */
  writes?:    string[];
  /** Run by the forge alone, never by an agent in its worktree. */
  forgeOnly?: true;
}

/** The gate names of each phase, in run order. A gate is defined once and may run in several phases. */
export type PipelinePhaseOrders = Record<GatePhase, string[]>;

export type PipelineAgentRole =
  | 'productOwner'
  | 'specAgent'
  | 'planAgent'
  | 'builder'
  | 'reviewer'
  | 'reReviewer'
  | 'conflictReReviewer'
  | 'pipelineAgent'
  | 'assistant';

/** The roles in the order the flow draws their steps. */
export const PIPELINE_AGENT_ROLES: readonly PipelineAgentRole[] = Object.freeze([
  'productOwner', 'specAgent', 'planAgent', 'builder', 'reviewer', 'reReviewer', 'conflictReReviewer', 'pipelineAgent', 'assistant',
]);

/** The roles set once for the whole forge, at the top of `pipeline.json`, also when it holds entities. */
export type ForgeLevelAgentRole = 'productOwner' | 'specAgent' | 'planAgent' | 'pipelineAgent' | 'assistant';

/** The roles an entity sets for its own tickets. */
export type EntityAgentRole = Exclude<PipelineAgentRole, ForgeLevelAgentRole>;

export const FORGE_LEVEL_AGENT_ROLES: readonly ForgeLevelAgentRole[] = Object.freeze(['productOwner', 'specAgent', 'planAgent', 'pipelineAgent', 'assistant']);

export const ENTITY_AGENT_ROLES: readonly EntityAgentRole[] = Object.freeze(['builder', 'reviewer', 'reReviewer', 'conflictReReviewer']);

export type InstructionEntry =
  | { kind: 'constitution' }
  | { kind: 'default-brief'; role: PipelineAgentRole }
  /** A tracked path, or a path under the data folder. */
  | { kind: 'file'; path: string };

/**
 * Which version of a ticket document a role reads: `always` the approved head; `if-person-approved` the newest version a person approved,
 * only while it was approved on the spec version given; `never` none.
 */
export type DocumentReadingRule = 'always' | 'if-person-approved' | 'never';

export interface AgentStepSettings {
  model?:        AgentModel;
  effort?:       AgentEffort;
  /** Read top to bottom; absent is the role's default list. */
  instructions?: InstructionEntry[];
  /** On the builder and the reviewer only; absent is the role's default (`DEFAULT_DOCUMENTS_OF_ROLE`). */
  documents?:    Partial<Record<TicketDocumentKind, DocumentReadingRule>>;
}

/** Present means on: a re-review runs when the fixes change more than `thresholdLines` lines. */
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
 * of a reviewed ticket before its Airlock, on every target; `spec` and `plan` are User's review of each ticket document.
 */
export type PipelineApproval = 'tickets' | 'merge' | 'spec' | 'plan';

/** How a ticket is written: the product owner's one ticket body, or a spec and a plan, each with its own agent. */
export type TicketWritingRoute = 'one-ticket' | 'spec-then-plan';

export const TICKET_WRITING_ROUTES: readonly TicketWritingRoute[] = Object.freeze(['one-ticket', 'spec-then-plan']);

/**
 * How the agents Hephaestus starts are billed: `subscription` by the login, `api` by the Console account of the API key Hephaestus's
 * environment holds. `maxBudgetUsd` caps each launch of a session. No key or command is ever stored here.
 */
export type PipelineBilling =
  | { mode: 'subscription' }
  | { mode: 'api'; maxBudgetUsd?: number };

/** How a forge names its agent's program: the machine's program of its vendor, or a path for this forge alone, kept as found. */
export type AgentProgramChoice = { follows: 'machine' } | { pinned: string };

/** The agent every job of the forge runs: its vendor, as the agent adapter names itself, and the program that vendor's sessions start. */
export interface PipelineAgent {
  vendor:  string;
  program: AgentProgramChoice;
}

/** A program the forge's agents may run, by its name and the absolute path it was found at, kept as found and never resolved. */
export interface PipelineTool {
  name: string;
  path: string;
}

/** An entity's stable name: tickets, jobs, log records and the monitor store the key, never a path. */
export type EntityKey = string;

/** An app, a package, or the one root entity, which owns every path no other entity owns. */
export type PipelineEntityKind = 'app' | 'package' | 'root';

export const PIPELINE_ENTITY_KINDS: readonly PipelineEntityKind[] = Object.freeze(['app', 'package', 'root']);

/** One part of a monorepo with its own constitution, pipeline and agents, under the forge's one intake and board. */
export interface PipelineEntity {
  kind:          PipelineEntityKind;
  /** Repository folders, each leading with `/`; the deepest folder that holds a path owns it. */
  home:          string[];
  /** Two lines that intake routes a ticket by. */
  summary?:      string;
  /** Absent: the installed default constitution. */
  constitution?: PipelineConstitution;
  prepare:       PipelineStep[];
  gates:         PipelineGate[];
  phases:        PipelinePhaseOrders;
  /** Present: the review phase is on; a package that any entity whitelists has it. */
  review?:       PipelineReview;
  agents?:       Partial<Record<EntityAgentRole, AgentStepSettings>>;
  /** The package entities its tickets may cross into by stages; absent crosses into none. */
  whitelist?:    EntityKey[];
  /** The repository paths outside its homes its builder may change, each leading with `/` and owned by the root entity; absent reaches none. */
  reach?:        string[];
  /** The entities it consumes, whose change runs its gates; every entity depends on the root entity without naming it. */
  dependsOn?:    EntityKey[];
  /** The most jobs of this entity that run at once, under the board's limit; absent is the board's limit alone. */
  concurrency?:  number;
}

export interface Pipeline {
  version:        typeof PIPELINE_FORMAT_VERSION;
  /** Empty beside `entities`, whose own steps run instead. */
  prepare:        PipelineStep[];
  /** Every gate, defined once; an empty list is no gates on purpose, which counts as set. Empty beside `entities`. */
  gates:          PipelineGate[];
  /** Empty beside `entities`. */
  phases:         PipelinePhaseOrders;
  /** Present: the review phase is on. */
  review?:        PipelineReview;
  /** The merge train. */
  airlock?:       PipelineAirlock;
  constitution?:  PipelineConstitution;
  agents?:        Partial<Record<PipelineAgentRole, AgentStepSettings>>;
  /** An absent `tickets`, `spec` or `plan` approval is on; an absent `merge` approval is off. */
  approvals?:     Partial<Record<PipelineApproval, boolean>>;
  /** Absent bills by subscription; not part of the pipeline hash, as `approvals` is not. */
  billing?:       PipelineBilling;
  /** The repository paths besides the project a ticket may change, each leading with `/`; absent reaches none. */
  reach?:         string[];
  /** Present: a forge at the repository's root over these entities, each read through `PipelineUtil.pipelineOfEntity`. */
  entities?:      Record<EntityKey, PipelineEntity>;
  /** Present: the board turned the Assistant on. Absent is off; not part of the pipeline hash, as `approvals` is not. */
  assistant?:     true;
  /** Absent: no agent is chosen, and no job launches. Not part of the pipeline hash, as `billing` is not. */
  agent?:         PipelineAgent;
  /**
   * The programs whose folders an agent's search path holds; absent follows the pipeline, each program its gates, prepare steps and
   * merge train run, found at each launch. Not part of the pipeline hash, as `billing` is not.
   */
  tools?:         PipelineTool[];
  /** Absent is `one-ticket`. */
  ticketWriting?: TicketWritingRoute;
}
