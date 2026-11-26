/** A board clock whose timers fire only when a spec says that time passed, for the DOM specs of what waits on the clock. */
import { act } from '@testing-library/react';

import type { BoardClock } from '../shell/BoardClock.ts';

interface PendingTimer {
  readonly milliseconds: number;
  readonly callback:     () => void;
  cancelled:             boolean;
}

export interface ManualBoardClock {
  readonly clock:  BoardClock;
  /** Fires, inside `act`, every timer still pending that is due within `milliseconds` of its start. */
  readonly passes: (milliseconds: number) => void;
}

export function manualBoardClock(): ManualBoardClock {
  const timers: PendingTimer[] = [];
  const clock: BoardClock = {
    now:         () => new Date(0),
    everySecond: () => () => undefined,
    after:       (milliseconds, callback) => {
      const timer: PendingTimer = { milliseconds, callback, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  return {
    clock,
    passes: (milliseconds) => {
      act(() => {
        timers.filter((timer) => !timer.cancelled && timer.milliseconds <= milliseconds).forEach((timer) => {
          timer.cancelled = true;
          timer.callback();
        });
      });
    },
  };
}
