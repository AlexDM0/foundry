/**
 * The busy indicator, in a happy-dom document. What matters: each shape is a progress bar named by its accessible name with no value, so
 * it reads as busy without a measure, and the shape is an attribute.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { BusyIndicator } from './BusyIndicator.tsx';

afterEach(() => {
  cleanup();
});

describe('the busy indicator', () => {
  test('each shape is a named progress bar with no value', () => {
    render(
      <>
        <BusyIndicator shape="spinner" accessibleName="Reading the repository" />
        <BusyIndicator shape="bar" accessibleName="Profiling the gate" />
      </>,
    );
    const indicatorParts = ['Reading the repository', 'Profiling the gate'].map((name) => {
      const indicator = screen.getByRole('progressbar', { name });
      return [indicator.className, indicator.getAttribute('data-shape'), indicator.getAttribute('aria-valuenow')];
    });
    expect(indicatorParts).toEqual([['design-system-busy', 'spinner', null], ['design-system-busy', 'bar', null]]);
  });
});
