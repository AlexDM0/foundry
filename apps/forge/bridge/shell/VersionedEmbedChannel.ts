/**
 * The embed channel a framing page opens the Bridge with (`?embedded=frame`): every `postMessage` in either direction is
 * `{channel: 'forge-embed', channelVersion, kind, …}`, accepted only from the framing parent at its own origin and posted only to that
 * origin, and each message the Bridge posts names forge's system version. A message of another channel or another `channelVersion` is
 * dropped and answered by nothing; a key the Bridge does not know, the framing page's system version among them, is passed over.
 */
import type { EmbedChannelEnvelope } from 'forge-contracts/EmbedChannelMessage';
import { FORGE_SYSTEM_VERSIONS }     from 'forge-contracts/ForgeSystemVersions';

import { SERVED_CONTRACT_VERSIONS }                   from '../../src/shared/constants/OverseerApiContracts.ts';
import { EmbeddedChannel, type EmbeddedSurroundings } from './EmbeddedChannel.ts';
import type { ThemeChoice }                           from './ThemeBootstrap.ts';

/** The contract's own name, fixed with every framing page, so it stays this literal whatever the program is called. */
export const EMBED_CHANNEL_NAME: EmbedChannelEnvelope['channel'] = 'forge-embed';

export const EMBED_CHANNEL_VERSION = SERVED_CONTRACT_VERSIONS.embed;

export type BridgeToParentMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'route'; readonly fragment: string }
  | { readonly kind: 'leave' }
  | { readonly kind: 'session-lost' };

export type ParentToBridgeMessage =
  | { readonly kind: 'theme'; readonly themeChoice: ThemeChoice }
  | { readonly kind: 'navigate'; readonly fragment: string };

export interface ParentMessageHandlers {
  readonly onTheme?:    (themeChoice: ThemeChoice) => void;
  readonly onNavigate?: (fragment: string) => void;
}

const FRAGMENT_PREFIX = '#';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parentMessageOf(data: unknown): ParentToBridgeMessage | null {
  if (!isRecord(data) || data['channel'] !== EMBED_CHANNEL_NAME || data['channelVersion'] !== EMBED_CHANNEL_VERSION) return null;
  const { kind, themeChoice, fragment } = data;
  if (kind === 'theme') return themeChoice === 'auto' || themeChoice === 'light' || themeChoice === 'dark' ? { kind, themeChoice } : null;
  if (kind === 'navigate') return typeof fragment === 'string' && fragment.startsWith(FRAGMENT_PREFIX) ? { kind, fragment } : null;
  return null;
}

function envelopeOf(message: BridgeToParentMessage): EmbedChannelEnvelope & BridgeToParentMessage {
  return {
    channel: EMBED_CHANNEL_NAME, channelVersion: EMBED_CHANNEL_VERSION, systemVersion: FORGE_SYSTEM_VERSIONS.current, ...message
  };
}

function followParent(surroundings: EmbeddedSurroundings, handlers: ParentMessageHandlers): EmbeddedChannel {
  const { parent, parentOrigin } = surroundings;
  const onMessage = (event: MessageEvent): void => {
    if (parentOrigin === null || event.origin !== parentOrigin || event.source !== parent) return;
    const message = parentMessageOf(event.data);
    if (message?.kind === 'theme') handlers.onTheme?.(message.themeChoice);
    if (message?.kind === 'navigate') handlers.onNavigate?.(message.fragment);
  };
  surroundings.window.addEventListener('message', onMessage as EventListener);
  return { close: () => surroundings.window.removeEventListener('message', onMessage as EventListener) };
}

/** Nothing is posted where the parent or its origin cannot be known, and never to `*`. */
function post(surroundings: EmbeddedSurroundings, message: BridgeToParentMessage): void {
  const { parent, parentOrigin } = surroundings;
  if (parent === null || parentOrigin === null) return;
  parent.postMessage(envelopeOf(message), parentOrigin);
}

function forwardEscape(surroundings: EmbeddedSurroundings, panelIsOpen: () => boolean): EmbeddedChannel {
  return EmbeddedChannel.forwardEscape(surroundings, panelIsOpen, envelopeOf({ kind: 'leave' }));
}

export const VersionedEmbedChannel = Object.freeze({
  parentMessageOf, followParent, post, forwardEscape,
});
