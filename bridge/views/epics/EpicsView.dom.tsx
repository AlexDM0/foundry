/**
 * The Epics view in a happy-dom document. What matters: an epic's description reaches the DOM only as the `srcdoc` of a frame whose
 * `sandbox` attribute is exactly the design's, and only once its disclosure opens, so a planted image handler, script or `javascript:` link
 * never becomes an element of the Bridge's own document and runs nothing, while its summary shows as text; the title row heads the view;
 * the cards carry the epic marks, a one-at-a-time wave saying so in its head and leaving its ticket cards plain;
 * a ticket line opens its ticket form over the Epics tab and is marked while open; the epic the route points at is marked; and a window
 * that hides every epic says so in one line.
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

import type { DetailItem }           from '../../shell/DetailRoute.ts';
import { FinishedWorkWindowContext } from '../../shell/FinishedWorkWindow.ts';
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
}

function renderedEpics(options: RenderedEpicsOptions = {}) {
  const choice = options.choice ?? 'all';
  const nowEpochMilliseconds = EPICS_FIXTURE_NOW.getTime();
  const finishedWorkWindow = { choice, cutoffEpochMilliseconds: FinishedWorkUtil.cutoffEpochMillisecondsOf(choice, nowEpochMilliseconds), nowEpochMilliseconds };
  const board = options.onlySettled === true ? epicsBoardFixture([SETTLED_FIXTURE_EPIC]) : epicsBoardFixture();
  const routed = routedOnTab('epics', <EpicsView boardState={board} pointedEpicKey={options.pointedEpicKey ?? null} />, options.openItem ?? null);
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
    expect(cardNamed('Example checkout').querySelector('.bridge-epic-summary')?.textContent).toBe('Example summary');
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

  test('the planted image, script and link are no elements of the Bridge\'s document and ran nothing', () => {
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
    expect(checkout.querySelector('.bridge-epic-done')?.textContent).toBe('1 of 3 done');
    expect([...checkout.querySelectorAll('.bridge-epic-legend li')].map((item) => item.textContent)).toEqual(['Done 1', 'In progress 1', 'To do 1']);
    expect([...checkout.querySelectorAll('.bridge-epic-fact')].map((fact) => fact.textContent)).toEqual(['open2', 'done1', 'tokens12.4k', 'span10-28 08:00 → now · 1d 4h']);
    expect([...checkout.querySelectorAll('.bridge-epic-wave-name')].map((name) => name.textContent)).toEqual(['Done', 'Now', 'Wave 2']);
    expect([...checkout.querySelectorAll('.bridge-epic-ticket .design-system-mono-id')].map((id) => id.textContent)).toEqual(['#4', '#3', '#2']);
    expect(checkout.querySelector('.bridge-epic-also')?.getAttribute('title')).toBe('Also in Example billing');
    expect(checkout.hasAttribute('data-live')).toBe(true);
    const frees = checkout.querySelector('.bridge-epic-link-chip[data-frees]');
    expect([frees?.textContent, frees?.getAttribute('href')]).toEqual(['Example billingvia #3', '#epics/epic/billing']);
    expect(cardNamed('Example billing').querySelector('.bridge-epic-link-chip')?.getAttribute('href')).toBe('#epics/ticket/3');
    expect(checkout.querySelector('.bridge-epic-link-empty')?.textContent).toBe('Nothing outside this epic');
  });

  test('the title row heads the view, and a one-at-a-time wave says so in its head while its ticket cards stay plain', () => {
    renderedEpics();
    expect(screen.getByRole('heading', { level: 2, name: 'Epics' })).toBeTruthy();
    const waves = [...cardNamed('Example checkout').querySelectorAll<HTMLElement>('.bridge-epic-wave')];
    expect(waves.map((wave) => [wave.hasAttribute('data-narrow'), wave.querySelector('.bridge-epic-wave-note')?.textContent ?? null])).toEqual([
      [false, null], [true, 'one at a time'], [false, null],
    ]);
    expect(document.querySelectorAll('.bridge-epic-wave-pill[data-narrow]')).toHaveLength(0);
  });

  test('a ticket line opens its ticket form over the Epics tab, and is marked while open', () => {
    const routed = renderedEpics({ openItem: { form: 'ticket', ticketId: '3' } });
    const lines = [...cardNamed('Example checkout').querySelectorAll('.bridge-epic-ticket')];
    expect(lines.map((line) => [line.getAttribute('href'), line.hasAttribute('data-selected')])).toEqual([
      ['#epics/ticket/4', false], ['#epics', true], ['#epics/ticket/2', false],
    ]);
    expect(routed.navigatedRoutes).toEqual([]);
  });

  test('the epic the route points at is marked, and only that one', () => {
    renderedEpics({ pointedEpicKey: 'billing' });
    expect([...document.querySelectorAll('.bridge-epic[data-selected]')].map((card) => card.getAttribute('aria-label'))).toEqual(['Example billing']);
  });

  test('a window that hides every epic says so in one line', () => {
    renderedEpics({ choice: '1h', onlySettled: true });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(document.querySelector('.bridge-epics-empty')?.textContent).toBe('No epic finished in the last hour.');
  });
});
