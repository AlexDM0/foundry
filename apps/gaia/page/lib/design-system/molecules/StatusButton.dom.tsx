/**
 * The status button, in a happy-dom document. What matters: a press reaches onPress unless it is busy or disabled; its glyph is hidden and
 * drawn for its state; a change of glyph mounts a new glyph, so it animates in on a change only, never on a render with the same glyph; a
 * busy primary runs a band, a done glyph a wash; and the count and the name the host words reach the button.
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

import { StatusButton } from './StatusButton.tsx';

afterEach(() => {
  cleanup();
});

function wrapperOf(button: HTMLElement): Element {
  const wrapper = button.closest('.design-system-status-button');
  if (wrapper === null) throw new Error('The status button draws no wrapper.');
  return wrapper;
}

describe('the status button', () => {
  test('a press reaches onPress, and a busy or disabled one calls nothing', () => {
    const presses: string[] = [];
    const { rerender } = render(<StatusButton label="Example done" glyph="done" onPress={() => presses.push('pressed')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Example done' }));
    rerender(<StatusButton label="Example under way" glyph="busy" busy onPress={() => presses.push('pressed')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Example under way' }));
    rerender(<StatusButton label="Example restart" glyph="restart" disabled onPress={() => presses.push('pressed')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Example restart' }));
    expect(presses).toEqual(['pressed']);
  });

  test('its glyph is hidden from the accessibility tree and drawn for its state', () => {
    for (const [glyph, part] of [
      ['done', 'check'],
      ['again', 'again'],
      ['busy', 'spinner'],
      ['fetch', 'fetch'],
      ['restart', 'restart'],
    ] as const) {
      render(<StatusButton label={`Example ${glyph}`} glyph={glyph} onPress={() => undefined} />);
      const button = screen.getByRole('button', { name: `Example ${glyph}` });
      expect(wrapperOf(button).getAttribute('data-glyph')).toBe(glyph);
      expect(button.querySelector(`.design-system-status-button-${part}`)?.getAttribute('aria-hidden')).toBe('true');
      cleanup();
    }
  });

  test('a new glyph mounts anew on a change of glyph, and the same glyph stays the same element on a render', () => {
    const { rerender } = render(<StatusButton label="Example" glyph="busy" busy onPress={() => undefined} />);
    const glyphElement = () => screen.getByRole('button', { name: 'Example' }).querySelector('.design-system-status-button-glyph');
    const busyGlyph = glyphElement();
    rerender(<StatusButton label="Example" glyph="busy" busy onPress={() => undefined} />);
    expect(glyphElement()).toBe(busyGlyph);
    rerender(<StatusButton label="Example" glyph="done" onPress={() => undefined} />);
    expect(glyphElement()).not.toBe(busyGlyph);
  });

  test('a busy primary runs a band, a done glyph a wash, and a busy or disabled one is marked off', () => {
    const { rerender } = render(<StatusButton label="Example" glyph="busy" emphasis="primary" busy onPress={() => undefined} />);
    const wrapper = () => wrapperOf(screen.getByRole('button', { name: 'Example' }));
    expect([wrapper().querySelector('.design-system-status-button-band') !== null, wrapper().hasAttribute('data-off'), wrapper().hasAttribute('data-primary')])
      .toEqual([true, true, true]);
    rerender(<StatusButton label="Example" glyph="busy" busy onPress={() => undefined} />);
    expect(wrapper().querySelector('.design-system-status-button-band')).toBeNull();
    rerender(<StatusButton label="Example" glyph="done" onPress={() => undefined} />);
    expect([wrapper().querySelector('.design-system-status-button-wash') !== null, wrapper().hasAttribute('data-off')]).toEqual([true, false]);
  });

  test('the count follows the label, and the name the host words names the button', () => {
    render(<StatusButton label="Example fetch" glyph="fetch" emphasis="primary" count="3" accessibleName="Example fetch, 3 waiting" onPress={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Example fetch, 3 waiting' });
    expect(button.querySelector('.design-system-status-button-count')?.textContent).toBe('3');
  });
});
