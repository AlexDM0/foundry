/**
 * The count of other forges that follow this machine's program of an agent vendor. What matters: only a forge whose last read board follows
 * the machine's program of that vendor counts, never the forge asking, one that pins its own program, chose no agent or follows another
 * vendor; a forge not read yet is read once, and a read already on its way is shared; a newer board read replaces what an earlier one
 * noted; and a forge whose board cannot be read is left uncounted and read again at the next count. The agents are the recorded board's.
 */
import { describe, expect, test } from 'bun:test';

import { recordedBoardModel }                                                   from '../../adapters/page-api/testing/BoardModelLeaves.ts';
import type { BoardAgent }                                                      from '../../shared/@types/board/BoardAgent.ts';
import { createMachineProgramFollowers, machineFollowingOf, type AgentReading } from './MachineProgramFollowers.ts';

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

/** The recorded boards' agents: pinned once chosen, none chosen at the setup's agent step, and the pinned one following the machine instead. */
async function recordedAgents(): Promise<RecordedAgents> {
  const pinned = (await recordedBoardModel('board-at-work')).agent;
  const unchosen = (await recordedBoardModel('setup-choosing-agent')).agent;
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
    const followers = createMachineProgramFollowers(reading);
    followers.noteBoardRead(ASKING_FORGE, following);
    followers.noteBoardRead(FOLLOWING_FORGE, following);
    followers.noteBoardRead(PINNING_FORGE, pinned);
    followers.noteBoardRead(UNCHOSEN_FORGE, unchosen);
    const readableForges = [ASKING_FORGE, FOLLOWING_FORGE, PINNING_FORGE, UNCHOSEN_FORGE];
    expect(await followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBe(1);
    expect(await followers.otherFollowersOf(ASKING_FORGE, OTHER_VENDOR, readableForges)).toBe(0);
    expect(readableForges.map(readsOf)).toEqual([0, 0, 0, 0]);
  });

  test('counts no forge that is not among the readable ones, whatever it last followed', async () => {
    const { vendor, following } = await recordedAgents();
    const followers = createMachineProgramFollowers(countedReadingOf(new Map()).reading);
    followers.noteBoardRead(FOLLOWING_FORGE, following);
    expect(await followers.otherFollowersOf(ASKING_FORGE, vendor, [ASKING_FORGE])).toBe(0);
  });

  test('reads a forge not read yet once, sharing a read on its way, and asks it no more once noted', async () => {
    const { vendor, following } = await recordedAgents();
    const { reading, readsOf } = countedReadingOf(new Map([[FOLLOWING_FORGE, following]]));
    const followers = createMachineProgramFollowers(reading);
    const readableForges = [ASKING_FORGE, FOLLOWING_FORGE];
    const counts = await Promise.all([
      followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges),
      followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges),
    ]);
    expect(counts).toEqual([1, 1]);
    expect(await followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBe(1);
    expect(readsOf(FOLLOWING_FORGE)).toBe(1);
  });

  test('takes a newer board read over what an earlier one noted', async () => {
    const { vendor, pinned, following } = await recordedAgents();
    const followers = createMachineProgramFollowers(countedReadingOf(new Map()).reading);
    followers.noteBoardRead(FOLLOWING_FORGE, following);
    followers.noteBoardRead(FOLLOWING_FORGE, pinned);
    expect(await followers.otherFollowersOf(ASKING_FORGE, vendor, [ASKING_FORGE, FOLLOWING_FORGE])).toBe(0);
  });

  test('leaves a forge whose board cannot be read uncounted, and reads it again at the next count', async () => {
    const { vendor } = await recordedAgents();
    const { reading, readsOf } = countedReadingOf(new Map());
    const followers = createMachineProgramFollowers(reading);
    const readableForges = [ASKING_FORGE, FOLLOWING_FORGE];
    expect(await followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBe(0);
    expect(await followers.otherFollowersOf(ASKING_FORGE, vendor, readableForges)).toBe(0);
    expect(readsOf(FOLLOWING_FORGE)).toBe(2);
  });
});
