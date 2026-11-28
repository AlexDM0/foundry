/**
 * A job's gate run: its manifest written once, each prepare step and gate spawned in order, and each step's verdict kept and read into the
 * run's progress.
 */
import { existsSync, mkdirSync }                                                   from 'node:fs';
import { dirname, join }                                                           from 'node:path';
import { type GateRunManifest, GateRunManifestIngestion, type ManifestStepEntity } from '../../adapters/gate-manifest/GateRunManifestIngestion.ts';
import { createGateRunManifestWriter }                                             from '../../adapters/gate-manifest/GateRunManifestWriter.ts';
import { type StepVerdict, StepVerdictIngestion }                                  from '../../adapters/step-verdict/StepVerdictIngestion.ts';
import { createStepVerdictWriter }                                                 from '../../adapters/step-verdict/StepVerdictWriter.ts';
import type { GatePhase, GateRunStamp }                                            from '../../domain/tracker-model/@types/GatePhase.ts';
import type { GateCacheReportOfGate, Job, PipelineStepRun }                        from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey, Pipeline, PipelineGate }                                  from '../../domain/tracker-model/@types/Pipeline.ts';
import { FIRST_CHILD_INSTANCE }                                                    from '../../domain/tracker-model/constants/JobStates.ts';
import { EntityOwnershipUtil }                                                     from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { PipelineUtil }                                                            from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { TicketStageUtil }                                                         from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { writeFileAtomically }                                                     from '../../lib/atomic-file/AtomicFile.ts';
import { GateRun }                                                                 from '../lifecycle/GateRun.ts';
import type { GateProgress }                                                       from './@types/BuildJobObservation.ts';
import type { GateRunPlace, GateStep, PackageBuildStart }                          from './@types/JobGateRun.ts';
import type { JobLaunchContext }                                                   from './@types/JobLaunchContext.ts';
import { JobLaunch }                                                               from './JobLaunch.ts';
import { JobLines, type LineChildSpawn, type LineChildStep }                       from './JobLines.ts';
import { JobPipelines }                                                            from './JobPipelines.ts';
import { StoredFileUnreadable }                                                    from './StoredFileUnreadable.ts';
import { REVIEW_JOB_KIND, WorktreeJobs }                                           from './WorktreeJobs.ts';

const GATE_PREPARE_CHILD_FOLDER = 'gate-prepare';
const GATE_CHILD_FOLDER_PREFIX = 'gate-';
/** Beside the run's step folders, with their prefix and child instance suffix: `gate-run.json`, `gate-run-2.json`, `target-gate-run.json`. */
const GATE_RUN_MANIFEST_NAME = 'gate-run';
const GATE_RUN_MANIFEST_EXTENSION = '.json';
export const PREPARE_STEP_NAME = 'prepare';
const STEP_VERDICT_SUFFIX = '-verdict.json';
export const GATE_LOG_FILE = 'gate.log';
/** A review job's record that its row's green was not current on the tree it left, so its gates run though it changed nothing. */
export const REGATE_MARKER_FILE = 'regate-required';

/** A job's own gate run: its phase's gates, in folders of the session's current child instance. */
function ownGateRunOf(job: Readonly<Job>): GateRunPlace {
  return { phase: gatePhaseOfJob(job), childInstance: job.childInstance, folderPrefix: '' };
}

function instanceSuffixOf(childInstance: number): string {
  return childInstance === FIRST_CHILD_INSTANCE ? '' : `-${childInstance}`;
}

function gateRunManifestFileOf(place: GateRunPlace): string {
  return `${place.folderPrefix}${GATE_RUN_MANIFEST_NAME}${instanceSuffixOf(place.childInstance)}${GATE_RUN_MANIFEST_EXTENSION}`;
}

/**
 * The entities a package build's gate run checks after the package's own: the package's dependents but its home entity, whose
 * app the adapt stage brings in line, and but those whose fix tickets are in the ticket's group, which the group's release gates. None for
 * every other job.
 */
