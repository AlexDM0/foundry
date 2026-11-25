/** The `ProgramFolders` port: where programs are installed on this machine's operating system. It depends on no other lib package. */
import type { posix } from 'node:path';

export interface ProgramFolders {
  /** How this platform joins the folders and file names it answers. */
  readonly pathModule: typeof posix;
  /** The folders installers put a user's programs in, under `homeDirectory` or the system's, in the order a program is looked for. */
  installFoldersOf(homeDirectory: string): readonly string[];
  /** The folder of the newest node a version manager installed under `homeDirectory`, which stands for its current one; none when it has none. */
  nodeVersionFoldersOf(homeDirectory: string): readonly string[];
  /** The folders of the system's own programs, which end every agent's search path; none when the machine names none. */
  baseFolders(): readonly string[];
  /** The file names a program of this name may have here, in the order they are tried. */
  programFileNamesOf(programName: string): readonly string[];
}
