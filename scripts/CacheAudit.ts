/**
 * The merge gate's audit of the one shared turbo cache: re-runs, past the cache, every cached task of the packages that changed since
 * the target and of their dependents, and removes the cache entry of each task that fails, so no planted pass outlives a landing.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { dirname, join } from 'node:path';

const AUDITED_TASKS = ['typecheck', 'lint', 'test', 'test:dom'];
const DEFAULT_TARGET_REFERENCE = 'main';
const TASK_WITHOUT_SCRIPT_COMMAND = '<NONEXISTENT>';
const HELP_ARGUMENTS: readonly string[] = ['--help', '-h'];

export const CACHE_AUDIT_USAGE = [
  'Usage: bun run cache:audit [<target reference>]',
  `Audits what changed since <target reference>, \`${DEFAULT_TARGET_REFERENCE}\` when none is named, since forge hands a gate no target.`,
  'Exits 1 on any red task, after removing its cache entry.',
].join('\n');

export interface SummarizedTask {
  readonly taskId:     string;
  readonly hash:       string;
  readonly command:    string;
  readonly execution?: { readonly exitCode: number };
}

export type CacheAuditRequest =
  | { readonly kind: 'audit'; readonly targetReference: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'refused' };

export function cacheAuditRequestOf(commandLineArguments: readonly string[]): CacheAuditRequest {
  const [firstArgument] = commandLineArguments;
  if (commandLineArguments.length > 1) return { kind: 'refused' };
  if (firstArgument === undefined) return { kind: 'audit', targetReference: DEFAULT_TARGET_REFERENCE };
  if (HELP_ARGUMENTS.includes(firstArgument)) return { kind: 'help' };
  if (firstArgument.startsWith('-')) return { kind: 'refused' };
  return { kind: 'audit', targetReference: firstArgument };
}

/** A task with no execution never ran, so nothing vouches for its cache entry either. */
export function redTasksOf(tasks: readonly SummarizedTask[]): SummarizedTask[] {
  return tasks.filter((task) => task.command !== TASK_WITHOUT_SCRIPT_COMMAND && task.execution?.exitCode !== 0);
}

export function cacheEntryFileNamesOf(hash: string, cacheFileNames: readonly string[]): string[] {
  return cacheFileNames.filter((fileName) => fileName.startsWith(`${hash}.`) || fileName.startsWith(`${hash}-`));
}

export function removeCacheEntriesOf(cacheFolder: string, redTasks: readonly SummarizedTask[]): void {
  const cacheFileNames = existsSync(cacheFolder) ? readdirSync(cacheFolder) : [];
  for (const redTask of redTasks) {
    const entryFileNames = cacheEntryFileNamesOf(redTask.hash, cacheFileNames);
    for (const entryFileName of entryFileNames) {
      rmSync(join(cacheFolder, entryFileName), { force: true });
    }
    console.error(`cache:audit: ${redTask.taskId} is red; removed ${entryFileNames.length} cache files of ${redTask.hash}.`);
  }
}

function gitAnswer(workingFolder: string, gitArguments: readonly string[]): string | undefined {
  const finished = Bun.spawnSync(['git', ...gitArguments], { cwd: workingFolder, stderr: 'ignore' });
  return finished.exitCode === 0 ? finished.stdout.toString().trim() : undefined;
}

function runSummaryNames(runSummariesFolder: string): Set<string> {
  return new Set(existsSync(runSummariesFolder) ? readdirSync(runSummariesFolder) : []);
}

function auditedRunSummary(repositoryFolder: string, targetReference: string): { turboExitCode: number; tasks: SummarizedTask[] | undefined } {
  const runSummariesFolder = join(repositoryFolder, '.turbo', 'runs');
  const summaryNamesBefore = runSummaryNames(runSummariesFolder);
  const turboRun = Bun.spawnSync([
    'turbo',
    'run',
    ...AUDITED_TASKS,
    '--force',
    '--continue',
    `--filter=...[${targetReference}]`,
    '--summarize',
    '--output-logs=errors-only',
    '--log-order=grouped',
  ], { cwd: repositoryFolder, stdout: 'inherit', stderr: 'inherit' });
  const newSummaryNames = [...runSummaryNames(runSummariesFolder)].filter((summaryName) => !summaryNamesBefore.has(summaryName));
  const [summaryName] = newSummaryNames;
  if (newSummaryNames.length !== 1 || summaryName === undefined) {
    return { turboExitCode: turboRun.exitCode, tasks: undefined };
  }
  const summaryPath = join(runSummariesFolder, summaryName);
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as { tasks?: SummarizedTask[] };
  rmSync(summaryPath, { force: true });
  return { turboExitCode: turboRun.exitCode, tasks: summary.tasks };
}

/** Audits the repository `workingFolder` is in with the `turbo` on the search path, which `bun run` puts the workspace's first on. */
export function cacheAuditExitCode(commandLineArguments: readonly string[], workingFolder: string): number {
  const request = cacheAuditRequestOf(commandLineArguments);
  if (request.kind === 'help') {
    console.log(CACHE_AUDIT_USAGE);
    return 0;
  }
  if (request.kind === 'refused') {
    console.error(CACHE_AUDIT_USAGE);
    return 1;
  }
  const repositoryFolder = gitAnswer(workingFolder, ['rev-parse', '--show-toplevel']);
  const commonGitFolder = gitAnswer(workingFolder, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (repositoryFolder === undefined || commonGitFolder === undefined) {
    console.error(`cache:audit: ${workingFolder} is in no git repository.`);
    return 1;
  }
  if (gitAnswer(workingFolder, ['rev-parse', '--verify', '--quiet', `${request.targetReference}^{commit}`]) === undefined) {
    console.error(`cache:audit: ${request.targetReference} names no commit.\n${CACHE_AUDIT_USAGE}`);
    return 1;
  }
  const { turboExitCode, tasks } = auditedRunSummary(repositoryFolder, request.targetReference);
  if (tasks === undefined) {
    console.error('cache:audit: turbo wrote no run summary, so no task could be audited.');
    return 1;
  }
  const redTasks = redTasksOf(tasks);
  // Turbo keeps one cache for every worktree, beside the main worktree's git folder.
  removeCacheEntriesOf(join(dirname(commonGitFolder), '.turbo', 'cache'), redTasks);
  return redTasks.length > 0 || turboExitCode !== 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(cacheAuditExitCode(process.argv.slice(2), process.cwd()));
}