function dependentsGatedOf(pipeline: Readonly<Pipeline>, job: Readonly<Job>, start: Readonly<PackageBuildStart>): EntityKey[] {
  if (pipeline.entities === undefined || job.entity === undefined || TicketStageUtil.stageOfJob(job)?.name !== 'package-build') return [];
  const leftOut = [start.homeEntity, ...start.dependentsFixedInGroup ?? []];
  return EntityOwnershipUtil.dependentsOf(pipeline.entities, [job.entity]).filter((entityKey) => !leftOut.includes(entityKey));
}

function dependentGateNamePrefixOf(entityKey: EntityKey): string {
  return `${entityKey}: `;
}

/** A dependent's gate, named for its entity, so a red one tells the package builder whose gate it is, and naming the entity it is of. */
function dependentGateOf(entityKey: EntityKey, gate: Readonly<PipelineGate>): PipelineGate & ManifestStepEntity {
  return { ...gate, name: `${dependentGateNamePrefixOf(entityKey)}${gate.name}`, entity: entityKey };
}

/** A manifest gate's own name in its entity's pipeline: a dependent's gate without the entity it was named for. */
function ownGateNameOf(gate: Readonly<PipelineGate & ManifestStepEntity>): string {
  const prefix = gate.entity === undefined ? '' : dependentGateNamePrefixOf(gate.entity);
  return gate.name.startsWith(prefix) ? gate.name.slice(prefix.length) : gate.name;
}

/**
 * `null` when the pipeline no longer holds the job's entity. A package build runs the package's steps, then each gated dependent's, each
 * from its own first home.
 */
function manifestOf(pipeline: Readonly<Pipeline>, job: Readonly<Job>, phase: GatePhase, start: Readonly<PackageBuildStart>): GateRunManifest | null {
  const stepsPipeline = JobPipelines.stepsPipelineOf(pipeline, job);
  if (stepsPipeline === null) return null;
  const manifest = { ...JobPipelines.jobGateRunStampOf(pipeline, job, phase), prepare: [...stepsPipeline.prepare], gates: PipelineUtil.gatesOfPhase(stepsPipeline, phase) };
  const dependents = dependentsGatedOf(pipeline, job, start);
  if (dependents.length === 0 || job.entity === undefined) return manifest;
  const dependentPipelines = dependents.flatMap((entityKey) => {
    const dependentPipeline = JobPipelines.stepsPipelineOf(pipeline, { entity: entityKey });
    return dependentPipeline === null ? [] : [{ entityKey, dependentPipeline }];
  });
  return {
    ...PipelineUtil.entitiesGateRunStampOf(pipeline, phase, [job.entity, ...dependentPipelines.map(({ entityKey }) => entityKey)]),
    prepare: [...manifest.prepare, ...dependentPipelines.flatMap(({ entityKey, dependentPipeline }) => dependentPipeline.prepare.map((step) => ({ ...step, entity: entityKey })))],
    gates:   [
      ...manifest.gates,
      ...dependentPipelines.flatMap(({ entityKey, dependentPipeline }) => PipelineUtil.gatesOfPhase(dependentPipeline, phase).map((gate) => dependentGateOf(entityKey, gate))),
    ],
  };
}

/**
 * The run's manifest. A run with none has not started: the manifest is written atomically from `pipeline` before its first step runs, and
 * never rewritten, so every later read of the run reads the same steps. One that cannot be read is never replaced; `cannot-run` when none
 * can be written, since the pipeline no longer holds the job's entity.
 */
function gateRunManifestOf(
  context: JobLaunchContext, job: Readonly<Job>, place: GateRunPlace, pipeline: Readonly<Pipeline>
): GateRunManifest | 'cannot-run' | StoredFileUnreadable {
  const { trackerDirectory } = context.workspace;
  const manifestPath = join(WorktreeJobs.jobFolderOf(context.workspace, job), gateRunManifestFileOf(place));
  const stored = new GateRunManifestIngestion(manifestPath, place.phase).read();
  if (stored.verdict === 'readable') return stored.manifest;
  if (stored.verdict === 'unreadable') return StoredFileUnreadable.unreadableFileOf(trackerDirectory, manifestPath, stored.problem);
  // A package build's start names the entities its run leaves out, so no run starts from a start that cannot be read.
  const start = JobLaunch.jobStartOf(trackerDirectory, job.id);
  if (StoredFileUnreadable.isUnreadableFile(start)) return start;
  const manifest = manifestOf(pipeline, job, place.phase, start ?? {});
  if (manifest === null) return 'cannot-run';
  mkdirSync(dirname(manifestPath), { recursive: true });
  createGateRunManifestWriter(manifestPath).write(manifest);
  return manifest;
}

