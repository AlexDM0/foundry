/**
 * The embed channel (F5): the messages between a framing page and one forge's Bridge in its frame, posted only to the other end's origin.
 * Each message carries the channel's name and version beside its own keys; a message of another name or major is ignored.
 */

export interface EmbedChannelEnvelope {
  readonly channel:        'forge-embed';
  readonly channelVersion: number;
  /** Absent reads as 0. */
  readonly channelMinor?:  number;
}

/** What the Bridge tells its framing page: it painted and listens, its route changed, Esc was left unused, or an API call found its session gone. */
export type BridgeMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'route'; readonly fragment: string }
  | { readonly kind: 'leave' }
  | { readonly kind: 'session-lost' };

export type EmbedThemeChoice = 'auto' | 'light' | 'dark';

/** What the framing page tells the Bridge: the theme User chose, or the route to go to. */
export type FramingPageMessage = { readonly kind: 'theme'; readonly themeChoice: EmbedThemeChoice } | { readonly kind: 'navigate'; readonly fragment: string };
