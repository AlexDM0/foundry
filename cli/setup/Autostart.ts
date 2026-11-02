/**
 * The port behind setup's optional login item: what starts the Overseer of one repository when the user logs in. Each operating system
 * has its own adapter over injected primitives, so every adapter runs on any machine against a scratch home or a fake registry.
 */
import { type FinishedCommand } from './SetupHost.ts';

/** Every path absolute and already resolved for the host: the adapter only words and stores the item. */
export interface LoginItem {
  readonly label:              string;
  readonly repository:         string;
  readonly bunProgram:         string;
  /** The Bun arguments that keep a repository's bunfig and `.env` out of the tool. */
  readonly isolatingArguments: readonly string[];
  /** The tool's entry, `agent-progress.ts` in the checkout. */
  readonly entryPoint:         string;
  /** The search path the item runs under, joined with the host's delimiter. */
  readonly searchPath:         string;
}

export type LoginItemWriteVerdict =
  | { readonly verdict: 'written' }
  | { readonly verdict: 'refused'; readonly reason: string };

export interface AutostartPrimitives {
  readonly homeDirectory:       string;
  /** The file's text, or null when it does not exist. */
  readonly readText:            (path: string) => string | null;
  /** Writes the file, creating its folders. */
  readonly writeText:           (path: string, text: string) => void;
  readonly run:                 (command: readonly string[], workingDirectory: string) => FinishedCommand;
  readonly programOnSearchPath: (programName: string) => string | null;
  /** Windows' system folder (`SystemRoot`), or undefined where none is set. */
  readonly systemFolder:        () => string | undefined;
}

export interface Autostart {
  /** The words setup prints for the kind of item, such as `LaunchAgent`. */
  readonly mechanism:              string;
  /** Where the item of `label` is stored: a file path or a registry value. */
  readonly locationOf:             (label: string) => string;
  /** Why no item written here would ever run, or null when one would. Checked before anything is written. */
  readonly unavailableReason:      () => string | null;
  /** The repository the stored item of `label` starts the Overseer of, read back from where it is stored; null when there is none. */
  readonly registeredRepositoryOf: (label: string) => string | null;
  readonly commandOf:              (item: LoginItem) => readonly string[];
  readonly write:                  (item: LoginItem) => LoginItemWriteVerdict;
  /** What the user may do next, one line each, such as starting the item now. */
  readonly adviceAfterWriting:     (item: LoginItem) => readonly string[];
}
