/** Whether the git on the search path is new enough for this tool, read from `git version` before anything relies on it. */
import { GitProcess }        from './GitProcess.ts';
import { GIT_VERSION_FLOOR } from './constants/GitConventions.ts';

export type GitVersionVerdict =
  | { verdict: 'supported'; version: string }
  | { verdict: 'below-floor'; version: string; floor: string }
  /** No git started, or it printed no version this can read. */
  | { verdict: 'unreadable'; floor: string };

// `git version 2.39.5 (Apple Git-154)` and `git version 2.45.1.windows.1` both lead with major.minor.patch.
const VERSION_PATTERN = /^git version (\d+)\.(\d+)(?:\.(\d+))?/;

const FLOOR_TEXT = `${GIT_VERSION_FLOOR.major}.${GIT_VERSION_FLOOR.minor}`;

export function gitVersionVerdictOfOutput(printed: string): GitVersionVerdict {
  const match = VERSION_PATTERN.exec(printed.trim());
  if (match === null) return { verdict: 'unreadable', floor: FLOOR_TEXT };
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const version = match.slice(1).filter((part) => part !== undefined).join('.');
  const atTheFloor = major > GIT_VERSION_FLOOR.major || (major === GIT_VERSION_FLOOR.major && minor >= GIT_VERSION_FLOOR.minor);
  return atTheFloor ? { verdict: 'supported', version } : { verdict: 'below-floor', version, floor: FLOOR_TEXT };
}

/** Runs `git version` in `directory`, which only decides which git the search path resolves to. */
export function gitVersionVerdictIn(directory: string): GitVersionVerdict {
  const run = GitProcess.run(directory, ['version']);
  return GitProcess.succeeded(run) ? gitVersionVerdictOfOutput(run.standardOutput) : { verdict: 'unreadable', floor: FLOOR_TEXT };
}
