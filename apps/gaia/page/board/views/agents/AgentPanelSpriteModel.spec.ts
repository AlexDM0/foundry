/**
 * What the agent panel habitat cues and copies (`docs/design/board.md`, "Flint in the agent panel: copy and cues"): the copy table's rows in
 * order, one-time intents, which job Flint copies, all agents idle, cues only from changes between payloads, and a launch answered once by
 * its `strike-spark`, neither greeted nor cued through the slots.
 */
import { describe, expect, test } from 'bun:test';

import type { SpriteIntent } from '../../../lib/flint/FlintInterface.ts';
import {
  AgentPanelSpriteModel,
  type AgentPanelFacts,
  type PanelConcurrency,
  type PanelJob
} from './AgentPanelSpriteModel.ts';

type JobChanges = Partial<Omit<PanelJob, 'id' | 'live'>> & { readonly silentSweeps?: number };

function job(id: string, changes: JobChanges = {}): PanelJob {
  const { silentSweeps = 0, ...fields } = changes;
  return {
    kind: 'build', state: 'running', crashResumes: 0, interruption: null, stopRequest: null, airlockPhase: null, ...fields, id, live: { silentSweeps }
  };
}

const NOTHING_SHOWN: ReadonlySet<string> = new Set();

function copyIntentOf(changes: JobChanges): SpriteIntent | null {
  return AgentPanelSpriteModel.copyIntentOf(job('J1', changes), NOTHING_SHOWN);
}

function concurrencyOf(limit: number, agentsInFlight: number, readyTicketIds: readonly string[] = [], heldTicketIds: readonly string[] = []): PanelConcurrency {
  return {
    limit, agentsInFlight, readyTicketIds, heldTicketIds
  };
}

function facts(changes: Partial<AgentPanelFacts> = {}): AgentPanelFacts {
  return {
    jobs: [], endedJobs: [], concurrency: null, ...changes
  };
}

describe('the copy intent', () => {
  test.each<readonly [string, JobChanges, SpriteIntent]>([
    ['interrupted for the usage limit', { state: 'interrupted', interruption: 'usage-limit' }, 'out-of-fuel'],
    ['silent for a sweep', { silentSweeps: 1 }, 'listen'],
    ['winding down', { stopRequest: 'wind-down' }, 'wind-down'],
    ['launching', { state: 'launching' }, 'strike-spark'],
    ['preparing', { state: 'preparing' }, 'fasten'],
    ['waiting for an answer', { state: 'waiting-for-answer' }, 'ask'],
    ['awaiting an answer', { state: 'awaiting-answer' }, 'ask'],
    ['in Customs', { state: 'in-customs' }, 'customs'],
    ['gating', { state: 'gating' }, 'gate-run'],
    ['merging in', { kind: 'merge', state: 'merging', airlockPhase: 'merge-in' }, 'merge'],
    ['resolving in the Airlock', { kind: 'merge', state: 'merging', airlockPhase: 'resolving' }, 'conflict'],
    ['gating in the Airlock', { kind: 'merge', state: 'merging', airlockPhase: 'gating' }, 'gate-run'],
    ['fixing in the Airlock', { kind: 'merge', state: 'merging', airlockPhase: 'fixing' }, 'type-busy'],
    ['landing in the Airlock', { kind: 'merge', state: 'merging', airlockPhase: 'landing' }, 'airlock'],
    ['in the state landing', { kind: 'merge', state: 'landing' }, 'airlock'],
    ['a running build', { kind: 'build' }, 'type'],
    ['a running review', { kind: 'review' }, 'review'],
    ['a running product owner', { kind: 'product-owner' }, 'interview'],
    ['a running pipeline agent', { kind: 'pipeline-agent' }, 'survey'],
    ['a running merge', { kind: 'merge' }, 'merge'],
    ['a running merge agent', { kind: 'merge-agent' }, 'merge'],
    ['a running refresh', { kind: 'refresh' }, 'fasten'],
    ['a running Assistant', { kind: 'assistant' }, 'research'],
  ])('a job %s is copied with its row\'s intent', (_description, changes, intent) => {
    expect(copyIntentOf(changes)).toBe(intent);
  });

  test.each<readonly [string, JobChanges, SpriteIntent]>([
    ['out of fuel wins over listen', { state: 'interrupted', interruption: 'usage-limit', silentSweeps: 2 }, 'out-of-fuel'],
    ['listen wins over wind-down', { silentSweeps: 1, stopRequest: 'wind-down' }, 'listen'],
    ['wind-down wins over every state', { state: 'launching', stopRequest: 'wind-down' }, 'wind-down'],
    ['a job state wins over its Airlock phase', { kind: 'merge', state: 'gating', airlockPhase: 'merge-in' }, 'gate-run'],
    ['an Airlock phase wins over the kind', { kind: 'merge', state: 'merging', airlockPhase: 'resolving' }, 'conflict'],
  ])('the first row that matches wins: %s', (_description, changes, intent) => {
    expect(copyIntentOf(changes)).toBe(intent);
  });

  test('only an interrupted job is out of fuel, since a resumed job keeps the cause of its last interruption', () => {
    expect(copyIntentOf({ state: 'running', interruption: 'usage-limit' })).toBe('type');
  });

  test('a job no row matches has nothing to copy', () => {
    expect(copyIntentOf({ state: 'interrupted', interruption: 'agent-crashed' })).toBeNull();
    expect(copyIntentOf({ state: 'stopping' })).toBeNull();
    expect(copyIntentOf({ kind: 'merge', state: 'merging' })).toBeNull();
    expect(copyIntentOf({ kind: 'constructor' })).toBeNull();
  });
});

