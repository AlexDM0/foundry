/**
 * The tickets Hephaestus files for the needs a build job of an entity declared (strategy section 4.3), in the hold that ends the job
 * `needs-declared`, and what the stage that declared them is told when it runs again once they are settled.
 */
import { TicketAcceptanceUtil }                from '../../adapters/tickets/utils/TicketAcceptanceUtil.ts';
import type { DecisionKind }                   from '../../lib/tracker-model/@types/Decision.ts';
import type { Job }                            from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                      from '../../lib/tracker-model/@types/LogRecord.ts';
import type { DeclaredNeed }                   from '../../lib/tracker-model/@types/Need.ts';
import type { EntityKey, Pipeline }            from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording } from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { TicketStatus }                   from '../../lib/tracker-model/@types/Ticket.ts';
import type { Board }                          from '../../lib/tracker-model/Board.ts';
import { EntityOwnershipUtil }                 from '../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { TicketDependencyUtil }                from '../../lib/tracker-model/utils/TicketDependencyUtil.ts';
import type { BoardTransaction }               from '../tracker/BoardTransaction.ts';

type DecisionWordingOf = (draft: DecisionDraft) => DecisionWording;

/** What the job's needs became: `filedNeedCount` is zero when the job kept none, so its `needs-declared` report declared nothing. */
export interface NeedsFiled {
  logged:         LogRecord[];
  filedNeedCount: number;
}

/** One need the declaring stage asked for, and the ticket filed for it; `null` for a need User settled as a decision. */
export interface SettledNeed {
  entity:   EntityKey;
  title:    string;
  ticketId: string | null;
  status:   TicketStatus | null;
}

/** What a build is told when it runs the stage again after the stage declared needs that are now settled. */
export interface NeedsSettledFacts {
  needs:          SettledNeed[];
  /** The branch the build merges in first: the main line, where a delivered need's change is. */
  mainLine:       string;
  /** The build carries on the session that declared the needs; else it is a fresh session on the same branch. */
  resumesSession: boolean;
}

/** A need for the root entity is a decision for User when that entity has no gate to check the change with. */
function rootEntityHasNoGates(pipeline: Readonly<Pipeline> | null, entityKey: EntityKey): boolean {
  const entities = pipeline?.entities;
  const entity = entities !== undefined && Object.hasOwn(entities, entityKey) ? entities[entityKey] : undefined;
  return entity?.kind === 'root' && entity.gates.length === 0;
}

function openNeedDecision(
  change: BoardTransaction, kind: DecisionKind, ticketIds: readonly string[], context: string, decisionWordingOf: DecisionWordingOf
): readonly LogRecord[] {
  const draft: DecisionDraft = {
    kind, ticketIds, jobId: null, subject: { need: context }
  };
  return change.board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, questions: decisionWordingOf(draft).questions, context
  }, change.at).logged;
}

/**
 * The declaring entity would consume the need's entity, which already consumes it, directly or through another: the need would close a circle
 * in the entities' `dependsOn`. Every entity consumes the root entity, so any need of the root entity's own job closes one.
 */
function needClosesAnEntityCircle(pipeline: Readonly<Pipeline> | null, declaringEntityKey: EntityKey | undefined, needEntityKey: EntityKey): boolean {
  const entities = pipeline?.entities;
  if (entities === undefined || declaringEntityKey === undefined) return false;
  return EntityOwnershipUtil.dependentsOf(entities, [declaringEntityKey]).includes(needEntityKey);
}

/** Refused as `ticket depends` refuses a circle; a ticket filed fresh waits on nothing, so it guards the rule rather than meets it. */
function dependencyClosesACircle(board: Board, waitingTicketId: string, needTicketId: string): boolean {
  const dependsOnById = new Map(board.tickets().map((ticket) => [ticket.frontmatter.id, ticket.frontmatter.dependsOn ?? []]));
  const dependsOn = [...dependsOnById.get(waitingTicketId) ?? [], needTicketId];
  return TicketDependencyUtil.dependencyLoopFrom(waitingTicketId, dependsOn, dependsOnById) !== null;
}

/** The job a need is filed by: the build that declared it, or the job whose package change User turned into a need. */
export type DeclaringJob = Readonly<Pick<Job, 'id' | 'entity'>>;

/** A need as its ticket is filed: its entity, title and body, and the tickets that wait on it. */
export type NeedToFile = Readonly<Pick<DeclaredNeed, 'entity' | 'title' | 'body' | 'ticketIds'>>;

/**
 * The need's ticket is the need's entity's, filed by the declaring job and submitted at once: `committed` with ticket review off, else
 * `ready-for-review`. Every ticket of the job waits on it, and it waits on none of them.
 */
