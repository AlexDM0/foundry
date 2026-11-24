/**
 * A launched agent's environment is an allowlist, never an inheritance: a Hephaestus started from inside another agent session carries that
 * session's variables, which would change the child's tools. These cases hold the allowlist and that nothing else crosses, and where a
 * tool is looked for by its name.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import { describe, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { POSIX_LAUNCH_ENVIRONMENT }                       from './PosixLaunchEnvironment.ts';

const { inheritedVariableNames, launchEnvironmentOf } = POSIX_LAUNCH_ENVIRONMENT;

const PARENT_SESSION_ENVIRONMENT = {
  HOME:                         '/Users/example',
  PATH:                         '/usr/bin:/bin',
  USER:                         'example',
  LANG:                         'en_US.UTF-8',
  TMPDIR:                       '/private/tmp/example',
  SHELL:                        '/bin/zsh',
  CLAUDECODE:                   '1',
  CLAUDE_CODE_SESSION_ID:       '7a1f0c52-0001-4000-8000-000000000001',
  CLAUDE_CODE_MESSAGING_SOCKET: '/private/tmp/example/messaging.sock',
  ANTHROPIC_BASE_URL:           'http://127.0.0.1:9',
  CLAUDE_CODE_SIMPLE:           '1',
  UNSET_VARIABLE:               undefined,
};

describe('launchEnvironmentOf', () => {
  test('keeps exactly the allowlisted variables and drops every parent-session variable', () => {
    const environment = launchEnvironmentOf(PARENT_SESSION_ENVIRONMENT, {});
    expect(Object.keys(environment).sort()).toEqual([...inheritedVariableNames].sort());
    for (const nestingVariable of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_SIMPLE']) {
      expect(Object.hasOwn(environment, nestingVariable)).toBe(false);
    }
  });

  test('adds the job variables, which win over an inherited one of the same name, and leaves out an allowlisted variable that is unset', () => {
    const environment = launchEnvironmentOf({ HOME: '/Users/example', PATH: '/bin' }, { EXAMPLE_JOB_ID: 'J1', PATH: '/opt/bin' });
    expect(environment).toEqual({ HOME: '/Users/example', PATH: '/opt/bin', EXAMPLE_JOB_ID: 'J1' });
  });
});

describe('toolFoldersOf', () => {
  test('looks in the installers\' folders, then nvm\'s newest node, then the system folders', () => {
    const home = createScratchDirectory('tool-folders');
    try {
      for (const version of ['v9.11.2', 'v22.22.0', 'v22.3.1', 'not-a-version']) mkdirSync(join(home, '.nvm', 'versions', 'node', version, 'bin'), { recursive: true });
      expect(POSIX_LAUNCH_ENVIRONMENT.toolFoldersOf(home)).toEqual([
        join(home, '.bun', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        join(home, '.local', 'bin'),
        join(home, '.nvm', 'versions', 'node', 'v22.22.0', 'bin'),
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ]);
    } finally {
      removeScratchDirectory(home);
    }
  });

  test('a home without nvm adds no node folder', () => {
    const home = createScratchDirectory('tool-folders-no-nvm');
    try {
      expect(POSIX_LAUNCH_ENVIRONMENT.toolFoldersOf(home).some((folder) => folder.includes('.nvm'))).toBe(false);
    } finally {
      removeScratchDirectory(home);
    }
  });
});
