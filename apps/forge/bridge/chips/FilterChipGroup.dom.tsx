/**
 * A row of filter chips, in a happy-dom document. What matters: each chip shows whether it is pressed and its count, a chip of no count is
 * marked empty, a click hands its value on, a state chip leads with its lane dot and an epic chip with its swatch in the chip's slot
 * colour, a toolbar group shows its label and names the chips by it, and a label is text, never markup.
 */
import {
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

import { FilterChipGroup, type FilterChip } from './FilterChipGroup.tsx';

const CHIPS: readonly FilterChip[] = [
  { value: 'pending', label: 'To do', stateToken: 'pending' },
  { value: 'checkout', label: 'Example checkout', slot: 3 },
  { value: 'planted', label: '<b>planted</b>' },
];

function renderChips(pressed: readonly string[], onToggle: (value: string) => void = () => undefined, labelIsShown = false): void {
  render(
    <FilterChipGroup
      label="Example filters"
      labelIsShown={labelIsShown}
      chips={CHIPS}
      pressed={pressed}
      countByChip={new Map([['pending', 4], ['checkout', 0], ['planted', 1]])}
      onToggle={onToggle}
    />,
  );
}

function chipOf(value: string): HTMLElement {
  const chip = screen.getByRole('group', { name: 'Example filters' }).querySelector<HTMLElement>(`[data-chip="${value}"]`);
  if (chip === null) throw new Error(`no chip ${value}`);
  return chip;
}

afterEach(() => {
  cleanup();
});

describe('the filter chips', () => {
  test('each chip shows whether it is pressed and its count, and a chip of no count is marked empty', () => {
    renderChips(['checkout']);
    expect(CHIPS.map((chip) => [chipOf(chip.value).getAttribute('aria-pressed'), chipOf(chip.value).querySelector('.bridge-chip-count')?.textContent])).toEqual([
      ['false', '4'],
      ['true', '0'],
      ['false', '1'],
    ]);
    expect(CHIPS.map((chip) => chipOf(chip.value).hasAttribute('data-empty'))).toEqual([false, true, false]);
  });

  test('a click hands the chip\'s value on', () => {
    const toggled: string[] = [];
    renderChips([], (value) => toggled.push(value));
    fireEvent.click(chipOf('checkout'));
    fireEvent.click(chipOf('pending'));
    expect(toggled).toEqual(['checkout', 'pending']);
  });

  test('a state chip leads with its state dot in its tone and shape, and an epic chip with its swatch', () => {
    renderChips([]);
    const dot = chipOf('pending').querySelector('.design-system-state-dot');
    expect([dot?.getAttribute('data-state-tone'), dot?.getAttribute('data-shape')]).toEqual(['neutral', 'dashed-ring']);
    expect([chipOf('checkout').getAttribute('data-epic-slot'), chipOf('checkout').querySelectorAll('.bridge-epic-swatch').length]).toEqual(['3', 1]);
    expect(chipOf('planted').querySelector('.design-system-state-dot, .bridge-epic-swatch')).toBeNull();
  });

  test('a toolbar group shows its label before the chips and names the chips by it', () => {
    renderChips([], () => undefined, true);
    const group = screen.getByRole('group', { name: 'Example filters' });
    expect(group.previousElementSibling?.textContent).toBe('Example filters');
  });

  test('a label is text, never markup', () => {
    renderChips([]);
    expect(chipOf('planted').querySelector('b')).toBeNull();
    expect(chipOf('planted').textContent).toBe('<b>planted</b> 1');
  });
});
