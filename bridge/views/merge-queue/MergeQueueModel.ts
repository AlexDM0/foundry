/**
 * The Merge queue detail's model: per target, the Airlock holder and its phase, the waiting candidates in the order the Overseer computed
 * (five keys, or User's press order with merge approval on), git's predicted conflicts, and why its landings wait (an open `target-moved`
 * decision, the `dirty-main-checkout` notice). It orders nothing itself: the order arrives as a fact. With merge approval on, the tickets
 * waiting for User's accept show apart, each with its prediction against the target's tip.
 */
import type { AppliedPipelineFacts } from '../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { DisplayState }         from '../../../src/lib/tracker-model/@types/Task.ts';
import type { TicketPriority }       from '../../../src/lib/tracker-model/@types/Ticket.ts';
import type {
  MergeQueueDocument,
  MergeTargetDocument,
  NoticeDocument,
  WaitingForMergeEntryDocument
} from '../../@types/BoardStateDocument.ts';

const FIVE_KEY_ORDER_TEXT = 'Ordered by priority, clean before conflicting, fewest conflicts caused, readiness, then ticket id.';

const PRESS_ORDER_TEXT = 'Ordered by User\'s Merge presses, earliest first, then ticket id.';

const PHASE_LABELS: Readonly<Record<string, string>> = {
  'merge-in':  'merging in',
  'resolving': 'resolving',
  'gating':    'gating',
  'fixing':    'fixing the gate',
  'landing':   'landing',
};

type Forecast = MergeTargetDocument['order'][number]['againstTarget'];

/** A prediction's pill: clean reads as ready to merge, a conflict in the draft rose, a failed prediction as idle. */
const PALETTE_STATE_OF_FORECAST: Readonly<Record<Forecast, DisplayState>> = {
  'clean':             'reviewed',
  'conflicting':       'draft',
  'prediction-failed': 'paused',
};

const FORECAST_LABEL: Readonly<Record<Forecast, string>> = {
  'clean':             'clean',
  'conflicting':       'conflicting',
  'prediction-failed': 'prediction failed',
};

/** A prediction as its pill shows it, with the files git named for a conflict apart. */
export interface ForecastFacts {
  readonly forecast:            Forecast;
  readonly forecastLabel:       string;
  readonly forecastState:       DisplayState;
  readonly conflictedFilesText: string | null;
}

export interface MergeQueueLine extends ForecastFacts {
  readonly position:   number;
  readonly ticketId:   string;
  readonly priority:   TicketPriority;
  readonly causesText: string | null;
}

/** A ticket that waits for User's accept, apart from the queue: it is not a candidate until accepted. */
export interface WaitingForMergeLine extends ForecastFacts {
  readonly ticketId: string;
  readonly priority: TicketPriority;
}

export interface MergeQueueTarget {
  readonly target:         string;
  readonly holderText:     string;
  readonly phase:          string | null;
  readonly lines:          readonly MergeQueueLine[];
  /** Written only while a ticket waits, so with merge approval off the model is as before. */
  readonly waitingLines?:  readonly WaitingForMergeLine[];
  readonly pairwiseTexts:  readonly string[];
  readonly waitingReasons: readonly string[];
}

const TICKET_PRIORITIES: readonly TicketPriority[] = ['low', 'normal', 'high'];

/** A priority the Bridge does not know reads as normal, which is unmarked. */
function priorityOf(priorityText: string): TicketPriority {
  return TICKET_PRIORITIES.find((priority) => priority === priorityText) ?? 'normal';
}

function forecastFactsOf(entry: MergeTargetDocument['order'][number] | WaitingForMergeEntryDocument): ForecastFacts {
  const files = entry.againstTarget === 'conflicting' ? entry.conflictedFiles ?? [] : [];
  return {
    forecast:            entry.againstTarget,
    forecastLabel:       FORECAST_LABEL[entry.againstTarget],
    forecastState:       PALETTE_STATE_OF_FORECAST[entry.againstTarget],
    conflictedFilesText: files.length === 0 ? null : files.join(', '),
  };
}

