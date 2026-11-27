/**
 * Which gate step a gating job waits on, read outside the lock. What matters: a review that left the tree it was given (the tree the
 * build's gates passed) runs no gate at all, unless its hold marked that green not current; and a review that changed the tree, and any
 * build, waits on the pipeline's first step. A build job runs only the build phase's gates and a review job only the review phase's, and a
 * phase with no gates passes at once without its prepare steps. Each prepare step runs as a process of its own, never as one joined line:
 * the install and the gate run wait on each step's own line in turn; a line a clean quit paused is never judged, its next instance runs it
 * again, and a line Talos stopped at its time bound judges `cannot-run`, or `install-failed` for an install step, its output naming the
 * bound. A line a crash start found gone with no end of its own is never judged either: the hold logs it lost once and its job spawns
 * nothing until User's resume, while one found lost on a handover runs again by itself. A run's steps and stamp are its manifest's, written
 * at its start: a pipeline edited or reordered mid-run never passes an unrun gate, a kept verdict counts only under an equal manifest, and
 * the settlement stamps the manifest's hash. A prepare step that exits 0 but changes a tracked file is a setup failure, never the first
 * gate's red. Each gate keeps what its line reported of its cache at its report path, read once and removed, and a report outside version
 * 1's words is none; a kept verdict changed by hand into any other shape is unreadable, never judged again; the settlement logs each
 * gate's report with the manifest's phase. A job of an entity installs with its entity's prepare steps and runs its entity's gates, each
 * folder read from the entity's first home, under a stamp that names the entity's phase hash; a job of an entity the pipeline no longer
 * holds cannot run its gates. Each step line that ran is recorded with its run time, once, in the hold that consumes it: an install's when
 * the job leaves `preparing`, a gate run's at its settlement in the manifest's phase; a line stopped at its bound records `time-bound`, a
 * paused instance's run never, and a run that ran no line none. git answers the tree reads from the recordings of `src/testing/RecordedGit.ts`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { GateRunManifest }                         from '../../adapters/gate-manifest/GateRunManifestIngestion.ts';
import { createJobStartWriter }                         from '../../adapters/job-start/JobStartWriter.ts';
import type { ChildEnd }                                from '../../domain/talos/ChildRecord.ts';
import type { InterruptionCause, Job }                  from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                               from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                from '../../domain/tracker-model/@types/Pipeline.ts';
import { PipelineUtil }                                 from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { branchNamesOf }                                from '../../shared/BranchNames.ts';
import { LINE_TIME_BOUND_MILLISECONDS }                 from '../../shared/constants/HephaestusLimits.ts';
import { PRODUCT_NAMES }                                from '../../shared/constants/ProductNames.ts';
import { boardFixture, refusalDetailOf, ticketFixture } from '../../testing/BoardFixtures.ts';
import { nativePlatformPorts }                          from '../../testing/NativePlatformPorts.ts';
import { PlantedChild }                                 from '../../testing/PlantedChild.ts';
import { commitResolved }                               from '../../testing/RecordedAirlockGit.ts';
import {
  GIT_CALL_SHAPES,
  type GitCallShape,
  type RecordedGitStage,
  type RecordedGitStep,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }             from '../../testing/ScratchWorkspace.ts';
import { EVERY_TALOS_IS_LIVE, talosChildReadingsWith }                from '../../testing/TalosChildReadings.ts';
import { testWhenGitIsRecorded }                                      from '../../testing/ToolGuard.ts';
import { GateRun }                                                    from '../lifecycle/GateRun.ts';
import type { BoardTransaction }                                      from '../tracker/BoardTransaction.ts';
import { jobFolderIn }                                                from './HephaestusFiles.ts';
import { type BuildJobObservation, JobLaunch, type JobLaunchContext } from './JobLaunch.ts';

const PIPELINE: Pipeline = {
  version: 5,
  prepare: [],
  gates:   [{ name: 'tests', run: 'true' }, { name: 'lint', run: 'true' }],
  phases:  { build: ['tests', 'lint'], review: ['tests', 'lint'], merge: ['tests', 'lint'] },
};
const START_COMMIT = 'example-start-commit';
const SETTLED_AT = '2026-10-30T10:00:00+01:00';
const EXAMPLE_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const recordedGit = useRecordedGit();
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

function treeOf(revision: string, answeredAs: GitCallShape): RecordedGitStep {
  return { gitArguments: ['rev-parse', '--verify', '--quiet', `${revision}^{tree}`], answeredAs };
}

const HEAD_ON_THE_START_TREE = treeOf('HEAD', GIT_CALL_SHAPES.TREE_OF_AN_EMPTY_COMMIT);
const START_TREE = treeOf(START_COMMIT, GIT_CALL_SHAPES.TREE_OF_AN_EMPTY_COMMIT);
const TRACKED_TREE_UNCHANGED: RecordedGitStep = { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };

interface GatingScene {
  context: JobLaunchContext;
  jobOf:   (kind: 'build' | 'review') => Job;
}

/** A ticket worktree folder whose job started on `START_COMMIT`, as `recordJobStart` writes it. */
function gatingScene(): GatingScene {
  const rootDirectory = createScratchDirectory('job-gating');
  folders.push(rootDirectory);
  mkdirSync(join(rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER, 'ticket-001'), { recursive: true });
  const trackerDirectory = join(rootDirectory, '.example-tracker');
  const jobFolder = jobFolderIn(trackerDirectory, 'J2');
  mkdirSync(jobFolder, { recursive: true });
  createJobStartWriter(join(jobFolder, 'start.json')).write({ startCommit: START_COMMIT, contentHashAtLaunch: '', launchSnapshot: { refs: {}, hooksFolderDigest: null } });
  const platformPorts = nativePlatformPorts();
  const context = {
    platformPorts,
    boardChildren: talosChildReadingsWith(platformPorts, trackerDirectory, EVERY_TALOS_IS_LIVE),
    workspace:     { rootDirectory, trackerDirectory },
    agentAdapter:  { eventsOf: () => [] },
    branchNames:   branchNamesOf(null),
  } as unknown as JobLaunchContext;
  const jobOf = (kind: 'build' | 'review'): Job => ({
    id: 'J2', kind, state: 'gating', ticketIds: ['001'], childInstance: 1
  }) as unknown as Job;
  return { context, jobOf };
}

