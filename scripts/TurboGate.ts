/**
 * A forge tracker's gate for one app of the monorepo: every workspace's cached tasks through turbo, then the app's own uncached `check`.
 * The cached run's summary becomes the gate's cache report, written where forge asked for it.
 */
import { GATE_REPORT_VARIABLE, writeGateReport } from './GateCacheReport.ts';
import { summarizedRunOf }                       from './TurboRunSummary.ts';

const CACHED_TASKS = ['typecheck', 'lint', 'test', 'test:dom'];
const OUTPUT_ARGUMENTS = ['--output-logs=errors-only', '--log-order=grouped'];

export const TURBO_GATE_USAGE = [
  'Usage: bun scripts/TurboGate.ts <workspace>',
  'Runs typecheck, lint, test and test:dom of every workspace through turbo, then the check of <workspace>, such as forge or gaia.',
].join('\n');

/** The workspace whose `check` closes the gate; `null` for anything but one plain name. */
export function gateWorkspaceOf(commandLineArguments: readonly string[]): string | null {
  const [workspace] = commandLineArguments;
  if (commandLineArguments.length !== 1 || workspace === undefined || workspace.startsWith('-') || workspace === '') return null;
  return workspace;
}

/** Gates the repository at `workingFolder`, writing the cache report at `reportPath` when forge handed one. */
export function turboGateExitCode(commandLineArguments: readonly string[], workingFolder: string, reportPath: string | undefined): number {
  const workspace = gateWorkspaceOf(commandLineArguments);
  if (workspace === null) {
    console.error(TURBO_GATE_USAGE);
    return 1;
  }
  const cachedRun = summarizedRunOf(workingFolder, ['run', ...CACHED_TASKS, '--continue=dependencies-successful', ...OUTPUT_ARGUMENTS]);
  writeGateReport(reportPath, cachedRun.tasks);
  if (cachedRun.turboExitCode !== 0) return cachedRun.turboExitCode;
  const checkRun = Bun.spawnSync(['turbo', 'run', 'check', `--filter=${workspace}`, ...OUTPUT_ARGUMENTS], { cwd: workingFolder, stdout: 'inherit', stderr: 'inherit' });
  return checkRun.exitCode;
}

if (import.meta.main) {
  process.exit(turboGateExitCode(process.argv.slice(2), process.cwd(), process.env[GATE_REPORT_VARIABLE]));
}
