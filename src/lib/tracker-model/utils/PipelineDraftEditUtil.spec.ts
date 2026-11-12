/**
 * The draft edited one field at a time. What matters: each edit names the field the change list names; a removed gate leaves every
 * phase, so no phase names a gate that is gone; a `null` removes an optional key rather than storing a null; the edit never changes the
 * pipeline it was given; a stored field text reads back only when well formed; and Undo writes the base value back, a restored gate in
 * the place and phases the base gives it.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }                              from '../@types/Pipeline.ts';
import type { PipelineDraftEdit, PipelineDraftField } from '../@types/PipelineSetup.ts';
import { PipelineDraftEditUtil }                      from './PipelineDraftEditUtil.ts';

const BASE: Pipeline = {
  version:   2,
  prepare:   [{ name: 'install', run: 'bun install' }, { name: 'build', run: 'bun run build' }],
  gates:     [{ name: 'types', run: 'bun run typecheck' }, { name: 'test', run: 'bun test' }],
  phases:    { build: ['types', 'test'], review: ['test'], merge: ['types', 'test'] },
  review:    { name: 'Review' },
  approvals: { merge: true },
};

describe('fieldOf', () => {
  test.each<[PipelineDraftEdit, PipelineDraftField]>([
    [{ target: 'gate', name: 'test', value: null }, 'gate:test'],
    [{ target: 'phase-order', phase: 'merge', names: [] }, 'phase-order:merge'],
    [{ target: 'prepare', name: 'install', value: null }, 'prepare:install'],
    [{ target: 'prepare-order', names: [] }, 'prepare-order'],
    [{ target: 'role', role: 'builder', value: null }, 'role:builder'],
    [{ target: 'review', value: null }, 'review'],
    [{ target: 'airlock', value: null }, 'airlock'],
    [{ target: 'approval', approval: 'tickets', value: null }, 'approval:tickets'],
    [{ target: 'constitution', value: null }, 'constitution'],
  ])('%o names %s', (edit, field) => {
    expect(PipelineDraftEditUtil.fieldOf(edit)).toBe(field);
    expect(PipelineDraftEditUtil.fieldIsWellFormed(field)).toBe(true);
  });

  test.each(['gate:', 'gate: ', 'phase-order:deploy', 'role:tester', 'approval:release', 'reviews', ''])('%o is not a draft field', (text) => {
    expect(PipelineDraftEditUtil.fieldIsWellFormed(text)).toBe(false);
  });
});

describe('pipelineWithEdit', () => {
  test('a removed gate leaves the gate list and every phase, and the given pipeline stays as it was', () => {
    const edited = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'gate', name: 'types', value: null });

    expect(edited.gates.map((gate) => gate.name)).toEqual(['test']);
    expect(edited.phases).toEqual({ build: ['test'], review: ['test'], merge: ['test'] });
    expect(BASE.gates).toHaveLength(2);
  });

  test('a gate or prepare step is replaced where it stands, or added last', () => {
    const replaced = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'gate', name: 'types', value: { name: 'types', run: 'tsc' } });
    const added    = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'prepare', name: 'seed', value: { name: 'seed', run: 'bun run seed' } });

    expect(replaced.gates.map((gate) => gate.run)).toEqual(['tsc', 'bun test']);
    expect(added.prepare.map((step) => step.name)).toEqual(['install', 'build', 'seed']);
  });

  test('a prepare order puts the named steps first, in that order', () => {
    expect(PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'prepare-order', names: ['build', 'install'] }).prepare.map((step) => step.name))
      .toEqual(['build', 'install']);
  });

  test('null removes an optional key, and the last role or approval removes its whole map', () => {
    const withoutReview   = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'review', value: null });
    const withoutApproval = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'approval', approval: 'merge', value: null });
    const withRole        = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'role', role: 'builder', value: { model: 'opus' } });

    expect('review' in withoutReview).toBe(false);
    expect('approvals' in withoutApproval).toBe(false);
    expect(withRole.agents).toEqual({ builder: { model: 'opus' } });
    expect('agents' in PipelineDraftEditUtil.pipelineWithEdit(withRole, { target: 'role', role: 'builder', value: null })).toBe(false);
  });
});

describe('pipelineWithBaseValueOf', () => {
  test('a removed gate comes back in its base place and phases', () => {
    const draft = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'gate', name: 'types', value: null });

    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(BASE, draft, 'gate:types')).toEqual(BASE);
  });

  test('a gate the base never had is removed again', () => {
    const draft = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'gate', name: 'lint', value: { name: 'lint', run: 'bun run lint' } });

    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(BASE, draft, 'gate:lint')).toEqual(BASE);
  });

  test('a prepare order goes back to the base order, a step only the draft holds staying last', () => {
    const reordered = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'prepare-order', names: ['build', 'install'] });
    const draft     = PipelineDraftEditUtil.pipelineWithEdit(reordered, { target: 'prepare', name: 'seed', value: { name: 'seed', run: 'bun run seed' } });

    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(BASE, draft, 'prepare-order').prepare.map((step) => step.name)).toEqual(['install', 'build', 'seed']);
  });

  test('a review, an approval and a phase order take the base value back', () => {
    let draft = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'review', value: null });
    draft = PipelineDraftEditUtil.pipelineWithEdit(draft, { target: 'approval', approval: 'merge', value: false });
    draft = PipelineDraftEditUtil.pipelineWithEdit(draft, { target: 'phase-order', phase: 'build', names: ['test', 'types'] });

    for (const field of ['review', 'approval:merge', 'phase-order:build'] as const) draft = PipelineDraftEditUtil.pipelineWithBaseValueOf(BASE, draft, field);

    expect(draft).toEqual(BASE);
  });
});
