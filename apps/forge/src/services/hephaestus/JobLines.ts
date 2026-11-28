/**
 * A job's line children under Talos: each step's line launched as a numbered instance in its own folder, and the newest instance's end and
 * output read back.
 */
import { rmSync }                        from 'node:fs';
import { join }                          from 'node:path';
import type { ChildEnd }                 from '../../domain/talos/ChildRecord.ts';
import type { Job, PipelineStepRun }     from '../../domain/tracker-model/@types/Job.ts';
import type { Pipeline }                 from '../../domain/tracker-model/@types/Pipeline.ts';
import { confinedLineOf }                from '../../lib/gate-confinement/ConfinedLine.ts';
import type { ProcessIdentity }          from '../../lib/process-identity/ProcessIdentity.ts';
import type { ShellExitReport }          from '../../lib/shell-line/ShellLine.ts';
import type { ConfinementRefusal }       from '../../shared/@types/ConfinementRefusal.ts';
import { LINE_TIME_BOUND_MILLISECONDS }  from '../../shared/constants/HephaestusLimits.ts';
import { type GateConfinement, GateRun } from '../lifecycle/GateRun.ts';
import type { GateStep }                 from './@types/JobGateRun.ts';
import type { JobLaunchContext }         from './@types/JobLaunchContext.ts';
import type { BoardChildren }            from './BoardChildren.ts';
import { JobSandbox }                    from './JobSandbox.ts';
import { LineSandbox }                   from './LineSandbox.ts';
import { WorkerProfiles }                from './WorkerProfiles.ts';
import { JOB_FILES, WorktreeJobs }       from './WorktreeJobs.ts';

const FIRST_STEP_INDEX = 0;

/** The first step keeps the bare folder name; a later one is numbered without a dash, so it never reads as a child instance suffix. */
function stepFolderOf(baseFolder: string, stepIndex: number): string {
  return stepIndex === FIRST_STEP_INDEX ? baseFolder : `${baseFolder}${stepIndex + 1}`;
}
/** Beside the step's child folder, where a Windows line records its whole status; it is removed before each instance's launch. */
const LINE_STATUS_SUFFIX = '-line-status';
const FIRST_LINE_INSTANCE = 1;

/**
 * The newest instance of a step's line: `pending` while it runs or none was launched, `rerun` once a clean quit paused it, which the next
 * instance runs again, `lost` when it is gone with no end of its own, and otherwise its end, the only one a verdict is read from.
 */
function lineEndOf(children: BoardChildren, lineFolder: string): ChildEnd | 'pending' | 'rerun' | 'lost' {
  const newestInstance = children.newestInstanceIn(lineFolder);
  if (newestInstance === null) return 'pending';
  const liveness = children.livenessOf(lineFolder, newestInstance);
  if (liveness.verdict === 'lost') return 'lost';
  if (liveness.verdict === 'ended' && liveness.end.reason === 'paused') return 'rerun';
  return liveness.verdict === 'ended' ? liveness.end : 'pending';
}

/** A line with no verdict yet: running or unlaunched, paused, or lost. */
function lineIsUnjudged(end: ReturnType<typeof lineEndOf>): end is 'pending' | 'rerun' | 'lost' {
  return end === 'pending' || end === 'rerun' || end === 'lost';
}

/**
 * The instance of a step's line due for a launch: the first while none was launched, the next after a `rerun` or a `lost` one, and none
 * otherwise. A caller launches a lost line only once its job no longer waits for User's resume.
 */
function lineInstanceDueOf(children: BoardChildren, lineFolder: string): number | null {
  const newestInstance = children.newestInstanceIn(lineFolder);
  if (newestInstance === null) return FIRST_LINE_INSTANCE;
  const end = lineEndOf(children, lineFolder);
  return end === 'rerun' || end === 'lost' ? newestInstance + 1 : null;
}

function lineStatusFileOf(jobFolder: string, folderName: string): string {
  return join(jobFolder, `${folderName}${LINE_STATUS_SUFFIX}`);
}

