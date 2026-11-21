/** A frame source for Flint that moves only when a spec advances it, so no spec waits on real frames; one never advanced holds Flint still. Test-only. */
import type { FlintFrameSource } from '../flint/BoardFlint.tsx';

export interface ManualFlintFrames {
  readonly frameSource: FlintFrameSource;
  /** Gives each running frame callback one frame, `milliseconds` after the previous one. */
  readonly advance:     (milliseconds: number) => void;
}

export function createManualFlintFrames(): ManualFlintFrames {
  const callbacks = new Set<(elapsedMilliseconds: number) => void>();
  let elapsedMilliseconds = 0;
  return {
    frameSource: (onFrame) => {
      callbacks.add(onFrame);
      return () => callbacks.delete(onFrame);
    },
    advance: (milliseconds) => {
      elapsedMilliseconds += milliseconds;
      for (const onFrame of [...callbacks]) onFrame(elapsedMilliseconds);
    },
  };
}
