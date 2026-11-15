/**
 * The entry's step before the first paint, in a happy-dom document. What matters: embedded, a theme the parent sends before the
 * session exchange and before React mounts is applied and outranks the viewer's stored choice, in agent-dashboard's shape for
 * `?embedded=dashboard` and only in the versioned channel's for `?embedded=gaia`; not embedded, nothing listens.
 */
import { afterEach, expect, test } from 'bun:test';

import type { PreferenceStore } from '../preferences/PreferenceStore.ts';
import { THEME_MESSAGE_KIND }   from './EmbeddedChannel.ts';
import { FirstPaint }           from './FirstPaint.ts';

const PARENT_ORIGIN = 'http://127.0.0.1:5101';
const parent = { postMessage: () => undefined } as unknown as Window;
const storeHoldingLight = { readChoice: () => 'light', writeChoice: () => undefined } as unknown as PreferenceStore;

let stopFollowing = (): void => undefined;

afterEach(() => {
  stopFollowing();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-choice');
  document.documentElement.removeAttribute('data-embedded');
});

function preparedWithSearch(search: string) {
  const outcome = FirstPaint.prepare(
    storeHoldingLight,
    {
      root: document.documentElement, search, systemPrefersDark: () => false, onSystemSchemeChange: () => () => undefined
    },
    () => ({ window, parent, parentOrigin: PARENT_ORIGIN }),
  );
  stopFollowing = outcome.stopFollowingParentTheme;
  return outcome;
}

function parentSendsDark(): void {
  window.dispatchEvent(new MessageEvent('message', { data: { kind: THEME_MESSAGE_KIND, themeChoice: 'dark' }, origin: PARENT_ORIGIN, source: parent }));
}

test('embedded, the parent\'s first theme lands before anything mounts and outranks the stored choice', () => {
  const { embeddingHost } = preparedWithSearch('?embedded=dashboard');
  expect(embeddingHost).toBe('dashboard');
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  parentSendsDark();
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
});

test('not embedded, the stored choice stays and no parent theme is followed', () => {
  const { embeddingHost } = preparedWithSearch('');
  expect(embeddingHost).toBeNull();
  parentSendsDark();
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
});

test('framed by Gaia, the root names Gaia and only the versioned channel\'s theme is followed', () => {
  const { embeddingHost } = preparedWithSearch('?embedded=gaia');
  expect(embeddingHost).toBe('gaia');
  expect(document.documentElement.getAttribute('data-embedded')).toBe('gaia');
  parentSendsDark();
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  window.dispatchEvent(new MessageEvent('message', {
    data: {
      channel: 'forge-embed', channelVersion: 1, kind: THEME_MESSAGE_KIND, themeChoice: 'dark'
    },
    origin: PARENT_ORIGIN,
    source: parent
  }));
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
});

test('another embedded value marks nothing', () => {
  const { embeddingHost } = preparedWithSearch('?embedded=gaia2');
  expect(embeddingHost).toBeNull();
  expect(document.documentElement.getAttribute('data-embedded')).toBeNull();
});
