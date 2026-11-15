/**
 * The embed channel of FORGE_REQUIREMENTS F5 at `channelVersion: 1`: the messages between Gaia's page and one forge's Bridge in its frame.
 * A message is read only when it comes from the frame's own window at the frame's own origin and carries the channel's name and known
 * version; anything else is ignored and answered by nothing. Every message Gaia posts carries Gaia's system version, and a Bridge's
 * system version is handed on with its message where it names one (V5); one that names a malformed version is not heard. Gaia posts only
 * to the frame's origin, never to `*`.
 */
import type { BridgeMessage, EmbedChannelEnvelope, FramingPageMessage } from 'forge-contracts/EmbedChannelMessage';
import type { SystemVersion }                                           from 'system-versions/VersionsDocument';

import { CONTRACT_VERSIONS }   from '../../../src/shared/constants/ContractVersions.ts';
import { GAIA_SYSTEM_VERSION } from '../../../src/shared/constants/GaiaSystemVersions.ts';
import { ContractVersionUtil } from '../../../src/shared/utils/ContractVersionUtil.ts';
import { SystemVersionUtil }   from '../../../src/shared/utils/SystemVersionUtil.ts';

export type { BridgeMessage };

/** What Gaia tells the Bridge: the theme User chose, or the route to go to. */
export type GaiaMessage = FramingPageMessage;

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

const CHANNEL_NAME: EmbedChannelEnvelope['channel'] = 'forge-embed';

const CHANNEL_VERSION_KEYS = { majorKey: 'channelVersion' } as const;

const SYSTEM_VERSION_KEY = 'systemVersion';

function fieldOf(data: object, key: string): unknown {
  return Object.hasOwn(data, key) ? (data as Readonly<Record<string, unknown>>)[key] : undefined;
}

/** The system version a Bridge's message names: `null` from a Bridge before V5, which names none, and `malformed` for one that is no version. */
function senderSystemVersionOf(data: object): SystemVersion | null | 'malformed' {
  const systemVersion = fieldOf(data, SYSTEM_VERSION_KEY);
  if (systemVersion === undefined) return null;
  return SystemVersionUtil.systemVersionOf(systemVersion) ?? 'malformed';
}

/** The Bridge's message at the known channel version, or `null` for anything the channel does not know. */
function bridgeMessageOf(data: unknown): BridgeMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  if (fieldOf(data, 'channel') !== CHANNEL_NAME || ContractVersionUtil.readMajorOf(data, CHANNEL_VERSION_KEYS, CONTRACT_VERSIONS.forgeEmbedChannel) === null) return null;
  if (senderSystemVersionOf(data) === 'malformed') return null;
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

function documentOf(message: GaiaMessage): EmbedChannelEnvelope & GaiaMessage {
  return {
    channel:        CHANNEL_NAME,
    channelVersion: CONTRACT_VERSIONS.forgeEmbedChannel,
    systemVersion:  GAIA_SYSTEM_VERSION,
    ...message,
  };
}

/** `bridgeSystemVersion` is the forge's system version as its Bridge names it, `null` from a Bridge that names none. */
export type BridgeMessageListener = (message: BridgeMessage, bridgeSystemVersion: SystemVersion | null) => void;

function open(ends: EmbedChannelEnds, surroundings: EmbedChannelSurroundings, onMessage: BridgeMessageListener): OpenEmbedChannel {
  let isOpen = true;
  const stopFollowing = surroundings.followMessages((event) => {
    if (!isOpen || !messageIsFromTheFrame(event, ends)) return;
    const message = bridgeMessageOf(event.data);
    if (message === null) return;
    const bridgeSystemVersion = senderSystemVersionOf(event.data as object);
    onMessage(message, bridgeSystemVersion === 'malformed' ? null : bridgeSystemVersion);
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