/** A line that never exited by itself reports no exit code, and one stopped at its time bound no signal either, so it reads as never run. */
function stepExitReportOf(end: ChildEnd, jobFolder: string, folderName: string): ShellExitReport {
  return {
    exitCode:       end.reason === 'exited' ? end.exitCode : null,
    signalCode:     end.reason === 'time-bound' ? null : end.signal,
    recordedStatus: GateRun.recordedStatusOf(lineStatusFileOf(jobFolder, folderName)),
  };
}

function stepPassed(context: JobLaunchContext, end: ChildEnd, jobFolder: string, folderName: string): boolean {
  return context.platformPorts.shellLine.exitMeaningOf(stepExitReportOf(end, jobFolder, folderName)) === 'passed';
}

/** A step's ended line with its run time, named by the step's entity; none for a line that never ran. */
function stepRunsOfLine(step: Pick<GateStep, 'kind' | 'stepName' | 'entity'>, end: ChildEnd, passed: boolean): PipelineStepRun[] {
  return GateRun.stepRunsOf(step.kind, step.stepName, { endReason: end.reason, runMilliseconds: end.runMilliseconds }, passed)
    .map((stepRun) => (step.entity === undefined ? stepRun : { ...stepRun, entity: step.entity }));
}

/** What the newest instance of the line printed; a line stopped at its time bound gets one more line naming the bound. */
function lineOutputOf(children: BoardChildren, lineFolder: string): string {
  const newestInstance = children.newestInstanceIn(lineFolder) ?? FIRST_LINE_INSTANCE;
  const entries = children.eventsAfter(lineFolder, newestInstance, 0);
  const output = entries === 'malformed' ? '' : entries.filter((entry) => entry.origin === 'agent').map((entry) => `${entry.line}\n`).join('');
  const record = children.recordOf(lineFolder, newestInstance);
  if (record?.end?.reason !== 'time-bound') return output;
  return `${output}${GateRun.timeBoundLineOf(record.timeBoundMilliseconds ?? LINE_TIME_BOUND_MILLISECONDS)}\n`;
}

function lineReadsLost(context: JobLaunchContext, job: Readonly<Job>, folderName: string): boolean {
  return lineEndOf(context.boardChildren, join(WorktreeJobs.jobFolderOf(context.workspace, job), folderName)) === 'lost';
}

/** What a step's line runs: its stored line, its confinement, and its `in` folder, as `GateRun.gateDirectoryOf` reads it. */
export interface LineChildStep {
  line:        string;
  confinement: GateConfinement;
  subfolder:   string | null;
  /** A gate's report path, handed to its line; absent for a prepare or install step. */
  reportFile?: string;
}

/** A line with no instance due is left alone; `talos-unavailable` leaves its instance for the next pass. */
export type LineChildSpawn =
  | { verdict: 'already-claimed' }
  | { verdict: 'refused' }
  | { verdict: 'talos-unavailable' }
  | { verdict: 'spawned'; supervisor: ProcessIdentity | null };

