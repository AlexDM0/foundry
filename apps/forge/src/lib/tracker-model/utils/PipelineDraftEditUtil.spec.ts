/**
 * The draft edited one field at a time: each edit names the change list's field, a removed gate leaves every phase, `null` removes an
 * optional key, the given pipeline is never changed, and Undo writes the base value back; inside an entity the same holds under a field
 * scoped `entity:<key>/`.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }                                               from '../@types/Pipeline.ts';
import type { EntityDraftEdit, PipelineDraftEdit, PipelineDraftField } from '../@types/PipelineSetup.ts';
import { PipelineDraftEditUtil }                                       from './PipelineDraftEditUtil.ts';

const ENTITIES_BASE: Pipeline = {
  version:  5,
  prepare:  [],
  gates:    [],
  phases:   { build: [], review: [], merge: [] },
  airlock:  { reReview: { thresholdLines: 40 } },
  entities: {
    web: {
      kind:      'app',
      home:      ['/apps/web'],
      summary:   'The web app.',
      prepare:   [{ name: 'install', run: 'bun install' }],
      gates:     [{ name: 'types', run: 'bun run typecheck' }, { name: 'test', run: 'bun test' }],
      phases:    { build: ['types', 'test'], review: [], merge: ['types', 'test'] },
      agents:    { builder: { model: 'opus' } },
      whitelist: ['design'],
    },
    design: {
      kind: 'package', home: ['/packages/design'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, review: { name: 'Review' }
    },
  },
};

const BASE: Pipeline = {
  version:   5,
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
    [{ target: 'approval', approval: 'spec', value: null }, 'approval:spec'],
    [{ target: 'approval', approval: 'plan', value: null }, 'approval:plan'],
    [{ target: 'ticket-writing', value: null }, 'ticket-writing'],
    [{ target: 'role', role: 'specAgent', value: null }, 'role:specAgent'],
    [{ target: 'role', role: 'planAgent', value: null }, 'role:planAgent'],
    [{ target: 'constitution', value: null }, 'constitution'],
  ])('%o names %s', (edit, field) => {
    expect(PipelineDraftEditUtil.fieldOf(edit)).toBe(field);
    expect(PipelineDraftEditUtil.fieldIsWellFormed(field)).toBe(true);
  });

  test.each<[PipelineDraftEdit, PipelineDraftField]>([
    [{ target: 'entity', entityKey: 'web', value: null }, 'entity:web'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'gate', name: 'test', value: null } }, 'entity:web/gate:test'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'phase-order', phase: 'build', names: [] } }, 'entity:web/phase-order:build'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'prepare-order', names: [] } }, 'entity:web/prepare-order'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'reviewer', value: null } }, 'entity:web/role:reviewer'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'constitution', value: null } }, 'entity:web/constitution'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: null } }, 'entity:web/whitelist'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'reach', value: null } }, 'entity:web/reach'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: null } }, 'entity:web/depends-on'],
    [{ target: 'within-entity', entityKey: 'web', edit: { target: 'concurrency', value: null } }, 'entity:web/concurrency'],
  ])('an entity\'s %o names %s', (edit, field) => {
    expect(PipelineDraftEditUtil.fieldOf(edit)).toBe(field);
    expect(PipelineDraftEditUtil.fieldIsWellFormed(field)).toBe(true);
  });

  test.each([
    'gate:',
    'gate: ',
    'phase-order:deploy',
    'role:tester',
    'approval:release',
    'reviews',
    '',
    'entity:',
    'entity: /gate:test',
    'entity:web/',
    'entity:web/airlock',
    'entity:web/approval:merge',
    'entity:web/role:productOwner',
    'entity:web/role:specAgent',
    'entity:web/ticket-writing',
    'ticket-writings',
    'entity:web/whitelists',
    'entity:web/entity:design',
  ])('%o is not a draft field', (text) => {
    expect(PipelineDraftEditUtil.fieldIsWellFormed(text)).toBe(false);
  });

  test('an entity\'s field splits at its first separator, so a gate name may hold one', () => {
    expect(PipelineDraftEditUtil.entityScopeOf('entity:web/gate:lint/fix')).toEqual({ entityKey: 'web', field: 'gate:lint/fix' });
    expect(PipelineDraftEditUtil.entityScopeOf('entity:web')).toEqual({ entityKey: 'web', field: null });
    expect(PipelineDraftEditUtil.entityScopeOf('gate:entity:web')).toBeNull();
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

describe('the ticket writing route', () => {
  test('is set by its edit and removed by null, and the given pipeline stays as it was', () => {
    const routed = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'ticket-writing', value: 'spec-then-plan' });

    expect(routed.ticketWriting).toBe('spec-then-plan');
    expect('ticketWriting' in BASE).toBe(false);
    expect('ticketWriting' in PipelineDraftEditUtil.pipelineWithEdit(routed, { target: 'ticket-writing', value: null })).toBe(false);
  });

  test('Undo takes the base route back, an absent one absent again', () => {
    const routed = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'ticket-writing', value: 'spec-then-plan' });
    const routedBase: Pipeline = { ...BASE, ticketWriting: 'spec-then-plan' };

    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(BASE, routed, 'ticket-writing')).toEqual(BASE);
    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(routedBase, BASE, 'ticket-writing')).toEqual(routedBase);
  });

  test('Undo of a spec or plan approval takes the base switch back', () => {
    let draft = PipelineDraftEditUtil.pipelineWithEdit(BASE, { target: 'approval', approval: 'spec', value: false });
    draft = PipelineDraftEditUtil.pipelineWithEdit(draft, { target: 'approval', approval: 'plan', value: false });

    for (const field of ['approval:spec', 'approval:plan'] as const) draft = PipelineDraftEditUtil.pipelineWithBaseValueOf(BASE, draft, field);

    expect(draft).toEqual(BASE);
  });
});

describe('pipelineWithEdit inside an entity', () => {
  test('a removed gate leaves the entity\'s gates and phases, and neither the forge level nor the given pipeline changes', () => {
    const edited = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'within-entity', entityKey: 'web', edit: { target: 'gate', name: 'types', value: null } });

    expect(edited.entities?.['web']?.gates.map((gate) => gate.name)).toEqual(['test']);
    expect(edited.entities?.['web']?.phases).toEqual({ build: ['test'], review: [], merge: ['test'] });
    expect(edited.gates).toEqual([]);
    expect(ENTITIES_BASE.entities?.['web']?.gates).toHaveLength(2);
  });

  test('a role, a whitelist, a reach, the dependencies and a cap are set inside the entity, and null removes each key', () => {
    const edits: EntityDraftEdit[] = [
      { target: 'role', role: 'reviewer', value: { effort: 'high' } },
      { target: 'reach', value: ['/bun.lock'] },
      { target: 'depends-on', value: ['design'] },
      { target: 'concurrency', value: 2 },
      { target: 'whitelist', value: null },
    ];
    let edited = ENTITIES_BASE;
    for (const edit of edits) edited = PipelineDraftEditUtil.pipelineWithEdit(edited, { target: 'within-entity', entityKey: 'web', edit });

    const web = edited.entities?.['web'];
    expect(web?.agents).toEqual({ builder: { model: 'opus' }, reviewer: { effort: 'high' } });
    expect([web?.reach, web?.dependsOn, web?.concurrency]).toEqual([['/bun.lock'], ['design'], 2]);
    expect(web !== undefined && 'whitelist' in web).toBe(false);
    expect(edited.agents).toBeUndefined();
  });

  test('a definition adds an entity with no pipeline of its own, after the others', () => {
    const edited = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'] } });

    expect(Object.keys(edited.entities ?? {})).toEqual(['web', 'design', 'api']);
    expect(edited.entities?.['api']).toEqual({
      kind: 'app', home: ['/apps/api'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    });
  });

  test('a definition changes the kind, homes and summary of an entity and keeps its pipeline', () => {
    const homes  = ['/apps/web', '/packages/web-private'];
    const edited = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'entity', entityKey: 'web', value: { kind: 'app', home: homes } });

    const { web } = edited.entities ?? {};
    expect(web?.home).toEqual(['/apps/web', '/packages/web-private']);
    expect(web !== undefined && 'summary' in web).toBe(false);
    expect(web?.gates).toEqual(ENTITIES_BASE.entities?.['web']?.gates);
  });

  test('null removes an entity, and the last one removes the whole map', () => {
    const withoutWeb = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'entity', entityKey: 'web', value: null });
    const withoutAny = PipelineDraftEditUtil.pipelineWithEdit(withoutWeb, { target: 'entity', entityKey: 'design', value: null });

    expect(Object.keys(withoutWeb.entities ?? {})).toEqual(['design']);
    expect('entities' in withoutAny).toBe(false);
  });

  test('an edit inside an entity the draft does not hold changes nothing', () => {
    expect(PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'within-entity', entityKey: 'api', edit: { target: 'concurrency', value: 1 } })).toEqual(ENTITIES_BASE);
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

describe('pipelineWithBaseValueOf inside an entity', () => {
  test('a removed gate comes back in its base place and phases inside the entity', () => {
    const draft = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'within-entity', entityKey: 'web', edit: { target: 'gate', name: 'types', value: null } });

    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(ENTITIES_BASE, draft, 'entity:web/gate:types')).toEqual(ENTITIES_BASE);
  });

  test('a whitelist, a role and a cap take the base value back, an absent one absent again', () => {
    const edits: EntityDraftEdit[] = [
      { target: 'whitelist', value: null },
      { target: 'role', role: 'builder', value: { model: 'sonnet' } },
      { target: 'concurrency', value: 3 },
    ];
    let draft = ENTITIES_BASE;
    for (const edit of edits) draft = PipelineDraftEditUtil.pipelineWithEdit(draft, { target: 'within-entity', entityKey: 'web', edit });

    for (const field of ['entity:web/whitelist', 'entity:web/role:builder', 'entity:web/concurrency'] as const) {
      draft = PipelineDraftEditUtil.pipelineWithBaseValueOf(ENTITIES_BASE, draft, field);
    }

    expect(draft).toEqual(ENTITIES_BASE);
  });

  test('a removed entity comes back whole in its base place', () => {
    const draft = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'entity', entityKey: 'web', value: null });

    const restored = PipelineDraftEditUtil.pipelineWithBaseValueOf(ENTITIES_BASE, draft, 'entity:web');

    expect(restored).toEqual(ENTITIES_BASE);
    expect(Object.keys(restored.entities ?? {})).toEqual(['web', 'design']);
  });

  test('an entity the base never had is removed again, and a changed definition takes the base one back', () => {
    const added   = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'] } });
    const renamed = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'entity', entityKey: 'web', value: { kind: 'package', home: ['/web'] } });

    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(ENTITIES_BASE, added, 'entity:api')).toEqual(ENTITIES_BASE);
    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(ENTITIES_BASE, renamed, 'entity:web')).toEqual(ENTITIES_BASE);
  });

  test('a field of an entity the base never had goes back to the default, and one of an entity the draft lacks changes nothing', () => {
    const added = PipelineDraftEditUtil.pipelineWithEdit(ENTITIES_BASE, { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'] } });
    const testGate = { name: 'test', run: 'bun test' };
    const gated    = PipelineDraftEditUtil.pipelineWithEdit(added, { target: 'within-entity', entityKey: 'api', edit: { target: 'gate', name: 'test', value: testGate } });

    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(ENTITIES_BASE, gated, 'entity:api/gate:test')).toEqual(added);
    expect(PipelineDraftEditUtil.pipelineWithBaseValueOf(ENTITIES_BASE, ENTITIES_BASE, 'entity:api/gate:test')).toEqual(ENTITIES_BASE);
  });
});
