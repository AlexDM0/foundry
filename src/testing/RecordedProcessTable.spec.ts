/**
 * The recorded process table may give only what the real table answered. What matters is that a call no recorded stage holds fails, and
 * that the mock refuses what the real table refuses: a stop of an identity whose start stamp does not match stops nothing, and a process
 * never reads live again after its recorded end, whether it ended by itself or by a forced stop.
 */
import {
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { nativePlatformPorts }                                             from './NativePlatformPorts.ts';
import { createRecordedProcessTable, type ControlledRecordedProcessTable } from './RecordedProcessTable.ts';

const nativePorts = nativePlatformPorts();
const UNKNOWN_PROCESS_ID = 4242;

let controlled: ControlledRecordedProcessTable;

beforeEach(() => {
  controlled = createRecordedProcessTable(nativePorts);
});

function supervision() {
  return controlled.table.ports.processSupervision;
}

describe('a call with no recorded answer', () => {
  test.each([
    ['an identity of a process never born', () => supervision().identityOf(UNKNOWN_PROCESS_ID)],
    ['a call shape nobody recorded', () => supervision().stopProcess(UNKNOWN_PROCESS_ID, 'force')],
    ['an ask stage', () => supervision().stopTree(controlled.table.bornProcess(), 'ask')],
    ['two identities of other processes', () => {
      const first = controlled.table.bornProcess();
      return supervision().sameProcess(first, controlled.table.bornProcess());
    }],
  ])('%s throws and is kept for the case to fail on', (_case, call) => {
    expect(call).toThrow('has no recorded answer');
    expect(controlled.takeUnansweredCalls()).toHaveLength(1);
  });
});

describe('the recorded answers', () => {
  test('a born process is live and its own process, and a forced stop of its tree ends it', () => {
    const born = controlled.table.bornProcess();
    expect(supervision().identityOf(born.processId)).toEqual(born);
    expect(supervision().processIsGone(born.processId)).toBe(false);
    expect(supervision().sameProcess(born, { ...born })).toBe(true);
    const treeMembers = supervision().treeMembersOf(born) ?? [];
    expect(supervision().stopTree(born, 'force', treeMembers)).toEqual({ verdict: 'signalled' });
    expect(supervision().identityOf(born.processId)).toBeNull();
    expect(supervision().processIsGone(born.processId)).toBe(true);
    expect(controlled.table.stoppedProcesses()).toEqual([born]);
    expect(controlled.takeUnansweredCalls()).toEqual([]);
  });

  test('a member of the caller\'s group outlives a forced stop of its tree', () => {
    const member = controlled.table.memberOfOwnGroup();
    expect(supervision().stopTree(member, 'force', supervision().treeMembersOf(member) ?? [])).toEqual({ verdict: 'group-gone' });
    expect(supervision().identityOf(member.processId)).toEqual(member);
    expect(controlled.takeUnansweredCalls()).toEqual([]);
  });
});

describe('what the real table refuses', () => {
  test('a stop of an identity whose start stamp does not match answers the mismatch and stops nothing', () => {
    const born = controlled.table.bornProcess();
    const anotherStartStamp = { ...born, startStamp: '1' };
    expect(supervision().sameProcess(born, anotherStartStamp)).toBe(false);
    expect(supervision().stopTree(anotherStartStamp, 'force')).toEqual({ verdict: 'identity-mismatch', currentIdentity: born });
    expect(supervision().identityOf(born.processId)).toEqual(born);
    expect(controlled.takeUnansweredCalls()).toEqual([]);
  });

  test('a process never reads live after it ended by itself, and a stop of it has no answer', () => {
    const ended = controlled.table.bornProcess();
    controlled.table.endProcess(ended);
    controlled.table.endProcess(ended);
    expect(supervision().identityOf(ended.processId)).toBeNull();
    expect(supervision().processIsGone(ended.processId)).toBe(true);
    expect(() => supervision().stopTree(ended, 'force')).toThrow('has no recorded answer');
    expect(controlled.takeUnansweredCalls()).toHaveLength(1);
  });

  test('a process stopped by force never reads live again, and its tree has no answer', () => {
    const born = controlled.table.bornProcess();
    supervision().stopTree(born, 'force', supervision().treeMembersOf(born) ?? []);
    controlled.table.endProcess(born);
    expect(supervision().identityOf(born.processId)).toBeNull();
    expect(() => supervision().treeMembersOf(born)).toThrow('has no recorded answer');
    expect(controlled.takeUnansweredCalls()).toHaveLength(1);
  });

  test('a stop with tree members other than those treeMembersOf answered has no answer', () => {
    const born = controlled.table.bornProcess();
    expect(() => supervision().stopTree(born, 'force', [])).toThrow('has no recorded answer');
    expect(supervision().identityOf(born.processId)).toEqual(born);
    expect(controlled.takeUnansweredCalls()).toHaveLength(1);
  });
});
