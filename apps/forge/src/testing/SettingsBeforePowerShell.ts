/**
 * A Claude Code settings or agents file as the adapter wrote it before PowerShell rules and the exec-form guard hook: every PowerShell
 * rule, tool and matcher left out, and each exec-form hook written back as the shell-form command line it replaced. A frozen table
 * taken before that change is compared with the text this returns.
 */
const POWERSHELL_PREFIX = 'PowerShell';
const SHELL_SAFE_WORD = /^[\w./,:=@%+-]+$/;

/** The quoting the shell-form hook used: a word the shell reads as itself stays bare, any other is single-quoted. */
function shellWordOf(word: string): string {
  return SHELL_SAFE_WORD.test(word) ? word : `'${word.replaceAll('\'', '\'\\\'\'')}'`;
}

function isPowerShellEntry(item: unknown): boolean {
  if (typeof item === 'string') return item.startsWith(POWERSHELL_PREFIX);
  return typeof item === 'object' && item !== null && (item as Record<string, unknown>)['matcher'] === POWERSHELL_PREFIX;
}

function valueBeforePowerShell(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => !isPowerShellEntry(item)).map(valueBeforePowerShell);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const { args: hookArguments } = record;
  if (record['type'] === 'command' && typeof record['command'] === 'string' && Array.isArray(hookArguments)) {
    return { type: 'command', command: [record['command'], ...hookArguments as string[]].map(shellWordOf).join(' ') };
  }
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, valueBeforePowerShell(entry)]));
}

export function settingsTextBeforePowerShell(text: string): string {
  return `${JSON.stringify(valueBeforePowerShell(JSON.parse(text)), null, 2)}\n`;
}
