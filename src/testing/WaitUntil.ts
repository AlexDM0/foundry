/**
 * The one wait of the specs: a condition polled on the state it names, never a fixed sleep before an assertion. The poll budget stays inside the
 * case deadline, so a condition that never holds fails with its own `what` rather than a bare case timeout, and a slow machine only polls longer.
 */
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from './ChildProcessCaseTimeout.ts';

const DEFAULT_POLL_INTERVAL_MILLISECONDS = 10;
const WAIT_BUDGET_MILLISECONDS = CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS * 2 / 3;

/** Text the failure carries; a function is read only once the wait failed, so it can name the logs of that moment. */
type WaitDescription = string | (() => string);

function textOf(what: WaitDescription): string {
  return typeof what === 'string' ? what : what();
}

function pollBudget(intervalMilliseconds: number): number {
  return Math.ceil(WAIT_BUDGET_MILLISECONDS / intervalMilliseconds);
}

/** The first value `read` answers that is not `undefined`. */
export async function firstValueOf<Value>(
  read: () => Value | undefined | Promise<Value | undefined>,
  what: WaitDescription,
  intervalMilliseconds = DEFAULT_POLL_INTERVAL_MILLISECONDS,
): Promise<Value> {
  for (let poll = 0; poll < pollBudget(intervalMilliseconds); poll += 1) {
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
  for (let poll = 0; poll < pollBudget(DEFAULT_POLL_INTERVAL_MILLISECONDS); poll += 1) {
    if (holds()) return;
    Bun.sleepSync(DEFAULT_POLL_INTERVAL_MILLISECONDS);
  }
  throw new Error(`Never happened: ${textOf(what)}`);
}
