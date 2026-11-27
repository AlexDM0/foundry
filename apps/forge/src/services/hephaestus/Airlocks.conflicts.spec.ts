/**
 * The main line's Airlock on a merge-in conflict (design section 6). What matters: the conflict goes back to the ticket's reviewer and can
 * end only in a landing or a `merge-refused` decision, each abort resetting the ticket worktree to its branch tip; and a slot left
 * mid-merge is kept while anything holds it, recovered only when nothing does. A tracker in a project folder also holds a resolution to
 * its folder and reach, its data folders and its agent configuration, a red gate's fix and a conflict re-reviewer's fix included, while
 * one at the root asks git nothing more than V10 needs. The
 * folders are real; git answers from the recorded answer sets of `src/services/hephaestus/testing/AirlockAnswerSets.ts`, one for each state
 * of the repository, or from a stage where a sweep asks the same call in two states; the folder case's own checks answer from a recorded
 * merge scenario.
 */
import { afterEach, expect, test } from 'bun:test';


import type { PipelineAirlock }           from '../../domain/tracker-model/@types/Pipeline.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET } from '../../shared/constants/HephaestusLimits.ts';
import {
  ancestryAsked,
  commitResolved,
  hardResetTo,
  revisionMissing
} from '../../testing/RecordedAirlockGit.ts';
import { useRecordedGit }            from '../../testing/RecordedGit.ts';
import { GIT_SCENARIOS }             from '../../testing/RecordedGitScenarios.ts';
import { describeWhenGitIsRecorded } from '../../testing/ToolGuard.ts';
import type { ProjectScope }         from '../lifecycle/Customs.ts';
import { AirlockAnswerSets }         from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  finishMergeAgent,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness
} from './testing/AirlocksHarness.ts';

const recordedGit = useRecordedGit();

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function kindsLogged(current: AirlocksHarness, kind: string): Record<string, unknown>[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === kind).map((record) => record as unknown as Record<string, unknown>);
}

/** Ticket #001's merge-in stopped on its conflict, its reviewer launched as the merge agent. */
async function conflictingHarness(): Promise<AirlocksHarness> {
  const current = createRecordedAirlocksHarness([{ id: '001' }]);
  recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
  await current.slots.sweep();
  return current;
}

function resetsToTheBranchTip(): number {
  return recordedGit.flowCalls().filter((gitArguments) => JSON.stringify(gitArguments) === JSON.stringify(['reset', '--hard', '--quiet', RECORDED_AIRLOCK_IDS.TICKET_TIP])).length;
}

describeWhenGitIsRecorded('a conflicting candidate', () => {
  test('gets its reviewer as a merge-agent job holding the slot, and once resolved is gated and landed', async () => {
    harness = await conflictingHarness();
    const agent = harness.mergeAgent();
    expect(agent).toMatchObject({
      kind: 'merge-agent', role: 'reviewer', parentJobId: harness.mergeJob()?.id, ticketIds: ['001']
    });
    expect(harness.mergeJob()?.airlock?.phase).toBe('resolving');

    recordedGit.answerFrom(AirlockAnswerSets.resolvedAndMerged());
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: '', reportKind: null
    });
    await harness.slots.sweep();

    expect(harness.stopped).toEqual([agent?.id ?? '']);
    expect(harness.phases).toEqual(['merge-in', 'resolving', 'gating', 'landing']);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(harness.board.decisions()).toEqual([]);
  });

  test('at its resumed call budget the agent is stopped, the merge aborted and the slot freed, and merge-refused opens', async () => {
    harness = await conflictingHarness();
    const agentId = harness.mergeAgent()?.id ?? '';
    harness.board.moveJob(agentId, 'running', HARNESS_AT);
    harness.settings.reading = { calls: RED_HANDOFF_RESUME_CALL_BUDGET, report: undefined };
    recordedGit.answerFrom(AirlockAnswerSets.stoppedOnTheConflict(false));

    await harness.slots.sweep();

    expect(harness.stopped).toEqual([agentId]);
    expect(harness.mergeJob()).toBeUndefined();
    expect(resetsToTheBranchTip()).toBe(1);
    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['merge-refused']);
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
  });

  test('cannot-resolve aborts with merge-refused showing the notes, and a reportKind opens its incident with no job waiting', async () => {
    const reportKinds = [['malformed-ticket', ['malformed-ticket']], ['system-blocker', ['system-question']], [null, []]] as const;
    for (const [index, [reportKind, incidentKinds]] of reportKinds.entries()) {
      harness?.remove();
      harness = await conflictingHarness();
      finishMergeAgent(harness, { outcome: 'cannot-resolve', notes: `Example ${String(reportKind)} reason`, reportKind });
      recordedGit.answerFrom(AirlockAnswerSets.stoppedOnTheConflict(false));

      await harness.slots.sweep();

      expect(harness.board.decisions().map((decision) => [decision.kind, decision.context])).toEqual([['merge-refused', `Example ${String(reportKind)} reason`]]);
      expect(harness.board.incidents().map((incident) => [incident.kind, incident.jobId])).toEqual(incidentKinds.map((kind) => [kind, null]));
      expect(harness.mergeJob()).toBeUndefined();
      expect(harness.stopped).toHaveLength(1);
      expect(resetsToTheBranchTip()).toBe(index + 1);
    }
  });

  test('a resolved report whose merge fails V10 (paths still unmerged) aborts with merge-refused', async () => {
    harness = await conflictingHarness();
    finishMergeAgent(harness, {
      outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: 'Example claim', reportKind: null
    });
    recordedGit.answerFrom(AirlockAnswerSets.stoppedOnTheConflict(true));

    await harness.slots.sweep();

    expect(harness.board.decisions().map((decision) => decision.kind)).toEqual(['merge-refused']);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(resetsToTheBranchTip()).toBe(1);
  });
});

