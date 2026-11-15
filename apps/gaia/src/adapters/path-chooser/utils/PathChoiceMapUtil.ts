/** Maps one run of the chooser's `osascript` to a verdict: a path chosen, a cancel, or why there is neither. */
import type { ProgramRunAnswer }  from '../../../lib/process-run/ProcessRun.ts';
import type { PathChoiceVerdict } from '../@types/PathChoiceVerdict.ts';

const FOLDER_SEPARATOR = '/';
const LINE_END = '\n';

/** `osascript` ends its answer with a line end, and a folder's POSIX path with a separator, which only the root folder keeps. */
function chosenPathOf(standardOutput: string): string {
  const answer = standardOutput.endsWith(LINE_END) ? standardOutput.slice(0, -LINE_END.length) : standardOutput;
  return answer.length > FOLDER_SEPARATOR.length && answer.endsWith(FOLDER_SEPARATOR) ? answer.slice(0, -FOLDER_SEPARATOR.length) : answer;
}

/** The chooser's script answers an empty line for a cancel; any exit but 0 is a failure, whatever its words. */
function verdictOfRun(run: ProgramRunAnswer): PathChoiceVerdict {
  switch (run.verdict) {
    case 'not-found':
      return run.missing === 'program' ? { verdict: 'chooser-not-found' } : { verdict: 'failed' };
    case 'timed-out':
      return { verdict: 'timed-out' };
    case 'finished': {
      if (run.exitCode !== 0) return { verdict: 'failed' };
      const path = chosenPathOf(run.standardOutput);
      return path === '' ? { verdict: 'cancelled' } : { verdict: 'chosen', path };
    }
  }
}

export const PathChoiceMapUtil = { chosenPathOf, verdictOfRun } as const;
