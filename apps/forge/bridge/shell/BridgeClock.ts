/**
 * The clock every ticking part of the Bridge reads: the Agents view, the header's activity strip, any live elapsed time and the marks that
 * show for a moment. What it gives is only shown, never compared to decide anything; a DOM spec passes a fake so time moves on its word.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react';

import { MILLISECONDS_PER_SECOND } from '../utils/ElapsedTimeUtil.ts';

export interface BridgeClock {
  readonly now:         () => Date;
  /** Calls `tick` every second until the returned function is called. */
  readonly everySecond: (tick: () => void) => () => void;
  /** Calls `callback` once after `milliseconds`, unless the returned function is called first. */
  readonly after:       (milliseconds: number, callback: () => void) => () => void;
}

export const BROWSER_BRIDGE_CLOCK: BridgeClock = {
  now:         () => new Date(),
  everySecond: (tick) => {
    const timer = setInterval(tick, MILLISECONDS_PER_SECOND);
    return () => clearInterval(timer);
  },
  after: (milliseconds, callback) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
};

/** The clock the shell hands every view; a view ticks through `useBridgeClock().everySecond`, never its own timer. */
export const BridgeClockContext = createContext<BridgeClock>(BROWSER_BRIDGE_CLOCK);

export function useBridgeClock(): BridgeClock {
  return useContext(BridgeClockContext);
}

/** The clock's moment, moved on each second only while `ticks` holds, such as while the stream is live and something shows a time. */
export function useTickingNow(clock: BridgeClock, ticks: boolean): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => (ticks ? clock.everySecond(() => setNow(clock.now())) : undefined), [clock, ticks]);
  return now;
}
