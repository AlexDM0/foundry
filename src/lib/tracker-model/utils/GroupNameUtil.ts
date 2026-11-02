/**
 * The one portable rule for a group's name, which also names the branch `group-<name>` and its worktree folder: the same answer on every OS,
 * so a board never depends on the host where it was filed. The `group-` prefix keeps the folder clear of the device names Windows reserves.
 */

/** Lower-case letters and digits in words joined by single hyphens: no character NTFS forbids, no trailing dot, no case to fold. */
const GROUP_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function groupNameIsWellFormed(name: string): boolean {
  return GROUP_NAME_PATTERN.test(name);
}

/** The existing group a case-insensitive file system would put in the same folder as `name`, when it is not `name` itself. */
function caseFoldedTwinOf(name: string, existingGroups: Iterable<string>): string | null {
  const foldedName = name.toLowerCase();
  for (const existingGroup of existingGroups) {
    if (existingGroup !== name && existingGroup.toLowerCase() === foldedName) return existingGroup;
  }
  return null;
}

export const GroupNameUtil = Object.freeze({
  caseFoldedTwinOf,
  groupNameIsWellFormed,
});
