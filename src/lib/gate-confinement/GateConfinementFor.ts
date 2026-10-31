/**
 * The one selector of the `GateConfinement` port. Linux keeps today's code, which finds no `sandbox-exec`, answers `unavailable` and passes the
 * line through; a platform with no adapter answers the same way. Refusing to run on `unavailable` is a later decision of the callers.
 */
import { existsSync } from 'node:fs';

import { writeFileAtomically }                           from '../atomic-file/AtomicFile.ts';
import { createDarwinSeatbelt, type SeatbeltPrimitives } from './DarwinSeatbelt.ts';
import type { GateConfinement }                          from './GateConfinement.ts';

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
    availability:   () => ({ verdict: 'unavailable', reason: `no gate confinement exists for the platform ${platform}` }),
    confinedArgvOf: (_plan, argv) => [...argv],
  });
}

export function gateConfinementFor(platform: string): GateConfinement {
  return platform === 'darwin' || platform === 'linux' ? createDarwinSeatbelt(REAL_SEATBELT_PRIMITIVES) : createUnsupportedGateConfinement(platform);
}
