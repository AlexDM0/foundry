/**
 * The finished-work choice as pure rules read from the forge's facts: which delivered or abandoned tickets and epics a choice lets through
 * beside the unfinished work, how it reads, and the key it is stored under. The clock arrives as a parameter; comparing with the cutoff is
 * a stated clock exception that decides only what the board shows.
 */
import type { BoardEpicDocument, BoardTicketDocument } from '../../@types/board/BoardTicketDocuments.ts';
import { TimeUtil, type DurationUnits }                from './TimeUtil.ts';

export type FinishedWorkSpan = '1h' | '1d' | '6h' | '12h' | '3d' | 'all';

/** A span, or `since-YYYY-MM-DD` for everything finished from that local midnight on. */
export type FinishedWorkChoice = FinishedWorkSpan | `since-${string}`;

/** The stored choice's name, under the board's preference key `gaia:board:<trackerId>:visibility`. */
export const FINISHED_WORK_CHOICE_NAME = 'visibility';

export const DEFAULT_FINISHED_WORK_CHOICE: FinishedWorkChoice = '1d';

/** The spans the menu offers; a stored `6h` or `12h` still applies and reads. */
export const OFFERED_FINISHED_WORK_SPANS: readonly FinishedWorkSpan[] = ['1h', '1d', '3d', 'all'];

const FINISHED_WORK_SPANS: readonly FinishedWorkSpan[] = ['1h', '1d', '6h', '12h', '3d', 'all'];

/** The hide-finished checkbox's old value, read as the default. */
const RETIRED_RECENT_VISIBILITY = 'recent';

const SINCE_CHOICE_PREFIX = 'since-';

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const MILLISECONDS_PER_HOUR = 3_600_000;

const HOURS_PER_DAY = 24;

const SETTLED_WORK_STATUSES: readonly string[] = ['delivered', 'abandoned'];

const SPAN_LABEL: Readonly<Record<FinishedWorkSpan, string>> = {
  '1h':  'last hour',
  '1d':  'last day',
  '6h':  '6 hours',
  '12h': '12 hours',
  '3d':  '3 days',
  'all': 'all',
};

const HIDING_WINDOW_TEXT: Readonly<Record<Exclude<FinishedWorkSpan, 'all'>, string>> = {
  '1h':  '1 hour',
  '1d':  '1 day',
  '6h':  '6 hours',
  '12h': '12 hours',
  '3d':  '3 days',
};

function spanOf(choice: string): FinishedWorkSpan | null {
  return FINISHED_WORK_SPANS.find((span) => span === choice) ?? null;
}

/** The local midnight a `YYYY-MM-DD` day starts at, or null when the text names no real day. */
function dayStartEpochMillisecondsOf(calendarDate: string): number | null {
  const match = CALENDAR_DATE_PATTERN.exec(calendarDate);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dayStart = new Date(year, month - 1, day);
  return dayStart.getFullYear() === year && dayStart.getMonth() === month - 1 && dayStart.getDate() === day ? dayStart.getTime() : null;
}

function sinceCalendarDateOf(choice: FinishedWorkChoice): string | null {
  return choice.startsWith(SINCE_CHOICE_PREFIX) ? choice.slice(SINCE_CHOICE_PREFIX.length) : null;
}

function sinceChoiceFor(calendarDate: string): FinishedWorkChoice | null {
  return dayStartEpochMillisecondsOf(calendarDate) === null ? null : `${SINCE_CHOICE_PREFIX}${calendarDate}`;
}

/** A stored or clicked value read as a choice; anything unreadable, and the retired `recent`, reads as the default. */
function choiceFrom(value: string | null): FinishedWorkChoice {
  if (value === null || value === RETIRED_RECENT_VISIBILITY) return DEFAULT_FINISHED_WORK_CHOICE;
  const span = spanOf(value);
  if (span !== null) return span;
  const calendarDate = value.startsWith(SINCE_CHOICE_PREFIX) ? value.slice(SINCE_CHOICE_PREFIX.length) : null;
  return (calendarDate === null ? null : sinceChoiceFor(calendarDate)) ?? DEFAULT_FINISHED_WORK_CHOICE;
}

/** Finished work at or after this moment shows; `-Infinity` for all. */
function cutoffEpochMillisecondsOf(choice: FinishedWorkChoice, nowEpochMilliseconds: number): number {
  const calendarDate = sinceCalendarDateOf(choice);
  if (calendarDate !== null) return dayStartEpochMillisecondsOf(calendarDate) ?? Number.NEGATIVE_INFINITY;
  const span = spanOf(choice);
  if (span === null || span === 'all') return Number.NEGATIVE_INFINITY;
  const hours = Number(span.slice(0, -1)) * (span.endsWith('d') ? HOURS_PER_DAY : 1);
  return nowEpochMilliseconds - hours * MILLISECONDS_PER_HOUR;
}

