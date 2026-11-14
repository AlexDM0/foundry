/**
 * The default frame source on a fake scheduler, so no spec waits on real frames. What matters: the first frame is elapsed 0 and each
 * later frame the time since it, the source asks for the next frame before it calls back, and stopping cancels the frame it asked for.
 */
import { expect, test } from 'bun:test';

import type { AnimationFrameScheduler } from './FrameSource.ts';
import { animationFrameSourceOf }       from './FrameSource.ts';

function fakeScheduler(): AnimationFrameScheduler & { readonly runFrame: (timestamp: number) => void; readonly cancelled: number[] } {
  const pending = new Map<number, (timestamp: number) => void>();
  const cancelled: number[] = [];
  let nextHandle = 1;
  return {
    requestAnimationFrame: (callback) => {
      pending.set(nextHandle, callback);
      nextHandle++;
      return nextHandle - 1;
    },
    cancelAnimationFrame: (handle) => {
      pending.delete(handle);
      cancelled.push(handle);
    },
    runFrame: (timestamp) => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(timestamp);
    },
    cancelled,
  };
}

test('the first frame is elapsed 0, and each later frame the time since the first', () => {
  const scheduler = fakeScheduler();
  const elapsed: number[] = [];
  animationFrameSourceOf(scheduler)((elapsedMilliseconds) => elapsed.push(elapsedMilliseconds));
  scheduler.runFrame(5000);
  scheduler.runFrame(5016);
  scheduler.runFrame(5050);
  expect(elapsed).toEqual([0, 16, 50]);
});

test('stopping cancels the next frame, also when a frame stops the source', () => {
  const scheduler = fakeScheduler();
  const elapsed: number[] = [];
  const stop = animationFrameSourceOf(scheduler)((elapsedMilliseconds) => {
    elapsed.push(elapsedMilliseconds);
    if (elapsed.length === 2) stop();
  });
  scheduler.runFrame(0);
  scheduler.runFrame(16);
  scheduler.runFrame(32);
  expect(elapsed).toEqual([0, 16]);
  expect(scheduler.cancelled).toEqual([3]);
});
