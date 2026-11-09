/** Every file of a scratch repository outside `.git/`, keyed by its path relative to the repository, for a spec to show a command wrote nothing. */
import { sep } from 'node:path';

import { folderFileContentsOf } from '../../src/testing/FolderFileContents.ts';

const GIT_DIRECTORY_NAME = '.git';

export function repositoryFileContentsOf(repositoryDirectory: string): Map<string, string> {
  return folderFileContentsOf(repositoryDirectory, (relativePath) => relativePath === GIT_DIRECTORY_NAME || relativePath.startsWith(`${GIT_DIRECTORY_NAME}${sep}`));
}
