/** Talos's log keeps the words its ports gave before they answered a cause: each sentence here is one they wrote. */
import { expect, test } from 'bun:test';

import { TalosLogWordingUtil } from './TalosLogWordingUtil.ts';

test('a stop refusal of a process group reads as the frozen table of the process supervision keeps it', () => {
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'group-not-signalled', processGroupId: 4242, systemError: 'Error: example EPERM' }))
    .toBe('the process group 4242 could not be signalled: Error: example EPERM');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'group-members-unreadable', processGroupId: 4242 })).toBe('the members of process group 4242 could not be read');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'process-not-signalled', processId: 11, systemError: 'Error: example EPERM' }))
    .toBe('the process 11 could not be signalled: Error: example EPERM');
});

test('a stop refusal of the Windows tree and of a platform with no adapter reads as before', () => {
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'no-system-root' }))
    .toBe('SystemRoot is not an absolute folder, so taskkill.exe cannot be run by absolute path');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'processes-not-ended', processIds: [11, 12] })).toBe('the processes 11, 12 could not be ended');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'tree-unreadable', leaderProcessId: 10 })).toBe('the process tree of 10 could not be read');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'tree-starts-unreadable', leaderProcessId: 10, processIds: [11] }))
    .toBe('the start of the listed processes 11 in the tree of 10 could not be read');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'no-outside-ask', processId: 11 }))
    .toBe('the process 11 cannot be asked to stop from outside on Windows');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'process-not-ended', processId: 11 })).toBe('the process 11 could not be ended');
  expect(TalosLogWordingUtil.processStopRefusalOf({ cause: 'no-adapter', platformName: 'example-os' })).toBe('no process supervision exists for the platform example-os');
});

test('an endpoint refusal reads as before', () => {
  expect(TalosLogWordingUtil.endpointRefusalOf({ cause: 'system-error', systemError: 'Error: example EACCES' })).toBe('Error: example EACCES');
  expect(TalosLogWordingUtil.endpointRefusalOf({ cause: 'folder-not-private', restrictionCause: 'not-proved-owner-only', path: '/example/private' }))
    .toBe('not-proved-owner-only: /example/private');
  expect(TalosLogWordingUtil.endpointRefusalOf({ cause: 'no-adapter', platformName: 'example-os' })).toBe('no local endpoint exists for the platform example-os');
});
