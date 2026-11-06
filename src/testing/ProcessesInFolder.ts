/**
 * Finds the processes a test run left in a folder it owns: those whose working directory lies inside it, or whose command line names a
 * path inside it. A spec's child runs in a scratch folder, so this finds a leaked one even after its parent is gone. Test-only.
 */
import { existsSync, readlinkSync } from 'node:fs';
import { join, sep }                from 'node:path';

import { canonicalPathOf, pathLiesInside } from './TrackerIsolation.ts';

export interface FolderProcess {
  readonly processId: number;
  readonly command:   string;
}

const PROCESS_TABLE_FOLDER = '/proc';
const SIGTERM_GRACE_POLLS  = 20;
const SIGKILL_SETTLE_POLLS = 200;
const POLL_INTERVAL_MILLISECONDS = 50;

function processTable(): FolderProcess[] {
  const processLister = Bun.which('ps') ?? (existsSync('/bin/ps') ? '/bin/ps' : null);
  if (processLister === null) return [];
  const listed = Bun.spawnSync([processLister, '-axo', 'pid=,command='], { stdout: 'pipe', stderr: 'ignore' });
  return listed.stdout.toString().split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    return match === null ? [] : [{ processId: Number(match[1]), command: match[2] ?? '' }];
  });
}

/** From `/proc` where it exists (Linux), otherwise from `lsof` (macOS); a process whose directory cannot be read is left out. */
function workingDirectoriesOf(processIds: readonly number[]): Map<number, string> {
  const workingDirectories = new Map<number, string>();
  if (existsSync(join(PROCESS_TABLE_FOLDER, 'self'))) {
    for (const processId of processIds) {
      try {
        workingDirectories.set(processId, readlinkSync(join(PROCESS_TABLE_FOLDER, String(processId), 'cwd')));
      } catch {
        // The process ended, or belongs to another user.
      }
    }
    return workingDirectories;
  }
  const openFileLister = Bun.which('lsof') ?? (existsSync('/usr/sbin/lsof') ? '/usr/sbin/lsof' : null);
  if (openFileLister === null || processIds.length === 0) return workingDirectories;
  const listed = Bun.spawnSync([openFileLister, '-a', '-d', 'cwd', '-Fpn', '-p', processIds.join(',')], { stdout: 'pipe', stderr: 'ignore' });
  let currentProcessId: number | null = null;
  for (const line of listed.stdout.toString().split('\n')) {
    if (line.startsWith('p')) currentProcessId = Number(line.slice(1));
    else if (line.startsWith('n') && currentProcessId !== null) workingDirectories.set(currentProcessId, line.slice(1));
  }
  return workingDirectories;
}

function pathIsOrLiesInside(candidatePath: string, folders: readonly string[]): boolean {
  return folders.some((folder) => candidatePath === folder || pathLiesInside(candidatePath, folder));
}

/** Every process but this one that works inside `folder` or names a path inside it; the folder may already be gone. */
export function processesReachingInto(folder: string): FolderProcess[] {
  const folderSpellings = [...new Set([folder, canonicalPathOf(folder)])];
  const otherProcesses  = processTable().filter((listed) => listed.processId !== process.pid);
  const workingDirectories = workingDirectoriesOf(otherProcesses.map((listed) => listed.processId));
  return otherProcesses.filter((listed) => {
    const workingDirectory = workingDirectories.get(listed.processId);
    const worksInside = workingDirectory !== undefined && pathIsOrLiesInside(workingDirectory, folderSpellings);
    return worksInside || folderSpellings.some((spelling) => listed.command.includes(`${spelling}${sep}`) || listed.command.endsWith(spelling));
  });
}

export function processIsRunning(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

function sendSignal(processId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(processId, signal);
  } catch {
    // It ended already.
  }
}

async function noneRunsWithin(processes: readonly FolderProcess[], polls: number): Promise<boolean> {
  for (let poll = 0; poll < polls; poll += 1) {
    if (!processes.some((leftover) => processIsRunning(leftover.processId))) return true;
    await Bun.sleep(POLL_INTERVAL_MILLISECONDS);
  }
  return !processes.some((leftover) => processIsRunning(leftover.processId));
}

/**
 * SIGTERM, then SIGKILL for whatever still runs after the grace polls; it returns once none answers signal 0, or after the kill polls.
 * A killed process answers signal 0 until the kernel has torn it down, which a loaded machine takes long for.
 */
export async function stopProcesses(processes: readonly FolderProcess[]): Promise<void> {
  for (const leftover of processes) sendSignal(leftover.processId, 'SIGTERM');
  if (await noneRunsWithin(processes, SIGTERM_GRACE_POLLS)) return;
  for (const leftover of processes) sendSignal(leftover.processId, 'SIGKILL');
  await noneRunsWithin(processes, SIGKILL_SETTLE_POLLS);
}

/** Stops every process `processesReachingInto` finds for `folder`, for a teardown a deadline may have cut short. */
export async function stopProcessesReachingInto(folder: string): Promise<FolderProcess[]> {
  const leftovers = processesReachingInto(folder);
  await stopProcesses(leftovers);
  return leftovers;
}

export function describedProcess(leftover: FolderProcess): string {
  return `process ${leftover.processId} (${leftover.command})`;
}
