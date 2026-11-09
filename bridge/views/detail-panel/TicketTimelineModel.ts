/**
 * A ticket's Timeline, the ticket form's mini Gantt: the Progress chart's grid at a smaller scale, laid over the ticket's stamps, its own
 * row's phases and its review rows, as rows Filed, Build, Review N and After build with a legend of the time spent in each state. Pure: the
 * now it is handed is only shown and drawn, never compared to decide anything but where a still-open span ends.
 */
import { MILLISECONDS_PER_MINUTE }                                     from '../../../src/lib/local-time/LocalTimeUtil.ts';
import { TokenCountUtil }                                              from '../../../src/lib/token-count/TokenCountUtil.ts';
import type { DisplayState, TaskPhase }                                from '../../../src/lib/tracker-model/@types/Task.ts';
import { FIRST_REPEAT_REVIEW_ROUND }                                   from '../../../src/lib/tracker-model/constants/ReviewRounds.ts';
import { TicketDefaultsUtil }                                          from '../../../src/lib/tracker-model/utils/TicketDefaultsUtil.ts';
import type { DetailLimits, DetailTaskDocument, DetailTicketDocument } from '../../@types/DetailBoardState.ts';
import type { TimelineTick }                                           from '../../@types/Timeline.ts';
import { DisplayStateWordingUtil }                                     from '../../utils/DisplayStateWordingUtil.ts';
import { GeometryUtil, MINIMUM_TICK_STEP_MINUTES }                     from '../../utils/GeometryUtil.ts';
import { RowLabelUtil }                                                from '../../utils/RowLabelUtil.ts';
import { TimeUtil }                                                    from '../../utils/TimeUtil.ts';
import { CLOSING_EVENT_WORD }                                          from './DetailFactsModel.ts';

const AXIS_PADDING_FRACTION_PER_SIDE = 0.025;

const TICKET_TIMELINE_MAXIMUM_TICKS = 9;

/** A lifecycle segment narrower than this share of the axis is drawn without its label, which would not fit. */
const SEGMENT_LABEL_MINIMUM_PERCENT = 9;

const LOW_PRIORITY_WITHOUT_ROW_NOTE = 'Not started. Low priority: it gets a build row once it is started, after every normal and high ticket is done.';
const ABANDONED_WITHOUT_ROW_NOTE    = 'Abandoned before it was started; it never had a build row.';
const ABANDONED_BEFORE_START_NOTE   = 'Abandoned before it was started.';

/** The row statuses a build has ended by, so a row's `end` stands in for the finish only on one of them, never on an abandoned row. */
const ROW_STATUSES_PAST_THE_BUILD: readonly DetailTaskDocument['status'][] = ['in-review', 're-review', 'reviewed', 'delivered'];

type ClosedTicketState = 'delivered' | 'abandoned';

interface TicketTimelineAxis {
  readonly fromEpochMilliseconds:       number;
  readonly toEpochMilliseconds:         number;
  readonly lastMomentEpochMilliseconds: number;
}

interface TimelineSpan {
  readonly state:                  DisplayState;
  readonly label:                  string;
  readonly startEpochMilliseconds: number;
  readonly endEpochMilliseconds:   number;
  readonly isLive:                 boolean;
}

interface ReviewSpan extends TimelineSpan {
  readonly round:  number;
  readonly tokens: number | null;
}

export interface TicketTimelineInput {
  readonly ticket:               DetailTicketDocument;
  readonly ownRow:               DetailTaskDocument | null;
  /** Oldest filed first. */
  readonly reviewRows:           readonly DetailTaskDocument[];
  readonly waitingOn:            readonly string[];
  readonly nowEpochMilliseconds: number;
  readonly todayCalendarDate:    string;
  readonly limits:               DetailLimits;
}

/** The kind picks the bar's look: the quiet hatched queue, a build phase, a review pass, or a labelled lifecycle stretch. */
export type TimelineBarKind = 'filed' | 'build' | 'review' | 'lifecycle';

