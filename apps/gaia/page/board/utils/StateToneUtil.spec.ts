/**
 * The look of each display state. What matters: every state takes the tone and the shape flags of the design handoff's state table, so
 * the board draws each state as that table does; an absent state has no tone; a dot, a pill and a tag take their parts of the look; a job
 * state looks like its nearest display state; and a ready ticket is the plain accent tone.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDisplayState, BoardJobState } from '../../@types/board/BoardVocabulary.ts';
import { StateToneUtil }                         from './StateToneUtil.ts';

const EVERY_DISPLAY_STATE: readonly BoardDisplayState[] = [
  'draft', 'ready-for-review', 'committed', 'in-progress', 'paused', 'in-review', 'reviewing', 're-review', 'reviewed', 'delivered', 'abandoned',
];

describe('the look of a display state', () => {
  test('each state takes its tone', () => {
    expect(EVERY_DISPLAY_STATE.map(StateToneUtil.toneOf)).toEqual([
      'accent-outline', 'accent-outline', 'neutral', 'accent', 'neutral', 'info-outline', 'info', 'info-deep', 'success', 'ink', 'muted',
    ]);
  });

  test('work not yet started has a dashed edge and a dashed ring; work waiting for review a dashed edge and a ring', () => {
    const shapeOf = (state: BoardDisplayState): readonly [string, boolean] => [StateToneUtil.lookOf(state).dotShape, StateToneUtil.lookOf(state).dashed];
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
    const flaggedBy = (flag: 'pulsing' | 'checked' | 'struck'): BoardDisplayState[] => EVERY_DISPLAY_STATE.filter((state) => StateToneUtil.lookOf(state)[flag]);
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
  test('a job state looks like its nearest display state', () => {
    const jobStates: readonly BoardJobState[] = ['running', 'gating', 'merging', 'interrupted'];
    expect(jobStates.map((jobState) => StateToneUtil.lookOfJobState(jobState).tone)).toEqual(['accent', 'info-outline', 'success', 'neutral']);
    expect(StateToneUtil.lookOfJobState('launching')).toEqual(StateToneUtil.lookOf('committed'));
  });
});

describe('the look of an interrupted job that waits', () => {
  test('a network outage and a lost supervision each wait, dashed in the neutral tone, never the failure tone', () => {
    const waiting = (['network-outage', 'lease-ended'] as const).map((interruption) => StateToneUtil.lookOfJob({ state: 'interrupted', interruption }));
    expect(waiting.map((look) => [look.tone, look.dotShape, look.dashed])).toEqual([['neutral', 'dashed-ring', true], ['neutral', 'dashed-ring', true]]);
    expect(waiting.some((look) => look.tone === 'error')).toBe(false);
  });

  test('a job interrupted by another cause, and one resumed after an outage, look as their job state', () => {
    expect(StateToneUtil.lookOfJob({ state: 'interrupted', interruption: 'agent-crashed' })).toEqual(StateToneUtil.lookOf('paused'));
    expect(StateToneUtil.lookOfJob({ state: 'running', interruption: 'network-outage' })).toEqual(StateToneUtil.lookOf('in-progress'));
  });
});

test('a ready ticket is the plain accent tone', () => {
  expect(StateToneUtil.readyLook()).toEqual({
    tone: 'accent', dotShape: 'solid', dashed: false, struck: false, checked: false, pulsing: false
  });
});
