/**
 * The Agents view's model. What matters: builders, reviewers and roleless jobs are worker work and intake, Assistant and pipeline agent
 * jobs are sessions, so nothing that never takes a slot sits under the slot meter; jobs that ask User lead their card; the slot meter reads
 * the forge's `launchSlots`, never a kind list, and a job is counted only when the forge named it; each role and each roleless kind draws
 * its own icon and anything else a dot, so no two roles read alike, but a re-reviewer and a conflict re-reviewer take the reviewer's icon
 * with their own word; calls read against the budget, warn near it and unbounded without one; subagents are squares worded in every plural
 * form; the ask carries the open decision's first question and its stamp sliced as the inbox slices it; every count leaves out its zero
 * parts and names one in the singular; a session says what it is about; a job is stopping by its state or by a stop request alone, and
 * takes a message exactly as the forge offers; the job panel's head and transcript head are worded from the job's facts alone, an
 * interrupted job's state by the wait its served cause names; and a
 * concurrency limit is sendable only as a changed whole number within the bounds the forge serves.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardLaunchSlotsDocument }                           from '../../../@types/board/BoardDocument.ts';
import { exampleAgentJob, exampleAskingDecision, exampleSubagent } from '../../testing/BoardStateFixture.ts';
import { EXAMPLE_BOARD_LIMITS }                                    from '../../testing/PageLimitsFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                                from '../../testing/TimestampSlicesFixture.ts';
import type { AgentJobDocument, SubagentDocument }                 from './AgentJobDocument.ts';
import { AgentsModel, CALL_BUDGET_WARNING_FRACTION }               from './AgentsModel.ts';

/** Every job role a forge names today, as its `JOB_ROLES` listed them when the Agents view moved; retake from forge's list if it grows. */
const JOB_ROLES = ['builder', 'reviewer', 're-reviewer', 'conflict-re-reviewer', 'product-owner', 'assistant', 'pipeline-agent'] as const;

const BUILD_JOB = exampleAgentJob({ id: 'J12' });

/** The job kinds that carry no role. */
const ROLELESS_JOB_KINDS = ['merge', 'refresh', 'constitution-commit'] as const;

const LAUNCH_SLOTS: BoardLaunchSlotsDocument = { limit: 5, slotJobIds: ['J2', 'J3'], inProgressTicketIdsWithoutJob: ['010'] };

function withSubagents(...states: SubagentDocument['state'][]): AgentJobDocument {
  return exampleAgentJob({
    id:   'J3',
    live: { ...BUILD_JOB.live, subagents: states.map((state, i) => exampleSubagent({ parentToolUseId: `toolu-${i}`, state })) },
  });
}

describe('which card a job sits in', () => {
  test('a builder, reviewer or merge-agent job is a worker, a product-owner, assistant or pipeline agent job a session, a roleless job a worker', () => {
    const groups = [
      { role: 'builder' }, { role: 'reviewer' }, { role: 'product-owner' }, { role: 'assistant' }, { role: 'pipeline-agent' }, { role: null },
    ].map(AgentsModel.groupOf);
    expect(groups).toEqual(['workers', 'workers', 'sessions', 'sessions', 'sessions', 'workers']);
  });

  test('jobs that ask User lead their group, the rest keep board order, and no group is made without a job', () => {
    const jobs = ['J2', 'J4', 'J3', 'J5'].map((id) => exampleAgentJob({ id }));
    const decisions = [exampleAskingDecision({ id: 'E7', jobId: 'J3' }), exampleAskingDecision({ id: 'E8', jobId: 'J4' })];
    const [group] = AgentsModel.projectGroupsOf(jobs, decisions, 'Example Storefront');
    expect(group?.project).toBe('Example Storefront');
    expect(group?.jobs.map((job) => job.id)).toEqual(['J4', 'J3', 'J2', 'J5']);
    expect(AgentsModel.projectGroupsOf([], decisions, 'Example Storefront')).toEqual([]);
  });

  test('a role marks its glyph, lane and word, and a roleless job takes its kind', () => {
    expect(AgentsModel.roleMarkOf({ role: 'builder', kind: 'build' })).toEqual({ icon: 'hammer', state: 'in-progress', word: 'builder' });
    expect(AgentsModel.roleMarkOf({ role: 'product-owner', kind: 'product-owner' })).toEqual({ icon: 'inbox', state: 'draft', word: 'intake' });
    expect(AgentsModel.roleMarkOf({ role: 'assistant', kind: 'assistant' })).toEqual({ icon: 'lifebuoy', state: 'reviewing', word: 'Assistant' });
    expect(AgentsModel.roleMarkOf({ role: 'pipeline-agent', kind: 'pipeline-agent' }))
      .toEqual({ icon: 'flow', state: 'committed', word: 'pipeline agent' });
    expect(AgentsModel.roleMarkOf({ role: null, kind: 'merge' })).toEqual({ icon: 'merge', state: 'committed', word: 'merge' });
  });

  test('a re-reviewer and a conflict re-reviewer draw the reviewer\'s icon, each with its own word', () => {
    const marks = (['re-reviewer', 'conflict-re-reviewer'] as const).map((role) => AgentsModel.roleMarkOf({ role, kind: 'review' }));
    expect(marks.map((mark) => [mark.icon, mark.word])).toEqual([['magnifier', 're-reviewer'], ['magnifier', 'conflict re-reviewer']]);
  });

  test('each role and each roleless kind draws its own icon, and an unknown role or kind draws a dot', () => {
    const reviewerVariants: readonly string[] = ['re-reviewer', 'conflict-re-reviewer'];
    const roleIcons = JOB_ROLES.filter((role) => !reviewerVariants.includes(role)).map((role) => AgentsModel.roleMarkOf({ role, kind: 'build' }).icon);
    const rolelessIcons = ROLELESS_JOB_KINDS.map((kind) => AgentsModel.roleMarkOf({ role: null, kind }).icon);
    expect(rolelessIcons).toEqual(['merge', 'cycle', 'document']);
    const everyIcon = [...roleIcons, ...rolelessIcons];
    expect(new Set(everyIcon).size).toBe(everyIcon.length);
    expect(everyIcon).not.toContain('dot');
    expect(AgentsModel.roleMarkOf({ role: 'example-role', kind: 'build' })).toEqual({ icon: 'dot', state: 'committed', word: 'example-role' });
    expect(AgentsModel.roleMarkOf({ role: null, kind: 'example-kind' })).toEqual({ icon: 'dot', state: 'committed', word: 'example-kind' });
    expect(AgentsModel.roleMarkOf({ role: null, kind: 'toString' }).icon).toBe('dot');
  });
});

