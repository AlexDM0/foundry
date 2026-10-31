/**
 * Reads a process's identity and its group's members from `/proc`, over injected file reads, so no subprocess runs and nothing depends on a
 * `ps` the system may lack. The start stamp is the decimal text of the clock ticks since boot in `/proc/<pid>/stat`, which a clock step
 * never moves. A process in a dead state reads as gone: without a reaping init a zombie stays in the table for good.
 */
import type { GroupMember, ProcessIdentityReader } from './PosixProcessGroups.ts';
import type { ProcessIdentity }                    from './ProcessIdentity.ts';

export interface LinuxProcessFiles {
  /** `null` when the file cannot be read. */
  readonly fileText:         (path: string) => string | null;
  /** `null` when the folder cannot be read. */
  readonly directoryEntries: (path: string) => readonly string[] | null;
}

export interface LinuxProcessStat {
  readonly state:          string;
  readonly processGroupId: number;
  readonly startTicks:     string;
}

const PROCESS_TABLE_PATH = '/proc';
const BOOT_IDENTITY_PATH = '/proc/sys/kernel/random/boot_id';

const DECIMAL_PATTERN = /^\d+$/;
const STAT_FIELD_SEPARATOR = /\s+/;

// proc(5) numbers the fields from 1: pid, comm, then the fields read here.
const FIRST_FIELD_AFTER_COMM = 3;
const STATE_FIELD            = 3;
const PROCESS_GROUP_FIELD    = 5;
const START_TICKS_FIELD      = 22;

const DEAD_STATES: readonly string[] = ['Z', 'X', 'x'];

function statPathOf(processId: number | string): string {
  return `${PROCESS_TABLE_PATH}/${processId}/stat`;
}

/** The comm may hold spaces and `)`, so the fields are counted after its last `)`; `null` when the text is no stat line. */
export function processStatOf(statText: string): LinuxProcessStat | null {
  const commEnd = statText.lastIndexOf(')');
  if (commEnd < 0) return null;
  const fields         = statText.slice(commEnd + 1).trim().split(STAT_FIELD_SEPARATOR);
  const state          = fields[STATE_FIELD - FIRST_FIELD_AFTER_COMM];
  const processGroupId = fields[PROCESS_GROUP_FIELD - FIRST_FIELD_AFTER_COMM];
  const startTicks     = fields[START_TICKS_FIELD - FIRST_FIELD_AFTER_COMM];
  if (!state || !processGroupId || !startTicks || !DECIMAL_PATTERN.test(processGroupId) || !DECIMAL_PATTERN.test(startTicks)) return null;
  return { state, processGroupId: Number(processGroupId), startTicks };
}

export function statReadsAsGone(stat: LinuxProcessStat): boolean {
  return DEAD_STATES.includes(stat.state);
}

export function createLinuxProcessIdentity(files: LinuxProcessFiles): ProcessIdentityReader {
  function bootIdentity(): string | null {
    return files.fileText(BOOT_IDENTITY_PATH)?.trim() || null;
  }

  function identityOf(processId: number): ProcessIdentity | null {
    if (!Number.isSafeInteger(processId) || processId <= 0) return null;
    const statText = files.fileText(statPathOf(processId));
    const stat     = statText === null ? null : processStatOf(statText);
    const readBoot = bootIdentity();
    if (stat === null || readBoot === null || statReadsAsGone(stat)) return null;
    return { processId, startStamp: stat.startTicks, bootIdentity: readBoot };
  }

  function identitySourcesOf(processId: number): readonly string[] {
    return [statPathOf(processId), BOOT_IDENTITY_PATH];
  }

  // A stat file gone between the listing and its read is a process that exited, never an unreadable group.
  function groupMembersOf(processGroupId: number): readonly GroupMember[] | null {
    const entries = files.directoryEntries(PROCESS_TABLE_PATH);
    if (entries === null) return null;
    const members: GroupMember[] = [];
    for (const entry of entries) {
      if (!DECIMAL_PATTERN.test(entry)) continue;
      const statText = files.fileText(statPathOf(entry));
      if (statText === null) continue;
      const stat = processStatOf(statText);
      if (stat === null) return null;
      if (stat.processGroupId === processGroupId && !statReadsAsGone(stat)) members.push({ processId: Number(entry), startStamp: stat.startTicks });
    }
    return members;
  }

  return Object.freeze({
    identityOf, identitySourcesOf, bootIdentity, groupMembersOf
  });
}