/**
 * Each prepare step, then each gate of the manifest in its run order, each in a child folder named by its position; a manifest with no gates
 * passes at once. A session resumed after a red handoff gates again in folders suffixed with its child instance, since a child folder runs
 * once. A step is of the job's entity on a pipeline with entities, unless the manifest names a dependent's.
 */
function gateStepsOf(manifest: Readonly<GateRunManifest>, place: GateRunPlace, job: Readonly<Pick<Job, 'entity'>>): GateStep[] {
  if (manifest.gates.length === 0) return [];
  const suffix = instanceSuffixOf(place.childInstance);
  const jobEntity = manifest.entityPhaseHashes === undefined ? undefined : job.entity;
  const prepare = manifest.prepare.map((step, stepIndex): GateStep => ({
    kind:        'prepare',
    name:        PREPARE_STEP_NAME,
    stepName:    step.name,
    entity:      step.entity ?? jobEntity,
    line:        step.run,
    folder:      `${place.folderPrefix}${JobLines.stepFolderOf(GATE_PREPARE_CHILD_FOLDER, stepIndex)}${suffix}`,
    in:          step.in ?? null,
    confinement: GateRun.prepareConfinementOf(manifest.gates),
  }));
  return [...prepare, ...manifest.gates.map((gate, index): GateStep => ({
    kind:        'gate',
    name:        gate.name,
    stepName:    ownGateNameOf(gate),
    entity:      gate.entity ?? jobEntity,
    line:        gate.run,
    folder:      `${place.folderPrefix}${GATE_CHILD_FOLDER_PREFIX}${index + 1}${suffix}`,
    in:          gate.in ?? null,
    confinement: GateRun.gateConfinementOf(gate),
  }))];
}

/** The stamp alone, never the manifest's steps it may carry. */
function gateRunStampOnlyOf(stamp: Readonly<GateRunStamp>): GateRunStamp {
  return { phase: stamp.phase, phaseHash: stamp.phaseHash, ...(stamp.entityPhaseHashes === undefined ? {} : { entityPhaseHashes: stamp.entityPhaseHashes }) };
}

/** A gate step's report path; a prepare step is no gate run and is handed none. */
function stepReportFileOf(jobFolder: string, step: Pick<GateStep, 'kind' | 'folder'>): string | null {
  return step.kind === 'gate' ? GateRun.gateReportFileFor(join(jobFolder, step.folder)) : null;
}

/**
 * The step's verdict once its child ended, `null` before. Kept in the job folder as it is first read, so a later gate that changes the tree
 * never turns an earlier pass red; it is this job's record of its own run, never a result another job reads. A kept verdict that cannot be
 * read is never judged again, since judging the line afresh could turn the step's pass red.
 */
