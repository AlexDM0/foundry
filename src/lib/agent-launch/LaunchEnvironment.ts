/** The `LaunchEnvironment` port: what a launched agent keeps of the environment it was launched from, and where that environment searches. */
export interface LaunchEnvironment {
  /** Every other variable, a parent session's included, stays behind. */
  readonly inheritedVariableNames: readonly string[];
  /** The child environment: the allowlisted inherited variables that are set, then the job's own variables, which win a clash. */
  launchEnvironmentOf(
    inherited: Readonly<Record<string, string | undefined>>,
    jobVariables: Readonly<Record<string, string>>
  ): Record<string, string>;
  /** The folders of the environment's search path, in order, empty entries left out. */
  searchFoldersOf(environment: Readonly<Record<string, string | undefined>>): string[];
}