describe('the one actions', () => {
  test('strike-spark shows one time for a job through its cue, then the next row that matches', () => {
    const launching = [job('J1', { state: 'launching' }), job('J2')];
    const first = AgentPanelSpriteModel.copyStepOf(launching, 'J1', NOTHING_SHOWN);
    expect([first.oneActionCue, first.copiedJob]).toEqual(['copied-job-launches', { jobId: 'J2', intent: 'type', oneActionCue: null }]);
    const second = AgentPanelSpriteModel.copyStepOf(launching, 'J1', first.shownOneActions);
    expect([second.oneActionCue, second.copiedJob?.jobId]).toEqual([null, 'J2']);
  });

  test('wind-down shows one time for a job through its cue, then the next row that matches', () => {
    const windingDown = [job('J1', { kind: 'review', stopRequest: 'wind-down' })];
    const first = AgentPanelSpriteModel.copyStepOf(windingDown, null, NOTHING_SHOWN);
    expect([first.oneActionCue, first.copiedJob]).toEqual(['copied-job-winds-down', { jobId: 'J1', intent: 'review', oneActionCue: null }]);
    const second = AgentPanelSpriteModel.copyStepOf(windingDown, null, first.shownOneActions);
    expect([second.oneActionCue, second.copiedJob?.intent]).toEqual([null, 'review']);
  });

  test('a one action is never handed to the copy: a second job\'s one action waits for the next payload', () => {
    const bothLaunch = [job('J1', { state: 'launching' }), job('J2', { state: 'launching' })];
    const first = AgentPanelSpriteModel.copyStepOf(bothLaunch, null, NOTHING_SHOWN);
    expect([first.oneActionCue, first.copiedJob]).toEqual(['copied-job-launches', null]);
    const second = AgentPanelSpriteModel.copyStepOf(bothLaunch, null, first.shownOneActions);
    expect([second.oneActionCue, second.copiedJob]).toEqual(['copied-job-launches', null]);
    expect(AgentPanelSpriteModel.copyStepOf(bothLaunch, null, second.shownOneActions).oneActionCue).toBeNull();
  });

  test('the one actions the view mounts with count as shown, so only a job that launches or winds down later cues one', () => {
    const mounted = [job('J1', { state: 'launching' }), job('J2', { stopRequest: 'wind-down' }), job('J3')];
    const shown = AgentPanelSpriteModel.oneActionsOf(mounted);
    expect([...shown]).toEqual(['J1 strike-spark', 'J2 wind-down']);
    expect(AgentPanelSpriteModel.copyStepOf(mounted, null, shown).oneActionCue).toBeNull();
    const launchedLater = [...mounted, job('J4', { state: 'launching' })];
    expect(AgentPanelSpriteModel.copyStepOf(launchedLater, 'J4', shown).oneActionCue).toBe('copied-job-launches');
  });

  test('a steady intent is copied, with no cue and nothing marked shown', () => {
    const step = AgentPanelSpriteModel.copyStepOf([job('J1')], null, NOTHING_SHOWN);
    expect([step.oneActionCue, step.copiedJob?.intent, step.shownOneActions]).toEqual([null, 'type', NOTHING_SHOWN]);
  });
});

