/**
 * The clock every ticking part of the Bridge reads: the Agents view, the header's activity strip and any live elapsed time. What it gives
 * is only shown, never compared to decide anything; a DOM spec passes a fake so time moves on its word.
 */
export interface BridgeClock {
  readonly now:         () => Date;
  /** Calls `tick` every second until the returned function is called. */
  readonly everySecond: (tick: () => void) => () => void;
}

const MILLISECONDS_PER_SECOND = 1000;

export const BROWSER_BRIDGE_CLOCK: BridgeClock = {
  now:         () => new Date(),
  everySecond: (tick) => {
    const timer = setInterval(tick, MILLISECONDS_PER_SECOND);
    return () => clearInterval(timer);
  },
};
