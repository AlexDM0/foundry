/**
 * The shared case deadline. What matters: a case that names no deadline of its own outlives Bun's five-second default, which is what kills a
 * child at a case's deadline with exit 143; and `bunfig.toml` preloads the file, in this spec file as in any other. The case takes that long
 * because Bun exposes no reading of the deadline.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import { expect, test } from 'bun:test';

const PAST_THE_DEFAULT_DEADLINE_MILLISECONDS = 5_100;

test('a case naming no deadline outlives the five-second default', async () => {
  await Bun.sleep(PAST_THE_DEFAULT_DEADLINE_MILLISECONDS);
  expect(true).toBe(true);
});

test('the test run preloads the shared deadline', () => {
  expect(readFileSync(join(import.meta.dir, '..', '..', 'bunfig.toml'), 'utf8')).toContain('./src/testing/SharedCaseDeadlinePreload.ts');
});
