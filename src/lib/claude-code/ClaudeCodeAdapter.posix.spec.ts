/**
 * The macOS and Linux settings and agents files may change only by the PowerShell rules and tools and by the exec-form guard hook. This
 * renders a guarded and an unguarded builder on both, takes those two changes back out, and compares the text byte for byte with
 * `testing/fixtures/frozen-posix-settings.json`, taken with the code before the PowerShell rules existed. Retake it only from such code,
 * with these same requests, the guard then given as one `commandArgv` of the program path and its arguments.
 */
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { settingsTextBeforePowerShell } from '../../testing/SettingsBeforePowerShell.ts';
import type { AgentLaunchRequest }      from '../agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }           from '../agent-launch/WorkerProfile.ts';
import { claudeCodeAdapterFor }         from './ClaudeCodeAdapter.ts';
import FROZEN_POSIX_SETTINGS            from './testing/fixtures/frozen-posix-settings.json';

const REPOSITORY = '/home/alex-example/example-repository';
const WORKTREE = `${REPOSITORY}/.example-worktrees/ticket-7`;
const JOB_FILES = `${REPOSITORY}/.example-data/jobs/J1`;
const GUARD_PROGRAM_PATH = '/home/alex-example/.bun/bin/example-program';
const GUARD_ARGUMENTS = ['hook', 'bash-domains', '--allow', 'registry.example.com,*.docs.example.org'];
/** The shell-form command the frozen table holds, the comma list single-quoted against globbing. */
const FROZEN_GUARD_COMMAND = `${GUARD_PROGRAM_PATH} hook bash-domains --allow 'registry.example.com,*.docs.example.org'`;
const POWERSHELL_PREFIX = 'PowerShell';

function profileOf(guarded: boolean): WorkerProfile {
  return {
    writableRoots:          [`${REPOSITORY}/.example-cache`],
    deniedWritableRoots:    [`${REPOSITORY}/.example-data`, `${WORKTREE}/.claude`],
    deniedReadableRoots:    ['/home/alex-example/.ssh'],
    bashNetworkDomains:     guarded ? ['registry.example.com'] : [],
    webNetworkDomains:      guarded ? ['registry.example.com'] : 'none',
    hatchDirectory:         `${REPOSITORY}/.example-worktrees/hatch/J1`,
    allowedCommandPrefixes: [['bun', 'run', 'verify'], ['git', 'commit']],
    deniedCommandPrefixes:  [['git', 'push'], ['git', 'rebase']],
    askUser:                true,
    skills:                 false,
    subagents:              [{
      name: 'coder', model: 'opus', effort: 'medium', readOnly: false
    }, {
      name: 'explorer', model: 'haiku', effort: 'low', readOnly: true
    }],
    attribution:        'none',
    instructionsRoot:   REPOSITORY,
    gitHooksDirectory:  `${REPOSITORY}/.githooks`,
    commitSigning:      { kind: 'unsigned' },
    networkDomainGuard: guarded
      ? { allowedDomains: ['registry.example.com', '*.docs.example.org'], programPath: GUARD_PROGRAM_PATH, arguments: GUARD_ARGUMENTS }
      : null,
  };
}

function requestOf(guarded: boolean): AgentLaunchRequest {
  return {
    programPath:       '/home/alex-example/.local/bin/claude',
    sessionId:         'session-example',
    resume:            false,
    workingDirectory:  WORKTREE,
    homeDirectory:     '/home/alex-example',
    firstMessage:      'Build.',
    roleBrief:         'Builder.',
    model:             'opus',
    effort:            'medium',
    environment:       {},
    profile:           profileOf(guarded),
    jobFilesDirectory: JOB_FILES,
    reportSchema:      null,
  };
}

test('the guard hook written back is the frozen shell-form command, the comma list single-quoted against globbing', () => {
  const settings = claudeCodeAdapterFor('darwin').planOf(requestOf(true)).files.find((file) => file.path === join(JOB_FILES, 'settings.json'));
  expect(settingsTextBeforePowerShell(settings?.text ?? '{}')).toContain(JSON.stringify(FROZEN_GUARD_COMMAND));
});

const CASES = ['darwin', 'linux'].flatMap((platform) => [true, false].map((guarded) => ({
  platform,
  key: `${platform} ${guarded ? 'guarded' : 'unguarded'}`,
  guarded,
})));

for (const { platform, key, guarded } of CASES) {
  test(`${key}: the settings and agents files differ from the frozen text only by PowerShell and the exec-form hook`, () => {
    const plan = claudeCodeAdapterFor(platform).planOf(requestOf(guarded));
    const frozen = (FROZEN_POSIX_SETTINGS as Record<string, Record<string, string>>)[key];
    for (const fileName of ['settings.json', 'agents.json']) {
      const text = plan.files.find((file) => file.path === join(JOB_FILES, fileName))?.text ?? '';
      expect(text).toContain(POWERSHELL_PREFIX);
      expect(settingsTextBeforePowerShell(text)).toBe(frozen?.[fileName] ?? '');
    }
  });
}