export interface TimelineBarModel {
  readonly key:          string;
  readonly kind:         TimelineBarKind;
  /** `null` on the filed bar, which has no state colour. */
  readonly state:        DisplayState | null;
  readonly isLive:       boolean;
  readonly leftPercent:  number;
  readonly widthPercent: number;
  readonly title:        string;
  /** A lifecycle segment's label, `null` where the segment is too narrow or the kind carries none. */
  readonly label:        string | null;
}

export interface TimelineRowModel {
  readonly key:       string;
  readonly name:      string;
  /** The mono part after the name: the filed clock or the build row's label. */
  readonly monoText:  string | null;
  readonly nameTitle: string | null;
  readonly timeText:  string;
  readonly bars:      readonly TimelineBarModel[];
}

export interface LegendEntryModel {
  readonly state:        DisplayState;
  readonly label:        string;
  readonly durationText: string;
}

export interface TimelineEndModel {
  readonly closedState: ClosedTicketState | null;
  readonly label:       string;
  readonly leftPercent: number;
}

export interface TicketTimelineModel {
  readonly ticks:  readonly TimelineTick[];
  readonly end:    TimelineEndModel;
  readonly rows:   readonly TimelineRowModel[];
  readonly legend: readonly LegendEntryModel[];
  readonly note:   string | null;
}

function percentAlong(axis: TicketTimelineAxis, epochMilliseconds: number): number {
  return (epochMilliseconds - axis.fromEpochMilliseconds) / (axis.toEpochMilliseconds - axis.fromEpochMilliseconds) * 100;
}

function durationTextOf(milliseconds: number, limits: DetailLimits): string {
  return TimeUtil.formatDuration(milliseconds, limits) ?? '';
}

function stateLabelOf(state: DisplayState): string {
  return DisplayStateWordingUtil.stateLabelOf(state, FIRST_REPEAT_REVIEW_ROUND);
}

function closedStateOf(ticket: DetailTicketDocument): ClosedTicketState | null {
  return ticket.status === 'delivered' || ticket.status === 'abandoned' ? ticket.status : null;
}

/** A closed ticket missing its closing stamp ends at `updated`, never at now: it is closed, and a now marker would say otherwise. */
function closingStampOf(ticket: DetailTicketDocument, closedState: ClosedTicketState | null): string | null {
  if (closedState === 'delivered') return ticket.delivered ?? ticket.updated;
  if (closedState === 'abandoned') return ticket.abandonedAt ?? ticket.updated;
  return null;
}

function smallestLadderStepMilliseconds(limits: DetailLimits): number {
  const positiveSteps = limits.tickStepLadderMinutes.filter((minutes) => minutes > 0);
  return (positiveSteps.length === 0 ? MINIMUM_TICK_STEP_MINUTES : Math.min(...positiveSteps)) * MILLISECONDS_PER_MINUTE;
}

function axisFor(filedEpochMilliseconds: number, lastMomentEpochMilliseconds: number, limits: DetailLimits): TicketTimelineAxis {
  const spanMilliseconds    = lastMomentEpochMilliseconds - filedEpochMilliseconds;
  const paddingMilliseconds = spanMilliseconds * AXIS_PADDING_FRACTION_PER_SIDE;
  const widening            = Math.max(0, smallestLadderStepMilliseconds(limits) - (spanMilliseconds + 2 * paddingMilliseconds)) / 2;
  return {
    fromEpochMilliseconds: filedEpochMilliseconds - paddingMilliseconds - widening,
    toEpochMilliseconds:   lastMomentEpochMilliseconds + paddingMilliseconds + widening,
    lastMomentEpochMilliseconds,
  };
}

function ticksFor(axis: TicketTimelineAxis, limits: DetailLimits): TimelineTick[] {
  const spanMinutes = (axis.toEpochMilliseconds - axis.fromEpochMilliseconds) / MILLISECONDS_PER_MINUTE;
  const stepMinutes = GeometryUtil.chooseStepMinutes(spanMinutes, null, { ...limits, maximumTicksPerAxis: TICKET_TIMELINE_MAXIMUM_TICKS });
  return GeometryUtil.buildTicks(axis, stepMinutes, spanMinutes, limits);
}

