/**
 * Test-only: one forge's Bridge in Gaia's frame, stood in for. Its messages and the frame session answers are authored by hand from
 * FORGE_REQUIREMENTS F5 and PLAN 8.3; recording the messages from a Bridge Gaia frames waits in `docs/backlog.md`. The page's message
 * listeners and the frame's window are the spec's: a spec posts the Bridge's messages to the page and reads what Gaia posted to the frame,
 * and to which origin.
 */
import type { FrameSessionAnswerDocument }                  from '../@types/FrameSessionDocument.ts';
import type { EmbedChannelSurroundings, EmbedMessageEvent } from '../views/forge-frame/EmbedChannel.ts';

/** Example Storefront's Overseer in `fleet-five-forges`. */
export const BRIDGE_ORIGIN = 'http://127.0.0.1:4951';

export const BRIDGE_MESSAGES = {
  ready:            { channel: 'forge-embed', channelVersion: 1, kind: 'ready' },
  routeQuestionsE2: {
    channel: 'forge-embed', channelVersion: 1, kind: 'route', fragment: '#questions/E2'
  },
  routeKanban: {
    channel: 'forge-embed', channelVersion: 1, kind: 'route', fragment: '#kanban'
  },
  leave:       { channel: 'forge-embed', channelVersion: 1, kind: 'leave' },
  sessionLost: { channel: 'forge-embed', channelVersion: 1, kind: 'session-lost' },
} as const;

/** The one-time code a frame session answer carries in the frame's address, numbered per session. */
export function sessionCodeOf(sessionNumber: number): string {
  return `example-one-time-code-${sessionNumber}`;
}

export function frameUrlOf(sessionNumber: number, origin = BRIDGE_ORIGIN): string {
  return `${origin}/?embedded=gaia#session=${sessionCodeOf(sessionNumber)}`;
}

export const FRAME_SESSION_ANSWERS = {
  opened: (sessionNumber: number, origin = BRIDGE_ORIGIN): FrameSessionAnswerDocument => ({
    frameSessionVersion: 1, outcome: 'done', frameUrl: frameUrlOf(sessionNumber, origin), refusal: null, text: null,
  }),
  notSupported: {
    frameSessionVersion: 1, outcome: 'not-supported', frameUrl: null, refusal: null, text: null,
  },
  unreachable: {
    frameSessionVersion: 1, outcome: 'unreachable', frameUrl: null, refusal: null, text: null,
  },
  tokenRejected: {
    frameSessionVersion: 1, outcome: 'refused', frameUrl: null, refusal: 'token-rejected', text: null,
  },
  forgeRefused: {
    frameSessionVersion: 1, outcome: 'refused', frameUrl: null, refusal: 'sessions-full', text: 'The Overseer holds as many sessions as it allows.',
  },
} as const satisfies Readonly<Record<string, FrameSessionAnswerDocument | ((sessionNumber: number) => FrameSessionAnswerDocument)>>;

export interface PostedToFrame {
  readonly message:      unknown;
  readonly targetOrigin: string;
}

export interface BridgeStandIn {
  readonly frameWindow:   { readonly postMessage: (message: unknown, targetOrigin: string) => void };
  /** Everything Gaia posted to the frame's window, in order. */
  readonly posted:        PostedToFrame[];
  readonly embed:         EmbedChannelSurroundings;
  readonly listenerCount: () => number;
  /** Posts as the Bridge in the frame does, from its window at its origin, unless the spec names another sender. */
  readonly post:          (data: unknown, sender?: Pick<EmbedMessageEvent, 'origin' | 'source'>) => void;
}

export function bridgeStandIn(origin = BRIDGE_ORIGIN): BridgeStandIn {
  const listeners = new Set<(event: EmbedMessageEvent) => void>();
  const posted: PostedToFrame[] = [];
  const frameWindow = { postMessage: (message: unknown, targetOrigin: string) => posted.push({ message, targetOrigin }) };
  return {
    frameWindow,
    posted,
    embed: {
      followMessages: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    listenerCount: () => listeners.size,
    post:          (data, sender = { origin, source: frameWindow }) => [...listeners].forEach((listener) => listener({ ...sender, data })),
  };
}
