/**
 * The section head, in a happy-dom document. What matters: its title is an `h2` unless the screen picks another element; the count shows
 * only when given; what the caller adds follows; inline sets `data-inline`; the heading look sets the title in the title role and holds
 * what the caller adds in the head's end; and the title is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SectionHead } from './SectionHead.tsx';

afterEach(() => {
  cleanup();
});

describe('the section head', () => {
  test('its title is an h2, in the micro role', () => {
    render(<SectionHead title="Open questions" />);
    const title = screen.getByRole('heading', { name: 'Open questions' });
    expect([title.tagName, title.getAttribute('data-type-role')]).toEqual(['H2', 'micro']);
  });

  test('the screen picks the title\'s element', () => {
    render(<SectionHead title="Waiting on User" titleElement="h3" />);
    expect(screen.getByRole('heading', { name: 'Waiting on User' }).tagName).toBe('H3');
  });

  test('the count shows only when given, and what the caller adds follows it', () => {
    const { container } = render(<SectionHead title="Example" count={2}><button type="button">Example head action</button></SectionHead>);
    const head = container.querySelector('.design-system-section-head');
    expect([head?.querySelector('.design-system-section-count')?.textContent, head?.lastElementChild?.textContent]).toEqual(['2', 'Example head action']);
    cleanup();
    expect(render(<SectionHead title="Example" />).container.querySelector('.design-system-section-count')).toBeNull();
  });

  test('inline sets data-inline on the head, and a standard head sets nothing', () => {
    const { container } = render(<><SectionHead title="Example" count={2} inline /><SectionHead title="Example" count={2} /></>);
    expect([...container.querySelectorAll('.design-system-section-head')].map((head) => head.hasAttribute('data-inline'))).toEqual([true, false]);
  });

  test('the heading look sets the title in the title role and holds what the caller adds at the head\'s end; the default is small capitals', () => {
    const { container } = render(<SectionHead title="Example" count={2} look="heading"><button type="button">Example head action</button></SectionHead>);
    const head = container.querySelector('.design-system-section-head');
    expect([
      head?.getAttribute('data-look'),
      screen.getByRole('heading', { name: 'Example' }).getAttribute('data-type-role'),
      head?.querySelector('.design-system-section-head-end')?.textContent,
    ]).toEqual(['heading', 'title', 'Example head action']);
    cleanup();
    expect(render(<SectionHead title="Example" />).container.querySelector('.design-system-section-head')?.getAttribute('data-look')).toBe('small-capitals');
  });

  test('the title is text, never markup', () => {
    const { container } = render(<SectionHead title="<b>planted</b>" />);
    expect([container.querySelector('b'), screen.getByRole('heading').textContent]).toEqual([null, '<b>planted</b>']);
  });
});
