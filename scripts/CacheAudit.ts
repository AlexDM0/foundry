/**
 * The merge gate's audit of the one shared turbo cache: re-runs, past the cache, every cached task of the packages that changed since
 * the target and of their dependents, and removes the cache entry of each task that fails, so no planted pass outlives a landing.
 * Usage: `bun run cache:audit [<target reference>]`, the target `main` by default; exits 1 on any red task.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join }                                 from 'node:path';

const AUDITED_TASKS = ['typecheck', 'lint', 'test', 'test:dom'];
const DEFAULT_TARGET_REFERENCE = 'main';
const TASK_WITHOUT_SCRIPT_COMMAND = '<NONEXISTENT>';

interface SummarizedTask {
  readonly taskId:     string;
  readonly hash:       string;
  readonly command:    string;
  readonly execution?: { readonly exitCode: number };
}

const repositoryFolder = join(import.meta.dir, '..');
const runSummariesFolder = join(repositoryFolder, '.turbo', 'runs');

function runSummaryNames(): Set<string> {
  return new Set(existsSync(runSummariesFolder) ? readdirSync(runSummariesFolder) : []);
}

/** Turbo keeps one cache for every worktree, beside the main worktree's git folder, which `git --git-common-dir` names. */
function sharedCacheFolder(): string {
  const commonGitFolder = Bun.spawnSync(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repositoryFolder });
  if (commonGitFolder.exitCode !== 0) {
    throw new Error(`git could not name the common git folder of ${repositoryFolder}`);
  }
  return join(dirname(commonGitFolder.stdout.toString().trim()), '.turbo', 'cache');
}

function removeCacheEntriesOf(redTasks: readonly SummarizedTask[]): void {
  const cacheFolder = sharedCacheFolder();
  const cacheFileNames = existsSync(cacheFolder) ? readdirSync(cacheFolder) : [];
  for (const redTask of redTasks) {
    const entryFileNames = cacheFileNames.filter((fileName) => fileName.startsWith(`${redTask.hash}.`) || fileName.startsWith(`${redTask.hash}-`));
    for (const entryFileName of entryFileNames) {
      rmSync(join(cacheFolder, entryFileName), { force: true });
    }
    console.error(`cache:audit: ${redTask.taskId} is red; removed ${entryFileNames.length} cache files of ${redTask.hash}.`);
  }
}

function auditedRunSummary(targetReference: string): { turboExitCode: number; tasks: SummarizedTask[] | undefined } {
  const summaryNamesBefore = runSummaryNames();
  const turboRun = Bun.spawnSync([
    join(repositoryFolder, 'node_modules', '.bin', 'turbo'),
    'run',
    ...AUDITED_TASKS,
    '--force',
    '--continue',
    `--filter=...[${targetReference}]`,
    '--summarize',
    '--output-logs=errors-only',
    '--log-order=grouped',
  ], { cwd: repositoryFolder, stdout: 'inherit', stderr: 'inherit' });
  const newSummaryNames = [...runSummaryNames()].filter((summaryName) => !summaryNamesBefore.has(summaryName));
  const [summaryName] = newSummaryNames;
  if (newSummaryNames.length !== 1 || summaryName === undefined) {
    return { turboExitCode: turboRun.exitCode, tasks: undefined };
  }
  const summaryPath = join(runSummariesFolder, summaryName);
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as { tasks?: SummarizedTask[] };
  rmSync(summaryPath, { force: true });
  return { turboExitCode: turboRun.exitCode, tasks: summary.tasks };
}

function auditExitCode(targetReference: string): number {
  const { turboExitCode, tasks } = auditedRunSummary(targetReference);
  if (tasks === undefined) {
    console.error('cache:audit: turbo wrote no run summary, so no task could be audited.');
    return 1;
  }
  const redTasks = tasks.filter((task) => task.command !== TASK_WITHOUT_SCRIPT_COMMAND && task.execution?.exitCode !== 0);
  removeCacheEntriesOf(redTasks);
  return redTasks.length > 0 || turboExitCode !== 0 ? 1 : 0;
}

process.exit(auditExitCode(process.argv[2] ?? DEFAULT_TARGET_REFERENCE));
