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

/** How long an element's animation runs, its delay included: 0 when it has none, so a part with no motion goes at once. */
function animationMillisecondsOf(element: Element): number {
  const style = getComputedStyle(element);
  if (style.animationName === '' || style.animationName === 'none') return 0;
  return (millisecondsOf(style.animationDuration) ?? 0) + (millisecondsOf(style.animationDelay) ?? 0);
}

export const CssDurationUtil = Object.freeze({ millisecondsOf, animationMillisecondsOf });
