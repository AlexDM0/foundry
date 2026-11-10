/**
 * The embedded channel in a happy-dom window. What matters: the messages have agent-dashboard's own shapes, a theme message is
 * taken only from the framing parent at its origin, a message from a foreign origin or another window is dropped, and Esc reaches
 * the parent at its origin only while no panel is open and no inner layer used the key.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { EmbeddedChannel, LEAVE_BOARD_MESSAGE_KIND, THEME_MESSAGE_KIND } from './EmbeddedChannel.ts';
import type { ThemeChoice }                                              from './ThemeBootstrap.ts';

const PARENT_ORIGIN = 'http://127.0.0.1:5101';

interface PostedMessage {
  readonly message:      unknown;
  readonly targetOrigin: string;
}

let closeChannel = (): void => undefined;

afterEach(() => {
  closeChannel();
});

function openedChannel(panelIsOpen = false) {
  const themes: ThemeChoice[] = [];
  const posted: PostedMessage[] = [];
  const parent = {
    postMessage: (message: unknown, targetOrigin: string) => {
      posted.push({ message, targetOrigin });
    },
  } as unknown as Window;
  const surroundings = { window, parent, parentOrigin: PARENT_ORIGIN };
  const themeFollower = EmbeddedChannel.followParentTheme(surroundings, (themeChoice) => themes.push(themeChoice));
  const escapeForwarder = EmbeddedChannel.forwardEscape(surroundings, () => panelIsOpen);
  closeChannel = () => {
    themeFollower.close();
    escapeForwarder.close();
  };
  const deliver = (data: unknown, origin: string, source: unknown) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
  };
  return {
    themes, posted, parent, deliver
  };
}

describe('theme in', () => {
  test('the parent\'s theme message at its origin is applied, in agent-dashboard\'s shape and with each of its choices', () => {
    const { themes, parent, deliver } = openedChannel();
    deliver({ kind: THEME_MESSAGE_KIND, themeChoice: 'dark' }, PARENT_ORIGIN, parent);
    deliver({ kind: THEME_MESSAGE_KIND, themeChoice: 'light' }, PARENT_ORIGIN, parent);
    deliver({ kind: THEME_MESSAGE_KIND, themeChoice: 'auto' }, PARENT_ORIGIN, parent);
    expect(themes).toEqual(['dark', 'light', 'auto']);
  });

  test('a message from a foreign origin, from another window or of another shape is dropped', () => {
    const { themes, parent, deliver } = openedChannel();
    deliver({ kind: THEME_MESSAGE_KIND, themeChoice: 'dark' }, 'http://attacker.example', parent);
    deliver({ kind: THEME_MESSAGE_KIND, themeChoice: 'dark' }, PARENT_ORIGIN, null);
    deliver({ kind: THEME_MESSAGE_KIND, themeChoice: 'neon' }, PARENT_ORIGIN, parent);
    deliver({ type: 'agent-progress:theme', theme: 'dark' }, PARENT_ORIGIN, parent);
    deliver([THEME_MESSAGE_KIND, 'dark'], PARENT_ORIGIN, parent);
    deliver('theme dark', PARENT_ORIGIN, parent);
    expect(themes).toEqual([]);
  });
});

describe('Esc out', () => {
  test('Esc with no panel open posts agent-dashboard\'s leave-board message to the parent\'s origin only', () => {
    const { posted } = openedChannel();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(posted).toEqual([{ message: { kind: LEAVE_BOARD_MESSAGE_KIND }, targetOrigin: PARENT_ORIGIN }]);
  });

  test('an Esc an inner layer already used, by preventing its default, posts nothing', () => {
    const { posted } = openedChannel();
    const closeLayerOnEscape = (event: KeyboardEvent): void => event.preventDefault();
    document.addEventListener('keydown', closeLayerOnEscape);
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    } finally {
      document.removeEventListener('keydown', closeLayerOnEscape);
    }
    expect(posted).toEqual([]);
  });

  test('Esc with a panel open, and any other key, posts nothing', () => {
    const { posted } = openedChannel(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(posted).toEqual([]);
  });
});
