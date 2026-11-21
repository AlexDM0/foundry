/**
 * The start's kind names the cause of every job whose child it finds gone with no end of its own; a wrong row would let work cut short by a
 * reboot, a stop or a crash resume by itself, or hold work a handover only passed on.
 */
import { expect, test } from 'bun:test';

import { ReconcileCauses } from './ReconcileCauses.ts';

test('a start after the machine went down, a suspected crash among them, names reboot', () => {
  expect(ReconcileCauses.causeOfAGoneChild('machine-went-down')).toBe('reboot');
  expect(ReconcileCauses.startLeavesWorkWaiting('machine-went-down')).toBe(true);
});

test('a start after a crash names forge-crashed', () => {
  expect(ReconcileCauses.causeOfAGoneChild('crashed')).toBe('forge-crashed');
  expect(ReconcileCauses.startLeavesWorkWaiting('crashed')).toBe(true);
});

test('a start after a stop on purpose names forge-stopped', () => {
  expect(ReconcileCauses.causeOfAGoneChild('stopped-on-purpose')).toBe('forge-stopped');
  expect(ReconcileCauses.startLeavesWorkWaiting('stopped-on-purpose')).toBe(true);
});

test('a handover names no cause, so a child lost in it keeps the cause the lost Talos\'s sweep gave it', () => {
  expect(ReconcileCauses.causeOfAGoneChild('handover')).toBeNull();
  expect(ReconcileCauses.startLeavesWorkWaiting('handover')).toBe(false);
});

test('a first start names no cause and leaves nothing waiting', () => {
  expect(ReconcileCauses.causeOfAGoneChild('first-start')).toBeNull();
  expect(ReconcileCauses.startLeavesWorkWaiting('first-start')).toBe(false);
});
