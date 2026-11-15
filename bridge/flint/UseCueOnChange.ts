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

/** The baseline of a habitat whose data is whole at mount: only the mounted occasion is no happening. */
const MOUNTED_DATA_BASELINE = 'mounted-data';

/**
 * `sendCue` must stay the same function across renders, as `useFlintHabitat` gives it. Null is no happening and sends nothing.
 * `baselineKey` names the data the occasion is read from when it arrives after mount, such as a chat's history: the occasion that comes
 * with a new key is that data's state, no happening, and while the key is `null` the data has not arrived and nothing is sent.
 */
export function useCueOnChange(
  sendCue: (cueName: SpriteCue) => void,
  occasion: CueOccasion | null,
  baselineKey: string | null = MOUNTED_DATA_BASELINE,
): void {
  const cueName = occasion?.cueName ?? null;
  const occasionKey = occasion?.occasionKey ?? null;
  const seen = useRef({ occasionKey, baselineKey });
  useEffect(() => {
    const previous = seen.current;
    if (occasionKey === previous.occasionKey && baselineKey === previous.baselineKey) return;
    seen.current = { occasionKey, baselineKey };
    if (baselineKey === null || baselineKey !== previous.baselineKey) return;
    if (cueName !== null) sendCue(cueName);
  }, [cueName, occasionKey, baselineKey, sendCue]);
}
