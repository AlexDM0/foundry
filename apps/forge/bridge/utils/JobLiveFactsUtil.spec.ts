/**
 * A job's worded live facts. What matters: calls read against the budget only when there is one; and the last tool call reads as none
 * before the first, as running while it has no result, and as its name once it has one.
 */
import { describe, expect, test } from 'bun:test';

import { JobLiveFactsUtil } from './JobLiveFactsUtil.ts';

describe('JobLiveFactsUtil.callsAgainstBudgetOf', () => {
  test('calls read against the budget, or alone when the job has none', () => {
    expect(JobLiveFactsUtil.callsAgainstBudgetOf({ live: { calls: 12, callBudget: 150 } })).toBe('12 / 150');
    expect(JobLiveFactsUtil.callsAgainstBudgetOf({ live: { calls: 12, callBudget: null } })).toBe('12');
  });
});

describe('JobLiveFactsUtil.lastToolCallTextOf', () => {
  test('no call reads as none yet, a call without its result as running, and a finished call as its name', () => {
    expect(JobLiveFactsUtil.lastToolCallTextOf(null)).toBe('no tool call yet');
    expect(JobLiveFactsUtil.lastToolCallTextOf({ toolName: 'Bash', running: true })).toBe('Bash running');
    expect(JobLiveFactsUtil.lastToolCallTextOf({ toolName: 'Read', running: false })).toBe('Read');
  });
});
