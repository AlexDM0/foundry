/** The one selector of the `OwnerOnlyFiles` port, and the real primitives its adapters run on. */
import { chmodSync, mkdirSync, statSync } from 'node:fs';

import type { OwnerOnlyFiles }                                 from './OwnerOnlyFiles.ts';
import { createPosixOwnerOnlyFiles, type OwnerOnlyPrimitives } from './PosixOwnerOnlyFiles.ts';

export const REAL_OWNER_ONLY_PRIMITIVES: OwnerOnlyPrimitives = Object.freeze({
  createFolder: (folder: string, mode: number) => {
    mkdirSync(folder, { recursive: true, mode });
  },
  changeMode: chmodSync,
  modeOf:     (path: string) => statSync(path).mode,
});

export function ownerOnlyFilesFor(platform: string): OwnerOnlyFiles {
  if (platform === 'darwin' || platform === 'linux') return createPosixOwnerOnlyFiles(REAL_OWNER_ONLY_PRIMITIVES);
  const refuse = (): never => {
    throw new Error(`no owner-only files exist for the platform ${platform}`);
  };
  return Object.freeze<OwnerOnlyFiles>({ restrictFolder: refuse, restrictFile: refuse, isOwnerOnly: () => false });
}
