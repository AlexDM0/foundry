/**
 * The embed channel (FORGE_REQUIREMENTS F5, version 1). What matters (WORK_BREAKDOWN W5.5): a message reaches Gaia only from the frame's
 * own window at the frame's own origin and at `channelVersion: 1`; another origin, another window, another version, another channel or an
 * unknown kind is ignored and answered by nothing; Gaia posts only to the frame's origin, never to `*`; a closed channel hears and posts
 * nothing. The Bridge is stood in for by messages authored from F5.
 */
import { describe, expect, test } from 'bun:test';

import { BRIDGE_MESSAGES, BRIDGE_ORIGIN, bridgeStandIn } from '../../testing/AuthoredBridge.ts';
import { type BridgeMessage, EmbedChannel }              from './EmbedChannel.ts';

function openedOver(bridge = bridgeStandIn()) {
  const heard: BridgeMessage[] = [];
  const channel = EmbedChannel.open({ frameOrigin: BRIDGE_ORIGIN, frameWindow: bridge.frameWindow }, bridge.embed, (message) => heard.push(message));
  return { bridge, heard, channel };
}

describe('what the channel hears', () => {
  test('every kind the Bridge sends, from the frame\'s own window at its own origin', () => {
    const { bridge, heard } = openedOver();
    [BRIDGE_MESSAGES.ready, BRIDGE_MESSAGES.routeQuestionsE2, BRIDGE_MESSAGES.leave, BRIDGE_MESSAGES.sessionLost].forEach((message) => bridge.post(message));
    expect(heard).toEqual([{ kind: 'ready' }, { kind: 'route', fragment: '#questions/E2' }, { kind: 'leave' }, { kind: 'session-lost' }]);
  });

  test('nothing from another origin, even from the frame\'s own window', () => {
    const { bridge, heard } = openedOver();
    bridge.post(BRIDGE_MESSAGES.ready, { origin: 'http://127.0.0.1:4957', source: bridge.frameWindow });
    bridge.post(BRIDGE_MESSAGES.ready, { origin: 'http://localhost:4951', source: bridge.frameWindow });
    expect(heard).toEqual([]);
  });

  test('nothing from another window, even at the frame\'s origin', () => {
    const { bridge, heard } = openedOver();
    bridge.post(BRIDGE_MESSAGES.ready, { origin: BRIDGE_ORIGIN, source: { postMessage: () => undefined } });
    bridge.post(BRIDGE_MESSAGES.ready, { origin: BRIDGE_ORIGIN, source: null });
    expect(heard).toEqual([]);
  });

  test('nothing at another channel version, of another channel, of an unknown kind or of another shape, and answers none of it', () => {
    const { bridge, heard } = openedOver();
    [
      { ...BRIDGE_MESSAGES.ready, channelVersion: 2 },
      { ...BRIDGE_MESSAGES.ready, channelVersion: '1' },
      { channel: 'forge-embed', kind: 'ready' },
      { ...BRIDGE_MESSAGES.ready, channel: 'forge-dashboard' },
      { ...BRIDGE_MESSAGES.ready, kind: 'navigate' },
      { channel: 'forge-embed', channelVersion: 1, kind: 'route' },
      {
        channel: 'forge-embed', channelVersion: 1, kind: 'route', fragment: 7
      },
      'ready',
      null,
    ].forEach((message) => bridge.post(message));
    expect(heard).toEqual([]);
    expect(bridge.posted).toEqual([]);
  });

  test('reads only the message\'s own keys, never one it inherits', () => {
    const inherited = Object.create({ channel: 'forge-embed', channelVersion: 1, kind: 'ready' }) as object;
    expect(EmbedChannel.bridgeMessageOf(inherited)).toBeNull();
  });
});

describe('what the channel posts', () => {
  test('carries the channel\'s name and version and goes only to the frame\'s origin, never to every origin', () => {
    const { bridge, channel } = openedOver();
    channel.post({ kind: 'theme', themeChoice: 'dark' });
    channel.post({ kind: 'navigate', fragment: '#questions/E2' });
    expect(bridge.posted).toEqual([
      {
        message: {
          channel: 'forge-embed', channelVersion: 1, kind: 'theme', themeChoice: 'dark'
        },
        targetOrigin: BRIDGE_ORIGIN
      },
      {
        message: {
          channel: 'forge-embed', channelVersion: 1, kind: 'navigate', fragment: '#questions/E2'
        },
        targetOrigin: BRIDGE_ORIGIN
      },
    ]);
    expect(bridge.posted.map((posted) => posted.targetOrigin)).not.toContain('*');
  });
});

describe('a closed channel', () => {
  test('stops following the page\'s messages, hears nothing more and posts nothing', () => {
    const { bridge, heard, channel } = openedOver();
    expect(bridge.listenerCount()).toBe(1);
    channel.close();
    channel.close();
    expect(bridge.listenerCount()).toBe(0);
    bridge.post(BRIDGE_MESSAGES.ready);
    channel.post({ kind: 'theme', themeChoice: 'light' });
    expect(heard).toEqual([]);
    expect(bridge.posted).toEqual([]);
  });
});
