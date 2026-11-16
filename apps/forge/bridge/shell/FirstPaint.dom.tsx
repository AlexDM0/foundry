/**
 * The entry's step before the first paint, in a happy-dom document. What matters: at `?embedded=frame` the root carries the embed mode and
 * a theme the parent sends before the session exchange and before React mounts is applied, only in the embed channel's envelope, and
 * outranks the viewer's stored choice; not embedded, and at any other `embedded` value, retired ones included, nothing is marked and
 * nothing listens.
 */
import { afterEach, expect, test } from 'bun:test';

import type { PreferenceStore } from '../preferences/PreferenceStore.ts';
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

function parentSendsDarkInEnvelope(): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: {
      channel: 'forge-embed', channelVersion: 1, kind: 'theme', themeChoice: 'dark'
    },
    origin: PARENT_ORIGIN,
    source: parent
  }));
}

function parentSendsDarkWithoutEnvelope(): void {
  window.dispatchEvent(new MessageEvent('message', { data: { kind: 'theme', themeChoice: 'dark' }, origin: PARENT_ORIGIN, source: parent }));
}

test('in the frame, the root carries the mode and only the channel\'s first theme lands, before anything mounts, over the stored choice', () => {
  const { embedMode } = preparedWithSearch('?embedded=frame');
  expect(embedMode).toBe('frame');
  expect(document.documentElement.getAttribute('data-embedded')).toBe('frame');
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  parentSendsDarkWithoutEnvelope();
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  parentSendsDarkInEnvelope();
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
});

test('not embedded, the stored choice stays and no parent theme is followed', () => {
  const { embedMode } = preparedWithSearch('');
  expect(embedMode).toBeNull();
  parentSendsDarkInEnvelope();
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
});

test('any other embedded value, the retired dashboard and gaia among them, marks nothing and follows no theme', () => {
  for (const search of ['?embedded=dashboard', '?embedded=gaia', '?embedded=frame2']) {
    const { embedMode } = preparedWithSearch(search);
    expect(embedMode).toBeNull();
    expect(document.documentElement.getAttribute('data-embedded')).toBeNull();
    parentSendsDarkInEnvelope();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    stopFollowing();
  }
});