function gateOf(scene: GatingScene, kind: 'build' | 'review', stage: RecordedGitStage, pipeline: Pipeline = PIPELINE): Promise<unknown> {
  return recordedGit.playStage(stage, () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [scene.jobOf(kind)], pipeline)[0]?.gate));
}

testWhenGitIsRecorded('a review that left the tree it was given runs no gate and is judged passed', async () => {
  expect(await gateOf(gatingScene(), 'review', [HEAD_ON_THE_START_TREE, START_TREE])).toMatchObject({
    verdict: 'judged', outcome: 'passed', step: null, ran: false
  });
});

testWhenGitIsRecorded('a review that left the tree it was given waits on the first gate once its hold marked the green not current', async () => {
  const scene = gatingScene();
  writeFileSync(join(jobFolderIn(scene.context.workspace.trackerDirectory, 'J2'), 'regate-required'), 'example-tree\n');

  expect(await gateOf(scene, 'review', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });
});

testWhenGitIsRecorded('a review that changed the tree waits on the first gate', async () => {
  const headOnAChangedTree = treeOf('HEAD', GIT_CALL_SHAPES.TREE_OF_A_COMMIT_WITH_A_FILE);

  expect(await gateOf(gatingScene(), 'review', [headOnAChangedTree, START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });
});

testWhenGitIsRecorded('a review whose start cannot be read is judged by no gate: its gate reads as the unreadable start', async () => {
  const scene = gatingScene();
  writeFileSync(join(jobFolderIn(scene.context.workspace.trackerDirectory, 'J2'), 'start.json'), '{"startCommit": ');

  expect(await gateOf(scene, 'review', [HEAD_ON_THE_START_TREE])).toEqual({ verdict: 'unreadable-file', file: 'jobs/J2/start.json', reason: expect.stringContaining('JSON') });
});

testWhenGitIsRecorded('a build always waits on the first gate, even on the tree it started from', async () => {
  expect(await gateOf(gatingScene(), 'build', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });
});

const TWO_PREPARE_STEPS: Pipeline = { ...PIPELINE, prepare: [{ name: 'install', run: 'bun install' }, { name: 'generate', run: 'bun run generate' }] };

/** One instance of a step's line, ended as Talos records the end. */
function endStepLine(scene: GatingScene, folderName: string, end: Partial<ChildEnd>, instance = 1): void {
  PlantedChild.plantChildRecord({ boardFolder: scene.context.workspace.trackerDirectory, childFolder: `jobs/J2/${folderName}`, instance }, {
    kind:                  'line',
    state:                 'ended',
    timeBoundMilliseconds: LINE_TIME_BOUND_MILLISECONDS,
    end:                   {
      reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 0, ...end
    },
  });
}

/** One instance of a step's line, exited with the given exit code. */
function endStepExited(scene: GatingScene, folderName: string, exitCode: number): void {
  endStepLine(scene, folderName, { exitCode });
}

function setupOf(scene: GatingScene): Promise<unknown> {
  const job = { ...scene.jobOf('build'), state: 'preparing' } as Job;
  return recordedGit.playStage([], () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [job], TWO_PREPARE_STEPS)[0]?.setup));
}

testWhenGitIsRecorded('each prepare step installs as a line of its own: installed only once every step exited 0', async () => {
  const scene = gatingScene();
  expect(await setupOf(scene)).toBe('installing');

  endStepExited(scene, 'install', 0);
  expect(await setupOf(scene)).toBe('installing');

  endStepExited(scene, 'install2', 0);
  expect(await setupOf(scene)).toBe('installed');
});

testWhenGitIsRecorded('a failed first prepare step fails the install without waiting on the second', async () => {
  const scene = gatingScene();
  endStepExited(scene, 'install', 1);

  expect(await setupOf(scene)).toBe('install-failed');
});

testWhenGitIsRecorded('an install step Talos stopped at its time bound fails the install', async () => {
  const scene = gatingScene();
  endStepLine(scene, 'install', { reason: 'time-bound', exitCode: null, signal: 'SIGTERM' });

  expect(await setupOf(scene)).toBe('install-failed');
});

testWhenGitIsRecorded('an install step a clean quit paused installs again as its next instance, its first end never read', async () => {
  const scene = gatingScene();
  endStepLine(scene, 'install', { reason: 'paused', exitCode: null, signal: 'SIGTERM' });
  expect(await setupOf(scene)).toBe('installing');

  endStepExited(scene, 'install', 0);
  endStepLine(scene, 'install', { exitCode: 0 }, 2);
  endStepExited(scene, 'install2', 0);
  expect(await setupOf(scene)).toBe('installed');
});

testWhenGitIsRecorded('an install step gone with no end of its own is never judged: the install waits on it as a lost install line', async () => {
  const scene = gatingScene();
  endStepExited(scene, 'install', 0);
  PlantedChild.plantChildRecord({ boardFolder: scene.context.workspace.trackerDirectory, childFolder: 'jobs/J2/install2', instance: 1 }, {
    kind: 'line', state: 'ended', timeBoundMilliseconds: LINE_TIME_BOUND_MILLISECONDS, end: null,
  });
  const job = { ...scene.jobOf('build'), state: 'preparing' } as Job;

  const [observation] = await recordedGit.playStage([], () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [job], TWO_PREPARE_STEPS)));

  expect(observation).toMatchObject({ setup: 'installing', lostLine: 'install' });
});

