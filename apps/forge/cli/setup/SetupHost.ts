/**
 * Everything machine setup reaches outside its own logic, injected so a spec runs every step under any platform on one machine. Files
 * are read and written through `node:fs` directly, since a spec points the home and the checkout at scratch folders.
 */
export interface FinishedCommand {
  readonly exitCode: number;
  readonly output:   string;
}

export interface SetupHost {
  readonly platform:            NodeJS.Platform;
  /** The agent-progress checkout that setup installs: it holds `agent-progress.ts`, `launcher.ts` and `.bun-version`. */
  readonly checkoutDirectory:   string;
  readonly homeDirectory:       string;
  /** The Bun that setup runs `install`, `link`, `build` and `upgrade` with, an absolute path. */
  readonly bunProgram:          string;
  /** The folder whose `bin` holds what `bun link` installs. */
  readonly bunInstallFolder:    string;
  /** The folders of `PATH` in this shell, in order. */
  readonly searchPath:          readonly string[];
  readonly userShell:           string | undefined;
  /** The program file a name runs from `searchPath`, or null when none does. */
  readonly programOnSearchPath: (programName: string) => string | null;
  readonly run:                 (command: readonly string[], workingDirectory: string) => FinishedCommand;
  /** Windows' system folder (`SystemRoot`), or undefined where none is set. */
  readonly systemFolder:        () => string | undefined;
  readonly answersYes:          (question: string) => boolean;
  readonly write:               (text: string) => void;
}
