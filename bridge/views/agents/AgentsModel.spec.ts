/**
 * The Agents view's model. What matters: a record without live facts is no agent job, so a partial `job` event cannot break the table;
 * builders, reviewers and roleless jobs are worker work and intake, Assistant and pipeline agent jobs are sessions, so nothing that never takes
 * a slot sits under the slot meter; jobs that ask User lead their card; the slot meter reads the Overseer's `launchSlots`, never a kind
 * list, and a job is counted only when the Overseer named it; calls read against the budget, warn near it and unbounded without one;
 * subagents are squares worded in every plural form, an older board's subagent without a state reading ended; the ask carries the open
 * decision's first question and its stamp sliced as the inbox slices it; every count leaves out its zero parts and names one in the
 * singular; a session says what it is about; a watch-only Watcher is worded as such; a job is stopping by its state or by a stop request
 * alone; and a concurrency limit is sendable only as a changed whole number the Overseer would take.
 */
import { describe, expect, test } from 'bun:test';

import { CONCURRENCY_LIMIT_CEILING_AGENTS }                        from '../../../src/lib/tracker-model/constants/ConcurrencyLimits.ts';
import type { IdentifiedRecord, LaunchSlotsDocument }              from '../../@types/BoardStateDocument.ts';
import { exampleAgentJob, exampleAskingDecision, exampleSubagent } from '../../testing/BoardStateFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                                from '../../testing/TimestampSlicesFixture.ts';
import type { AgentJobDocument, SubagentDocument }                 from './AgentJobDocument.ts';
import { AgentsModel, CALL_BUDGET_WARNING_FRACTION }               from './AgentsModel.ts';

const BUILD_JOB = exampleAgentJob({ id: 'J12' });

const LAUNCH_SLOTS: LaunchSlotsDocument = { limit: 5, slotJobIds: ['J2', 'J3'], inProgressTicketIdsWithoutJob: ['010'] };

function withSubagents(...states: SubagentDocument['state'][]): AgentJobDocument {
  return exampleAgentJob({
    id:   'J3',
    live: { ...BUILD_JOB.live, subagents: states.map((state, i) => exampleSubagent({ parentToolUseId: `toolu-${i}`, state })) },
  });
}

describe('which records are agent jobs', () => {
  test('a job with live facts, ticket ids and a state is one', () => {
    expect(AgentsModel.isAgentJob(BUILD_JOB)).toBe(true);
  });

  test('a record without live facts, or with live facts lacking subagents, is not', () => {
    const withoutLiveFacts: IdentifiedRecord = { id: 'J13', ticketIds: [], state: 'running' } as IdentifiedRecord;
    const withoutSubagents: IdentifiedRecord = { ...BUILD_JOB, live: { calls: 1 } } as IdentifiedRecord;
    expect(AgentsModel.isAgentJob(withoutLiveFacts)).toBe(false);
    expect(AgentsModel.isAgentJob(withoutSubagents)).toBe(false);
  });
});

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
    expect(AgentsModel.roleMarkOf({ role: 'builder', kind: 'build' })).toEqual({ letter: 'B', state: 'in-progress', word: 'builder' });
    expect(AgentsModel.roleMarkOf({ role: 'product-owner', kind: 'product-owner' })).toEqual({ letter: 'P', state: 'draft', word: 'intake' });
    expect(AgentsModel.roleMarkOf({ role: 'assistant', kind: 'assistant' })).toEqual({ letter: 'A', state: 'reviewing', word: 'Assistant' });
    expect(AgentsModel.roleMarkOf({ role: null, kind: 'merge' })).toEqual({ letter: 'M', state: 'pending', word: 'merge' });
  });
});

