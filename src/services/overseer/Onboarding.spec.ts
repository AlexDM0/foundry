/**
 * An onboarder's proposed lines at their one call site. What matters: both runs reach the port's `confinedArgvOf`, in the gates' narrowed
 * environment; an `unavailable` answer starts no child and settles as `sandbox-unavailable`, which opens the incident and ends the job failed.
 * A snapshot the removal leaves is named in the log as a leftover, and a refused pass names the tree findings in its facts. The gate lines run
 * through the production gate run in a plain scratch folder; git answers from the recordings of `src/testing/RecordedGit.ts`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';
import { confinedLineOf }                                                           from '../../lib/gate-confinement/ConfinedLine.ts';
import { watcherFilesOf }                                                           from '../../lib/watcher/WatcherFiles.ts';
import { boardFixture }                                                             from '../../testing/BoardFixtures.ts';
import { fakeGateConfinement, FAKE_MISSING_TOOLS_REASON, type FakeGateConfinement } from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                                      from '../../testing/NativePlatformPorts.ts';
import type { RecordedGitStage, RecordedGitStep }                                   from '../../testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, useRecordedGit }                                          from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }                           from '../../testing/ScratchWorkspace.ts';
import { OnboardingProposal, type PipelineProposal }                                from '../lifecycle/OnboardingProposal.ts';
import type { TrackerChange }                                                       from '../tracker/TrackerPipeline.ts';
import { Onboarding, type OnboardingContext }                                       from './Onboarding.ts';
import { WatcherFleet }                                                             from './WatcherFleet.ts';

const AT = '2026-10-31T12:00:00+01:00';
const SNAPSHOT_START_FILE = 'onboarder-start.json';

const recordedGit = useRecordedGit();

const UNPORTABLE_TREE: RecordedGitStep = { gitArguments: ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], answeredAs: GIT_CALL_SHAPES.TREE_OF_AN_UNPORTABLE_COMMIT };
const UNCHANGED_TREE: RecordedGitStep = { gitArguments: ['diff', '--no-ext-diff', 'HEAD', '--'], answeredAs: GIT_CALL_SHAPES.DIFF_OF_AN_UNCHANGED_TREE };
/** One gate, run twice, each run checked for tracked changes, then the tree listed for its findings. */
const PROPOSAL_OF_ONE_GATE: RecordedGitStage = [UNCHANGED_TREE, UNCHANGED_TREE, UNPORTABLE_TREE];

let snapshot = '';
let trackerDirectory = '';

beforeEach(() => {
  snapshot = createScratchDirectory('onboarding-snapshot');
  writeFileSync(join(snapshot, 'example.txt'), 'Example Agency\n');
  trackerDirectory = createScratchDirectory('onboarding-tracker');
});

afterEach(() => {
  removeScratchDirectory(snapshot);
  removeScratchDirectory(trackerDirectory);
});

function proposalRunning(line: string): PipelineProposal {
  return {
    mode: 'setup', prepare: [], gates: [{ name: 'example', run: line }], review: null, constitution: [], agents: {}, notes: ''
  } as unknown as PipelineProposal;
}

function contextUnder(confinement: FakeGateConfinement) {
  return {
    platformPorts:   nativePlatformPorts(),
    gateEnvironment: { EXAMPLE_NARROWED: 'kept', PATH: '/usr/bin:/bin' },
    millisecondsNow: () => 0,
    confinedLineOf:  (directory: string, argv: readonly string[]) => confinedLineOf(confinement, () => ({
      worktree:            directory,
      worktreeAdminFolder: null,
      temporaryDirectory:  null,
      writableCachePaths:  [],
      deniedWritableRoots: [],
      deniedReadableRoots: [],
      network:             false,
      confinementFilePath: join(trackerDirectory, 'example.sb'),
    }), argv),
  };
}

test('both runs go through the port, on the snapshot, in the narrowed environment', async () => {
  const confinement = fakeGateConfinement('confined');
  const printed = join(trackerDirectory, 'environment.txt');

  const outcome = await recordedGit.playStage(PROPOSAL_OF_ONE_GATE, () => Onboarding.proposalOutcomeOf(
    contextUnder(confinement), proposalRunning(`echo "$EXAMPLE_NARROWED" > '${printed}'`), snapshot, 'example-commit'
  ));

  expect(outcome).toMatchObject({ verdict: 'proposed', runRecord: { gates: [{ verdict: 'green' }] } });
  expect(confinement.plans.map((plan) => plan.worktree)).toEqual([snapshot, snapshot]);
  expect(readFileSync(printed, 'utf8').trim()).toBe('kept');
});

test('a proposal reports a reserved name, a case collision and a symbolic link in one finding each', async () => {
  const outcome = await recordedGit.playStage(PROPOSAL_OF_ONE_GATE, () => Onboarding.proposalOutcomeOf(
    contextUnder(fakeGateConfinement('confined')), proposalRunning('true'), snapshot, 'example-commit'
  ));

  expect(outcome).toMatchObject({ verdict: 'proposed' });
  if (outcome.verdict !== 'proposed') return;
  expect(outcome.treeFindings).toEqual([
    { kind: 'reserved-name', paths: ['aux.c'] },
    { kind: 'symbolic-link', paths: ['example-link'] },
    { kind: 'case-collision', paths: ['README.md', 'readme.md'] },
  ]);
  expect(OnboardingProposal.proposalFactsOf(outcome).treeFindings).toEqual(outcome.treeFindings);
});

