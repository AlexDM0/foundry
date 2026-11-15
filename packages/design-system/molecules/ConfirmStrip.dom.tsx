/**
 * The confirm strip, in a happy-dom document. What matters: it is a group named by its label; the question comes first, then the
 * consequence only when given, then the choices only when given, then the confirming control and Cancel; Cancel calls `onCancel`; the tone
 * sets `data-tone`; and the words are text, never markup.
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
      strip.querySelector('.design-system-confirm-question')?.textContent,
      strip.querySelector('.design-system-confirm-consequence')?.textContent,
      [...strip.querySelectorAll('.design-system-confirm-actions button')].map((button) => button.textContent),
      strip.getAttribute('data-tone'),
    ]).toEqual(['Stop J4 now?', '#004 stays in progress.', ['Confirm stop', 'Cancel'], 'danger']);
  });

  test('without a consequence only the question shows, and Cancel calls onCancel', () => {
    const cancels: string[] = [];
    render(
      <ConfirmStrip
        label="Confirm stopping the server"
        question="Stop the server?"
        tone="neutral"
        confirm={<button type="button">Confirm stop</button>}
        cancelLabel="Cancel"
        onCancel={() => cancels.push('cancel')}
      />,
    );
    const strip = screen.getByRole('group', { name: 'Confirm stopping the server' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect([strip.querySelector('.design-system-confirm-consequence'), strip.querySelector('.design-system-confirm-text')?.textContent, strip.getAttribute('data-tone'), cancels])
      .toEqual([null, 'Stop the server?', 'neutral', ['cancel']]);
  });

  test('choices sit between the question and the actions, and a strip without them holds no part for them', () => {
    const { container } = render(
      <>
        <ConfirmStrip
          label="Confirm stopping J4"
          question="How should J4 stop?"
          choices={<><button type="button">Finish the step</button><button type="button">Stop now</button></>}
          tone="neutral"
          confirm={<button type="button">Stop</button>}
          cancelLabel="Cancel"
          onCancel={() => undefined}
        />
        <ConfirmStrip
          label="Confirm stopping J5"
          question="Stop J5 now?"
          tone="neutral"
          confirm={<button type="button">Stop</button>}
          cancelLabel="Cancel"
          onCancel={() => undefined}
        />
      </>,
    );
    const [withChoices, withoutChoices] = [...container.querySelectorAll('.design-system-confirm')];
    expect([...withChoices?.children ?? []].map((part) => part.className))
      .toEqual(['design-system-confirm-text', 'design-system-confirm-choices', 'design-system-confirm-actions']);
    expect([...withChoices?.querySelectorAll('.design-system-confirm-choices button') ?? []].map((choice) => choice.textContent)).toEqual(['Finish the step', 'Stop now']);
    expect([withChoices?.hasAttribute('data-with-choices'), withoutChoices?.hasAttribute('data-with-choices')]).toEqual([true, false]);
    expect(withoutChoices?.querySelector('.design-system-confirm-choices')).toBeNull();
  });

  test('the words are text, never markup', () => {
    const planted = '<b>planted</b>';
    render(<ConfirmStrip label={planted} question={planted} consequence={planted} tone="neutral" confirm={null} cancelLabel={planted} onCancel={() => undefined} />);
    expect(screen.getByRole('group', { name: '<b>planted</b>' }).querySelector('b')).toBeNull();
  });
});
