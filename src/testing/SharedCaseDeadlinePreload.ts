/**
 * Puts every spec file on the one shared case deadline. A case reaches a child through helpers too (git in a scratch repository), so this is a
 * property of the run rather than of each `test` call; Bun resets `setDefaultTimeout` per file, so it is prepended to each spec's first line,
 * which keeps every line number. Hooks read the same default.
 */
import { readFileSync } from 'node:fs';
import { plugin }       from 'bun';

import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS } from './ChildProcessCaseTimeout.ts';

const DEADLINE_LINE_PREFIX = `import { setDefaultTimeout as setSharedCaseDeadline } from 'bun:test'; setSharedCaseDeadline(${CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS}); `;

await plugin({
  name:  'shared-case-deadline',
  setup: (build) => {
    build.onLoad({ filter: /\.spec\.ts$/ }, ({ path }) => ({ loader: 'ts', contents: `${DEADLINE_LINE_PREFIX}${readFileSync(path, 'utf8')}` }));
  },
});