testWhenGitIsRecorded('a gate a clean quit paused is never judged: the run waits on that step again until its next instance ends', async () => {
  const scene = gatingScene();
  endStepExited(scene, 'gate-prepare', 0);
  endStepLine(scene, 'gate-1', { reason: 'paused', exitCode: null, signal: 'SIGTERM' });

  expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE)).toMatchObject({ verdict: 'running', stepIndex: 1 });
  expect(existsSync(join(jobFolderIn(scene.context.workspace.trackerDirectory, 'J2'), 'gate-1-verdict.json'))).toBe(false);

  endStepLine(scene, 'gate-1', { exitCode: 1 }, 2);
  // The prepare step's verdict is kept from the first read, so only the gate's own tree check is asked.
  expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE)).toMatchObject({
    verdict: 'judged', outcome: 'failed', step: 'lint', ran: true
  });
});

testWhenGitIsRecorded('a gate Talos stopped at its time bound judges cannot-run, its output naming the bound', async () => {
  const scene = gatingScene();
  endStepExited(scene, 'gate-prepare', 0);
  endStepLine(scene, 'gate-1', { reason: 'time-bound', exitCode: null, signal: 'SIGTERM' });

  const gate = await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE);
  expect(gate).toMatchObject({
    verdict: 'judged', outcome: 'cannot-run', step: 'lint', ran: true
  });
  expect(JSON.stringify(gate)).toContain(GateRun.timeBoundLineOf(LINE_TIME_BOUND_MILLISECONDS));
});

testWhenGitIsRecorded('a gate run runs each prepare step as a step of its own before the first gate', async () => {
  const scene = gatingScene();
  const gateWith = (stage: RecordedGitStage): Promise<unknown> => recordedGit.playStage([HEAD_ON_THE_START_TREE, ...stage], () => Promise.resolve(
    JobLaunch.observeBuildJobs(scene.context, [scene.jobOf('build')], TWO_PREPARE_STEPS)[0]?.gate
  ));
  expect(await gateWith([])).toMatchObject({ verdict: 'running', stepIndex: 0 });

  endStepExited(scene, 'gate-prepare', 0);
  expect(await gateWith([TRACKED_TREE_UNCHANGED])).toMatchObject({ verdict: 'running', stepIndex: 1 });

  endStepExited(scene, 'gate-prepare2', 0);
  expect(await gateWith([TRACKED_TREE_UNCHANGED])).toMatchObject({ verdict: 'running', stepIndex: 2 });
});

testWhenGitIsRecorded('a prepare step that exits 0 but changes a tracked file is a setup failure with its diff, before the first gate runs', async () => {
  const scene = gatingScene();
  endStepExited(scene, 'gate-prepare', 0);
  const trackedTreeChanged: RecordedGitStep = { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_A_REFORMATTED_FILE };

  const gate = await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, trackedTreeChanged], TWO_PREPARE_STEPS);

  expect(gate).toMatchObject({
    verdict: 'judged', outcome: 'setup-failed', step: 'prepare', ran: true
  });
  expect(JSON.stringify(gate)).toContain('source.txt');
});

/** Each phase runs a gate of its own, none of them first in the gate list, so the gate a job's first gate folder runs names its phase. */
const ONE_GATE_PER_PHASE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'audit', run: 'bun run audit' }, { name: 'tests', run: 'bun test' }, { name: 'lint', run: 'bun run lint' }],
  phases:  { build: ['lint'], review: ['tests'], merge: ['audit'] },
};

testWhenGitIsRecorded('a build job runs only the build phase\'s gates, after the prepare steps', async () => {
  const scene = gatingScene();
  endStepExited(scene, 'gate-prepare', 0);
  endStepExited(scene, 'gate-1', 1);

  expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE)).toMatchObject({
    verdict: 'judged', outcome: 'failed', step: 'lint', ran: true
  });
});

