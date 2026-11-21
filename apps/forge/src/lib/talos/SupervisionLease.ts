/**
 * The supervision lease: when Talos stops its agents because no Hephaestus renewed it, and the wake rule that grants a grace after a gap in
 * Talos's own ticks. It runs on the wall clock on purpose, so a sleep counts against the lease; the caller hands in every instant.
 */
import { WAKE_GRACE_DOUBLING_BELOW_MILLISECONDS } from './constants/TalosProtocol.ts';

export type LeaseStanding = 'unheld' | 'held' | 'waiting-after-gap' | 'ended';

export interface LeaseBounds {
  leaseMilliseconds:           number;
  renewalIntervalMilliseconds: number;
  tickMilliseconds:            number;
  tickGapMilliseconds:         number;
}

export interface SupervisionLease {
  readonly standing: () => LeaseStanding;
  readonly renewed:  (wallNowMilliseconds: number) => void;
  /** Answers `'lease-ended'` once, at the tick that ends the lease. */
  readonly ticked:   (wallNowMilliseconds: number) => 'lease-ended' | null;
}

export function createSupervisionLease(bounds: LeaseBounds, wallNowMilliseconds: number): SupervisionLease {
  let standing: LeaseStanding = 'unheld';
  let lastRenewalWallMilliseconds = wallNowMilliseconds;
  let lastTickWallMilliseconds = wallNowMilliseconds;
  let graceEndsAtWallMilliseconds = wallNowMilliseconds;
  const graceMilliseconds = wakeGraceMillisecondsOf(bounds.renewalIntervalMilliseconds);

  function tickFollowsGap(wallNow: number): boolean {
    return wallNow < lastTickWallMilliseconds || wallNow - lastTickWallMilliseconds > bounds.tickMilliseconds + bounds.tickGapMilliseconds;
  }

  function ticked(wallNow: number): 'lease-ended' | null {
    const gapPassed = tickFollowsGap(wallNow);
    lastTickWallMilliseconds = wallNow;
    if (standing === 'held' || standing === 'waiting-after-gap') {
      if (gapPassed) {
        standing = 'waiting-after-gap';
        graceEndsAtWallMilliseconds = wallNow + graceMilliseconds;
        return null;
      }
      const leaseRanOut = standing === 'held'
        ? wallNow - lastRenewalWallMilliseconds >= bounds.leaseMilliseconds
        : wallNow >= graceEndsAtWallMilliseconds;
      if (!leaseRanOut) return null;
      standing = 'ended';
      return 'lease-ended';
    }
    return null;
  }

  return {
    standing: () => standing,
    renewed:  (wallNow) => {
      standing = 'held';
      lastRenewalWallMilliseconds = wallNow;
    },
    ticked,
  };
}

function wakeGraceMillisecondsOf(renewalIntervalMilliseconds: number): number {
  return renewalIntervalMilliseconds < WAKE_GRACE_DOUBLING_BELOW_MILLISECONDS ? 2 * renewalIntervalMilliseconds : renewalIntervalMilliseconds;
}

/** The time past one tick between two ticks, which a line's time bound adds to its allowance; `0` for a tick on time or a clock moved back. */
export function gapLengthOf(previousWallMilliseconds: number, wallNowMilliseconds: number, tickMilliseconds: number): number {
  return Math.max(0, wallNowMilliseconds - previousWallMilliseconds - tickMilliseconds);
}
