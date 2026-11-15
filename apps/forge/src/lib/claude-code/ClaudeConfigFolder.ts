/** Where Claude Code keeps its user files: the folder `CLAUDE_CONFIG_DIR` names, else `.claude` in the home folder. */
import { join } from 'node:path';

import { CLAUDE_DIRECTORY_NAME } from './constants/ClaudeCodePaths.ts';

export const CLAUDE_CONFIG_FOLDER_VARIABLE = 'CLAUDE_CONFIG_DIR';

/** `configFolderVariable` is the variable's value, read by the caller; an empty or blank one reads as unset, as an empty folder is relative. */
export function claudeConfigFolderOf(homeDirectory: string, configFolderVariable: string | undefined, joinPath: (...segments: string[]) => string = join): string {
  return configFolderVariable === undefined || configFolderVariable.trim().length === 0 ? joinPath(homeDirectory, CLAUDE_DIRECTORY_NAME) : configFolderVariable;
}
