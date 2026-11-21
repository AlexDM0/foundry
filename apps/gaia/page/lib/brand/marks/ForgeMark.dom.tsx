/**
 * Forge's mark, in a happy-dom document. What matters: it is an image named "Forge", 22 px by default, on its tile, in classes and ids of its
 * own, with Forge's hexagon ring and core and the node at Forge's place; its title and its double-click handler reach the drawing only
 * when given.
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

import { ForgeMark } from './ForgeMark.tsx';

afterEach(() => {
  cleanup();
});

describe('the forge mark', () => {
  test('it is an image named Forge, 22 px by default, with no title, the hexagon ring and core and the node at Forge\'s place', () => {
    const { container } = render(<ForgeMark />);
    const mark = screen.getByRole('img', { name: 'Forge' });
    expect([mark.getAttribute('class'), mark.getAttribute('width'), mark.getAttribute('height'), mark.getAttribute('viewBox')])
      .toEqual(['brand-forge-mark', '22', '22', '0 0 64 64']);
    expect(container.querySelector('title')).toBeNull();
    expect(container.querySelector('.brand-forge-mark-ring')?.tagName.toLowerCase()).toBe('path');
    expect(container.querySelector('.brand-forge-mark-core')?.tagName.toLowerCase()).toBe('path');
    const node = container.querySelector('.brand-forge-mark-node-core');
    expect([node?.getAttribute('cx'), node?.getAttribute('cy'), node?.getAttribute('r')]).toEqual(['48.02', '22.75', '3.4']);
  });

  test('its gradient and mask carry ids of its own, which its tile and ring point at', () => {
    const { container } = render(<ForgeMark />);
    expect([...container.querySelectorAll('[id]')].map((element) => element.getAttribute('id'))).toEqual(['brand-forge-mark-ground', 'brand-forge-mark-gap']);
    expect(container.querySelector('[fill^="url("]')?.getAttribute('fill')).toBe('url(#brand-forge-mark-ground)');
    expect(container.querySelector('[mask]')?.getAttribute('mask')).toBe('url(#brand-forge-mark-gap)');
  });

  test('it takes the size it is given', () => {
    render(<ForgeMark sizePixels={88} />);
    const mark = screen.getByRole('img', { name: 'Forge' });
    expect([mark.getAttribute('width'), mark.getAttribute('height')]).toEqual(['88', '88']);
  });

  test('a title and a double-click handler reach the drawing when given', () => {
    const presses: string[] = [];
    const { container } = render(<ForgeMark title="Double-click to open" onDoubleClick={() => presses.push('open')} />);
    expect(container.querySelector('title')?.textContent).toBe('Double-click to open');
    fireEvent.doubleClick(screen.getByRole('img', { name: 'Forge' }));
    expect(presses).toEqual(['open']);
  });
});
