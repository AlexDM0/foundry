/**
 * Reads a process's identity and its group's members through `/bin/ps` and the boot through `sysctl`, over injected primitives. The start
 * stamp is the decimal text of the epoch seconds `ps` reports.
 */
import type { GroupMember, ProcessIdentityReader } from './PosixProcessGroups.ts';
import type { ProcessIdentity }                    from './ProcessIdentity.ts';

export interface ProcessIdentityPrimitives {
  /** `null` when the program cannot be started or exits non-zero. */
  readonly outputOfProgram: (argv: readonly string[], environment: Readonly<Record<string, string>>) => string | null;
}

const PROCESS_STATUS_PATH       = '/bin/ps';
const SYSTEM_CONTROL_PATH       = '/usr/sbin/sysctl';
const DARWIN_BOOT_IDENTITY_NAME = 'kern.bootsessionuuid';

// The start is read in UTC under the C locale, so ps prints the same English stamp whatever the caller's TZ or language.
const STAMP_ENVIRONMENT = { TZ: 'UTC', LC_ALL: 'C' };

const MILLISECONDS_PER_SECOND = 1000;

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// `ps -o lstart` under the C locale: weekday, month, day, time, year, as in `Wed Oct 28 01:51:25 2026`.
const START_STAMP_PATTERN = /^[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/;

// `ps -A -o pid= -o pgid= -o lstart=`: a pid, its group and its start stamp.
const PROCESS_LISTING_LINE_PATTERN = /^\s*(\d+)\s+(\d+)\s+(.+)$/;

/** A `ps -o lstart` stamp printed in UTC, read as epoch seconds; `null` when it is not one. */
export function startEpochSecondsOf(utcStartStamp: string): number | null {
  const match = START_STAMP_PATTERN.exec(utcStartStamp.trim());
  if (match === null) return null;
  const [, monthName, day, hours, minutes, seconds, year] = match;
  const monthIndex = MONTH_ABBREVIATIONS.indexOf(monthName ?? '');
  if (monthIndex < 0) return null;
  const epochMilliseconds = Date.UTC(Number(year), monthIndex, Number(day), Number(hours), Number(minutes), Number(seconds));
  return epochMilliseconds / MILLISECONDS_PER_SECOND;
}

export function createDarwinProcessIdentity(primitives: ProcessIdentityPrimitives): ProcessIdentityReader {
  const trimmedOutputOf = (argv: readonly string[]): string | null => primitives.outputOfProgram(argv, STAMP_ENVIRONMENT);

  function bootIdentity(): string | null {
    return trimmedOutputOf([SYSTEM_CONTROL_PATH, '-n', DARWIN_BOOT_IDENTITY_NAME]) || null;
  }

  function identityOf(processId: number): ProcessIdentity | null {
    if (!Number.isSafeInteger(processId) || processId <= 0) return null;
    const printedStart = trimmedOutputOf([PROCESS_STATUS_PATH, '-o', 'lstart=', '-p', String(processId)]);
    if (printedStart === null) return null;
    const startEpochSeconds = startEpochSecondsOf(printedStart);
    const readBoot          = bootIdentity();
    if (startEpochSeconds === null || readBoot === null) return null;
    return { processId, startStamp: String(startEpochSeconds), bootIdentity: readBoot };
  }

  function identitySourcesOf(processId: number): readonly string[] {
    return [`${PROCESS_STATUS_PATH} -o lstart= -p ${processId}`, `${SYSTEM_CONTROL_PATH} -n ${DARWIN_BOOT_IDENTITY_NAME}`];
  }

  function groupMembersOf(processGroupId: number): readonly GroupMember[] | null {
    const listing = trimmedOutputOf([PROCESS_STATUS_PATH, '-A', '-o', 'pid=', '-o', 'pgid=', '-o', 'lstart=']);
    if (listing === null) return null;
    const members: GroupMember[] = [];
    for (const line of listing.split('\n')) {
      const match = PROCESS_LISTING_LINE_PATTERN.exec(line);
      if (match === null || Number(match[2]) !== processGroupId) continue;
      const startEpochSeconds = startEpochSecondsOf(match[3] ?? '');
      if (startEpochSeconds === null) return null;
      members.push({ processId: Number(match[1]), startStamp: String(startEpochSeconds) });
    }
    return members;
  }

  return Object.freeze({
    identityOf, identitySourcesOf, bootIdentity, groupMembersOf
  });
}
