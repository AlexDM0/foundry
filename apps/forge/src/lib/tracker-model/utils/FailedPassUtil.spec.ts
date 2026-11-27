/**
 * Failed passes as a log reading: only `failed` and `does-not-hold` on the ticket's own jobs count, rework from review keeps the count and
 * any other start resets it; crashes, stops and a review that resumes its builder never count; and once a ticket crosses into a package
 * the passes count per entity and stage, the ticket's count being the highest.
 */
import { describe, expect, test } from 'bun:test';

import type { LogRecord } from '../@types/LogRecord.ts';
import {
  endedRecord,
  FIXTURE_AT,
  finishedJobRecords,
  interruptedRecord,
  launchedRecord,
  stagedLaunchedRecord,
  ticketRecord
}                           from '../testing/LifecycleFixtures.ts';
import { FailedPassUtil } from './FailedPassUtil.ts';

const { failedPassesByStageOf, failedPassesOf, outcomeIsAFailedPass } = FailedPassUtil;

describe('which outcomes are failed passes', () => {
  test('failed and does-not-hold are; replaced, stopped and built are not', () => {
    expect((['failed', 'does-not-hold', 'replaced', 'stopped', 'built'] as const).map(outcomeIsAFailedPass)).toEqual([true, true, false, false, false]);
  });
});

describe('counting a ticket\'s failed passes', () => {
  test('counts the ticket\'s own failed jobs, and none of another ticket\'s', () => {
    const records = [...finishedJobRecords('J1', 'build', '001', 'failed'), ...finishedJobRecords('J2', 'build', '002', 'failed')];
    expect(failedPassesOf('001', records)).toBe(1);
  });

  test('a crash and a replacement are not failed passes', () => {
    const records = [launchedRecord('J1', 'build', ['001']), interruptedRecord('J1', 'talos-lost'), ...finishedJobRecords('J2', 'build', '001', 'replaced')];
    expect(failedPassesOf('001', records)).toBe(0);
  });

  test('a start from review keeps the count, a start from committed begins it again', () => {
    const rework: LogRecord[] = [...finishedJobRecords('J1', 'build', '001', 'failed'), ticketRecord('ticket-finished', '001'), ticketRecord('ticket-started', '001')];
    expect(failedPassesOf('001', rework)).toBe(1);
    const reopened: LogRecord[] = [...finishedJobRecords('J1', 'build', '001', 'failed'), {
      kind: 'ticket-reopened', ticketId: '001', fields: {}, at: FIXTURE_AT
    }, ticketRecord('ticket-started', '001')];
    expect(failedPassesOf('001', reopened)).toBe(0);
  });

  test('a review that does not hold after a built build resumes the builder and is no failed pass', () => {
    const records = [...finishedJobRecords('J1', 'build', '001', 'built'), ...finishedJobRecords('R1', 'review', '001', 'does-not-hold')];
    expect(failedPassesOf('001', records)).toBe(0);
  });

  test('a review that does not hold and resumes nobody is a failed pass', () => {
    const afterAFailedBuild = [...finishedJobRecords('J1', 'build', '001', 'failed'), ...finishedJobRecords('R1', 'review', '001', 'does-not-hold')];
    expect(failedPassesOf('001', afterAFailedBuild)).toBe(2);
    const afterAnUnhold = [
      ...finishedJobRecords('J1', 'build', '001', 'built'),
      ticketRecord('ticket-unheld', '001'),
      ...finishedJobRecords('R1', 'review', '001', 'does-not-hold'),
    ];
    expect(failedPassesOf('001', afterAnUnhold)).toBe(1);
    expect(failedPassesOf('001', finishedJobRecords('R1', 'review', '001', 'does-not-hold'))).toBe(1);
  });

  test('an unhold and a clearing begin the count again', () => {
    const failedTwice = [...finishedJobRecords('J1', 'build', '001', 'failed'), ...finishedJobRecords('J2', 'build', '001', 'failed', 2)];
    expect(failedPassesOf('001', [...failedTwice, ticketRecord('ticket-unheld', '001')])).toBe(0);
    expect(failedPassesOf('001', [...failedTwice, { kind: 'tracker-cleared', fields: {}, at: FIXTURE_AT }])).toBe(0);
  });
});

describe('counting failed passes per entity and stage', () => {
  test('a launch without entity and stage counts under the one key it always had', () => {
    const records = [...finishedJobRecords('J1', 'build', '001', 'failed'), ...finishedJobRecords('J2', 'build', '001', 'failed', 2)];
    expect([...failedPassesByStageOf('001', records)]).toEqual([['', 2]]);
  });

  test('a ticket that crosses into no package counts its build and review stages together, kept across rework as today', () => {
    const records: LogRecord[] = [
      ticketRecord('ticket-started', '001'),
      stagedLaunchedRecord('B1', 'build', '001', 'shop', 1),
      endedRecord('B1', 'failed'),
      ticketRecord('ticket-finished', '001'),
      stagedLaunchedRecord('R1', 'review', '001', 'shop', 5),
      endedRecord('R1', 'failed'),
      ticketRecord('ticket-started', '001'),
      stagedLaunchedRecord('B2', 'build', '001', 'shop', 1, 2),
    ];
    expect([...failedPassesByStageOf('001', records)]).toEqual([['shop/', 2]]);
    expect(failedPassesOf('001', records)).toBe(2);
  });

  test('a launch into another stage starts it with no counts, and a return to an earlier stage starts again too', () => {
    const records: LogRecord[] = [
      stagedLaunchedRecord('J1', 'build', '001', 'shop', 1),
      endedRecord('J1', 'failed'),
      stagedLaunchedRecord('J2', 'build', '001', 'shop', 1, 2),
      endedRecord('J2', 'built'),
      stagedLaunchedRecord('J3', 'build', '001', 'ui', 2),
    ];
    expect(failedPassesOf('001', records.slice(0, 2))).toBe(1);
    expect(failedPassesOf('001', records)).toBe(0);
    const backInStageOne = [...records, endedRecord('J3', 'failed'), stagedLaunchedRecord('J4', 'build', '001', 'shop', 1, 3)];
    expect(failedPassesOf('001', backInStageOne)).toBe(0);
  });

  test('two entities in one stage count apart, and the ticket counts the highest', () => {
    const records: LogRecord[] = [
      stagedLaunchedRecord('J1', 'build', '001', 'ui', 2),
      stagedLaunchedRecord('J2', 'build', '001', 'theme', 2),
      endedRecord('J1', 'failed'),
      endedRecord('J2', 'failed'),
      stagedLaunchedRecord('J3', 'build', '001', 'ui', 2, 2),
      endedRecord('J3', 'failed'),
    ];
    expect([...failedPassesByStageOf('001', records)]).toEqual([['ui/2', 2], ['theme/2', 1]]);
    expect(failedPassesOf('001', records)).toBe(2);
  });
});
