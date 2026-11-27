/**
 * The gate profile moves on a Board. What matters: a press queues one gate in one phase, and a second press while that gate and phase have
 * a run queued or running refuses `gate-profile-running`; a run keeps each prepare step's folder, so it prepares where the pipeline does;
 * only the newest run of a gate and phase is kept, of an entity's gate and phase on a forge over entities, and run ids are never reused; a
 * run ends with its duration and what its gate reported of its cache, except one User asked to stop, which ends `stopped` with neither; a
 * Stop ends a queued run at once and only marks a running one; a Hephaestus start stops a run left running and leaves a queued one queued;
 * and a malformed file refuses every move and is never written over.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture }            from '../../testing/BoardFixtures.ts';
import type { GateProfileRequest } from './@types/GateProfile.ts';
import { BoardRefusal }            from './BoardRefusal.ts';

const AT = '2026-11-12T10:00:00+01:00';

function request(overrides: Partial<GateProfileRequest> = {}): GateProfileRequest {
  return {
    setupId: 'S1', phase: 'build', gate: { name: 'tests', run: 'bun test' }, prepare: [{ name: 'install', run: 'bun install' }], ...overrides
  };
}

function refusalOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BoardRefusal) return error.detail;
    throw error;
  }
  throw new Error('the move was not refused');
}

describe('a press', () => {
  test('queues the gate in the phase as P1, logged with its gate, phase and setup, and the hold writes the runs', () => {
    const { board, records } = boardFixture();
    expect(board.gateProfilesWrite()).toEqual({ write: 'unchanged' });

    const { run } = board.queueGateProfile(request(), AT);

    expect(run).toMatchObject({
      profileRunId: 'P1', setupId: 'S1', phase: 'build', state: 'queued', stopRequested: false, elapsedMilliseconds: null
    });
    expect(records.map((record) => record.kind)).toEqual(['gate-profile-requested']);
    expect(board.gateProfilesWrite()).toMatchObject({ write: 'profiles', profiles: { nextRunNumber: 2 } });
  });

  test('keeps each prepare step\'s folder, and leaves a step with none without one', () => {
    const { board } = boardFixture();

    const { run } = board.queueGateProfile(request({ prepare: [{ name: 'install', run: 'bun install', in: '/' }, { name: 'build', run: 'bun run build' }] }), AT);

    expect(run.prepare).toEqual([{ name: 'install', run: 'bun install', in: '/' }, { name: 'build', run: 'bun run build' }]);
  });

  test('refuses gate-profile-running while that gate and phase have a run queued or running, and takes another phase', () => {
    const { board } = boardFixture();
    board.queueGateProfile(request(), AT);

    expect(refusalOf(() => board.queueGateProfile(request(), AT))).toEqual({
      reason: 'gate-profile-running', gateName: 'tests', phase: 'build', profileRunId: 'P1'
    });
    board.markGateProfileRunning('P1');
    expect(refusalOf(() => board.queueGateProfile(request(), AT))).toMatchObject({ reason: 'gate-profile-running' });
    expect(board.queueGateProfile(request({ phase: 'merge' }), AT).run.profileRunId).toBe('P2');
  });

  test('keeps a run by its entity too: an entity\'s gate and phase queue beside another entity\'s and the forge\'s, and replace only their own', () => {
    const { board } = boardFixture();
    board.queueGateProfile(request({ entity: 'web' }), AT);
    board.queueGateProfile(request({ entity: 'ui' }), AT);
    board.queueGateProfile(request(), AT);
    board.markGateProfileRunning('P1');
    board.endGateProfile('P1', { ending: 'passed', elapsedMilliseconds: 900, cacheReport: null }, AT);

    board.queueGateProfile(request({ entity: 'web' }), AT);

    expect(board.gateProfileRuns().map((run) => [run.profileRunId, run.entity])).toEqual([['P2', 'ui'], ['P3', undefined], ['P4', 'web']]);
    expect(Object.hasOwn(board.gateProfileRuns()[1] ?? {}, 'entity')).toBe(false);
  });

  test('after a run ended, a new press replaces it, and its id is never used again', () => {
    const { board } = boardFixture();
    board.queueGateProfile(request(), AT);
    board.markGateProfileRunning('P1');
    board.endGateProfile('P1', { ending: 'red', elapsedMilliseconds: 900, cacheReport: null }, AT);

    board.queueGateProfile(request(), AT);

    expect(board.gateProfileRuns().map((run) => [run.profileRunId, run.state])).toEqual([['P2', 'queued']]);
  });

  test('keeps the gate\'s content hash, which a changed line changes', () => {
    const { board } = boardFixture();
    const first = board.queueGateProfile(request(), AT).run.gateHash;
    const changed = board.queueGateProfile(request({ phase: 'review', gate: { name: 'tests', run: 'bun test --bail' } }), AT).run.gateHash;

    expect(changed).not.toBe(first);
  });
});

describe('the end of a run', () => {
  test('records the ending and the duration, logged gate-profiled', () => {
    const { board, records } = boardFixture();
    board.queueGateProfile(request(), AT);
    board.markGateProfileRunning('P1');

    const ended = board.endGateProfile('P1', { ending: 'passed', elapsedMilliseconds: 4200, cacheReport: null }, AT);

    expect(ended.run).toMatchObject({ state: 'passed', elapsedMilliseconds: 4200 });
    expect(records.at(-1)).toMatchObject({ kind: 'gate-profiled', profileRunId: 'P1', fields: { state: 'passed', elapsedMilliseconds: 4200 } });
  });

  test('keeps what the gate reported of its cache, and holds no cache report where it reported nothing', () => {
    const { board } = boardFixture();
    board.queueGateProfile(request(), AT);
    board.queueGateProfile(request({ phase: 'merge' }), AT);
    board.markGateProfileRunning('P1');
    board.markGateProfileRunning('P2');

    const reported = board.endGateProfile('P1', { ending: 'passed', elapsedMilliseconds: 400, cacheReport: 'hit' }, AT);
    const unreported = board.endGateProfile('P2', { ending: 'passed', elapsedMilliseconds: 4200, cacheReport: null }, AT);

    expect([reported.run.cacheReport, Object.hasOwn(unreported.run, 'cacheReport')]).toEqual(['hit', false]);
  });

  test('of a run User asked to stop is stopped, with no duration and no cache report', () => {
    const { board, records } = boardFixture();
    board.queueGateProfile(request(), AT);
    board.markGateProfileRunning('P1');
    expect(board.stopGateProfile('P1', AT).run.stopRequested).toBe(true);

    const ended = board.endGateProfile('P1', { ending: 'red', elapsedMilliseconds: 300, cacheReport: 'hit' }, AT);

    expect(ended.run).toMatchObject({ state: 'stopped', stopRequested: false, elapsedMilliseconds: null });
    expect(Object.hasOwn(ended.run, 'cacheReport')).toBe(false);
    expect(records.at(-1)).toMatchObject({ kind: 'gate-profile-stopped', profileRunId: 'P1' });
  });

  test('a run stopped while it waited is never marked running', () => {
    const { board } = boardFixture();
    board.queueGateProfile(request(), AT);
    board.stopGateProfile('P1', AT);

    expect(board.markGateProfileRunning('P1')).toMatchObject({ changed: false, run: { state: 'stopped' } });
  });
});

describe('a Stop', () => {
  test('ends a queued run at once, marks a running one, and leaves an ended one as it is', () => {
    const { board, records } = boardFixture();
    board.queueGateProfile(request(), AT);
    board.queueGateProfile(request({ phase: 'merge' }), AT);
    board.markGateProfileRunning('P2');

    expect(board.stopGateProfile('P1', AT).run.state).toBe('stopped');
    expect(board.stopGateProfile('P2', AT).run).toMatchObject({ state: 'running', stopRequested: true });
    expect(board.stopGateProfile('P1', AT)).toMatchObject({ changed: false });
    expect(records.map((record) => record.kind)).toEqual(['gate-profile-requested', 'gate-profile-requested', 'gate-profile-stopped']);
  });

  test('of an unknown run refuses unknown-profile-run', () => {
    expect(refusalOf(() => boardFixture().board.stopGateProfile('P9', AT))).toEqual({ reason: 'unknown-profile-run', profileRunId: 'P9' });
  });
});

test('a Hephaestus start stops a run left running, never to run again, and leaves a queued one queued', () => {
  const { board } = boardFixture();
  board.queueGateProfile(request(), AT);
  board.queueGateProfile(request({ phase: 'merge' }), AT);
  board.markGateProfileRunning('P1');

  const stopped = board.stopGateProfilesLeftRunning(AT);

  expect(stopped.map((changed) => changed.run.profileRunId)).toEqual(['P1']);
  expect(board.gateProfileRuns().map((run) => [run.profileRunId, run.state])).toEqual([['P1', 'stopped'], ['P2', 'queued']]);
});

test('a malformed file refuses every move, reads as no run, and is never written over', () => {
  const { board } = boardFixture({ gateProfiles: { verdict: 'malformed', problem: { code: 'missing', field: 'runs' } } });

  expect(refusalOf(() => board.queueGateProfile(request(), AT))).toEqual({ reason: 'gate-profiles-unreadable', problem: { code: 'missing', field: 'runs' } });
  expect(refusalOf(() => board.stopGateProfile('P1', AT))).toEqual({ reason: 'gate-profiles-unreadable', problem: { code: 'missing', field: 'runs' } });
  expect(board.gateProfileRuns()).toEqual([]);
  expect(board.stopGateProfilesLeftRunning(AT)).toEqual([]);
  expect(board.gateProfilesWrite()).toEqual({ write: 'unchanged' });
});
