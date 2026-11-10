/**
 * The roving focus's key moves, against its own contract. What matters: the left and right arrows step and wrap at both ends; Home and End
 * go to the ends; the up and down arrows move only in a group on both axes; any other key does not move; and a group of one stays put.
 */
import { describe, expect, test } from 'bun:test';

import { RovingFocusUtil } from './RovingFocusUtil.ts';

const GROUP_SIZE = 4;
const LAST_INDEX = GROUP_SIZE - 1;

describe('the index a key moves to', () => {
  test('the right and left arrows step one and wrap at both ends', () => {
    expect([
      RovingFocusUtil.targetIndexOf('ArrowRight', 1, GROUP_SIZE, 'horizontal'),
      RovingFocusUtil.targetIndexOf('ArrowRight', LAST_INDEX, GROUP_SIZE, 'horizontal'),
      RovingFocusUtil.targetIndexOf('ArrowLeft', 1, GROUP_SIZE, 'horizontal'),
      RovingFocusUtil.targetIndexOf('ArrowLeft', 0, GROUP_SIZE, 'horizontal'),
    ]).toEqual([2, 0, 0, LAST_INDEX]);
  });

  test('Home and End go to the ends on either axis', () => {
    expect([
      RovingFocusUtil.targetIndexOf('Home', 2, GROUP_SIZE, 'horizontal'),
      RovingFocusUtil.targetIndexOf('End', 1, GROUP_SIZE, 'both'),
    ]).toEqual([0, LAST_INDEX]);
  });

  test('the up and down arrows move only in a group on both axes', () => {
    expect([
      RovingFocusUtil.targetIndexOf('ArrowDown', 1, GROUP_SIZE, 'both'),
      RovingFocusUtil.targetIndexOf('ArrowUp', 0, GROUP_SIZE, 'both'),
      RovingFocusUtil.targetIndexOf('ArrowDown', 1, GROUP_SIZE, 'horizontal'),
      RovingFocusUtil.targetIndexOf('ArrowUp', 1, GROUP_SIZE, 'horizontal'),
    ]).toEqual([2, LAST_INDEX, null, null]);
  });

  test('any other key does not move', () => {
    expect(['Enter', 'Tab', 'a', ' '].map((key) => RovingFocusUtil.targetIndexOf(key, 1, GROUP_SIZE, 'both'))).toEqual([null, null, null, null]);
  });

  test('a group of one stays on its one member', () => {
    expect(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].map((key) => RovingFocusUtil.targetIndexOf(key, 0, 1, 'both'))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('whether a key moves at all', () => {
  test('the arrows of the axis, Home and End move; the other arrows and keys do not', () => {
    expect(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'Enter'].map((key) => RovingFocusUtil.isRovingKey(key, 'horizontal')))
      .toEqual([true, true, true, true, false, false, false]);
    expect(['ArrowUp', 'ArrowDown', 'Escape'].map((key) => RovingFocusUtil.isRovingKey(key, 'both'))).toEqual([true, true, false]);
  });
});
