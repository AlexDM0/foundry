/** The one selector of the `OwnerOnlyFiles` port; a platform with no adapter refuses every restriction and proves no path owner-only. */
import type { OwnerOnlyFiles, OwnerOnlyRestriction }                       from './OwnerOnlyFiles.ts';
import { createPosixOwnerOnlyFiles, REAL_POSIX_OWNER_ONLY_PRIMITIVES }     from './PosixOwnerOnlyFiles.ts';
import { createWindowsOwnerOnlyFiles, REAL_WINDOWS_OWNER_ONLY_PRIMITIVES } from './WindowsOwnerOnlyFiles.ts';

export function ownerOnlyFilesFor(platform: string): OwnerOnlyFiles {
  if (platform === 'darwin' || platform === 'linux') return createPosixOwnerOnlyFiles(REAL_POSIX_OWNER_ONLY_PRIMITIVES);
  if (platform === 'win32') return createWindowsOwnerOnlyFiles(REAL_WINDOWS_OWNER_ONLY_PRIMITIVES);
  const refuse = (path: string): OwnerOnlyRestriction => ({ verdict: 'refused', cause: 'no-adapter', path });
  return Object.freeze<OwnerOnlyFiles>({ restrictFolder: refuse, restrictFile: refuse, isOwnerOnly: () => false });
}
