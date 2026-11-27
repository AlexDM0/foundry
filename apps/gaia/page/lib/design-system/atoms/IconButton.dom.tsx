/**
 * The icon button, in a happy-dom document. What matters: it shows its glyph or the caller's drawing, hidden from the accessibility tree,
 * under its accessible name, carries its title, and calls `onPress`, unless it is disabled; `accent` marks it as the accent block, and only
 * then; a `Tooltip` around it describes it.
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
import { Tooltip }    from './Tooltip.tsx';

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

  test('accent marks the button as the accent block, which still presses, and only then', () => {
    const presses: string[] = [];
    render(
      <>
        <IconButton drawing={<svg />} accessibleName="Send the example" accent onPress={() => presses.push('sent')} />
        <IconButton glyph="close" accessibleName="Close the example panel" onPress={() => undefined} />
      </>,
    );
    const accentButton = screen.getByRole('button', { name: 'Send the example' });
    fireEvent.click(accentButton);
    expect([accentButton.hasAttribute('data-accent'), screen.getByRole('button', { name: 'Close the example panel' }).hasAttribute('data-accent'), presses])
      .toEqual([true, false, ['sent']]);
  });

  test('a disabled icon button is disabled and does not call onPress', () => {
    const presses: string[] = [];
    render(<IconButton glyph="close" accessibleName="Close the example panel" disabled onPress={() => presses.push('pressed')} />);
    const button = screen.getByRole('button', { name: 'Close the example panel' });
    fireEvent.click(button);
    expect([button.hasAttribute('disabled'), presses]).toEqual([true, []]);
  });

  test('a tooltip around it describes it', () => {
    render(<Tooltip text="Closes the example panel" placement="below"><IconButton glyph="close" accessibleName="Close the example panel" onPress={() => undefined} /></Tooltip>);
    const tooltipId = screen.getByRole('tooltip').id;
    expect([tooltipId === '', screen.getByRole('button', { name: 'Close the example panel' }).getAttribute('aria-describedby')]).toEqual([false, tooltipId]);
  });
});
