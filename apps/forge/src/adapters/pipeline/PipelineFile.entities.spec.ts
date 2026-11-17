/**
 * `pipeline.json` version 4, the format that holds entities. What matters: a pipeline with entities is mapped and checked whole, so a
 * stored file gets every refusal the entities earn, each with its own reason naming the entity; once nothing is wrong it is still refused
 * as not yet supported, a verdict a refusal names apart from a repair, since no forge runs entities before step 3; beside entities the
 * forge's own prepare steps, gates, constitution and reach stay empty; version 4 exists only for entities, and only version 4 holds them;
 * and a pipeline with entities is written as version 4 in the read's key order, so the file stays the same once entities are switched on.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import type { Pipeline }                                  from '../../lib/tracker-model/@types/Pipeline.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { PipelineFile }                                   from './PipelineFile.ts';

const NO_PHASES = { build: [], review: [], merge: [] };

const NOT_YET_SUPPORTED_REASON = 'it holds entities, which this build does not support yet (entities-not-supported)';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('pipeline-file-entities');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function reasonOf(document: unknown): string {
  const pipelineFilePath = join(scratchDirectory, 'pipeline.json');
  writeFileSync(pipelineFilePath, JSON.stringify(document));
  const reading = PipelineFile.read(pipelineFilePath);
  return reading.verdict === 'malformed' ? reading.reason : `read as ${reading.verdict}`;
}

function entity(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: 'app', home: ['/apps/example'], prepare: [], gates: [], phases: NO_PHASES, ...fields
  };
}

/** A version 4 pipeline over `entities`, with `fields` over its top level. */
function withEntities(entities: Record<string, unknown>, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 4, prepare: [], gates: [], phases: NO_PHASES, entities, ...fields
  };
}

const SOUND_ENTITIES = {
  'web': entity({
    home:         ['/apps/web'],
    summary:      'The example storefront.',
    constitution: { path: 'apps/web/CONSTITUTION.md' },
    gates:        [{ name: 'verify', run: 'bun run gate:web', in: '/' }],
    phases:       { build: ['verify'], review: [], merge: ['verify'] },
    agents:       { builder: { model: 'opus', effort: 'high' } },
    whitelist:    ['design-system'],
    reach:        ['/bun.lock', '/package.json'],
    dependsOn:    ['design-system'],
    concurrency:  2,
  }),
  'design-system': entity({ kind: 'package', home: ['/packages/design-system'], review: { name: 'review' } }),
};

describe('a pipeline with entities', () => {
  test('a pipeline with entities is refused as not yet supported, however sound its entities are', () => {
    expect(reasonOf(withEntities(SOUND_ENTITIES, { agents: { productOwner: { model: 'opus' } }, approvals: { merge: true } })))
      .toBe(NOT_YET_SUPPORTED_REASON);
    const unsupportedEntities = { kind: 'entities-not-supported' } as const;
    expect(PipelineFile.documentReadingOf(withEntities(SOUND_ENTITIES))).toEqual({ verdict: 'malformed', reason: NOT_YET_SUPPORTED_REASON, unsupportedEntities });
  });

  test('a version 4 file without entities is malformed, since version 4 exists only for them', () => {
    expect(reasonOf({
      version: 4, prepare: [], gates: [], phases: NO_PHASES
    })).toBe('version is 4 and entities is missing');
  });

  test('a version 3 file with entities is malformed, since only version 4 holds them', () => {
    expect(reasonOf(withEntities(SOUND_ENTITIES, { version: 3 })))
      .toBe('"entities" is not a pipeline key; the keys are version, prepare, gates, phases, review, airlock, constitution, agents, approvals, billing, reach');
  });

  test('is written as version 4, version first and entities last, each entity in the read\'s key order', () => {
    const pipeline = {
      version: 3, prepare: [], gates: [], phases: NO_PHASES, entities: SOUND_ENTITIES
    } as unknown as Pipeline;

    const written = JSON.parse(PipelineFile.contentsOf(pipeline)) as { entities: Record<string, object> };

    expect(Object.keys(written)).toEqual(['version', 'prepare', 'gates', 'phases', 'entities']);
    expect(written).toMatchObject({ version: 4 });
    expect(Object.keys(written.entities['web'] ?? {})).toEqual([
      'kind', 'home', 'summary', 'constitution', 'prepare', 'gates', 'phases', 'agents', 'whitelist', 'reach', 'dependsOn', 'concurrency'
    ]);
  });
});

