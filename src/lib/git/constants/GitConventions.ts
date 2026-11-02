/** The entry that makes a directory a git checkout: a folder in a main checkout, a file in a linked worktree. */
export const GIT_ENTRY_NAME = '.git';
/** git's exit code for a `merge-base --is-ancestor` answered no. */
export const NOT_AN_ANCESTOR_EXIT_CODE = 1;
/**
 * The settings every git this tool starts runs with, its own spawns and a worker's or a gate's alike: a worktree path adds length, and
 * Windows refuses a path over 260 characters without `core.longpaths`. Harmless where paths are not limited.
 */
export const PORTABLE_GIT_SETTINGS: readonly (readonly [string, string])[] = [['core.longpaths', 'true']];
/** The pathspec characters one git argv carries, under the 32,767 characters a Windows command line holds, with room for the rest of the argv. */
export const GIT_PATHSPEC_ARGUMENT_CHARACTERS = 30000;
/** The oldest git whose features this tool needs: `merge-tree --write-tree` came in 2.38, `GIT_CONFIG_COUNT` in 2.31. */
export const GIT_VERSION_FLOOR = { major: 2, minor: 38 } as const;
