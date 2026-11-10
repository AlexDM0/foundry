/**
 * The theme an embedding parent sends, in a happy-dom document. What matters: each of agent-dashboard's choices lands on the root,
 * `auto` resolving through the system's scheme as a viewer's own `auto` does. It takes no store, so it cannot store the choice.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ThemeBootstrap } from './ThemeBootstrap.ts';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-choice');
});

function surroundingsWhereSystemPrefersDark(systemPrefersDark: boolean) {
  return { root: document.documentElement, search: '', systemPrefersDark: () => systemPrefersDark };
}

describe('the parent\'s theme', () => {
  test('light and dark land on the root as they are', () => {
    ThemeBootstrap.applyParentTheme('dark', surroundingsWhereSystemPrefersDark(false));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    ThemeBootstrap.applyParentTheme('light', surroundingsWhereSystemPrefersDark(true));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('auto resolves through the system\'s scheme and keeps auto as the choice', () => {
    ThemeBootstrap.applyParentTheme('auto', surroundingsWhereSystemPrefersDark(true));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme-choice')).toBe('auto');
  });
});
