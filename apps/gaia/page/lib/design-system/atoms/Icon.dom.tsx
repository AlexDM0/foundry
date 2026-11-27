/**
 * The icon, in a happy-dom document. What matters: every name draws one `svg` on the 16 by 16 grid, with its name in `data-icon` and at
 * least one path, and no two names draw the same path, so each role reads apart from every other; a label makes the drawing an image of
 * that name, and `null` hides it from the accessibility tree with no role, so a word printed beside it is not named twice.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Icon, ICON_PATHS, type IconName } from './Icon.tsx';

const EVERY_ICON_NAME = Object.keys(ICON_PATHS) as IconName[];

afterEach(() => {
  cleanup();
});

describe('the icon', () => {
  test('every name draws one svg on the 16 by 16 grid, with its name and at least one path', () => {
    expect(EVERY_ICON_NAME).toEqual([
      'hammer',
      'magnifier',
      'inbox',
      'lifebuoy',
      'flow',
      'merge',
      'cycle',
      'document',
      'dot',
      'paper-plane',
      'narrowing-lines',
      'arrow-out-of-square',
      'caret-down',
      'chevron-down',
      'chevron-up',
      'check',
      'plus',
      'exclamation-triangle',
      'stopwatch',
    ]);
    for (const name of EVERY_ICON_NAME) {
      const { container } = render(<Icon name={name} label={null} />);
      const drawings = container.querySelectorAll('svg');
      expect(drawings.length).toBe(1);
      const drawing = drawings[0];
      expect([drawing?.getAttribute('class'), drawing?.getAttribute('viewBox'), drawing?.getAttribute('data-icon')])
        .toEqual(['design-system-icon', '0 0 16 16', name]);
      expect(drawing?.querySelectorAll('path').length).toBeGreaterThanOrEqual(1);
      cleanup();
    }
  });

  test('no two names draw the same path', () => {
    const pathsByName = EVERY_ICON_NAME.map((name) => {
      const { container } = render(<Icon name={name} label={null} />);
      const pathData = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d')).join(' ');
      cleanup();
      return pathData;
    });
    expect(pathsByName.every((pathData) => pathData.length > 0)).toBe(true);
    expect(new Set(pathsByName).size).toBe(EVERY_ICON_NAME.length);
  });

  test('a label makes the drawing an image of that name, not hidden', () => {
    render(<Icon name="hammer" label="writer" />);
    const image = screen.getByRole('img', { name: 'writer' });
    expect([image.getAttribute('data-icon'), image.hasAttribute('aria-hidden')]).toEqual(['hammer', false]);
  });

  test('without a label the drawing is hidden from the accessibility tree and has no role', () => {
    const { container } = render(<Icon name="magnifier" label={null} />);
    const drawing = container.querySelector('svg');
    expect([drawing?.getAttribute('aria-hidden'), drawing?.hasAttribute('role'), drawing?.hasAttribute('aria-label')]).toEqual(['true', false, false]);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
