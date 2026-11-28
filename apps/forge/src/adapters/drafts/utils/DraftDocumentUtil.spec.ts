/**
 * The filing draft's `entity` and `crosses` keys. What matters: a draft stored without them reads and writes back byte for byte, so a
 * forge without entities never changes a draft file; one with them reads them back and keeps them in place; and a value of the wrong
 * shape is a `malformed` verdict, never a throw.
 */

import { describe, expect, test } from 'bun:test';
import type { Draft }             from '../../../domain/tracker-model/@types/Draft.ts';
import { DraftDocumentUtil }      from './DraftDocumentUtil.ts';

const DRAFT_WITHOUT_ENTITY = `${JSON.stringify({
  version:            1,
  id:                 'D1',
  title:              'Tidy the checkout seed data',
  request:            'Alex Example asks for tidier seed data.\r\n',
  openedAt:           '2026-11-17T09:00:00+01:00',
  claim:              { owner: 'product-owner', claimedAt: '2026-11-17T09:00:00+01:00' },
  notes:              [],
  questions:          [],
  nextNoteNumber:     1,
  nextQuestionNumber: 1,
  pairedWith:         'Alex Example',
}, null, 2)}\n`;

const DRAFT_WITH_ENTITY = DRAFT_WITHOUT_ENTITY.replace(
  '"nextQuestionNumber": 1,\n',
  '"nextQuestionNumber": 1,\n  "entity": "checkout-app",\n  "crosses": [\n    "design-system"\n  ],\n',
);

function parsedDraft(text: string): Draft {
  const parsing = DraftDocumentUtil.parsedDraftDocumentOf(text);
  if (parsing.verdict !== 'parsed') throw new Error(`expected a parsed draft, got "${parsing.problem.code}"`);
  return parsing.draft;
}

describe('entity and crosses on a filing draft', () => {
  test('a draft without the keys reads neither and writes back byte for byte', () => {
    const draft = parsedDraft(DRAFT_WITHOUT_ENTITY);

    expect(Object.hasOwn(draft, 'entity')).toBe(false);
    expect(Object.hasOwn(draft, 'crosses')).toBe(false);
    expect(DraftDocumentUtil.draftDocumentTextOf(draft)).toBe(DRAFT_WITHOUT_ENTITY);
  });

  test('a draft with the keys reads them back, keeps them out of extra and writes back byte for byte', () => {
    const draft = parsedDraft(DRAFT_WITH_ENTITY);

    expect(draft.entity).toBe('checkout-app');
    expect(draft.crosses).toEqual(['design-system']);
    expect(draft.extra).toEqual([['pairedWith', 'Alex Example']]);
    expect(DraftDocumentUtil.draftDocumentTextOf(draft)).toBe(DRAFT_WITH_ENTITY);
  });

  test('setting the keys writes them after the item numbers, and removing them leaves the draft as one that never had them', () => {
    const draft = parsedDraft(DRAFT_WITHOUT_ENTITY);
    draft.entity  = 'checkout-app';
    draft.crosses = ['design-system'];

    expect(DraftDocumentUtil.draftDocumentTextOf(draft)).toBe(DRAFT_WITH_ENTITY);
    delete draft.entity;
    delete draft.crosses;
    expect(DraftDocumentUtil.draftDocumentTextOf(draft)).toBe(DRAFT_WITHOUT_ENTITY);
  });

  test('a blank entity or a crosses that is not a list of keys is malformed', () => {
    expect(DraftDocumentUtil.parsedDraftDocumentOf(DRAFT_WITH_ENTITY.replace('"checkout-app"', '" "'))).toEqual({
      verdict: 'malformed',
      problem: { code: 'entity-not-an-entity-key', field: 'entity' },
    });
    expect(DraftDocumentUtil.parsedDraftDocumentOf(DRAFT_WITH_ENTITY.replace('"design-system"', '7'))).toEqual({
      verdict: 'malformed',
      problem: { code: 'crosses-malformed', field: 'crosses' },
    });
  });
});
