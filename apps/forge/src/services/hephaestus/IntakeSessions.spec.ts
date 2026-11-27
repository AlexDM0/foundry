/**
 * The entity map a product owner's brief receives: on a forge without entities the brief reads byte for byte as before; on one with entities
 * it ends with the map, each entity's key, kind, homes, summary and dependencies, and how to file work per entity, also when the brief has
 * no `{{entityMap}}` placeholder. No other job's instructions change.
 */
import { readFileSync }           from 'node:fs';
import { describe, expect, test } from 'bun:test';

import type { Job }                            from '../../lib/tracker-model/@types/Job.ts';
import { PipelineUtil }                        from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { resourceFilePathOf }                  from '../../shared/ResourceFilePath.ts';
import { PRODUCT_NAMES }                       from '../../shared/constants/ProductNames.ts';
import { boardFixture, entityPipelineFixture } from '../../testing/BoardFixtures.ts';
import { IntakeSessions }                      from './IntakeSessions.ts';

const PRODUCT_OWNER_BRIEF = readFileSync(resourceFilePathOf('prompts', 'ProductOwnerPrompt.md'), 'utf8');

const PRODUCT_OWNER_JOB = { id: 'J3', kind: 'product-owner', role: 'product-owner' } as unknown as Readonly<Job>;

const BUILD_JOB = { id: 'J4', kind: 'build', role: 'builder' } as unknown as Readonly<Job>;

describe('a product owner\'s brief', () => {
  test('on a forge without entities loses only its entity map placeholder', () => {
    const { board } = boardFixture({ pipeline: PipelineUtil.minimalPipelineOf() });

    const brief = IntakeSessions.productOwnerInstructionsOf(board, PRODUCT_OWNER_JOB, PRODUCT_OWNER_BRIEF);

    expect(brief).toBe(PRODUCT_OWNER_BRIEF.replace('{{entityMap}}', ''));
    expect(brief.endsWith('An incomplete draft stays a draft.\n')).toBe(true);
  });

  test('on a forge with entities ends with the map of every entity and how to give a ticket its entity with a reason', () => {
    const pipeline = entityPipelineFixture();
    const web = pipeline.entities?.['web'];
    if (web !== undefined) web.summary = 'The storefront.\nIts pages and basket.';
    const { board } = boardFixture({ pipeline });

    const brief = IntakeSessions.productOwnerInstructionsOf(board, PRODUCT_OWNER_JOB, PRODUCT_OWNER_BRIEF);

    expect(brief.startsWith(PRODUCT_OWNER_BRIEF.slice(0, PRODUCT_OWNER_BRIEF.indexOf('{{entityMap}}')))).toBe(true);
    expect(brief).not.toContain('{{entityMap}}');
    expect(brief).toContain('- `root` (root): `/`.\n');
    expect(brief).toContain('- `web` (app): `/apps/web`. The storefront. Its pages and basket.\n');
    expect(brief).toContain('- `design-system` (package): `/packages/design-system`.\n');
    expect(brief).toContain(`\`${PRODUCT_NAMES.PROGRAM} ticket entity <id> <key> --reason "<reason>"\``);
    expect(brief.endsWith('Do not guess.\n')).toBe(true);
  });

  test('without the placeholder on a forge with entities ends with the map once, and on a forge without entities stays as it was', () => {
    const olderBrief = PRODUCT_OWNER_BRIEF.replace('{{entityMap}}', '');
    const withEntities = boardFixture({ pipeline: entityPipelineFixture() }).board;
    const withoutEntities = boardFixture({ pipeline: PipelineUtil.minimalPipelineOf() }).board;

    const brief = IntakeSessions.productOwnerInstructionsOf(withEntities, PRODUCT_OWNER_JOB, olderBrief);

    expect(brief).toBe(IntakeSessions.productOwnerInstructionsOf(withEntities, PRODUCT_OWNER_JOB, PRODUCT_OWNER_BRIEF));
    expect(brief.split('- `web` (app)').length).toBe(2);
    expect(brief).toContain(`\`${PRODUCT_NAMES.PROGRAM} ticket entity <id> <key> --reason "<reason>"\``);
    expect(IntakeSessions.productOwnerInstructionsOf(withoutEntities, PRODUCT_OWNER_JOB, olderBrief)).toBe(olderBrief);
  });

  test('on a forge with entities lists what each entity depends on, files one ticket per entity and orders them package first (E80)', () => {
    const pipeline = entityPipelineFixture();
    const web = pipeline.entities?.['web'];
    if (web !== undefined) web.dependsOn = ['design-system'];
    const { board } = boardFixture({ pipeline });

    const brief = IntakeSessions.productOwnerInstructionsOf(board, PRODUCT_OWNER_JOB, PRODUCT_OWNER_BRIEF);

    expect(brief).toContain('- `web` (app): `/apps/web`. Depends on `design-system`.\n');
    expect(brief).toContain('- `design-system` (package): `/packages/design-system`.\n');
    expect(brief).toContain('file one ticket for each entity.');
    expect(brief).toContain('A ticket of a package comes before the\n  tickets of the entities that depend on that package.');
    expect(brief).toContain('`--depends-on <id>`');
    expect(brief).toContain('put them in one group with `--group <name>`');
  });

  test('on a forge with entities tells intake to ask User when it cannot find the entity of a ticket (E81)', () => {
    const { board } = boardFixture({ pipeline: entityPipelineFixture() });

    const brief = IntakeSessions.productOwnerInstructionsOf(board, PRODUCT_OWNER_JOB, PRODUCT_OWNER_BRIEF);

    expect(brief).toContain('- When you cannot find the entity of a ticket, ask User. Do not guess.\n');
  });

  test('on a forge with entities files a change to every entity by expand and contract or as one group, never one job over two entities (E82)', () => {
    const { board } = boardFixture({ pipeline: entityPipelineFixture() });

    const brief = IntakeSessions.productOwnerInstructionsOf(board, PRODUCT_OWNER_JOB, PRODUCT_OWNER_BRIEF);

    expect(brief).toContain('For a mechanical change to every entity, such as a rename or a tool upgrade');
    expect(brief).toContain('That ticket adds the new name and keeps the old name.');
    expect(brief).toContain('Then file one ticket that removes the old name.');
    expect(brief).toContain('- File one group with one ticket for each entity.');
    expect(brief).toContain('A job changes the files of one entity only.');
  });

  test('on a forge with entities files research for the whole repository in the root entity (E84)', () => {
    const { board } = boardFixture({ pipeline: entityPipelineFixture() });

    const brief = IntakeSessions.productOwnerInstructionsOf(board, PRODUCT_OWNER_JOB, PRODUCT_OWNER_BRIEF);

    expect(brief).toContain('- Research for the whole repository is a ticket of the entity `root`.\n');
  });

  test('of another job is left as it is', () => {
    const { board } = boardFixture({ pipeline: entityPipelineFixture() });

    expect(IntakeSessions.productOwnerInstructionsOf(board, BUILD_JOB, 'Build {{entityMap}}')).toBe('Build {{entityMap}}');
  });
});
