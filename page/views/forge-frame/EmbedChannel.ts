/**
 * The embed channel of FORGE_REQUIREMENTS F5 at `channelVersion: 1`: the messages between Gaia's page and one forge's Bridge in its frame.
 * A message is read only when it comes from the frame's own window at the frame's own origin and carries the channel's name and known
 * version; anything else is ignored and answered by nothing. Gaia posts only to the frame's origin, never to `*`.
 */
import { CONTRACT_VERSIONS } from '../../../src/shared/constants/ContractVersions.ts';
import type { ThemeChoice }  from '../../shared/@types/ThemeChoice.ts';

/** What the Bridge tells Gaia: it painted and listens, its route changed, Esc was left unused, or an API call found its session gone. */
export type BridgeMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'route'; readonly fragment: string }
  | { readonly kind: 'leave' }
  | { readonly kind: 'session-lost' };

/** What Gaia tells the Bridge: the theme User chose, or the route to go to. */
export type GaiaMessage = { readonly kind: 'theme'; readonly themeChoice: ThemeChoice } | { readonly kind: 'navigate'; readonly fragment: string };

/** A message event as the channel reads it: who sent it, from where, and what. */
export interface EmbedMessageEvent {
  readonly origin: string;
  readonly source: unknown;
  readonly data:   unknown;
}

/** The frame's window as the channel posts to it. */
export interface EmbedFrameWindow {
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
}

/** Where the page hears every message posted to it, so a spec can post its own. */
export interface EmbedChannelSurroundings {
  readonly followMessages: (listener: (event: EmbedMessageEvent) => void) => () => void;
}

export interface EmbedChannelEnds {
  readonly frameOrigin: string;
  readonly frameWindow: EmbedFrameWindow;
}

export interface OpenEmbedChannel {
  readonly post:  (message: GaiaMessage) => void;
  readonly close: () => void;
}

const CHANNEL_NAME = 'forge-embed';

function fieldOf(data: object, key: string): unknown {
  return Object.hasOwn(data, key) ? (data as Readonly<Record<string, unknown>>)[key] : undefined;
}

/** The Bridge's message at the known channel version, or `null` for anything the channel does not know. */
function bridgeMessageOf(data: unknown): BridgeMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  if (fieldOf(data, 'channel') !== CHANNEL_NAME || fieldOf(data, 'channelVersion') !== CONTRACT_VERSIONS.forgeEmbedChannel) return null;
  const kind = fieldOf(data, 'kind');
  switch (kind) {
    case 'ready':
    case 'leave':
    case 'session-lost':
      return { kind };
    case 'route': {
      const fragment = fieldOf(data, 'fragment');
      return typeof fragment === 'string' ? { kind, fragment } : null;
    }
    default:
      return null;
  }
}

/** A message reaches Gaia only from the frame's own window at the frame's own origin: another window, or the frame at another origin, is not heard. */
function messageIsFromTheFrame(event: EmbedMessageEvent, { frameOrigin, frameWindow }: EmbedChannelEnds): boolean {
  return event.origin === frameOrigin && event.source === frameWindow;
}

function documentOf(message: GaiaMessage): Readonly<Record<string, unknown>> {
  return { channel: CHANNEL_NAME, channelVersion: CONTRACT_VERSIONS.forgeEmbedChannel, ...message };
}

function open(ends: EmbedChannelEnds, surroundings: EmbedChannelSurroundings, onMessage: (message: BridgeMessage) => void): OpenEmbedChannel {
  let isOpen = true;
  const stopFollowing = surroundings.followMessages((event) => {
    if (!isOpen || !messageIsFromTheFrame(event, ends)) return;
    const message = bridgeMessageOf(event.data);
    if (message !== null) onMessage(message);
  });
  return {
    post: (message) => {
      if (isOpen) ends.frameWindow.postMessage(documentOf(message), ends.frameOrigin);
    },
    close: () => {
      if (!isOpen) return;
      isOpen = false;
      stopFollowing();
    },
  };
}

function browserSurroundings(): EmbedChannelSurroundings {
  return {
    followMessages: (listener) => {
      const onMessage = (event: MessageEvent<unknown>): void => listener({ origin: event.origin, source: event.source, data: event.data });
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    },
  };
}

export const EmbedChannel = {
  CHANNEL_NAME,
  open,
  bridgeMessageOf,
  browserSurroundings,
} as const;
