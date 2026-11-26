/**
 * Settling a lost child's cause against real process groups. What matters is that the recorded child group is killed whenever it is still
 * the recorded one, including once its leader has exited while members live on (its Talos is then the one lost), and that a group whose
 * recorded leader id now belongs to an unrelated process, alive or as the members of a reused group, is never signalled.
 */
import { join } from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { processIsGone, type ProcessIdentity }            from '../../lib/process-identity/ProcessIdentity.ts';
import { nativePlatformPorts }                            from '../../testing/NativePlatformPorts.ts';
import { PlantedChild }                                   from '../../testing/PlantedChild.ts';
import { parentOfDetachedChild }                          from '../../testing/ProcessDoubles.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { OUTLIVES_EVERY_WAIT_SECONDS, waitUntil }         from '../../testing/WaitUntil.ts';
import { Regrouping }                                     from './Regrouping.ts';
import { createUnreadableBoardFiles }                     from './UnreadableBoardFiles.ts';

const ports = nativePlatformPorts();
const { identityOf } = ports.processSupervision;

const CHILD_INSTANCE = 1;

const scratchDirectories: string[] = [];
const lingeringProcessIds: number[] = [];

afterEach(() => {
  for (const processId of lingeringProcessIds.splice(0)) {
    if (!processIsGone(processId)) process.kill(processId, 'SIGKILL');
  }
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function identityOrThrow(processId: number): ProcessIdentity {
  const identity = identityOf(processId);
  if (identity === null) throw new Error(`process ${processId} has no readable identity`);
  return identity;
}

/** A detached shell leading its own group, whose `sleep` child would outlive it; both pids are cleaned up after the case. */
async function spawnGroupWithLingeringChild(): Promise<{ leader: Bun.Subprocess<'ignore', 'pipe', 'ignore'>; childProcessId: number }> {
  const leader = Bun.spawn(['/bin/sh', '-c', `sleep ${OUTLIVES_EVERY_WAIT_SECONDS} & echo $!; wait`], {
    detached: true, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore'
  });
  const { value } = await leader.stdout.getReader().read();
  const childProcessId = Number(new TextDecoder().decode(value).trim());
  lingeringProcessIds.push(leader.pid, childProcessId);
  return { leader, childProcessId };
}

const LATER_THAN_ANY_START_STAMP = '99999999999999';

interface LostChild {
  boardFolder: string;
  jobFolder:   string;
}

/** A lost child's job folder whose record names the given child, its Talos unrecorded so the boot is read from the child. */
function lostChildRecording(childProcess: ProcessIdentity): LostChild {
  const boardFolder = createScratchDirectory('regrouping');
  scratchDirectories.push(boardFolder);
  PlantedChild.plantChildRecord({ boardFolder, childFolder: 'jobs/J1', instance: CHILD_INSTANCE }, { talos: null, childProcess, childProcessGroupId: childProcess.processId });
  return { boardFolder, jobFolder: join(boardFolder, 'jobs', 'J1') };
}

function settled(lost: LostChild): ReturnType<typeof Regrouping.settleLostChildIn> {
  return Regrouping.settleLostChildIn(lost.boardFolder, ports, createUnreadableBoardFiles(() => undefined), lost.jobFolder, CHILD_INSTANCE);
}

describe('settling a lost child', () => {
  test('a recorded child whose leader exited while a member of its group lives: the group is signalled and its Talos judged lost', async () => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    const lost = lostChildRecording(identityOrThrow(leader.pid));
    process.kill(leader.pid, 'SIGKILL');
    await leader.exited;
    expect(processIsGone(childProcessId)).toBe(false);
    expect(settled(lost)).toBe('talos-lost');
    await waitUntil(() => processIsGone(childProcessId), 'the lingering child going');
  });

  test('a lost Talos\'s still-live child: a command leading a group of its own below it goes too, so no resume runs beside it', async () => {
    const parent = await parentOfDetachedChild();
    lingeringProcessIds.push(parent.processId, parent.reportedProcessId);
    const lost = lostChildRecording(identityOrThrow(parent.processId));
    expect(settled(lost)).toBe('talos-lost');
    await waitUntil(() => processIsGone(parent.reportedProcessId), 'the command going');
  });

  test('a recorded leader id now held by an unrelated live process: nothing is signalled and the agent reads as crashed', async () => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    const current = identityOrThrow(leader.pid);
    const lost = lostChildRecording({ ...current, startStamp: '1' });
    expect(settled(lost)).toBe('agent-crashed');
    expect(processIsGone(leader.pid)).toBe(false);
    expect(processIsGone(childProcessId)).toBe(false);
  });

  test('a recorded leader id reused by a group whose members predate the recorded leader: nothing is signalled', async () => {
    const { leader, childProcessId } = await spawnGroupWithLingeringChild();
    const current = identityOrThrow(leader.pid);
    const lost = lostChildRecording({ ...current, startStamp: LATER_THAN_ANY_START_STAMP });
    process.kill(leader.pid, 'SIGKILL');
    await leader.exited;
    expect(settled(lost)).toBe('agent-crashed');
    expect(processIsGone(childProcessId)).toBe(false);
  });
});
