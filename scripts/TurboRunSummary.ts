/**
 * One turbo run with its run summary: runs the `turbo` on the search path with `--summarize` in a repository's folder, reads the summary
 * that run wrote under `.turbo/runs/` and removes it, so a gate leaves no file behind.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { join } from 'node:path';

/** A task with no script in its package, which turbo lists but never runs. */
export const TASK_WITHOUT_SCRIPT_COMMAND = '<NONEXISTENT>';

export interface SummarizedTask {
  readonly taskId:     string;
  readonly hash:       string;
  readonly command:    string;
  /** `HIT` when turbo replayed the task from its cache; absent on a dry run. */
  readonly cache?:     { readonly status: string };
  readonly execution?: { readonly exitCode: number };
}

export interface SummarizedRun {
  readonly turboExitCode: number;
  /** `undefined` when the run wrote no summary, or more than one appeared beside it. */
  readonly tasks:         SummarizedTask[] | undefined;
}

function runSummaryNames(runSummariesFolder: string): Set<string> {
  return new Set(existsSync(runSummariesFolder) ? readdirSync(runSummariesFolder) : []);
}

/** `turboArguments` follow `turbo`, such as `['run', 'test']`; the output goes to this process's own streams. */
export function summarizedRunOf(repositoryFolder: string, turboArguments: readonly string[]): SummarizedRun {
  const runSummariesFolder = join(repositoryFolder, '.turbo', 'runs');
  const summaryNamesBefore = runSummaryNames(runSummariesFolder);
  const turboRun = Bun.spawnSync(['turbo', ...turboArguments, '--summarize'], { cwd: repositoryFolder, stdout: 'inherit', stderr: 'inherit' });
  const newSummaryNames = [...runSummaryNames(runSummariesFolder)].filter((summaryName) => !summaryNamesBefore.has(summaryName));
  const [summaryName] = newSummaryNames;
  if (newSummaryNames.length !== 1 || summaryName === undefined) return { turboExitCode: turboRun.exitCode, tasks: undefined };
  const summaryPath = join(runSummariesFolder, summaryName);
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as { tasks?: SummarizedTask[] };
  rmSync(summaryPath, { force: true });
  return { turboExitCode: turboRun.exitCode, tasks: summary.tasks };
}
