/**
 * The clean quit over the children: launches refused, every line stopped at once, every agent asked to quit at the end of its turn and
 * stopped once the wait is over, then every end recorded before Talos records `quit`. A supervision lease that ends runs the agent half
 * alone. The wait runs on a monotonic timer, so a wall clock moved by a sleep neither cuts it short nor stretches it.
 */
import type { AgentQuitReason, QuittingChildren } from './ChildSupervisor.ts';

export interface MonotonicTimer {
  readonly elapsed: (milliseconds: number) => Promise<void>;
}

/** Talos's own timer: re-armed until `performance.now()` passed the deadline, since a timer can fire early. */
export const PERFORMANCE_TIMER: MonotonicTimer = Object.freeze({
  elapsed: (milliseconds: number) => new Promise<void>((resolve) => {
    const deadline = performance.now() + milliseconds;
    const fireAtTheDeadline = (): void => {
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) resolve();
      else setTimeout(fireAtTheDeadline, remainingMilliseconds);
    };
    fireAtTheDeadline();
  }),
});

export interface AgentTurnEndRequest {
  readonly children:         Pick<QuittingChildren, 'quitLiveAgentsAtTurnEnd'>;
  readonly reason:           AgentQuitReason;
  readonly waitMilliseconds: number;
  readonly timer:            MonotonicTimer;
}

/** The agent half: lines, and agents launched while it waits, are left alone. Settles once each asked agent's end is recorded. */
export async function endAgentsAtTurnEnd(request: AgentTurnEndRequest): Promise<void> {
  const agentsAskedToQuit = request.children.quitLiveAgentsAtTurnEnd(request.reason);
  const endedWithinTheWait = await Promise.race([
    agentsAskedToQuit.endsRecorded().then(() => true),
    request.timer.elapsed(request.waitMilliseconds).then(() => false),
  ]);
  if (!endedWithinTheWait) agentsAskedToQuit.stopLive();
  await agentsAskedToQuit.endsRecorded();
}

export interface CleanQuitRequest {
  readonly children:         QuittingChildren;
  readonly waitMilliseconds: number;
  readonly timer:            MonotonicTimer;
  /** Records Talos `quitting`; frames are refused from here on. */
  readonly markQuitting:     () => Promise<unknown>;
  /** Records Talos `quit`, closes its server and ends it. */
  readonly finishQuit:       () => Promise<unknown>;
}

export async function runCleanQuit(request: CleanQuitRequest): Promise<void> {
  const { children } = request;
  await request.markQuitting();
  await children.refuseLaunches();
  children.pauseLiveLines();
  await endAgentsAtTurnEnd({
    children, reason: 'paused', waitMilliseconds: request.waitMilliseconds, timer: request.timer
  });
  await children.everyEndRecorded();
  await request.finishQuit();
}