describe('the copied job', () => {
  test('is the selected job while it has something to copy, else the first that has', () => {
    const jobs = [job('J1'), job('J2', { kind: 'review' })];
    expect(AgentPanelSpriteModel.copiedJobOf(jobs, 'J2', NOTHING_SHOWN)?.jobId).toBe('J2');
    expect(AgentPanelSpriteModel.copiedJobOf(jobs, null, NOTHING_SHOWN)?.jobId).toBe('J1');
    const selectedStops = [job('J1'), job('J2', { state: 'stopping' })];
    expect(AgentPanelSpriteModel.copiedJobOf(selectedStops, 'J2', NOTHING_SHOWN)?.jobId).toBe('J1');
  });

  test('is none while no job has something to copy', () => {
    expect(AgentPanelSpriteModel.copiedJobOf([job('J1', { state: 'stopping' })], null, NOTHING_SHOWN)).toBeNull();
    expect(AgentPanelSpriteModel.copiedJobOf([], null, NOTHING_SHOWN)).toBeNull();
  });
});

describe('the activity', () => {
  const serving = { state: 'serving', paused: false } as const;

  test('is agent-works while some agent has something to copy', () => {
    expect(AgentPanelSpriteModel.activityOccasionOf([job('J1', { state: 'stopping' }), job('J2', { state: 'gating' })], serving)?.cueName).toBe('agent-works');
  });

  test('is all-agents-idle only while no job works and Hephaestus serves unpaused', () => {
    expect(AgentPanelSpriteModel.activityOccasionOf([job('J1', { state: 'stopping' })], serving)?.cueName).toBe('all-agents-idle');
    expect(AgentPanelSpriteModel.activityOccasionOf([], { state: 'serving', paused: true })).toBeNull();
    expect(AgentPanelSpriteModel.activityOccasionOf([], { state: 'down', paused: false })).toBeNull();
  });
});

describe('the appeared jobs', () => {
  test('are the ids the previous jobs lacked, in their order', () => {
    expect(AgentPanelSpriteModel.appearedJobIdsOf(['J1', 'J2'], ['J3', 'J1', 'J4'])).toEqual(['J3', 'J4']);
    expect(AgentPanelSpriteModel.appearedJobIdsOf(['J1', 'J2'], ['J2'])).toEqual([]);
  });

  test('are greeted, but for a job that appears launching, whose strike-spark answers it', () => {
    const jobs = [job('J1'), job('J3', { state: 'launching' }), job('J4', { kind: 'product-owner' })];
    expect(AgentPanelSpriteModel.greetedJobIdsOf(['J1'], jobs)).toEqual(['J4']);
    expect(AgentPanelSpriteModel.greetedJobIdsOf(['J1'], [job('J1'), job('J3', { state: 'launching' })])).toEqual([]);
  });
});

