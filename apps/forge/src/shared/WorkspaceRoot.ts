/** The root of the Bun workspace a program folder sits in: the folder whose `package.json` names the workspaces. */
import { readFileSync }           from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { JsonRecordUtil } from '../lib/json-record/JsonRecordUtil.ts';

function manifestNamesWorkspaces(folder: string): boolean {
  try {
    const manifest = JsonRecordUtil.recordOf(JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')));
    return manifest !== undefined && Object.hasOwn(manifest, 'workspaces');
  } catch {
    return false;
  }
}

/** The nearest folder at or above `startFolder` whose `package.json` names `workspaces`; `undefined` when none up to the file system root does. */
export function workspaceRootOf(startFolder: string): string | undefined {
  for (let folder = resolve(startFolder); ; folder = dirname(folder)) {
    if (manifestNamesWorkspaces(folder)) {
      return folder;
    }
    if (dirname(folder) === folder) {
      return undefined;
    }
  }
}
