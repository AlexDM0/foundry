/**
 * The failed action, in a happy-dom document. What matters: it is an alert whose text holds the lead, the code and the sentence in that
 * order, the code in an element of its own; without a code the sentence follows the lead directly; the retry button is the compact
 * secondary one and shows only with its action, never red; and the dismiss button is named, titled and calls onDismiss.
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

import { FailedAction } from './FailedAction.tsx';

afterEach(() => {
  cleanup();
});

describe('the failed action', () => {
  test('it is an alert holding the lead, the code in its own element, then the sentence', () => {
    render(<FailedAction lead="Saving failed: " code="disk-full" sentence="The disk is full." />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Saving failed: disk-full. The disk is full.');
    expect(screen.getByText('disk-full').textContent).toBe('disk-full');
  });

  test('without a code or a lead the sentence stands alone, and without actions no button shows', () => {
    render(<FailedAction sentence="The change was refused." />);
    expect([screen.getByRole('alert').textContent, screen.queryAllByRole('button').length]).toEqual(['The change was refused.', 0]);
  });

  test('retry is the compact secondary button, never red, and it and the named dismissal call their own actions', () => {
    const presses: string[] = [];
    render(
      <FailedAction
        sentence="The disk is full."
        retryLabel="Try again"
        onRetry={() => presses.push('retry')}
        dismissLabel="Dismiss this failure"
        onDismiss={() => presses.push('dismiss')}
      />,
    );
    const retry = screen.getByRole('button', { name: 'Try again' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss this failure' });
    expect([retry.hasAttribute('data-compact'), retry.hasAttribute('data-primary'), retry.hasAttribute('data-danger'), dismiss.getAttribute('title')])
      .toEqual([true, false, false, 'Dismiss this failure']);
    fireEvent.click(retry);
    fireEvent.click(dismiss);
    expect(presses).toEqual(['retry', 'dismiss']);
  });
});
