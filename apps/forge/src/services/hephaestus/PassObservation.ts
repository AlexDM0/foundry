/** What a pass reads outside the lock before its hold: each child's events and liveness, Hatch requests, target tips, and the fingerprint of it all. */
import { createHash } from 'node:crypto';

import type { ForcedStopRefusals }                          from '../../adapters/refused-forced-stops/@types/ForcedStopRefusals.ts';
import { type UsageMarkerReading, UsageMarkerFile }         from '../../adapters/usage-marker/UsageMarkerFile.ts';
import type { EventLogEntry }                               from '../../domain/talos/EventLog.ts';
import type { InterruptionCause }                           from '../../domain/tracker-model/@types/Job.ts';
import { GitProcess }                                       from '../../lib/git/GitProcess.ts';
import type { RecognisedEnding }                            from '../../lib/line-patterns/EndingPatterns.ts';
import { projectLocationOf }                                from '../tracker/ProjectLocation.ts';
import { type BuildJobObservation }                         from './@types/BuildJobObservation.ts';
import type { DrivePassRequest }                            from './@types/DrivePassRequest.ts';
import { type JobLaunchContext }                            from './@types/JobLaunchContext.ts';
import { AgentConfigHits }                                  from './AgentConfigHits.ts';
import { type AssistantReading, AssistantSession }          from './AssistantSession.ts';
import type { ChildLiveness }                               from './BoardChildren.ts';
import { BuildJobPass }                                     from './BuildJobPass.ts';
import { type DocumentAgentReading, DocumentAgentSessions } from './DocumentAgentSessions.ts';
import { HatchInbox, type PendingHatchRequest }             from './HatchInbox.ts';
import { JobResumption }                                    from './JobResumption.ts';
import { RefusedForcedStops }                               from './RefusedForcedStops.ts';
import { Regrouping }                                       from './Regrouping.ts';

export interface ChildObservation {
  jobId:              string;
  instance:           number;
  liveness:           ChildLiveness;
  events:             readonly EventLogEntry[];
  /** Read after the events, so an ending Talos recognised in a line just read is never missed. */
  recognisedEndings:  readonly RecognisedEnding[];
  /** Settled for a lost child only, after its surviving process group was killed; `null` while the forced stop is refused. */
  lostCause:          InterruptionCause | null;
  forcedStopRefusals: ForcedStopRefusals;
  /** Read for a resumed instance whose child record holds its end; `true` otherwise. */
  sessionStarted:     boolean;
}

export interface Observation {
  childObservations:            readonly ChildObservation[];
  pendingRequests:              readonly PendingHatchRequest[];
  targetTips:                   Readonly<Record<string, string | null>>;
  buildJobs:                    readonly BuildJobObservation[];
  ticketIdsTouchingAgentConfig: readonly string[];
  answeredWaiverTrees:          ReadonlyMap<string, string | null>;
  usageMarker:                  UsageMarkerReading;
  assistantReadings:            readonly AssistantReading[];
  documentAgentReadings:        readonly DocumentAgentReading[];
  fingerprint:                  string;
  trackerId:                    string;
}

function targetTipOf(repositoryRoot: string, target: string): string | null {
  return GitProcess.resolvedCommitOf(repositoryRoot, target);
}

/** Identity, never time: the store's revision, the pending requests, the unread events, the target tips and each child's verdict. */
function fingerprintOf(
  boardRevision: string,
  childObservations: readonly ChildObservation[],
  pending: readonly PendingHatchRequest[],
  tips: Readonly<Record<string, string | null>>,
  buildJobs: readonly BuildJobObservation[],
  usageMarker: UsageMarkerReading,
  ticketIdsTouchingAgentConfig: readonly string[],
): string {
  const digest = createHash('sha256');
  digest.update(`agent-config ${ticketIdsTouchingAgentConfig.join(',')}\n`);
  digest.update(`revision ${boardRevision}\n`);
  digest.update(`usage ${JSON.stringify(usageMarker)}\n`);
  for (const request of pending) digest.update(`request ${request.jobId} ${request.requestId}\n`);
  for (const buildJob of buildJobs) {
    const gateStep = buildJob.gate.verdict === 'running' ? buildJob.gate.stepIndex : '';
    digest.update(`build ${buildJob.jobId} ${buildJob.setup} ${buildJob.calls} ${buildJob.gate.verdict} ${gateStep}\n`);
  }
  for (const childObservation of childObservations) {
    const lastSequence = childObservation.events.at(-1)?.sequence ?? 0;
    digest.update(`child ${childObservation.jobId} ${childObservation.instance} ${childObservation.liveness.verdict} ${lastSequence}\n`);
  }
  for (const [target, tip] of Object.entries(tips)) digest.update(`tip ${target} ${tip ?? '-'}\n`);
  return digest.digest('hex');
}