function fileNeed(change: BoardTransaction, job: DeclaringJob, need: NeedToFile, decisionWordingOf: DecisionWordingOf): LogRecord[] {
  const { board, at } = change;
  const waitingTicketIds = need.ticketIds.filter((ticketId) => board.tickets().some((ticket) => ticket.frontmatter.id === ticketId));
  const declared = waitingTicketIds.flatMap((ticketId) => board.recordNeedDeclared(ticketId, { entity: need.entity, title: need.title, byJob: job.id }, at).logged);
  const needContext = `${need.entity}: ${need.title}`;
  if (rootEntityHasNoGates(board.pipeline(), need.entity)) {
    return [...declared, ...openNeedDecision(change, 'need-for-root', waitingTicketIds, needContext, decisionWordingOf)];
  }
  if (needClosesAnEntityCircle(board.pipeline(), job.entity, need.entity)) {
    return [...declared, ...openNeedDecision(change, 'need-closes-circle', waitingTicketIds, needContext, decisionWordingOf)];
  }
  const ticket = change.records.newTicket({
    title: need.title, type: 'ticket', bodyFor: () => need.body, at
  });
  ticket.frontmatter.entity     = need.entity;
  ticket.frontmatter.filedByJob = job.id;
  const needTicketId = ticket.frontmatter.id;
  const filed        = board.fileTicket(ticket, at).logged;
  const submitted    = board.submitDraftTickets([needTicketId], TicketAcceptanceUtil.readinessGapsOf, at).logged;
  const circular     = waitingTicketIds.filter((ticketId) => dependencyClosesACircle(board, ticketId, needTicketId));
  const linked       = waitingTicketIds
    .filter((ticketId) => !circular.includes(ticketId))
    .flatMap((ticketId) => board.addTicketDependencies(ticketId, [needTicketId], at).logged);
  const circleDecision = circular.length === 0 ? [] : openNeedDecision(change, 'need-closes-circle', circular, `${needContext} (#${needTicketId})`, decisionWordingOf);
  return [...declared, ...filed, ...submitted, ...linked, ...circleDecision];
}

/** In the hold that ends the job: every need it kept is taken off the board and filed, in declaring order. */
function fileNeedsOf(change: BoardTransaction, job: Readonly<Job>, decisionWordingOf: DecisionWordingOf): NeedsFiled {
  const needs = change.board.takeNeedsOf(job.id);
  return { logged: needs.flatMap((need) => fileNeed(change, job, need, decisionWordingOf)), filedNeedCount: needs.length };
}

/**
 * A crossing ticket's change of a package that User turned into a need: filed as a ticket of the package by the job that last
 * worked on the package change, which the crossing ticket waits on, as a need its build declared.
 */
function filePackageChangeNeed(
  change: BoardTransaction, declaringJob: DeclaringJob, need: NeedToFile, decisionWordingOf: DecisionWordingOf
): LogRecord[] {
  return fileNeed(change, declaringJob, need, decisionWordingOf);
}

/**
 * The job whose needs the ticket waited on: its newest ended build job when it ended `needs-declared`, or the job that a package change
 * User turned into a need was filed by after the ticket's newest ended build. A replaced session in between is the same stage
 * taken over.
 */
function declaringJobIdOf(logRecords: readonly LogRecord[], ticketId: string): string | null {
  const buildJobIds = new Set<string>();
  let declaringJobId: string | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.fields.kind === 'build' && record.fields.ticketIds.includes(ticketId)) buildJobIds.add(record.jobId);
    if (record.kind === 'need-declared' && record.ticketId === ticketId) declaringJobId = record.fields.byJob;
    if (record.kind === 'job-ended' && buildJobIds.has(record.jobId) && record.fields.outcome !== 'replaced') {
      declaringJobId = record.fields.outcome === 'needs-declared' ? record.jobId : null;
    }
  }
  return declaringJobId;
}

/**
 * `null` for every job but a build whose ticket's last build declared needs, or whose package change became a need since; each
 * need as its `need-declared` record logged it.
 */
function needsSettledOf(board: Board, job: Readonly<Job>, launch: Pick<NeedsSettledFacts, 'mainLine' | 'resumesSession'>): NeedsSettledFacts | null {
  const [ticketId] = job.ticketIds;
  if (job.kind !== 'build' || ticketId === undefined) return null;
  const logRecords = board.logRecordsSoFar();
  const declaringJobId = declaringJobIdOf(logRecords, ticketId);
  if (declaringJobId === null) return null;
  const needs = logRecords.flatMap((record): SettledNeed[] => {
    if (record.kind !== 'need-declared' || record.ticketId !== ticketId || record.fields.byJob !== declaringJobId) return [];
    const { entity, title } = record.fields;
    const needTicket = board.tickets().find(({ frontmatter }) => frontmatter.filedByJob === declaringJobId && frontmatter.entity === entity && frontmatter.title === title);
    return [{
      entity, title, ticketId: needTicket?.frontmatter.id ?? null, status: needTicket?.frontmatter.status ?? null
    }];
  });
  return { needs, mainLine: launch.mainLine, resumesSession: launch.resumesSession };
}

export const NeedTickets = Object.freeze({ fileNeedsOf, filePackageChangeNeed, needsSettledOf });