testWhenGitIsRecorded('a review job runs only the review phase\'s gates, after the prepare steps', async () => {
  const scene = gatingScene();
  const headOnAChangedTree = treeOf('HEAD', GIT_CALL_SHAPES.TREE_OF_A_COMMIT_WITH_A_FILE);
  endStepExited(scene, 'gate-prepare', 0);
  endStepExited(scene, 'gate-1', 1);

  expect(await gateOf(scene, 'review', [headOnAChangedTree, START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE)).toMatchObject({
    verdict: 'judged', outcome: 'failed', step: 'tests', ran: true
  });
});

testWhenGitIsRecorded('a phase with no gates passes at once and runs no prepare step, though the pipeline has one', async () => {
  const noBuildGates: Pipeline = { ...ONE_GATE_PER_PHASE, phases: { ...ONE_GATE_PER_PHASE.phases, build: [] } };

  expect(await gateOf(gatingScene(), 'build', [HEAD_ON_THE_START_TREE], noBuildGates)).toMatchObject({
    verdict: 'judged', outcome: 'passed', step: null, ran: true
  });
});

function jobFileOf(scene: GatingScene, fileName: string): string {
  return join(jobFolderIn(scene.context.workspace.trackerDirectory, 'J2'), fileName);
}

function gateNamesOf(progress: unknown): string[] | undefined {
  return (progress as { manifest?: GateRunManifest | null }).manifest?.gates.map((gate) => gate.name);
}

/** `audit` added in front of the build gates, as a `gate add --phases build` and a `gate order` while a run is under way leave it. */
const AUDIT_ADDED_IN_FRONT: Pipeline = {
  ...PIPELINE,
  gates:  [{ name: 'audit', run: 'bun run audit' }, ...PIPELINE.gates],
  phases: { ...PIPELINE.phases, build: ['audit', 'tests', 'lint'] },
};

describe('the gate-run manifest', () => {
  testWhenGitIsRecorded('is written at the run\'s start with its phase, its phase hash and its steps, and never rewritten', async () => {
    const scene = gatingScene();
    await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE]);
    const writtenAtTheStart = readFileSync(jobFileOf(scene, 'gate-run.json'), 'utf8');

    expect(JSON.parse(writtenAtTheStart)).toEqual({
      version: 1, phase: 'build', phaseHash: PipelineUtil.phaseHashOf(PIPELINE, 'build'), prepare: [], gates: PIPELINE.gates
    });

    await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE], AUDIT_ADDED_IN_FRONT);
    expect(readFileSync(jobFileOf(scene, 'gate-run.json'), 'utf8')).toBe(writtenAtTheStart);
  });

  testWhenGitIsRecorded('a gate added in front mid-run never passes unrun: the run keeps its manifest\'s gates and its hash', async () => {
    const scene = gatingScene();
    expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });

    endStepExited(scene, 'gate-1', 0);
    expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED], AUDIT_ADDED_IN_FRONT)).toMatchObject({ verdict: 'running', stepIndex: 1 });

    endStepExited(scene, 'gate-2', 0);
    const judged = await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED], AUDIT_ADDED_IN_FRONT);
    expect(judged).toMatchObject({
      verdict: 'judged', outcome: 'passed', ran: true, manifest: { phase: 'build', phaseHash: PipelineUtil.phaseHashOf(PIPELINE, 'build') }
    });
    expect(gateNamesOf(judged)).toEqual(['tests', 'lint']);
  });

  testWhenGitIsRecorded('a reorder mid-run names the red gate the run ran, not the gate the pipeline now puts in its folder', async () => {
    const scene = gatingScene();
    await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE]);
    endStepExited(scene, 'gate-1', 0);
    endStepExited(scene, 'gate-2', 1);
    const reordered: Pipeline = { ...PIPELINE, phases: { ...PIPELINE.phases, build: ['lint', 'tests'] } };

    const judged = await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED], reordered);

    expect(judged).toMatchObject({ verdict: 'judged', outcome: 'failed', step: 'lint' });
  });

  testWhenGitIsRecorded('a kept verdict is reused only under an equal manifest', async () => {
    const scene = gatingScene();
    const running = await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE]) as { treeId: string };
    const keptVerdictOf = (phaseHash: string): string => `${JSON.stringify({
      version: 1, treeId: running.treeId, phase: 'build', phaseHash, outcome: 'passed', output: '', exitCode: 0
    })}\n`;

    writeFileSync(jobFileOf(scene, 'gate-1-verdict.json'), keptVerdictOf('another-manifest'));
    expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 0 });

    writeFileSync(jobFileOf(scene, 'gate-1-verdict.json'), keptVerdictOf(PipelineUtil.phaseHashOf(PIPELINE, 'build')));
    expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'running', stepIndex: 1 });
  });

  testWhenGitIsRecorded('a manifest that cannot be read is never replaced, and the run waits on the file\'s incident', async () => {
    const gateWithANetworkText = { name: 'tests', run: 'bun test', network: 'example.com' };
    const unreadableManifests = [
      '{ "phase": "build" }\n',
      `${JSON.stringify({
        version: 1, phase: 'build', phaseHash: PipelineUtil.phaseHashOf(PIPELINE, 'build'), prepare: [], gates: [gateWithANetworkText]
      })}\n`,
    ];
    for (const unreadable of unreadableManifests) {
      const scene = gatingScene();
      writeFileSync(jobFileOf(scene, 'gate-run.json'), unreadable);

      expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'unreadable-file', file: 'jobs/J2/gate-run.json' });
      expect(readFileSync(jobFileOf(scene, 'gate-run.json'), 'utf8')).toBe(unreadable);
    }
  });

  testWhenGitIsRecorded('a session resumed after a red handoff starts a run of its own, with a manifest of its own', async () => {
    const scene = gatingScene();
    const resumed = { ...scene.jobOf('build'), childInstance: 2 } as Job;
    await recordedGit.playStage([HEAD_ON_THE_START_TREE], () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [resumed], PIPELINE)));

    expect(existsSync(jobFileOf(scene, 'gate-run-2.json'))).toBe(true);
    expect(existsSync(jobFileOf(scene, 'gate-run.json'))).toBe(false);
  });
});

