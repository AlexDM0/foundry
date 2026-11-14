/**
 * The Flint slot, in a happy-dom document. What matters: the box carries its size, ground and pose as data attributes (100, page and
 * idle by default); the sprite's width and height follow the box size from the handoff's table and keep the placeholder's viewBox; a
 * label makes an image of that name and `null` hides the slot; and the drawing carries no colour of its own, so the theme colours it.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FlintSlot, type FlintSlotSize } from './FlintSlot.tsx';

afterEach(() => {
  cleanup();
});

describe('the Flint slot', () => {
  test('the box carries its size, ground and pose, 100, page and idle by default', () => {
    const { container } = render(
      <>
        <FlintSlot label={null} />
        <FlintSlot label={null} size="76" ground="strip" pose="typing" />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-flint-slot')].map((slot) => ['data-size', 'data-ground', 'data-flint-pose'].map((name) => slot.getAttribute(name))))
      .toEqual([['100', 'page', 'idle'], ['76', 'strip', 'typing']]);
  });

  test('the sprite follows the box size and keeps the placeholder viewBox', () => {
    const sizes: FlintSlotSize[] = ['112', '100', '98', '84', '76'];
    const { container } = render(<>{sizes.map((size) => <FlintSlot key={size} label={null} size={size} />)}</>);
    expect([...container.querySelectorAll('.design-system-flint-sprite')].map((sprite) => [sprite.getAttribute('width'), sprite.getAttribute('height')]))
      .toEqual([['84', '84'], ['74', '74'], ['74', '74'], ['62', '62'], ['56', '56']]);
    expect(container.querySelector('.design-system-flint-sprite')?.getAttribute('viewBox')).toBe('-31.2 -50 62.5 62.5');
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

  test('the drawing carries no colour of its own', () => {
    const { container } = render(<FlintSlot label={null} />);
    const shapes = [...container.querySelectorAll('.design-system-flint-sprite > *')];
    expect(shapes.map((shape) => shape.getAttribute('class'))).toEqual([
      'design-system-flint-shadow', 'design-system-flint-body', 'design-system-flint-eye', 'design-system-flint-eye',
    ]);
    expect(shapes.filter((shape) => shape.hasAttribute('fill') || shape.hasAttribute('style'))).toEqual([]);
  });
});
