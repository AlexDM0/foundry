/** Every file under a folder that a spec compares before and after a command, keyed by its path relative to the folder. */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative }            from 'node:path';

export function folderFileContentsOf(folder: string, leavesOut: (relativePath: string) => boolean): Map<string, string> {
  const fileContents = new Map<string, string>();
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const filePath     = join(entry.parentPath, entry.name);
    const relativePath = relative(folder, filePath);
    if (!leavesOut(relativePath)) fileContents.set(relativePath, readFileSync(filePath, 'utf8'));
  }
  return fileContents;
}
