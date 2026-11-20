/**
 * What the Overseer does with User's answer to an entity decision, at the start of its next pass, before the Playbook launches anything:
 * `work-in-other-entity` moves the ticket to the entity that owns its work or abandons it (E15); `package-refused` drops the package change,
 * turns it into a need, or abandons the ticket (E22); `whitelist-removed-mid-crossing` finishes the crossing under the old whitelist or turns
 * the package change into a need (E19); `dependent-broken` files a fix ticket of the dependent in the ticket's group, or abandons the ticket
 * (E26). It also opens `whitelist-removed-mid-crossing` for a crossing ticket whose stored crossing holds a
 * package its home's whitelist no longer names, before its next stage launches.
 *
 * An answer is acted on once: anything the act logs about the ticket, or a launch of it, shows it was. An answer that names no option acts
 * on nothing, so the ticket runs again as it stood.
 */
import { GitProcess }                                                                 from '../../lib/git/GitProcess.ts';
import type { Decision }                                                              from '../../lib/tracker-model/@types/Decision.ts';
import type { LogRecord }                                                             from '../../lib/tracker-model/@types/LogRecord.ts';
import type { EntityKey }                                                             from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording }                                        from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                                                 from '../../lib/tracker-model/Board.ts';
import { DECISION_KINDS_ACTED_ON, type DecisionKindActedOn, ENTITY_DECISION_ANSWERS } from '../../lib/tracker-model/constants/EntityDecisionAnswers.ts';
import { TICKET_STATUSES_THAT_CLOSE_A_TICKET }                                        from '../../lib/tracker-model/constants/Statuses.ts';
import type { BranchNames }                                                           from '../../shared/BranchNames.ts';
import type { BoardTransaction }                                                      from '../tracker/BoardTransaction.ts';
import { CrossingStages }                                                             from './CrossingStages.ts';
import { type DependentFixContext, DependentFixTickets }                              from './DependentFixTickets.ts';
import { NeedTickets }                                                                from './NeedTickets.ts';

/** Why a crossing ticket's change of a package becomes a need. */
export type PackageNeedCause = 'package-refused' | 'whitelist-removed';

/** What the need's ticket that carries a crossing ticket's package change is worded from. */
export interface PackageNeedFacts {
  cause:         PackageNeedCause;
  ticketId:      string;
  ticketBranch:  string;
  homeEntity:    EntityKey;
  packageEntity: EntityKey;
  /** The package build's reason, for a refused change; `null` for a package that left the whitelist. */
  refusedReason: string | null;
  /** The ticket's change of the package's homes past its target; empty when git could not tell. */
  proposal:      string;
}

export interface PackageNeedWording {
  title: string;
  body:  string;
}

export interface EntityDecisionAnswerContext {
  decisionWordingOf:     (draft: DecisionDraft) => DecisionWording;
  packageNeedWordingOf:  (facts: PackageNeedFacts) => PackageNeedWording;
  dependentFixWordingOf: DependentFixContext['dependentFixWordingOf'];
  branchNames:           Pick<BranchNames, 'ticketBranchOf' | 'groupTargetPrefix'>;
  mainLine:              string;
  repositoryRoot:        string;
}

/** User's answer to an entity decision the Overseer has not acted on yet. */
export interface AnswerToActOn {
  decisionId: string;
  kind:       DecisionKindActedOn;
  ticketId:   string;
  answer:     string;
}

/**
 * What the ticket's act logs, or its launch: any of them after the answer shows the answer was acted on. Not `ticket-grouped`, which User's
 * own `ticket group` logs too, so grouping the ticket before the next pass never drops the answer.
 */
const RECORDS_THAT_ACT_ON_AN_ANSWER: readonly LogRecord['kind'][] = [
  'entity-assigned', 'stage-started', 'seal-lifted', 'ticket-abandoned', 'dependent-fix-filed'
];

function decisionKindIsActedOn(kind: Decision['kind']): kind is DecisionKindActedOn {
  return (DECISION_KINDS_ACTED_ON as readonly string[]).includes(kind);
}