function spanOf(state: DisplayState, label: string, startEpochMilliseconds: number, endEpochMilliseconds: number, isLive: boolean): TimelineSpan {
  return {
    state, label, startEpochMilliseconds, endEpochMilliseconds, isLive
  };
}

/** One segment per recorded `in-progress` or `paused` phase, each to the next phase; a row without such a phase gets one from its `start`. */
function buildSegmentsOf(ownRow: DetailTaskDocument | null, lastMomentEpochMilliseconds: number, ticketIsClosed: boolean): TimelineSpan[] {
  if (ownRow === null) return [];
  const history = ownRow.history ?? [];
  const rowEndMilliseconds = TimeUtil.epochMillisecondsOf(ownRow.end);
  const recorded = history.flatMap((phase, index) => {
    const startEpochMilliseconds = TimeUtil.epochMillisecondsOf(phase.at);
    if ((phase.status !== 'in-progress' && phase.status !== 'paused') || startEpochMilliseconds === null) return [];
    const nextPhase = history[index + 1];
    const end = TimeUtil.epochMillisecondsOf(nextPhase?.at) ?? rowEndMilliseconds ?? lastMomentEpochMilliseconds;
    const isLive = nextPhase === undefined && rowEndMilliseconds === null && !ticketIsClosed;
    return [spanOf(phase.status, stateLabelOf(phase.status), startEpochMilliseconds, end, isLive)];
  });
  if (recorded.length > 0) return recorded;
  const startEpochMilliseconds = TimeUtil.epochMillisecondsOf(ownRow.start);
  if (startEpochMilliseconds === null) return [];
  const state = ownRow.status === 'paused' ? 'paused' : 'in-progress';
  return [spanOf(state, stateLabelOf(state), startEpochMilliseconds, rowEndMilliseconds ?? lastMomentEpochMilliseconds, rowEndMilliseconds === null && !ticketIsClosed)];
}

/** The latest build's `in-review` phase; a reopened ticket building again has none, as its history's `in-progress` came after it. */
function latestBuildFinishedPhaseOf(ownRow: DetailTaskDocument | null): TaskPhase | undefined {
  const latestBuildMove = (ownRow?.history ?? []).findLast((phase) => phase.status === 'in-progress' || phase.status === 'paused' || phase.status === 'in-review');
  return latestBuildMove?.status === 'in-review' ? latestBuildMove : undefined;
}

function buildEndOf(ticket: DetailTicketDocument, ownRow: DetailTaskDocument | null): number | null {
  const rowEnd = ownRow !== null && ROW_STATUSES_PAST_THE_BUILD.includes(ownRow.status) ? TimeUtil.epochMillisecondsOf(ownRow.end) : null;
  return TimeUtil.epochMillisecondsOf(ticket.finished) ?? TimeUtil.epochMillisecondsOf(latestBuildFinishedPhaseOf(ownRow)?.at) ?? rowEnd;
}

function reviewSpansOf(reviewRows: readonly DetailTaskDocument[], lastMomentEpochMilliseconds: number, ticketIsClosed: boolean): ReviewSpan[] {
  const started = reviewRows.flatMap((row) => {
    const startEpochMilliseconds = TimeUtil.epochMillisecondsOf(row.start);
    return startEpochMilliseconds === null ? [] : [{ row, startEpochMilliseconds }];
  });
  return started.map(({ row, startEpochMilliseconds }, index) => {
    const round = index + 1;
    const end = TimeUtil.epochMillisecondsOf(row.end);
    const state = round === 1 ? 'reviewing' : 're-review';
    return {
      ...spanOf(state, `Review ${round}`, startEpochMilliseconds, end ?? lastMomentEpochMilliseconds, end === null && !ticketIsClosed),
      round,
      tokens: row.tokens,
    };
  });
}

interface TimelineContext {
  readonly axis:  TicketTimelineAxis;
  readonly input: TicketTimelineInput;
}

