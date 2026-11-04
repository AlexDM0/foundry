/**
 * Records the git scenarios the Customs specs replay: each case builds its scenario's state with real git and runs the checks the replaying
 * spec runs, so every call they make is recorded with its real answer. `bun run record src/lib/git/GitProcess.ts` runs this spec and writes
 * the answers to `src/testing/recordings/<os>/`.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { onboarderReportOf }                 from '../../adapters/reports/testing/OnboarderReportFixture.ts';
import type { LogRecord }                    from '../../lib/tracker-model/@types/LogRecord.ts';
import type { PipelineGate }                 from '../../lib/tracker-model/@types/Pipeline.ts';
import { TicketBodyHashUtil }                from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { PRODUCT_NAMES }                     from '../../shared/constants/ProductNames.ts';
import { captureGitScenario, GIT_SCENARIOS } from '../../testing/RecordedGitScenarios.ts';
import {
  commitFile,
  createScratchGitRepository,
  gitOutputIn,
  removeScratchDirectory,
  SCRATCH_COMMIT_IDENTITY_ARGUMENTS
} from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsPresent } from '../../testing/ToolGuard.ts';
import {
  CUSTOMS_CHECKS,
  clearCustoms,
  type CustomsSubject,
  launchSnapshotOf,
  type LaunchSnapshot
} from './Customs.ts';

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const directory of scratchDirectories) removeScratchDirectory(directory);
});

function scratchRepository(): string {
  const repositoryDirectory = realpathSync(createScratchGitRepository('customs-scenarios'));
  scratchDirectories.push(repositoryDirectory);
  gitOutputIn(repositoryDirectory, ['branch', '-m', 'main']);
  return repositoryDirectory;
}

const ONBOARDER_JOB_ID = 'J7';

interface OnboarderRepository {
  repositoryDirectory: string;
  snapshotDirectory:   string;
  startCommit:         string;
  launchSnapshot:      LaunchSnapshot;
}

function onboarderSubjectIn(onboarder: OnboarderRepository, report: unknown, logRecords: readonly LogRecord[] = []): CustomsSubject {
  return {
    role:             'onboarder',
    worktreePath:     onboarder.snapshotDirectory,
    startCommit:      onboarder.startCommit,
    report,
    ticketBody:       '',
    bodyHashAtLaunch: '',
    jobId:            ONBOARDER_JOB_ID,
    logRecords,
    launchSnapshot:   onboarder.launchSnapshot,
    refMovesAllowed:  {
      ownBranch: '', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], refreshWorktreeHeads: []
    },
  };
}

/** A main line with package.json and its detached snapshot, the launch snapshot taken while untouched and recorded as that scenario. */
function onboarderRepository(): OnboarderRepository {
  const repositoryDirectory = scratchRepository();
  const startCommit = commitFile(repositoryDirectory, 'package.json', '{ "name": "example" }\n');
  const snapshotDirectory = join(repositoryDirectory, '.onboard-snapshot');
  gitOutputIn(repositoryDirectory, ['worktree', 'add', '--detach', snapshotDirectory, startCommit]);
  const values = { repositoryDirectory, commits: { '<start>': startCommit } };
  const launchSnapshot = captureGitScenario(GIT_SCENARIOS.ONBOARDER_SNAPSHOT_UNTOUCHED, values, () => launchSnapshotOf(snapshotDirectory));
  expect(launchSnapshot).not.toBeNull();
  return {
    repositoryDirectory, snapshotDirectory, startCommit, launchSnapshot: launchSnapshot ?? { refs: {}, hooksFolderDigest: null }
  };
}

const VERIFICATION_TICKET_BODY = '## Report\nExample report.\n\n## Acceptance\nA1. The example page loads.\n';
const BUN_GATES: readonly PipelineGate[] = [
  { name: 'tests', run: 'bun test', definedBy: ['bun.lock', 'tsconfig*.json'] },
  { name: 'lint', run: 'bun run lint', definedBy: ['package.json', 'eslint.config.*', 'bunfig.toml', '.githooks/'] },
];
const PYTHON_GATES: readonly PipelineGate[] = [{ name: 'tests', run: 'nox', definedBy: ['pyproject.toml', 'noxfile.py'] }];
const ATTRIBUTION_TRAILER = '\n\nCo-Authored-By: Claude <noreply@example.com>';