function recordConcernsTicket(record: LogRecord, ticketId: string): boolean {
  if (record.kind === 'job-launched') return record.fields.ticketIds.includes(ticketId);
  return RECORDS_THAT_ACT_ON_AN_ANSWER.includes(record.kind) && 'ticketId' in record && record.ticketId === ticketId;
}

/** Each answer of an entity decision no act or launch of its ticket followed, oldest first; a closed ticket's answer needs none. */
function answersToActOnOf(board: Board): AnswerToActOn[] {
  const openedById = new Map<string, { kind: DecisionKindActedOn; ticketId: string }>();
  let waiting: AnswerToActOn[] = [];
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'tracker-cleared') waiting = [];
    if (record.kind === 'decision-opened' && decisionKindIsActedOn(record.fields.kind) && record.fields.ticketIds[0] !== undefined) {
      openedById.set(record.decisionId, { kind: record.fields.kind, ticketId: record.fields.ticketIds[0] });
    }
    waiting = waiting.filter((answer) => !recordConcernsTicket(record, answer.ticketId));
    const opened = record.kind === 'decision-answered' ? openedById.get(record.decisionId) : undefined;
    if (record.kind === 'decision-answered' && opened !== undefined) {
      const answer = Object.values(record.fields.answer)[0]?.trim() ?? '';
      waiting.push({ decisionId: record.decisionId, ...opened, answer });
    }
  }
  const closedStatuses: readonly string[] = TICKET_STATUSES_THAT_CLOSE_A_TICKET;
  return waiting.filter(({ ticketId }) => {
    const status = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.status;
    return status !== undefined && !closedStatuses.includes(status);
  });
}

/** The reason an act logs: the decision it answers, as stored values. */
function reasonOf(answer: AnswerToActOn): string {
  return `${answer.kind} ${answer.decisionId}`;
}

function abandon(board: Board, answer: AnswerToActOn, at: string): void {
  board.moveTicket(answer.ticketId, 'abandoned', { checksLegality: true, reason: reasonOf(answer) }, at);
}

function homeEntityOf(board: Board, ticketId: string): EntityKey | undefined {
  return board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.entity;
}

/**
 * E15: the ticket moves to the entity the answer names, logged as User's assignment with the decision as its reason, its row's stage and
 * seals cleared, so its next build is stage 1 of the new entity on a fresh branch, never back through ticket review.
 */
function actOnWorkInOtherEntity(board: Board, answer: AnswerToActOn, at: string): void {
  if (answer.answer === ENTITY_DECISION_ANSWERS.abandon) {
    abandon(board, answer, at);
    return;
  }
  if (!answer.answer.startsWith(ENTITY_DECISION_ANSWERS.moveToEntityPrefix)) return;
  const entityKey = answer.answer.slice(ENTITY_DECISION_ANSWERS.moveToEntityPrefix.length).trim();
  const entities = board.pipeline()?.entities ?? {};
  if (!Object.hasOwn(entities, entityKey) || homeEntityOf(board, answer.ticketId) === entityKey) return;
  board.setTicketEntity(answer.ticketId, { entity: entityKey, reason: reasonOf(answer), by: 'user' }, at, { allowsPastPending: true });
  board.clearTicketStage(answer.ticketId);
}

/** The ticket's change of the package's homes past its target, as git shows it; empty when git cannot tell. */
function proposalOf(board: Board, context: EntityDecisionAnswerContext, ticketId: string, packageEntity: EntityKey): string {
  const group = board.tickets().find((ticket) => ticket.frontmatter.id === ticketId)?.frontmatter.group;
  const target = group === undefined ? context.mainLine : `${context.branchNames.groupTargetPrefix}${group}`;
  const pathspecs = CrossingStages.sealPathspecsOf(board.pipeline(), packageEntity);
  const run = GitProcess.run(context.repositoryRoot, ['diff', '--no-ext-diff', `${target}...${context.branchNames.ticketBranchOf(ticketId)}`, '--', ...pathspecs]);
  return GitProcess.succeeded(run) ? run.standardOutput : '';
}

/** The newest job launched for the ticket: the job that last worked on its crossing. */
function newestJobIdOf(board: Board, ticketId: string): string | undefined {
  const newestLaunch = board.logRecordsSoFar().findLast((record) => record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId));
  return newestLaunch?.kind === 'job-launched' ? newestLaunch.jobId : undefined;
}

