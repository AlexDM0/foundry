import { win32 } from 'node:path';

import { type Autostart, type AutostartPrimitives, type LoginItem } from './Autostart.ts';

/** The per-user Run key: Windows starts each of its values at logon, with no admin rights needed to write it. */
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/** The documented ceiling on a Run value's command line. */
export const RUN_COMMAND_LINE_CHARACTERS_MAX = 260;

const DRIVE_ABSOLUTE_PATH = /^[A-Za-z]:\\/;
const REGISTRY_STRING_TYPE = 'REG_SZ';
const NEEDS_QUOTES = /[\s"]/;

/** One argument as the Windows C runtime reads it back: quoted when needed, a quote and the backslashes before it escaped. */
function quotedArgumentOf(argument: string): string {
  if (argument !== '' && !NEEDS_QUOTES.test(argument)) return argument;
  const escaped = argument.replace(/(\\*)"/g, (_match, backslashes: string) => `${backslashes}${backslashes}\\"`).replace(/(\\+)$/, '$1$1');
  return `"${escaped}"`;
}

/** The C runtime's split of a command line, the inverse of `quotedArgumentOf`. */
function argumentsOf(commandLine: string): string[] {
  const parsed: string[] = [];
  let current = '';
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < commandLine.length; i++) {
    const character = commandLine.charAt(i);
    if (character === '\\') {
      let backslashCount = 0;
      while (commandLine.charAt(i) === '\\') {
        backslashCount += 1;
        i += 1;
      }
      const quoteFollows = commandLine.charAt(i) === '"';
      current += '\\'.repeat(quoteFollows ? Math.floor(backslashCount / 2) : backslashCount);
      if (quoteFollows && backslashCount % 2 === 1) current += '"';
      else i -= 1;
      started = true;
    } else if (character === '"') {
      inQuotes = !inQuotes;
      started = true;
    } else if (/\s/.test(character) && !inQuotes) {
      if (started) parsed.push(current);
      current = '';
      started = false;
    } else {
      current += character;
      started = true;
    }
  }
  if (started) parsed.push(current);
  return parsed;
}

/** `--detach`, since a Run value is started once and never watched, and `--repository`, since a Run value has no working directory. */
function commandOf(item: LoginItem): readonly string[] {
  return [item.bunProgram, ...item.isolatingArguments, item.entryPoint, 'oversee', '--detach', '--repository', item.repository];
}

/** Windows: a value under the per-user Run key, written and read through reg.exe by absolute path. */
export function windowsAutostartOver(primitives: AutostartPrimitives): Autostart {
  const registryProgram = (): string | null => {
    const systemFolder = primitives.systemFolder();
    return systemFolder !== undefined && DRIVE_ABSOLUTE_PATH.test(systemFolder) ? win32.join(systemFolder, 'System32', 'reg.exe') : null;
  };
  const storedCommandLineOf = (label: string): string | null => {
    const program = registryProgram();
    if (program === null) return null;
    const queried = primitives.run([program, 'query', RUN_KEY, '/v', label], primitives.homeDirectory);
    if (queried.exitCode !== 0) return null;
    const valueLine = queried.output.split(/\r?\n/).find((line) => line.trimStart().startsWith(`${label} `) && line.includes(REGISTRY_STRING_TYPE));
    return valueLine === undefined ? null : valueLine.slice(valueLine.indexOf(REGISTRY_STRING_TYPE) + REGISTRY_STRING_TYPE.length).trim();
  };
  return {
    mechanism:              'Run entry',
    locationOf:             (label) => `${RUN_KEY}\\${label}`,
    unavailableReason:      () => (registryProgram() === null ? 'SystemRoot is not an absolute folder, so reg.exe cannot be run by absolute path' : null),
    registeredRepositoryOf: (label) => {
      const stored = storedCommandLineOf(label);
      if (stored === null) return null;
      const storedArguments = argumentsOf(stored);
      const repositoryIndex = storedArguments.indexOf('--repository');
      return repositoryIndex === -1 ? null : storedArguments[repositoryIndex + 1] ?? null;
    },
    commandOf,
    write: (item) => {
      const commandLine = commandOf(item).map(quotedArgumentOf).join(' ');
      if (commandLine.length > RUN_COMMAND_LINE_CHARACTERS_MAX) {
        return {
          verdict: 'refused',
          reason:  `the login command is ${commandLine.length} characters and a Run entry holds at most ${RUN_COMMAND_LINE_CHARACTERS_MAX}; `
            + 'move the checkout or the repository to a shorter path',
        };
      }
      const program = registryProgram();
      if (program === null) return { verdict: 'refused', reason: 'SystemRoot is not an absolute folder, so reg.exe cannot be run by absolute path' };
      const added = primitives.run([program, 'add', RUN_KEY, '/v', item.label, '/t', REGISTRY_STRING_TYPE, '/d', commandLine, '/f'], primitives.homeDirectory);
      return added.exitCode === 0 ? { verdict: 'written' } : { verdict: 'refused', reason: `reg.exe add failed: ${added.output.trim()}` };
    },
    adviceAfterWriting: () => ['Windows starts it at your next sign-in, with no promise of how soon; to start it now as well, run the same command yourself'],
  };
}
