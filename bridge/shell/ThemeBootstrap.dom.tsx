/**
 * The theme an embedding parent sends, in a happy-dom document. What matters: each of agent-dashboard's choices lands on the root,
 * `auto` resolving through the system's scheme as a viewer's own `auto` does. It takes no store, so it cannot store the choice. While the
 * choice on the root is `auto`, a change of the system's scheme applies the theme again, so the Bridge follows the system into the night.
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
  return {
    root: document.documentElement, search: '', systemPrefersDark: () => systemPrefersDark, onSystemSchemeChange: () => () => undefined
  };
}

/** Surroundings whose system scheme the case switches, telling every follower as a browser's `change` event does. */
function surroundingsWithSwitchableScheme() {
  let systemPrefersDark = false;
  const followers = new Set<() => void>();
  return {
    surroundings: {
      root:                 document.documentElement,
      search:               '',
      systemPrefersDark:    () => systemPrefersDark,
      onSystemSchemeChange: (onChange: () => void) => {
        followers.add(onChange);
        return () => followers.delete(onChange);
      },
    },
    switchSystemTo: (dark: boolean) => {
      systemPrefersDark = dark;
      followers.forEach((onChange) => onChange());
    },
  };
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

describe('the system\'s scheme', () => {
  test('while the choice is auto, a change of the system\'s scheme applies the theme again; a fixed choice stays, and a stop ends it', () => {
    const { surroundings, switchSystemTo } = surroundingsWithSwitchableScheme();
    ThemeBootstrap.applyParentTheme('auto', surroundings);
    const stopFollowing = ThemeBootstrap.followSystemScheme(surroundings);
    switchSystemTo(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    ThemeBootstrap.applyParentTheme('light', surroundings);
    switchSystemTo(false);
    switchSystemTo(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    ThemeBootstrap.applyParentTheme('auto', surroundings);
    stopFollowing();
    switchSystemTo(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
