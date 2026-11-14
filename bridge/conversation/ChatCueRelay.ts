/**
 * How the composer reaches the chat habitat its card holds: the thread registers the habitat and connects its cue sender, the card
 * provides the relay, and the composer cues through it. A cue with no thread connected goes nowhere; the context is null outside a card.
 */
import { createContext } from 'react';

import type { SpriteCue } from '../../flint/SpriteHabitat.ts';

export interface ChatCueRelay {
  /** Returns the function that disconnects this sender, unless another connected since. */
  readonly connect: (sendCue: (cueName: SpriteCue) => void) => () => void;
  readonly cue:     (cueName: SpriteCue) => void;
}

export function createChatCueRelay(): ChatCueRelay {
  let connectedSender: ((cueName: SpriteCue) => void) | null = null;
  return {
    connect: (sendCue) => {
      connectedSender = sendCue;
      return () => {
        if (connectedSender === sendCue) connectedSender = null;
      };
    },
    cue: (cueName) => connectedSender?.(cueName),
  };
}

export const ChatCueRelayContext = createContext<ChatCueRelay | null>(null);
