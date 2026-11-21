/**
 * The draft's entity refusals as the board document serves them. What matters: each is a verdict of the validator a stored pipeline must
 * pass, so entities it takes have none; each carries a sentence that says what is wrong and that Continue and Apply wait for the fix, never
 * that nothing was written, since the edit that left it is kept; the entities it names and the row that shows it; and where one gesture
 * resolves it, that gesture's label and typed draft edits, which leave entities the validator takes. The cases are those of the Bridge's
 * `EntityRefusalsModel.spec.ts`, whose fixture this one copies.
 */
import { describe, expect, test } from 'bun:test';

import type { EntityKey, Pipeline, PipelineEntity } from '../../../lib/tracker-model/@types/Pipeline.ts';
import { PipelineDraftEditUtil }                    from '../../../lib/tracker-model/utils/PipelineDraftEditUtil.ts';
import { BoardCommandMappingUtil }                  from '../../board-commands/utils/BoardCommandMappingUtil.ts';
import { BoardEntityRefusalMappingUtil }            from './BoardEntityRefusalMappingUtil.ts';

const SETUP_ID = 'S1';

function entityOf(kind: PipelineEntity['kind'], home: string[], extra: Partial<PipelineEntity> = {}): PipelineEntity {
  return {
    kind, home, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, ...extra,
  };
}

/** Example Agency's monorepo: web whitelists and depends on ui, which has a review step; ui depends on config; docs has no build. */
const SOUND_ENTITIES: Readonly<Record<EntityKey, PipelineEntity>> = Object.freeze({
  web: entityOf('app', ['/apps/web'], {
    summary: 'Next.js storefront', whitelist: ['ui'], reach: ['/package.json', '/bun.lock'], dependsOn: ['ui'],
  }),
  admin:  entityOf('app', ['/apps/admin'], { summary: 'Vite back office', dependsOn: ['ui'] }),
  ui:     entityOf('package', ['/packages/ui'], { summary: 'React components', review: { name: 'review' }, dependsOn: ['config'] }),
  config: entityOf('package', ['/packages/config'], { summary: 'Shared tsconfig and lint presets' }),
  docs:   entityOf('package', ['/docs'], { summary: 'The handbook, in Markdown' }),
});

function draftWith(changes: Readonly<Record<EntityKey, Partial<PipelineEntity>>>): Pipeline {
  const entities = structuredClone(SOUND_ENTITIES) as Record<EntityKey, PipelineEntity>;
  for (const [entityKey, change] of Object.entries(changes)) entities[entityKey] = { ...entities[entityKey], ...change } as PipelineEntity;
  return {
    version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }, entities,
  };
}

function refusalsOf(draft: Pipeline | null): ReturnType<typeof BoardEntityRefusalMappingUtil.entityRefusalsOf> {
  return BoardEntityRefusalMappingUtil.entityRefusalsOf(SETUP_ID, draft);
}

function standingSentenceOf(reason: string): string {
  return `Pipeline setup ${SETUP_ID}'s draft cannot be stored as it is: ${reason}. Continue and Apply wait until it is fixed.`;
}

function resolvedByItsFix(draft: Pipeline): boolean {
  const fix = refusalsOf(draft)[0]?.fix ?? null;
  if (fix === null) throw new Error('the refusal has a fix');
  const fixed = fix.edits.reduce((pipeline, edit) => PipelineDraftEditUtil.pipelineWithEdit(pipeline, BoardCommandMappingUtil.draftEditOf(edit)), draft);
  return refusalsOf(fixed).length === 0;
}

