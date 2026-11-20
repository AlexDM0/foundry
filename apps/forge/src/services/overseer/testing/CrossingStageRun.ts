/**
 * A stage job of a crossing ticket on the entity-forge fixture, run as the Overseer runs it: Customs verifies the job against the fixture's
 * recorded git, then its gate run, by the manifest the Overseer writes for the job, is judged green or red. Test-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { GitProcess }                                                                      from '../../../lib/git/GitProcess.ts';
import type { Job }                                                                        from '../../../lib/tracker-model/@types/Job.ts';
import type { Board }                                                                      from '../../../lib/tracker-model/Board.ts';
import { TicketBodyHashUtil }                                                              from '../../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { LIFECYCLE_LIMITS }                                                                from '../../../shared/constants/LifecycleLimits.ts';
import { ENTITY_FORGE_MAIN_LINE }                                                          from '../../../testing/EntityForgeFixture.ts';
import { ENTITY_FORGE_SCENARIO_COMMITS, ENTITY_FORGE_SCENARIOS, type EntityForgeScenario } from '../../../testing/EntityForgeScenarios.ts';
import { NO_UNREADABLE_RECORDS }                                                           from '../../../testing/FixtureRecordAllocation.ts';
import type { RecordedGit }                                                                from '../../../testing/RecordedGit.ts';
import { launchSnapshotOf }                                                                from '../../lifecycle/Customs.ts';
import type { BoardTransaction }                                                           from '../../tracker/BoardTransaction.ts';
import { createLocalRecordAllocation }                                                     from '../../tracker/LocalRecordAllocation.ts';
import { JobLaunch, type JobLaunchContext }                                                from '../JobLaunch.ts';
import { jobFolderIn }                                                                     from '../OverseerFiles.ts';
import { RedHandoff }                                                                      from '../RedHandoff.ts';

const OBJECT_ID_LENGTH = 40;

/** The crossing ticket's board and places, and the recorded git that answers for each stage's scenario. */
export interface CrossingStagePlace {
  readonly board:         Board;
  readonly context:       JobLaunchContext;
  readonly repository:    string;
  readonly ticketId:      string;
  readonly enterScenario: RecordedGit['enterScenario'];
  readonly at:            string;
  /** The tree id each judged gate run reports, which a landing compares with the tree it merges. */
  readonly gatedTreeId:   string;
}

/** A stage job of the ticket: its kind, the entity it runs under and the stage's number. */
export interface StageJob {
  readonly kind:   'build' | 'review';
  readonly entity: string;
  readonly stage:  number;
}

/** Where a stage job's session started, as the scenario names its commits, and its report beside the head it ran on. */
export interface StageRun {
  readonly scenario:           EntityForgeScenario;
  readonly startCommit:        string;
  readonly reportOf:           (headCommit: string) => Record<string, unknown>;
  /** A scope resume this job already spent on an earlier V17 refusal. */
  readonly scopeResumed?:      boolean;
  /** The gate of the job's run that is red, by its name in the run; every gate passes when absent. */
  readonly redGate?:           string;
  /** The red handoffs of the job's gates before this run, each resumed; none when absent. */
  readonly redHandoffsBefore?: number;
}

export interface StageRunEnding {
  readonly job:             Readonly<Job>;
  /** The job's outcome and cause once it ended, else its state, with the red handoff's name once interrupted. */
  readonly whereTheJobWent: string;
}

type GateObservation = Parameters<typeof JobLaunch.applyBuildJobObservations>[2][number]['gate'];

/** Each commit placeholder of the scenario as an object id of its own. */
function commitsOf(scenario: EntityForgeScenario): Record<string, string> {
  return Object.fromEntries(ENTITY_FORGE_SCENARIO_COMMITS[scenario].map((placeholder, i) => [placeholder, `${i + 1}`.repeat(OBJECT_ID_LENGTH)]));
}

function stageRunOf(scenarioName: keyof typeof ENTITY_FORGE_SCENARIOS, startCommit: string, reportOf: StageRun['reportOf']): StageRun {
  return { scenario: ENTITY_FORGE_SCENARIOS[scenarioName], startCommit, reportOf };
}

function builtReportOf(extraFields: Record<string, unknown> = {}): StageRun['reportOf'] {
  return (headCommit) => ({
    role:              'builder',
    outcome:           'built',
    headCommit,
    acceptance:        [],
    alsoFixed:         [],
    gates:             [{ name: 'verify', commit: headCommit }],
    handoff:           'Example handoff.',
    blockedReason:     null,
    cannotBuildReason: null,
    ...extraFields,
  });
}

function reviewedReportOf(extraFields: Record<string, unknown> = {}): StageRun['reportOf'] {
  return (headCommit) => ({
    role: 'reviewer', headCommit, claims: [], findings: [], reviewText: 'Example review.', ...extraFields
  });
}

function observationOf(jobId: string, report: unknown, gate: GateObservation) {
  return {
    jobId,
    setup:            'installed' as const,
    installStepRuns:  [],
    calls:            1,
    report,
    agentEnd:         null,
    gate,
    sandboxRefusal:   null,
    targetCatchUp:    { verdict: 'not-checked' as const },
    mainMerge:        null,
    conflictReReview: null,
  };
}

