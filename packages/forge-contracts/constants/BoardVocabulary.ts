/**
 * The values of the unions the board document carries that a view iterates or compares, each as a list in forge's own order and its
 * type, and the unions no view iterates as types only. The status lists name `committed` for the state in which an agent may pick a
 * ticket up at any moment.
 */

export const TICKET_STATUSES = ['draft', 'ready-for-review', 'committed', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_TYPES = ['ticket', 'bug', 'research'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

/** The expected change in code lines, comments and docs not counted: XS ≤ 20, S ≤ 100, M ≤ 300, L ≤ 750, XL ≤ 1500, XXL beyond. */
export const TICKET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type TicketSize = (typeof TICKET_SIZES)[number];

/** A task row's status; `paused` and `re-review` are reached only by a row, never by a ticket. */
export const TASK_STATUSES = ['committed', 'in-progress', 'paused', 'in-review', 're-review', 'reviewed', 'delivered', 'abandoned'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * What a row, or a ticket through its row, shows: its status, except that an in-review row of an in-review ticket is `reviewing`. A draft
 * ticket has no row and shows `draft`, and a ticket ready for review shows `ready-for-review`.
 */
export const DISPLAY_STATES = [
  'draft',
  'ready-for-review',
  'committed',
  'in-progress',
  'paused',
  'in-review',
  'reviewing',
  're-review',
  'reviewed',
  'delivered',
  'abandoned',
] as const;
export type DisplayState = (typeof DISPLAY_STATES)[number];

/** The stages of a ticket that crosses into a whitelisted package, in the order a crossing first runs them. */
export const TICKET_STAGES = ['build', 'package-build', 'package-review', 'adapt', 'review'] as const;
export type TicketStageName = (typeof TICKET_STAGES)[number];

/** `waiting` while any question is open, `researching` when none is and the draft is claimed, `resumable` when nobody holds it. */
export const DRAFT_STATES = ['waiting', 'researching', 'resumable'] as const;
export type DraftState = (typeof DRAFT_STATES)[number];

export const JOB_STATES = [
  'launching',
  'preparing',
  'running',
  'waiting-for-answer',
  'interrupted',
  'awaiting-answer',
  'in-customs',
  'gating',
  'merging-main',
  'merging',
  'landing',
  'stopping',
] as const;
export type JobState = (typeof JOB_STATES)[number];

/** Build is what a builder passes to be reviewed, review what a reviewer keeps green, merge what runs after main is merged in. */
export const GATE_PHASES = ['build', 'review', 'merge'] as const;
export type GatePhase = (typeof GATE_PHASES)[number];

/** The roles a pipeline sets, in the order the flow draws their steps. */
export const PIPELINE_AGENT_ROLES = ['productOwner', 'builder', 'reviewer', 'reReviewer', 'conflictReReviewer', 'pipelineAgent', 'assistant'] as const;
export type PipelineAgentRole = (typeof PIPELINE_AGENT_ROLES)[number];

/** The roles set once for the whole forge, also when it holds entities. */
export const FORGE_LEVEL_AGENT_ROLES = ['productOwner', 'pipelineAgent', 'assistant'] as const;
export type ForgeLevelAgentRole = (typeof FORGE_LEVEL_AGENT_ROLES)[number];

/** The roles an entity sets for its own tickets. */
export type EntityAgentRole = Exclude<PipelineAgentRole, ForgeLevelAgentRole>;

/** An app, a package, or the one root entity, which owns every path no other entity owns. */
export const ENTITY_KINDS = ['app', 'package', 'root'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** An entity's stable name, which tickets, jobs and records carry in place of a path. */
export type EntityKey = string;

/** The efforts an agent runs at, lowest first; an effort's meter level is its position plus one. */
export const AGENT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AgentEffort = (typeof AGENT_EFFORTS)[number];

/** The model tiers an agent runs on; the forge serves the choices in `pipelineChoices`. */
export type AgentModel = 'haiku' | 'sonnet' | 'opus' | 'fable';
