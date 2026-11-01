/** The one selector of the `ProcessSupervision` port, and the real primitives its adapters run on. */
import { readdirSync, readFileSync } from 'node:fs';

import { createDarwinProcessIdentity, type ProcessIdentityPrimitives } from './DarwinProcessIdentity.ts';
import { createLinuxProcessIdentity, type LinuxProcessFiles }          from './LinuxProcessIdentity.ts';
import { createPosixProcessGroups, type ProcessSignalPrimitive }       from './PosixProcessGroups.ts';
import { processIsGone, sameProcess, startedBefore }                   from './ProcessIdentity.ts';
import type { ProcessSupervision }                                     from './ProcessSupervision.ts';
import { windowsSpawnOptionsFor }                                      from './SpawnOptionsFor.ts';
import { createUnsupportedProcessSupervision }                         from './UnsupportedProcessSupervision.ts';
import { createWindowsKernelProcessApi, type WindowsKernelProcessApi } from './WindowsKernelProcessApi.ts';
import { createWindowsProcessIdentity }                                from './WindowsProcessIdentity.ts';
import { createWindowsProcessTree }                                    from './WindowsProcessTree.ts';

const SUCCESS_EXIT_CODE = 0;

function outputOfProgram(argv: readonly string[], environment: Readonly<Record<string, string>>): string | null {
  try {
    const finished = Bun.spawnSync({
      cmd: [...argv], env: { ...environment }, stdout: 'pipe', stderr: 'pipe', windowsHide: true
    });
    return finished.exitCode === SUCCESS_EXIT_CODE ? finished.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

function fileText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function directoryEntries(path: string): readonly string[] | null {
  try {
    return readdirSync(path);
  } catch {
    return null;
  }
}

export const REAL_PROCESS_IDENTITY_PRIMITIVES: ProcessIdentityPrimitives = Object.freeze({ outputOfProgram });

export const REAL_LINUX_PROCESS_FILES: LinuxProcessFiles = Object.freeze({ fileText, directoryEntries });

export const REAL_PROCESS_SIGNAL_PRIMITIVE: ProcessSignalPrimitive = Object.freeze({
  sendSignal: (target: number, signal: NodeJS.Signals | 0) => {
    process.kill(target, signal);
  },
});

export function windowsProcessSupervision(kernel: WindowsKernelProcessApi, primitives: ProcessIdentityPrimitives): ProcessSupervision {
  const identity = createWindowsProcessIdentity(kernel, primitives);
  return Object.freeze({
    ...identity,
    ...createWindowsProcessTree(kernel, identity.identityOf, primitives),
    sameProcess,
    startedBefore,
    processIsGone,
    spawnOptionsFor:      windowsSpawnOptionsFor,
    fallbackStopIsForced: true,
  });
}

export function processSupervisionFor(platform: string): ProcessSupervision {
  if (platform === 'darwin') return createPosixProcessGroups(createDarwinProcessIdentity(REAL_PROCESS_IDENTITY_PRIMITIVES), REAL_PROCESS_SIGNAL_PRIMITIVE);
  if (platform === 'linux') return createPosixProcessGroups(createLinuxProcessIdentity(REAL_LINUX_PROCESS_FILES), REAL_PROCESS_SIGNAL_PRIMITIVE);
  if (platform === 'win32') return windowsProcessSupervision(createWindowsKernelProcessApi(), REAL_PROCESS_IDENTITY_PRIMITIVES);
  return createUnsupportedProcessSupervision(platform);
}
