/**
 * The environment a gate, a prepare step or a gate's fix runs in: its search path is the approved tools' folders, then the system's, and
 * nothing of Hephaestus's own, so the gates run what the design step showed as found; a kept tool inside the forge's repository is left off.
 */
import { posix } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { createPosixLaunchEnvironment }                   from '../../lib/agent-launch/PosixLaunchEnvironment.ts';
import { createPosixExecutableResolver }                  from '../../lib/executable-resolver/PosixExecutableResolver.ts';
import type { ProgramFolders }                            from '../../lib/program-folders/ProgramFolders.ts';
import { createPosixShellLine }                           from '../../lib/shell-line/PosixShellLine.ts';
import type { Pipeline }                                  from '../../lib/tracker-model/@types/Pipeline.ts';
import { defaultSpecPlatformPorts }                       from '../../testing/DefaultSpecPlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { JobLaunch }                                      from './JobLaunch.ts';

const REPOSITORY = '/home/example/repository';
const BASE_FOLDERS = ['/usr/bin', '/bin'];
const PROGRAMS: ReadonlySet<string> = new Set(['/usr/bin/git', '/home/example/.bun/bin/bun', `${REPOSITORY}/bin/lint`]);

const PROGRAM_FOLDERS: ProgramFolders = {
  pathModule:           posix,
  installFoldersOf:     () => ['/home/example/.bun/bin'],
  nodeVersionFoldersOf: () => [],
  baseFolders:          () => BASE_FOLDERS,
  programFileNamesOf:   (name) => [name],
};

const PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }],
  gates:   [{ name: 'test', run: 'bun test', fix: 'lint --fix' }],
  phases:  { build: ['test'], review: [], merge: [] },
};

function gateSearchPathOf(steps: Pipeline): string | undefined {
  const monitorFolder = createScratchDirectory('gate-environment');
  try {
    const context = {
      platformPorts: {
        ...defaultSpecPlatformPorts(),
        shellLine:          createPosixShellLine({ userShell: () => '/bin/sh' }),
        programFolders:     PROGRAM_FOLDERS,
        launchEnvironment:  createPosixLaunchEnvironment(() => BASE_FOLDERS),
        executableResolver: createPosixExecutableResolver({
          lookUp:        () => '/home/example/inherited/bin/git',
          realPathOf:    (path) => path,
          programKindOf: (path) => (PROGRAMS.has(path) ? 'program' : 'missing'),
        }),
      },
      homeDirectory:        '/home/example',
      inheritedEnvironment: { HOME: '/home/example', PATH: '/home/example/inherited/bin:/usr/bin' },
      monitorFolder,
      workspace:            { rootDirectory: REPOSITORY, trackerDirectory: `${REPOSITORY}/.forge` },
    };
    return JobLaunch.gateEnvironmentOf(context, steps)['PATH'];
  } finally {
    removeScratchDirectory(monitorFolder);
  }
}

describe('a gate\'s environment', () => {
  test('searches the approved tools\' folders, then the system\'s, and nothing of Hephaestus\'s own search path', () => {
    expect(gateSearchPathOf(PIPELINE)).toBe('/usr/bin:/home/example/.bun/bin:/bin');
  });

  test('leaves off a kept tool inside the forge\'s repository', () => {
    const planted: Pipeline = { ...PIPELINE, tools: [{ name: 'git', path: '/usr/bin/git' }, { name: 'lint', path: `${REPOSITORY}/bin/lint` }] };
    expect(gateSearchPathOf(planted)).toBe('/usr/bin:/bin');
  });
});
