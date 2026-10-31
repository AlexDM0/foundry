/**
 * The one wait of the specs: a condition polled on the state it names, never a fixed sleep before an assertion. The wait budget stays inside the
 * case deadline, however slow each read is, so a condition that never holds fails with its own `what` rather than a bare case timeout.
 */
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from './ChildProcessCaseTimeout.ts';

const DEFAULT_POLL_INTERVAL_MILLISECONDS = 10;
const WAIT_BUDGET_MILLISECONDS = CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS * 2 / 3;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

/** For a fixture process only a stop may end: living past every wait, it cannot end by itself and pass a wait for that stop. */
export const OUTLIVES_EVERY_WAIT_SECONDS = 600;

/** Text the failure carries; a function is read only once the wait failed, so it can name the logs of that moment. */
type WaitDescription = string | (() => string);

function textOf(what: WaitDescription): string {
  return typeof what === 'string' ? what : what();
}

// A clock exception: it only ends a wait that already failed, so no passing verdict reads it.
function budgetHasRunOut(startNanoseconds: number): boolean {
  return (Bun.nanoseconds() - startNanoseconds) / NANOSECONDS_PER_MILLISECOND >= WAIT_BUDGET_MILLISECONDS;
}

/** The first value `read` answers that is not `undefined`. */
export async function firstValueOf<Value>(
  read: () => Value | undefined | Promise<Value | undefined>,
  what: WaitDescription,
  intervalMilliseconds = DEFAULT_POLL_INTERVAL_MILLISECONDS,
): Promise<Value> {
  const startNanoseconds = Bun.nanoseconds();
  while (!budgetHasRunOut(startNanoseconds)) {
    const value = await read();
    if (value !== undefined) return value;
    await Bun.sleep(intervalMilliseconds);
  }
  throw new Error(`Never happened: ${textOf(what)}`);
}

export async function waitUntil(
  holds: () => boolean | Promise<boolean>,
  what: WaitDescription,
  intervalMilliseconds = DEFAULT_POLL_INTERVAL_MILLISECONDS,
): Promise<void> {
  await firstValueOf(async () => (await holds() ? true : undefined), what, intervalMilliseconds);
}

/** For a synchronous hook that must hold the event loop until a child process has acted. */
export function blockUntil(holds: () => boolean, what: WaitDescription): void {
  const startNanoseconds = Bun.nanoseconds();
  while (!budgetHasRunOut(startNanoseconds)) {
    if (holds()) return;
    Bun.sleepSync(DEFAULT_POLL_INTERVAL_MILLISECONDS);
  }
  throw new Error(`Never happened: ${textOf(what)}`);
}
