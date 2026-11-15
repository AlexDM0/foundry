/**
 * The wait between two reads of the log. What matters: a watch the platform refuses at its start, or fails after it, throws nothing out of
 * `await`, and its sweep timer still ends the wait, so the next read happens. The watches are fakes and the timers fake, so no platform decides.
 */
import {
  afterEach,
  describe,
  expect,
  jest,
  test
} from 'bun:test';

import type { PlatformWatch } from '../../../src/lib/quiet-watch/QuietWatch.ts';
import { changeOrSweep }      from './AwaitCommand.ts';

const EXAMPLE_FOLDER = '/example-agency/.agent-progress';
const AWAIT_SWEEP_MILLISECONDS = 1000;

afterEach(() => {
  jest.useRealTimers();
});

function settledFlagOf(wait: Promise<void>): { settled: boolean } {
  const flag = { settled: false };
  void wait.then(() => { flag.settled = true; });
  return flag;
}

describe('changeOrSweep', () => {
  test('a watch the platform refuses at its start leaves the wait on its sweep timer', async () => {
    jest.useFakeTimers();
    const refusingWatch: PlatformWatch = () => { throw new Error('ENOSPC: System limit for number of file watchers reached, watch'); };
    const wait = changeOrSweep(EXAMPLE_FOLDER, refusingWatch);
    const flag = settledFlagOf(wait);
    await Promise.resolve();
    expect(flag.settled).toBe(false);
    jest.advanceTimersByTime(AWAIT_SWEEP_MILLISECONDS);
    await wait;
    expect(flag.settled).toBe(true);
  });

  test('a watch the platform fails after the start is closed without a throw, and the sweep timer ends the wait', async () => {
    jest.useFakeTimers();
    // Until a listener is attached, the failure throws, as an emitter's unheard `error` event does.
    let raiseFailure: (error: Error) => void = (error) => { throw error; };
    let closes = 0;
    const failingWatch: PlatformWatch = () => {
      const handle = {
        close: () => { closes += 1; },
        on:    (_event: 'error', listener: (error: Error) => void) => {
          raiseFailure = listener;
          return handle;
        },
      };
      return handle;
    };
    const wait = changeOrSweep(EXAMPLE_FOLDER, failingWatch);
    expect(() => raiseFailure(new Error('EPERM: operation not permitted, watch'))).not.toThrow();
    jest.advanceTimersByTime(AWAIT_SWEEP_MILLISECONDS);
    await wait;
    expect(closes).toBeGreaterThan(0);
  });
});
