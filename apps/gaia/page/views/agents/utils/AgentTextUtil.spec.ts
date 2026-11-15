/**
 * An agent row's words and machine values. What matters: a running time reads as the artboard writes it at each scale, and never goes
 * negative or invents a value for a stamp that is no time; a running job is named for what its role does; a state Gaia does not know is
 * shown as the forge wrote it; a count groups its thousands the same way in every browser language.
 */
import { describe, expect, test } from 'bun:test';

import { AgentTextUtil } from './AgentTextUtil.ts';

const STARTED_AT = '2026-11-12T13:00:00.000Z';
const STARTED_AT_MILLISECONDS = Date.parse(STARTED_AT);
const MILLISECONDS_PER_SECOND = 1000;

function runningTimeAfter(seconds: number): string | null {
  return AgentTextUtil.runningTimeText(STARTED_AT, STARTED_AT_MILLISECONDS + seconds * MILLISECONDS_PER_SECOND);
}

describe('the running time', () => {
  test('seconds alone under a minute, minutes and padded seconds under an hour, hours and padded minutes from there', () => {
    expect([0, 45, 60, 724, 3599, 3600, 3720, 36_000].map(runningTimeAfter)).toEqual(['0s', '45s', '1m 00s', '12m 04s', '59m 59s', '1h 00m', '1h 02m', '10h 00m']);
  });

  test('a stamp ahead of the page\'s clock reads as just started, and a stamp that is no time gives no running time', () => {
    expect(runningTimeAfter(-30)).toBe('0s');
    expect(AgentTextUtil.runningTimeText('not a stamp', STARTED_AT_MILLISECONDS)).toBeNull();
  });
});

describe('the state word', () => {
  test('a running builder is Building, a running reviewer Reviewing, any other running job Running', () => {
    expect([AgentTextUtil.stateWordOf('running', 'builder'), AgentTextUtil.stateWordOf('running', 'reviewer')]).toEqual(['Building', 'Reviewing']);
    expect([AgentTextUtil.stateWordOf('running', 'assistant'), AgentTextUtil.stateWordOf('running', null)]).toEqual(['Running', 'Running']);
  });

  test('a job waiting for an answer is Waiting, under either name the forge gives it', () => {
    expect(['waiting-for-answer', 'awaiting-answer'].map((state) => AgentTextUtil.stateWordOf(state, 'builder'))).toEqual(['Waiting', 'Waiting']);
    expect(['waiting-for-answer', 'awaiting-answer', 'running'].map(AgentTextUtil.stateIsWaiting)).toEqual([true, true, false]);
  });

  test('a state Gaia does not know stands as the forge wrote it, an inherited property name among them', () => {
    expect(AgentTextUtil.stateWordOf('composing-a-sonnet', 'builder')).toBe('composing-a-sonnet');
    expect(AgentTextUtil.stateWordOf('constructor', 'builder')).toBe('constructor');
    expect(AgentTextUtil.stateWordOf('running', 'toString')).toBe('Running');
  });
});

describe('counts', () => {
  test('thousands are grouped with commas', () => {
    expect([0, 999, 84_210, 821_300, 1_240_000].map(AgentTextUtil.groupedNumberText)).toEqual(['0', '999', '84,210', '821,300', '1,240,000']);
  });
});