/** A refused forced stop is tried again only for the jobs in `forcedStopRetryJobIds`, so a pass's own writes never retry it. */
function observe(request: DrivePassRequest, jobLaunchContext: JobLaunchContext, forcedStopRetryJobIds: ReadonlySet<string> = new Set()): Observation {
  const { workspace, boardStore } = request;
  const progress      = boardStore.reads.requireProgress();
  const jobs          = progress.jobs ?? [];
  // Events before Hatch folders: a request a session wrote before its turn's `result` is seen in the same pass as that result.
  const children      = request.boardChildren;
  children.beginPass();
  const childObservations = jobs.map((job): ChildObservation => {
    const jobFolder     = children.jobFolderOf(job.id);
    const afterSequence = job.eventCursor.instance === job.childInstance ? job.eventCursor.sequence : 0;
    // Liveness first, so an ended child's log is read whole; the endings last, so they cover every line just read.
    const liveness          = children.livenessOf(jobFolder, job.childInstance);
    const events            = children.eventsAfter(jobFolder, job.childInstance, afterSequence);
    const recognisedEndings = children.recognisedEndingsOf(jobFolder, job.childInstance);
    if (events === 'malformed') request.log({ kind: 'child-event-log-malformed', jobId: job.id, childInstance: job.childInstance, });
    const lostCause = liveness.verdict === 'lost' && job.role !== null
      ? Regrouping.settleLostChildIn(
        workspace.trackerDirectory, request.platformPorts, request.unreadableBoardFiles, request.log, jobFolder, job.childInstance, forcedStopRetryJobIds.has(job.id),
      )
      : null;
    return {
      jobId:              job.id,
      instance:           job.childInstance,
      liveness,
      events:             events === 'malformed' ? [] : events,
      recognisedEndings,
      lostCause,
      forcedStopRefusals: RefusedForcedStops.storedOf(workspace.trackerDirectory, jobFolder, job.childInstance, request.unreadableBoardFiles),
      sessionStarted:     liveness.verdict !== 'ended' || JobResumption.instanceSessionStarted(children, jobFolder, job.childInstance, request.agentAdapter),
    };
  });
  // Also before Hatch folders: a `result` closing an Assistant's turn must not be seen before the move it queued ahead of it.
  const assistantReadings = AssistantSession.readingsOf(children, request.agentAdapter, { jobs: () => jobs });
  const documentAgentReadings = DocumentAgentSessions.readingsOf(children, request.agentAdapter, jobs);
  const pendingRequests = HatchInbox.pendingRequestsOf(workspace.rootDirectory, jobs);
  const location        = projectLocationOf(workspace.rootDirectory);
  const targets         = [...new Set([request.mainLine, ...jobs.flatMap((job) => (job.target === null ? [] : [job.target]))])].sort();
  const targetTips      = Object.fromEntries(targets.map((target) => [target, targetTipOf(location.repositoryRoot, target)]));
  const pipelineReading = boardStore.reads.readPipeline();
  const pipeline        = pipelineReading.verdict === 'readable' ? pipelineReading.pipeline : null;
  const buildJobs = BuildJobPass.observeBuildJobs(jobLaunchContext, jobs, pipeline);
  const answeredWaiverTrees = BuildJobPass.answeredWaiverTreesOf(jobLaunchContext, jobs, progress.decisions ?? []);
  const ticketIdsTouchingAgentConfig = AgentConfigHits.ticketIdsTouchingAgentConfigOf(jobLaunchContext, jobs, pipeline);
  const usageMarker = UsageMarkerFile.read(request.monitorFolder);
  if (usageMarker.verdict === 'malformed') {
    request.log({ kind: 'usage-marker-malformed', markerPath: UsageMarkerFile.pathIn(request.monitorFolder), problem: usageMarker.problem });
  }
  return {
    childObservations,
    pendingRequests,
    targetTips,
    buildJobs,
    ticketIdsTouchingAgentConfig,
    answeredWaiverTrees,
    usageMarker,
    assistantReadings,
    documentAgentReadings,
    fingerprint: fingerprintOf(boardStore.reads.revision(), childObservations, pendingRequests, targetTips, buildJobs, usageMarker, ticketIdsTouchingAgentConfig),
    trackerId:   progress.trackerId,
  };
}

export const PassObservation = Object.freeze({ observe });