function stepVerdictOf(
  context: JobLaunchContext, job: Readonly<Job>, treeId: string, step: GateStep, stamp: GateRunStamp
): StepVerdict | null | StoredFileUnreadable {
  const jobFolder   = WorktreeJobs.jobFolderOf(context.workspace, job);
  const verdictPath = join(jobFolder, `${step.folder}${STEP_VERDICT_SUFFIX}`);
  const kept        = new StepVerdictIngestion(verdictPath).read();
  if (kept.verdict === 'unreadable') return StoredFileUnreadable.unreadableFileOf(context.workspace.trackerDirectory, verdictPath, kept.problem);
  if (kept.verdict === 'readable') {
    const { stepVerdict } = kept;
    if (stepVerdict.treeId === treeId && stepVerdict.phase === stamp.phase && stepVerdict.phaseHash === stamp.phaseHash) return stepVerdict;
  }
  const lineFolder = join(jobFolder, step.folder);
  const end = JobLines.lineEndOf(context.boardChildren, lineFolder);
  // A paused or lost line is never judged, so a crash never reads as a red gate: its next instance runs it again.
  if (JobLines.lineIsUnjudged(end)) return null;
  const { shellLine } = context.platformPorts;
  const reportFile = stepReportFileOf(jobFolder, step);
  const cacheReport = reportFile === null ? null : GateRun.takeCacheReport(reportFile);
  const run = { ...JobLines.stepExitReportOf(end, jobFolder, step.folder), cacheReport, output: JobLines.lineOutputOf(context.boardChildren, lineFolder) };
  let judged: StepVerdict;
  if (step.kind === 'prepare') {
    const failureOutput = GateRun.prepareFailureOutputOf(shellLine, run, WorktreeJobs.worktreeOf(context.workspace, job));
    judged = {
      treeId, ...gateRunStampOnlyOf(stamp), outcome: failureOutput === null ? 'passed' : 'setup-failed', output: failureOutput ?? run.output, exitCode: run.exitCode
    };
  } else {
    const trackedChanges = GateRun.trackedChangesOf(WorktreeJobs.worktreeOf(context.workspace, job));
    judged = {
      treeId,
      ...gateRunStampOnlyOf(stamp),
      outcome:  GateRun.gateOutcomeOf(shellLine, run, trackedChanges),
      output:   GateRun.gateErrorOutputOf(shellLine, run, trackedChanges),
      exitCode: run.exitCode,
      ...(cacheReport === null ? {} : { cacheReport }),
    };
  }
  const [stepRun] = JobLines.stepRunsOfLine(step, end, judged.outcome === 'passed');
  const verdict: StepVerdict = stepRun === undefined ? judged : { ...judged, stepRun };
  createStepVerdictWriter(verdictPath).write(verdict);
  if (verdict.outcome !== 'passed') writeFileAtomically(join(jobFolder, GATE_LOG_FILE), `${step.name}\n${verdict.output}`);
  return verdict;
}

/**
 * A reviewer that committed nothing, or only commits back to the tree it was given, leaves the tree the build's gates passed. The hold
 * writes the regate marker when the row's green is not current on that tree, since the pipeline changed, so the gates run after all.
 */
function reviewLeftTheTreeAsItWas(context: JobLaunchContext, job: Readonly<Job>, treeId: string): boolean | StoredFileUnreadable {
  if (job.kind !== REVIEW_JOB_KIND || existsSync(join(WorktreeJobs.jobFolderOf(context.workspace, job), REGATE_MARKER_FILE))) return false;
  const start = JobLaunch.jobStartOf(context.workspace.trackerDirectory, job.id);
  if (StoredFileUnreadable.isUnreadableFile(start)) return start;
  return start !== null && WorktreeJobs.treeOfCommit(WorktreeJobs.worktreeOf(context.workspace, job), start.startCommit) === treeId;
}

function gateProgressOf(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): GateProgress {
  const treeId = WorktreeJobs.treeOf(WorktreeJobs.worktreeOf(context.workspace, job));
  if (treeId === null) return { verdict: 'pending' };
  const leftAsItWas = reviewLeftTheTreeAsItWas(context, job, treeId);
  if (StoredFileUnreadable.isUnreadableFile(leftAsItWas)) return leftAsItWas;
  if (leftAsItWas) return {
    verdict: 'judged', treeId, outcome: 'passed', step: null, output: '', ran: false, manifest: null, cacheReports: [], stepRuns: []
  };
  return gateRunProgressOf(context, job, treeId, ownGateRunOf(job), pipeline);
}

/** Judged by the run's manifest alone, written at its first read; a manifest that cannot be read is a run that cannot go on. */
function gateRunProgressOf(
  context: JobLaunchContext, job: Readonly<Job>, treeId: string, place: GateRunPlace, pipeline: Readonly<Pipeline>
): Exclude<GateProgress, { verdict: 'pending' }> {
  const manifest = gateRunManifestOf(context, job, place, pipeline);
  if (StoredFileUnreadable.isUnreadableFile(manifest)) return manifest;
  if (manifest === 'cannot-run') return {
    verdict: 'judged', treeId, outcome: 'cannot-run', step: gateRunManifestFileOf(place), output: '', ran: true, manifest: null, cacheReports: [], stepRuns: []
  };
  const cacheReports: GateCacheReportOfGate[] = [];
  const stepRuns: PipelineStepRun[] = [];
  for (const [stepIndex, step] of gateStepsOf(manifest, place, job).entries()) {
    const verdict = stepVerdictOf(context, job, treeId, step, manifest);
    if (verdict === null) return { verdict: 'running', treeId, stepIndex };
    if (StoredFileUnreadable.isUnreadableFile(verdict)) return verdict;
    if (step.kind === 'gate') cacheReports.push({ gateName: step.name, cacheReport: verdict.cacheReport ?? null });
    if (verdict.stepRun !== undefined) stepRuns.push(verdict.stepRun);
    if (verdict.outcome !== 'passed') return {
      verdict: 'judged', treeId, outcome: verdict.outcome, step: step.name, output: verdict.output, ran: true, exitCode: verdict.exitCode ?? null, manifest, cacheReports, stepRuns
    };
  }
  return {
    verdict: 'judged', treeId, outcome: 'passed', step: null, output: '', ran: true, manifest, cacheReports, stepRuns
  };
}

