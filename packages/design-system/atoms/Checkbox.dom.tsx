/**
 * The checkbox, in a happy-dom document. What matters: the box is named by its label and a click hands the new state to onChange; a
 * disabled box is disabled; and only a box with an explanation shows its second line and is marked as explained.
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

import { Checkbox } from './Checkbox.tsx';

afterEach(() => {
  cleanup();
});

describe('the checkbox', () => {
  test('its label names it, and a click hands the new state to onChange', () => {
    const states: boolean[] = [];
    render(<Checkbox label="Send a summary" checked={false} onChange={(checked) => states.push(checked)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send a summary' }));
    expect(states).toEqual([true]);
  });

  test('a disabled box is disabled, and a checked one is checked', () => {
    render(<Checkbox label="Send a summary" checked disabled onChange={() => undefined} />);
    const box = screen.getByRole('checkbox', { name: 'Send a summary' }) as HTMLInputElement;
    expect([box.checked, box.disabled]).toEqual([true, true]);
  });

  test('only a box with an explanation shows its second line and is marked as explained', () => {
    render(
      <>
        <Checkbox label="Questions" checked onChange={() => undefined} explanation="Someone asks, and the work waits on the answer." />
        <Checkbox label="Plain" checked={false} onChange={() => undefined} />
      </>,
    );
    const explainedLabel = screen.getByRole('checkbox', { name: /Questions/ }).closest('label');
    const plainLabel = screen.getByRole('checkbox', { name: 'Plain' }).closest('label');
    expect(screen.getByText('Someone asks, and the work waits on the answer.').textContent).toBe('Someone asks, and the work waits on the answer.');
    expect([explainedLabel?.hasAttribute('data-explained'), plainLabel?.hasAttribute('data-explained')]).toEqual([true, false]);
  });
});
