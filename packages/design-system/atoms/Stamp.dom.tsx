/**
 * The stamp, in a happy-dom document. What matters: the short text shows with the full stamp as its hover title; it is a `time` element
 * when asked and a span otherwise; a `time` element carries its `dateTime`, and a span takes none by type; and a stamp is text, never markup.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Stamp } from './Stamp.tsx';

afterEach(() => {
  cleanup();
});

describe('the stamp', () => {
  test('the short text shows, the full stamp is its title, and it is a span by default', () => {
    const { container } = render(<Stamp shortText="13:05" fullText="2026-09-18 13:05:42" />);
    const stamp = container.querySelector<HTMLElement>('.design-system-stamp');
    expect([stamp?.tagName, stamp?.textContent, stamp?.title]).toEqual(['SPAN', '13:05', '2026-09-18 13:05:42']);
  });

  test('it is a time element when asked, with no title when there is no full stamp', () => {
    const { container } = render(<Stamp shortText="13:05" element="time" />);
    const stamp = container.querySelector('.design-system-stamp');
    expect([stamp?.tagName, stamp?.hasAttribute('title')]).toEqual(['TIME', false]);
  });

  test('a time element carries its dateTime, and a span with a dateTime does not compile', () => {
    const { container } = render(<Stamp shortText="13:05" element="time" dateTime="2026-09-18T13:05:42Z" />);
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-09-18T13:05:42Z');
    // @ts-expect-error only a time element carries a dateTime
    const spanWithDateTime = <Stamp shortText="13:05" dateTime="2026-09-18T13:05:42Z" />;
    expect(spanWithDateTime.props.shortText).toBe('13:05');
  });

  test('a stamp is text, never markup', () => {
    const { container } = render(<Stamp shortText="<b>planted</b>" />);
    expect([container.querySelector('b'), container.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
