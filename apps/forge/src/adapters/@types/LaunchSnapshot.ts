/**
 * What the own-refs and agent-config checks (`onlyOwnRefsMoved`, `agentConfigUntouched`) compare a job's end with, taken as its session is
 * first launched and kept in the job's start file.
 */
export interface LaunchSnapshot {
  /** Every ref's commit, and each detached worktree's HEAD keyed `HEAD:<path>`. */
  refs:              Readonly<Record<string, string>>;
  /** The hooks folder's names and contents as one digest; `null` when the folder is missing. */
  hooksFolderDigest: string | null;
}
