/**
 * The Merge queue detail's model: per target, the Airlock holder, the waiting candidates, their predicted conflicts and why landings wait.
 * It orders and decides nothing itself: the order, the predictions and the reasons arrive as served facts.
 */
import type { BoardLimitsDocument, BoardNoticeDocument }                     from '../../../@types/board/BoardFactDocuments.ts';
import type { BoardMergeCandidateDocument, BoardMergeQueueDocument }         from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardMergeTargetDocument }                                     from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardAppliedPipelineDocument }                                 from '../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardDisplayState, BoardMergePrediction, BoardTicketPriority } from '../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                                                     from '../../../shared/utils/CountTextUtil.ts';

const FIVE_KEY_ORDER_TEXT = 'Ordered by priority, clean before conflicting, fewest conflicts caused, readiness, then ticket id.';

const PRESS_ORDER_TEXT = 'Ordered by User\'s Merge presses, earliest first, then ticket id.';

const PHASE_LABELS: Readonly<Record<string, string>> = {
  'merge-in':  'merging in',
  'resolving': 'resolving',
  'gating':    'gating',
  'fixing':    'fixing the gate',
  'landing':   'landing',
};

/** A prediction's pill: clean reads as ready to merge, a conflict in the draft rose, a failed prediction as idle. */
const DISPLAY_STATE_OF_FORECAST: Readonly<Record<BoardMergePrediction, BoardDisplayState>> = {
  'clean':             'reviewed',
  'conflicting':       'draft',
  'prediction-failed': 'paused',
};

const FORECAST_LABEL: Readonly<Record<BoardMergePrediction, string>> = {
  'clean':             'clean',
  'conflicting':       'conflicting',
  'prediction-failed': 'prediction failed',
};

/** The notices the forge serves when a target's landings wait on the main checkout: each names its target in its facts. */
const TARGET_HOLDING_NOTICE_KINDS: readonly string[] = ['dirty-main-checkout', 'target-file-held'];

/** A prediction as its pill shows it, with the files git named for a conflict apart. */
export interface ForecastFacts {
  readonly forecast:            BoardMergePrediction;
  readonly forecastLabel:       string;
  readonly forecastState:       BoardDisplayState;
  readonly conflictedFilesText: string | null;
}

export interface MergeQueueLine extends ForecastFacts {
  readonly position:   number;
  readonly ticketId:   string;
  readonly priority:   BoardTicketPriority;
  readonly causesText: string | null;
}

/** A ticket that waits for User's accept, apart from the queue: it is not a candidate until accepted. */
export interface WaitingForMergeLine extends ForecastFacts {
  readonly ticketId: string;
  readonly priority: BoardTicketPriority;
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

function forecastFactsOf(entry: BoardMergeCandidateDocument): ForecastFacts {
  const files = entry.againstTarget === 'conflicting' ? entry.conflictedFiles ?? [] : [];
  return {
    forecast:            entry.againstTarget,
    forecastLabel:       FORECAST_LABEL[entry.againstTarget],
    forecastState:       DISPLAY_STATE_OF_FORECAST[entry.againstTarget],
    conflictedFilesText: files.length === 0 ? null : files.join(', '),
  };
}

function holderTextOf(holder: BoardMergeTargetDocument['holder']): string {
  if (holder === null) return 'Airlock free';
  const tickets = holder.ticketIds.map((ticketId) => `#${ticketId}`).join(', ');
  const phaseLabel = Object.hasOwn(PHASE_LABELS, holder.phase) ? PHASE_LABELS[holder.phase] : holder.phase;
  return `${holder.jobId}${tickets === '' ? '' : ` for ${tickets}`} holds the Airlock: ${phaseLabel ?? holder.phase}`;
}

function heldTargetOf(notice: BoardNoticeDocument): string | null {
  const { target } = notice.facts;
  return TARGET_HOLDING_NOTICE_KINDS.includes(notice.kind) && typeof target === 'string' ? target : null;
}

function waitingLinesOf(facts: BoardMergeTargetDocument): Pick<MergeQueueTarget, 'waitingLines'> {
  if (facts.waitingForMerge.length === 0) return {};
  return { waitingLines: facts.waitingForMerge.map((entry) => ({ ...forecastFactsOf(entry), ticketId: entry.ticketId, priority: entry.priority })) };
}

function targetOf(facts: BoardMergeTargetDocument, notices: readonly BoardNoticeDocument[]): MergeQueueTarget {
  return {
    ...waitingLinesOf(facts),
    target:     facts.target,
    holderText: holderTextOf(facts.holder),
    phase:      facts.holder?.phase ?? null,
    lines:      facts.order.map((entry, index) => ({
      ...forecastFactsOf(entry),
      position:   index + 1,
      ticketId:   entry.ticketId,
      priority:   entry.priority,
      causesText: entry.conflictsCaused === 0 ? null : `would conflict with ${CountTextUtil.countedPhrase(entry.conflictsCaused, 'clean candidate', 'clean candidates')}`,
    })),
    pairwiseTexts:  facts.pairwiseConflicts.map(([first, second]) => `#${first} and #${second} conflict with each other`),
    waitingReasons: [
      ...facts.targetMovedDecisionIds.map((decisionId) => `landings wait on the target-moved decision ${decisionId}`),
      ...notices.filter((notice) => heldTargetOf(notice) === facts.target).map((notice) => notice.text),
    ],
  };
}

/** With merge approval on in the applied pipeline, User's press order sets the train; otherwise the five keys do. */
function orderTextOf(applied: BoardAppliedPipelineDocument, defaults: Pick<BoardLimitsDocument, 'defaultApprovals'>): string {
  const mergeApprovalIsOn = applied.readingVerdict === 'readable' && (applied.pipeline.approvals.merge ?? defaults.defaultApprovals.merge);
  return mergeApprovalIsOn ? PRESS_ORDER_TEXT : FIVE_KEY_ORDER_TEXT;
}

/** Every target the forge reported, plus one a holding notice names that has nothing queued. */
function mergeQueueModelOf(mergeQueue: Pick<BoardMergeQueueDocument, 'targets'>, notices: readonly BoardNoticeDocument[]): MergeQueueTarget[] {
  const reported = mergeQueue.targets;
  const noticeOnly = notices
    .flatMap((notice) => heldTargetOf(notice) ?? [])
    .filter((target, index, targets) => targets.indexOf(target) === index && !reported.some((facts) => facts.target === target))
    .map((target): BoardMergeTargetDocument => ({
      target, holder: null, order: [], waitingForMerge: [], pairwiseConflicts: [], targetMovedDecisionIds: []
    }));
  return [...reported, ...noticeOnly].map((facts) => targetOf(facts, notices));
}

export const MergeQueueModel = Object.freeze({ mergeQueueModelOf, forecastFactsOf, orderTextOf });
