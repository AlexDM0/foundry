/**
 * The detail panel's host over a stand-in Kanban card, in a happy-dom document laid out by hand. What matters: Enter on a card moves the
 * focus to × and Esc hands it back to the card, while a pointer open leaves the focus on the card; and while the panel is open the board
 * it covers carries its trailing room, its frozen lane width and the frame's cover, all gone again once it closes.
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
import { PANEL_GUTTER_PIXELS }                     from './PanelRoomModel.ts';

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
const VIEWPORT_WIDTH_PIXELS = 1600;
const BOARD_LEFT_PIXELS = 40;
const BOARD_WIDTH_PIXELS = 1520;
const LANE_WIDTH_PIXELS = 240;
const DETAIL_WIDTH_PIXELS = 480;
const COVERED_WIDTH_PIXELS = BOARD_LEFT_PIXELS + BOARD_WIDTH_PIXELS - (VIEWPORT_WIDTH_PIXELS - DETAIL_WIDTH_PIXELS);

function laidOut(element: Element, left: number, width: number): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value:        () => DOMRect.fromRect({
      x: left, y: 0, width, height: 400
    }),
  });
}

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

function renderBoard(): { readonly card: HTMLElement; readonly lanes: HTMLElement; readonly frame: HTMLElement } {
  render(<StandInBoard />);
  const lanes = document.querySelector<HTMLElement>('.bridge-kanban-lanes');
  const frame = document.querySelector<HTMLElement>('.bridge-kanban-frame');
  const lane = document.querySelector('.bridge-lane');
  if (lanes === null || frame === null || lane === null) throw new Error('the stand-in board did not render');
  laidOut(lanes, BOARD_LEFT_PIXELS, BOARD_WIDTH_PIXELS);
  laidOut(lane, BOARD_LEFT_PIXELS, LANE_WIDTH_PIXELS);
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: VIEWPORT_WIDTH_PIXELS });
  document.documentElement.style.setProperty('--detail-w', `${String(DETAIL_WIDTH_PIXELS)}px`);
  return { card: screen.getByRole('article', { name: 'Ticket #002' }), lanes, frame };
}

async function afterNextFrame(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document.documentElement, 'clientWidth');
  document.documentElement.style.removeProperty('--detail-w');
});

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

describe('the room beside the panel', () => {
  test('the covered board gains trailing room, its lane width frozen and the frame covered, all dropped once the panel closes', async () => {
    const { card, lanes, frame } = renderBoard();
    await act(async () => {
      fireEvent.click(card);
      await Promise.resolve();
    });
    await afterNextFrame();
    expect(lanes.hasAttribute('data-panel-room')).toBe(true);
    expect(lanes.style.getPropertyValue('--panel-room')).toBe(`${String(COVERED_WIDTH_PIXELS + PANEL_GUTTER_PIXELS)}px`);
    expect(lanes.style.getPropertyValue('--frozen-lane-width')).toBe(`${String(LANE_WIDTH_PIXELS)}px`);
    expect(frame.style.getPropertyValue('--panel-cover')).toBe(`${String(COVERED_WIDTH_PIXELS)}px`);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await Promise.resolve();
    });
    expect(lanes.hasAttribute('data-panel-room')).toBe(false);
    expect(lanes.style.getPropertyValue('--panel-room')).toBe('');
    expect(lanes.style.getPropertyValue('--frozen-lane-width')).toBe('');
    expect(frame.style.getPropertyValue('--panel-cover')).toBe('');
  });
});
