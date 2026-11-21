/**
 * The state words. The cases that matter are the repeat review, the one label carrying a number, a stored word that is no display state,
 * also one named like an object property, and the words of an interrupted job's wait.
 */
import { expect, test } from 'bun:test';

import { DisplayStateWordingUtil } from './DisplayStateWordingUtil.ts';

test('a state reads as its badge words it', () => {
  expect(['draft', 'committed', 'in-review', 'reviewed', 'delivered'].map((state) => DisplayStateWordingUtil.labelOf(state as 'draft'))).toEqual([
    'Draft', 'To do', 'Awaiting review', 'Awaiting merge', 'Done',
  ]);
});

test('only a repeat review names its round', () => {
  expect(DisplayStateWordingUtil.stateLabelOf('re-review', 3)).toBe('Reviewing (round 3)');
  expect(DisplayStateWordingUtil.stateLabelOf('reviewing', 3)).toBe('Reviewing');
});

test('only a display state reads as one, never a job\'s interruption wait', () => {
  expect(['draft', 'in-review', 'running', 'constructor', 'network-outage'].map(DisplayStateWordingUtil.isDisplayState)).toEqual([true, true, false, false, false]);
});

test('a job interrupted by a network outage or a lost supervision reads as its wait', () => {
  expect([DisplayStateWordingUtil.labelOf('network-outage'), DisplayStateWordingUtil.labelOf('not-supervised')]).toEqual(['Network outage', 'Not supervised']);
});
