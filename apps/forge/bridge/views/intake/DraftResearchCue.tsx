/**
 * Inside an intake chat's card, sends the chat habitat's cue that a filing draft is researched (`IntakeSpriteModel`), through the card's
 * relay to its thread, after each new list of drafts. The drafts it mounts with are no change. It renders nothing.
 */
import { useContext, useEffect, useRef } from 'react';

import { ChatCueRelayContext } from '../../conversation/ChatCueRelay.ts';
import type { CuedDraft }      from './IntakeSpriteModel.ts';
import { IntakeSpriteModel }   from './IntakeSpriteModel.ts';

/** `drafts` is the board's own list, the same array while the board is the same. */
export function DraftResearchCue({ drafts }: { readonly drafts: readonly CuedDraft[] }) {
  const cueRelay = useContext(ChatCueRelayContext);
  const previousDrafts = useRef(drafts);
  useEffect(() => {
    if (previousDrafts.current === drafts) return;
    const cueNames = IntakeSpriteModel.cuesBetween(previousDrafts.current, drafts);
    previousDrafts.current = drafts;
    for (const cueName of cueNames) cueRelay?.cue(cueName);
  }, [drafts, cueRelay]);
  return null;
}
