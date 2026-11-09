/**
 * The detail panel's host over a stand-in Kanban card. What matters: Enter on a card moves the
 * focus to × and Esc hands it back to the card, while a pointer open leaves the focus on the card.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useState, type KeyboardEvent } from 'react';

import type { BoardStateDocument }                 from '../@types/BoardStateDocument.ts';
import { exampleDetailBoard, exampleDetailTicket } from '../testing/DetailBoardFixture.ts';
import { fakeControlSurroundingsOf }               from '../testing/FakeControlSurroundings.ts';
import { ControlSurroundingsContext }              from './ControlAvailability.ts';
import { DetailPanelHost }                         from './DetailPanelHost.tsx';
import { DetailRoute, type DetailItem }            from './DetailRoute.ts';
import { DetailRoutingContext, detailRoutingOf }   from './DetailRouting.ts';

// The host reads only the detail fields of the board, as the Overseer sends them beside the rest.
const BOARD = {
  project:   'Example Agency',
  jobs:      [],
  decisions: [],
  incidents: [],
  overseer:  { state: 'serving', paused: false, codeVersion: 'code-1' },
  usage:     null,
  ...exampleDetailBoard({ tickets: [exampleDetailTicket('002')], withoutEpics: true }),
} as unknown as BoardStateDocument;

const CARD_ITEM: DetailItem = { form: 'ticket', ticketId: '002' };

function StandInBoard() {
  const [openItem, setOpenItem] = useState<DetailItem | null>(null);
  const routing = detailRoutingOf('kanban', openItem, (route) => setOpenItem(DetailRoute.detailItemOf(route.item)));
  const openOnKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    routing.toggle(CARD_ITEM);
  };
  return (
    <ControlSurroundingsContext.Provider value={fakeControlSurroundingsOf('enabled').surroundings}>
      <DetailRoutingContext.Provider value={routing}>
        <div className="bridge-kanban-frame">
          <div className="bridge-kanban-lanes">
            <section className="bridge-lane">
              <article
                className="bridge-kanban-card"
                data-ticket-id="002"
                data-selected={routing.isOpen(CARD_ITEM) ? '' : undefined}
                tabIndex={0}
                aria-label="Ticket #002"
                onClick={() => routing.toggle(CARD_ITEM)}
                onKeyDown={openOnKey}
              />
            </section>
          </div>
        </div>
        <DetailPanelHost boardState={BOARD} item={openItem} todayCalendarDate="2026-09-18" />
      </DetailRoutingContext.Provider>
    </ControlSurroundingsContext.Provider>
  );
}

function renderBoard(): { readonly card: HTMLElement } {
  render(<StandInBoard />);
  return { card: screen.getByRole('article', { name: 'Ticket #002' }) };
}

afterEach(cleanup);

describe('the focus', () => {
  test('Enter on a card moves the focus to ×, and Esc hands it back to the card', async () => {
    const { card } = renderBoard();
    card.focus();
    await act(async () => {
      fireEvent.keyDown(card, { key: 'Enter' });
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
      await Promise.resolve();
    });
    expect(screen.queryByRole('complementary', { name: 'Ticket #002' })).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  test('a pointer open leaves the focus on the card', async () => {
    const { card } = renderBoard();
    await act(async () => {
      fireEvent.pointerDown(card);
      card.focus();
      fireEvent.click(card);
      await Promise.resolve();
    });
    expect(screen.getByRole('complementary', { name: 'Ticket #002' })).toBeDefined();
    expect(document.activeElement).toBe(card);
  });
});
