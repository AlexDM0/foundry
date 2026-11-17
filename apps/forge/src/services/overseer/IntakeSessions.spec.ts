/**
 * The entity map a product owner's brief receives. What matters: on a forge without entities the brief loses only its `{{entityMap}}`,
 * so it reads byte for byte as before; on a forge with entities it ends with the map, each entity's key, kind, homes and summary, and how
 * to give a ticket its entity with a reason, also when the brief has no placeholder (installed before it, or named by the pipeline), while
 * such a brief on a forge without entities stays byte for byte; and no other job's instructions change.
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

  test('of another job is left as it is', () => {
    const { board } = boardFixture({ pipeline: entityPipelineFixture() });

    expect(IntakeSessions.productOwnerInstructionsOf(board, BUILD_JOB, 'Build {{entityMap}}')).toBe('Build {{entityMap}}');
  });
});