/** `pipeline` names the entity homes whose configuration folder the step's sandbox denies, as a session's does. */
async function spawnLineChild(
  context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>, folderName: string, step: LineChildStep
): Promise<LineChildSpawn> {
  const { confinement, subfolder } = step;
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  const lineFolder = join(jobFolder, folderName);
  const instance = lineInstanceDueOf(context.boardChildren, lineFolder);
  if (instance === null) return { verdict: 'already-claimed' };
  const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
  const workingDirectory = GateRun.gateDirectoryOf(worktree, subfolder === null ? {} : { in: subfolder }, WorktreeJobs.projectLocationOfContext(context).projectPrefix);
  const { gateConfinement, shellLine } = context.platformPorts;
  const runRefusal = shellLine.runRefusalOf(workingDirectory);
  if (runRefusal !== null) {
    JobSandbox.recordSandboxRefusal(context, job, { step: folderName, refusal: { code: 'shell-run-refused', refusal: runRefusal, directory: workingDirectory } });
    return { verdict: 'refused' };
  }
  if (JobSandbox.deniedRootRefusalRecorded(context, job, folderName, WorkerProfiles.entityFactsOf(pipeline))) return { verdict: 'refused' };
  const spawnRequest = shellLine.spawnRequestOf(step.line, lineStatusFileOf(jobFolder, folderName));
  if (spawnRequest.verdict === 'refused') {
    JobSandbox.recordSandboxRefusal(context, job, { step: folderName, refusal: { code: 'shell-run-refused', refusal: spawnRequest.refusal, directory: workingDirectory } });
    return { verdict: 'refused' };
  }
  const sandboxRequestOf = () => JobSandbox.processSandboxRequestOf(context, JobSandbox.sandboxFactsFor(context, job, pipeline), confinement);
  const planOf = () => LineSandbox.planOf(sandboxRequestOf(), join(lineFolder, JOB_FILES.profile));
  const line = confinedLineOf(gateConfinement, planOf, spawnRequest.argv);
  if (line.verdict === 'refused') {
    const confinementRefusal: ConfinementRefusal = { cause: 'confinement-unavailable', unavailability: line.unavailability };
    JobSandbox.recordSandboxRefusal(context, job, { step: folderName, refusal: { code: 'confinement-refused', confinementRefusal } });
    return { verdict: 'refused' };
  }
  // A report or a status left at the path before this instance ran is never this run's; a re-run's first instance left them too.
  if (step.reportFile !== undefined) rmSync(step.reportFile, { force: true, recursive: true });
  rmSync(lineStatusFileOf(jobFolder, folderName), { force: true });
  const launched = await launchLineChild(context, job, folderName, instance, {
    workingDirectory,
    argv:                  line.argv,
    verbatimArguments:     spawnRequest.verbatimArguments,
    environment:           JobSandbox.gateEnvironmentOf(context, pipeline, step.reportFile),
    timeBoundMilliseconds: LINE_TIME_BOUND_MILLISECONDS,
  });
  if (launched.verdict === 'talos-unavailable') return launched;
  const availability = gateConfinement.availability();
  context.log({
    kind:        'line-launched',
    jobId:       job.id,
    ticketId:    WorktreeJobs.ticketIdOf(job),
    step:        folderName,
    instance,
    confinement: availability.verdict === 'confined' ? availability.mechanism : null,
  });
  return { verdict: 'spawned', supervisor: launched.supervisor };
}

export interface LineChildLaunch {
  workingDirectory:      string;
  argv:                  readonly string[];
  verbatimArguments?:    boolean;
  environment:           Record<string, string>;
  /** Every install, prepare and gate line's bound; a merge carries none. */
  timeBoundMilliseconds: number | null;
}

export type LineChildLaunchOutcome = { verdict: 'talos-unavailable' } | { verdict: 'spawned'; supervisor: ProcessIdentity | null };

/** Launches the instance of the step's line under Talos; the caller has already judged what the line may reach. */
async function launchLineChild(
  context: JobLaunchContext, job: Readonly<Job>, folderName: string, instance: number, launch: LineChildLaunch
): Promise<LineChildLaunchOutcome> {
  const lineFolder = join(WorktreeJobs.jobFolderOf(context.workspace, job), folderName);
  const label = `${job.id}/${folderName}`;
  const launched = await context.boardChildren.launchLine({
    childFolder:           lineFolder,
    instance,
    label,
    workingDirectory:      launch.workingDirectory,
    argv:                  launch.argv,
    verbatimArguments:     launch.verbatimArguments ?? false,
    environment:           launch.environment,
    timeBoundMilliseconds: launch.timeBoundMilliseconds,
  });
  if (launched.verdict === 'talos-unavailable' || launched.verdict === 'refused') {
    context.log({
      kind: 'line-not-launched', jobId: job.id, step: folderName, instance, talosRefusal: launched.verdict === 'refused' ? launched.reason : null
    });
    return { verdict: 'talos-unavailable' };
  }
  return { verdict: 'spawned', supervisor: context.boardChildren.recordOf(lineFolder, instance)?.talos ?? null };
}

export const JobLines = Object.freeze({
  stepFolderOf,
  lineEndOf,
  lineIsUnjudged,
  lineInstanceDueOf,
  stepExitReportOf,
  stepPassed,
  stepRunsOfLine,
  lineOutputOf,
  lineReadsLost,
  spawnLineChild,
  launchLineChild,
});