describe('the gate run\'s settlement', () => {
  test('stamps the manifest\'s phase and hash, not the pipeline\'s now, and queues no green the pipeline changed under', () => {
    const { board, progress } = boardFixture({ pipeline: AUDIT_ADDED_IN_FRONT, tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, SETTLED_AT);
    for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(job.id, state, SETTLED_AT);
    const manifest: GateRunManifest = { ...PipelineUtil.gateRunStampOf(PIPELINE, 'build'), prepare: [], gates: PIPELINE.gates };
    const scene = gatingScene();
    const change = { board, at: SETTLED_AT } as unknown as BoardTransaction;

    JobLaunch.applyBuildJobObservations(change, { ...scene.context, mainLine: 'main', log: () => undefined }, [{
      jobId:           job.id,
      setup:           'installed',
      installStepRuns: [],
      calls:           0,
      report:          { headCommit: 'example-head-commit', handoff: 'Example handoff.' },
      agentEnd:        null,
      gate:            {
        verdict: 'judged', treeId: EXAMPLE_TREE, outcome: 'passed', step: null, output: '', ran: true, manifest, cacheReports: [], stepRuns: []
      },
      sandboxRefusal:   null,
      targetCatchUp:    { verdict: 'not-checked' },
      mainMerge:        null,
      conflictReReview: null,
    }]);

    expect(progress.tasks[0]).toMatchObject({ greenPhase: 'build', pipelineHash: manifest.phaseHash, greenTree: EXAMPLE_TREE });
    expect(board.greenIsCurrent('001', EXAMPLE_TREE, 'build')).toBe(false);
    expect(board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(board.ticketIsMergeQueued('001')).toBe(false);
  });
});

describe('a gate\'s cache report', () => {
  const BOTH_GATES_ENDED = [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED];

  function writeReport(scene: GatingScene, folderName: string, report: unknown): string {
    const reportFile = GateRun.gateReportFileFor(jobFileOf(scene, folderName));
    writeFileSync(reportFile, JSON.stringify(report));
    return reportFile;
  }

  testWhenGitIsRecorded('is kept with each gate\'s verdict, read once and removed, and a gate that reported nothing has none', async () => {
    const scene = gatingScene();
    const reportFile = writeReport(scene, 'gate-1', { version: 1, cache: 'hit' });
    endStepExited(scene, 'gate-1', 0);
    endStepExited(scene, 'gate-2', 0);
    const cacheReports = [{ gateName: 'tests', cacheReport: 'hit' }, { gateName: 'lint', cacheReport: null }];
    const judged = { verdict: 'judged', outcome: 'passed', cacheReports };

    expect(await gateOf(scene, 'build', BOTH_GATES_ENDED)).toMatchObject(judged);
    const keptVerdict = JSON.parse(readFileSync(jobFileOf(scene, 'gate-1-verdict.json'), 'utf8')) as { cacheReport?: string };
    expect([existsSync(reportFile), keptVerdict.cacheReport]).toEqual([false, 'hit']);
    expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE])).toMatchObject(judged);
  });

  testWhenGitIsRecorded('reads as none from a report of another version or outside the cache words, which is removed all the same', async () => {
    const scene = gatingScene();
    const reportFiles = [writeReport(scene, 'gate-1', { version: 2, cache: 'hit' }), writeReport(scene, 'gate-2', { version: 1, cache: 'warm' })];
    endStepExited(scene, 'gate-1', 0);
    endStepExited(scene, 'gate-2', 0);

    const cacheReports = [{ gateName: 'tests', cacheReport: null }, { gateName: 'lint', cacheReport: null }];

    expect(await gateOf(scene, 'build', BOTH_GATES_ENDED)).toMatchObject({ cacheReports });
    expect(reportFiles.map(existsSync)).toEqual([false, false]);
  });

  testWhenGitIsRecorded('kept in a verdict changed by hand to a word outside the cache words, makes the verdict unreadable, never judged again', async () => {
    const scene = gatingScene();
    const running = await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE]) as { treeId: string };
    writeFileSync(jobFileOf(scene, 'gate-1-verdict.json'), `${JSON.stringify({
      version:     1,
      treeId:      running.treeId,
      phase:       'build',
      phaseHash:   PipelineUtil.phaseHashOf(PIPELINE, 'build'),
      outcome:     'failed',
      output:      '',
      exitCode:    1,
      cacheReport: 'warm',
    })}\n`);

    const unreadable = { verdict: 'unreadable-file', file: 'jobs/J2/gate-1-verdict.json', reason: 'its "cacheReport" is not a cache report' };

    expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE])).toEqual(unreadable);
  });

  testWhenGitIsRecorded('a kept verdict that is not JSON stops the run on it, and its ended line is not judged again over it', async () => {
    const scene = gatingScene();
    endStepExited(scene, 'gate-1', 1);
    writeFileSync(jobFileOf(scene, 'gate-1-verdict.json'), '{"treeId": ');

    expect(await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE])).toMatchObject({ verdict: 'unreadable-file', file: 'jobs/J2/gate-1-verdict.json' });
    expect(readFileSync(jobFileOf(scene, 'gate-1-verdict.json'), 'utf8')).toBe('{"treeId": ');
  });

  test('is logged at the settlement with the phase of the manifest the run judged by', () => {
    const { board, records } = boardFixture({ pipeline: PIPELINE, tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, SETTLED_AT);
    for (const state of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(job.id, state, SETTLED_AT);
    const manifest: GateRunManifest = { ...PipelineUtil.gateRunStampOf(PIPELINE, 'build'), prepare: [], gates: PIPELINE.gates };
    const cacheReports = [{ gateName: 'tests', cacheReport: 'partial' as const }, { gateName: 'lint', cacheReport: null }];
    const change = { board, at: SETTLED_AT } as unknown as BoardTransaction;

    JobLaunch.applyBuildJobObservations(change, { ...gatingScene().context, mainLine: 'main', log: () => undefined }, [{
      jobId:           job.id,
      setup:           'installed',
      installStepRuns: [],
      calls:           0,
      report:          { headCommit: 'example-head-commit', handoff: 'Example handoff.' },
      agentEnd:        null,
      gate:            {
        verdict: 'judged', treeId: EXAMPLE_TREE, outcome: 'passed', step: null, output: '', ran: true, manifest, cacheReports, stepRuns: []
      },
      sandboxRefusal:   null,
      targetCatchUp:    { verdict: 'not-checked' },
      mainMerge:        null,
      conflictReReview: null,
    }]);

    expect(records.find((record) => record.kind === 'gate-ran')?.fields).toEqual({
      tree: EXAMPLE_TREE, outcome: 'passed', cached: false, cacheReports: { phase: 'build', gates: cacheReports }
    });
  });
});

