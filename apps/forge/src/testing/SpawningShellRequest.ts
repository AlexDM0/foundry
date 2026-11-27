/** A spec's spawn request from a shell line it expects to spawn: a refusal fails the case, naming its code. */
import type { ShellLine, ShellSpawnRequest } from '../lib/shell-line/ShellLine.ts';

export function spawningShellRequestOf(shellLine: Pick<ShellLine, 'spawnRequestOf'>, line: string, statusFile: string): ShellSpawnRequest {
  const spawnRequest = shellLine.spawnRequestOf(line, statusFile);
  if (spawnRequest.verdict === 'refused') throw new Error(`the shell line refused the spawn: ${spawnRequest.refusal}`);
  return spawnRequest;
}