describe('BoardEntityRefusalMappingUtil.entityRefusalsOf', () => {
  test('entities the validator takes, and a draft without entities or no draft, have no refusal', () => {
    expect(refusalsOf(draftWith({}))).toEqual([]);
    const { entities: _entities, ...withoutEntities } = draftWith({});
    expect(refusalsOf(withoutEntities)).toEqual([]);
    expect(refusalsOf(null)).toEqual([]);
  });

  test('a whitelist that names no entity shows on the app, and taking it off resolves it', () => {
    const draft = draftWith({ admin: { whitelist: ['shared'] } });
    expect(refusalsOf(draft)).toEqual([{
      reason:     'unknown-whitelist-key',
      entityKeys: ['admin'],
      shownOn:    'admin',
      sentence:   standingSentenceOf('entities.admin.whitelist names "shared", which is not an entity'),
      fix:        { label: 'Take shared off', edits: [{ target: 'within-entity', entityKey: 'admin', edit: { target: 'whitelist', value: null } }] },
    }]);
    expect(resolvedByItsFix(draft)).toBe(true);
  });

  test('a whitelisted package without review is resolved by giving it a review step', () => {
    const draft = draftWith({ admin: { whitelist: ['config'] } });
    const [refusal] = refusalsOf(draft);
    expect(refusal?.sentence).toBe(standingSentenceOf('entities.admin.whitelist names "config", a package without a review'));
    expect([refusal?.reason, refusal?.entityKeys, refusal?.fix?.label]).toEqual(['whitelisted-package-without-review', ['admin', 'config'], 'Give config a review step']);
    expect(resolvedByItsFix(draft)).toBe(true);
  });

  test('a whitelisted app is no package, and taking it off keeps the rest of the whitelist', () => {
    const draft = draftWith({ web: { whitelist: ['ui', 'admin'] } });
    const [refusal] = refusalsOf(draft);
    expect(refusal?.sentence).toBe(standingSentenceOf('entities.web.whitelist names "admin", which is not a package'));
    expect(refusal?.fix?.edits).toEqual([{ target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: ['ui'] } }]);
    expect(resolvedByItsFix(draft)).toBe(true);
  });

  test('two entities with one home folder show on the last one, which gives it up when it keeps another', () => {
    const draft = draftWith({ docs: { home: ['/docs', '/packages/ui'] } });
    const [refusal] = refusalsOf(draft);
    expect(refusal?.sentence).toBe(standingSentenceOf('the entities ui, docs share the home "/packages/ui"'));
    expect([refusal?.shownOn, refusal?.fix?.label]).toEqual(['docs', 'Remove packages/ui from docs']);
    expect(resolvedByItsFix(draft)).toBe(true);
  });

  test('two entities with one home and no other have no one-gesture fix', () => {
    expect(refusalsOf(draftWith({ docs: { home: ['/packages/ui'] } }))[0]?.fix).toBeNull();
  });

  test('a circle of dependencies names its entities, shows on the first, and has no one-gesture fix', () => {
    const [refusal] = refusalsOf(draftWith({ config: { dependsOn: ['ui'] } }));
    expect(refusal?.sentence).toBe(standingSentenceOf('the entities ui -> config -> ui depend on each other in a circle'));
    expect([refusal?.entityKeys, refusal?.shownOn, refusal?.fix]).toEqual([['ui', 'config'], 'ui', null]);
  });

  test('two root entities show on the first and have no one-gesture fix', () => {
    const [refusal] = refusalsOf(draftWith({ tools: entityOf('root', ['/tools']), scripts: entityOf('root', ['/scripts']) }));
    expect([refusal?.reason, refusal?.shownOn, refusal?.fix]).toEqual(['more-than-one-root', 'tools', null]);
  });

  test('an unknown dependency is removed from what the entity depends on', () => {
    const draft = draftWith({ docs: { dependsOn: ['theme'] } });
    const [refusal] = refusalsOf(draft);
    expect(refusal?.sentence).toBe(standingSentenceOf('entities.docs.dependsOn names "theme", which is not an entity'));
    expect(refusal?.fix?.label).toBe('Remove theme from what docs depends on');
    expect(resolvedByItsFix(draft)).toBe(true);
  });

  test('E9: a reach path inside another entity\'s home shows on the entity that names it, and taking it off resolves it', () => {
    const draft = draftWith({ admin: { reach: ['/bun.lock', '/packages/ui/generated/'] } });
    const [refusal] = refusalsOf(draft);
    expect(refusal?.sentence).toBe(standingSentenceOf(
      'entities.admin.reach names "/packages/ui/generated/", which reaches into the home of the entity ui; reach names only paths the root entity owns'
    ));
    expect([refusal?.entityKeys, refusal?.shownOn, refusal?.fix?.label]).toEqual([['admin', 'ui'], 'admin', 'Take /packages/ui/generated/ off admin\'s reach']);
    expect(resolvedByItsFix(draft)).toBe(true);
  });

  test('no served sentence says nothing was written, since the edit that left the refusal is kept', () => {
    const draft = draftWith({
      admin:   { whitelist: ['shared', 'config'], dependsOn: ['theme'], reach: ['/packages/ui/generated/'] },
      config:  { dependsOn: ['ui'] },
      docs:    { home: ['/packages/ui'] },
      web:     { whitelist: ['ui', 'admin'] },
      tools:   entityOf('root', ['/tools']),
      scripts: entityOf('root', ['/scripts']),
    });
    const sentences = refusalsOf(draft).map((refusal) => refusal.sentence);
    expect(new Set(refusalsOf(draft).map((refusal) => refusal.reason)).size).toBe(8);
    for (const sentence of sentences) {
      expect(sentence.toLowerCase()).not.toContain('nothing was written');
      expect(sentence).toEndWith('Continue and Apply wait until it is fixed.');
    }
  });

  test('several refusals are served in the validator\'s order, one document each', () => {
    const draft = draftWith({ admin: { whitelist: ['shared', 'config'], dependsOn: ['theme'] }, config: { dependsOn: ['ui'] } });
    expect(refusalsOf(draft).map((refusal) => refusal.reason))
      .toEqual(['unknown-whitelist-key', 'whitelisted-package-without-review', 'unknown-dependency-key', 'dependency-circle']);
  });
});
