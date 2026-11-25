/**
 * The Flint slot, in a happy-dom document. What matters: the box carries its size and ground as data attributes (100 and page by
 * default), 60x50 a strip's size; it is empty, since the host places the sprite; `slotRef` gives the host the box's element; and a
 * label makes an image of that name while `null` hides the slot.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { createRef } from 'react';

import { FlintSlot } from './FlintSlot.tsx';

afterEach(() => {
  cleanup();
});

describe('the Flint slot', () => {
  test('the box carries its size and ground, 100 and page by default, and holds nothing', () => {
    const { container } = render(
      <>
        <FlintSlot label={null} />
        <FlintSlot label={null} size="112" ground="strip" />
        <FlintSlot label={null} size="60x50" ground="plain" />
      </>,
    );
    const slots = [...container.querySelectorAll('.design-system-flint-slot')];
    expect(slots.map((slot) => ['data-size', 'data-ground'].map((name) => slot.getAttribute(name)))).toEqual([['100', 'page'], ['112', 'strip'], ['60x50', 'plain']]);
    expect(slots.map((slot) => slot.childElementCount)).toEqual([0, 0, 0]);
  });

  test('the slot ref gives the host the box\'s element', () => {
    const slotElement = createRef<HTMLDivElement>();
    render(<FlintSlot label="Flint, the example agent" slotRef={slotElement} />);
    expect(slotElement.current).toBe(screen.getByRole('img', { name: 'Flint, the example agent' }));
  });

  test('a label makes an image of that name, and null hides the slot', () => {
    const { container } = render(
      <>
        <FlintSlot label="Flint, the example agent" />
        <FlintSlot label={null} />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Flint, the example agent' }).className).toBe('design-system-flint-slot');
    expect([...container.querySelectorAll('.design-system-flint-slot')].map((slot) => slot.getAttribute('aria-hidden'))).toEqual([null, 'true']);
  });
});
