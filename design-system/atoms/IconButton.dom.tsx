/**
 * The icon button, in a happy-dom document. What matters: it shows its glyph or the caller's drawing, hidden from the accessibility tree,
 * under its accessible name, carries its title, and calls `onPress`.
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

import { IconButton } from './IconButton.tsx';

afterEach(() => {
  cleanup();
});

describe('the icon button', () => {
  test('it shows its glyph, hidden from the accessibility tree, under its accessible name', () => {
    const presses: string[] = [];
    render(<IconButton glyph="close" accessibleName="Close the example panel" onPress={() => presses.push('pressed')} />);
    const button = screen.getByRole('button', { name: 'Close the example panel' });
    fireEvent.click(button);
    expect([button.className, button.textContent, button.firstElementChild?.getAttribute('aria-hidden'), presses]).toEqual([
      'design-system-icon-button',
      '×',
      'true',
      ['pressed'],
    ]);
  });

  test('it shows the caller\'s drawing in place of a glyph, hidden too, and carries its title', () => {
    render(<IconButton drawing={<svg data-example-drawing="" />} accessibleName="Example theme" title="Example theme" onPress={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Example theme' });
    expect([button.getAttribute('title'), button.firstElementChild?.getAttribute('aria-hidden'), button.querySelector('[data-example-drawing]') !== null])
      .toEqual(['Example theme', 'true', true]);
  });
});
