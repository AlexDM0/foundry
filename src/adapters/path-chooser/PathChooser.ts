/**
 * The chooser of `path-choose`: a folder or a file that User picks in the system's own dialog, through `osascript` run by process-run. The
 * script turns a cancel into an empty answer, so a cancel is told apart from a failure by the answer's shape, never by an error's words.
 */
import type { ProcessRun }        from '../../lib/process-run/ProcessRun.ts';
import type { PathChoiceTarget }  from '../../shared/@types/GaiaCommand.ts';
import type { PathChoiceVerdict } from './@types/PathChoiceVerdict.ts';
import { PathChoiceMapUtil }      from './utils/PathChoiceMapUtil.ts';

export interface PathChooserOptions {
  readonly processRun:       ProcessRun;
  /** Read at each choice; the chooser reads nothing in it, so any folder that exists will do. */
  readonly workingDirectory: () => string;
}

export interface PathChooser {
  readonly choose: (what: PathChoiceTarget) => Promise<PathChoiceVerdict>;
}

/** An absolute path, since an application started from the Finder hands its children a bare `PATH`. */
export const OSASCRIPT_PROGRAM_PATH = '/usr/bin/osascript';

/** A person answers the dialog; past this bound nobody is there to. */
const PATH_CHOICE_TIMEOUT_MILLISECONDS = 600_000;
/** The AppleScript error a dialog raises when User cancels it. */
const USER_CANCELLED_ERROR_NUMBER = -128;
const PROMPT_BY_TARGET: Readonly<Record<PathChoiceTarget, string>> = {
  folder: 'Choose a folder',
  file:   'Choose a file',
};

/** The script brings its dialog to the front first: the server that runs it has no window of its own. */
function scriptLinesOf(what: PathChoiceTarget): readonly string[] {
  return [
    'activate',
    'try',
    `return POSIX path of (choose ${what} with prompt "${PROMPT_BY_TARGET[what]}")`,
    `on error number ${USER_CANCELLED_ERROR_NUMBER}`,
    'return ""',
    'end try',
  ];
}

/** The arguments `osascript` is run with: each line of the script as its own `-e`. */
export function pathChooserArgumentsOf(what: PathChoiceTarget): readonly string[] {
  return scriptLinesOf(what).flatMap((line) => ['-e', line]);
}

export function createPathChooser(options: PathChooserOptions): PathChooser {
  async function choose(what: PathChoiceTarget): Promise<PathChoiceVerdict> {
    const run = await options.processRun.run({
      program:             OSASCRIPT_PROGRAM_PATH,
      programArguments:    pathChooserArgumentsOf(what),
      workingDirectory:    options.workingDirectory(),
      timeoutMilliseconds: PATH_CHOICE_TIMEOUT_MILLISECONDS,
    });
    return PathChoiceMapUtil.verdictOfRun(run);
  }

  return { choose };
}
