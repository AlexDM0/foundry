/**
 * How many other forges of this machine follow its program of an agent vendor, from each forge's last read board. A count never waits: an unread
 * forge is read in the background for the next count, a failed one is left alone a while, and while any choice is unread the count is unknown, so a
 * change never skips its question.
 */
import type { BoardAgent } from '../../shared/@types/board/BoardAgent.ts';

/** How long a forge whose board could not be read is left uncounted before it is read again, so a forge that is down is not asked on every board read. */
export const FAILED_READ_HOLD_MILLISECONDS = 30_000;

/** The vendor whose machine program a forge follows, or `null` for a forge that pins its own program or chose no agent. */
export type MachineFollowing = string | null;

export interface MachineProgramFollowers {
  /** Notes what the forge's board just read names. */
  readonly noteBoardRead:    (trackerId: string, agent: BoardAgent) => void;
  /**
   * The other forges among `readableTrackerIds` that follow this machine's program of `vendor`, as noted now, or `null` while one of them is
   * not noted; starts reading those.
   */
  readonly otherFollowersOf: (trackerId: string, vendor: string, readableTrackerIds: readonly string[]) => number | null;
  /** Settles once every read on its way has, for a caller that wants the count after them. */
  readonly readsSettled:     () => Promise<void>;
}

/** `null` when the forge's board cannot be read now; it is then left uncounted and asked again after the hold. */
export type AgentReading = (trackerId: string) => Promise<BoardAgent | null>;

export interface MachineProgramFollowersOptions {
  readonly readAgentOf:  AgentReading;
  /** Milliseconds on a monotonic clock, to hold off a forge whose read failed. */
  readonly monotonicNow: () => number;
}

export function machineFollowingOf(agent: BoardAgent): MachineFollowing {
  const { choice } = agent;
  return choice !== null && 'follows' in choice.program ? choice.vendor : null;
}

export function createMachineProgramFollowers({ readAgentOf, monotonicNow }: MachineProgramFollowersOptions): MachineProgramFollowers {
  const followingByTrackerId = new Map<string, MachineFollowing>();
  const readsInFlight = new Map<string, Promise<void>>();
  const failedReadAtByTrackerId = new Map<string, number>();

  function noteBoardRead(trackerId: string, agent: BoardAgent): void {
    followingByTrackerId.set(trackerId, machineFollowingOf(agent));
    failedReadAtByTrackerId.delete(trackerId);
  }

  function readIsHeld(trackerId: string): boolean {
    const failedAt = failedReadAtByTrackerId.get(trackerId);
    return failedAt !== undefined && monotonicNow() - failedAt < FAILED_READ_HOLD_MILLISECONDS;
  }

  function readInBackground(trackerId: string): void {
    if (readsInFlight.has(trackerId) || readIsHeld(trackerId)) return;
    const read = readAgentOf(trackerId)
      .catch(() => null)
      .then((agent) => {
        if (agent === null) failedReadAtByTrackerId.set(trackerId, monotonicNow());
        else if (!followingByTrackerId.has(trackerId)) noteBoardRead(trackerId, agent);
      })
      .finally(() => readsInFlight.delete(trackerId));
    readsInFlight.set(trackerId, read);
  }

  function otherFollowersOf(trackerId: string, vendor: string, readableTrackerIds: readonly string[]): number | null {
    const otherTrackerIds = readableTrackerIds.filter((other) => other !== trackerId);
    const unnotedTrackerIds = otherTrackerIds.filter((candidate) => !followingByTrackerId.has(candidate));
    for (const other of unnotedTrackerIds) readInBackground(other);
    if (unnotedTrackerIds.length > 0) return null;
    return otherTrackerIds.filter((other) => followingByTrackerId.get(other) === vendor).length;
  }

  async function readsSettled(): Promise<void> {
    await Promise.all(readsInFlight.values());
  }

  return { noteBoardRead, otherFollowersOf, readsSettled };
}