function epochMillisecondsOf(stamp: string | null | undefined): number | null {
  if (stamp === null || stamp === undefined) return null;
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? null : parsed;
}

/** When a delivered or abandoned ticket closed, or null for one still open; `updated` stands in for a closing stamp it lacks. */
function ticketFinishedEpochMillisecondsOf(ticket: BoardTicketDocument): number | null {
  if (!SETTLED_WORK_STATUSES.includes(ticket.status)) return null;
  return epochMillisecondsOf((ticket.status === 'delivered' ? ticket.delivered : ticket.abandonedAt) ?? ticket.updated);
}

/** When an epic whose tickets are all delivered or abandoned ended: its span's end, else its last ticket's close; null while open or empty. */
function epicFinishedEpochMillisecondsOf(epic: BoardEpicDocument, ticketFinishedMomentById: ReadonlyMap<string, number | null>): number | null {
  const counts = Object.entries(epic.ticketCountByStatus);
  const ticketCount = counts.reduce((total, [, count]) => total + count, 0);
  const settledCount = counts.filter(([status]) => SETTLED_WORK_STATUSES.includes(status)).reduce((total, [, count]) => total + count, 0);
  if (ticketCount === 0 || settledCount < ticketCount) return null;
  const ticketMoments = epic.ticketIds.flatMap((ticketId) => ticketFinishedMomentById.get(ticketId) ?? []);
  return epochMillisecondsOf(epic.span?.end) ?? (ticketMoments.length === 0 ? null : Math.max(...ticketMoments));
}

/** A task as far as its finishing moment reads it: its status, its stamps and its last phase. */
export interface FinishedTaskFacts {
  readonly status:   string;
  readonly start:    string | null;
  readonly end:      string | null;
  readonly history?: readonly { readonly at: string }[] | null;
}

/**
 * When a delivered or abandoned row finished, or null for a row still open: its end, else its start, else its last phase, else its
 * ticket's close.
 */
function taskFinishedEpochMillisecondsOf(task: FinishedTaskFacts, ticketFinishedEpochMilliseconds: number | null): number | null {
  if (!SETTLED_WORK_STATUSES.includes(task.status)) return null;
  return epochMillisecondsOf(task.end ?? task.start ?? task.history?.at(-1)?.at) ?? ticketFinishedEpochMilliseconds;
}

/** How many of the finishing moments a cutoff lets through; open work counts nowhere. */
function shownFinishedCountOf(finishedMoments: readonly (number | null)[], cutoffEpochMilliseconds: number): number {
  return finishedMoments.filter((moment) => moment !== null && moment >= cutoffEpochMilliseconds).length;
}

/** Unfinished work always shows, and so does finished work that cannot be dated. */
function finishedMomentIsShown(finishedEpochMilliseconds: number | null, cutoffEpochMilliseconds: number): boolean {
  return finishedEpochMilliseconds === null || finishedEpochMilliseconds >= cutoffEpochMilliseconds;
}

function ticketFinishedMomentsOf(tickets: readonly BoardTicketDocument[]): ReadonlyMap<string, number | null> {
  return new Map(tickets.map((ticket) => [ticket.id, ticketFinishedEpochMillisecondsOf(ticket)]));
}

/** Every open or empty epic, and the finished ones that ended at or after the cutoff. */
function shownEpicsOf(epics: readonly BoardEpicDocument[], tickets: readonly BoardTicketDocument[], cutoffEpochMilliseconds: number): BoardEpicDocument[] {
  const ticketMoments = ticketFinishedMomentsOf(tickets);
  return epics.filter((epic) => finishedMomentIsShown(epicFinishedEpochMillisecondsOf(epic, ticketMoments), cutoffEpochMilliseconds));
}

/** The delivered and abandoned tickets the choice lets through, latest closed first, and how many it hides. */
function finishedTicketsOf(tickets: readonly BoardTicketDocument[], cutoffEpochMilliseconds: number): { shown: BoardTicketDocument[]; hiddenCount: number } {
  const finished = tickets.flatMap((ticket) => {
    const moment = ticketFinishedEpochMillisecondsOf(ticket);
    return moment === null ? [] : [{ ticket, moment }];
  });
  const shown = finished.filter(({ moment }) => moment >= cutoffEpochMilliseconds).toSorted((a, b) => b.moment - a.moment);
  return { shown: shown.map(({ ticket }) => ticket), hiddenCount: finished.length - shown.length };
}

/** What a choice reads as: "last hour", "6 hours", "since 09-24". */
function labelOf(choice: FinishedWorkChoice): string {
  const calendarDate = sinceCalendarDateOf(choice);
  if (calendarDate !== null) return `since ${calendarDate.slice(calendarDate.indexOf('-') + 1)}`;
  const span = spanOf(choice);
  return span === null ? '' : SPAN_LABEL[span];
}

