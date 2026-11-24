/**
 * How many other forges of this machine follow its program of an agent vendor, counted across the forges Gaia reads: each forge's agent
 * choice as its last board read named it, and a forge not read yet read once, so a board read costs no further reads in the steady state.
 */
import type { BoardAgent } from '../../shared/@types/board/BoardAgent.ts';

/** The vendor whose machine program a forge follows, or `null` for a forge that pins its own program or chose no agent. */
export type MachineFollowing = string | null;

export interface MachineProgramFollowers {
  /** Notes what the forge's board just read names. */
  readonly noteBoardRead:    (trackerId: string, agent: BoardAgent) => void;
  /** The other forges among `readableTrackerIds` that follow this machine's program of `vendor`, reading those not read yet. */
  readonly otherFollowersOf: (trackerId: string, vendor: string, readableTrackerIds: readonly string[]) => Promise<number>;
}

/** `null` when the forge's board cannot be read now; it is then left uncounted and asked again at the next count. */
export type AgentReading = (trackerId: string) => Promise<BoardAgent | null>;

export function machineFollowingOf(agent: BoardAgent): MachineFollowing {
  const { choice } = agent;
  return choice !== null && 'follows' in choice.program ? choice.vendor : null;
}

export function createMachineProgramFollowers(readAgentOf: AgentReading): MachineProgramFollowers {
  const followingByTrackerId = new Map<string, MachineFollowing>();
  const readsInFlight = new Map<string, Promise<void>>();

  function noteBoardRead(trackerId: string, agent: BoardAgent): void {
    followingByTrackerId.set(trackerId, machineFollowingOf(agent));
  }

  function firstReadOf(trackerId: string): Promise<void> {
    const inFlight = readsInFlight.get(trackerId);
    if (inFlight !== undefined) return inFlight;
    const read = readAgentOf(trackerId).then((agent) => {
      if (agent !== null && !followingByTrackerId.has(trackerId)) noteBoardRead(trackerId, agent);
    }).finally(() => readsInFlight.delete(trackerId));
    readsInFlight.set(trackerId, read);
    return read;
  }

  async function otherFollowersOf(trackerId: string, vendor: string, readableTrackerIds: readonly string[]): Promise<number> {
    const otherTrackerIds = readableTrackerIds.filter((other) => other !== trackerId);
    await Promise.all(otherTrackerIds.filter((other) => !followingByTrackerId.has(other)).map(firstReadOf));
    return otherTrackerIds.filter((other) => followingByTrackerId.get(other) === vendor).length;
  }

  return { noteBoardRead, otherFollowersOf };
}
