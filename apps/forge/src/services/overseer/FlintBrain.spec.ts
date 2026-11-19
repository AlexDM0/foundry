/**
 * Flint's brain over the fake agent's adapter, a session host that plays recorded `claude` lines, and timers fired by hand, so no case waits.
 * What matters: each refusal leaves a running brain alone and otherwise shows for a while; an ask reaches the session only while it runs,
 * once an interval and only on a change; an answer off the digest's moves is refused, so the rule director goes on; every end (its time,
 * a stop, the usage limit, a crashed session, the Overseer's stop) is logged once with the run's tokens and calls; and the ended state
 * reads `off` after its time.
 */
import { describe, expect, test } from 'bun:test';

import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

import type { AgentLaunchPlan }                    from '../../lib/agent-launch/AgentLaunchPlan.ts';
import {
  FLINT_BRAIN_ANSWER_TIMEOUT_MILLISECONDS,
  FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS,
  FLINT_BRAIN_ENDED_STATE_KEPT_MILLISECONDS,
  FLINT_BRAIN_MAXIMUM_RUN_MILLISECONDS,
  FLINT_BRAIN_RECENT_MOVES_LIMIT,
  FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS
} from '../../shared/constants/OverseerLimits.ts';
import {
  fakeAgentAdapter,
  fakeAssistantTurnLine,
  fakeRateLimitedResultLine,
  fakeResultLine,
  fakeStartedLine
} from '../../testing/FakeAgentAdapter.ts';
import { TokenCrediting }                                                                 from '../lifecycle/TokenCrediting.ts';
import type { FlintBrainEndedRun }                                                        from './@types/FlintBrainRun.ts';
import { type FlintBrain, type FlintBrainOptions, createFlintBrain }                      from './FlintBrain.ts';
import type { FlintBrainLaunchFacts, FlintBrainSessionPlace }                             from './FlintBrainProfile.ts';
import type { FlintBrainLaunchOutcome, FlintBrainSessionHost, FlintBrainSessionStanding } from './FlintBrainSessionHost.ts';
import type { FlintBrainDigest }                                                          from './utils/FlintBrainDigestUtil.ts';

const STARTED_AT = Date.parse('2026-11-16T10:00:00.000Z');
const SESSION_RUN = 7;
const RESET_TIME = '2026-11-16T14:05:00.000Z';

interface ManualTimer {
  readonly dueAt:    number;
  readonly callback: () => void;
}

/** Timers and a clock a case moves by hand: `advance` fires every timer due by then, in order, each at its own time. */
function manualClock() {
  let currentMilliseconds = STARTED_AT;
  const pending = new Set<ManualTimer>();
  return {
    now:    () => new Date(currentMilliseconds),
    timers: {
      setTimeout: (callback: () => void, delayMilliseconds: number): unknown => {
        const timer = { dueAt: currentMilliseconds + delayMilliseconds, callback };
        pending.add(timer);
        return timer;
      },
      clearTimeout: (handle: unknown): void => {
        pending.delete(handle as ManualTimer);
      },
    },
    async advance(milliseconds: number): Promise<void> {
      const target = currentMilliseconds + milliseconds;
      for (;;) {
        const next = [...pending].filter((timer) => timer.dueAt <= target).sort((a, b) => a.dueAt - b.dueAt)[0];
        if (next === undefined) break;
        pending.delete(next);
        currentMilliseconds = next.dueAt;
        next.callback();
        await settled();
      }
      currentMilliseconds = target;
      await settled();
    },
  };
}

