/**
 * A ticket's failed passes as a log reading: its jobs ended `failed` or `does-not-hold` since it was last started from `pending` or unheld.
 * Clock-free and restart-proof; an interruption, a resume, `replaced`, `stopped` or a usage limit is never a failed pass, and neither is a
 * review that does not hold while the ticket's newest build was `built`: that review resumes the builder, counted against its cycle's resumes.
 * On a forge with entities the passes count per entity and stage, from zero when a stage starts, once the ticket crosses into a package.
 */
import type { JobKind, JobOutcome }      from '../@types/Job.ts';
import type { LogRecord, LogRecordKind } from '../@types/LogRecord.ts';
import { TICKET_STAGE_NUMBERS }          from '../constants/TicketStages.ts';

const FAILED_PASS_OUTCOMES: readonly JobOutcome[] = ['failed', 'does-not-hold'];

/** The stages only a crossing ticket runs: a launch into one of them shows the ticket crossed into a package. */
const CROSSING_STAGE_NUMBERS: readonly number[] = [TICKET_STAGE_NUMBERS['package-build'], TICKET_STAGE_NUMBERS['package-review'], TICKET_STAGE_NUMBERS['adapt']];

/** The records that move a ticket's status, which say whether a later start comes from review. */
const STATUS_MOVE_KINDS: readonly LogRecordKind[] = [
  'ticket-filed',
  'ticket-readied',
  'ticket-reopened',
  'ticket-started',
  'ticket-finished',
  'ticket-approved',
  'ticket-delivered',
  'ticket-abandoned',
];

function outcomeIsAFailedPass(outcome: JobOutcome): boolean {
  return FAILED_PASS_OUTCOMES.includes(outcome);
}

/** The entity and stage a launch names; a launch without them, on a forge without entities, has the empty key. */
function stageKeyOf(launch: Readonly<{ entity?: string; stage?: number }>): string {
  return launch.entity === undefined && launch.stage === undefined ? '' : `${launch.entity ?? ''}/${launch.stage ?? ''}`;
}

/**
 * The ticket's failed passes per entity and stage, keyed as `stageKeyOf` keys a launch. Until the ticket crosses into a package, its build
 * and review count together under its entity, as today; once it crossed, a launch into another stage number starts the stage with no counts.
 * A start from `in-review` is rework, which keeps them; a start from anywhere else begins them again.
 */
function failedPassesByStageOf(ticketId: string, logRecords: readonly LogRecord[]): ReadonlyMap<string, number> {
  const stageKeyByJobId     = new Map<string, string>();
  const jobKindsOfTheTicket = new Map<string, JobKind>();
  const failedPassesByStage = new Map<string, number>();
  let currentStage: number | undefined;
  let ticketHasCrossed      = false;
  let ticketIsInReview      = false;
  let newestBuildWasBuilt   = false;
  for (const record of logRecords) {
    if (record.kind === 'tracker-cleared') {
      failedPassesByStage.clear();
      ticketHasCrossed = false;
    }
    if (record.kind === 'job-launched' && record.fields.ticketIds.includes(ticketId)) {
      const launchStage = record.fields.stage;
      if (launchStage !== undefined && CROSSING_STAGE_NUMBERS.includes(launchStage)) ticketHasCrossed = true;
      jobKindsOfTheTicket.set(record.jobId, record.fields.kind);
      const launchEntity = record.fields.entity;
      stageKeyByJobId.set(record.jobId, stageKeyOf(ticketHasCrossed || launchEntity === undefined ? record.fields : { entity: launchEntity }));
      if (ticketHasCrossed && launchStage !== undefined && launchStage !== currentStage) failedPassesByStage.clear();
      if (launchStage !== undefined) currentStage = launchStage;
    }
    const endedJobKind = record.kind === 'job-ended' ? jobKindsOfTheTicket.get(record.jobId) : undefined;
    if (record.kind === 'job-ended' && endedJobKind !== undefined) {
      const reviewResumesTheBuilder = endedJobKind === 'review' && record.fields.outcome === 'does-not-hold' && newestBuildWasBuilt;
      if (outcomeIsAFailedPass(record.fields.outcome) && !reviewResumesTheBuilder) {
        const stageKey = stageKeyByJobId.get(record.jobId) ?? '';
        failedPassesByStage.set(stageKey, (failedPassesByStage.get(stageKey) ?? 0) + 1);
      }
      if (endedJobKind === 'build') newestBuildWasBuilt = record.fields.outcome === 'built';
    }
    if (!('ticketId' in record) || record.ticketId !== ticketId) continue;
    if (record.kind === 'ticket-unheld') failedPassesByStage.clear();
    if (record.kind === 'ticket-unheld') newestBuildWasBuilt = false;
    if (record.kind === 'ticket-started' && !ticketIsInReview) {
      failedPassesByStage.clear();
      ticketHasCrossed = false;
    }
    if (STATUS_MOVE_KINDS.includes(record.kind)) ticketIsInReview = record.kind === 'ticket-finished';
  }
  return failedPassesByStage;
}

/** The most failed passes of any entity in the ticket's current stage; a forge without entities has the one count it always had. */
function failedPassesOf(ticketId: string, logRecords: readonly LogRecord[]): number {
  return Math.max(0, ...failedPassesByStageOf(ticketId, logRecords).values());
}

export const FailedPassUtil = {
  outcomeIsAFailedPass,
  stageKeyOf,
  failedPassesByStageOf,
  failedPassesOf,
} as const;
