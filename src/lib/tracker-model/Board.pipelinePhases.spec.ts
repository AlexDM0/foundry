/**
 * The gate writes on version 2: which phases a gate runs in and their run order. What matters: with no phases a new gate runs in every
 * phase and a replaced one keeps its phases, so the verbs as typed before phases existed still mean the same; with phases a gate runs in
 * exactly those, keeping its place where it was; a reorder takes only the gates the phase runs, each once; and a refusal writes and logs
 * nothing, so an order sent to a board with no pipeline never stores one.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture }                          from '../../testing/BoardFixtures.ts';
import type { Pipeline, PipelineGate }           from './@types/Pipeline.ts';
import { BoardRefusal, type BoardRefusalDetail } from './BoardRefusal.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';

const TYPES_GATE: PipelineGate = { name: 'types', run: 'bun run typecheck' };
const TEST_GATE: PipelineGate  = { name: 'test', run: 'bun test' };
const LINT_GATE: PipelineGate  = { name: 'lint', run: 'bun run lint' };

function pipelineWith(phases: Pipeline['phases']): Pipeline {
  return {
    version: 2, prepare: [], gates: [TYPES_GATE, TEST_GATE, LINT_GATE], phases
  };
}

function refusalDetailOf(attempt: () => unknown): BoardRefusalDetail {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BoardRefusal) return error.detail;
    throw error;
  }
  throw new Error('the call was not refused');
}

describe('adding a gate', () => {
  test('with no pipeline and no phases, the gate runs in every phase of a version 2 pipeline', () => {
    const { board } = boardFixture();

    board.addGate(TEST_GATE, CHANGED_AT);

    expect(board.pipeline()).toEqual({
      version: 2, prepare: [], gates: [TEST_GATE], phases: { build: ['test'], review: ['test'], merge: ['test'] }
    });
  });

  test('with phases, a new gate runs last in exactly those phases', () => {
    const { board } = boardFixture({ pipeline: pipelineWith({ build: ['types', 'test', 'lint'], review: ['types'], merge: ['test', 'types', 'lint'] }) });

    board.addGate({ name: 'e2e', run: 'bun run e2e' }, CHANGED_AT, ['build', 'merge']);

    expect(board.pipeline()?.phases).toEqual({ build: ['types', 'test', 'lint', 'e2e'], review: ['types'], merge: ['test', 'types', 'lint', 'e2e'] });
  });

  test('a replaced gate keeps its phases with no phases given, and with phases keeps its place where it stays and leaves the others', () => {
    const { board } = boardFixture({ pipeline: pipelineWith({ build: ['types', 'test', 'lint'], review: ['test'], merge: ['test', 'types', 'lint'] }) });

    board.addGate({ name: 'test', run: 'bun test --bail' }, CHANGED_AT);
    expect(board.pipeline()?.phases).toEqual({ build: ['types', 'test', 'lint'], review: ['test'], merge: ['test', 'types', 'lint'] });

    board.addGate({ name: 'types', run: 'tsc --noEmit' }, CHANGED_AT, ['merge', 'review']);

    expect(board.pipeline()?.gates.map((gate) => gate.run)).toEqual(['tsc --noEmit', 'bun test --bail', 'bun run lint']);
    expect(board.pipeline()?.phases).toEqual({ build: ['test', 'lint'], review: ['test', 'types'], merge: ['test', 'types', 'lint'] });
  });

  test.each<[string, readonly string[], BoardRefusalDetail]>([
    ['no phase', [], { reason: 'gate-without-phase', gateName: 'e2e' }],
    ['an unknown phase', ['build', 'deploy'], { reason: 'unknown-gate-phase', phase: 'deploy', phases: ['build', 'review', 'merge'] }],
  ])('%s is refused, with nothing changed or logged', (_case, phases, detail) => {
    const pipeline = pipelineWith({ build: ['types', 'test', 'lint'], review: ['types'], merge: ['lint'] });
    const { board, records } = boardFixture({ pipeline: structuredClone(pipeline) });

    expect(refusalDetailOf(() => board.addGate({ name: 'e2e', run: 'bun run e2e' }, CHANGED_AT, phases as never))).toEqual(detail);
    expect(board.pipeline()).toEqual(pipeline);
    expect(board.pipelineChanged()).toBe(false);
    expect(records).toEqual([]);
  });
});

describe('ordering the gates of a phase', () => {
  test('a new order of the gates the phase runs is stored for that phase alone and logged once', () => {
    const { board, records } = boardFixture({ pipeline: pipelineWith({ build: ['types', 'test', 'lint'], review: ['types'], merge: ['types', 'test', 'lint'] }) });

    board.orderPhaseGates('merge', ['lint', 'types', 'test'], CHANGED_AT);

    expect(board.pipeline()?.phases).toEqual({ build: ['types', 'test', 'lint'], review: ['types'], merge: ['lint', 'types', 'test'] });
    expect(board.pipelineChanged()).toBe(true);
    expect(records).toEqual([{ at: CHANGED_AT, kind: 'pipeline-gates-ordered', fields: { phase: 'merge', names: ['lint', 'types', 'test'] } }]);
  });

  test.each<[string, readonly string[], BoardRefusalDetail]>([
    ['an unknown gate', ['types', 'e2e'], { reason: 'unknown-gate', gateName: 'e2e', gateNames: ['types', 'test', 'lint'] }],
    ['a gate the phase does not run', ['types', 'lint'], {
      reason: 'phase-order-not-a-reorder', phase: 'review', names: ['types', 'lint'], phaseGateNames: ['types', 'test']
    }],
    ['a gate left out', ['test'], {
      reason: 'phase-order-not-a-reorder', phase: 'review', names: ['test'], phaseGateNames: ['types', 'test']
    }],
    ['a gate named twice', ['test', 'test'], {
      reason: 'phase-order-not-a-reorder', phase: 'review', names: ['test', 'test'], phaseGateNames: ['types', 'test']
    }],
    ['no gate', [], {
      reason: 'phase-order-not-a-reorder', phase: 'review', names: [], phaseGateNames: ['types', 'test']
    }],
  ])('%s is refused, with nothing changed or logged', (_case, names, detail) => {
    const pipeline = pipelineWith({ build: ['types', 'test', 'lint'], review: ['types', 'test'], merge: ['lint'] });
    const { board, records } = boardFixture({ pipeline: structuredClone(pipeline) });

    expect(refusalDetailOf(() => board.orderPhaseGates('review', names, CHANGED_AT))).toEqual(detail);
    expect(board.pipeline()).toEqual(pipeline);
    expect(board.pipelineChanged()).toBe(false);
    expect(records).toEqual([]);
  });

  test('with no pipeline stored, an order is refused and no file is set, so it never lifts checks-not-set', () => {
    const { board } = boardFixture();

    expect(refusalDetailOf(() => board.orderPhaseGates('build', ['test'], CHANGED_AT))).toEqual({ reason: 'unknown-gate', gateName: 'test', gateNames: [] });
    expect(refusalDetailOf(() => board.orderPhaseGates('build', [], CHANGED_AT)).reason).toBe('phase-order-not-a-reorder');
    expect(board.pipeline()).toBeNull();
    expect(board.pipelineChanged()).toBe(false);
  });
});
