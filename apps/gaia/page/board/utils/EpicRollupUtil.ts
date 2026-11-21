/**
 * An epic's roll-up as the epic marks read it from the forge's facts: its open and done counts, its done text, the bar's
 * segments in settled-first order, its facts line and the order epics are shown in. The span's duration measures against the moment
 * handed in, a stated clock exception that decides only the text printed.
 */
import type { StateTone } from 'design-system/StateTone';

import type { BoardEpicDocument }                             from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState, BoardTicketStatus }          from '../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                                      from '../../shared/utils/CountTextUtil.ts';
import { DisplayStateWordingUtil }                            from './DisplayStateWordingUtil.ts';
import { StateToneUtil }                                      from './StateToneUtil.ts';
import { TimeUtil, type DurationUnits, type TimestampSlices } from './TimeUtil.ts';

/** The roll-up bar's segments, settled work first. */
const ROLLUP_STATUS_ORDER: readonly (BoardDisplayState & BoardTicketStatus)[] = ['delivered', 'reviewed', 'in-review', 'in-progress', 'committed', 'abandoned'];

export interface EpicRollupSegment {
  readonly state: BoardDisplayState;
  /** The state's tone, which the roll-up bar's part takes. */
  readonly tone:  StateTone;
  readonly count: number;
  /** "Done: 2", the segment's hover text and its legend's words. */
  readonly label: string;
}

export interface EpicRollupFact {
  readonly label: string;
  readonly value: string;
  /** The span's full stamps on hover; `null` for every other fact. */
  readonly title: string | null;
}

export interface EpicRollupFormat {
  readonly limits:               TimestampSlices & DurationUnits;
  readonly todayCalendarDate:    string;
  readonly nowEpochMilliseconds: number;
}

function countOf(epic: BoardEpicDocument, status: BoardTicketStatus): number {
  return epic.ticketCountByStatus[status];
}

function openTicketCountOf(epic: BoardEpicDocument): number {
  return epic.ticketIds.length - countOf(epic, 'delivered') - countOf(epic, 'abandoned');
}

/** "1 of 5 done", whatever is still open. */
function doneTextOf(epic: BoardEpicDocument): string {
  return `${countOf(epic, 'delivered')} of ${epic.ticketIds.length} done`;
}

/** The card's done mark: the done text while anything is open, else "all settled", or "no tickets" for an empty epic. */
function settledDoneTextOf(epic: BoardEpicDocument): string {
  if (epic.ticketIds.length === 0) return 'no tickets';
  return openTicketCountOf(epic) === 0 ? 'all settled' : doneTextOf(epic);
}

function rollupSegmentsOf(epic: BoardEpicDocument): EpicRollupSegment[] {
  return ROLLUP_STATUS_ORDER
    .filter((state) => countOf(epic, state) > 0)
    .map((state) => ({
      state, tone: StateToneUtil.toneOf(state), count: countOf(epic, state), label: DisplayStateWordingUtil.labelOf(state)
    }));
}

function rollupAriaLabelOf(epic: BoardEpicDocument): string {
  return `${doneTextOf(epic)} tickets`;
}

function spanFactOf(epic: BoardEpicDocument, format: EpicRollupFormat): EpicRollupFact {
  const { span } = epic;
  if (span === null) return { label: 'span', value: 'not started', title: null };
  const { limits, todayCalendarDate } = format;
  const startEpochMilliseconds = TimeUtil.epochMillisecondsOf(span.start);
  const endEpochMilliseconds   = span.end === null ? format.nowEpochMilliseconds : TimeUtil.epochMillisecondsOf(span.end);
  const duration = startEpochMilliseconds === null || endEpochMilliseconds === null ? null : TimeUtil.formatDuration(endEpochMilliseconds - startEpochMilliseconds, limits);
  const endText  = span.end === null ? 'now' : TimeUtil.shortStampText(span.end, todayCalendarDate, limits);
  return {
    label: 'span',
    value: `${TimeUtil.shortStampText(span.start, todayCalendarDate, limits)} → ${endText}${duration === null ? '' : ` · ${duration}`}`,
    title: `${TimeUtil.fullStampText(span.start, limits)} → ${span.end === null ? 'still open' : TimeUtil.fullStampText(span.end, limits)}`,
  };
}

/** Open, done, abandoned only when there are any, tokens and the span. */
function rollupFactsOf(epic: BoardEpicDocument, format: EpicRollupFormat): EpicRollupFact[] {
  const abandonedCount = countOf(epic, 'abandoned');
  const plainFact = (label: string, value: string): EpicRollupFact => ({ label, value, title: null });
  return [
    plainFact('open', String(openTicketCountOf(epic))),
    plainFact('done', String(countOf(epic, 'delivered'))),
    ...(abandonedCount > 0 ? [plainFact('abandoned', String(abandonedCount))] : []),
    plainFact('tokens', CountTextUtil.shortCountTextOf(epic.tokens)),
    spanFactOf(epic, format),
  ];
}

/** Open epics first, then the settled ones, each part in the Board's key order. */
function epicsInShownOrder<Epic extends BoardEpicDocument>(epics: readonly Epic[]): Epic[] {
  return epics.toSorted((a, b) => Number(openTicketCountOf(a) === 0) - Number(openTicketCountOf(b) === 0));
}

export const EpicRollupUtil = Object.freeze({
  openTicketCountOf,
  doneTextOf,
  settledDoneTextOf,
  rollupSegmentsOf,
  rollupAriaLabelOf,
  rollupFactsOf,
  epicsInShownOrder,
});
