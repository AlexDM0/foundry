/**
 * The change list between a base pipeline and a draft, and the field names Apply logs. What matters: each edit User or the pipeline
 * agent can make shows as exactly one row of the right kind on the field the edit addresses; a hand edit that only reorders keys, and a
 * default written out, is no change; a reorder of prepare steps is one order row, while an added or removed step is only its own row;
 * billing is never a row; the constitution is a row when its path or, as the caller says, its text changed. Over entities: an entity's
 * definition is its own row; a field inside an entity is a row scoped `entity:<key>/`, a forge-level role never among them; an entity
 * only one side holds lists each of its fields against an empty entity; an empty list equals an absent one; and a pipeline without
 * entities gets no entity row.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }      from '../@types/Pipeline.ts';
import { PipelineChangeUtil } from './PipelineChangeUtil.ts';

const MINIMAL: Pipeline = {
  version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

const BASE: Pipeline = {
  version: 3,
  prepare: [{ name: 'install', run: 'bun install' }, { name: 'generate', run: 'bun run generate' }],
  gates:   [{ name: 'lint', run: 'bun run lint' }, { name: 'tests', run: 'bun test' }],
  phases:  { build: ['lint', 'tests'], review: ['tests'], merge: ['lint', 'tests'] },
  review:  { name: 'review' },
  agents:  { builder: { model: 'opus' } },
};

function fieldsAndKindsOf(base: Pipeline, draft: Pipeline, constitutionTextChanged = false): [string, string][] {
  return PipelineChangeUtil.changesBetween(base, draft, constitutionTextChanged).map((change) => [change.field, change.change]);
}

describe('the change list', () => {
  test('is empty for an unchanged pipeline', () => {
    expect(PipelineChangeUtil.changesBetween(BASE, structuredClone(BASE), false)).toEqual([]);
  });

  test('is empty when a hand edit only reorders keys', () => {
    const reordered = {
      agents:  { builder: { model: 'opus' } },
      review:  { name: 'review' },
      phases:  { merge: ['lint', 'tests'], review: ['tests'], build: ['lint', 'tests'] },
      gates:   [{ run: 'bun run lint', name: 'lint' }, { run: 'bun test', name: 'tests' }],
      prepare: [{ run: 'bun install', name: 'install' }, { run: 'bun run generate', name: 'generate' }],
      version: 3,
    } as Pipeline;

    expect(PipelineChangeUtil.changesBetween(BASE, reordered, false)).toEqual([]);
  });

  test('names a new gate and the phase it joins, with the values before and after', () => {
    const draft: Pipeline = { ...BASE, gates: [...BASE.gates, { name: 'smoke', run: 'bun run smoke' }], phases: { ...BASE.phases, merge: ['lint', 'tests', 'smoke'] } };

    expect(PipelineChangeUtil.changesBetween(BASE, draft, false)).toEqual([
      {
        field: 'gate:smoke', change: 'new', before: null, after: { name: 'smoke', run: 'bun run smoke' }
      },
      {
        field: 'phase-order:merge', change: 'changed', before: ['lint', 'tests'], after: ['lint', 'tests', 'smoke']
      },
    ]);
  });

  test('names a removed gate and every phase it leaves', () => {
    const draft: Pipeline = { ...BASE, gates: [{ name: 'tests', run: 'bun test' }], phases: { build: ['tests'], review: ['tests'], merge: ['tests'] } };

    expect(fieldsAndKindsOf(BASE, draft)).toEqual([['gate:lint', 'removed'], ['phase-order:build', 'changed'], ['phase-order:merge', 'changed']]);
  });

  test('names a changed gate definition alone when its phases stay', () => {
    const draft: Pipeline = { ...BASE, gates: [{ name: 'lint', run: 'bun run lint', fix: 'bun run lint --fix' }, { name: 'tests', run: 'bun test' }] };

    expect(fieldsAndKindsOf(BASE, draft)).toEqual([['gate:lint', 'changed']]);
  });

  test('is empty when a hand edit writes a gate\'s list option out as an empty list', () => {
    const draft: Pipeline = {
      ...BASE,
      gates: [{
        name: 'lint', run: 'bun run lint', network: [], writes: []
      }, { name: 'tests', run: 'bun test', definedBy: [] }]
    };

    expect(PipelineChangeUtil.changesBetween(BASE, draft, false)).toEqual([]);
  });

  test('names a reorder of a phase\'s gates as that phase\'s order', () => {
    expect(fieldsAndKindsOf(BASE, { ...BASE, phases: { ...BASE.phases, merge: ['tests', 'lint'] } })).toEqual([['phase-order:merge', 'changed']]);
  });

  test('names an added prepare step alone, with no order row', () => {
    const draft: Pipeline = { ...BASE, prepare: [{ name: 'setup', run: 'bun run setup' }, ...BASE.prepare] };

    expect(fieldsAndKindsOf(BASE, draft)).toEqual([['prepare:setup', 'new']]);
  });

  test('names a removed prepare step alone, with no order row', () => {
    expect(fieldsAndKindsOf(BASE, { ...BASE, prepare: BASE.prepare.slice(1) })).toEqual([['prepare:install', 'removed']]);
  });

  test('names a reorder of the prepare steps as one order row', () => {
    const draft: Pipeline = { ...BASE, prepare: [...BASE.prepare].reverse() };

    expect(PipelineChangeUtil.changesBetween(BASE, draft, false)).toEqual([
      {
        field: 'prepare-order', change: 'changed', before: ['install', 'generate'], after: ['generate', 'install']
      },
    ]);
  });

  test('names a changed prepare step\'s line', () => {
    const draft: Pipeline = { ...BASE, prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }, { name: 'generate', run: 'bun run generate' }] };

    expect(fieldsAndKindsOf(BASE, draft)).toEqual([['prepare:install', 'changed']]);
  });

  test('names the review as new, changed or removed', () => {
    const { review: _review, ...withoutReview } = BASE;

    expect(fieldsAndKindsOf(withoutReview, BASE)).toEqual([['review', 'new']]);
    expect(fieldsAndKindsOf(BASE, { ...BASE, review: { name: 'review', reReview: { thresholdLines: 750 } } })).toEqual([['review', 'changed']]);
    expect(fieldsAndKindsOf(BASE, withoutReview)).toEqual([['review', 'removed']]);
  });

  test('names the merge train as new, changed or removed', () => {
    const withTrain: Pipeline = { ...BASE, airlock: { reReview: { thresholdLines: 300 } } };

    expect(fieldsAndKindsOf(BASE, withTrain)).toEqual([['airlock', 'new']]);
    expect(fieldsAndKindsOf(withTrain, { ...BASE, airlock: { reReview: { thresholdLines: 500 } } })).toEqual([['airlock', 'changed']]);
    expect(fieldsAndKindsOf(withTrain, BASE)).toEqual([['airlock', 'removed']]);
  });

  test('names a role whose model, effort or instructions change, always as changed', () => {
    expect(PipelineChangeUtil.changesBetween(BASE, { ...BASE, agents: { builder: { model: 'opus', effort: 'high' } } }, false)).toEqual([
      {
        field: 'role:builder', change: 'changed', before: { model: 'opus' }, after: { model: 'opus', effort: 'high' }
      },
    ]);
    expect(fieldsAndKindsOf(BASE, { ...BASE, agents: { ...BASE.agents, reviewer: { instructions: [] } } })).toEqual([['role:reviewer', 'changed']]);
    expect(fieldsAndKindsOf(BASE, { ...BASE, agents: {} })).toEqual([['role:builder', 'changed']]);
  });

  test('is empty when a role\'s default instruction list is written out', () => {
    const draft: Pipeline = {
      ...BASE,
      agents: { ...BASE.agents, reviewer: { instructions: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }] } },
    };

    expect(PipelineChangeUtil.changesBetween(BASE, draft, false)).toEqual([]);
  });

  test('approvalIsOn reads an absent ticket review as on and an absent merge approval as off, and a stored value as stored', () => {
    expect(PipelineChangeUtil.approvalIsOn(BASE, 'tickets')).toBe(true);
    expect(PipelineChangeUtil.approvalIsOn(BASE, 'merge')).toBe(false);
    expect(PipelineChangeUtil.approvalIsOn({ ...BASE, approvals: { tickets: false, merge: true } }, 'tickets')).toBe(false);
    expect(PipelineChangeUtil.approvalIsOn({ ...BASE, approvals: { tickets: false, merge: true } }, 'merge')).toBe(true);
  });

  test('names an approval only when its effect changes, an absent ticket review being on and an absent merge approval off', () => {
    expect(PipelineChangeUtil.changesBetween(BASE, { ...BASE, approvals: { tickets: true, merge: false } }, false)).toEqual([]);
    expect(PipelineChangeUtil.changesBetween(BASE, { ...BASE, approvals: { merge: true } }, false)).toEqual([
      {
        field: 'approval:merge', change: 'changed', before: false, after: true
      },
    ]);
    expect(fieldsAndKindsOf(BASE, { ...BASE, approvals: { tickets: false } })).toEqual([['approval:tickets', 'changed']]);
  });

  test('never names the billing', () => {
    expect(PipelineChangeUtil.changesBetween(BASE, { ...BASE, billing: { mode: 'api', maxBudgetUsd: 5 } }, false)).toEqual([]);
  });

  test('names the constitution when its path is set, moved or removed', () => {
    const withConstitution: Pipeline = { ...BASE, constitution: { path: 'CONSTITUTION.md' } };

    expect(fieldsAndKindsOf(BASE, withConstitution)).toEqual([['constitution', 'new']]);
    expect(fieldsAndKindsOf(withConstitution, { ...BASE, constitution: { path: 'docs/constitution.md' } })).toEqual([['constitution', 'changed']]);
    expect(fieldsAndKindsOf(withConstitution, BASE)).toEqual([['constitution', 'removed']]);
  });

  test('names the constitution as changed when only its text changed, with or without a path', () => {
    const withConstitution: Pipeline = { ...BASE, constitution: { path: 'CONSTITUTION.md' } };

    expect(PipelineChangeUtil.changesBetween(withConstitution, withConstitution, true)).toEqual([
      {
        field: 'constitution', change: 'changed', before: { path: 'CONSTITUTION.md' }, after: { path: 'CONSTITUTION.md' }
      },
    ]);
    expect(fieldsAndKindsOf(BASE, BASE, true)).toEqual([['constitution', 'changed']]);
  });

  test('lists a first setup against the minimal pipeline in the flow\'s order', () => {
    const draft: Pipeline = {
      ...BASE,
      airlock:      { reReview: { thresholdLines: 300 } },
      approvals:    { merge: true },
      constitution: { path: 'CONSTITUTION.md' },
    };

    expect(fieldsAndKindsOf(MINIMAL, draft, true)).toEqual([
      ['prepare:install', 'new'],
      ['prepare:generate', 'new'],
      ['gate:lint', 'new'],
      ['gate:tests', 'new'],
      ['phase-order:build', 'changed'],
      ['phase-order:review', 'changed'],
      ['phase-order:merge', 'changed'],
      ['review', 'new'],
      ['airlock', 'new'],
      ['role:builder', 'changed'],
      ['approval:merge', 'changed'],
      ['constitution', 'new'],
    ]);
  });
});

describe('the change list over entities', () => {
  const OVER_ENTITIES: Pipeline = {
    ...MINIMAL,
    agents:   { productOwner: { model: 'opus' } },
    entities: {
      web: {
        kind:      'app',
        home:      ['/apps/web'],
        prepare:   [],
        gates:     [{ name: 'tests', run: 'bun test' }],
        phases:    { build: ['tests'], review: [], merge: ['tests'] },
        whitelist: ['design'],
      },
      design: {
        kind: 'package', home: ['/packages/design'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, review: { name: 'Review' }
      },
    },
  };

  function withWeb(change: Partial<NonNullable<Pipeline['entities']>[string]>): Pipeline {
    const { web, design } = OVER_ENTITIES.entities ?? {};
    if (web === undefined || design === undefined) throw new Error('the example has both entities');
    return { ...OVER_ENTITIES, entities: { web: { ...web, ...change }, design } };
  }

  test('is empty for an unchanged pipeline, and a forge-level role stays a forge-level row', () => {
    expect(PipelineChangeUtil.changesBetween(OVER_ENTITIES, structuredClone(OVER_ENTITIES), false)).toEqual([]);
    expect(fieldsAndKindsOf(OVER_ENTITIES, { ...OVER_ENTITIES, agents: {} })).toEqual([['role:productOwner', 'changed']]);
  });

  test('names a changed definition alone, with the kind, homes and summary before and after', () => {
    expect(PipelineChangeUtil.changesBetween(OVER_ENTITIES, withWeb({ home: ['/apps/web', '/packages/web-private'] }), false)).toEqual([
      {
        field: 'entity:web', change: 'changed', before: { kind: 'app', home: ['/apps/web'] }, after: { kind: 'app', home: ['/apps/web', '/packages/web-private'] }
      },
    ]);
  });

  test('names each field inside an entity under its scope', () => {
    const draft = withWeb({
      gates:       [{ name: 'tests', run: 'bun test' }, { name: 'lint', run: 'bun run lint' }],
      phases:      { build: ['tests', 'lint'], review: [], merge: ['tests'] },
      agents:      { builder: { effort: 'high' } },
      reach:       ['/bun.lock'],
      dependsOn:   ['design'],
      whitelist:   [],
      concurrency: 2,
    });

    expect(fieldsAndKindsOf(OVER_ENTITIES, draft)).toEqual([
      ['entity:web/gate:lint', 'new'],
      ['entity:web/phase-order:build', 'changed'],
      ['entity:web/role:builder', 'changed'],
      ['entity:web/whitelist', 'removed'],
      ['entity:web/reach', 'new'],
      ['entity:web/depends-on', 'new'],
      ['entity:web/concurrency', 'new'],
    ]);
  });

  test('lists an added entity\'s definition, then each of its fields against an empty entity', () => {
    const { design: _design, ...onlyWeb } = OVER_ENTITIES.entities ?? {};

    expect(fieldsAndKindsOf({ ...OVER_ENTITIES, entities: onlyWeb }, OVER_ENTITIES)).toEqual([['entity:design', 'new'], ['entity:design/review', 'new']]);
    expect(fieldsAndKindsOf(OVER_ENTITIES, { ...OVER_ENTITIES, entities: onlyWeb })).toEqual([['entity:design', 'removed'], ['entity:design/review', 'removed']]);
  });

  test('lists a first setup over entities after the forge level, each entity in the draft\'s order', () => {
    expect(fieldsAndKindsOf(MINIMAL, OVER_ENTITIES)).toEqual([
      ['role:productOwner', 'changed'],
      ['entity:web', 'new'],
      ['entity:web/gate:tests', 'new'],
      ['entity:web/phase-order:build', 'changed'],
      ['entity:web/phase-order:merge', 'changed'],
      ['entity:web/whitelist', 'new'],
      ['entity:design', 'new'],
      ['entity:design/review', 'new'],
    ]);
  });
});

describe('the field names Apply logs', () => {
  test('sorts the changed fields by their kind of change, each in the change list\'s order', () => {
    const draft: Pipeline = {
      ...BASE,
      prepare: BASE.prepare.slice(1),
      gates:   [...BASE.gates, { name: 'smoke', run: 'bun run smoke' }],
      phases:  { ...BASE.phases, merge: ['lint', 'tests', 'smoke'] },
      agents:  { builder: { model: 'sonnet' } },
    };

    expect(PipelineChangeUtil.changedFieldNamesOf(BASE, draft, false)).toEqual({
      changedFields: ['phase-order:merge', 'role:builder'],
      newFields:     ['gate:smoke'],
      removedFields: ['prepare:install'],
    });
  });

  test('gives three empty lists when nothing changed', () => {
    expect(PipelineChangeUtil.changedFieldNamesOf(BASE, BASE, false)).toEqual({ changedFields: [], newFields: [], removedFields: [] });
  });
});