describe('the launch slots', () => {
  test('the slot meter counts the jobs the Overseer says hold a slot, against its limit, and is over the limit only past it', () => {
    expect(AgentsModel.slotMeterOf(LAUNCH_SLOTS)).toEqual({
      counted: 2, limit: 5, countedJobIds: ['J2', 'J3'], overLimit: false, label: '2 worker jobs against a limit of 5',
    });
    const over = AgentsModel.slotMeterOf({ ...LAUNCH_SLOTS, limit: 1 });
    expect(over?.overLimit).toBe(true);
    expect(AgentsModel.slotMeterOf({ ...LAUNCH_SLOTS, slotJobIds: ['J2'] })?.label).toBe('1 worker job against a limit of 5');
    expect(AgentsModel.slotMeterOf(null)).toBeNull();
  });

  test('a job is counted only when the Overseer named it, and neither way on a board that serves no launch slots', () => {
    expect(AgentsModel.isCounted('J2', LAUNCH_SLOTS)).toBe(true);
    expect(AgentsModel.isCounted('J9', LAUNCH_SLOTS)).toBe(false);
    expect(AgentsModel.isCounted('J2', null)).toBeNull();
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

  test('a subagent an older board served without a state reads ended', () => {
    const stateless = { ...exampleSubagent({ parentToolUseId: 'toolu-1' }), state: undefined } as unknown as SubagentDocument;
    const job = exampleAgentJob({ id: 'J3', live: { ...BUILD_JOB.live, subagents: [stateless] } });
    expect(AgentsModel.subagentSquaresOf(job).squares[0]?.running).toBe(false);
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
    expect(AgentsModel.askOf([{ id: 'E3', jobId: 'J12' } as IdentifiedRecord], 'J12', EXAMPLE_TIMESTAMP_SLICES)).toEqual({
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
    expect(sessionAboutTextOf({ role: 'product-owner', intake: { text: 'Example saved baskets, please' } }, 0)).toBe('Example saved baskets, please');
    expect([0, 1, 2].map((count) => sessionAboutTextOf({ role: 'assistant' }, count))).toEqual(['no open incident', '1 open incident', '2 open incidents']);
    expect(sessionAboutTextOf({ role: 'pipeline-agent' }, 0)).toBe('pipeline agent');
  });
});

describe('the worded live facts', () => {
  test('the Watcher reads as its protocol, as watch only for a legacy Watcher, and as a dash when unknown', () => {
    expect(AgentsModel.watcherTextOf(BUILD_JOB)).toBe('protocol 1');
    expect(AgentsModel.watcherTextOf({ live: { ...BUILD_JOB.live, watcherProtocol: 0, watchOnly: true } })).toBe('running on Watcher protocol 0: watch only');
    expect(AgentsModel.watcherTextOf({ live: { ...BUILD_JOB.live, watcherProtocol: null } })).toBe('-');
  });
});

describe('the controls a job takes', () => {
  test('a job is stopping in the stopping state or once a stop is requested, whatever its state', () => {
    expect(AgentsModel.isStopping(BUILD_JOB)).toBe(false);
    expect(AgentsModel.isStopping({ state: 'stopping' })).toBe(true);
    expect(AgentsModel.isStopping({ state: 'running', stopRequest: 'stop' })).toBe(true);
  });
});

describe('the concurrency limit asked for', () => {
  test('a wanted limit is sendable only as a whole number from one to the ceiling that differs from the current limit', () => {
    const { concurrencyLimitIsSendable } = AgentsModel;
    expect(concurrencyLimitIsSendable(5, 4)).toBe(true);
    expect(concurrencyLimitIsSendable(CONCURRENCY_LIMIT_CEILING_AGENTS, 4)).toBe(true);
    expect(concurrencyLimitIsSendable(CONCURRENCY_LIMIT_CEILING_AGENTS + 1, 4)).toBe(false);
    expect(concurrencyLimitIsSendable(4, 4)).toBe(false);
    expect(concurrencyLimitIsSendable(0, 4)).toBe(false);
    expect(concurrencyLimitIsSendable(2.5, 4)).toBe(false);
    expect(concurrencyLimitIsSendable(Number.NaN, 4)).toBe(false);
  });
});
