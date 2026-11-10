/**
 * The Agents view's model. What matters: a record without live facts is no agent job, so a partial `job` event cannot break the table; a
 * job's open decision is found by its `jobId`; a watch-only Watcher is worded as such; the job count names one job in the singular; and a
 * job is stopping by its state or by a stop request alone.
 */
import { describe, expect, test } from 'bun:test';

import type { IdentifiedRecord }                       from '../../@types/BoardStateDocument.ts';
import type { AgentJobDocument, JobLiveFactsDocument } from './AgentJobDocument.ts';
import { AgentsModel }                                 from './AgentsModel.ts';

const LIVE: JobLiveFactsDocument = {
  calls:                  12,
  callBudget:             150,
  tokens:                 48_000,
  toolCalls:              7,
  lastToolCall:           null,
  subagents:              [],
  toolCallsWithSubagents: 7,
  silentSweeps:           0,
  watcherProtocol:        1,
  watchOnly:              false,
};

const BUILD_JOB: AgentJobDocument = {
  id: 'J12', kind: 'build', role: 'builder', ticketIds: ['042'], state: 'running', attempt: 1, watcherInstance: 1, crashResumes: 0, live: LIVE,
};

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

describe('a job\'s open decision', () => {
  test('is the first decision naming the job, and none when no decision names it', () => {
    const decisions = [{ id: 'D1', jobId: 'J9' }, { id: 'D3', jobId: 'J12' }, { id: 'D4', jobId: 'J12' }];
    expect(AgentsModel.openDecisionOf(decisions, 'J12')).toEqual({ id: 'D3', jobId: 'J12' });
    expect(AgentsModel.openDecisionOf(decisions, 'J20')).toBeNull();
  });
});

describe('the worded live facts', () => {
  test('the Watcher reads as its protocol, as watch only for a legacy Watcher, and as a dash when unknown', () => {
    expect(AgentsModel.watcherTextOf(BUILD_JOB)).toBe('protocol 1');
    expect(AgentsModel.watcherTextOf({ live: { ...LIVE, watcherProtocol: 0, watchOnly: true } })).toBe('running on Watcher protocol 0: watch only');
    expect(AgentsModel.watcherTextOf({ live: { ...LIVE, watcherProtocol: null } })).toBe('-');
  });

  test('the job count names one job in the singular', () => {
    expect([0, 1, 5].map(AgentsModel.jobCountTextOf)).toEqual(['0 jobs', '1 job', '5 jobs']);
  });
});

describe('the controls a job takes', () => {
  test('a job is stopping in the stopping state or once a stop is requested, whatever its state', () => {
    expect(AgentsModel.isStopping(BUILD_JOB)).toBe(false);
    expect(AgentsModel.isStopping({ state: 'stopping' })).toBe(true);
    expect(AgentsModel.isStopping({ state: 'running', stopRequest: 'stop' })).toBe(true);
  });
});
