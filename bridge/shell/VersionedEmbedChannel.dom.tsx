/**
 * The versioned embed channel in a happy-dom window. What matters: a parent message counts only in the envelope of this channel and
 * version, from the framing parent at its origin; another version, another channel, an unknown kind or a malformed field is dropped; and
 * every message the Bridge posts carries the envelope and goes to the parent's origin only, never where that origin is unknown.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ThemeChoice }                                                 from './ThemeBootstrap.ts';
import { EMBED_CHANNEL_NAME, EMBED_CHANNEL_VERSION, VersionedEmbedChannel } from './VersionedEmbedChannel.ts';

const PARENT_ORIGIN = 'http://127.0.0.1:5180';

interface PostedMessage {
  readonly message:      unknown;
  readonly targetOrigin: string;
}

let closeChannel = (): void => undefined;

afterEach(() => {
  closeChannel();
});

function openedChannel(parentOrigin: string | null = PARENT_ORIGIN) {
  const themes: ThemeChoice[] = [];
  const fragments: string[] = [];
  const posted: PostedMessage[] = [];
  const parent = { postMessage: (message: unknown, targetOrigin: string) => posted.push({ message, targetOrigin }) } as unknown as Window;
  const surroundings = { window, parent, parentOrigin };
  const follower = VersionedEmbedChannel.followParent(surroundings, { onTheme: (choice) => themes.push(choice), onNavigate: (fragment) => fragments.push(fragment) });
  closeChannel = follower.close;
  const deliver = (data: unknown, origin = PARENT_ORIGIN, source: unknown = parent): void => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
  };
  return {
    themes, fragments, posted, surroundings, deliver
  };
}

function inEnvelope(message: object): object {
  return { channel: EMBED_CHANNEL_NAME, channelVersion: EMBED_CHANNEL_VERSION, ...message };
}

describe('parent to Bridge', () => {
  test('theme and navigate in the envelope, from the parent at its origin, are followed', () => {
    const { themes, fragments, deliver } = openedChannel();
    deliver(inEnvelope({ kind: 'theme', themeChoice: 'dark' }));
    deliver(inEnvelope({ kind: 'navigate', fragment: '#questions/E2' }));
    expect(themes).toEqual(['dark']);
    expect(fragments).toEqual(['#questions/E2']);
  });

  test('another channel version, another channel, an unknown kind or a malformed field is dropped', () => {
    const { themes, fragments, deliver } = openedChannel();
    deliver({
      channel: EMBED_CHANNEL_NAME, channelVersion: 2, kind: 'theme', themeChoice: 'dark'
    });
    deliver({
      channel: 'agent-dashboard', channelVersion: 1, kind: 'theme', themeChoice: 'dark'
    });
    deliver({ kind: 'theme', themeChoice: 'dark' });
    deliver(inEnvelope({ kind: 'reload' }));
    deliver(inEnvelope({ kind: 'theme', themeChoice: 'neon' }));
    deliver(inEnvelope({ kind: 'navigate', fragment: 'questions/E2' }));
    deliver(inEnvelope({ kind: 'navigate', fragment: 7 }));
    expect([themes, fragments]).toEqual([[], []]);
  });

  test('a message from a foreign origin or from another window is dropped', () => {
    const { themes, deliver } = openedChannel();
    deliver(inEnvelope({ kind: 'theme', themeChoice: 'dark' }), 'http://attacker.example');
    deliver(inEnvelope({ kind: 'theme', themeChoice: 'dark' }), PARENT_ORIGIN, null);
    expect(themes).toEqual([]);
  });
});

describe('Bridge to parent', () => {
  test('a posted message carries the envelope and goes to the parent\'s origin only', () => {
    const { posted, surroundings } = openedChannel();
    VersionedEmbedChannel.post(surroundings, { kind: 'route', fragment: '#agents/J12' });
    expect(posted).toEqual([{ message: inEnvelope({ kind: 'route', fragment: '#agents/J12' }), targetOrigin: PARENT_ORIGIN }]);
  });

  test('with the parent\'s origin unknown nothing is posted', () => {
    const { posted, surroundings } = openedChannel(null);
    VersionedEmbedChannel.post(surroundings, { kind: 'ready' });
    expect(posted).toEqual([]);
  });

  test('Esc with no panel open posts leave in the envelope', () => {
    const { posted, surroundings } = openedChannel();
    const forwarder = VersionedEmbedChannel.forwardEscape(surroundings, () => false);
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    } finally {
      forwarder.close();
    }
    expect(posted).toEqual([{ message: inEnvelope({ kind: 'leave' }), targetOrigin: PARENT_ORIGIN }]);
  });
});
