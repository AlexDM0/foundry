/**
 * One contract for every SetupPlatform adapter, run on this machine over a recorded host: a scratch home for the POSIX shell startup file,
 * a recorder in place of powershell.exe for the Windows User PATH. What matters is that --instruct-only changes nothing, that a yes puts
 * the bin folder on the search path for new terminals, and that a no leaves the user a line to run the CLI by hand.
 */
import { readFileSync }     from 'node:fs';
import { join }             from 'node:path';
import { afterAll, expect } from 'bun:test';

import { runPortContract, type PortSubject }              from '../../src/testing/PortContract.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { type FinishedCommand, type SetupHost }           from './SetupHost.ts';
import { type SetupPlatform }                             from './SetupPlatform.ts';
import { setupPlatformFor }                               from './SetupPlatformFor.ts';

interface ReportedLine {
  readonly kind: 'done' | 'notice' | 'failure' | 'heading';
  readonly line: string;
}

interface SetupPlatformSubject {
  readonly setupPlatform:     SetupPlatform;
  readonly offer:             (answer: boolean, instructOnly: boolean) => readonly ReportedLine[];
  readonly commandsRun:       () => readonly (readonly string[])[];
  /** Whatever the adapter changed to put the folder on the search path, as text, empty when nothing changed. */
  readonly searchPathEntryOf: () => string;
  readonly programFileName:   string;
}

const BIN_FOLDER_NAME = 'bun-bin';
const scratchDirectories: string[] = [];

afterAll(() => {
  for (const scratchDirectory of scratchDirectories) removeScratchDirectory(scratchDirectory);
});

function subjectOn(platform: 'linux' | 'win32', programFileName: string): SetupPlatformSubject {
  const scratchDirectory = createScratchDirectory(`setup-platform-${platform}`);
  scratchDirectories.push(scratchDirectory);
  const commands: (readonly string[])[] = [];
  const binFolder = join(scratchDirectory, BIN_FOLDER_NAME);
  const setupPlatform = setupPlatformFor(platform);
  const hostAnswering = (answer: boolean): SetupHost => ({
    platform,
    checkoutDirectory:   join(scratchDirectory, 'checkout'),
    homeDirectory:       scratchDirectory,
    bunProgram:          join(binFolder, 'bun'),
    bunInstallFolder:    scratchDirectory,
    searchPath:          [],
    userShell:           '/bin/bash',
    programOnSearchPath: () => null,
    run:                 (command): FinishedCommand => {
      commands.push(command);
      return { exitCode: 0, output: '' };
    },
    answersYes: () => answer,
    write:      () => undefined,
  });
  return {
    setupPlatform,
    programFileName,
    offer: (answer, instructOnly) => {
      const reported: ReportedLine[] = [];
      const reportOf = (kind: ReportedLine['kind']) => (line: string): void => {
        reported.push({ kind, line });
      };
      setupPlatform.offerSearchPathEntry({
        host:   hostAnswering(answer),
        report: {
          done: reportOf('done'), notice: reportOf('notice'), failure: reportOf('failure'), heading: reportOf('heading')
        },
        binFolder,
        instructOnly,
      });
      return reported;
    },
    commandsRun:       () => commands,
    searchPathEntryOf: () => {
      if (platform === 'win32') return commands.flat().join('\n');
      try {
        return readFileSync(join(scratchDirectory, '.bashrc'), 'utf8');
      } catch {
        return '';
      }
    },
  };
}

const SUBJECTS: readonly PortSubject<SetupPlatformSubject>[] = [
  { name: 'PosixSetupPlatform over a scratch home', build: () => subjectOn('linux', 'agent-progress') },
  { name: 'WindowsSetupPlatform over a recorded powershell.exe', build: () => subjectOn('win32', 'agent-progress.exe') },
];

runPortContract<SetupPlatformSubject>('SetupPlatform', SUBJECTS, [
  {
    claim: 'names the program file as this platform runs it by name',
    check: ({ setupPlatform, programFileName }) => {
      expect(setupPlatform.executableFileNameOf('agent-progress')).toBe(programFileName);
    },
  },
  {
    claim: 'with --instruct-only, asks nothing, changes nothing and names the bin folder in a notice',
    check: ({ offer, commandsRun, searchPathEntryOf }) => {
      const reported = offer(true, true);
      expect(commandsRun()).toEqual([]);
      expect(searchPathEntryOf()).toBe('');
      expect(reported.map(({ kind }) => kind)).toEqual(['notice']);
      expect(reported[0]?.line).toContain(BIN_FOLDER_NAME);
    },
  },
  {
    claim: 'with a yes, puts the bin folder on the search path for new terminals and reports it done',
    check: ({ offer, searchPathEntryOf }) => {
      const reported = offer(true, false);
      expect(searchPathEntryOf()).toContain(BIN_FOLDER_NAME);
      expect(reported.map(({ kind }) => kind)).toEqual(['done']);
    },
  },
  {
    claim: 'with a no, changes nothing and tells the user how to run the CLI by hand',
    check: ({ offer, commandsRun, searchPathEntryOf }) => {
      const reported = offer(false, false);
      expect(commandsRun()).toEqual([]);
      expect(searchPathEntryOf()).toBe('');
      expect(reported.map(({ kind }) => kind)).toEqual(['notice']);
      expect(reported[0]?.line).toContain('agent-progress.ts');
    },
  },
]);