describe('the change cues', () => {
  test.each<readonly [string, AgentPanelFacts, AgentPanelFacts, string]>([
    [
      'a job enters a red handoff',
      facts({ jobs: [job('J1', { state: 'in-customs' })] }),
      facts({ jobs: [job('J1', { state: 'interrupted', interruption: 'handoff-red' })] }),
      'gate-failed',
    ],
    [
      'a job\'s crash resumes go up',
      facts({ jobs: [job('J1', { crashResumes: 1 })] }),
      facts({ jobs: [job('J1', { crashResumes: 2 })] }),
      'job-resumed-after-crash',
    ],
    ['a job\'s stop request becomes stop', facts({ jobs: [job('J1')] }), facts({ jobs: [job('J1', { stopRequest: 'stop' })] }), 'job-stop-requested'],
    ['a job\'s stop request becomes fresh', facts({ jobs: [job('J1')] }), facts({ jobs: [job('J1', { stopRequest: 'fresh' })] }), 'job-fresh-requested'],
    ['a job ends landed', facts(), facts({ endedJobs: [{ id: 'J4', outcome: 'landed' }] }), 'job-landed'],
    ['a job ends integrated', facts(), facts({ endedJobs: [{ id: 'J4', outcome: 'integrated' }] }), 'job-landed'],
    [
      'an agent fills a slot below the limit',
      facts({ concurrency: concurrencyOf(3, 1) }),
      facts({ concurrency: concurrencyOf(3, 2) }),
      'slot-filled',
    ],
    [
      'every slot is taken while a ready ticket that is not held waits',
      facts({ concurrency: concurrencyOf(2, 1, ['7'], []) }),
      facts({ concurrency: concurrencyOf(2, 2, ['7', '8'], ['7']) }),
      'no-slot-free',
    ],
  ])('%s is cued', (_description, previous, current, cueName) => {
    expect(AgentPanelSpriteModel.changeCuesOf(previous, current)).toEqual([cueName]);
  });

  test.each<readonly [string, AgentPanelFacts, AgentPanelFacts]>([
    [
      'a red handoff that stays',
      facts({ jobs: [job('J1', { state: 'interrupted', interruption: 'handoff-red' })] }),
      facts({ jobs: [job('J1', { state: 'interrupted', interruption: 'handoff-red' })] }),
    ],
    [
      'a job resumed after its red handoff, which keeps the cause',
      facts({ jobs: [job('J1', { state: 'interrupted', interruption: 'handoff-red' })] }),
      facts({ jobs: [job('J1', { state: 'running', interruption: 'handoff-red' })] }),
    ],
    ['crash resumes that stay', facts({ jobs: [job('J1', { crashResumes: 1 })] }), facts({ jobs: [job('J1', { crashResumes: 1 })] })],
    ['a stop request that stays', facts({ jobs: [job('J1', { stopRequest: 'stop' })] }), facts({ jobs: [job('J1', { stopRequest: 'stop' })] })],
    ['a wind-down request, which the copy shows', facts({ jobs: [job('J1')] }), facts({ jobs: [job('J1', { stopRequest: 'wind-down' })] })],
    ['an ended job already known', facts({ endedJobs: [{ id: 'J4', outcome: 'landed' }] }), facts({ endedJobs: [{ id: 'J4', outcome: 'landed' }] })],
    ['a job that ends otherwise', facts(), facts({ endedJobs: [{ id: 'J4', outcome: 'built' }] })],
    [
      'an agent that takes the last slot',
      facts({ concurrency: concurrencyOf(2, 1) }),
      facts({ concurrency: concurrencyOf(2, 2) }),
    ],
    [
      'every slot taken while only a held ticket is ready',
      facts({ concurrency: concurrencyOf(2, 1, ['7'], ['7']) }),
      facts({ concurrency: concurrencyOf(2, 2, ['7'], ['7']) }),
    ],
    [
      'no free slot that stays',
      facts({ concurrency: concurrencyOf(2, 2, ['7']) }),
      facts({ concurrency: concurrencyOf(2, 2, ['7', '8']) }),
    ],
    ['a board that serves no concurrency', facts(), facts()],
    [
      'a slot that a launching job fills, which its strike-spark answers',
      facts({ jobs: [job('J1', { state: 'launching' })], concurrency: concurrencyOf(3, 1) }),
      facts({ jobs: [job('J1', { state: 'launching' })], concurrency: concurrencyOf(3, 2) }),
    ],
    [
      'the last slot that a launching job takes while a ready ticket waits',
      facts({ jobs: [job('J1', { state: 'launching' })], concurrency: concurrencyOf(2, 1, ['7']) }),
      facts({ jobs: [job('J1', { state: 'launching' })], concurrency: concurrencyOf(2, 2, ['7']) }),
    ],
  ])('%s is not cued', (_description, previous, current) => {
    expect(AgentPanelSpriteModel.changeCuesOf(previous, current)).toEqual([]);
  });

  test('several changes give each cue once, in the order of the table', () => {
    const previous = facts({ jobs: [job('J1'), job('J2')], concurrency: concurrencyOf(4, 1) });
    const current = facts({
      jobs:        [job('J1', { stopRequest: 'fresh' }), job('J2', { stopRequest: 'fresh' }), job('J3', { stopRequest: 'stop' })],
      endedJobs:   [{ id: 'J4', outcome: 'landed' }],
      concurrency: concurrencyOf(4, 2),
    });
    expect(AgentPanelSpriteModel.changeCuesOf(previous, current)).toEqual(['job-stop-requested', 'job-fresh-requested', 'job-landed', 'slot-filled']);
  });
});
