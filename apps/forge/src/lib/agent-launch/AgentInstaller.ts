/** What an adapter writes into a tracked repository for `init` and `update`: the agent's own entry and folders, which forge names neither. */
export interface AgentInstaller {
  /**
   * Writes or keeps current the agent's entry that runs `command` when a session starts, and answers the report line. `commandName` is
   * the command the reader runs again after a refusal, which goes to `standardError`.
   */
  refreshSessionStart(repositoryRoot: string, command: string, commandName: string, standardError: (text: string) => void): string;
  /** The repository folder, written with `/`, the agent loads the instruction bundle `bundleName` from. */
  instructionBundleFolderOf(bundleName: string): string;
}
