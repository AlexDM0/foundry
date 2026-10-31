/** The one selector of the `ProcessSupervision` port, and the real primitives its adapters run on. */
import { existsSync, readFileSync } from 'node:fs';

import { createDarwinProcessIdentity, type ProcessIdentityPrimitives } from './DarwinProcessIdentity.ts';
import { createPosixProcessGroups, type ProcessSignalPrimitive }       from './PosixProcessGroups.ts';
import type { ProcessSupervision }                                     from './ProcessSupervision.ts';
import { createUnsupportedProcessSupervision }                         from './UnsupportedProcessSupervision.ts';

const SUCCESS_EXIT_CODE = 0;

function outputOfProgram(argv: readonly string[], environment: Readonly<Record<string, string>>): string | null {
  try {
    const finished = Bun.spawnSync({
      cmd: [...argv], env: { ...environment }, stdout: 'pipe', stderr: 'pipe'
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

export const REAL_PROCESS_IDENTITY_PRIMITIVES: ProcessIdentityPrimitives = Object.freeze({ outputOfProgram, fileExists: existsSync, fileText });

export const REAL_PROCESS_SIGNAL_PRIMITIVE: ProcessSignalPrimitive = Object.freeze({
  sendSignal: (target: number, signal: NodeJS.Signals | 0) => {
    process.kill(target, signal);
  },
});

export function processSupervisionFor(platform: string): ProcessSupervision {
  if (platform === 'darwin' || platform === 'linux') {
    return createPosixProcessGroups(createDarwinProcessIdentity(REAL_PROCESS_IDENTITY_PRIMITIVES), REAL_PROCESS_SIGNAL_PRIMITIVE);
  }
  return createUnsupportedProcessSupervision(platform);
}
