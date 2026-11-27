/**
 * The machine-wide agent slots and the limit they keep, over scratch monitor folders and an injected liveness. What matters: two boards
 * together never hold more slots than the limit; a slot whose Hephaestus is gone is taken over and logged by the next claim of any
 * Hephaestus, and by the restarted Hephaestus whose job still runs; a slot older code wrote, with no version, is judged by its Hephaestus
 * the same way; one that cannot be read is taken over and logged, or, when its bytes cannot be read at all, left in place and logged once;
 * a lowered limit stops nothing but takes no new claim until the holdings drain; a reservation becomes the launched job's slot and an
 * unused one is freed; and the stored limit survives as a file, refused above the CPU ceiling with nothing written.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { AGENT_SLOT_FORMAT_VERSION }                      from '../../adapters/agent-slot/AgentSlotIngestion.ts';
import { MachineLimitsFile }                              from '../../adapters/machine-limits/MachineLimitsFile.ts';
import type { ProcessIdentity }                           from '../../lib/process-identity/ProcessIdentity.ts';
import { OperationRefusal }                               from '../../shared/OperationRefusal.ts';
import { detailsLoggerOf }                                from '../../testing/LoggedDetails.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { AGENT_SLOTS_FOLDER, AgentSlots }                 from './AgentSlots.ts';
import { MachineAgentLimit }                              from './MachineAgentLimit.ts';

const FIRST_HEPHAESTUS: ProcessIdentity = { processId: 7001, startStamp: '1700000001', bootIdentity: 'boot-example' };
const SECOND_HEPHAESTUS: ProcessIdentity = { processId: 7002, startStamp: '1700000002', bootIdentity: 'boot-example' };
const THIRD_HEPHAESTUS: ProcessIdentity = { processId: 7003, startStamp: '1700000003', bootIdentity: 'boot-example' };

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function monitorFolder(): string {
  const folder = createScratchDirectory('agent-slots');
  scratchDirectories.push(folder);
  return folder;
}

function slotsOf(
  folder: string, limit: number, ownProcess: ProcessIdentity, liveProcessIds: Set<number>, loggedLines: string[] = [],
): ReturnType<typeof AgentSlots.createAgentSlots> {
  return AgentSlots.createAgentSlots({
    monitorFolder:    folder,
    limit,
    ownProcess,
    hephaestusIsLive: (hephaestus) => hephaestus !== null && liveProcessIds.has(hephaestus.processId),
    log:              detailsLoggerOf(loggedLines),
  });
}

describe('agent slots', () => {
  test('two boards with ready tickets hold no more slots than the limit between them', () => {
    const folder = monitorFolder();
    const live = new Set([FIRST_HEPHAESTUS.processId, SECOND_HEPHAESTUS.processId]);
    const first = slotsOf(folder, 2, FIRST_HEPHAESTUS, live);
    const second = slotsOf(folder, 2, SECOND_HEPHAESTUS, live);
    expect(first.reserve('tracker-a', 2)).toBe(2);
    expect(second.reserve('tracker-b', 2)).toBe(0);
    expect(first.liveHoldings()).toHaveLength(2);
  });

  test('a slot whose Hephaestus is gone is taken over by the next claim of another Hephaestus', () => {
    const folder = monitorFolder();
    const live = new Set([FIRST_HEPHAESTUS.processId, SECOND_HEPHAESTUS.processId]);
    expect(slotsOf(folder, 1, FIRST_HEPHAESTUS, live).tryAcquire('tracker-a', 'J1')).toBe(true);
    live.delete(FIRST_HEPHAESTUS.processId);
    const second = slotsOf(folder, 1, SECOND_HEPHAESTUS, live);
    expect(second.tryAcquire('tracker-b', 'J7')).toBe(true);
    expect(second.liveHoldings()).toEqual([{ trackerId: 'tracker-b', jobId: 'J7', hephaestus: SECOND_HEPHAESTUS }]);
  });

  test('a job that runs on past its Hephaestus\'s restart has its slot taken over by the new Hephaestus, so other Hephaestus processes count it again', () => {
    const folder = monitorFolder();
    const live = new Set([FIRST_HEPHAESTUS.processId]);
    expect(slotsOf(folder, 1, FIRST_HEPHAESTUS, live).tryAcquire('tracker-a', 'J1')).toBe(true);
    live.delete(FIRST_HEPHAESTUS.processId);
    live.add(SECOND_HEPHAESTUS.processId);
    const restarted = slotsOf(folder, 1, SECOND_HEPHAESTUS, live);
    expect(restarted.tryAcquire('tracker-a', 'J1')).toBe(true);
    expect(restarted.liveHoldings()).toEqual([{ trackerId: 'tracker-a', jobId: 'J1', hephaestus: SECOND_HEPHAESTUS }]);
    live.add(THIRD_HEPHAESTUS.processId);
    expect(slotsOf(folder, 1, THIRD_HEPHAESTUS, live).tryAcquire('tracker-b', 'J7')).toBe(false);
  });

  test('a limit lowered under the live holdings frees none of them and takes no new claim', () => {
    const folder = monitorFolder();
    const live = new Set([FIRST_HEPHAESTUS.processId]);
    const before = slotsOf(folder, 3, FIRST_HEPHAESTUS, live);
    for (const jobId of ['J1', 'J2', 'J3']) expect(before.tryAcquire('tracker-a', jobId)).toBe(true);
    const after = slotsOf(folder, 1, FIRST_HEPHAESTUS, live);
    expect(after.tryAcquire('tracker-a', 'J4')).toBe(false);
    expect(after.tryAcquire('tracker-a', 'J3')).toBe(true);
    expect(after.liveHoldings()).toHaveLength(3);
  });

  test('a reservation becomes the launched job\'s slot, and keeping the board\'s jobs frees the unused one', () => {
    const folder = monitorFolder();
    const slots = slotsOf(folder, 4, FIRST_HEPHAESTUS, new Set([FIRST_HEPHAESTUS.processId]));
    expect(slots.reserve('tracker-a', 2)).toBe(2);
    slots.assignReservations('tracker-a', ['J9']);
    slots.keepOnly('tracker-a', ['J9']);
    expect(slots.liveHoldings().map((holding) => holding.jobId)).toEqual(['J9']);
  });

  test('a slot file is versioned, and an unreadable one is taken over and logged', () => {
    const folder = monitorFolder();
    const live = new Set([FIRST_HEPHAESTUS.processId]);
    const loggedLines: string[] = [];
    const slots = slotsOf(folder, 1, FIRST_HEPHAESTUS, live, loggedLines);
    expect(slots.tryAcquire('tracker-a', 'J1')).toBe(true);
    const slotPath = join(folder, AGENT_SLOTS_FOLDER, 'slot-1');
    expect(JSON.parse(readFileSync(slotPath, 'utf8'))).toMatchObject({ version: 2, trackerId: 'tracker-a', jobId: 'J1' });
    expect(loggedLines).toEqual([]);
    writeFileSync(slotPath, 'not json');
    expect(slots.tryAcquire('tracker-b', 'J2')).toBe(true);
    expect(readdirSync(join(folder, AGENT_SLOTS_FOLDER))).toEqual(['slot-1']);
    expect(loggedLines).toEqual([expect.stringContaining(`The agent slot ${slotPath} was stale and is taken over: it could not be read (`) as unknown as string]);
  });

  test('a slot whose bytes cannot be read is left in place, and logged once across passes', () => {
    const folder = monitorFolder();
    const live = new Set([FIRST_HEPHAESTUS.processId]);
    const loggedLines: string[] = [];
    const unreadableSlotPathsLogged = new Set<string>();
    const slotPath = join(folder, AGENT_SLOTS_FOLDER, 'slot-1');
    mkdirSync(slotPath, { recursive: true });
    const slotsOfAPass = (): ReturnType<typeof AgentSlots.createAgentSlots> => AgentSlots.createAgentSlots({
      monitorFolder:    folder,
      limit:            1,
      ownProcess:       FIRST_HEPHAESTUS,
      hephaestusIsLive: (hephaestus) => hephaestus !== null && live.has(hephaestus.processId),
      log:              detailsLoggerOf(loggedLines),
      unreadableSlotPathsLogged,
    });
    expect(slotsOfAPass().tryAcquire('tracker-a', 'J1')).toBe(false);
    expect(slotsOfAPass().tryAcquire('tracker-a', 'J1')).toBe(false);
    expect(loggedLines).toEqual([expect.stringContaining(`The agent slot ${slotPath} could not be read`) as unknown as string]);
    expect(loggedLines[0]).toEndWith('it is left in place.');
  });

  test('a slot whose Hephaestus is gone is taken over and logged', () => {
    const folder = monitorFolder();
    const live = new Set([FIRST_HEPHAESTUS.processId]);
    const loggedLines: string[] = [];
    expect(slotsOf(folder, 1, FIRST_HEPHAESTUS, live).tryAcquire('tracker-a', 'J1')).toBe(true);
    expect(slotsOf(folder, 1, SECOND_HEPHAESTUS, new Set([SECOND_HEPHAESTUS.processId]), loggedLines).tryAcquire('tracker-b', 'J2')).toBe(true);
    const slotPath = join(folder, AGENT_SLOTS_FOLDER, 'slot-1');
    expect(loggedLines).toEqual([`The agent slot ${slotPath} was stale and is taken over: the Hephaestus ${FIRST_HEPHAESTUS.processId} it names is gone.`]);
  });

  test('a slot without a version, as older code wrote, is held while its Hephaestus lives, and taken over, logged and rewritten once it is gone', () => {
    const folder = monitorFolder();
    const slotPath = join(folder, AGENT_SLOTS_FOLDER, 'slot-1');
    mkdirSync(join(folder, AGENT_SLOTS_FOLDER), { recursive: true });
    writeFileSync(slotPath, JSON.stringify({ trackerId: 'tracker-a', jobId: 'J1', hephaestus: FIRST_HEPHAESTUS }));
    const loggedLines: string[] = [];
    const live = new Set([FIRST_HEPHAESTUS.processId, SECOND_HEPHAESTUS.processId]);

    const second = slotsOf(folder, 1, SECOND_HEPHAESTUS, live, loggedLines);
    expect(second.liveHoldings()).toEqual([{ trackerId: 'tracker-a', jobId: 'J1', hephaestus: FIRST_HEPHAESTUS }]);
    expect(second.tryAcquire('tracker-b', 'J2')).toBe(false);
    expect(loggedLines).toEqual([]);

    live.delete(FIRST_HEPHAESTUS.processId);
    expect(second.tryAcquire('tracker-b', 'J2')).toBe(true);
    expect(loggedLines).toEqual([`The agent slot ${slotPath} was stale and is taken over: the Hephaestus ${FIRST_HEPHAESTUS.processId} it names is gone.`]);
    expect(JSON.parse(readFileSync(slotPath, 'utf8'))).toEqual({
      version: AGENT_SLOT_FORMAT_VERSION, trackerId: 'tracker-b', jobId: 'J2', hephaestus: SECOND_HEPHAESTUS
    });
  });
});

describe('the machine agent limit', () => {
  test('reads as the ceiling with no file, and a stored value above the ceiling reads as the ceiling', () => {
    const folder = monitorFolder();
    expect(MachineAgentLimit.readingIn(folder, 8)).toEqual({ limit: 8, ceiling: 8, storedLimit: null });
    MachineLimitsFile.write(folder, { agentLimit: 12 });
    expect(MachineAgentLimit.readingIn(folder, 8)).toEqual({ limit: 8, ceiling: 8, storedLimit: 12 });
  });

  test('is stored as version 1, survives as a file, and a second set of the same value is nothing to do', () => {
    const folder = monitorFolder();
    expect(MachineAgentLimit.setIn(folder, 2, 8)).toBe('done');
    expect(JSON.parse(readFileSync(MachineLimitsFile.pathIn(folder), 'utf8'))).toEqual({ version: 1, agentLimit: 2 });
    expect(MachineAgentLimit.readingIn(folder, 8).limit).toBe(2);
    expect(MachineAgentLimit.setIn(folder, 2, 8)).toBe('nothing-to-do');
  });

  test('refuses a limit above the CPU ceiling and writes nothing', () => {
    const folder = monitorFolder();
    expect(() => MachineAgentLimit.setIn(folder, 9, 8)).toThrow(OperationRefusal);
    expect(existsSync(MachineLimitsFile.pathIn(folder))).toBe(false);
  });

  test('never writes over a file of a newer version, which reads as the ceiling', () => {
    const folder = monitorFolder();
    writeFileSync(MachineLimitsFile.pathIn(folder), JSON.stringify({ version: 2, agentLimit: 1 }));
    expect(MachineAgentLimit.readingIn(folder, 8).limit).toBe(8);
    expect(() => MachineAgentLimit.setIn(folder, 3, 8)).toThrow(OperationRefusal);
  });
});