interface AfterBuildInput {
  readonly buildEndEpochMilliseconds:   number | null;
  readonly reviews:                     readonly ReviewSpan[];
  readonly reviewedEpochMilliseconds:   number | null;
  readonly closedState:                 ClosedTicketState | null;
  readonly lastMomentEpochMilliseconds: number;
}

/** The waits after the build, whose reviewing spans run from one review row's start to the next's, or to the `reviewed` stamp. */
function afterBuildSpansOf(input: AfterBuildInput): TimelineSpan[] {
  const {
    buildEndEpochMilliseconds, reviews, reviewedEpochMilliseconds, lastMomentEpochMilliseconds
  } = input;
  if (buildEndEpochMilliseconds === null) return [];
  const ticketIsClosed = input.closedState !== null;
  const span = (state: DisplayState, label: string, start: number, end: number): TimelineSpan => (
    spanOf(state, label, start, end, end === lastMomentEpochMilliseconds && !ticketIsClosed)
  );
  const awaitingReview = (end: number): TimelineSpan => span('in-review', stateLabelOf('in-review'), buildEndEpochMilliseconds, end);
  const awaitingMerge = (start: number): TimelineSpan => span('reviewed', stateLabelOf('reviewed'), start, lastMomentEpochMilliseconds);
  const spans: TimelineSpan[] = [];
  const firstReview = reviews[0];
  if (firstReview !== undefined) {
    spans.push(awaitingReview(firstReview.startEpochMilliseconds));
    reviews.forEach((review, index) => {
      const end = reviews[index + 1]?.startEpochMilliseconds ?? reviewedEpochMilliseconds ?? lastMomentEpochMilliseconds;
      spans.push(span(review.state, DisplayStateWordingUtil.stateLabelOf(review.state, review.round), review.startEpochMilliseconds, end));
    });
    if (reviewedEpochMilliseconds !== null) spans.push(awaitingMerge(reviewedEpochMilliseconds));
  } else if (reviewedEpochMilliseconds !== null) {
    spans.push(awaitingReview(reviewedEpochMilliseconds), awaitingMerge(reviewedEpochMilliseconds));
  } else if (input.closedState === 'delivered') {
    spans.push(awaitingMerge(buildEndEpochMilliseconds));
  } else {
    spans.push(awaitingReview(lastMomentEpochMilliseconds));
  }
  return spans.filter((candidate) => candidate.endEpochMilliseconds > candidate.startEpochMilliseconds);
}

function legendOf(spans: readonly TimelineSpan[], limits: DetailLimits): LegendEntryModel[] {
  const totals: { state: DisplayState; label: string; milliseconds: number }[] = [];
  for (const span of spans) {
    const milliseconds = span.endEpochMilliseconds - span.startEpochMilliseconds;
    const existing = totals.find((total) => total.label === span.label);
    if (existing === undefined) totals.push({ state: span.state, label: span.label, milliseconds });
    else existing.milliseconds += milliseconds;
  }
  return totals.flatMap((total) => {
    const durationText = total.milliseconds > 0 ? TimeUtil.formatDuration(total.milliseconds, limits) : null;
    return durationText === null ? [] : [{ state: total.state, label: total.label, durationText }];
  });
}

function waitReasonOf(ticket: DetailTicketDocument, waitingOn: readonly string[]): string {
  if (ticket.hold !== undefined) return ticket.hold === '' ? ' Held.' : ` Held: ${ticket.hold}.`;
  return waitingOn.length === 0 ? '' : ` Waiting on #${waitingOn.join(', #')}.`;
}

function noteOf(input: TicketTimelineInput, hasStarted: boolean, closedState: ClosedTicketState | null, queuedMilliseconds: number): string | null {
  const { ticket, ownRow } = input;
  if (hasStarted) return null;
  if (closedState === 'abandoned') return ownRow === null ? ABANDONED_WITHOUT_ROW_NOTE : ABANDONED_BEFORE_START_NOTE;
  if (closedState !== null) return null;
  if (ownRow === null && TicketDefaultsUtil.ticketPriorityOf(ticket) === 'low') return LOW_PRIORITY_WITHOUT_ROW_NOTE;
  const queued = TimeUtil.formatDuration(queuedMilliseconds, input.limits);
  return queued === null ? null : `Not started: in the queue for ${queued}.${waitReasonOf(ticket, input.waitingOn)}`;
}

