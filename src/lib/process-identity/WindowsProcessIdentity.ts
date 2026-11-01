/**
 * Reads a process's identity on Windows: the start stamp is the decimal text of its FILETIME from the kernel, and the boot is the BootId value
 * read once per process through the absolute `reg.exe`, because liveness runs per Watcher per pass. A failed boot read answers
 * `UNREADABLE_BOOT_IDENTITY`, which never stops an Overseer: a FILETIME alone tells a reused pid apart, so a reboot then reads as a crash.
 */
import type { ProcessIdentityPrimitives }                 from './DarwinProcessIdentity.ts';
import { type ProcessIdentity, UNREADABLE_BOOT_IDENTITY } from './ProcessIdentity.ts';
import type { ProcessSupervision }                        from './ProcessSupervision.ts';
import type { WindowsKernelProcessApi }                   from './WindowsKernelProcessApi.ts';

export const WINDOWS_PROCESS_IDENTITY_ROUTE = 'kernel32-ffi';

const BOOT_IDENTITY_KEY        = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters';
const BOOT_IDENTITY_VALUE_NAME = 'BootId';

export const WINDOWS_BOOT_IDENTITY_SOURCE = `${BOOT_IDENTITY_KEY}\\${BOOT_IDENTITY_VALUE_NAME}`;

const REGISTRY_TOOL_PATH = 'C:\\Windows\\System32\\reg.exe';

// A Windows program started without SystemRoot can fail to load its libraries, so the reader's environment names it.
const REGISTRY_TOOL_ENVIRONMENT = { SystemRoot: 'C:\\Windows' };

// `reg query` prints the value as `    BootId    REG_DWORD    0x1f`.
const BOOT_IDENTITY_LINE_PATTERN = /\bBootId\s+REG_DWORD\s+(0x[0-9a-f]+)/i;

export function createWindowsProcessIdentity(
  kernel: WindowsKernelProcessApi,
  primitives: ProcessIdentityPrimitives,
): Pick<ProcessSupervision, 'identityOf' | 'identitySourcesOf'> {
  let bootIdentityOfThisProcess: string | null = null;

  function readBootIdentity(): string {
    const output = primitives.outputOfProgram([REGISTRY_TOOL_PATH, 'query', BOOT_IDENTITY_KEY, '/v', BOOT_IDENTITY_VALUE_NAME], REGISTRY_TOOL_ENVIRONMENT);
    return BOOT_IDENTITY_LINE_PATTERN.exec(output ?? '')?.[1] ?? UNREADABLE_BOOT_IDENTITY;
  }

  function identityOf(processId: number): ProcessIdentity | null {
    if (!Number.isSafeInteger(processId) || processId <= 0) return null;
    const startStamp = kernel.creationTimeOf(processId);
    if (startStamp === null) return null;
    bootIdentityOfThisProcess ??= readBootIdentity();
    return { processId, startStamp, bootIdentity: bootIdentityOfThisProcess };
  }

  function identitySourcesOf(processId: number): readonly string[] {
    return [`${WINDOWS_PROCESS_IDENTITY_ROUTE} GetProcessTimes ${processId}`, WINDOWS_BOOT_IDENTITY_SOURCE];
  }

  return Object.freeze({ identityOf, identitySourcesOf });
}
