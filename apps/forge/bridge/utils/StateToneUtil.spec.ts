/**
 * The look of each display state. What matters: every state takes the tone and the shape flags of the design handoff's state table, so
 * the Bridge draws each state as that table does; an absent state has no tone; a dot, a pill and a tag take their parts of the look; a job state
 * looks like its nearest display state, an unknown one like a waiting ticket; and a ready ticket is the plain accent tone.
 */
import { describe, expect, test } from 'bun:test';

import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';
import { StateToneUtil }     from './StateToneUtil.ts';

const EVERY_DISPLAY_STATE: readonly DisplayState[] = [
  'draft', 'ready-for-review', 'committed', 'in-progress', 'paused', 'in-review', 'reviewing', 're-review', 'reviewed', 'delivered', 'abandoned',
];

describe('the look of a display state', () => {
  test('each state takes its tone', () => {
    expect(EVERY_DISPLAY_STATE.map(StateToneUtil.toneOf)).toEqual([
      'accent-outline', 'accent-outline', 'neutral', 'accent', 'neutral', 'info-outline', 'info', 'info-deep', 'success', 'ink', 'muted',
    ]);
  });

  test('work not yet started has a dashed edge and a dashed ring; work waiting for review a dashed edge and a ring', () => {
    const shapeOf = (state: DisplayState): readonly [string, boolean] => [StateToneUtil.lookOf(state).dotShape, StateToneUtil.lookOf(state).dashed];
    expect(EVERY_DISPLAY_STATE.map(shapeOf)).toEqual([
      ['dashed-ring', true],
      ['dashed-ring', true],
      ['dashed-ring', true],
      ['solid', false],
      ['solid', false],
      ['ring', true],
      ['solid', false],
      ['solid', false],
      ['solid', false],
      ['solid', false],
      ['ring', false],
    ]);
  });

  test('work under way pulses, delivered work is checked and abandoned work is struck, each alone', () => {
    const flaggedBy = (flag: 'pulsing' | 'checked' | 'struck'): DisplayState[] => EVERY_DISPLAY_STATE.filter((state) => StateToneUtil.lookOf(state)[flag]);
    expect([flaggedBy('pulsing'), flaggedBy('checked'), flaggedBy('struck')])
      .toEqual([['in-progress', 'reviewing', 're-review'], ['delivered'], ['abandoned']]);
  });

  test('an absent state has no tone, so its element reads the colours around it', () => {
    expect([StateToneUtil.optionalToneOf(null), StateToneUtil.optionalToneOf(undefined), StateToneUtil.optionalToneOf('paused')]).toEqual([undefined, undefined, 'neutral']);
  });

  test('the dot of a state is its tone and its dot shape', () => {
    expect([StateToneUtil.dotOf('committed'), StateToneUtil.dotOf('abandoned'), StateToneUtil.dotOf('reviewed')]).toEqual([
      { tone: 'neutral', shape: 'dashed-ring' }, { tone: 'muted', shape: 'ring' }, { tone: 'success', shape: 'solid' },
    ]);
  });
});

test('a state pill takes the dashed edge and the struck label of its state', () => {
  expect([StateToneUtil.pillLookOf('draft'), StateToneUtil.pillLookOf('abandoned'), StateToneUtil.pillLookOf('reviewed')])
    .toEqual([{ dashed: true, struck: false }, { dashed: false, struck: true }, { dashed: false, struck: false }]);
});

test('a state tag takes the state tone and the dot shape of its state', () => {
  expect(StateToneUtil.tagLookOf('in-review')).toEqual({ tone: 'state', stateTone: 'info-outline', dotShape: 'ring' });
});

describe('the look of a job state', () => {
  test('a job state looks like its nearest display state, and an unknown one like a waiting ticket', () => {
    expect(['running', 'gating', 'merging', 'interrupted', 'someday', 'constructor'].map((jobState) => StateToneUtil.lookOfJobState(jobState).tone))
      .toEqual(['accent', 'info-outline', 'success', 'neutral', 'neutral', 'neutral']);
    expect(StateToneUtil.lookOfJobState('launching')).toEqual(StateToneUtil.lookOf('committed'));
  });
});

test('a ready ticket is the plain accent tone', () => {
  expect(StateToneUtil.readyLook()).toEqual({
    tone: 'accent', dotShape: 'solid', dashed: false, struck: false, checked: false, pulsing: false
  });
});
