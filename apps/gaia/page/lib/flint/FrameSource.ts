/**
 * Where time comes from. Flint reads no clock: a frame source calls back on each frame with the milliseconds elapsed since it started, and
 * a spec or a host gives its own source in place of the browser's animation frames.
 */

/** Starts calling back on each frame; returns the function that stops it. */
export type FrameSource = (onFrame: (elapsedMilliseconds: number) => void) => () => void;

/** The two calls of `window` the default source needs, so a spec can give a fake scheduler. */
export interface AnimationFrameScheduler {
  readonly requestAnimationFrame: (callback: (timestamp: number) => void) => number;
  readonly cancelAnimationFrame:  (handle: number) => void;
}

/** A frame source on the scheduler's animation frames: the first frame is elapsed 0, each later one the time since that first frame. */
export function animationFrameSourceOf(scheduler: AnimationFrameScheduler): FrameSource {
  return (onFrame) => {
    let firstTimestamp: number | null = null;
    let handle: number | null = null;
    const onAnimationFrame = (timestamp: number): void => {
      firstTimestamp ??= timestamp;
      handle = scheduler.requestAnimationFrame(onAnimationFrame);
      onFrame(timestamp - firstTimestamp);
    };
    handle = scheduler.requestAnimationFrame(onAnimationFrame);
    return () => {
      if (handle !== null) scheduler.cancelAnimationFrame(handle);
      handle = null;
    };
  };
}
