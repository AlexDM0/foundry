/**
 * A habitat's cue for a happening it derives from its own data: the cue goes to Flint each time the occasion changes, and not for the
 * occasion the component mounts with, which is no happening.
 */
import { useEffect, useRef } from 'react';

import type { SpriteCue } from '../../flint/SpriteHabitat.ts';

/** One happening: its cue, and a key that changes when the same cue names a new happening, such as the next turn. */
export interface CueOccasion {
  readonly cueName:     SpriteCue;
  readonly occasionKey: string;
}

/** `sendCue` must stay the same function across renders, as `useFlintHabitat` gives it. Null is no happening and sends nothing. */
export function useCueOnChange(sendCue: (cueName: SpriteCue) => void, occasion: CueOccasion | null): void {
  const cueName = occasion?.cueName ?? null;
  const occasionKey = occasion?.occasionKey ?? null;
  const sentOccasionKey = useRef(occasionKey);
  useEffect(() => {
    if (occasionKey === sentOccasionKey.current) return;
    sentOccasionKey.current = occasionKey;
    if (cueName !== null) sendCue(cueName);
  }, [cueName, occasionKey, sendCue]);
}
