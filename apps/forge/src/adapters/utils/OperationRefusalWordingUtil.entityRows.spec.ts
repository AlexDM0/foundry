/**
 * The rows of `docs/reference/refusals.md` for three entity refusals: a person searches the page for the printed words, so each row's
 * fixed words occur in both sentences, and the command line's advice names `pipeline update`, never `pipeline setup`.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import type { OperationRefusalDetail } from '../../shared/OperationRefusal.ts';
import { PRODUCT_NAMES }               from '../../shared/constants/ProductNames.ts';
import { OperationRefusalWordingUtil } from './OperationRefusalWordingUtil.ts';

const REFUSALS_PAGE_TEXT = readFileSync(join(import.meta.dir, '..', '..', '..', 'docs', 'reference', 'refusals.md'), 'utf8');

const PIPELINE_SET_PER_ENTITY: OperationRefusalDetail = { kind: 'board-refusal', boardRefusal: { reason: 'pipeline-set-per-entity', entityKeys: ['root', 'web'] } };

interface DocumentedRow {
  readonly code:       string;
  readonly fixedWords: string;
  readonly detail:     OperationRefusalDetail;
}

const DOCUMENTED_ROWS: readonly DocumentedRow[] = [
  {
    code:       'entity-without-reason',
    fixedWords: 'entity was not changed: it needs',
    detail:     { kind: 'board-refusal', boardRefusal: { reason: 'entity-without-reason', ticketId: '004' } },
  },
  { code: 'pipeline-set-per-entity', fixedWords: 'each entity has its own prepare steps, gates and reach', detail: PIPELINE_SET_PER_ENTITY },
  {
    code:       'entities-in-a-folder',
    fixedWords: 'cannot hold entities: only a tracker at the repository\'s root holds them',
    detail:     { kind: 'entities-in-a-folder', filePath: '/example/apps/web/.forge/pipeline.json', projectPrefix: 'apps/web' },
  },
];

function rowOfCode(code: string): string | undefined {
  return REFUSALS_PAGE_TEXT.split('\n').find((line) => line.startsWith('| ') && line.includes(`| \`${code}\` |`));
}

describe('the refusals page rows of the entity refusals', () => {
  test.each(DOCUMENTED_ROWS.map((row) => [row.code, row] as const))('the %s row has fixed words both channels print', (_code, row) => {
    const refusal = new OperationRefusal('refused', row.detail);
    expect(rowOfCode(row.code)?.startsWith(`| \`${row.fixedWords}\` |`)).toBe(true);
    expect(OperationRefusalWordingUtil.messageOf(refusal)).toContain(row.fixedWords);
    expect(OperationRefusalWordingUtil.apiMessageOf(refusal)).toContain(row.fixedWords);
  });

  test('pipeline-set-per-entity advises pipeline update on the command line and on the page, never pipeline setup', () => {
    const commandLineSentence = OperationRefusalWordingUtil.messageOf(new OperationRefusal('refused', PIPELINE_SET_PER_ENTITY));
    expect(commandLineSentence).toContain(`\`${PRODUCT_NAMES.PROGRAM} pipeline update\``);
    expect(commandLineSentence).not.toContain('pipeline setup');
    expect(rowOfCode('pipeline-set-per-entity')).toContain('`pipeline update`');
    expect(rowOfCode('pipeline-set-per-entity')).not.toContain('`pipeline setup`');
  });
});
