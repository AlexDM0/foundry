/** How the page prints a path of this machine: from `~` when it lies under the home folder, as the artboards print it. */
const HOME_MARK = '~';

/** A path that only starts with the home folder's name, `/Users/alexexample-old`, is not under it and prints whole. */
function homeRelativePathOf(path: string, homeFolder: string): string {
  return path === homeFolder || path.startsWith(`${homeFolder}/`) ? `${HOME_MARK}${path.slice(homeFolder.length)}` : path;
}

export const PathTextUtil = { homeRelativePathOf, } as const;
