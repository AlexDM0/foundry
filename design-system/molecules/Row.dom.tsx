/**
 * The row, in a happy-dom document. What matters: it is a View with `row` fixed, every other View prop passing through, and `between`
 * takes only the cross-axis centring of a row.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Row } from './Row.tsx';

afterEach(() => {
  cleanup();
});

describe('the row', () => {
  test('it is a row view, with every other View prop passed through', () => {
    const { container } = render(<Row between centerY gap="six" padding="four"><span>Overview</span></Row>);
    const view = container.querySelector<HTMLElement>('.design-system-view');
    expect([view?.getAttribute('data-row'), view?.getAttribute('data-justify'), view?.getAttribute('data-align'), view?.style.gap, view?.style.paddingTop, view?.textContent])
      .toEqual(['', 'between', 'center', 'var(--space-6)', 'var(--space-4)', 'Overview']);
  });

  test('between takes only the cross-axis centring of a row', () => {
    // @ts-expect-error `centerX` is the main axis of a row, which `between` spreads
    const spreadAndCentred = <Row between centerX />;
    expect(spreadAndCentred).toBeDefined();
  });
});
