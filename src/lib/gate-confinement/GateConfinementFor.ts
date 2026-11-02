/**
 * The one selector of the `GateConfinement` port. macOS uses Seatbelt and Linux uses bubblewrap. A platform with no adapter answers
 * `unavailable`, and every caller refuses the line. Windows runs unconfined, by the owner's decision.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';

import { writeFileAtomically }                           from '../atomic-file/AtomicFile.ts';
import { createDarwinSeatbelt, type SeatbeltPrimitives } from './DarwinSeatbelt.ts';
import type { GateConfinement }                          from './GateConfinement.ts';
import {
  type BubblewrapPrimitives,
  createLinuxBubblewrap,
  type HostPathKind,
  type ProgramRun
} from './LinuxBubblewrap.ts';
import { resolvedPathOf }             from './ResolvedPath.ts';
import { createWindowsNoConfinement } from './WindowsNoConfinement.ts';

function programSucceeds(argv: readonly string[]): boolean {
  try {
    return Bun.spawnSync({
      cmd: [...argv], stdout: 'ignore', stderr: 'ignore', windowsHide: true
    }).exitCode === 0;
  } catch {
    return false;
  }
}

function runProgram(argv: readonly string[]): ProgramRun {
  try {
    const run = Bun.spawnSync({
      cmd: [...argv], stdin: 'ignore', stdout: 'pipe', stderr: 'pipe'
    });
    return { exitCode: run.exitCode, output: run.stdout.toString() + run.stderr.toString() };
  } catch (error) {
    return { exitCode: null, output: error instanceof Error ? error.message : String(error) };
  }
}

function kindOf(path: string): HostPathKind {
  const stats = statSync(path, { throwIfNoEntry: false });
  if (stats === undefined) return 'absent';
  return stats.isDirectory() ? 'directory' : 'file';
}

function entriesOf(folder: string): readonly string[] {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

export const REAL_SEATBELT_PRIMITIVES: SeatbeltPrimitives = Object.freeze({ fileExists: existsSync, programSucceeds, writeFile: writeFileAtomically });

export const REAL_BUBBLEWRAP_PRIMITIVES: BubblewrapPrimitives = Object.freeze({
  executablePathOf: (name: string) => Bun.which(name),
  runProgram,
  tree:             Object.freeze({ kindOf, entriesOf, resolvedPathOf }),
});

function createUnsupportedGateConfinement(platform: string): GateConfinement {
  return Object.freeze<GateConfinement>({
    availability:      () => ({ verdict: 'unavailable', reason: `no gate confinement exists for the platform ${platform}` }),
    workerConfinement: () => 'unavailable',
    confinedArgvOf:    (_plan, argv) => [...argv],
  });
}

export function gateConfinementFor(platform: string): GateConfinement {
  if (platform === 'win32') return createWindowsNoConfinement();
  if (platform === 'linux') return createLinuxBubblewrap(REAL_BUBBLEWRAP_PRIMITIVES);
  return platform === 'darwin' ? createDarwinSeatbelt(REAL_SEATBELT_PRIMITIVES) : createUnsupportedGateConfinement(platform);
}
