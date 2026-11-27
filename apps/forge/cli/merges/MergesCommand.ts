/**
 * The merge queue as `status` reads the tracker: each target's held slot, then its queued tickets in priority and readiness order, or with
 * merge approval on in User's press order, the accepted tickets first.
 */
import type { LogRecord }      from '../../src/domain/tracker-model/@types/LogRecord.ts';
import { MERGE_PRIORITY_RANK } from '../../src/domain/tracker-model/AirlockClaims.ts';
import type { Board }          from '../../src/domain/tracker-model/Board.ts';
import { readingBoardOf }      from '../../src/domain/tracker-model/ReadingBoard.ts';
import { PRODUCT_NAMES }       from '../../src/shared/constants/ProductNames.ts';
import { boardReadsOf }        from '../BoardStoreOf.ts';
import type { CommandHandler } from '../CommandHandler.ts';
import { OutputUtil }          from '../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} merges [--json]`;

interface QueuedMerge {
  ticketId: string;
  target:   string;
  priority: keyof typeof MERGE_PRIORITY_RANK;
  /** The ticket's place in the log's `merge-queued` order: lower lands first within a priority. */
  queuedAt: number;
}

interface HeldSlot {
  target:    string;
  jobId:     string;
  ticketIds: readonly string[];
  phase:     string;
  targetTip: string;
  branchTip: string;
}

interface MergesReport {
  slots: HeldSlot[];
  queue: QueuedMerge[];
}

/** Each accepted ticket's place in the log's newest accept, the Airlock's press order; a ticket waiting for its accept has none. */
function acceptPositionsOf(board: Board, storedLog: readonly LogRecord[]): Map<string, number> {
  const acceptPositionById = new Map<string, number>();
  storedLog.forEach((record, position) => {
    if (record.kind === 'merge-acceptance-set' && record.fields.state === 'accepted') acceptPositionById.set(record.ticketId, position);
  });
  return new Map([...acceptPositionById].filter(([ticketId]) => board.ticketIsMergeAccepted(ticketId)));
}

/** With merge approval on: the accepted tickets in press order, the earliest accept first, then the ones waiting for an accept in queue order. */
function pressOrderOf(acceptPositionById: ReadonlyMap<string, number>): (a: QueuedMerge, b: QueuedMerge) => number {
  const waitingRankOf    = (queued: QueuedMerge): number => (acceptPositionById.has(queued.ticketId) ? 0 : 1);
  const acceptPositionOf = (queued: QueuedMerge): number => acceptPositionById.get(queued.ticketId) ?? 0;
  return (a, b) => waitingRankOf(a) - waitingRankOf(b) || acceptPositionOf(a) - acceptPositionOf(b) || a.queuedAt - b.queuedAt
    || a.ticketId.localeCompare(b.ticketId, 'en', { numeric: true });
}

function priorityOrderOf(a: QueuedMerge, b: QueuedMerge): number {
  return MERGE_PRIORITY_RANK[a.priority] - MERGE_PRIORITY_RANK[b.priority] || a.queuedAt - b.queuedAt;
}

function mergesReportOf(board: Board, storedLog: readonly LogRecord[]): MergesReport {
  const queuedById = new Map<string, { target: string; position: number }>();
  storedLog.forEach((record, position) => {
    if (record.kind === 'merge-queued') queuedById.set(record.ticketId, { target: record.fields.target, position });
  });
  const orderWithinTarget = board.mergeApprovalIsOn() ? pressOrderOf(acceptPositionsOf(board, storedLog)) : priorityOrderOf;
  const queue = board.tickets()
    .filter(({ frontmatter }) => frontmatter.status === 'in-review' && board.ticketIsMergeQueued(frontmatter.id))
    .filter(({ frontmatter }) => !board.jobs().some((job) => job.airlock !== undefined && job.ticketIds.includes(frontmatter.id)))
    .map(({ frontmatter }): QueuedMerge => ({
      ticketId: frontmatter.id,
      target:   queuedById.get(frontmatter.id)?.target ?? '',
      priority: frontmatter.priority ?? 'normal',
      queuedAt: queuedById.get(frontmatter.id)?.position ?? -1,
    }))
    .sort((a, b) => a.target.localeCompare(b.target) || orderWithinTarget(a, b));
  const slots = board.jobs().flatMap((job): HeldSlot[] => (job.airlock === undefined ? [] : [{
    target: job.airlock.target, jobId: job.id, ticketIds: [...job.ticketIds], phase: job.airlock.phase, targetTip: job.airlock.targetTip, branchTip: job.airlock.branchTip,
  }]));
  return { slots, queue };
}

function mergesTextOf(report: MergesReport): string {
  if (report.slots.length === 0 && report.queue.length === 0) return 'No Airlock is held and nothing is queued to merge.';
  const slotLines  = report.slots.map((slot) => `${slot.target}: job ${slot.jobId} merging #${slot.ticketIds.join(', #')} (${slot.phase})`);
  const queueLines = report.queue.map((queued, index) => `${index + 1}. #${queued.ticketId} into ${queued.target}, ${queued.priority} priority`);
  return [...slotLines, ...(queueLines.length === 0 ? ['Nothing is queued to merge.'] : ['Queued:', ...queueLines])].join('\n');
}

export const mergesCommand: CommandHandler = (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const {
    progress, storedLog, listing, epicListing, draftListing, pipelineReading
  } = boardReadsOf(context).requireBoard();
  OutputUtil.reportIgnoredTicketFiles(context, listing.unreadable);
  const pipeline = pipelineReading.verdict === 'readable' ? pipelineReading.pipeline : null;
  const board    = readingBoardOf(progress, listing.tickets, epicListing.epics, draftListing.drafts, storedLog.records, pipeline);
  const report = mergesReportOf(board, storedLog.records);
  OutputUtil.printEntity(commandArguments, context, report, mergesTextOf(report));
  return Promise.resolve();
};
