/** The `LaunchEnvironment` port: what a launched agent keeps of the environment it was launched from, and where that environment searches. */
export interface LaunchEnvironment {
  /** Every other variable, a parent session's included, stays behind. */
  readonly inheritedVariableNames: readonly string[];
  /**
   * The child environment: the allowlisted inherited variables that are set, those `vendorVariableNames` adds among them, then the job's
   * own variables, which win a clash. Only a vendor's session passes `vendorVariableNames`; a gate gets the allowlist alone.
   */
  launchEnvironmentOf(
    inherited: Readonly<Record<string, string | undefined>>,
    jobVariables: Readonly<Record<string, string>>,
    vendorVariableNames?: readonly string[]
  ): Record<string, string>;
  /** The folders of the environment's search path, in order, empty entries left out. */
  searchFoldersOf(environment: Readonly<Record<string, string | undefined>>): string[];
  /** The environment with its search path exactly `folders`, then the base folders it was made with, duplicates dropped; no inherited folder stays. */
  withSearchFolders(environment: Readonly<Record<string, string>>, folders: readonly string[]): Record<string, string>;
}
