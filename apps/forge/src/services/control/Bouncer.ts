/**
 * Which relayed control commands each job role may run, as a pure table over the job record and the command (design section 4.4). The
 * role and the job id come from the Hatch folder's job record, never from the request; an admitted filing comes back stamped with both.
 */
import { TicketAcceptanceUtil }                                      from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import type { Incident }                                             from '../../lib/tracker-model/@types/Incident.ts';
import type { JobRole }                                              from '../../lib/tracker-model/@types/Job.ts';
import type { EntityKey }                                            from '../../lib/tracker-model/@types/Pipeline.ts';
import type { TicketStatus }                                         from '../../lib/tracker-model/@types/Ticket.ts';
import { NeedUtil }                                                  from '../../lib/tracker-model/utils/NeedUtil.ts';
import { TicketIdUtil }                                              from '../../lib/tracker-model/utils/TicketIdUtil.ts';
import type { ControlCommand, ControlCommandKind, ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import type { RoleCommandRefusalReason }                             from '../../shared/@types/RoleCommandRefusalReason.ts';
import { WORKER_FILINGS_PER_JOB }                                    from '../../shared/constants/OverseerLimits.ts';
import { ALLOWED_MOVES_BY_INCIDENT_KIND }                            from './constants/AllowedMovesByIncidentKind.ts';

/**
 * The job record as the policy reads it: its role, its tickets, what it filed so far (by `filedByJob`) and, for an Assistant, what it was
 * delivered.
 */
export interface RelayingJob {
  id:                               string;
  role:                             JobRole | null;
  ticketIds:                        readonly string[];
  filedTickets:                     ReadonlyArray<{ id: string; status: TicketStatus }>;
  deliveredIncidents:               ReadonlyArray<Pick<Incident, 'id' | 'kind' | 'ticketIds' | 'jobId'>>;
  /** The board's tickets in `ready-for-review` or `pending`, whatever job filed them, since a product owner assigns the entity of each. */
  ticketIdsReadyForReviewOrPending: readonly string[];
  /** For a pipeline agent: the open setup record whose agent this job is; null when it serves none. */
  setupId:                          string | null;
  /** For a pipeline agent of one entity's part of that record: the entity; absent for the forge's session. */
  setupEntity?:                     EntityKey;
  /** The entity whose stage the job runs; absent on a forge without entities. */
  entity?:                          EntityKey;
}

function incidentListsTicket(incident: Pick<Incident, 'ticketIds'>, reference: unknown): boolean {
  const ticketId = typeof reference === 'string' ? TicketIdUtil.parseTicketReference(reference) : null;
  return ticketId !== null && incident.ticketIds.includes(ticketId);
}

function moveTargetsTheIncidentsOwn(incident: Pick<Incident, 'ticketIds' | 'jobId'>, command: ControlCommand): boolean {
  if (command.kind === 'job-fresh' || command.kind === 'job-message') return command.jobId === incident.jobId;
  return command.kind !== 'ticket-park' || incidentListsTicket(incident, command.ticketReference);
}

/**
 * Whether the incident's kind allows the move, and a `job fresh`, `job message` or `ticket park` targets the incident's own job or ticket;
 * a `job fresh` needs a waiting job.
 */
function incidentMoveVerdictOf(incident: Pick<Incident, 'kind' | 'ticketIds' | 'jobId'>, command: ControlCommand): RoleCommandRefusalReason | null {
  const move = ALLOWED_MOVES_BY_INCIDENT_KIND[incident.kind].find((allowed) => allowed === command.kind);
  if (move === undefined || (move === 'job-fresh' && incident.jobId === null)) return 'incident-move-not-allowed';
  return moveTargetsTheIncidentsOwn(incident, command) ? null : 'incident-target-mismatch';
}

export type BouncerVerdict =
  | { verdict: 'admitted'; command: ControlCommand }
  | { verdict: 'refused'; reason: RoleCommandRefusalReason };

const WORKER_ROLES: ReadonlySet<JobRole> = new Set(['builder', 'reviewer', 're-reviewer', 'conflict-re-reviewer']);

/** Kinds the product owner may run on any ticket; its `intake-close` and `intake-title` act on its own job, stamped from the Hatch folder. */
const PRODUCT_OWNER_KINDS: ReadonlySet<ControlCommandKind> = new Set([
  'ticket-depends',
  'epic-add',
  'draft-open',
  'draft-claim',
  'draft-release',
  'draft-note',
  'draft-ask',
  'draft-answer',
  'draft-drop',
  'draft-close',
  'draft-abandon',
  'intake-close',
  'intake-title',
]);

const PRODUCT_OWNER_OWN_DRAFT_KINDS: ReadonlySet<ControlCommandKind> = new Set(['ticket-edit', 'ticket-priority', 'ticket-network', 'ticket-epic', 'ticket-abandon']);

/**
 * The pipeline agent's moves on the setup record it serves, stamped with its job and that record. Every ticket verb, a gate profile and a
 * pipeline check are refused: only User starts a run (owner answer Q15).
 */
const PIPELINE_AGENT_KINDS: ReadonlySet<ControlCommandKind> = new Set([
  'pipeline-finding-record',
  'pipeline-question-ask',
  'pipeline-constitution-draft',
  'pipeline-draft-propose',
  'pipeline-step-ready',
]);

const FIELDS_ONLY_THE_OVERSEER_DECIDES = ['jobId', 'role', 'admission'] as const;

/** Their `jobId` is the job the move acts on, not the sender's identity. */
const JOB_TARGETING_KINDS: ReadonlySet<ControlCommandKind> = new Set(['job-fresh', 'job-message', 'gate-retry']);

function refused(reason: RoleCommandRefusalReason): BouncerVerdict {
  return { verdict: 'refused', reason };
}

function fieldOf(command: ControlCommand, field: string): unknown {
  return Object.hasOwn(command, field) ? (command as unknown as Record<string, unknown>)[field] : undefined;
}

/** A worker's one filing is a low finding: only `--priority low`, `--type`, `--size`, the body and the two ticket links, and no entity. */
function workerFilingIsShaped(command: ControlCommandOf<'ticket-add'>): boolean {
  return command.priority === 'low'
    && command.model === undefined
    && command.effort === undefined
    && command.group === undefined
    && command.dependsOn.length === 0
    && command.epics.length === 0
    && command.network.length === 0
    && command.entity === undefined;
}

/** Builders, reviewers and product owners ask User questions, so each may note the options of its own next question. */
function questionOptionsOfOwnJob(job: RelayingJob, command: ControlCommandOf<'question-options'>): BouncerVerdict {
  return { verdict: 'admitted', command: { ...command, jobId: job.id } };
}

/**
 * Only the builder of an entity's stage declares a need, and only a complete one: what its ticket needs to be readied. The fields are read
 * as untrusted JSON, so one that is no text is an incomplete need.
 */
function needVerdictOf(job: RelayingJob, command: ControlCommandOf<'need-declare'>): BouncerVerdict {
  if (job.role !== 'builder' || job.entity === undefined) return refused('need-outside-an-entity');
  const fields: readonly unknown[] = [command.entity, command.title, command.bodyText];
  if (!fields.every((field) => typeof field === 'string')) return refused('need-incomplete');
  const declaration = { entity: command.entity, title: command.title, body: command.bodyText };
  if (NeedUtil.gapsOf(declaration, TicketAcceptanceUtil.readinessGapsOf).length > 0) return refused('need-incomplete');
  return { verdict: 'admitted', command: { ...command, jobId: job.id } };
}

function workerVerdictOf(job: RelayingJob, command: ControlCommand): BouncerVerdict {
  if (command.kind === 'question-options') return questionOptionsOfOwnJob(job, command);
  if (command.kind === 'need-declare') return needVerdictOf(job, command);
  if (command.kind !== 'ticket-add') return refused('command-not-allowed-for-role');
  if (!workerFilingIsShaped(command)) return refused('worker-filing-flag');
  if (job.filedTickets.length >= WORKER_FILINGS_PER_JOB) return refused('worker-filing-limit');
  return { verdict: 'admitted', command: { ...command, admission: { filedByJob: job.id, finderTicketIds: [...job.ticketIds] } } };
}

function namedTicketIdOf(command: ControlCommand): string | null {
  const ticketReference = fieldOf(command, 'ticketReference');
  return typeof ticketReference === 'string' ? TicketIdUtil.parseTicketReference(ticketReference) : null;
}

function isOwnDraft(job: RelayingJob, ticketId: string | null): boolean {
  return job.filedTickets.some((filed) => filed.id === ticketId && filed.status === 'draft');
}

/**
 * Its own draft at intake, and any ticket in `ready-for-review` or `pending` after its close or a first Apply; stamped with its job, so the
 * log names the product owner.
 */
function entityAssignmentVerdictOf(job: RelayingJob, command: ControlCommandOf<'ticket-entity'>): BouncerVerdict {
  const ticketId = namedTicketIdOf(command);
  const reaches  = isOwnDraft(job, ticketId) || (ticketId !== null && job.ticketIdsReadyForReviewOrPending.includes(ticketId));
  return reaches ? { verdict: 'admitted', command: { ...command, jobId: job.id } } : refused('not-own-draft-or-unclaimed-ticket');
}

function productOwnerVerdictOf(job: RelayingJob, command: ControlCommand): BouncerVerdict {
  if (command.kind === 'ticket-add') return { verdict: 'admitted', command: { ...command, admission: { filedByJob: job.id } } };
  if (command.kind === 'intake-close' || command.kind === 'intake-title') return { verdict: 'admitted', command: { ...command, jobId: job.id } };
  if (command.kind === 'question-options') return questionOptionsOfOwnJob(job, command);
  if (command.kind === 'ticket-entity') return entityAssignmentVerdictOf(job, command);
  if (PRODUCT_OWNER_KINDS.has(command.kind)) return { verdict: 'admitted', command };
  if (!PRODUCT_OWNER_OWN_DRAFT_KINDS.has(command.kind)) return refused('command-not-allowed-for-role');
  return isOwnDraft(job, namedTicketIdOf(command)) ? { verdict: 'admitted', command } : refused('not-own-draft');
}

function pipelineAgentVerdictOf(job: RelayingJob, command: ControlCommand): BouncerVerdict {
  if (command.kind === 'question-options') return questionOptionsOfOwnJob(job, command);
  if (!PIPELINE_AGENT_KINDS.has(command.kind)) return refused('command-not-allowed-for-role');
  if (Object.hasOwn(command, 'setupId') || Object.hasOwn(command, 'entity')) return refused('hatch-identity-mismatch');
  if (job.setupId === null) return refused('job-serves-no-setup');
  const entity = job.setupEntity === undefined ? {} : { entity: job.setupEntity };
  return {
    verdict: 'admitted',
    command: {
      ...command, jobId: job.id, setupId: job.setupId, ...entity
    } as ControlCommand
  };
}

function assistantVerdictOf(job: RelayingJob, command: ControlCommand): BouncerVerdict {
  const incidentId = fieldOf(command, 'incidentId');
  const incident   = job.deliveredIncidents.find((delivered) => delivered.id === incidentId);
  if (incident === undefined) return refused('incident-move-not-allowed');
  const reason = incidentMoveVerdictOf(incident, command);
  return reason === null ? { verdict: 'admitted', command } : refused(reason);
}

/** A job with no role runs no agent, so it relays nothing. */
function verdictOf(job: RelayingJob, command: ControlCommand): BouncerVerdict {
  const forgedField = FIELDS_ONLY_THE_OVERSEER_DECIDES.some((field) => Object.hasOwn(command, field) && !(field === 'jobId' && JOB_TARGETING_KINDS.has(command.kind)));
  if (forgedField) return refused('hatch-identity-mismatch');
  if (job.role === null) return refused('command-not-allowed-for-role');
  if (WORKER_ROLES.has(job.role)) return workerVerdictOf(job, command);
  if (job.role === 'product-owner') return productOwnerVerdictOf(job, command);
  if (job.role === 'assistant') return assistantVerdictOf(job, command);
  if (job.role === 'pipeline-agent') return pipelineAgentVerdictOf(job, command);
  return refused('command-not-allowed-for-role');
}

export const Bouncer = Object.freeze({ verdictOf, incidentMoveVerdictOf });
