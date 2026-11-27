/**
 * A build, review or conflict re-review session: its calls and report read across child instances, its call budget for the attempt, and
 * each frame its job's state sends it once.
 */
import { existsSync, mkdirSync, writeFileSync }                            from 'node:fs';
import { dirname, join }                                                   from 'node:path';
import type { ChildInput }                                                 from '../../domain/talos/@types/TalosFrame.ts';
import type { Job }                                                        from '../../domain/tracker-model/@types/Job.ts';
import { FIRST_CHILD_INSTANCE }                                            from '../../domain/tracker-model/constants/JobStates.ts';
import type { AgentAdapter }                                               from '../../lib/agent-launch/AgentAdapter.ts';
import { DISPATCH_PROTOCOL }                                               from '../../shared/constants/DispatchProtocol.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET, SESSION_STOP_GRACE_MILLISECONDS } from '../../shared/constants/HephaestusLimits.ts';
import type { JobLaunchContext }                                           from './@types/JobLaunchContext.ts';
import type { BoardChildren }                                              from './BoardChildren.ts';
import { jobFolderIn }                                                     from './HephaestusFiles.ts';
import { RedHandoff }                                                      from './RedHandoff.ts';
import { StoredFileUnreadable }                                            from './StoredFileUnreadable.ts';
import {
  CONFLICT_RE_REVIEWER_ROLE,
  JOB_FILES,
  REVIEW_JOB_KIND,
  WorktreeJobs
} from './WorktreeJobs.ts';

function callBudgetOf(job: Readonly<Job>): number {
  return job.kind === REVIEW_JOB_KIND || job.role === CONFLICT_RE_REVIEWER_ROLE ? DISPATCH_PROTOCOL.REVIEWER_API_CALL_BUDGET : DISPATCH_PROTOCOL.BUILDER_API_CALL_BUDGET;
}

/** `calls` counts the current attempt's turns: since the last red handoff's resume, or every instance's when none went red. */
function sessionReadingOf(context: JobLaunchContext, job: Readonly<Job>): { calls: number; report: unknown } {
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  const attemptStartInstance = attemptStartInstanceOf(context.workspace.trackerDirectory, jobFolder);
  const topLevelMessageIds = new Set<string>();
  let report: unknown = undefined;
  for (let instance = 1; instance <= job.childInstance; instance += 1) {
    const entries = context.boardChildren.eventsAfter(jobFolder, instance, 0);
    if (entries === 'malformed') continue;
    for (const entry of entries.filter((logged) => logged.origin === 'agent')) {
      for (const event of context.agentAdapter.eventsOf(entry.line)) {
        if (event.kind === 'assistant-turn' && event.parentToolUseId === null && instance >= attemptStartInstance) topLevelMessageIds.add(event.messageId);
        if (event.kind === 'result') report = event.structuredReport;
      }
    }
  }
  return { calls: topLevelMessageIds.size, report };
}

/** A per-instance marker, so a session resumed after a red handoff gets its own wind-down, closed input and stop. */
function instanceMarkerOf(marker: string, childInstance: number): string {
  return childInstance === FIRST_CHILD_INSTANCE ? marker : `${marker}-${childInstance}`;
}

/**
 * The child instance the job's current attempt began in: the one after its last red handoff, the first otherwise. Calls counted over facts
 * that cannot be read are never acted on: the hold opens their incident first.
 */
function attemptStartInstanceOf(trackerDirectory: string, jobFolder: string): number {
  const facts = RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolder);
  return facts === null || StoredFileUnreadable.isUnreadableFile(facts) ? FIRST_CHILD_INSTANCE : facts.interruptedInstance + 1;
}

/** A session working off a red handoff has the short resume budget; the first attempt its role's. */
function attemptCallBudgetOf(trackerDirectory: string, job: Readonly<Job>): number | StoredFileUnreadable {
  const facts = RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolderIn(trackerDirectory, job.id));
  if (StoredFileUnreadable.isUnreadableFile(facts)) return facts;
  return facts === null ? callBudgetOf(job) : RED_HANDOFF_RESUME_CALL_BUDGET;
}

/** What a build job's frames are worded and filed with. */
export interface BuildJobFrameRequest {
  boardChildren:    BoardChildren;
  trackerDirectory: string;
  agentAdapter:     Pick<AgentAdapter, 'chatLineOf'>;
  windDownMessage:  string;
}

async function sendOnce(request: BuildJobFrameRequest, job: Readonly<Job>, marker: string, inputs: readonly ChildInput[]): Promise<void> {
  const jobFolder = request.boardChildren.jobFolderOf(job.id);
  await request.boardChildren.sendInputOnce(join(jobFolder, marker), jobFolder, job.childInstance, inputs);
}

/** The stop goes to a live session once: its marker is written only after the stop was taken, so a refused stop is tried again. */
async function stopOnce(request: BuildJobFrameRequest, job: Readonly<Job>, marker: string): Promise<void> {
  const { boardChildren } = request;
  const jobFolder = boardChildren.jobFolderOf(job.id);
  const markerPath = join(jobFolder, marker);
  if (existsSync(markerPath) || boardChildren.livenessOf(jobFolder, job.childInstance).verdict !== 'live') return;
  if (!await boardChildren.stop(jobFolder, job.childInstance, SESSION_STOP_GRACE_MILLISECONDS)) return;
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, '');
}

/** What a build job's state asks of its live child, each frame once: the wind-down turn over its call budget, its quit at its turn end, a stop. */
async function deliverBuildJobFrames(request: BuildJobFrameRequest, job: Readonly<Job>, calls: number): Promise<void> {
  const markerOf = (marker: string): string => instanceMarkerOf(marker, job.childInstance);
  // Red handoff facts that cannot be read give no budget, so no wind-down goes out while the job waits on their incident.
  const callBudget = attemptCallBudgetOf(request.trackerDirectory, job);
  if (job.state === 'running' && !StoredFileUnreadable.isUnreadableFile(callBudget) && calls >= callBudget) {
    await sendOnce(request, job, markerOf(JOB_FILES.windDownSent), [{ act: 'write-line', line: request.agentAdapter.chatLineOf(request.windDownMessage) }]);
  }
  if (job.state === 'in-customs' || job.state === 'gating') await sendOnce(request, job, markerOf(JOB_FILES.inputClosed), [{ act: 'quit-at-turn-end' }]);
  if (job.state === 'stopping') await stopOnce(request, job, markerOf(JOB_FILES.stopSent));
}

export const BuildJobSessions = Object.freeze({
  callBudgetOf,
  sessionReadingOf,
  attemptCallBudgetOf,
  deliverBuildJobFrames,
});