interface PackageChange {
  ticketId:       string;
  homeEntity:     EntityKey;
  packageEntity:  EntityKey;
  declaringJobId: string;
  refusedReason:  string | null;
}

/** The package change becomes a ticket of the package, which the crossing ticket waits on as on a need its build declared. */
function fileThePackageChangeAsANeed(change: BoardTransaction, context: EntityDecisionAnswerContext, packageChange: PackageChange): void {
  const { board } = change;
  const {
    ticketId, homeEntity, packageEntity, declaringJobId, refusedReason
  } = packageChange;
  const wording = context.packageNeedWordingOf({
    cause:        refusedReason === null ? 'whitelist-removed' : 'package-refused',
    ticketId,
    ticketBranch: context.branchNames.ticketBranchOf(ticketId),
    homeEntity,
    packageEntity,
    refusedReason,
    proposal:     proposalOf(board, context, ticketId, packageEntity),
  });
  NeedTickets.filePackageChangeNeed(change, { id: declaringJobId, entity: homeEntity }, {
    entity: packageEntity, title: wording.title, body: wording.body, ticketIds: [ticketId]
  }, context.decisionWordingOf);
}

/**
 * E22: dropped or turned into a need, the refused package change goes back to stage 1 of the home, which is told the reason and may no
 * longer write in the package; a need also files the change as a ticket of the package that the crossing ticket waits on.
 */
function actOnPackageRefused(change: BoardTransaction, context: EntityDecisionAnswerContext, answer: AnswerToActOn): void {
  const { board, at } = change;
  if (answer.answer === ENTITY_DECISION_ANSWERS.abandon) {
    abandon(board, answer, at);
    return;
  }
  const turnsIntoANeed = answer.answer === ENTITY_DECISION_ANSWERS.turnItIntoANeed;
  if (!turnsIntoANeed && answer.answer !== ENTITY_DECISION_ANSWERS.dropThePackageChange) return;
  const stage = board.ticketStageOf(answer.ticketId);
  const homeEntity = homeEntityOf(board, answer.ticketId);
  const refusedJob = CrossingStages.refusedPackageJobsOf(board.logRecordsSoFar(), answer.ticketId).at(-1);
  if (stage?.name !== 'package-build' || homeEntity === undefined || refusedJob === undefined || refusedJob.entity !== stage.entity) return;
  board.moveTicketBackToBuild(answer.ticketId, homeEntity, stage.entity, at);
  if (!turnsIntoANeed) return;
  const [refused] = CrossingStages.refusedPackageChangesOf(change.workspace.trackerDirectory, board.logRecordsSoFar(), answer.ticketId)
    .filter(({ entity }) => entity === stage.entity);
  fileThePackageChangeAsANeed(change, context, {
    ticketId: answer.ticketId, homeEntity, packageEntity: stage.entity, declaringJobId: refusedJob.jobId, refusedReason: refused?.refusedReason ?? ''
  });
}

/**
 * E19: finishing under the old whitelist needs no act, since the crossing reads the answer; turning the package change into a need takes the
 * removed packages out of the crossing, their seals lifted, the ticket back in progress at stage 1, and files each change as a need.
 */
function actOnWhitelistRemoved(change: BoardTransaction, context: EntityDecisionAnswerContext, answer: AnswerToActOn): void {
  const { board, at } = change;
  if (answer.answer !== ENTITY_DECISION_ANSWERS.turnThePackageChangeIntoANeed) return;
  const homeEntity = homeEntityOf(board, answer.ticketId);
  const declaringJobId = newestJobIdOf(board, answer.ticketId);
  if (homeEntity === undefined || declaringJobId === undefined) return;
  const removedPackages = CrossingStages.packagesRemovedMidCrossingOf(board, answer.ticketId, homeEntity);
  if (removedPackages.length === 0) return;
  const status = board.tickets().find((ticket) => ticket.frontmatter.id === answer.ticketId)?.frontmatter.status;
  if (status === 'in-review') board.moveTicket(answer.ticketId, 'in-progress', { checksLegality: true }, at);
  for (const packageEntity of removedPackages) {
    board.moveTicketBackToBuild(answer.ticketId, homeEntity, packageEntity, at);
    fileThePackageChangeAsANeed(change, context, {
      ticketId: answer.ticketId, homeEntity, packageEntity, declaringJobId, refusedReason: null
    });
  }
}