describe('the forge\'s own keys beside entities', () => {
  test.each([
    ['prepare steps', { prepare: [{ name: 'install', run: 'bun install' }] }, 'prepare'],
    ['gates', { gates: [{ name: 'test', run: 'bun test' }], phases: { build: ['test'], review: [], merge: [] } }, 'gates'],
    ['a constitution', { constitution: { path: 'CONSTITUTION.md' } }, 'constitution'],
    ['a reach', { reach: ['/bun.lock'] }, 'reach'],
  ])('%s beside entities are refused, since each entity holds its own', (_label, fields, key) => {
    expect(reasonOf(withEntities(SOUND_ENTITIES, fields))).toBe(`${key} is not empty beside entities; each entity holds its own`);
  });

  test('an empty reach beside entities is no reach, and is not refused for it', () => {
    expect(reasonOf(withEntities(SOUND_ENTITIES, { reach: [] }))).toBe(NOT_YET_SUPPORTED_REASON);
  });
});

describe('the entities checked together', () => {
  test.each([
    ['two entities with the same home',
      { web: entity({ home: ['/apps/web'] }), shop: entity({ home: ['/apps/web/'] }) },
      'the entities web, shop share the home "/apps/web"'],
    ['a whitelist naming no entity',
      { web: entity({ whitelist: ['missing'] }) },
      'entities.web.whitelist names "missing", which is not an entity'],
    ['a dependency naming no entity',
      { web: entity({ dependsOn: ['missing'] }) },
      'entities.web.dependsOn names "missing", which is not an entity'],
    ['a whitelisted entity that is not a package',
      { web: entity({ whitelist: ['api'] }), api: entity({ home: ['/apps/api'] }) },
      'entities.web.whitelist names "api", which is not a package'],
    ['a whitelisted package without a review',
      { web: entity({ whitelist: ['design'] }), design: entity({ kind: 'package', home: ['/packages/design'] }) },
      'entities.web.whitelist names "design", a package without a review'],
    ['a circle of dependencies',
      { web: entity({ home: ['/apps/web'], dependsOn: ['api'] }), api: entity({ home: ['/apps/api'], dependsOn: ['web'] }) },
      'the entities web -> api -> web depend on each other in a circle'],
    ['two root entities',
      { base: entity({ kind: 'root', home: ['/tools'] }), other: entity({ kind: 'root', home: ['/scripts'] }) },
      'the entities base, other are each of kind root, and one at most is'],
  ])('%s is refused', (_label, entities, reason) => {
    expect(reasonOf(withEntities(entities))).toBe(reason);
  });
});

describe('one entity', () => {
  test.each([
    ['a key no entity has',
      entity({ owner: 'Alex Example' }),
      'entities.web."owner" is not a pipeline key; the keys are kind, home, summary, constitution, prepare, gates, phases, review, agents, '
        + 'whitelist, reach, dependsOn, concurrency'],
    ['no home', {
      kind: 'app', prepare: [], gates: [], phases: NO_PHASES
    }, 'entities.web.home is missing'],
    ['an empty home', entity({ home: [] }), 'entities.web.home names no folder'],
    ['a home not leading with /', entity({ home: ['apps/web'] }), 'entities.web.home names "apps/web", which is not a repository path leading with /'],
    ['an unknown kind', entity({ kind: 'library' }), 'entities.web.kind is not one of app, package, root'],
    ['a role set once for the whole forge',
      entity({ agents: { productOwner: { model: 'opus' } } }),
      'entities.web.agents."productOwner" is not a pipeline key; the keys are builder, reviewer, reReviewer, conflictReReviewer'],
    ['a concurrency that is not a positive whole number', entity({ concurrency: 0 }), 'entities.web.concurrency is not a positive whole number'],
    ['a gate in no phase', entity({ gates: [{ name: 'lint', run: 'bun run lint' }] }), 'the gate "lint" of entities.web.gates runs in no phase'],
    ['a phase naming no gate', entity({ phases: { build: ['lint'], review: [], merge: [] } }), 'entities.web.phases.build names "lint", which is not a gate'],
  ])('with %s is refused, naming the entity', (_label, web, reason) => {
    expect(reasonOf(withEntities({ web }))).toBe(reason);
  });
});