interface BuiltRepository {
  repositoryDirectory: string;
  startCommit:         string;
  launchSnapshot:      LaunchSnapshot;
}

/** As the verification spec's `beforeEach` leaves one: base.ts at the start, feature.ts on top, the launch snapshot taken there. */
function builtRepository(): BuiltRepository {
  const repositoryDirectory = scratchRepository();
  const startCommit = commitFile(repositoryDirectory, 'base.ts', 'export const base = true;\n');
  const head = commitFile(repositoryDirectory, 'feature.ts', 'export const feature = true;\n');
  const values = { repositoryDirectory, commits: { '<start>': startCommit, '<head>': head } };
  const launchSnapshot = captureGitScenario(GIT_SCENARIOS.BUILT, values, () => launchSnapshotOf(repositoryDirectory)) ?? { refs: {}, hooksFolderDigest: null };
  return { repositoryDirectory, startCommit, launchSnapshot };
}

function builderReportAt(head: string): Record<string, unknown> {
  return {
    role:              'builder',
    outcome:           'built',
    headCommit:        head,
    acceptance:        [{ item: 'A1', state: 'met', evidence: 'ExamplePage.spec.ts' }],
    alsoFixed:         [],
    gates:             [],
    handoff:           'Example handoff.',
    blockedReason:     null,
    cannotBuildReason: null,
  };
}

function builderSubjectIn(built: BuiltRepository, head: string): CustomsSubject {
  return {
    role:             'builder',
    worktreePath:     built.repositoryDirectory,
    startCommit:      built.startCommit,
    report:           builderReportAt(head),
    ticketBody:       VERIFICATION_TICKET_BODY,
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(VERIFICATION_TICKET_BODY),
    launchSnapshot:   built.launchSnapshot,
    refMovesAllowed:  {
      ownBranch: 'main', otherJobBranches: [], loggedJobBranches: [], recordedLandings: [], removedAfterLandings: [], refreshWorktreeHeads: []
    },
  };
}

function commitAll(repositoryDirectory: string, message: string): string {
  gitOutputIn(repositoryDirectory, [...SCRATCH_COMMIT_IDENTITY_ARGUMENTS, 'commit', '-q', '-m', message]);
  return gitOutputIn(repositoryDirectory, ['rev-parse', 'HEAD']);
}

function commitWithMessage(repositoryDirectory: string, fileName: string, message: string): string {
  writeFileSync(join(repositoryDirectory, fileName), `${message}\n`);
  gitOutputIn(repositoryDirectory, ['add', '--', fileName]);
  return commitAll(repositoryDirectory, message);
}

function plantTargetHistory(repositoryDirectory: string): void {
  commitFile(repositoryDirectory, 'package.json', '{ "name": "example-target" }\n');
  mkdirSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER));
  commitFile(repositoryDirectory, `${PRODUCT_NAMES.DATA_FOLDER}/progress.json`, '{}\n');
  mkdirSync(join(repositoryDirectory, '.claude'));
  commitFile(repositoryDirectory, '.claude/settings.json', '{}\n');
  commitWithMessage(repositoryDirectory, 'attributed.ts', `Add the attributed file${ATTRIBUTION_TRAILER}`);
}