function holderTextOf(holder: MergeTargetDocument['holder']): string {
  if (holder === null) return 'Airlock free';
  const tickets = holder.ticketIds.map((ticketId) => `#${ticketId}`).join(', ');
  return `${holder.jobId}${tickets === '' ? '' : ` for ${tickets}`} holds the Airlock: ${PHASE_LABELS[holder.phase] ?? holder.phase}`;
}

const TARGET_HOLDING_NOTICE_KINDS: readonly string[] = ['dirty-main-checkout', 'target-file-held'];

function dirtyCheckoutReasonOf(notice: NoticeDocument): string {
  if (notice.kind === 'target-file-held') {
    const heldFiles = Array.isArray(notice['heldFiles']) ? notice['heldFiles'].map(String) : [];
    return `landings wait: another process holds ${heldFiles.join(', ')} open, so git cannot replace what is held`;
  }
  const blockingFiles = Array.isArray(notice['blockingFiles']) ? notice['blockingFiles'].map(String) : [];
  const branch = typeof notice['branch'] === 'string' ? notice['branch'] : 'no branch';
  return blockingFiles.length === 0
    ? `landings wait: the main checkout is on ${branch}`
    : `landings wait: the main checkout's changes to ${blockingFiles.join(', ')} block the fast-forward`;
}

function dirtyCheckoutNoticesOf(notices: readonly NoticeDocument[]): NoticeDocument[] {
  return notices.filter((notice) => TARGET_HOLDING_NOTICE_KINDS.includes(notice.kind) && typeof notice['target'] === 'string');
}

function waitingLinesOf(facts: MergeTargetDocument): Pick<MergeQueueTarget, 'waitingLines'> {
  const waiting = facts.waitingForMerge ?? [];
  if (waiting.length === 0) return {};
  return { waitingLines: waiting.map((entry) => ({ ...forecastFactsOf(entry), ticketId: entry.ticketId, priority: priorityOf(entry.priority) })), };
}

function targetOf(facts: MergeTargetDocument, notices: readonly NoticeDocument[]): MergeQueueTarget {
  return {
    ...waitingLinesOf(facts),
    target:     facts.target,
    holderText: holderTextOf(facts.holder),
    phase:      facts.holder?.phase ?? null,
    lines:      facts.order.map((entry, index) => ({
      ...forecastFactsOf(entry),
      position:   index + 1,
      ticketId:   entry.ticketId,
      priority:   priorityOf(entry.priority),
      causesText: entry.conflictsCaused === 0 ? null : `would conflict with ${entry.conflictsCaused} clean ${entry.conflictsCaused === 1 ? 'candidate' : 'candidates'}`,
    })),
    pairwiseTexts:  facts.pairwiseConflicts.map(([first, second]) => `#${first} and #${second} conflict with each other`),
    waitingReasons: [
      ...facts.targetMovedDecisionIds.map((decisionId) => `landings wait on the target-moved decision ${decisionId}`),
      ...dirtyCheckoutNoticesOf(notices).filter((notice) => notice['target'] === facts.target).map(dirtyCheckoutReasonOf),
    ],
  };
}

/** With merge approval on in the applied pipeline, User's press order sets the train; otherwise the five keys do. */
function orderTextOf(pipeline: AppliedPipelineFacts | undefined): string {
  const mergeApprovalIsOn = pipeline?.readingVerdict === 'readable' && pipeline.pipeline.approvals?.merge === true;
  return mergeApprovalIsOn ? PRESS_ORDER_TEXT : FIVE_KEY_ORDER_TEXT;
}

/** Every target the Overseer reported, plus one a `dirty-main-checkout` notice names that has nothing queued. */
function mergeQueueModelOf(mergeQueue: MergeQueueDocument | undefined, notices: readonly NoticeDocument[]): MergeQueueTarget[] {
  const reported = mergeQueue?.targets ?? [];
  const noticeOnly = dirtyCheckoutNoticesOf(notices)
    .map((notice) => String(notice['target']))
    .filter((target, index, targets) => targets.indexOf(target) === index && !reported.some((facts) => facts.target === target))
    .map((target): MergeTargetDocument => ({
      target, holder: null, order: [], pairwiseConflicts: [], targetMovedDecisionIds: []
    }));
  return [...reported, ...noticeOnly].map((facts) => targetOf(facts, notices));
}

export const MergeQueueModel = Object.freeze({ mergeQueueModelOf, forecastFactsOf, orderTextOf });
