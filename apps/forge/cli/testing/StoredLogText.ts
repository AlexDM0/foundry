/** The tracker's log.jsonl exactly as stored, for a command spec to check that a refused command left the log byte-identical. */
import { readFileSync } from 'node:fs';

import { localStoreLayoutOf } from '../../src/services/tracker/LocalStoreLayout.ts';
import { workspacePathsFor }  from '../../src/services/tracker/Workspace.ts';

export function storedLogTextOf(repositoryDirectory: string): string {
  return readFileSync(localStoreLayoutOf(workspacePathsFor(repositoryDirectory)).logRecordPath, 'utf8');
}