/** The target branched from the start and merged into the branch with `--no-commit`, `resolveMerge` run before the merge's commit. */
function mergedTargetIn(
  built: BuiltRepository,
  plantOnTarget: () => void,
  resolveMerge: () => void = () => undefined,
  mergeMessage = 'Merge the example target'
): Record<string, string> {
  const directory = built.repositoryDirectory;
  const branchTip = gitOutputIn(directory, ['rev-parse', 'HEAD']);
  gitOutputIn(directory, ['checkout', '-q', '-b', 'example-target', built.startCommit]);
  plantOnTarget();
  const targetTip = gitOutputIn(directory, ['rev-parse', 'HEAD']);
  gitOutputIn(directory, ['checkout', '-q', '-']);
  gitOutputIn(directory, ['merge', '-q', '--no-ff', '--no-commit', 'example-target']);
  resolveMerge();
  commitAll(directory, mergeMessage);
  return { '<branch tip>': branchTip, '<target tip>': targetTip };
}

type SubjectVariant = (commitOf: (placeholder: string) => string, built: BuiltRepository) => Partial<CustomsSubject>;

function airlockVariant(targetPlaceholder = '<target tip>', overrides: Partial<CustomsSubject> = {}): SubjectVariant {
  return (commitOf, built) => ({
    role:        'airlock-agent',
    startCommit: commitOf('<branch tip>'),
    report:      {
      role: 'reviewer', outcome: 'resolved', headCommit: commitOf('<head>'), resolvedFiles: [], notes: '', reportKind: null,
    },
    merge:          { branchTip: commitOf('<branch tip>'), targetTip: commitOf(targetPlaceholder), conflictedFiles: [] },
    launchSnapshot: launchSnapshotOf(built.repositoryDirectory) ?? built.launchSnapshot,
    ...overrides,
  });
}

function reviewerVariant(fixedCommitPlaceholder: string): SubjectVariant {
  return (commitOf) => ({
    role:   'reviewer',
    report: {
      role:       'reviewer',
      headCommit: commitOf('<head>'),
      claims:     [{
        item: 'A1', result: 'holds', handoffContradicted: false, note: ''
      }],
      findings: [{
        class: 'correctness', severity: 'quality', file: 'example.ts', summary: 'Example', evidence: 'watched-fail', outcome: 'fixed', commit: commitOf(fixedCommitPlaceholder),
      }],
      reviewText: 'Example review.',
    },
  });
}

const PLAIN: SubjectVariant = () => ({});
const WITH_BUN_GATES: SubjectVariant = () => ({ gates: BUN_GATES });

interface VerificationScenario {
  scenario: string;
  /** Changes the built repository into the scenario's state, and names the commits beside the start and HEAD. */
  plant:    (built: BuiltRepository) => Record<string, string>;
  variants: readonly SubjectVariant[];
}

