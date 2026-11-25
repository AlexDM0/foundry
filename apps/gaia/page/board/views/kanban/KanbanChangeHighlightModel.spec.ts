/**
 * The change highlight as a diff of two consecutive boards. What matters: the first board marks nothing; a new card and a card whose state
 * moved are marked, an unchanged one is not; a hold counts as a move and a draft readied is new; a draft is no card, so it is never marked;
 * a card that went is not answered; the keys are the Kanban model's card keys, so the view marks the right card.
 */
import { describe, expect, test } from 'bun:test';

import { EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED }       from '../../testing/KanbanBoardFixture.ts';
import { exampleBoard, exampleFilingDraft, exampleTicket } from '../../testing/KanbanBoardFixture.ts';
import { KanbanChangeHighlightModel }                      from './KanbanChangeHighlightModel.ts';
import { DEFAULT_KANBAN_LAYOUT, KanbanModel }              from './KanbanModel.ts';

const { changedCardKeysBetween } = KanbanChangeHighlightModel;

describe('the change highlight', () => {
  test('the first board marks nothing, since there is nothing it changed from', () => {
    expect([...changedCardKeysBetween(null, exampleBoard({ tickets: [exampleTicket('001')] }))]).toEqual([]);
  });

  test('a new card and a moved card are marked, an unchanged one and one that went are not', () => {
    const previous = exampleBoard({ tickets: [exampleTicket('001'), exampleTicket('002'), exampleTicket('003')] });
    const current = exampleBoard({ tickets: [exampleTicket('001'), exampleTicket('002', { status: 'in-progress' }), exampleTicket('004')] });
    expect([...changedCardKeysBetween(previous, current)].sort()).toEqual(['ticket:002', 'ticket:004']);
  });

  test('a hold placed and a draft readied are marked, and a filing draft whose state moved is no card to mark', () => {
    const previous = exampleBoard({ tickets: [exampleTicket('010'), exampleTicket('011', { status: 'draft' })] });
    const current = exampleBoard({ tickets: [exampleTicket('010', { hold: '' }), exampleTicket('011')] });
    const withDraftMoved = {
      ...current,
      page: { ...current.page, facts: { ...current.page.facts, drafts: [exampleFilingDraft({ id: 'D7', state: 'resumable', openQuestionCount: 0 })] } },
    };
    expect([...changedCardKeysBetween(previous, withDraftMoved)].sort()).toEqual(['ticket:010', 'ticket:011']);
  });

  test('every key it marks is a card key of the Kanban model', () => {
    const previous = exampleBoard({ tickets: [] });
    const current = exampleBoard({ tickets: [exampleTicket('020'), exampleTicket('021', { status: 'draft' })] });
    const model = KanbanModel.kanbanModelOf(current, KanbanModel.kanbanFilterModelOf(current, [], 'filed'), DEFAULT_KANBAN_LAYOUT, EXAMPLE_SURROUNDINGS_SHOWING_ALL_FINISHED);
    const cardKeys = new Set(model.lanes.flatMap((lane) => lane.cards.map((card) => card.key)));
    const changed = [...changedCardKeysBetween(previous, current)];
    expect(changed.sort()).toEqual(['ticket:020']);
    expect(changed.every((cardKey) => cardKeys.has(cardKey))).toBe(true);
  });
});
