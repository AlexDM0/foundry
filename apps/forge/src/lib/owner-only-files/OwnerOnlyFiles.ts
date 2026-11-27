/** The `OwnerOnlyFiles` port: files and folders only their owner may reach. It depends on no other lib package. */
/** `no-adapter`: the platform has no way to restrict a path; `not-proved-owner-only`: its access list was read back granting another. */
export type OwnerOnlyRefusalCause = 'no-adapter' | 'not-proved-owner-only';

export type OwnerOnlyRestriction =
  | { readonly verdict: 'restricted' }
  | { readonly verdict: 'refused'; readonly cause: OwnerOnlyRefusalCause; readonly path: string };

export interface OwnerOnlyFiles {
  /** Creates the folder when it is absent. Refused when the folder cannot be proved owner-only; a system error still throws. */
  restrictFolder(folder: string): OwnerOnlyRestriction;
  /** Refused when the file cannot be proved owner-only; a system error still throws. */
  restrictFile(path: string): OwnerOnlyRestriction;
  /** Fail closed: a path that cannot be read back is not owner-only. */
  isOwnerOnly(path: string): boolean;
}
