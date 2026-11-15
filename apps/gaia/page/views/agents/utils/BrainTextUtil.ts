/**
 * The words and machine values of Flint's brain in Agents: its run and its time left as minutes and seconds, the span the forge gave it, a
 * move's clock time to the second, its effort as a level of the four-bar mark, and who woke it, by place. Every time is computed from the
 * forge's stamps and the page's clock for display only; none decides anything.
 */
import { StampTextUtil } from '../../../shared/utils/StampTextUtil.ts';

/** The four-bar effort mark's levels, by the effort words the forge's sessions take; an effort it does not know has no level. */
export const BRAIN_EFFORT_LEVEL_COUNT = 4;

const EFFORT_LEVELS: Readonly<Record<string, number>> = {
  low:    1,
  medium: 2,
  high:   3,
  max:    4,
};

const STARTED_BY_PLACES: Readonly<Record<'bridge' | 'api', string>> = {
  bridge: 'from the Bridge',
  api:    'from Gaia',
};

function epochMillisecondsOf(stamp: string | null): number | null {
  if (stamp === null) return null;
  const epochMilliseconds = Date.parse(stamp);
  return Number.isNaN(epochMilliseconds) ? null : epochMilliseconds;
}

/** The time left to the forge's `endsAt`, which stops at `0:00`; `null` for a stamp that does not read as a time. */
function timeLeftText(endsAt: string | null, readAtMilliseconds: number): string | null {
  return endsAt === null ? null : StampTextUtil.countdownTextOf(endsAt, readAtMilliseconds);
}

/** How long the brain has run since the forge started it, as `0:36`. */
function runTimeText(startedAt: string | null, readAtMilliseconds: number): string | null {
  const startedAtMilliseconds = epochMillisecondsOf(startedAt);
  return startedAtMilliseconds === null ? null : StampTextUtil.minutesAndSecondsTextOf(readAtMilliseconds - startedAtMilliseconds);
}

/** The run the forge allows, from its start to its `endsAt`, as `2:00`. */
function spanText(startedAt: string | null, endsAt: string | null): string | null {
  const startedAtMilliseconds = epochMillisecondsOf(startedAt);
  const endsAtMilliseconds = epochMillisecondsOf(endsAt);
  return startedAtMilliseconds === null || endsAtMilliseconds === null ? null : StampTextUtil.minutesAndSecondsTextOf(endsAtMilliseconds - startedAtMilliseconds);
}

/** `13:20:34` in the page's time zone; `null` for a stamp that does not read as a time. */
function clockTimeToTheSecondOf(stamp: string, timeZone: string | undefined): string | null {
  const epochMilliseconds = epochMillisecondsOf(stamp);
  if (epochMilliseconds === null) return null;
  return new Intl.DateTimeFormat('en-GB', {
    hour:      '2-digit',
    minute:    '2-digit',
    second:    '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(epochMilliseconds);
}

function effortLevelOf(effort: string): number | null {
  return Object.hasOwn(EFFORT_LEVELS, effort) ? EFFORT_LEVELS[effort] ?? null : null;
}

function startedByPlaceOf(startedBy: 'bridge' | 'api' | null): string | null {
  return startedBy === null ? null : STARTED_BY_PLACES[startedBy];
}

/** A move as the forge words it: what it chose, then how it showed it, if it did. */
function moveTextOf(move: { readonly intent: string; readonly emote: string | null }): string {
  return move.emote === null ? move.intent : `${move.intent} · ${move.emote}`;
}

export const BrainTextUtil = {
  timeLeftText,
  runTimeText,
  spanText,
  clockTimeToTheSecondOf,
  effortLevelOf,
  startedByPlaceOf,
  moveTextOf,
} as const;
