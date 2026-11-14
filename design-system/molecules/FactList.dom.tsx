/**
 * The fact list, in a happy-dom document. What matters: no facts render nothing; each fact is one `dt`/`dd` pair, in order; a second line
 * shows under its value only when given; each layout sets `data-layout`; and the words are text, never markup.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FactList } from './FactList.tsx';

afterEach(() => {
  cleanup();
});

describe('the fact list', () => {
  test('no facts render nothing', () => {
    const { container } = render(<FactList facts={[]} layout="inline" />);
    expect(container.innerHTML).toBe('');
  });

  test('each fact is one dt and dd pair, in order', () => {
    const { container } = render(<FactList facts={[{ label: 'filed', value: '09:08' }, { label: 'branch', value: 'item-004' }]} layout="inline" />);
    expect([...container.querySelectorAll('.design-system-fact')].map((fact) => [fact.querySelector('dt')?.textContent, fact.querySelector('dd')?.textContent]))
      .toEqual([['filed', '09:08'], ['branch', 'item-004']]);
  });

  test('a second line shows under its value only when given', () => {
    const { container } = render(<FactList facts={[{ label: 'started', value: '22:41', sub: 'attempt 1' }, { label: 'filed', value: '09:08' }]} layout="grid" />);
    expect([...container.querySelectorAll('dd')].map((value) => value.querySelector('.design-system-fact-sub')?.textContent ?? null)).toEqual(['attempt 1', null]);
  });

  test('each layout sets data-layout', () => {
    const { container } = render(
      <>
        <FactList facts={[{ label: 'a', value: '1' }]} layout="inline" />
        <FactList facts={[{ label: 'b', value: '2' }]} layout="grid" />
        <FactList facts={[{ label: 'c', value: '3' }]} layout="table" />
      </>,
    );
    expect([...container.querySelectorAll('dl.design-system-facts')].map((list) => list.getAttribute('data-layout'))).toEqual(['inline', 'grid', 'table']);
  });

  test('the words are text, never markup', () => {
    const { container } = render(<FactList facts={[{ label: '<b>planted</b>', value: '<b>planted</b>', sub: '<b>planted</b>' }]} layout="grid" />);
    expect([container.querySelector('b'), container.querySelector('dt')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
