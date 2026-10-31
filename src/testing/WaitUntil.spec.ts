/**
 * The shared wait. What matters: it returns as soon as the state holds, however many polls that takes; `firstValueOf` hands back the value
 * that ended the wait; and a condition that never holds ends in an error naming what was waited for, so a broken case does not read as a timeout.
 */
import {
  afterEach,
  expect,
  spyOn,
  test
} from 'bun:test';

import { blockUntil, firstValueOf, waitUntil } from './WaitUntil.ts';

const NANOSECONDS_PER_CLOCK_READ = 40_000_000_000;

/** Each clock read lands forty seconds on, so the budget runs out on the third read however fast the case runs. */
function fakeClockOfSlowReads(): void {
  let nanoseconds = 0;
  spyOn(Bun, 'nanoseconds').mockImplementation(() => {
    nanoseconds += NANOSECONDS_PER_CLOCK_READ;
    return nanoseconds;
  });
}

afterEach(() => {
  spyOn(Bun, 'sleep').mockRestore();
  spyOn(Bun, 'sleepSync').mockRestore();
  spyOn(Bun, 'nanoseconds').mockRestore();
});

test('waitUntil returns once the condition holds, an async one included', async () => {
  let reads = 0;
  await waitUntil(() => {
    reads += 1;
    return Promise.resolve(reads === 3);
  }, 'the third read', 1);
  expect(reads).toBe(3);
});

test('firstValueOf answers the first value that is not undefined, a falsy one included', async () => {
  const answers = [undefined, undefined, 0];
  expect(await firstValueOf(() => answers.shift(), 'an answer', 1)).toBe(0);
  expect(answers).toEqual([]);
});

test('a condition that never holds fails naming what was waited for, read only then', async () => {
  spyOn(Bun, 'sleep').mockImplementation(() => Promise.resolve());
  fakeClockOfSlowReads();
  let descriptionReads = 0;
  const describeIt = (): string => {
    descriptionReads += 1;
    return 'the example state';
  };
  await waitUntil(() => true, describeIt);
  expect(descriptionReads).toBe(0);
  await expect(waitUntil(() => false, describeIt)).rejects.toThrow('Never happened: the example state');
});

test('the budget is elapsed time, so reads too slow to poll often still fail inside the case deadline', async () => {
  spyOn(Bun, 'sleep').mockImplementation(() => Promise.resolve());
  fakeClockOfSlowReads();
  let reads = 0;
  await expect(firstValueOf(() => {
    reads += 1;
    return undefined;
  }, 'the slow state')).rejects.toThrow('Never happened: the slow state');
  expect(reads).toBe(1);
});

test('blockUntil returns once the condition holds and fails naming what it blocked on', () => {
  spyOn(Bun, 'sleepSync').mockImplementation(() => undefined);
  let reads = 0;
  blockUntil(() => {
    reads += 1;
    return reads === 2;
  }, 'the second read');
  expect(reads).toBe(2);
  fakeClockOfSlowReads();
  expect(() => blockUntil(() => false, 'the example state')).toThrow('Never happened: the example state');
});
