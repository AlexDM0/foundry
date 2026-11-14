/**
 * The text button, in a happy-dom document. What matters: with an `href` it is a link in the text button's look, and without one a button
 * that calls `onPress`.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { TextButton } from './TextButton.tsx';

afterEach(() => {
  cleanup();
});

describe('the text button', () => {
  test('with an href it is a link, without one a button calling onPress', () => {
    const presses: string[] = [];
    render(
      <>
        <TextButton label="Example group details" href="#groups/example" />
        <TextButton label="show all" onPress={() => presses.push('pressed')} />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Example group details' }).className).toBe('design-system-link-button');
    fireEvent.click(screen.getByRole('button', { name: 'show all' }));
    expect(presses).toEqual(['pressed']);
  });
});
