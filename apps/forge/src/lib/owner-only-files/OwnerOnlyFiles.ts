/** The `OwnerOnlyFiles` port: files and folders only their owner may reach. It depends on no other lib package. */
export interface OwnerOnlyFiles {
  /** Creates the folder when it is absent. Throws when the folder cannot be made or proved owner-only. */
  restrictFolder(folder: string): void;
  /** Throws when the file cannot be made or proved owner-only. */
  restrictFile(path: string): void;
  /** Fail closed: a path that cannot be read back is not owner-only. */
  isOwnerOnly(path: string): boolean;
}