describe('the launch slots', () => {
  test('the slot meter counts the jobs the forge says hold a slot, against its limit, and is over the limit only past it', () => {
    expect(AgentsModel.slotMeterOf(LAUNCH_SLOTS)).toEqual({
      counted: 2, limit: 5, countedJobIds: ['J2', 'J3'], overLimit: false, label: '2 worker jobs against a limit of 5',
    });
    const over = AgentsModel.slotMeterOf({ ...LAUNCH_SLOTS, limit: 1 });
    expect(over?.overLimit).toBe(true);
    expect(AgentsModel.slotMeterOf({ ...LAUNCH_SLOTS, slotJobIds: ['J2'] })?.label).toBe('1 worker job against a limit of 5');
  });

  test('a job is counted only when the forge named it', () => {
    expect(AgentsModel.isCounted('J2', LAUNCH_SLOTS)).toBe(true);
    expect(AgentsModel.isCounted('J9', LAUNCH_SLOTS)).toBe(false);
  });
});

describe('the calls against the budget', () => {
  test('calls read as a share of the budget, near it from the warning fraction, and unbounded without one', () => {
    const atWarning = Math.ceil(CALL_BUDGET_WARNING_FRACTION * 150);
    expect(AgentsModel.budgetMeterOf({ live: { calls: 41, callBudget: 150 } })).toEqual({
      used: 41, limit: 150, near: false, label: '41 of 150 calls'
    });
    expect(AgentsModel.budgetMeterOf({ live: { calls: atWarning, callBudget: 150 } }).near).toBe(true);
    expect(AgentsModel.budgetMeterOf({ live: { calls: atWarning - 1, callBudget: 150 } }).near).toBe(false);
    expect(AgentsModel.budgetMeterOf({ live: { calls: 22, callBudget: null } })).toEqual({
      used: 22, limit: null, near: false, label: '22 calls, no budget'
    });
  });
});

describe('the subagents', () => {
  test('a square is filled while its subagent runs and outlined once it ended, titled with what it does, its tool calls and its state', () => {
    const job = exampleAgentJob({
      id:   'J3',
      live: {
        ...BUILD_JOB.live,
        subagents: [
          exampleSubagent({ parentToolUseId: 'toolu-1', toolCalls: 1 }),
          exampleSubagent({
            parentToolUseId: 'toolu-2', toolCalls: 8, state: 'ended', description: null
          }),
        ],
      },
    });
    expect(AgentsModel.subagentSquaresOf(job).squares).toEqual([
      { key: 'toolu-1', running: true, titleText: 'Example search of the checkout code · 1 tool call · running' },
      { key: 'toolu-2', running: false, titleText: 'toolu-2 · 8 tool calls · done' },
    ]);
  });

  test('the figure and the label name every plural form, and a job without subagents reads none', () => {
    const wordings = [[], ['ended'], ['running'], ['ended', 'ended'], ['running', 'running'], ['ended', 'ended', 'ended'], ['running', 'running', 'ended']]
      .map((states) => AgentsModel.subagentSquaresOf(withSubagents(...states as SubagentDocument['state'][])))
      .map(({ figureText, ariaLabel }) => [figureText, ariaLabel]);
    expect(wordings).toEqual([
      ['none', 'no subagents'],
      ['1 done', '1 subagent, done'],
      ['1 running', '1 subagent, running'],
      ['2 done', '2 subagents, both done'],
      ['2 running', '2 subagents, both running'],
      ['3 done', '3 subagents, all done'],
      ['2 running · 1 done', '3 subagents, 2 running, 1 done'],
    ]);
  });
});

