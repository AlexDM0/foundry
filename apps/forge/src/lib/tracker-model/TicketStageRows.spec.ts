/**
 * A crossing ticket's stage and seals on its row. What matters: a ticket whose row stores no stage reads none and is in `build`, so its
 * first move is into a package build; a move the stage table does not allow is refused as a programming error and leaves the row as it
 * was; a seal is added beside the seals the row holds; a package review's bar is closed without a move of the ticket; and a package return
 * lifts only that package's seal, counts the return and goes back to the package's build, from `adapt` or the home review only.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, taskFixture, ticketFixture }     from '../../testing/BoardFixtures.ts';
import { ENTITY_FORGE_ENTITIES, entityForgePipelineOf } from '../../testing/EntityForgeFixture.ts';
import type { Board }                                   from './Board.ts';

const AT = '2026-11-17T19:00:00+01:00';
const { SHOP, UI_KIT } = ENTITY_FORGE_ENTITIES;

function boardWithTheShopTicket(): Board {
  return boardFixture({
    pipeline: entityForgePipelineOf('shop-crosses-into-ui-kit'),
    tasks:    [taskFixture({ id: 1, ticket: '001', status: 'in-progress' })],
    tickets:  [ticketFixture({
      id: '001', status: 'in-progress', task: 1, entity: SHOP.key
    })],
  }).board;
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

  test('a package return lifts only that package\'s seal, counts the return and goes back to the package\'s build', () => {
    const board = boardWithTheShopTicket();
    board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT);
    board.moveTicketStage('001', { name: 'package-review', entity: UI_KIT.key }, AT);
    board.sealTicketPackage('001', UI_KIT.key, 'example-seal', AT);
    board.sealTicketPackage('001', 'example-icons', 'example-icons-seal', AT);
    board.moveTicketStage('001', { name: 'review', entity: SHOP.key }, AT);

    board.returnTicketToPackage('001', UI_KIT.key, AT);

    expect(board.ticketStageOf('001')).toEqual({ name: 'package-build', entity: UI_KIT.key });
    expect(board.ticketSealsOf('001')).toEqual({ 'example-icons': 'example-icons-seal' });
    expect(board.ticketPackageReturnsOf('001')).toBe(1);
  });

  test('a package return of the one sealed package leaves the row with no seals key', () => {
    const board = boardWithTheShopTicket();
    board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT);
    board.moveTicketStage('001', { name: 'package-review', entity: UI_KIT.key }, AT);
    board.sealTicketPackage('001', UI_KIT.key, 'example-seal', AT);
    board.moveTicketStage('001', { name: 'adapt', entity: SHOP.key }, AT);

    board.returnTicketToPackage('001', UI_KIT.key, AT);

    expect(board.tasks()[0]).not.toHaveProperty('seals');
    expect(board.ticketPackageReturnsOf('001')).toBe(1);
  });

  test('refuses a package return from a stage that is not adapt or the home review and keeps the row', () => {
    const board = boardWithTheShopTicket();
    board.moveTicketStage('001', { name: 'package-build', entity: UI_KIT.key }, AT);
    board.moveTicketStage('001', { name: 'package-review', entity: UI_KIT.key }, AT);

    expect(() => board.returnTicketToPackage('001', UI_KIT.key, AT)).toThrow('cannot return to a package build from the stage package-review');
    expect(board.ticketPackageReturnsOf('001')).toBe(0);
  });
});
