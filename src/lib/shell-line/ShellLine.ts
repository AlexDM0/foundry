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
  readonly exitCode:       number | null;
  readonly signalCode:     string | null;
  /** What the line wrote to the status file its spawn request named, `null` when that file is missing; a grammar that writes none ignores it. */
  readonly recordedStatus: string | null;
}

export type ShellExitMeaning = 'passed' | 'failed' | 'cannot-run';

export type ShellLineGrammar = 'posix-shell' | 'windows-cmd' | 'none';

/** Why this shell runs no line in a folder: cmd falls back to the Windows folder for a network share, and a bare interpreter name could be any file. */
export type ShellRunRefusal = 'network-share-folder' | 'no-absolute-interpreter';

/** One step a person reads: its line, and the folder it runs in, relative to the checkout, or `null` for the checkout itself. */
export interface ShellDisplayStep {
  readonly line:             string;
  readonly workingDirectory: string | null;
}

export interface ShellLine {
  /** `statusFile` is an absolute path the caller reads after the exit and passes back as `recordedStatus`; it need not exist yet. */
  spawnRequestOf(line: string, statusFile: string): ShellSpawnRequest;
  /** A line that cannot run in this folder is refused before its spawn request is asked for. */
  runRefusalOf(workingDirectory: string): ShellRunRefusal | null;
  exitMeaningOf(exitReport: ShellExitReport): ShellExitMeaning;
  /** The characters a stored line may hold at most in this grammar, `null` for no limit. */
  readonly lineLimitCharacters: number | null;
  /** The first word of each command the line runs, split as this grammar splits it, so a worker is granted what the line invokes and no more. */
  executablesOf(line: string): string[];
  /** The steps as text a person types into this grammar's shell, the first failure stopping the rest; display only, never spawned. */
  displayLineOf(steps: readonly ShellDisplayStep[]): string;
  /** The grammar a stored line runs in on this machine, which `gate add` help and an onboarder name. */
  readonly lineGrammar:         ShellLineGrammar;
}