function endOf(axis: TicketTimelineAxis, closedState: ClosedTicketState | null, closingStamp: string | null, input: TicketTimelineInput): TimelineEndModel {
  const label = closedState === null || closingStamp === null
    ? `now ${TimeUtil.clockOf(new Date(input.nowEpochMilliseconds))}`
    : `${CLOSING_EVENT_WORD[closedState]} ${TimeUtil.shortStampText(closingStamp, input.todayCalendarDate, input.limits)}`;
  return { closedState, label, leftPercent: percentAlong(axis, axis.lastMomentEpochMilliseconds) };
}

function clampToAxis(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function barPlacementOf(axis: TicketTimelineAxis, span: TimelineSpan, limits: DetailLimits): Pick<TimelineBarModel, 'leftPercent' | 'widthPercent'> {
  const leftPercent = clampToAxis(percentAlong(axis, span.startEpochMilliseconds));
  const rightPercent = clampToAxis(percentAlong(axis, span.endEpochMilliseconds));
  return { leftPercent, widthPercent: Math.min(100 - leftPercent, Math.max(rightPercent - leftPercent, limits.minimumBarWidthPercent)) };
}

function spanTitleOf(span: TimelineSpan, input: TicketTimelineInput): string {
  const startText = TimeUtil.shortInstantText(span.startEpochMilliseconds, input.todayCalendarDate);
  const endText = span.isLive ? ' → now' : `–${TimeUtil.shortInstantText(span.endEpochMilliseconds, input.todayCalendarDate)}`;
  const duration = TimeUtil.formatDuration(span.endEpochMilliseconds - span.startEpochMilliseconds, input.limits);
  return `${span.label} ${startText}${endText}${duration === null ? '' : ` · ${duration}`}`;
}

function barOf(kind: TimelineBarKind, span: TimelineSpan, key: string, title: string, label: string | null, context: TimelineContext): TimelineBarModel {
  return {
    key,
    kind,
    state:  kind === 'filed' ? null : span.state,
    isLive: kind !== 'filed' && span.isLive,
    ...barPlacementOf(context.axis, span, context.input.limits),
    title,
    label,
  };
}

function filedRowOf(queue: TimelineSpan, queueTimeText: string, context: TimelineContext): TimelineRowModel {
  const { ticket, limits, todayCalendarDate } = context.input;
  const queued = durationTextOf(queue.endEpochMilliseconds - queue.startEpochMilliseconds, limits);
  const title = `filed ${TimeUtil.fullStampText(ticket.filed, limits)} · in the queue ${queued}${queue.isLive ? ' so far' : ''}`;
  const filedToday = TimeUtil.stampIsFromDay(ticket.filed, todayCalendarDate, limits);
  return {
    key:       'filed',
    name:      'Filed',
    monoText:  filedToday ? TimeUtil.shortStampText(ticket.filed, todayCalendarDate, limits) : null,
    nameTitle: filedToday ? null : `filed ${TimeUtil.fullStampText(ticket.filed, limits)}`,
    timeText:  queueTimeText,
    bars:      [barOf('filed', queue, 'filed', title, null, context)],
  };
}

function buildRowOf(segments: readonly TimelineSpan[], buildTimeText: string, context: TimelineContext): TimelineRowModel {
  const { ticket, ownRow } = context.input;
  return {
    key:       'build',
    name:      'Build',
    monoText:  ownRow === null ? null : RowLabelUtil.rowLabelOf({ ticket: ticket.id }),
    nameTitle: null,
    timeText:  buildTimeText,
    bars:      segments.map((segment, index) => barOf('build', segment, `build-${String(index)}`, spanTitleOf(segment, context.input), null, context)),
  };
}

function reviewRowOf(review: ReviewSpan, context: TimelineContext): TimelineRowModel {
  const tokens = review.tokens === null ? '' : ` · ${TokenCountUtil.formatTokenCount(review.tokens)} tokens`;
  return {
    key:       `review-${String(review.round)}`,
    name:      review.label,
    monoText:  null,
    nameTitle: null,
    timeText:  durationTextOf(review.endEpochMilliseconds - review.startEpochMilliseconds, context.input.limits),
    bars:      [barOf('review', review, 'review', `${spanTitleOf(review, context.input)}${tokens}`, null, context)],
  };
}

function afterBuildRowsOf(afterBuild: readonly TimelineSpan[], context: TimelineContext): TimelineRowModel[] {
  const first = afterBuild[0];
  const last = afterBuild.at(-1);
  if (first === undefined || last === undefined) return [];
  const bars = afterBuild.map((segment, index) => {
    const widthPercent = percentAlong(context.axis, segment.endEpochMilliseconds) - percentAlong(context.axis, segment.startEpochMilliseconds);
    const label = widthPercent >= SEGMENT_LABEL_MINIMUM_PERCENT ? segment.label : null;
    return barOf('lifecycle', segment, `after-${String(index)}`, spanTitleOf(segment, context.input), label, context);
  });
  return [{
    key:       'after-build',
    name:      'After build',
    monoText:  null,
    nameTitle: null,
    timeText:  durationTextOf(last.endEpochMilliseconds - first.startEpochMilliseconds, context.input.limits),
    bars,
  }];
}

function ticketTimelineModelOf(input: TicketTimelineInput): TicketTimelineModel {
  const { ticket, ownRow, limits } = input;
  const closedState = closedStateOf(ticket);
  const closingStamp = closingStampOf(ticket, closedState);
  const filedEpochMilliseconds = TimeUtil.epochMillisecondsOf(ticket.filed) ?? input.nowEpochMilliseconds;
  const lastMoment = Math.max(filedEpochMilliseconds, TimeUtil.epochMillisecondsOf(closingStamp) ?? input.nowEpochMilliseconds);
  const axis = axisFor(filedEpochMilliseconds, lastMoment, limits);
  const context = { axis, input };
  const buildSegments = buildSegmentsOf(ownRow, lastMoment, closedState !== null);
  const firstSegment = buildSegments[0];
  const lastSegment = buildSegments.at(-1);
  const queueIsOpen = firstSegment === undefined && closedState === null;
  const queue = spanOf('pending', stateLabelOf('pending'), filedEpochMilliseconds, firstSegment?.startEpochMilliseconds ?? lastMoment, queueIsOpen);
  const queuedMilliseconds = queue.endEpochMilliseconds - queue.startEpochMilliseconds;
  const reviews = reviewSpansOf(input.reviewRows, lastMoment, closedState !== null);
  const afterBuild = afterBuildSpansOf({
    buildEndEpochMilliseconds:   buildEndOf(ticket, ownRow),
    reviews,
    reviewedEpochMilliseconds:   TimeUtil.epochMillisecondsOf(ownRow?.reviewed),
    closedState,
    lastMomentEpochMilliseconds: lastMoment,
  });
  const noBuildText = ownRow === null ? 'no row' : 'not started';
  const buildTimeText = firstSegment === undefined || lastSegment === undefined
    ? noBuildText
    : durationTextOf(lastSegment.endEpochMilliseconds - firstSegment.startEpochMilliseconds, limits);
  return {
    ticks: ticksFor(axis, limits),
    end:   endOf(axis, closedState, closingStamp, input),
    rows:  [
      filedRowOf(queue, `${queueIsOpen ? 'waiting' : 'queued'} ${durationTextOf(queuedMilliseconds, limits)}`, context),
      buildRowOf(buildSegments, buildTimeText, context),
      ...reviews.map((review) => reviewRowOf(review, context)),
      ...afterBuildRowsOf(afterBuild, context),
    ],
    legend: legendOf([queue, ...buildSegments, ...afterBuild], limits),
    note:   noteOf(input, firstSegment !== undefined, closedState, queuedMilliseconds),
  };
}

export const TicketTimelineModelUtil = Object.freeze({ ticketTimelineModelOf, percentAlong });