function gateRunStepReadsLost(context: JobLaunchContext, job: Readonly<Job>, place: GateRunPlace, pipeline: Readonly<Pipeline>, stepIndex: number): boolean {
  const manifest = gateRunManifestOf(context, job, place, pipeline);
  const step = manifest === 'cannot-run' || StoredFileUnreadable.isUnreadableFile(manifest) ? undefined : gateStepsOf(manifest, place, job)[stepIndex];
  return step !== undefined && JobLines.lineReadsLost(context, job, step.folder);
}

/** The phase whose gates judge a job's worktree: a review job's are the review phase's, a build job's the build phase's. */
function gatePhaseOfJob(job: Readonly<Job>): GatePhase {
  return job.kind === REVIEW_JOB_KIND ? 'review' : 'build';
}

/** Read afresh, since the hold may have moved the job into gating this pass; a gate waits for a free slot of the machine, a prepare step never. */
async function spawnNextGateStep(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>): Promise<void> {
  const progress = gateProgressOf(context, job, pipeline);
  if (progress.verdict === 'running') await spawnGateRunStep(context, job, { place: ownGateRunOf(job), pipeline, stepIndex: progress.stepIndex });
}

/** The step at `stepIndex` of the run's manifest, never of the pipeline now, so a reorder since the run started spawns no other gate. */
async function spawnGateRunStep(
  context: JobLaunchContext, job: Readonly<Job>, run: { place: GateRunPlace; pipeline: Readonly<Pipeline>; stepIndex: number }
): Promise<void> {
  const manifest = gateRunManifestOf(context, job, run.place, run.pipeline);
  const step = manifest === 'cannot-run' || StoredFileUnreadable.isUnreadableFile(manifest) ? undefined : gateStepsOf(manifest, run.place, job)[run.stepIndex];
  if (step !== undefined) await spawnGateStep(context, job, run.pipeline, step);
}

async function spawnGateStep(context: JobLaunchContext, job: Readonly<Job>, pipeline: Readonly<Pipeline>, step: GateStep): Promise<void> {
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  const childFolder = join(jobFolder, step.folder);
  const reportFile = stepReportFileOf(jobFolder, step);
  const lineChildStep: LineChildStep = {
    line: step.line, confinement: step.confinement, subfolder: step.in, ...(reportFile === null ? {} : { reportFile })
  };
  if (step.kind !== 'gate') {
    await JobLines.spawnLineChild(context, job, pipeline, step.folder, lineChildStep);
    return;
  }
  if (!context.gateSlots.tryAcquire(childFolder)) return;
  let spawn: LineChildSpawn;
  try {
    spawn = await JobLines.spawnLineChild(context, job, pipeline, step.folder, lineChildStep);
  } catch (error) {
    context.gateSlots.release(childFolder);
    throw error;
  }
  if (spawn.verdict === 'refused' || spawn.verdict === 'talos-unavailable') context.gateSlots.release(childFolder);
  if (spawn.verdict === 'spawned') {
    context.gateSlots.recordSpawnedProcess(childFolder, spawn.supervisor);
  }
}

export const JobGateRuns = Object.freeze({
  ownGateRunOf,
  instanceSuffixOf,
  manifestOf,
  gateProgressOf,
  gateRunProgressOf,
  gateRunStepReadsLost,
  gatePhaseOfJob,
  spawnNextGateStep,
  spawnGateRunStep,
});
