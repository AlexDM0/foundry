/**
 * The id link, in a happy-dom document. What matters: the link has its href and shows its id; an `onFollow` that brought the item into view
 * stops the link being followed; and a link's click never reaches a clickable card around it.
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

import { IdLink } from './IdLink.tsx';

afterEach(() => {
  cleanup();
});

describe('the id link', () => {
  test('the link has its href and shows its id', () => {
    render(<IdLink text="#004" href="#items/004" />);
    const link = screen.getByRole('link', { name: '#004' });
    expect([link.className, link.getAttribute('href')]).toEqual(['design-system-id-link', '#items/004']);
  });

  test('onFollow true prevents navigation and stops the click reaching a parent\'s handler', () => {
    const parentClicks: string[] = [];
    render(
      <div onClick={() => parentClicks.push('card')}>
        <IdLink text="#004" href="#items/004" onFollow={() => true} />
      </div>,
    );
    const followed = fireEvent.click(screen.getByRole('link', { name: '#004' }));
    expect([followed, parentClicks]).toEqual([false, []]);
  });

  test('onFollow false lets the link be followed, still not reaching the parent', () => {
    const parentClicks: string[] = [];
    render(
      <div onClick={() => parentClicks.push('card')}>
        <IdLink text="#004" href="#items/004" onFollow={() => false} />
      </div>,
    );
    const followed = fireEvent.click(screen.getByRole('link', { name: '#004' }));
    expect([followed, parentClicks]).toEqual([true, []]);
  });
});
