/**
 * The one selector of the `GateConfinement` port. Linux keeps the Seatbelt code, which finds no `sandbox-exec` and answers `unavailable`; a
 * platform with no adapter answers the same way, and every caller refuses the line. Windows runs unconfined, by the owner's decision.
 */
import { existsSync } from 'node:fs';

import { writeFileAtomically }                           from '../atomic-file/AtomicFile.ts';
import { createDarwinSeatbelt, type SeatbeltPrimitives } from './DarwinSeatbelt.ts';
import type { GateConfinement }                          from './GateConfinement.ts';
import { createWindowsNoConfinement }                    from './WindowsNoConfinement.ts';

function programSucceeds(argv: readonly string[]): boolean {
  try {
    return Bun.spawnSync({ cmd: [...argv], stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
  } catch {
    return false;
  }
}

export const REAL_SEATBELT_PRIMITIVES: SeatbeltPrimitives = Object.freeze({ fileExists: existsSync, programSucceeds, writeFile: writeFileAtomically });

function createUnsupportedGateConfinement(platform: string): GateConfinement {
  return Object.freeze<GateConfinement>({
    availability:      () => ({ verdict: 'unavailable', reason: `no gate confinement exists for the platform ${platform}` }),
    workerConfinement: () => 'unavailable',
    confinedArgvOf:    (_plan, argv) => [...argv],
  });
}

export function gateConfinementFor(platform: string): GateConfinement {
  if (platform === 'win32') return createWindowsNoConfinement();
  return platform === 'darwin' || platform === 'linux' ? createDarwinSeatbelt(REAL_SEATBELT_PRIMITIVES) : createUnsupportedGateConfinement(platform);
}
