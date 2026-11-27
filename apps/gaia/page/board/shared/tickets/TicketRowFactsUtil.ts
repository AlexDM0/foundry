/**
 * What the rows of every Tickets segment say alike: a ticket's primary epic, its live agent and how that agent is named and looks, and the
 * stamps a row shows. A stamp or an age measured against the board's moment is a stated clock exception that decides only the text printed.
 */
import type { BoardDocument }                          from '../../../@types/board/BoardDocument.ts';
import type { BoardJobDocument }                       from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardEpicDocument, BoardTicketDocument } from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                      from '../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                               from '../../../shared/utils/CountTextUtil.ts';
import { ElapsedTimeUtil }                             from '../../utils/ElapsedTimeUtil.ts';
import { TimeUtil, type TimestampSlices }              from '../../utils/TimeUtil.ts';

/** The epic a row names, its colour slot and its title. */
export interface RowEpic {
  readonly title: string;
  readonly slot:  number;
}

/** The board's moment the rows are read at. */
export interface RowMoment {
  readonly nowEpochMilliseconds: number;
  readonly slices:               TimestampSlices;
}

/** Under an hour a wait reads as its age ("6m"); from then on as the stamp it began at ("13:05"), as a clock is easier to place. */
const WAIT_SHOWN_AS_AGE_BELOW_MILLISECONDS = 3_600_000;

/** The product owner's session job, which an intake runs and no ticket's work. */
const PRODUCT_OWNER_KIND = 'product-owner';

const REVIEWING_ROLES: ReadonlySet<string> = new Set(['reviewer', 're-reviewer', 'conflict-re-reviewer']);

const TODAY_WORD = 'today';

function primaryEpicOf(ticket: Pick<BoardTicketDocument, 'epics'>, epics: readonly BoardEpicDocument[]): RowEpic | null {
  const epic = ticket.epics.map((key) => epics.find((candidate) => candidate.key === key)).find((candidate) => candidate !== undefined);
  return epic === undefined ? null : { title: epic.title, slot: epic.slot };
}

/** The ticket's job at work on the board, an intake's session aside. */
function liveJobOf(board: Pick<BoardDocument, 'jobs'>, ticketId: string): BoardJobDocument | null {
  return board.jobs.find((job) => job.kind !== PRODUCT_OWNER_KIND && job.ticketIds.includes(ticketId)) ?? null;
}

/** `spec-agent` reads "spec agent", a job with no role its kind. */
function roleWordOf(role: string | null, kind: string): string {
  return (role ?? kind).replaceAll('-', ' ');
}

/** The state an agent's dot looks as: a review's teal, every other work's orange, both pulsing as running work does. */
function workingDotStateOf(role: string | null): BoardDisplayState {
  return role !== null && REVIEWING_ROLES.has(role) ? 'reviewing' : 'in-progress';
}

function tokensTextOf(tokens: number): string {
  return `${CountTextUtil.shortCountTextOf(tokens)} tokens`;
}

function stampTextOf(stamp: string, moment: RowMoment): string {
  return TimeUtil.shortStampText(stamp, TimeUtil.calendarDateOf(moment.nowEpochMilliseconds), moment.slices);
}

/** How long something has waited on User: its age under an hour, else the stamp it began at; `null` without a readable stamp. */
function waitedTextOf(stamp: string | null, moment: RowMoment): string | null {
  const startedEpochMilliseconds = TimeUtil.epochMillisecondsOf(stamp);
  if (stamp === null || startedEpochMilliseconds === null) return null;
  const waitedMilliseconds = moment.nowEpochMilliseconds - startedEpochMilliseconds;
  if (waitedMilliseconds < WAIT_SHOWN_AS_AGE_BELOW_MILLISECONDS) return ElapsedTimeUtil.formatAge(waitedMilliseconds);
  return stampTextOf(stamp, moment);
}

/** How long an agent has run, to the second: "4m 12s". */
function runningTextOf(stamp: string | null, moment: RowMoment): string | null {
  return ElapsedTimeUtil.elapsedSinceText(stamp, new Date(moment.nowEpochMilliseconds));
}

/** How old something under way is, in its two largest units: "9m", "2h 14m". */
function ageTextOf(stamp: string | null, moment: RowMoment): string | null {
  return ElapsedTimeUtil.ageSinceText(stamp, new Date(moment.nowEpochMilliseconds));
}

/** A stamp of the viewer's day reads "today 13:05", any other as its short stamp. */
function dayStampTextOf(stamp: string, moment: RowMoment): string {
  const shortText = stampTextOf(stamp, moment);
  return TimeUtil.stampIsFromDay(stamp, TimeUtil.calendarDateOf(moment.nowEpochMilliseconds), moment.slices) ? `${TODAY_WORD} ${shortText}` : shortText;
}

export const TicketRowFactsUtil = Object.freeze({
  primaryEpicOf,
  liveJobOf,
  roleWordOf,
  workingDotStateOf,
  tokensTextOf,
  stampTextOf,
  waitedTextOf,
  runningTextOf,
  ageTextOf,
  dayStampTextOf,
});
