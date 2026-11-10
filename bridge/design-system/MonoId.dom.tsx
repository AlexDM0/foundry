/**
 * The mono id and the id link, in a happy-dom document. What matters: the id shows as given; the link has its href; an `onFollow` that
 * brought the item into view stops the link being followed, and a link's click never reaches a clickable card around it; and an id is
 * text, never markup.
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

import { IdLink, MonoId } from './MonoId.tsx';

afterEach(() => {
  cleanup();
});

describe('the mono id', () => {
  test('the id shows as given, and is text, never markup', () => {
    const { container } = render(<><MonoId text="#004" /><MonoId text="<b>planted</b>" /></>);
    const ids = [...container.querySelectorAll('.bridge-ticket-id')];
    expect([ids.map((id) => id.textContent), container.querySelector('b')]).toEqual([['#004', '<b>planted</b>'], null]);
  });
});

describe('the id link', () => {
  test('the link has its href and shows its id', () => {
    render(<IdLink text="#004" href="#tickets/004" />);
    const link = screen.getByRole('link', { name: '#004' });
    expect([link.className, link.getAttribute('href')]).toEqual(['bridge-id-link', '#tickets/004']);
  });

  test('onFollow true prevents navigation and stops the click reaching a parent\'s handler', () => {
    const parentClicks: string[] = [];
    render(
      <div onClick={() => parentClicks.push('card')}>
        <IdLink text="#004" href="#tickets/004" onFollow={() => true} />
      </div>,
    );
    const followed = fireEvent.click(screen.getByRole('link', { name: '#004' }));
    expect([followed, parentClicks]).toEqual([false, []]);
  });

  test('onFollow false lets the link be followed, still not reaching the parent', () => {
    const parentClicks: string[] = [];
    render(
      <div onClick={() => parentClicks.push('card')}>
        <IdLink text="#004" href="#tickets/004" onFollow={() => false} />
      </div>,
    );
    const followed = fireEvent.click(screen.getByRole('link', { name: '#004' }));
    expect([followed, parentClicks]).toEqual([true, []]);
  });
});
