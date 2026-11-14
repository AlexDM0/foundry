/**
 * The words and machine values of Flint's brain in Agents: its run and its time left as minutes and seconds, the span the forge gave it, a
 * move's clock time to the second, its tokens shortened, its effort as a level of the four-bar mark, and who woke it, by place. Every time
 * is computed from the forge's stamps and the page's clock for display only; none decides anything.
 */
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const TWO_DIGITS = 2;
const THOUSAND = 1000;
const MILLION = 1_000_000;
const TENTHS_PER_UNIT = 10;

/** The four-bar effort mark's levels, by the effort words the forge's sessions take; an effort it does not know has no level. */
export const BRAIN_EFFORT_LEVEL_COUNT = 4;

const EFFORT_LEVELS: Readonly<Record<string, number>> = {
  low:    1,
  medium: 2,
  high:   3,
  max:    4,
};

const STARTED_BY_PLACES: Readonly<Record<'bridge' | 'gaia', string>> = {
  bridge: 'from the Bridge',
  gaia:   'from Gaia',
};

function epochMillisecondsOf(stamp: string | null): number | null {
  if (stamp === null) return null;
  const epochMilliseconds = Date.parse(stamp);
  return Number.isNaN(epochMilliseconds) ? null : epochMilliseconds;
}

/** `1:24`, `0:00`, `12:05`: a negative span reads as none. */
function minutesAndSecondsText(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / MILLISECONDS_PER_SECOND));
  return `${Math.floor(totalSeconds / SECONDS_PER_MINUTE)}:${String(totalSeconds % SECONDS_PER_MINUTE).padStart(TWO_DIGITS, '0')}`;
}

/** The time left to the forge's `endsAt`, which stops at `0:00`; `null` for a stamp that does not read as a time. */
function timeLeftText(endsAt: string | null, readAtMilliseconds: number): string | null {
  const endsAtMilliseconds = epochMillisecondsOf(endsAt);
  return endsAtMilliseconds === null ? null : minutesAndSecondsText(endsAtMilliseconds - readAtMilliseconds);
}

/** How long the brain has run since the forge started it, as `0:36`. */
function runTimeText(startedAt: string | null, readAtMilliseconds: number): string | null {
  const startedAtMilliseconds = epochMillisecondsOf(startedAt);
  return startedAtMilliseconds === null ? null : minutesAndSecondsText(readAtMilliseconds - startedAtMilliseconds);
}

/** The run the forge allows, from its start to its `endsAt`, as `2:00`. */
function spanText(startedAt: string | null, endsAt: string | null): string | null {
  const startedAtMilliseconds = epochMillisecondsOf(startedAt);
  const endsAtMilliseconds = epochMillisecondsOf(endsAt);
  return startedAtMilliseconds === null || endsAtMilliseconds === null ? null : minutesAndSecondsText(endsAtMilliseconds - startedAtMilliseconds);
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

function roundedToTenths(value: number): number {
  return Math.round(value * TENTHS_PER_UNIT) / TENTHS_PER_UNIT;
}

/** `950`, `3.1k`, `12k`, `1.2M`: a brain's tokens are few, so they read at a glance. Rounding picks the unit, so no count reads `1000k`. */
function shortCountText(count: number): string {
  if (count < THOUSAND) return String(count);
  const thousands = roundedToTenths(count / THOUSAND);
  if (thousands < THOUSAND) return `${thousands}k`;
  return `${roundedToTenths(count / MILLION)}M`;
}

function effortLevelOf(effort: string): number | null {
  return Object.hasOwn(EFFORT_LEVELS, effort) ? EFFORT_LEVELS[effort] ?? null : null;
}

function startedByPlaceOf(startedBy: 'bridge' | 'gaia' | null): string | null {
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
  shortCountText,
  effortLevelOf,
  startedByPlaceOf,
  moveTextOf,
} as const;
