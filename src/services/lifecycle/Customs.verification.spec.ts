/**
 * Verification by code, V1 to V15, on recorded git scenarios, the decisions that read no git being in
 * `src/services/lifecycle/Customs.spec.ts`: each check refuses its planted case and passes a clean one, and `clearCustoms`
 * runs only the checks of the role's column, stopping at the first refusal. The planted cases are what a session could leave behind and
 * claim otherwise; V5 plants the data folder under the name `PRODUCT_NAMES` gives it. V11 reads its patterns from every gate's
 * `definedBy` and the tracked instruction files the pipeline names, and V15 holds a builder's gate claims to HEAD itself, so a stale
 * claim is refused before any gate runs. Each case's git state is a scenario `src/lib/git/RecordedGitScenarios.integration.spec.ts`
 * builds with real git and records; a call it did not record fails the case.
 */
import {
  afterEach,
  beforeEach,
  expect,
  test
}                                                         from 'bun:test';

import type { PipelineGate }                              from '../../lib/tracker-model/@types/Pipeline.ts';
import { TicketBodyHashUtil }                             from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { useRecordedGit }                                 from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }                                  from '../../testing/RecordedGitScenarios.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../testing/ToolGuard.ts';
import {
  CHECKS_OF_ROLE,
  launchSnapshotOf,
  type LaunchSnapshot,
  CUSTOMS_CHECKS,
  clearCustoms,
  type CustomsSubject,
  type VerificationCheck
} from './Customs.ts';

const TICKET_BODY = '## Report\nExample report.\n\n## Acceptance\nA1. The example page loads.\n';

/** The definition files spread over two gates, so V11 is shown reading every gate's `definedBy`, not only the first's. */
const BUN_GATES: readonly PipelineGate[] = [
  { name: 'tests', run: 'bun test', definedBy: ['bun.lock', 'tsconfig*.json'] },
  { name: 'lint', run: 'bun run lint', definedBy: ['package.json', 'eslint.config.*', 'bunfig.toml', '.githooks/'] },
];

const PYTHON_GATES: readonly PipelineGate[] = [{ name: 'tests', run: 'nox', definedBy: ['pyproject.toml', 'noxfile.py'] }];

/** Each commit a scenario names, as the replay fills it in. */
const START_COMMIT = '1'.repeat(40);
const HEAD_COMMIT = '2'.repeat(40);
const BRANCH_TIP = '3'.repeat(40);
const TARGET_TIP = '4'.repeat(40);
const REWRITTEN_COMMIT = '5'.repeat(40);
const HONEST_START = '6'.repeat(40);
const FEATURE_COMMIT = '7'.repeat(40);
const OWN_BRANCH = 'main';

const { enterScenario } = useRecordedGit();

let repositoryDirectory = '';

let launchSnapshot: LaunchSnapshot = { refs: {}, hooksFolderDigest: null };

function enter(scenario: string): void {
  enterScenario(scenario, {
    repositoryDirectory,
    commits: {
      '<start>':        START_COMMIT,
      '<head>':         HEAD_COMMIT,
      '<branch tip>':   BRANCH_TIP,
      '<target tip>':   TARGET_TIP,
      '<rewritten>':    REWRITTEN_COMMIT,
      '<honest start>': HONEST_START,
      '<feature>':      FEATURE_COMMIT,
    },
  });
}

function builderReport(): Record<string, unknown> {
  return {
    role:              'builder',
    outcome:           'built',
    headCommit:        HEAD_COMMIT,
    acceptance:        [{ item: 'A1', state: 'met', evidence: 'ExamplePage.spec.ts' }],
    alsoFixed:         [],
    gates:             [],
    handoff:           'Example handoff.',
    blockedReason:     null,
    cannotBuildReason: null,
  };
}

