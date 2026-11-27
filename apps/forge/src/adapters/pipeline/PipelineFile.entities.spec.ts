/**
 * `pipeline.json` with entities: a stored file gets every refusal its entities earn, each naming the entity, and once nothing is wrong it
 * reads and writes back byte for byte; a setup record's draft reads the same but for the set check, so its refused entities are kept.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
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

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('pipeline-file-entities');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

const READ = 'read as readable';

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

/** A pipeline over `entities`, with `fields` over its top level. */
function withEntities(entities: Record<string, unknown>, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 5, prepare: [], gates: [], phases: NO_PHASES, entities, ...fields
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
  test('a pipeline with sound entities is read whole', () => {
    const reading = PipelineFile.documentReadingOf(withEntities(SOUND_ENTITIES, { agents: { productOwner: { model: 'opus' } }, approvals: { merge: true } }));
    expect(reading.verdict).toBe('readable');
    expect(reading.verdict === 'readable' ? Object.keys(reading.pipeline.entities ?? {}) : []).toEqual(['web', 'design-system']);
    expect(reading.verdict === 'readable' ? reading.pipeline.entities?.['web']?.dependsOn : []).toEqual(['design-system']);
  });

  test('a stored pipeline with entities is written back byte for byte', () => {
    const pipelineFilePath = join(scratchDirectory, 'pipeline.json');
    const pipeline = {
      version: 5, prepare: [], gates: [], phases: NO_PHASES, entities: SOUND_ENTITIES, assistant: true
    } as unknown as Pipeline;
    writeFileSync(pipelineFilePath, PipelineFile.contentsOf(pipeline));
    const reading = PipelineFile.read(pipelineFilePath);
    expect(reading.verdict === 'readable' ? PipelineFile.contentsOf(reading.pipeline) : reading.verdict).toBe(readFileSync(pipelineFilePath, 'utf8'));
  });

  test('an entity whose whitelist names a package is read with its whitelist, as a stored file and as a setup draft is', () => {
    expect(reasonOf(withEntities(SOUND_ENTITIES, { agents: { productOwner: { model: 'opus' } }, approvals: { merge: true } }))).toBe(READ);
    const reading = PipelineFile.documentReadingOf(PipelineFile.storedDocumentOf(withEntities(SOUND_ENTITIES) as unknown as Pipeline));
    expect(reading.verdict === 'readable' ? reading.pipeline.entities?.['web']?.whitelist : reading).toEqual(['design-system']);
  });

  test('an empty whitelist names no package and is read', () => {
    expect(reasonOf(withEntities({ ...SOUND_ENTITIES, web: { ...SOUND_ENTITIES.web, whitelist: [] } }))).toBe(READ);
  });

  test('the root entity\'s home may be the repository\'s root alone, as a client writes it', () => {
    expect(reasonOf(withEntities({ ...SOUND_ENTITIES, root: entity({ kind: 'root', home: ['/'] }) }))).toBe(READ);
  });

  test.each([
    ['an app', entity({ home: ['/'] })],
    ['a root entity with a second home', entity({ kind: 'root', home: ['/', '/tools'] })],
  ])('%s whose home is the repository\'s root is refused', (_label, web) => {
    expect(reasonOf(withEntities({ web }))).toStartWith('entities.web.home names "/", which is not a repository path leading with /');
  });

  test('a file of version 4, which once held entities, is older', () => {
    expect(PipelineFile.documentReadingOf(withEntities(SOUND_ENTITIES, { version: 4 }))).toEqual({ verdict: 'older' });
  });

  test('is written with version first, the entities and then the Assistant\'s switch last, each entity in the read\'s key order', () => {
    const pipeline = {
      assistant: true, version: 5, prepare: [], gates: [], phases: NO_PHASES, entities: SOUND_ENTITIES
    } as unknown as Pipeline;

    const written = JSON.parse(PipelineFile.contentsOf(pipeline)) as { entities: Record<string, object> };

    expect(Object.keys(written)).toEqual(['version', 'prepare', 'gates', 'phases', 'entities', 'assistant']);
    expect(written).toMatchObject({ version: 5, assistant: true });
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
    expect(reasonOf(withEntities(SOUND_ENTITIES, { reach: [] }))).toBe(READ);
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

describe('a setup record\'s draft', () => {
  const TWO_ROOTS = { base: entity({ kind: 'root', home: ['/tools'] }), other: entity({ kind: 'root', home: ['/scripts'] }) };

  test('a stored pipeline with two root entities is unreadable, while a draft with them reads, the refusal kept for User', () => {
    expect(reasonOf(withEntities(TWO_ROOTS))).toBe('the entities base, other are each of kind root, and one at most is');
    const reading = PipelineFile.draftReadingOf(withEntities(TWO_ROOTS));
    expect(reading.verdict === 'readable' ? Object.keys(reading.pipeline.entities ?? {}) : reading).toEqual(['base', 'other']);
  });

  test('a draft with two root entities is written in the read\'s order, as a stored pipeline is', () => {
    const draft = withEntities(TWO_ROOTS) as unknown as Pipeline;
    const text  = PipelineFile.draftContentsOf(draft);
    const reading = PipelineFile.draftReadingOf(JSON.parse(text));
    expect(reading.verdict === 'readable' ? PipelineFile.draftContentsOf(reading.pipeline) : reading.verdict).toBe(text);
    expect(Object.keys(JSON.parse(text) as object)[0]).toBe('version');
  });

  test('a draft whose entity is malformed on its own is still malformed', () => {
    const reading = PipelineFile.draftReadingOf(withEntities({ web: entity({ home: [] }) }));
    expect(reading.verdict).toBe('malformed');
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