test('an unavailable answer starts no child and settles as sandbox-unavailable', async () => {
  const marker = join(trackerDirectory, 'ran.txt');

  const outcome = await recordedGit.playStage([], () => Onboarding.proposalOutcomeOf(
    contextUnder(fakeGateConfinement('unavailable')), proposalRunning(`touch '${marker}'`), snapshot, 'example-commit'
  ));

  expect(outcome).toEqual({ verdict: 'sandbox-unavailable', reason: FAKE_MISSING_TOOLS_REASON });
  expect(existsSync(marker)).toBe(false);
});

test('a settled sandbox-unavailable opens the incident and ends the job failed', async () => {
  const { board } = boardFixture();
  const { job } = board.launchJob({
    kind: 'onboarder', role: 'onboarder', ticketIds: [], parentJobId: null, attempt: 1, target: null
  }, AT);
  OnboardingProposal.storeOutcome(trackerDirectory, job.id, { verdict: 'sandbox-unavailable', reason: FAKE_MISSING_TOOLS_REASON });
  const change = { board, at: AT, workspace: { rootDirectory: snapshot, trackerDirectory } } as unknown as TrackerChange;

  // The removal runs git through `REAL_WORKTREE_REMOVAL_PRIMITIVES`, which holds `GitProcess.run` from load, so no mock reaches it yet.
  await recordedGit.playStage([], async () => Onboarding.applySettledOnboarders(change, trackerDirectory, () => ({ questions: [], context: '' })));

  expect(board.incidents().map((incident) => [incident.kind, incident.facts['reason']])).toEqual([['sandbox-unavailable', FAKE_MISSING_TOOLS_REASON]]);
  expect(board.jobs()).toEqual([]);
});

test('a snapshot the removal leaves is reported as a leftover in the log, and a repository there is never deleted by hand', async () => {
  const { board } = boardFixture();
  const { job } = board.launchJob({
    kind: 'onboarder', role: 'onboarder', ticketIds: [], parentJobId: null, attempt: 1, target: null
  }, AT);
  OnboardingProposal.storeOutcome(trackerDirectory, job.id, { verdict: 'advised' });
  const leftoverSnapshot = join(trackerDirectory, 'onboard', job.id);
  mkdirSync(join(leftoverSnapshot, '.git'), { recursive: true });
  const change = { board, at: AT, workspace: { rootDirectory: snapshot, trackerDirectory } } as unknown as TrackerChange;

  // As above, the removal's git is still real.
  await recordedGit.playStage([], async () => {
    Onboarding.applySettledOnboarders(change, trackerDirectory, () => ({ questions: [], context: '' }));
  });

  const notes = board.logRecordsSoFar().flatMap((record) => (record.kind === 'note' ? [record.fields.text] : []));
  expect(notes).toEqual([expect.stringContaining(`The onboarder snapshot ${leftoverSnapshot} is a leftover`)]);
  expect(existsSync(join(leftoverSnapshot, '.git'))).toBe(true);
});

test('a pass Customs refuses names the tree findings at the end of its facts', async () => {
  const { board } = boardFixture();
  const { job } = board.launchJob({
    kind: 'onboarder', role: 'onboarder', ticketIds: [], parentJobId: null, attempt: 1, target: null
  }, AT);
  board.moveJob(job.id, 'running', AT);
  board.moveJob(job.id, 'in-customs', AT);
  const jobFolder = WatcherFleet.jobFolderOf(trackerDirectory, job.id);
  mkdirSync(jobFolder, { recursive: true });
  writeFileSync(join(jobFolder, SNAPSHOT_START_FILE), `${JSON.stringify({ startCommit: 'example-commit', launchSnapshot: {} })}\n`);
  const { eventLogPath } = watcherFilesOf(jobFolder, job.watcherInstance);
  mkdirSync(dirname(eventLogPath), { recursive: true });
  writeFileSync(eventLogPath, `${JSON.stringify({
    sequence: 1, origin: 'agent', line: 'example-result', at: AT
  })}\n`);
  const context = {
    ...contextUnder(fakeGateConfinement('confined')),
    workspace:             { rootDirectory: snapshot, trackerDirectory },
    worktreesRoot:         join(trackerDirectory, 'worktrees'),
    mainLine:              'main',
    agentAdapter:          { eventsOf: () => [{ kind: 'result', structuredReport: { example: 'no field of the schema' } }] },
    stopGraceMilliseconds: 0,
  } as unknown as OnboardingContext;

  // The report fails its schema, so Customs refuses at its first check before it asks git anything; only the tree listing is asked.
  await recordedGit.playStage([UNPORTABLE_TREE], () => Onboarding.settleEndedOnboarders(context, board));

  const outcome = OnboardingProposal.storedOutcomeOf(trackerDirectory, job.id);
  expect(outcome).toMatchObject({ verdict: 'refused', check: 'V1', reason: 'report-invalid' });
  expect(outcome?.verdict === 'refused' ? outcome.facts.at(-1) : null).toBe('case-collision: README.md, readme.md');
});
