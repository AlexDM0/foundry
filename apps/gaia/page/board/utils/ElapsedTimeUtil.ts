/**
 * How long ago a stamped moment was: in seconds-precise words for a running job (`42s`, `4m 12s`, `1h 02m 17s`), or as an age in its two
 * largest units for something that waits (`40s`, `49m`, `3h 22m`, `2d 4h`).
 */
import { MILLISECONDS_PER_SECOND } from '../../shared/constants/TimeUnits.ts';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;

function padToTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** A negative span, which a skewed clock can give, reads as `0s`. */
function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / MILLISECONDS_PER_SECOND));
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  if (hours > 0) return `${hours}h ${padToTwoDigits(minutes)}m ${padToTwoDigits(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${padToTwoDigits(seconds)}s`;
  return `${seconds}s`;
}

/** Seconds alone under a minute, minutes alone under an hour, then the two largest units unpadded; a negative span reads as `0s`. */
function formatAge(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / MILLISECONDS_PER_SECOND));
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function millisecondsSince(stamp: string | null, now: Date): number | null {
  if (stamp === null) return null;
  const startedEpochMilliseconds = Date.parse(stamp);
  return Number.isNaN(startedEpochMilliseconds) ? null : now.getTime() - startedEpochMilliseconds;
}

/** `null` for a missing or unreadable stamp, which shows no time rather than a wrong one. */
function elapsedSinceText(stamp: string | null, now: Date): string | null {
  const milliseconds = millisecondsSince(stamp, now);
  return milliseconds === null ? null : formatElapsed(milliseconds);
}

/** The age of what waits since the stamp; `null` for a missing or unreadable stamp. */
function ageSinceText(stamp: string | null, now: Date): string | null {
  const milliseconds = millisecondsSince(stamp, now);
  return milliseconds === null ? null : formatAge(milliseconds);
}

export const ElapsedTimeUtil = Object.freeze({
  formatElapsed, elapsedSinceText, formatAge, ageSinceText
});
