/**
 * The stamp, in a happy-dom document. What matters: the short text shows with the full stamp as its hover title; it is a `time` element
 * when asked and a span otherwise; and a stamp is text, never markup.
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
    const stamp = container.querySelector<HTMLElement>('.bridge-stamp');
    expect([stamp?.tagName, stamp?.textContent, stamp?.title]).toEqual(['SPAN', '13:05', '2026-09-18 13:05:42']);
  });

  test('it is a time element when asked, with no title when there is no full stamp', () => {
    const { container } = render(<Stamp shortText="13:05" element="time" />);
    const stamp = container.querySelector('.bridge-stamp');
    expect([stamp?.tagName, stamp?.hasAttribute('title')]).toEqual(['TIME', false]);
  });

  test('a stamp is text, never markup', () => {
    const { container } = render(<Stamp shortText="<b>planted</b>" />);
    expect([container.querySelector('b'), container.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