/** How the choice ends "finished …": "in the last hour", "in the last 6 hours", "since 09-24", "ever". */
function windowPhraseOf(choice: FinishedWorkChoice): string {
  if (choice === 'all') return 'ever';
  if (choice === '1h') return 'in the last hour';
  if (choice === '1d') return 'in the last day';
  return sinceCalendarDateOf(choice) === null ? `in the last ${labelOf(choice)}` : labelOf(choice);
}

/** The filter line, its window apart so it shows bold: "Hiding closed > **1 day**", "Hiding closed before **09-24**", "Showing all closed". */
function filterLineTextOf(choice: FinishedWorkChoice, hiddenItemCount: number): { readonly lead: string; readonly window: string } {
  if (hiddenItemCount === 0 || choice === 'all') return { lead: 'Showing all closed', window: '' };
  const calendarDate = sinceCalendarDateOf(choice);
  if (calendarDate !== null) return { lead: 'Hiding closed before ', window: calendarDate.slice(calendarDate.indexOf('-') + 1) };
  const span = spanOf(choice);
  return span === null || span === 'all' ? { lead: 'Showing all closed', window: '' } : { lead: 'Hiding closed > ', window: HIDING_WINDOW_TEXT[span] };
}

function countedNounOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "67 tickets · 1 epic hidden", or empty when nothing is hidden; it names tickets and epics, never rows. */
function hiddenWorkNoteTextOf(hiddenTicketCount: number, hiddenEpicCount: number): string {
  const parts = [
    ...(hiddenTicketCount > 0 ? [countedNounOf(hiddenTicketCount, 'ticket')] : []),
    ...(hiddenEpicCount > 0 ? [countedNounOf(hiddenEpicCount, 'epic')] : []),
  ];
  return parts.length === 0 ? '' : `${parts.join(' · ')} hidden`;
}

/** What the since field shows: the day in it, whether it is the choice, whether it is refused, and the line under it. */
export interface SinceFieldReading {
  readonly value:        string;
  readonly isChosen:     boolean;
  readonly isInvalid:    boolean;
  readonly resolvedText: string;
}

const INCOMPLETE_SINCE_TEXT = 'Pick a day, or a span above';

const FUTURE_SINCE_TEXT = 'That is after today';

/**
 * The since field after `typedValue` was typed into it, or, with `null`, as the choice leaves it: a chosen day resolves to its local
 * midnight and, given the board's units, how far back that is. Comparing the typed day with today is a stated clock exception that
 * decides only what the field says.
 */
function sinceFieldReadingOf(typedValue: string | null, choice: FinishedWorkChoice, nowEpochMilliseconds: number, units: DurationUnits | null): SinceFieldReading {
  const chosenDate = sinceCalendarDateOf(choice);
  const isChosen = chosenDate !== null;
  if (typedValue !== null) {
    if (sinceChoiceFor(typedValue) === null) return {
      value: typedValue, isChosen, isInvalid: false, resolvedText: INCOMPLETE_SINCE_TEXT
    };
    if (typedValue > TimeUtil.calendarDateOf(nowEpochMilliseconds)) return {
      value: typedValue, isChosen, isInvalid: true, resolvedText: FUTURE_SINCE_TEXT
    };
  }
  const dayStart = chosenDate === null ? null : dayStartEpochMillisecondsOf(chosenDate);
  if (chosenDate === null || dayStart === null) return {
    value: '', isChosen: false, isInvalid: false, resolvedText: ''
  };
  const durationBack = units === null ? null : TimeUtil.formatDuration(nowEpochMilliseconds - dayStart, units);
  return {
    value:        chosenDate,
    isChosen:     true,
    isInvalid:    false,
    resolvedText: `from ${TimeUtil.fullInstantText(dayStart)}${durationBack === null ? '' : ` · ${durationBack} back`}`,
  };
}

/** What a screen reader hears after a choice: the window, then what it hides. */
function choiceAnnouncementOf(choice: FinishedWorkChoice, hiddenNote: string): string {
  return `Showing unfinished work and work finished ${windowPhraseOf(choice)}. ${hiddenNote === '' ? 'Nothing hidden.' : `${hiddenNote}.`}`;
}

/** A span button's accessible name: "last day: 3 finished tickets shown". */
function spanButtonLabelOf(span: FinishedWorkSpan, shownCount: number, noun: string): string {
  return `${labelOf(span)}: ${countedNounOf(shownCount, `finished ${noun}`)} shown`;
}

export const FinishedWorkUtil = Object.freeze({
  choiceFrom,
  sinceChoiceFor,
  sinceCalendarDateOf,
  cutoffEpochMillisecondsOf,
  ticketFinishedEpochMillisecondsOf,
  taskFinishedEpochMillisecondsOf,
  shownFinishedCountOf,
  sinceFieldReadingOf,
  choiceAnnouncementOf,
  spanButtonLabelOf,
  shownEpicsOf,
  finishedTicketsOf,
  labelOf,
  windowPhraseOf,
  filterLineTextOf,
  hiddenWorkNoteTextOf,
});
