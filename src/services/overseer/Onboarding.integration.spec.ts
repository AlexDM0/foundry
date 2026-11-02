/**
 * An onboarder's proposed lines at their one call site. What matters: both runs reach the port's `confinedArgvOf`, in the gates' narrowed
 * environment; an `unavailable` answer starts no child and settles as `sandbox-unavailable`, which opens the incident and ends the job failed.
 * A snapshot the removal leaves is named in the log as a leftover.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join }                                from 'node:path';

import { afterEach, beforeEach, expect }                                            from 'bun:test';
import { confinedLineOf }                                                           from '../../lib/gate-confinement/ConfinedLine.ts';
import { boardFixture }                                                             from '../../testing/BoardFixtures.ts';
import { fakeGateConfinement, FAKE_MISSING_TOOLS_REASON, type FakeGateConfinement } from '../../testing/FakeGateConfinement.ts';
import { nativePlatformPorts }                                                      from '../../testing/NativePlatformPorts.ts';
import {
  commitFile,
  createScratchDirectory,
  createScratchGitRepository,
  removeScratchDirectory
} from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsPresent }                      from '../../testing/ToolGuard.ts';
import { OnboardingProposal, type PipelineProposal } from '../lifecycle/OnboardingProposal.ts';
import type { TrackerChange }                        from '../tracker/TrackerPipeline.ts';
import { Onboarding }                                from './Onboarding.ts';

const AT = '2026-10-31T12:00:00+01:00';

let snapshot = '';
let trackerDirectory = '';

beforeEach(() => {
  snapshot = createScratchGitRepository('onboarding-snapshot');
  commitFile(snapshot, 'example.txt', 'Example Agency\n');
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

testWhenGitIsPresent('both runs go through the port, on the snapshot, in the narrowed environment', async () => {
  const confinement = fakeGateConfinement('confined');
  const printed = join(trackerDirectory, 'environment.txt');

  const outcome = await Onboarding.proposalOutcomeOf(contextUnder(confinement), proposalRunning(`echo "$EXAMPLE_NARROWED" > '${printed}'`), snapshot, 'example-commit');

  expect(outcome).toMatchObject({ verdict: 'proposed', runRecord: { gates: [{ verdict: 'green' }] } });
  expect(confinement.plans.map((plan) => plan.worktree)).toEqual([snapshot, snapshot]);
  expect(readFileSync(printed, 'utf8').trim()).toBe('kept');
});

/** Planted through the index, never the file system, so the same tree exists on a case-insensitive host and on one without symbolic links. */
function plantUnportableTree(): void {
  const git = (gitArguments: readonly string[], input?: string): string => {
    const run = Bun.spawnSync(['git', ...gitArguments], { cwd: snapshot, ...input === undefined ? {} : { stdin: Buffer.from(input) } });
    return run.stdout.toString().trim();
  };
  const blob = git(['hash-object', '-w', '--stdin'], 'Example Agency\n');
  const target = git(['hash-object', '-w', '--stdin'], 'example.txt');
  for (const path of ['aux.c', 'README.md', 'readme.md']) git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
  git(['update-index', '--add', '--cacheinfo', `120000,${target},example-link`]);
  git(['commit', '-q', '-m', 'Example unportable tree']);
}

testWhenGitIsPresent('a proposal reports a reserved name, a case collision and a symbolic link in one finding each, on every OS', async () => {
  plantUnportableTree();

  const outcome = await Onboarding.proposalOutcomeOf(contextUnder(fakeGateConfinement('confined')), proposalRunning('true'), snapshot, 'example-commit');

  expect(outcome).toMatchObject({ verdict: 'proposed' });
  if (outcome.verdict !== 'proposed') return;
  expect(outcome.treeFindings).toEqual([
    { kind: 'reserved-name', paths: ['aux.c'] },
    { kind: 'symbolic-link', paths: ['example-link'] },
    { kind: 'case-collision', paths: ['README.md', 'readme.md'] },
  ]);
  expect(OnboardingProposal.proposalFactsOf(outcome).treeFindings).toEqual(outcome.treeFindings);
});

testWhenGitIsPresent('an unavailable answer starts no child and settles as sandbox-unavailable', async () => {
  const marker = join(trackerDirectory, 'ran.txt');

  const outcome = await Onboarding.proposalOutcomeOf(contextUnder(fakeGateConfinement('unavailable')), proposalRunning(`touch '${marker}'`), snapshot, 'example-commit');

  expect(outcome).toEqual({ verdict: 'sandbox-unavailable', reason: FAKE_MISSING_TOOLS_REASON });
  expect(existsSync(marker)).toBe(false);
});

testWhenGitIsPresent('a settled sandbox-unavailable opens the incident and ends the job failed', () => {
  const { board } = boardFixture();
  const { job } = board.launchJob({
    kind: 'onboarder', role: 'onboarder', ticketIds: [], parentJobId: null, attempt: 1, target: null
  }, AT);
  OnboardingProposal.storeOutcome(trackerDirectory, job.id, { verdict: 'sandbox-unavailable', reason: FAKE_MISSING_TOOLS_REASON });
  const change = { board, at: AT, workspace: { rootDirectory: snapshot, trackerDirectory } } as unknown as TrackerChange;

  Onboarding.applySettledOnboarders(change, trackerDirectory, () => ({ questions: [], context: '' }));

  expect(board.incidents().map((incident) => [incident.kind, incident.facts['reason']])).toEqual([['sandbox-unavailable', FAKE_MISSING_TOOLS_REASON]]);
  expect(board.jobs()).toEqual([]);
});

testWhenGitIsPresent('a snapshot the removal leaves is reported as a leftover in the log, and a repository there is never deleted by hand', () => {
  const { board } = boardFixture();
  const { job } = board.launchJob({
    kind: 'onboarder', role: 'onboarder', ticketIds: [], parentJobId: null, attempt: 1, target: null
  }, AT);
  OnboardingProposal.storeOutcome(trackerDirectory, job.id, { verdict: 'advised' });
  const leftoverSnapshot = join(trackerDirectory, 'onboard', job.id);
  mkdirSync(leftoverSnapshot, { recursive: true });
  Bun.spawnSync(['git', 'init', '-q'], { cwd: leftoverSnapshot });
  const change = { board, at: AT, workspace: { rootDirectory: snapshot, trackerDirectory } } as unknown as TrackerChange;

  Onboarding.applySettledOnboarders(change, trackerDirectory, () => ({ questions: [], context: '' }));

  const notes = board.logRecordsSoFar().flatMap((record) => (record.kind === 'note' ? [record.fields.text] : []));
  expect(notes).toEqual([expect.stringContaining(`The onboarder snapshot ${leftoverSnapshot} is a leftover`)]);
  expect(existsSync(join(leftoverSnapshot, '.git'))).toBe(true);
});
