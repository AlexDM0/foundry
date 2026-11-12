/** How the help and a pipeline agent's prompt name the grammar a stored line runs in on this machine, from the shell line port's `lineGrammar`. */
import type { ShellLineGrammar } from '../src/lib/shell-line/ShellLine.ts';

export const LINE_GRAMMAR_WORDING: Readonly<Record<ShellLineGrammar, string>> = Object.freeze({
  'posix-shell': 'POSIX shell grammar, run by the user\'s SHELL',
  'windows-cmd': 'cmd.exe grammar, run by cmd.exe /d /s /c',
  'none':        'no grammar: this platform runs no line',
});
