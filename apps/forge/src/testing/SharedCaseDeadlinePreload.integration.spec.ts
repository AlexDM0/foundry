/**
 * The shared case deadline on the real clock. What matters: a case that names no deadline of its own outlives Bun's five-second default,
 * which is what kills a child at a case's deadline with exit 143. The case takes that long because Bun exposes no reading of the deadline.
 */
import { expect, test } from 'bun:test';

const PAST_THE_DEFAULT_DEADLINE_MILLISECONDS = 5_100;

test('a case naming no deadline outlives the five-second default', async () => {
  await Bun.sleep(PAST_THE_DEFAULT_DEADLINE_MILLISECONDS);
  expect(true).toBe(true);
});
