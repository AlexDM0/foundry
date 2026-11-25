/**
 * The count of other forges that follow this machine's program of an agent vendor. What matters: only a forge whose last read board follows
 * the machine's program of that vendor counts, never the forge asking, one that pins its own program, chose no agent or follows another
 * vendor; a count never waits on another forge: a forge not read yet is read in the background, once, and counted from the next count; a
 * newer board read replaces what an earlier one noted; and a forge whose board cannot be read, such as a stopped one, is not asked again
 * until the hold has passed on the injected clock. While any other forge's choice is not read the count is unknown, never 0, so changing the
 * machine's program still asks first. The agents are the recorded board's.
 */
import { describe, expect, test } from 'bun:test';

import { recordedBoardModel }    from '../../adapters/page-api/testing/BoardModelLeaves.ts';
import type { BoardAgent }       from '../../shared/@types/board/BoardAgent.ts';
import {
  createMachineProgramFollowers,
  FAILED_READ_HOLD_MILLISECONDS,
  machineFollowingOf,
  type AgentReading,
  type MachineProgramFollowers
} from './MachineProgramFollowers.ts';

const ASKING_FORGE = 'example-storefront-7c41';
const FOLLOWING_FORGE = 'example-project-1d2e';
const PINNING_FORGE = 'example-agency-5b90';
const UNCHOSEN_FORGE = 'example-docs-0a3f';
const OTHER_VENDOR = 'example-other-vendor';

interface RecordedAgents {
  readonly vendor:    string;
  readonly pinned:    BoardAgent;
  readonly following: BoardAgent;
  readonly unchosen:  BoardAgent;
}

/** The recorded boards' agents: pinned once chosen, none chosen as before a setup starts, and the pinned one following the machine instead. */
async function recordedAgents(): Promise<RecordedAgents> {
  const pinned = (await recordedBoardModel('board-at-work')).agent;
  const unchosen = { ...(await recordedBoardModel('setup-choosing-billing')).agent, choice: null };
  if (pinned.choice === null) throw new Error('The recorded board at work holds no chosen agent.');
  const { vendor } = pinned.choice;
  return {
    vendor, pinned, following: { ...pinned, choice: { vendor, program: { follows: 'machine' } } }, unchosen
  };
}

/** A reading that answers each forge's agent from `agentsByTrackerId`, `null` for one it does not hold, and counts the reads of each. */
function countedReadingOf(agentsByTrackerId: ReadonlyMap<string, BoardAgent>): { readonly reading: AgentReading; readonly readsOf: (trackerId: string) => number } {
  const reads = new Map<string, number>();
  return {
    reading: async (trackerId) => {
      reads.set(trackerId, (reads.get(trackerId) ?? 0) + 1);
      return agentsByTrackerId.get(trackerId) ?? null;
    },
    readsOf: (trackerId) => reads.get(trackerId) ?? 0,
  };
}

/** Followers over `reading` on a monotonic clock the spec moves by hand. */
function followersOn(reading: AgentReading): { readonly followers: MachineProgramFollowers; readonly advanceClock: (milliseconds: number) => void } {
  let monotonicMilliseconds = 0;
  return {
    followers:    createMachineProgramFollowers({ readAgentOf: reading, monotonicNow: () => monotonicMilliseconds }),
    advanceClock: (milliseconds) => {
      monotonicMilliseconds += milliseconds;
    },
  };
}

describe('machineFollowingOf', () => {
  test('names the vendor of an agent that follows the machine, and none for one pinned or not chosen', async () => {
    const {
      vendor, pinned, following, unchosen
    } = await recordedAgents();
    expect(machineFollowingOf(following)).toBe(vendor);
    expect(machineFollowingOf(pinned)).toBeNull();
    expect(machineFollowingOf(unchosen)).toBeNull();
  });
});

