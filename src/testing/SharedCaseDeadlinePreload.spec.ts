/**
 * The shared case deadline. What matters: `bunfig.toml` preloads the file, in this spec file as in any other. That the deadline outlives
 * Bun's five-second default is held by `src/testing/SharedCaseDeadlinePreload.integration.spec.ts`, since it takes the real clock that long.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import { expect, test } from 'bun:test';

test('the test run preloads the shared deadline', () => {
  expect(readFileSync(join(import.meta.dir, '..', '..', 'bunfig.toml'), 'utf8')).toContain('./src/testing/SharedCaseDeadlinePreload.ts');
});
