/**
 * How a command button shows a wait on the forge: a busy ring beside the button at once, and, once the wait passes a second, a panel over
 * the page that says what the forge does meanwhile. The second is read through the board's clock, so a DOM spec moves it by hand.
 */
import { useEffect, useState } from 'react';

import { useBoardClock } from '../BoardClock.ts';

export const COMMAND_WAIT_PANEL_DELAY_MILLISECONDS = 1_000;

/** What the panel over the page says while the command waits: its title, and what the forge does before it answers. */
export interface CommandWaitExplanation {
  readonly title:       string;
  readonly explanation: string;
}

/** Whether a wait that is under way has lasted `COMMAND_WAIT_PANEL_DELAY_MILLISECONDS`; false again once it ends. */
export function useLongWait(isWaiting: boolean): boolean {
  const clock = useBoardClock();
  const [hasLastedLong, setHasLastedLong] = useState(false);
  useEffect(() => {
    if (!isWaiting) return undefined;
    const cancel = clock.after(COMMAND_WAIT_PANEL_DELAY_MILLISECONDS, () => setHasLastedLong(true));
    return () => {
      cancel();
      setHasLastedLong(false);
    };
  }, [clock, isWaiting]);
  return isWaiting && hasLastedLong;
}
