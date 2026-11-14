/**
 * What the agent panel habitat cues and copies. What matters: Flint copies the selected job while it works, else the first job that works;
 * each kind of work has its gesture, and a job of a kind with none, or one not working, is never copied; the activity is `agent-works`
 * while some agent runs or merges and `all-agents-idle` otherwise; and an appeared job is one the previous jobs lacked.
 */
import { describe, expect, test } from 'bun:test';

import type { SpriteIntent }     from '../../../flint/SpriteHabitat.ts';
import { AgentPanelSpriteModel } from './AgentPanelSpriteModel.ts';

function job(id: string, kind: string, state: string): { readonly id: string; readonly kind: string; readonly state: string } {
  return { id, kind, state };
}

describe('the copied job', () => {
  test('is the selected job while it works, else the first that works', () => {
    const jobs = [job('J1', 'build', 'running'), job('J2', 'review', 'running')];
    expect(AgentPanelSpriteModel.copiedJobOf(jobs, 'J2')).toEqual({ jobId: 'J2', intent: 'review' });
    expect(AgentPanelSpriteModel.copiedJobOf(jobs, null)).toEqual({ jobId: 'J1', intent: 'type' });
    expect(AgentPanelSpriteModel.copiedJobOf([job('J1', 'build', 'running'), job('J2', 'review', 'gating')], 'J2')).toEqual({ jobId: 'J1', intent: 'type' });
  });

  test.each<readonly [string, SpriteIntent]>([
    ['build', 'type'],
    ['review', 'review'],
    ['product-owner', 'make-ticket'],
    ['merge', 'merge'],
    ['merge-agent', 'merge'],
    ['refresh', 'fasten'],
    ['onboarder', 'research'],
    ['assistant', 'research'],
  ])('a %s job is copied with %s', (kind, intent) => {
    expect(AgentPanelSpriteModel.copiedJobOf([job('J1', kind, 'running')], null)?.intent).toBe(intent);
  });

  test('a merge is copied while it merges', () => {
    expect(AgentPanelSpriteModel.copiedJobOf([job('J1', 'merge', 'merging')], null)?.intent).toBe('merge');
  });

  test('no job is copied while none works, nor one of a kind with no gesture', () => {
    expect(AgentPanelSpriteModel.copiedJobOf([job('J1', 'build', 'launching'), job('J2', 'review', 'waiting-for-answer')], null)).toBeNull();
    expect(AgentPanelSpriteModel.copiedJobOf([job('J1', 'constructor', 'running')], null)).toBeNull();
  });
});

describe('the activity', () => {
  test('is agent-works while some agent works, and all-agents-idle otherwise', () => {
    expect(AgentPanelSpriteModel.activityOccasionOf([job('J1', 'build', 'gating'), job('J2', 'review', 'running')]).cueName).toBe('agent-works');
    expect(AgentPanelSpriteModel.activityOccasionOf([job('J1', 'build', 'gating')]).cueName).toBe('all-agents-idle');
    expect(AgentPanelSpriteModel.activityOccasionOf([]).cueName).toBe('all-agents-idle');
  });
});

describe('the appeared jobs', () => {
  test('are the ids the previous jobs lacked, in their order', () => {
    expect(AgentPanelSpriteModel.appearedJobIdsOf(['J1', 'J2'], ['J3', 'J1', 'J4'])).toEqual(['J3', 'J4']);
    expect(AgentPanelSpriteModel.appearedJobIdsOf(['J1', 'J2'], ['J2'])).toEqual([]);
  });
});
