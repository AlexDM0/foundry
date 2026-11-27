/** A CSS time in milliseconds, as a computed style or a custom property writes it: `220ms`, `0.22s`, or a list whose first entry counts. */
const MILLISECONDS_PER_SECOND = 1000;
const DURATION_PATTERN = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/u;

/** The first time of `cssTime` in milliseconds, or `null` when it is no time. */
function millisecondsOf(cssTime: string): number | null {
  const [firstTime = ''] = cssTime.split(',');
  const match = DURATION_PATTERN.exec(firstTime.trim());
  if (match === null) return null;
  const amount = Number(match[1]);
  return match[2] === 's' ? amount * MILLISECONDS_PER_SECOND : amount;
}

export const CssDurationUtil = Object.freeze({ millisecondsOf });