/** Lets the promise chains a fired timer started run to their end. */
async function settled(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** A session host that plays the lines a case gives it, as Talos would log them, and keeps what the engine asked of it. */
function playedSessionHost() {
  const printedLines: string[] = [];
  const state = {
    standing:         'starting' as FlintBrainSessionStanding,
    launchOutcome:    { verdict: 'launched', run: SESSION_RUN } as FlintBrainLaunchOutcome,
    takesLines:       true,
    plans:            [] as AgentLaunchPlan[],
    writtenLines:     [] as string[],
    stoppedRuns:      [] as number[],
    acknowledgedRuns: [] as number[],
  };
  const host: FlintBrainSessionHost = {
    launch: async (planOf) => {
      if (state.launchOutcome.verdict === 'launched') {
        const place: FlintBrainSessionPlace = { run: state.launchOutcome.run, workingDirectory: '/scratch/flint-brain/session', jobFilesDirectory: '/scratch/flint-brain/run-7' };
        state.plans.push(planOf(place));
      }
      return await Promise.resolve(state.launchOutcome);
    },
    linesAfter: (_run, afterSequence) => ({ lines: printedLines.slice(afterSequence), lastSequence: printedLines.length }),
    standingOf: () => state.standing,
    write:      async (_run, line) => {
      if (state.takesLines) state.writtenLines.push(line);
      return await Promise.resolve(state.takesLines);
    },
    stop: async (run) => {
      state.stoppedRuns.push(run);
      await Promise.resolve();
    },
    acknowledgeEnd: async (run) => {
      state.acknowledgedRuns.push(run);
      return await Promise.resolve(true);
    },
  };
  return { host, state, print: (...lines: string[]) => printedLines.push(...lines) };
}

const LAUNCH_FACTS: FlintBrainLaunchFacts = {
  platformPorts: {
    executableResolver: { absolutePathOf: () => ({ verdict: 'found', path: '/usr/local/bin/claude' }) },
    launchEnvironment:  { launchEnvironmentOf: () => ({}), searchFoldersOf: () => [], inheritedVariableNames: [] },
    gateConfinement:    { availability: () => ({ verdict: 'confined', mechanism: 'sandbox-exec' }), workerConfinement: () => 'confined', confinedArgvOf: (_plan, argv) => argv },
  },
  inheritedEnvironment:   {},
  repositoryRoot:         '/scratch/repository',
  trackerId:              'tracker-example',
  homeDirectory:          '/scratch/home',
  brainIsWithheld:        false,
  maximumRunMilliseconds: FLINT_BRAIN_MAXIMUM_RUN_MILLISECONDS,
};

const DIGEST: FlintBrainDigest = {
  habitatKind:       'chat',
  description:       'The chat with the Assistant.',
  suggestions:       [{ when: 'agent-is-writing', respond: 'type', note: 'copy the writer' }],
  recentCues:        ['idle'],
  newCues:           [],
  content:           { facts: { agentsRunning: 2 }, excerpt: 'Alex Example: is the gate green?' },
  lastIntent:        null,
  isAsleep:          false,
  visitTargetKind:   null,
  copyIsOffered:     false,
  quietMilliseconds: 4000,
  intents:           ['wander', 'wave', 'type', 'happy', 'doubt'],
  emotes:            ['happy', 'doubt'],
};

interface Harness {
  readonly brain:     FlintBrain;
  readonly clock:     ReturnType<typeof manualClock>;
  readonly session:   ReturnType<typeof playedSessionHost>;
  readonly readings:  (MonitorFlintBrainDocument | null)[];
  readonly endedRuns: FlintBrainEndedRun[];
  readonly world:     { paused: boolean; resetsAt: string | null };
}

function harness(overrides: Partial<FlintBrainOptions> = {}): Harness {
  const clock = manualClock();
  const session = playedSessionHost();
  const readings: (MonitorFlintBrainDocument | null)[] = [];
  const endedRuns: FlintBrainEndedRun[] = [];
  const world = { paused: false, resetsAt: null as string | null };
  const brain = createFlintBrain({
    adapter:          fakeAgentAdapter(),
    launchFacts:      LAUNCH_FACTS,
    sessionHost:      session.host,
    timers:           clock.timers,
    now:              clock.now,
    overseerIsPaused: () => world.paused,
    usageLimitHolds:  () => world.resetsAt,
    onChange:         (reading) => readings.push(reading),
    onEnded:          (run) => endedRuns.push(run),
    ...overrides,
  });
  return {
    brain, clock, session, readings, endedRuns, world
  };
}

async function runningHarness(overrides: Partial<FlintBrainOptions> = {}): Promise<Harness> {
  const running = harness(overrides);
  expect(await running.brain.start('bridge')).toEqual({ verdict: 'done' });
  running.session.state.standing = 'running';
  await running.clock.advance(FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
  expect(running.brain.reading()?.state).toBe('running');
  return running;
}

/** One answered turn as the real session prints it: a model call, then the result carrying the structured answer. */
function printAnswer(running: Harness, turn: number, answer: unknown): void {
  if (turn === 1) running.session.print(fakeStartedLine('session-example'));
  running.session.print(fakeAssistantTurnLine(`msg_example_${turn}`), fakeResultLine(answer));
}

async function answeredAsk(running: Harness, turn: number, answer: unknown, digest: FlintBrainDigest = { ...DIGEST, newCues: [`cue-${turn}`] }) {
  const asked = running.brain.ask(digest);
  await settled();
  printAnswer(running, turn, answer);
  await running.clock.advance(FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
  return await asked;
}

function expectedSumsOf(turnCount: number): { tokens: number; calls: number } {
  const adapter = fakeAgentAdapter();
  const turns = Array.from({ length: turnCount }, (_unused, index) => adapter.eventsOf(fakeAssistantTurnLine(`msg_example_${index + 1}`)))
    .flat()
    .flatMap((event) => (event.kind === 'assistant-turn' ? [{ messageId: event.messageId, parentToolUseId: event.parentToolUseId, usage: event.usage }] : []));
  const { topLevel, total } = TokenCrediting.sessionTokensOf(turns);
  return { tokens: total.inputTokens + total.cacheCreationInputTokens + total.cacheReadInputTokens + total.outputTokens, calls: topLevel.calls };
}

describe('starting the brain', () => {
  test('starts a confined Haiku session at low effort, no job, and reads running once its session runs', async () => {
    const running = harness();
    expect(await running.brain.start('api')).toEqual({ verdict: 'done' });
    expect(running.brain.reading()).toMatchObject({
      state:     'starting',
      startedAt: '2026-11-16T10:00:00.000Z',
      endsAt:    '2026-11-16T10:02:00.000Z',
      startedBy: 'api',
      model:     'haiku',
      effort:    'low',
      tokens:    0,
      calls:     0,
      refusal:   null,
    });
    expect(running.session.state.plans).toHaveLength(1);
    running.session.state.standing = 'running';
    await running.clock.advance(FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    expect(running.readings.map((reading) => reading?.state)).toEqual(['starting', 'running']);
  });

  test('refuses a second start while it runs and leaves the running brain as it was', async () => {
    const running = await runningHarness();
    const verdict = await running.brain.start('api');
    expect(verdict).toMatchObject({ verdict: 'refused', refusal: { code: 'brain-already-running' } });
    expect(running.brain.reading()).toMatchObject({ state: 'running', startedBy: 'bridge', refusal: null });
    expect(running.session.state.plans).toHaveLength(1);
  });

  test('refuses while the Overseer is paused, and shows the refusal with the forge\'s sentence', async () => {
    const running = harness();
    running.world.paused = true;
    const verdict = await running.brain.start('bridge');
    expect(verdict).toMatchObject({ verdict: 'refused', refusal: { code: 'overseer-paused' } });
    expect(running.brain.reading()).toMatchObject({ state: 'refused', refusal: { code: 'overseer-paused' } });
    expect(running.brain.reading()?.refusal?.sentence).toBe(running.brain.reading()?.sentence ?? '');
    expect(running.session.state.plans).toEqual([]);
  });

  test('refuses while the usage limit holds, naming its reset time', async () => {
    const running = harness();
    running.world.resetsAt = RESET_TIME;
    const verdict = await running.brain.start('bridge');
    expect(verdict).toMatchObject({ verdict: 'refused', refusal: { code: 'usage-limit-holds', resetsAt: RESET_TIME } });
    expect(running.brain.reading()?.refusal?.sentence).toContain(RESET_TIME);
  });

  test('refuses brain-failed-to-start when its session cannot launch', async () => {
    const running = harness();
    running.session.state.launchOutcome = { verdict: 'refused', reason: 'the endpoint does not fit' };
    expect(await running.brain.start('bridge')).toMatchObject({ verdict: 'refused', refusal: { code: 'brain-failed-to-start' } });
    expect(running.brain.reading()).toMatchObject({ state: 'refused', startedAt: null, refusal: { code: 'brain-failed-to-start' } });
  });

  test('refuses brain-failed-to-start when its session ends before it runs, and logs no run', async () => {
    const running = harness();
    await running.brain.start('bridge');
    running.session.state.standing = 'ended';
    await running.clock.advance(FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    expect(running.brain.reading()).toMatchObject({ state: 'refused', refusal: { code: 'brain-failed-to-start' } });
    expect(running.endedRuns).toEqual([]);
  });

  test('refuses no-flint with no reading where the brain cannot run confined, and under the test setting', async () => {
    const gateConfinement = { ...LAUNCH_FACTS.platformPorts.gateConfinement, workerConfinement: () => 'unconfined-by-design' as const };
    const unconfined = harness({ launchFacts: { ...LAUNCH_FACTS, platformPorts: { ...LAUNCH_FACTS.platformPorts, gateConfinement } } });
    const withheld = harness({ launchFacts: { ...LAUNCH_FACTS, brainIsWithheld: true } });
    for (const forge of [unconfined, withheld]) {
      expect(await forge.brain.start('api')).toMatchObject({ verdict: 'refused', refusal: { code: 'no-flint' } });
      expect(forge.brain.reading()).toBeNull();
      expect(forge.session.state.plans).toEqual([]);
    }
  });

  test('refuses a stop while no brain runs, and leaves the reading as it was', async () => {
    const running = harness();
    expect(await running.brain.stop()).toMatchObject({ verdict: 'refused', refusal: { code: 'brain-not-running' } });
    expect(running.brain.reading()?.state).toBe('off');
  });
});

describe('asking the brain', () => {
  test('sends the digest as one turn and answers the move it chose, newest first in its recent moves', async () => {
    const running = await runningHarness();
    const answer = await answeredAsk(running, 1, { intent: 'wave', emote: 'happy' });
    expect(answer).toEqual({ kind: 'answered', intent: 'wave', emote: 'happy' });
    expect(running.session.state.writtenLines).toHaveLength(1);
    expect(running.session.state.writtenLines[0]).toContain('Moves: wander, wave, type, happy, doubt');
    expect(running.brain.reading()?.recentMoves).toEqual([{ at: '2026-11-16T10:00:00.500Z', intent: 'wave', emote: 'happy' }]);
  });

  test('refuses an answer off the digest\'s moves, so the rule director goes on, and records no move', async () => {
    const running = await runningHarness();
    expect(await answeredAsk(running, 1, { intent: 'delete-the-board', emote: null })).toEqual({ kind: 'not-asked', reason: 'off-list-answer' });
    expect(await running.brain.ask({ ...DIGEST, newCues: ['later'] })).toEqual({ kind: 'not-asked', reason: 'too-soon' });
    await running.clock.advance(FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS);
    expect(await answeredAsk(running, 2, { intent: 'wave', emote: 'furious' })).toEqual({ kind: 'not-asked', reason: 'off-list-answer' });
    expect(running.brain.reading()?.recentMoves).toEqual([]);
  });

  test('asks at most once an interval, and then only when the content or the cues changed', async () => {
    const running = await runningHarness();
    const steady = { ...DIGEST, newCues: [] };
    expect(await answeredAsk(running, 1, { intent: 'wave', emote: null }, steady)).toMatchObject({ kind: 'answered' });
    expect(await running.brain.ask({ ...steady, content: { facts: { agentsRunning: 3 } } })).toEqual({ kind: 'not-asked', reason: 'too-soon' });
    await running.clock.advance(FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS);
    expect(await running.brain.ask({ ...steady, lastIntent: 'wave', quietMilliseconds: 9000 })).toEqual({ kind: 'not-asked', reason: 'unchanged' });
    expect(running.session.state.writtenLines).toHaveLength(1);
    expect(await answeredAsk(running, 2, { intent: 'type', emote: null }, { ...steady, content: { facts: { agentsRunning: 3 } } })).toMatchObject({ kind: 'answered' });
    await running.clock.advance(FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS);
    const newCue = { ...steady, content: { facts: { agentsRunning: 3 } }, newCues: ['idle'] };
    expect(await answeredAsk(running, 3, { intent: 'wander', emote: null }, newCue)).toMatchObject({ kind: 'answered' });
    expect(running.session.state.writtenLines).toHaveLength(3);
  });

  test('makes no call while nobody asks, while Flint sleeps or while an earlier turn has no answer yet', async () => {
    const running = await runningHarness();
    await running.clock.advance(FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS * 4);
    expect(await running.brain.ask({ ...DIGEST, isAsleep: true })).toEqual({ kind: 'not-asked', reason: 'asleep' });
    const unanswered = running.brain.ask(DIGEST);
    await settled();
    expect(await running.brain.ask({ ...DIGEST, newCues: ['idle'] })).toEqual({ kind: 'not-asked', reason: 'busy' });
    await running.clock.advance(FLINT_BRAIN_ANSWER_TIMEOUT_MILLISECONDS);
    expect(await unanswered).toEqual({ kind: 'not-asked', reason: 'no-answer' });
    expect(await running.brain.ask({ ...DIGEST, newCues: ['later'] })).toEqual({ kind: 'not-asked', reason: 'busy' });
    expect(running.session.state.writtenLines).toHaveLength(1);
  });

  test('answers not-running before a start and while the session is still starting', async () => {
    const running = harness();
    expect(await running.brain.ask(DIGEST)).toEqual({ kind: 'not-asked', reason: 'not-running' });
    await running.brain.start('bridge');
    expect(await running.brain.ask(DIGEST)).toEqual({ kind: 'not-asked', reason: 'not-running' });
    expect(running.session.state.writtenLines).toEqual([]);
  });

  test('answers not-taken when the session did not take the line, and keeps the interval free for the next ask', async () => {
    const running = await runningHarness();
    running.session.state.takesLines = false;
    expect(await running.brain.ask(DIGEST)).toEqual({ kind: 'not-asked', reason: 'not-taken' });
    running.session.state.takesLines = true;
    expect(await answeredAsk(running, 1, { intent: 'wave', emote: null }, DIGEST)).toMatchObject({ kind: 'answered' });
  });

  test('keeps at most five recent moves, newest first', async () => {
    const running = await runningHarness();
    const intents = ['wander', 'wave', 'type', 'happy', 'doubt', 'wave'];
    for (const [index, intent] of intents.entries()) {
      expect(await answeredAsk(running, index + 1, { intent, emote: null })).toMatchObject({ kind: 'answered', intent });
      await running.clock.advance(FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS);
    }
    const recentMoves = running.brain.reading()?.recentMoves ?? [];
    expect(recentMoves).toHaveLength(FLINT_BRAIN_RECENT_MOVES_LIMIT);
    expect(recentMoves.map((move) => move.intent)).toEqual(['wave', 'doubt', 'happy', 'type', 'wave']);
    expect(Date.parse(recentMoves[0]?.at ?? '')).toBeGreaterThan(Date.parse(recentMoves[1]?.at ?? ''));
  });
});

describe('ending the brain', () => {
  test('ends at its maximum time, logs the run with its tokens and calls, and stops and acknowledges its session', async () => {
    const running = await runningHarness();
    await answeredAsk(running, 1, { intent: 'wave', emote: null });
    await running.clock.advance(FLINT_BRAIN_ASK_INTERVAL_MILLISECONDS);
    await answeredAsk(running, 2, { intent: 'type', emote: null });
    await running.clock.advance(FLINT_BRAIN_MAXIMUM_RUN_MILLISECONDS);
    const sums = expectedSumsOf(2);
    expect(sums.calls).toBe(2);
    expect(running.endedRuns).toEqual([{
      startedBy: 'bridge', startedAt: '2026-11-16T10:00:00.000Z', endedAt: '2026-11-16T10:02:00.000Z', endedReason: 'time', ...sums
    }]);
    expect(running.brain.reading()).toMatchObject({
      state: 'ended', endedReason: 'time', endedAt: '2026-11-16T10:02:00.000Z', ...sums
    });
    expect(running.brain.reading()?.sentence).toContain('2:00');
    expect(running.session.state.stoppedRuns).toEqual([SESSION_RUN]);
    expect(running.session.state.acknowledgedRuns).toEqual([SESSION_RUN]);
  });

  test('ends stopped on a stop, and an ask after it is not asked', async () => {
    const running = await runningHarness();
    expect(await running.brain.stop()).toEqual({ verdict: 'done' });
    expect(running.endedRuns.map((run) => run.endedReason)).toEqual(['stopped']);
    expect(await running.brain.ask(DIGEST)).toEqual({ kind: 'not-asked', reason: 'not-running' });
  });

  test('ends usage-limit when the marker holds while it runs, and when its own session is refused', async () => {
    const markerHolds = await runningHarness();
    markerHolds.world.resetsAt = RESET_TIME;
    await markerHolds.clock.advance(FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    expect(markerHolds.endedRuns.map((run) => run.endedReason)).toEqual(['usage-limit']);
    const sessionRefused = await runningHarness();
    const asked = sessionRefused.brain.ask(DIGEST);
    await settled();
    sessionRefused.session.print(fakeRateLimitedResultLine());
    await sessionRefused.clock.advance(FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    expect(await asked).toEqual({ kind: 'not-asked', reason: 'ended' });
    expect(sessionRefused.endedRuns.map((run) => run.endedReason)).toEqual(['usage-limit']);
  });

  test('ends failed when its session crashes, and stops nothing', async () => {
    const running = await runningHarness();
    running.session.state.standing = 'ended';
    await running.clock.advance(FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    expect(running.endedRuns.map((run) => run.endedReason)).toEqual(['failed']);
    expect(running.session.state.stoppedRuns).toEqual([]);
    expect(running.brain.reading()?.state).toBe('ended');
  });

  test('ends stopped at the Overseer\'s stop, and a start after it is refused', async () => {
    const running = await runningHarness();
    await running.brain.close();
    expect(running.endedRuns.map((run) => run.endedReason)).toEqual(['stopped']);
    expect(running.session.state.stoppedRuns).toEqual([SESSION_RUN]);
    expect(await running.brain.start('bridge')).toMatchObject({ verdict: 'refused', refusal: { code: 'brain-failed-to-start' } });
  });

  test('keeps an ended run for its time, then reads off; a start before then replaces it at once', async () => {
    const kept = await runningHarness();
    await kept.brain.stop();
    await kept.clock.advance(FLINT_BRAIN_ENDED_STATE_KEPT_MILLISECONDS - 1);
    expect(kept.brain.reading()?.state).toBe('ended');
    await kept.clock.advance(1);
    expect(kept.brain.reading()).toMatchObject({
      state: 'off', startedAt: null, tokens: null, recentMoves: []
    });
    const replaced = await runningHarness();
    await replaced.brain.stop();
    expect(await replaced.brain.start('api')).toEqual({ verdict: 'done' });
    expect(replaced.brain.reading()).toMatchObject({ state: 'starting', startedBy: 'api', endedReason: null });
    await replaced.clock.advance(FLINT_BRAIN_ENDED_STATE_KEPT_MILLISECONDS);
    expect(replaced.brain.reading()?.state).not.toBe('off');
  });

  test('keeps a refusal for its time, then reads off', async () => {
    const running = harness();
    running.world.paused = true;
    await running.brain.start('bridge');
    await running.clock.advance(FLINT_BRAIN_ENDED_STATE_KEPT_MILLISECONDS);
    expect(running.brain.reading()?.state).toBe('off');
    expect(running.readings.map((reading) => reading?.state)).toEqual(['refused', 'off']);
  });
});
