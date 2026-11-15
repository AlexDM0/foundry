/**
 * The first word of each command in a line, split outside quotes by a grammar's separators and parentheses. A split it cannot be sure of is
 * not made, so a line never grants a word that is only an argument: `2>&1` is a redirection, and a cmd `)` closes only a group it opened.
 */
export interface CommandLineGrammar {
  /** A longer separator before its prefix, so `&&` is one separator rather than two `&`. */
  readonly separators:               readonly string[];
  readonly quotes:                   readonly string[];
  readonly escapeCharacter:          string;
  /** The quotes inside which the escape character still escapes; outside every quote it always does. */
  readonly escapingQuotes:           readonly string[];
  /** cmd reads `(` as a group only where a command starts, and `)` only while a group is open; a POSIX shell reads both everywhere. */
  readonly groupsOnlyAtCommandStart: boolean;
  /** A POSIX `NAME=value` before the command sets a variable; cmd has no such form. */
  readonly skipsLeadingAssignments:  boolean;
}

const GROUP_OPENER = '(';
const GROUP_CLOSER = ')';
const BACKGROUND_SEPARATOR = '&';
const REDIRECTION_CHARACTERS: readonly string[] = ['<', '>'];
const ENVIRONMENT_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** `2>&1`, `<&3` and `&>file` hold an `&` that joins a redirection rather than separating two commands. */
function ampersandIsRedirection(line: string, index: number): boolean {
  return REDIRECTION_CHARACTERS.includes(line.charAt(index - 1)) || REDIRECTION_CHARACTERS.includes(line.charAt(index + 1));
}

function separatorAt(line: string, index: number, grammar: CommandLineGrammar): string | undefined {
  const separator = grammar.separators.find((candidate) => line.startsWith(candidate, index));
  return separator === BACKGROUND_SEPARATOR && ampersandIsRedirection(line, index) ? undefined : separator;
}

function commandsOf(line: string, grammar: CommandLineGrammar): string[] {
  const commands: string[] = [];
  let command = '';
  let openQuote: string | null = null;
  let openGroups = 0;
  const endCommand = (): void => {
    commands.push(command);
    command = '';
  };
  for (let i = 0; i < line.length; i++) {
    const character = line.charAt(i);
    const escapes = character === grammar.escapeCharacter && (openQuote === null || grammar.escapingQuotes.includes(openQuote));
    const separator = openQuote === null ? separatorAt(line, i, grammar) : undefined;
    const opensGroup = openQuote === null && character === GROUP_OPENER && (!grammar.groupsOnlyAtCommandStart || command.trim() === '');
    const closesGroup = openQuote === null && character === GROUP_CLOSER && (!grammar.groupsOnlyAtCommandStart || openGroups > 0);
    if (escapes) {
      command += line.slice(i, i + 2);
      i++;
    } else if (separator !== undefined) {
      endCommand();
      i += separator.length - 1;
    } else if (opensGroup || closesGroup) {
      openGroups += opensGroup ? 1 : -1;
      endCommand();
    } else {
      if (openQuote === null && grammar.quotes.includes(character)) openQuote = character;
      else if (character === openQuote) openQuote = null;
      command += character;
    }
  }
  return [...commands, command];
}

export function executablesOfLine(line: string, grammar: CommandLineGrammar): string[] {
  return commandsOf(line, grammar).flatMap((command) => {
    const words = command.trim().split(/\s+/);
    const executable = grammar.skipsLeadingAssignments ? words.find((word) => !ENVIRONMENT_ASSIGNMENT.test(word)) : words[0];
    return executable === undefined || executable === '' ? [] : [executable];
  });
}
