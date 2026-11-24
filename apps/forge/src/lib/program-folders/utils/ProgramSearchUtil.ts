/** The orders a program is looked for in, built from the answers of the `ProgramFolders` port; each path as found, never resolved. */
import type { ProgramFolders } from '../ProgramFolders.ts';

/** A program whose vendor's own installers also put it in folders under the home folder, each given as its path segments. */
export interface VendorProgram {
  readonly programFileName:      string;
  readonly vendorProgramFolders: readonly (readonly string[])[];
}

/** Where a tool is looked for by its name: the install folders, the version manager's node, then the system's own folders. */
function toolFoldersOf(programFolders: ProgramFolders, homeDirectory: string): string[] {
  return [...new Set([...programFolders.installFoldersOf(homeDirectory), ...programFolders.nodeVersionFoldersOf(homeDirectory), ...programFolders.baseFolders()])];
}

/** Where a vendor's program may lie, in the order a choice is offered: the vendor's own folders, then the install folders and node's. */
function programPlacesOf(programFolders: ProgramFolders, homeDirectory: string, program: VendorProgram): string[] {
  const { pathModule } = programFolders;
  const folders = [
    ...program.vendorProgramFolders.map((segments) => pathModule.join(homeDirectory, ...segments)),
    ...programFolders.installFoldersOf(homeDirectory),
    ...programFolders.nodeVersionFoldersOf(homeDirectory),
  ];
  return [...new Set(folders)].map((folder) => pathModule.join(folder, program.programFileName));
}

export const ProgramSearchUtil = Object.freeze({ toolFoldersOf, programPlacesOf });
