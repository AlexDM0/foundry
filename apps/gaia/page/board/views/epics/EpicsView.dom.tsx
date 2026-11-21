/**
 * The Epics view in a happy-dom document. What matters: an epic's description reaches the DOM only as the `srcdoc` of a frame whose
 * `sandbox` attribute is exactly the design's, and only once its disclosure opens, so a planted image handler, script or `javascript:` link
 * never becomes an element of the board's own document and runs nothing, while its summary shows as text; the title row heads the view;
 * the cards carry the epic marks, a one-at-a-time wave saying so in its head and leaving its ticket cards plain;
 * a ticket line opens its ticket form over the Epics tab and is marked while open; the epic the route points at is marked; and a window
 * that hides every epic says so in one line.
 * Live work pulses only while the board's stream is live. The view is a workplace of Flint.
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

import type { ConnectionState }      from '../../api/BoardEventStreamClient.ts';
import type { DetailItem }           from '../../shell/DetailRoute.ts';
import { FinishedWorkWindowContext } from '../../shell/FinishedWorkWindow.ts';
import { FIXTURE_TRACKER_ID }        from '../../testing/BoardStateFixture.ts';
import { routedOnTab }               from '../../testing/DetailRoutingFixture.ts';
import {
  EPICS_FIXTURE_NOW,
  epicsBoardFixture,
  PLANTED_EPIC_DESCRIPTION_HTML,
  SETTLED_FIXTURE_EPIC
} from '../../testing/EpicsBoardFixture.ts';
import { FinishedWorkUtil, type FinishedWorkChoice } from '../../utils/FinishedWorkUtil.ts';
import { EpicsView }                                 from './EpicsView.tsx';

interface RenderedEpicsOptions {
  readonly choice?:         FinishedWorkChoice;
  readonly pointedEpicKey?: string | null;
  readonly openItem?:       DetailItem | null;
  readonly onlySettled?:    boolean;
  readonly connection?:     ConnectionState;
}

const EPICS_FRAGMENT = `#forge/${FIXTURE_TRACKER_ID}/epics`;

function renderedEpics(options: RenderedEpicsOptions = {}) {
  const choice = options.choice ?? 'all';
  const nowEpochMilliseconds = EPICS_FIXTURE_NOW.getTime();
  const finishedWorkWindow = { choice, cutoffEpochMilliseconds: FinishedWorkUtil.cutoffEpochMillisecondsOf(choice, nowEpochMilliseconds), nowEpochMilliseconds };
  const board = options.onlySettled === true ? epicsBoardFixture([SETTLED_FIXTURE_EPIC]) : epicsBoardFixture();
  const view = <EpicsView board={board} pointedEpicKey={options.pointedEpicKey ?? null} connection={options.connection ?? 'live'} />;
  const routed = routedOnTab('epics', view, options.openItem ?? null);
  render(<FinishedWorkWindowContext.Provider value={finishedWorkWindow}>{routed.element}</FinishedWorkWindowContext.Provider>);
  return routed;
}

function cardNamed(title: string): HTMLElement {
  return screen.getByRole('article', { name: title });
}

afterEach(() => {
  cleanup();
});

describe('the description sandbox', () => {
  test('the summary is text, and the description becomes the srcdoc of a frame sandboxed exactly as the design says once opened', () => {
    renderedEpics();
    expect(cardNamed('Example checkout').querySelector('.board-epic-summary')?.textContent).toBe('Example summary');
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    act(() => {
      const disclosure = document.querySelector('details') as HTMLDetailsElement;
      disclosure.open = true;
      fireEvent(disclosure, new Event('toggle'));
    });
    const frames = [...document.querySelectorAll('iframe')];
    expect(frames).toHaveLength(1);
    expect(frames[0]?.getAttribute('sandbox')).toBe('allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    expect(frames[0]?.getAttribute('srcdoc')).toContain(PLANTED_EPIC_DESCRIPTION_HTML);
  });

  test('the planted image, script and link are no elements of the board\'s document and ran nothing', () => {
    renderedEpics();
    expect(document.querySelectorAll('img, script, a[href^="javascript:"]')).toHaveLength(0);
    expect((window as unknown as { plantedRan?: boolean }).plantedRan).toBeUndefined();
  });

  test('a description that says no more than its summary offers no disclosure', () => {
    renderedEpics();
    expect(cardNamed('Example billing').querySelector('details')).toBeNull();
  });
});

describe('the epic cards', () => {
  test('each card carries its slot, done mark, legend, facts, links, waves and newest-first ticket lines', () => {
    renderedEpics();
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => [card.getAttribute('aria-label'), card.dataset['epicSlot']])).toEqual([
      ['Example checkout', '1'], ['Example billing', '3'], ['Example archive', '2'],
    ]);
    const checkout = cardNamed('Example checkout');
    expect(checkout.querySelector('.board-epic-done')?.textContent).toBe('1 of 3 done');
    expect([...checkout.querySelectorAll('.board-epic-legend li')].map((item) => item.textContent)).toEqual(['Done 1', 'In progress 1', 'To do 1']);
    expect([...checkout.querySelectorAll('.board-epic-fact')].map((fact) => fact.textContent)).toEqual(['open2', 'done1', 'tokens12.4k', 'span10-28 08:00 → now · 1d 4h']);
    expect([...checkout.querySelectorAll('.board-epic-wave-name')].map((name) => name.textContent)).toEqual(['Done', 'Now', 'Wave 2']);
    expect([...checkout.querySelectorAll('.board-epic-ticket .design-system-mono-id')].map((id) => id.textContent)).toEqual(['#4', '#3', '#2']);
    expect(checkout.querySelector('.board-epic-also')?.getAttribute('title')).toBe('Also in Example billing');
    expect(checkout.hasAttribute('data-live')).toBe(true);
    const frees = checkout.querySelector('.board-epic-link-chip[data-frees]');
    expect([frees?.textContent, frees?.getAttribute('href')]).toEqual(['Example billingvia #3', `${EPICS_FRAGMENT}/epic/billing`]);
    expect(cardNamed('Example billing').querySelector('.board-epic-link-chip')?.getAttribute('href')).toBe(`${EPICS_FRAGMENT}/ticket/3`);
    expect(checkout.querySelector('.board-epic-link-empty')?.textContent).toBe('Nothing outside this epic');
  });

  test('the title row heads the view, and a one-at-a-time wave says so in its head while its ticket cards stay plain', () => {
    renderedEpics();
    expect(screen.getByRole('heading', { level: 2, name: 'Epics' })).toBeTruthy();
    const waves = [...cardNamed('Example checkout').querySelectorAll<HTMLElement>('.board-epic-wave')];
    expect(waves.map((wave) => [wave.hasAttribute('data-narrow'), wave.querySelector('.board-epic-wave-note')?.textContent ?? null])).toEqual([
      [false, null], [true, 'one at a time'], [false, null],
    ]);
    expect(document.querySelectorAll('.board-epic-wave-pill[data-narrow]')).toHaveLength(0);
  });

  test('a ticket line opens its ticket form over the Epics tab, and is marked while open', () => {
    const routed = renderedEpics({ openItem: { form: 'ticket', ticketId: '3' } });
    const lines = [...cardNamed('Example checkout').querySelectorAll('.board-epic-ticket')];
    expect(lines.map((line) => [line.getAttribute('href'), line.hasAttribute('data-selected')])).toEqual([
      [`${EPICS_FRAGMENT}/ticket/4`, false], [EPICS_FRAGMENT, true], [`${EPICS_FRAGMENT}/ticket/2`, false],
    ]);
    expect(routed.navigatedRoutes).toEqual([]);
  });

  test('the epic the route points at is marked, and only that one', () => {
    renderedEpics({ pointedEpicKey: 'billing' });
    expect([...document.querySelectorAll('.board-epic[data-selected]')].map((card) => card.getAttribute('aria-label'))).toEqual(['Example billing']);
  });

  test('a window that hides every epic says so in one line', () => {
    renderedEpics({ choice: '1h', onlySettled: true });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(document.querySelector('.board-epics-empty')?.textContent).toBe('No epic finished in the last hour.');
  });
});

test('the view is a workplace of Flint', () => {
  renderedEpics();
  expect(screen.getByRole('region', { name: 'Epics' }).hasAttribute('data-flint-workplace')).toBe(true);
});

test('live work pulses only while the board\'s stream is live', () => {
  renderedEpics({ connection: 'live' });
  expect(screen.getByRole('region', { name: 'Epics' }).dataset['freshness']).toBe('live');
  cleanup();
  renderedEpics({ connection: 'down' });
  expect(screen.getByRole('region', { name: 'Epics' }).dataset['freshness']).toBe('snapshot');
});
