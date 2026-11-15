/**
 * The pending step, in a happy-dom document. What matters: it is a status that reads its word, then its sentence; the control it is given
 * sits beside them; the dismiss button is named, titled and calls onDismiss; and only an edgeless step is marked.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { PendingStep } from './PendingStep.tsx';

afterEach(() => {
  cleanup();
});

describe('the pending step', () => {
  test('it is a status that reads its word, then its sentence, with the control it is given', () => {
    render(
      <PendingStep
        word="Saved; publish pending."
        sentence="Readers see the old page until it is published."
        action={<button type="button">Publish</button>}
        dismissLabel="Dismiss the pending publish"
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByText('Saved; publish pending.').parentElement?.textContent).toBe('Saved; publish pending. Readers see the old page until it is published.');
    expect([screen.getByText('Saved; publish pending.').tagName, screen.getByRole('status').hasAttribute('data-edgeless')]).toEqual(['SPAN', false]);
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Publish' })).toBeDefined();
  });

  test('the named dismissal calls onDismiss, and an edgeless step is marked', () => {
    const presses: string[] = [];
    render(<PendingStep word="Saved." sentence="Publish when ready." dismissLabel="Dismiss" onDismiss={() => presses.push('dismiss')} edgeless />);
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismiss);
    expect([presses, dismiss.getAttribute('title'), screen.getByRole('status').hasAttribute('data-edgeless')]).toEqual([['dismiss'], 'Dismiss', true]);
  });
});