describe('a job\'s ask', () => {
  test('carries the open decision\'s first question and its stamp, and there is none without an open decision naming the job', () => {
    const decisions = [exampleAskingDecision({ id: 'E7', jobId: 'J9' }), exampleAskingDecision({ id: 'E8', jobId: 'J12' })];
    expect(AgentsModel.askOf(decisions, 'J12', null)).toEqual({
      decisionId: 'E8', questionText: 'Should the example gift card skip payment?', openedAt: '2026-10-29T11:51:00', openedAtText: '2026-10-29T11:51:00'
    });
    expect(AgentsModel.askOf(decisions, 'J20', null)).toBeNull();
  });

  test('its full stamp is sliced as the inbox slices it, never the stored form with its fraction and offset', () => {
    const decisions = [exampleAskingDecision({ id: 'E8', jobId: 'J12', openedAt: '2026-10-29T11:51:07.250+01:00' })];
    expect(AgentsModel.askOf(decisions, 'J12', EXAMPLE_TIMESTAMP_SLICES)?.openedAtText).toBe('2026-10-29 11:51');
  });

  test('a decision that states no question or stamp still asks, with no text and no time', () => {
    expect(AgentsModel.askOf([exampleAskingDecision({
      id: 'E3', jobId: 'J12', questions: [], openedAt: ''
    })], 'J12', EXAMPLE_TIMESTAMP_SLICES)).toEqual({
      decisionId: 'E3', questionText: '', openedAt: null, openedAtText: null
    });
  });

  test('the open decision is the first one naming the job', () => {
    const decisions = [{ id: 'D1', jobId: 'J9' }, { id: 'D3', jobId: 'J12' }, { id: 'D4', jobId: 'J12' }];
    expect(AgentsModel.openDecisionOf(decisions, 'J12')).toEqual({ id: 'D3', jobId: 'J12' });
  });
});

describe('the worded counts', () => {
  test('quiet text shows only above zero sweeps, singular at one', () => {
    expect([0, 1, 2].map(AgentsModel.quietTextOf)).toEqual([null, 'quiet 1 sweep', 'quiet 2 sweeps']);
  });

  test('the card count leaves out its zero parts and names one in the singular', () => {
    expect(AgentsModel.cardCountTextOf(3, 2, 1)).toBe('3 jobs · 2 ask User · 1 quiet');
    expect(AgentsModel.cardCountTextOf(1, 1, 0)).toBe('1 job · 1 asks User');
    expect(AgentsModel.cardCountTextOf(0, 0, 0)).toBe('0 jobs');
  });

  test('the project lines count jobs, tickets in progress without a job, sessions and those that wait on User', () => {
    expect(AgentsModel.workersLineTextOf(3, 4)).toBe('3 jobs here · 4 tickets in progress have no job');
    expect(AgentsModel.workersLineTextOf(1, 1)).toBe('1 job here · 1 ticket in progress has no job');
    expect(AgentsModel.workersLineTextOf(2, 0)).toBe('2 jobs here');
    expect(AgentsModel.sessionsLineTextOf(3, 1)).toBe('3 sessions · 1 waits on User');
    expect(AgentsModel.sessionsLineTextOf(1, 0)).toBe('1 session');
    expect(AgentsModel.waitsOnUserTextOf(2)).toBe('2 wait on User');
    expect([0, 1].map(AgentsModel.incidentsOpenTextOf)).toEqual(['0 incidents open', '1 incident open']);
  });

  test('the session tallies count the live intake and Assistant jobs, and those with an open decision', () => {
    const jobs = [
      exampleAgentJob({ id: 'J7', kind: 'product-owner', role: 'product-owner' }),
      exampleAgentJob({ id: 'J6', kind: 'product-owner', role: 'product-owner' }),
      exampleAgentJob({ id: 'J1', kind: 'assistant', role: 'assistant' }),
    ];
    expect(AgentsModel.sessionTalliesOf(jobs, [exampleAskingDecision({ id: 'E9', jobId: 'J7' })])).toEqual([
      { kind: 'intake', liveCount: 2, waitingOnUserCount: 1 },
      { kind: 'assistant', liveCount: 1, waitingOnUserCount: 0 },
    ]);
  });

  test('a session is about its intake\'s title, else its request, the Assistant\'s open incidents, or a pipeline agent', () => {
    const { sessionAboutTextOf } = AgentsModel;
    expect(sessionAboutTextOf({ role: 'product-owner', intake: { text: 'Example saved baskets, please', title: 'Saved baskets' } }, 0)).toBe('Saved baskets');
    expect(sessionAboutTextOf({ role: 'product-owner', intake: { text: 'Example saved baskets, please', title: null } }, 0)).toBe('Example saved baskets, please');
    expect([0, 1, 2].map((count) => sessionAboutTextOf({ role: 'assistant', intake: null }, count))).toEqual(['no open incident', '1 open incident', '2 open incidents']);
    expect(sessionAboutTextOf({ role: 'pipeline-agent', intake: null }, 0)).toBe('pipeline agent');
  });
});

