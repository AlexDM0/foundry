/**
 * Arrow-key movement inside a group that takes one tab stop: which index a key moves to, wrapping at both ends. Horizontal groups move on
 * the left and right arrows; groups on both axes also move on the up and down arrows. Home and End go to the ends.
 */
export type RovingAxis = 'horizontal' | 'both';

const STEP_BY_HORIZONTAL_KEY: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };
const STEP_BY_VERTICAL_KEY: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };
const END_KEYS: readonly string[] = ['Home', 'End'];

function stepOf(key: string, axis: RovingAxis): number | null {
  if (Object.hasOwn(STEP_BY_HORIZONTAL_KEY, key)) return STEP_BY_HORIZONTAL_KEY[key] ?? null;
  if (axis === 'both' && Object.hasOwn(STEP_BY_VERTICAL_KEY, key)) return STEP_BY_VERTICAL_KEY[key] ?? null;
  return null;
}

function isRovingKey(key: string, axis: RovingAxis): boolean {
  return stepOf(key, axis) !== null || END_KEYS.includes(key);
}

/** The index the key moves to, wrapping; `null` for a key that does not move. */
function targetIndexOf(key: string, currentIndex: number, count: number, axis: RovingAxis): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = stepOf(key, axis);
  if (step === null) return null;
  return (currentIndex + step + count) % count;
}

export const RovingFocusUtil = Object.freeze({ targetIndexOf, isRovingKey });
