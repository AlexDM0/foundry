/**
 * The clock every ticking part of the board reads: the Agents view, the header's activity strip, any live elapsed time and the marks that
 * show for a moment. What it gives is only shown, never compared to decide anything; a DOM spec passes a fake so time moves on its word.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react';

const MILLISECONDS_PER_SECOND = 1_000;

export interface BoardClock {
  readonly now:         () => Date;
  /** Calls `tick` every second until the returned function is called. */
  readonly everySecond: (tick: () => void) => () => void;
  /** Calls `callback` once after `milliseconds`, unless the returned function is called first. */
  readonly after:       (milliseconds: number, callback: () => void) => () => void;
}

export const BROWSER_BOARD_CLOCK: BoardClock = {
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

/** The clock the board hands every view; a view ticks through `useBoardClock().everySecond`, never its own timer. */
export const BoardClockContext = createContext<BoardClock>(BROWSER_BOARD_CLOCK);

export function useBoardClock(): BoardClock {
  return useContext(BoardClockContext);
}

/** The clock's moment, moved on each second only while `ticks` holds, such as while the stream is live and something shows a time. */
export function useTickingNow(clock: BoardClock, ticks: boolean): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => (ticks ? clock.everySecond(() => setNow(clock.now())) : undefined), [clock, ticks]);
  return now;
}