describe('the controls a job takes', () => {
  test('a job is stopping in the stopping state or once a stop is requested, whatever its state', () => {
    expect(AgentsModel.isStopping(BUILD_JOB)).toBe(false);
    expect(AgentsModel.isStopping({ state: 'stopping', stopRequest: null })).toBe(true);
    expect(AgentsModel.isStopping({ state: 'running', stopRequest: 'stop' })).toBe(true);
  });

  test('a job takes a message exactly while the forge offers it, whatever its role or stop', () => {
    expect(AgentsModel.takesMessages(BUILD_JOB)).toBe(true);
    expect(AgentsModel.takesMessages({ ...BUILD_JOB, offers: { ...BUILD_JOB.offers, takesMessage: false } })).toBe(false);
    const rolelessJob: AgentJobDocument = { ...BUILD_JOB, role: null, stopRequest: 'wind-down' };
    expect(AgentsModel.takesMessages(rolelessJob)).toBe(true);
  });
});

describe('the job panel\'s words', () => {
  test('the head says the job\'s state, then how long ago it launched only where the log holds its launch', () => {
    expect(AgentsModel.panelStateTextOf({ state: 'running', interruption: null }, '12m 04s')).toBe('running · 12m 04s');
    expect(AgentsModel.panelStateTextOf({ state: 'launching', interruption: null }, null)).toBe('launching');
  });

  test('a job interrupted by a network outage or a lost supervision says its wait; any other state reads raw', () => {
    expect([
      AgentsModel.stateTextOf({ state: 'interrupted', interruption: 'network-outage' }),
      AgentsModel.stateTextOf({ state: 'interrupted', interruption: 'lease-ended' }),
      AgentsModel.stateTextOf({ state: 'interrupted', interruption: 'agent-crashed' }),
      AgentsModel.stateTextOf({ state: 'running', interruption: 'network-outage' }),
    ]).toEqual(['Network outage', 'Not supervised', 'interrupted', 'running']);
    expect(AgentsModel.panelStateTextOf({ state: 'interrupted', interruption: 'lease-ended' }, '3m 00s')).toBe('Not supervised · 3m 00s');
  });

  test('what a waiting job follows reads in Gaia\'s words, one sentence for each wait the forge serves', () => {
    expect((['instruction', 'answer', 'decision', 'nothing', 'never'] as const).map(AgentsModel.resumeWaitTextOf)).toEqual([
      'Waits for your resume.',
      'Resumes once its question is answered.',
      'Resumes once its decision is answered.',
      'Resumes by itself at the forge\'s next pass.',
      'No resume restarts it.',
    ]);
  });

  test('the transcript head counts its entries, one in the singular', () => {
    expect(AgentsModel.transcriptCountTextOf(11)).toBe('followed live · 11 entries');
    expect(AgentsModel.transcriptCountTextOf(1)).toBe('followed live · 1 entry');
    expect(AgentsModel.transcriptCountTextOf(0)).toBe('followed live · 0 entries');
  });
});

describe('the concurrency limit asked for', () => {
  test('a wanted limit is sendable only as a whole number within the forge\'s served bounds that differs from the current limit', () => {
    const bounds = EXAMPLE_BOARD_LIMITS.concurrency;
    const sendable = (wantedLimit: number): boolean => AgentsModel.concurrencyLimitIsSendable(wantedLimit, 4, bounds);
    expect(sendable(5)).toBe(true);
    expect(sendable(bounds.ceiling)).toBe(true);
    expect(sendable(bounds.ceiling + 1)).toBe(false);
    expect(sendable(bounds.lowest)).toBe(true);
    expect(sendable(bounds.lowest - 1)).toBe(false);
    expect(sendable(4)).toBe(false);
    expect(sendable(2.5)).toBe(false);
    expect(sendable(Number.NaN)).toBe(false);
    expect(AgentsModel.concurrencyLimitIsSendable(7, 4, { lowest: 2, ceiling: 6 })).toBe(false);
  });
});
