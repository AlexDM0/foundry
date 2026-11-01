/**
 * Runs the real-system specs this branch's diff asks for, the step of `bun run verify` after the default suite. The diff is taken
 * from the nearest of `main` and the `group-*` branches, working tree and untracked files included, so a ticket on a group branch
 * answers for its own commits and the group branch for the whole group.
 */
import { join } from 'node:path';

import { INTEGRATION_SPEC_SUFFIX, integrationSpecsTouchedBy } from './BoundarySpecs.ts';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const MAIN_LINE_REFERENCES = ['refs/heads/main', 'refs/heads/group-*'];
// A later `--path-ignore-patterns` replaces the one in `bunfig.toml`, which is what keeps these specs out of a plain `bun test`.
const NOTHING_REAL_IGNORED_PATTERN = '.claude/**';

function gitLinesOf(gitArguments: readonly string[]): string[] {
  const finished = Bun.spawnSync(['git', ...gitArguments], { cwd: REPOSITORY_ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (finished.exitCode !== 0) throw new Error(`git ${gitArguments.join(' ')} failed: ${finished.stderr.toString().trim()}`);
  return finished.stdout.toString().split('\n').filter((line) => line.length > 0);
}

function commitsAheadOf(ancestor: string): number {
  return Number(gitLinesOf(['rev-list', '--count', `${ancestor}..HEAD`])[0]);
}

function nearestMainLineCommit(): string {
  const currentBranch = gitLinesOf(['branch', '--show-current'])[0];
  const forkCommits = gitLinesOf(['for-each-ref', '--format=%(refname:short)', ...MAIN_LINE_REFERENCES])
    .filter((branch) => branch !== currentBranch)
    .map((branch) => gitLinesOf(['merge-base', 'HEAD', branch])[0] ?? 'HEAD');
  return [...forkCommits].sort((a, b) => commitsAheadOf(a) - commitsAheadOf(b))[0] ?? 'HEAD';
}

function changedPaths(): string[] {
  return [
    ...gitLinesOf(['diff', '--name-only', '--no-renames', nearestMainLineCommit()]),
    ...gitLinesOf(['ls-files', '--others', '--exclude-standard']),
  ];
}

const integrationSpecPaths = [...new Bun.Glob(`**/*${INTEGRATION_SPEC_SUFFIX}`).scanSync({ cwd: REPOSITORY_ROOT })]
  .filter((path) => !path.startsWith('node_modules/'));
const touchedSpecPaths = integrationSpecsTouchedBy(changedPaths(), integrationSpecPaths);

if (touchedSpecPaths.length === 0) {
  console.log('No boundary was touched: no real-system spec runs.');
} else {
  console.log(`A boundary was touched: running ${touchedSpecPaths.length} real-system specs.`);
  const specArguments = touchedSpecPaths.map((specPath) => `./${specPath}`);
  const finished = Bun.spawnSync(['bun', 'test', `--path-ignore-patterns=${NOTHING_REAL_IGNORED_PATTERN}`, ...specArguments], {
    cwd:    REPOSITORY_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (finished.exitCode !== 0) process.exitCode = 1;
}
