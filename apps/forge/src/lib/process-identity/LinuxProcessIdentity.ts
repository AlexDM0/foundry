/**
 * Reads a process's identity and its group's members from `/proc`, over injected file reads, so no subprocess runs and nothing needs a `ps`
 * the system may lack. The start stamp is the decimal text of the clock ticks since boot in `/proc/<pid>/stat`, which a clock step
 * never moves. A process in a dead state reads as gone: without a reaping init a zombie stays in the table for good.
 */
import type { GroupMember, ProcessIdentityReader, ProcessTableEntry } from './PosixProcessGroups.ts';
import type { ProcessIdentity }                                       from './ProcessIdentity.ts';

export interface LinuxProcessFiles {
  /** `null` when the file cannot be read. */
  readonly fileText:         (path: string) => string | null;
  /** `null` when the folder cannot be read. */
  readonly directoryEntries: (path: string) => readonly string[] | null;
}

export interface LinuxProcessStat {
  readonly state:           string;
  readonly parentProcessId: number;
  readonly processGroupId:  number;
  readonly startTicks:      string;
}

const PROCESS_TABLE_PATH = '/proc';
const BOOT_IDENTITY_PATH = '/proc/sys/kernel/random/boot_id';
const KERNEL_STATISTICS_PATH = '/proc/stat';

// proc(5): the `btime` line of `/proc/stat` holds the epoch second the system booted.
const BOOT_TIME_LINE_PATTERN = /^btime\s+(\d+)\s*$/m;

const DECIMAL_PATTERN = /^\d+$/;
const STAT_FIELD_SEPARATOR = /\s+/;

// proc(5) numbers the fields from 1: pid, comm, then the fields read here.
const FIRST_FIELD_AFTER_COMM = 3;
const STATE_FIELD            = 3;
const PARENT_PROCESS_FIELD   = 4;
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
  const fields          = statText.slice(commEnd + 1).trim().split(STAT_FIELD_SEPARATOR);
  const state           = fields[STATE_FIELD - FIRST_FIELD_AFTER_COMM];
  const parentProcessId = fields[PARENT_PROCESS_FIELD - FIRST_FIELD_AFTER_COMM];
  const processGroupId  = fields[PROCESS_GROUP_FIELD - FIRST_FIELD_AFTER_COMM];
  const startTicks      = fields[START_TICKS_FIELD - FIRST_FIELD_AFTER_COMM];
  if (!state || !parentProcessId || !processGroupId || !startTicks) return null;
  if (![parentProcessId, processGroupId, startTicks].every((field) => DECIMAL_PATTERN.test(field))) return null;
  return {
    state, parentProcessId: Number(parentProcessId), processGroupId: Number(processGroupId), startTicks
  };
}

export function statReadsAsGone(stat: LinuxProcessStat): boolean {
  return DEAD_STATES.includes(stat.state);
}

/** The `btime` of a `/proc/stat` text; `null` when it holds none. */
export function bootTimeEpochSecondsOfKernelStatistics(kernelStatisticsText: string): number | null {
  const seconds = Number(BOOT_TIME_LINE_PATTERN.exec(kernelStatisticsText)?.[1] ?? Number.NaN);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export function createLinuxProcessIdentity(files: LinuxProcessFiles): ProcessIdentityReader {
  function bootIdentity(): string | null {
    return files.fileText(BOOT_IDENTITY_PATH)?.trim() || null;
  }

  function bootStartedAtEpochSeconds(): number | null {
    const kernelStatisticsText = files.fileText(KERNEL_STATISTICS_PATH);
    return kernelStatisticsText === null ? null : bootTimeEpochSecondsOfKernelStatistics(kernelStatisticsText);
  }

  function identityOf(processId: number): ProcessIdentity | null {
    if (!Number.isSafeInteger(processId) || processId <= 0) return null;
    const statText = files.fileText(statPathOf(processId));
    const stat     = statText === null ? null : processStatOf(statText);
    const readBoot = bootIdentity();
    if (stat === null || readBoot === null || statReadsAsGone(stat)) return null;
    return { processId, startStamp: stat.startTicks, bootIdentity: readBoot };
  }

  // A stat that cannot be read decides nothing: `hidepid` hides another user's live process the same way an exit removes it.
  function processStateSaysGone(processId: number): boolean | null {
    const statText = files.fileText(statPathOf(processId));
    const stat     = statText === null ? null : processStatOf(statText);
    return stat === null ? null : statReadsAsGone(stat);
  }

  function identitySourcesOf(processId: number): readonly string[] {
    return [statPathOf(processId), BOOT_IDENTITY_PATH];
  }

  // A stat file gone between the listing and its read is a process that exited, never an unreadable table.
  function processTable(): readonly ProcessTableEntry[] | null {
    const folderEntries = files.directoryEntries(PROCESS_TABLE_PATH);
    if (folderEntries === null) return null;
    const table: ProcessTableEntry[] = [];
    for (const folderEntry of folderEntries) {
      if (!DECIMAL_PATTERN.test(folderEntry)) continue;
      const statText = files.fileText(statPathOf(folderEntry));
      if (statText === null) continue;
      const stat = processStatOf(statText);
      if (stat === null) return null;
      if (statReadsAsGone(stat)) continue;
      table.push({
        processId: Number(folderEntry), parentProcessId: stat.parentProcessId, processGroupId: stat.processGroupId, startStamp: stat.startTicks
      });
    }
    return table;
  }

  function groupMembersOf(processGroupId: number): readonly GroupMember[] | null {
    const table = processTable();
    if (table === null) return null;
    return table.filter((entry) => entry.processGroupId === processGroupId).map(({ processId, startStamp }) => ({ processId, startStamp }));
  }

  return Object.freeze({
    identityOf, identitySourcesOf, bootIdentity, bootStartedAtEpochSeconds, groupMembersOf, processTable, processStateSaysGone
  });
}