/** A forge with entities: the `forge` app installs and gates in its home, one gate at the repository root and one in a folder of the home. */
const PIPELINE_WITH_ENTITIES: Pipeline = {
  version:  5,
  prepare:  [],
  gates:    [],
  phases:   { build: [], review: [], merge: [] },
  entities: {
    root: {
      kind: 'root', home: ['/'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    },
    forge: {
      kind:    'app',
      home:    ['/apps/forge/', '/apps/forge-tools'],
      prepare: [{ name: 'install', run: 'bun install' }],
      gates:   [{ name: 'tests', run: 'bun test' }, { name: 'workspace-lint', run: 'bun run lint', in: '/' }, { name: 'docs', run: 'bun run docs', in: 'docs' }],
      phases:  { build: ['tests', 'workspace-lint', 'docs'], review: ['tests'], merge: ['tests'] },
    },
  },
};

describe('a job of an entity', () => {
  function entityGateOf(scene: GatingScene, entity: string): Promise<unknown> {
    const job = { ...scene.jobOf('build'), entity, stage: 1 } as Job;
    return recordedGit.playStage([HEAD_ON_THE_START_TREE], () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [job], PIPELINE_WITH_ENTITIES)[0]?.gate));
  }

  testWhenGitIsRecorded('runs its entity\'s steps and gates from its first home, under a stamp that names its entity\'s phase hash', async () => {
    const scene = gatingScene();
    expect(await entityGateOf(scene, 'forge')).toMatchObject({ verdict: 'running', stepIndex: 0 });

    expect(JSON.parse(readFileSync(jobFileOf(scene, 'gate-run.json'), 'utf8'))).toEqual({
      version:           1,
      phase:             'build',
      phaseHash:         PipelineUtil.phaseHashOf(PIPELINE_WITH_ENTITIES, 'build'),
      entityPhaseHashes: { forge: PipelineUtil.entityPhaseHashOf(PIPELINE_WITH_ENTITIES, 'forge', 'build') },
      prepare:           [{ name: 'install', run: 'bun install', in: '/apps/forge' }],
      gates:             [
        { name: 'tests', run: 'bun test', in: '/apps/forge' },
        { name: 'workspace-lint', run: 'bun run lint', in: '/' },
        { name: 'docs', run: 'bun run docs', in: '/apps/forge/docs' },
      ],
    });
  });

  testWhenGitIsRecorded('installs with its entity\'s prepare steps', async () => {
    const scene = gatingScene();
    const job = {
      ...scene.jobOf('build'), state: 'preparing', entity: 'forge', stage: 1
    } as Job;
    const setup = (): Promise<unknown> => recordedGit.playStage([], () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [job], PIPELINE_WITH_ENTITIES)[0]?.setup));
    expect(await setup()).toBe('installing');

    endStepExited(scene, 'install', 0);
    expect(await setup()).toBe('installed');
  });

  testWhenGitIsRecorded('of an entity the pipeline no longer holds cannot run its gates, and no manifest is written', async () => {
    const scene = gatingScene();

    expect(await entityGateOf(scene, 'retired')).toMatchObject({
      verdict: 'judged', outcome: 'cannot-run', step: 'gate-run.json', manifest: null
    });
    expect(existsSync(jobFileOf(scene, 'gate-run.json'))).toBe(false);
  });
});

