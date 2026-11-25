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
export const PIPELINE_AGENT_ROLES = [
  'productOwner',
  'specAgent',
  'planAgent',
  'builder',
  'reviewer',
  'reReviewer',
  'conflictReReviewer',
  'pipelineAgent',
  'assistant',
] as const;
export type PipelineAgentRole = (typeof PIPELINE_AGENT_ROLES)[number];

/** The roles set once for the whole forge, also when it holds entities. */
export const FORGE_LEVEL_AGENT_ROLES = ['productOwner', 'specAgent', 'planAgent', 'pipelineAgent', 'assistant'] as const;
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

/** How a ticket is written: `one-ticket` is the product owner's ticket body; `spec-then-plan` adds a spec and a plan, each with its agent. */
export const TICKET_WRITING_ROUTES = ['one-ticket', 'spec-then-plan'] as const;
export type TicketWritingRoute = (typeof TICKET_WRITING_ROUTES)[number];

/** The documents of a ticket in the spec-then-plan route, in pipeline order: where two disagree, the later one wins. */
export const TICKET_DOCUMENT_KINDS = ['spec', 'plan'] as const;
export type TicketDocumentKind = (typeof TICKET_DOCUMENT_KINDS)[number];

/** Which version of a document a builder or reviewer reads: the approved head, the version a person approved, or none. */
export const DOCUMENT_READING_RULES = ['always', 'if-person-approved', 'never'] as const;
export type DocumentReadingRule = (typeof DOCUMENT_READING_RULES)[number];

/** Whether a document agent's edit waits for the user's Apply or applies on arrival. */
export const PROPOSAL_MODES = ['ask-first', 'auto-apply'] as const;
export type ProposalMode = (typeof PROPOSAL_MODES)[number];

/**
 * Where a ticket being written stands, from forge 4.4: the spec-then-plan route's stages, then a ticket that waits for its review on either
 * route.
 */
export const DRAFT_STAGES = ['spec', 'spec-review', 'plan', 'plan-review', 'ticket-review'] as const;
export type DraftStage = (typeof DRAFT_STAGES)[number];

/** What of a draft's stage waits on the user, from forge 4.4: an agent's question, an agent's edit that waits for Apply, or the approval. */
export const DRAFT_WAITS = ['answer', 'proposal', 'approval'] as const;
export type DraftWait = (typeof DRAFT_WAITS)[number];

/** Where a document stands: `out-of-date` is a plan approved on a spec version that is no longer the spec's approved head. */
export const DOCUMENT_STANDINGS = ['unwritten', 'drafting', 'awaiting-review', 'approved', 'changed-since-approval', 'out-of-date'] as const;
export type DocumentStanding = (typeof DOCUMENT_STANDINGS)[number];

/** A message to a document agent: `queued` until Hephaestus writes it to the session; only a queued one can be withdrawn. */
export const DOCUMENT_MESSAGE_STATES = ['queued', 'sent', 'applied', 'withdrawn'] as const;
export type DocumentMessageState = (typeof DOCUMENT_MESSAGE_STATES)[number];

/** An agent's proposed edit: `conflicted` when its original lines no longer stand at the head. */
export const DOCUMENT_PROPOSAL_STATES = ['proposed', 'applied', 'discarded', 'conflicted'] as const;
export type DocumentProposalState = (typeof DOCUMENT_PROPOSAL_STATES)[number];

/** What an effect reading says a plan does to a path of the main line's tree. */
export const EFFECT_CHANGES = ['adds', 'changes', 'removes', 'unresolved'] as const;
export type EffectChange = (typeof EFFECT_CHANGES)[number];
