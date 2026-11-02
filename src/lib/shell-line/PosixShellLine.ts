/** A line on macOS and Linux: `sh` joins standard error onto standard output once, then hands the line to the user's shell, so output keeps its order. */
import type { ShellDisplayStep, ShellLine } from './ShellLine.ts';

export interface ShellLinePrimitives {
  readonly userShell: () => string | undefined;
}

const FALLBACK_SHELL = '/bin/sh';
const OUTPUT_JOINING_SCRIPT = 'exec 2>&1; exec "$0" -c "$1"';
const PASSED_EXIT_CODE = 0;

// The shell's own answers for a command it found but could not execute, and for one it did not find: the line never judged the tree.
const COMMAND_NOT_EXECUTABLE_EXIT_CODE = 126;
const COMMAND_NOT_FOUND_EXIT_CODE      = 127;
const SHELL_CANNOT_RUN_EXIT_CODES: readonly number[] = [COMMAND_NOT_EXECUTABLE_EXIT_CODE, COMMAND_NOT_FOUND_EXIT_CODE];

/** No steps is a line that always passes. */
const NO_STEPS_LINE = 'true';
const STEP_JOINER = ' && ';

function quotedForTheShell(text: string): string {
  return `'${text.replaceAll('\'', '\'\\\'\'')}'`;
}

function stepLineOf({ line, workingDirectory }: ShellDisplayStep): string {
  return workingDirectory === null ? line : `cd ${quotedForTheShell(workingDirectory)} && (${line})`;
}

/** One step alone reads as written, so a pipeline of one gate shows exactly the line it was given. */
function displayLineOf(steps: readonly ShellDisplayStep[]): string {
  const [onlyStep] = steps;
  if (steps.length === 1 && onlyStep !== undefined) return stepLineOf(onlyStep);
  return steps.length === 0 ? NO_STEPS_LINE : steps.map((step) => `(${stepLineOf(step)})`).join(STEP_JOINER);
}

export function createPosixShellLine({ userShell }: ShellLinePrimitives): ShellLine {
  return Object.freeze<ShellLine>({
    spawnRequestOf: (line) => {
      const argv = [FALLBACK_SHELL, '-c', OUTPUT_JOINING_SCRIPT, userShell() ?? FALLBACK_SHELL, line];
      return { argv, workingDirectory: 'spawn-option', verbatimArguments: false };
    },
    exitMeaningOf: ({ exitCode }) => {
      if (exitCode === null || SHELL_CANNOT_RUN_EXIT_CODES.includes(exitCode)) return 'cannot-run';
      return exitCode === PASSED_EXIT_CODE ? 'passed' : 'failed';
    },
    displayLineOf,
    lineGrammar: 'posix-shell',
  });
}