function reviewerReport(fixedCommit: string): Record<string, unknown> {
  return {
    role:       'reviewer',
    headCommit: HEAD_COMMIT,
    claims:     [{
      item: 'A1', result: 'holds', handoffContradicted: false, note: ''
    }],
    findings: [{
      class: 'correctness', severity: 'quality', file: 'example.ts', summary: 'Example', evidence: 'watched-fail', outcome: 'fixed', commit: fixedCommit,
    }],
    reviewText: 'Example review.',
  };
}

function builderSubject(overrides: Partial<CustomsSubject> = {}): CustomsSubject {
  return {
    role:             'builder',
    worktreePath:     repositoryDirectory,
    startCommit:      START_COMMIT,
    report:           builderReport(),
    ticketBody:       TICKET_BODY,
    bodyHashAtLaunch: TicketBodyHashUtil.bodyHashOf(TICKET_BODY),
    launchSnapshot,
    refMovesAllowed:  {
      ownBranch:            OWN_BRANCH,
      otherJobBranches:     [],
      loggedJobBranches:    [],
      recordedLandings:     [],
      removedAfterLandings: [],
      airlockWorktreeHeads: [],
    },
    ...overrides,
  };
}

function refusalOf(check: VerificationCheck, subject: CustomsSubject): string | null {
  const verdict = CUSTOMS_CHECKS[check](subject);
  return verdict.verdict === 'refused' ? verdict.reason : null;
}

/** A target branch with commits of its own merged into the branch, as an Airlock agent leaves it: the merge's parents are [branch, target]. */
const MERGE = { branchTip: BRANCH_TIP, targetTip: TARGET_TIP };

