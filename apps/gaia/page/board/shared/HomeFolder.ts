/**
 * The machine's home folder, which the page around the board hands in so the board prints a path of this machine from `~`; `null` when the
 * page knows none, and a path then prints whole.
 */
import { createContext, useContext } from 'react';

import { PathTextUtil } from '../../shared/utils/PathTextUtil.ts';

export const HomeFolderContext = createContext<string | null>(null);

/** A path of this machine as the board prints it: from `~` under the home folder, whole elsewhere. */
export function useMachinePathTextOf(): (path: string) => string {
  const homeFolder = useContext(HomeFolderContext);
  return (path) => (homeFolder === null ? path : PathTextUtil.homeRelativePathOf(path, homeFolder));
}
