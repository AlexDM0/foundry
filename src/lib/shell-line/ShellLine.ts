/**
 * The `ShellLine` port: how a gate line, one string in the machine's shell grammar, becomes a spawn and how its exit reads. It depends on no
 * other lib package.
 */
export interface ShellSpawnRequest {
  readonly argv:              readonly string[];
  /** `spawn-option`: the caller's working directory goes to the spawn, never into the line. */
  readonly workingDirectory:  'spawn-option';
  /** Whether the runtime must hand the last argument over unquoted. */
  readonly verbatimArguments: boolean;
}

export interface ShellExitReport {
  /** `null` when the line could not be started, or ended by a signal. */
  readonly exitCode:   number | null;
  readonly signalCode: string | null;
}

export type ShellExitMeaning = 'passed' | 'failed' | 'cannot-run';

export interface ShellLine {
  spawnRequestOf(line: string): ShellSpawnRequest;
  exitMeaningOf(exitReport: ShellExitReport): ShellExitMeaning;
  /** The grammar's name, which an onboarder is told to write its lines in. */
  readonly lineGrammar: string;
}
