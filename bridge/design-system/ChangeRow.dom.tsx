/**
 * The change row, in a happy-dom document. What matters: the change and the density reach `data-change` and `data-density`; the title and
 * location read as given; the before and after values and the note show only when given; the edge is decoration only; and the caller's
 * actions sit in the head and call their callbacks.
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
  jest,
  test
} from 'bun:test';

import { TextButton } from './Button.tsx';
import { ChangeRow }  from './ChangeRow.tsx';

afterEach(() => {
  cleanup();
});

describe('the change row', () => {
  test('the change and the density reach their attributes, and the values show before and after', () => {
    const { container } = render(
      <ChangeRow change="changed" density="card" title="tests" location="· build gate 1 · changed" before="bun test --bail" after="bun test --bail --coverage" />,
    );
    const row = container.querySelector('.bridge-change-row');
    expect([row?.getAttribute('data-change'), row?.getAttribute('data-density')]).toEqual(['changed', 'card']);
    expect([
      container.querySelector('.bridge-change-row-title')?.textContent,
      container.querySelector('.bridge-change-row-location')?.textContent,
      container.querySelector('.bridge-change-row-before')?.textContent,
      container.querySelector('.bridge-change-row-after')?.textContent,
    ]).toEqual(['tests', '· build gate 1 · changed', 'bun test --bail', 'bun test --bail --coverage']);
    expect(container.querySelector('.bridge-change-row-edge')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.bridge-change-row-note')).toBeNull();
    expect(container.querySelector('.bridge-change-row-actions')).toBeNull();
  });

  test('without values only the note shows, in a row', () => {
    const { container } = render(<ChangeRow change="removed" density="row" title="lint" location="· build gate · removed" note="The builder still gets its fix command." />);
    expect([
      container.querySelector('.bridge-change-row')?.getAttribute('data-change'),
      container.querySelector('.bridge-change-row')?.getAttribute('data-density'),
      container.querySelector('.bridge-change-row-values'),
      container.querySelector('.bridge-change-row-note')?.textContent,
    ]).toEqual(['removed', 'row', null, 'The builder still gets its fix command.']);
  });

  test('the caller\'s actions sit in the head and call their callbacks', () => {
    const onUndo = jest.fn();
    const { container } = render(
      <ChangeRow change="new" density="card" title="a11y" location="· merge gate 4 · new" after="bun run a11y" actions={<TextButton label="Undo" onPress={onUndo} />} />,
    );
    expect(container.querySelector('.bridge-change-row-head .bridge-change-row-actions')?.textContent).toBe('Undo');
    expect(container.querySelector('.bridge-change-row-before')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
