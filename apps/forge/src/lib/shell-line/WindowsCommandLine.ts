/**
 * A line on Windows: cmd.exe, found by an absolute path only, runs it in the spawn's working directory with standard error joined inside the
 * line. Bun keeps one byte of a Windows exit status, so a trailer writes the line's whole status to a file the caller names and reads back.
 */
import { win32 } from 'node:path';

import { type CommandLineGrammar, executablesOfLine } from './ExecutablesOfLine.ts';
import type {
  ShellDisplayStep,
  ShellExitReport,
  ShellExitMeaning,
  ShellLine
} from './ShellLine.ts';

export interface WindowsCommandPrimitives {
  /** `ComSpec`, taken only when it is an absolute path with a drive letter. */
  readonly commandInterpreter: () => string | undefined;
  /** `SystemRoot`, whose `System32\cmd.exe` is the interpreter when `ComSpec` is not absolute. */
  readonly systemRoot:         () => string | undefined;
}

/** `call` and the caret delay `%errorlevel%` to the moment the trailer runs; cmd expands it when the whole line is read otherwise. */
export const WINDOWS_LINE_STATUS_TRAILER = 'call echo %^errorlevel%>';
export const COMMAND_LINE_LIMIT_CHARACTERS = 8191;

const INTERPRETER_ARGUMENTS: readonly string[] = ['/d', '/s', '/c'];
const SYSTEM_FOLDER = 'System32';
const INTERPRETER_FILE = 'cmd.exe';
const DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
const NETWORK_SHARE_PATH = /^[\\/]{2}/;

const PASSED_STATUS = 0;
/** cmd's own status for a command it did not find. */
const COMMAND_NOT_FOUND_STATUS = 9009;
/** An NTSTATUS error, such as an access violation: the process crashed or was ended from outside, so it never judged the tree. */
const NT_ERROR_STATUS_FLOOR = 0xC0000000;
const PASSED_EXIT_CODE = 0;

const WINDOWS_COMMAND_LINE_GRAMMAR: CommandLineGrammar = Object.freeze({
  separators:               ['&&', '||', '&', '|', '\n'],
  quotes:                   ['"'],
  escapeCharacter:          '^',
  escapingQuotes:           [],
  groupsOnlyAtCommandStart: true,
  skipsLeadingAssignments:  false,
});

/** The display's line for no steps: a command that always succeeds. */
const NO_STEPS_LINE = 'cd .';
const STEP_JOINER = ' && ';

function interpreterOf({ commandInterpreter, systemRoot }: WindowsCommandPrimitives): string | null {
  const named = commandInterpreter();
  if (named !== undefined && DRIVE_ABSOLUTE_PATH.test(named)) return named;
  const root = systemRoot();
  return root !== undefined && DRIVE_ABSOLUTE_PATH.test(root) ? win32.join(root, SYSTEM_FOLDER, INTERPRETER_FILE) : null;
}

/** cmd prints `%errorlevel%` as a signed 32-bit number, so an NTSTATUS such as 0xC0000005 arrives negative and is read back unsigned. */
function recordedStatusNumberOf(recordedStatus: string | null): number | null {
  const text = recordedStatus?.trim() ?? '';
  return /^-?\d+$/.test(text) ? Number.parseInt(text, 10) >>> 0 : null;
}

/** A status the line never wrote never passes: a non-zero process exit is a failure, a zero one a line that ended before its trailer ran. */
function exitMeaningOf({ exitCode, signalCode, recordedStatus }: ShellExitReport): ShellExitMeaning {
  if (exitCode === null || signalCode !== null) return 'cannot-run';
  const status = recordedStatusNumberOf(recordedStatus);
  if (status === null) return exitCode === PASSED_EXIT_CODE ? 'cannot-run' : 'failed';
  if (status === COMMAND_NOT_FOUND_STATUS || status >= NT_ERROR_STATUS_FLOOR) return 'cannot-run';
  return status === PASSED_STATUS ? 'passed' : 'failed';
}

/** cmd's parentheses group without a child shell, so a step that changes folder changes back; a failure stops the chain before it matters. */
function stepLineOf({ line, workingDirectory }: ShellDisplayStep): string {
  return workingDirectory === null ? line : `pushd "${workingDirectory}" && (${line}) && popd`;
}

function displayLineOf(steps: readonly ShellDisplayStep[]): string {
  const [onlyStep] = steps;
  if (steps.length === 1 && onlyStep !== undefined) return stepLineOf(onlyStep);
  return steps.length === 0 ? NO_STEPS_LINE : steps.map((step) => `(${stepLineOf(step)})`).join(STEP_JOINER);
}

export function createWindowsCommandLine(primitives: WindowsCommandPrimitives): ShellLine {
  return Object.freeze<ShellLine>({
    spawnRequestOf: (line, statusFile) => {
      const interpreter = interpreterOf(primitives);
      if (interpreter === null) throw new Error('no absolute cmd.exe path is known: ComSpec and SystemRoot are both unset or relative');
      const argv = [interpreter, ...INTERPRETER_ARGUMENTS, `"(${line}) 2>&1 & ${WINDOWS_LINE_STATUS_TRAILER}"${statusFile}""`];
      return { argv, workingDirectory: 'spawn-option', verbatimArguments: true };
    },
    runRefusalOf: (workingDirectory) => {
      if (interpreterOf(primitives) === null) return 'no-absolute-interpreter';
      return NETWORK_SHARE_PATH.test(workingDirectory) ? 'network-share-folder' : null;
    },
    exitMeaningOf,
    lineLimitCharacters: COMMAND_LINE_LIMIT_CHARACTERS,
    executablesOf:       (line) => executablesOfLine(line, WINDOWS_COMMAND_LINE_GRAMMAR),
    displayLineOf,
    lineGrammar:         'windows-cmd',
  });
}
