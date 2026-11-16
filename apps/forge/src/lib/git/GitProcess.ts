/**
 * The git building block: `GitProcess.run` is the one place git is spawned, with paths printed unquoted and hooks off unless asked for,
 * and the modules beside it answer repository questions on it as verdicts. It depends on `src/lib/atomic-file`, through GitIgnore and Worktrees,
 * on `src/lib/executable-resolver`, whose host resolver finds git, since this one static spawn has no context to take a port from, and on
 * `src/lib/json-record` and `src/lib/versioned-registry`, through RepositoryLandings.
 */
import { existsSync, statSync } from 'node:fs';
import { join }                 from 'node:path';

import { hostExecutableResolver }   from '../executable-resolver/ExecutableResolverFor.ts';
import { repositoryRootWithoutGit } from './RepositoryRootWithoutGit.ts';
import { PORTABLE_GIT_SETTINGS }    from './constants/GitConventions.ts';
import { GitArgumentsUtil }         from './utils/GitArgumentsUtil.ts';

const GIT_SUCCESS_EXIT_CODE = 0;

// Callers parse paths out of git's output, which must not arrive octal-escaped and quoted.
const CONFIGURATION_OVERRIDES = GitArgumentsUtil.overrideArgumentsOf([['core.quotePath', 'false'], ...PORTABLE_GIT_SETTINGS]);

const HOOKS_OFF_FOLDER_NAME = 'hooks-off';

/**
 * A repository's hooks are worker-writable code, so a git spawned here runs none unless the caller asks for them. The hooks path lies below
 * the git program, a regular file, so no folder can ever be made there on any OS; `/dev/null` would read as `<drive>:\dev\null` on Windows.
 */
function hooksOffPathOf(gitProgram: string): string {
  return join(gitProgram, HOOKS_OFF_FOLDER_NAME);
}

export type GitHookPolicy = 'hooks-off' | 'repository-hooks';

export interface GitRun {
  exitCode:       number;
  standardOutput: string;
  standardError:  string;
}

/**
 * With a ceiling, git looks for a repository in `directory` and its parents below the ceiling only. A folder that lost its `.git` then
 * answers "not a git repository" and git never reaches a checkout above the ceiling. The environment is inherited, with the ceiling added.
 */
function ceilingEnvironmentOf(ceilingDirectory: string): Record<string, string | undefined> {
  return { ...Bun.env, GIT_CEILING_DIRECTORIES: ceilingDirectory };
}

/** The repository root is read from the `.git` entries on disk, so a worktree or a subfolder also forbids the main checkout. */
function forbiddenRootsOf(directory: string): string[] {
  const repositoryRoot = repositoryRootWithoutGit(directory);
  return repositoryRoot === null ? [directory] : [directory, repositoryRoot];
}

/** The whole command line `run` spawns, for a caller that hands it to a process of its own. */
function commandOf(gitProgramPath: string, gitArguments: readonly string[], hookPolicy: GitHookPolicy = 'hooks-off'): string[] {
  const hookOverrides = hookPolicy === 'hooks-off' ? GitArgumentsUtil.overrideArgumentsOf([['core.hooksPath', hooksOffPathOf(gitProgramPath)]]) : [];
  return [gitProgramPath, ...CONFIGURATION_OVERRIDES, ...hookOverrides, ...gitArguments];
}

/**
 * `null` when git could not be resolved or started. Resolved on each run, so no result outlives a change of PATH, and refused inside `directory`
 * or the repository it belongs to. No timeout: a git that hangs is the caller's to wait on.
 */
function run(
  directory: string, gitArguments: readonly string[], hookPolicy: GitHookPolicy = 'hooks-off', standardInput?: string, ceilingDirectory?: string
): GitRun | null {
  const gitExecutable = hostExecutableResolver().absolutePathOf('git', forbiddenRootsOf(directory));
  if (gitExecutable.verdict === 'refused') return null;
  try {
    const finished = Bun.spawnSync({
      cmd:         commandOf(gitExecutable.path, gitArguments, hookPolicy),
      cwd:         directory,
      stdout:      'pipe',
      stderr:      'pipe',
      windowsHide: true,
      ...(standardInput === undefined ? {} : { stdin: new TextEncoder().encode(standardInput) }),
      ...(ceilingDirectory === undefined ? {} : { env: ceilingEnvironmentOf(ceilingDirectory) }),
    });
    return {
      exitCode:       finished.exitCode,
      standardOutput: finished.stdout.toString(),
      standardError:  finished.stderr.toString().trim(),
    };
  } catch {
    return null;
  }
}

// Narrowed to the exit code rather than to GitRun, so a failed run stays a GitRun where the check is negated.
type SucceededGitRun = GitRun & { exitCode: typeof GIT_SUCCESS_EXIT_CODE };

function succeeded(finishedRun: GitRun | null): finishedRun is SucceededGitRun {
  return finishedRun !== null && finishedRun.exitCode === GIT_SUCCESS_EXIT_CODE;
}

/** Fail closed: a `stat` that errors reads as "not a directory", which git is never started in. */
function directoryExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function failureReasonOf(finishedRun: GitRun | null, gitArguments: readonly string[]): string {
  const command = `git ${gitArguments.join(' ')}`;
  if (finishedRun === null) return `${command} could not be started.`;
  return `${command} exited with ${finishedRun.exitCode}: ${finishedRun.standardError}`;
}

/** `--end-of-options`, so a revision written as `--output=x` is looked up rather than obeyed. */
function resolvedCommitOf(directory: string, revision: string, ceilingDirectory?: string): string | null {
  const finishedRun = run(directory, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`], 'hooks-off', undefined, ceilingDirectory);
  if (!succeeded(finishedRun)) return null;
  return finishedRun.standardOutput.trim();
}

export const GitProcess = {
  commandOf,
  directoryExists,
  failureReasonOf,
  resolvedCommitOf,
  run,
  succeeded,
} as const;
