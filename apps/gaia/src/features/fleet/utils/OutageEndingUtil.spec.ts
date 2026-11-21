/**
 * The one rule for the jobs a network outage left waiting, against the util's own contract. What matters: only a job the forge serves
 * with the cause `network-outage` that waits for an instruction counts, so one already told to resume, one waiting on an answer and one
 * stopped for another cause do not; the total sums every forge; and the fleet's one alert is raised only while that total is above zero.
 */
import { describe, expect, test } from 'bun:test';

import type { ForgeWaitingJob } from '../../../shared/@types/ForgePresence.ts';
import { OutageEndingUtil }     from './OutageEndingUtil.ts';

function waitingJobOf(jobId: string, cause: ForgeWaitingJob['cause'], waitsFor: ForgeWaitingJob['waitsFor']): ForgeWaitingJob {
  return {
    jobId, kind: 'build', ticketIds: ['001'], cause, waitsFor
  };
}

describe('outageEndingsOf', () => {
  test('counts only a job stopped by a network outage that waits for an instruction', () => {
    const waitingWork = [
      waitingJobOf('J1', 'network-outage', 'instruction'),
      waitingJobOf('J2', 'network-outage', 'instruction'),
      waitingJobOf('J3', 'network-outage', 'nothing'),
      waitingJobOf('J4', 'network-outage', 'answer'),
      waitingJobOf('J5', 'lease-ended', 'instruction'),
      waitingJobOf('J6', 'forge-crashed', 'instruction'),
    ];
    expect(waitingWork.map(OutageEndingUtil.endedOnAnOutage)).toEqual([true, true, false, false, false, false]);
    expect(OutageEndingUtil.outageEndingsOf(waitingWork)).toBe(2);
  });

  test('counts nothing with no waiting work', () => {
    expect(OutageEndingUtil.outageEndingsOf([])).toBe(0);
  });
});

describe('outageEndingsTotalOf and outageAlertOf', () => {
  test('sums every forge\'s count, and raises the fleet\'s one alert, of no one forge, while it is above zero', () => {
    const forges = [{ outageEndings: 2 }, { outageEndings: 0 }, { outageEndings: 1 }];
    expect(OutageEndingUtil.outageEndingsTotalOf(forges)).toBe(3);
    expect(OutageEndingUtil.outageAlertOf(forges)).toMatchObject({ trackerId: null, kind: 'agents-ended-on-outage', actionLabel: 'Open' });
  });

  test('raises no alert while no forge holds a job a network outage stopped', () => {
    expect(OutageEndingUtil.outageAlertOf([{ outageEndings: 0 }, { outageEndings: 0 }])).toBeNull();
    expect(OutageEndingUtil.outageAlertOf([])).toBeNull();
  });
});