describe('the step run times', () => {
  /** A job of the fixture board in `state`, which the observation of the scene's job `J2` is applied to as its own. */
  function boardJobIn(pipeline: Pipeline, state: 'preparing' | 'gating'): { board: ReturnType<typeof boardFixture>['board']; records: LogRecord[]; jobId: string } {
    const { board, records } = boardFixture({ pipeline, tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, SETTLED_AT);
    const states = state === 'preparing' ? (['preparing'] as const) : (['preparing', 'running', 'in-customs', 'gating'] as const);
    for (const next of states) board.moveJob(job.id, next, SETTLED_AT);
    return { board, records, jobId: job.id };
  }

  function stepRunFieldsOf(records: readonly LogRecord[]): unknown[] {
    return records.filter((record) => record.kind === 'pipeline-step-ran').map((record) => record.fields);
  }

  function applyTo(scene: GatingScene, board: ReturnType<typeof boardFixture>['board'], observation: BuildJobObservation): void {
    const change = { board, at: SETTLED_AT } as unknown as BoardTransaction;
    JobLaunch.applyBuildJobObservations(change, { ...scene.context, mainLine: 'main', log: () => undefined }, [observation]);
  }

  async function observationOf(scene: GatingScene, job: Job, stage: RecordedGitStage, pipeline: Pipeline): Promise<BuildJobObservation> {
    const [observation] = await recordedGit.playStage(stage, () => Promise.resolve(JobLaunch.observeBuildJobs(scene.context, [job], pipeline)));
    if (observation === undefined) throw new Error('The scene observed no job.');
    return observation;
  }

  testWhenGitIsRecorded('an install that ran two steps records two step runs with no phase, once, though the hold sees it again', async () => {
    const scene = gatingScene();
    endStepLine(scene, 'install', { runMilliseconds: 61_000 });
    endStepLine(scene, 'install2', { runMilliseconds: 2000 });
    const { board, records, jobId } = boardJobIn(TWO_PREPARE_STEPS, 'preparing');
    const observation = await observationOf(scene, { ...scene.jobOf('build'), state: 'preparing' } as Job, [], TWO_PREPARE_STEPS);

    applyTo(scene, board, { ...observation, jobId });
    applyTo(scene, board, { ...observation, jobId });

    expect(board.jobById(jobId)?.state).toBe('running');
    expect(stepRunFieldsOf(records)).toEqual([
      {
        stepKind: 'prepare', stepName: 'install', runMilliseconds: 61_000, ending: 'passed'
      },
      {
        stepKind: 'prepare', stepName: 'generate', runMilliseconds: 2000, ending: 'passed'
      },
    ]);
  });

  testWhenGitIsRecorded('an install still running records nothing, and one stopped at its bound records its step time-bound', async () => {
    const scene = gatingScene();
    const preparing = { ...scene.jobOf('build'), state: 'preparing' } as Job;
    const { board, records, jobId } = boardJobIn(TWO_PREPARE_STEPS, 'preparing');
    endStepLine(scene, 'install', { runMilliseconds: 61_000 });

    applyTo(scene, board, { ...await observationOf(scene, preparing, [], TWO_PREPARE_STEPS), jobId });
    expect(stepRunFieldsOf(records)).toEqual([]);

    endStepLine(scene, 'install2', {
      reason: 'time-bound', exitCode: null, signal: 'SIGTERM', runMilliseconds: LINE_TIME_BOUND_MILLISECONDS
    });
    applyTo(scene, board, { ...await observationOf(scene, preparing, [], TWO_PREPARE_STEPS), jobId });
    expect(stepRunFieldsOf(records)).toMatchObject([{ stepName: 'install' }, { stepName: 'generate', runMilliseconds: LINE_TIME_BOUND_MILLISECONDS, ending: 'time-bound' }]);
  });

  testWhenGitIsRecorded('a gate run records one step run for each of its steps at its settlement, in the manifest\'s phase', async () => {
    const scene = gatingScene();
    endStepLine(scene, 'gate-prepare', { runMilliseconds: 5000 });
    endStepLine(scene, 'gate-1', { runMilliseconds: 7000 });
    const { board, records, jobId } = boardJobIn(ONE_GATE_PER_PHASE, 'gating');
    const observation = await observationOf(scene, scene.jobOf('build'), [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE);

    applyTo(scene, board, { ...observation, jobId, report: { headCommit: 'example-head-commit', handoff: 'Example handoff.' } });

    expect(stepRunFieldsOf(records)).toEqual([
      {
        stepKind: 'prepare', stepName: 'install', phase: 'build', runMilliseconds: 5000, ending: 'passed'
      },
      {
        stepKind: 'gate', stepName: 'lint', phase: 'build', runMilliseconds: 7000, ending: 'passed'
      },
    ]);
  });

  testWhenGitIsRecorded('a gate Talos stopped at its bound records its run time-bound', async () => {
    const scene = gatingScene();
    endStepLine(scene, 'gate-prepare', { runMilliseconds: 5000 });
    endStepLine(scene, 'gate-1', {
      reason: 'time-bound', exitCode: null, signal: 'SIGTERM', runMilliseconds: LINE_TIME_BOUND_MILLISECONDS
    });
    const { board, records, jobId } = boardJobIn(ONE_GATE_PER_PHASE, 'gating');
    const observation = await observationOf(scene, scene.jobOf('build'), [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE);

    applyTo(scene, board, { ...observation, jobId });

    expect(stepRunFieldsOf(records).at(-1)).toEqual({
      stepKind: 'gate', stepName: 'lint', phase: 'build', runMilliseconds: LINE_TIME_BOUND_MILLISECONDS, ending: 'time-bound'
    });
  });

  testWhenGitIsRecorded('a gate a clean quit paused records only the run of the instance that was judged', async () => {
    const scene = gatingScene();
    endStepLine(scene, 'gate-prepare', { runMilliseconds: 5000 });
    endStepLine(scene, 'gate-1', {
      reason: 'paused', exitCode: null, signal: 'SIGTERM', runMilliseconds: 3000
    });
    endStepLine(scene, 'gate-1', { exitCode: 1, runMilliseconds: 8000 }, 2);

    const gate = await gateOf(scene, 'build', [HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, TRACKED_TREE_UNCHANGED], ONE_GATE_PER_PHASE);

    expect(gate).toMatchObject({ verdict: 'judged', stepRuns: [{ stepName: 'install', runMilliseconds: 5000 }, { stepName: 'lint', runMilliseconds: 8000, ending: 'failed' }] });
  });

  testWhenGitIsRecorded('a review that left the tree its build\'s gates passed ran no line and has no step run', async () => {
    expect(await gateOf(gatingScene(), 'review', [HEAD_ON_THE_START_TREE, START_TREE])).toMatchObject({ verdict: 'judged', ran: false, stepRuns: [] });
  });
});

describe('a gate line a start found lost', () => {
  const HEAD_COMMIT = '5'.repeat(40);
  const ONE_GATE: Pipeline = {
    version: 5, prepare: [], gates: [{ name: 'tests', run: 'bun test' }], phases: { build: ['tests'], review: ['tests'], merge: ['tests'] },
  };

  interface LostGateScene {
    board:         ReturnType<typeof boardFixture>['board'];
    records:       LogRecord[];
    jobId:         string;
    gateFolder:    string;
    acquiredSlots: string[];
    /** The cause the start reconciles with, `null` once its forced first pass ran or for a start that leaves no work waiting. */
    startCause:    { current: InterruptionCause | null };
    pass:          (stage: RecordedGitStage) => Promise<void>;
  }

  /** A build job of #001 in `gating` whose gate `tests` is the step its run is on; every gate slot is busy, so a spawn stops at the slot. */
  function lostGateScene(): LostGateScene {
    const scene = gatingScene();
    const { board, records } = boardFixture({ pipeline: ONE_GATE, tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
    }, SETTLED_AT);
    for (const next of ['preparing', 'running', 'in-customs', 'gating'] as const) board.moveJob(job.id, next, SETTLED_AT);
    const acquiredSlots: string[] = [];
    const startCause: LostGateScene['startCause'] = { current: 'forge-crashed' };
    const context: JobLaunchContext = {
      ...scene.context,
      mainLine:  'main',
      log:       () => undefined,
      gateSlots: {
        tryAcquire: (holder: string) => {
          acquiredSlots.push(holder);
          return false;
        },
      } as unknown as JobLaunchContext['gateSlots'],
      lostLineCause: () => startCause.current,
    };
    const change = { board, at: SETTLED_AT } as unknown as BoardTransaction;
    const pass = (stage: RecordedGitStage): Promise<void> => recordedGit.playStage(stage, async () => {
      const observations = JobLaunch.observeBuildJobs(context, board.jobs(), ONE_GATE);
      JobLaunch.applyBuildJobObservations(change, context, observations);
      await JobLaunch.runBuildJobEffects(context, board, observations);
    });
    const gateFolder = join(jobFolderIn(scene.context.workspace.trackerDirectory, job.id), 'gate-1');
    return {
      board, records, jobId: job.id, gateFolder, acquiredSlots, startCause, pass
    };
  }

  /** The gate's first instance as Talos's sweep leaves a child gone with its Talos: ended, with no end of its own. */
  function loseTheGate(scene: LostGateScene): void {
    PlantedChild.plantChildRecord({ boardFolder: dirname(scene.gateFolder), childFolder: basename(scene.gateFolder), instance: 1 }, {
      kind: 'line', state: 'ended', timeBoundMilliseconds: LINE_TIME_BOUND_MILLISECONDS, end: null,
    });
  }

  function kindsOf(records: readonly LogRecord[]): string[] {
    return records.map((record) => record.kind);
  }

  testWhenGitIsRecorded('at a crash start logs job-line-lost, opens no red handoff, spawns nothing, and waits on later passes too', async () => {
    const scene = lostGateScene();
    loseTheGate(scene);

    await scene.pass([HEAD_ON_THE_START_TREE]);
    scene.startCause.current = null;
    await scene.pass([HEAD_ON_THE_START_TREE]);

    expect(scene.records.filter((record) => record.kind === 'job-line-lost')).toMatchObject([
      { jobId: scene.jobId, fields: { line: 'gate', cause: 'forge-crashed' } },
    ]);
    expect(kindsOf(scene.records)).not.toContain('job-interrupted');
    expect(scene.board.jobById(scene.jobId)?.state).toBe('gating');
    expect(scene.acquiredSlots).toEqual([]);
  });

  testWhenGitIsRecorded('after User\'s resume the same step spawns again', async () => {
    const scene = lostGateScene();
    loseTheGate(scene);
    await scene.pass([HEAD_ON_THE_START_TREE]);
    scene.startCause.current = null;

    scene.board.instructResume(scene.jobId, SETTLED_AT);
    await scene.pass([HEAD_ON_THE_START_TREE, HEAD_ON_THE_START_TREE]);

    expect(scene.acquiredSlots).toEqual([scene.gateFolder]);
    expect(kindsOf(scene.records).filter((kind) => kind === 'job-line-lost')).toHaveLength(1);
  });

  testWhenGitIsRecorded('resumed, then interrupted by a cause that resumes by itself, spawns the next gate once back in gating', async () => {
    const scene = lostGateScene();
    loseTheGate(scene);
    await scene.pass([HEAD_ON_THE_START_TREE]);
    scene.startCause.current = null;
    scene.board.instructResume(scene.jobId, SETTLED_AT);
    scene.board.interruptJob(scene.jobId, 'handoff-red', SETTLED_AT);
    for (const next of ['running', 'in-customs', 'gating'] as const) scene.board.moveJob(scene.jobId, next, SETTLED_AT);

    await scene.pass([HEAD_ON_THE_START_TREE, HEAD_ON_THE_START_TREE]);

    expect(scene.acquiredSlots).toHaveLength(1);
    expect(refusalDetailOf(() => scene.board.instructResume(scene.jobId, SETTLED_AT))).toEqual({ reason: 'job-not-interrupted', jobId: scene.jobId });
  });

  testWhenGitIsRecorded('found lost on a handover, or once the start reconciled, runs again by itself and logs no lost line', async () => {
    const scene = lostGateScene();
    scene.startCause.current = null;
    loseTheGate(scene);

    await scene.pass([HEAD_ON_THE_START_TREE, HEAD_ON_THE_START_TREE]);

    expect(scene.acquiredSlots).toEqual([scene.gateFolder]);
    expect(kindsOf(scene.records)).not.toContain('job-line-lost');
  });

  testWhenGitIsRecorded('a gate that exited red still opens the red handoff', async () => {
    const scene = lostGateScene();
    PlantedChild.plantEndedChildAt(scene.gateFolder, 1, { exitCode: 1 });

    await scene.pass([HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED, commitResolved('HEAD', HEAD_COMMIT)]);

    expect(scene.board.jobById(scene.jobId)).toMatchObject({ state: 'interrupted', interruption: 'handoff-red' });
    expect(kindsOf(scene.records)).not.toContain('job-line-lost');
  });

  testWhenGitIsRecorded('a gate ended time-bound reads cannot-run and logs no lost line', async () => {
    const scene = lostGateScene();
    PlantedChild.plantEndedChildAt(scene.gateFolder, 1, { reason: 'time-bound', exitCode: null, signal: 'SIGTERM' });

    await scene.pass([HEAD_ON_THE_START_TREE, TRACKED_TREE_UNCHANGED]);

    expect(scene.records.find((record) => record.kind === 'gate-ran')).toMatchObject({ fields: { outcome: 'cannot-run' } });
    expect(kindsOf(scene.records)).not.toContain('job-line-lost');
  });
});
