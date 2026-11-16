/**
 * Every git call a spec's own process asks of the mocked `GitProcess`, from `startGitCallLog` until `stop`: the folder, the arguments, the
 * hook policy, the standard input and the ceiling, with each scratch folder written as its placeholder, so two runs of one flow compare.
 */
import { realpathSync } from 'node:fs';

import { GitProcess } from '../lib/git/GitProcess.ts';

export interface LoggedGitCall {
  readonly folder:        string;
  readonly gitArguments:  readonly string[];
  readonly hookPolicy:    string;
  readonly standardInput: string | null;
  readonly ceiling:       string | null;
}

export interface GitCallLog {
  /** Each distinct call, in the order of its text, so a flow whose passes ask git as often as they run still compares. */
  distinctCalls: () => LoggedGitCall[];
  /** Puts the mocked `GitProcess` back as the log found it. */
  stop:          () => void;
}

function resolvedCommitArgumentsOf(revision: string): string[] {
  return ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`];
}

/** `placeholderOfFolder` maps a scratch folder a spec made to its placeholder, such as `<repository>`; each is matched resolved and as named. */
export function startGitCallLog(placeholderOfFolder: Readonly<Record<string, string>>): GitCallLog {
  const replacements = Object.entries(placeholderOfFolder)
    .flatMap(([folder, placeholder]) => [[realpathSync(folder), placeholder], [folder, placeholder]] as const)
    .sort(([a], [b]) => b.length - a.length);
  const withPlaceholders = (text: string): string => replacements.reduce((replaced, [folder, placeholder]) => replaced.replaceAll(folder, placeholder), text);
  const calls = new Map<string, LoggedGitCall>();
  const note = (call: LoggedGitCall): void => {
    const logged = {
      folder:        withPlaceholders(call.folder),
      gitArguments:  call.gitArguments.map(withPlaceholders),
      hookPolicy:    call.hookPolicy,
      standardInput: call.standardInput === null ? null : withPlaceholders(call.standardInput),
      ceiling:       call.ceiling === null ? null : withPlaceholders(call.ceiling),
    };
    calls.set(JSON.stringify(logged), logged);
  };
  const { run, resolvedCommitOf } = GitProcess;
  Object.assign(GitProcess, {
    run: (...runArguments: Parameters<typeof run>) => {
      const [directory, gitArguments, hookPolicy = 'hooks-off', standardInput, ceilingDirectory] = runArguments;
      note({
        folder: directory, gitArguments, hookPolicy, standardInput: standardInput ?? null, ceiling: ceilingDirectory ?? null
      });
      return run(...runArguments);
    },
    resolvedCommitOf: (directory: string, revision: string, ceilingDirectory?: string) => {
      note({
        folder: directory, gitArguments: resolvedCommitArgumentsOf(revision), hookPolicy: 'hooks-off', standardInput: null, ceiling: ceilingDirectory ?? null
      });
      return resolvedCommitOf(directory, revision, ceilingDirectory);
    },
  });
  return {
    distinctCalls: () => [...calls.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, call]) => call),
    stop:          () => {
      Object.assign(GitProcess, { run, resolvedCommitOf });
    },
  };
}