describe('otherFollowersOf', () => {
  test('counts only the other forges whose last read board follows the machine\'s program of the vendor, reading none', async () => {
    const {
      vendor, pinned, following, unchosen
    } = await recordedAgents();
    const { reading, readsOf } = countedReadingOf(new Map());
    const { followers } = followersOn(reading);
    followers.noteBoardRead(ASKING_FORGE, following);
    followers.noteBoardRead(FOLLOWING_FORGE, following);
    followers.noteBoardRead(PINNING_FORGE, pinned);
    followers.noteBoardRead(UNCHOSEN_FORGE, unchosen);
    const readableForges = [ASKING_FORGE, FOLLOWING_FORGE, PINNING_FORGE, UNCHOSEN_FORGE];
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBe(1);
    expect(followers.otherFollowersOf(ASKING_FORGE, OTHER_VENDOR, readableForges)).toBe(0);
    expect(readableForges.map(readsOf)).toEqual([0, 0, 0, 0]);
  });

  test('counts no forge that is not among the readable ones, whatever it last followed', async () => {
    const { vendor, following } = await recordedAgents();
    const { followers } = followersOn(countedReadingOf(new Map()).reading);
    followers.noteBoardRead(FOLLOWING_FORGE, following);
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, [ASKING_FORGE])).toBe(0);
  });

  test('never waits on a forge not read yet: it is unknown until its read in the background is in, which a second count shares', async () => {
    const { vendor, following } = await recordedAgents();
    let answerRead: (agent: BoardAgent | null) => void = () => undefined;
    let readCount = 0;
    const { followers } = followersOn(() => {
      readCount += 1;
      return new Promise((resolve) => {
        answerRead = resolve;
      });
    });
    const readableForges = [ASKING_FORGE, FOLLOWING_FORGE];
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBeNull();
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBeNull();
    answerRead(following);
    await followers.readsSettled();
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBe(1);
    expect(readCount).toBe(1);
  });

  test('counts a forge read before from what its last read noted, once every other forge is read', async () => {
    const { vendor, pinned, following } = await recordedAgents();
    const { followers } = followersOn(countedReadingOf(new Map([[PINNING_FORGE, pinned]])).reading);
    followers.noteBoardRead(FOLLOWING_FORGE, following);
    const readableForges = [ASKING_FORGE, FOLLOWING_FORGE, PINNING_FORGE];
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBeNull();
    await followers.readsSettled();
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBe(1);
  });

  test('takes a newer board read over what an earlier one noted', async () => {
    const { vendor, pinned, following } = await recordedAgents();
    const { followers } = followersOn(countedReadingOf(new Map()).reading);
    followers.noteBoardRead(FOLLOWING_FORGE, following);
    followers.noteBoardRead(FOLLOWING_FORGE, pinned);
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, [ASKING_FORGE, FOLLOWING_FORGE])).toBe(0);
  });

  test('leaves the count unknown while a forge\'s board cannot be read, and asks it again only once the hold has passed', async () => {
    const { vendor } = await recordedAgents();
    const { reading, readsOf } = countedReadingOf(new Map());
    const { followers, advanceClock } = followersOn(reading);
    const readableForges = [ASKING_FORGE, FOLLOWING_FORGE];
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBeNull();
    await followers.readsSettled();
    advanceClock(FAILED_READ_HOLD_MILLISECONDS - 1);
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBeNull();
    await followers.readsSettled();
    expect(readsOf(FOLLOWING_FORGE)).toBe(1);
    advanceClock(1);
    followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges);
    await followers.readsSettled();
    expect(readsOf(FOLLOWING_FORGE)).toBe(2);
  });

  test('takes a read that throws as one that failed, holding the forge off and the count unknown rather than failing it', async () => {
    const { vendor } = await recordedAgents();
    let readCount = 0;
    const { followers } = followersOn(() => {
      readCount += 1;
      return Promise.reject(new Error('the forge went away'));
    });
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, [ASKING_FORGE, FOLLOWING_FORGE])).toBeNull();
    await followers.readsSettled();
    expect(followers.otherFollowersOf(ASKING_FORGE, vendor, [ASKING_FORGE, FOLLOWING_FORGE])).toBeNull();
    expect(readCount).toBe(1);
  });
});
