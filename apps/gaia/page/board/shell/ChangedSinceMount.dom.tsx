/**
 * `useChangedSinceMount` in a happy-dom document. What matters: the value a part mounts with is no change, any later value is, and the
 * mark stays once set, also when the value comes back to the mounted one, so a part keyed by its value plays each change.
 */
import { cleanup, render }         from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import { useChangedSinceMount } from './ChangedSinceMount.ts';

afterEach(cleanup);

function Figure({ value }: { readonly value: number }) {
  const hasChanged = useChangedSinceMount(value);
  return <span data-value-changed={hasChanged ? '' : undefined}>{value}</span>;
}

function isMarked(container: HTMLElement): boolean {
  return container.querySelector('span')?.hasAttribute('data-value-changed') ?? false;
}

test('the mounted value is no change, a later value is, and the mark stays when the value comes back', () => {
  const page = render(<Figure value={3} />);
  page.rerender(<Figure value={3} />);
  expect(isMarked(page.container)).toBe(false);

  page.rerender(<Figure value={4} />);
  expect(isMarked(page.container)).toBe(true);

  page.rerender(<Figure value={3} />);
  expect(isMarked(page.container)).toBe(true);
});