/**
 * E26: the dependent's fix ticket goes into the ticket's group, waiting on it, and the group's release lands both; the ticket's next package
 * build leaves out that dependent's gates, which run at the release. Abandoning abandons the ticket.
 */
function actOnDependentBroken(change: BoardTransaction, context: EntityDecisionAnswerContext, answer: AnswerToActOn): void {
  if (answer.answer === ENTITY_DECISION_ANSWERS.abandon) {
    abandon(change.board, answer, change.at);
    return;
  }
  if (!answer.answer.startsWith(ENTITY_DECISION_ANSWERS.fileAFixTicketForPrefix)) return;
  const dependentEntity = answer.answer.slice(ENTITY_DECISION_ANSWERS.fileAFixTicketForPrefix.length).trim();
  if (!Object.hasOwn(change.board.pipeline()?.entities ?? {}, dependentEntity)) return;
  const fixContext = { dependentFixWordingOf: context.dependentFixWordingOf, ticketBranchOf: context.branchNames.ticketBranchOf };
  DependentFixTickets.fileFixTicket(change, fixContext, { ticketId: answer.ticketId, dependentEntity });
}

/** Acts on every answer that waits for it, oldest first, in the hold before the Playbook, so the same pass launches what it freed. */
function actOnAnswers(change: BoardTransaction, context: EntityDecisionAnswerContext): void {
  if (change.board.pipeline()?.entities === undefined) return;
  for (const answer of answersToActOnOf(change.board)) {
    if (answer.kind === 'work-in-other-entity') actOnWorkInOtherEntity(change.board, answer, change.at);
    if (answer.kind === 'package-refused') actOnPackageRefused(change, context, answer);
    if (answer.kind === 'whitelist-removed-mid-crossing') actOnWhitelistRemoved(change, context, answer);
    if (answer.kind === 'dependent-broken') actOnDependentBroken(change, context, answer);
  }
}

const WHITELIST_REMOVED_DECISION = 'whitelist-removed-mid-crossing';

/**
 * Before a crossing ticket's next stage launches: a package of its stored crossing that its home's whitelist no longer names opens
 * `whitelist-removed-mid-crossing`, naming the ticket and the package, which holds the ticket until User answers (E19). A ticket with a job
 * on the board waits for the job to end, and one already holding the decision opens no second.
 */
function openWhitelistRemovedDecisions(board: Board, decisionWordingOf: EntityDecisionAnswerContext['decisionWordingOf'], at: string): void {
  if (board.pipeline()?.entities === undefined) return;
  const closedStatuses: readonly string[] = TICKET_STATUSES_THAT_CLOSE_A_TICKET;
  for (const { frontmatter } of board.tickets()) {
    const { id: ticketId, entity: homeEntity, status } = frontmatter;
    if (homeEntity === undefined || closedStatuses.includes(status) || board.jobs().some((job) => job.ticketIds.includes(ticketId))) continue;
    if (board.decisions().some((decision) => decision.kind === WHITELIST_REMOVED_DECISION && decision.ticketIds.includes(ticketId))) continue;
    const removedPackages = CrossingStages.packagesRemovedMidCrossingOf(board, ticketId, homeEntity);
    const [packageEntity] = removedPackages;
    if (packageEntity === undefined) continue;
    const draft: DecisionDraft = {
      kind: WHITELIST_REMOVED_DECISION, ticketIds: [ticketId], jobId: null, subject: { packageEntity }
    };
    board.openDecision({
      ...draft, askedBy: 'overseer', requestId: null, questions: decisionWordingOf(draft).questions, context: removedPackages.join(' ')
    }, at);
  }
}

export const EntityDecisionAnswers = Object.freeze({ answersToActOnOf, actOnAnswers, openWhitelistRemovedDecisions });