const VERIFICATION_SCENARIOS: readonly VerificationScenario[] = [
  {
    scenario: GIT_SCENARIOS.BUILT,
    plant:    () => ({}),
    variants: [
      PLAIN,
      (commitOf) => ({ startCommit: commitOf('<head>') }),
      (commitOf, built) => ({ startCommit: commitOf('<head>'), workStartCommit: built.startCommit }),
      (commitOf) => ({ startCommit: commitOf('<head>'), workStartCommit: commitOf('<head>') }),
      reviewerVariant('<start>'),
      reviewerVariant('<head>'),
      () => ({ gates: [{ name: 'tests', run: 'true' }, { name: 'lint', run: 'true' }] }),
    ],
  },
  {
    scenario: GIT_SCENARIOS.BUILT_THEN_RESET,
    plant:    (built) => {
      const rewrittenFrom = gitOutputIn(built.repositoryDirectory, ['rev-parse', 'HEAD']);
      gitOutputIn(built.repositoryDirectory, ['reset', '-q', '--hard', 'HEAD~1']);
      return { '<rewritten>': rewrittenFrom };
    },
    variants: [(commitOf) => ({ startCommit: commitOf('<rewritten>') })],
  },
  {
    scenario: GIT_SCENARIOS.BUILT_WITH_AN_UNTRACKED_FILE,
    plant:    (built) => {
      writeFileSync(join(built.repositoryDirectory, 'left-behind.txt'), 'scratch\n');
      return {};
    },
    variants: [PLAIN, () => ({ ticketBody: 'changed' })],
  },
  {
    scenario: GIT_SCENARIOS.DATA_FOLDER_COMMITTED,
    plant:    (built) => {
      mkdirSync(join(built.repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER));
      commitFile(built.repositoryDirectory, `${PRODUCT_NAMES.DATA_FOLDER}/progress.json`, '{}\n');
      return {};
    },
    variants: [PLAIN],
  },
  {
    scenario: GIT_SCENARIOS.DATA_FOLDER_COMMITTED_IN_CAPITALS,
    plant:    (built) => {
      mkdirSync(join(built.repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER.toUpperCase()));
      commitFile(built.repositoryDirectory, `${PRODUCT_NAMES.DATA_FOLDER.toUpperCase()}/progress.json`, '{}\n');
      return {};
    },
    variants: [PLAIN],
  },
  {
    scenario: GIT_SCENARIOS.LOWER_CASE_AGENTS_FILE_COMMITTED,
    plant:    (built) => {
      commitFile(built.repositoryDirectory, 'agents.md', '# Example instructions\n');
      return {};
    },
    variants: [() => ({ instructionFiles: ['AGENTS.md'] })],
  },
  {
    scenario: GIT_SCENARIOS.HONEST_CASE_COMMITTED,
    plant:    (built) => {
      const honestStart = commitFile(built.repositoryDirectory, 'agents.md', '# Example instructions\n');
      mkdirSync(join(built.repositoryDirectory, 'Docs'));
      commitFile(built.repositoryDirectory, 'Docs/Agents-Example.md', '# Example\n');
      return { '<honest start>': honestStart };
    },
    variants: [(commitOf) => ({ startCommit: commitOf('<honest start>'), instructionFiles: ['AGENTS.md'] })],
  },
  {
    scenario: GIT_SCENARIOS.DATA_AND_PACKAGE_UNDONE,
    plant:    (built) => {
      const directory = built.repositoryDirectory;
      mkdirSync(join(directory, PRODUCT_NAMES.DATA_FOLDER));
      commitFile(directory, `${PRODUCT_NAMES.DATA_FOLDER}/progress.json`, '{}\n');
      commitFile(directory, 'package.json', '{ "scripts": { "verify": "true" } }\n');
      gitOutputIn(directory, ['rm', '-q', '--', `${PRODUCT_NAMES.DATA_FOLDER}/progress.json`, 'package.json']);
      commitAll(directory, 'Undo the planted changes');
      return {};
    },
    variants: [PLAIN, WITH_BUN_GATES],
  },
  {
    scenario: GIT_SCENARIOS.ATTRIBUTION_TRAILER_COMMITTED,
    plant:    (built) => {
      commitWithMessage(built.repositoryDirectory, 'trailer.ts', `Add the trailer file${ATTRIBUTION_TRAILER}`);
      return {};
    },
    variants: [PLAIN],
  },
  {
    scenario: GIT_SCENARIOS.TARGET_MERGED,
    plant:    (built) => mergedTargetIn(built, () => commitFile(built.repositoryDirectory, 'target.ts', 'export const target = true;\n')),
    variants: [airlockVariant(), airlockVariant('<start>')],
  },
  {
    scenario: GIT_SCENARIOS.TARGET_HISTORY_MERGED,
    plant:    (built) => mergedTargetIn(built, () => plantTargetHistory(built.repositoryDirectory)),
    variants: [airlockVariant('<target tip>', { gates: BUN_GATES })],
  },
  {
    scenario: GIT_SCENARIOS.RESOLUTION_CHANGES_CHECKED_FILES,
    plant:    (built) => {
      const directory = built.repositoryDirectory;
      return mergedTargetIn(built, () => commitFile(directory, 'target.ts', 'export const target = true;\n'), () => {
        writeFileSync(join(directory, 'package.json'), '{ "scripts": { "verify": "true" } }\n');
        gitOutputIn(directory, ['add', '--', 'package.json']);
        mkdirSync(join(directory, PRODUCT_NAMES.DATA_FOLDER));
        writeFileSync(join(directory, `${PRODUCT_NAMES.DATA_FOLDER}/progress.json`), '{}\n');
        gitOutputIn(directory, ['add', '--', PRODUCT_NAMES.DATA_FOLDER]);
      }, `Merge the example target${ATTRIBUTION_TRAILER}`);
    },
    variants: [airlockVariant('<target tip>', { gates: BUN_GATES })],
  },
  {
    scenario: GIT_SCENARIOS.CONFLICT_RESOLVED_ELSEWHERE,
    plant:    (built) => {
      const directory = built.repositoryDirectory;
      const branchTip = commitFile(directory, 'target.ts', 'export const target = \'branch\';\n');
      gitOutputIn(directory, ['checkout', '-q', '-b', 'example-target', built.startCommit]);
      commitFile(directory, 'package.json', '{ "name": "example-target" }\n');
      const targetTip = commitFile(directory, 'target.ts', 'export const target = \'target\';\n');
      gitOutputIn(directory, ['checkout', '-q', '-']);
      expect(Bun.spawnSync(['git', 'merge', '-q', '--no-ff', '--no-commit', 'example-target'], { cwd: directory }).exitCode).not.toBe(0);
      commitFile(directory, 'target.ts', 'export const target = \'resolved\';\n');
      return { '<branch tip>': branchTip, '<target tip>': targetTip };
    },
    variants: [airlockVariant('<target tip>', { gates: BUN_GATES })],
  },
  {
    scenario: GIT_SCENARIOS.COMMIT_AFTER_TARGET_HISTORY,
    plant:    (built) => {
      const directory = built.repositoryDirectory;
      const merge = mergedTargetIn(built, () => plantTargetHistory(directory));
      writeFileSync(join(directory, 'package.json'), '{ "scripts": { "verify": "true" } }\n');
      gitOutputIn(directory, ['add', '--', 'package.json']);
      commitAll(directory, 'Change the verify script');
      return merge;
    },
    variants: [airlockVariant('<target tip>', { gates: BUN_GATES })],
  },
  {
    scenario: GIT_SCENARIOS.PACKAGE_JSON_COMMITTED,
    plant:    (built) => {
      commitFile(built.repositoryDirectory, 'package.json', '{ "scripts": { "verify": "true" } }\n');
      return {};
    },
    variants: [WITH_BUN_GATES, () => ({ gates: PYTHON_GATES })],
  },
  {
    scenario: GIT_SCENARIOS.PACKAGE_JSON_THEN_PYPROJECT,
    plant:    (built) => {
      const feature = gitOutputIn(built.repositoryDirectory, ['rev-parse', 'HEAD']);
      commitFile(built.repositoryDirectory, 'package.json', '{}\n');
      commitFile(built.repositoryDirectory, 'pyproject.toml', '[project]\nname = "example"\n');
      return { '<feature>': feature };
    },
    variants: [PLAIN, () => ({ gates: [{ name: 'tests', run: 'true' }] }), (commitOf) => ({ startCommit: commitOf('<feature>'), gates: PYTHON_GATES })],
  },
  {
    scenario: GIT_SCENARIOS.ESLINT_CONFIG_COMMITTED,
    plant:    (built) => {
      commitFile(built.repositoryDirectory, 'eslint.config.js', 'export default [];\n');
      return {};
    },
    variants: [WITH_BUN_GATES],
  },
  {
    scenario: GIT_SCENARIOS.INSTRUCTION_FILE_COMMITTED,
    plant:    (built) => {
      commitFile(built.repositoryDirectory, 'example-constitution.md', '# Example rules\n');
      return {};
    },
    variants: [() => ({ instructionFiles: ['example-constitution.md', 'example-builder.md'] }), () => ({ instructionFiles: ['example-builder.md'] })],
  },
];

