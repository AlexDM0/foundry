/**
 * The layout primitive, in a happy-dom document. What matters: it is a column unless `row` is set; the alignment flags map to the main and
 * the cross axis by direction (`centerX` is the main axis of a row and the cross axis of a column); the spacing props arrive inline as
 * the spacing tokens of their steps; `divider` puts one hidden hairline between each two children and none for a missing child; and the flags that
 * pull one axis two ways do not compile together.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { View } from './View.tsx';

afterEach(() => {
  cleanup();
});

const attributesOf = (element: Element | null) => ['data-row', 'data-wrap', 'data-justify', 'data-align'].map((name) => element?.getAttribute(name) ?? null);

describe('the view', () => {
  test('it is a column by default, and a wrapping row on request', () => {
    const { container } = render(<><View /><View row wrap /></>);
    expect([...container.querySelectorAll('.design-system-view')].map(attributesOf)).toEqual([
      [null, null, null, null],
      ['', '', null, null],
    ]);
  });

  test('the alignment flags map to the main and the cross axis by direction', () => {
    const { container } = render(
      <>
        <View centered />
        <View centerX />
        <View row centerX />
        <View between centerX />
        <View row between centerY />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-view')].map((view) => attributesOf(view).slice(2))).toEqual([
      ['center', 'center'],
      [null, 'center'],
      ['center', null],
      ['between', 'center'],
      ['between', 'center'],
    ]);
  });

  test('grow sets data-grow, and a view without it sets none', () => {
    const { container } = render(<><View grow /><View /></>);
    expect([...container.querySelectorAll('.design-system-view')].map((view) => view.hasAttribute('data-grow'))).toEqual([true, false]);
  });

  test('the spacing props arrive as the spacing tokens of their steps', () => {
    const { container } = render(<View gap="eight" paddingVertical="ten" paddingLeft="fourteen" marginTop="twentyTwo" />);
    const view = container.querySelector<HTMLElement>('.design-system-view');
    expect([view?.style.gap, view?.style.paddingTop, view?.style.paddingBottom, view?.style.paddingLeft, view?.style.paddingRight, view?.style.marginTop])
      .toEqual(['var(--space-8)', 'var(--space-10)', 'var(--space-10)', 'var(--space-14)', '', 'var(--space-22)']);
  });

  test('a divider stands between each two children, hidden, and a missing child gets none', () => {
    const { container } = render(
      <View divider>
        <span>First</span>
        {null}
        <span>Second</span>
        <span>Third</span>
      </View>,
    );
    const parts = [...container.querySelectorAll('.design-system-view > *')];
    expect(parts.map((part) => part.className || part.textContent)).toEqual([
      'First', 'design-system-view-divider', 'Second', 'design-system-view-divider', 'Third',
    ]);
    expect(parts.filter((part) => part.getAttribute('aria-hidden') === 'true')).toHaveLength(2);
  });

  test('the flags that pull one axis two ways do not compile together', () => {
    const exclusiveViews = [
      // @ts-expect-error `centered` centres both axes, so `between` cannot spread one
      <View key="centered-between" centered between />,
      // @ts-expect-error `centered` already centres the cross axis
      <View key="centered-x" centered centerX />,
      // @ts-expect-error in a column `between` spreads the vertical axis that `centerY` would centre
      <View key="column-between-y" between centerY />,
      // @ts-expect-error in a row `between` spreads the horizontal axis that `centerX` would centre
      <View key="row-between-x" row between centerX />,
    ];
    expect(exclusiveViews).toHaveLength(4);
  });
});
