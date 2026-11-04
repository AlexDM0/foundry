/**
 * The recorded git of a flow spec's other processes: a `git` program and a preload that answer from the flow stage a case keeps in one
 * file, through `src/testing/RecordedGit.ts`. A process a Watcher starts finds the program first on its `PATH`, or as the resolved git; a
 * spawned binary gets the preload. Each call one of them could not answer is a line of the case's report.
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join }                        from 'node:path';

import type { ExecutableResolver }                               from '../lib/executable-resolver/ExecutableResolver.ts';
import type { PlatformPorts }                                    from '../lib/platform-ports/PlatformPortsFor.ts';
import type { RecordedGit }                                      from './RecordedGit.ts';
import { createScratchDirectory, keptAsTemplateUntilTheRunEnds } from './ScratchWorkspace.ts';

const RECORDED_GIT_MODULE = join(import.meta.dir, 'RecordedGit.ts');
const PROGRAM_NAME = 'git';
const EXECUTABLE_MODE = 0o755;

export interface SharedRecordedGitFlow {
  /** The folder holding the `git` program. */
  readonly programFolder:            string;
  /** What `BUN_OPTIONS` holds for a spawned binary to answer its git from the flow. */
  readonly bunOptions:               string;
  /** Throws naming each git call another process could not answer. */
  readonly requireEveryCallAnswered: () => void;
  /** Kept until the run ends, since a Watcher child may still start git after its case ended. */
  readonly remove:                   () => void;
}

/** Call once the case entered its first flow stage: from then on the stage is kept in a file of the returned folder. */
export function shareRecordedGitFlow(recordedGit: RecordedGit): SharedRecordedGitFlow {
  const folder = keptAsTemplateUntilTheRunEnds(createScratchDirectory('recorded-git-flow'));
  const stageFile = join(folder, 'flow-stage.json');
  const reportPath = join(folder, 'unanswered.txt');
  writeFileSync(reportPath, '');
  recordedGit.shareFlowStagesThrough(stageFile);
  const preloadPath = join(folder, 'RecordedGitFlowPreload.ts');
  writeFileSync(preloadPath, [
    `import { answerSharedFlowInThisProcess } from ${JSON.stringify(RECORDED_GIT_MODULE)};`,
    `answerSharedFlowInThisProcess(${JSON.stringify(stageFile)}, ${JSON.stringify(reportPath)});`,
  ].join('\n'));
  const runnerPath = join(folder, 'RecordedGitRunner.ts');
  writeFileSync(runnerPath, [
    `import { sharedFlowAnswerOf } from ${JSON.stringify(RECORDED_GIT_MODULE)};`,
    `const answer = sharedFlowAnswerOf(process.cwd(), process.argv.slice(2), ${JSON.stringify(stageFile)}, ${JSON.stringify(reportPath)});`,
    'process.stdout.write(answer.standardOutput);',
    'process.stderr.write(answer.standardError);',
    'process.exitCode = answer.exitCode;',
  ].join('\n'));
  const programPath = join(folder, PROGRAM_NAME);
  writeFileSync(programPath, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(runnerPath)} "$@"\n`);
  chmodSync(programPath, EXECUTABLE_MODE);
  return {
    programFolder:            folder,
    bunOptions:               `--preload ${preloadPath}`,
    requireEveryCallAnswered: () => {
      const report = readFileSync(reportPath, 'utf8').trim();
      if (report.length > 0) throw new Error(`a process of the case found no recorded git answer:\n${report}`);
    },
    remove: () => undefined,
  };
}

/** `environment` with the recorded `git` first on its `PATH`. */
export function withRecordedGitFirstOnPath(environment: Readonly<Record<string, string>>, flow: SharedRecordedGitFlow): Record<string, string> {
  const searchPath = environment['PATH'];
  return { ...environment, PATH: searchPath === undefined || searchPath === '' ? flow.programFolder : `${flow.programFolder}${delimiter}${searchPath}` };
}

/** `ports` whose resolver finds the recorded `git`, so a git process the Overseer starts by its absolute path answers from the flow too. */
export function portsResolvingTheRecordedGit(ports: PlatformPorts, flow: SharedRecordedGitFlow): PlatformPorts {
  const executableResolver: ExecutableResolver = {
    ...ports.executableResolver,
    absolutePathOf: (name, forbiddenRoots) => (name === PROGRAM_NAME
      ? { verdict: 'found', path: join(flow.programFolder, PROGRAM_NAME) }
      : ports.executableResolver.absolutePathOf(name, forbiddenRoots)),
  };
  return { ...ports, executableResolver };
}