function airlockAgentSubject(merge: { branchTip: string; targetTip: string }, overrides: Partial<CustomsSubject> = {}): CustomsSubject {
  return builderSubject({
    role:        'airlock-agent',
    startCommit: merge.branchTip,
    report:      {
      role: 'reviewer', outcome: 'resolved', headCommit: HEAD_COMMIT, resolvedFiles: [], notes: '', reportKind: null,
    },
    merge:          { ...merge, conflictedFiles: [] },
    // The target branch is the Overseer's merge-in, made before the Airlock agent's launch.
    launchSnapshot: launchSnapshotOf(repositoryDirectory) ?? launchSnapshot,
    ...overrides,
  });
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('customs');
  enter(GIT_SCENARIOS.BUILT);
  launchSnapshot = launchSnapshotOf(repositoryDirectory) ?? { refs: {}, hooksFolderDigest: null };
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('verification by code', () => {
  test('a clean builder pass passes every check of its column', () => {
    for (const check of CHECKS_OF_ROLE.builder) expect([check, refusalOf(check, builderSubject())]).toEqual([check, null]);
    expect(clearCustoms(builderSubject())).toEqual({ verdict: 'verified' });
  });

  test('V1 refuses a report its schema rejects, and one whose headCommit is not HEAD', () => {
    expect(refusalOf('V1', builderSubject({ report: { role: 'builder' } }))).toBe('report-invalid');
    expect(refusalOf('V1', builderSubject({ report: { ...builderReport(), headCommit: START_COMMIT } }))).toBe('head-not-reported');
  });

  test('V2 refuses a HEAD that no longer descends from the start: history was rewritten', () => {
    enter(GIT_SCENARIOS.BUILT_THEN_RESET);

    expect(refusalOf('V2', builderSubject({ startCommit: REWRITTEN_COMMIT, report: builderReport() }))).toBe('history-rewritten');
  });

  test('V3 refuses a built pass with no commit since the start, and asks nothing of a reviewer', () => {
    expect(refusalOf('V3', builderSubject({ startCommit: HEAD_COMMIT }))).toBe('no-commit-since-start');
    expect(CHECKS_OF_ROLE.reviewer).not.toContain('V3');
  });

  test('V3 passes a retry whose branch already holds the failed attempt\'s commit, measured from that attempt\'s start', () => {
    const failedAttemptStart = builderSubject().startCommit;
    expect(refusalOf('V3', builderSubject({ startCommit: HEAD_COMMIT, workStartCommit: failedAttemptStart }))).toBeNull();
    expect(refusalOf('V3', builderSubject({ startCommit: HEAD_COMMIT, workStartCommit: HEAD_COMMIT }))).toBe('no-commit-since-start');
  });

  test('V4 refuses a worktree holding an untracked file', () => {
    enter(GIT_SCENARIOS.BUILT_WITH_AN_UNTRACKED_FILE);

    expect(refusalOf('V4', builderSubject())).toBe('worktree-dirty');
  });

  test('V5 refuses a commit in range touching the data folder, named from PRODUCT_NAMES', () => {
    enter(GIT_SCENARIOS.DATA_FOLDER_COMMITTED);

    const verdict = CUSTOMS_CHECKS.V5(builderSubject({ report: builderReport() }));

    expect(verdict).toEqual({ verdict: 'refused', reason: 'data-folder-touched', facts: [`${PRODUCT_NAMES.DATA_FOLDER}/progress.json`] });
  });

  test('V5 refuses the data folder committed in another case, which a host folding case checks out as the data folder', () => {
    const caseChangedDataFolder = PRODUCT_NAMES.DATA_FOLDER.toUpperCase();
    enter(GIT_SCENARIOS.DATA_FOLDER_COMMITTED_IN_CAPITALS);

    expect(CUSTOMS_CHECKS.V5(builderSubject())).toEqual({ verdict: 'refused', reason: 'data-folder-touched', facts: [`${caseChangedDataFolder}/progress.json`] });
  });

  test('V5 refuses a data folder file whose name git would quote, read unquoted', () => {
    enter(GIT_SCENARIOS.DATA_FOLDER_QUOTED_NAME_COMMITTED);

    expect(CUSTOMS_CHECKS.V5(builderSubject())).toEqual({ verdict: 'refused', reason: 'data-folder-touched', facts: [`${PRODUCT_NAMES.DATA_FOLDER}/example"quoted\tname.json`] });
  });

  test('V11 refuses agents.md under a pipeline naming AGENTS.md, and V5, V11 and V13 pass an honest different case elsewhere', () => {
    enter(GIT_SCENARIOS.LOWER_CASE_AGENTS_FILE_COMMITTED);
    expect(CUSTOMS_CHECKS.V11(builderSubject({ instructionFiles: ['AGENTS.md'] }))).toEqual({ verdict: 'refused', reason: 'instruction-file-changed', facts: ['agents.md'] });

    enter(GIT_SCENARIOS.HONEST_CASE_COMMITTED);
    for (const check of ['V5', 'V11', 'V13'] as const) {
      expect([check, refusalOf(check, builderSubject({ startCommit: HONEST_START, instructionFiles: ['AGENTS.md'] }))]).toEqual([check, null]);
    }
  });

  test('V5 and V11 judge every commit in range, so a change undone by a later commit is still refused', () => {
    enter(GIT_SCENARIOS.DATA_AND_PACKAGE_UNDONE);

    expect(refusalOf('V5', builderSubject({ report: builderReport() }))).toBe('data-folder-touched');
    expect(refusalOf('V11', builderSubject({ report: builderReport(), gates: BUN_GATES }))).toBe('checks-definition-changed');
  });

  test('V7 refuses an AI attribution trailer or a "Generated with" line in range', () => {
    enter(GIT_SCENARIOS.ATTRIBUTION_TRAILER_COMMITTED);

    expect(refusalOf('V7', builderSubject({ report: builderReport() }))).toBe('ai-attribution-in-range');
  });

  test('V9 refuses a fixed finding naming a commit outside the range, and passes one inside it', () => {
    const fixCommit = HEAD_COMMIT;

    expect(refusalOf('V9', builderSubject({ role: 'reviewer', report: reviewerReport(START_COMMIT) }))).toBe('fixed-finding-outside-range');
    expect(refusalOf('V9', builderSubject({ role: 'reviewer', report: reviewerReport(fixCommit) }))).toBeNull();
    expect(clearCustoms(builderSubject({ role: 'reviewer', report: reviewerReport(fixCommit) }))).toEqual({ verdict: 'verified' });
  });

  test('V10 passes a merge whose parents are [branchTip, targetTip], and refuses one made against another target tip', () => {
    enter(GIT_SCENARIOS.TARGET_MERGED);

    expect(clearCustoms(airlockAgentSubject(MERGE))).toEqual({ verdict: 'verified' });
    expect(refusalOf('V10', airlockAgentSubject({ ...MERGE, targetTip: START_COMMIT }))).toBe('merge-unresolved');
  });

  test('an Airlock agent is judged on its own merge, never the target\'s history: the target\'s package.json, data, config and trailer pass', () => {
    enter(GIT_SCENARIOS.TARGET_HISTORY_MERGED);
    const subject = airlockAgentSubject(MERGE, { gates: BUN_GATES });

    for (const check of ['V3', 'V5', 'V7', 'V11', 'V13'] as const) expect([check, refusalOf(check, subject)]).toEqual([check, null]);
    expect(clearCustoms(subject)).toEqual({ verdict: 'verified' });
  });

  test('an Airlock agent changing package.json or the data folder in its resolution, or a trailer on its merge, is still refused', () => {
    enter(GIT_SCENARIOS.RESOLUTION_CHANGES_CHECKED_FILES);
    const subject = airlockAgentSubject(MERGE, { gates: BUN_GATES });

    expect(CUSTOMS_CHECKS.V11(subject)).toEqual({ verdict: 'refused', reason: 'checks-definition-changed', facts: ['package.json'] });
    expect(refusalOf('V5', subject)).toBe('data-folder-touched');
    expect(refusalOf('V7', subject)).toBe('ai-attribution-in-range');
  });

  test('an Airlock agent on a conflict elsewhere passes V11 beside the target\'s package.json change: the conflicted automatic merge is the base', () => {
    enter(GIT_SCENARIOS.CONFLICT_RESOLVED_ELSEWHERE);
    const subject = airlockAgentSubject(MERGE, { gates: BUN_GATES });

    expect(refusalOf('V11', subject)).toBeNull();
    expect(refusalOf('V10', subject)).toBeNull();
  });

  test('a merge job\'s commits after its merge still count, even beside the target\'s own package.json change', () => {
    enter(GIT_SCENARIOS.COMMIT_AFTER_TARGET_HISTORY);

    expect(refusalOf('V11', airlockAgentSubject(MERGE, { gates: BUN_GATES }))).toBe('checks-definition-changed');
  });

  test('V11 refuses a change to a file the checks line resolves through, unless the ticket body names it', () => {
    enter(GIT_SCENARIOS.PACKAGE_JSON_COMMITTED);

    expect(refusalOf('V11', builderSubject({ report: builderReport(), gates: BUN_GATES }))).toBe('checks-definition-changed');
    const namingTheFile = `${TICKET_BODY}\nScope: package.json\n`;

    expect(refusalOf('V11', builderSubject({ report: builderReport(), gates: BUN_GATES, ticketBody: namingTheFile }))).toBeNull();
  });

  test('V11 reads the board\'s own list: a Python list refuses a pyproject.toml change and passes a package.json one', () => {
    enter(GIT_SCENARIOS.PACKAGE_JSON_COMMITTED);

    expect(refusalOf('V11', builderSubject({ report: builderReport(), gates: PYTHON_GATES }))).toBeNull();

    enter(GIT_SCENARIOS.PACKAGE_JSON_THEN_PYPROJECT);
    const verdict = CUSTOMS_CHECKS.V11(builderSubject({ startCommit: FEATURE_COMMIT, report: builderReport(), gates: PYTHON_GATES }));

    expect(verdict).toEqual({ verdict: 'refused', reason: 'checks-definition-changed', facts: ['pyproject.toml'] });
  });

  test('V11 refuses a change matching a later gate\'s definedBy, and passes it once the ticket body names the file', () => {
    enter(GIT_SCENARIOS.ESLINT_CONFIG_COMMITTED);

    expect(CUSTOMS_CHECKS.V11(builderSubject({ gates: BUN_GATES }))).toEqual({ verdict: 'refused', reason: 'checks-definition-changed', facts: ['eslint.config.js'] });
    expect(refusalOf('V11', builderSubject({ gates: BUN_GATES, ticketBody: `${TICKET_BODY}\nScope: eslint.config.js\n` }))).toBeNull();
  });

  test('V11 refuses a change to a tracked instruction file the pipeline names, and passes it once the ticket body names the file', () => {
    enter(GIT_SCENARIOS.INSTRUCTION_FILE_COMMITTED);
    const instructionFiles = ['example-constitution.md', 'example-builder.md'];

    expect(CUSTOMS_CHECKS.V11(builderSubject({ instructionFiles }))).toEqual({ verdict: 'refused', reason: 'instruction-file-changed', facts: ['example-constitution.md'] });
    expect(refusalOf('V11', builderSubject({ instructionFiles: ['example-builder.md'] }))).toBeNull();
    expect(refusalOf('V11', builderSubject({ instructionFiles, ticketBody: `${TICKET_BODY}\nScope: example-constitution.md\n` }))).toBeNull();
  });

  test('V15 refuses a gate claimed on an older commit, naming only it, and clearCustoms stops there before any gate could run', () => {
    const gates: PipelineGate[] = [{ name: 'tests', run: 'true' }, { name: 'lint', run: 'true' }];
    const report = { ...builderReport(), gates: [{ name: 'tests', commit: HEAD_COMMIT }, { name: 'lint', commit: START_COMMIT }] };

    expect(CUSTOMS_CHECKS.V15(builderSubject({ gates, report }))).toEqual({ verdict: 'refused', reason: 'gate-unclaimed', facts: ['lint'] });
    expect(clearCustoms(builderSubject({ gates, report }))).toEqual({
      verdict: 'refused', check: 'V15', reason: 'gate-unclaimed', facts: ['lint']
    });
    expect(refusalOf('V15', builderSubject({ gates, report: { ...builderReport(), gates: [] } }))).toBe('gate-unclaimed');
    expect(refusalOf('V15', builderSubject({ gates, report: { ...report, gates: [{ name: 'tests', commit: HEAD_COMMIT }, { name: 'lint', commit: HEAD_COMMIT }] } }))).toBeNull();
  });

  test('V15 asks no claim for an overseerOnly gate, and a builder report without gates is refused by V1', () => {
    const gates: PipelineGate[] = [{ name: 'tests', run: 'true' }, { name: 'audit', run: 'true', overseerOnly: true }];
    const report = { ...builderReport(), gates: [{ name: 'tests', commit: HEAD_COMMIT }] };

    expect(refusalOf('V15', builderSubject({ gates, report }))).toBeNull();
    const { gates: _omitted, ...withoutGates } = builderReport();

    expect(refusalOf('V1', builderSubject({ report: withoutGates }))).toBe('report-invalid');
  });

  test('V11 passes any change when no gate names a definedBy, or there are no gates', () => {
    enter(GIT_SCENARIOS.PACKAGE_JSON_THEN_PYPROJECT);

    expect(refusalOf('V11', builderSubject({ report: builderReport() }))).toBeNull();
    expect(refusalOf('V11', builderSubject({ report: builderReport(), gates: [{ name: 'tests', run: 'true' }] }))).toBeNull();
  });

  test('clearCustoms stops at the first refusing check of the column and names it', () => {
    enter(GIT_SCENARIOS.BUILT_WITH_AN_UNTRACKED_FILE);

    expect(clearCustoms(builderSubject({ ticketBody: 'changed' }))).toMatchObject({ verdict: 'refused', check: 'V4', reason: 'worktree-dirty' });
  });
});
