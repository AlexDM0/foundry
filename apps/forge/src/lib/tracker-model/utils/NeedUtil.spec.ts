/**
 * A need's completeness and its identity. What matters: a blank entity or title is a gap of its own, the body's gaps are exactly the
 * readiness reading the caller passes, in that order; and a need is the same need only for the same job, entity and title.
 */
import { expect, test } from 'bun:test';

import type { DeclaredNeed, NeedDeclaration } from '../@types/Need.ts';
import type { ReadinessGap }                  from '../@types/Ticket.ts';
import { NeedUtil }                           from './NeedUtil.ts';

const DECLARATION: NeedDeclaration = { entity: 'design-system', title: 'Export the basket total', body: 'A complete body' };

const NO_GAPS = (): ReadinessGap[] => [];

const BRIEF_MISSING = (): ReadinessGap[] => ['brief-missing'];

test('a declaration with an entity, a title and a complete body has no gap', () => {
  expect(NeedUtil.gapsOf(DECLARATION, NO_GAPS)).toEqual([]);
});

test('a blank entity and a blank title are gaps before the body\'s own', () => {
  expect(NeedUtil.gapsOf({ ...DECLARATION, entity: ' ', title: '' }, BRIEF_MISSING)).toEqual(['entity-missing', 'title-missing', 'brief-missing']);
});

test('the body is read by the reading passed, with the body as written', () => {
  const readBodies: string[] = [];
  NeedUtil.gapsOf(DECLARATION, (body) => {
    readBodies.push(body);
    return [];
  });
  expect(readBodies).toEqual(['A complete body']);
});

test('a need declared before is the one of the same job, entity and title', () => {
  const stored: DeclaredNeed = { ...DECLARATION, jobId: 'J4', ticketIds: ['003'] };
  expect(NeedUtil.needDeclaredBefore([stored], 'J4', { ...DECLARATION, body: 'Another body' })).toBe(stored);
  expect(NeedUtil.needDeclaredBefore([stored], 'J5', DECLARATION)).toBeUndefined();
  expect(NeedUtil.needDeclaredBefore([stored], 'J4', { ...DECLARATION, entity: 'root' })).toBeUndefined();
  expect(NeedUtil.needDeclaredBefore([stored], 'J4', { ...DECLARATION, title: 'Another title' })).toBeUndefined();
});
