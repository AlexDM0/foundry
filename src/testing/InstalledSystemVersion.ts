/**
 * The installed version of each outside system a recording is stamped with. Reading the git version starts `git --version` and
 * nothing more: it tests nothing.
 */
import { release, type } from 'node:os';

import type { RecordedSystem } from './BoundaryRecordings.ts';

const GIT_VERSION_PREFIX = 'git version ';

function installedGitVersion(): string {
  const finished = Bun.spawnSync(['git', '--version'], { stdout: 'pipe', stderr: 'pipe' });
  if (finished.exitCode !== 0) return 'not installed';
  return finished.stdout.toString().trim().replace(GIT_VERSION_PREFIX, '');
}

export function installedVersionOf(system: RecordedSystem): string {
  if (system === 'git') return installedGitVersion();
  if (system === 'bun') return Bun.version;
  return `${type()} ${release()}`;
}
