/**
 * Reads a process's identity on Windows: the start stamp is the decimal text of its FILETIME from the kernel, and the boot is the BootId value
 * read once per process through the absolute `reg.exe` under the given `SystemRoot`, because liveness runs per Watcher per pass. A failed boot
 * read answers `UNREADABLE_BOOT_IDENTITY`, which never stops an Overseer: a FILETIME alone tells a reused pid apart, so a reboot then reads as a crash.
 */
import type { ProcessIdentityPrimitives }                 from './DarwinProcessIdentity.ts';
import { type ProcessIdentity, UNREADABLE_BOOT_IDENTITY } from './ProcessIdentity.ts';
import type { ProcessSupervision }                        from './ProcessSupervision.ts';
import type { WindowsKernelProcessApi }                   from './WindowsKernelProcessApi.ts';

export const WINDOWS_PROCESS_IDENTITY_ROUTE = 'kernel32-ffi';

const BOOT_IDENTITY_KEY        = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters';
const BOOT_IDENTITY_VALUE_NAME = 'BootId';

export const WINDOWS_BOOT_IDENTITY_SOURCE = `${BOOT_IDENTITY_KEY}\\${BOOT_IDENTITY_VALUE_NAME}`;

/** The absolute path of a program in the system folder, and the environment it runs under. */
export interface WindowsSystemTools {
  readonly pathOf:      (programFile: string) => string;
  readonly environment: Readonly<Record<string, string>>;
}

const DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
const SYSTEM_FOLDER = 'System32';
const REGISTRY_TOOL_FILE = 'reg.exe';

/**
 * `null` when `SystemRoot` is unset or not drive-absolute: a program then runs by no absolute path, so nothing runs. A Windows program started
 * without SystemRoot can fail to load its libraries, so the environment names it.
 */
export function windowsSystemToolsOf(systemRoot: string | undefined): WindowsSystemTools | null {
  if (systemRoot === undefined || !DRIVE_ABSOLUTE_PATH.test(systemRoot)) return null;
  const systemFolder = `${systemRoot.replace(/[\\/]+$/, '')}\\${SYSTEM_FOLDER}`;
  return Object.freeze({
    pathOf:      (programFile: string) => `${systemFolder}\\${programFile}`,
    environment: Object.freeze({ SystemRoot: systemRoot }),
  });
}

// `reg query` prints the value as `    BootId    REG_DWORD    0x1f`.
const BOOT_IDENTITY_LINE_PATTERN = /\bBootId\s+REG_DWORD\s+(0x[0-9a-f]+)/i;

export function createWindowsProcessIdentity(
  kernel: WindowsKernelProcessApi,
  primitives: ProcessIdentityPrimitives,
  systemTools: WindowsSystemTools | null,
): Pick<ProcessSupervision, 'identityOf' | 'identitySourcesOf'> {
  let bootIdentityOfThisProcess: string | null = null;

  function readBootIdentity(): string {
    if (systemTools === null) return UNREADABLE_BOOT_IDENTITY;
    const argv = [systemTools.pathOf(REGISTRY_TOOL_FILE), 'query', BOOT_IDENTITY_KEY, '/v', BOOT_IDENTITY_VALUE_NAME];
    const output = primitives.outputOfProgram(argv, systemTools.environment);
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
