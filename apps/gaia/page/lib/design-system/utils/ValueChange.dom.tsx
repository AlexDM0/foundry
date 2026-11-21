/**
 * The value-change hook, in a happy-dom document. What matters: the first showing has no direction, so it plays nothing; a larger value is
 * `up` and a smaller one `down`, each counting one more change, so a part keyed by the count plays again; a render with the same value
 * changes nothing.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { useValueChange } from './ValueChange.ts';

function ExampleCount({ value }: { readonly value: number }) {
  const { changeCount, direction } = useValueChange(value);
  return <output data-change={direction}>{`${value} after ${changeCount} changes`}</output>;
}

const shown = (): [string | null, string | null] => {
  const output = screen.getByRole('status');
  return [output.getAttribute('data-change'), output.textContent];
};

afterEach(() => {
  cleanup();
});

describe('the value change', () => {
  test('the first showing has no direction and no change', () => {
    render(<ExampleCount value={3} />);
    expect(shown()).toEqual([null, '3 after 0 changes']);
  });

  test('a larger value is up and a smaller one down, each one more change', () => {
    const { rerender } = render(<ExampleCount value={3} />);
    rerender(<ExampleCount value={5} />);
    expect(shown()).toEqual(['up', '5 after 1 changes']);
    rerender(<ExampleCount value={1} />);
    expect(shown()).toEqual(['down', '1 after 2 changes']);
  });

  test('a render with the same value changes nothing', () => {
    const { rerender } = render(<ExampleCount value={3} />);
    rerender(<ExampleCount value={4} />);
    rerender(<ExampleCount value={4} />);
    expect(shown()).toEqual(['up', '4 after 1 changes']);
  });
});
