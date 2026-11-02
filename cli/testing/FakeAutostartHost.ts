/** Fake primitives for the Autostart adapters: real files under a scratch home, a systemctl that answers, and a registry in a map. */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, win32 } from 'node:path';

import { type AutostartPrimitives, type LoginItem } from '../setup/Autostart.ts';
import { type FinishedCommand }                     from '../setup/SetupHost.ts';

export interface FakePrimitives {
  readonly primitives: AutostartPrimitives;
  /** Every command run, in order. */
  readonly commands:   string[][];
}

export interface FakePosixChoices {
  readonly systemctlPath?: string | null;
  readonly answerOf?:      (command: readonly string[]) => FinishedCommand;
}

const FAKE_SYSTEM_FOLDER = 'C:\\Windows';
const SUCCEEDED: FinishedCommand = { exitCode: 0, output: '' };

function posixPrimitives(homeDirectory: string, choices: FakePosixChoices = {}): FakePrimitives {
  const commands: string[][] = [];
  return {
    commands,
    primitives: {
      homeDirectory,
      readText:  (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
      writeText: (path, text) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
      },
      run: (command) => {
        commands.push([...command]);
        return choices.answerOf?.(command) ?? SUCCEEDED;
      },
      programOnSearchPath: (programName) => (programName === 'systemctl' ? (choices.systemctlPath === undefined ? '/usr/bin/systemctl' : choices.systemctlPath) : null),
      systemFolder:        () => undefined,
    },
  };
}

/** reg.exe's `add` and `query` over one map of value names to data, answering in reg.exe's layout. */
function windowsPrimitives(): FakePrimitives & { readonly registry: Map<string, string> } {
  const commands: string[][] = [];
  const registry = new Map<string, string>();
  return {
    commands,
    registry,
    primitives: {
      homeDirectory: 'C:\\Users\\Alex Example',
      readText:      () => null,
      writeText:     () => {
        throw new Error('the Windows adapter writes no file');
      },
      run: (command) => {
        commands.push([...command]);
        const [, verb, key, , valueName = ''] = command;
        if (verb === 'add') {
          registry.set(valueName, command[command.indexOf('/d') + 1] ?? '');
          return { exitCode: 0, output: 'The operation completed successfully.\r\n' };
        }
        const data = registry.get(valueName);
        if (verb !== 'query' || data === undefined) return { exitCode: 1, output: 'ERROR: The system was unable to find the specified registry key or value.\r\n' };
        return { exitCode: 0, output: `\r\n${key ?? ''}\r\n    ${valueName}    REG_SZ    ${data}\r\n\r\n` };
      },
      programOnSearchPath: () => null,
      systemFolder:        () => FAKE_SYSTEM_FOLDER,
    },
  };
}

function posixItem(label: string, repository: string): LoginItem {
  return {
    label,
    repository,
    bunProgram:         '/Users/alex-example/.bun/bin/bun',
    isolatingArguments: ['--no-env-file', '--config=/Users/alex-example/agent-progress/bunfig.toml'],
    entryPoint:         '/Users/alex-example/agent-progress/agent-progress.ts',
    searchPath:         '/Users/alex-example/.bun/bin:/usr/bin:/bin',
  };
}

function windowsItem(label: string, repository: string): LoginItem {
  const checkout = 'C:\\Users\\Alex Example\\agent-progress';
  return {
    label,
    repository,
    bunProgram:         'C:\\Users\\Alex Example\\.bun\\bin\\bun.exe',
    isolatingArguments: ['--no-env-file', `--config=${win32.join(checkout, 'bunfig.toml')}`],
    entryPoint:         win32.join(checkout, 'agent-progress.ts'),
    searchPath:         'C:\\Users\\Alex Example\\.bun\\bin;C:\\Windows\\System32',
  };
}

export const FakeAutostartHost = Object.freeze({
  FAKE_SYSTEM_FOLDER,
  posixPrimitives,
  windowsPrimitives,
  posixItem,
  windowsItem,
});
