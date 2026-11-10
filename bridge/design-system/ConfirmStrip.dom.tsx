/**
 * The confirm strip, in a happy-dom document. What matters: it is a group named by its label; the question comes first, then the
 * consequence only when given, then the confirming control and Cancel; Cancel calls `onCancel`; the tone sets `data-tone`; and the words
 * are text, never markup.
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

import { ConfirmStrip } from './ConfirmStrip.tsx';

afterEach(() => {
  cleanup();
});

describe('the confirm strip', () => {
  test('a group named by its label: the question, the consequence, the confirming control, then Cancel', () => {
    render(
      <ConfirmStrip
        label="Confirm stopping J4"
        question="Stop J4 now?"
        consequence="#004 stays in progress."
        tone="danger"
        confirm={<button type="button">Confirm stop</button>}
        cancelLabel="Cancel"
        onCancel={() => undefined}
      />,
    );
    const strip = screen.getByRole('group', { name: 'Confirm stopping J4' });
    expect([
      strip.querySelector('.bridge-confirm-question')?.textContent,
      strip.querySelector('.bridge-confirm-consequence')?.textContent,
      [...strip.querySelectorAll('.bridge-confirm-actions button')].map((button) => button.textContent),
      strip.getAttribute('data-tone'),
    ]).toEqual(['Stop J4 now?', '#004 stays in progress.', ['Confirm stop', 'Cancel'], 'danger']);
  });

  test('without a consequence only the question shows, and Cancel calls onCancel', () => {
    const cancels: string[] = [];
    render(
      <ConfirmStrip
        label="Confirm stopping the Overseer"
        question="Stop the Overseer?"
        tone="neutral"
        confirm={<button type="button">Confirm stop</button>}
        cancelLabel="Cancel"
        onCancel={() => cancels.push('cancel')}
      />,
    );
    const strip = screen.getByRole('group', { name: 'Confirm stopping the Overseer' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect([strip.querySelector('.bridge-confirm-consequence'), strip.querySelector('.bridge-confirm-text')?.textContent, strip.getAttribute('data-tone'), cancels])
      .toEqual([null, 'Stop the Overseer?', 'neutral', ['cancel']]);
  });

  test('the words are text, never markup', () => {
    const planted = '<b>planted</b>';
    render(<ConfirmStrip label={planted} question={planted} consequence={planted} tone="neutral" confirm={null} cancelLabel={planted} onCancel={() => undefined} />);
    expect(screen.getByRole('group', { name: '<b>planted</b>' }).querySelector('b')).toBeNull();
  });
});
