/**
 * The finished-work filter at the tab bar's right end, in a happy-dom document. What matters: the line reads the window in bold, the menu
 * opens from it and closes on Esc; the choice is read from and written to its key, `<STORAGE_PREFIX>:<trackerId>:visibility`,
 * the default removing it, and the retired `recent` reads as the default; each span shows the count it would show, and "show all" and
 * "Reset filters" set all and the default.
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

import { PRODUCT_NAMES }          from '../../src/shared/constants/ProductNames.ts';
import type { PreferenceStore }   from '../preferences/PreferenceStore.ts';
import { boardPreferenceStoreOf } from '../preferences/PreferenceStore.ts';
import {
  FINISHED_EPIC,
  FIXTURE_NOW,
  FIXTURE_TICKETS,
  OPEN_EPIC
} from '../testing/BoardStateFixture.ts';
import { FinishedWorkFilter, useFinishedWorkChoice } from './FinishedWorkFilter.tsx';

const STORED_KEY = `${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:visibility`;

function storeOver(storage: Map<string, string>): PreferenceStore {
  return boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }));
}

function Filter({ store }: { readonly store: PreferenceStore }) {
  const [choice, choose] = useFinishedWorkChoice(store);
  return (
    <FinishedWorkFilter
      choice={choice}
      onChoice={choose}
      tickets={FIXTURE_TICKETS}
      epics={[OPEN_EPIC, FINISHED_EPIC]}
      nowEpochMilliseconds={FIXTURE_NOW.getTime()}
    />
  );
}

function filterLine(): HTMLElement {
  return screen.getByRole('button', { expanded: false });
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
  test('reads the hiding window in bold and opens the menu, which Esc closes', () => {
    render(<Filter store={storeOver(new Map())} />);
    expect(filterLine().textContent).toBe('Hiding closed > 1 day');
    expect(filterLine().querySelector('strong')?.textContent).toBe('1 day');
    openMenu();
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeDefined();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
  });
});

describe('the stored choice', () => {
  test('a stored choice under the page\'s key is read, and the default removes the key again', () => {
    const storage = new Map([[STORED_KEY, 'all']]);
    render(<Filter store={storeOver(storage)} />);
    expect(filterLine().textContent).toBe('Showing all closed');
    openMenu();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'last day' }));
    });
    expect(storage.has(STORED_KEY)).toBe(false);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'last hour' }));
    });
    expect(storage.get(STORED_KEY)).toBe('1h');
  });

  test('the retired recent reads as the default', () => {
    render(<Filter store={storeOver(new Map([[STORED_KEY, 'recent']]))} />);
    openMenu();
    expect(screen.getByRole('button', { name: 'last day' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the menu', () => {
  test('each span counts what it would show, the hidden work is named, and show all and Reset filters set all and the default', () => {
    const storage = new Map<string, string>();
    render(<Filter store={storeOver(storage)} />);
    openMenu();
    expect(['last hour', 'last day', '3 days', 'all'].map((name) => screen.getByRole('button', { name }).textContent)).toEqual(['hour0', 'day2', '3 days2', 'all3']);
    expect(screen.getByText('1 ticket · 1 epic hidden')).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'show all' }));
    });
    expect(storage.get(STORED_KEY)).toBe('all');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    });
    expect(storage.has(STORED_KEY)).toBe(false);
  });
});
