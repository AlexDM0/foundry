/** A frame source a spec drives by hand: each `advance` delivers one frame, so no spec waits on real time. */
import type { FrameSource } from '../FrameSource.ts';

export interface ManualFrameSource {
  readonly frameSource:         FrameSource;
  /** Delivers one frame this many milliseconds after the last one, if a listener is running. */
  readonly advance:             (milliseconds: number) => void;
  readonly isRunning:           () => boolean;
  readonly elapsedMilliseconds: () => number;
}

export function createManualFrameSource(): ManualFrameSource {
  let elapsedMilliseconds = 0;
  let listener: ((elapsedMilliseconds: number) => void) | null = null;
  return {
    frameSource: (onFrame) => {
      listener = onFrame;
      return () => {
        listener = null;
      };
    },
    advance: (milliseconds) => {
      elapsedMilliseconds += milliseconds;
      listener?.(elapsedMilliseconds);
    },
    isRunning:           () => listener !== null,
    elapsedMilliseconds: () => elapsedMilliseconds,
  };
}
