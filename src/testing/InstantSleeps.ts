/**
 * Runs a case past a production wait without the wall time: inside `instantSleepsOf`, every `Bun.sleep` of exactly the named interval ends
 * at the next turn of the event loop and is counted, and every other sleep keeps its real length. The tries a bound counts stay the same.
 */
import { spyOn } from 'bun:test';

export interface InstantSleepsResult<ActionResult> {
  value:         ActionResult;
  instantSleeps: number;
}

export async function instantSleepsOf<ActionResult>(intervalMilliseconds: number, action: () => Promise<ActionResult>): Promise<InstantSleepsResult<ActionResult>> {
  const realSleep = Bun.sleep;
  let instantSleeps = 0;
  const sleepSpy = spyOn(Bun, 'sleep').mockImplementation((requested: number | Date) => {
    if (requested !== intervalMilliseconds) return realSleep(requested);
    instantSleeps += 1;
    return new Promise((resolve) => {
      setImmediate(resolve);
    });
  });
  try {
    return { value: await action(), instantSleeps };
  } finally {
    sleepSpy.mockRestore();
  }
}
