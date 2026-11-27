/**
 * The finished-work filter at the tab bar's right end: its line and menu, the focus handed back to the line on every close, the choice stored
 * under `<STORAGE_PREFIX>:<trackerId>:visibility` with the retired `recent` read as the default, and each span's count.
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

import type { PreferenceStore }   from '../preferences/PreferenceStore.ts';
import { boardPreferenceStoreOf } from '../preferences/PreferenceStore.ts';
import {
  FINISHED_EPIC,
  FIXTURE_NOW,
  FIXTURE_TICKETS,
  OPEN_EPIC
} from '../testing/BoardStateFixture.ts';
import { EXAMPLE_PAGE_LIMITS } from '../testing/TimestampSlicesFixture.ts';
import { FinishedWorkUtil }    from '../utils/FinishedWorkUtil.ts';
import {
  FinishedWorkFilter,
  useFinishedWorkChoice,
  type FilterLineEpic,
  type FinishedWorkCount
} from './FinishedWorkFilter.tsx';

const STORED_KEY = 'gaia:board:example-tracker:visibility';

const COUNTED_TICKETS: FinishedWorkCount = { noun: 'ticket', finishedMoments: FIXTURE_TICKETS.map(FinishedWorkUtil.ticketFinishedEpochMillisecondsOf) };

function storeOver(storage: Map<string, string>): PreferenceStore {
  return boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
}

interface FilterProps {
  readonly store:              PreferenceStore;
  readonly counted?:           FinishedWorkCount;
  readonly lineEpic?:          FilterLineEpic | null;
  readonly onResetTabFilters?: () => void;
}

function Filter({
  store, counted = COUNTED_TICKETS, lineEpic = null, onResetTabFilters
}: FilterProps) {
  const [choice, choose] = useFinishedWorkChoice(store);
  return (
    <FinishedWorkFilter
      choice={choice}
      onChoice={choose}
      tickets={FIXTURE_TICKETS}
      epics={[OPEN_EPIC, FINISHED_EPIC]}
      counted={counted}
      nowEpochMilliseconds={FIXTURE_NOW.getTime()}
      durationUnits={EXAMPLE_PAGE_LIMITS}
      tabSections={<section aria-label="Example tab section" />}
      lineEpic={lineEpic}
      {...(onResetTabFilters === undefined ? {} : { onResetTabFilters })}
    />
  );
}

function filterLine(): HTMLElement {
  return document.querySelector<HTMLElement>('.board-filter-line') ?? document.body;
}

function spanButton(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${label}:`) });
}

function sinceField(): HTMLInputElement {
  return screen.getByLabelText('or since');
}

function openMenu(): void {
  act(() => {
    fireEvent.click(filterLine());
  });
}

afterEach(() => {
  cleanup();
});

describe('the filter line', () => {
  test('reads the hiding window in bold and opens the menu on the pressed span; Esc closes it and hands the focus back', () => {
    render(<Filter store={storeOver(new Map())} />);
    expect(filterLine().textContent).toBe('Hiding closed > 1 day');
    expect(filterLine().querySelector('strong')?.textContent).toBe('1 day');
    openMenu();
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeDefined();
    expect(document.activeElement).toBe(spanButton('last day'));
    let escapeReachedLaterListener = false;
    const laterListener = (event: KeyboardEvent): void => {
      escapeReachedLaterListener = !event.defaultPrevented;
    };
    document.addEventListener('keydown', laterListener);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    document.removeEventListener('keydown', laterListener);
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
    expect(document.activeElement).toBe(filterLine());
    expect(escapeReachedLaterListener).toBe(false);
  });

  test('a second click on the line closes the menu and focuses the line, and a click outside closes it without', () => {
    render(<Filter store={storeOver(new Map())} />);
    openMenu();
    openMenu();
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
    expect(document.activeElement).toBe(filterLine());
    openMenu();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
    expect(document.activeElement).not.toBe(filterLine());
  });

  test('focus leaving the menu closes it without handing the focus back, and focus moving inside it does not', () => {
    render(
      <>
        <Filter store={storeOver(new Map())} />
        <button type="button">Example outside</button>
      </>,
    );
    openMenu();
    act(() => {
      spanButton('all').focus();
    });
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeNull();
    const outside = screen.getByRole('button', { name: 'Example outside' });
    act(() => {
      outside.focus();
    });
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  test('names the pressed epic after the window, with its swatch, and the no-epic row without one', () => {
    const { rerender } = render(<Filter store={storeOver(new Map())} lineEpic={{ title: 'Example checkout +1', slot: 2 }} />);
    expect(filterLine().textContent).toBe('Hiding closed > 1 day·Example checkout +1');
    expect(filterLine().querySelector('.board-filter-epic .board-epic-swatch')?.getAttribute('data-epic-slot')).toBe('2');
    rerender(<Filter store={storeOver(new Map())} lineEpic={{ title: 'no epic', slot: null }} />);
    expect(filterLine().querySelector('.board-filter-epic .board-epic-swatch')).toBeNull();
  });
});

describe('the stored choice', () => {
  test('a stored choice under the page\'s key is read, and the default removes the key again', () => {
    const storage = new Map([[STORED_KEY, 'all']]);
    render(<Filter store={storeOver(storage)} />);
    expect(filterLine().textContent).toBe('Showing all closed');
    openMenu();
    act(() => {
      fireEvent.click(spanButton('last day'));
    });
    expect(storage.has(STORED_KEY)).toBe(false);
    act(() => {
      fireEvent.click(spanButton('last hour'));
    });
    expect(storage.get(STORED_KEY)).toBe('1h');
  });

  test('the retired recent reads as the default', () => {
    render(<Filter store={storeOver(new Map([[STORED_KEY, 'recent']]))} />);
    openMenu();
    expect(spanButton('last day').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the menu', () => {
  test('each span counts what it would show and names the count, the hidden work is named, and show all and Reset filters set all and the default', () => {
    const storage = new Map<string, string>();
    let tabFiltersReset = 0;
    render(<Filter store={storeOver(storage)} onResetTabFilters={() => { tabFiltersReset += 1; }} />);
    openMenu();
    expect(['last hour', 'last day', '3 days', 'all'].map((label) => spanButton(label).textContent)).toEqual(['hour 0', 'day 2', '3 days 2', 'all 3']);
    expect(spanButton('last day').getAttribute('aria-label')).toBe('last day: 2 finished tickets shown');
    expect(screen.getByText('1 ticket · 1 epic hidden')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Example tab section' })).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'show all' }));
    });
    expect(storage.get(STORED_KEY)).toBe('all');
    expect(document.activeElement).toBe(spanButton('all'));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    });
    expect(storage.has(STORED_KEY)).toBe(false);
    expect(tabFiltersReset).toBe(1);
  });

  test('on the Progress tab the spans count finished rows as tasks', () => {
    render(<Filter store={storeOver(new Map())} counted={{ noun: 'task', finishedMoments: [FIXTURE_NOW.getTime() - 1000, null] }} />);
    openMenu();
    expect(spanButton('last hour').getAttribute('aria-label')).toBe('last hour: 1 finished task shown');
  });

  test('each choice is announced with its window and what it hides', () => {
    render(<Filter store={storeOver(new Map())} />);
    openMenu();
    act(() => {
      fireEvent.click(spanButton('all'));
    });
    expect(document.querySelector('.board-visually-hidden')?.textContent).toBe('Showing unfinished work and work finished ever. Nothing hidden.');
  });

  test('a chosen day is marked with its midnight and how far back it is, and opening the menu focuses the field', () => {
    const storage = new Map<string, string>();
    render(<Filter store={storeOver(storage)} />);
    openMenu();
    act(() => {
      fireEvent.change(sinceField(), { target: { value: '2026-10-27' } });
    });
    expect(storage.get(STORED_KEY)).toBe('since-2026-10-27');
    expect(sinceField().hasAttribute('data-chosen')).toBe(true);
    expect(document.querySelector('.board-filter-since-resolved')?.textContent).toBe('from 2026-10-27 00:00 · 2d 12h back');
    act(() => {
      fireEvent.keyDown(sinceField(), { key: 'Enter' });
    });
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
    expect(document.activeElement).toBe(filterLine());
    openMenu();
    expect(document.activeElement).toBe(sinceField());
  });

  test('a day after today is refused and nothing is chosen', () => {
    const storage = new Map<string, string>();
    render(<Filter store={storeOver(storage)} />);
    openMenu();
    act(() => {
      fireEvent.change(sinceField(), { target: { value: '2026-10-30' } });
    });
    expect(storage.has(STORED_KEY)).toBe(false);
    expect(sinceField().getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector('.board-filter-since-resolved')?.textContent).toBe('That is after today');
  });
});
