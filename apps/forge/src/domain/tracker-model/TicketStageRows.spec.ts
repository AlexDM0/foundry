/**
 * A crossing ticket's stage and seals on its row. What matters: a ticket whose row stores no stage reads none and is in `build`, so its
 * first move is into a package build; a move the stage table does not allow is refused as a programming error and leaves the row as it
 * was; a seal is added beside the seals the row holds; and a package review's bar is closed without a move of the ticket. Each stage start
 * and seal is logged as its own record; a package return (E41, E65) lifts only the returned package's seal, counts on the row from one,
 * and logs the lift, the return and the start in that order, while a move that is no return lifts and counts nothing. The owner agreed to
 * one way back (E45): a second return opens `second-return` once, keeps the stage and the count, and logs no return; a direct second
 * move is refused as a programming error.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, taskFixture, ticketFixture }     from '../../testing/BoardFixtures.ts';
import { ENTITY_FORGE_ENTITIES, entityForgePipelineOf } from '../../testing/EntityForgeFixture.ts';
import type { LogRecord }                               from './@types/LogRecord.ts';
import type { TicketStage }                             from './@types/Task.ts';
import type { Board }                                   from './Board.ts';

const AT = '2026-11-17T19:00:00+01:00';
const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;
const SECOND_RETURN_WORDING = {
  questions: [{
    question: 'Example question?', header: 'Example', multiSelect: false, options: []
  }],
  context: ''
};

function boardWithTheShopTicket(stage?: TicketStage): Board {
  return boardFixture({
    pipeline: entityForgePipelineOf('shop-crosses-into-ui-kit'),
    tasks:    [taskFixture({
      id: 1, ticket: '001', status: 'in-progress', ...(stage === undefined ? {} : { stage })
    })],
    tickets: [ticketFixture({
      id: '001', status: 'in-progress', task: 1, entity: SHOP.key
    })],
  }).board;
}

function loggedKindsOf(logged: readonly LogRecord[]): string[] {
  return logged.map((record) => record.kind);
}

describe('a crossing ticket\'s row', () => {
  test('stores no stage and no seal until the ticket crosses', () => {
    const board = boardWithTheShopTicket();

    expect(board.ticketStageOf('001')).toBeNull();
    expect(board.ticketSealsOf('001')).toEqual({});
    expect(board.tasks()[0]).not.toHaveProperty('stage');
  });

  test('moves from build into the package build, then into its review', () => {
    const board = boardWithTheShopTicket();
    board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT);
    board.moveTicketStage('001', { name: 'package-review', entity: UI_KIT.key }, AT);

    expect(board.ticketStageOf('001')).toEqual({ name: 'package-review', entity: UI_KIT.key });
  });

  test('refuses a move the stage table does not allow and keeps its stage', () => {
    const board = boardWithTheShopTicket();

    expect(() => board.moveTicketStage('001', { name: 'adapt', entity: SHOP.key }, AT)).toThrow('cannot move from the stage build to adapt');
    expect(board.ticketStageOf('001')).toBeNull();
  });

  test('adds a seal beside the seals it holds', () => {
    const board = boardWithTheShopTicket();
    board.sealTicketPackage('001', UI_KIT.key, 'example-seal', AT);
    board.sealTicketPackage('001', 'example-icons', 'example-icons-seal', AT);

    expect(board.ticketSealsOf('001')).toEqual({ [UI_KIT.key]: 'example-seal', 'example-icons': 'example-icons-seal' });
  });

  test('closes a package review\'s bar without moving the ticket', () => {
    const board = boardWithTheShopTicket();
    board.startReviewBar('001', { round: 1, owner: 'J1', stage: { name: 'package-review', entity: UI_KIT.key } }, AT);
    board.closeStageReviewBars('001', AT);

    expect(board.tasks().filter((task) => task.reviewOf === '001').map((task) => task.status)).toEqual(['delivered']);
    expect(board.tickets()[0]?.frontmatter.status).toBe('in-progress');
  });
});

describe('the log of a crossing ticket\'s stages', () => {
  test('logs each stage start with its stage and entity, and each seal with its package', () => {
    const board = boardWithTheShopTicket();
    const started = board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT).logged;
    const sealed  = board.sealTicketPackage('001', UI_KIT.key, 'example-seal', AT).logged;

    expect(started).toMatchObject([{ kind: 'stage-started', ticketId: '001', fields: { stage: 'package-build', entity: UI_KIT.key } }]);
    expect(sealed).toMatchObject([{ kind: 'seal-set', ticketId: '001', fields: { entity: UI_KIT.key, seal: 'example-seal' } }]);
  });

  test('a package return lifts only the returned package\'s seal, counts from one, and logs the lift, the return and the start', () => {
    const board = boardWithTheShopTicket({ name: 'adapt', entity: SHOP.key });
    board.sealTicketPackage('001', UI_KIT.key, 'example-seal', AT);
    board.sealTicketPackage('001', 'example-icons', 'example-icons-seal', AT);
    const { logged } = board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT);

    expect(loggedKindsOf(logged)).toEqual(['seal-lifted', 'package-return', 'stage-started']);
    expect(logged[1]).toMatchObject({ fields: { entity: UI_KIT.key, fromStage: 'adapt', returns: 1 } });
    expect(board.ticketSealsOf('001')).toEqual({ 'example-icons': 'example-icons-seal' });
    expect(board.tasks()[0]?.packageReturns).toBe(1);
  });

  test('a first return through returnTicketToThePackage moves the ticket and counts one', () => {
    const board = boardWithTheShopTicket({ name: 'review', entity: SHOP.key });
    const { logged } = board.returnTicketToThePackage('001', UI_KIT.key, () => SECOND_RETURN_WORDING, AT);

    expect(loggedKindsOf(logged)).toEqual(['package-return', 'stage-started']);
    expect(board.ticketStageOf('001')).toEqual({ name: 'package-build', entity: UI_KIT.key });
    expect(board.decisions()).toEqual([]);
  });

  test('a second return opens second-return once, keeps the stage and the count, and logs no return (E45)', () => {
    const board = boardWithTheShopTicket({ name: 'review', entity: SHOP.key });
    board.returnTicketToThePackage('001', UI_KIT.key, () => SECOND_RETURN_WORDING, AT);
    board.moveTicketStage('001', { name: 'package-review', entity: UI_KIT.key }, AT);
    board.moveTicketStage('001', { name: 'adapt', entity: SHOP.key }, AT);
    const { logged } = board.returnTicketToThePackage('001', UI_KIT.key, () => SECOND_RETURN_WORDING, AT);
    const again = board.returnTicketToThePackage('001', UI_KIT.key, () => SECOND_RETURN_WORDING, AT);

    expect(loggedKindsOf(logged)).toEqual(['decision-opened']);
    expect(again.logged).toEqual([]);
    expect(board.decisions()).toMatchObject([{ kind: 'second-return', ticketIds: ['001'], context: UI_KIT.key }]);
    expect(board.ticketStageOf('001')).toEqual({ name: 'adapt', entity: SHOP.key });
    expect(board.tasks()[0]?.packageReturns).toBe(1);
  });

  test('refuses a direct second return as a programming error', () => {
    const board = boardWithTheShopTicket({ name: 'review', entity: SHOP.key });
    board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT);
    board.moveTicketStage('001', { name: 'package-review', entity: UI_KIT.key }, AT);
    board.moveTicketStage('001', { name: 'adapt', entity: SHOP.key }, AT);

    expect(() => board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT)).toThrow('a second return opens the decision second-return');
    expect(board.ticketStageOf('001')).toEqual({ name: 'adapt', entity: SHOP.key });
  });

  test('a package review that does not hold goes back to its build without a return', () => {
    const board = boardWithTheShopTicket({ name: 'package-review', entity: UI_KIT.key });

    expect(loggedKindsOf(board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT).logged)).toEqual(['stage-started']);
    expect(board.tasks()[0]).not.toHaveProperty('packageReturns');
  });
});
