/**
 * A chart range request read into the stored axis. A relative bound is stored as written and resolved at layout time, so `-2h` keeps
 * meaning "the last two hours"; `bridge/utils/GeometryUtil.ts` resolves each end, which is what makes a mixed pair legal.
 */
import { LocalTimeUtil }               from '../../../lib/local-time/LocalTimeUtil.ts';
import type { ViewRange }              from '../../../lib/tracker-model/@types/TrackerProgress.ts';
import type { ChartRangeRequest }      from '../../../shared/@types/ControlCommand.ts';
import type { OperationRefusalDetail } from '../../../shared/OperationRefusal.ts';

export type ViewRangeVerdict =
  | { verdict: 'readable'; view: ViewRange }
  | { verdict: 'refused'; detail: OperationRefusalDetail };

const START_OF_WORK_BOUND_WORD = 'start';

const RELATIVE_BOUND_WORDS = [START_OF_WORK_BOUND_WORD, 'now'];

const RELATIVE_OFFSET_PATTERN = /^[+-]\d+[mhd]$/i;

function boundIsRelative(text: string): boolean {
  return RELATIVE_BOUND_WORDS.includes(text.trim().toLowerCase()) || RELATIVE_OFFSET_PATTERN.test(text.trim());
}

function boundIsStartOfWork(text: string): boolean {
  return text.trim().toLowerCase() === START_OF_WORK_BOUND_WORD;
}

/** An offset is stored as written, but only one that resolves now, so the page is never handed a bound it cannot lay out. */
function storedBoundOf(text: string, now: Date): string | null {
  if (boundIsStartOfWork(text)) return text.trim();
  if (boundIsRelative(text)) return LocalTimeUtil.resolveWhen(text, now) === null ? null : text.trim();
  const parsed = LocalTimeUtil.parseIso(text);
  return parsed === null ? null : LocalTimeUtil.formatLocalIso(parsed);
}

/**
 * A backwards axis draws nothing with no error anywhere. Two timestamps are judged, and so are two bounds relative to now, whose order
 * no clock can change; a mixed pair would be judged by the clock, and `start` is the earliest visible row, known only when the page is drawn.
 */
function rangeIsBackwards(writtenFrom: string, writtenTo: string, now: Date): boolean {
  if (boundIsStartOfWork(writtenFrom) || boundIsStartOfWork(writtenTo)) return false;
  if (boundIsRelative(writtenFrom) !== boundIsRelative(writtenTo)) return false;
  const from = LocalTimeUtil.resolveWhen(writtenFrom, now);
  const to   = LocalTimeUtil.resolveWhen(writtenTo, now);
  return from !== null && to !== null && from.getTime() >= to.getTime();
}

function tickIsWholeMinutes(tickMinutes: unknown): boolean {
  return tickMinutes === null || (Number.isInteger(tickMinutes) && (tickMinutes as number) > 0);
}

function viewRangeVerdictOf(request: ChartRangeRequest, now: Date): ViewRangeVerdict {
  if (request.kind === 'automatic') return { verdict: 'readable', view: { kind: 'auto' } };
  if (!tickIsWholeMinutes(request.tickMinutes)) return { verdict: 'refused', detail: { kind: 'chart-range-tick-unreadable', tickMinutes: String(request.tickMinutes) } };
  const from = storedBoundOf(request.from, now);
  if (from === null) return { verdict: 'refused', detail: { kind: 'chart-range-bound-unreadable', bound: 'from', written: request.from } };
  const to = storedBoundOf(request.to, now);
  if (to === null) return { verdict: 'refused', detail: { kind: 'chart-range-bound-unreadable', bound: 'to', written: request.to } };
  if (rangeIsBackwards(request.from, request.to, now)) return { verdict: 'refused', detail: { kind: 'chart-range-backwards', from: request.from, to: request.to } };
  const bothAreTimestamps = !boundIsRelative(request.from) && !boundIsRelative(request.to);
  return {
    verdict: 'readable',
    view:    {
      kind: bothAreTimestamps ? 'absolute' : 'relative', from, to, tickMinutes: request.tickMinutes
    },
  };
}

export const ChartRangeUtil = Object.freeze({ viewRangeVerdictOf, boundIsRelative });