describeWhenGitIsRecorded('a conflict of a tracker in a project folder', () => {
  const PROJECT_PREFIX = 'apps/example';
  /** The file the recorded scenario's resolution changed, at the repository's root. */
  const RESOLVED_FILE = 'target.ts';

  const RESOLVED_REPORT = {
    outcome: 'resolved', resolvedFiles: ['shared.txt'], notes: '', reportKind: null
  } as const;
  const RE_REVIEW_THRESHOLD_LINES = 800;
  /** Where git answers once a later commit, a red gate's fix or a re-reviewer's, added `.claude/` inside the project's folder. */
  const AGENT_CONFIGURATION_FILE = `${PROJECT_PREFIX}/.claude/settings.json`;

  /** The worktree of ticket #001 in `scenario`, its merge commit at `MERGED_TIP`. */
  function enterResolutionScenario(current: AirlocksHarness, scenario: string): void {
    recordedGit.enterScenario(scenario, {
      repositoryDirectory: current.worktreeOf('001'),
      commits:             {
        '<start>':      '9'.repeat(40),
        '<branch tip>': RECORDED_AIRLOCK_IDS.TICKET_TIP,
        '<target tip>': RECORDED_AIRLOCK_IDS.MAIN_TIP,
        '<head>':       RECORDED_AIRLOCK_IDS.MERGED_TIP,
      },
    });
  }

  /** Ticket #001's merge-in stopped on its conflict, beside its siblings; its resolution committed as the recorded scenario left it. */
  async function resolvedInAFolder(reach: readonly string[], airlock: PipelineAirlock | null = null): Promise<AirlocksHarness> {
    const projectScope: ProjectScope = { projectPrefix: PROJECT_PREFIX, reach };
    const current = createRecordedAirlocksHarness([{ id: '001' }], {}, true, airlock, true, projectScope);
    recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
    await current.slots.sweep();
    enterResolutionScenario(current, GIT_SCENARIOS.CONFLICT_RESOLVED_ELSEWHERE);
    finishMergeAgent(current, RESOLVED_REPORT);
    return current;
  }

  function mergeRefusalsOf(current: AirlocksHarness): string[][] {
    return current.board.decisions().map((decision) => [decision.kind, decision.context]);
  }

  test('a sound resolution that changed a file outside the folder and its reach is refused by V17, the worktree reset to the branch tip', async () => {
    harness = await resolvedInAFolder([]);
    const agentId = harness.mergeAgent()?.id ?? '';
    const mergeJobId = harness.mergeJob()?.id;
    recordedGit.answerFrom(AirlockAnswerSets.soundResolutionRefused());

    await harness.slots.sweep();

    expect(kindsLogged(harness, 'job-ended').find((record) => record['jobId'] === mergeJobId)?.['fields'])
      .toMatchObject({ outcome: 'failed', cause: 'changed-outside-home-and-reach' });
    expect(harness.board.decisions().map((decision) => [decision.kind, decision.context]))
      .toEqual([['merge-refused', `The resolution of job ${agentId} was refused: changed-outside-home-and-reach ${RESOLVED_FILE}`]]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(harness.board.ticketIsMergeQueued('001')).toBe(false);
    expect(resetsToTheBranchTip()).toBe(1);
  });

  test('once the reach names the file, the same resolution is gated and landed', async () => {
    harness = await resolvedInAFolder([`/${RESOLVED_FILE}`]);
    recordedGit.answerFrom(AirlockAnswerSets.resolvedAndMerged());

    await harness.slots.sweep();

    expect(harness.phases).toEqual(['merge-in', 'resolving', 'gating', 'landing']);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(harness.board.decisions()).toEqual([]);
  });

  test('a red gate\'s fix that added .claude/ inside the folder is refused by V13 when its agent reports, though the resolution passed', async () => {
    harness = await resolvedInAFolder([`/${RESOLVED_FILE}`]);
    harness.settings.gateOutcome = 'failed';
    recordedGit.answerFrom(AirlockAnswerSets.resolvedAndMerged());
    await harness.slots.sweep();
    expect(harness.mergeJob()?.airlock?.phase).toBe('fixing');
    const agentId = harness.mergeAgent()?.id ?? '';
    enterResolutionScenario(harness, GIT_SCENARIOS.CONFLICT_RESOLVED_WITH_AGENT_CONFIG);
    recordedGit.answerFrom([revisionMissing('MERGE_HEAD'), ...hardResetTo(RECORDED_AIRLOCK_IDS.TICKET_TIP)]);

    finishMergeAgent(harness, { ...RESOLVED_REPORT, resolvedFiles: [] });
    await harness.slots.sweep();

    expect(mergeRefusalsOf(harness))
      .toEqual([['merge-refused', `The resolution of job ${agentId} was refused: branch-touches-agent-config ${AGENT_CONFIGURATION_FILE}`]]);
    expect(harness.board.airlockHolderOf('main')).toBeUndefined();
    expect(resetsToTheBranchTip()).toBe(1);
  });

  test('a conflict re-review whose fix added .claude/ inside the folder is refused by V13 though its claims hold', async () => {
    harness = await resolvedInAFolder([`/${RESOLVED_FILE}`], { reReview: { thresholdLines: RE_REVIEW_THRESHOLD_LINES } });
    harness.settings.resolutionLines = RE_REVIEW_THRESHOLD_LINES + 1;
    recordedGit.answerFrom(AirlockAnswerSets.resolvedAndMerged());
    await harness.slots.sweep();
    expect(harness.mergeJob()?.airlock?.phase).toBe('re-reviewing');
    const reReviewerId = harness.mergeAgent()?.id ?? '';
    enterResolutionScenario(harness, GIT_SCENARIOS.CONFLICT_RESOLVED_WITH_AGENT_CONFIG);
    recordedGit.answerFrom([
      commitResolved('HEAD', RECORDED_AIRLOCK_IDS.MERGED_TIP),
      ancestryAsked(RECORDED_AIRLOCK_IDS.MERGED_TIP, 'HEAD', true),
      revisionMissing('MERGE_HEAD'),
      ...hardResetTo(RECORDED_AIRLOCK_IDS.TICKET_TIP),
    ]);

    finishMergeAgent(harness, {
      role:       'reviewer',
      headCommit: RECORDED_AIRLOCK_IDS.MERGED_TIP,
      claims:     [{
        item: 'A1', result: 'holds', handoffContradicted: false, note: ''
      }],
      findings:   [],
      reviewText: 'Example re-review of the resolution.',
    });
    await harness.slots.sweep();

    expect(mergeRefusalsOf(harness))
      .toEqual([['merge-refused', `The conflict re-review of job ${reReviewerId} was refused: branch-touches-agent-config ${AGENT_CONFIGURATION_FILE}`]]);
    expect(harness.gatedTrees).toEqual([]);
    expect(resetsToTheBranchTip()).toBe(1);
  });
});

describeWhenGitIsRecorded('slot recovery', () => {
  function slotLeftMidMerge(): AirlocksHarness {
    const current = createRecordedAirlocksHarness([{ id: '001' }]);
    current.board.claimAirlock({
      ticketId: '001', target: 'main', targetTip: current.tipOf('main'), branchTip: current.tipOf('ticket-001'), predictedConflictFiles: ['shared.txt'],
    }, () => 'main', current.branchTreeOf, HARNESS_AT);
    return current;
  }

  test('a merge-in with MERGE_HEAD and a live holder is kept', async () => {
    harness = slotLeftMidMerge();
    harness.settings.childIsLive = true;
    const jobId = harness.mergeJob()?.id;
    recordedGit.answerFrom(AirlockAnswerSets.stoppedOnTheConflict(false));
    await harness.slots.sweep();
    expect(harness.mergeJob()?.id).toBe(jobId);
    expect(recordedGit.flowCalls()).not.toContainEqual(['merge', '--abort']);
  });

  test('a merge-in with MERGE_HEAD and no live holder is aborted, reset to branchTip and requeued', async () => {
    harness = slotLeftMidMerge();
    const current = harness;
    const jobId = current.mergeJob()?.id;
    await recordedGit.playStage(AirlockAnswerSets.abortedAndMergedInAgain('001', true), () => current.slots.sweep());
    expect(kindsLogged(current, 'job-ended').find((record) => record['jobId'] === jobId)?.['fields']).toMatchObject({ outcome: 'stopped', cause: 'orphaned' });
    expect(current.mergeJob()?.id).not.toBe(jobId);
    expect(current.mergeAgent()).toBeDefined();
  });

  test('an interrupted Airlock agent keeps its slot; one stopped with no usable result frees it', async () => {
    harness = await conflictingHarness();
    const current = harness;
    const agentId = current.mergeAgent()?.id ?? '';
    current.board.moveJob(agentId, 'running', HARNESS_AT);
    current.board.interruptJob(agentId, 'reboot', HARNESS_AT);
    const jobId = current.mergeJob()?.id;
    recordedGit.answerFrom([]);
    await current.slots.sweep();
    expect(current.mergeJob()?.id).toBe(jobId);

    current.board.endJob(agentId, { outcome: 'stopped' }, HARNESS_AT);
    await recordedGit.playStage(AirlockAnswerSets.abortedAndMergedInAgain('001', false), () => current.slots.sweep());
    expect(kindsLogged(current, 'job-ended').find((record) => record['jobId'] === jobId)?.['fields']).toMatchObject({ cause: 'orphaned' });
  });
});
