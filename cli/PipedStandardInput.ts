import { OperationRefusal }    from '../src/shared/OperationRefusal.ts';
import type { CommandContext } from './CommandContext.ts';

/** The file name an option reads standard input from. */
export const STANDARD_INPUT_MARKER = '-';

/**
 * Refuses a `-` option typed in a terminal with nothing piped in: the terminal reads as empty text, which would replace what is stored. An
 * empty file still supplies empty text on purpose.
 */
export function requirePipedStandardInput(context: CommandContext, optionName: string): void {
  if (!context.standardInputIsTerminal) return;
  throw new OperationRefusal(
    'refused',
    `--${optionName} - reads standard input, and standard input is a terminal with nothing piped in; pipe the text in, or name a file.`,
  );
}
