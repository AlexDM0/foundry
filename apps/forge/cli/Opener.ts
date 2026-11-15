/** The `Opener` port: the program that shows a file in the machine's browser, and whether it outlives this process. */
export interface Opener {
  /** The page's path is the last argument, added by the caller. */
  readonly commandLine: readonly string[];
  readonly detach:      boolean;
}
