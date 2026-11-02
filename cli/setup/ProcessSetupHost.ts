import { delimiter, join } from 'node:path';

import { bunInstallFolder, executableSearchPath, userShell } from '../../src/shared/Environment.ts';
import { type SetupHost }                                    from './SetupHost.ts';

export interface ProcessFacts {
  readonly platform:          NodeJS.Platform;
  readonly checkoutDirectory: string;
  readonly homeDirectory:     string;
  /** The Bun running setup, for when no `bun` is on the search path. */
  readonly runningBun:        string;
}

/** The real machine behind setup: this process's environment, child processes and terminal. */
export function processSetupHostOf(facts: ProcessFacts): SetupHost {
  const searchPath = executableSearchPath();
  const programOnSearchPath = (programName: string): string | null => Bun.which(programName, { PATH: searchPath.join(delimiter) });
  return {
    ...facts,
    bunProgram:       programOnSearchPath('bun') ?? facts.runningBun,
    bunInstallFolder: bunInstallFolder() ?? join(facts.homeDirectory, '.bun'),
    searchPath,
    userShell:        userShell(),
    programOnSearchPath,
    run:              (command, workingDirectory) => {
      const finished = Bun.spawnSync([...command], {
        cwd: workingDirectory, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true
      });
      return { exitCode: finished.exitCode, output: `${finished.stdout.toString()}${finished.stderr.toString()}` };
    },
    answersYes: (question) => {
      const answer = prompt(`  ${question} [y/N]`);
      return answer === 'y' || answer === 'Y';
    },
    write: (text) => {
      process.stdout.write(text);
    },
  };
}