function launchedStageJobOf(place: CrossingStagePlace, stageJob: StageJob): Readonly<Job> {
  return place.board.launchJob({
    kind:        stageJob.kind,
    role:        stageJob.kind === 'build' ? 'builder' : 'reviewer',
    ticketIds:   [place.ticketId],
    parentJobId: null,
    attempt:     1,
    target:      ENTITY_FORGE_MAIN_LINE,
    entity:      stageJob.entity,
    stage:       stageJob.stage,
  }, place.at).job;
}

function writeEarlierRedHandoffs(jobFolder: string, run: StageRun): void {
  const facts = {
    command:             null,
    fixCommand:          null,
    commit:              '',
    batonPassPath:       RedHandoff.batonPassPathOf(jobFolder),
    fullLogPath:         null,
    resumesAllowed:      LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    interruptedInstance: 1,
    callBudget:          50,
  };
  if (run.scopeResumed === true) {
    RedHandoff.writeRedHandoff(jobFolder, {
      ...facts, kind: 'customs', name: 'V17', exitCode: null, resume: 1, scopeResumed: true
    }, 'V17 refused');
  }
  if (run.redHandoffsBefore !== undefined) {
    RedHandoff.writeRedHandoff(jobFolder, {
      ...facts, kind: 'gate', name: run.redGate ?? '', exitCode: 1, resume: run.redHandoffsBefore
    }, 'Example red gate.');
  }
}

function ticketOf(place: CrossingStagePlace) {
  return place.board.tickets().find((candidate) => candidate.frontmatter.id === place.ticketId);
}

/** The job's start as the Overseer records it at the first child's launch. */
function writeJobStart(place: CrossingStagePlace, job: Readonly<Job>, jobFolder: string, startCommit: string): void {
  const jobStart = {
    startCommit,
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(ticketOf(place)?.body ?? ''),
    launchSnapshot:   launchSnapshotOf(JobLaunch.worktreeOf(place.context.workspace, job)),
    ...JobLaunch.packageBuildStartOf(place.board, job),
  };
  writeFileSync(join(jobFolder, 'start.json'), JSON.stringify(jobStart));
}

/**
 * Takes a launched stage job through its preparation, which starts a review's bar, to Customs; once Customs passed, its gate run, by the
 * manifest the Overseer writes for the job, is judged green, or red at `redGate`.
 */
function verifiedStageJobOf(place: CrossingStagePlace, job: Readonly<Job>, run: StageRun): StageRunEnding {
  const { board, context, at } = place;
  const commits = commitsOf(run.scenario);
  place.enterScenario(run.scenario, { repositoryDirectory: place.repository, commits });
  mkdirSync(JobLaunch.worktreeOf(context.workspace, job), { recursive: true });
  const jobFolder = jobFolderIn(context.workspace.trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  writeEarlierRedHandoffs(jobFolder, run);
  writeJobStart(place, job, jobFolder, commits[run.startCommit] ?? '');
  const change = {
    board, at, workspace: context.workspace, records: createLocalRecordAllocation(context.workspace, board, NO_UNREADABLE_RECORDS)
  } as unknown as BoardTransaction;
  JobLaunch.applyBuildJobObservations(change, context, [observationOf(job.id, null, { verdict: 'pending' })]);
  for (const state of ['running', 'in-customs'] as const) board.moveJob(job.id, state, at);
  const report = run.reportOf(GitProcess.resolvedCommitOf(JobLaunch.worktreeOf(context.workspace, job), 'HEAD') ?? '');
  JobLaunch.applyBuildJobObservations(change, context, [observationOf(job.id, report, { verdict: 'pending' })]);
  const pipeline = board.pipeline();
  if (board.jobById(job.id)?.state === 'gating' && pipeline !== null) {
    const manifest = JobLaunch.manifestOf(pipeline, job, job.kind === 'review' ? 'review' : 'build', JobLaunch.packageBuildStartOf(place.board, job));
    const verdict = run.redGate === undefined
      ? { outcome: 'passed' as const, step: null, output: '' }
      : {
        outcome: 'failed' as const, step: run.redGate, output: 'Example red gate.', exitCode: 1
      };
    JobLaunch.applyBuildJobObservations(change, context, [observationOf(job.id, report, {
      verdict: 'judged', treeId: place.gatedTreeId, ...verdict, ran: true, manifest, cacheReports: [], stepRuns: []
    })]);
  }
  const ended = board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === job.id);
  if (ended?.kind === 'job-ended') return { job, whereTheJobWent: `${ended.fields.outcome}: ${ended.fields.cause ?? ''}` };
  const state = board.jobById(job.id)?.state ?? 'gone';
  return { job, whereTheJobWent: state === 'interrupted' ? `${state}: ${RedHandoff.redHandoffFactsOf(jobFolder)?.name ?? ''}` : state };
}

/** Launches the stage job straight on the board, by the stage the spec names, and runs it. */
function runStage(place: CrossingStagePlace, stageJob: StageJob, run: StageRun): StageRunEnding {
  return verifiedStageJobOf(place, launchedStageJobOf(place, stageJob), run);
}

export const CrossingStageRun = Object.freeze({
  commitsOf,
  stageRunOf,
  builtReportOf,
  reviewedReportOf,
  verifiedStageJobOf,
  runStage,
});
