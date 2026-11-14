/**
 * The banner, in a happy-dom document. What matters: the lead is bold before the text; each tone sets `data-tone`; the action sits at the
 * end; the role is set only when given; a listed banner is an `li`; and the words are text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Banner } from './Banner.tsx';

afterEach(() => {
  cleanup();
});

describe('the banner', () => {
  test('the lead is bold before the text, and the action sits at the end', () => {
    render(<Banner tone="warn" role="alert" lead="Server unreachable." text="Reconnecting." action={<button type="button">Hide</button>} />);
    const banner = screen.getByRole('alert');
    expect([...banner.children].map((part) => [part.tagName, part.textContent])).toEqual([['STRONG', 'Server unreachable.'], ['SPAN', 'Reconnecting.'], ['SPAN', 'Hide']]);
    expect(banner.lastElementChild?.className).toBe('design-system-banner-action');
  });

  test('each tone sets data-tone, and the role is set only when given', () => {
    const { container } = render(
      <>
        <Banner tone="warn" text="Example notice" />
        <Banner tone="error" text="Example warning" role="status" />
        <Banner tone="quiet" text="Example snapshot" />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-banner')].map((banner) => [banner.getAttribute('data-tone'), banner.getAttribute('role')]))
      .toEqual([['warn', null], ['error', 'status'], ['quiet', null]]);
  });

  test('a listed banner is an li', () => {
    render(<ul><Banner tone="error" element="li" text="Example warning" /></ul>);
    expect(screen.getByRole('listitem').className).toBe('design-system-banner');
  });

  test('the words are text, never markup', () => {
    render(<Banner tone="warn" role="alert" lead="<b>planted</b>" text="<b>planted</b>" />);
    expect([screen.getByRole('alert').querySelector('b'), screen.getByRole('alert').textContent]).toEqual([null, '<b>planted</b><b>planted</b>']);
  });
});
