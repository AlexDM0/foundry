/**
 * The board's jobs against the contract's job documents. What matters: a job maps field by field with its interruption and its lost line
 * in the monitor's cause names (`watcher-lost` is `child-lost`); a field the model leaves absent reads `null` as the document declares, and
 * the job's own bookkeeping (event cursor, answered requests, parent job, target) stays out; an ended job, the launch slots and each kind of
 * forecast step map field by field.
 */
import { describe, expect, test } from 'bun:test';

import type { JobWithLiveFacts } from '../../@types/BoardStateParts.ts';
import { BoardJobMappingUtil }   from './BoardJobMappingUtil.ts';

const AT = '2026-11-19T10:00:00+01:00';

function jobWith(changes: Partial<JobWithLiveFacts>): JobWithLiveFacts {
  return {
    id:                 'J1',
    kind:               'build',
    role:               'builder',
    ticketIds:          ['001'],
    parentJobId:        null,
    attempt:            2,
    target:             'main',
    state:              'running',
    childInstance:      3,
    eventCursor:        { instance: 3, sequence: 9 },
    answeredRequestIds: ['request-example'],
    crashResumes:       1,
    launchedAt:         AT,
    lostLine:           null,
    live:               {
      jobId:        'J1',
      calls:        4,
      callBudget:   null,
      tokens:       900,
      toolCalls:    2,
      lastToolCall: { toolName: 'Read', startedAt: null, running: false },
      subagents:    [{
        parentToolUseId: 'tool-example', toolCalls: 1, lastToolCall: null, tokens: 10, state: 'ended', description: null
      }],
      toolCallsWithSubagents: 3,
      turn:                   null,
      messagesWaiting:        1,
      lastLine:               { role: 'assistant', text: 'Done.', at: AT },
      usageWindow:            {
        window: 'five_hour', lengthHours: 5, resetsAt: null, reportedAt: null
      },
      silentSweeps: 0,
    },
    ...changes,
  };
}

describe('BoardJobMappingUtil.jobOf', () => {
  test('maps a job field by field, an absent interruption, stop request, intake and entity as null, and leaves its bookkeeping out', () => {
    expect(BoardJobMappingUtil.jobOf(jobWith({}))).toEqual({
      id:            'J1',
      kind:          'build',
      role:          'builder',
      ticketIds:     ['001'],
      state:         'running',
      attempt:       2,
      childInstance: 3,
      crashResumes:  1,
      launchedAt:    AT,
      airlock:       null,
      interruption:  null,
      lostLine:      null,
      stopRequest:   null,
      intake:        null,
      entity:        null,
      live:          {
        calls:        4,
        callBudget:   null,
        tokens:       900,
        toolCalls:    2,
        lastToolCall: { toolName: 'Read', startedAt: null, running: false },
        subagents:    [{
          parentToolUseId: 'tool-example', toolCalls: 1, lastToolCall: null, tokens: 10, state: 'ended', description: null
        }],
        toolCallsWithSubagents: 3,
        silentSweeps:           0,
        turn:                   null,
        messagesWaiting:        1,
        lastLine:               { role: 'assistant', text: 'Done.', at: AT },
      },
    });
  });

  test('names the interruption and the lost line by the monitor\'s causes', () => {
    const document = BoardJobMappingUtil.jobOf(jobWith({ interruption: 'watcher-lost', lostLine: { line: 'gate', cause: 'forge-crashed' } }));
    expect([document.interruption, document.lostLine]).toEqual(['child-lost', { line: 'gate', cause: 'forge-crashed' }]);
  });

  test('keeps the Airlock\'s phase alone, an intake with no title yet, the stop request and the entity', () => {
    const document = BoardJobMappingUtil.jobOf(jobWith({
      airlock: {
        target: 'main', targetTip: 'a', branchTip: 'b', phase: 'landing'
      },
      intake:      { text: 'Export the orders.', proposedDraftSets: [['D1']] },
      stopRequest: 'wind-down',
      entity:      'web',
    }));
    expect([document.airlock, document.intake, document.stopRequest, document.entity])
      .toEqual([{ phase: 'landing' }, { text: 'Export the orders.', title: null }, 'wind-down', 'web']);
  });
});

describe('BoardJobMappingUtil.endedJobOf', () => {
  test('maps an ended job field by field, leaving its target out', () => {
    expect(BoardJobMappingUtil.endedJobOf({
      id: 'J2', kind: 'merge', role: null, ticketIds: ['001'], target: 'main', attempt: 1, state: 'ended', outcome: 'landed', cause: null, endedAt: AT
    })).toEqual({
      id: 'J2', kind: 'merge', role: null, ticketIds: ['001'], attempt: 1, outcome: 'landed', cause: null, endedAt: AT
    });
  });
});

describe('BoardJobMappingUtil.launchSlotsOf', () => {
  test('maps the launch slots field by field', () => {
    const launchSlots = { limit: 2, slotJobIds: ['J1'], inProgressTicketIdsWithoutJob: ['003'] };
    expect(BoardJobMappingUtil.launchSlotsOf(launchSlots)).toEqual(launchSlots);
  });
});

describe('BoardJobMappingUtil.ticketForecastOf', () => {
  test('maps every kind of step and the dependents field by field', () => {
    const forecast = {
      ticketId: '001',
      steps:    [
        { kind: 'build', attempt: 1, jobId: 'J1' },
        { kind: 'customs-and-gates', gateNames: ['test'], jobId: null },
        { kind: 'review', round: 1, jobId: null },
        { kind: 'merge-approval', target: 'main' },
        { kind: 'land', target: null },
        { kind: 'integrate', target: 'group-example', group: 'example' },
      ],
      currentStepIndex: 0,
      dependents:       [{ ticketId: '002', stillWaitingOnTicketIds: ['003'] }],
    } as const;
    expect(BoardJobMappingUtil.ticketForecastOf({
      ...forecast,
      steps:      forecast.steps.map((step) => ('gateNames' in step ? { ...step, gateNames: [...step.gateNames] } : step)),
      dependents: [{ ticketId: '002', stillWaitingOnTicketIds: ['003'] }],
    })).toEqual(forecast);
  });
});