describeWhenGitIsPresent('the git scenarios the Customs specs replay', () => {
  test('an untouched onboarder snapshot passes the onboarder\'s column, a plain proposal and an advice alike', () => {
    const onboarder = onboarderRepository();
    const values = { repositoryDirectory: onboarder.repositoryDirectory, commits: { '<start>': onboarder.startCommit } };
    const advice = onboarderReportOf(onboarder.startCommit, { mode: 'advise', optimisations: [{ summary: 'Cache the test gate.', filedTicketId: '31', hatchRequestId: null }] });
    const filing: LogRecord = {
      at:       '2026-10-28T10:00:00+01:00',
      kind:     'ticket-filed',
      ticketId: '31',
      fields:   {
        title: 'Cache the test gate', status: 'draft', priority: 'low', filedByJob: ONBOARDER_JOB_ID
      },
    };
    captureGitScenario(GIT_SCENARIOS.ONBOARDER_SNAPSHOT_UNTOUCHED, values, () => {
      expect(clearCustoms(onboarderSubjectIn(onboarder, onboarderReportOf(onboarder.startCommit)))).toEqual({ verdict: 'verified' });
      expect(clearCustoms(onboarderSubjectIn(onboarder, advice, [filing]))).toEqual({ verdict: 'verified' });
    });
  });

  test.each([
    [GIT_SCENARIOS.ONBOARDER_SNAPSHOT_FILE_CHANGED, 'V4', (onboarder: OnboarderRepository) => {
      writeFileSync(join(onboarder.snapshotDirectory, 'package.json'), '{ "name": "changed" }\n');
    }],
    [GIT_SCENARIOS.ONBOARDER_SNAPSHOT_FILE_ADDED, 'V4', (onboarder: OnboarderRepository) => {
      writeFileSync(join(onboarder.snapshotDirectory, 'pipeline.json'), '{}\n');
    }],
    [GIT_SCENARIOS.ONBOARDER_SNAPSHOT_BRANCH_ADDED, 'V14', (onboarder: OnboarderRepository) => {
      gitOutputIn(onboarder.repositoryDirectory, ['branch', 'onboarder-moved', onboarder.startCommit]);
    }],
  ] as const)('%s fails %s', (scenario, check, plant) => {
    const onboarder = onboarderRepository();
    plant(onboarder);
    const values = { repositoryDirectory: onboarder.repositoryDirectory, commits: { '<start>': onboarder.startCommit } };
    captureGitScenario(scenario, values, () => {
      expect(clearCustoms(onboarderSubjectIn(onboarder, onboarderReportOf(onboarder.startCommit)))).toMatchObject({ verdict: 'refused', check });
    });
  });

  test.each([...VERIFICATION_SCENARIOS])('$scenario', ({ scenario, plant, variants }: VerificationScenario) => {
    const built = builtRepository();
    const extraCommits = plant(built);
    const head = gitOutputIn(built.repositoryDirectory, ['rev-parse', 'HEAD']);
    const commits: Record<string, string> = { '<start>': built.startCommit, ...extraCommits };
    if (!Object.values(commits).includes(head)) commits['<head>'] = head;
    const commitOf = (placeholder: string): string => commits[placeholder] ?? head;
    captureGitScenario(scenario, { repositoryDirectory: built.repositoryDirectory, commits }, () => {
      for (const variant of variants) {
        const subject = { ...builderSubjectIn(built, head), ...variant(commitOf, built) };
        for (const check of Object.values(CUSTOMS_CHECKS)) check(subject);
        clearCustoms(subject);
      }
    });
    expect(variants.length).toBeGreaterThan(0);
  });

  test('a commit on the onboarder snapshot fails V16', () => {
    const onboarder = onboarderRepository();
    const movedCommit = commitFile(onboarder.snapshotDirectory, 'turbo.json', '{}\n');
    const values = { repositoryDirectory: onboarder.repositoryDirectory, commits: { '<start>': onboarder.startCommit, '<moved>': movedCommit } };
    captureGitScenario(GIT_SCENARIOS.ONBOARDER_SNAPSHOT_COMMITTED, values, () => {
      expect(clearCustoms(onboarderSubjectIn(onboarder, onboarderReportOf(movedCommit)))).toMatchObject({ verdict: 'refused', check: 'V16' });
    });
  });
});
